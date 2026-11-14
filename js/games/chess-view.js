/* Chess board screen: piece sets, board themes, drag or tap to move, sounds,
   clocks, draw offers, bot hints and takebacks, and move-by-move review.
   ctx (from hub.js): mode 'bot' | 'online' | 'local', names, send(move), now(),
   and for bot games hint(), takeback(), canTakeback(), thinking(). */
(() => {
  'use strict';
  const V = window.BLViews, C = window.BLGames.chess;
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const T = '︎';
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  // ------------------------------------------------------------------ looks
  const BOARDS = {
    blue: { name: 'Blueline', lt: '#E8EDF5', dk: '#8FA3C4' },
    wood: { name: 'Walnut', lt: '#F0D9B5', dk: '#B58863' },
    green: { name: 'Tournament', lt: '#E9EDCC', dk: '#6E9A55' },
    slate: { name: 'Midnight', lt: '#C9D3E3', dk: '#4A5A78' },
    rose: { name: 'Rose', lt: '#F7E4E7', dk: '#C88A98' },
    sand: { name: 'Sandstone', lt: '#F1E8D3', dk: '#C4A57A' },
  };
  const PIECE_SETS = { modern: 'Modern', classic: 'Classic', letters: 'Letters' };
  const PIECE_COLORS = { classic: 'Ivory and ebony', team: 'Blue and amber', mono: 'Pearl and slate' };
  const LOOK_DEFAULT = { board: 'blue', pieces: 'modern', colors: 'classic', sound: true, coords: true, dots: true };
  const look = () => Object.assign({}, LOOK_DEFAULT, (window.BL && window.BL.store.get('chessLook', {})) || {});

  // A piece set drawn for Blueline (45×45 units).
  const SVG = {
    p: '<circle cx="22.5" cy="12.5" r="5.5"/><path d="M16.5 31c0-6 3-10.5 6-12.5 3 2 6 6.5 6 12.5z"/><rect x="12" y="31" width="21" height="6" rx="2.5"/>',
    r: '<path d="M12 9.5h5v4h3v-4h5v4h3v-4h5v9h-21z"/><path d="M14.5 18.5h16l-1 13.5h-14z"/><rect x="11" y="32" width="23" height="6" rx="2"/>',
    b: '<circle cx="22.5" cy="8" r="3"/><path d="M22.5 11c-6 4.5-8.5 10-7.5 15.5l1 4.5h13l1-4.5c1-5.5-1.5-11-7.5-15.5z"/><path class="cut" d="M19.5 21l6-5.5"/><rect x="11" y="32" width="23" height="6" rx="2.5"/>',
    n: '<path d="M13 37h19c.5-8 1.5-17-4-24l-1-5.5-2.5 3c-5.5 0-9.5 3.5-11.5 8.5l-2.5 5.5c-.5 2 1 3.5 3 3l4-2 3-3c1 3.5-2 7.5-7.5 14.5z"/><circle class="eye" cx="21.5" cy="15" r="1.5"/>',
    q: '<path d="M11 33L9 16l5.5 9 1-13.5 4.5 12.5 2.5-14.5 2.5 14.5 4.5-12.5 1 13.5 5.5-9-2 17z"/><circle cx="9" cy="14.5" r="2.4"/><circle cx="15.5" cy="10" r="2.4"/><circle cx="22.5" cy="8" r="2.4"/><circle cx="29.5" cy="10" r="2.4"/><circle cx="36" cy="14.5" r="2.4"/><rect x="10" y="33" width="25" height="5" rx="2"/>',
    k: '<rect x="21" y="3.5" width="3" height="10" rx="1"/><rect x="17.5" y="6.5" width="10" height="3" rx="1"/><path d="M12.5 33c-2-6-2.5-11 1.5-14 4-3 8.5-2 8.5 1 0-3 4.5-4 8.5-1 4 3 3.5 8 1.5 14z"/><rect x="10" y="33" width="25" height="5" rx="2"/>',
  };
  function pieceHtml(p, set) {
    const t = p.toLowerCase(), side = p === p.toUpperCase() ? 'w' : 'b';
    if (set === 'classic') return `<span class="pc glyph ${side}">${GLYPH[t]}${T}</span>`;
    if (set === 'letters') return `<span class="pc letter ${side}">${t === 'n' ? 'N' : t.toUpperCase()}</span>`;
    return `<svg class="pc svg ${side}" viewBox="0 0 45 45" aria-hidden="true">${SVG[t]}</svg>`;
  }

  // ----------------------------------------------------------------- sounds
  let audio = null;
  function sound(kind) {
    if (!look().sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime;
      const tone = (freq, at, dur, type, vol) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t0 + at);
        g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        o.connect(g).connect(audio.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
      };
      const knock = (at, freq, vol) => {
        const len = Math.floor(audio.sampleRate * 0.06), buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
        const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
        src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 2.5; g.gain.value = vol;
        src.connect(f).connect(g).connect(audio.destination); src.start(t0 + at);
      };
      if (kind === 'move') knock(0, 1400, 0.9);
      else if (kind === 'capture') { knock(0, 900, 1.1); knock(0.045, 600, 0.7); }
      else if (kind === 'check') { knock(0, 1400, 0.8); tone(880, 0.05, 0.12, 'sine', 0.08); }
      else if (kind === 'end') { tone(523, 0, 0.18, 'triangle', 0.1); tone(659, 0.14, 0.18, 'triangle', 0.1); tone(784, 0.28, 0.3, 'triangle', 0.1); }
      else if (kind === 'low') tone(660, 0, 0.08, 'square', 0.04);
    } catch (e) { /* sound unavailable */ }
  }

  const fmtClock = ms => {
    if (ms == null) return '';
    ms = Math.max(0, ms);
    if (ms < 10000) return (ms / 1000).toFixed(1);
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  // Board as it stood after `n` moves, for review.
  function replay(state, n) {
    let s = C.create();
    const moves = state.moves || [];
    for (let i = 0; i < n && i < moves.length; i++) s = C.apply(s, moves[i], s.turn);
    return s;
  }

  V.chess = {
    look, BOARDS, PIECE_SETS, PIECE_COLORS, pieceHtml, sound,
    mount(el, ctx) {
      el.innerHTML = `
        <div class="ch">
          <div class="ch-bar" data-side="top"><span class="ch-who"></span><span class="ch-cap"></span><span class="ch-clock"></span></div>
          <div class="ch-wrap">
            <div class="ch-board" role="grid" aria-label="Chess board">${Array.from({ length: 64 }, (_, v) => `<div class="sq" data-v="${v}" role="gridcell"></div>`).join('')}</div>
            <div class="ch-promo" hidden><p>Promote to</p><div class="ch-promo-row"></div><button type="button" class="btn ghost" data-a="cancel-promo">Cancel</button></div>
          </div>
          <div class="ch-bar" data-side="bottom"><span class="ch-who"></span><span class="ch-cap"></span><span class="ch-clock"></span></div>
          <div class="ch-offer" hidden></div>
          <div class="ch-review" hidden>
            <button type="button" class="icon-btn small" data-r="first" aria-label="First move"><svg viewBox="0 0 24 24"><path d="M6 5v14M18 5l-8 7 8 7"/></svg></button>
            <button type="button" class="icon-btn small" data-r="prev" aria-label="Previous move"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
            <span class="ch-review-at"></span>
            <button type="button" class="icon-btn small" data-r="next" aria-label="Next move"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
            <button type="button" class="icon-btn small" data-r="last" aria-label="Latest move"><svg viewBox="0 0 24 24"><path d="M18 5v14M6 5l8 7-8 7"/></svg></button>
          </div>
          <div class="ch-tools"></div>
          <div class="ch-moves" aria-label="Moves"></div>
        </div>`;
      const root = el.querySelector('.ch'), boardEl = el.querySelector('.ch-board'), squares = Array.from(boardEl.children);
      const promoEl = el.querySelector('.ch-promo'), toolsEl = el.querySelector('.ch-tools'), offerEl = el.querySelector('.ch-offer'), reviewEl = el.querySelector('.ch-review');
      let snap = null, selFrom = -1, targets = [], flipped = null, review = null, hint = null, drag = null, lastLen = -1, lastLowBeep = 0, flaggedAt = -1;
      let L = look();

      const viewerSeat = () => (snap ? snap.viewer : 0);
      const isFlipped = () => (flipped != null ? flipped : viewerSeat() === 1);
      const sqAt = v => (isFlipped() ? 63 - v : v);
      const shown = () => (review != null ? review.state : snap.state);
      const interactive = () => snap && snap.canAct && review == null && !(ctx.thinking && ctx.thinking());

      function applyLook() {
        L = look();
        const b = BOARDS[L.board] || BOARDS.blue;
        root.style.setProperty('--sq-lt', b.lt);
        root.style.setProperty('--sq-dk', b.dk);
        root.className = `ch set-${L.pieces} colors-${L.colors}${L.coords ? '' : ' no-coords'}`;
      }

      function select(i) {
        const s = snap.state;
        selFrom = i;
        targets = i >= 0 ? C.movesFrom(s, i) : [];
      }
      const ownPiece = i => { const s = snap.state, c = s.board[i]; return c !== '.' && ((s.turn === 0) === (c === c.toUpperCase())); };

      function tryMove(to) {
        const hits = targets.filter(m => m.to === to);
        if (!hits.length) return false;
        if (hits.length > 1) { askPromo(hits); return true; }
        commit(hits[0]);
        return true;
      }
      function commit(m) {
        selFrom = -1; targets = []; hint = null;
        ctx.send({ from: m.from, to: m.to, promo: m.promo, at: ctx.now() });
      }
      function askPromo(hits) {
        const white = snap.state.turn === 0;
        promoEl.querySelector('.ch-promo-row').innerHTML = 'qrbn'.split('').map(p =>
          `<button type="button" data-p="${p}" aria-label="${({ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' })[p]}">${pieceHtml(white ? p.toUpperCase() : p, L.pieces)}</button>`).join('');
        promoEl.hidden = false;
        promoEl.onclick = e => {
          if (e.target.closest('[data-a=cancel-promo]')) { promoEl.hidden = true; return; }
          const b = e.target.closest('[data-p]');
          if (!b) return;
          promoEl.hidden = true;
          commit(hits.find(x => x.promo === b.dataset.p));
        };
      }

      // Tap or drag to move.
      boardEl.addEventListener('pointerdown', e => {
        const cell = e.target.closest('[data-v]');
        if (!cell || !snap || (e.pointerType === 'mouse' && e.button !== 0)) return;
        if (!interactive()) return;
        const i = sqAt(+cell.dataset.v);
        if (selFrom >= 0 && i !== selFrom && targets.some(m => m.to === i)) { e.preventDefault(); tryMove(i); return; }
        if (ownPiece(i)) {
          e.preventDefault();
          const wasSel = selFrom === i;
          select(i);
          drag = { from: i, x: e.clientX, y: e.clientY, moved: false, wasSel, ghost: null, id: e.pointerId };
          try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
          paint();
        } else { select(-1); paint(); }
      });
      boardEl.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 6) return;
        if (!drag.moved) {
          drag.moved = true;
          const src = squares[isFlipped() ? 63 - drag.from : drag.from];
          const pc = src.querySelector('.pc');
          if (pc) {
            const r = src.getBoundingClientRect();
            const g = document.createElement('div');
            g.className = `ch-ghost ${root.className}`;
            g.style.width = r.width + 'px'; g.style.height = r.height + 'px'; g.style.fontSize = (r.width * 0.82) + 'px';
            g.style.setProperty('--sq-lt', root.style.getPropertyValue('--sq-lt'));
            g.innerHTML = pc.outerHTML;
            document.body.appendChild(g);
            drag.ghost = g; drag.w = r.width;
            src.classList.add('lift');
          }
        }
        if (drag.ghost) drag.ghost.style.transform = `translate(${e.clientX - drag.w / 2}px, ${e.clientY - drag.w / 2}px) scale(1.15)`;
      });
      const endDrag = e => {
        if (!drag || (e && e.pointerId !== drag.id)) return;
        const d = drag; drag = null;
        if (d.ghost) d.ghost.remove();
        squares.forEach(s => s.classList.remove('lift'));
        if (d.moved && e && e.type === 'pointerup') {
          const under = document.elementFromPoint(e.clientX, e.clientY);
          const cell = under && under.closest && under.closest('.ch-board [data-v]');
          if (cell && tryMove(sqAt(+cell.dataset.v))) return;
        } else if (!d.moved && d.wasSel) { select(-1); }
        paint();
      };
      boardEl.addEventListener('pointerup', endDrag);
      boardEl.addEventListener('pointercancel', endDrag);

      reviewEl.addEventListener('click', e => {
        const b = e.target.closest('[data-r]');
        if (!b || !snap) return;
        const total = (snap.state.moves || []).length;
        let n = review != null ? review.n : total;
        if (b.dataset.r === 'first') n = 0;
        if (b.dataset.r === 'prev') n = Math.max(0, n - 1);
        if (b.dataset.r === 'next') n = Math.min(total, n + 1);
        if (b.dataset.r === 'last') n = total;
        review = n === total && !C.over(snap.state) ? null : { n, state: replay(snap.state, n) };
        selFrom = -1; targets = [];
        paint();
      });

      toolsEl.addEventListener('click', async e => {
        const b = e.target.closest('[data-t]');
        if (!b || !snap) return;
        const t = b.dataset.t;
        if (t === 'flip') { flipped = !isFlipped(); paint(); }
        if (t === 'review') {
          if (review != null && !C.over(snap.state)) review = null;
          else { const n = Math.max(0, (snap.state.moves || []).length - 1); review = { n, state: replay(snap.state, n) }; }
          paint();
        }
        if (t === 'hint' && ctx.hint) {
          b.disabled = true;
          const m = await ctx.hint();
          b.disabled = false;
          if (m) { hint = m; select(m.from); paint(); }
        }
        if (t === 'takeback' && ctx.takeback) { review = null; hint = null; select(-1); ctx.takeback(); }
        if (t === 'resign') ctx.confirm('Resign this game?', `${ctx.names[1 - viewerSeat()]} gets the win.`, 'Resign', () => ctx.send({ resign: true }));
        if (t === 'draw') ctx.confirm('Offer a draw?', `${ctx.names[1 - viewerSeat()]} can accept or keep playing.`, 'Offer draw', () => ctx.send({ offer: true }));
      });
      offerEl.addEventListener('click', e => {
        const b = e.target.closest('[data-o]');
        if (b) ctx.send(b.dataset.o === 'accept' ? { accept: true } : { decline: true });
      });

      // Clocks tick on screen, and either phone can call time when one runs out.
      const tick = setInterval(() => {
        if (!snap || !snap.state.clock || C.over(snap.state)) return;
        paintClocks();
        const s = snap.state, now = ctx.now();
        if (s.clock.running && C.clockLeft(s, s.turn, now) <= 0 && flaggedAt !== s.moves.length) {
          flaggedAt = s.moves.length;
          ctx.send({ flag: true, at: now });
        }
      }, 200);

      function paintClocks() {
        const s = snap.state, now = ctx.now();
        for (const side of ['top', 'bottom']) {
          const seat = side === 'bottom' ? (isFlipped() ? 1 : 0) : (isFlipped() ? 0 : 1);
          const clk = root.querySelector(`.ch-bar[data-side="${side}"] .ch-clock`);
          if (!s.clock) { clk.hidden = true; continue; }
          clk.hidden = false;
          const left = C.clockLeft(s, seat, now);
          clk.textContent = fmtClock(left);
          const running = s.clock.running && s.turn === seat && !C.over(s);
          clk.classList.toggle('run', running);
          clk.classList.toggle('low', left < 20000);
          if (running && left < 10000 && seat === viewerSeat() && ctx.mode === 'online' && Date.now() - lastLowBeep > 1000) { lastLowBeep = Date.now(); sound('low'); }
        }
      }

      function material(s) {
        let w = 0, b = 0;
        for (const ch of s.board) { if (ch === '.') continue; const v = VAL[ch.toLowerCase()]; if (ch === ch.toUpperCase()) w += v; else b += v; }
        return w - b;
      }
      function capRow(captured, byWhite) {
        // Pieces this side has taken (the other side's pieces).
        const order = 'qrbnp';
        return captured.split('').filter(c => (c === c.toLowerCase()) === byWhite)
          .sort((a, b) => order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase()))
          .map(c => `<i>${pieceHtml(c, L.pieces)}</i>`).join('');
      }

      function paint() {
        if (!snap) return;
        const live = snap.state, s = shown();
        const last = s.last || {}, kingInCheck = s.check ? s.board.indexOf(s.turn === 0 ? 'K' : 'k') : -1;
        const tset = new Map(targets.map(m => [m.to, m]));
        squares.forEach((cell, v) => {
          const i = sqAt(v), p = s.board[i], f = i % 8, r = Math.floor(i / 8);
          let cls = 'sq ' + ((f + r) % 2 ? 'dk' : 'lt');
          if (i === last.from || i === last.to) cls += ' last';
          if (review == null && i === selFrom) cls += ' sel';
          if (i === kingInCheck) cls += ' check';
          if (review == null && L.dots && tset.has(i)) cls += p !== '.' || tset.get(i).ep ? ' cap' : ' dot';
          if (review == null && hint && (i === hint.from || i === hint.to)) cls += ' hintsq';
          if (cell.className !== cls) cell.className = cls;
          const coord = (v % 8 === 0 ? `<em class="rk">${8 - r}</em>` : '') + (v >= 56 ? `<em class="fl">${'abcdefgh'[f]}</em>` : '');
          const html = (p !== '.' ? pieceHtml(p, L.pieces) : '') + coord;
          if (cell._html !== html) { cell.innerHTML = html; cell._html = html; }
        });
        boardEl.classList.toggle('can', interactive());
        // Player bars: you at the bottom.
        const diff = material(s);
        for (const side of ['top', 'bottom']) {
          const seat = side === 'bottom' ? (isFlipped() ? 1 : 0) : (isFlipped() ? 0 : 1);
          const bar = root.querySelector(`.ch-bar[data-side="${side}"]`);
          const adv = seat === 0 ? diff : -diff;
          bar.querySelector('.ch-who').innerHTML = `<i class="dot-side ${seat === 0 ? 'w' : 'b'}"></i>${esc(ctx.names[seat] || (seat === 0 ? 'White' : 'Black'))}${ctx.mode === 'bot' && seat !== viewerSeat() && ctx.thinking && ctx.thinking() ? ' <small>thinking…</small>' : ''}`;
          bar.querySelector('.ch-cap').innerHTML = capRow(s.captured || '', seat === 0) + (adv > 0 ? `<b>+${adv}</b>` : '');
          bar.classList.toggle('turn', !C.over(live) && live.turn === seat && review == null);
        }
        paintClocks();
        // Draw offer banner.
        if (live.offer != null && !C.over(live) && ctx.mode === 'online') {
          offerEl.hidden = false;
          offerEl.innerHTML = live.offer === viewerSeat()
            ? `<span>You offered a draw. Waiting for ${esc(ctx.names[1 - viewerSeat()])}.</span>`
            : `<span>${esc(ctx.names[live.offer])} offers a draw.</span><button type="button" class="btn primary" data-o="accept">Accept</button><button type="button" class="btn" data-o="decline">Keep playing</button>`;
        } else offerEl.hidden = true;
        // Review bar.
        const total = (live.moves || []).length;
        reviewEl.hidden = !(review != null || C.over(live));
        const at = review != null ? review.n : total;
        reviewEl.querySelector('.ch-review-at').textContent = !total ? 'No moves yet' : at === 0 ? 'Start position' : `Move ${at} of ${total}`;
        // Tools.
        const over = C.over(live), tools = [];
        if (!over && ctx.mode === 'bot') {
          tools.push(['hint', 'Hint', '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/>', !interactive()]);
          tools.push(['takeback', 'Take back', '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>', !(ctx.canTakeback && ctx.canTakeback())]);
        }
        if (!over && ctx.mode === 'online') tools.push(['draw', 'Offer draw', '<path d="M5 12h14M5 7h14M5 17h14"/>', live.offer != null || total < 2]);
        tools.push(['flip', 'Flip', '<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>', false]);
        if (!over) tools.push(['review', review != null ? 'Back to game' : 'Review', '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>', total === 0]);
        if (!over && ctx.mode !== 'local') tools.push(['resign', 'Resign', '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', false]);
        toolsEl.innerHTML = tools.map(([t, label, icon, dis]) => `<button type="button" class="tool" data-t="${t}" ${dis ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${label}</span></button>`).join('');
        // Move list.
        const h = live.history || [];
        const pairs = [];
        for (let k = 0; k < h.length; k += 2) pairs.push(`<span${review != null && (review.n === k + 1 || review.n === k + 2) ? ' class="cur"' : ''}><b>${k / 2 + 1}.</b> ${esc(h[k])}${h[k + 1] ? ' ' + esc(h[k + 1]) : ''}</span>`);
        const mv = root.querySelector('.ch-moves');
        mv.innerHTML = pairs.join('') || '<span class="muted">White moves first</span>';
        const cur = mv.querySelector('.cur');
        if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' }); else mv.scrollLeft = mv.scrollWidth;
      }

      applyLook();
      const onLook = () => { applyLook(); squares.forEach(c => { c._html = null; }); paint(); };
      document.addEventListener('bl:chesslook', onLook);

      return {
        render(s) {
          const prev = snap ? snap.state : null;
          snap = s;
          const len = (s.state.moves || []).length;
          if (!prev || len !== lastLen || prev.turn !== s.state.turn) { select(-1); promoEl.hidden = true; if (review && !C.over(s.state)) review = null; }
          if (prev && len > lastLen && lastLen >= 0) {
            const st = s.state, lastCap = (st.captured || '').length > (prev.captured || '').length;
            sound(C.over(st) ? 'end' : st.check ? 'check' : lastCap ? 'capture' : 'move');
            hint = null;
            flaggedAt = -1;
          } else if (prev && !C.over(prev) && C.over(s.state)) sound('end');
          lastLen = len;
          paint();
        },
        refresh() { paint(); },
        destroy() { clearInterval(tick); document.removeEventListener('bl:chesslook', onLook); if (drag && drag.ghost) drag.ghost.remove(); },
      };
    },
  };
})();
