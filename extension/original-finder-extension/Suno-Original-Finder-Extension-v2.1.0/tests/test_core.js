'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = { URL, console, Date, setTimeout, clearTimeout };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('shared/core.js', 'utf8'), context, { filename: 'shared/core.js' });
const Core = context.SPSCore;

assert(Core, 'SPSCore nije učitan');
assert.equal(Core.cleanBaseUrl('http://localhost:9999/path/'), 'http://localhost:9999');
assert.equal(Core.cleanBaseUrl('https://evil.example'), 'http://127.0.0.1:8766');
assert.equal(Core.cleanBaseUrl('http://192.168.1.5:8765'), 'http://127.0.0.1:8766');

assert.equal(Core.extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(Core.extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share'), 'dQw4w9WgXcQ');
assert.equal(Core.extractVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(Core.extractVideoId('https://www.youtube.com/live/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(Core.extractVideoId('https://example.com/?v=dQw4w9WgXcQ'), '');
assert.equal(Core.extractVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(Core.extractVideoId('bad'), '');

const merged = Core.mergeSettings({ candidateLimit: 999, pollIntervalMs: 50, cardPositionShorts: 'top' });
assert.equal(merged.candidateLimit, 40);
assert.equal(merged.pollIntervalMs, 1500);
assert.equal(merged.cardPositionShorts, 'bottom-left');
assert.equal(merged.followPlayback, true);

assert(Core.isAllowedOpenUrl('https://suno.com/song/abc'));
assert(Core.isAllowedOpenUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
assert(Core.isAllowedOpenUrl('http://127.0.0.1:8765/'));
assert(!Core.isAllowedOpenUrl('https://evil.example/'));
assert(!Core.isAllowedOpenUrl('javascript:alert(1)'));

assert.equal(Core.channelOwnership({ channelId: 'UC123' }, [{ channel_id: 'UC123', is_owned: 1 }]), 'owned');
assert.equal(Core.channelOwnership({ channelTitle: '' }, [{ channel_id: 'UC123', is_owned: 1 }]), 'unknown');
assert(Core.likelyOwnedChannel({ channelId: 'UC123' }, [{ channel_id: 'UC123', is_owned: 1 }]));
assert(Core.likelyOwnedChannel({ channelHandle: '/@nedostajespunooo91' }, [{ url: 'https://www.youtube.com/@nedostajespunooo91', is_owned: 1 }]));
assert(!Core.likelyOwnedChannel({ channelTitle: 'Tuđi kanal' }, [{ title: 'Moj kanal', is_owned: 1 }]));

const lookup = Core.normalizeLookup('dQw4w9WgXcQ', [
  { video_id: 'dQw4w9WgXcQ', song_id: 'rejected', song_title: 'Pogrešna', completeness_status: 'different_audio', audio_score: 99, audio_checked_at: '2026-08-03' },
  { video_id: 'dQw4w9WgXcQ', song_id: 'right', song_title: 'Prava', completeness_status: 'short_clip', audio_score: 92, audio_checked_at: '2026-08-03', coverage_percent: 35 }
], [], {}, {});
assert.equal(lookup.status, 'matched');
assert.equal(lookup.primary.songId, 'right');
assert.equal(lookup.items.length, 1);
assert.equal(lookup.rejectedCount, 1);

const onlyRejected = Core.normalizeLookup('dQw4w9WgXcQ', [
  { video_id: 'dQw4w9WgXcQ', song_id: 'wrong', completeness_status: 'different_audio', audio_score: 95, audio_checked_at: '2026-08-03' }
], [], {}, {});
assert.equal(onlyRejected.status, 'none');
assert.equal(onlyRejected.primary, null);
assert.equal(onlyRejected.rejectedCount, 1);

const items = [
  { videoStart: 0, videoEnd: 30, segments: [] },
  { videoStart: 40, videoEnd: 70, segments: [] }
];
assert.equal(Core.activeMatchIndex(items, 12), 0);
assert.equal(Core.activeMatchIndex(items, 50), 1);
assert.equal(Core.activeMatchIndex(items, 35), -1);
assert.deepEqual(JSON.parse(JSON.stringify(Core.matchRanges({ segments: [{ video_start: 5, video_end: 9 }] }))), [[5, 9]]);

assert(Core.isCacheFresh({ cachedAt: new Date().toISOString() }, 1));
assert(!Core.isCacheFresh({ cachedAt: '2000-01-01T00:00:00Z' }, 1));

console.log('CORE_TESTS_OK');
