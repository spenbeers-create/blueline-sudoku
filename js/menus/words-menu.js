/* Word Duel menu: the daily word, practice in 4 to 7 letters, duels and live
   races with your partner, words you make for your partner or anyone with a
   link, stats with a guess chart, and options. */
(() => {
  'use strict';
  const BL = window.BL, esc = BL.esc, W = window.BLGames.words;
  const MENUS = window.BLMenus || (window.BLMenus = {});
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const on = (root, sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };

  const pad2 = n => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const addDays = (key, n) => { const d = new Date(key + 'T12:00:00'); d.setDate(d.getDate() + n); return dayKey(d); };
  const appUrl = () => location.origin + location.pathname;
  const myName = () => (BL.settings.name || '').trim() || 'A friend';
  const prefs = () => Object.assign({ len: 5, hard: false, contrast: false }, BL.store.get('wordsPrefs', {}));
  const savePrefs = p => BL.store.set('wordsPrefs', p);

  // Rooms: everyone races on the same word at once, on phones or with the TV.
  window.BLRooms.register('words', {
    title: 'Word Duel', maxPlayers: 8,
    minPlayers: r => (r.screen ? 1 : 2),
    describe: st => `${st.len || 5}-letter word${st.hard ? ', hard mode' : ''} · first to solve wins`,
    async prepare(r) {
      await W.load();
      const st = r.settings || {};
      return W.create({ seed: Math.random().toString(36).slice(2), len: st.len || 5, hard: !!st.hard, mode: 'live' });
    },
    start(r, entries, state) {
      r.seats = entries.map(([uid]) => uid);
      r.state = JSON.stringify(state);
      r.startAt = window.Online.now() + 4500;      // a shared countdown for everyone
    },
  });
  const blank = () => ({ daily: { played: 0, won: 0, streak: 0, best: 0, lastWin: '', lastPlayed: '', dist: {} }, practice: { played: 0, won: 0, dist: {} }, duel: { w: 0, l: 0, d: 0 }, counted: {} });
  const stats = () => { const s = Object.assign(blank(), BL.store.get('wordsStats', {})); s.daily = Object.assign(blank().daily, s.daily); s.practice = Object.assign(blank().practice, s.practice); return s; };
  const saveStats = s => BL.store.set('wordsStats', s);
  let api = null, menuEl = null;

  function shareGrid(marks) {
    const map = prefs().contrast ? { g: '🟧', y: '🟦', '.': '⬛' } : { g: '🟩', y: '🟨', '.': '⬛' };
    return marks.map(mk => mk.split('').map(x => map[x]).join('')).join('\n');
  }

  function distBars(dist, highlight, max) {
    const rows = [];
    for (let i = 1; i <= max; i++) rows.push([String(i), dist[i] || 0]);
    rows.push(['X', dist.x || 0]);
    const top = Math.max(1, ...rows.map(r => r[1]));
    return `<div class="dist">${rows.map(([k, v]) => `<div class="dist-row"><span>${k}</span><i class="${k === String(highlight) ? 'me' : ''}" style="width:${Math.max(8, Math.round(100 * v / top))}%">${v}</i></div>`).join('')}</div>`;
  }

  // ----------------------------------------------------------- solo games
  function solo(state, prog, kind, extra = {}) {
    api.openSolo('words', {
      state, prog, kind,
      save: p => extra.save && extra.save(p),
      done: m => { if (extra.done) extra.done(m); showResult(m, kind, extra); },
      result: (box, m) => resultBanner(box, m, kind, extra),
    });
  }

  function playDaily() {
    const key = dayKey(), saved = BL.store.get('wordsDaily', null);
    const st = W.daily(key, prefs().hard);
    const prog = saved && saved.key === key ? saved.prog : null;
    solo(st, prog, 'daily', {
      key,
      save: p => BL.store.set('wordsDaily', { key, prog: p }),
      done: m => recordDaily(key, m.mine),
    });
  }
  function recordDaily(key, p) {
    const s = stats(), d = s.daily;
    if (d.lastPlayed === key) return;
    d.lastPlayed = key;
    d.played++;
    if (p.solved) {
      d.won++;
      d.dist[p.guesses.length] = (d.dist[p.guesses.length] || 0) + 1;
      d.streak = d.lastWin === addDays(key, -1) ? d.streak + 1 : 1;
      d.best = Math.max(d.best, d.streak);
      d.lastWin = key;
    } else { d.dist.x = (d.dist.x || 0) + 1; d.streak = 0; }
    saveStats(s);
  }
  const dailyStreak = () => { const d = stats().daily, t = dayKey(); return d.lastWin === t || d.lastWin === addDays(t, -1) ? d.streak : 0; };

  function playPractice(fresh) {
    const saved = BL.store.get('wordsPractice', null);
    const p = prefs();
    let state, prog = null;
    if (!fresh && saved && saved.state && saved.prog && !saved.prog.done) { state = saved.state; prog = saved.prog; }
    else state = W.create({ len: p.len, hard: p.hard, mode: 'practice' });
    solo(state, prog, 'practice', {
      save: pr => BL.store.set('wordsPractice', { state, prog: pr }),
      done: m => {
        const s = stats(), pr = s.practice;
        pr.played++;
        if (m.mine.solved) { pr.won++; pr.dist[m.mine.guesses.length] = (pr.dist[m.mine.guesses.length] || 0) + 1; } else pr.dist.x = (pr.dist.x || 0) + 1;
        saveStats(s);
      },
    });
  }

  function playLink(code) {
    const o = W.decodeLink(code);
    if (!o) { BL.toast('That word link doesn’t work. Ask them to send it again.'); return; }
    const state = W.create({ word: o.w, mode: 'custom', by: o.n || 'A friend', hint: o.h, max: o.m });
    const all = BL.store.get('wordsLinks', {});
    const prog = all[code] || null;
    solo(state, prog, 'link', {
      code,
      save: p => { const a = BL.store.get('wordsLinks', {}); a[code] = p; const keys = Object.keys(a); if (keys.length > 30) delete a[keys[0]]; BL.store.set('wordsLinks', a); },
    });
  }

  function shareFor(m, kind, extra) {
    const s = m.state, p = m.mine, n = p.solved ? p.guesses.length : 'X';
    const grid = shareGrid(p.marks);
    if (kind === 'daily') return `Blueline Word Duel #${W.dailyNumber(extra.key)} ${n}/${s.max}${s.hard ? '*' : ''}\n\n${grid}\n\n${appUrl()}`;
    if (kind === 'link') return `${p.solved ? `I guessed ${s.by}’s word in ${n}/${s.max}!` : `${s.by}’s word beat me.`}\n\n${grid}\n\nMake one for me in Blueline: ${appUrl()}`;
    return `Blueline Word Duel · ${s.len} letters · ${n}/${s.max}${s.hard ? '*' : ''}\n\n${grid}`;
  }

  function resultBanner(box, m, kind, extra) {
    const p = m.mine, s = m.state;
    box.hidden = false;
    box.className = 'p-result';
    const title = p.solved ? ['Genius', 'Brilliant', 'Great', 'Nice', 'Solid', 'Phew'][Math.min(5, p.guesses.length - 1)] : 'Not this time';
    box.innerHTML = `<div><b>${title}</b><p>${p.solved ? `Solved in ${p.guesses.length}.` : `The word was ${esc(s.word.toUpperCase())}.`}${kind === 'daily' ? ` Daily streak: ${dailyStreak()}.` : ''}</p></div>
      <div class="actions row">
        <button type="button" class="btn primary" data-a="share">Share</button>
        ${kind === 'practice' ? '<button type="button" class="btn" data-a="again">New word</button>' : '<button type="button" class="btn" data-a="stats">Stats</button>'}
        <button type="button" class="btn" data-a="menu">Menu</button>
      </div>`;
    on(box, '[data-a=share]', () => BL.shareText(shareFor(m, kind, extra)));
    on(box, '[data-a=again]', () => playPractice(true));
    on(box, '[data-a=stats]', () => showResult(m, kind, extra));
    on(box, '[data-a=menu]', () => api.back());
    return true;
  }

  function showResult(m, kind, extra) {
    const p = m.mine, s = m.state, st = stats();
    const d = kind === 'daily' ? st.daily : st.practice;
    const pct = d.played ? Math.round(100 * d.won / d.played) : 0;
    setTimeout(() => BL.openSheet(`
      <h2 id="sheet-title">${p.solved ? `Solved in ${p.guesses.length}` : 'So close'}</h2>
      ${p.solved ? '' : `<p class="lede">The word was <b>${esc(s.word.toUpperCase())}</b>.</p>`}
      ${kind === 'link' ? `<p class="lede">That was ${esc(s.by)}’s word. Send them your result, or make one back.</p>` : `
      <div class="facts">
        <div class="fact"><span>Played</span><b>${d.played}</b></div>
        <div class="fact"><span>Won</span><b>${pct}%</b></div>
        <div class="fact"><span>${kind === 'daily' ? 'Streak' : 'Wins'}</span><b>${kind === 'daily' ? dailyStreak() : d.won}</b></div>
      </div>
      <div class="field"><span>Guesses</span>${distBars(d.dist, p.solved ? p.guesses.length : 'X', 6)}</div>`}
      <div class="actions">
        <button type="button" class="btn primary big" data-a="share">Share result</button>
        ${kind === 'practice' ? '<button type="button" class="btn" data-a="again">New word</button>' : ''}
        <button type="button" class="btn" data-a="make">Make a word for someone</button>
        <button type="button" class="btn ghost" data-a="close">Close</button>
      </div>`, {
      onMount: b => {
        on(b, '[data-a=share]', () => BL.shareText(shareFor(m, kind, extra)));
        on(b, '[data-a=again]', () => { BL.closeSheet(); playPractice(true); });
        on(b, '[data-a=make]', () => makeWord());
        on(b, '[data-a=close]', () => BL.closeSheet());
      },
    }), 900);
  }

  // ------------------------------------------------------------ make a word
  function makeWord() {
    const partner = api.partner();
    BL.openSheet(`
      <h2 id="sheet-title">Make a word</h2>
      <p class="lede">Pick any real word from 4 to 7 letters. They get 6 guesses to find it.</p>
      <label class="field"><span>Your word</span><input class="input code" id="mw-word" maxlength="7" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="PIZZA"></label>
      <p class="status-line" id="mw-msg"></p>
      <label class="field"><span>Hint, if you want</span><input class="input" id="mw-hint" maxlength="60" autocomplete="off" placeholder="Something you’d order on a Friday"></label>
      <div class="actions">
        ${partner ? `<button type="button" class="btn primary big" data-a="send">Send to ${esc(partner.name)}</button>` : ''}
        <button type="button" class="btn ${partner ? '' : 'primary big'}" data-a="link">Share a link with anyone</button>
        <button type="button" class="btn ghost" data-a="close">Cancel</button>
      </div>
      <p class="small muted">Links work for anyone, even without linking phones. The word is scrambled in the link so they can’t peek.</p>`, {
      onMount: b => {
        const inp = $('#mw-word', b), msg = $('#mw-msg', b);
        const check = () => {
          const w = inp.value.toLowerCase().replace(/[^a-z]/g, '');
          if (w.length < 4) { msg.className = 'status-line'; msg.textContent = 'Words need 4 to 7 letters.'; return null; }
          if (!W.isWord(w)) { msg.className = 'status-line err'; msg.textContent = `${w.toUpperCase()} isn’t in the word list. Try another.`; return null; }
          msg.className = 'status-line ok'; msg.textContent = `${w.toUpperCase()} works. ${w.length} letters.`;
          return w;
        };
        inp.addEventListener('input', check);
        const hint = () => $('#mw-hint', b).value.trim().slice(0, 60);
        on(b, '[data-a=send]', () => {
          const w = check();
          if (!w) { inp.focus(); return; }
          BL.closeSheet();
          api.startOnline('words', { mode: 'custom', word: w, hint: hint(), by: myName() });
        });
        on(b, '[data-a=link]', () => {
          const w = check();
          if (!w) { inp.focus(); return; }
          const code = W.encodeLink({ w, n: myName(), h: hint(), m: 6 });
          BL.shareText(`I made you a word to guess in Blueline${hint() ? ` (hint: ${hint()})` : ''}. Can you get it in 6? ${appUrl()}#w-${code}`);
        });
        on(b, '[data-a=close]', () => BL.closeSheet());
      },
    });
  }

  // ------------------------------------------------------------------ menu
  function render(el) {
    menuEl = el;
    if (!W.ready()) {
      el.innerHTML = '<div class="status-line"><span class="spinner"></span>Loading the word lists…</div>';
      W.load().then(() => render(el)).catch(() => { el.innerHTML = '<p class="status-line err">The word lists didn’t load. Check your connection, then open Word Duel again.</p>'; });
      return;
    }
    const p = prefs(), st = stats(), partner = api.partner(), pn = partner ? esc(partner.name) : '';
    const key = dayKey(), daily = BL.store.get('wordsDaily', null), today = daily && daily.key === key ? daily.prog : null;
    const practice = BL.store.get('wordsPractice', null);
    const streak = dailyStreak();
    const dailyMeta = today && today.done ? (today.solved ? `Solved in ${today.guesses.length} · ${streak}-day streak` : `Missed today · come back tomorrow`) : today && today.guesses.length ? `${today.guesses.length} guess${today.guesses.length > 1 ? 'es' : ''} in · keep going` : streak ? `${streak}-day streak, keep it going` : 'Same word for everyone today';
    const online = api.games('words').filter(([, r]) => r.status === 'active');
    const label = r => {
      const mine = api.isMyMove(r);
      if (r.mode === 'custom') return mine ? `${pn} sent you a word` : `${pn} is guessing your word`;
      if (r.mode === 'live') return 'Live race';
      return mine ? 'Duel · your turn' : `Duel · waiting on ${pn}`;
    };

    el.innerHTML = `
      <button type="button" class="resume daily-card${today && today.done ? ' done' : ''}" id="wm-daily">
        <span class="resume-k">Daily word #${W.dailyNumber(key)}</span>
        <span class="resume-t">${today && today.done ? 'See today’s result' : today && today.guesses.length ? 'Continue today’s word' : 'Play today’s word'}</span>
        <span class="resume-m">${esc(dailyMeta)}</span>
        <svg class="resume-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
      </button>
      ${practice && practice.prog && !practice.prog.done && practice.prog.guesses.length ? `<button type="button" class="turn-row" id="wm-cont"><span class="gi gi-words" aria-hidden="true"></span><span><b>Continue practice</b><small>${practice.state.len} letters · ${practice.prog.guesses.length} guesses in</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>` : ''}
      ${online.length ? `<section class="turns"><h2>Games with ${pn}</h2>${online.map(([gid, r]) => `<button type="button" class="turn-row ${api.isMyMove(r) ? 'hot' : ''}" data-gid="${gid}"><span class="gi gi-words" aria-hidden="true"></span><span><b>${esc(label(r))}</b><small>${(JSON.parse(r.state).len || 5)} letters</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`).join('')}</section>` : ''}

      <section class="panel" aria-labelledby="wm-p">
        <h2 id="wm-p">Practice</h2>
        <div class="pick-row"><span class="pick-label">Letters</span><div class="seg" role="radiogroup" id="wm-len">${W.LENGTHS.map(L => `<button type="button" role="radio" data-v="${L}" aria-checked="${L === p.len}">${L}</button>`).join('')}</div></div>
        <button type="button" class="btn primary big" id="wm-practice">New ${p.len}-letter word</button>
      </section>

      <section class="panel" aria-labelledby="wm-o">
        <h2 id="wm-o">${partner ? `Play ${pn}` : 'Play your partner'}</h2>
        ${partner ? `
          <div class="choice three">
            <button type="button" data-o="duel"><b>Duel</b><small>Same word, play whenever. Fewer guesses wins.</small></button>
            <button type="button" data-o="live"><b>Live race</b><small>Both play now. First to solve wins.</small></button>
            <button type="button" data-o="custom"><b>Send a word</b><small>You pick it, then watch them guess.</small></button>
          </div>
          <p class="small muted">Duels and races use ${p.len}-letter words. Change it under Practice.</p>`
          : `<p class="pick-note">Link your phones from the main screen to duel, race live, and send each other words.</p><button type="button" class="btn" id="wm-link">Link with your partner</button>`}
      </section>

      <section class="panel" aria-labelledby="wm-m">
        <h2 id="wm-m">Make a word for friends</h2>
        <p class="pick-note">Pick any word, add a hint, and send a link. Anyone can play it, even without the app.</p>
        <button type="button" class="btn" id="wm-make">Make a word</button>
      </section>

      <button type="button" class="tile tv-tile" id="wm-tv">
        <span class="tile-k">TV mode</span>
        <span class="tile-t">Race on the big screen</span>
        <span class="tile-m">Everyone guesses the same word on their phone while the TV shows all the boards filling in (colors only, no letters). Up to 8 players.</span>
      </button>

      <section class="panel">
        <h2>Race anyone with a code</h2>
        <p class="pick-note">Up to 8 players race on the same word. First to solve it wins. Uses your letter count and hard mode.</p>
        <div class="actions row"><button type="button" class="btn" id="wm-create">Make a room</button><button type="button" class="btn" id="wm-join">Join a room</button></div>
      </section>

      <section class="panel" aria-labelledby="wm-s">
        <h2 id="wm-s">Your stats</h2>
        <div class="facts">
          <div class="fact"><span>Daily</span><b>${st.daily.played ? Math.round(100 * st.daily.won / st.daily.played) : 0}%</b></div>
          <div class="fact"><span>Streak</span><b>${streak}<small class="muted" style="font-size:12px"> best ${st.daily.best}</small></b></div>
          <div class="fact"><span>${partner ? `vs ${pn}` : 'Duels'}</span><b>${st.duel.w}–${st.duel.l}${st.duel.d ? '–' + st.duel.d : ''}</b></div>
        </div>
        <div class="field"><span>Daily guesses</span>${distBars(st.daily.dist, null, 6)}</div>
      </section>

      <section class="panel" aria-labelledby="wm-x">
        <h2 id="wm-x">Options</h2>
        <div class="setting"><label for="wm-hard"><b>Hard mode</b><small>Letters you’ve found must be used in every later guess.</small></label><span class="switch"><input type="checkbox" id="wm-hard" ${p.hard ? 'checked' : ''}><span></span></span></div>
        <div class="setting"><label for="wm-hc"><b>High-contrast colors</b><small>Orange and blue instead of green and yellow, easier with color blindness.</small></label><span class="switch"><input type="checkbox" id="wm-hc" ${p.contrast ? 'checked' : ''}><span></span></span></div>
      </section>`;

    on(el, '#wm-daily', () => {
      if (today && today.done) showResult({ state: W.daily(key, prefs().hard), mine: today }, 'daily', { key });
      else playDaily();
    });
    on(el, '#wm-cont', () => playPractice(false));
    on(el, '#wm-practice', () => playPractice(true));
    $('#wm-len', el).onclick = e => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      const q = prefs(); q.len = +b.dataset.v; savePrefs(q);
      render(el);
    };
    $$('[data-o]', el).forEach(b => { b.onclick = () => {
      const mode = b.dataset.o, q = prefs();
      if (mode === 'custom') { makeWord(); return; }
      api.startOnline('words', { mode, len: q.len, hard: q.hard });
    }; });
    $$('[data-gid]', el).forEach(b => { b.onclick = () => api.openOnline(b.dataset.gid); });
    on(el, '#wm-link', () => api.link());
    on(el, '#wm-make', makeWord);
    on(el, '#wm-tv', () => api.startTv('words'));
    on(el, '#wm-create', () => { const q = prefs(); window.BLRooms.create('words', { len: q.len, hard: q.hard }, api); });
    on(el, '#wm-join', () => window.BLRooms.joinPrompt('', '', api));
    $('#wm-hard', el).onchange = e => { const q = prefs(); q.hard = e.target.checked; savePrefs(q); };
    $('#wm-hc', el).onchange = e => { const q = prefs(); q.contrast = e.target.checked; savePrefs(q); };
  }

  MENUS.words = {
    title: 'Word Duel',
    render(el, a) { api = a; render(el); },
    make(a) { api = a; makeWord(); },
    openLink(code, a) { api = a; W.load().then(() => playLink(code)).catch(() => BL.toast('The word lists didn’t load. Check your connection.')); },
    recordDuel(gid, rec, seat) {
      const s = stats();
      if (s.counted[gid] || rec.status !== 'over') return;
      const st = typeof rec.state === 'string' ? JSON.parse(rec.state) : rec.state;
      if (st.mode === 'custom') return;
      s.counted[gid] = 1;
      const k = rec.winner === 'draw' ? 'd' : rec.winner === seat ? 'w' : 'l';
      s.duel[k] = (s.duel[k] || 0) + 1;
      saveStats(s);
    },
  };
})();
