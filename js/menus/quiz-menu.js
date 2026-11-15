/* Menus for the answer-at-once games, More or Less and Measure Up: practice alone,
   duel your partner (they get an alert to join), TV mode, party rooms for up to 8,
   settings and your bests. Also their room setup and practice results. */
(() => {
  'use strict';
  const BL = window.BL, esc = BL.esc, O = window.Online, G = window.BLGames;
  const MENUS = window.BLMenus || (window.BLMenus = {});
  const R = () => window.BLRooms;
  const $ = (s, el = document) => el.querySelector(s);
  const on = (root, sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
  const myName = () => (BL.settings.name || '').trim() || 'You';
  const prefs = () => Object.assign({ units: window.BLViews.measure.prefs().units, sound: true, mlLives: 3, mlTime: 15, muRounds: 10, muTime: 25 }, BL.store.get('quizPrefs', {}));
  const savePrefs = p => { BL.store.set('quizPrefs', p); document.dispatchEvent(new Event('bl:quizprefs')); };
  const stats = () => Object.assign({ mlBest: 0, mlStreak: 0, mlGames: 0, muBest: 0, muGames: 0, counted: {} }, BL.store.get('quizStats', {}));
  function seg(id, opts, val) {
    return `<div class="seg" role="radiogroup" id="${id}">${opts.map(([v, t]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${String(v) === String(val)}">${t}</button>`).join('')}</div>`;
  }
  const settingsFor = type => {
    const p = prefs();
    return type === 'moreless' ? { lives: p.mlLives, time: p.mlTime * 1000 } : { rounds: p.muRounds, time: p.muTime * 1000 };
  };

  // Rooms: up to 8 phones, or with the TV. The game starts as soon as it's dealt.
  const startWith = type => (r, entries) => {
    const g = G[type], st = r.settings || {};
    let s = g.create(Object.assign({ seed: O.code(10), players: entries.map(([, p]) => ({ name: p.name || 'Player' })) }, st));
    s = g.apply(s, { start: true, at: O.now() }, 0);
    r.seats = entries.map(([uid]) => uid);
    r.state = JSON.stringify(s);
  };
  R().register('moreless', {
    title: 'More or Less', maxPlayers: 8, minPlayers: r => (r.screen ? 1 : 2),
    describe: st => `${st.lives || 3} ${st.lives === 1 ? 'life' : 'lives'} · ${st.time ? `${Math.round(st.time / 1000)} seconds to answer` : 'no timer'}`,
    start: startWith('moreless'),
  });
  R().register('measure', {
    title: 'Measure Up', maxPlayers: 8, minPlayers: r => (r.screen ? 1 : 2),
    describe: st => `${st.rounds || 10} rounds · ${st.time ? `${Math.round(st.time / 1000)} seconds to guess` : 'no timer'}`,
    start: startWith('measure'),
  });

  // ------------------------------------------------------ practice results
  function renderResult(box, m, api) {
    const s = m.state;
    if (!G[m.type].over(s)) { box.hidden = true; return true; }
    const st = stats(), key = `${m.type}:${s.seed}`, p = s.players[0];
    let title, text;
    if (m.type === 'moreless') {
      if (!st.counted[key]) { st.counted[key] = 1; st.mlGames++; st.mlBest = Math.max(st.mlBest, p.right); st.mlStreak = Math.max(st.mlStreak, p.best); }
      title = `${p.right} right`;
      text = `Best streak this game: ${p.best}. Your record: ${Math.max(st.mlBest, p.right)} right in a game.`;
    } else {
      if (!st.counted[key]) { st.counted[key] = 1; st.muGames++; st.muBest = Math.max(st.muBest, p.score); }
      title = `${p.score} points`;
      text = `Out of ${s.rounds * 100} possible. Your best: ${Math.max(st.muBest, p.score)}.`;
    }
    const keys = Object.keys(st.counted);
    if (keys.length > 200) delete st.counted[keys[0]];
    BL.store.set('quizStats', st);
    box.hidden = false;
    box.className = 'p-result';
    box.innerHTML = `<div><b>${esc(title)}</b><p>${esc(text)}</p></div>
      <div class="actions row"><button type="button" class="btn primary" data-a="again">Play again</button><button type="button" class="btn" data-a="menu">Menu</button></div>`;
    on(box, '[data-a=again]', () => api.startQuiz(m.type, settingsFor(m.type)));
    on(box, '[data-a=menu]', () => api.back());
    return true;
  }

  // ------------------------------------------------------------------ menu
  function render(type, el, api) {
    const p = prefs(), st = stats(), partner = api.partner(), pn = partner ? esc(partner.name) : '';
    const ml = type === 'moreless', data = ml ? window.MORELESS_DATA : null;
    const monthName = ym => { const [y, mo] = (ym || '').split('-'); return y ? new Date(+y, +mo - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''; };
    el.innerHTML = `
      <section class="panel quiz-hero">
        <p class="pick-note">${ml
          ? 'You see how many people look up a topic on Wikipedia each month. Did the next one get <b>more</b> or <b>less</b>? Everyone answers at once. A wrong answer costs a life, and whoever lasts longest wins.'
          : 'You see how tall one thing is. How tall is the next thing? Slide your guess, lock it in, and see everyone’s guesses next to the real height. The closer you are, the more points, plus a bonus for the closest guess.'}</p>
        <button type="button" class="btn primary big" id="qm-solo">${ml ? 'Practice: how long can you last?' : `Practice: ${p.muRounds} rounds`}</button>
      </section>

      <section class="panel">
        <h2>${partner ? `Duel ${pn}` : 'Duel your partner'}</h2>
        ${partner ? `<p class="pick-note">Makes a room and sends ${pn} an alert to join. Play together right now, on your phones or with the TV.</p><button type="button" class="btn primary" id="qm-duel">Send ${pn} a duel</button>`
          : '<p class="pick-note">Link your phones from the main screen to send each other duels, or use a room code below.</p><button type="button" class="btn" id="qm-link">Link with your partner</button>'}
      </section>

      <button type="button" class="tile tv-tile" id="qm-tv">
        <span class="tile-k">TV mode</span>
        <span class="tile-t">${ml ? 'Play it on the big screen' : 'See every guess on the big screen'}</span>
        <span class="tile-m">${ml ? 'The TV shows both topics, who’s locked in and everyone’s lives, then counts up the answer.' : 'The TV shows both things, then reveals every guess next to the real height and who was closest.'} Up to 8 players on their phones.</span>
      </button>

      <section class="panel">
        <h2>Party room</h2>
        <p class="pick-note">Up to 8 players, each on their own phone. Share the code or a link.</p>
        <div class="actions row"><button type="button" class="btn" id="qm-create">Make a room</button><button type="button" class="btn" id="qm-join">Join a room</button></div>
      </section>

      <section class="panel">
        <h2>Settings</h2>
        ${ml ? `<div class="pick-row"><span class="pick-label">Lives</span>${seg('qm-lives', [[1, '1'], [3, '3'], [5, '5']], p.mlLives)}</div>
                <div class="pick-row"><span class="pick-label">Timer</span>${seg('qm-time', [[10, '10 s'], [15, '15 s'], [25, '25 s']], p.mlTime)}</div>`
          : `<div class="pick-row"><span class="pick-label">Rounds</span>${seg('qm-rounds', [[5, '5'], [10, '10'], [15, '15']], p.muRounds)}</div>
             <div class="pick-row"><span class="pick-label">Timer</span>${seg('qm-time', [[15, '15 s'], [25, '25 s'], [40, '40 s']], p.muTime)}</div>
             <div class="pick-row"><span class="pick-label">Units</span>${seg('qm-units', [['ft', 'Feet'], ['m', 'Meters']], p.units)}</div>`}
        <p class="small muted">Used for practice, duels and rooms you make.</p>
      </section>

      <section class="panel">
        <h2>Your bests</h2>
        <div class="facts">${ml
          ? `<div class="fact"><span>Most right</span><b>${st.mlBest}</b></div><div class="fact"><span>Best streak</span><b>${st.mlStreak}</b></div><div class="fact"><span>Games</span><b>${st.mlGames}</b></div>`
          : `<div class="fact"><span>Best score</span><b>${st.muBest}</b></div><div class="fact"><span>Games</span><b>${st.muGames}</b></div>`}</div>
        ${ml && data ? `<p class="small muted">Numbers are the average monthly views of each topic’s English Wikipedia article by people (not bots), ${esc(monthName(data.from))} to ${esc(monthName(data.to))}. ${data.items.length} topics.</p>` : ''}
        ${!ml ? '<p class="small muted">Heights are rounded. Buildings are measured to the top, and some animals at the shoulder, as the game says.</p>' : ''}
      </section>`;
    const rerender = () => render(type, el, api);
    const segH = (id, key, num) => { const box = $('#' + id, el); if (box) box.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; const q = prefs(); q[key] = num ? +b.dataset.v : b.dataset.v; savePrefs(q); rerender(); }; };
    segH('qm-lives', 'mlLives', true); segH('qm-rounds', 'muRounds', true); segH('qm-units', 'units');
    segH('qm-time', ml ? 'mlTime' : 'muTime', true);
    on(el, '#qm-solo', () => api.startQuiz(type, settingsFor(type)));
    on(el, '#qm-duel', () => R().create(type, settingsFor(type), api, { invite: true }));
    on(el, '#qm-link', () => api.link());
    on(el, '#qm-tv', () => api.startTv(type));
    on(el, '#qm-create', () => R().create(type, settingsFor(type), api));
    on(el, '#qm-join', () => R().joinPrompt('', '', api));
  }

  MENUS.moreless = { title: 'More or Less', render: (el, api) => render('moreless', el, api), renderResult, settingsFor };
  MENUS.measure = { title: 'Measure Up', render: (el, api) => render('measure', el, api), renderResult, settingsFor };
})();
