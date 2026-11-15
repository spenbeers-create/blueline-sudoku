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
    { id: 'sudoku', name: 'Sudoku', cat: 'Puzzles', blurb: 'Six levels, big grids, Killer and Diagonal.', players: 'Solo, race · TV mode' },
    { id: 'fuse', cat: 'Words', players: 'Up to 8 · TV mode' },
    { id: 'words', cat: 'Words', players: 'Up to 8 · TV mode' },
    { id: 'four', cat: 'Board', players: '2 players · TV mode' },
    { id: 'chess', cat: 'Board', players: '2 players · TV mode' },
    { id: 'checkers', cat: 'Board', players: '2 players · TV mode' },
    { id: 'eights', cat: 'Cards', players: 'Up to 6 · TV mode' },
  ].map(c => Object.assign({ name: GAMES[c.id] && GAMES[c.id].name, blurb: GAMES[c.id] && GAMES[c.id].blurb }, c));
  const COMING = ['Dots and Boxes', 'Sea Battle', 'Go Fish', 'Gin Rummy', 'Speed', 'Hangman', 'Word Tiles', 'Minesweeper race', '2048 race', 'Memory Match'];

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
    for (const [gid, r] of Object.entries(games)) if (['chess', 'four', 'eights', 'checkers'].includes(r.type) && r.status === 'over' && r.winner != null) recordOnline(r.type, gid, r);
    for (const [gid, r] of Object.entries(games)) if (r.type === 'words' && r.status === 'over' && r.winner != null && window.BLMenus.words) window.BLMenus.words.recordDuel(gid, r, mySeat(r));
    firstLoad = false;
    renderHub();
    renderMenu();
    if (match && match.gid && games[match.gid]) applyRecord(games[match.gid]);
    if (match && match.gid && !games[match.gid] && net === 'ready') { BL.toast('That game was removed.'); closeMatch(); }
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
    resumeBot: type => resumeBot(type),
    startLocal: (type, opts) => openLocal(type, 'menu', opts),
    resumeLocal: type => resumeLocal(type),
    link: () => openLink(),
    openSolo: (type, cfg) => openSolo(type, cfg),
    startFuse: cfg => startFuse(cfg),
    startCards: cfg => startCards(cfg),
    resumeCards: () => resumeCards(),
    openRoom: (code, seat, type) => openRoom(code, seat, type),
    openMenu: type => (type === 'sudoku' ? BL.show('home') : openMenu(type)),
    menuId: () => menuId,
    startTv: type => { if (window.BLTV) window.BLTV.open(type || 'fuse', menuApi); },
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

  // ------------------------------------------------------------------ bots
  // Chess and Four in a Row bots think in a worker so the board stays smooth.
  const BOT_AI = { chess: () => window.ChessAI, four: () => window.FourAI, checkers: () => window.CheckersAI };
  const workers = {}, thinkJobs = new Map();
  let thinkId = 0;
  function think(type, state, level, time) {
    if (!workers[type]) {
      try {
        const w = new Worker(`js/${type}-worker.js`);
        w.onmessage = e => { const j = thinkJobs.get(e.data.id); if (!j) return; thinkJobs.delete(e.data.id); e.data.ok ? j.resolve(e.data.move) : j.reject(new Error(e.data.error)); };
        w.onerror = () => { for (const [id, j] of thinkJobs) if (j.type === type) { j.reject(new Error('worker')); thinkJobs.delete(id); } workers[type] = null; };
        workers[type] = w;
      } catch (e) { workers[type] = null; }
    }
    const w = workers[type];
    if (!w) return new Promise((res, rej) => setTimeout(() => { try { res(BOT_AI[type]().think(state, level, time ? { time } : {})); } catch (e) { rej(e); } }, 30));
    return new Promise((resolve, reject) => { const id = ++thinkId; thinkJobs.set(id, { resolve, reject, type }); w.postMessage({ id, state, level, time }); });
  }
  const levelName = (type, id) => { const ai = BOT_AI[type] && BOT_AI[type](); return ((ai && ai.LEVELS.find(l => l.id === id)) || { name: 'Bot' }).name; };

  function startBot({ type = 'chess', level, seat, opts }) {
    const g = GAMES[type];
    buildMatch(type, { bot: { level, seat: 1 - seat }, seat, from: 'menu', stack: [], botOpts: opts || {} });
    match.state = g.create(Object.assign({ first: 0 }, opts || {}));
    saveBot();
    renderMatch();
    if (g.turn(match.state) === match.bot.seat) botMove();
  }
  function resumeBot(type = 'chess') {
    const saved = BL.store.get(type + 'Bot', null);
    if (!saved || !saved.state) return;
    buildMatch(type, { bot: { level: saved.level, seat: 1 - saved.seat }, seat: saved.seat, from: 'menu', stack: [], botOpts: saved.opts || {} });
    match.state = saved.state;
    renderMatch();
    const g = match.game;
    if (!g.over(match.state) && g.turn(match.state) === match.bot.seat) botMove();
  }
  function saveBot() {
    if (!match || !match.bot) return;
    BL.store.set(match.type + 'Bot', { level: match.bot.level, seat: match.seat, state: match.state, opts: match.botOpts, at: Date.now() });
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
    try { mv = await think(m.type, before, m.bot.level); } catch (e) { mv = null; }
    const wait = (m.type === 'four' ? 650 : 450) - (Date.now() - t0);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    m.thinking = false;
    if (match !== m || m.state !== before) return;
    if (!mv || !g.legal(before, mv, m.bot.seat)) { const all = g.legalMoves(before); mv = all[Math.floor(Math.random() * all.length)]; }
    m.state = g.apply(before, mv, m.bot.seat);
    saveBot();
    renderMatch();
    if (g.over(m.state)) recordBot(m.type, m.bot.level, m.seat, g.winner(m.state));
  }
  // Win/loss records live per game (chessStats, fourStats).
  const statsOf = type => Object.assign({ bot: {}, partner: { w: 0, l: 0, d: 0 }, counted: {} }, BL.store.get(type + 'Stats', {}));
  const resultKey = (winner, seat) => (winner === 'draw' ? 'd' : winner === seat ? 'w' : 'l');
  function recordBot(type, level, seat, winner) {
    const st = statsOf(type), k = resultKey(winner, seat);
    st.bot[level] = st.bot[level] || { w: 0, l: 0, d: 0 };
    st.bot[level][k]++;
    BL.store.set(type + 'Stats', st);
  }
  function recordOnline(type, gid, r) {
    const st = statsOf(type);
    if (st.counted[gid]) return;
    st.counted[gid] = 1;
    const k = resultKey(r.winner, mySeat(r));
    st.partner[k] = (st.partner[k] || 0) + 1;
    BL.store.set(type + 'Stats', st);
  }
  const LOCAL_SAVE = ['chess', 'four', 'eights', 'checkers'];
  function resumeLocal(type) {
    const saved = BL.store.get(type + 'Local', null);
    if (!saved || !saved.state) { openLocal(type, 'menu'); return; }
    buildMatch(type, { local: true, from: 'menu' });
    match.state = saved.state;
    renderMatch();
  }

  // ---------------------------------------------------- short fuse: bots
  // Each bot thinks, types its word letter by letter, then sends it. Sometimes it
  // gets stuck for a while, which is how the fuse catches it.
  const FUSE_SKILL = {
    1: { think: [2500, 5500], cps: 5, fail: 0.22 },
    2: { think: [1200, 3500], cps: 8, fail: 0.1 },
    3: { think: [500, 1800], cps: 12, fail: 0.03 },
  };
  // In Last Word the slowest player loses, so bots answer somewhere inside the time
  // limit instead of racing: Rookies late, Sharks early.
  const LAST_PACE = { 1: [0.4, 0.9], 2: [0.25, 0.7], 3: [0.12, 0.45] };
  const rnd = (a, b) => a + Math.random() * (b - a);
  let commonP = null;
  function loadCommon() {
    if (!commonP) {
      commonP = fetch('data/words.json').then(r => r.json()).then(d => {
        const all = [];
        for (const k of Object.keys(d)) if (d[k] && d[k].answers) all.push(...d[k].answers.split(' '));
        GAMES.fuse.setCommon(all);
      }).catch(() => { commonP = null; });
    }
    return commonP;
  }
  async function startFuse(cfg) {
    const F = GAMES.fuse;
    if (!F.hasDictionary()) BL.openSheet('<h2 id="sheet-title">Getting the words ready…</h2><div class="status-line"><span class="spinner"></span>Loading the dictionary</div>', { locked: true });
    try { await F.loadDictionary(); } catch (e) { BL.closeSheet(); BL.toast('The word list didn’t load. Check your connection.'); return; }
    await loadCommon();
    if (BL.sheetOpen()) BL.closeSheet();
    buildMatch('fuse', { fuseBots: true, seat: 0, from: 'menu', fuseCfg: cfg, botPlans: {} });
    let st = F.create(Object.assign({ seed: Math.random().toString(36).slice(2), players: cfg.players }, cfg.settings));
    st = F.apply(st, { start: true, at: Date.now() }, 0);
    match.state = st;
    renderMatch();
    planFuseBots();
  }
  function fuseApply(move, p) {
    const m = match;
    if (!m) return 'No game open.';
    const g = m.game;
    if (!g.legal(m.state, move, p)) return 'That move isn’t allowed.';
    m.state = g.apply(m.state, move, p);
    if (m.draft && (move.word != null || move.boom || move.timeout)) m.draft = null;
    renderMatch();
    planFuseBots();
    return '';
  }
  function planFuseBots() {
    const m = match;
    if (!m || !m.fuseBots) return;
    const F = m.game, s = m.state, plans = m.botPlans;
    const live = s.started && !F.over(s), key = `${s.round}:${s.n}`;
    s.players.forEach((pl, p) => {
      if (!pl.bot) return;
      const act = live && F.canAct(s, p);
      const plan = plans[p];
      if (plan && plan.key === key && act) return;
      if (plan) { plan.timers.forEach(clearTimeout); delete plans[p]; }
      if (!act) return;
      const sk = FUSE_SKILL[pl.bot] || FUSE_SKILL[2], now = Date.now();
      let wait = Math.max(0, (s.roundStart || 0) - now);
      if (s.variant === 'last') {
        const pace = LAST_PACE[pl.bot] || LAST_PACE[2], limit = (s.settings && s.settings.limit) || 12000;
        wait += limit * rnd(pace[0], pace[1]);
      } else wait += rnd(sk.think[0], sk.think[1]);
      if (Math.random() < sk.fail) wait += rnd(3000, 9000);
      const word = F.botWord(s, Math.random), timers = [];
      plans[p] = { key, timers };
      if (!word) return;                               // stuck for good this turn
      const per = 1000 / sk.cps;
      if (s.variant !== 'last') {
        for (let i = 1; i <= word.length; i++) {
          timers.push(setTimeout(() => {
            if (match !== m || !F.canAct(m.state, p)) return;
            m.draft = { seat: p, text: word.slice(0, i), n: m.state.n };
            renderMatch();
          }, wait + i * per));
        }
      }
      timers.push(setTimeout(() => {
        if (match !== m) return;
        delete plans[p];
        const mv = { word, at: Date.now() };
        if (F.legal(m.state, mv, p)) fuseApply(mv, p);
        else planFuseBots();
      }, wait + word.length * per + 180));
    });
  }

  // --------------------------------------------------- short fuse: rooms
  // Everyone in a party room watches the same record; moves are transactions on its state.
  function openRoom(code, seat, type = 'fuse') {
    if (type === 'sudoku') { window.BLSudokuRoom.open(code, seat, menuApi); return; }
    buildMatch(type, { room: code, seat, from: 'menu' });
    const m = match;
    O.roomHere(code).catch(() => {});
    m.stopRoom = O.watchRoom(code, r => {
      if (match !== m) return;
      if (!r) { BL.toast('The room closed.'); leave(); return; }
      if (r.status === 'lobby') { leave(); window.BLRooms.lobby(code, menuApi); return; }
      const idx = Array.isArray(r.seats) ? r.seats.indexOf(O.me()) : -1;
      if (idx < 0) { leave(); return; }
      const st = parse(r.state);
      if (!st) return;
      m.seat = idx;                          // a rematch can swap who goes first
      m.rec = r; m.state = st; m.draft = r.draft || null;
      m.roomNames = r.seats.map(uid => ((r.players || {})[uid] || {}).name || 'Player');
      if (m.game.kind === 'race') roomRace(m, r, idx);
      renderMatch();
    });
  }
  // Word Duel rooms: everyone races on the same word. Your progress is kept locally
  // while a guess is on its way; the rival shown is whoever is doing best.
  function roomRace(m, r, idx) {
    const g = m.game, prog = r.prog || {};
    const mine = parse(prog[idx]) || g.progress();
    if (m.raceGame !== r.played || (mine.guesses || []).length >= ((m.mine && m.mine.guesses) || []).length) m.mine = mine;
    m.raceGame = r.played;
    const others = r.seats.map((u, i) => i).filter(i => i !== idx).map(i => ({ i, p: parse(prog[i]) || g.progress() }));
    const rank = x => (x.p.solved ? -1e9 + x.p.time : x.p.done ? 1e9 : -x.p.guesses.length);
    others.sort((a, b) => rank(a) - rank(b));
    m.theirs = others.length ? others[0].p : null;
    m.theirsName = others.length ? m.roomNames[others[0].i] : '';
    const all = r.seats.map((u, i) => (i === idx ? m.mine : parse(prog[i])));
    const w = raceWinner(m.state, all);
    if (r.status === 'playing' && w != null) window.BLRooms.finish(m.room, w);
  }
  // First to solve wins (by the shared race clock); nobody solving once all are done is a draw.
  function raceWinner(s, progs) {
    let best = Infinity, who = null, tie = false;
    progs.forEach((p, i) => { if (p && p.solved) { if (p.time < best) { best = p.time; who = i; tie = false; } else if (p.time === best) tie = true; } });
    if (who != null) return tie ? 'draw' : who;
    return progs.length && progs.every(p => p && p.done) ? 'draw' : null;
  }

  async function roomSubmit(move) {
    const m = match, g = m.game, code = m.room, seat = m.seat;
    if (!m.state || g.over(m.state)) return 'This game is over.';
    if (!g.legal(m.state, move, seat)) return 'That move isn’t allowed.';
    try {
      const res = await O.roomMove(code, cur => {
        const st = parse(cur);
        if (!st || !g.legal(st, move, seat)) return undefined;
        return JSON.stringify(g.apply(st, move, seat));
      });
      if (!res) return move.word != null ? 'late' : '';
      const n = parse(res);
      if (n && g.over(n)) window.BLRooms.finish(code, g.winner(n));
    } catch (e) { BL.toast('Couldn’t reach the room. Check your connection.'); }
    return '';
  }

  // ------------------------------------------------- crazy eights: bots
  // Bots take their turns with a short pause (quicker when they keep drawing).
  // The game is saved after every card so it can be picked up later.
  function startCards(cfg) {
    const E = GAMES.eights;
    buildMatch('eights', { cardBots: true, seat: 0, from: 'menu', cardCfg: cfg });
    match.state = E.create({ seed: Math.random().toString(36).slice(2), players: cfg.players, rules: cfg.rules, first: Math.floor(Math.random() * cfg.players.length) });
    saveCards();
    renderMatch();
    runCardBots();
  }
  function resumeCards() {
    const saved = BL.store.get('eightsBot', null);
    if (!saved || !saved.state) return;
    buildMatch('eights', { cardBots: true, seat: 0, from: 'menu', cardCfg: saved.cfg || {} });
    match.state = saved.state;
    renderMatch();
    runCardBots();
  }
  function saveCards() { if (match && match.cardBots) BL.store.set('eightsBot', { cfg: match.cardCfg, state: match.state, at: Date.now() }); }
  function cardApply(move, p) {
    const m = match;
    if (!m) return 'No game open.';
    const g = m.game;
    if (!g.legal(m.state, move, p)) return 'That move isn’t allowed.';
    m.state = g.apply(m.state, move, p);
    if (p === m.seat && BL.buzz) BL.buzz(8);
    saveCards();
    renderMatch();
    runCardBots();
    return '';
  }
  function runCardBots() {
    const m = match;
    if (!m || !m.cardBots) return;
    clearTimeout(m.botT);
    const s = m.state, g = m.game;
    if (g.over(s)) return;
    const p = s.turn, pl = s.players && s.players[p];
    if (!pl || !pl.bot) return;
    const last = s.log[s.log.length - 1];
    const again = last && last.p === p && last.draw && !last.penalty;
    m.botT = setTimeout(() => {
      if (match !== m || m.state !== s) return;
      let mv = g.botMove(s, p, pl.bot);
      if (!g.legal(s, mv, p)) mv = g.legalMoves(s)[0];
      if (mv) cardApply(mv, p);
    }, again ? 550 : 950 + Math.random() * 700);
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
      opts = { mode: swapFrom.mode, tc: swapFrom.tcSpec || null, len: prev.len, hard: prev.hard, variant: prev.variant, settings: prev.settings, size: prev.size, rules: prev.rules };
    }
    opts = opts || {};
    const extraOpts = type === 'words' ? { len: opts.len, hard: opts.hard, mode: opts.mode || 'duel', word: opts.word, hint: opts.hint, by: opts.by, guesser: opts.mode === 'custom' ? 1 : null }
      : type === 'fuse' ? Object.assign({}, opts.settings || {}, { variant: opts.variant, players: [{ name: 'Player 1' }, { name: 'Player 2' }] })
      : type === 'four' ? { size: opts.size }
      : type === 'eights' ? { rules: opts.rules || false }
      : type === 'checkers' ? { rules: opts.rules } : {};
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
    if (match.type === 'fuse' && (match.room || match.fuseBots)) return match.state ? match.state.players.map(p => p.name) : [];
    if (match.type === 'eights' && (match.cardBots || match.room) && match.state && match.state.players) return match.state.players.map(p => p.name);
    if (match.room) return match.roomNames || ['Player 1', 'Player 2'];
    if (match.solo) return [myName(), ''];
    if (match.local) return partner ? [myName(), partnerName()] : (match.type === 'chess' ? ['White', 'Black'] : ['Player 1', 'Player 2']);
    const seat = match.seat;
    if (match.bot) { const n = ['', '']; n[seat] = myName(); n[1 - seat] = `${levelName(match.type, match.bot.level)} bot`; return n; }
    const n = ['', ''];
    n[seat] = myName() === 'You' ? 'You' : myName();
    n[1 - seat] = partnerName();
    return n;
  }

  function buildMatch(type, extra) {
    closeMatch(true);
    const g = GAMES[type];
    match = Object.assign({ type, game: g, view: VIEWS[type], local: false, solo: false, gid: null, seat: 0, state: null, mine: null, theirs: null, rec: null }, extra);
    $('#p-title').textContent = match.bot ? `${g.name} vs ${levelName(type, match.bot.level)} bot` : g.name;
    $('#p-result').hidden = true;
    if (match.from === 'menu' && !(history.state && history.state.s === 'sub2')) { try { history.pushState({ s: 'sub2' }, ''); } catch (e) { /* ignore */ } }
    const ctx = {
      local: match.local, solo: match.solo, toast: BL.toast, send: submit,
      mode: match.bot ? 'bot' : match.fuseBots || match.cardBots ? 'bots' : match.local ? 'local' : match.solo ? 'solo' : 'online',
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
        const chess = match.type === 'chess';
        try { const mv = await think(match.type, s, chess ? 5 : 4, chess ? 900 : 600); return match && match.state === s ? mv : null; } catch (e) { return null; }
      },
      confirm: (title, text, label, fn) => {
        BL.openSheet(`<h2 id="sheet-title">${esc(title)}</h2><p class="lede">${esc(text)}</p>
          <div class="actions"><button type="button" class="btn ${label === 'Resign' ? 'danger' : 'primary'} big" data-a="yes">${esc(label)}</button><button type="button" class="btn" data-a="no">Cancel</button></div>`,
        { onMount: b => { on(b, '[data-a=yes]', () => { BL.closeSheet(); fn(); }); on(b, '[data-a=no]', () => BL.closeSheet()); } });
      },
      now: () => (match && (match.local || match.solo || match.fuseBots) ? Date.now() : O.now()),
      partnerHere: () => !!(match && partnerOnline() && partnerOnline().game === match.gid),
      quiet: () => !!(match && match.rec && match.rec.screen),
      setDraft: text => {
        if (!match || match.local || match.fuseBots) return;
        const d = { seat: match.seat, text, n: match.state ? match.state.n : 0 };
        if (match.room) O.roomDraft(match.room, d).catch(() => {});
        else if (match.gid && partner) O.draft(partner.pid, match.gid, d).catch(() => {});
      },
    };
    Object.defineProperty(ctx, 'names', { get: names });
    match.ctx = ctx;
    match.inst = match.view.mount($('#p-body'), ctx);
    BL.show('play');
  }

  function openLocal(type, from, opts) {
    const g = GAMES[type];
    buildMatch(type, { local: g.kind === 'turns', solo: g.kind === 'race', from: from || (window.BLMenus && window.BLMenus[type] ? 'menu' : null) });
    match.state = g.create(Object.assign({ seed: Math.random().toString(36).slice(2), first: 0 }, opts || {}));
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
    if (m.fuseBots) return fuseApply(move, m.seat);
    if (m.cardBots) return cardApply(move, m.seat);
    if (m.room && g.kind === 'turns') return roomSubmit(move);
    if (g.kind === 'turns') {
      if (m.rec && m.rec.status === 'over') return 'This game is over.';
      const actor = m.local ? g.turn(m.state) : m.seat;
      if (!g.legal(m.state, move, actor)) return 'That move isn’t allowed.';
      if (m.bot && m.thinking) return 'Wait for the bot to move.';
      const before = m.state;
      m.state = g.apply(m.state, move, actor);
      if (!move.typing && BL.buzz) BL.buzz(8);
      if (m.bot) {
        if (move.from != null || move.col != null || move.path != null) m.stack.push(before);
        saveBot();
        renderMatch();
        if (g.over(m.state)) recordBot(m.type, m.bot.level, m.seat, g.winner(m.state));
        else if (g.turn(m.state) === m.bot.seat) botMove();
        return '';
      }
      if (m.local && LOCAL_SAVE.includes(m.type)) BL.store.set(m.type + 'Local', { state: m.state, at: Date.now() });
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
    if (m.room) {
      const err = g.check(m.state, m.mine, move);
      if (err) return err;
      m.mine = Object.assign(g.advance(m.state, m.mine, Object.assign({}, move, { time: move.time != null ? move.time : 0 })), { started: m.mine.started || Date.now() });
      renderMatch();
      O.roomProg(m.room, m.seat, JSON.stringify(m.mine)).catch(() => BL.toast('Couldn’t save that guess. Check your connection.'));
      return '';
    }
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
    if (match.type === 'fuse' && (match.room || match.fuseBots)) {
      const vn = s.variant === 'last' ? 'Last Word' : 'Pass the fuse', bots = s.players.filter(p => p.bot).length;
      $('#p-sub').textContent = match.room ? `Room ${match.room} · ${vn}${rec && rec.screen ? ' · on the TV' : ''}` : s.players.length === 1 ? 'Practice · survival' : `${vn} · ${bots} bot${bots === 1 ? '' : 's'}`;
      $('#p-sub').classList.remove('live');
      $('#p-players').innerHTML = '';
      return;
    }
    let sub = '';
    if (match.solo) sub = match.soloCfg && match.soloCfg.kind === 'daily' ? 'Daily word' : match.soloCfg && match.soloCfg.kind === 'link' ? `${s.by || 'A friend'}’s word` : 'Practice';
    else if (match.bot) sub = g.over(s) ? 'Game over' : match.thinking ? 'The bot is thinking…' : g.turn(s) === match.seat ? 'Your move' : 'Bot’s move';
    else if (match.cardBots) { const b = s.players.length - 1; sub = `${b} bot${b === 1 ? '' : 's'} · ${g.over(s) ? 'Game over' : g.turn(s) === match.seat ? 'Your turn' : `${n[g.turn(s)]}’s turn`}`; }
    else if (match.local) sub = g.over(s) ? 'On this phone' : `On this phone · ${n[g.turn(s)]}’s turn`;
    else if (match.room && g.kind === 'race') sub = `Room ${match.room}${rec && rec.screen ? ' · on the TV' : ''} · first to solve wins`;
    else if (match.room) sub = `Room ${match.room}${rec && rec.screen ? ' · on the TV' : ''} · ${g.over(s) ? 'Game over' : g.turn(s) === match.seat ? 'Your turn' : `${n[g.turn(s)]}’s turn`}`;
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
    if (match.solo || match.room || ['chess', 'fuse', 'four', 'eights', 'checkers'].includes(match.type) || (match.type === 'words' && s.mode === 'custom')) { $('#p-players').innerHTML = ''; return; }
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
    if (!match || !match.state) return;
    const g = match.game, s = match.state;
    let snap;
    if (g.kind === 'turns') {
      const over = g.over(s) || (match.rec && match.rec.status === 'over');
      const viewer = match.local ? (match.type === 'eights' || match.type === 'fuse' ? g.turn(s) : 0) : match.seat;
      const can = match.local || (g.canAct ? g.canAct(s, match.seat) : g.turn(s) === match.seat);
      snap = { state: s, viewer, canAct: !over && can, draft: match.draft };
    } else {
      const over = match.solo ? g.done(match.mine) : !!(match.rec && match.rec.status === 'over');
      snap = { state: s, viewer: match.seat, mine: match.mine, theirs: match.solo ? undefined : match.theirs, theirsName: match.theirsName, over, startAt: match.rec && match.rec.startAt };
    }
    match.inst.render(snap);
    renderPlayHead();
    renderResult();
  }

  function renderResult() {
    const m = match, g = m.game, box = $('#p-result');
    if (m.type === 'fuse' && window.BLMenus.fuse && window.BLMenus.fuse.renderResult(box, m)) return;
    if (m.cardBots && window.BLMenus.eights && window.BLMenus.eights.renderResult(box, m, menuApi)) return;
    if (m.room && g.kind === 'race') {
      const r = m.rec || {}, n = names();
      if (r.status !== 'over') {
        if (!g.done(m.mine)) { box.hidden = true; return; }
        box.hidden = false;
        box.className = 'p-result wait';
        box.innerHTML = `<p><b>${m.mine.solved ? `You got it in ${m.mine.guesses.length}.` : 'You’re out of guesses.'}</b> Waiting for the others to finish.</p>`;
        return;
      }
      const w = r.winner;
      const title = w === 'draw' ? 'Nobody got it first' : w === m.seat ? 'You win!' : `${n[w]} wins`;
      const me = m.mine.solved ? `You solved it in ${m.mine.guesses.length}.` : m.mine.done ? 'You ran out of guesses.' : 'Someone beat you to it.';
      box.hidden = false;
      box.className = 'p-result';
      box.innerHTML = `<div><b>${esc(title)}</b><p>The word was ${esc(m.state.word.toUpperCase())}. ${esc(me)}</p></div>
        <div class="actions row"><button type="button" class="btn primary" data-a="again">Next word</button><button type="button" class="btn" data-a="menu">Menu</button></div>`;
      on(box, '[data-a=again]', () => window.BLRooms.rematch(m.room));
      on(box, '[data-a=menu]', () => { const c = m.room; leave(); window.BLRooms.leave(c, false); });
      return;
    }
    if (m.room) {
      if (!g.over(m.state)) { box.hidden = true; return; }
      const n = names(), w = g.winner(m.state), r = m.rec || {};
      const title = w === 'draw' ? 'It’s a draw' : w === m.seat ? 'You win!' : `${n[w]} wins`;
      const tally = r.score && r.seats ? r.seats.map(uid => `${((r.players || {})[uid] || {}).name || 'Player'} ${r.score[uid] || 0}`).join(', ') : '';
      box.hidden = false;
      box.className = 'p-result';
      box.innerHTML = `<div><b>${esc(title)}</b><p>${esc(g.summary(m.state, n))}${tally ? ` Score: ${esc(tally)}.` : ''}</p></div>
        <div class="actions row"><button type="button" class="btn primary" data-a="again">Play again</button><button type="button" class="btn" data-a="menu">Menu</button></div>`;
      on(box, '[data-a=again]', () => window.BLRooms.rematch(m.room));
      on(box, '[data-a=menu]', () => { const c = m.room; leave(); window.BLRooms.leave(c, false); });
      return;
    }
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
      if (m.bot) startBot({ type: m.type, level: m.bot.level, seat: m.type === 'four' || m.type === 'checkers' ? 1 - m.seat : m.seat, opts: m.botOpts });
      else if (m.local || m.solo) {
        if (LOCAL_SAVE.includes(m.type)) BL.store.set(m.type + 'Local', null);
        openLocal(m.type, m.from, m.type === 'four' ? { size: m.state.size, first: 1 - (m.state.first || 0) } : m.type === 'eights' ? { rules: m.state.rules || false } : m.type === 'checkers' ? { rules: m.state.rules, first: 1 - (m.state.first || 0) } : undefined);
      }
      else startOnline(m.type, Object.assign({ gid: m.gid }, m.rec));
    });
    on(box, '[data-a=next]', () => openOnline(m.rec.next));
    on(box, '[data-a=hub]', () => leave());
  }

  function closeMatch(silent) {
    if (!match) return;
    try { match.inst && match.inst.destroy(); } catch (e) { /* ignore */ }
    if (match.stopRoom) { try { match.stopRoom(); } catch (e) { /* ignore */ } }
    if (match.room) O.roomHere(match.room, false).catch(() => {});
    if (match.botPlans) Object.values(match.botPlans).forEach(pl => pl.timers.forEach(clearTimeout));
    clearTimeout(match.botT);
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
    const shared = !m.local && !m.solo && !m.bot && !m.room && !m.fuseBots;
    const hasLook = window.BLMenus && window.BLMenus[m.type] && window.BLMenus[m.type].look;
    const lookLabel = (hasLook && window.BLMenus[m.type].lookLabel) || 'Board and pieces';
    BL.openSheet(`
      <h2 id="sheet-title">${esc(g.name)}</h2>
      <div class="actions">
        ${hasLook ? `<button type="button" class="btn" data-a="look">${esc(lookLabel)}</button>` : ''}
        ${active && shared && m.type !== 'chess' ? '<button type="button" class="btn danger" data-a="resign">Resign</button>' : ''}
        ${active && (m.local || m.fuseBots || m.cardBots || m.bot) ? '<button type="button" class="btn" data-a="restart">Start over</button>' : ''}
        ${shared ? '<button type="button" class="btn" data-a="remove">Remove this game for both of you</button>' : ''}
        ${m.room ? '<button type="button" class="btn" data-a="leaveroom">Leave the room</button>' : ''}
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
        on(b, '[data-a=restart]', () => {
          BL.closeSheet();
          if (m.fuseBots) { startFuse(m.fuseCfg); return; }
          if (m.cardBots) { startCards(m.cardCfg); return; }
          if (m.bot) { startBot({ type: m.type, level: m.bot.level, seat: m.seat, opts: m.botOpts }); return; }
          if (LOCAL_SAVE.includes(m.type)) BL.store.set(m.type + 'Local', null);
          openLocal(m.type, m.from, m.type === 'four' ? { size: m.state.size } : m.type === 'eights' || m.type === 'checkers' ? { rules: m.state.rules || false } : undefined);
        });
        on(b, '[data-a=leaveroom]', () => { BL.closeSheet(); const c = m.room; leave(); O.leaveRoom(c, false, false).catch(() => {}); });
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

  window.BLHub = { render: renderHub, openGame: openGameSheet, openOnline, partner: () => partner, api: menuApi };
  BL.boot();
  connect();
  function handleLinkHash() {
    const rm = location.hash.match(/^#room-([A-Za-z0-9]{5})$/);
    if (rm) {
      try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* ignore */ }
      window.BLRooms.joinPrompt(rm[1].toUpperCase(), '', menuApi);
      return;
    }
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
