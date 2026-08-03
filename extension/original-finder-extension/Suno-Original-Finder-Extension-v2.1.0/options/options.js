(() => {
  'use strict';

  const Core = globalThis.SPSCore;
  const $ = (id) => document.getElementById(id);

  const boolIds = [
    'enabled',
    'autoAnalyze',
    'autoAnalyzeOwnedOnly',
    'autoAnalyzeUnknownChannel',
    'autoEnsureIndex',
    'analyzeCandidates',
    'deepAnalysis',
    'detectMultiple',
    'showWatchCard',
    'showShortsCard',
    'compactCard',
    'showScores',
    'showSegments',
    'followPlayback'
  ];

  const numIds = [
    'cacheTtlMinutes',
    'candidateLimit',
    'maxSongsPerVideo',
    'pollIntervalMs',
    'taskTimeoutMinutes'
  ];

  const send = (message) => new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, message: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });

  function fill(settings) {
    const merged = Core.mergeSettings(settings);
    $('apiBase').value = merged.apiBase;
    $('programBase').value = merged.programBase;
    boolIds.forEach((id) => {
      $(id).checked = Boolean(merged[id]);
    });
    numIds.forEach((id) => {
      $(id).value = merged[id];
    });
    $('cardPositionShorts').value = merged.cardPositionShorts;
  }

  function read() {
    const patch = {
      apiBase: $('apiBase').value,
      programBase: $('programBase').value,
      cardPositionShorts: $('cardPositionShorts').value
    };
    boolIds.forEach((id) => {
      patch[id] = $(id).checked;
    });
    numIds.forEach((id) => {
      patch[id] = Number($(id).value);
    });
    return Core.mergeSettings(patch);
  }

  function setStatus(kind, title, details = '') {
    const box = $('statusBox');
    box.className = `notice${kind ? ` ${kind}` : ''}`;
    box.replaceChildren();

    const strong = document.createElement('b');
    strong.textContent = title;
    box.appendChild(strong);

    if (details) {
      box.appendChild(document.createElement('br'));
      box.appendChild(document.createTextNode(details));
    }
  }

  async function test(force = true) {
    const result = await send({ type: 'PROGRAM_STATUS', force });
    const dot = $('statusDot');

    if (result?.ok) {
      dot.className = `status-dot ${result.locked ? 'locked' : 'online'}`;
      const title = result.locked
        ? 'PROGRAM JE POKRENUT, ALI ZAKLJUČAN'
        : 'VEZA JE ISPRAVNA';
      const lib = result.library || {};
      const details = `Program ${String(result.programVersion || '—')} · Bridge ${String(result.bridgeVersion || '—')} · biblioteka ${Number(lib.songs_total || 0)} · indeksirano ${Number(lib.songs_indexed || 0)} · povezani kanali ${Array.isArray(result.channels) ? result.channels.length : 0}`;
      setStatus(result.locked ? 'warn' : '', title, details);
      return;
    }

    dot.className = 'status-dot offline';
    setStatus('error', String(result?.message || 'Program nije dostupan.'));
  }

  async function load() {
    const result = await send({ type: 'GET_SETTINGS' });
    fill(result?.settings || Core.DEFAULT_SETTINGS);
    await test(false);
  }

  $('saveBtn').addEventListener('click', async () => {
    const result = await send({ type: 'SAVE_SETTINGS', patch: read() });
    if (!result?.ok && !result?.settings) {
      setStatus('error', String(result?.message || 'Podešavanja nisu sačuvana.'));
      return;
    }
    fill(result.settings);
    setStatus('', 'Podešavanja su sačuvana.');
  });

  $('testBtn').addEventListener('click', () => test(true));
  $('resetBtn').addEventListener('click', () => fill(Core.DEFAULT_SETTINGS));

  $('clearCacheBtn').addEventListener('click', async () => {
    const result = await send({ type: 'CLEAR_CACHE' });
    setStatus(result?.ok === false ? 'error' : '', result?.message || 'Keš rezultata je očišćen.');
  });

  $('exportBtn').addEventListener('click', async () => {
    const result = await send({ type: 'EXPORT_DATA' });
    if (!result?.data) {
      setStatus('error', result?.message || 'Izvoz nije uspeo.');
      return;
    }

    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `suno-original-finder-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  });

  $('importFile').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      const result = await send({
        type: 'IMPORT_SETTINGS',
        settings: data.settings || data
      });
      if (!result?.settings) {
        throw new Error(result?.message || 'Uvoz nije uspeo.');
      }
      fill(result.settings);
      setStatus('', 'Podešavanja su uvezena.');
    } catch (error) {
      setStatus('error', `JSON nije ispravan: ${error.message}`);
    } finally {
      event.target.value = '';
    }
  });

  load();
})();
