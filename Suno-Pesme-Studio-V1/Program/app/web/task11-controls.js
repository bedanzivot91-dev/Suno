(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const notify = (message, kind = 'info') => {
    if (typeof toast === 'function') toast(message, kind, 6000);
  };
  const go = (view) => {
    if (typeof showView === 'function') showView(view);
  };
  const enable = (button, title = '') => {
    if (!button) return null;
    button.disabled = false;
    button.removeAttribute('disabled');
    if (title) button.title = title;
    return button;
  };
  const bindOnce = (element, key, handler) => {
    if (!element || element.dataset[key] === '1') return;
    element.dataset[key] = '1';
    element.addEventListener('click', handler);
  };

  function currentSong() {
    if (typeof state === 'undefined') return null;
    return state.currentSong || (Array.isArray(state.songs) ? state.songs[0] : null) || null;
  }

  function enableNotificationButtons() {
    all('button[title*="Obaveštenja nisu implementirana"]').forEach((button, index) => {
      enable(button, 'Otvori dnevnik obaveštenja i rada');
      button.id ||= `spsNotificationsBtn${index + 1}`;
      bindOnce(button, 'spsNotificationsBound', () => go('logs'));
    });
  }

  function enableBroadcastMenus() {
    const queueSearchMenu = document.querySelector('.br-search button');
    if (queueSearchMenu) {
      queueSearchMenu.id ||= 'brQueueSearchMenu';
      enable(queueSearchMenu, 'Očisti pretragu reda');
      queueSearchMenu.textContent = '×';
      bindOnce(queueSearchMenu, 'spsMenuBound', () => {
        const input = byId('brQueueSearch');
        if (!input) return;
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      });
    }

    const queueMenu = document.querySelector('.br-queue-head > button:last-child');
    if (queueMenu) {
      queueMenu.id ||= 'brQueueManageBtn';
      enable(queueMenu, 'Otvori biblioteku za upravljanje redom');
      bindOnce(queueMenu, 'spsMenuBound', () => go('library'));
    }

    const activeMenu = document.querySelector('.br-active-song-panel > .br-panel-title button');
    if (activeMenu) {
      activeMenu.id ||= 'brActiveSongMenuBtn';
      enable(activeMenu, 'Otvori detalje aktivne pesme');
      bindOnce(activeMenu, 'spsMenuBound', async () => {
        const song = currentSong();
        if (!song) return go('library');
        if (typeof openSong === 'function') await openSong(song.id);
      });
    }

    const autoplayOptions = document.querySelector('.br-autoplay > button:last-child');
    if (autoplayOptions) {
      autoplayOptions.id ||= 'brAutoplayOptionsBtn';
      enable(autoplayOptions, 'Promeni fade prelaz: 0 / 3 / 5 / 8 / 12 s');
      bindOnce(autoplayOptions, 'spsMenuBound', () => {
        const slider = byId('brCrossfadeSlider');
        if (!slider) return;
        const presets = [0, 3, 5, 8, 12];
        const current = Number(slider.value || 0);
        const index = presets.indexOf(current);
        const next = presets[(index + 1 + presets.length) % presets.length];
        slider.value = String(next);
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        notify(`Fade prelaz: ${next} s`, 'success');
      });
    }
  }

  let sinkIndex = 0;
  async function chooseNextAudioOutput() {
    const audio = byId('audioPlayer');
    if (!audio || typeof audio.setSinkId !== 'function' || !navigator.mediaDevices?.enumerateDevices) {
      notify('WebView2/Windows ne izlaže izbor audio izlaza na ovom računaru.', 'warning');
      return;
    }
    try {
      const outputs = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'audiooutput');
      if (!outputs.length) {
        notify('Nijedan audio izlaz nije pronađen.', 'warning');
        return;
      }
      sinkIndex = (sinkIndex + 1) % outputs.length;
      const selected = outputs[sinkIndex];
      await audio.setSinkId(selected.deviceId);
      const button = byId('brHeadphonesBtn');
      button?.classList.add('active');
      notify(`Audio izlaz: ${selected.label || `uređaj ${sinkIndex + 1}`}`, 'success');
    } catch (error) {
      notify(error?.message || String(error), 'error');
    }
  }

  let brLoopA = null;
  let brLoopB = null;
  function configureBroadcastAudioControls() {
    const headphones = byId('brHeadphonesBtn');
    if (headphones) {
      enable(headphones, 'Promeni Windows audio izlaz / slušalice');
      bindOnce(headphones, 'spsHeadphonesBound', chooseNextAudioOutput);
    }

    const group = document.querySelector('.br-ab-group');
    const buttons = group ? all('button', group) : [];
    if (group && buttons.length >= 2) {
      const caption = group.querySelector('small');
      if (caption) caption.textContent = 'A/B PETLJA';
      const [aButton, bButton] = buttons;
      aButton.id ||= 'brLoopAButton';
      bButton.id ||= 'brLoopBButton';
      enable(aButton, 'Postavi početak A-B petlje');
      enable(bButton, 'Postavi kraj A-B petlje');
      bindOnce(aButton, 'spsAbBound', () => {
        const audio = byId('audioPlayer');
        if (!audio?.duration) return notify('Pokreni pesmu pre postavljanja A tačke.', 'warning');
        brLoopA = audio.currentTime;
        if (brLoopB !== null && brLoopB <= brLoopA) brLoopB = null;
        aButton.textContent = `A ${typeof formatDuration === 'function' ? formatDuration(brLoopA) : brLoopA.toFixed(1)}`;
        aButton.classList.add('active');
      });
      bindOnce(bButton, 'spsAbBound', () => {
        const audio = byId('audioPlayer');
        if (!audio?.duration || brLoopA === null) return notify('Prvo postavi A tačku.', 'warning');
        if (audio.currentTime <= brLoopA) return notify('B tačka mora biti posle A tačke.', 'warning');
        brLoopB = audio.currentTime;
        bButton.textContent = `B ${typeof formatDuration === 'function' ? formatDuration(brLoopB) : brLoopB.toFixed(1)}`;
        bButton.classList.add('active');
        notify('A-B petlja je aktivna.', 'success');
      });
      const audio = byId('audioPlayer');
      if (audio && audio.dataset.spsBroadcastAbBound !== '1') {
        audio.dataset.spsBroadcastAbBound = '1';
        audio.addEventListener('timeupdate', () => {
          if (brLoopA !== null && brLoopB !== null && audio.currentTime >= brLoopB) audio.currentTime = brLoopA;
        });
      }
      group.addEventListener('dblclick', () => {
        brLoopA = null; brLoopB = null;
        aButton.textContent = 'A'; bButton.textContent = 'B';
        aButton.classList.remove('active'); bButton.classList.remove('active');
        notify('A-B petlja je obrisana.');
      });
    }

    const pitch = byId('brPitchSlider');
    const tempo = byId('brTempoSlider');
    const pitchValue = byId('brPitchValue');
    if (pitch) {
      enable(pitch, 'Pitch resampling: menja visinu tona i brzinu bez lažnog DSP-a');
      const label = pitch.closest('.br-bottom-slider')?.querySelector('small');
      if (label) label.textContent = 'PITCH + SPEED';
      if (pitchValue && pitchValue.textContent === 'N/A') pitchValue.textContent = '0.00 st';
      const applyRate = () => {
        const audio = byId('audioPlayer');
        if (!audio) return;
        const semitones = Math.max(-12, Math.min(12, Number(pitch.value || 0)));
        const baseTempo = Math.max(.5, Math.min(2, Number(tempo?.value || 1)));
        const rate = Math.max(.25, Math.min(4, baseTempo * Math.pow(2, semitones / 12)));
        try { audio.preservesPitch = false; } catch (_) {}
        try { audio.webkitPreservesPitch = false; } catch (_) {}
        audio.playbackRate = rate;
        if (pitchValue) pitchValue.textContent = `${semitones >= 0 ? '+' : ''}${semitones.toFixed(2)} st`;
      };
      pitch.addEventListener('input', applyRate);
      tempo?.addEventListener('input', () => setTimeout(applyRate, 0));
      byId('brResetTransport')?.addEventListener('click', () => {
        pitch.value = '0';
        if (pitchValue) pitchValue.textContent = '0.00 st';
        setTimeout(applyRate, 0);
      });
    }
  }

  let lcFilter = 'all';
  function lcSongMatches(song) {
    if (lcFilter === 'all') return true;
    const album = String(song?.album || '').trim().toLocaleLowerCase('sr');
    const releaseType = String(song?.release_type || song?.type || '').trim().toLocaleLowerCase('sr');
    if (lcFilter === 'single') return !album || /singl|single/.test(album) || /singl|single/.test(releaseType);
    if (lcFilter === 'ep') return /(^|\s)ep(\s|$)/i.test(album) || releaseType === 'ep';
    if (lcFilter === 'album') return Boolean(album) && !/singl|single|(^|\s)ep(\s|$)/i.test(album) && !/singl|single|ep/.test(releaseType);
    if (lcFilter === 'archive') return Boolean(song?.youtube_url || song?.youtube_published_at || song?.published_at);
    return true;
  }
  function applyLcFilter() {
    const target = byId('lcSongRows');
    if (!target || typeof state === 'undefined') return;
    all('.lc-song-row', target).forEach((row) => {
      const song = state.songs?.find((item) => String(item.id) === String(row.dataset.songId));
      row.hidden = !lcSongMatches(song);
    });
  }
  function configureLabelControls() {
    const more = document.querySelector('.lc-action-row > button:last-child');
    if (more) {
      more.id ||= 'lcMoreActionsBtn';
      enable(more, 'Otvori sve detalje aktivne pesme');
      bindOnce(more, 'spsLcMoreBound', async () => {
        const song = currentSong();
        if (song && typeof openSong === 'function') await openSong(song.id);
        else go('library');
      });
    }

    const tabs = document.querySelector('.lc-catalog-tabs');
    if (tabs) {
      const buttons = all(':scope > button', tabs);
      const map = { 'SVE PESME': 'all', 'SINGLOVI': 'single', 'ALBUMI': 'album', 'EP': 'ep', 'ARHIVA': 'archive' };
      buttons.forEach((button) => {
        const key = map[button.textContent.trim().toUpperCase()];
        if (!key) return;
        enable(button, `Filtriraj katalog: ${button.textContent.trim()}`);
        button.id ||= `lcCatalogFilter_${key}`;
        bindOnce(button, 'spsLcFilterBound', () => {
          lcFilter = key;
          buttons.forEach((b) => b.classList.toggle('active', b === button));
          applyLcFilter();
        });
      });
      const viewButtons = all(':scope > div > button', tabs).filter((button) => !button.dataset.lcView);
      viewButtons.forEach((button, index) => {
        enable(button, index === 0 ? 'Kompaktan prikaz kataloga' : 'Prošireni prikaz kataloga');
        button.id ||= `lcCatalogView${index + 1}`;
        bindOnce(button, 'spsLcViewBound', () => {
          const table = document.querySelector('.lc-song-table');
          if (!table) return;
          table.classList.toggle('sps-compact-view', index === 0);
          table.classList.toggle('sps-roomy-view', index !== 0);
        });
      });
      const observer = new MutationObserver(applyLcFilter);
      const rows = byId('lcSongRows');
      if (rows) observer.observe(rows, { childList: true });
    }
  }

  function configureVinylViewControls() {
    const holder = document.querySelector('.vl-list-section .vl-section-head > div');
    if (!holder) return;
    all('button', holder).forEach((button, index) => {
      enable(button, index === 0 ? 'Kompaktan prikaz liste' : 'Prošireni prikaz liste');
      button.id ||= `vlListView${index + 1}`;
      bindOnce(button, 'spsVlViewBound', () => {
        const table = document.querySelector('.vl-song-table');
        if (!table) return;
        table.classList.toggle('sps-compact-view', index === 0);
        table.classList.toggle('sps-roomy-view', index !== 0);
      });
    });
  }

  let sgPage = 0;
  let sgViewMode = 1;
  function renderSignalPage() {
    if (typeof sgFilteredSongs !== 'function' || typeof state === 'undefined') return;
    const target = byId('sgSongRows');
    if (!target) return;
    const filtered = sgFilteredSongs();
    const pageSize = 12;
    const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
    sgPage = Math.max(0, Math.min(maxPage, sgPage));
    const rows = filtered.slice(sgPage * pageSize, sgPage * pageSize + pageSize);
    const current = typeof sgCurrent === 'function' ? sgCurrent() : currentSong();
    target.innerHTML = rows.length ? rows.map((song, index) => `<article class="sg-tech-row ${current && String(current.id) === String(song.id) ? 'active' : ''}" data-song-id="${typeof escapeHtml === 'function' ? escapeHtml(song.id) : song.id}"><span>${sgPage * pageSize + index + 1}</span><button type="button" class="sg-row-play">${current && String(current.id) === String(song.id) ? '◀' : '▶'}</button><span>${escapeHtml(song.title || 'Bez naslova')}</span><span>${escapeHtml(typeof sgArtist === 'function' ? sgArtist(song) : (song.artist || 'Suno Pesme'))}</span><span>${escapeHtml(song.album || 'Singl')}</span><span>${escapeHtml(song.genre || '—')}</span><span>${typeof formatDuration === 'function' ? formatDuration(song.duration) : song.duration || '—'}</span><span>${escapeHtml(song.bpm || '—')}</span><span>${escapeHtml(song.key_signature || song.key || '—')}</span><span>${escapeHtml(typeof formatDate === 'function' ? formatDate(song.created_at).slice(0, 10) : String(song.created_at || '').slice(0, 10))}</span><button type="button" class="sg-row-menu">⋮</button></article>`).join('') : '<div class="sg-empty">NEMA PESAMA KOJE ODGOVARAJU FILTERIMA</div>';
    all('.sg-tech-row', target).forEach((row) => {
      const song = state.songs.find((item) => String(item.id) === String(row.dataset.songId));
      row.querySelector('.sg-row-play')?.addEventListener('click', (event) => { event.stopPropagation(); if (song && typeof playSong === 'function') { state.currentSong = song; playSong(song); } });
      row.querySelector('.sg-row-menu')?.addEventListener('click', (event) => { event.stopPropagation(); if (song && typeof openSong === 'function') openSong(song.id); });
      row.addEventListener('click', () => { if (song) { state.currentSong = song; if (typeof updateSignalGridChrome === 'function') updateSignalGridChrome(); } });
    });
    const footer = document.querySelector('.sg-table-footer');
    const label = footer?.querySelector('div > span');
    if (label) label.textContent = `STRANA ${sgPage + 1} OD ${maxPage + 1}`;
    const summary = byId('sgTableSummary');
    if (summary) summary.textContent = `PRIKAZANO ${rows.length} / ${filtered.length.toLocaleString('sr-RS')} PESAMA`;
  }
  function configureSignalGridControls() {
    const viewButtons = all('.sg-filter-row > button');
    viewButtons.forEach((button, index) => {
      enable(button, ['Kompaktan prikaz', 'Tabelarni prikaz', 'Prošireni prikaz'][index] || 'Promeni prikaz');
      button.id ||= `sgViewMode${index + 1}`;
      bindOnce(button, 'spsSgViewBound', () => {
        sgViewMode = index;
        viewButtons.forEach((b, i) => b.classList.toggle('active', i === index));
        const table = document.querySelector('.sg-tech-table');
        if (table) {
          table.classList.toggle('sps-compact-view', index === 0);
          table.classList.toggle('sps-roomy-view', index === 2);
        }
      });
    });

    const pager = all('.sg-table-footer button');
    if (pager.length >= 2) {
      const [prev, next] = pager;
      prev.id ||= 'sgPagePrev'; next.id ||= 'sgPageNext';
      enable(prev, 'Prethodna strana'); enable(next, 'Sledeća strana');
      bindOnce(prev, 'spsSgPageBound', () => { sgPage -= 1; renderSignalPage(); });
      bindOnce(next, 'spsSgPageBound', () => { sgPage += 1; renderSignalPage(); });
      ['sgTableSearch', 'sgGenreFilter', 'sgArtistFilter', 'sgAlbumFilter', 'sgSortFilter'].forEach((id) => {
        const el = byId(id); if (!el || el.dataset.spsPageReset === '1') return;
        el.dataset.spsPageReset = '1';
        el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => { sgPage = 0; setTimeout(renderSignalPage, 0); });
      });
    }

    const nAButtons = all('.sg-bpm-readout button[disabled]');
    if (nAButtons.length >= 2) {
      const [sync, tempo] = nAButtons;
      sync.id ||= 'sgSyncRateBtn'; tempo.id ||= 'sgTempoCycleBtn';
      enable(sync, 'Vrati reprodukciju na 1.00×');
      enable(tempo, 'Promeni brzinu reprodukcije');
      sync.textContent = '1.00×';
      tempo.textContent = 'TEMPO';
      bindOnce(sync, 'spsSgRateBound', () => {
        const audio = byId('audioPlayer'); if (audio) audio.playbackRate = 1;
        if (byId('brTempoSlider')) byId('brTempoSlider').value = '1';
        if (byId('brTempoValue')) byId('brTempoValue').textContent = '1.00×';
        notify('Brzina reprodukcije vraćena na 1.00×.', 'success');
      });
      bindOnce(tempo, 'spsSgRateBound', () => {
        const audio = byId('audioPlayer'); if (!audio) return;
        const rates = [0.75, 1, 1.25, 1.5, 2];
        const index = rates.findIndex((rate) => Math.abs(rate - audio.playbackRate) < 0.02);
        const rate = rates[(index + 1 + rates.length) % rates.length];
        audio.playbackRate = rate;
        sync.textContent = `${rate.toFixed(2)}×`;
      });
    }

    try {
      if (typeof renderSignalRows === 'function') renderSignalRows = renderSignalPage;
    } catch (_) {}
    setTimeout(renderSignalPage, 0);
  }

  function boot() {
    enableNotificationButtons();
    enableBroadcastMenus();
    configureBroadcastAudioControls();
    configureLabelControls();
    configureVinylViewControls();
    configureSignalGridControls();

    const stillDisabled = all('button[disabled], input[disabled]').filter((element) => !element.matches('[aria-hidden="true"]'));
    stillDisabled.forEach((element, index) => {
      // A disabled control must not masquerade as a working feature. Keep only controls
      // that are genuinely availability-gated and label them explicitly.
      if (!element.title) element.title = 'Kontrola trenutno nije dostupna zbog nedostupnog ulaza ili uređaja.';
      element.dataset.spsAvailabilityGated = '1';
      element.id ||= `spsAvailabilityGated${index + 1}`;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
