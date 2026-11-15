/* Checkers bot: a look-ahead search (negamax with alpha-beta pruning and a position
   cache) that keeps searching through capture sequences so it never stops looking
   in the middle of a trade. It values kings over men, men that are close to being
   crowned, a guarded back row and the centre. Easy looks two moves ahead and plays
   loosely; Expert thinks for up to a second. */
(function (root) {
  'use strict';
  const C = root.BLGames && root.BLGames.checkers ? root.BLGames.checkers : (typeof require === 'function' ? require('./checkers.js') : null);
  const LEVELS = [
    { id: 1, name: 'Easy', blurb: 'Still learning', depth: 2, random: 0.35 },
    { id: 2, name: 'Normal', blurb: 'Trades fairly', depth: 4, random: 0.08 },
    { id: 3, name: 'Hard', blurb: 'Sees combinations', depth: 7 },
    { id: 4, name: 'Expert', blurb: 'Very hard to beat', time: 900, maxDepth: 30 },
  ];
  const WIN = 100000, STOP = { stop: true };

  function play(board, path, p) {
    const b = board.split(''), from = path[0], to = path[path.length - 1];
    for (const i of C.jumped(board, path)) b[i] = '.';
    let piece = b[from];
    b[from] = '.';
    if (!C.isKing(piece) && Math.floor(to / 8) === (p === 0 ? 0 : 7)) piece = piece.toUpperCase();
    b[to] = piece;
    return b.join('');
  }
  const moves = (board, p, rules) => C.legalMoves({ board, turn: p, rules, winner: null });

  function evaluate(board, p) {
    let score = 0, mine = 0, theirs = 0;
    for (let i = 0; i < 64; i++) {
      const ch = board[i];
      if (ch === '.') continue;
      const o = C.owner(ch), king = C.isKing(ch), r = Math.floor(i / 8), c = i % 8;
      let v = king ? 165 : 100;
      if (!king) {
        const adv = o === 0 ? 7 - r : r;                      // rows travelled toward crowning
        v += adv * 3 + (adv >= 5 ? 6 : 0);
        if (adv === 0) v += 8;                                 // back row guard
      } else if (r >= 2 && r <= 5 && c >= 2 && c <= 5) v += 6;
      if (r >= 3 && r <= 4 && c >= 2 && c <= 5) v += 4;
      if (o === p) { score += v; mine++; } else { score -= v; theirs++; }
    }
    // When ahead, trading down helps; when behind, keep pieces on.
    if (mine > theirs) score += (24 - mine - theirs) * 2;
    else if (theirs > mine) score -= (24 - mine - theirs) * 2;
    return score;
  }

  function search(S, board, p, depth, alpha, beta, ply) {
    if ((++S.nodes & 1023) === 0 && S.deadline && Date.now() > S.deadline) throw STOP;
    const ms = moves(board, p, S.rules);
    if (!ms.length) return -(WIN - ply);
    const captures = C.jumped(board, ms[0].path).length > 0;
    if (depth <= 0 && (!captures || ply > S.depthCap + 8)) return evaluate(board, p);
    const key = board + p;
    const e = S.tt.get(key);
    if (e && e.depth >= depth && ply > 0) {
      if (e.flag === 0) return e.score;
      if (e.flag === 1 && e.score >= beta) return e.score;
      if (e.flag === 2 && e.score <= alpha) return e.score;
    }
    // Bigger captures first, then the move remembered from last time.
    const order = ms.map(m => ({ m, k: C.jumped(board, m.path).length * 10 + (e && e.best === m.path.join('-') ? 100 : 0) })).sort((a, b) => b.k - a.k);
    const a0 = alpha;
    let best = -Infinity, bestKey = '';
    for (const { m } of order) {
      const sc = -search(S, play(board, m.path, p), 1 - p, depth - 1, -beta, -alpha, ply + 1);
      if (sc > best) { best = sc; bestKey = m.path.join('-'); }
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    if (S.tt.size > 300000) S.tt.clear();
    S.tt.set(key, { depth, score: best, best: bestKey, flag: best <= a0 ? 2 : best >= beta ? 1 : 0 });
    return best;
  }

  function rootScores(S, s, depth) {
    const p = s.turn, out = [];
    for (const m of moves(s.board, p, S.rules)) {
      const sc = -search(S, play(s.board, m.path, p), 1 - p, depth - 1, -WIN - 1, WIN + 1, 1);
      out.push({ m, sc });
    }
    return out.sort((a, b) => b.sc - a.sc);
  }

  function think(s, levelId, opts = {}) {
    const lv = LEVELS.find(l => l.id === levelId) || LEVELS[1];
    const all = moves(s.board, s.turn, s.rules || C.DEFAULT_RULES);
    if (!all.length) return null;
    if (all.length === 1) return { path: all[0].path };
    if (lv.random && Math.random() < lv.random) return { path: all[Math.floor(Math.random() * all.length)].path };
    const S = { rules: s.rules || C.DEFAULT_RULES, tt: new Map(), nodes: 0, deadline: 0, depthCap: lv.depth || 8 };
    const time = opts.time || lv.time;
    if (!time) {
      const scores = rootScores(S, s, lv.depth);
      const top = scores.filter(x => x.sc >= scores[0].sc - (lv.id === 2 ? 6 : 0));
      return { path: top[Math.floor(Math.random() * top.length)].m.path };
    }
    S.deadline = Date.now() + time;
    let best = all[0];
    for (let d = 2; d <= (lv.maxDepth || 30); d++) {
      S.depthCap = d;
      try {
        const scores = rootScores(S, s, d);
        best = scores[0].m;
        if (Math.abs(scores[0].sc) > WIN - 200) break;
      } catch (e) {
        if (e !== STOP) throw e;
        break;
      }
    }
    return { path: best.path };
  }

  const api = { think, LEVELS, evaluate };
  root.CheckersAI = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
