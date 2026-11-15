/* Checkers screen: both players with their piece color, what's left and what
   they've taken; the board turned so your pieces are at the bottom. Tap a piece to
   see where it can go, tap a square to move; for a double jump, tap each landing
   in turn. A note says when you have to jump. Bot games get Undo and Hint.
   Look (checkersLook): piece colors, board, move dots, sounds. */
(() => {
  'use strict';
  const V = window.BLViews, G = window.BLGames, BL = window.BL;
  const K = () => G.checkers;
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const SETS = {
    classic: { name: 'Red and black', c: ['#C8312A', '#26292F'] },
    ocean: { name: 'Blue and white', c: ['#2F6BF0', '#F2F4F8'] },
    wood: { name: 'Maple and walnut', c: ['#E2B979', '#6B4428'] },
    candy: { name: 'Pink and teal', c: ['#EC5C9F', '#18A8A8'] },
    gold: { name: 'Gold and silver', c: ['#D9A21B', '#AAB4C4'] },
  };
  const BOARDS = {
    green: { name: 'Tournament', lt: '#EEE6CC', dk: '#4E7A4A' },
    wood: { name: 'Wood', lt: '#F0D9B5', dk: '#A67550' },
    blue: { name: 'Blueline', lt: '#E8EDF5', dk: '#6F86AE' },
    slate: { name: 'Midnight', lt: '#AEB9CC', dk: '#3B4762' },
    red: { name: 'Parlor', lt: '#F3E1CF', dk: '#8E3B36' },
  };
  const look = () => Object.assign({ set: 'classic', board: 'green', dots: true, sound: true }, BL.store.get('checkersLook', {}));
  const CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18l-1.5-9-4.5 4-3-7-3 7-4.5-4L3 18Z"/></svg>';
  const pieceHtml = ch => (ch === '.' ? '' : `<span class="ck-pc p${K().owner(ch)}${K().isKing(ch) ? ' king' : ''}">${K().isKing(ch) ? CROWN : ''}</span>`);
  function applyLook(el, L = look()) {
    const set = SETS[L.set] || SETS.classic, b = BOARDS[L.board] || BOARDS.green;
    el.style.setProperty('--ck0', set.c[0]);
    el.style.setProperty('--ck1', set.c[1]);
    el.style.setProperty('--ck-lt', b.lt);
    el.style.setProperty('--ck-dk', b.dk);
  }

  let audio = null;
  function sound(kind) {
    if (!look().sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime;
      const knock = (at, freq, vol) => {
        const len = Math.floor(audio.sampleRate * 0.06), buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
        const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
        src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 2.5; g.gain.value = vol;
        src.connect(f).connect(g).connect(audio.destination); src.start(t0 + at);
      };
      const tone = (f, at, dur, vol) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(f, t0 + at);
        g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        o.connect(g).connect(audio.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
      };
      if (kind === 'move') knock(0, 1200, 0.9);
      else if (kind === 'capture') { knock(0, 900, 1); knock(0.07, 700, 0.8); }
      else if (kind === 'king') { knock(0, 1200, 0.8); tone(784, 0.05, 0.15, 0.08); tone(1047, 0.15, 0.2, 0.08); }
      else if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, 0.09));
      else if (kind === 'lose') [392, 330, 262].forEach((f, i) => tone(f, i * 0.13, 0.25, 0.07));
    } catch (e) { /* no sound */ }
  }

  V.checkers = {
    SETS, BOARDS, look, pieceHtml, applyLook, sound, CROWN,
    mount(el, ctx) {
      el.innerHTML = `
        <div class="ck">
          <div class="ck-bar" data-side="top"><i class="ck-chip"></i><span><b></b><small></small></span><span class="ck-took"></span></div>
          <div class="ck-board" role="grid" aria-label="Checkers board">${Array.from({ length: 64 }, (_, v) => `<button type="button" class="ck-sq" data-v="${v}" tabindex="-1"></button>`).join('')}</div>
          <div class="ck-bar" data-side="bottom"><i class="ck-chip"></i><span><b></b><small></small></span><span class="ck-took"></span></div>
          <p class="ck-note" aria-live="polite"></p>
          <div class="ck-tools" hidden>
            <button type="button" class="tool" data-t="undo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg><span>Undo</span></button>
            <button type="button" class="tool" data-t="hint"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/></svg><span>Hint</span></button>
          </div>
        </div>`;
      const root = el.querySelector('.ck'), boardEl = el.querySelector('.ck-board'), note = el.querySelector('.ck-note'), tools = el.querySelector('.ck-tools');
      const squares = Array.from(boardEl.children);
      let snap = null, sel = null, hint = null, hintT = 0, seenMoves = -1, seenOver = false;
      // The viewer's pieces sit at the bottom: seat 1 sees the board turned round.
      const flip = () => !!snap && ctx.mode !== 'local' && snap.viewer === 1;
      const sqAt = v => (flip() ? 63 - v : v);
      const busy = () => !!(ctx.thinking && ctx.thinking());
      const canMove = () => !!snap && snap.canAct && !busy() && snap.state.winner == null;
      const matching = prefix => K().legalMoves(snap.state).filter(m => prefix.every((x, i) => m.path[i] === x));

      function tap(i) {
        if (!canMove()) return;
        const s = snap.state, me = s.turn;
        if (sel) {
          const next = matching(sel.concat(i));
          if (next.length) {
            const path = sel.concat(i);
            const done = next.find(m => m.path.length === path.length);
            if (done && next.length === 1) { sel = null; hint = null; ctx.send({ path }); BL.buzz && BL.buzz(8); return; }
            sel = path;                       // part of a longer jump: keep going
            paint();
            return;
          }
        }
        if (K().owner(s.board[i]) === me) {
          const ms = K().movesFrom(s, i);
          if (!ms.length) { note.textContent = K().mustCapture(s) ? 'You have to jump. Pick a piece that can.' : 'That piece can’t move.'; sel = null; paint(); return; }
          sel = sel && sel.length === 1 && sel[0] === i ? null : [i];
          note.textContent = '';
          paint();
          return;
        }
        sel = null;
        paint();
      }
      boardEl.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) tap(sqAt(+b.dataset.v)); });
      tools.addEventListener('click', async e => {
        const t = e.target.closest('[data-t]');
        if (!t || t.disabled) return;
        if (t.dataset.t === 'undo') { sel = null; hint = null; ctx.takeback && ctx.takeback(); return; }
        if (t.dataset.t === 'hint' && ctx.hint) {
          t.disabled = true; note.textContent = 'Thinking…';
          const mv = await ctx.hint();
          t.disabled = false; note.textContent = '';
          if (mv && mv.path) { hint = mv.path; sel = null; paint(); clearTimeout(hintT); hintT = setTimeout(() => { hint = null; paint(); }, 3500); }
        }
      });
      const onLook = () => paint();
      document.addEventListener('bl:checkerslook', onLook);

      function paint() {
        if (!snap) return;
        const s = snap.state, L = look(), over = s.winner != null;
        applyLook(root, L);
        const last = s.last || {}, lastSet = new Set(last.path || []), caps = new Set(last.caps || []);
        const targets = new Set(), path = sel ? new Set(sel) : new Set();
        if (sel && canMove()) for (const m of matching(sel)) if (m.path.length > sel.length) targets.add(m.path[sel.length]);
        const hintSet = new Set(hint || []);
        const movable = new Set();
        if (canMove() && !sel) for (const m of K().legalMoves(s)) movable.add(m.path[0]);
        squares.forEach((cell, v) => {
          const i = sqAt(v), r = Math.floor(i / 8), c = i % 8, dark = (r + c) % 2 === 1;
          let ch = s.board[i];
          // While picking a multi-jump, show the piece at its latest landing.
          if (sel && sel.length > 1) { if (i === sel[0]) ch = '.'; if (i === sel[sel.length - 1]) ch = s.board[sel[0]]; }
          let cls = 'ck-sq ' + (dark ? 'dk' : 'lt');
          if (lastSet.has(i)) cls += ' last';
          if (caps.has(i) && s.moves.length !== seenMoves) cls += ' gone';
          if (sel && i === sel[sel.length - 1]) cls += ' sel';
          else if (path.has(i)) cls += ' trail';
          if (targets.has(i)) cls += L.dots ? ' dot' : ' target';
          if (hintSet.has(i)) cls += ' hint';
          if (movable.has(i) && K().mustCapture(s)) cls += ' must';
          if (cell.className !== cls) cell.className = cls;
          const html = pieceHtml(ch);
          if (cell._html !== html) { cell.innerHTML = html; cell._html = html; }
        });
        boardEl.classList.toggle('can', canMove());
        // Players
        const names = ctx.names, local = ctx.mode === 'local';
        for (const side of ['top', 'bottom']) {
          const seat = side === 'bottom' ? (flip() ? 1 : 0) : (flip() ? 0 : 1);
          const bar = el.querySelector(`.ck-bar[data-side="${side}"]`);
          const left = K().pieces(s, seat), you = !local && seat === snap.viewer;
          bar.querySelector('.ck-chip').className = `ck-chip p${seat}`;
          bar.querySelector('b').textContent = (names[seat] || (seat === 0 ? 'Player 1' : 'Player 2')) + (you && names[seat] !== 'You' ? ' (you)' : '');
          let st = `${left.men + left.kings} piece${left.men + left.kings === 1 ? '' : 's'}${left.kings ? `, ${left.kings} king${left.kings === 1 ? '' : 's'}` : ''}`;
          if (over) st = s.winner === seat ? 'Wins!' : s.winner === 'draw' ? 'Draw' : st;
          else if (s.turn === seat) st = ctx.mode === 'bot' && !you ? (busy() ? 'Thinking…' : 'Their move') : you || local ? 'Your move' : 'Their move';
          bar.querySelector('small').textContent = st;
          bar.classList.toggle('turn', !over && s.turn === seat);
          bar.classList.toggle('won', over && s.winner === seat);
          const took = (s.taken || [0, 0])[seat];
          bar.querySelector('.ck-took').innerHTML = took ? `${Array.from({ length: Math.min(took, 12) }, () => `<i class="p${1 - seat}"></i>`).join('')}` : '';
        }
        if (!over && canMove() && !note.textContent) note.textContent = K().mustCapture(s) ? 'You have to jump this turn.' : '';
        if (!canMove()) note.textContent = '';
        const isBot = ctx.mode === 'bot';
        tools.hidden = !isBot || over;
        if (isBot) {
          tools.querySelector('[data-t=undo]').disabled = !(ctx.canTakeback && ctx.canTakeback());
          tools.querySelector('[data-t=hint]').disabled = !canMove();
        }
        // Sounds
        if (seenMoves >= 0 && s.moves.length > seenMoves) sound(last.crowned ? 'king' : (last.caps || []).length ? 'capture' : 'move');
        if (over && !seenOver && seenMoves >= 0) sound(s.winner === 'draw' ? 'move' : local || s.winner === snap.viewer ? 'win' : 'lose');
        seenMoves = s.moves.length;
        seenOver = over;
      }
      return {
        render(sn) { if (snap && sn.state !== snap.state) sel = null; snap = sn; note.textContent = ''; paint(); },
        refresh() { paint(); },
        destroy() { clearTimeout(hintT); document.removeEventListener('bl:checkerslook', onLook); },
      };
    },
  };
})();
