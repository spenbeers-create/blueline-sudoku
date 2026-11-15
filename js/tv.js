/* TV mode: a big screen (a TV's web browser, or a laptop plugged into the TV) shows
   the game while everyone plays on their own phone. The screen makes a party room,
   shows the code and a QR code, lets people pick settings, then runs the show.
   Each game adds its big-screen view to window.BLTVGames:
     { title, minPlayers, defaults(), settingsRows(st), setSetting(st, key, v),
       lobbyNote(st), start(code), unlock(), mount(el, ctx) -> { update(room), destroy() } } */
(() => {
  'use strict';
  const BL = window.BL, O = window.Online, esc = BL.esc;
  const GAMES = window.BLTVGames || (window.BLTVGames = {});
  const $ = (s, el = document) => el.querySelector(s);
  const COLORS = ['#6F9BFF', '#FF8A5B', '#4CC38A', '#F5C451', '#C38BFF', '#FF6FA8', '#4DD0E1', '#B9C4D6'];
  const QR_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
  let tv = null;

  const screen = () => $('#tv');
  const main = () => $('#tv-main');
  const joinUrl = code => `${location.origin}${location.pathname}#room-${code}`;
  const soundOn = () => BL.store.get('tvSound', true) !== false;

  function loadQr() {
    if (window.qrcode) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = QR_SRC; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function qrSvg(text) {
    const q = window.qrcode(0, 'M');
    q.addData(text); q.make();
    const n = q.getModuleCount(), m = 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    return `<svg viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" shape-rendering="crispEdges" role="img" aria-label="QR code that opens this room"><rect width="100%" height="100%" fill="#FFFFFF"/><path d="${d}" fill="#0A101B"/></svg>`;
  }
  // One read of a room without keeping a listener.
  function peek(code) {
    return new Promise(resolve => {
      let done = false, off = null;
      off = O.watchRoom(code, v => { if (done) return; done = true; setTimeout(() => off && off(), 0); resolve(v); });
    });
  }

  const ICONS = {
    sound: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    mute: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    exit: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  const icon = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;

  function shell() {
    screen().innerHTML = `
      <div class="tv-wrap">
        <header class="tv-top">
          <span class="tv-brand">Blueline</span>
          <span class="tv-title">${esc(tv.game.title)}</span>
          <span class="tv-info" id="tv-info"></span>
          <span class="tv-tag" id="tv-tag" hidden>Room <b></b></span>
          <span class="tv-tools">
            <button type="button" class="tv-icon" data-a="sound" aria-label="Sound">${icon(soundOn() ? 'sound' : 'mute')}</button>
            <button type="button" class="tv-icon" data-a="full" aria-label="Full screen">${icon('full')}</button>
            <button type="button" class="tv-icon" data-a="exit" aria-label="Exit TV mode">${icon('exit')}</button>
          </span>
        </header>
        <main class="tv-main" id="tv-main"></main>
      </div>`;
    const top = $('.tv-top', screen());
    $('[data-a=sound]', top).onclick = e => { BL.store.set('tvSound', !soundOn()); e.currentTarget.innerHTML = icon(soundOn() ? 'sound' : 'mute'); };
    $('[data-a=full]', top).onclick = () => {
      try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) { /* not supported */ }
    };
    $('[data-a=exit]', top).onclick = () => askExit(false);
  }

  async function open(type, api) {
    const game = GAMES[type];
    if (!game) return;
    if (!O.configured()) { BL.toast('Online play isn’t set up yet.'); return; }
    close();
    const me = tv = { type, game, api, code: null, room: undefined, stop: null, view: null, qr: '', wake: null };
    BL.show('tv');
    try { if (!(history.state && history.state.s === 'sub2')) history.pushState({ s: 'sub2' }, ''); } catch (e) { /* ignore */ }
    shell();
    main().innerHTML = '<div class="tv-wait"><span class="spinner"></span><span>Setting up the room…</span></div>';
    try {
      await O.ready();
      let code = null;
      const prev = BL.store.get('tvRoom', null);
      if (prev && prev.type === type) { const r = await peek(prev.code); if (r && r.screen === O.me()) code = prev.code; }
      if (!code) code = await O.createRoom('TV', game.defaults(), true, type, game.maxPlayers || 8);
      if (tv !== me) { O.leaveRoom(code, true, true).catch(() => {}); return; }
      tv.code = code;
      BL.store.set('tvRoom', { type, code });
      const tag = $('#tv-tag');
      tag.hidden = false; $('b', tag).textContent = code;
      tv.stop = O.watchRoom(code, onRoom);
      awake();
      loadQr().then(() => { if (tv === me) { tv.qr = qrSvg(joinUrl(code)); if (tv.room && tv.room.status === 'lobby') paint(); } }).catch(() => {});
    } catch (e) {
      if (tv !== me) return;
      const rules = e && /permission/i.test(e.message || '');
      main().innerHTML = `<div class="tv-wait"><b>Couldn’t make a room</b><span>${rules ? 'Party rooms need the “rooms” rule in the Firebase database rules.' : 'Check this screen’s internet connection.'}</span><button type="button" class="btn primary big" data-a="retry">Try again</button></div>`;
      $('[data-a=retry]', main()).onclick = () => open(type, api);
    }
  }

  function onRoom(r) {
    if (!tv) return;
    tv.room = r;
    if (!r) {
      unmount();
      BL.store.set('tvRoom', null);
      main().innerHTML = '<div class="tv-wait"><b>The room closed</b><button type="button" class="btn primary big" data-a="new">Make a new room</button></div>';
      $('[data-a=new]', main()).onclick = () => open(tv.type, tv.api);
      return;
    }
    paint();
  }

  function paint() {
    const r = tv.room;
    if (!r) return;
    if (r.status === 'lobby') { unmount(); lobby(r); return; }
    if (!tv.view) {
      main().innerHTML = '';
      tv.view = tv.game.mount(main(), {
        code: tv.code, colors: COLORS, now: O.now, soundOn,
        info: text => { const el = $('#tv-info'); if (el) el.textContent = text; },
        move: fn => O.roomMove(tv.code, fn),
        patch: fields => O.patchRoom(tv.code, fields),
        finish: winner => window.BLRooms.finish(tv.code, winner),
        rematch: () => window.BLRooms.rematch(tv.code),
        playAgain: () => window.BLRooms.toLobby(tv.code),
        exit: () => askExit(false),
      });
    }
    tv.view.update(r);
  }
  function unmount() {
    if (tv && tv.view) { try { tv.view.destroy(); } catch (e) { /* ignore */ } tv.view = null; }
    const info = $('#tv-info');
    if (info) info.textContent = '';
  }

  function lobby(r) {
    const g = tv.game, players = Object.entries(r.players || {}), here = r.here || {}, st = r.settings || {};
    // Keep the remote's focus on the same button when the list changes.
    const f = document.activeElement;
    let keep = null;
    if (f && main().contains(f)) keep = f.dataset.v != null ? `[data-k="${f.parentNode.dataset.k}"] [data-v="${f.dataset.v}"]` : f.classList.contains('tv-go') ? '.tv-go' : null;
    const enough = players.length >= g.minPlayers;
    main().innerHTML = `
      <div class="tv-lobby">
        <section class="tv-join">
          <p class="tv-k">Join on your phone</p>
          <ol class="tv-steps"><li><span>Open <b>Blueline</b></span></li><li><span>Tap <b>${esc(g.title)}</b>, then <b>Join a room</b></span></li><li><span>Type this code</span></li></ol>
          <div class="tv-code" aria-label="Room code">${esc(tv.code)}</div>
          ${tv.qr ? `<div class="tv-qr">${tv.qr}<span>Or point your phone’s camera here</span></div>` : ''}
        </section>
        <section class="tv-side">
          <h2>Players <small>${players.length} of ${g.maxPlayers || 8}</small></h2>
          <div class="tv-plist">${players.length ? players.map(([uid, p], i) => `<div class="tv-pl${here[uid] ? '' : ' away'}" style="--c:${COLORS[i % COLORS.length]}"><i>${esc((p.name || '?')[0].toUpperCase())}</i><b>${esc(p.name || 'Player')}</b></div>`).join('') : '<p class="tv-empty">Waiting for the first player…</p>'}</div>
          <div class="tv-settings">${g.settingsRows(st).map(row => `<div class="tv-row"><span>${esc(row.label)}</span><div class="seg tv-seg" role="radiogroup" aria-label="${esc(row.label)}" data-k="${row.key}">${row.options.map(([v, t]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${String(row.value) === String(v)}">${esc(t)}</button>`).join('')}</div></div>`).join('')}</div>
          <p class="tv-note">${esc(g.lobbyNote(st))}</p>
          <button type="button" class="btn primary big tv-go" ${enough ? '' : 'disabled'}>${enough ? `Start with ${players.length} player${players.length === 1 ? '' : 's'}` : 'Waiting for players…'}</button>
        </section>
      </div>`;
    main().querySelectorAll('.tv-seg').forEach(box => {
      box.onclick = e => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        O.patchRoom(tv.code, { settings: g.setSetting(st, box.dataset.k, b.dataset.v) }).catch(() => BL.toast('Couldn’t reach the room.'));
      };
    });
    $('.tv-go', main()).onclick = () => { g.unlock && g.unlock(); g.start(tv.code); };
    if (keep) { const el = $(keep, main()); if (el) el.focus(); }
  }

  function askExit(fromBack) {
    if (!tv) return;
    const busy = tv.room && Object.keys(tv.room.players || {}).length;
    if (fromBack) { try { history.pushState({ s: 'sub2' }, ''); } catch (e) { /* ignore */ } }
    if (!busy) { exit(); return; }
    BL.openSheet(`<h2 id="sheet-title">End TV mode?</h2><p class="lede">This closes room ${esc(tv.code)} for everyone in it.</p>
      <div class="actions"><button type="button" class="btn danger big" data-a="yes">End the room</button><button type="button" class="btn" data-a="no">Keep playing</button></div>`, {
      onMount: b => { $('[data-a=yes]', b).onclick = () => { BL.closeSheet(); exit(); }; $('[data-a=no]', b).onclick = () => BL.closeSheet(); },
    });
  }
  function exit() {
    const code = tv && tv.code;
    close();
    if (code) { O.leaveRoom(code, true, true).catch(() => {}); BL.store.set('tvRoom', null); }
    if (history.state && history.state.s === 'sub2') BL.popQuiet();
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* ignore */ }
    BL.show('menu');
  }
  function close() {
    if (!tv) return;
    if (tv.stop) tv.stop();
    unmount();
    if (tv.wake) { try { tv.wake.release(); } catch (e) { /* ignore */ } }
    tv = null;
    screen().innerHTML = '';
  }

  // Keep the screen from dimming while it's on.
  async function awake() {
    if (!tv || tv.wake || !('wakeLock' in navigator)) return;
    try { tv.wake = await navigator.wakeLock.request('screen'); tv.wake.addEventListener('release', () => { if (tv) tv.wake = null; }); } catch (e) { /* not allowed */ }
  }
  document.addEventListener('visibilitychange', () => { if (tv && !document.hidden) awake(); });
  document.addEventListener('bl:tvback', () => askExit(true));
  // Browsers only allow sound after a tap or key press on the page.
  screen().addEventListener('pointerdown', () => { if (tv && tv.game.unlock) tv.game.unlock(); });
  screen().addEventListener('keydown', () => { if (tv && tv.game.unlock) tv.game.unlock(); });

  window.BLTV = { open, colors: COLORS };
})();
