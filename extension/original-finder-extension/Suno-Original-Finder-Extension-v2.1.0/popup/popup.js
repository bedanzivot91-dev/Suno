(() => {
  'use strict';
  const Core = globalThis.SPSCore;
  const $ = (id) => document.getElementById(id);
  const send = (message) => new Promise((resolve) => chrome.runtime.sendMessage(message, (response) => resolve(chrome.runtime.lastError ? { ok: false, message: chrome.runtime.lastError.message } : (response || { ok: false }))));
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));

  async function activeTab() { return (await chrome.tabs.query({ active: true, currentWindow: true }))[0] || null; }
  async function tabMessage(message) {
    const tab = await activeTab();
    if (!tab?.id) return null;
    return new Promise((resolve) => chrome.tabs.sendMessage(tab.id, message, (response) => resolve(chrome.runtime.lastError ? null : response)));
  }

  function connectionHtml(status) {
    if (!status?.ok || status?.online === false) {
      const extra = status?.code === 'BRIDGE_REQUIRED'
        ? '<br><span class="muted">Program radi, ali v2 Bridge nije pokrenut.</span>'
        : (status?.bridgeOnline ? '<br><span class="muted">Bridge radi, ali Suno Pesme Studio nije dostupan ili nije pokrenut.</span>' : '');
      return `<div class="notice error"><b>VEZA NIJE SPREMNA</b><br>${esc(status?.message || 'Bridge ili program nisu dostupni.')}${extra}</div>`;
    }
    if (status.locked) return '<div class="notice warn"><b>PROGRAM JE ZAKLJUČAN</b><br>Otključaj Suno Pesme Studio PIN-om.</div>';
    const library = status.library || {};
    const total = Number(library.songs_total || 0);
    const indexed = Number(library.songs_indexed || 0);
    const withAudio = Number(library.songs_with_audio || 0);
    const cls = indexed > 0 ? '' : ' warn';
    return `<div class="notice${cls}"><b>${indexed > 0 ? 'VEZA I AUDIO INDEKS RADE' : 'VEZA RADI — INDEKS NIJE SPREMAN'}</b><br>
      Program ${esc(status.programVersion || '—')} · Bridge ${esc(status.bridgeVersion || '—')}<br>
      Biblioteka: ${total} pesama · audio izvor: ${withAudio} · indeksirano: ${indexed}<br>
      <span class="muted">${esc(status.message || '')}</span></div>`;
  }

  function renderCurrent(view) {
    if (!view?.context) {
      $('current').innerHTML = '<div class="label">Trenutni video</div><div class="notice warn">Otvori YouTube video ili Shorts.</div>';
      return;
    }
    const item = view.lookup?.primary;
    const status = view.phase === 'analyzing' ? (view.task?.message || 'Lokalna analiza je u toku…') : (item ? `${item.completeness?.label || 'KANDIDAT'} · audio ${Core.formatPercent(item.audioScore || item.combinedScore, 0)}` : 'Original još nije potvrđen.');
    $('current').innerHTML = `<div class="label">Trenutni video</div><div class="paper"><h2>${esc(item?.songTitle || view.context.title || view.context.videoId)}</h2><p>${esc(status)}</p></div>`;
  }

  function renderHistory(items) {
    const confirmed = (items || []).filter((item) => item.songTitle && ['matched', 'candidate'].includes(String(item.status || ''))).slice(0, 5);
    $('history').innerHTML = confirmed.map((item) => `<div class="history-item"><div><b>${esc(item.songTitle)}</b><span>${esc(Core.completenessInfo(item.completenessStatus).label)} · ${Core.formatPercent(item.audioScore, 0)}</span></div>${item.sunoUrl ? `<button class="link-btn" data-url="${esc(item.sunoUrl)}">OTVORI</button>` : ''}</div>`).join('') || '<span class="muted">Još nema potvrđenih rezultata.</span>';
    $('history').querySelectorAll('[data-url]').forEach((button) => { button.onclick = () => send({ type: 'OPEN_URL', url: button.dataset.url }); });
  }

  async function load() {
    const settings = await send({ type: 'GET_SETTINGS' });
    if (settings.ok) {
      $('autoAnalyze').checked = settings.settings.autoAnalyze;
      $('showCard').checked = settings.settings.showWatchCard && settings.settings.showShortsCard;
    }
    const status = await send({ type: 'PROGRAM_STATUS', force: true });
    $('statusDot').className = `status-dot ${status.ok && status.online !== false ? (status.locked ? 'locked' : (Number(status.library?.songs_indexed || 0) > 0 ? 'online' : 'locked')) : 'offline'}`;
    $('connection').innerHTML = connectionHtml(status);
    renderCurrent(await tabMessage({ type: 'SPS_GET_VIEW_STATE' }));
    const history = await send({ type: 'GET_HISTORY' });
    renderHistory(history.history || []);
  }

  $('recognizeBtn').onclick = async () => {
    const response = await tabMessage({ type: 'SPS_FORCE_ANALYZE' });
    if (!response) $('connection').innerHTML = '<div class="notice error">Otvori YouTube video ili Shorts, pa pokušaj ponovo.</div>';
  };
  $('indexBtn').onclick = async () => {
    $('connection').innerHTML = '<div class="notice">Pokrećem indeksiranje Suno pesama…</div>';
    const response = await send({ type: 'START_INDEX', force: false });
    $('connection').innerHTML = response.ok
      ? `<div class="notice"><b>INDEKSIRANJE JE POKRENUTO</b><br>${esc(response.task?.message || response.message || '')}<br><span class="muted">Napredak vidiš u velikom panelu ili programu.</span></div>`
      : `<div class="notice error">${esc(response.message || 'Indeksiranje nije pokrenuto.')}</div>`;
  };
  $('panelBtn').onclick = async () => { const tab = await activeTab(); await send({ type: 'OPEN_SIDE_PANEL', tabId: tab?.id }); window.close(); };
  $('appBtn').onclick = () => send({ type: 'OPEN_APP' });
  $('settingsBtn').onclick = () => send({ type: 'OPEN_OPTIONS' });
  $('autoAnalyze').onchange = () => send({ type: 'SAVE_SETTINGS', patch: { autoAnalyze: $('autoAnalyze').checked } });
  $('showCard').onchange = () => send({ type: 'SAVE_SETTINGS', patch: { showWatchCard: $('showCard').checked, showShortsCard: $('showCard').checked } });
  load();
})();
