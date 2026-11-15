/* Checkers menu: continue games, play the computer (four levels), house rules,
   your partner (live or through the day), pass and play, TV mode, rooms for anyone
   with a code, your record, and the pieces-and-board style sheet. */
(() => {
  'use strict';
  const BL = window.BL, esc = BL.esc, K = window.BLGames.checkers, AI = window.CheckersAI, KV = window.BLViews.checkers;
  const MENUS = window.BLMenus || (window.BLMenus = {});
  const R = () => window.BLRooms;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const on = (root, sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };

  const prefs = () => {
    const p = Object.assign({ level: 2, first: 'me', mode: 'live', onlineFirst: 'r' }, BL.store.get('checkersPrefs', {}));
    p.rules = Object.assign({}, K.DEFAULT_RULES, p.rules || {});
    return p;
  };
  const savePrefs = p => BL.store.set('checkersPrefs', p);
  const stats = () => Object.assign({ bot: {}, partner: { w: 0, l: 0, d: 0 } }, BL.store.get('checkersStats', {}));
  const rec = o => (o ? `${o.w || 0}–${o.l || 0}${o.d ? '–' + o.d : ''}` : '0–0');
  const rulesText = rl => [rl.forced !== false ? 'must jump' : 'jumps optional', rl.flying ? 'flying kings' : ''].filter(Boolean).join(' · ');
  function seg(id, opts, val) {
    return `<div class="seg" role="radiogroup" id="${id}">${opts.map(([v, t]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${String(v) === String(val)}">${t}</button>`).join('')}</div>`;
  }

  // Rooms: two phones (and a TV). Who moves first swaps every game.
  R().register('checkers', {
    title: 'Checkers', maxPlayers: 2,
    minPlayers: () => 2,
    describe: st => rulesText(Object.assign({}, K.DEFAULT_RULES, st.rules || {})),
    start(r, entries) {
      const order = (r.played || 0) % 2 ? entries.slice().reverse() : entries;
      r.seats = order.map(([uid]) => uid);
      r.state = JSON.stringify(K.create({ rules: (r.settings || {}).rules }));
    },
  });

  // ----------------------------------------------------------- style sheet
  function preview() {
    const L = KV.look(), rows = ['.b.b.b.b', 'b.b.B.b.', '........', '.a.A.a.a'];
    const html = rows.map((row, r) => row.split('').map((ch, c) => `<span class="ck-sq ${(r + c) % 2 ? 'dk' : 'lt'}">${KV.pieceHtml(ch)}</span>`).join('')).join('');
    const tmp = document.createElement('div');
    KV.applyLook(tmp, L);
    return `<div class="ck ck-mini" style="${tmp.getAttribute('style')}"><div class="ck-board">${html}</div></div>`;
  }
  function openLook(onDone) {
    const L = KV.look();
    const sw = (key, title, desc) => `<div class="setting"><label for="kl-${key}"><b>${title}</b><small>${desc}</small></label><span class="switch"><input type="checkbox" id="kl-${key}" data-k="${key}" ${L[key] ? 'checked' : ''}><span></span></span></div>`;
    BL.openSheet(`
      <h2 id="sheet-title">Pieces and board</h2>
      <div id="kl-preview">${preview()}</div>
      <div class="field"><span>Pieces</span><div class="swatches five" id="kl-set">${Object.entries(KV.SETS).map(([k, x]) => `<button type="button" class="swatch" data-v="${k}" aria-pressed="${L.set === k}"><i style="background:linear-gradient(135deg, ${x.c[0]} 0 50%, ${x.c[1]} 50% 100%)"></i><small>${esc(x.name.split(' and ')[0])}</small></button>`).join('')}</div></div>
      <div class="field"><span>Board</span><div class="swatches five" id="kl-board">${Object.entries(KV.BOARDS).map(([k, b]) => `<button type="button" class="swatch" data-v="${k}" aria-pressed="${L.board === k}"><i style="background:linear-gradient(135deg, ${b.lt} 0 50%, ${b.dk} 50% 100%)"></i><small>${esc(b.name)}</small></button>`).join('')}</div></div>
      <div>
        ${sw('dots', 'Show moves', 'Dots on the squares the piece you picked can reach.')}
        ${sw('sound', 'Sounds', 'A click for moves, a double knock for jumps, and a chime for a new king.')}
      </div>
      <div class="actions"><button type="button" class="btn primary big" data-a="done">Done</button></div>`, {
      onClose: () => onDone && onDone(),
      onMount: b => {
        const save = patch => {
          BL.store.set('checkersLook', Object.assign(KV.look(), patch));
          document.dispatchEvent(new Event('bl:checkerslook'));
          $('#kl-preview', b).innerHTML = preview();
        };
        for (const [id, key] of [['kl-set', 'set'], ['kl-board', 'board']]) {
          $('#' + id, b).onclick = e => {
            const x = e.target.closest('[data-v]'); if (!x) return;
            $$('.swatch', $('#' + id, b)).forEach(s => s.setAttribute('aria-pressed', String(s === x)));
            save({ [key]: x.dataset.v });
          };
        }
        $$('input[type=checkbox]', b).forEach(inp => inp.addEventListener('change', () => save({ [inp.dataset.k]: inp.checked })));
        on(b, '[data-a=done]', () => BL.closeSheet());
      },
    });
  }
  function howTo() {
    BL.openSheet(`
      <h2 id="sheet-title">How to play</h2>
      <p class="lede">Pieces move one square diagonally forward on the dark squares. Jump over an enemy piece next to you, onto the empty square behind it, to capture it. If you land where you can jump again, keep going: tap each landing square in turn.</p>
      <p class="lede">Reach the far side and your piece is crowned a king, which can move and jump backward too. Win by taking every enemy piece or leaving them with no moves.</p>
      <p class="lede"><b>Must jump</b> means that when you can capture, you have to. <b>Flying kings</b> slide any distance along a diagonal and can capture from far away.</p>
      <div class="actions"><button type="button" class="btn primary big" data-a="x">Got it</button></div>`, { onMount: b => on(b, '[data-a=x]', () => BL.closeSheet()) });
  }

  // ------------------------------------------------------------------ menu
  MENUS.checkers = {
    title: 'Checkers',
    look: openLook,
    lookLabel: 'Pieces and board',
    render(el, api) {
      const p = prefs(), st = stats(), partner = api.partner(), pn = partner ? esc(partner.name) : '';
      const bot = BL.store.get('checkersBot', null), local = BL.store.get('checkersLocal', null);
      const online = api.games('checkers');
      const lvl = AI.LEVELS.find(l => l.id === p.level) || AI.LEVELS[1];
      let cont = '';
      if (bot && bot.state && bot.state.winner == null && bot.state.moves.length) {
        const L = AI.LEVELS.find(l => l.id === bot.level) || lvl, mine = K.pieces(bot.state, bot.seat), theirs = K.pieces(bot.state, 1 - bot.seat);
        cont += `<button type="button" class="resume" data-cont="bot"><span class="resume-k">Continue</span><span class="resume-t">vs ${esc(L.name)} bot</span><span class="resume-m">${mine.men + mine.kings} pieces to their ${theirs.men + theirs.kings} · ${bot.state.turn === bot.seat ? 'your move' : 'bot’s move'}</span><svg class="resume-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`;
      }
      const rows = online.filter(([, r]) => r.status === 'active').map(([gid, r]) => {
        const mine = api.isMyMove(r);
        return `<button type="button" class="turn-row ${mine ? 'hot' : ''}" data-gid="${gid}"><span class="gi gi-checkers" aria-hidden="true"></span><span><b>vs ${pn}</b><small>${r.mode === 'live' ? 'Live' : 'Take turns'} · ${mine ? 'Your move' : `${pn}’s move`}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`;
      }).join('');
      if (local && local.state && local.state.winner == null && local.state.moves.length) {
        cont += `<button type="button" class="turn-row" data-cont="local"><span class="gi gi-checkers" aria-hidden="true"></span><span><b>Pass and play</b><small>${local.state.moves.length} moves in</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`;
      }
      const sw = (key, title, desc, val) => `<div class="setting"><label for="km-${key}"><b>${title}</b><small>${desc}</small></label><span class="switch"><input type="checkbox" id="km-${key}" data-k="${key}" ${val ? 'checked' : ''}><span></span></span></div>`;

      el.innerHTML = `
        ${cont}
        ${rows ? `<section class="turns"><h2>Games with ${pn}</h2>${rows}</section>` : ''}

        <section class="panel" aria-labelledby="km-bot">
          <h2 id="km-bot">Play the computer</h2>
          <div class="levels four-levels" role="radiogroup" aria-label="Bot level" id="km-level">${AI.LEVELS.map(l => `
            <button type="button" role="radio" class="level" data-v="${l.id}" aria-checked="${l.id === p.level}"><b>${esc(l.name)}</b><small>${esc(l.blurb)}</small><span class="best">${rec(st.bot[l.id])}</span></button>`).join('')}</div>
          <div class="pick-row"><span class="pick-label">First</span>${seg('km-first', [['me', 'You'], ['r', 'Random'], ['bot', 'Bot']], p.first)}</div>
          <button type="button" class="btn primary big" id="km-start">Play ${esc(lvl.name)} bot</button>
        </section>

        <section class="panel" aria-labelledby="km-rules">
          <h2 id="km-rules">Rules</h2>
          <div>
            ${sw('forced', 'Must jump', 'When you can capture, you have to.', p.rules.forced !== false)}
            ${sw('flying', 'Flying kings', 'Kings slide any distance and capture from far away.', !!p.rules.flying)}
          </div>
          <p class="small muted">Used for bots, pass and play, rooms and new challenges. <button type="button" class="linkish" id="km-how">How to play</button></p>
        </section>

        <section class="panel" aria-labelledby="km-online">
          <h2 id="km-online">${partner ? `Play ${pn}` : 'Play your partner'}</h2>
          ${partner ? `
            ${seg('km-mode', [['live', 'Live'], ['turns', 'Take turns']], p.mode)}
            <p class="pick-note">${p.mode === 'live' ? `Play right now. ${pn} gets an alert to join.` : 'Move whenever you like, and it waits on their phone.'}</p>
            <div class="pick-row"><span class="pick-label">First</span>${seg('km-ofirst', [['me', 'You'], ['r', 'Random'], ['them', pn]], p.onlineFirst)}</div>
            <button type="button" class="btn primary big" id="km-send">Send challenge</button>`
            : `<p class="pick-note">Link your phones from the main screen, then play live or a move at a time through the day.</p>
               <button type="button" class="btn" id="km-link">Link with your partner</button>`}
        </section>

        <div class="duo">
          <button type="button" class="tile" id="km-local"><span class="tile-k">One phone</span><span class="tile-t">Pass and play</span><span class="tile-m">Take turns on this phone</span></button>
          <button type="button" class="tile" id="km-look"><span class="tile-k">Style</span><span class="tile-t">Pieces and board</span><span class="tile-m">${esc((KV.SETS[KV.look().set] || KV.SETS.classic).name)}</span></button>
        </div>

        <button type="button" class="tile tv-tile" id="km-tv">
          <span class="tile-k">TV mode</span>
          <span class="tile-t">Play on the big screen</span>
          <span class="tile-m">The board goes on the TV and you each move from your phone. Open Blueline in a TV’s web browser, or on a laptop plugged into the TV, and tap here.</span>
        </button>

        <section class="panel">
          <h2>Play anyone with a code</h2>
          <p class="pick-note">For friends you haven’t linked with. Make a room and send the code, or join theirs.</p>
          <div class="actions row"><button type="button" class="btn" id="km-create">Make a room</button><button type="button" class="btn" id="km-join">Join a room</button></div>
        </section>

        <section class="panel stats-panel" aria-labelledby="km-stats">
          <h2 id="km-stats">Your record</h2>
          <div class="table-wrap"><table class="stats-table">
            <thead><tr><th>Opponent</th><th>Won</th><th>Lost</th><th>Drawn</th></tr></thead>
            <tbody>
              ${partner ? `<tr><td>${pn}</td><td>${st.partner.w || 0}</td><td>${st.partner.l || 0}</td><td>${st.partner.d || 0}</td></tr>` : ''}
              ${AI.LEVELS.map(l => { const s = st.bot[l.id] || {}; return `<tr><td>${esc(l.name)} bot</td><td>${s.w || 0}</td><td>${s.l || 0}</td><td>${s.d || 0}</td></tr>`; }).join('')}
            </tbody>
          </table></div>
        </section>`;

      const rerender = () => MENUS.checkers.render(el, api);
      $('#km-level', el).onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; const q = prefs(); q.level = +b.dataset.v; savePrefs(q); rerender(); };
      const segH = (id, key) => { const box = $('#' + id, el); if (box) box.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; const q = prefs(); q[key] = b.dataset.v; savePrefs(q); rerender(); }; };
      segH('km-first', 'first'); segH('km-mode', 'mode'); segH('km-ofirst', 'onlineFirst');
      $$('[aria-labelledby=km-rules] input[type=checkbox]', el).forEach(inp => inp.addEventListener('change', () => { const q = prefs(); q.rules[inp.dataset.k] = inp.checked; savePrefs(q); }));
      on(el, '#km-how', howTo);
      on(el, '#km-start', () => {
        const q = prefs();
        const seat = q.first === 'r' ? (Math.random() < 0.5 ? 0 : 1) : q.first === 'bot' ? 1 : 0;
        const go = () => api.startBot({ type: 'checkers', level: q.level, seat, opts: { rules: q.rules } });
        if (bot && bot.state && bot.state.winner == null && bot.state.moves.length) {
          BL.openSheet(`<h2 id="sheet-title">Start a new bot game?</h2><p class="lede">Your game against the ${esc((AI.LEVELS.find(l => l.id === bot.level) || lvl).name)} bot will be replaced.</p>
            <div class="actions"><button type="button" class="btn primary big" data-a="go">Start new game</button><button type="button" class="btn" data-a="keep">Keep my game</button></div>`,
          { onMount: b => { on(b, '[data-a=go]', () => { BL.closeSheet(); go(); }); on(b, '[data-a=keep]', () => BL.closeSheet()); } });
        } else go();
      });
      on(el, '#km-send', () => { const q = prefs(); api.startOnline('checkers', { mode: q.mode, rules: q.rules, color: q.onlineFirst === 'me' ? 'w' : q.onlineFirst === 'them' ? 'b' : 'r' }); });
      on(el, '#km-link', () => api.link());
      on(el, '#km-local', () => {
        if (local && local.state && local.state.winner == null && local.state.moves.length) api.resumeLocal('checkers');
        else api.startLocal('checkers', { rules: prefs().rules });
      });
      on(el, '#km-look', () => openLook(rerender));
      on(el, '#km-tv', () => api.startTv('checkers'));
      on(el, '#km-create', () => R().create('checkers', { rules: prefs().rules }, api));
      on(el, '#km-join', () => R().joinPrompt('', '', api));
      $$('[data-gid]', el).forEach(b => { b.onclick = () => api.openOnline(b.dataset.gid); });
      on(el, '[data-cont=bot]', () => api.resumeBot('checkers'));
      on(el, '[data-cont=local]', () => api.resumeLocal('checkers'));
    },
    rulesText,
  };
})();
