(() => {
  'use strict';

  const SETTINGS_SCHEMA_VERSION = 2;

  const DEFAULT_SETTINGS = Object.freeze({
    settingsSchemaVersion: SETTINGS_SCHEMA_VERSION,
    enabled: true,
    apiBase: 'http://127.0.0.1:8766',
    programBase: 'http://127.0.0.1:8765',
    autoAnalyze: true,
    autoAnalyzeOwnedOnly: true,
    autoAnalyzeUnknownChannel: true,
    autoEnsureIndex: true,
    analyzeCandidates: true,
    deepAnalysis: false,
    candidateLimit: 20,
    detectMultiple: true,
    maxSongsPerVideo: 8,
    reuseCache: true,
    showWatchCard: true,
    showShortsCard: true,
    compactCard: false,
    showScores: true,
    showSegments: true,
    followPlayback: true,
    pollIntervalMs: 3000,
    taskTimeoutMinutes: 12,
    cacheTtlMinutes: 180,
    historyLimit: 300,
    allowForeignManualAnalysis: false,
    cardPositionShorts: 'bottom-left',
    diagnostics: false
  });

  const COMPLETENESS = Object.freeze({
    complete: { label: 'KOMPLETAN ORIGINAL', rank: 6, tone: 'success' },
    almost_complete: { label: 'SKORO CEO ORIGINAL', rank: 5, tone: 'success' },
    partial: { label: 'DEO PESME', rank: 4, tone: 'warning' },
    short_clip: { label: 'SHORTS ISEČAK', rank: 3, tone: 'warning' },
    different_audio: { label: 'DRUGI AUDIO', rank: 1, tone: 'danger' },
    '': { label: 'KANDIDAT', rank: 2, tone: 'info' }
  });

  function clamp(value, min, max) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  }

  function cleanBaseUrl(value) {
    const raw = String(value || DEFAULT_SETTINGS.apiBase).trim().replace(/\/+$/, '');
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:') return DEFAULT_SETTINGS.apiBase;
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) return DEFAULT_SETTINGS.apiBase;
      return `${parsed.protocol}//${parsed.host}`;
    } catch (_) {
      return DEFAULT_SETTINGS.apiBase;
    }
  }

  function mergeSettings(input) {
    const merged = { ...DEFAULT_SETTINGS, ...(input || {}) };
    merged.settingsSchemaVersion = SETTINGS_SCHEMA_VERSION;
    merged.apiBase = cleanBaseUrl(merged.apiBase);
    const rawProgramBase = String(merged.programBase || DEFAULT_SETTINGS.programBase).trim().replace(/\/+$/, '');
    try {
      const parsedProgram = new URL(rawProgramBase);
      merged.programBase = parsedProgram.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsedProgram.hostname)
        ? `${parsedProgram.protocol}//${parsedProgram.host}`
        : DEFAULT_SETTINGS.programBase;
    } catch (_) { merged.programBase = DEFAULT_SETTINGS.programBase; }
    merged.candidateLimit = Math.round(clamp(merged.candidateLimit, 4, 40));
    merged.maxSongsPerVideo = Math.round(clamp(merged.maxSongsPerVideo, 1, 20));
    merged.pollIntervalMs = Math.round(clamp(merged.pollIntervalMs, 1500, 15000));
    merged.taskTimeoutMinutes = Math.round(clamp(merged.taskTimeoutMinutes, 2, 60));
    merged.cacheTtlMinutes = Math.round(clamp(merged.cacheTtlMinutes, 1, 10080));
    merged.historyLimit = Math.round(clamp(merged.historyLimit, 20, 1000));
    merged.cardPositionShorts = ['bottom-left', 'bottom-right'].includes(merged.cardPositionShorts) ? merged.cardPositionShorts : DEFAULT_SETTINGS.cardPositionShorts;
    return merged;
  }

  function extractVideoId(input) {
    if (!input) return '';
    const raw = String(input).trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
    try {
      const url = new URL(raw, 'https://www.youtube.com');
      const host = url.hostname.toLowerCase();
      const isYoutube = host === 'youtube.com' || host.endsWith('.youtube.com');
      if (host === 'youtu.be') return /^[\w-]{11}$/.test(url.pathname.slice(1)) ? url.pathname.slice(1) : '';
      if (!isYoutube) return '';
      const shorts = url.pathname.match(/^\/shorts\/([\w-]{11})/);
      if (shorts) return shorts[1];
      const embed = url.pathname.match(/^\/(?:embed|live)\/([\w-]{11})/);
      if (embed) return embed[1];
      const watch = url.searchParams.get('v') || '';
      return /^[\w-]{11}$/.test(watch) ? watch : '';
    } catch (_) {
      const match = raw.match(/(?:v=|shorts\/|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
      return match ? match[1] : '';
    }
  }

  function videoUrl(videoId, isShort = false) {
    return videoId ? `https://www.youtube.com/${isShort ? 'shorts/' : 'watch?v='}${videoId}` : '';
  }

  function parseJsonField(value, fallback = []) {
    if (Array.isArray(value) || (value && typeof value === 'object')) return value;
    if (!value || typeof value !== 'string') return fallback;
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeHandle(value) {
    return normalizeText(value).toLowerCase().replace(/^https?:\/\/(?:www\.)?youtube\.com\//, '').replace(/^\//, '').replace(/\/$/, '');
  }

  function channelOwnership(context, channels) {
    const ctx = context || {};
    const ownedChannels = (channels || []).filter((channel) => channel && Number(channel.is_owned ?? channel.isOwned ?? 1) === 1);
    const contextId = normalizeText(ctx.channelId);
    const contextHandle = normalizeHandle(ctx.channelHandle);
    const contextTitle = normalizeText(ctx.channelTitle).toLowerCase();
    const hasIdentity = Boolean(contextId || contextHandle || contextTitle);
    if (!hasIdentity || !ownedChannels.length) return 'unknown';
    const owned = ownedChannels.some((channel) => {
      const id = normalizeText(channel.channel_id || channel.channelId);
      const handle = normalizeHandle(channel.handle || channel.url);
      const title = normalizeText(channel.title).toLowerCase();
      return Boolean(
        (contextId && id && contextId === id) ||
        (contextHandle && handle && (contextHandle === handle || contextHandle.endsWith(handle) || handle.endsWith(contextHandle))) ||
        (contextTitle && title && contextTitle === title)
      );
    });
    return owned ? 'owned' : 'foreign';
  }

  function likelyOwnedChannel(context, channels) {
    if (channelOwnership(context, channels) === 'owned') return true;
    const ctx = context || {};
    const contextId = normalizeText(ctx.channelId);
    const contextHandle = normalizeHandle(ctx.channelHandle);
    const contextTitle = normalizeText(ctx.channelTitle).toLowerCase();
    return (channels || []).some((channel) => {
      if (!channel || Number(channel.is_owned ?? channel.isOwned ?? 1) !== 1) return false;
      const id = normalizeText(channel.channel_id || channel.channelId);
      const handle = normalizeHandle(channel.handle || channel.url);
      const title = normalizeText(channel.title).toLowerCase();
      return Boolean(
        (contextId && id && contextId === id) ||
        (contextHandle && handle && (contextHandle === handle || contextHandle.endsWith(handle) || handle.endsWith(contextHandle))) ||
        (contextTitle && title && contextTitle === title)
      );
    });
  }

  function completenessInfo(status) {
    return COMPLETENESS[String(status || '')] || COMPLETENESS[''];
  }

  function formatSeconds(value) {
    const total = Math.max(0, Number(value) || 0);
    const minutes = Math.floor(total / 60);
    const seconds = Math.floor(total % 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function formatPercent(value, digits = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(digits)}%` : '—';
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }

  function isAllowedOpenUrl(value) {
    const url = safeHttpUrl(value);
    if (!url) return false;
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return host === '127.0.0.1' || host === 'localhost' || host === 'youtu.be' || host.endsWith('.youtube.com') || host === 'youtube.com' || host.endsWith('.suno.com') || host === 'suno.com';
    } catch (_) { return false; }
  }

  function confidenceLabel(value) {
    const raw = normalizeText(value).toLowerCase();
    if (raw === 'high') return 'VISOKA';
    if (raw === 'medium') return 'SREDNJA';
    if (raw === 'low') return 'NISKA';
    return raw ? raw.toUpperCase() : 'NIJE PROVERENO';
  }

  function normalizeOneMatch(row, analysis, song) {
    const source = { ...(row || {}), ...(analysis || {}) };
    const status = normalizeText(source.completeness_status);
    const songId = normalizeText(source.song_id || song?.id);
    return {
      id: Number(source.id || 0),
      songId,
      songTitle: normalizeText(source.song_title || song?.title || song?.display_name || songId || 'Nepoznata pesma'),
      sunoUrl: safeHttpUrl(song?.source_url || source.source_url || song?.video_url || ''),
      sunoAudioUrl: safeHttpUrl(song?.audio_url || source.audio_url || ''),
      originalYoutubeUrl: safeHttpUrl(source.original_url || song?.youtube_url || ''),
      videoId: normalizeText(source.video_id),
      videoTitle: normalizeText(source.video_title),
      channelId: normalizeText(source.channel_id),
      channelTitle: normalizeText(source.channel_title),
      matchType: normalizeText(source.match_type),
      matchStatus: normalizeText(source.status),
      metadataScore: Number(source.score || source.metadata_score || 0),
      audioScore: Number(source.audio_score || 0),
      combinedScore: Number(source.combined_score || source.score || 0),
      coveragePercent: Number(source.coverage_percent || 0),
      matchedSeconds: Number(source.matched_seconds || 0),
      totalMatchedSeconds: Number(source.total_matched_seconds || source.matched_seconds || 0),
      completenessStatus: status,
      completeness: completenessInfo(status),
      confidence: normalizeText(source.confidence),
      versionType: normalizeText(source.version_type),
      recommendation: normalizeText(source.recommendation),
      reason: normalizeText(source.reason),
      matchRole: normalizeText(source.match_role || 'primary'),
      videoSongCount: Math.max(1, Number(source.video_song_count || 1)),
      sourceStart: Number(source.source_start || 0),
      sourceEnd: Number(source.source_end || 0),
      videoStart: Number(source.video_start || 0),
      videoEnd: Number(source.video_end || 0),
      segmentCount: Number(source.segment_count || 0),
      occurrenceCount: Number(source.occurrence_count || 0),
      segments: parseJsonField(source.segments_json || source.segments, []),
      missingIntervals: parseJsonField(source.missing_intervals_json || source.missing_intervals, []),
      checkedAt: normalizeText(source.audio_checked_at),
      publishedAt: normalizeText(source.published_at),
      thumbnailUrl: safeHttpUrl(source.thumbnail_url),
      isAudioConfirmed: Boolean(source.audio_checked_at || Number(source.audio_score || 0) > 0),
      isManual: Number(source.manual_link || 0) === 1
    };
  }

  function normalizeLookup(videoId, matches, analyses, songMap, metadata = {}) {
    const matchRows = (matches || []).filter((row) => String(row.video_id || '') === String(videoId));
    const analysisRows = (analyses || []).filter((row) => String(row.video_id || '') === String(videoId));
    const analysesBySong = new Map(analysisRows.map((row) => [String(row.song_id || ''), row]));
    const combinedRows = [...matchRows];
    for (const row of analysisRows) {
      if (!combinedRows.some((item) => String(item.song_id || '') === String(row.song_id || ''))) combinedRows.push(row);
    }
    const allItems = combinedRows.map((row) => normalizeOneMatch(row, analysesBySong.get(String(row.song_id || '')), songMap?.[String(row.song_id || '')]));
    // "different_audio" is a rejected candidate, never present it as the original.
    const items = allItems.filter((item) => item.completenessStatus !== 'different_audio');
    items.sort((a, b) => {
      const ar = a.completeness.rank + (a.isAudioConfirmed ? 10 : 0);
      const br = b.completeness.rank + (b.isAudioConfirmed ? 10 : 0);
      return br - ar || b.audioScore - a.audioScore || b.coveragePercent - a.coveragePercent || b.combinedScore - a.combinedScore;
    });
    const audioConfirmed = items.some((item) => item.isAudioConfirmed);
    const resultStatus = audioConfirmed ? 'matched' : (items.length ? 'candidate' : 'none');
    return {
      ok: true,
      videoId: String(videoId || ''),
      status: resultStatus,
      items,
      primary: items[0] || null,
      matchCount: items.length,
      rejectedCount: allItems.length - items.length,
      audioConfirmed,
      fetchedAt: new Date().toISOString(),
      source: metadata.source || 'program',
      apiMode: metadata.apiMode || 'legacy',
      programVersion: metadata.programVersion || '',
      message: resultStatus === 'matched' ? `Pronađen je ${items.length > 1 ? `${items.length} Suno originala` : 'Suno original'}.` : (resultStatus === 'candidate' ? 'Pronađen je kandidat koji još nije audio potvrđen.' : 'Suno original još nije pronađen.')
    };
  }

  function matchRanges(item) {
    const rawSegments = Array.isArray(item?.segments) ? item.segments : [];
    const ranges = rawSegments.map((segment) => {
      const start = Number(segment?.video_start ?? segment?.start ?? segment?.[0] ?? 0);
      const end = Number(segment?.video_end ?? segment?.end ?? segment?.[1] ?? 0);
      return [start, end];
    }).filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start);
    if (!ranges.length) {
      const start = Number(item?.videoStart || 0);
      const end = Number(item?.videoEnd || 0);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) ranges.push([start, end]);
    }
    return ranges;
  }

  function activeMatchIndex(items, currentTime, toleranceSeconds = 0.75) {
    const time = Number(currentTime);
    if (!Number.isFinite(time)) return -1;
    const tolerance = Math.max(0, Number(toleranceSeconds) || 0);
    return (items || []).findIndex((item) => matchRanges(item).some(([start, end]) => time >= start - tolerance && time <= end + tolerance));
  }

  function isCacheFresh(entry, ttlMinutes) {
    if (!entry || !entry.cachedAt) return false;
    return Date.now() - new Date(entry.cachedAt).getTime() < Number(ttlMinutes || DEFAULT_SETTINGS.cacheTtlMinutes) * 60_000;
  }

  function historyEntry(context, lookup) {
    const primary = lookup?.primary || null;
    return {
      videoId: context?.videoId || lookup?.videoId || '',
      videoTitle: normalizeText(context?.title || primary?.videoTitle),
      videoUrl: safeHttpUrl(context?.url || videoUrl(context?.videoId, context?.isShort)),
      isShort: Boolean(context?.isShort),
      channelTitle: normalizeText(context?.channelTitle || primary?.channelTitle),
      status: lookup?.status || 'none',
      songId: primary?.songId || '',
      songTitle: primary?.songTitle || '',
      sunoUrl: primary?.sunoUrl || '',
      audioScore: Number(primary?.audioScore || 0),
      coveragePercent: Number(primary?.coveragePercent || 0),
      completenessStatus: primary?.completenessStatus || '',
      checkedAt: primary?.checkedAt || '',
      timestamp: new Date().toISOString()
    };
  }

  globalThis.SPSCore = Object.freeze({
    SETTINGS_SCHEMA_VERSION,
    DEFAULT_SETTINGS,
    COMPLETENESS,
    clamp,
    cleanBaseUrl,
    mergeSettings,
    extractVideoId,
    videoUrl,
    parseJsonField,
    normalizeText,
    normalizeHandle,
    channelOwnership,
    likelyOwnedChannel,
    completenessInfo,
    formatSeconds,
    formatPercent,
    safeHttpUrl,
    isAllowedOpenUrl,
    confidenceLabel,
    normalizeOneMatch,
    normalizeLookup,
    matchRanges,
    activeMatchIndex,
    isCacheFresh,
    historyEntry
  });
})();
