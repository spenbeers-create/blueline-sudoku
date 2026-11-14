/* The game hub: partner linking, the games list, whose turn it is, and the match
   controller that runs every two-player game online, on one phone, or solo. */
(() => {
  'use strict';
  const BL = window.BL, O = window.Online, GAMES = window.BLGames, VIEWS = window.BLViews;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = BL.esc;
  const on = (root, sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };

  const CATALOG = [
    { id: 'sudoku', name: 'Sudoku', cat: 'Puzzles', blurb: 'Six levels, big grids, Killer and Diagonal.', players: 'Solo or race' },
    { id: 'fuse', cat: 'Words', players: '2 players, live' },
    { id: 'words', cat: 'Words', players: '2 players' },
    { id: 'four', cat: 'Board', players: '2 players' },
    { id: 'chess', cat: 'Board', players: '2 players' },
    { id: 'eights', cat: 'Cards', players: '2 players' },
  ].map(c => Object.assign({ name: GAMES[c.id] && GAMES[c.id].name, blurb: GAMES[c.id] && GAMES[c.id].blurb }, c));
  const COMING = ['Checkers', 'Dots and Boxes', 'Sea Battle', 'Go Fish', 'Gin Rummy', 'Speed', 'Hangman', 'Word Tiles', 'Minesweeper race', '2048 race', 'Memory Match'];

  let partner = BL.store.get('partner', null);   // { pid, uid, name }
  let games = {};                                 // gid -> record
  let presence = {};                              // uid -> { at, game }
  let net = O.configured() ? 'connecting' : 'no-config';
  let match = null;
  let stopGames = null, stopHere = null;
  const seen = {};                                // gid -> last 'updated' we toasted about
  let firstLoad = true;

  const myName = () => (BL.settings.name || '').trim() || 'You';
  const partnerName = () => (partner && partner.name) || 'Partner';
  const mySeat = rec => (rec.seats && rec.seats[1] === O.me() ? 1 : 0);
  const parse = s => { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch (e) { return null; } };
  const gameName = t => (t === 'sudoku' ? 'Sudoku' : (GAMES[t] && GAMES[t].name) || t);

  // ------------------------------------------------------------- connection
  async function connect() {
    if (!O.configured()) { net = 'no-config'; renderHub(); return; }
    net = 'connecting';
    try {
      await O.ready();
      net = 'ready';
      const list = await O.partners();
      if (list.length) {
        const keep = (partner && list.find(p => p.pid === partner.pid)) || list[0];
        setPartner({ pid: keep.pid, uid: keep.uid, name: keep.name });
        if (BL.settings.name && keep.myName !== BL.settings.name) O.setName(keep.pid, BL.settings.name).catch(() => {});
      } else if (partner) setPartner(null);
    } catch (e) {
      net = e && e.code === 'no-config' ? 'no-config' : 'offline';
    }
    renderHub();
  }

  function setPartner(p) {
    if (stopGames) { stopGames(); stopGames = null; }
    if (stopHere) { stopHere(); stopHere = null; }
    partner = p;
    BL.store.set('partner', p);
    games = {};
    if (!p) { renderHub(); return; }
    stopGames = O.watchGames(p.pid, v => { games = v; onGames(); });
    stopHere = O.watchHere(p.pid, v => { presence = v; renderHub(); if (match && !$("#play").hidden) renderMatch(); });
    O.here(p.pid, match && match.gid ? match.gid : '').catch(() => {});
    tidy();
  }

  // Keep the shared list short: drop finished games beyond the newest 15.
  function tidy() {
    setTimeout(() => {
      if (!partner) return;
      const over = Object.entries(games).filter(([, r]) => r.status === 'over').sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0));
      over.slice(15).forEach(([gid]) => O.removeGame(partner.pid, gid).catch(() => {}));
    }, 4000);
  }

  function onGames() {
    for (const [gid, r] of Object.entries(games)) {
      const prev = seen[gid];
      seen[gid] = r.updated;
      if (firstLoad || prev === r.updated) continue;
      if (match && match.gid === gid) continue;
      if (r.by === O.me()) continue;
      if (prev === undefined) {
        const live = (GAMES[r.type] && GAMES[r.type].live) || r.mode === 'live';
        const what = r.mode === 'live' ? `live ${gameName(r.type)}${r.tc ? ` (${r.tc})` : ''}` : gameName(r.type);
        const msg = r.type === 'words' && r.mode === 'custom' ? `${partnerName()} sent you a word to guess`
          : r.type === 'words' && r.mode === 'live' ? `${partnerName()} wants a Word Duel race now`
          : live ? `${partnerName()} wants to play ${what} now` : r.type === 'words' ? `${partnerName()} challenged you to Word Duel` : `${partnerName()} started ${what}`;
        BL.toast(msg, { label: live ? 'Join' : 'Open', run: () => openOnline(gid) });
        continue;
      }
      if (r.status === 'active' && isMyMove(r)) {
        BL.toast(`Your turn in ${gameName(r.type)}`, { label: 'Open', run: () => openOnline(gid) });
      } else if (r.status === 'over' && r.by !== O.me()) {
        BL.toast(`${gameName(r.type)} with ${partnerName()} is finished`, { label: 'See', run: () => openOnline(gid) });
      }
    }
    for (const [gid, r] of Object.entries(games)) if (r.type === 'chess' && r.status === 'over' && r.winner != null) recordChessOnline(gid, r);
    for (const [gid, r] of Object.entries(games)) if (r.type === 'words' && r.status === 'over' && r.winner != null && window.BLMenus.words) window.BLMenus.words.recordDuel(gid, r, mySeat(r));
    firstLoad = false;
    renderHub();
    renderMenu();
    if (match && match.gid && games[match.gid]) applyRecord(games[match.gid]);
    if (match && match.gid && !games[match.gid] && net === 'ready') { BL.toast('That game was removed.'); closeMatch(); }
  }

  function recordChessOnline(gid, r) {
    const st = Object.assign({ bot: {}, partner: { w: 0, l: 0, d: 0 }, counted: {} }, BL.store.get('chessStats', {}));
    if (st.counted[gid]) return;
    st.counted[gid] = 1;
    const k = r.winner === 'draw' ? 'd' : r.winner === mySeat(r) ? 'w' : 'l';
    st.partner[k] = (st.partner[k] || 0) + 1;
    BL.store.set('chessStats', st);
  }

  function isMyMove(r) {
    const seat = mySeat(r);
    if (r.kind === 'race') { const p = parse(r.prog && r.prog[seat]); return !(p && p.done); }
    return r.turn === seat;
  }

  // -------------------------------------------------------------------- hub
  function partnerOnline() {
    if (!partner) return null;
    const p = presence[partner.uid];
    return p && p.game !== 'away' ? p : null;
  }

  function renderHub() {
    if ($('#hub').hidden) return;
    $('#hub-today').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const card = $('#pair-card');
    const pOn = partnerOnline();
    if (net === 'no-config') {
      card.innerHTML = `<div class="pair-text"><b>Online play is being set up</b><span>Everything works on this phone in the meantime.</span></div>`;
    } else if (!partner) {
      card.innerHTML = `<div class="pair-text"><b>Play together from anywhere</b><span>Link your phones once and every game works across Wi-Fi or mobile data.</span></div>
        <button type="button" class="btn primary" id="pair-link">Link with your partner</button>`;
      on(card, '#pair-link', openLink);
    } else {
      const status = net === 'offline' ? 'You’re offline. Games sync when you’re back.' : pOn ? (pOn.game && games[pOn.game] ? `Playing ${gameName(games[pOn.game].type)} now` : 'Online now') : 'Not in the app right now';
      card.innerHTML = `<button type="button" class="pair-me" id="pair-open" aria-label="Partner settings">
          <span class="avatar a1">${esc(myName()[0].toUpperCase())}</span><span class="avatar a2">${esc(partnerName()[0].toUpperCase())}</span>
          <span class="pair-text"><b>You and ${esc(partnerName())}</b><span><i class="pres-dot ${pOn ? 'on' : ''}"></i>${esc(status)}</span></span>
        </button>`;
      on(card, '#pair-open', openPartner);
    }

    const entries = Object.entries(games).sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0));
    const mine = entries.filter(([, r]) => r.status === 'active' && isMyMove(r));
    const theirs = entries.filter(([, r]) => r.status === 'active' && !isMyMove(r));
    const done = entries.filter(([, r]) => r.status === 'over').slice(0, 5);
    const row = ([gid, r], label, cls = '') => `<button type="button" class="turn-row ${cls}" data-gid="${gid}"><span class="gi gi-${r.type}" aria-hidden="true"></span><span><b>${esc(gameName(r.type))}</b><small>${esc(label)}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`;
    let lists = '';
    const modeTag = r => (r.mode === 'live' ? `Live${r.tc ? ' ' + r.tc : ''} · ` : '');
    const raceLabel = r => (r.type === 'words' && r.mode === 'custom' ? `${partnerName()} sent you a word` : r.mode === 'live' ? `${partnerName()} wants to race` : `${partnerName()} challenged you`);
    if (mine.length) lists += `<section class="turns"><h2>Your turn</h2>${mine.map(e => row(e, e[1].kind === 'race' ? raceLabel(e[1]) : `${modeTag(e[1])}Your move against ${partnerName()}`, 'hot')).join('')}</section>`;
    if (theirs.length) lists += `<section class="turns"><h2>Waiting on ${esc(partnerName())}</h2>${theirs.map(e => row(e, e[1].kind === 'race' ? 'You’re done. Waiting for their turn' : `${partnerName()}’s move`)).join('')}</section>`;
    if (done.length) lists += `<section class="turns"><h2>Recent</h2>${done.map(e => row(e, resultText(e[1]))).join('')}</section>`;
    $('#hub-lists').innerHTML = lists;
    $$('#hub-lists [data-gid]').forEach(b => { b.onclick = () => openOnline(b.dataset.gid); });

    const counts = {};
    for (const [, r] of mine) counts[r.type] = (counts[r.type] || 0) + 1;
    $('#hub-games').innerHTML = CATALOG.map(c => `
      <button type="button" class="game-tile" data-game="${c.id}">
        <span class="gi gi-${c.id}" aria-hidden="true"></span>
        <span class="gt-text"><b>${esc(c.name)}</b><small>${esc(c.cat)} · ${esc(c.players)}</small></span>
        ${counts[c.id] ? `<span class="gt-badge" aria-label="${counts[c.id]} waiting on you">${counts[c.id]}</span>` : ''}
      </button>`).join('');
    $$('#hub-games [data-game]').forEach(b => { b.onclick = () => openGameSheet(b.dataset.game); });
    $('#hub-coming').textContent = `Coming next: ${COMING.join(', ')}.`;
  }

  function resultText(r) {
    const seat = mySeat(r);
    if (r.winner === 'draw') return 'Draw';
    if (r.winner === seat) return r.resigned != null ? `${partnerName()} resigned. You won` : 'You won';
    if (r.winner === 1 - seat) return r.resigned != null ? 'You resigned' : `${partnerName()} won`;
    return 'Finished';
  }

  document.addEventListener('bl:show', e => {
    if (e.detail === 'hub') { renderHub(); if (partner && net === 'ready') O.here(partner.pid, '').catch(() => {}); }
  });
  $('#hub-settings').onclick = () => BL.openSettings();

  // ---------------------------------------------------------------- linking
  function needName(next) {
    if ((BL.settings.name || '').trim()) { next(); return; }
    BL.openSheet(`
      <h2 id="sheet-title">What should we call you?</h2>
      <p class="lede">Your partner sees this name in games.</p>
      <input class="input" id="nm" maxlength="20" autocomplete="nickname" placeholder="Your name">
      <div class="actions"><button type="button" class="btn primary big" data-a="ok">Continue</button></div>`, {
      onMount: b => {
        const inp = $('#nm', b);
        const go = () => { const v = inp.value.trim().slice(0, 20); if (!v) { inp.focus(); return; } BL.settings.name = v; BL.saveSettings(); BL.closeSheet(); next(); };
        on(b, '[data-a=ok]', go);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      },
    });
  }

  function openLink() {
    if (net === 'no-config') { BL.toast('Online play isn’t set up yet.'); return; }
    needName(() => {
      BL.openSheet(`
        <h2 id="sheet-title">Link with your partner</h2>
        <p class="lede">Do this once. One of you shows a code, the other types it in.</p>
        <div class="choice">
          <button type="button" data-a="show"><b>Show my code</b><small>They type it on their phone</small></button>
          <button type="button" data-a="enter"><b>Enter their code</b><small>They show you theirs</small></button>
        </div>
        <div class="actions"><button type="button" class="btn ghost" data-a="close">Not now</button></div>`, {
        onMount: b => {
          on(b, '[data-a=show]', showCode);
          on(b, '[data-a=enter]', () => enterCode(''));
          on(b, '[data-a=close]', () => BL.closeSheet());
        },
      });
    });
  }

  async function showCode() {
    BL.openSheet(`<h2 id="sheet-title">Your link code</h2><div class="status-line"><span class="spinner"></span>Getting a code…</div>`, { locked: true });
    try {
      const p = await O.invite(myName(), c => {
        BL.openSheet(`
          <h2 id="sheet-title">Your link code</h2>
          <p class="lede">On their phone: open Blueline, tap Link with your partner, then Enter their code.</p>
          <div class="race-code" aria-label="Link code">${esc(c)}</div>
          <div class="actions row"><button type="button" class="btn primary" data-a="share">Share code</button><button type="button" class="btn" data-a="copy">Copy</button></div>
          <div class="status-line"><span class="spinner"></span>Waiting for them to enter it…</div>
          <div class="actions"><button type="button" class="btn ghost" data-a="cancel">Cancel</button></div>`, {
          locked: true,
          onMount: b => {
            on(b, '[data-a=share]', () => BL.shareText(`Link up with me in Blueline: ${c}\n${location.origin + location.pathname}#link-${c}`));
            on(b, '[data-a=copy]', () => BL.copyText(c));
            on(b, '[data-a=cancel]', () => { O.invite.cancel && O.invite.cancel(); BL.closeSheet(); });
          },
        });
      });
      linked(p);
    } catch (e) {
      if (e && e.code === 'cancelled') return;
      BL.openSheet(`<h2 id="sheet-title">Couldn’t make a code</h2><p class="status-line err">${esc(netMsg(e))}</p><div class="actions"><button type="button" class="btn" data-a="close">Close</button></div>`, { onMount: b => on(b, '[data-a=close]', () => BL.closeSheet()) });
    }
  }

  function enterCode(prefill, error) {
    needName(() => {
      BL.openSheet(`
        <h2 id="sheet-title">Enter their code</h2>
        <p class="lede">Type the 6-character code from your partner’s phone.</p>
        <input class="input code" id="lk" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABC234" value="${esc(prefill || '')}" aria-label="Link code">
        ${error ? `<p class="status-line err">${esc(error)}</p>` : ''}
        <div class="actions"><button type="button" class="btn primary big" data-a="go">Link up</button><button type="button" class="btn ghost" data-a="close">Cancel</button></div>`, {
        onMount: b => {
          const inp = $('#lk', b);
          const go = async () => {
            const c = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (c.length !== 6) { enterCode(c, 'Link codes have 6 letters and numbers.'); return; }
            BL.openSheet(`<h2 id="sheet-title">Linking…</h2><div class="status-line"><span class="spinner"></span>Connecting to ${esc(c)}…</div>`, { locked: true });
            try { linked(await O.accept(c, myName())); }
            catch (e) { enterCode(c, e && e.code === 'no-invite' ? 'No code like that is waiting. Ask them to show it again.' : e && e.code === 'self' ? 'That’s your own code. Enter it on the other phone.' : netMsg(e)); }
          };
          on(b, '[data-a=go]', go);
          inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
          on(b, '[data-a=close]', () => BL.closeSheet());
        },
      });
    });
  }

  function linked(p) {
    setPartner(p);
    BL.openSheet(`
      <h2 id="sheet-title">You’re linked with ${esc(p.name)}</h2>
      <p class="lede">Start any game and it shows up on their phone. Games wait for each other, and update live when you’re both in.</p>
      <div class="actions"><button type="button" class="btn primary big" data-a="ok">Let’s play</button></div>`, { onMount: b => on(b, '[data-a=ok]', () => BL.closeSheet()) });
    renderHub();
  }

  function openPartner() {
    BL.openSheet(`
      <h2 id="sheet-title">You and ${esc(partnerName())}</h2>
      <p class="lede">Your games with ${esc(partnerName())} are saved online, so they’re there on both phones.</p>
      <label class="field"><span>Your name</span><input class="input" id="pn" maxlength="20" value="${esc(BL.settings.name || '')}" placeholder="Your name"></label>
      <div class="actions">
        <button type="button" class="btn primary" data-a="save">Save</button>
        <button type="button" class="btn danger" data-a="unlink">Unlink this phone</button>
      </div>`, {
      onMount: b => {
        on(b, '[data-a=save]', () => {
          const v = $('#pn', b).value.trim().slice(0, 20);
          if (v) { BL.settings.name = v; BL.saveSettings(); if (partner) O.setName(partner.pid, v).catch(() => {}); }
          BL.closeSheet(); renderHub();
        });
        on(b, '[data-a=unlink]', () => {
          BL.openSheet(`<h2 id="sheet-title">Unlink this phone?</h2><p class="lede">You’ll stop seeing your shared games here. You can link again any time with a new code.</p>
            <div class="actions"><button type="button" class="btn danger big" data-a="yes">Unlink</button><button type="button" class="btn" data-a="no">Keep linked</button></div>`, {
            onMount: bb => {
              on(bb, '[data-a=yes]', async () => { const pid = partner && partner.pid; setPartner(null); BL.closeSheet(); if (pid) O.unlink(pid).catch(() => {}); });
              on(bb, '[data-a=no]', openPartner);
            },
          });
        });
      },
    });
  }

  function netMsg(e) {
    if (e && e.code === 'no-config') return 'Online play isn’t set up yet.';
    if (e && (e.code === 'PERMISSION_DENIED' || /permission/i.test(e.message || ''))) return 'The online database refused that. Check the database rules.';
    return 'Couldn’t reach the server. Check your internet connection and try again.';
  }

  // ----------------------------------------------------------- game sheets

  // ------------------------------------------------------------ game menus
  let menuId = null;
  const menuApi = {
    partner: () => partner,
    games: type => Object.entries(games).filter(([, r]) => r.type === type).sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0)),
    isMyMove: r => isMyMove(r),
    openOnline: gid => openOnline(gid, null, 'menu'),
    startOnline: (type, opts) => startOnline(type, null, opts, 'menu'),
    startBot: opts => startBot(opts),
    resumeBot: () => resumeBot(),
    startLocal: type => openLocal(type, 'menu'),
    resumeLocal: type => resumeLocal(type),
    link: () => openLink(),
    openSolo: (type, cfg) => openSolo(type, cfg),
    back: () => leave(),
  };
  function openSolo(type, cfg) {
    const g = GAMES[type];
    buildMatch(type, { solo: true, from: 'menu', soloCfg: cfg });
    match.state = cfg.state;
    match.mine = cfg.prog ? Object.assign({}, cfg.prog) : g.progress();
    if (!match.mine.started) match.mine.started = Date.now();
    renderMatch();
  }
  function openMenu(id) {
    menuId = id;
    const menu = window.BLMenus[id];
    $('#menu-title').textContent = menu.title;
    $('#menu-look').hidden = !menu.look;
    BL.show('menu');
    renderMenu();
  }
  function renderMenu() {
    if (!menuId || $('#menu').hidden) return;
    window.BLMenus[menuId].render($('#menu-body'), menuApi);
  }
  $('#menu-back').onclick = () => { menuId = null; BL.toHub(); };
  $('#menu-look').onclick = () => { const m = window.BLMenus[menuId]; if (m && m.look) m.look(renderMenu); };
  document.addEventListener('bl:show', e => { if (e.detail === 'menu') renderMenu(); });

  // ------------------------------------------------------------- chess bot
  let chessWorker = null, thinkId = 0;
  const thinkJobs = new Map();
  function chessThink(state, level, time) {
    if (!chessWorker) {
      try {
        chessWorker = new Worker('js/chess-worker.js');
        chessWorker.onmessage = e => { const j = thinkJobs.get(e.data.id); if (!j) return; thinkJobs.delete(e.data.id); e.data.ok ? j.resolve(e.data.move) : j.reject(new Error(e.data.error)); };
        chessWorker.onerror = () => { for (const j of thinkJobs.values()) j.reject(new Error('worker')); thinkJobs.clear(); chessWorker = null; };
      } catch (e) { chessWorker = null; }
    }
    if (!chessWorker) return new Promise((res, rej) => setTimeout(() => { try { res(window.ChessAI.think(state, level, time ? { time } : {})); } catch (e) { rej(e); } }, 30));
    return new Promise((resolve, reject) => { const id = ++thinkId; thinkJobs.set(id, { resolve, reject }); chessWorker.postMessage({ id, state, level, time }); });
  }
  const levelName = id => ((window.ChessAI && window.ChessAI.LEVELS.find(l => l.id === id)) || { name: 'Bot' }).name;

  function startBot({ level, seat }) {
    const g = GAMES.chess;
    buildMatch('chess', { bot: { level, seat: 1 - seat }, seat, from: 'menu', stack: [] });
    match.state = g.create({});
    saveBot();
    renderMatch();
    if (g.turn(match.state) === match.bot.seat) botMove();
  }
  function resumeBot() {
    const saved = BL.store.get('chessBot', null);
    if (!saved || !saved.state) return;
    buildMatch('chess', { bot: { level: saved.level, seat: 1 - saved.seat }, seat: saved.seat, from: 'menu', stack: [] });
    match.state = saved.state;
    renderMatch();
    if (!GAMES.chess.over(match.state) && GAMES.chess.turn(match.state) === match.bot.seat) botMove();
  }
  function saveBot() {
    if (!match || !match.bot) return;
    BL.store.set('chessBot', { level: match.bot.level, seat: match.seat, state: match.state, at: Date.now() });
  }
  async function botMove() {
    const m = match;
    if (!m || !m.bot || m.thinking) return;
    const g = m.game, before = m.state;
    if (g.over(before) || g.turn(before) !== m.bot.seat) return;
    m.thinking = true;
    renderMatch();
    const t0 = Date.now();
    let mv = null;
    try { mv = await chessThink(before, m.bot.level); } catch (e) { mv = null; }
    const wait = 450 - (Date.now() - t0);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    m.thinking = false;
    if (match !== m || m.state !== before) return;
    if (!mv || !g.legal(before, mv, m.bot.seat)) { const all = g.legalMoves(before); mv = all[Math.floor(Math.random() * all.length)]; }
    m.state = g.apply(before, mv, m.bot.seat);
    saveBot();
    renderMatch();
    if (g.over(m.state)) recordChess('bot', g.winner(m.state));
  }
  function recordChess(kind, winner, gid) {
    const st = Object.assign({ bot: {}, partner: { w: 0, l: 0, d: 0 }, counted: {} }, BL.store.get('chessStats', {}));
    const key = winner === 'draw' ? 'd' : winner === (kind === 'bot' ? match.seat : (gid && games[gid] ? mySeat(games[gid]) : 0)) ? 'w' : 'l';
    if (kind === 'bot') {
      const lv = match.bot.level;
      st.bot[lv] = st.bot[lv] || { w: 0, l: 0, d: 0 };
      st.bot[lv][key]++;
    } else {
      if (st.counted[gid]) return;
      st.counted[gid] = 1;
      st.partner[key] = (st.partner[key] || 0) + 1;
    }
    BL.store.set('chessStats', st);
  }
  function resumeLocal(type) {
    const saved = BL.store.get(type + 'Local', null);
    if (!saved || !saved.state) { openLocal(type, 'menu'); return; }
    buildMatch(type, { local: true, from: 'menu' });
    match.state = saved.state;
    renderMatch();
  }

  function openGameSheet(id) {
    if (id === 'sudoku') { BL.show('home'); return; }
    if (window.BLMenus && window.BLMenus[id]) { openMenu(id); return; }
    const g = GAMES[id];
    const active = Object.entries(games).filter(([, r]) => r.type === id && r.status === 'active');
    const race = g.kind === 'race';
    const pn = esc(partnerName());
    const onlineBtn = partner
      ? `<button type="button" class="btn primary big" data-a="online">${race ? `Challenge ${pn}` : `New game with ${pn}`}</button>`
      : `<button type="button" class="btn" data-a="link">Link with your partner to play online</button>`;
    const localBtn = race ? '<button type="button" class="btn" data-a="solo">Practice on your own</button>'
      : '<button type="button" class="btn" data-a="local">Play on this phone</button>';
    BL.openSheet(`
      <h2 id="sheet-title">${esc(g.name)}</h2>
      <p class="lede">${esc(g.blurb)}</p>
      ${active.length ? `<div class="sheet-list">${active.map(([gid, r]) => `<button type="button" class="turn-row ${isMyMove(r) ? 'hot' : ''}" data-gid="${gid}"><span class="gi gi-${r.type}" aria-hidden="true"></span><span><b>Continue</b><small>${isMyMove(r) ? 'Your turn' : `${pn}’s turn`}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`).join('')}</div>` : ''}
      <div class="actions">${onlineBtn}${localBtn}<button type="button" class="btn ghost" data-a="close">Close</button></div>
      ${race ? '' : `<p class="small muted">${id === 'chess' ? 'Whoever starts the game plays white. Rematches swap colors.' : 'Rematches swap who goes first.'}</p>`}`, {
      onMount: b => {
        $$('[data-gid]', b).forEach(x => { x.onclick = () => { BL.closeSheet(); openOnline(x.dataset.gid); }; });
        on(b, '[data-a=online]', () => { BL.closeSheet(); startOnline(id); });
        on(b, '[data-a=link]', openLink);
        on(b, '[data-a=local]', () => { BL.closeSheet(); openLocal(id); });
        on(b, '[data-a=solo]', () => { BL.closeSheet(); openLocal(id); });
        on(b, '[data-a=close]', () => BL.closeSheet());
      },
    });
  }

  async function startOnline(type, swapFrom, opts, from) {
    if (!partner) { openLink(); return; }
    const g = GAMES[type];
    if (type === 'words') { try { await g.load(); } catch (e) { BL.toast('The word lists didn’t load. Check your connection.'); return; } }
    const seed = O.code(10);
    if (!opts && swapFrom) {
      const prev = parse(swapFrom.state) || {};
      opts = { mode: swapFrom.mode, tc: swapFrom.tcSpec || null, len: prev.len, hard: prev.hard };
    }
    opts = opts || {};
    const extraOpts = type === 'words' ? { len: opts.len, hard: opts.hard, mode: opts.mode || 'duel', word: opts.word, hint: opts.hint, by: opts.by, guesser: opts.mode === 'custom' ? 1 : null } : {};
    const state = g.create(Object.assign({ seed, first: 0, clock: opts.mode === 'live' && opts.tc ? opts.tc : null }, extraOpts));
    const me = O.me();
    let seats;
    if (swapFrom && swapFrom.seats) seats = { 0: swapFrom.seats[1], 1: swapFrom.seats[0] };
    else if (opts.color === 'b' || (opts.color === 'r' && Math.random() < 0.5)) seats = { 0: partner.uid, 1: me };
    else seats = { 0: me, 1: partner.uid };
    const rec = { type, kind: g.kind, seats, state: JSON.stringify(state), turn: g.kind === 'turns' ? g.turn(state) : null, winner: null };
    if (opts.mode) rec.mode = opts.mode;
    if (opts.tc) { rec.tc = `${opts.tc.minutes}+${opts.tc.increment}`; rec.tcSpec = opts.tc; }
    if (g.kind === 'race') rec.prog = { 0: JSON.stringify(g.progress()), 1: JSON.stringify(g.progress()) };
    if (type === 'words' && opts.mode === 'custom') rec.prog[0] = JSON.stringify(Object.assign(g.progress(), { done: true }));
    try {
      const gid = await O.createGame(partner.pid, rec);
      if (swapFrom && swapFrom.gid) O.patch(partner.pid, swapFrom.gid, { next: gid }).catch(() => {});
      openOnline(gid, rec, from || (match && match.from));
    } catch (e) { BL.toast(netMsg(e)); }
  }

  // ---------------------------------------------------------- match screen
  function names() {
    if (!match) return ['', ''];
    if (match.solo) return [myName(), ''];
    if (match.local) return partner ? [myName(), partnerName()] : (match.type === 'chess' ? ['White', 'Black'] : ['Player 1', 'Player 2']);
    const seat = match.seat;
    if (match.bot) { const n = ['', '']; n[seat] = myName(); n[1 - seat] = `${levelName(match.bot.level)} bot`; return n; }
    const n = ['', ''];
    n[seat] = myName() === 'You' ? 'You' : myName();
    n[1 - seat] = partnerName();
    return n;
  }

  function buildMatch(type, extra) {
    closeMatch(true);
    const g = GAMES[type];
    match = Object.assign({ type, game: g, view: VIEWS[type], local: false, solo: false, gid: null, seat: 0, state: null, mine: null, theirs: null, rec: null }, extra);
    $('#p-title').textContent = match.bot ? `${g.name} vs ${levelName(match.bot.level)} bot` : g.name;
    $('#p-result').hidden = true;
    if (match.from === 'menu') { try { history.pushState({ s: 'sub2' }, ''); } catch (e) { /* ignore */ } }
    const ctx = {
      local: match.local, solo: match.solo, toast: BL.toast, send: submit,
      mode: match.bot ? 'bot' : match.local ? 'local' : match.solo ? 'solo' : 'online',
      thinking: () => !!(match && match.thinking),
      startLive: async () => {
        if (!match || !match.gid || !partner) return;
        await O.update(partner.pid, match.gid, rec => { if (rec.startAt || rec.status !== 'active') return undefined; rec.startAt = O.now() + 3500; return rec; }).catch(() => BL.toast('Couldn’t start the race. Check your connection.'));
      },
      canTakeback: () => !!(match && match.bot && match.stack && match.stack.length && !match.thinking),
      takeback: () => {
        if (!match || !match.bot || !match.stack.length || match.thinking) return;
        match.state = match.stack.pop();
        saveBot();
        renderMatch();
      },
      hint: async () => {
        if (!match || !match.bot) return null;
        const s = match.state;
        try { const mv = await chessThink(s, 5, 900); return match && match.state === s ? mv : null; } catch (e) { return null; }
      },
      confirm: (title, text, label, fn) => {
        BL.openSheet(`<h2 id="sheet-title">${esc(title)}</h2><p class="lede">${esc(text)}</p>
          <div class="actions"><button type="button" class="btn ${label === 'Resign' ? 'danger' : 'primary'} big" data-a="yes">${esc(label)}</button><button type="button" class="btn" data-a="no">Cancel</button></div>`,
        { onMount: b => { on(b, '[data-a=yes]', () => { BL.closeSheet(); fn(); }); on(b, '[data-a=no]', () => BL.closeSheet()); } });
      },
      now: () => (match && !match.local && !match.solo ? O.now() : Date.now()),
      partnerHere: () => !!(match && partnerOnline() && partnerOnline().game === match.gid),
      setDraft: text => { if (match && match.gid && partner && !match.local) O.draft(partner.pid, match.gid, { seat: match.seat, text }).catch(() => {}); },
    };
    Object.defineProperty(ctx, 'names', { get: names });
    match.ctx = ctx;
    match.inst = match.view.mount($('#p-body'), ctx);
    BL.show('play');
  }

  function openLocal(type, from) {
    const g = GAMES[type];
    buildMatch(type, { local: g.kind === 'turns', solo: g.kind === 'race', from: from || (window.BLMenus && window.BLMenus[type] ? 'menu' : null) });
    match.state = g.create({ seed: Math.random().toString(36).slice(2), first: 0 });
    if (g.kind === 'race') match.mine = Object.assign(g.progress(), { started: Date.now() });
    renderMatch();
  }

  function openOnline(gid, recHint, from) {
    const rec = games[gid] || recHint;
    if (!rec || !partner) { BL.toast('That game isn’t available.'); return; }
    if (rec.type === 'sudoku') { BL.show('home'); return; }
    buildMatch(rec.type, { gid, seat: mySeat(rec), from: from || null });
    O.here(partner.pid, gid).catch(() => {});
    applyRecord(rec);
    if (rec.type === 'words' && !GAMES.words.ready()) GAMES.words.load().then(() => { if (match && match.gid === gid) renderMatch(); }).catch(() => {});
  }

  function applyRecord(rec) {
    if (!match || !rec) return;
    const g = match.game;
    match.rec = rec;
    match.draft = rec.draft || null;
    const s = parse(rec.state);
    if (!s) return;
    match.state = s;
    if (g.kind === 'race') {
      const prog = rec.prog || {};
      const mine = parse(prog[match.seat]) || g.progress();
      // Keep a local guess that is still on its way to the server.
      if (!match.mine || (mine.guesses || []).length >= (match.mine.guesses || []).length) match.mine = mine;
      match.theirs = parse(prog[1 - match.seat]) || g.progress();
      if (!match.mine.started && !match.mine.done) {
        match.mine.started = Date.now();
        O.setProgress(partner.pid, match.gid, match.seat, match.mine, true).catch(() => {});
      }
      const w = match.seat === 0 ? g.result(s, match.mine, match.theirs) : g.result(s, match.theirs, match.mine);
      if (rec.status === 'active' && w != null) O.patch(partner.pid, match.gid, { status: 'over', winner: w }).catch(() => {});
    }
    renderMatch();
  }

  async function submit(move) {
    const m = match;
    if (!m) return 'No game open.';
    const g = m.game;
    if (g.kind === 'turns') {
      if (m.rec && m.rec.status === 'over') return 'This game is over.';
      const actor = m.local ? g.turn(m.state) : m.seat;
      if (!g.legal(m.state, move, actor)) return 'That move isn’t allowed.';
      if (m.bot && m.thinking) return 'Wait for the bot to move.';
      const before = m.state;
      m.state = g.apply(m.state, move, actor);
      BL.buzz && BL.buzz(8);
      if (m.bot) {
        if (move.from != null) m.stack.push(before);
        saveBot();
        renderMatch();
        if (g.over(m.state)) recordChess('bot', g.winner(m.state));
        else if (g.turn(m.state) === m.bot.seat) botMove();
        return '';
      }
      if (m.local && m.type === 'chess') BL.store.set('chessLocal', { state: m.state, at: Date.now() });
      renderMatch();
      if (!m.local) {
        const pid = partner.pid, gid = m.gid, seat = m.seat;
        try {
          const res = await O.update(pid, gid, rec => {
            const s = parse(rec.state);
            if (!s || rec.status !== 'active' || !g.legal(s, move, seat)) return undefined;
            const n = g.apply(s, move, seat);
            rec.state = JSON.stringify(n);
            rec.turn = g.turn(n);
            rec.by = O.me();
            if (g.over(n)) { rec.status = 'over'; rec.winner = g.winner(n); }
            return rec;
          });
          if (!res) { BL.toast('That move didn’t go through. The board has been refreshed.'); if (games[gid]) applyRecord(games[gid]); }
        } catch (e) { BL.toast('Couldn’t save that move. Check your connection.'); }
      }
      return '';
    }
    // races
    if (m.rec && m.rec.status === 'over') return 'This one’s already decided.';
    const err = g.check(m.state, m.mine, move);
    if (err) return err;
    const started = m.mine.started || Date.now();
    m.mine = Object.assign(g.advance(m.state, m.mine, Object.assign({}, move, { time: move.time != null ? move.time : Date.now() - started })), { started });
    if (m.soloCfg) { try { m.soloCfg.save(m.mine); } catch (e) { /* storage full */ } }
    if (m.soloCfg && g.done(m.mine)) m.soloCfg.done(m);
    renderMatch();
    if (!m.solo && partner) {
      try {
        await O.setProgress(partner.pid, m.gid, m.seat, m.mine);
        if (g.done(m.mine)) await O.patch(partner.pid, m.gid, { by: O.me() });
      } catch (e) { BL.toast('Couldn’t save that guess. Check your connection.'); }
    }
    return '';
  }

  function renderPlayHead() {
    if (!match || $('#play').hidden) return;
    const g = match.game, s = match.state, n = names(), rec = match.rec;
    let sub = '';
    if (match.solo) sub = match.soloCfg && match.soloCfg.kind === 'daily' ? 'Daily word' : match.soloCfg && match.soloCfg.kind === 'link' ? `${s.by || 'A friend'}’s word` : 'Practice';
    else if (match.bot) sub = g.over(s) ? 'Game over' : match.thinking ? 'The bot is thinking…' : g.turn(s) === match.seat ? 'Your move' : 'Bot’s move';
    else if (match.local) sub = g.over(s) ? 'On this phone' : `On this phone · ${n[g.turn(s)]}’s turn`;
    else {
      const p = partnerOnline();
      const withMe = p && p.game === match.gid;
      if (rec && rec.status === 'over') sub = resultText(rec);
      else if (match.type === 'words' && s.mode === 'custom') sub = s.guesser === match.seat ? `${partnerName()}’s word` : `${partnerName()} is guessing your word`;
      else if (match.type === 'words' && s.mode === 'live') sub = rec && rec.startAt ? 'Live race' : 'Live race. Start when you’re both here';
      else if (g.kind === 'race') sub = g.done(match.mine) ? `Waiting for ${partnerName()}` : 'Same word for both of you';
      else if (match.type === 'fuse' && !s.started) sub = 'Live game. Start when you’re both here';
      else sub = (rec && rec.mode === 'live' ? `Live ${rec.tc || ''} · ` : rec && rec.mode === 'turns' ? 'Take turns · ' : '') + (s.turn === match.seat ? 'Your turn' : `${partnerName()}’s turn`);
      if (withMe) sub += ` · ${partnerName()} is here`;
    }
    $('#p-sub').textContent = sub;
    $('#p-sub').classList.toggle('live', !match.local && !match.solo && !!(partnerOnline() && partnerOnline().game === match.gid));

    const seats = [0, 1];
    if (match.solo || match.type === 'chess' || (match.type === 'words' && s.mode === 'custom')) { $('#p-players').innerHTML = ''; return; }
    const label = i => {
      if (match.type === 'chess') return i === 0 ? 'White' : 'Black';
      if (match.type === 'eights') return `${s.hands[i].length} card${s.hands[i].length === 1 ? '' : 's'}`;
      if (match.type === 'fuse') return s.lives[i] > 0 ? '\u2665\uFE0E'.repeat(s.lives[i]) + ` ${s.lives[i]} ${s.lives[i] === 1 ? 'life' : 'lives'}` : 'Out';
      if (g.kind === 'race') { const p = i === match.seat ? match.mine : match.theirs; return !p || !p.guesses.length ? 'Not started' : p.done ? (p.solved ? `Solved in ${p.guesses.length}` : 'Missed') : `${p.guesses.length} guess${p.guesses.length === 1 ? '' : 'es'}`; }
      return '';
    };
    const turnOf = g.kind === 'turns' && !g.over(s) ? g.turn(s) : -1;
    $('#p-players').innerHTML = seats.map(i => `
      <div class="pl p${i}${turnOf === i ? ' turn' : ''}"><i class="pl-dot"></i><b>${esc(n[i])}${!match.local && i === match.seat ? ' (you)' : ''}</b><small>${esc(label(i))}</small></div>`).join('');
  }

  function renderMatch() {
    if (!match) return;
    const g = match.game, s = match.state;
    let snap;
    if (g.kind === 'turns') {
      const over = g.over(s) || (match.rec && match.rec.status === 'over');
      const viewer = match.local ? (match.type === 'eights' ? g.turn(s) : 0) : match.seat;
      snap = { state: s, viewer, canAct: !over && (match.local || g.turn(s) === match.seat), draft: match.draft };
    } else {
      const over = match.solo ? g.done(match.mine) : !!(match.rec && match.rec.status === 'over');
      snap = { state: s, viewer: match.seat, mine: match.mine, theirs: match.solo ? undefined : match.theirs, over, startAt: match.rec && match.rec.startAt };
    }
    match.inst.render(snap);
    renderPlayHead();
    renderResult();
  }

  function renderResult() {
    const m = match, g = m.game, box = $('#p-result');
    if (m.soloCfg && m.soloCfg.result) {
      if (!g.done(m.mine)) { box.hidden = true; return; }
      m.soloCfg.result(box, m);
      return;
    }
    let over = false, title = '', text = '';
    const n = names();
    if (g.kind === 'turns') {
      const recOver = m.rec && m.rec.status === 'over';
      over = g.over(m.state) || recOver;
      if (over) {
        const w = recOver ? m.rec.winner : g.winner(m.state);
        const resigned = recOver && m.rec.resigned != null;
        if (w === 'draw') title = 'It’s a draw';
        else if (m.local || m.bot) title = w === m.seat && m.bot ? 'You win' : `${n[w]} wins`;
        else title = w === m.seat ? 'You win' : `${partnerName()} wins`;
        text = resigned ? (m.rec.resigned === m.seat ? 'You resigned.' : `${partnerName()} resigned.`) : g.summary(m.state, n);
      }
    } else if (m.solo) {
      over = g.done(m.mine);
      if (over) { title = m.mine.solved ? `Solved in ${m.mine.guesses.length}` : 'Not this time'; text = `The word was ${m.state.word.toUpperCase()}.`; }
    } else {
      over = !!(m.rec && m.rec.status === 'over');
      if (over) {
        const w = m.rec.winner;
        title = w === 'draw' ? 'It’s a draw' : w === m.seat ? 'You win' : `${partnerName()} wins`;
        const gs = p => (p.solved ? `${p.guesses.length} guess${p.guesses.length === 1 ? '' : 'es'}` : p.done ? 'missed' : 'didn’t finish');
        if (m.state.mode === 'custom') {
          const guesser = m.state.guesser === m.seat ? m.mine : m.theirs;
          title = m.state.guesser === m.seat ? (guesser.solved ? 'You got it' : 'Not this time') : (guesser.solved ? `${partnerName()} got it` : `${partnerName()} couldn’t get it`);
          text = `The word was ${m.state.word.toUpperCase()}.${guesser.solved ? ` Solved in ${guesser.guesses.length}.` : ''}`;
        } else text = `The word was ${m.state.word.toUpperCase()}. You: ${gs(m.mine)}. ${partnerName()}: ${gs(m.theirs)}.`;
      } else if (g.done(m.mine)) {
        box.hidden = false;
        box.className = 'p-result wait';
        box.innerHTML = `<p><b>${m.mine.solved ? `You got it in ${m.mine.guesses.length}.` : 'You’re out of guesses.'}</b> ${esc(partnerName())} hasn’t finished yet. You’ll see who won when they do.</p><button type="button" class="btn" data-a="hub">Back to games</button>`;
        on(box, '[data-a=hub]', () => leave());
        return;
      }
    }
    if (!over) { box.hidden = true; return; }
    const next = m.rec && m.rec.next && games[m.rec.next];
    box.hidden = false;
    box.className = 'p-result';
    box.innerHTML = `<div><b>${esc(title)}</b><p>${esc(text)}</p></div>
      <div class="actions row">
        ${next ? `<button type="button" class="btn primary" data-a="next">Play the rematch</button>` : `<button type="button" class="btn primary" data-a="again">${m.solo ? 'New word' : m.type === 'words' && m.state.mode === 'custom' ? 'Send a word back' : 'Rematch'}</button>`}
        <button type="button" class="btn" data-a="hub">${m.from === 'menu' ? 'Menu' : 'Games'}</button>
      </div>`;
    on(box, '[data-a=again]', () => {
      if (m.type === 'words' && m.state.mode === 'custom' && window.BLMenus.words.make) { window.BLMenus.words.make(menuApi); return; }
      if (m.bot) startBot({ level: m.bot.level, seat: m.seat });
      else if (m.local || m.solo) { if (m.type === 'chess') BL.store.set('chessLocal', null); openLocal(m.type, m.from); }
      else startOnline(m.type, Object.assign({ gid: m.gid }, m.rec));
    });
    on(box, '[data-a=next]', () => openOnline(m.rec.next));
    on(box, '[data-a=hub]', () => leave());
  }

  function closeMatch(silent) {
    if (!match) return;
    try { match.inst && match.inst.destroy(); } catch (e) { /* ignore */ }
    $('#p-body').innerHTML = '';
    match = null;
    if (!silent && partner && net === 'ready') O.here(partner.pid, '').catch(() => {});
  }

  function leave(fromBackButton) {
    const toMenu = match && match.from === 'menu' && menuId;
    closeMatch();
    if (toMenu) {
      if (!fromBackButton && history.state && history.state.s === 'sub2') BL.popQuiet();
      BL.show('menu');
      return;
    }
    if (fromBackButton) BL.show('hub');
    else BL.toHub();
  }

  $('#p-back').onclick = () => leave();
  document.addEventListener('bl:back', () => { if (!$('#play').hidden) leave(true); });

  $('#p-menu').onclick = () => {
    if (!match) return;
    const m = match, g = m.game;
    const active = g.kind === 'turns' && !g.over(m.state) && !(m.rec && m.rec.status === 'over');
    const hasLook = window.BLMenus && window.BLMenus[m.type] && window.BLMenus[m.type].look;
    BL.openSheet(`
      <h2 id="sheet-title">${esc(g.name)}</h2>
      <div class="actions">
        ${hasLook ? '<button type="button" class="btn" data-a="look">Board and pieces</button>' : ''}
        ${active && !m.local && !m.bot && m.type !== 'chess' ? '<button type="button" class="btn danger" data-a="resign">Resign</button>' : ''}
        ${active && m.local ? '<button type="button" class="btn" data-a="restart">Start over</button>' : ''}
        ${!m.local && !m.solo && !m.bot ? '<button type="button" class="btn" data-a="remove">Remove this game for both of you</button>' : ''}
        <button type="button" class="btn ghost" data-a="hub">${m.from === 'menu' ? 'Back to the menu' : 'Back to games'}</button>
      </div>`, {
      onMount: b => {
        on(b, '[data-a=resign]', () => {
          BL.openSheet(`<h2 id="sheet-title">Resign this game?</h2><p class="lede">${esc(partnerName())} gets the win.</p>
            <div class="actions"><button type="button" class="btn danger big" data-a="yes">Resign</button><button type="button" class="btn" data-a="no">Keep playing</button></div>`, {
            onMount: bb => {
              on(bb, '[data-a=yes]', async () => {
                BL.closeSheet();
                const seat = m.seat;
                await O.update(partner.pid, m.gid, rec => { if (rec.status !== 'active') return undefined; rec.status = 'over'; rec.winner = 1 - seat; rec.resigned = seat; rec.by = O.me(); return rec; }).catch(() => BL.toast('Couldn’t resign. Check your connection.'));
              });
              on(bb, '[data-a=no]', () => BL.closeSheet());
            },
          });
        });
        on(b, '[data-a=look]', () => window.BLMenus[m.type].look(() => { if (match && match.inst.refresh) match.inst.refresh(); }));
        on(b, '[data-a=restart]', () => { BL.closeSheet(); if (m.type === 'chess') BL.store.set('chessLocal', null); openLocal(m.type, m.from); });
        on(b, '[data-a=remove]', () => {
          BL.openSheet(`<h2 id="sheet-title">Remove this game?</h2><p class="lede">It disappears from both phones. This can’t be undone.</p>
            <div class="actions"><button type="button" class="btn danger big" data-a="yes">Remove game</button><button type="button" class="btn" data-a="no">Keep it</button></div>`, {
            onMount: bb => {
              on(bb, '[data-a=yes]', async () => { const gid = m.gid; BL.closeSheet(); leave(); await O.removeGame(partner.pid, gid).catch(() => BL.toast('Couldn’t remove it. Check your connection.')); });
              on(bb, '[data-a=no]', () => BL.closeSheet());
            },
          });
        });
        on(b, '[data-a=hub]', () => { BL.closeSheet(); leave(); });
      },
    });
  };

  // ------------------------------------------------------------- lifecycle
  document.addEventListener('visibilitychange', () => {
    if (!partner || net !== 'ready') return;
    if (document.hidden) O.here(partner.pid, 'away').catch(() => {});
    else O.here(partner.pid, match && match.gid ? match.gid : '').catch(() => {});
  });

  window.BLHub = { render: renderHub, openGame: openGameSheet, openOnline, partner: () => partner };
  BL.boot();
  connect();
  function handleLinkHash() {
    const wl = location.hash.match(/^#w-([A-Za-z0-9_-]{6,200})$/);
    if (wl) {
      try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* ignore */ }
      openMenu('words');
      window.BLMenus.words.openLink(wl[1], menuApi);
      return;
    }
    const h = location.hash.match(/^#link-([A-Za-z0-9]{6})$/);
    if (!h) return;
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    enterCode(h[1].toUpperCase());
  }
  handleLinkHash();
  window.addEventListener('hashchange', handleLinkHash);
})();
