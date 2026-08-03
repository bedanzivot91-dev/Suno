(() => {
  'use strict';

  const Core = globalThis.SPSCore;
  const $ = (id) => document.getElementById(id);
  const send = (message) => new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(chrome.runtime.lastError ? { ok: false, message: chrome.runtime.lastError.message } : (response || { ok: false }));
    });
  });

  let current = { context: null, lookup: null, phase: 'idle', task: null };
  let searchTimer = null;
  let batchPollTimer = null;

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  }

  async function activeTab() {
    return (await chrome.tabs.query({ active: true, currentWindow: true }))[0] || null;
  }

  async function tabMessage(message) {
    const tab = await activeTab();
    if (!tab?.id) return null;
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, message, (response) => resolve(chrome.runtime.lastError ? null : response));
    });
  }

  function setupTabs() {
    document.querySelectorAll('.tab').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === button));
        document.querySelectorAll('.pane').forEach((pane) => pane.classList.toggle('active', pane.id === `pane-${button.dataset.tab}`));
        if (button.dataset.tab === 'history') loadHistory();
        if (button.dataset.tab === 'batch') loadBatchChannels();
        if (button.dataset.tab === 'insights') loadInsights();
        if (button.dataset.tab === 'diag') loadDiagnostics();
      });
    });
  }

  async function loadCurrent() {
    const view = await tabMessage({ type: 'SPS_GET_VIEW_STATE' });
    if (view?.context) current = view;
    else {
      const stored = await send({ type: 'GET_ACTIVE_CONTEXT' });
      current = { context: stored.context || null, lookup: null, phase: 'idle', task: null };
    }
    renderCurrent();
  }

  function resultActions(item, index) {
    return `<div class="row wrap" style="margin-top:7px">
      ${item.sunoUrl ? `<button class="btn primary" data-open="${esc(item.sunoUrl)}">Suno</button>` : ''}
      ${item.originalYoutubeUrl ? `<button class="btn" data-open="${esc(item.originalYoutubeUrl)}">YouTube original</button>` : ''}
      <button class="btn" data-copy-title="${index}">Kopiraj naziv</button>
      <button class="btn" data-copy-credit="${index}">Kopiraj kredit</button>
    </div>`;
  }

  function renderCurrent() {
    const box = $('currentView');
    const ctx = current.context;
    const lookup = current.lookup;
    if (!ctx) {
      box.innerHTML = '<div class="notice warn">Otvori YouTube video ili Shorts, pa se vrati u panel.</div>';
      return;
    }

    let html = `<div class="label">YouTube video</div><div class="paper"><h2>${esc(ctx.title || ctx.videoId)}</h2><p>${esc(ctx.channelTitle || 'Nepoznat kanal')} · ${ctx.isShort ? 'SHORTS' : 'VIDEO'} · ID ${esc(ctx.videoId)}</p></div>`;
    if (current.phase === 'analyzing') {
      html += `<div class="notice" style="margin-top:9px">${esc(current.task?.message || 'Audio analiza je u toku…')}</div>`;
    } else if (lookup?.items?.length) {
      html += `<div class="label" style="margin-top:12px">Pronađeni Suno originali</div><div class="result-list">${lookup.items.map((item, index) => `
        <div class="result-card">
          <b>${index + 1}. ${esc(item.songTitle)}</b>
          <p>${esc(item.completeness?.label || 'KANDIDAT')} · audio ${Core.formatPercent(item.audioScore || item.combinedScore, 0)} · pokrivenost ${Core.formatPercent(item.coveragePercent, 0)}<br>Suno ID: ${esc(item.songId || '—')}${item.isManual ? '<br><b>RUČNO POVEZANO — NIJE AUDIO DOKAZ</b>' : ''}</p>
          ${resultActions(item, index)}
        </div>`).join('')}</div>`;
    } else {
      html += '<div class="notice warn" style="margin-top:9px">Original još nije pronađen u rezultatima programa. Pokreni audio analizu.</div>';
    }

    box.innerHTML = html;
    box.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => send({ type: 'OPEN_URL', url: button.dataset.open })));
    box.querySelectorAll('[data-copy-title]').forEach((button) => button.addEventListener('click', () => {
      const item = lookup.items[Number(button.dataset.copyTitle || 0)];
      copyWithFeedback(button, item?.songTitle || '');
    }));
    box.querySelectorAll('[data-copy-credit]').forEach((button) => button.addEventListener('click', () => {
      const item = lookup.items[Number(button.dataset.copyCredit || 0)];
      const text = item ? [`Originalna Suno pesma: ${item.songTitle}`, item.songId ? `Suno ID: ${item.songId}` : '', item.sunoUrl || ''].filter(Boolean).join(' | ') : '';
      copyWithFeedback(button, text);
    }));
  }

  async function copyWithFeedback(button, text) {
    if (!text) return;
    await navigator.clipboard.writeText(text).catch(() => {});
    const old = button.textContent;
    button.textContent = 'Kopirano';
    setTimeout(() => { button.textContent = old; }, 1100);
  }

  async function analyze(options = {}) {
    if (!current.context) return;
    const response = await send({ type: 'ANALYZE_VIDEO', context: current.context, options: { force: true, ...options } });
    if (!response.ok) {
      $('currentView').insertAdjacentHTML('beforeend', `<div class="notice error" style="margin-top:8px">${esc(response.message)}</div>`);
      return;
    }
    current.phase = 'analyzing';
    current.task = response.task || null;
    renderCurrent();
    await tabMessage({ type: 'SPS_EXTERNAL_ANALYSIS_STARTED', task: response.task || null, message: response.message || '', stage: response.stage || 'analyzing', options: { force: true, deep: Boolean(options.deep) } });
    setTimeout(loadCurrent, 500);
  }

  async function searchSongs() {
    const query = $('songSearch').value.trim();
    if (query.length < 2) {
      $('songResults').innerHTML = '<span class="muted">Upiši najmanje 2 slova.</span>';
      return;
    }
    $('songResults').innerHTML = '<div class="spinner"></div>';
    const response = await send({ type: 'SEARCH_SONGS', query, limit: 100 });
    if (!response.ok) {
      $('songResults').innerHTML = `<div class="notice error">${esc(response.message)}</div>`;
      return;
    }
    $('songResults').innerHTML = (response.songs || []).map((song) => `<div class="song-row"><div><b>${esc(song.title || song.display_name || song.id)}</b><span>${esc(song.id)} · ${Core.formatSeconds(song.duration)}</span></div><div class="row wrap"><button class="btn primary" data-song-check="${esc(song.id)}">Audio provera</button><button class="btn red" data-song-link="${esc(song.id)}">Poveži ručno</button></div></div>`).join('') || '<span class="muted">Nema rezultata.</span>';
    $('songResults').querySelectorAll('[data-song-check]').forEach((button) => button.addEventListener('click', async () => {
      await analyze({ songIds: [button.dataset.songCheck], deep: true, detectMultiple: false, candidateLimit: 4 });
      document.querySelector('[data-tab="current"]').click();
    }));
    $('songResults').querySelectorAll('[data-song-link]').forEach((button) => button.addEventListener('click', async () => {
      if (!current.context) return;
      const accepted = confirm('Ručno povezivanje NE potvrđuje audio. Koristi ga samo kada si lično siguran da je izabrana pesma tačna. Nastaviti?');
      if (!accepted) return;
      const result = await send({ type: 'MANUAL_LINK', context: current.context, songId: button.dataset.songLink });
      if (!result.ok) { $('songResults').insertAdjacentHTML('afterbegin', `<div class="notice error">${esc(result.message)}</div>`); return; }
      await tabMessage({ type: 'SPS_REFRESH' });
      document.querySelector('[data-tab="current"]').click();
      setTimeout(loadCurrent, 500);
    }));
  }

  async function getHistory() {
    const response = await send({ type: 'GET_HISTORY' });
    return response.ok && Array.isArray(response.history) ? response.history : [];
  }

  async function loadHistory() {
    const history = await getHistory();
    $('historyView').innerHTML = history.map((item) => `<div class="history-item"><div><b>${esc(item.songTitle || item.videoTitle || item.videoId)}</b><span>${esc(item.videoTitle || '')}<br>${esc(item.completenessStatus || item.status)} · ${Core.formatPercent(item.audioScore, 0)}</span></div><div>${item.sunoUrl ? `<button class="link-btn" data-open="${esc(item.sunoUrl)}">SUNO</button>` : ''}${item.videoUrl ? `<button class="link-btn" data-open="${esc(item.videoUrl)}">VIDEO</button>` : ''}</div></div>`).join('') || '<span class="muted">Nema istorije.</span>';
    $('historyView').querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => send({ type: 'OPEN_URL', url: button.dataset.open })));
  }

  async function exportHistoryCsv() {
    const history = await getHistory();
    const rows = [['Datum', 'YouTube video', 'YouTube URL', 'Suno original', 'Suno ID', 'Suno URL', 'Status', 'Audio %', 'Pokrivenost %']];
    history.forEach((item) => rows.push([item.timestamp, item.videoTitle, item.videoUrl, item.songTitle, item.songId, item.sunoUrl, item.completenessStatus || item.status, item.audioScore, item.coveragePercent]));
    const csv = '\ufeff' + rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `suno-original-istorija-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function loadBatchChannels() {
    const response = await send({ type: 'GET_CHANNELS' });
    if (!response.ok) {
      $('batchStatus').className = 'notice error';
      $('batchStatus').textContent = response.message || 'Kanali nisu dostupni.';
      return;
    }
    const select = $('batchChannel');
    const selected = select.value;
    select.innerHTML = '<option value="">Svi povezani kanali</option>' + (response.channels || []).filter((channel) => Number(channel.is_owned ?? 1) === 1).map((channel) => `<option value="${esc(channel.channel_id || '')}">${esc(channel.title || channel.channel_id || 'Kanal')}</option>`).join('');
    if ([...select.options].some((option) => option.value === selected)) select.value = selected;
  }

  async function startBatchTask(kind, extra = {}) {
    clearTimeout(batchPollTimer);
    const options = {
      channelId: $('batchChannel').value,
      scanMode: $('batchMode').value,
      maxVideos: Number($('batchMaxVideos').value || 100),
      candidateLimit: 16,
      detectMultiple: true,
      maxSongsPerVideo: 6,
      reuseCache: true,
      ...extra
    };
    $('batchStatus').className = 'notice';
    $('batchStatus').textContent = 'Pokrećem grupni zadatak…';
    const response = await send({ type: 'START_PROGRAM_TASK', kind, options });
    if (!response.ok) {
      $('batchStatus').className = 'notice error';
      $('batchStatus').textContent = response.message || 'Zadatak nije pokrenut.';
      return;
    }
    renderBatchTask(response.task);
    pollBatchTask(response.task?.id || '');
  }

  function renderBatchTask(task) {
    if (!task) {
      $('batchStatus').className = 'notice warn';
      $('batchStatus').textContent = 'Program nije vratio stanje zadatka.';
      return;
    }
    const status = String(task.status || 'running');
    $('batchStatus').className = `notice ${status === 'error' || status === 'cancelled' ? 'error' : ''}`;
    $('batchStatus').innerHTML = `<b>${esc(task.title || 'Grupni zadatak')}</b><br>${esc(task.message || status)}<br>${Math.max(0, Math.min(100, Number(task.percent || 0)))}% · ${Number(task.done || 0)}/${Number(task.total || 0)}`;
  }

  function pollBatchTask(expectedId) {
    clearTimeout(batchPollTimer);
    const loop = async () => {
      const response = await send({ type: 'TASK_STATUS' });
      if (!response.ok) {
        $('batchStatus').className = 'notice error';
        $('batchStatus').textContent = response.message || 'Ne mogu da pročitam stanje zadatka.';
        return;
      }
      const task = response.task;
      if (task && (!expectedId || String(task.id) === String(expectedId))) {
        renderBatchTask(task);
        if (['done', 'partial', 'error', 'cancelled'].includes(String(task.status || ''))) return;
      }
      batchPollTimer = setTimeout(loop, 2500);
    };
    loop();
  }

  async function cancelTask() {
    const response = await send({ type: 'CONTROL_TASK', action: 'cancel' });
    $('batchStatus').className = `notice ${response.ok ? '' : 'error'}`;
    $('batchStatus').textContent = response.message || (response.ok ? 'Zadatak je otkazan.' : 'Zadatak nije otkazan.');
  }

  async function controlTask(action) {
    const response = await send({ type: 'CONTROL_TASK', action });
    $('batchStatus').className = `notice ${response.ok ? '' : 'error'}`;
    $('batchStatus').textContent = response.message || (response.ok ? `Komanda ${action} je poslata.` : 'Komanda nije izvršena.');
    if (response.ok) pollBatchTask(response.task?.id || '');
  }

  async function cleanupAudioCache() {
    const accepted = confirm('Ovo briše lokalno preuzete YouTube audio-keš fajlove starije od 30 dana ili preko ograničenja. Rezultati u bazi ostaju. Nastaviti?');
    if (!accepted) return;
    const response = await send({ type: 'CLEANUP_AUDIO_CACHE', days: 30, gb: 10 });
    $('batchStatus').className = `notice ${response.ok ? '' : 'error'}`;
    $('batchStatus').textContent = response.message || (response.ok ? `Uklonjeno fajlova: ${Number(response.removed || 0)}.` : 'Čišćenje nije uspelo.');
  }

  async function exportReport(kind) {
    const target = $('batchStatus');
    target.className = 'notice';
    target.textContent = 'Program pravi izveštaj…';
    const response = await send({ type: 'EXPORT_PROGRAM_REPORT', kind });
    target.className = `notice ${response.ok ? '' : 'error'}`;
    target.textContent = response.ok ? (response.message || 'Izveštaj je napravljen i preuzimanje je otvoreno.') : (response.message || 'Izveštaj nije napravljen.');
  }

  function metric(label, value) {
    return `<div class="result-card"><b>${esc(value)}</b><p>${esc(label)}</p></div>`;
  }

  async function loadInsights() {
    $('insightsView').className = 'notice';
    $('insightsView').textContent = 'Čitam YouTube rezultate iz programa…';
    const response = await send({ type: 'GET_YOUTUBE_INSIGHTS' });
    if (!response.ok) {
      $('insightsView').className = 'notice error';
      $('insightsView').textContent = response.message || 'Uvidi nisu dostupni.';
      return;
    }
    const summary = response.summary || {};
    const audio = response.audio_summary || {};
    const coverage = response.coverage?.summary || {};
    const dup = response.duplicate_mix_report || {};
    $('insightsView').className = 'result-list';
    $('insightsView').innerHTML = [
      metric('Povezani kanali', summary.channels || 0),
      metric('Moji kanali', summary.owned_channels || 0),
      metric('Pronađene objave', summary.matches || 0),
      metric('Sumnjive tuđe objave', summary.suspicious || 0),
      metric('Audio potvrđene veze', audio.total || 0),
      metric('Kompletne pesme', audio.complete || 0),
      metric('Shorts isečci', audio.short_clip || 0),
      metric('Indeksirani fingerprint-i', audio.fingerprints || 0),
      metric('Mix videi', audio.mix_videos || 0),
      metric('Pesme bez potvrđene objave', coverage.missing || 0),
      metric('Duplikati objava', Array.isArray(dup.duplicates) ? dup.duplicates.length : 0),
      metric('Video mix-evi', Array.isArray(dup.mixes) ? dup.mixes.length : 0)
    ].join('');
  }

  async function loadDiagnostics(force = false) {
    const response = await send({ type: 'PROGRAM_STATUS', force });
    const dot = $('statusDot');
    if (response.ok) {
      const lib = response.library || {};
      const indexed = Number(lib.songs_indexed || 0);
      const total = Number(lib.songs_total || 0);
      const withAudio = Number(lib.songs_with_audio || 0);
      dot.className = `status-dot ${response.locked ? 'locked' : (indexed > 0 ? 'online' : 'locked')}`;
      $('diagView').className = `notice ${response.locked || indexed <= 0 ? 'warn' : ''}`;
      $('diagView').innerHTML = `<b>${response.locked ? 'PROGRAM JE ZAKLJUČAN' : (indexed > 0 ? 'SISTEM JE SPREMAN' : 'AUDIO INDEKS NIJE SPREMAN')}</b><br>
        Bridge: ${esc(response.bridgeVersion || '—')} · ${esc(response.apiBase || '')}<br>
        Program: ${esc(response.app)} ${esc(response.programVersion || '—')} · ${esc(response.programBase || '')}<br>
        Biblioteka: ${total} · sa audio izvorom: ${withAudio} · indeksirano: ${indexed}<br>
        Neindeksirano: ${Number(lib.songs_not_indexed || 0)} · bez audio izvora: ${Number(lib.songs_without_any_source || 0)}<br>
        Povezani YouTube kanali: ${(response.channels || []).length}<br>
        Aktivni zadatak: ${esc(response.task?.title || 'nema')} ${response.task ? `(${esc(response.task.status || '')})` : ''}<br>
        Extension ID: ${esc(chrome.runtime.id)}<br><span class="muted">${esc(response.message || '')}</span>`;
    } else {
      dot.className = 'status-dot offline';
      $('diagView').className = 'notice error';
      $('diagView').innerHTML = `<b>VEZA NIJE SPREMNA</b><br>${esc(response.message || 'Bridge ili program nisu dostupni.')}<br><span class="muted">Kod: ${esc(response.code || '—')}</span>`;
    }
  }

  async function showLogs() {
    const view = $('logsView');
    view.style.display = 'block';
    view.textContent = 'Učitavam logove…';
    const response = await send({ type: 'GET_PROGRAM_LOGS', limit: 80 });
    if (!response.ok) {
      view.textContent = response.message || 'Logovi nisu dostupni.';
      return;
    }
    const logs = response.logs || [];
    view.textContent = Array.isArray(logs) ? logs.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('\n') : String(logs || 'Nema logova.');
  }

  $('analyzeBtn').addEventListener('click', () => analyze());
  $('deepAnalyzeBtn').addEventListener('click', () => analyze({ deep: true, candidateLimit: 40, force: true }));
  $('refreshBtn').addEventListener('click', async () => { await tabMessage({ type: 'SPS_REFRESH' }); setTimeout(loadCurrent, 400); });
  $('openAppBtn').addEventListener('click', () => send({ type: 'OPEN_APP' }));
  $('songSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(searchSongs, 350); });
  $('clearHistoryBtn').addEventListener('click', async () => { await send({ type: 'CLEAR_HISTORY' }); loadHistory(); });
  $('exportHistoryBtn').addEventListener('click', exportHistoryCsv);
  $('testBtn').addEventListener('click', () => loadDiagnostics(true));
  $('showLogsBtn').addEventListener('click', showLogs);
  $('clearCacheBtn').addEventListener('click', async () => { await send({ type: 'CLEAR_CACHE' }); $('diagView').textContent = 'Extension keš rezultata je očišćen.'; });
  $('optionsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('metadataScanBtn').addEventListener('click', () => startBatchTask('metadataScan'));
  $('scanVideosBtn').addEventListener('click', () => startBatchTask('ownedAudio'));
  $('scanShortsBtn').addEventListener('click', () => startBatchTask('shortsAudio'));
  $('globalScanBtn').addEventListener('click', () => startBatchTask('globalScan'));
  $('fingerprintsBtn').addEventListener('click', () => startBatchTask('fingerprintIndex', { force: false }));
  $('rebuildIndexBtn').addEventListener('click', () => startBatchTask('fingerprintIndex', { force: true }));
  $('pauseTaskBtn').addEventListener('click', () => controlTask('pause'));
  $('resumeTaskBtn').addEventListener('click', () => controlTask('resume'));
  $('cancelTaskBtn').addEventListener('click', cancelTask);
  $('cleanupAudioBtn').addEventListener('click', cleanupAudioCache);
  $('audioReportBtn').addEventListener('click', () => exportReport('audio'));
  $('coverageReportBtn').addEventListener('click', () => exportReport('coverage'));
  $('refreshInsightsBtn').addEventListener('click', loadInsights);

  setupTabs();
  loadCurrent();
  loadDiagnostics();
  loadBatchChannels();
})();
