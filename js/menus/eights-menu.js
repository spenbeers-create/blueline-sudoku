/* Crazy Eights menu: continue games, play 1 to 5 bots, house rules, your partner
   (live or through the day), pass and play, TV mode, party rooms for up to 6,
   your record, and the cards-and-table style sheet. */
(() => {
  'use strict';
  const BL = window.BL, esc = BL.esc, E = window.BLGames.eights, EV = window.BLViews.eights, O = window.Online;
  const MENUS = window.BLMenus || (window.BLMenus = {});
  const R = () => window.BLRooms;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const on = (root, sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
  const myName = () => (BL.settings.name || '').trim() || 'You';

  const LEVELS = [
    { id: 1, name: 'Easy', blurb: 'Plays any card that fits' },
    { id: 2, name: 'Normal', blurb: 'Saves its eights' },
    { id: 3, name: 'Hard', blurb: 'Remembers what you’re out of' },
  ];
  const BOT_NAMES = ['Pip', 'Juno', 'Rex', 'Mabel', 'Ozzy', 'Tilly', 'Bruno'];
  const prefs = () => {
    const p = Object.assign({ bots: 2, skill: 2, mode: 'live' }, BL.store.get('eightsPrefs', {}));
    p.rules = Object.assign({}, E.DEFAULT_RULES, p.rules || {});
    return p;
  };
  const savePrefs = p => BL.store.set('eightsPrefs', p);
  const stats = () => Object.assign({ bot: {}, partner: { w: 0, l: 0, d: 0 }, rooms: { p: 0, w: 0 }, counted: {} }, BL.store.get('eightsStats', {}));
  function rulesText(rl) {
    const on = [rl.twos && 'twos', rl.skip && 'skips', rl.reverse && 'reverses'].filter(Boolean);
    const list = on.length ? on.length === 1 ? on[0] : `${on.slice(0, -1).join(', ')} and ${on[on.length - 1]}` : 'plain rules';
    return `${list[0].toUpperCase() + list.slice(1)} · ${rl.drawOne ? 'draw one' : 'draw till you can'}${rl.hand ? ` · ${rl.hand} cards` : ''}`;
  }
  function seg(id, opts, val) {
    return `<div class="seg" role="radiogroup" id="${id}">${opts.map(([v, t]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${String(v) === String(val)}">${t}</button>`).join('')}</div>`;
  }

  // Rooms for 2 to 6 phones (and the TV). The dealer moves round each game.
  R().register('eights', {
    title: 'Crazy Eights', maxPlayers: 6,
    minPlayers: () => 2,
    describe: st => rulesText(Object.assign({}, E.DEFAULT_RULES, st.rules || {})),
    start(r, entries) {
      const n = entries.length;
      r.seats = entries.map(([uid]) => uid);
      r.state = JSON.stringify(E.create({ seed: O.code(10), players: entries.map(([, p]) => ({ name: p.name || 'Player' })), rules: (r.settings || {}).rules, first: (r.played || 0) % n }));
    },
  });

  // ------------------------------------------------------------- results
  function record(m) {
    const s = m.state, st = stats(), key = `bots:${s.seed}`;
    if (st.counted[key]) return;
    st.counted[key] = 1;
    const keys = Object.keys(st.counted);
    if (keys.length > 200) delete st.counted[keys[0]];
    const lv = m.cardCfg.level;
    st.bot[lv] = st.bot[lv] || { w: 0, l: 0, d: 0 };
    st.bot[lv][s.winner === m.seat ? 'w' : 'l']++;
    BL.store.set('eightsStats', st);
  }
  function renderResult(box, m, api) {
    if (!m.cardBots) return false;
    const s = m.state;
    if (!E.over(s)) { box.hidden = true; return true; }
    record(m);
    const win = s.winner === m.seat, left = s.hands[m.seat].length;
    box.hidden = false;
    box.className = 'p-result';
    box.innerHTML = `<div><b>${win ? 'You win!' : `${esc(s.players[s.winner].name)} wins`}</b><p>${win ? 'You played your last card.' : `You had ${left} card${left === 1 ? '' : 's'} left.`}</p></div>
      <div class="actions row"><button type="button" class="btn primary" data-a="again">Deal again</button><button type="button" class="btn" data-a="menu">Menu</button></div>`;
    on(box, '[data-a=again]', () => api.startCards(m.cardCfg));
    on(box, '[data-a=menu]', () => api.back());
    return true;
  }
  function botGame(api) {
    const p = prefs(), names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    const players = [{ name: myName() }];
    for (let i = 0; i < p.bots; i++) players.push({ name: names[i], bot: p.skill });
    api.startCards({ players, rules: p.rules, level: p.skill });
  }

  // ---------------------------------------------------------- style sheet
  function preview() {
    const L = EV.look(), f = EV.FELTS[L.felt] || EV.FELTS.green, b = EV.BACKS[L.back] || EV.BACKS.blue;
    return `<div class="e8-preview${L.big ? ' big-index' : ''}" style="--felt:${f.c};--back-a:${b.a};--back-b:${b.b}">
      ${EV.backHtml()}${['8H', 'QS', '7D', 'KC'].map(c => EV.cardHtml(c, '', L)).join('')}</div>`;
  }
  function openLook(onDone) {
    const L = EV.look();
    const sw = (key, title, desc) => `<div class="setting"><label for="el-${key}"><b>${title}</b><small>${desc}</small></label><span class="switch"><input type="checkbox" id="el-${key}" data-k="${key}" ${L[key] ? 'checked' : ''}><span></span></span></div>`;
    BL.openSheet(`
      <h2 id="sheet-title">Cards and table</h2>
      <div id="el-preview">${preview()}</div>
      <div class="field"><span>Table</span><div class="swatches five" id="el-felt">${Object.entries(EV.FELTS).map(([k, f]) => `<button type="button" class="swatch" data-v="${k}" aria-pressed="${L.felt === k}"><i style="background:${f.c}"></i><small>${esc(f.name)}</small></button>`).join('')}</div></div>
      <div class="field"><span>Card backs</span><div class="swatches five" id="el-back">${Object.entries(EV.BACKS).map(([k, b]) => `<button type="button" class="swatch" data-v="${k}" aria-pressed="${L.back === k}"><i style="background:repeating-linear-gradient(45deg, ${b.a} 0 5px, ${b.b} 5px 10px)"></i><small>${esc(b.name)}</small></button>`).join('')}</div></div>
      <div>
        ${sw('four', 'Four-color suits', 'Spades black, hearts red, diamonds blue, clubs green. Easier to tell apart.')}
        ${sw('big', 'Big corners', 'Larger numbers on your cards.')}
        ${sw('sound', 'Sounds', 'A flick when cards are played and a chime when someone wins.')}
      </div>
      <div class="actions"><button type="button" class="btn primary big" data-a="done">Done</button></div>`, {
      onClose: () => onDone && onDone(),
      onMount: b => {
        const save = patch => {
          BL.store.set('eightsLook', Object.assign(EV.look(), patch));
          document.dispatchEvent(new Event('bl:eightslook'));
          $('#el-preview', b).innerHTML = preview();
        };
        for (const [id, key] of [['el-felt', 'felt'], ['el-back', 'back']]) {
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
      <p class="lede">Play a card that matches the top card’s suit or number. Eights are wild: play one any time and pick the next suit. Can’t play? Draw from the deck. First to get rid of every card wins.</p>
      <p class="lede"><b>House rules</b> you can switch on or off:</p>
      <p class="lede"><b>Twos</b> make the next player draw 2, unless they play a 2 of their own, which passes on 4 to the next person, and so on.<br><b>Queens</b> skip the next player.<br><b>Aces</b> reverse the direction. With two players, an ace works like a skip.<br><b>Draw one</b> lets you pass after drawing a single card, instead of drawing until you can play.</p>
      <div class="actions"><button type="button" class="btn primary big" data-a="x">Got it</button></div>`, { onMount: b => on(b, '[data-a=x]', () => BL.closeSheet()) });
  }

  // ------------------------------------------------------------------ menu
  MENUS.eights = {
    title: 'Crazy Eights',
    look: openLook,
    lookLabel: 'Cards and table',
    renderResult: (box, m, api) => renderResult(box, m, api),
    render(el, api) {
      const p = prefs(), st = stats(), partner = api.partner(), pn = partner ? esc(partner.name) : '';
      const bot = BL.store.get('eightsBot', null), local = BL.store.get('eightsLocal', null);
      const online = api.games('eights');
      let cont = '';
      if (bot && bot.state && bot.state.winner == null) {
        const others = bot.state.players.length - 1;
        cont += `<button type="button" class="resume" data-cont="bot"><span class="resume-k">Continue</span><span class="resume-t">vs ${others} bot${others === 1 ? '' : 's'}</span><span class="resume-m">${bot.state.hands[0].length} cards in your hand · ${bot.state.turn === 0 ? 'your turn' : 'their turn'}</span><svg class="resume-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`;
      }
      const rows = online.filter(([, r]) => r.status === 'active').map(([gid, r]) => {
        const mine = api.isMyMove(r);
        return `<button type="button" class="turn-row ${mine ? 'hot' : ''}" data-gid="${gid}"><span class="gi gi-eights" aria-hidden="true"></span><span><b>vs ${pn}</b><small>${r.mode === 'live' ? 'Live' : 'Take turns'} · ${mine ? 'Your turn' : `${pn}’s turn`}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`;
      }).join('');
      if (local && local.state && local.state.winner == null && local.state.log && local.state.log.length) {
        cont += `<button type="button" class="turn-row" data-cont="local"><span class="gi gi-eights" aria-hidden="true"></span><span><b>Pass and play</b><small>Game in progress</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`;
      }
      const rl = p.rules;
      const sw = (key, title, desc) => `<div class="setting"><label for="em-${key}"><b>${title}</b><small>${desc}</small></label><span class="switch"><input type="checkbox" id="em-${key}" data-k="${key}" ${rl[key] ? 'checked' : ''}><span></span></span></div>`;

      el.innerHTML = `
        ${cont}
        ${rows ? `<section class="turns"><h2>Games with ${pn}</h2>${rows}</section>` : ''}

        <section class="panel" aria-labelledby="em-bot">
          <h2 id="em-bot">Play the computer</h2>
          <div class="levels" role="radiogroup" aria-label="Bot skill" id="em-skill">${LEVELS.map(l => { const r = st.bot[l.id] || {}; return `
            <button type="button" role="radio" class="level" data-v="${l.id}" aria-checked="${l.id === p.skill}"><b>${esc(l.name)}</b><small>${esc(l.blurb)}</small><span class="best">${r.w || 0}–${r.l || 0}</span></button>`; }).join('')}</div>
          <div class="pick-row"><span class="pick-label">Bots</span>${seg('em-bots', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], p.bots)}</div>
          <button type="button" class="btn primary big" id="em-start">Deal vs ${p.bots} bot${p.bots > 1 ? 's' : ''}</button>
        </section>

        <section class="panel" aria-labelledby="em-rules">
          <h2 id="em-rules">House rules</h2>
          <div>
            ${sw('twos', 'Twos', 'The next player draws 2, or stacks a 2 to pass it on.')}
            ${sw('skip', 'Queens skip', 'The next player misses their turn.')}
            ${sw('reverse', 'Aces reverse', 'Play goes the other way.')}
          </div>
          <div class="pick-row"><span class="pick-label">Draw</span>${seg('em-draw', [['0', 'Till you can play'], ['1', 'One card']], rl.drawOne ? '1' : '0')}</div>
          <div class="pick-row"><span class="pick-label">Hand</span>${seg('em-hand', [['0', 'Usual'], ['5', '5 cards'], ['7', '7 cards']], String(rl.hand || 0))}</div>
          <p class="small muted">Used for bots, rooms, pass and play, and new challenges. <button type="button" class="linkish" id="em-how">How to play</button></p>
        </section>

        <section class="panel" aria-labelledby="em-online">
          <h2 id="em-online">${partner ? `Play ${pn}` : 'Play your partner'}</h2>
          ${partner ? `${seg('em-mode', [['live', 'Live'], ['turns', 'Take turns']], p.mode)}
            <p class="pick-note">${p.mode === 'live' ? `Play right now. ${pn} gets an alert to join.` : 'Play a card whenever you like, and it waits on their phone.'}</p>
            <button type="button" class="btn primary big" id="em-send">Send challenge</button>`
            : `<p class="pick-note">Link your phones from the main screen, then play live or a card at a time through the day.</p>
               <button type="button" class="btn" id="em-link">Link with your partner</button>`}
        </section>

        <div class="duo">
          <button type="button" class="tile" id="em-local"><span class="tile-k">One phone</span><span class="tile-t">Pass and play</span><span class="tile-m">Two players. Your hand hides between turns</span></button>
          <button type="button" class="tile" id="em-look"><span class="tile-k">Style</span><span class="tile-t">Cards and table</span><span class="tile-m">${esc((EV.FELTS[EV.look().felt] || EV.FELTS.green).name)} table · ${esc((EV.BACKS[EV.look().back] || EV.BACKS.blue).name)} backs</span></button>
        </div>

        <button type="button" class="tile tv-tile" id="em-tv">
          <span class="tile-k">TV mode</span>
          <span class="tile-t">Deal on the big screen</span>
          <span class="tile-m">The table goes on the TV and everyone holds their cards on their phone. 2 to 6 players. Open Blueline in a TV’s web browser, or on a laptop plugged into the TV, and tap here.</span>
        </button>

        <section class="panel">
          <h2>Party room</h2>
          <p class="pick-note">Up to 6 players, each on their own phone. Share the code or a link.</p>
          <div class="actions row"><button type="button" class="btn primary" id="em-create">Create a room</button><button type="button" class="btn" id="em-join">Join a room</button></div>
        </section>

        <section class="panel stats-panel" aria-labelledby="em-stats">
          <h2 id="em-stats">Your record</h2>
          <div class="table-wrap"><table class="stats-table">
            <thead><tr><th>Opponent</th><th>Won</th><th>Lost</th></tr></thead>
            <tbody>
              ${partner ? `<tr><td>${pn}</td><td>${st.partner.w || 0}</td><td>${st.partner.l || 0}</td></tr>` : ''}
              ${LEVELS.map(l => { const r = st.bot[l.id] || {}; return `<tr><td>${esc(l.name)} bots</td><td>${r.w || 0}</td><td>${r.l || 0}</td></tr>`; }).join('')}
            </tbody>
          </table></div>
        </section>`;

      const rerender = () => MENUS.eights.render(el, api);
      $('#em-skill', el).onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; const q = prefs(); q.skill = +b.dataset.v; savePrefs(q); rerender(); };
      const segH = (id, fn) => { const box = $('#' + id, el); if (box) box.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; const q = prefs(); fn(q, b.dataset.v); savePrefs(q); rerender(); }; };
      segH('em-bots', (q, v) => { q.bots = +v; });
      segH('em-draw', (q, v) => { q.rules.drawOne = v === '1'; });
      segH('em-hand', (q, v) => { q.rules.hand = +v; });
      segH('em-mode', (q, v) => { q.mode = v; });
      $$('[aria-labelledby=em-rules] input[type=checkbox]', el).forEach(inp => inp.addEventListener('change', () => { const q = prefs(); q.rules[inp.dataset.k] = inp.checked; savePrefs(q); }));
      on(el, '#em-how', howTo);
      on(el, '#em-start', () => {
        if (bot && bot.state && bot.state.winner == null) {
          BL.openSheet(`<h2 id="sheet-title">Deal a new game?</h2><p class="lede">Your game against the bots will be replaced.</p>
            <div class="actions"><button type="button" class="btn primary big" data-a="go">Deal new game</button><button type="button" class="btn" data-a="keep">Keep my game</button></div>`,
          { onMount: b => { on(b, '[data-a=go]', () => { BL.closeSheet(); botGame(api); }); on(b, '[data-a=keep]', () => BL.closeSheet()); } });
        } else botGame(api);
      });
      on(el, '#em-send', () => api.startOnline('eights', { mode: prefs().mode, rules: prefs().rules }));
      on(el, '#em-link', () => api.link());
      on(el, '#em-local', () => {
        if (local && local.state && local.state.winner == null && local.state.log && local.state.log.length) api.resumeLocal('eights');
        else api.startLocal('eights', { rules: prefs().rules });
      });
      on(el, '#em-look', () => openLook(rerender));
      on(el, '#em-tv', () => api.startTv('eights'));
      on(el, '#em-create', () => R().create('eights', { rules: prefs().rules }, api));
      on(el, '#em-join', () => R().joinPrompt('', '', api));
      $$('[data-gid]', el).forEach(b => { b.onclick = () => api.openOnline(b.dataset.gid); });
      on(el, '[data-cont=bot]', () => api.resumeCards());
      on(el, '[data-cont=local]', () => api.resumeLocal('eights'));
    },
    LEVELS, rulesText, prefs,
  };
})();
