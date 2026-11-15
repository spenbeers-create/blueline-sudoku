/* Measure Up screen: the thing you know the height of and your guess side by side as
   bars on the same ground line. Drag the slider until your bar looks right (or nudge
   it), lock in, then the reveal adds the real height and everyone else's guesses,
   with the points each got. Feet or meters, picked from your phone's region. */
(() => {
  'use strict';
  const V = window.BLViews, G = window.BLGames, BL = window.BL;
  const M = () => G.measure;
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const SPAN = 15;   // the slider reaches 15 times shorter or taller than the reference
  const defaultUnits = () => (/^en-(US|LR|MM)/i.test(navigator.language || '') ? 'ft' : 'm');
  const prefs = () => Object.assign({ units: defaultUnits(), sound: true }, BL.store.get('quizPrefs', {}));
  const n1 = x => (x < 10 ? Math.round(x * 10) / 10 : Math.round(x)).toLocaleString();
  function fmtHeight(m, units = prefs().units) {
    if (m == null) return '–';
    if (units === 'ft') {
      const inches = m / 0.0254;
      if (inches < 36) return `${n1(inches)} in`;
      const ft = inches / 12;
      if (ft < 10) { const f = Math.floor(ft), i = Math.round((ft - f) * 12); return i === 12 ? `${f + 1} ft` : `${f} ft ${i} in`; }
      return `${Math.round(ft).toLocaleString()} ft`;
    }
    if (m < 1) return `${n1(m * 100)} cm`;
    return `${n1(m)} m`;
  }

  V.measure = {
    fmtHeight, prefs,
    mount(el, ctx) {
      el.innerHTML = `
        <div class="mu">
          <div class="ml-top"><div class="ml-players mu-players"></div><div class="ml-clock" hidden><i></i></div></div>
          <p class="mu-q"></p>
          <div class="mu-stage"></div>
          <div class="mu-input">
            <input type="range" class="mu-slider" min="-1" max="1" step="0.001" value="0" aria-label="Your guess">
            <div class="mu-fine"><button type="button" class="btn" data-n="-1" aria-label="A bit shorter">−</button><b class="mu-val"></b><button type="button" class="btn" data-n="1" aria-label="A bit taller">+</button></div>
            <button type="button" class="btn primary big mu-lock">Lock in</button>
          </div>
          <p class="ml-note mu-note" aria-live="polite"></p>
        </div>`;
      const root = el.querySelector('.mu'), q = s => el.querySelector(s), slider = q('.mu-slider');
      let snap = null, sent = { k: '' }, x = 0, xRound = '', seenEv = -1, lastTick = 0, lastReady = '';
      const me = () => snap.viewer;
      const pair = () => M().current(snap.state);
      const guess = () => pair().ref.v * Math.pow(SPAN, x);
      slider.addEventListener('input', () => { x = +slider.value; paint(); });
      q('.mu-fine').addEventListener('click', e => {
        const b = e.target.closest('[data-n]'); if (!b) return;
        x = Math.max(-1, Math.min(1, x + (+b.dataset.n) * Math.log(1.03) / Math.log(SPAN)));
        slider.value = x; paint();
      });
      q('.mu-lock').addEventListener('click', () => {
        if (!snap || !snap.canAct || ctx.now() < snap.state.askedAt) return;
        V.moreless.sound('lock');
        BL.buzz && BL.buzz(10);
        ctx.send({ answer: Math.round(guess() * 10000) / 10000, round: snap.state.round, at: ctx.now() });
      });
      const tick = setInterval(() => {
        if (!snap) return;
        const s = snap.state, now = ctx.now();
        V.moreless.quizTick(s, now, mv => ctx.send(mv), sent);
        const ready = `${s.round}:${now >= s.askedAt}`;
        if (ready !== lastReady) { lastReady = ready; paint(); }
        const clock = q('.ml-clock');
        if (s.time && s.phase === 'ask' && s.winner == null) {
          const left = Math.max(0, s.deadline - now);
          clock.hidden = false;
          clock.querySelector('i').style.width = Math.min(100, (100 * left) / s.time) + '%';
          clock.classList.toggle('low', left < 5000);
          if (left < 5000 && left > 0 && now - lastTick > 1000 && snap.canAct) { lastTick = now; V.moreless.sound('tick'); }
        } else clock.hidden = true;
      }, 200);

      function paint() {
        if (!snap) return;
        const s = snap.state, p = pair(), reveal = s.phase === 'reveal' || s.winner != null, many = s.players.length > 1;
        const key = `${s.seed}:${s.round}`;
        if (xRound !== key) { xRound = key; x = 0; slider.value = 0; }
        const mineAns = s.answers[String(me())];
        q('.mu-q').innerHTML = `${esc(p.ref.e)} ${esc(p.ref.t)} is <b>${esc(fmtHeight(p.ref.v))}</b> tall.<br>How tall is ${esc(p.tgt.e)} <b>${esc(p.tgt.t)}</b>?`;
        // Bars: the reference, your guess, and on the reveal the real height and everyone's guesses.
        const cols = [{ cls: 'ref', label: p.ref.t, emoji: p.ref.e, v: p.ref.v, val: fmtHeight(p.ref.v) }];
        if (reveal && s.results) {
          cols.push({ cls: 'real', label: 'Real height', emoji: p.tgt.e, v: s.results.real, val: fmtHeight(s.results.real) });
          s.players.forEach((pl, i) => {
            const r = s.results.guesses[i];
            if (!r || r.guess == null) return;
            cols.push({ cls: `guess p${i}${i === me() ? ' me' : ''}${r.closest ? ' best' : ''}`, color: V.moreless.COLORS[i % 8], label: many ? (i === me() ? 'You' : ctx.names[i] || pl.name) : 'Your guess', v: r.guess, val: fmtHeight(r.guess), pts: r.pts, closest: r.closest });
          });
        } else {
          const g = mineAns != null ? mineAns : guess();
          cols.push({ cls: 'guess me', color: V.moreless.COLORS[me() % 8], label: mineAns != null ? 'Locked in' : 'Your guess', emoji: p.tgt.e, v: g, val: fmtHeight(g) });
        }
        const top = Math.max(...cols.map(c => c.v));
        q('.mu-stage').innerHTML = cols.map(c => `<div class="mu-col ${c.cls}" ${c.color ? `style="--c:${c.color}"` : ''}>
            <span class="mu-v">${esc(c.val)}${c.pts != null ? `<em>+${c.pts}${c.closest ? ' ★' : ''}</em>` : ''}</span>
            <span class="mu-bar" style="height:${Math.max(1.5, (100 * c.v) / top)}%">${c.emoji ? `<i>${esc(c.emoji)}</i>` : ''}</span>
            <small>${esc(c.label)}</small></div>`).join('');
        q('.mu-stage').dataset.n = cols.length;
        q('.mu-val').textContent = fmtHeight(mineAns != null ? mineAns : guess());
        const inputOn = snap.canAct && s.started && ctx.now() >= s.askedAt;
        q('.mu-input').hidden = !s.started || s.winner != null || reveal || mineAns != null;
        slider.disabled = !inputOn;
        q('.mu-lock').disabled = !inputOn;
        // players
        q('.mu-players').innerHTML = s.players.map((pl, i) => {
          const r = reveal && s.results ? s.results.guesses[i] : null;
          const tag = r ? (r.guess == null ? 'no guess' : `+${r.pts}${r.closest ? ' closest' : ''}`) : String(i) in s.answers ? 'Locked in' : s.phase === 'ask' ? 'Thinking…' : '';
          return `<span class="ml-p${i === me() && many ? ' me' : ''}${r && r.closest ? ' ok' : ''}" style="--c:${V.moreless.COLORS[i % 8]}"><b>${esc(many ? (ctx.names[i] || pl.name) : 'You')}${i === me() && many ? ' (you)' : ''}</b><em class="pts">${pl.score}</em><small>${esc(tag)}</small></span>`;
        }).join('');
        let note = '';
        if (s.winner != null) note = '';
        else if (!s.started || ctx.now() < s.askedAt) note = `Round ${s.round} of ${s.rounds}. Get ready…`;
        else if (reveal && s.results) { const r = s.results.guesses[me()]; note = r && r.guess != null ? `It’s ${fmtHeight(s.results.real)}. You get ${r.pts} point${r.pts === 1 ? '' : 's'}${r.closest ? ', closest of all!' : '.'}` : `It’s ${fmtHeight(s.results.real)}. No guess, no points.`; }
        else if (mineAns != null) note = many ? 'Locked in. Waiting for the others…' : '';
        else note = `Round ${s.round} of ${s.rounds}. Slide until the bar looks right.`;
        q('.mu-note').textContent = note;
        root.classList.toggle('revealing', reveal);
        if (seenEv >= 0 && s.ev !== seenEv && s.phase === 'reveal' && s.results) { const r = s.results.guesses[me()]; V.moreless.sound(r && r.pts >= 60 ? 'right' : 'wrong'); }
        seenEv = s.ev;
      }
      const onPrefs = () => paint();
      document.addEventListener('bl:quizprefs', onPrefs);
      return {
        render(sn) { snap = sn; paint(); },
        refresh() { paint(); },
        destroy() { clearInterval(tick); document.removeEventListener('bl:quizprefs', onPrefs); },
      };
    },
  };
})();
