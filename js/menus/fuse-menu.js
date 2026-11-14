/* Short Fuse menu: two ways to play (Pass the fuse, Last Word), practice alone,
   bots, your partner, party rooms on everyone's phones, TV mode, settings,
   stats, and the phone lobby for rooms. */
(() => {
  'use strict';
  const BL = window.BL, esc = BL.esc, F = window.BLGames.fuse, O = window.Online;
  const MENUS = window.BLMenus || (window.BLMenus = {});
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const on = (root, sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
  const appUrl = () => location.origin + location.pathname;
  const myName = () => (BL.settings.name || '').trim() || 'Player';

  const VARIANTS = {
    pass: { name: 'Pass the fuse', blurb: 'Take turns. Type a word with the letters to pass the fuse on. Whoever holds it when it blows loses a life.' },
    last: { name: 'Last Word', blurb: 'Everyone types at once. The last one to get a word in loses a life.' },
  };
  const SKILLS = { 1: 'Rookie', 2: 'Regular', 3: 'Shark' };
  const BOT_NAMES = ['Pip', 'Juno', 'Rex', 'Mabel', 'Ozzy', 'Tilly', 'Bruno'];
  const prefs = () => Object.assign({ variant: 'pass', bots: 2, skill: 2, lives: 3, difficulty: 'normal', speed: 'normal', sound: true }, BL.store.get('fusePrefs', {}));
  const savePrefs = p => BL.store.set('fusePrefs', p);
  const stats = () => Object.assign({ best: 0, words: 0, longest: '', bots: { p: 0, w: 0 }, rooms: { p: 0, w: 0 }, counted: {} }, BL.store.get('fuseStats', {}));
  const settingsFrom = p => ({
    variant: p.variant, lives: p.lives, maxLives: Math.max(3, p.lives), difficulty: p.difficulty,
    minFuse: { short: 6000, normal: 9000, long: 12000 }[p.speed] || 9000,
    limit: { short: 8000, normal: 12000, long: 16000 }[p.speed] || 12000,
  });
  let api = null;

  function seg(id, opts, val) {
    return `<div class="seg" role="radiogroup" id="${id}">${opts.map(([v, t]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${String(v) === String(val)}">${t}</button>`).join('')}</div>`;
  }

  // ------------------------------------------------------------ results
  function record(m) {
    const s = m.state, st = stats(), key = m.room ? `room:${m.room}:${s.seed}` : `local:${s.seed}`;
    if (st.counted[key]) return;
    st.counted[key] = 1;
    const keys = Object.keys(st.counted);
    if (keys.length > 200) delete st.counted[keys[0]];
    const mineWords = s.log.filter(x => x.p === m.seat && x.w).map(x => x.w);
    st.words += mineWords.length;
    for (const w of mineWords) if (w.length > st.longest.length) st.longest = w;
    if (s.players.length === 1) st.best = Math.max(st.best, mineWords.length);
    else {
      const bucket = m.room ? st.rooms : st.bots;
      if (m.fuseBots || m.room) { bucket.p++; if (s.winner === m.seat) bucket.w++; }
    }
    BL.store.set('fuseStats', st);
  }

  function renderResult(box, m) {
    const s = m.state;
    if (!m.fuseBots && !m.room) return false;     // partner games use the standard banner
    if (!F.over(s)) { box.hidden = true; return true; }
    record(m);
    const mine = s.log.filter(x => x.p === m.seat && x.w).length;
    let title, text;
    if (s.players.length === 1) { title = `${mine} word${mine === 1 ? '' : 's'}`; text = `Best run: ${stats().best}. The fuse got you in round ${s.round}.`; }
    else if (s.winner === 'draw') { title = 'Nobody made it'; text = 'Everyone ran out of lives together.'; }
    else if (s.winner === m.seat) { title = 'You win!'; text = `Last one standing after ${s.round} round${s.round === 1 ? '' : 's'}. You played ${mine} word${mine === 1 ? '' : 's'}.`; }
    else { title = `${s.players[s.winner].name} wins`; text = `You played ${mine} word${mine === 1 ? '' : 's'}.`; }
    if (m.room && m.rec && m.rec.screen) text += ' Scores are on the TV.';
    box.hidden = false;
    box.className = 'p-result';
    box.innerHTML = `<div><b>${esc(title)}</b><p>${esc(text)}</p></div>
      <div class="actions row">
        <button type="button" class="btn primary" data-a="again">${m.room ? 'Back to the room' : 'Play again'}</button>
        <button type="button" class="btn" data-a="menu">Menu</button>
      </div>`;
    on(box, '[data-a=again]', () => {
      if (m.room) { O.patchRoom(m.room, { status: 'lobby', state: null, draft: null }).catch(() => BL.toast('Couldn’t reach the room.')); return; }
      api.startFuse(m.fuseCfg);
    });
    on(box, '[data-a=menu]', () => { if (m.room) leaveRoom(m.room, false); api.back(); });
    return true;
  }

  // ------------------------------------------------------- local games
  function localGame(withBots) {
    const p = prefs();
    const players = [{ name: myName() }];
    if (withBots) {
      const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
      for (let i = 0; i < p.bots; i++) players.push({ name: names[i], bot: p.skill });
    }
    api.startFuse({ players, settings: Object.assign(settingsFrom(p), { variant: withBots ? p.variant : 'pass' }) });
  }

  // ---------------------------------------------------------- party rooms
  async function createRoom() {
    try {
      await O.ready();
      BL.openSheet('<h2 id="sheet-title">Making a room…</h2><div class="status-line"><span class="spinner"></span>One moment</div>', { locked: true });
      const code = await O.createRoom(myName(), settingsFrom(prefs()));
      lobby(code);
    } catch (e) { BL.openSheet(`<h2 id="sheet-title">Couldn’t make a room</h2><p class="status-line err">${esc(roomErr(e))}</p><div class="actions"><button type="button" class="btn" data-a="x">Close</button></div>`, { onMount: b => on(b, '[data-a=x]', () => BL.closeSheet()) }); }
  }
  function roomErr(e) {
    if (e && e.code === 'no-room') return 'No room with that code. Check it and try again.';
    if (e && e.code === 'started') return 'That game already started. Ask them to send a new room after this one.';
    if (e && e.code === 'full') return 'That room is full (8 players).';
    if (e && e.code === 'no-config') return 'Online play isn’t set up yet.';
    if (e && /permission/i.test(e.message || '')) return 'Party rooms need one more database rule. Add the “rooms” rule in Firebase, then try again.';
    return 'Couldn’t reach the server. Check your connection.';
  }
  function joinPrompt(prefill, err) {
    BL.openSheet(`
      <h2 id="sheet-title">Join a room</h2>
      <p class="lede">Type the 5-letter room code from the TV or your friend’s phone.</p>
      <input class="input code" id="rm-code" maxlength="5" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="K7P2Q" value="${esc(prefill || '')}" aria-label="Room code">
      ${err ? `<p class="status-line err">${esc(err)}</p>` : ''}
      <label class="field"><span>Your name</span><input class="input" id="rm-name" maxlength="20" value="${esc(BL.settings.name || '')}" placeholder="Your name"></label>
      <div class="actions"><button type="button" class="btn primary big" data-a="go">Join</button><button type="button" class="btn ghost" data-a="x">Cancel</button></div>`, {
      onMount: b => {
        const go = async () => {
          const c = $('#rm-code', b).value.toUpperCase().replace(/[^A-Z0-9]/g, '');
          const n = $('#rm-name', b).value.trim().slice(0, 20);
          if (n) { BL.settings.name = n; BL.saveSettings(); }
          if (c.length !== 5) { joinPrompt(c, 'Room codes have 5 letters and numbers.'); return; }
          try { await O.joinRoom(c, myName()); lobby(c); } catch (e) { joinPrompt(c, roomErr(e)); }
        };
        on(b, '[data-a=go]', go);
        $('#rm-code', b).addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        on(b, '[data-a=x]', () => BL.closeSheet());
      },
    });
  }

  // The lobby listener can fire before watchRoom returns, so each lobby gets a token
  // and a listener that arrives after its lobby ended is switched straight off.
  let stopLobby = null, lobbyToken = null;
  function endLobby() {
    lobbyToken = null;
    if (stopLobby) { stopLobby(); stopLobby = null; }
  }
  function leaveRoom(code, lobbyPhase) {
    endLobby();
    O.ready().then(() => O.leaveRoom(code, false, lobbyPhase)).catch(() => {});
  }
  function lobby(code) {
    endLobby();
    const token = lobbyToken = {};
    O.roomHere(code).catch(() => {});
    const paint = r => {
      if (lobbyToken !== token) return;
      if (!r) { BL.closeSheet(); BL.toast('The room closed.'); endLobby(); return; }
      const me = O.me();
      if (r.status === 'playing' && Array.isArray(r.seats) && r.seats.includes(me)) {
        endLobby();
        BL.closeSheet();
        api.openRoom(code, r.seats.indexOf(me));
        return;
      }
      const players = Object.entries(r.players || {});
      const st = r.settings || {}, need = r.screen ? 1 : 2;
      BL.openSheet(`
        <h2 id="sheet-title">Room ${esc(code)}</h2>
        <p class="lede">${esc((VARIANTS[st.variant] || VARIANTS.pass).name)} · ${st.lives || 3} ${(st.lives || 3) === 1 ? 'life' : 'lives'} · ${esc(st.difficulty || 'normal')} letters${r.screen ? ' · on the TV' : ''}</p>
        <div class="room-players">${players.map(([uid, p]) => `<span class="room-p${uid === me ? ' me' : ''}"><i>${esc((p.name || '?')[0].toUpperCase())}</i>${esc(p.name || 'Player')}${uid === me ? ' (you)' : ''}</span>`).join('') || '<span class="muted">Nobody yet</span>'}</div>
        <div class="actions row"><button type="button" class="btn" data-a="share">Invite</button><button type="button" class="btn" data-a="copy">Copy code</button></div>
        <div class="actions">
          <button type="button" class="btn primary big" data-a="start" ${players.length < need ? 'disabled' : ''}>${players.length < need ? 'Waiting for players…' : `Start with ${players.length} player${players.length === 1 ? '' : 's'}`}</button>
          <button type="button" class="btn ghost" data-a="leave">Leave room</button>
        </div>
        <p class="small muted">${r.screen ? 'Watch the TV. Anyone can start, from here or on the TV.' : 'Anyone in the room can start once 2 or more have joined.'}</p>`, {
        locked: true,
        onMount: b => {
          on(b, '[data-a=share]', () => BL.shareText(`Join my Short Fuse room in Blueline: ${code}\n${appUrl()}#room-${code}`));
          on(b, '[data-a=copy]', () => BL.copyText(code));
          on(b, '[data-a=start]', () => startRoom(code));
          on(b, '[data-a=leave]', () => { leaveRoom(code, true); BL.closeSheet(); });
        },
      });
    };
    O.ready().then(() => {
      const off = O.watchRoom(code, paint);
      if (lobbyToken === token) stopLobby = off; else off();
    }).catch(e => BL.toast(roomErr(e)));
  }
  // Anyone in the room (or the TV) can start it.
  async function startRoom(code) {
    try {
      await O.updateRoom(code, r => {
        if (r.status !== 'lobby') return undefined;
        const entries = Object.entries(r.players || {});
        if (entries.length < (r.screen ? 1 : 2)) return undefined;
        entries.sort(() => Math.random() - 0.5);
        const st = r.settings || {};
        let s = F.create({ seed: O.code(8), players: entries.map(([, p]) => ({ name: p.name || 'Player' })), lives: st.lives, maxLives: st.maxLives, difficulty: st.difficulty, minFuse: st.minFuse, limit: st.limit, variant: st.variant });
        s = F.apply(s, { start: true, at: O.now() }, 0);
        r.seats = entries.map(([uid]) => uid);
        r.state = JSON.stringify(s);
        r.status = 'playing';
        r.draft = null;
        return r;
      });
    } catch (e) { BL.toast(roomErr(e)); }
  }

  function howTo() {
    BL.openSheet(`
      <h2 id="sheet-title">How to play</h2>
      <p class="lede"><b>Pass the fuse.</b> When it’s your turn, type any real word that contains the letters on screen, in that order and together. “ING” works with “singer”. That passes the fuse on. Each fuse has a secret length and keeps burning between turns. Whoever holds it when it blows loses a life.</p>
      <p class="lede"><b>Last Word.</b> Everyone gets the letters at once and types a word as fast as they can. The last one in loses a life, and so does anyone still without a word when time runs out.</p>
      <p class="lede"><b>Bonus life.</b> Use every letter of the alphabet except J, Q, X and Z across your words to win a life back. The letters under your box show what you still need.</p>
      <p class="lede"><b>No repeats.</b> A word can only be played once per game.</p>
      <div class="actions"><button type="button" class="btn primary big" data-a="x">Got it</button></div>`, { onMount: b => on(b, '[data-a=x]', () => BL.closeSheet()) });
  }

  // ----------------------------------------------------------------- menu
  function render(el) {
    const p = prefs(), st = stats(), partner = api.partner();
    const v = VARIANTS[p.variant];
    el.innerHTML = `
      <section class="panel fuse-hero">
        <div class="seg" role="radiogroup" id="fm-variant">${Object.entries(VARIANTS).map(([k, x]) => `<button type="button" role="radio" data-v="${k}" aria-checked="${k === p.variant}">${x.name}</button>`).join('')}</div>
        <p class="pick-note">${esc(v.blurb)}</p>
        <button type="button" class="btn ghost" id="fm-how">How to play</button>
      </section>

      <section class="panel">
        <h2>Party room</h2>
        <p class="pick-note">Everyone plays on their own phone, up to 8 players. Share the code or a link.</p>
        <div class="actions row"><button type="button" class="btn primary" id="fm-create">Create a room</button><button type="button" class="btn" id="fm-join">Join a room</button></div>
      </section>

      <button type="button" class="tile tv-tile" id="fm-tv">
        <span class="tile-k">TV mode</span>
        <span class="tile-t">Put it on the big screen</span>
        <span class="tile-m">Open Blueline in a TV’s web browser, or on a laptop plugged into the TV, and tap here. Everyone joins with their phones.</span>
      </button>

      <section class="panel">
        <h2>Play the bots</h2>
        <div class="pick-row"><span class="pick-label">Bots</span>${seg('fm-bots', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], p.bots)}</div>
        <div class="pick-row"><span class="pick-label">Skill</span>${seg('fm-skill', Object.entries(SKILLS), p.skill)}</div>
        <button type="button" class="btn primary big" id="fm-bots-go">Play ${esc(v.name)} with ${p.bots} bot${p.bots > 1 ? 's' : ''}</button>
        <button type="button" class="btn" id="fm-solo">Practice alone (survival)</button>
      </section>

      ${partner ? `<section class="panel"><h2>Play ${esc(partner.name)}</h2><p class="pick-note">Just you two, live. ${esc(partner.name)} gets an alert to join.</p><button type="button" class="btn" id="fm-partner">Challenge ${esc(partner.name)}</button></section>` : ''}

      <section class="panel">
        <h2>Game settings</h2>
        <p class="small muted">Used for bots, practice and rooms you create.</p>
        <div class="pick-row"><span class="pick-label">Lives</span>${seg('fm-lives', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], p.lives)}</div>
        <div class="pick-row"><span class="pick-label">Letters</span>${seg('fm-diff', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], p.difficulty)}</div>
        <div class="pick-row"><span class="pick-label">Timer</span>${seg('fm-speed', [['short', 'Short'], ['normal', 'Normal'], ['long', 'Long']], p.speed)}</div>
        <div class="setting"><label for="fm-sound"><b>Sounds</b><small>A pop when the fuse passes and a boom when it blows.</small></label><span class="switch"><input type="checkbox" id="fm-sound" ${p.sound ? 'checked' : ''}><span></span></span></div>
      </section>

      <section class="panel">
        <h2>Your stats</h2>
        <div class="facts">
          <div class="fact"><span>Best run</span><b>${st.best}</b></div>
          <div class="fact"><span>Vs bots</span><b>${st.bots.w}/${st.bots.p}</b></div>
          <div class="fact"><span>Rooms</span><b>${st.rooms.w}/${st.rooms.p}</b></div>
        </div>
        <p class="small muted">${st.words} words played${st.longest ? ` · longest: ${esc(st.longest.toUpperCase())}` : ''}</p>
      </section>`;

    const segH = (id, key, num) => { const box = $('#' + id, el); if (!box) return; box.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; const q = prefs(); q[key] = num ? +b.dataset.v : b.dataset.v; savePrefs(q); render(el); }; };
    segH('fm-variant', 'variant'); segH('fm-bots', 'bots', true); segH('fm-skill', 'skill', true);
    segH('fm-lives', 'lives', true); segH('fm-diff', 'difficulty'); segH('fm-speed', 'speed');
    $('#fm-sound', el).onchange = e => { const q = prefs(); q.sound = e.target.checked; savePrefs(q); };
    on(el, '#fm-how', howTo);
    on(el, '#fm-create', createRoom);
    on(el, '#fm-join', () => joinPrompt(''));
    on(el, '#fm-tv', () => api.startTv());
    on(el, '#fm-bots-go', () => localGame(true));
    on(el, '#fm-solo', () => localGame(false));
    on(el, '#fm-partner', () => api.startOnline('fuse', { variant: prefs().variant, settings: settingsFrom(prefs()) }));
  }

  MENUS.fuse = {
    title: 'Short Fuse',
    render(el, a) { api = a; render(el); },
    renderResult(box, m) { return renderResult(box, m); },
    lobby(code, a) { api = a; lobby(code); },
    join(code, a) { api = a; joinPrompt(code); },
    startRoom, settingsFrom, prefs, VARIANTS,
  };
})();
