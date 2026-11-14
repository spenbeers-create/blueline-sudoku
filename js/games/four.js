/* Four in a Row: drop discs into a 7×6 grid, first to line up four wins. */
(function (root) {
  'use strict';
  const GAMES = root.BLGames || (root.BLGames = {});
  const ROWS = 6, COLS = 7;

  function lineAt(b, r, c, ch) {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [r * COLS + c];
      for (const s of [1, -1]) {
        let rr = r + dr * s, cc = c + dc * s;
        while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && b[rr * COLS + cc] === ch) { cells.push(rr * COLS + cc); rr += dr * s; cc += dc * s; }
      }
      if (cells.length >= 4) return cells.sort((a, x) => a - x);
    }
    return null;
  }

  const logic = {
    id: 'four', name: 'Four in a Row', category: 'board', kind: 'turns', local: true,
    blurb: 'Drop discs and line up four before they do.',
    create(opts = {}) {
      return { board: '.'.repeat(ROWS * COLS), turn: opts.first === 1 ? 1 : 0, moves: [], winner: null, line: null, last: -1 };
    },
    turn: s => s.turn,
    over: s => s.winner != null,
    winner: s => s.winner,
    legal(s, m, p) {
      return s.winner == null && p === s.turn && m && Number.isInteger(m.col) && m.col >= 0 && m.col < COLS && s.board[m.col] === '.';
    },
    apply(s, m, p) {
      const b = s.board.split('');
      let r = ROWS - 1;
      while (b[r * COLS + m.col] !== '.') r--;
      const at = r * COLS + m.col;
      b[at] = String(p);
      const line = lineAt(b, r, m.col, String(p));
      const full = !b.includes('.');
      return { board: b.join(''), turn: 1 - p, moves: s.moves.concat(m.col), winner: line ? p : full ? 'draw' : null, line, last: at };
    },
    summary(s, names) {
      if (s.winner === 'draw') return 'Board full. It’s a draw.';
      if (s.winner != null) return `${names[s.winner]} lined up four.`;
      return `${names[s.turn]} to move`;
    },
    ROWS, COLS,
  };

  GAMES.four = Object.assign(GAMES.four || {}, logic);
  if (typeof module === 'object' && module.exports) module.exports = logic;
})(typeof self !== 'undefined' ? self : globalThis);
