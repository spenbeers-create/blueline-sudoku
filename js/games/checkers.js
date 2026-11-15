/* Checkers on an 8×8 board, played on the dark squares. Men move one square
   diagonally forward; a man that reaches the far row is crowned a king, which moves
   diagonally both ways. Jump an enemy piece to capture it, and keep jumping while
   you can. Captures are compulsory unless that rule is switched off; with flying
   kings, kings slide any distance and capture from afar. You win when the other side
   has no pieces or no moves. Forty moves each without a capture or a man moving is a
   draw.
   Board: 64 characters, row 0 at the top. a/A = seat 0 man/king (starts at the
   bottom, moves up, goes first), b/B = seat 1. A move is {path: [from, to, ...]}. */
(function (root) {
  'use strict';
  const GAMES = root.BLGames || (root.BLGames = {});
  const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const DEFAULT_RULES = { forced: true, flying: false };
  const QUIET_LIMIT = 80;

  const rc = i => [Math.floor(i / 8), i % 8];
  const at = (r, c) => (r >= 0 && r < 8 && c >= 0 && c < 8 ? r * 8 + c : -1);
  const owner = ch => (ch === 'a' || ch === 'A' ? 0 : ch === 'b' || ch === 'B' ? 1 : -1);
  const isKing = ch => ch === 'A' || ch === 'B';
  const forward = p => (p === 0 ? -1 : 1);
  const lastRow = p => (p === 0 ? 0 : 7);

  function startBoard() {
    let b = '';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) b += (r + c) % 2 === 1 ? (r < 3 ? 'b' : r > 4 ? 'a' : '.') : '.';
    return b;
  }

  // Every capture sequence for the piece on `from`, followed to its end.
  function jumps(board, from, p, rl) {
    const out = [];
    const king0 = isKing(board[from]);
    const walk = (b, pos, path, king) => {
      let extended = false;
      const [r, c] = rc(pos);
      for (const [dr, dc] of DIRS) {
        if (!king && dr !== forward(p)) continue;
        if (king && rl.flying) {
          let k = 1;
          while (at(r + dr * k, c + dc * k) >= 0 && b[at(r + dr * k, c + dc * k)] === '.') k++;
          const mid = at(r + dr * k, c + dc * k);
          if (mid < 0 || owner(b[mid]) !== 1 - p) continue;
          for (let j = k + 1; ; j++) {
            const land = at(r + dr * j, c + dc * j);
            if (land < 0 || b[land] !== '.') break;
            const nb = b.split(''); nb[mid] = 'x'; nb[pos] = '.'; nb[land] = b[pos];
            extended = true;
            walk(nb.join(''), land, path.concat(land), true);
          }
        } else {
          const mid = at(r + dr, c + dc), land = at(r + 2 * dr, c + 2 * dc);
          if (mid < 0 || land < 0 || owner(b[mid]) !== 1 - p || b[land] !== '.') continue;
          const nb = b.split(''); nb[mid] = 'x'; nb[pos] = '.'; nb[land] = b[pos];
          extended = true;
          // A man crowned by a jump stops there.
          if (!king && Math.floor(land / 8) === lastRow(p)) out.push(path.concat(land));
          else walk(nb.join(''), land, path.concat(land), king);
        }
      }
      if (!extended && path.length > 1) out.push(path);
    };
    walk(board, from, [from], king0);
    return out;
  }
  function steps(board, from, p, rl) {
    const out = [], [r, c] = rc(from), king = isKing(board[from]);
    for (const [dr, dc] of DIRS) {
      if (!king && dr !== forward(p)) continue;
      for (let k = 1; ; k++) {
        const to = at(r + dr * k, c + dc * k);
        if (to < 0 || board[to] !== '.') break;
        out.push([from, to]);
        if (!(king && rl.flying)) break;
      }
    }
    return out;
  }
  function allMoves(s, p = s.turn) {
    const rl = s.rules || DEFAULT_RULES, caps = [], plain = [];
    for (let i = 0; i < 64; i++) {
      if (owner(s.board[i]) !== p) continue;
      for (const path of jumps(s.board, i, p, rl)) caps.push({ path });
      for (const path of steps(s.board, i, p, rl)) plain.push({ path });
    }
    return caps.length && rl.forced !== false ? caps : caps.concat(plain);
  }
  // Squares jumped over along a path (works for flying kings too).
  function jumped(board, path) {
    const out = [];
    for (let k = 1; k < path.length; k++) {
      const [r0, c0] = rc(path[k - 1]), [r1, c1] = rc(path[k]);
      const dr = Math.sign(r1 - r0), dc = Math.sign(c1 - c0);
      for (let r = r0 + dr, c = c0 + dc; r !== r1; r += dr, c += dc) if (board[r * 8 + c] !== '.' && r * 8 + c !== path[0]) out.push(r * 8 + c);
    }
    return out;
  }
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  const logic = {
    id: 'checkers', name: 'Checkers', category: 'board', kind: 'turns', local: true,
    blurb: 'Jump their pieces, crown your kings, clear the board.',
    DEFAULT_RULES, QUIET_LIMIT,
    create(opts = {}) {
      const rules = Object.assign({}, DEFAULT_RULES, opts.rules || {});
      const first = opts.first === 1 ? 1 : 0;
      return { board: startBoard(), turn: first, first, rules, moves: [], last: null, quiet: 0, taken: [0, 0], winner: null };
    },
    turn: s => s.turn,
    over: s => s.winner != null,
    winner: s => s.winner,
    legalMoves: s => (s.winner != null ? [] : allMoves(s)),
    // Moves that start from this square (for highlighting).
    movesFrom: (s, from) => (s.winner != null ? [] : allMoves(s).filter(m => m.path[0] === from)),
    mustCapture: s => (s.rules || DEFAULT_RULES).forced !== false && allMoves(s).some(m => jumped(s.board, m.path).length),
    legal(s, m, p) {
      if (s.winner != null || p !== s.turn || !m || !Array.isArray(m.path) || m.path.length < 2) return false;
      return allMoves(s).some(x => same(x.path, m.path));
    },
    apply(s, m, p) {
      const b = s.board.split(''), path = m.path, from = path[0], to = path[path.length - 1];
      const caps = jumped(s.board, path);
      let piece = b[from];
      const man = !isKing(piece);
      for (const i of caps) b[i] = '.';
      b[from] = '.';
      let crowned = false;
      if (man && Math.floor(to / 8) === lastRow(p)) { piece = piece.toUpperCase(); crowned = true; }
      b[to] = piece;
      const taken = (s.taken || [0, 0]).slice();
      taken[p] += caps.length;
      const n = Object.assign({}, s, {
        board: b.join(''), turn: 1 - p, moves: s.moves.concat([path]), last: { path, caps, crowned },
        quiet: caps.length || man ? 0 : (s.quiet || 0) + 1, taken, winner: null,
      });
      if (!allMoves(n, 1 - p).length) n.winner = p;
      else if (n.quiet >= QUIET_LIMIT) n.winner = 'draw';
      return n;
    },
    pieces(s, p) { let men = 0, kings = 0; for (const ch of s.board) if (owner(ch) === p) { if (isKing(ch)) kings++; else men++; } return { men, kings }; },
    summary(s, names) {
      if (s.winner === 'draw') return 'Forty moves each without a capture. It’s a draw.';
      if (s.winner != null) {
        const left = logic.pieces(s, 1 - s.winner);
        return left.men + left.kings ? `${names[1 - s.winner]} has no moves left.` : `${names[s.winner]} took every piece.`;
      }
      return `${names[s.turn]} to move`;
    },
    jumped, owner, isKing, startBoard,
  };

  GAMES.checkers = Object.assign(GAMES.checkers || {}, logic);
  if (typeof module === 'object' && module.exports) module.exports = logic;
})(typeof self !== 'undefined' ? self : globalThis);
