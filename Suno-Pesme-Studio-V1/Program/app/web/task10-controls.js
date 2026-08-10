(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);

  function stepRecent(direction) {
    const box = byId('vlRecentCards');
    if (!box) return;
    const card = box.querySelector(':scope > *');
    const amount = Math.max(260, card ? card.getBoundingClientRect().width + 18 : Math.floor(box.clientWidth * 0.8));
    box.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }

  async function playRandomSong() {
    try {
      if (typeof state === 'undefined' || !Array.isArray(state.songs) || !state.songs.length) {
        if (typeof toast === 'function') toast('Biblioteka je prazna.', 'warning');
        return;
      }
      let pool = state.songs.filter((song) => song && song.id);
      if (state.currentSong && pool.length > 1) pool = pool.filter((song) => song.id !== state.currentSong.id);
      const song = pool[Math.floor(Math.random() * pool.length)];
      if (!song) return;
      if (typeof openSong === 'function') await openSong(song.id, true);
      else if (typeof playSong === 'function') await playSong(song);
    } catch (error) {
      if (typeof toast === 'function') toast(error?.message || String(error), 'error');
    }
  }

  function setRepeat(enabled) {
    if (typeof state !== 'undefined') state.repeat = Boolean(enabled);
    const canonical = byId('repeatBtn');
    if (canonical) canonical.classList.toggle('active', Boolean(enabled));
    for (const id of ['vlRepeatBtn', 'sgRepeatBtn']) {
      const button = byId(id);
      if (button) {
        button.classList.toggle('active', Boolean(enabled));
        button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      }
    }
  }

  function toggleRepeat() {
    const next = !(typeof state !== 'undefined' && state.repeat);
    setRepeat(next);
  }

  function bindOnce(id, handler) {
    const button = byId(id);
    if (!button || button.dataset.spsTask10Bound === '1') return;
    button.dataset.spsTask10Bound = '1';
    button.addEventListener('click', handler);
  }

  function bind() {
    bindOnce('vlRecentPrev', () => stepRecent(-1));
    bindOnce('vlRecentNext', () => stepRecent(1));
    bindOnce('vlShuffleBtn', playRandomSong);
    bindOnce('vlRepeatBtn', toggleRepeat);
    bindOnce('sgRepeatBtn', toggleRepeat);
    setRepeat(typeof state !== 'undefined' && Boolean(state.repeat));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
