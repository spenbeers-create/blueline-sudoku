/* Four in a Row menu: continue games, play the computer (four levels), play your
   partner (live or through the day), pass and play, TV mode, rooms for playing
   anyone with a code, your record, and the board-and-discs style sheet. */
(() => {
  'use strict';
  const BL = window.BL, esc = BL.esc, F = window.BLGames.four, AI = window.FourAI, FV = window.BLViews.four;
  const MENUS = window.BLMenus || (window.BLMenus = {});
  const R = () => window.BLRooms;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const on = (root, sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };

  const prefs = () => Object.assign({ level: 2, first: 'me', size: 'classic', mode: 'live', onlineFirst: 'r', onlineSize: 'classic' }, BL.store.get('fourPrefs', {}));
  const savePrefs = p => BL.store.set('fourPrefs', p);
  const stats = () => Object.assign({ bot: {}, partner: { w: 0, l: 0, d: 0 } }, BL.store.get('fourStats', {}));
  const rec = o => (o ? `${o.w || 0}–${o.l || 0}${o.d ? '–' + o.d : ''}` : '0–0');
  const sizeOpts = () => Object.entries(F.SIZES).map(([k, z]) => [k, `${z.name} <small>${z.sub}</small>`]);

  function seg(id, opts, val) {
    return `<div class="seg" role="radiogroup" id="${id}">${opts.map(([v, t]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${String(v) === String(val)}">${t}</button>`).join('')}</div>`;
  }

  // Rooms: two phones, or two phones and a TV. Who goes first alternates each game.
  R().register('four', {
    title: 'Four in a Row', maxPlayers: 2,
    minPlayers: () => 2,
    describe: st => { const z = F.SIZES[st.size] || F.SIZES.classic; return `${z.name} board, ${z.sub}`; },
    start(r, entries) {
      const order = (r.played || 0) % 2 ? entries.slice().reverse() : entries;
      r.seats = order.map(([uid]) => uid);
      r.state = JSON.stringify(F.create({ size: (r.settings || {}).size, first: 0 }));
    },
  });

  // ----------------------------------------------------------- style sheet
  function preview() {
    const L = FV.look(), [c0, c1] = FV.seatColors(0, true, L);
    const pattern = ['......', '...1..', '..10..', '.0110.', '00101.'];
    const frame = (FV.BOARDS[L.board] || FV.BOARDS.night).frame;
    return `<div class="c4 c4-mini style-${L.style}" style="--d0:${c0};--d1:${c1};--c4-frame:${frame};--cols:6"><div class="c4-grid">${pattern.join('').split('').map(v => `<span class="c4-cell${v === '0' ? ' p0' : v === '1' ? ' p1' : ''}"><i></i></span>`).join('')}</div></div>`;
  }
  function openLook(onDone) {
    const L = FV.look();
    const discRow = (id, val) => `<div class="disc-swatches" id="${id}">${Object.entries(FV.DISCS).map(([k, d]) => `<button type="button" class="disc-sw" data-v="${k}" aria-pressed="${val === k}" aria-label="${esc(d.name)}"><i style="background:${d.c}"></i></button>`).join('')}</div>`;
    const sw = (key, title, desc) => `<div class="setting"><label for="fl-${key}"><b>${title}</b><small>${desc}</small></label><span class="switch"><input type="checkbox" id="fl-${key}" data-k="${key}" ${L[key] ? 'checked' : ''}><span></span></span></div>`;
    BL.openSheet(`
      <h2 id="sheet-title">Board and discs</h2>
      <div id="fl-preview">${preview()}</div>
      <div class="field"><span>Your discs</span>${discRow('fl-mine', L.mine)}</div>
      <div class="field"><span>Their discs</span>${discRow('fl-theirs', L.theirs)}</div>
      <div class="field"><span>Board</span>
        <div class="swatches" id="fl-board">${Object.entries(FV.BOARDS).map(([k, b]) => `<button type="button" class="swatch" data-v="${k}" aria-pressed="${L.board === k}"><i style="background:${b.frame}"></i><small>${esc(b.name)}</small></button>`).join('')}</div>
      </div>
      <div class="field"><span>Disc style</span>${seg('fl-style', Object.entries(FV.STYLES), L.style)}</div>
      <div>
        ${sw('sound', 'Sounds', 'A clack when a disc lands, and a chime when someone wins.')}
      </div>
      <div class="actions"><button type="button" class="btn primary big" data-a="done">Done</button></div>`, {
      onClose: () => onDone && onDone(),
      onMount: b => {
        const save = patch => {
          BL.store.set('fourLook', Object.assign(FV.look(), patch));
          document.dispatchEvent(new Event('bl:fourlook'));
          $('#fl-preview', b).innerHTML = preview();
        };
        const pick = (id, key, sel) => {
          $('#' + id, b).onclick = e => {
            const x = e.target.closest('[data-v]');
            if (!x) return;
            $$(sel, $('#' + id, b)).forEach(s => s.setAttribute(sel === 'button[role=radio]' ? 'aria-checked' : 'aria-pressed', String(s === x)));
            save({ [key]: x.dataset.v });
          };
        };
        pick('fl-mine', 'mine', '.disc-sw');
        pick('fl-theirs', 'theirs', '.disc-sw');
        pick('fl-board', 'board', '.swatch');
        pick('fl-style', 'style', 'button[role=radio]');
        $$('input[type=checkbox]', b).forEach(inp => inp.addEventListener('change', () => save({ [inp.dataset.k]: inp.checked })));
        on(b, '[data-a=done]', () => BL.closeSheet());
      },
    });
  }

  // ------------------------------------------------------------------ menu
  MENUS.four = {
    title: 'Four in a Row',
    look: openLook,
    lookLabel: 'Board and discs',
    render(el, api) {
      const p = prefs(), st = stats(), partner = api.partner();
      const pn = partner ? esc(partner.name) : '';
      const bot = BL.store.get('fourBot', null), local = BL.store.get('fourLocal', null);
      const online = api.games('four');
      const lvl = AI.LEVELS.find(l => l.id === p.level) || AI.LEVELS[1];
      const sizeName = s => (F.SIZES[s.size] || F.SIZES.classic).name;

      let cont = '';
      if (bot && bot.state && bot.state.winner == null && bot.state.moves.length) {
        const L = AI.LEVELS.find(l => l.id === bot.level) || lvl;
        cont += `<button type="button" class="resume" data-cont="bot"><span class="resume-k">Continue</span><span class="resume-t">vs ${esc(L.name)} bot</span><span class="resume-m">${sizeName(bot.state)} board · ${bot.state.moves.length} discs in · ${bot.state.turn === bot.seat ? 'your move' : 'bot’s move'}</span><svg class="resume-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`;
      }
      const rows = online.filter(([, r]) => r.status === 'active').map(([gid, r]) => {
        const mine = api.isMyMove(r);
        return `<button type="button" class="turn-row ${mine ? 'hot' : ''}" data-gid="${gid}"><span class="gi gi-four" aria-hidden="true"></span><span><b>vs ${pn}</b><small>${r.mode === 'live' ? 'Live' : 'Take turns'} · ${mine ? 'Your move' : `${pn}’s move`}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`;
      }).join('');
      if (local && local.state && local.state.winner == null && local.state.moves.length) {
        cont += `<button type="button" class="turn-row" data-cont="local"><span class="gi gi-four" aria-hidden="true"></span><span><b>Pass and play</b><small>${sizeName(local.state)} board · ${local.state.moves.length} discs in</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`;
      }

      el.innerHTML = `
        ${cont}
        ${rows ? `<section class="turns"><h2>Games with ${pn}</h2>${rows}</section>` : ''}

        <section class="panel" aria-labelledby="fm4-bot">
          <h2 id="fm4-bot">Play the computer</h2>
          <div class="levels four-levels" role="radiogroup" aria-label="Bot level" id="fm4-level">${AI.LEVELS.map(l => `
            <button type="button" role="radio" class="level" data-v="${l.id}" aria-checked="${l.id === p.level}"><b>${esc(l.name)}</b><small>${esc(l.blurb)}</small><span class="best">${rec(st.bot[l.id])}</span></button>`).join('')}</div>
          <div class="pick-row"><span class="pick-label">First</span>${seg('fm4-first', [['me', 'You'], ['r', 'Random'], ['bot', 'Bot']], p.first)}</div>
          <div class="pick-row"><span class="pick-label">Board</span>${seg('fm4-size', sizeOpts(), p.size)}</div>
          <button type="button" class="btn primary big" id="fm4-start">Play ${esc(lvl.name)} bot</button>
        </section>

        <section class="panel" aria-labelledby="fm4-online">
          <h2 id="fm4-online">${partner ? `Play ${pn}` : 'Play your partner'}</h2>
          ${partner ? `
            ${seg('fm4-mode', [['live', 'Live'], ['turns', 'Take turns']], p.mode)}
            <p class="pick-note" id="fm4-mode-note"></p>
            <div class="pick-row"><span class="pick-label">First</span>${seg('fm4-ofirst', [['me', 'You'], ['r', 'Random'], ['them', esc(partner.name)]], p.onlineFirst)}</div>
            <div class="pick-row"><span class="pick-label">Board</span>${seg('fm4-osize', sizeOpts(), p.onlineSize)}</div>
            <button type="button" class="btn primary big" id="fm4-send">Send challenge</button>`
            : `<p class="pick-note">Link your phones from the main screen, then play live or a move at a time through the day.</p>
               <button type="button" class="btn" id="fm4-link">Link with your partner</button>`}
        </section>

        <div class="duo">
          <button type="button" class="tile" id="fm4-local"><span class="tile-k">One phone</span><span class="tile-t">Pass and play</span><span class="tile-m">Take turns on this phone</span></button>
          <button type="button" class="tile" id="fm4-look"><span class="tile-k">Style</span><span class="tile-t">Board and discs</span><span class="tile-m" id="fm4-look-m"></span></button>
        </div>

        <button type="button" class="tile tv-tile" id="fm4-tv">
          <span class="tile-k">TV mode</span>
          <span class="tile-t">Play on the big screen</span>
          <span class="tile-m">Open Blueline in a TV’s web browser, or on a laptop plugged into the TV, and tap here. You both drop discs from your phones.</span>
        </button>

        <section class="panel">
          <h2>Play anyone with a code</h2>
          <p class="pick-note">For friends you haven’t linked with. Make a room and send them the code, or join theirs.</p>
          <div class="actions row"><button type="button" class="btn" id="fm4-create">Make a room</button><button type="button" class="btn" id="fm4-join">Join a room</button></div>
        </section>

        <section class="panel stats-panel" aria-labelledby="fm4-stats">
          <h2 id="fm4-stats">Your record</h2>
          <div class="table-wrap"><table class="stats-table">
            <thead><tr><th>Opponent</th><th>Won</th><th>Lost</th><th>Drawn</th></tr></thead>
            <tbody>
              ${partner ? `<tr><td>${pn}</td><td>${st.partner.w || 0}</td><td>${st.partner.l || 0}</td><td>${st.partner.d || 0}</td></tr>` : ''}
              ${AI.LEVELS.map(l => { const s = st.bot[l.id] || {}; return `<tr><td>${esc(l.name)} bot</td><td>${s.w || 0}</td><td>${s.l || 0}</td><td>${s.d || 0}</td></tr>`; }).join('')}
            </tbody>
          </table></div>
        </section>`;

      const L = FV.look();
      $('#fm4-look-m', el).textContent = `${FV.DISCS[L.mine] ? FV.DISCS[L.mine].name : 'Blue'} vs ${FV.DISCS[L.theirs] ? FV.DISCS[L.theirs].name : 'Orange'} · ${(FV.BOARDS[L.board] || FV.BOARDS.night).name} board`;
      const modeNote = () => {
        const n = $('#fm4-mode-note', el);
        if (n) n.textContent = prefs().mode === 'live' ? `Play right now. ${partner ? partner.name : 'They'} gets an alert to join.` : 'Drop a disc whenever you like, and it waits on their phone.';
      };
      modeNote();

      $('#fm4-level', el).onclick = e => {
        const b = e.target.closest('[data-v]'); if (!b) return;
        const q = prefs(); q.level = +b.dataset.v; savePrefs(q);
        $$('#fm4-level .level', el).forEach(x => x.setAttribute('aria-checked', String(x === b)));
        $('#fm4-start', el).textContent = `Play ${AI.LEVELS.find(l => l.id === q.level).name} bot`;
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
      segHandler('fm4-first', 'first');
      segHandler('fm4-size', 'size');
      segHandler('fm4-mode', 'mode', modeNote);
      segHandler('fm4-ofirst', 'onlineFirst');
      segHandler('fm4-osize', 'onlineSize');

      on(el, '#fm4-start', () => {
        const q = prefs();
        const seat = q.first === 'r' ? (Math.random() < 0.5 ? 0 : 1) : q.first === 'bot' ? 1 : 0;
        const go = () => api.startBot({ type: 'four', level: q.level, seat, opts: { size: q.size } });
        if (bot && bot.state && bot.state.winner == null && bot.state.moves.length) {
          BL.openSheet(`<h2 id="sheet-title">Start a new bot game?</h2><p class="lede">Your game against the ${esc((AI.LEVELS.find(l => l.id === bot.level) || lvl).name)} bot will be replaced.</p>
            <div class="actions"><button type="button" class="btn primary big" data-a="go">Start new game</button><button type="button" class="btn" data-a="keep">Keep my game</button></div>`,
          { onMount: b => { on(b, '[data-a=go]', () => { BL.closeSheet(); go(); }); on(b, '[data-a=keep]', () => BL.closeSheet()); } });
        } else go();
      });
      on(el, '#fm4-send', () => {
        const q = prefs();
        api.startOnline('four', { mode: q.mode, size: q.onlineSize, color: q.onlineFirst === 'me' ? 'w' : q.onlineFirst === 'them' ? 'b' : 'r' });
      });
      on(el, '#fm4-link', () => api.link());
      on(el, '#fm4-local', () => {
        if (local && local.state && local.state.winner == null && local.state.moves.length) api.resumeLocal('four');
        else api.startLocal('four', { size: prefs().size });
      });
      on(el, '#fm4-look', () => openLook(() => MENUS.four.render(el, api)));
      on(el, '#fm4-tv', () => api.startTv('four'));
      on(el, '#fm4-create', () => R().create('four', { size: prefs().onlineSize }, api));
      on(el, '#fm4-join', () => R().joinPrompt('', '', api));
      $$('[data-gid]', el).forEach(b => { b.onclick = () => api.openOnline(b.dataset.gid); });
      on(el, '[data-cont=bot]', () => api.resumeBot('four'));
      on(el, '[data-cont=local]', () => api.resumeLocal('four'));
    },
  };
})();
