'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const listeners = {};
const store = { settings: { apiBase: 'http://127.0.0.1:8765', programBase: 'http://127.0.0.1:8765', autoAnalyze: true } };
let lastRequest = null;
const openedUrls = [];
const responses = new Map();

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(payload)
  };
}

const chrome = {
  storage: { local: {
    get: async (keys) => {
      if (typeof keys === 'string') return { [keys]: store[keys] };
      if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, store[key]]));
      return { ...store };
    },
    set: async (values) => Object.assign(store, values)
  } },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  tabs: { query: async () => [], create: async ({ url }) => { openedUrls.push(url); return {}; } },
  sidePanel: { open: async () => {} },
  contextMenus: { removeAll: (cb) => cb(), create: () => {}, onClicked: { addListener: (fn) => { listeners.context = fn; } } },
  commands: { onCommand: { addListener: (fn) => { listeners.command = fn; } } },
  runtime: {
    id: 'igjckdibhjehimobmpkkbebidfodebei',
    getManifest: () => ({ version: '2.1.0' }),
    openOptionsPage: async () => {},
    onInstalled: { addListener: (fn) => { listeners.installed = fn; } },
    onMessage: { addListener: (fn) => { listeners.message = fn; } }
  }
};

const context = {
  console, URL, Date, AbortController, setTimeout, clearTimeout, chrome,
  fetch: async (url, options = {}) => {
    lastRequest = { url, options };
    const parsed = new URL(url);
    const key = `${options.method || 'GET'} ${parsed.origin}${parsed.pathname}${parsed.search}`;
    if (!responses.has(key)) throw new Error(`Nema mock odgovora za ${key}`);
    return responses.get(key);
  }
};
context.globalThis = context;
context.importScripts = (...paths) => {
  for (const rel of paths) {
    const resolved = rel.endsWith('core.js') ? 'shared/core.js' : rel;
    vm.runInContext(fs.readFileSync(resolved, 'utf8'), context, { filename: resolved });
  }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('background/service_worker.js', 'utf8'), context, { filename: 'background/service_worker.js' });

function message(payload, sender = { tab: { id: 7 } }) {
  return new Promise((resolve, reject) => {
    const keep = listeners.message(payload, sender, (result) => resolve(result));
    if (keep !== true) reject(new Error('Listener nije zadržao async odgovor'));
  });
}

(async () => {
  const bridge = 'http://127.0.0.1:8766';
  const migrated = await message({ type: 'GET_SETTINGS' });
  assert.equal(migrated.ok, true);
  assert.equal(migrated.settings.apiBase, bridge, 'v1 port 8765 must migrate to Bridge 8766');
  assert.equal(migrated.settings.programBase, 'http://127.0.0.1:8765');
  assert.equal(migrated.settings.settingsSchemaVersion, 2);
  responses.set(`GET ${bridge}/api/extensions/v2/status`, response(200, {
    ok: true,
    bridge: { version: '2.1.0' },
    program: { online: true, locked: false, app: 'Suno Pesme Studio', version: '3.3.2', base: 'http://127.0.0.1:8765' },
    ready: true,
    library: { songs_total: 1247, songs_with_audio: 1200, songs_indexed: 1190, songs_not_indexed: 10 },
    channels: [{ channel_id: 'UC123', title: 'Nedostaješ PUNOO', is_owned: 1 }]
  }));
  responses.set(`GET ${bridge}/api/extensions/v2/youtube/video?video_id=dQw4w9WgXcQ`, response(200, {
    ok: true,
    matches: [{ video_id: 'dQw4w9WgXcQ', song_id: 'song-1', score: 88, completeness_status: 'short_clip', audio_score: 94, audio_checked_at: '2026-08-03' }],
    analyses: [],
    songs: { 'song-1': { id: 'song-1', title: 'Original', source_url: 'https://suno.com/song/abc' } }
  }));

  const lookup = await message({ type: 'LOOKUP_VIDEO', context: { videoId: 'dQw4w9WgXcQ', isShort: true, title: 'Short' }, force: true });
  assert.equal(store.settings.apiBase, bridge, 'v1 port 8765 must migrate to Bridge 8766');
  assert.equal(lookup.ok, true);
  assert.equal(lookup.primary.songTitle, 'Original');
  assert.equal(lookup.apiMode, 'bridge-v2');

  responses.set(`POST ${bridge}/api/extensions/v2/youtube/analyze`, response(200, { ok: true, task: { id: 'task1', status: 'running' } }));
  const analyzed = await message({ type: 'ANALYZE_VIDEO', context: { videoId: 'dQw4w9WgXcQ', isShort: true, url: 'https://evil.example/attack' }, options: {} });
  assert.equal(analyzed.ok, true);
  assert.equal(analyzed.stage, 'analyzing');
  assert(lastRequest.url.endsWith('/api/extensions/v2/youtube/analyze'));
  const body = JSON.parse(lastRequest.options.body);
  assert.equal(body.video_id, 'dQw4w9WgXcQ');
  assert.equal(body.is_short, true);
  assert.equal(body.url, undefined);

  responses.set(`POST ${bridge}/api/extensions/v2/task/control`, response(200, { ok: true, message: 'paused', task: { id: 'task1', status: 'running', paused: true } }));
  const controlled = await message({ type: 'CONTROL_TASK', action: 'pause' });
  assert.equal(controlled.ok, true);
  assert.equal(controlled.message, 'paused');

  responses.set(`POST ${bridge}/api/extensions/v2/audio-cache/cleanup`, response(200, { ok: true, removed: 2, message: 'cleaned' }));
  const cleaned = await message({ type: 'CLEANUP_AUDIO_CACHE', days: 30, gb: 10 });
  assert.equal(cleaned.ok, true);
  assert.equal(cleaned.removed, 2);

  responses.set(`GET ${bridge}/api/extensions/v2/logs?limit=80`, response(200, { ok: true, logs: [{ level: 'info', message: 'test' }] }));
  const logs = await message({ type: 'GET_PROGRAM_LOGS', limit: 80 });
  assert.equal(logs.ok, true);
  assert.equal(logs.logs.length, 1);

  responses.set(`POST ${bridge}/api/extensions/v2/program-task`, response(200, { ok: true, task: { id: 'batch1', status: 'running' } }));
  const batch = await message({ type: 'START_PROGRAM_TASK', kind: 'ownedAudio', options: { maxVideos: 25 } });
  assert.equal(batch.ok, true);
  assert.equal(batch.task.id, 'batch1');

  responses.set(`POST ${bridge}/api/extensions/v2/report/export`, response(200, { ok: true, download_url: '/api/export/download?path=report.zip', message: 'ready' }));
  const report = await message({ type: 'EXPORT_PROGRAM_REPORT', kind: 'audio' });
  assert.equal(report.ok, true);
  assert(openedUrls.some((url) => url.startsWith('http://127.0.0.1:8765/api/export/download')));

  responses.set(`POST ${bridge}/api/extensions/v2/task/cancel`, response(200, { ok: true, message: 'cancelled' }));
  const cancelled = await message({ type: 'CANCEL_TASK' });
  assert.equal(cancelled.ok, true);

  responses.set(`GET ${bridge}/api/extensions/v2/youtube/insights`, response(200, { ok: true, summary: { matches: 5 }, audio_summary: { total: 4 } }));
  const insights = await message({ type: 'GET_YOUTUBE_INSIGHTS' });
  assert.equal(insights.ok, true);
  assert.equal(insights.summary.matches, 5);

  const blocked = await message({ type: 'OPEN_URL', url: 'https://evil.example/' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'URL_BLOCKED');

  console.log('BACKGROUND_TESTS_OK');
})().catch((error) => { console.error(error); process.exit(1); });
