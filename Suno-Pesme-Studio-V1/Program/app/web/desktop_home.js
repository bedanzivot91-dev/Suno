/* Suno Pesme Studio V1 - prominent account controls on the home view. */
(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }
  function clickExisting(id) {
    var el = byId(id);
    if (el) { el.click(); return true; }
    return false;
  }

  function statusConnected(kind) {
    if (kind === 'suno') {
      var dot = byId('sgHomeSunoDot');
      return !!(dot && dot.classList.contains('on'));
    }
    var ydot = byId('sgHomeYoutubeDot');
    return !!(ydot && ydot.classList.contains('on'));
  }

  function refresh() {
    var suno = byId('spsHomeSunoLogin');
    var youtube = byId('spsHomeYoutubeLogin');
    if (suno) {
      var on = statusConnected('suno');
      suno.classList.toggle('connected', on);
      suno.textContent = on ? 'SUNO POVEZAN' : 'POVEŽI SUNO NALOG';
    }
    if (youtube) {
      var yon = statusConnected('youtube');
      youtube.classList.toggle('connected', yon);
      youtube.textContent = yon ? 'YOUTUBE POVEZAN' : 'POVEŽI YOUTUBE NALOG';
    }
  }

  function mount() {
    if (byId('spsHomeLoginPanel')) { refresh(); return; }
    var home = byId('view-home');
    if (!home) return;

    var panel = document.createElement('section');
    panel.id = 'spsHomeLoginPanel';
    panel.className = 'sps-home-login-panel';
    panel.setAttribute('aria-label', 'Povezivanje naloga');
    panel.innerHTML =
      '<article class="sps-home-login-card">' +
        '<div class="sps-home-login-icon">S</div>' +
        '<div class="sps-home-login-copy"><strong>Suno nalog</strong><span>Prijava, biblioteka, Workspaces i Studio Projects.</span></div>' +
        '<button id="spsHomeSunoLogin" class="sps-home-login-action" type="button">POVEŽI SUNO NALOG</button>' +
      '</article>' +
      '<article class="sps-home-login-card">' +
        '<div class="sps-home-login-icon">▶</div>' +
        '<div class="sps-home-login-copy"><strong>YouTube nalog</strong><span>Poveži Google/YouTube nalog za kanal i YouTube alate.</span></div>' +
        '<button id="spsHomeYoutubeLogin" class="sps-home-login-action" type="button">POVEŽI YOUTUBE NALOG</button>' +
      '</article>';

    home.insertBefore(panel, home.firstChild);

    byId('spsHomeSunoLogin').addEventListener('click', function () {
      if (!clickExisting('sgHomeConnectSunoBtn')) {
        if (!clickExisting('connectBtn')) {
          var nav = document.querySelector('[data-sg-view="import"],[data-view="import"],[data-br-view="import"]');
          if (nav) nav.click();
        }
      }
      setTimeout(refresh, 300);
    });

    byId('spsHomeYoutubeLogin').addEventListener('click', function () {
      if (!clickExisting('sgHomeConnectYoutubeBtn')) {
        var nav = document.querySelector('[data-sg-view="tools"],[data-view="tools"],[data-br-view="tools"]');
        if (nav) nav.click();
      }
      setTimeout(refresh, 300);
    });

    refresh();
    window.setInterval(refresh, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
