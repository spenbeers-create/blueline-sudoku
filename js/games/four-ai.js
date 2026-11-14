/* Four in a Row bot: a look-ahead search (negamax with alpha-beta pruning and a
   position cache) that scores boards by open lines of two and three. Easy looks
   two moves ahead and often plays loosely; Expert searches as deep as it can in
   under a second. Works for every board size. */
(function (root) {
  'use strict';
  const LEVELS = [
    { id: 1, name: 'Easy', blurb: 'Still learning', depth: 2, random: 0.4 },
    { id: 2, name: 'Normal', blurb: 'Blocks the obvious', depth: 4, random: 0.12 },
    { id: 3, name: 'Hard', blurb: 'Plans ahead', depth: 7, random: 0 },
    { id: 4, name: 'Expert', blurb: 'Very hard to beat', time: 900, maxDepth: 42 },
  ];
  const WIN = 1000000, EXACT = 0, LOWER = 1, UPPER = 2;
  const STOP = { stop: true };
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

  const rand32 = () => (Math.random() * 4294967296) >>> 0;
  const zobCache = {};
  function zobrist(n) {
    if (!zobCache[n]) zobCache[n] = { a: Uint32Array.from({ length: n * 2 }, rand32), b: Uint32Array.from({ length: n * 2 }, rand32) };
    return zobCache[n];
  }
  const winCache = {};
  function windows(rows, cols) {
    const k = rows + 'x' + cols;
    if (winCache[k]) return winCache[k];
    const out = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      for (const [dr, dc] of DIRS) {
        const r3 = r + dr * 3, c3 = c + dc * 3;
        if (r3 < 0 || r3 >= rows || c3 < 0 || c3 >= cols) continue;
        for (let i = 0; i < 4; i++) out.push((r + dr * i) * cols + (c + dc * i));
      }
    }
    return (winCache[k] = Int16Array.from(out));
  }

  function setup(state) {
    const rows = state.rows || 6, cols = state.cols || 7, n = rows * cols;
    const cells = new Int8Array(n), height = new Int8Array(cols);
    const Z = zobrist(n);
    let hash = 0, hash2 = 0, filled = 0;
    for (let i = 0; i < n; i++) {
      const v = state.board[i];
      if (v === '.') continue;
      cells[i] = v === '0' ? 1 : 2;
      hash ^= Z.a[i * 2 + cells[i] - 1]; hash2 ^= Z.b[i * 2 + cells[i] - 1];
      filled++;
    }
    for (let c = 0; c < cols; c++) { let h = 0; while (h < rows && cells[(rows - 1 - h) * cols + c]) h++; height[c] = h; }
    // Centre columns first: they take part in the most lines.
    const order = Array.from({ length: cols }, (_, c) => c).sort((a, b) => Math.abs(a - (cols - 1) / 2) - Math.abs(b - (cols - 1) / 2));
    const centre = [];
    for (let c = 0; c < cols; c++) { const d = Math.abs(c - (cols - 1) / 2); centre.push(d < 0.6 ? 4 : d < 1.6 ? 2 : d < 2.6 ? 1 : 0); }
    return { rows, cols, n, cells, height, hash, hash2, filled, Z, order, centre, win: windows(rows, cols), tt: new Map(), nodes: 0, deadline: 0 };
  }

  function play(P, c, v) {
    const i = (P.rows - 1 - P.height[c]) * P.cols + c;
    P.cells[i] = v; P.height[c]++; P.filled++;
    P.hash ^= P.Z.a[i * 2 + v - 1]; P.hash2 ^= P.Z.b[i * 2 + v - 1];
  }
  function undo(P, c) {
    P.height[c]--;
    const i = (P.rows - 1 - P.height[c]) * P.cols + c, v = P.cells[i];
    P.cells[i] = 0; P.filled--;
    P.hash ^= P.Z.a[i * 2 + v - 1]; P.hash2 ^= P.Z.b[i * 2 + v - 1];
  }
  // Would a disc of v dropped in column c make four?
  function wins(P, c, v) {
    const { rows, cols, cells } = P, r = rows - 1 - P.height[c];
    for (const [dr, dc] of DIRS) {
      let n = 1;
      for (const s of [1, -1]) {
        let rr = r + dr * s, cc = c + dc * s;
        while (rr >= 0 && rr < rows && cc >= 0 && cc < cols && cells[rr * cols + cc] === v) { n++; rr += dr * s; cc += dc * s; }
      }
      if (n >= 4) return true;
    }
    return false;
  }

  function evaluate(P, me) {
    const { cells, win, cols, rows, centre } = P, opp = 3 - me;
    let score = 0;
    for (let w = 0; w < win.length; w += 4) {
      let m = 0, o = 0;
      for (let k = 0; k < 4; k++) { const v = cells[win[w + k]]; if (v === me) m++; else if (v === opp) o++; }
      if (m && o) continue;
      if (m === 3) score += 50; else if (m === 2) score += 8; else if (m === 1) score += 1;
      else if (o === 3) score -= 55; else if (o === 2) score -= 8; else if (o === 1) score -= 1;
    }
    for (let c = 0; c < cols; c++) {
      if (!centre[c]) continue;
      for (let r = rows - P.height[c]; r < rows; r++) score += cells[r * cols + c] === me ? centre[c] : -centre[c];
    }
    return score;
  }

  function negamax(P, depth, alpha, beta, me, ply) {
    if ((++P.nodes & 2047) === 0 && P.deadline && Date.now() > P.deadline) throw STOP;
    const { rows, order, height } = P, opp = 3 - me;
    for (const c of order) if (height[c] < rows && wins(P, c, me)) return WIN - ply;
    if (P.filled >= P.n - 1) return 0;                      // last disc can't win (checked above): draw
    // The opponent threatens to win: we must block, and two threats can't both be blocked.
    let forced = -1, threats = 0;
    for (const c of order) if (height[c] < rows && wins(P, c, opp)) { threats++; forced = c; }
    if (threats > 1) return -(WIN - ply - 1);
    if (depth <= 0) return evaluate(P, me);
    const a0 = alpha;
    const e = P.tt.get(P.hash);
    let first = -1;
    if (e && e.check === P.hash2) {
      first = e.col;
      if (e.depth >= depth) {
        if (e.flag === EXACT) return e.score;
        if (e.flag === LOWER && e.score > alpha) alpha = e.score;
        else if (e.flag === UPPER && e.score < beta) beta = e.score;
        if (alpha >= beta) return e.score;
      }
    }
    let best = -Infinity, bestCol = -1;
    const cols = forced >= 0 ? [forced] : (first >= 0 ? [first].concat(order.filter(c => c !== first)) : order);
    for (const c of cols) {
      if (height[c] >= rows) continue;
      play(P, c, me);
      const sc = -negamax(P, depth - 1, -beta, -alpha, opp, ply + 1);
      undo(P, c);
      if (sc > best) { best = sc; bestCol = c; }
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    if (P.tt.size > 400000) P.tt.clear();
    P.tt.set(P.hash, { check: P.hash2, depth, score: best, col: bestCol, flag: best <= a0 ? UPPER : best >= beta ? LOWER : EXACT });
    return best;
  }

  // Score every legal column with a full search at this depth.
  function rootScores(P, me, depth, order) {
    const out = [];
    for (const c of order) {
      if (P.height[c] >= P.rows) continue;
      play(P, c, me);
      const sc = -negamax(P, depth - 1, -WIN - 1, WIN + 1, 3 - me, 1);
      undo(P, c);
      out.push({ c, sc });
    }
    return out.sort((a, b) => b.sc - a.sc);
  }
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function think(state, levelId, opts = {}) {
    const lv = LEVELS.find(l => l.id === levelId) || LEVELS[1];
    const P = setup(state), me = state.turn === 0 ? 1 : 2, opp = 3 - me;
    const legal = P.order.filter(c => P.height[c] < P.rows);
    if (!legal.length) return null;
    if (legal.length === 1) return { col: legal[0] };
    const win = legal.find(c => wins(P, c, me));
    if (win != null) return { col: win };
    if (lv.random && Math.random() < lv.random) return { col: pick(legal) };
    const block = legal.filter(c => wins(P, c, opp));
    if (block.length === 1 && lv.id > 1) return { col: block[0] };

    const time = opts.time || lv.time;
    if (!time) {
      const scores = rootScores(P, me, lv.depth, P.order);
      const top = scores.filter(x => x.sc === scores[0].sc);
      if (lv.id === 2 && scores.length > 1 && Math.random() < 0.15 && scores[1].sc > -WIN / 2) return { col: scores[1].c };
      return { col: pick(top).c };
    }
    // Iterative deepening against the clock; keep the last finished answer.
    P.deadline = Date.now() + time;
    let bestCol = P.order.find(c => P.height[c] < P.rows), order = P.order.slice();
    for (let d = 2; d <= (lv.maxDepth || 42) && d <= P.n - P.filled; d++) {
      try {
        let alpha = -WIN - 1, best = -Infinity, col = -1;
        for (const c of order) {
          if (P.height[c] >= P.rows) continue;
          play(P, c, me);
          let sc;
          try { sc = -negamax(P, d - 1, -WIN - 1, -alpha, opp, 1); } finally { undo(P, c); }
          if (sc > best) { best = sc; col = c; }
          if (sc > alpha) alpha = sc;
        }
        bestCol = col;
        order = [col].concat(order.filter(c => c !== col));
        if (best >= WIN - 100 || best <= -WIN + 100) break;   // the result is already certain
      } catch (e) {
        if (e !== STOP) throw e;
        break;
      }
    }
    return { col: bestCol };
  }

  const api = { think, LEVELS, setup, evaluate };
  root.FourAI = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
