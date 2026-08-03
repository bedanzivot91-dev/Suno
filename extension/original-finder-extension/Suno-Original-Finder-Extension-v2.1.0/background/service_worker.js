'use strict';

importScripts('../shared/core.js');

const Core = globalThis.SPSCore;
const SETTINGS_KEY = 'settings';
const CACHE_KEY = 'videoCache';
const HISTORY_KEY = 'history';
const ACTIVE_CONTEXT_KEY = 'activeContext';
const STATUS_CACHE_MS = 20_000;
let statusCache = null;

class ApiError extends Error {
  constructor(message, status = 0, payload = null, code = 'API_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.code = code;
  }
}

async function storageGet(keys) { return chrome.storage.local.get(keys); }
async function storageSet(values) { return chrome.storage.local.set(values); }

async function getSettings() {
  const data = await storageGet(SETTINGS_KEY);
  const raw = data[SETTINGS_KEY] && typeof data[SETTINGS_KEY] === 'object' ? { ...data[SETTINGS_KEY] } : {};
  const oldSchema = Number(raw.settingsSchemaVersion || 0);
  let migrated = false;

  // v1 used port 8765 directly. Keep the same stable extension ID, but migrate
  // old browser storage to the non-invasive Bridge on 8766 automatically.
  if (oldSchema < Core.SETTINGS_SCHEMA_VERSION) {
    raw.apiBase = 'http://127.0.0.1:8766';
    raw.programBase = 'http://127.0.0.1:8765';
    raw.settingsSchemaVersion = Core.SETTINGS_SCHEMA_VERSION;
    migrated = true;
  }

  const settings = Core.mergeSettings(raw);
  if (migrated) await storageSet({ [SETTINGS_KEY]: settings });
  return settings;
}

async function saveSettings(patch) {
  const current = await getSettings();
  const next = Core.mergeSettings({ ...current, ...(patch || {}) });
  await storageSet({ [SETTINGS_KEY]: next });
  statusCache = null;
  return next;
}

function timeoutController(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, stop: () => clearTimeout(timer) };
}

async function fetchJson(base, path, options = {}) {
  const timer = timeoutController(Number(options.timeoutMs || 15000));
  const url = `${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        'X-SPS-Extension-Version': chrome.runtime.getManifest().version,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: timer.controller.signal,
      cache: 'no-store'
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = { message: text }; }
    if (!response.ok || payload?.ok === false) {
      const code = payload?.code || (response.status === 423 ? 'PROGRAM_LOCKED' : response.status === 404 ? 'NOT_FOUND' : 'API_ERROR');
      throw new ApiError(payload?.message || `HTTP ${response.status}`, response.status, payload, code);
    }
    return payload || {};
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') throw new ApiError('Lokalna veza nije odgovorila na vreme.', 0, null, 'TIMEOUT');
    throw new ApiError('Suno Original Finder Bridge nije pokrenut.', 0, null, 'BRIDGE_OFFLINE');
  } finally {
    timer.stop();
  }
}

async function bridgeFetch(path, options = {}) {
  const settings = options.settings || await getSettings();
  return fetchJson(settings.apiBase, path, options);
}

async function probeProgramDirect(settings) {
  try {
    const health = await fetchJson(settings.programBase, '/api/health', { timeoutMs: 3500 });
    return { online: true, health };
  } catch (_) {
    return { online: false, health: null };
  }
}

async function programStatus(force = false) {
  const settings = await getSettings();
  if (!force && statusCache && statusCache.apiBase === settings.apiBase && Date.now() - statusCache.timestamp < STATUS_CACHE_MS) {
    return statusCache.value;
  }
  try {
    const response = await bridgeFetch('/api/extensions/v2/status', { settings, timeoutMs: 20000 });
    const value = {
      ok: Boolean(response.program?.online),
      bridgeOnline: true,
      bridgeVersion: String(response.bridge?.version || ''),
      online: Boolean(response.program?.online),
      locked: Boolean(response.program?.locked),
      app: response.program?.app || 'Suno Pesme Studio',
      programVersion: String(response.program?.version || ''),
      apiMode: 'bridge-v2',
      apiBase: settings.apiBase,
      programBase: response.program?.base || settings.programBase,
      library: response.library || {},
      channels: response.channels || [],
      tools: response.tools || {},
      task: response.task || null,
      ready: Boolean(response.ready),
      message: response.message || ''
    };
    statusCache = { apiBase: settings.apiBase, timestamp: Date.now(), value };
    return value;
  } catch (error) {
    if (error.code === 'PROGRAM_LOCKED') {
      return { ok: true, bridgeOnline: true, online: true, locked: true, apiMode: 'bridge-v2', apiBase: settings.apiBase, programBase: settings.programBase, message: error.message };
    }
    const direct = await probeProgramDirect(settings);
    if (direct.online) {
      throw new ApiError('Suno Pesme Studio radi, ali Bridge nije pokrenut. Instaliraj ili pokreni Bridge iz foldera Bridge.', 0, { direct }, 'BRIDGE_REQUIRED');
    }
    if (error.code === 'BRIDGE_OFFLINE') {
      throw new ApiError('Bridge i Suno Pesme Studio nisu dostupni. Pokreni prvo program, zatim Bridge.', 0, null, 'PROGRAM_AND_BRIDGE_OFFLINE');
    }
    throw error;
  }
}

async function getCache() {
  const data = await storageGet(CACHE_KEY);
  return data[CACHE_KEY] && typeof data[CACHE_KEY] === 'object' ? data[CACHE_KEY] : {};
}

async function addHistory(context, lookup) {
  if (!lookup?.primary) return;
  const settings = await getSettings();
  const data = await storageGet(HISTORY_KEY);
  const history = Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
  const entry = Core.historyEntry(context, lookup);
  const filtered = history.filter((item) => item.videoId !== entry.videoId);
  filtered.unshift(entry);
  await storageSet({ [HISTORY_KEY]: filtered.slice(0, settings.historyLimit) });
}

async function saveLookupToCache(context, lookup) {
  const settings = await getSettings();
  const cache = await getCache();
  cache[context.videoId] = { context, lookup, cachedAt: new Date().toISOString() };
  const entries = Object.entries(cache).sort((a, b) => new Date(b[1]?.cachedAt || 0) - new Date(a[1]?.cachedAt || 0));
  await storageSet({ [CACHE_KEY]: Object.fromEntries(entries.slice(0, Math.max(100, settings.historyLimit))) });
  await addHistory(context, lookup);
}

async function lookupVideo(context, force = false) {
  if (!context?.videoId) throw new ApiError('YouTube video ID nije pronađen.', 0, null, 'NO_VIDEO');
  const settings = await getSettings();
  if (!settings.enabled) return { ok: true, status: 'disabled', videoId: context.videoId, items: [], primary: null, message: 'Extension je isključen.' };
  if (!force) {
    const cached = (await getCache())[context.videoId];
    if (Core.isCacheFresh(cached, settings.cacheTtlMinutes)) return { ...cached.lookup, source: 'cache' };
  }
  const response = await bridgeFetch(`/api/extensions/v2/youtube/video?video_id=${encodeURIComponent(context.videoId)}`, { timeoutMs: 50000 });
  const lookup = Core.normalizeLookup(context.videoId, response.matches || [], response.analyses || [], response.songs || {}, {
    source: 'program', apiMode: 'bridge-v2', programVersion: ''
  });
  await saveLookupToCache(context, lookup);
  return lookup;
}

async function getChannels() {
  const response = await bridgeFetch('/api/extensions/v2/channels', { timeoutMs: 15000 });
  return response.channels || [];
}

async function startIndex(force = false) {
  const response = await bridgeFetch('/api/extensions/v2/index/build', { method: 'POST', body: { force: Boolean(force) }, timeoutMs: 30000 });
  statusCache = null;
  return { ok: true, stage: 'indexing', task: response.task || response, message: response.message || 'Pravim audio indeks Suno pesama.' };
}

async function analyzeVideo(context, options = {}) {
  if (!context?.videoId) throw new ApiError('Trenutni YouTube video nije pronađen.', 0, null, 'NO_VIDEO');
  const settings = await getSettings();
  const status = await programStatus(true);
  if (status.locked) throw new ApiError('Program je zaključan. Otključaj ga PIN-om.', 423, null, 'PROGRAM_LOCKED');
  // Bridge/bridge.py's /status always answers "ok": true even when the
  // desktop Program itself is closed (it just nests {online: false} inside
  // "program"), so an empty status.library in that case does NOT mean the
  // Suno library is actually empty -- it means nothing was ever asked,
  // because there was no program to ask. Without this check the code below
  // read library.songs_total as 0 and told the user their library was
  // empty, when the real fix is simply "start Suno Pesme Studio".
  if (!status.online) throw new ApiError('Suno Pesme Studio nije pokrenut. Pokreni program pa pokušaj ponovo.', 0, null, 'PROGRAM_OFFLINE');
  const total = Number(status.library?.songs_total || 0);
  const withAudio = Number(status.library?.songs_with_audio || 0);
  const indexed = Number(status.library?.songs_indexed || 0);
  if (total <= 0) throw new ApiError('Suno biblioteka je prazna. Prvo učitaj pesme u programu.', 0, null, 'LIBRARY_EMPTY');
  if (withAudio <= 0) throw new ApiError('Nijedna Suno pesma nema dostupan audio izvor za prepoznavanje.', 0, null, 'NO_AUDIO_SOURCES');
  if (indexed <= 0 && !options.skipIndex) {
    if (!settings.autoEnsureIndex && !options.forceIndex) throw new ApiError('Audio indeks nije napravljen.', 0, null, 'INDEX_REQUIRED');
    const active = status.task;
    if (active && String(active.status || '') === 'running') {
      return { ok: true, stage: 'indexing', task: active, message: 'Čekam da program završi aktivni zadatak pre prepoznavanja.' };
    }
    return startIndex(false);
  }
  const body = {
    video_id: context.videoId,
    is_short: Boolean(context.isShort),
    song_ids: Array.isArray(options.songIds) ? options.songIds : [],
    candidate_limit: Number(options.candidateLimit || settings.candidateLimit),
    deep: options.deep !== undefined ? Boolean(options.deep) : Boolean(settings.deepAnalysis),
    reuse_cache: options.reuseCache !== undefined ? Boolean(options.reuseCache) : Boolean(settings.reuseCache),
    force: Boolean(options.force),
    detect_multiple: options.detectMultiple !== undefined ? Boolean(options.detectMultiple) : Boolean(settings.detectMultiple),
    max_songs_per_video: Number(options.maxSongsPerVideo || settings.maxSongsPerVideo)
  };
  const response = await bridgeFetch('/api/extensions/v2/youtube/analyze', { method: 'POST', body, timeoutMs: 30000 });
  const cache = await getCache();
  delete cache[context.videoId];
  await storageSet({ [CACHE_KEY]: cache, [ACTIVE_CONTEXT_KEY]: context });
  statusCache = null;
  return { ok: true, stage: 'analyzing', task: response.task || response, message: response.message || 'Audio analiza je pokrenuta.' };
}

async function taskStatus() {
  const response = await bridgeFetch('/api/extensions/v2/task', { timeoutMs: 12000 });
  return response.task || null;
}

async function cancelTask() {
  const response = await bridgeFetch('/api/extensions/v2/task/cancel', { method: 'POST', body: {}, timeoutMs: 20000 });
  statusCache = null;
  return { ok: true, task: response.task || null, message: response.message || 'Aktivni zadatak je otkazan.' };
}

async function controlTask(action) {
  const safeAction = String(action || '').toLowerCase();
  if (!['pause', 'resume', 'cancel'].includes(safeAction)) {
    throw new ApiError('Nepoznata komanda za zadatak.', 0, null, 'TASK_ACTION_NOT_ALLOWED');
  }
  const response = await bridgeFetch('/api/extensions/v2/task/control', {
    method: 'POST', body: { action: safeAction }, timeoutMs: 20000
  });
  statusCache = null;
  return { ok: true, ...response, task: response.task || null, message: response.message || `Komanda ${safeAction} je poslata.` };
}

async function cleanupAudioCache(days = 30, gb = 10) {
  const response = await bridgeFetch('/api/extensions/v2/audio-cache/cleanup', {
    method: 'POST',
    body: { days: Math.max(1, Math.min(365, Number(days || 30))), gb: Math.max(1, Math.min(500, Number(gb || 10))) },
    timeoutMs: 100000
  });
  return { ok: true, ...response };
}

async function getYoutubeInsights() {
  return bridgeFetch('/api/extensions/v2/youtube/insights', { timeoutMs: 60000 });
}

async function getBridgeLogs(limit = 100) {
  return bridgeFetch(`/api/extensions/v2/logs?limit=${Math.max(1, Math.min(500, Number(limit || 100)))}`, { timeoutMs: 20000 });
}

async function searchSongs(query, limit = 80) {
  const response = await bridgeFetch(`/api/extensions/v2/library/search?q=${encodeURIComponent(String(query || ''))}&limit=${Math.max(1, Math.min(200, Number(limit || 80)))}`, { timeoutMs: 20000 });
  return response.songs || [];
}

async function manualLink(context, songId) {
  if (!context?.videoId) throw new ApiError('YouTube video nije pronađen.', 0, null, 'NO_VIDEO');
  const response = await bridgeFetch('/api/extensions/v2/youtube/manual-link', { method: 'POST', body: { video_id: context.videoId, song_id: String(songId || '') }, timeoutMs: 30000 });
  const cache = await getCache();
  delete cache[context.videoId];
  await storageSet({ [CACHE_KEY]: cache });
  return { ok: true, match: response.match || null, message: response.message || 'Pesma je ručno povezana.' };
}

async function startProgramTask(kind, options = {}) {
  const safeOptions = {
    channel_id: String(options.channelId || '').trim(),
    scan_mode: ['new', 'uncertain', 'all'].includes(options.scanMode) ? options.scanMode : 'new',
    max_pages: Math.max(1, Math.min(100, Number(options.maxPages || 10))),
    max_videos_per_channel: Math.max(1, Math.min(500, Number(options.maxVideos || 100))),
    candidate_limit: Math.max(4, Math.min(40, Number(options.candidateLimit || 20))),
    deep: Boolean(options.deep),
    reuse_cache: options.reuseCache !== false,
    detect_multiple: options.detectMultiple !== false,
    max_songs_per_video: Math.max(1, Math.min(20, Number(options.maxSongsPerVideo || 8))),
    force: Boolean(options.force)
  };
  const response = await bridgeFetch('/api/extensions/v2/program-task', { method: 'POST', body: { kind, options: safeOptions }, timeoutMs: 30000 });
  statusCache = null;
  return { ok: true, task: response.task || response, message: response.message || 'Zadatak je pokrenut.' };
}

async function exportProgramReport(kind) {
  const response = await bridgeFetch('/api/extensions/v2/report/export', { method: 'POST', body: { kind }, timeoutMs: 100000 });
  const settings = await getSettings();
  const raw = String(response.download_url || '');
  const url = raw.startsWith('/') ? `${settings.programBase}${raw}` : raw;
  if (!Core.isAllowedOpenUrl(url)) throw new ApiError('Program nije vratio bezbedan link izveštaja.', 0, null, 'URL_BLOCKED');
  await chrome.tabs.create({ url });
  return { ok: true, url, message: response.message || 'Izveštaj je napravljen.' };
}

async function setBadge(tabId, state) {
  if (!tabId) return;
  const config = {
    matched: { text: '✓', color: '#127a48' }, candidate: { text: '?', color: '#c49100' },
    analyzing: { text: '…', color: '#1f5fbd' }, indexing: { text: 'I', color: '#7d6500' },
    error: { text: '!', color: '#a72b2b' }, offline: { text: '×', color: '#4b4b4b' }, none: { text: '', color: '#4b4b4b' }
  }[state] || { text: 'SP', color: '#1f5fbd' };
  await chrome.action.setBadgeText({ tabId, text: config.text }).catch(() => {});
  await chrome.action.setBadgeBackgroundColor({ tabId, color: config.color }).catch(() => {});
}

function serializeError(error) {
  return { ok: false, message: error?.message || 'Nepoznata greška.', code: error?.code || 'ERROR', status: Number(error?.status || 0), payload: error?.payload || null };
}

async function getActiveYoutubeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !Core.extractVideoId(tab.url || '')) return null;
  return tab;
}

async function sendToActiveTab(message) {
  const tab = await getActiveYoutubeTab();
  if (!tab) throw new ApiError('Otvori YouTube video ili Shorts.', 0, null, 'NO_VIDEO');
  return chrome.tabs.sendMessage(tab.id, message);
}

async function openSidePanelForTab(tabId) {
  if (!tabId || !chrome.sidePanel?.open) throw new ApiError('Bočni panel nije podržan u ovom browseru.', 0, null, 'SIDE_PANEL_UNAVAILABLE');
  await chrome.sidePanel.open({ tabId });
  return { ok: true };
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await getSettings();
  await storageSet({ [SETTINGS_KEY]: current });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'sps-recognize', title: 'Prepoznaj Suno original', contexts: ['page', 'video'], documentUrlPatterns: ['https://www.youtube.com/*', 'https://m.youtube.com/*'] });
    chrome.contextMenus.create({ id: 'sps-open-app', title: 'Otvori Suno Pesme Studio', contexts: ['page'], documentUrlPatterns: ['https://www.youtube.com/*', 'https://m.youtube.com/*'] });
    chrome.contextMenus.create({ id: 'sps-open-panel', title: 'Otvori Suno Original panel', contexts: ['page'], documentUrlPatterns: ['https://www.youtube.com/*', 'https://m.youtube.com/*'] });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === 'sps-recognize' && tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'SPS_FORCE_ANALYZE' });
    if (info.menuItemId === 'sps-open-app') { const settings = await getSettings(); await chrome.tabs.create({ url: settings.programBase }); }
    if (info.menuItemId === 'sps-open-panel' && tab?.id) await openSidePanelForTab(tab.id);
  } catch (_) {}
});

chrome.commands.onCommand.addListener(async (command) => {
  try {
    if (command === 'recognize-current-video') await sendToActiveTab({ type: 'SPS_FORCE_ANALYZE' });
    if (command === 'toggle-card') await sendToActiveTab({ type: 'SPS_TOGGLE_CARD' });
  } catch (_) {}
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = String(message?.type || '');
  (async () => {
    switch (type) {
      case 'GET_SETTINGS': return { ok: true, settings: await getSettings() };
      case 'SAVE_SETTINGS': return { ok: true, settings: await saveSettings(message.patch || {}) };
      case 'PROGRAM_STATUS': return await programStatus(Boolean(message.force));
      case 'LOOKUP_VIDEO': {
        const lookup = await lookupVideo(message.context, Boolean(message.force));
        await setBadge(sender.tab?.id || message.tabId, lookup.status);
        return lookup;
      }
      case 'ANALYZE_VIDEO': {
        const result = await analyzeVideo(message.context, message.options || {});
        await setBadge(sender.tab?.id || message.tabId, result.stage === 'indexing' ? 'indexing' : 'analyzing');
        return result;
      }
      case 'START_INDEX': return await startIndex(Boolean(message.force));
      case 'TASK_STATUS': return { ok: true, task: await taskStatus() };
      case 'CANCEL_TASK': return await cancelTask();
      case 'CONTROL_TASK': return await controlTask(message.action);
      case 'CLEANUP_AUDIO_CACHE': return await cleanupAudioCache(message.days, message.gb);
      case 'GET_YOUTUBE_INSIGHTS': return await getYoutubeInsights();
      case 'GET_BRIDGE_LOGS': return await getBridgeLogs(message.limit);
      case 'GET_PROGRAM_LOGS': return await getBridgeLogs(message.limit);
      case 'START_PROGRAM_TASK': return await startProgramTask(message.kind, message.options || {});
      case 'EXPORT_PROGRAM_REPORT': return await exportProgramReport(message.kind);
      case 'GET_CHANNELS': return { ok: true, channels: await getChannels() };
      case 'SEARCH_SONGS': return { ok: true, songs: await searchSongs(message.query, message.limit) };
      case 'MANUAL_LINK': return await manualLink(message.context, message.songId);
      case 'SET_ACTIVE_CONTEXT': await storageSet({ [ACTIVE_CONTEXT_KEY]: message.context || null }); return { ok: true };
      case 'GET_ACTIVE_CONTEXT': { const data = await storageGet(ACTIVE_CONTEXT_KEY); return { ok: true, context: data[ACTIVE_CONTEXT_KEY] || null }; }
      case 'GET_HISTORY': { const data = await storageGet(HISTORY_KEY); return { ok: true, history: Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [] }; }
      case 'CLEAR_HISTORY': await storageSet({ [HISTORY_KEY]: [] }); return { ok: true };
      case 'CLEAR_CACHE': await storageSet({ [CACHE_KEY]: {} }); return { ok: true, message: 'Keš rezultata je očišćen.' };
      case 'OPEN_APP': { const settings = await getSettings(); await chrome.tabs.create({ url: settings.programBase }); return { ok: true }; }
      case 'OPEN_URL':
        if (!Core.isAllowedOpenUrl(message.url)) throw new ApiError('Ovaj link nije dozvoljen.', 0, null, 'URL_BLOCKED');
        await chrome.tabs.create({ url: message.url }); return { ok: true };
      case 'OPEN_SIDE_PANEL': { const tabId = sender.tab?.id || message.tabId || (await getActiveYoutubeTab())?.id; return await openSidePanelForTab(tabId); }
      case 'OPEN_OPTIONS': await chrome.runtime.openOptionsPage(); return { ok: true };
      case 'SET_BADGE': await setBadge(sender.tab?.id || message.tabId, message.state || 'none'); return { ok: true };
      case 'EXPORT_DATA': {
        const data = await storageGet([SETTINGS_KEY, HISTORY_KEY]);
        return { ok: true, data: { settings: Core.mergeSettings(data[SETTINGS_KEY]), history: data[HISTORY_KEY] || [], exportedAt: new Date().toISOString(), extensionVersion: chrome.runtime.getManifest().version } };
      }
      case 'IMPORT_SETTINGS': return { ok: true, settings: await saveSettings(message.settings || {}) };
      default: throw new ApiError('Nepoznata komanda extension-a.', 0, null, 'UNKNOWN_MESSAGE');
    }
  })().then(sendResponse).catch((error) => {
    // ANALYZE_VIDEO only ever updated the toolbar badge on success (see the
    // 'analyzing'/'indexing' setBadge call above) -- if it throws, the
    // badge silently keeps showing whatever it last showed (often still
    // "…"/"I" from a previous attempt), which looks like the extension is
    // stuck working when it has actually already failed.
    if (type === 'ANALYZE_VIDEO') setBadge(sender.tab?.id || message.tabId, 'error').catch(() => {});
    sendResponse(serializeError(error));
  });
  return true;
});
