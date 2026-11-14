/* Four in a Row: drop discs into the grid, first to line up four wins.
   Three board sizes: Quick (6 wide, 5 tall), Classic (7×6) and Big (9×7). */
(function (root) {
  'use strict';
  const GAMES = root.BLGames || (root.BLGames = {});
  const ROWS = 6, COLS = 7;
  const SIZES = {
    quick: { rows: 5, cols: 6, name: 'Quick', sub: '6 × 5' },
    classic: { rows: 6, cols: 7, name: 'Classic', sub: '7 × 6' },
    big: { rows: 7, cols: 9, name: 'Big', sub: '9 × 7' },
  };
  const dims = s => ({ rows: s.rows || ROWS, cols: s.cols || COLS });

  function lineAt(b, r, c, ch, rows, cols) {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [r * cols + c];
      for (const s of [1, -1]) {
        let rr = r + dr * s, cc = c + dc * s;
        while (rr >= 0 && rr < rows && cc >= 0 && cc < cols && b[rr * cols + cc] === ch) { cells.push(rr * cols + cc); rr += dr * s; cc += dc * s; }
      }
      if (cells.length >= 4) return cells.sort((a, x) => a - x);
    }
    return null;
  }
  // Row a disc dropped in this column would land in, or -1 when full.
  function landing(s, col) {
    const { rows, cols } = dims(s);
    for (let r = rows - 1; r >= 0; r--) if (s.board[r * cols + col] === '.') return r;
    return -1;
  }

  const logic = {
    id: 'four', name: 'Four in a Row', category: 'board', kind: 'turns', local: true,
    blurb: 'Drop discs and line up four before they do.',
    create(opts = {}) {
      const size = SIZES[opts.size] ? opts.size : 'classic', { rows, cols } = SIZES[size];
      const first = opts.first === 1 ? 1 : 0;
      return { size, rows, cols, board: '.'.repeat(rows * cols), first, turn: first, moves: [], winner: null, line: null, last: -1 };
    },
    turn: s => s.turn,
    over: s => s.winner != null,
    winner: s => s.winner,
    legal(s, m, p) {
      const { cols } = dims(s);
      return s.winner == null && p === s.turn && !!m && Number.isInteger(m.col) && m.col >= 0 && m.col < cols && s.board[m.col] === '.';
    },
    legalMoves(s) {
      const { cols } = dims(s), out = [];
      if (s.winner != null) return out;
      for (let c = 0; c < cols; c++) if (s.board[c] === '.') out.push({ col: c });
      return out;
    },
    apply(s, m, p) {
      const { rows, cols } = dims(s);
      const b = s.board.split('');
      const r = landing(s, m.col);
      const at = r * cols + m.col;
      b[at] = String(p);
      const line = lineAt(b, r, m.col, String(p), rows, cols);
      const full = !b.includes('.');
      return Object.assign({}, s, { rows, cols, board: b.join(''), turn: 1 - p, moves: s.moves.concat(m.col), winner: line ? p : full ? 'draw' : null, line, last: at });
    },
    // Cells where player p would win with their next disc (only ones they can reach now).
    threats(s, p) {
      const { rows, cols } = dims(s), out = [];
      if (s.winner != null) return out;
      const b = s.board.split('');
      for (let c = 0; c < cols; c++) {
        const r = landing(s, c);
        if (r < 0) continue;
        b[r * cols + c] = String(p);
        if (lineAt(b, r, c, String(p), rows, cols)) out.push(r * cols + c);
        b[r * cols + c] = '.';
      }
      return out;
    },
    landing,
    summary(s, names) {
      if (s.winner === 'draw') return 'Board full. It’s a draw.';
      if (s.winner != null) return `${names[s.winner]} lined up four in ${Math.ceil(s.moves.length / 2)} moves.`;
      return `${names[s.turn]} to move`;
    },
    ROWS, COLS, SIZES, dims,
  };

  GAMES.four = Object.assign(GAMES.four || {}, logic);
  if (typeof module === 'object' && module.exports) module.exports = logic;
})(typeof self !== 'undefined' ? self : globalThis);
