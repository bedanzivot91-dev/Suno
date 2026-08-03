(() => {
  'use strict';

  const Core = globalThis.SPSCore;
  const HOST_ID = 'sps-original-finder-host';
  const state = {
    context: null,
    lookup: null,
    settings: Core.mergeSettings(),
    channels: [],
    phase: 'idle',
    message: '',
    task: null,
    pipeline: null,
    hidden: false,
    expanded: false,
    activeItemIndex: -1,
    displayItemIndex: 0,
    lastVideoId: '',
    lastAutoAttempt: new Map(),
    navTimer: null,
    pollTimer: null,
    host: null,
    shadow: null
  };

  const shadowCss = `
    :host{all:initial;contain:content;font-family:Segoe UI,Arial,sans-serif;color:#ece9df}
    *{box-sizing:border-box}
    button,a{font:inherit}
    .wrap{position:relative;isolation:isolate;width:100%;max-width:760px;margin:10px 0 4px;color:#ece9df}
    .wrap.shorts{max-width:390px;margin:0;filter:drop-shadow(0 10px 20px rgba(0,0,0,.55))}
    .card{position:relative;overflow:hidden;border:1px solid #474747;border-radius:4px;background:
      linear-gradient(90deg,transparent 0 97%,rgba(255,255,255,.025) 97% 100%),
      repeating-linear-gradient(0deg,rgba(255,255,255,.018) 0 1px,transparent 1px 4px),
      #121212;box-shadow:inset 0 0 0 1px #050505,0 5px 18px rgba(0,0,0,.38)}
    .card:before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.32;background:
      radial-gradient(circle at 12% 16%,rgba(255,255,255,.18) 0 1px,transparent 2px),
      radial-gradient(circle at 82% 66%,rgba(255,255,255,.1) 0 1px,transparent 2px),
      linear-gradient(104deg,transparent 0 48%,rgba(255,255,255,.025) 49%,transparent 50%)}
    .tape{position:absolute;height:9px;top:-3px;width:94px;opacity:.95;transform:rotate(-2deg);background:#1c67d8;box-shadow:0 1px 0 rgba(255,255,255,.13)}
    .tape.red{right:22px;left:auto;background:#cf3030;transform:rotate(1.5deg)}
    .head{position:relative;display:flex;align-items:center;gap:10px;padding:10px 12px 8px;border-bottom:1px solid #2d2d2d;background:linear-gradient(180deg,#202020,#141414)}
    .cassette{width:42px;height:28px;border:2px solid #2d73df;background:#0a0a0a;border-radius:3px;position:relative;flex:none;box-shadow:inset 0 0 0 2px #171717}
    .cassette:before,.cassette:after{content:"";position:absolute;top:7px;width:8px;height:8px;border:2px solid #c7c7c7;border-radius:50%;background:#151515}
    .cassette:before{left:6px}.cassette:after{right:6px}
    .cassette i{position:absolute;left:9px;right:9px;bottom:3px;height:4px;background:#d9d9d9;clip-path:polygon(10% 0,90% 0,100% 100%,0 100%)}
    .brand{min-width:0;flex:1}.brand strong{display:block;font-size:12px;letter-spacing:.12em;color:#fff;text-transform:uppercase}.brand span{display:block;font-size:10px;color:#8db8ff;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .status{font-size:9px;font-weight:800;letter-spacing:.09em;padding:5px 7px;border:1px solid #3f3f3f;background:#1c1c1c;color:#cfcfcf;white-space:nowrap}
    .status.success{border-color:#27664d;color:#75e6b2}.status.warning{border-color:#7d651d;color:#ffd563}.status.danger{border-color:#7b2c2c;color:#ff8d8d}.status.info{border-color:#2a518b;color:#82b4ff}
    .body{position:relative;padding:10px 12px 12px}.paper{position:relative;padding:10px 11px;background:#ddd8cd;color:#111;clip-path:polygon(0 3%,2% 0,6% 2%,10% 0,15% 2%,20% 0,27% 2%,33% 0,40% 2%,47% 0,55% 2%,61% 0,67% 2%,74% 0,81% 2%,88% 0,94% 2%,100% 0,99% 98%,94% 100%,87% 98%,80% 100%,73% 98%,65% 100%,58% 98%,50% 100%,43% 98%,35% 100%,27% 98%,20% 100%,12% 98%,6% 100%,0 98%);box-shadow:0 3px 10px rgba(0,0,0,.25)}
    .paper:after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.28;background:repeating-linear-gradient(0deg,transparent 0 4px,rgba(0,0,0,.035) 5px)}
    .label{position:relative;font-size:9px;font-weight:800;letter-spacing:.12em;color:#245da8;text-transform:uppercase}.title{position:relative;margin-top:3px;font-size:16px;line-height:1.18;font-weight:900;letter-spacing:.01em;word-break:break-word}.sub{position:relative;margin-top:5px;font-size:10px;line-height:1.35;color:#383838}
    .metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:9px}.metric{border:1px solid #343434;background:#171717;padding:7px 8px;min-width:0}.metric b{display:block;color:#fff;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.metric span{display:block;margin-top:2px;font-size:8px;color:#8f8f8f;letter-spacing:.06em;text-transform:uppercase}
    .progress{height:5px;background:#292929;margin-top:9px;overflow:hidden}.progress i{display:block;height:100%;background:linear-gradient(90deg,#1b62c9,#f0c126);transition:width .3s ease}
    .buttons{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}.btn{border:1px solid #3f3f3f;background:#1c1c1c;color:#e8e8e8;padding:6px 9px;font-size:10px;font-weight:700;cursor:pointer;text-transform:uppercase;letter-spacing:.045em}.btn:hover{background:#292929}.btn.primary{border-color:#2c64b6;background:#174e9c}.btn.yellow{border-color:#8e741e;background:#6f590f}.btn.red{border-color:#7e2e2e;background:#5e1f1f}.btn:disabled{opacity:.45;cursor:default}
    .details{margin-top:9px;border-top:1px dashed #484848;padding-top:8px;font-size:10px;line-height:1.45;color:#bcbcbc}.details.hidden{display:none}.details strong{color:#fff}.segments{margin-top:6px;display:flex;flex-wrap:wrap;gap:4px}.segment{padding:3px 5px;border:1px solid #35445b;background:#18202b;color:#9fc2f5;font-size:9px}
    .multi{margin-top:8px;display:grid;gap:5px}.multi-row{display:flex;align-items:center;gap:7px;padding:6px;border:1px solid #323232;background:#181818}.multi-num{width:20px;height:20px;display:grid;place-items:center;background:#1f5eb6;color:#fff;font-size:9px;font-weight:900}.multi-text{min-width:0;flex:1}.multi-text b{display:block;font-size:10px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.multi-text span{display:block;font-size:8px;color:#8d8d8d;margin-top:2px}.mini-open{border:0;background:transparent;color:#83b4ff;cursor:pointer;font-size:9px}
    .notice{padding:8px 9px;border-left:3px solid #2467c7;background:#181f2a;color:#b7cdf0;font-size:10px;line-height:1.4}.notice.error{border-color:#c03c3c;background:#261717;color:#ffb1b1}.notice.warn{border-color:#c69d1d;background:#282411;color:#ffe49a}.notice.ok{border-color:#2d9c68;background:#14251e;color:#9ce1c1}
    .close{position:absolute;right:4px;top:3px;border:0;background:transparent;color:#777;cursor:pointer;font-size:14px;z-index:3}.close:hover{color:#fff}
    .compact .body{padding-top:7px}.compact .metrics,.compact .details,.compact .multi{display:none}.compact .paper{padding:8px 10px}.compact .title{font-size:13px}.compact .buttons{margin-top:7px}
    @media(max-width:520px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric:last-child{grid-column:1/-1}.head{padding-right:8px}.status{display:none}.title{font-size:14px}.btn{padding:6px 7px}}
  `;

  function send(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) resolve({ ok: false, code: 'RUNTIME_ERROR', message: chrome.runtime.lastError.message });
        else resolve(response || { ok: false, code: 'NO_RESPONSE', message: 'Extension nije odgovorio.' });
      });
    });
  }

  function activeShortRenderer() {
    return document.querySelector('ytd-reel-video-renderer[is-active]') || [...document.querySelectorAll('ytd-reel-video-renderer')].find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.height > 0 && rect.top < innerHeight * 0.3 && rect.bottom > innerHeight * 0.7;
    }) || null;
  }

  function visibleText(selectors, root = document) {
    for (const selector of selectors) {
      const nodes = root.querySelectorAll(selector);
      for (const node of nodes) {
        const text = Core.normalizeText(node.textContent || node.getAttribute('title') || '');
        const rect = node.getBoundingClientRect();
        if (text && (rect.width > 0 || rect.height > 0)) return text;
      }
    }
    return '';
  }

  function channelFromRoot(root) {
    const selectors = [
      'ytd-channel-name a[href]',
      '#channel-name a[href]',
      'a[href^="/@"]',
      'a[href^="/channel/"]',
      'a[href*="youtube.com/@"]',
      'a[href*="youtube.com/channel/"]'
    ];
    let chosen = null;
    for (const selector of selectors) {
      const nodes = root.querySelectorAll(selector);
      for (const anchor of nodes) {
        const text = Core.normalizeText(anchor.textContent || anchor.getAttribute('aria-label') || '');
        const href = anchor.getAttribute('href') || '';
        const rect = anchor.getBoundingClientRect();
        if ((text || href) && (rect.width > 0 || rect.height > 0)) { chosen = anchor; break; }
      }
      if (chosen) break;
    }
    const metaChannelId = document.querySelector('meta[itemprop="channelId"]')?.content || document.querySelector('meta[name="channelId"]')?.content || '';
    const authorMeta = document.querySelector('meta[itemprop="author"]')?.content || document.querySelector('meta[name="author"]')?.content || '';
    const canonical = document.querySelector('link[itemprop="url"]')?.href || chosen?.href || chosen?.getAttribute('href') || '';
    const href = chosen?.getAttribute('href') || canonical || '';
    const channelId = (href.match(/\/channel\/(UC[A-Za-z0-9_-]+)/) || [])[1] || metaChannelId;
    const channelHandle = (href.match(/\/(?:@[^/?#]+)/) || [])[0] || '';
    return {
      channelTitle: Core.normalizeText(chosen?.textContent || chosen?.getAttribute('aria-label') || authorMeta || ''),
      channelHandle,
      channelId: Core.normalizeText(channelId)
    };
  }

  function extractContext() {
    const videoId = Core.extractVideoId(location.href);
    if (!videoId) return null;
    const isShort = location.pathname.startsWith('/shorts/');
    const root = isShort ? (activeShortRenderer() || document) : (document.querySelector('ytd-watch-metadata') || document.querySelector('#primary-inner') || document);
    const title = isShort
      ? visibleText(['#video-title', 'h2', 'yt-shorts-video-title-view-model h2', '[id="overlay"] h2'], root)
      : visibleText(['h1 yt-formatted-string', 'h1', '#title h1', 'h1.title'], root);
    const channel = channelFromRoot(root);
    const video = isShort ? root.querySelector('video') : document.querySelector('video.html5-main-video,video');
    return {
      videoId,
      url: Core.videoUrl(videoId, isShort),
      isShort,
      title: title || Core.normalizeText(document.title.replace(/\s*-\s*YouTube\s*$/, '')),
      channelTitle: channel.channelTitle,
      channelHandle: channel.channelHandle,
      channelId: channel.channelId,
      duration: Number(video?.duration || 0),
      currentTime: Number(video?.currentTime || 0),
      capturedAt: new Date().toISOString()
    };
  }

  function ensureHost(context) {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      host.dataset.spsOriginalFinder = '1';
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = shadowCss;
      const mount = document.createElement('div');
      mount.id = 'mount';
      shadow.append(style, mount);
      state.host = host;
      state.shadow = shadow;
    } else {
      state.host = host;
      state.shadow = host.shadowRoot;
    }

    if (context.isShort) {
      if (host.parentNode !== document.body) document.body.appendChild(host);
      host.style.cssText = [
        'position:fixed',
        'z-index:2147483000',
        'width:min(390px,calc(100vw - 116px))',
        'pointer-events:auto',
        state.settings.cardPositionShorts === 'bottom-right' ? 'right:84px' : 'left:max(12px,calc(50vw - 265px))',
        'bottom:86px'
      ].join(';');
    } else {
      const anchor = document.querySelector('ytd-watch-metadata #above-the-fold') || document.querySelector('ytd-watch-metadata') || document.querySelector('#info-contents') || document.querySelector('#primary-inner');
      if (anchor && host.parentNode !== anchor) {
        const titleNode = anchor.querySelector('h1');
        if (titleNode?.parentElement) titleNode.parentElement.insertAdjacentElement('afterend', host);
        else anchor.appendChild(host);
      }
      host.style.cssText = 'display:block;position:relative;width:100%;z-index:20;pointer-events:auto';
    }
    return host;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  }

  function segmentHtml(item) {
    if (!state.settings.showSegments) return '';
    const segments = Array.isArray(item?.segments) ? item.segments.slice(0, 8) : [];
    if (!segments.length && item?.videoEnd > item?.videoStart) {
      return `<div class="segments"><span class="segment">VIDEO ${Core.formatSeconds(item.videoStart)}–${Core.formatSeconds(item.videoEnd)}</span></div>`;
    }
    if (!segments.length) return '';
    return `<div class="segments">${segments.map((segment) => {
      const start = Number(segment.video_start ?? segment.start ?? segment[0] ?? 0);
      const end = Number(segment.video_end ?? segment.end ?? segment[1] ?? 0);
      return `<span class="segment">${Core.formatSeconds(start)}–${Core.formatSeconds(end)}</span>`;
    }).join('')}</div>`;
  }

  function currentVideoElement() {
    if (!state.context) return null;
    if (state.context.isShort) return (activeShortRenderer() || document).querySelector('video');
    return document.querySelector('video.html5-main-video,video');
  }

  function updateActiveItem(forceRender = false) {
    const video = currentVideoElement();
    const items = state.lookup?.items || [];
    const next = state.settings.followPlayback && items.length > 1 ? Core.activeMatchIndex(items, Number(video?.currentTime || 0)) : -1;
    if (next !== state.activeItemIndex || forceRender) {
      state.activeItemIndex = next;
      render();
    }
  }

  function displayedItem() {
    const items = state.lookup?.items || [];
    const index = state.settings.followPlayback && state.activeItemIndex >= 0 ? state.activeItemIndex : 0;
    state.displayItemIndex = Math.min(Math.max(index, 0), Math.max(0, items.length - 1));
    return items[state.displayItemIndex] || state.lookup?.primary || null;
  }

  function creditText(item) {
    if (!item) return '';
    const parts = [`Originalna Suno pesma: ${item.songTitle}`];
    if (item.songId) parts.push(`Suno ID: ${item.songId}`);
    if (item.sunoUrl) parts.push(item.sunoUrl);
    return parts.join(' | ');
  }

  function statusTone(lookup) {
    if (state.phase === 'error') return 'danger';
    if (state.phase === 'analyzing') return 'info';
    if (lookup?.status === 'matched') return lookup.primary?.completeness?.tone || 'success';
    if (lookup?.status === 'candidate') return 'warning';
    return 'info';
  }

  function render() {
    const context = state.context;
    if (!context || !state.settings.enabled || state.hidden) {
      if (state.host) state.host.style.display = 'none';
      return;
    }
    const show = context.isShort ? state.settings.showShortsCard : state.settings.showWatchCard;
    if (!show) {
      if (state.host) state.host.style.display = 'none';
      return;
    }
    const host = ensureHost(context);
    host.style.display = 'block';
    const mount = state.shadow?.getElementById('mount');
    if (!mount) return;
    const lookup = state.lookup;
    const item = displayedItem();
    const compact = state.settings.compactCard ? 'compact' : '';
    const shorts = context.isShort ? 'shorts' : '';
    const tone = statusTone(lookup);
    const phaseLabel = state.phase === 'analyzing' ? (state.pipeline === 'indexing' ? 'INDEKSIRANJE' : 'ANALIZA U TOKU') : state.phase === 'error' ? 'GREŠKA' : item?.completeness?.label || (lookup?.status === 'none' ? 'NIJE PRONAĐENO' : 'PROVERA');

    let body = '';
    if (state.phase === 'loading') {
      body = `<div class="notice">Čitam lokalnu Suno biblioteku i tražim original za ovaj YouTube video…</div>`;
    } else if (state.phase === 'analyzing') {
      const percent = Number(state.task?.percent || 0);
      body = `<div class="notice">${escapeHtml(state.message || state.task?.message || 'Preuzimam audio i upoređujem ga sa Suno originalima.')}</div><div class="progress"><i style="width:${Math.min(100, Math.max(4, percent))}%"></i></div><div class="buttons"><button class="btn" data-action="refresh">Osveži stanje</button><button class="btn red" data-action="hide">Sakrij</button></div>`;
    } else if (state.phase === 'error') {
      const code = state.message.includes('zaključan') ? 'Program je zaključan. Otključaj ga, pa ponovi proveru.' : state.message;
      body = `<div class="notice error">${escapeHtml(code || 'Prepoznavanje nije uspelo.')}</div><div class="buttons"><button class="btn primary" data-action="retry">Pokušaj ponovo</button><button class="btn" data-action="open-app">Otvori program</button><button class="btn" data-action="hide">Sakrij</button></div>`;
    } else if (item) {
      const metrics = state.settings.showScores ? `<div class="metrics">
        <div class="metric"><b>${item.isAudioConfirmed ? Core.formatPercent(item.audioScore, 0) : Core.formatPercent(item.combinedScore, 0)}</b><span>${item.isAudioConfirmed ? 'Audio podudaranje' : 'Kandidat'}</span></div>
        <div class="metric"><b>${item.isAudioConfirmed ? Core.formatPercent(item.coveragePercent, 0) : '—'}</b><span>Pokrivenost</span></div>
        <div class="metric"><b>${escapeHtml(Core.confidenceLabel(item.confidence))}</b><span>Pouzdanost</span></div>
      </div>` : '';
      const sunoButton = item.sunoUrl ? `<button class="btn primary" data-action="open-suno">Otvori Suno original</button>` : '';
      const originalYoutube = item.originalYoutubeUrl ? `<button class="btn" data-action="open-original-youtube">Original na YouTube-u</button>` : '';
      const multiple = lookup.items.length > 1 ? `<div class="multi">${lookup.items.slice(0, 6).map((candidate, index) => {
        const playing = index === state.activeItemIndex;
        const ranges = Core.matchRanges(candidate);
        const canSeek = ranges.length && ranges[0][0] > 0.5;
        return `<div class="multi-row ${playing ? 'playing' : ''}" data-item-index="${index}"><span class="multi-num">${index + 1}</span><span class="multi-text"><b>${escapeHtml(candidate.songTitle)}</b><span class="${playing ? 'now' : ''}">${playing ? 'SVIRA SADA · ' : ''}${escapeHtml(candidate.completeness.label)} · ${Core.formatPercent(candidate.audioScore || candidate.combinedScore, 0)}</span></span>${canSeek ? `<button class="mini-open" data-seek-index="${index}">PUSTI DEO</button>` : ''}${candidate.sunoUrl ? `<button class="mini-open" data-open-index="${index}">SUNO</button>` : ''}</div>`;
      }).join('')}</div>` : '';
      body = `<div class="paper"><div class="label">${state.activeItemIndex >= 0 ? 'Suno original koji sada svira' : 'Suno original'}</div><div class="title">${escapeHtml(item.songTitle)}</div><div class="sub">${escapeHtml(item.versionType || item.recommendation || (item.isAudioConfirmed ? 'Audio potvrđeno lokalnim poređenjem.' : 'Pronađen je kandidat; audio potvrda još nije završena.'))}</div></div>${metrics}${multiple}<div class="buttons">${sunoButton}${originalYoutube}<button class="btn yellow" data-action="reanalyze">Analiziraj ponovo</button><button class="btn" data-action="copy">Kopiraj naziv</button><button class="btn" data-action="copy-credit">Kopiraj kredit</button><button class="btn" data-action="details">${state.expanded ? 'Sakrij detalje' : 'Detalji'}</button></div><div class="details ${state.expanded ? '' : 'hidden'}"><strong>Suno ID:</strong> ${escapeHtml(item.songId || '—')}<br><strong>Tip:</strong> ${escapeHtml(item.versionType || item.completeness.label)}<br><strong>Obrazloženje:</strong> ${escapeHtml(item.recommendation || item.reason || '—')}${segmentHtml(item)}<div class="credit">Rezultat dolazi iz lokalne biblioteke Suno Pesme Studio.</div></div>`;
    } else {
      const ownership = Core.channelOwnership(context, state.channels);
      const note = state.settings.autoAnalyzeOwnedOnly && ownership === 'foreign'
        ? 'Video pripada drugom kanalu, zato automatska analiza nije pokrenuta.'
        : 'Original još nije pronađen. Extension će koristiti lokalni audio indeks Suno Pesme Studio.';
      body = `<div class="notice warn">${escapeHtml(note)}</div><div class="buttons"><button class="btn primary" data-action="analyze">Prepoznaj original</button><button class="btn" data-action="manual">Ručno izaberi pesmu</button><button class="btn" data-action="open-app">Otvori program</button></div>`;
    }

    mount.innerHTML = `<div class="wrap ${shorts} ${compact}"><div class="card"><span class="tape"></span><span class="tape red"></span><button class="close" data-action="hide" title="Sakrij">×</button><div class="head"><span class="cassette"><i></i></span><span class="brand"><strong>Suno Original Finder 2.1</strong><span>${escapeHtml(context.title || context.videoId)}</span></span><span class="status ${tone}">${escapeHtml(phaseLabel)}</span></div><div class="body">${body}</div></div></div>`;
    bindActions(mount);
  }

  function bindActions(mount) {
    mount.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', async () => {
      const action = button.dataset.action;
      if (action === 'hide') { state.hidden = true; render(); return; }
      if (action === 'details') { state.expanded = !state.expanded; render(); return; }
      if (action === 'open-app') { await send({ type: 'OPEN_APP' }); return; }
      const selected = state.lookup?.items?.[state.displayItemIndex] || state.lookup?.primary;
      if (action === 'open-suno' && selected?.sunoUrl) { await send({ type: 'OPEN_URL', url: selected.sunoUrl }); return; }
      if (action === 'open-original-youtube' && selected?.originalYoutubeUrl) { await send({ type: 'OPEN_URL', url: selected.originalYoutubeUrl }); return; }
      if (action === 'copy' && selected?.songTitle) {
        await navigator.clipboard.writeText(selected.songTitle).catch(() => {});
        const old = button.textContent; button.textContent = 'Kopirano'; setTimeout(() => { button.textContent = old; }, 1200); return;
      }
      if (action === 'copy-credit' && selected) {
        await navigator.clipboard.writeText(creditText(selected)).catch(() => {});
        const old = button.textContent; button.textContent = 'Kredit kopiran'; setTimeout(() => { button.textContent = old; }, 1200); return;
      }
      if (action === 'manual') { await send({ type: 'SET_ACTIVE_CONTEXT', context: state.context }); await send({ type: 'OPEN_SIDE_PANEL' }); return; }
      if (action === 'analyze' || action === 'reanalyze' || action === 'retry') { await startAnalysis({ force: action !== 'analyze' }); return; }
      if (action === 'refresh') { await refreshLookup(true); return; }
    }));
    mount.querySelectorAll('[data-open-index]').forEach((button) => button.addEventListener('click', async () => {
      const item = state.lookup?.items?.[Number(button.dataset.openIndex || 0)];
      if (item?.sunoUrl) await send({ type: 'OPEN_URL', url: item.sunoUrl });
    }));
    mount.querySelectorAll('[data-seek-index]').forEach((button) => button.addEventListener('click', () => {
      const item = state.lookup?.items?.[Number(button.dataset.seekIndex || 0)];
      const range = Core.matchRanges(item)[0];
      const video = currentVideoElement();
      if (video && range) { video.currentTime = Math.max(0, range[0]); video.play().catch(() => {}); }
    }));
  }

  async function loadSettingsAndChannels() {
    const settingsResponse = await send({ type: 'GET_SETTINGS' });
    if (settingsResponse?.ok) state.settings = Core.mergeSettings(settingsResponse.settings);
    const channelsResponse = await send({ type: 'GET_CHANNELS' });
    if (channelsResponse?.ok) state.channels = channelsResponse.channels || [];
  }

  async function refreshLookup(force = false) {
    if (!state.context) return;
    state.phase = 'loading';
    state.message = '';
    render();
    const response = await send({ type: 'LOOKUP_VIDEO', context: state.context, force });
    if (!response?.ok) {
      state.phase = 'error';
      state.message = response?.message || 'Program nije dostupan.';
      render();
      await send({ type: 'SET_BADGE', state: response?.code === 'PROGRAM_OFFLINE' ? 'offline' : 'error' });
      return;
    }
    state.lookup = response;
    state.phase = 'ready';
    render();
    if (shouldAutoAnalyze(response)) await startAnalysis({ automatic: true, force: response.status === 'candidate' });
  }

  function shouldAutoAnalyze(lookup) {
    if (!state.settings.autoAnalyze || !state.context || state.phase === 'analyzing') return false;
    if (lookup?.status === 'matched') return false;
    if (lookup?.status === 'candidate' && !state.settings.analyzeCandidates) return false;
    const ownership = Core.channelOwnership(state.context, state.channels);
    if (state.settings.autoAnalyzeOwnedOnly && ownership === 'foreign') return false;
    if (state.settings.autoAnalyzeOwnedOnly && ownership === 'unknown' && !state.settings.autoAnalyzeUnknownChannel) return false;
    const last = state.lastAutoAttempt.get(state.context.videoId) || 0;
    return Date.now() - last > 30 * 60 * 1000;
  }

  function friendlyError(response) {
    const code = String(response?.code || '');
    const messages = {
      BRIDGE_REQUIRED: 'Suno Pesme Studio radi, ali lokalni Bridge nije pokrenut. Instaliraj ili pokreni Bridge iz novog extension paketa.',
      PROGRAM_AND_BRIDGE_OFFLINE: 'Pokreni Suno Pesme Studio, otključaj ga, zatim pokreni lokalni Bridge.',
      BRIDGE_OFFLINE: 'Lokalni Bridge nije pokrenut.',
      PROGRAM_LOCKED: 'Program je zaključan. Otključaj ga PIN-om.',
      PROGRAM_OFFLINE: 'Suno Pesme Studio nije pokrenut. Pokreni program pa pokušaj ponovo.',
      LIBRARY_EMPTY: 'Suno biblioteka je prazna. Prvo učitaj pesme u programu.',
      NO_AUDIO_SOURCES: 'Pesme postoje, ali nemaju audio fajl ili važeći Suno audio link.',
      INDEX_REQUIRED: 'Audio indeks nije napravljen. Pokreni indeksiranje.'
    };
    return messages[code] || response?.message || 'Audio analiza nije pokrenuta.';
  }

  async function startAnalysis(options = {}) {
    if (!state.context) return;
    state.lastAutoAttempt.set(state.context.videoId, Date.now());
    state.phase = 'analyzing';
    state.task = null;
    state.pipeline = null;
    state.message = options.automatic ? 'Automatski pripremam lokalnu biblioteku…' : 'Pripremam lokalnu audio proveru…';
    render();
    const response = await send({
      type: 'ANALYZE_VIDEO',
      context: state.context,
      options: {
        force: Boolean(options.force),
        skipIndex: Boolean(options.skipIndex),
        deep: state.settings.deepAnalysis,
        candidateLimit: state.settings.candidateLimit,
        detectMultiple: state.settings.detectMultiple,
        maxSongsPerVideo: state.settings.maxSongsPerVideo,
        reuseCache: state.settings.reuseCache
      }
    });
    if (!response?.ok) {
      state.phase = 'error';
      state.message = friendlyError(response);
      render();
      await send({ type: 'SET_BADGE', state: response?.code === 'PROGRAM_OFFLINE' ? 'offline' : 'error' });
      return;
    }
    state.task = response.task || null;
    state.pipeline = response.stage || 'analyzing';
    state.message = response.stage === 'indexing'
      ? 'Prvo pravim audio indeks tvojih Suno pesama. Posle toga automatski analiziram video.'
      : (response.message || 'Preuzimam zvuk videa i upoređujem ga sa indeksiranim pesmama.');
    render();
    pollTask(state.task?.id || '', {
      afterIndex: response.stage === 'indexing',
      force: Boolean(options.force),
      automatic: Boolean(options.automatic)
    });
  }

  function stopPolling() {
    if (state.pollTimer) clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }

  async function pollTask(expectedId, pipeline = {}) {
    stopPolling();
    const started = Date.now();
    const maxMs = state.settings.taskTimeoutMinutes * 60_000;
    const loop = async () => {
      if (!state.context || Date.now() - started > maxMs) {
        state.phase = 'error'; state.message = 'Zadatak traje duže od dozvoljenog vremena. Otvori program i proveri njegov dnevnik.'; render();
        await send({ type: 'SET_BADGE', state: 'error' });
        return;
      }
      const response = await send({ type: 'TASK_STATUS' });
      if (!response?.ok) {
        state.phase = 'error'; state.message = friendlyError(response); render();
        await send({ type: 'SET_BADGE', state: response?.code === 'PROGRAM_OFFLINE' ? 'offline' : 'error' });
        return;
      }
      const task = response.task;
      if (task && (!expectedId || String(task.id) === String(expectedId))) {
        state.task = task;
        state.phase = task.status === 'running' ? 'analyzing' : state.phase;
        render();
        if (task.status === 'done' || task.status === 'partial') {
          if (pipeline.afterIndex) {
            state.message = 'Audio indeks je spreman. Pokrećem prepoznavanje videa…';
            render();
            await startAnalysis({ force: pipeline.force, automatic: pipeline.automatic, skipIndex: true });
          } else {
            await refreshLookup(true);
          }
          return;
        }
        if (task.status === 'error' || task.status === 'cancelled') {
          state.phase = 'error'; state.message = task.message || 'Zadatak nije završen.'; render();
          await send({ type: 'SET_BADGE', state: 'error' });
          return;
        }
      }
      state.pollTimer = setTimeout(loop, state.settings.pollIntervalMs);
    };
    await loop();
  }

  async function syncContext(force = false) {
    const context = extractContext();
    if (!context) {
      if (state.host) state.host.style.display = 'none';
      return;
    }
    const changed = context.videoId !== state.lastVideoId;
    state.context = context;
    await send({ type: 'SET_ACTIVE_CONTEXT', context });
    if (changed || force) {
      stopPolling();
      state.lastVideoId = context.videoId;
      state.lookup = null;
      state.hidden = false;
      state.expanded = false;
      state.activeItemIndex = -1;
      state.displayItemIndex = 0;
      await refreshLookup(false);
    } else {
      ensureHost(context);
      render();
    }
  }

  function scheduleSync(delay = 180) {
    clearTimeout(state.navTimer);
    state.navTimer = setTimeout(() => syncContext(false), delay);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      if (message?.type === 'SPS_FORCE_ANALYZE') { state.hidden = false; await startAnalysis({ force: true }); return { ok: true }; }
      if (message?.type === 'SPS_TOGGLE_CARD') { state.hidden = !state.hidden; render(); return { ok: true, hidden: state.hidden }; }
      if (message?.type === 'SPS_REFRESH') { await syncContext(true); return { ok: true }; }
      if (message?.type === 'SPS_EXTERNAL_ANALYSIS_STARTED') { if (state.context?.videoId) state.lastAutoAttempt.set(state.context.videoId, Date.now()); state.hidden = false; state.phase = 'analyzing'; state.task = message.task || null; state.pipeline = message.stage || 'analyzing'; state.message = message.stage === 'indexing' ? 'Prvo se pravi audio indeks, zatim se automatski pokreće prepoznavanje.' : (message.message || 'Audio analiza je pokrenuta…'); render(); pollTask(state.task?.id || '', { afterIndex: message.stage === 'indexing', force: Boolean(message.options?.force), automatic: false }); return { ok: true }; }
      if (message?.type === 'SPS_GET_CONTEXT') return { ok: true, context: state.context || extractContext() };
      if (message?.type === 'SPS_GET_VIEW_STATE') return { ok: true, context: state.context, lookup: state.lookup, phase: state.phase, task: state.task, hidden: state.hidden };
      return { ok: false, message: 'Nepoznata komanda.' };
    })().then(sendResponse).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings?.newValue) {
      state.settings = Core.mergeSettings(changes.settings.newValue);
      render();
    }
  });

  document.addEventListener('yt-navigate-finish', () => scheduleSync(250), true);
  document.addEventListener('yt-page-data-updated', () => scheduleSync(250), true);
  window.addEventListener('popstate', () => scheduleSync(150));
  window.addEventListener('hashchange', () => scheduleSync(150));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(120); });

  const observer = new MutationObserver(() => scheduleSync(350));
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => {
    const id = Core.extractVideoId(location.href);
    if (id && id !== state.lastVideoId) scheduleSync(50);
    else if (state.context && (!state.host || !state.host.isConnected)) scheduleSync(50);
  }, 1500);

  setInterval(() => {
    if (state.lookup?.items?.length > 1 && state.phase === 'ready') updateActiveItem(false);
  }, 1000);

  (async () => {
    await loadSettingsAndChannels();
    await syncContext(true);
  })();
})();
