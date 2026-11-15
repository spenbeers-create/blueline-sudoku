/* Measure Up screen: the thing you know the height of (blue) and the thing you size
   (red) stand side by side as silhouettes on one ground line, to scale. Slide until
   the red one looks right (or drag it, or nudge it), zoom in or out to see better,
   then lock in. The reveal grows the real height and marks everyone's guess with a
   dashed line and the points it got. Feet or meters, picked from your phone's region. */
(() => {
  'use strict';
  const V = window.BLViews, G = window.BLGames, BL = window.BL;
  const M = () => G.measure, S = () => window.MeasureStage;
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const SPAN = 15;   // the slider reaches 15 times shorter or taller than the reference
  const REF = '#6F9BFF', TGT = '#FF5A47', TGT_TEXT = '#FF8A7A';
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
  const ease = t => 1 - Math.pow(1 - t, 3);
  // The pair as the stage draws it: some things use a hand-drawn outline instead of their emoji.
  const drawable = pr => ({ ref: Object.assign({}, pr.ref, { e: pr.ref.s || pr.ref.e }), tgt: Object.assign({}, pr.tgt, { e: pr.tgt.s || pr.tgt.e }) });

  // Pixels per meter so the tallest height fits under the top, and each silhouette
  // fits in its own half of the stage.
  function fitK(stage, shapes, heights, hFrac) {
    const gy = stage.ground(), W = stage.width();
    let k = (gy * hFrac) / Math.max(...heights);
    for (const o of shapes) k = Math.min(k, (W * 0.42) / (o.v * S().aspect(o.e)));
    return k;
  }

  // The reveal: the reference, the real thing growing up from the ground (with your
  // guess as a faint ghost behind it), and a dashed line at every player's guess.
  function revealScene(stage, o) {
    const p = o.p, real = o.results.real, gs = [];
    o.players.forEach((pl, i) => { const r = o.results.guesses[i]; if (r && r.guess != null) gs.push([i, r]); });
    const mine = o.mine >= 0 ? o.results.guesses[o.mine] : null, hasMine = !!(mine && mine.guess != null);
    const shapes = [{ v: p.ref.v, e: p.ref.e }, { v: real, e: p.tgt.e }];
    if (hasMine) shapes.push({ v: mine.guess, e: p.tgt.e });
    const k = fitK(stage, shapes, [p.ref.v, real].concat(gs.map(([, r]) => r.guess)), 0.84) * (o.zoom || 1);
    const grow = o.grow == null ? 1 : o.grow;
    const items = [{ id: 'ref', emoji: p.ref.e, color: REF, v: p.ref.v, x: 0.28, top: fmtHeight(p.ref.v) }];
    if (hasMine) items.push({ id: 'ghost', emoji: p.tgt.e, color: '#EEF2FA', v: mine.guess, x: 0.72, alpha: 0.18 });
    items.push({ id: 'tgt', emoji: p.tgt.e, color: TGT, v: real * grow, x: 0.72, top: grow >= 1 ? fmtHeight(real) : '', labelColor: TGT_TEXT });
    const lines = gs.map(([i, r]) => ({ v: r.guess, color: V.moreless.COLORS[i % 8], label: o.label(i, r), x0: 0.5, x1: 0.985 }));
    return { k, items, lines };
  }

  const ZOOM_SVG = (plus) => `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M7.5 10.5h6${plus ? 'M10.5 7.5v6' : ''}M15.5 15.5L20 20"/></svg>`;

  V.measure = {
    fmtHeight, prefs, fitK, revealScene, drawable, REF, TGT, ease, ZOOM_SVG,
    mount(el, ctx) {
      el.innerHTML = `
        <div class="mu">
          <div class="ml-top"><div class="ml-players mu-players"></div><div class="ml-clock" hidden><i></i></div></div>
          <p class="mu-q"></p>
          <div class="mu-stage">
            <canvas class="mu-canvas" role="img" aria-label="The two things side by side, to scale"></canvas>
            <div class="mu-zoom"><button type="button" data-z="in" aria-label="Zoom in">${ZOOM_SVG(true)}</button><button type="button" data-z="out" aria-label="Zoom out">${ZOOM_SVG(false)}</button></div>
          </div>
          <div class="mu-input">
            <input type="range" class="mu-slider" min="-1" max="1" step="0.001" value="0" aria-label="Your guess">
            <div class="mu-fine"><button type="button" class="btn" data-n="-1" aria-label="A bit shorter">−</button><b class="mu-val"></b><button type="button" class="btn" data-n="1" aria-label="A bit taller">+</button></div>
            <button type="button" class="btn primary big mu-lock">Lock in</button>
          </div>
          <p class="ml-note mu-note" aria-live="polite"></p>
        </div>`;
      const root = el.querySelector('.mu'), q = s => el.querySelector(s), slider = q('.mu-slider');
      const canvas = q('.mu-canvas'), stage = S().create(canvas);
      let snap = null, sent = { k: '' }, x = 0, xRound = '', seenEv = -1, lastTick = 0, lastReady = '';
      let zoom = 1, zoomFor = '', k = 1, drag = null, growFor = '', growT0 = 0, raf = 0;
      const me = () => snap.viewer;
      const pair = () => M().current(snap.state);
      const guess = () => pair().ref.v * Math.pow(SPAN, x);
      const showsReveal = s => (s.phase === 'reveal' || s.winner != null) && !!s.results;
      const canSize = () => !!snap && snap.canAct && snap.state.started && snap.state.winner == null && snap.state.phase === 'ask'
        && ctx.now() >= snap.state.askedAt && snap.state.answers[String(me())] == null;

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
      // Zoom the whole view in or out, both things together.
      q('.mu-zoom').addEventListener('click', e => {
        const b = e.target.closest('[data-z]'); if (!b) return;
        zoom = Math.max(0.1, Math.min(20, zoom * (b.dataset.z === 'in' ? 1.4 : 1 / 1.4)));
        drawStage();
      });
      // Or drag the red one up and down (anywhere on the right half). The scale holds
      // still while you drag, and catches up when you let go.
      const setFromY = y => {
        const h = Math.max(3, stage.ground() - y);
        x = Math.max(-1, Math.min(1, Math.log(h / k / pair().ref.v) / Math.log(SPAN)));
        slider.value = x; paint();
      };
      canvas.addEventListener('pointerdown', e => {
        if (!canSize()) return;
        const r = canvas.getBoundingClientRect();
        if (e.clientX - r.left < r.width * 0.45) return;
        drag = { id: e.pointerId, k };
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
        e.preventDefault();
        setFromY(e.clientY - r.top);
      });
      canvas.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id) return;
        setFromY(e.clientY - canvas.getBoundingClientRect().top);
      });
      const endDrag = e => { if (!drag || e.pointerId !== drag.id) return; drag = null; drawStage(); };
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);
      const ro = new ResizeObserver(() => { stage.size(); drawStage(); });
      ro.observe(canvas);

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

      function drawStage() {
        cancelAnimationFrame(raf); raf = 0;
        if (!snap) return;
        if (!stage.width()) stage.size();
        if (!stage.width() || !stage.height()) return;
        const s = snap.state, p = drawable(pair()), gy = stage.ground();
        canvas.classList.toggle('drag', canSize());
        if (showsReveal(s)) {
          const gk = `${s.seed}:${s.round}`;
          if (growFor !== gk) { growFor = gk; growT0 = performance.now(); }
          const t = Math.min(1, (performance.now() - growT0) / 900), many = s.players.length > 1;
          const sc = revealScene(stage, {
            p, results: s.results, players: s.players, mine: me(), zoom, grow: ease(t),
            label: (i, r) => `${many ? (i === me() ? 'You' : ctx.names[i] || s.players[i].name) : 'You'} ${fmtHeight(r.guess)} +${r.pts}${r.closest ? ' ★' : ''}`,
          });
          k = sc.k;
          stage.draw(sc);
          if (t < 1) raf = requestAnimationFrame(drawStage);
          return;
        }
        const mineAns = s.answers[String(me())], g = mineAns != null ? mineAns : guess();
        if (drag) k = drag.k;
        else {
          // The reference stands a bit under half height; if your guess outgrows the
          // stage, the view zooms out by itself.
          k = Math.min((gy * 0.42) / p.ref.v, fitK(stage, [{ v: p.ref.v, e: p.ref.e }, { v: g, e: p.tgt.e }], [p.ref.v, g], 0.9)) * zoom;
        }
        stage.draw({ k, items: [
          { id: 'ref', emoji: p.ref.e, color: REF, v: p.ref.v, x: 0.28, top: fmtHeight(p.ref.v) },
          { id: 'tgt', emoji: p.tgt.e, color: TGT, v: g, x: 0.72, top: fmtHeight(g), labelColor: TGT_TEXT, handle: canSize() },
        ] });
      }

      function paint() {
        if (!snap) return;
        const s = snap.state, p = pair(), reveal = s.phase === 'reveal' || s.winner != null, many = s.players.length > 1;
        const key = `${s.seed}:${s.round}`;
        if (xRound !== key) { xRound = key; x = 0; slider.value = 0; }
        if (zoomFor !== `${key}:${reveal}`) { zoomFor = `${key}:${reveal}`; zoom = 1; }
        const mineAns = s.answers[String(me())];
        q('.mu-q').innerHTML = `${esc(p.ref.e)} <b class="ref">${esc(p.ref.t)}</b> is <b>${esc(fmtHeight(p.ref.v))}</b> tall.<br>How tall is ${esc(p.tgt.e)} <b class="tgt">${esc(p.tgt.t)}</b>?`;
        drawStage();
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
        else note = `Round ${s.round} of ${s.rounds}. Slide, or drag the red one, until it looks right.`;
        q('.mu-note').textContent = note;
        root.classList.toggle('revealing', reveal);
        if (seenEv >= 0 && s.ev !== seenEv && s.phase === 'reveal' && s.results) { const r = s.results.guesses[me()]; V.moreless.sound(r && r.pts >= 60 ? 'right' : 'wrong'); }
        seenEv = s.ev;
      }
      const onPrefs = () => paint();
      document.addEventListener('bl:quizprefs', onPrefs);
      return {
        render(sn) { snap = sn; paint(); },
        refresh() { stage.size(); paint(); },
        destroy() { clearInterval(tick); cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('bl:quizprefs', onPrefs); },
      };
    },
  };
})();
