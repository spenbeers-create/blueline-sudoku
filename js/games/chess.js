/* Chess: full rules, including castling, en passant, promotion, check, checkmate,
   stalemate, threefold repetition, the 50-move rule and insufficient material.
   Squares are 0..63 with a8 = 0 and h1 = 63. Player 0 is white. */
(function (root) {
  'use strict';
  const GAMES = root.BLGames || (root.BLGames = {});
  const START = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';
  const FILES = 'abcdefgh';
  const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  const isWhite = p => p >= 'A' && p <= 'Z';
  const colorOf = p => (p === '.' ? null : isWhite(p) ? 'w' : 'b');
  const fileOf = i => i % 8, rankOf = i => Math.floor(i / 8);
  const at = (f, r) => (f >= 0 && f < 8 && r >= 0 && r < 8 ? r * 8 + f : -1);
  const name = i => FILES[fileOf(i)] + (8 - rankOf(i));

  function attacked(b, i, by) {
    const f = fileOf(i), r = rankOf(i);
    const own = by === 'w' ? s => s.toUpperCase() === s : s => s.toLowerCase() === s;
    const pc = t => (by === 'w' ? t.toUpperCase() : t.toLowerCase());
    const pr = by === 'w' ? r + 1 : r - 1;
    for (const df of [-1, 1]) { const j = at(f + df, pr); if (j >= 0 && b[j] === pc('p')) return true; }
    for (const [df, dr] of KNIGHT) { const j = at(f + df, r + dr); if (j >= 0 && b[j] === pc('n')) return true; }
    for (const [df, dr] of KING) { const j = at(f + df, r + dr); if (j >= 0 && b[j] === pc('k')) return true; }
    for (const [dirs, kinds] of [[ROOK, 'rq'], [BISHOP, 'bq']]) {
      for (const [df, dr] of dirs) {
        let ff = f + df, rr = r + dr;
        while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
          const t = b[rr * 8 + ff];
          if (t !== '.') { if (own(t) && kinds.includes(t.toLowerCase())) return true; break; }
          ff += df; rr += dr;
        }
      }
    }
    return false;
  }

  const kingSquare = (b, c) => b.indexOf(c === 'w' ? 'K' : 'k');
  const inCheck = (s, c) => attacked(s.board, kingSquare(s.board, c), c === 'w' ? 'b' : 'w');

  function pseudo(s) {
    const b = s.board, c = s.turn === 0 ? 'w' : 'b', foe = c === 'w' ? 'b' : 'w', out = [];
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (colorOf(p) !== c) continue;
      const f = fileOf(i), r = rankOf(i), t = p.toLowerCase();
      if (t === 'p') {
        const dir = c === 'w' ? -1 : 1, startRank = c === 'w' ? 6 : 1, lastRank = c === 'w' ? 0 : 7;
        const push = (to, cap) => {
          if (rankOf(to) === lastRank) for (const promo of 'qrbn') out.push({ from: i, to, promo, cap });
          else out.push({ from: i, to, cap });
        };
        const one = at(f, r + dir);
        if (one >= 0 && b[one] === '.') {
          push(one, false);
          const two = at(f, r + 2 * dir);
          if (r === startRank && b[two] === '.') out.push({ from: i, to: two, double: true });
        }
        for (const df of [-1, 1]) {
          const j = at(f + df, r + dir);
          if (j < 0) continue;
          if (colorOf(b[j]) === foe) push(j, true);
          else if (j === s.ep) out.push({ from: i, to: j, ep: true, cap: true });
        }
      } else if (t === 'n' || t === 'k') {
        for (const [df, dr] of t === 'n' ? KNIGHT : KING) {
          const j = at(f + df, r + dr);
          if (j >= 0 && colorOf(b[j]) !== c) out.push({ from: i, to: j, cap: b[j] !== '.' });
        }
        if (t === 'k') {
          const home = c === 'w' ? 60 : 4;
          if (i === home && !attacked(b, i, foe)) {
            const K = c === 'w' ? 'K' : 'k', Q = c === 'w' ? 'Q' : 'q';
            if (s.castling.includes(K) && b[i + 1] === '.' && b[i + 2] === '.' && !attacked(b, i + 1, foe) && !attacked(b, i + 2, foe))
              out.push({ from: i, to: i + 2, castle: 'k' });
            if (s.castling.includes(Q) && b[i - 1] === '.' && b[i - 2] === '.' && b[i - 3] === '.' && !attacked(b, i - 1, foe) && !attacked(b, i - 2, foe))
              out.push({ from: i, to: i - 2, castle: 'q' });
          }
        }
      } else {
        const dirs = t === 'r' ? ROOK : t === 'b' ? BISHOP : ROOK.concat(BISHOP);
        for (const [df, dr] of dirs) {
          let ff = f + df, rr = r + dr;
          while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
            const j = rr * 8 + ff;
            if (b[j] === '.') out.push({ from: i, to: j });
            else { if (colorOf(b[j]) === foe) out.push({ from: i, to: j, cap: true }); break; }
            ff += df; rr += dr;
          }
        }
      }
    }
    return out;
  }

  // Board-level move without bookkeeping, used for legality checks.
  function play(s, m) {
    const b = s.board.split('');
    const p = b[m.from];
    const white = isWhite(p);
    b[m.to] = m.promo ? (white ? m.promo.toUpperCase() : m.promo) : p;
    b[m.from] = '.';
    if (m.ep) b[m.to + (white ? 8 : -8)] = '.';
    if (m.castle === 'k') { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = '.'; }
    if (m.castle === 'q') { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = '.'; }
    return b.join('');
  }

  function legalMoves(s) {
    const c = s.turn === 0 ? 'w' : 'b', foe = c === 'w' ? 'b' : 'w';
    return pseudo(s).filter(m => { const nb = play(s, m); return !attacked(nb, kingSquare(nb, c), foe); });
  }

  const posKey = s => `${s.board} ${s.turn} ${s.castling} ${s.ep}`;

  function insufficient(b) {
    const pieces = b.replace(/[.kK]/g, '');
    if (!pieces) return true;
    if (pieces.length === 1 && /[nNbB]/.test(pieces)) return true;
    if (/^[bB]+$/.test(pieces)) {
      const shades = new Set();
      for (let i = 0; i < 64; i++) if (b[i] === 'b' || b[i] === 'B') shades.add((fileOf(i) + rankOf(i)) % 2);
      return shades.size === 1;
    }
    return false;
  }

  function san(s, m, all, next) {
    let out;
    if (m.castle) out = m.castle === 'k' ? 'O-O' : 'O-O-O';
    else {
      const p = s.board[m.from].toUpperCase();
      if (p === 'P') out = (m.cap ? FILES[fileOf(m.from)] + 'x' : '') + name(m.to) + (m.promo ? '=' + m.promo.toUpperCase() : '');
      else {
        const rivals = all.filter(o => o.to === m.to && o.from !== m.from && s.board[o.from] === s.board[m.from]);
        let dis = '';
        if (rivals.length) {
          if (!rivals.some(o => fileOf(o.from) === fileOf(m.from))) dis = FILES[fileOf(m.from)];
          else if (!rivals.some(o => rankOf(o.from) === rankOf(m.from))) dis = String(8 - rankOf(m.from));
          else dis = name(m.from);
        }
        out = p + dis + (m.cap ? 'x' : '') + name(m.to);
      }
    }
    if (next.result === 'checkmate') out += '#';
    else if (next.check) out += '+';
    return out;
  }

  function finish(s) {
    const moves = legalMoves(s);
    const c = s.turn === 0 ? 'w' : 'b';
    s.check = inCheck(s, c);
    if (!moves.length) {
      s.result = s.check ? 'checkmate' : 'stalemate';
      s.winner = s.check ? 1 - s.turn : 'draw';
    } else if (s.half >= 100) { s.result = 'fifty'; s.winner = 'draw'; }
    else if ((s.seen[posKey(s)] || 0) >= 3) { s.result = 'repetition'; s.winner = 'draw'; }
    else if (insufficient(s.board)) { s.result = 'material'; s.winner = 'draw'; }
    return s;
  }

  const sameMove = (a, m) => a.from === m.from && a.to === m.to && (a.promo || '') === (m.promo || '');

  // Can this side still deliver mate? (Used when the other side runs out of time.)
  function canMate(b, white) {
    const mine = b.split('').filter(ch => ch !== '.' && (ch === ch.toUpperCase()) === white && ch.toLowerCase() !== 'k');
    if (!mine.length) return false;
    if (mine.length === 1 && 'nb'.includes(mine[0].toLowerCase())) return false;
    return true;
  }
  // Time left for `side`, counting the clock that is running now.
  function clockLeft(s, side, now) {
    if (!s.clock) return null;
    const c = s.clock;
    return c.ms[side] - (c.running && side === s.turn && s.winner == null ? Math.max(0, now - c.last) : 0);
  }

  const logic = {
    id: 'chess', name: 'Chess', category: 'board', kind: 'turns', local: true,
    blurb: 'The classic. Full rules, castling and all.',
    // opts.clock: { minutes, increment } for a timed game.
    create(opts = {}) {
      const s = { board: START, turn: 0, castling: 'KQkq', ep: -1, half: 0, full: 1, history: [], moves: [], seen: {}, last: null, check: false, result: null, winner: null, captured: '', offer: null, clock: null };
      if (opts.clock && opts.clock.minutes) {
        const ms = Math.round(opts.clock.minutes * 60000);
        s.clock = { ms: [ms, ms], inc: (opts.clock.increment || 0) * 1000, last: 0, running: false };
      }
      s.seen[posKey(s)] = 1;
      return s;
    },
    turn: s => s.turn,
    over: s => s.winner != null,
    winner: s => s.winner,
    legalMoves,
    clockLeft,
    movesFrom(s, from) { return legalMoves(s).filter(m => m.from === from); },
    // Moves: {from,to,promo,at}, {resign}, {offer}, {accept}, {decline}, {flag,at}
    legal(s, m, p) {
      if (s.winner != null || !m) return false;
      if (m.resign) return p === 0 || p === 1;
      if (m.offer) return (p === 0 || p === 1) && s.offer == null && (s.moves || []).length >= 2;
      if (m.accept || m.decline) return s.offer === 1 - p;
      if (m.flag) return !!(s.clock && s.clock.running && typeof m.at === 'number' && clockLeft(s, s.turn, m.at) <= 0);
      if (p !== s.turn) return false;
      if (s.clock && s.clock.running && typeof m.at === 'number' && clockLeft(s, s.turn, m.at) <= 0) return false;
      return legalMoves(s).some(o => sameMove(o, m));
    },
    apply(s, m, p) {
      if (m.resign || m.offer || m.accept || m.decline || m.flag) {
        const n = JSON.parse(JSON.stringify(s));
        if (m.resign) { n.winner = 1 - p; n.result = 'resign'; }
        else if (m.offer) n.offer = p;
        else if (m.decline) n.offer = null;
        else if (m.accept) { n.winner = 'draw'; n.result = 'agreement'; n.offer = null; }
        else if (m.flag) {
          const loser = s.turn;
          n.clock.ms[loser] = 0;
          n.clock.running = false;
          const otherCanMate = canMate(s.board, loser === 1);
          n.winner = otherCanMate ? 1 - loser : 'draw';
          n.result = otherCanMate ? 'time' : 'time-draw';
        }
        return n;
      }
      const all = legalMoves(s);
      const mv = all.find(o => sameMove(o, m));
      const piece = s.board[mv.from];
      const capturedPiece = mv.ep ? (isWhite(piece) ? 'p' : 'P') : s.board[mv.to];
      const n = {
        board: play(s, mv), turn: 1 - s.turn, castling: s.castling, ep: -1,
        half: piece.toLowerCase() === 'p' || mv.cap ? 0 : s.half + 1,
        full: s.full + (s.turn === 1 ? 1 : 0), history: s.history.slice(), seen: Object.assign({}, s.seen),
        moves: (s.moves || []).concat({ from: mv.from, to: mv.to, promo: mv.promo || '' }),
        last: { from: mv.from, to: mv.to }, check: false, result: null, winner: null,
        captured: s.captured + (capturedPiece !== '.' ? capturedPiece : ''),
        offer: s.offer === 1 - s.turn ? null : s.offer,
        clock: s.clock ? JSON.parse(JSON.stringify(s.clock)) : null,
      };
      if (n.clock && typeof m.at === 'number') {
        const c = n.clock;
        if (c.running) { c.ms[s.turn] = Math.max(0, c.ms[s.turn] - Math.max(0, m.at - c.last)) + c.inc; }
        c.last = m.at;
        if (n.moves.length >= 2) c.running = true;
      }
      if (mv.double) n.ep = (mv.from + mv.to) / 2;
      const strip = (str, chars) => str.split('').filter(ch => !chars.includes(ch)).join('');
      if (piece === 'K') n.castling = strip(n.castling, 'KQ');
      if (piece === 'k') n.castling = strip(n.castling, 'kq');
      for (const [sq, ch] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']]) if (mv.from === sq || mv.to === sq) n.castling = strip(n.castling, ch);
      n.seen[posKey(n)] = (n.seen[posKey(n)] || 0) + 1;
      finish(n);
      n.history.push(san(s, mv, all, n));
      return n;
    },
    summary(s, names) {
      const by = { checkmate: 'Checkmate', stalemate: 'Stalemate', fifty: '50 moves without a capture or pawn move', repetition: 'Same position three times', material: 'Not enough pieces left to checkmate', agreement: 'Draw agreed', 'time-draw': 'Out of time, but there’s nothing left to checkmate with' };
      if (s.result === 'checkmate') return `Checkmate. ${names[s.winner]} wins.`;
      if (s.result === 'resign') return `${names[1 - s.winner]} resigned.`;
      if (s.result === 'time') return `${names[1 - s.winner]} ran out of time.`;
      if (s.winner === 'draw') return `${by[s.result] || 'Draw'}. It’s a draw.`;
      return `${names[s.turn]} to move${s.check ? ', in check' : ''}`;
    },
    squareName: name,
    START,
  };

  GAMES.chess = Object.assign(GAMES.chess || {}, logic);
  if (typeof module === 'object' && module.exports) module.exports = logic;
})(typeof self !== 'undefined' ? self : globalThis);
