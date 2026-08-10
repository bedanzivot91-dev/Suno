(() => {
  'use strict';

  const $id = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function request(path, options = {}) {
    if (typeof window.api === 'function') return window.api(path, options);
    const init = { ...options, headers: { ...(options.headers || {}) } };
    if (init.body && typeof init.body !== 'string') {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(init.body);
    }
    const response = await fetch(path, init);
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok || (data && typeof data === 'object' && data.ok === false)) {
      throw new Error(data?.message || data?.error || `Greška ${response.status}`);
    }
    return data;
  }

  function bool(value) { return Boolean(value); }
  function text(value, fallback = '—') { return value === undefined || value === null || value === '' ? fallback : String(value); }

  function statusTone(ok, warning = false) {
    if (ok) return 'ok';
    return warning ? 'warn' : 'off';
  }

  function setCard(id, { connected, label, detail, warning = false }) {
    const card = $id(id);
    if (!card) return;
    card.dataset.state = statusTone(connected, warning);
    const dot = card.querySelector('.t3-status-dot');
    const labelEl = card.querySelector('.t3-status-label');
    const detailEl = card.querySelector('.t3-status-detail');
    if (dot) dot.setAttribute('aria-label', connected ? 'Povezano' : warning ? 'Potrebna pažnja' : 'Nije povezano');
    if (labelEl) labelEl.textContent = label;
    if (detailEl) detailEl.textContent = detail;
  }

  function dashboardMarkup() {
    return `
      <section class="t3-command-center" id="t3CommandCenter" aria-label="Suno i YouTube komandni centar">
        <div class="t3-command-head">
          <div>
            <span class="t3-eyebrow">KOMANDNI CENTAR</span>
            <h2>Suno + YouTube nalozi</h2>
            <p>Stvarni statusi naloga, prijava i osvežavanje bez napuštanja početne strane.</p>
          </div>
          <button class="t3-refresh" id="t3RefreshAll" type="button">↻ Osveži statuse</button>
        </div>

        <div class="t3-account-grid">
          <article class="t3-account-card" id="t3SunoCard" data-state="off">
            <div class="t3-card-top"><span class="t3-logo t3-logo-suno">S</span><div><strong>Suno</strong><span class="t3-status-line"><i class="t3-status-dot"></i><b class="t3-status-label">Provera...</b></span></div></div>
            <p class="t3-status-detail">Čitam stvarno stanje Suno veze.</p>
            <div class="t3-actions">
              <button id="t3SunoLogin" class="btn primary" type="button">Otvori Suno prijavu</button>
              <button id="t3SunoCheck" class="btn secondary" type="button">Proveri vezu</button>
            </div>
          </article>

          <article class="t3-account-card" id="t3YoutubeCard" data-state="off">
            <div class="t3-card-top"><span class="t3-logo t3-logo-youtube">▶</span><div><strong>YouTube / Google</strong><span class="t3-status-line"><i class="t3-status-dot"></i><b class="t3-status-label">Provera...</b></span></div></div>
            <p class="t3-status-detail">Čitam stvarno stanje Google OAuth prijave i kanala.</p>
            <div class="t3-actions">
              <button id="t3YoutubeLogin" class="btn success" type="button">Poveži Google nalog</button>
              <button id="t3YoutubeRefresh" class="btn secondary" type="button">Osveži kanale</button>
            </div>
          </article>
        </div>

        <div class="t3-system-strip">
          <div><span>Lokalni server</span><strong id="t3ServerState">Provera...</strong></div>
          <div><span>Suno biblioteka</span><strong id="t3LibraryState">—</strong></div>
          <div><span>YouTube kanali</span><strong id="t3ChannelState">—</strong></div>
          <div><span>Poslednja provera</span><strong id="t3CheckedAt">—</strong></div>
        </div>
        <div class="t3-message" id="t3Message" role="status" aria-live="polite"></div>
      </section>`;
  }

  function mount() {
    if ($id('t3CommandCenter')) return true;
    const home = $id('view-home');
    if (!home) return false;
    home.insertAdjacentHTML('afterbegin', dashboardMarkup());
    bind();
    refreshAll();
    return true;
  }

  function message(value, kind = '') {
    const el = $id('t3Message');
    if (!el) return;
    el.className = `t3-message ${kind}`.trim();
    el.textContent = value || '';
  }

  async function getSunoStatus() {
    let status = {};
    try { status = await request('/api/status'); } catch (_) {}
    const connected = bool(status.connected || status.suno_connected || status.authenticated);
    const total = Number(status.total_songs ?? status.library_total ?? status.song_count ?? 0);
    setCard('t3SunoCard', {
      connected,
      label: connected ? 'Povezano' : 'Nije povezano',
      detail: connected ? `Suno sesija je aktivna${status.email ? ` · ${status.email}` : ''}.` : 'Suno sesija nije potvrđena. Prijavi se i pokreni proveru veze.'
    });
    if ($id('t3LibraryState')) $id('t3LibraryState').textContent = total > 0 ? `${total} pesama` : connected ? 'Povezano · biblioteka spremna' : 'Nije povezano';
    return { connected, status };
  }

  async function getYoutubeStatus() {
    let data = {};
    try { data = await request('/api/youtube/oauth/status'); } catch (error) {
      setCard('t3YoutubeCard', { connected: false, warning: true, label: 'Status nije dostupan', detail: error.message });
      if ($id('t3ChannelState')) $id('t3ChannelState').textContent = 'Greška provere';
      return { connected: false, oauth: {} };
    }
    const oauth = data.oauth || data || {};
    const connected = bool(oauth.connected);
    const configured = bool(oauth.configured);
    const profiles = Number(oauth.profile_count || (oauth.profiles || []).length || 0);
    const channels = Number(oauth.channel_count || 0);
    setCard('t3YoutubeCard', {
      connected,
      warning: !connected && configured,
      label: connected ? 'Povezano' : configured ? 'OAuth spreman' : 'Nije povezano',
      detail: connected ? `${profiles} Google nalog(a) · ${channels} YouTube kanal(a).` : configured ? 'Google OAuth je podešen, ali nalog još nije potvrđen.' : 'Google OAuth još nije podešen. Klik na povezivanje vodi kroz prvo podešavanje.'
    });
    if ($id('t3ChannelState')) $id('t3ChannelState').textContent = connected ? `${channels} kanal(a)` : configured ? 'OAuth spreman' : 'Nije povezano';
    return { connected, oauth };
  }

  async function getServerStatus() {
    try {
      const health = await request('/api/health', { timeoutMs: 5000 });
      if ($id('t3ServerState')) $id('t3ServerState').textContent = `Radi · v${text(health.version, '?')}`;
      return true;
    } catch (_) {
      if ($id('t3ServerState')) $id('t3ServerState').textContent = 'Nije dostupan';
      return false;
    }
  }

  async function refreshAll() {
    const btn = $id('t3RefreshAll');
    if (btn) btn.disabled = true;
    message('Proveravam Suno, YouTube i lokalni server...');
    const [server, suno, youtube] = await Promise.all([getServerStatus(), getSunoStatus(), getYoutubeStatus()]);
    if ($id('t3CheckedAt')) $id('t3CheckedAt').textContent = new Date().toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    message(server ? `Status osvežen · Suno ${suno.connected ? 'povezan' : 'nije povezan'} · YouTube ${youtube.connected ? 'povezan' : 'nije povezan'}.` : 'Lokalni server nije dostupan.', server ? 'ok' : 'error');
    if (btn) btn.disabled = false;
  }

  async function sunoLogin() {
    try {
      message('Otvaram Suno prijavu...');
      if (typeof window.connectStart === 'function') {
        await window.connectStart();
      } else {
        await request('/api/connect/start', { method: 'POST', body: {}, timeoutMs: 12000 });
      }
      for (let i = 0; i < 45; i += 1) {
        await sleep(2000);
        const result = await getSunoStatus();
        if (result.connected) { message('Suno je uspešno povezan.', 'ok'); return; }
      }
      message('Suno prijava je otvorena. Kada završiš prijavu klikni „Proveri vezu“.', 'warn');
    } catch (error) { message(error.message, 'error'); }
  }

  async function sunoCheck() {
    try {
      message('Proveravam Suno vezu...');
      if (typeof window.connectCheck === 'function') await window.connectCheck(false);
      else await request('/api/connect/check', { method: 'POST', body: {}, timeoutMs: 45000 });
      const result = await getSunoStatus();
      message(result.connected ? 'Suno veza je potvrđena.' : 'Suno veza još nije potvrđena.', result.connected ? 'ok' : 'warn');
    } catch (error) { message(error.message, 'error'); }
  }

  async function youtubeLogin() {
    try {
      message('Pokrećem Google/YouTube povezivanje...');
      if (typeof window.connectYoutubeGoogle === 'function') {
        await window.connectYoutubeGoogle();
      } else {
        const status = await getYoutubeStatus();
        if (!status.oauth.configured) throw new Error('Prvo otvori YouTube stranicu u programu i izaberi Google OAuth JSON.');
        const d = await request('/api/youtube/oauth/start', { method: 'POST', body: { email: '' }, timeoutMs: 30000 });
        if (!d.opened && d.url) window.open(d.url, '_blank', 'noopener');
      }
      for (let i = 0; i < 60; i += 1) {
        await sleep(2000);
        const result = await getYoutubeStatus();
        if (result.connected) { message('YouTube/Google nalog je uspešno povezan.', 'ok'); return; }
      }
      message('Google prijava još nije završena. Dovrši izbor naloga pa osveži status.', 'warn');
    } catch (error) { message(error.message, 'error'); }
  }

  async function youtubeRefresh() {
    try {
      message('Osvežavam YouTube kanale...');
      if (typeof window.refreshYoutubeGoogle === 'function') await window.refreshYoutubeGoogle();
      else await request('/api/youtube/oauth/refresh-channels', { method: 'POST', body: {}, timeoutMs: 90000 });
      await getYoutubeStatus();
      message('YouTube kanali su osveženi.', 'ok');
    } catch (error) { message(error.message, 'error'); }
  }

  function bind() {
    $id('t3RefreshAll')?.addEventListener('click', refreshAll);
    $id('t3SunoLogin')?.addEventListener('click', sunoLogin);
    $id('t3SunoCheck')?.addEventListener('click', sunoCheck);
    $id('t3YoutubeLogin')?.addEventListener('click', youtubeLogin);
    $id('t3YoutubeRefresh')?.addEventListener('click', youtubeRefresh);
  }

  function boot() {
    if (mount()) return;
    const timer = setInterval(() => { if (mount()) clearInterval(timer); }, 250);
    setTimeout(() => clearInterval(timer), 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
