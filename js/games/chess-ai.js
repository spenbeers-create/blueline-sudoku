/* Blueline chess engine: 0x88 board, alpha-beta search with quiescence, a
   transposition table, killer/history move ordering, null-move pruning and
   iterative deepening. Six playing levels from Beginner to Master.
   Works in a Web Worker (importScripts) and in Node (require) for tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChessAI = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6, BLACK = 8;
  const CHAR = '.PNBRQK..pnbrqk';
  const VALUE = [0, 100, 320, 330, 500, 900, 0];
  const PHASE = [0, 0, 1, 1, 2, 4, 0];
  const F_CAP = 1, F_EP = 2, F_CASTLE = 4, F_DOUBLE = 8;
  const MATE = 100000, INF = 1000000;
  const N_DIRS = [-33, -31, -18, -14, 14, 18, 31, 33];
  const B_DIRS = [-17, -15, 15, 17];
  const R_DIRS = [-16, -1, 1, 16];
  const K_DIRS = [-17, -16, -15, -1, 1, 15, 16, 17];
  const START = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';

  const to88 = i => (i >> 3) * 16 + (i & 7);
  const from88 = sq => (sq >> 4) * 8 + (sq & 7);

  // Piece-square tables (white's view, a8 first), from the well-known "simplified evaluation".
  const PST = {
    1: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    2: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    3: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    4: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    5: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    6: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
    7: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
  };

  // Castling rights left after a move touches a square (bits: 1 K, 2 Q, 4 k, 8 q).
  const CASTLE_MASK = new Int8Array(128).fill(15);
  CASTLE_MASK[0x74] = 12; CASTLE_MASK[0x77] = 14; CASTLE_MASK[0x70] = 13;
  CASTLE_MASK[0x04] = 3; CASTLE_MASK[0x07] = 11; CASTLE_MASK[0x00] = 7;

  // Zobrist keys (two 32-bit halves).
  let seed = 0x9E3779B9;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
  const ZP = [new Int32Array(16 * 128), new Int32Array(16 * 128)];
  for (let i = 0; i < 16 * 128; i++) { ZP[0][i] = rnd(); ZP[1][i] = rnd(); }
  const ZC = [new Int32Array(16), new Int32Array(16)];
  for (let i = 0; i < 16; i++) { ZC[0][i] = rnd(); ZC[1][i] = rnd(); }
  const ZE = [new Int32Array(128), new Int32Array(128)];
  for (let i = 0; i < 128; i++) { ZE[0][i] = rnd(); ZE[1][i] = rnd(); }
  const ZS = [rnd(), rnd()];

  // ------------------------------------------------------------- position
  class Pos {
    constructor() {
      this.b = new Int8Array(128); this.side = 0; this.castle = 0; this.ep = -1; this.half = 0;
      this.kings = [0, 0]; this.h0 = 0; this.h1 = 0; this.undo = []; this.hist = [];
    }
    hash() {
      let a = 0, c = 0;
      for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) continue; const p = this.b[sq]; if (p) { a ^= ZP[0][p * 128 + sq]; c ^= ZP[1][p * 128 + sq]; } }
      a ^= ZC[0][this.castle]; c ^= ZC[1][this.castle];
      if (this.ep >= 0) { a ^= ZE[0][this.ep]; c ^= ZE[1][this.ep]; }
      if (this.side) { a ^= ZS[0]; c ^= ZS[1]; }
      this.h0 = a; this.h1 = c;
    }
    load(board, turn, castling, ep, half) {
      this.b.fill(0);
      for (let i = 0; i < 64; i++) { const ch = board[i]; if (ch === '.') continue; const code = CHAR.indexOf(ch); this.b[to88(i)] = code; if ((code & 7) === K) this.kings[code >> 3] = to88(i); }
      this.side = turn; this.castle = (castling.includes('K') ? 1 : 0) | (castling.includes('Q') ? 2 : 0) | (castling.includes('k') ? 4 : 0) | (castling.includes('q') ? 8 : 0);
      this.ep = ep >= 0 ? to88(ep) : -1; this.half = half || 0; this.undo = []; this.hist = [];
      this.hash();
    }
    attacked(sq, by) {
      const b = this.b, col = by ? BLACK : 0;
      if (by === 0) { if (!((sq + 15) & 0x88) && b[sq + 15] === P) return true; if (!((sq + 17) & 0x88) && b[sq + 17] === P) return true; }
      else { if (!((sq - 15) & 0x88) && b[sq - 15] === (P | BLACK)) return true; if (!((sq - 17) & 0x88) && b[sq - 17] === (P | BLACK)) return true; }
      for (const d of N_DIRS) { const t = sq + d; if (!(t & 0x88) && b[t] === (N | col)) return true; }
      for (const d of K_DIRS) { const t = sq + d; if (!(t & 0x88) && b[t] === (K | col)) return true; }
      for (const d of R_DIRS) { let t = sq + d; while (!(t & 0x88)) { const p = b[t]; if (p) { if (p === (R | col) || p === (Q | col)) return true; break; } t += d; } }
      for (const d of B_DIRS) { let t = sq + d; while (!(t & 0x88)) { const p = b[t]; if (p) { if (p === (B | col) || p === (Q | col)) return true; break; } t += d; } }
      return false;
    }
    inCheck() { return this.attacked(this.kings[this.side], this.side ^ 1); }
    // Pseudo-legal moves; captures-only when `caps` is set.
    gen(caps) {
      const b = this.b, us = this.side, col = us ? BLACK : 0, out = [];
      const add = (f, t, fl, pr) => out.push(f | (t << 8) | ((pr || 0) << 16) | (fl << 20));
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const p = b[sq];
        if (!p || (p & BLACK) !== col) continue;
        const t = p & 7;
        if (t === P) {
          const dir = us ? 16 : -16, startRow = us ? 1 : 6, lastRow = us ? 7 : 0;
          const one = sq + dir;
          if (!(one & 0x88) && !b[one]) {
            if ((one >> 4) === lastRow) { for (const pr of [Q, R, B, N]) add(sq, one, 0, pr); }
            else if (!caps) {
              add(sq, one, 0);
              const two = one + dir;
              if ((sq >> 4) === startRow && !b[two]) add(sq, two, F_DOUBLE);
            }
          }
          for (const d of [dir - 1, dir + 1]) {
            const to = sq + d;
            if (to & 0x88) continue;
            const q = b[to];
            if (q && (q & BLACK) !== col) {
              if ((to >> 4) === lastRow) { for (const pr of [Q, R, B, N]) add(sq, to, F_CAP, pr); }
              else add(sq, to, F_CAP);
            } else if (to === this.ep) add(sq, to, F_CAP | F_EP);
          }
        } else if (t === N || t === K) {
          for (const d of t === N ? N_DIRS : K_DIRS) {
            const to = sq + d;
            if (to & 0x88) continue;
            const q = b[to];
            if (!q) { if (!caps) add(sq, to, 0); }
            else if ((q & BLACK) !== col) add(sq, to, F_CAP);
          }
          if (t === K && !caps) {
            const them = us ^ 1;
            if (us === 0 && sq === 0x74) {
              if ((this.castle & 1) && !b[0x75] && !b[0x76] && b[0x77] === R && !this.attacked(0x74, them) && !this.attacked(0x75, them) && !this.attacked(0x76, them)) add(sq, 0x76, F_CASTLE);
              if ((this.castle & 2) && !b[0x73] && !b[0x72] && !b[0x71] && b[0x70] === R && !this.attacked(0x74, them) && !this.attacked(0x73, them) && !this.attacked(0x72, them)) add(sq, 0x72, F_CASTLE);
            }
            if (us === 1 && sq === 0x04) {
              if ((this.castle & 4) && !b[0x05] && !b[0x06] && b[0x07] === (R | BLACK) && !this.attacked(0x04, them) && !this.attacked(0x05, them) && !this.attacked(0x06, them)) add(sq, 0x06, F_CASTLE);
              if ((this.castle & 8) && !b[0x03] && !b[0x02] && !b[0x01] && b[0x00] === (R | BLACK) && !this.attacked(0x04, them) && !this.attacked(0x03, them) && !this.attacked(0x02, them)) add(sq, 0x02, F_CASTLE);
            }
          }
        } else {
          const dirs = t === B ? B_DIRS : t === R ? R_DIRS : K_DIRS;
          for (const d of dirs) {
            let to = sq + d;
            while (!(to & 0x88)) {
              const q = b[to];
              if (!q) { if (!caps) add(sq, to, 0); }
              else { if ((q & BLACK) !== col) add(sq, to, F_CAP); break; }
              to += d;
            }
          }
        }
      }
      return out;
    }
    make(m) {
      const b = this.b, from = m & 255, to = (m >> 8) & 255, pr = (m >> 16) & 15, fl = m >> 20, us = this.side;
      const piece = b[from];
      let capSq = to;
      if (fl & F_EP) capSq = us ? to - 16 : to + 16;
      const cap = b[capSq];
      this.undo.push(cap, capSq, this.castle, this.ep, this.half, this.h0, this.h1);
      this.hist.push(this.h0);
      let a = this.h0, c = this.h1;
      const zp = (p, sq) => { a ^= ZP[0][p * 128 + sq]; c ^= ZP[1][p * 128 + sq]; };
      if (cap) { b[capSq] = 0; zp(cap, capSq); }
      const placed = pr ? (pr | (us ? BLACK : 0)) : piece;
      b[from] = 0; zp(piece, from);
      b[to] = placed; zp(placed, to);
      if (fl & F_CASTLE) {
        const rf = to > from ? from + 3 : from - 4, rt = to > from ? from + 1 : from - 1, rook = b[rf];
        b[rt] = rook; b[rf] = 0; zp(rook, rf); zp(rook, rt);
      }
      if ((piece & 7) === K) this.kings[us] = to;
      a ^= ZC[0][this.castle]; c ^= ZC[1][this.castle];
      this.castle &= CASTLE_MASK[from] & CASTLE_MASK[to];
      a ^= ZC[0][this.castle]; c ^= ZC[1][this.castle];
      if (this.ep >= 0) { a ^= ZE[0][this.ep]; c ^= ZE[1][this.ep]; }
      this.ep = fl & F_DOUBLE ? (from + to) >> 1 : -1;
      if (this.ep >= 0) { a ^= ZE[0][this.ep]; c ^= ZE[1][this.ep]; }
      this.half = (piece & 7) === P || cap ? 0 : this.half + 1;
      this.side ^= 1; a ^= ZS[0]; c ^= ZS[1];
      this.h0 = a; this.h1 = c;
    }
    unmake(m) {
      const b = this.b, from = m & 255, to = (m >> 8) & 255, pr = (m >> 16) & 15, fl = m >> 20;
      this.side ^= 1;
      const us = this.side, u = this.undo;
      this.h1 = u.pop(); this.h0 = u.pop(); this.half = u.pop(); this.ep = u.pop(); this.castle = u.pop();
      const capSq = u.pop(), cap = u.pop();
      this.hist.pop();
      const moved = b[to];
      b[from] = pr ? (P | (us ? BLACK : 0)) : moved;
      b[to] = 0;
      if (cap) b[capSq] = cap;
      if (fl & F_CASTLE) {
        const rf = to > from ? from + 3 : from - 4, rt = to > from ? from + 1 : from - 1;
        b[rf] = b[rt]; b[rt] = 0;
      }
      if ((b[from] & 7) === K) this.kings[us] = from;
    }
    nullMove() { this.undo.push(this.ep, this.h0, this.h1); this.hist.push(this.h0); if (this.ep >= 0) { this.h0 ^= ZE[0][this.ep]; this.h1 ^= ZE[1][this.ep]; } this.ep = -1; this.side ^= 1; this.h0 ^= ZS[0]; this.h1 ^= ZS[1]; }
    unNull() { this.side ^= 1; this.h1 = this.undo.pop(); this.h0 = this.undo.pop(); this.ep = this.undo.pop(); this.hist.pop(); }
    legal() { const out = []; for (const m of this.gen(false)) { this.make(m); if (!this.attacked(this.kings[this.side ^ 1], this.side)) out.push(m); this.unmake(m); } return out; }
    repeated() {
      const h = this.hist, n = h.length;
      for (let i = n - 2; i >= 0 && i >= n - this.half; i -= 2) if (h[i] === this.h0) return true;
      return false;
    }
  }

  // ------------------------------------------------------------ evaluation
  function evaluate(pos, jitter) {
    const b = pos.b;
    let mg = 0, phase = 0, matW = 0, matB = 0, kW = 0, kB = 0, bishopsW = 0, bishopsB = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq];
      if (!p) continue;
      const t = p & 7, black = p & BLACK, idx = black ? ((7 - (sq >> 4)) * 8 + (sq & 7)) : ((sq >> 4) * 8 + (sq & 7));
      phase += PHASE[t];
      if (t === K) { if (black) kB = idx; else kW = idx; continue; }
      const v = VALUE[t] + PST[t][idx];
      if (black) { mg -= v; matB += VALUE[t]; if (t === B) bishopsB++; } else { mg += v; matW += VALUE[t]; if (t === B) bishopsW++; }
    }
    if (bishopsW >= 2) mg += 30;
    if (bishopsB >= 2) mg -= 30;
    const end = phase <= 6;
    const kt = end ? PST[7] : PST[6];
    mg += kt[kW] - kt[kB];
    // Mop-up: with a big material edge, drive the lone king to the edge and walk ours closer.
    if (end && Math.abs(matW - matB) >= 400) {
      const strongWhite = matW > matB;
      const loser = strongWhite ? pos.kings[1] : pos.kings[0], winner = strongWhite ? pos.kings[0] : pos.kings[1];
      const lr = loser >> 4, lf = loser & 7, wr = winner >> 4, wf = winner & 7;
      const centre = Math.max(3 - lr, lr - 4) + Math.max(3 - lf, lf - 4);
      const dist = Math.abs(lr - wr) + Math.abs(lf - wf);
      const bonus = 10 * centre + 4 * (14 - dist);
      mg += strongWhite ? bonus : -bonus;
    }
    if (jitter) mg += ((pos.h0 ^ jitter) & 15) - 8;
    return pos.side ? -mg : mg;
  }

  // ---------------------------------------------------------------- search
  const TT_BITS = 18, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  const ttKey = new Int32Array(TT_SIZE), ttMove = new Int32Array(TT_SIZE), ttScore = new Int32Array(TT_SIZE);
  const ttDepth = new Int8Array(TT_SIZE), ttFlag = new Int8Array(TT_SIZE);
  const EXACT = 1, LOWER = 2, UPPER = 3;

  class Searcher {
    constructor(pos, opts) {
      this.pos = pos; this.nodes = 0; this.stop = false; this.deadline = opts.deadline || Infinity;
      this.maxNodes = opts.maxNodes || Infinity; this.jitter = opts.jitter || 0; this.useNull = opts.useNull !== false;
      this.qsearch = opts.qsearch !== false;
      this.killers = Array.from({ length: 64 }, () => [0, 0]);
      this.history = new Int32Array(16 * 128);
    }
    order(moves, tt, ply) {
      const b = this.pos.b, k = this.killers[ply] || [0, 0];
      const scored = moves.map(m => {
        if (m === tt) return [m, 1e9];
        const to = (m >> 8) & 255, from = m & 255, fl = m >> 20, pr = (m >> 16) & 15;
        let s = 0;
        if (fl & F_CAP) s = 1e6 + 10 * VALUE[(fl & F_EP) ? P : (b[to] & 7)] - VALUE[b[from] & 7];
        else if (m === k[0]) s = 9e5;
        else if (m === k[1]) s = 8e5;
        else s = this.history[b[from] * 128 + to];
        if (pr === Q) s += 1e6;
        return [m, s];
      });
      scored.sort((x, y) => y[1] - x[1]);
      return scored.map(x => x[0]);
    }
    timeUp() {
      if ((this.nodes & 1023) === 0 && (Date.now() > this.deadline || this.nodes > this.maxNodes)) this.stop = true;
      return this.stop;
    }
    quiesce(alpha, beta, ply) {
      this.nodes++;
      if (this.timeUp()) return 0;
      const pos = this.pos;
      const stand = evaluate(pos, this.jitter);
      if (!this.qsearch) return stand;
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      if (ply > 60) return stand;
      for (const m of this.order(pos.gen(true), 0, Math.min(ply, 63))) {
        pos.make(m);
        if (pos.attacked(pos.kings[pos.side ^ 1], pos.side)) { pos.unmake(m); continue; }
        const sc = -this.quiesce(-beta, -alpha, ply + 1);
        pos.unmake(m);
        if (this.stop) return 0;
        if (sc >= beta) return sc;
        if (sc > alpha) alpha = sc;
      }
      return alpha;
    }
    search(depth, alpha, beta, ply, allowNull) {
      const pos = this.pos;
      if (ply > 0 && (pos.half >= 100 || pos.repeated())) return 0;
      const inCheck = pos.inCheck();
      if (inCheck) depth++;
      if (depth <= 0) return this.quiesce(alpha, beta, ply);
      this.nodes++;
      if (this.timeUp()) return 0;
      const slot = pos.h0 & TT_MASK;
      let tt = 0;
      if (ttKey[slot] === pos.h1) {
        tt = ttMove[slot];
        if (ply > 0 && ttDepth[slot] >= depth) {
          let sc = ttScore[slot];
          if (sc > MATE - 500) sc -= ply; else if (sc < -MATE + 500) sc += ply;
          const f = ttFlag[slot];
          if (f === EXACT || (f === LOWER && sc >= beta) || (f === UPPER && sc <= alpha)) return sc;
        }
      }
      // Null move: if passing still beats beta, this line is too good to need searching.
      if (allowNull && this.useNull && !inCheck && depth >= 3 && ply > 0) {
        let big = 0;
        for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } const p = pos.b[sq]; if (p && (p >> 3) === pos.side && (p & 7) !== P && (p & 7) !== K) { big++; break; } }
        if (big && evaluate(pos, 0) >= beta) {
          pos.nullMove();
          const sc = -this.search(depth - 3, -beta, -beta + 1, ply + 1, false);
          pos.unNull();
          if (this.stop) return 0;
          if (sc >= beta) return beta;
        }
      }
      const a0 = alpha;
      let best = -INF, bestMove = 0, legal = 0;
      for (const m of this.order(pos.gen(false), tt, Math.min(ply, 63))) {
        pos.make(m);
        if (pos.attacked(pos.kings[pos.side ^ 1], pos.side)) { pos.unmake(m); continue; }
        legal++;
        let sc;
        if (legal === 1) sc = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
        else {
          sc = -this.search(depth - 1, -alpha - 1, -alpha, ply + 1, true);
          if (sc > alpha && sc < beta) sc = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
        }
        pos.unmake(m);
        if (this.stop) return 0;
        if (sc > best) {
          best = sc; bestMove = m;
          if (sc > alpha) {
            alpha = sc;
            if (alpha >= beta) {
              if (!((m >> 20) & F_CAP)) {
                const k = this.killers[Math.min(ply, 63)];
                if (k[0] !== m) { k[1] = k[0]; k[0] = m; }
                this.history[pos.b[m & 255] * 128 + ((m >> 8) & 255)] += depth * depth;
              }
              break;
            }
          }
        }
      }
      if (!legal) return inCheck ? -MATE + ply : 0;
      let store = best;
      if (store > MATE - 500) store += ply; else if (store < -MATE + 500) store -= ply;
      ttKey[slot] = pos.h1; ttMove[slot] = bestMove; ttScore[slot] = store; ttDepth[slot] = depth;
      ttFlag[slot] = best <= a0 ? UPPER : best >= beta ? LOWER : EXACT;
      return best;
    }
    // Score every root move (used by the lower levels to pick imperfect moves).
    rootScores(depth) {
      const pos = this.pos, out = [];
      for (const m of this.order(pos.legal(), 0, 0)) {
        pos.make(m);
        const sc = -this.search(depth - 1, -INF, INF, 1, true);
        pos.unmake(m);
        if (this.stop) break;
        out.push([m, sc]);
      }
      return out;
    }
    iterate(maxDepth) {
      const pos = this.pos;
      const moves = pos.legal();
      if (!moves.length) return { move: 0, score: 0, depth: 0 };
      let bestMove = moves[0], bestScore = 0, done = 0;
      for (let d = 1; d <= maxDepth; d++) {
        let alpha = -INF, beta = INF, iterBest = 0, iterScore = -INF;
        const slot = pos.h0 & TT_MASK;
        const tt = ttKey[slot] === pos.h1 ? ttMove[slot] : bestMove;
        for (const m of this.order(moves, tt, 0)) {
          pos.make(m);
          let sc;
          if (!iterBest) sc = -this.search(d - 1, -beta, -alpha, 1, true);
          else {
            sc = -this.search(d - 1, -alpha - 1, -alpha, 1, true);
            if (sc > alpha && !this.stop) sc = -this.search(d - 1, -beta, -alpha, 1, true);
          }
          pos.unmake(m);
          if (this.stop) break;
          if (sc > iterScore) { iterScore = sc; iterBest = m; if (sc > alpha) alpha = sc; }
        }
        if (this.stop && !iterBest) break;
        if (iterBest) {
          bestMove = iterBest; bestScore = iterScore; done = d;
          ttKey[slot] = pos.h1; ttMove[slot] = iterBest; ttScore[slot] = iterScore; ttDepth[slot] = d; ttFlag[slot] = EXACT;
        }
        if (this.stop || Math.abs(bestScore) > MATE - 500) break;
      }
      return { move: bestMove, score: bestScore, depth: done };
    }
  }

  // ---------------------------------------------------------------- levels
  const LEVELS = [
    { id: 1, name: 'Beginner', blurb: 'Just learning', depth: 1, noise: 260, blunder: 0.3, qs: false },
    { id: 2, name: 'Casual', blurb: 'Misses tactics', depth: 2, noise: 110, blunder: 0.1, qs: false },
    { id: 3, name: 'Club', blurb: 'Good practice', depth: 3, noise: 35, blunder: 0.03, qs: true },
    { id: 4, name: 'Strong', blurb: 'Punishes mistakes', time: 700, maxDepth: 6, jitter: true },
    { id: 5, name: 'Expert', blurb: 'Deep tactics', time: 1500, maxDepth: 10, jitter: true },
    { id: 6, name: 'Master', blurb: 'Full strength', time: 3000, maxDepth: 20, jitter: false },
  ];

  function setup(state) {
    const pos = new Pos();
    const moves = Array.isArray(state.moves) ? state.moves : null;
    if (moves && moves.length) {
      // Replay the game so the engine knows about repeated positions.
      pos.load(START, 0, 'KQkq', -1, 0);
      for (const mv of moves) {
        const m = pos.legal().find(x => from88(x & 255) === mv.from && from88((x >> 8) & 255) === mv.to && (((x >> 16) & 15) ? 'xpnbrqk'[(x >> 16) & 15] : '') === (mv.promo || ''));
        if (!m) { pos.load(state.board, state.turn, state.castling, state.ep, state.half); return pos; }
        pos.make(m);
      }
      if (pos.side === state.turn) return pos;
    }
    pos.load(state.board, state.turn, state.castling, state.ep, state.half);
    return pos;
  }

  const toMove = m => (m ? { from: from88(m & 255), to: from88((m >> 8) & 255), promo: ((m >> 16) & 15) ? 'xpnbrqk'[(m >> 16) & 15] : undefined } : null);

  // Pick a move for `state` (the shared chess state) at a level 1..6.
  function think(state, levelId, opts = {}) {
    const lv = LEVELS.find(l => l.id === levelId) || LEVELS[2];
    const pos = setup(state);
    const rand = opts.random || Math.random;
    const moves = pos.legal();
    if (!moves.length) return null;
    if (moves.length === 1) return Object.assign(toMove(moves[0]), { score: 0, depth: 0 });
    if (lv.time) {
      const s = new Searcher(pos, { deadline: Date.now() + (opts.time || lv.time), jitter: lv.jitter ? (rand() * 0x7fffffff) | 0 : 0 });
      const r = s.iterate(opts.maxDepth || lv.maxDepth);
      return Object.assign(toMove(r.move), { score: r.score, depth: r.depth, nodes: s.nodes });
    }
    if (rand() < lv.blunder) {
      const m = moves[Math.floor(rand() * moves.length)];
      return Object.assign(toMove(m), { score: 0, depth: 0, random: true });
    }
    const s = new Searcher(pos, { maxNodes: 400000, qsearch: lv.qs, useNull: false });
    const scored = s.rootScores(lv.depth);
    if (!scored.length) return Object.assign(toMove(moves[0]), { score: 0, depth: 0 });
    const best = Math.max(...scored.map(x => x[1]));
    // Never miss a forced mate in one, even at the lower levels.
    const pool = best > MATE - 500 ? scored.filter(x => x[1] === best) : scored.filter(x => x[1] >= best - lv.noise);
    const weights = pool.map(x => Math.exp((x[1] - best) / Math.max(1, lv.noise / 2)));
    let r = rand() * weights.reduce((a, c) => a + c, 0);
    let pick = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { pick = pool[i]; break; } }
    return Object.assign(toMove(pick[0]), { score: pick[1], depth: lv.depth });
  }

  function perft(pos, depth) {
    if (depth === 0) return 1;
    let n = 0;
    for (const m of pos.gen(false)) {
      pos.make(m);
      if (!pos.attacked(pos.kings[pos.side ^ 1], pos.side)) n += depth === 1 ? 1 : perft(pos, depth - 1);
      pos.unmake(m);
    }
    return n;
  }

  return { think, LEVELS, Pos, perft, setup, evaluate, START };
});
