/* Four in a Row screen: both players with their disc colors and whose turn it is,
   the board in any size with drop animations, a ghost disc over the column you're
   aiming at, and for bot games Undo and Hint. Nothing marks where someone could
   win next, so a trap stays a surprise. Colors, board and disc style come from the Style sheet
   (fourLook): your discs are always your color. */
(() => {
  'use strict';
  const V = window.BLViews, G = window.BLGames, BL = window.BL;
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  const DISCS = {
    blue: { name: 'Blue', c: '#2F6BF0' }, orange: { name: 'Orange', c: '#F0961E' }, red: { name: 'Red', c: '#E0402E' },
    yellow: { name: 'Yellow', c: '#F5C730' }, green: { name: 'Green', c: '#2EA866' }, purple: { name: 'Purple', c: '#8B5CF6' },
    pink: { name: 'Pink', c: '#EC5C9F' }, teal: { name: 'Teal', c: '#18A8A8' },
  };
  const BOARDS = {
    night: { name: 'Night', frame: 'var(--frame)' }, blue: { name: 'Blue', frame: '#2250C2' }, wood: { name: 'Wood', frame: '#93653A' },
    forest: { name: 'Forest', frame: '#2B6446' }, plum: { name: 'Plum', frame: '#563874' }, slate: { name: 'Slate', frame: '#46526A' },
  };
  const STYLES = { solid: 'Solid', shiny: 'Shiny', ring: 'Ring' };
  const look = () => Object.assign({ mine: 'blue', theirs: 'orange', board: 'night', style: 'shiny', sound: true }, BL.store.get('fourLook', {}));
  // Seat colors: your color for your seat, theirs for the other (seat 0 is "you" on one phone).
  function seatColors(viewer, local, L = look()) {
    const mine = (DISCS[L.mine] || DISCS.blue).c;
    let theirs = (DISCS[L.theirs] || DISCS.orange).c;
    if (theirs === mine) theirs = L.mine === 'orange' ? DISCS.blue.c : DISCS.orange.c;
    const me = local ? 0 : viewer;
    return me === 0 ? [mine, theirs] : [theirs, mine];
  }

  let audio = null;
  function sound(kind) {
    if (!look().sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime;
      const tone = (f, at, dur, type, vol, f2) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t0 + at);
        if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + at + dur);
        g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        o.connect(g).connect(audio.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
      };
      if (kind === 'drop') { tone(260, 0.24, 0.09, 'triangle', 0.12, 120); tone(520, 0.24, 0.04, 'square', 0.02); }
      else if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35 + i * 0.09, 0.22, 'triangle', 0.09));
      else if (kind === 'lose') [392, 330, 262].forEach((f, i) => tone(f, 0.35 + i * 0.13, 0.25, 'sine', 0.08));
    } catch (e) { /* no sound */ }
  }

  V.four = {
    DISCS, BOARDS, STYLES, look, seatColors, sound,
    mount(el, ctx) {
      el.innerHTML = `
        <div class="c4">
          <div class="c4-bar">
            <div class="c4-who" data-seat="0"><i class="c4-chip"></i><span><b></b><small></small></span></div>
            <div class="c4-who" data-seat="1"><i class="c4-chip"></i><span><b></b><small></small></span></div>
          </div>
          <div class="c4-board">
            <div class="c4-aim" aria-hidden="true"></div>
            <div class="c4-grid" role="grid" aria-label="Four in a Row board"></div>
          </div>
          <div class="c4-tools" hidden>
            <button type="button" class="tool" data-t="undo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg><span>Undo</span></button>
            <button type="button" class="tool" data-t="hint"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/></svg><span>Hint</span></button>
          </div>
          <p class="c4-note" aria-live="polite"></p>
        </div>`;
      const root = el.querySelector('.c4'), grid = el.querySelector('.c4-grid'), aim = el.querySelector('.c4-aim');
      const tools = el.querySelector('.c4-tools'), note = el.querySelector('.c4-note');
      let snap = null, cells = [], dimsKey = '', hoverCol = -1, hintCol = -1, hintT = 0, seenMoves = -1, seenOver = false, animAt = -1, animUntil = 0;

      const dims = s => G.four.dims(s);
      const busy = () => !!(ctx.thinking && ctx.thinking());
      function build(s) {
        const { rows, cols } = dims(s);
        dimsKey = rows + 'x' + cols;
        root.style.setProperty('--cols', cols);
        grid.innerHTML = Array.from({ length: rows * cols }, (_, i) => `<button type="button" class="c4-cell" data-i="${i}" aria-label="Column ${i % cols + 1}"><i></i></button>`).join('');
        aim.innerHTML = Array.from({ length: cols }, (_, c) => `<span data-c="${c}"><i></i></span>`).join('');
        cells = Array.from(grid.children);
      }
      function drop(col) {
        if (!snap || !snap.canAct || busy() || snap.state.winner != null) return;
        if (snap.state.board[col] !== '.') { note.textContent = 'That column is full.'; return; }
        note.textContent = '';
        hintCol = -1;
        BL.buzz && BL.buzz(10);
        ctx.send({ col });
      }
      grid.addEventListener('click', e => {
        const b = e.target.closest('[data-i]');
        if (b) drop(+b.dataset.i % dims(snap.state).cols);
      });
      aim.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) drop(+b.dataset.c); });
      root.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse' || !snap) return;
        const b = e.target.closest('[data-i],[data-c]');
        const col = b ? (b.dataset.c != null ? +b.dataset.c : +b.dataset.i % dims(snap.state).cols) : -1;
        if (col !== hoverCol) { hoverCol = col; paint(); }
      });
      root.addEventListener('pointerleave', () => { hoverCol = -1; paint(); });
      tools.addEventListener('click', async e => {
        const t = e.target.closest('[data-t]');
        if (!t || t.disabled) return;
        if (t.dataset.t === 'undo') { hintCol = -1; ctx.takeback && ctx.takeback(); return; }
        if (t.dataset.t === 'hint' && ctx.hint) {
          t.disabled = true; note.textContent = 'Thinking…';
          const mv = await ctx.hint();
          t.disabled = false; note.textContent = '';
          if (mv && mv.col != null) {
            hintCol = mv.col; paint();
            clearTimeout(hintT); hintT = setTimeout(() => { hintCol = -1; paint(); }, 3000);
          }
        }
      });
      const onLook = () => paint();
      document.addEventListener('bl:fourlook', onLook);

      function paint() {
        if (!snap) return;
        const s = snap.state, { rows, cols } = dims(s);
        if (dimsKey !== rows + 'x' + cols) build(s);
        const L = look(), local = ctx.mode === 'local';
        const [c0, c1] = seatColors(snap.viewer, local, L);
        root.style.setProperty('--d0', c0);
        root.style.setProperty('--d1', c1);
        root.style.setProperty('--c4-frame', (BOARDS[L.board] || BOARDS.night).frame);
        root.className = `c4 style-${STYLES[L.style] ? L.style : 'shiny'}`;
        const over = s.winner != null, line = new Set(s.line || []);
        const mover = s.turn, canDrop = snap.canAct && !busy() && !over;
        // No marks for where someone could win next: setting a trap is the game.
        const target = canDrop && hoverCol >= 0 ? G.four.landing(s, hoverCol) : -1;
        // The newest disc keeps its drop animation through repaints for a moment.
        if (s.moves.length !== seenMoves) { animAt = seenMoves >= 0 ? s.last : -1; animUntil = Date.now() + 450; }
        const anim = Date.now() < animUntil ? animAt : -1;
        cells.forEach((c, i) => {
          const v = s.board[i], col = i % cols;
          c.className = 'c4-cell' + (v === '0' ? ' p0' : v === '1' ? ' p1' : '') + (line.has(i) ? ' win' : '') +
            (i === anim ? ' last' : '') + (i === s.last ? ' newest' : '') + (col === hintCol ? ' hint' : '') +
            (target >= 0 && i === target * cols + col ? ' ghost' : '');
          if (i === s.last) c.style.setProperty('--drop', Math.floor(i / cols) + 1);
        });
        Array.from(aim.children).forEach((a, c) => { a.className = (canDrop && c === hoverCol ? 'on ' : '') + (s.board[c] !== '.' ? 'full' : ''); });
        aim.classList.toggle('t1', mover === 1);
        grid.classList.toggle('t1', mover === 1);
        grid.classList.toggle('can', canDrop);
        root.classList.toggle('over', over);

        // Players
        const names = ctx.names;
        el.querySelectorAll('.c4-who').forEach(w => {
          const seat = +w.dataset.seat, you = !local && seat === snap.viewer;
          w.classList.toggle('turn', !over && mover === seat);
          w.classList.toggle('won', over && s.winner === seat);
          w.querySelector('b').textContent = (names[seat] || (seat === 0 ? 'Player 1' : 'Player 2')) + (you && names[seat] !== 'You' ? ' (you)' : '');
          let st = '';
          if (over) st = s.winner === seat ? 'Four in a row!' : s.winner === 'draw' ? 'Draw' : '';
          else if (mover === seat) st = ctx.mode === 'bot' && seat !== snap.viewer ? (busy() ? 'Thinking…' : 'Their move') : you || local ? 'Your move' : 'Their move';
          w.querySelector('small').textContent = st;
        });

        // Bot tools
        const isBot = ctx.mode === 'bot';
        tools.hidden = !isBot || over;
        if (isBot) {
          tools.querySelector('[data-t=undo]').disabled = !(ctx.canTakeback && ctx.canTakeback());
          tools.querySelector('[data-t=hint]').disabled = !canDrop;
        }

        // Sounds
        if (seenMoves >= 0 && s.moves.length > seenMoves) sound('drop');
        if (over && !seenOver && seenMoves >= 0) sound(s.winner === 'draw' ? 'drop' : (local || s.winner === snap.viewer) ? 'win' : 'lose');
        seenMoves = s.moves.length;
        seenOver = over;
      }

      return {
        render(sn) { snap = sn; paint(); },
        refresh() { paint(); },
        destroy() { clearTimeout(hintT); document.removeEventListener('bl:fourlook', onLook); },
      };
    },
  };
})();
