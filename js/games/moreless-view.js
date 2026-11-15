/* More or Less screen: the topic everyone knows the number for, the next topic with
   its number hidden, and two big buttons. Lock in, wait for the others, then the
   number counts up and everyone's picks and lives show. */
(() => {
  'use strict';
  const V = window.BLViews, G = window.BLGames, BL = window.BL;
  const L = () => G.moreless;
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const T = '︎';
  const fmt = n => Math.round(n).toLocaleString();
  const COLORS = ['#6F9BFF', '#FF8A5B', '#4CC38A', '#F5C451', '#C38BFF', '#FF6FA8', '#4DD0E1', '#B9C4D6'];

  let audio = null;
  function sound(kind) {
    if ((BL.store.get('quizPrefs', {}) || {}).sound === false) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime;
      const tone = (f, at, dur, vol, type = 'triangle') => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t0 + at);
        g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        o.connect(g).connect(audio.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
      };
      if (kind === 'lock') tone(660, 0, 0.08, 0.06);
      else if (kind === 'right') { tone(660, 0, 0.12, 0.08); tone(990, 0.1, 0.18, 0.08); }
      else if (kind === 'wrong') tone(200, 0, 0.3, 0.08, 'sawtooth');
      else if (kind === 'tick') tone(1800, 0, 0.02, 0.015, 'square');
      else if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, 0.09));
    } catch (e) { /* no sound */ }
  }

  // Shared clock-driven steps for answer-at-once games: reveal when everyone is in
  // (or time is up), move on after the reveal. Any phone or the TV can send these.
  function quizTick(s, now, send, sent) {
    if (!s.started || s.winner != null) return;
    const G0 = G[s.game];
    if (s.phase === 'ask' && (!G0.waiting(s).length || (s.time && now >= s.deadline)) && sent.k !== 'r' + s.round) {
      sent.k = 'r' + s.round;
      send({ reveal: true, round: s.round, at: now });
    } else if (s.phase === 'reveal' && now >= s.revealUntil && sent.k !== 'n' + s.round) {
      sent.k = 'n' + s.round;
      send({ next: true, round: s.round, at: now });
    }
  }

  V.moreless = {
    sound, quizTick, COLORS,
    mount(el, ctx) {
      el.innerHTML = `
        <div class="ml">
          <div class="ml-top"><div class="ml-players"></div><div class="ml-clock" hidden><i></i></div></div>
          <div class="ml-cards">
            <div class="ml-card a"><span class="ml-emoji"></span><b class="ml-name"></b><span class="ml-num"></span><small>views a month</small></div>
            <div class="ml-vs">vs</div>
            <div class="ml-card b"><span class="ml-emoji"></span><b class="ml-name"></b><span class="ml-num"></span><small>views a month</small></div>
          </div>
          <div class="ml-btns">
            <button type="button" class="ml-btn more" data-a="more"><span>▲${T}</span>More</button>
            <button type="button" class="ml-btn less" data-a="less"><span>▼${T}</span>Less</button>
          </div>
          <p class="ml-note" aria-live="polite"></p>
        </div>`;
      const root = el.querySelector('.ml'), q = s => el.querySelector(s);
      let snap = null, sent = { k: '' }, countT = 0, shownRound = '', lastTick = 0, seenEv = -1, lastReady = '';
      const me = () => snap.viewer;
      q('.ml-btns').addEventListener('click', e => {
        const b = e.target.closest('[data-a]');
        if (!b || !snap || !snap.canAct) return;
        const s = snap.state;
        if (ctx.now() < s.askedAt) return;
        sound('lock');
        BL.buzz && BL.buzz(10);
        ctx.send({ answer: b.dataset.a, round: s.round, at: ctx.now() });
      });
      const tick = setInterval(() => {
        if (!snap) return;
        const s = snap.state, now = ctx.now();
        quizTick(s, now, mv => ctx.send(mv), sent);
        const ready = `${s.round}:${now >= s.askedAt}`;
        if (ready !== lastReady) { lastReady = ready; paint(); }   // the buttons wake up when the question opens
        const clock = q('.ml-clock');
        if (s.time && s.phase === 'ask' && s.winner == null) {
          const left = Math.max(0, s.deadline - now);
          clock.hidden = false;
          clock.querySelector('i').style.width = Math.min(100, (100 * left) / s.time) + '%';
          clock.classList.toggle('low', left < 4000);
          if (left < 4000 && left > 0 && now - lastTick > 1000 && snap.canAct) { lastTick = now; sound('tick'); }
        } else clock.hidden = true;
      }, 200);

      function countUp(elNum, to) {
        clearInterval(countT);
        const t0 = Date.now(), dur = 1100;
        countT = setInterval(() => {
          const k = Math.min(1, (Date.now() - t0) / dur), e = 1 - Math.pow(1 - k, 3);
          elNum.textContent = fmt(to * e);
          if (k >= 1) clearInterval(countT);
        }, 30);
      }

      function paint() {
        if (!snap) return;
        const s = snap.state, { a, b } = L().current(s), reveal = s.phase === 'reveal' || s.winner != null;
        const mine = s.players[me()], answered = String(me()) in s.answers;
        // cards
        for (const [k, item] of [['a', a], ['b', b]]) {
          const card = q(`.ml-card.${k}`);
          card.querySelector('.ml-emoji').textContent = L().CATS[item.c] || '❔';
          card.querySelector('.ml-name').textContent = item.t;
        }
        q('.ml-card.a .ml-num').textContent = fmt(a.v);
        const key = `${s.seed}:${s.round}`;
        const numB = q('.ml-card.b .ml-num');
        if (reveal && s.results && shownRound !== key) { shownRound = key; countUp(numB, b.v); }
        else if (!reveal) { shownRound = ''; clearInterval(countT); numB.textContent = '?'; }
        const res = s.results && s.results.picks ? s.results.picks[me()] : null;
        q('.ml-card.b').classList.toggle('more', reveal && s.results && s.results.truth === 'more');
        q('.ml-card.b').classList.toggle('less', reveal && s.results && s.results.truth === 'less');
        // buttons
        const pick = s.answers[String(me())];
        el.querySelectorAll('.ml-btn').forEach(btn => {
          btn.disabled = !snap.canAct || ctx.now() < s.askedAt;
          btn.classList.toggle('picked', pick === btn.dataset.a);
          btn.classList.toggle('right', reveal && !!res && res.pick === btn.dataset.a && res.ok);
          btn.classList.toggle('wrong', reveal && !!res && res.pick === btn.dataset.a && !res.ok);
        });
        q('.ml-btns').hidden = !s.started || s.winner != null || !mine || mine.out;
        // players
        const many = s.players.length > 1;
        q('.ml-players').innerHTML = s.players.map((p, i) => {
          const r = s.results && s.results.picks ? s.results.picks[i] : null;
          let tag = '';
          if (p.out && !(reveal && r)) tag = 'Out';
          else if (reveal && r) tag = r.pick ? (r.ok ? `✓ ${r.pick === 'more' ? '▲' : '▼'}${T}` : `✗ ${r.pick === 'more' ? '▲' : '▼'}${T}`) : '✗ no answer';
          else if (String(i) in s.answers) tag = 'Locked in';
          else if (!p.out) tag = s.phase === 'ask' ? 'Thinking…' : '';
          const hearts = '♥'.repeat(Math.max(0, p.lives)) + `${T}`;
          return `<span class="ml-p${p.out ? ' out' : ''}${i === me() && many ? ' me' : ''}${reveal && r ? (r.ok ? ' ok' : ' bad') : ''}" style="--c:${COLORS[i % COLORS.length]}">
            <b>${esc(many ? (ctx.names[i] || p.name) : 'You')}${i === me() && many ? ' (you)' : ''}</b><em>${p.lives > 0 ? hearts : ''}</em><small>${esc(tag)}${!many ? ` · streak ${p.run} · best ${p.best}` : ` · ${p.right} right`}</small></span>`;
        }).join('');
        // note
        let note = '';
        if (s.winner != null) note = '';
        else if (!s.started || ctx.now() < s.askedAt) note = 'Get ready…';
        else if (reveal && res) note = res.ok ? (s.results.truth === 'either' ? 'A tie, so either answer counts!' : 'Right!') : res.pick ? `Wrong. It was ${s.results.truth === 'more' ? 'more' : 'less'}.` : 'Too slow. That costs a life.';
        else if (mine && mine.out) note = 'You’re out. Watch the others.';
        else if (answered) note = s.players.length > 1 ? 'Locked in. Waiting for the others…' : '';
        else note = `Did ${b.t} get more or fewer views than ${a.t}?`;
        q('.ml-note').textContent = note;
        root.classList.toggle('revealing', reveal);
        // sounds
        if (seenEv >= 0 && s.ev !== seenEv && s.phase === 'reveal' && res) sound(res.ok ? 'right' : 'wrong');
        if (s.winner != null && seenEv >= 0 && s.ev !== seenEv) sound('win');
        seenEv = s.ev;
      }
      return {
        render(sn) { snap = sn; paint(); },
        refresh() { paint(); },
        destroy() { clearInterval(tick); clearInterval(countT); },
      };
    },
  };
})();
