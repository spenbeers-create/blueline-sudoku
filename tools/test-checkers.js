// Checkers rules and bot checks: node tools/test-checkers.js
const C = require('../js/games/checkers.js');
let AI = null;
try { AI = require('../js/games/checkers-ai.js'); } catch (e) { /* bot not built yet */ }
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL', m); } };
const sq = (r, c) => r * 8 + c;
// Build a position from a list of [square, piece].
function pos(pieces, turn = 0, rules) {
  const b = '.'.repeat(64).split('');
  for (const [i, ch] of pieces) b[i] = ch;
  return Object.assign(C.create({ rules }), { board: b.join(''), turn });
}
const paths = s => C.legalMoves(s).map(m => m.path.join('-')).sort();
const count = (s, ch) => s.board.split('').filter(x => x.toLowerCase() === ch).length;

// Start
{
  const s = C.create();
  ok(count(s, 'a') === 12 && count(s, 'b') === 12, '12 pieces each');
  ok(C.legalMoves(s).length === 7 && s.turn === 0, 'seven opening moves, seat 0 first');
  ok(s.board.split('').every((ch, i) => ch === '.' || (Math.floor(i / 8) + i % 8) % 2 === 1), 'pieces only on dark squares');
}
// Forced capture
{
  const s = pos([[sq(5, 2), 'a'], [sq(4, 3), 'b'], [sq(5, 6), 'a'], [sq(0, 1), 'b']]);
  ok(paths(s).join() === `${sq(5, 2)}-${sq(3, 4)}`, 'a capture is compulsory');
  const free = pos([[sq(5, 2), 'a'], [sq(4, 3), 'b'], [sq(5, 6), 'a'], [sq(0, 1), 'b']], 0, { forced: false });
  ok(paths(free).length > 1, 'with forced captures off you may skip it');
  const n = C.apply(s, { path: [sq(5, 2), sq(3, 4)] }, 0);
  ok(n.board[sq(4, 3)] === '.' && n.taken[0] === 1, 'the jumped piece is removed');
}
// Multi-jump must be finished
{
  const s = pos([[sq(6, 1), 'a'], [sq(5, 2), 'b'], [sq(3, 4), 'b'], [sq(0, 7), 'b']]);
  ok(paths(s).join() === [sq(6, 1), sq(4, 3), sq(2, 5)].join('-'), 'double jump is one move');
  ok(!C.legal(s, { path: [sq(6, 1), sq(4, 3)] }, 0), 'stopping halfway is not allowed');
  const n = C.apply(s, { path: [sq(6, 1), sq(4, 3), sq(2, 5)] }, 0);
  ok(count(n, 'b') === 1 && n.taken[0] === 2, 'both pieces taken');
}
// Men only move forward; crowning; crowning ends a jump
{
  const s = pos([[sq(4, 3), 'a'], [sq(0, 1), 'b']]);
  ok(paths(s).every(p => +p.split('-')[1] < sq(4, 0)), 'men move forward only');
  const k = pos([[sq(1, 2), 'a'], [sq(3, 6), 'b']]);
  const n = C.apply(k, { path: [sq(1, 2), sq(0, 1)] }, 0);
  ok(n.board[sq(0, 1)] === 'A' && n.last.crowned, 'reaching the far row crowns a king');
  const kingMoves = C.legalMoves(Object.assign({}, n, { turn: 0 }));
  ok(kingMoves.some(m => m.path[1] === sq(1, 0)) && kingMoves.some(m => m.path[1] === sq(1, 2)), 'kings move backward too');
  // A man that jumps into the far row stops, even if another jump would follow for a king.
  const j = pos([[sq(2, 3), 'a'], [sq(1, 2), 'b'], [sq(1, 0), 'b'], [sq(7, 6), 'b']]);
  ok(paths(j).join() === [sq(2, 3), sq(0, 1)].join('-'), 'a jump that crowns ends the move');
}
// Flying kings
{
  const s = pos([[sq(7, 0), 'A'], [sq(3, 4), 'b'], [sq(0, 3), 'b']], 0, { flying: true });
  const m = paths(s);
  ok(m.includes([sq(7, 0), sq(2, 5)].join('-')) && m.includes([sq(7, 0), sq(1, 6)].join('-')), 'a flying king captures from afar and lands anywhere beyond');
  const plain = pos([[sq(7, 0), 'A'], [sq(0, 3), 'b']], 0, { flying: true });
  ok(C.legalMoves(plain).length === 7, 'a flying king slides the whole diagonal');
  const n = C.apply(s, { path: [sq(7, 0), sq(2, 5)] }, 0);
  ok(n.board[sq(3, 4)] === '.' && n.taken[0] === 1, 'the piece it flew over is taken');
}
// Winning and drawing
{
  const s = pos([[sq(5, 2), 'a'], [sq(4, 3), 'b']]);
  const n = C.apply(s, { path: [sq(5, 2), sq(3, 4)] }, 0);
  ok(n.winner === 0, 'taking the last piece wins');
  const blocked = pos([[sq(7, 0), 'b'], [sq(6, 1), 'a'], [sq(5, 2), 'a'], [sq(0, 7), 'a']], 0);
  const after = C.apply(blocked, { path: [sq(0, 7), sq(1, 6)] }, 0);
  ok(after.winner === null || after.winner === 0, 'game goes on or ends correctly');
  const stuck = pos([[sq(7, 0), 'b'], [sq(6, 1), 'a'], [sq(5, 2), 'a'], [sq(5, 6), 'a']], 0);
  const st = C.apply(stuck, { path: [sq(5, 6), sq(4, 5)] }, 0);
  ok(st.winner === 0, 'a side with no moves loses');
  const q = Object.assign(pos([[sq(7, 0), 'A'], [sq(0, 7), 'B']]), { quiet: C.QUIET_LIMIT - 1 });
  ok(C.apply(q, { path: [sq(7, 0), sq(6, 1)] }, 0).winner === 'draw', 'forty king moves each without a capture is a draw');
  const q2 = Object.assign(pos([[sq(7, 0), 'A'], [sq(5, 2), 'a'], [sq(0, 7), 'B']]), { quiet: C.QUIET_LIMIT - 1 });
  ok(C.apply(q2, { path: [sq(5, 2), sq(4, 3)] }, 0).winner === null, 'a man moving resets the count');
}
// Random games always end and pieces only go down
for (let g = 0; g < 200; g++) {
  let s = C.create({ rules: { flying: g % 3 === 0, forced: g % 5 !== 0 } }), steps = 0, n = 24;
  while (!C.over(s) && steps++ < 1000) {
    const ms = C.legalMoves(s);
    s = C.apply(s, ms[(g * 31 + steps * 17) % ms.length], s.turn);
    const now = count(s, 'a') + count(s, 'b');
    if (now > n) { ok(false, 'pieces appeared'); break; }
    n = now;
  }
  if (steps >= 1000) { ok(false, 'game did not end'); break; }
}

if (AI) {
  const s0 = pos([[sq(5, 2), 'a'], [sq(4, 3), 'b'], [sq(6, 5), 'a'], [sq(1, 0), 'b'], [sq(1, 4), 'b']]);
  for (const lv of AI.LEVELS) ok(C.legal(s0, AI.think(s0, lv.id), 0), `${lv.name} plays a legal move`);
  // Don't hang a piece: moving 5,6 -> 4,7 would be jumped? Hard should prefer safe moves.
  function match(a, b, games) {
    let wa = 0, wb = 0, d = 0;
    for (let g = 0; g < games; g++) {
      let s = C.create({ first: g % 2 });
      const lv = [a, b];
      let k = 0;
      while (!C.over(s) && k++ < 300) s = C.apply(s, AI.think(s, lv[s.turn], lv[s.turn] === 4 ? { time: 120 } : {}), s.turn);
      if (s.winner === 0) wa++; else if (s.winner === 1) wb++; else d++;
    }
    return { wa, wb, d };
  }
  const r1 = match(2, 1, 8);
  ok(r1.wa > r1.wb, `Normal beats Easy (${r1.wa}-${r1.wb}-${r1.d})`);
  const r2 = match(3, 2, 6);
  ok(r2.wa >= r2.wb, `Hard holds its own against Normal (${r2.wa}-${r2.wb}-${r2.d})`);
  console.log(`  Normal vs Easy ${r1.wa}-${r1.wb}-${r1.d}, Hard vs Normal ${r2.wa}-${r2.wb}-${r2.d}`);
  const t = Date.now(); AI.think(C.create(), 4); const ms = Date.now() - t;
  ok(ms < 1500, `Expert answers in time (${ms} ms)`);
}
console.log(fails ? `${fails} failure(s)` : 'All Checkers checks passed');
process.exit(fails ? 1 : 0);
