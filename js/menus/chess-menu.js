/* Chess menu: continue games, play the computer, play your partner (live with a
   clock, or take turns through the day), pass and play, stats, and the
   board-and-pieces customizer. */
(() => {
  'use strict';
  const BL = window.BL, esc = BL.esc;
  const AI = window.ChessAI, CV = window.BLViews.chess;
  const MENUS = window.BLMenus || (window.BLMenus = {});
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const on = (root, sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };

  const CLOCKS = [
    { id: '3+2', minutes: 3, increment: 2, label: '3 min', sub: '+2 s' },
    { id: '5+0', minutes: 5, increment: 0, label: '5 min', sub: 'Blitz' },
    { id: '10+0', minutes: 10, increment: 0, label: '10 min', sub: 'Rapid' },
    { id: '15+10', minutes: 15, increment: 10, label: '15 min', sub: '+10 s' },
    { id: '30+0', minutes: 30, increment: 0, label: '30 min', sub: 'Classical' },
  ];
  const prefs = () => Object.assign({ level: 3, color: 'w', mode: 'live', tc: '10+0', onlineColor: 'r' }, BL.store.get('chessPrefs', {}));
  const savePrefs = p => BL.store.set('chessPrefs', p);
  const stats = () => Object.assign({ bot: {}, partner: { w: 0, l: 0, d: 0 }, counted: {} }, BL.store.get('chessStats', {}));
  const rec = (o) => (o ? `${o.w || 0}–${o.l || 0}${o.d ? '–' + o.d : ''}` : '0–0');
  const colorName = c => ({ w: 'White', b: 'Black', r: 'Random' })[c];

  // Rooms: two phones (and a TV). Colors swap every game.
  const C = window.BLGames.chess;
  window.BLRooms.register('chess', {
    title: 'Chess', maxPlayers: 2,
    minPlayers: () => 2,
    describe: st => { const c = CLOCKS.find(x => x.id === st.tc); return c ? `${c.label} ${c.sub.toLowerCase()} clock` : 'No clock'; },
    start(r, entries) {
      const order = (r.played || 0) % 2 ? entries.slice().reverse() : entries;
      const c = CLOCKS.find(x => x.id === (r.settings || {}).tc);
      r.seats = order.map(([uid]) => uid);
      r.state = JSON.stringify(C.create({ clock: c ? { minutes: c.minutes, increment: c.increment } : null }));
    },
  });

  function seg(id, opts, val) {
    return `<div class="seg" role="radiogroup" id="${id}">${opts.map(([v, t]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${String(v) === String(val)}">${t}</button>`).join('')}</div>`;
  }

  // Mini board of the starting position for the look preview.
  function previewBoard() {
    const L = CV.look(), b = CV.BOARDS[L.board] || CV.BOARDS.blue;
    const rows = ['rnbqkbnr', 'pppppppp', '........', 'PPPPPPPP', 'RNBQKBNR'];
    let html = '';
    rows.forEach((row, r) => row.split('').forEach((p, f) => {
      html += `<span class="mp ${(f + r) % 2 ? 'dk' : 'lt'}">${p !== '.' ? CV.pieceHtml(p, L.pieces) : ''}</span>`;
    }));
    return `<div class="ch-mini ch set-${L.pieces} colors-${L.colors}" style="--sq-lt:${b.lt};--sq-dk:${b.dk}">${html}</div>`;
  }

  function openLook(onDone) {
    const L = CV.look();
    const sw = (key, title, desc) => `<div class="setting"><label for="cl-${key}"><b>${title}</b><small>${desc}</small></label><span class="switch"><input type="checkbox" id="cl-${key}" data-k="${key}" ${L[key] ? 'checked' : ''}><span></span></span></div>`;
    BL.openSheet(`
      <h2 id="sheet-title">Board and pieces</h2>
      <div id="cl-preview">${previewBoard()}</div>
      <div class="field"><span>Board</span>
        <div class="swatches" id="cl-board">${Object.entries(CV.BOARDS).map(([k, b]) => `<button type="button" class="swatch" data-v="${k}" aria-pressed="${L.board === k}"><i style="background:linear-gradient(135deg, ${b.lt} 0 50%, ${b.dk} 50% 100%)"></i><small>${esc(b.name)}</small></button>`).join('')}</div>
      </div>
      <div class="field"><span>Pieces</span>${seg('cl-pieces', Object.entries(CV.PIECE_SETS), L.pieces)}</div>
      <div class="field"><span>Piece colors</span>${seg('cl-colors', Object.entries(CV.PIECE_COLORS), L.colors)}</div>
      <div>
        ${sw('sound', 'Sounds', 'A soft click for moves, a thud for captures, and a chime when the game ends.')}
        ${sw('dots', 'Show legal moves', 'Dots on the squares the selected piece can move to.')}
        ${sw('coords', 'Coordinates', 'Letters and numbers along the board edges.')}
      </div>
      <div class="actions"><button type="button" class="btn primary big" data-a="done">Done</button></div>`, {
      onClose: () => onDone && onDone(),
      onMount: b => {
        const save = patch => {
          const next = Object.assign(CV.look(), patch);
          BL.store.set('chessLook', next);
          document.dispatchEvent(new Event('bl:chesslook'));
          $('#cl-preview', b).innerHTML = previewBoard();
        };
        $('#cl-board', b).onclick = e => {
          const x = e.target.closest('[data-v]');
          if (!x) return;
          $$('#cl-board .swatch', b).forEach(s => s.setAttribute('aria-pressed', String(s === x)));
          save({ board: x.dataset.v });
        };
        for (const [id, key] of [['cl-pieces', 'pieces'], ['cl-colors', 'colors']]) {
          $('#' + id, b).onclick = e => {
            const x = e.target.closest('[data-v]');
            if (!x) return;
            $$('button', $('#' + id, b)).forEach(s => s.setAttribute('aria-checked', String(s === x)));
            save({ [key]: x.dataset.v });
          };
        }
        $$('input[type=checkbox]', b).forEach(inp => inp.addEventListener('change', () => save({ [inp.dataset.k]: inp.checked })));
        on(b, '[data-a=done]', () => BL.closeSheet());
      },
    });
  }

  MENUS.chess = {
    title: 'Chess',
    look: openLook,
    CLOCKS,
    render(el, api) {
      const p = prefs(), st = stats(), partner = api.partner();
      const pn = partner ? esc(partner.name) : '';
      const bot = BL.store.get('chessBot', null), local = BL.store.get('chessLocal', null);
      const online = api.games('chess');
      const lvl = AI.LEVELS.find(l => l.id === p.level) || AI.LEVELS[2];

      // Continue cards
      let cont = '';
      if (bot && bot.state && bot.state.winner == null) {
        const L = AI.LEVELS.find(l => l.id === bot.level) || lvl;
        const n = (bot.state.moves || []).length;
        cont += `<button type="button" class="resume" data-cont="bot"><span class="resume-k">Continue</span><span class="resume-t">vs ${esc(L.name)} bot</span><span class="resume-m">You’re ${bot.seat === 0 ? 'white' : 'black'} · ${n ? `${Math.ceil(n / 2)} move${n > 2 ? 's' : ''} in` : 'not started'}</span><svg class="resume-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`;
      }
      const rows = online.filter(([, r]) => r.status === 'active').map(([gid, r]) => {
        const mine = api.isMyMove(r);
        const mode = r.mode === 'live' ? `Live ${r.tc || ''}` : 'Take turns';
        return `<button type="button" class="turn-row ${mine ? 'hot' : ''}" data-gid="${gid}"><span class="gi gi-chess" aria-hidden="true"></span><span><b>vs ${pn}</b><small>${esc(mode)} · ${mine ? 'Your move' : `${pn}’s move`}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`;
      }).join('');
      if (local && local.state && local.state.winner == null && (local.state.moves || []).length) {
        cont += `<button type="button" class="turn-row" data-cont="local"><span class="gi gi-chess" aria-hidden="true"></span><span><b>Pass and play</b><small>${Math.ceil(local.state.moves.length / 2)} moves in · ${local.state.turn === 0 ? 'White' : 'Black'} to move</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`;
      }

      el.innerHTML = `
        ${cont}
        ${rows ? `<section class="turns"><h2>Games with ${pn}</h2>${rows}</section>` : ''}

        <section class="panel" aria-labelledby="cm-bot">
          <h2 id="cm-bot">Play the computer</h2>
          <div class="levels" role="radiogroup" aria-label="Bot level" id="cm-level">${AI.LEVELS.map(l => `
            <button type="button" role="radio" class="level" data-v="${l.id}" aria-checked="${l.id === p.level}"><b>${esc(l.name)}</b><small>${esc(l.blurb)}</small><span class="best">${rec(st.bot[l.id])}</span></button>`).join('')}</div>
          <div class="pick-row"><span class="pick-label">Color</span>${seg('cm-color', [['w', 'White'], ['r', 'Random'], ['b', 'Black']], p.color)}</div>
          <button type="button" class="btn primary big" id="cm-start">Play ${esc(lvl.name)} bot</button>
        </section>

        <section class="panel" aria-labelledby="cm-online">
          <h2 id="cm-online">${partner ? `Play ${pn}` : 'Play your partner'}</h2>
          ${partner ? `
            ${seg('cm-mode', [['live', 'Live'], ['turns', 'Take turns']], p.mode)}
            <p class="pick-note" id="cm-mode-note"></p>
            <div class="clocks" id="cm-tc" ${p.mode === 'live' ? '' : 'hidden'}>${CLOCKS.map(c => `<button type="button" class="clock-chip" data-v="${c.id}" aria-pressed="${c.id === p.tc}"><b>${c.label}</b><small>${c.sub}</small></button>`).join('')}</div>
            <div class="pick-row"><span class="pick-label">Color</span>${seg('cm-ocolor', [['w', 'White'], ['r', 'Random'], ['b', 'Black']], p.onlineColor)}</div>
            <button type="button" class="btn primary big" id="cm-send">Send challenge</button>`
            : `<p class="pick-note">Link your phones from the main screen, then challenge each other to live games with a clock, or slow games you play through the day.</p>
               <button type="button" class="btn" id="cm-link">Link with your partner</button>`}
        </section>

        <div class="duo">
          <button type="button" class="tile" id="cm-local"><span class="tile-k">One phone</span><span class="tile-t">Pass and play</span><span class="tile-m">Take turns on this phone</span></button>
          <button type="button" class="tile" id="cm-look"><span class="tile-k">Style</span><span class="tile-t">Board and pieces</span><span class="tile-m" id="cm-look-m"></span></button>
        </div>

        <button type="button" class="tile tv-tile" id="cm-tv">
          <span class="tile-k">TV mode</span>
          <span class="tile-t">Play on the big screen</span>
          <span class="tile-m">The board goes on the TV with both clocks, and you each move from your phone. Open Blueline in a TV’s web browser, or on a laptop plugged into the TV, and tap here.</span>
        </button>

        <section class="panel">
          <h2>Play anyone with a code</h2>
          <p class="pick-note">For friends you haven’t linked with. Make a room and send the code, or join theirs. Uses the clock you picked above.</p>
          <div class="actions row"><button type="button" class="btn" id="cm-create">Make a room</button><button type="button" class="btn" id="cm-join">Join a room</button></div>
        </section>

        <section class="panel stats-panel" aria-labelledby="cm-stats">
          <h2 id="cm-stats">Your record</h2>
          <div class="table-wrap"><table class="stats-table">
            <thead><tr><th>Opponent</th><th>Won</th><th>Lost</th><th>Drawn</th></tr></thead>
            <tbody>
              ${partner ? `<tr><td>${pn}</td><td>${st.partner.w || 0}</td><td>${st.partner.l || 0}</td><td>${st.partner.d || 0}</td></tr>` : ''}
              ${AI.LEVELS.map(l => { const s = st.bot[l.id] || {}; return `<tr><td>${esc(l.name)} bot</td><td>${s.w || 0}</td><td>${s.l || 0}</td><td>${s.d || 0}</td></tr>`; }).join('')}
            </tbody>
          </table></div>
        </section>`;

      const L = CV.look();
      $('#cm-look-m', el).textContent = `${(CV.BOARDS[L.board] || CV.BOARDS.blue).name} · ${CV.PIECE_SETS[L.pieces]}`;
      const modeNote = () => {
        const n = $('#cm-mode-note', el);
        if (n) n.textContent = prefs().mode === 'live' ? 'Play right now with a chess clock. The clocks start after you’ve each made a move.' : 'No clock. Make a move whenever you like, and it waits on their phone.';
      };
      modeNote();

      $('#cm-level', el).onclick = e => {
        const b = e.target.closest('[data-v]'); if (!b) return;
        const q = prefs(); q.level = +b.dataset.v; savePrefs(q);
        $$('#cm-level .level', el).forEach(x => x.setAttribute('aria-checked', String(x === b)));
        $('#cm-start', el).textContent = `Play ${AI.LEVELS.find(l => l.id === q.level).name} bot`;
      };
      const segHandler = (id, key, after) => {
        const box = $('#' + id, el);
        if (!box) return;
        box.onclick = e => {
          const b = e.target.closest('[data-v]'); if (!b) return;
          const q = prefs(); q[key] = b.dataset.v; savePrefs(q);
          $$('button', box).forEach(x => x.setAttribute('aria-checked', String(x === b)));
          if (after) after(b.dataset.v);
        };
      };
      segHandler('cm-color', 'color');
      segHandler('cm-ocolor', 'onlineColor');
      segHandler('cm-mode', 'mode', v => { $('#cm-tc', el).hidden = v !== 'live'; modeNote(); });
      const tcBox = $('#cm-tc', el);
      if (tcBox) tcBox.onclick = e => {
        const b = e.target.closest('[data-v]'); if (!b) return;
        const q = prefs(); q.tc = b.dataset.v; savePrefs(q);
        $$('.clock-chip', tcBox).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      };

      on(el, '#cm-start', () => {
        const q = prefs();
        const seat = q.color === 'r' ? (Math.random() < 0.5 ? 0 : 1) : q.color === 'b' ? 1 : 0;
        const go = () => api.startBot({ level: q.level, seat });
        if (bot && bot.state && bot.state.winner == null && (bot.state.moves || []).length) {
          BL.openSheet(`<h2 id="sheet-title">Start a new bot game?</h2><p class="lede">Your game against the ${esc((AI.LEVELS.find(l => l.id === bot.level) || lvl).name)} bot will be replaced.</p>
            <div class="actions"><button type="button" class="btn primary big" data-a="go">Start new game</button><button type="button" class="btn" data-a="keep">Keep my game</button></div>`,
          { onMount: b => { on(b, '[data-a=go]', () => { BL.closeSheet(); go(); }); on(b, '[data-a=keep]', () => BL.closeSheet()); } });
        } else go();
      });
      on(el, '#cm-send', () => {
        const q = prefs();
        const tc = CLOCKS.find(c => c.id === q.tc) || CLOCKS[2];
        api.startOnline('chess', { mode: q.mode, tc: q.mode === 'live' ? tc : null, color: q.onlineColor });
      });
      on(el, '#cm-link', () => api.link());
      on(el, '#cm-local', () => {
        if (local && local.state && local.state.winner == null && (local.state.moves || []).length) api.resumeLocal('chess');
        else api.startLocal('chess');
      });
      on(el, '#cm-look', () => openLook(() => MENUS.chess.render(el, api)));
      on(el, '#cm-tv', () => api.startTv('chess'));
      on(el, '#cm-create', () => { const q = prefs(); window.BLRooms.create('chess', { tc: q.mode === 'live' ? q.tc : '' }, api); });
      on(el, '#cm-join', () => window.BLRooms.joinPrompt('', '', api));
      $$('[data-gid]', el).forEach(b => { b.onclick = () => api.openOnline(b.dataset.gid); });
      on(el, '[data-cont=bot]', () => api.resumeBot());
      on(el, '[data-cont=local]', () => api.resumeLocal('chess'));
    },
  };
})();
