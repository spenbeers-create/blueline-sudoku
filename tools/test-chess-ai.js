// Chess bot checks: node tools/test-chess-ai.js [quick]
const AI = require('../js/games/chess-ai.js');
const chess = require('../js/games/chess.js');
const quick = process.argv.includes('quick');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL', m); } else console.log('  ok  ', m); };

function fromFen(fen) {
  const [placement, side, castling, ep, half, full] = fen.split(' ');
  let board = '';
  for (const ch of placement.replace(/\//g, '')) board += /\d/.test(ch) ? '.'.repeat(+ch) : ch;
  const s = chess.create();
  s.board = board; s.turn = side === 'w' ? 0 : 1; s.castling = castling === '-' ? '' : castling;
  s.ep = ep === '-' ? -1 : (8 - +ep[1]) * 8 + 'abcdefgh'.indexOf(ep[0]);
  s.half = +half || 0; s.full = +full || 1; s.seen = {}; s.moves = [];
  return s;
}

// 1. Move generation matches the published perft counts.
const perfts = [
  ['start', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', quick ? [20, 400, 8902] : [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', quick ? [48, 2039] : [48, 2039, 97862]],
  ['position 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['position 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];
for (const [label, fen, counts] of perfts) {
  const s = fromFen(fen);
  const pos = AI.setup(s);
  const got = counts.map((_, i) => AI.perft(pos, i + 1));
  ok(got.join() === counts.join(), `perft ${label}: ${got.join(', ')}`);
}

// 2. The bot only ever plays legal moves, from random positions, at every level.
let rngSeed = 7;
const rand = () => { rngSeed = (rngSeed * 1103515245 + 12345) & 0x7fffffff; return rngSeed / 0x7fffffff; };
let illegal = 0, played = 0;
for (let g = 0; g < (quick ? 4 : 10); g++) {
  let s = chess.create();
  for (let ply = 0; ply < 40 && !chess.over(s); ply++) {
    const level = 1 + ((g + ply) % 6);
    const m = AI.think(s, level, { time: 40, random: rand });
    played++;
    if (!m || !chess.legal(s, m, s.turn)) { illegal++; break; }
    s = chess.apply(s, m);
  }
}
ok(illegal === 0, `bot moves legal (${played} moves across all levels)`);

// 3. Every level from Club up finds mate in one.
const mates = [
  ['6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'a1', 'a8'],
  ['r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 'h5', 'f7'],
  ['k7/8/1K6/8/8/8/8/7R w - - 0 1', 'h1', 'h8'],
];
for (const level of [3, 4, 5, 6]) {
  let found = 0;
  for (const [fen, from, to] of mates) {
    const s = fromFen(fen);
    const m = AI.think(s, level, { time: 300 });
    if (chess.squareName(m.from) === from && chess.squareName(m.to) === to) found++;
  }
  ok(found === mates.length, `level ${level} finds mate in one (${found}/${mates.length})`);
}

// 4. Stronger levels beat weaker ones.
function match(a, b, games, time) {
  let aScore = 0;
  for (let g = 0; g < games; g++) {
    let s = chess.create();
    const aWhite = g % 2 === 0;
    for (let ply = 0; ply < 160 && !chess.over(s); ply++) {
      const lv = (s.turn === 0) === aWhite ? a : b;
      s = chess.apply(s, AI.think(s, lv, { time }));
    }
    const w = chess.over(s) ? s.winner : 'draw';
    if (w === 'draw') aScore += 0.5;
    else if ((w === 0) === aWhite) aScore += 1;
  }
  return aScore;
}
const t0 = Date.now();
const s41 = match(4, 1, quick ? 2 : 4, 120);
ok(s41 >= (quick ? 1.5 : 3), `Strong vs Beginner: ${s41}/${quick ? 2 : 4}`);
const s52 = match(5, 2, quick ? 2 : 4, 150);
ok(s52 >= (quick ? 1.5 : 3), `Expert vs Casual: ${s52}/${quick ? 2 : 4}`);
console.log(`  matches took ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// 5. Speed: how deep Master gets in its normal time.
const deep = AI.think(chess.create(), 6, { time: 3000 });
console.log(`  Master opening search: depth ${deep.depth}, ${deep.nodes} nodes in 3s`);
ok(deep.depth >= 5, 'Master searches at least 5 moves deep');

console.log(fails ? `\n${fails} failure(s)` : '\nAll chess bot checks passed');
process.exit(fails ? 1 : 0);
