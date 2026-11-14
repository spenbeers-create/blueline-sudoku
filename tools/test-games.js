// Rule checks for the two-player games: node tools/test-games.js
const four = require('../js/games/four.js');
const chess = require('../js/games/chess.js');
const eights = require('../js/games/eights.js');
const words = require('../js/games/words.js');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  FAIL', msg); } };

// ---- Four in a Row
{
  let s = four.create();
  for (const col of [0, 1, 0, 1, 0, 1]) s = four.apply(s, { col }, s.turn);
  ok(s.winner == null, 'four: no winner after 6');
  ok(four.legal(s, { col: 0 }, 0) && !four.legal(s, { col: 0 }, 1), 'four: turn order');
  s = four.apply(s, { col: 0 }, 0);
  ok(s.winner === 0 && s.line.length === 4, 'four: vertical win');
  let d = four.create();
  for (const col of [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]) d = four.apply(d, { col }, d.turn);
  ok(d.winner === 0, 'four: diagonal win');
  let f = four.create();
  for (let i = 0; i < 6; i++) f = four.apply(f, { col: 0 }, f.turn);
  ok(!four.legal(f, { col: 0 }, f.turn), 'four: full column rejected');
}

// ---- Chess: perft against known node counts
function fromFen(fen) {
  const [placement, side, castling, ep, half, full] = fen.split(' ');
  let board = '';
  for (const ch of placement.replace(/\//g, '')) board += /\d/.test(ch) ? '.'.repeat(+ch) : ch;
  const s = chess.create();
  s.board = board; s.turn = side === 'w' ? 0 : 1; s.castling = castling === '-' ? '' : castling;
  s.ep = ep === '-' ? -1 : (8 - +ep[1]) * 8 + 'abcdefgh'.indexOf(ep[0]);
  s.half = +half || 0; s.full = +full || 1; s.seen = {};
  return s;
}
function perft(s, depth) {
  const ms = chess.legalMoves(s);
  if (depth === 1) return ms.length;
  let n = 0;
  for (const m of ms) n += perft(chess.apply(s, m), depth - 1);
  return n;
}
const perfts = [
  ['start', chess.create(), [20, 400, 8902]],
  ['kiwipete', fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'), [48, 2039]],
  ['position 3', fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'), [14, 191, 2812]],
  ['position 4', fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'), [6, 264, 9467]],
  ['position 5', fromFen('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8'), [44, 1486]],
];
for (const [label, s, counts] of perfts) {
  counts.forEach((want, i) => { const got = perft(s, i + 1); ok(got === want, `chess perft ${label} depth ${i + 1}: ${got} vs ${want}`); });
}
{
  const play = sans => { let s = chess.create(); for (const t of sans) { const m = chess.legalMoves(s).find(x => { const n = chess.apply(s, x); return n.history[n.history.length - 1].replace(/[+#]/, '') === t; }); if (!m) throw new Error('no move ' + t); s = chess.apply(s, m); } return s; };
  const mate = play(['f3', 'e5', 'g4', 'Qh4']);
  ok(mate.result === 'checkmate' && mate.winner === 1, 'chess: fool’s mate');
  ok(mate.history.join(' ') === 'f3 e5 g4 Qh4#', 'chess: SAN ' + mate.history.join(' '));
  const rep = play(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']);
  ok(rep.result === 'repetition' && rep.winner === 'draw', 'chess: threefold repetition');
  const stale = fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  ok(chess.legalMoves(stale).length === 0, 'chess: stalemate position has no moves');
}

// ---- Crazy Eights: random games always end, cards are conserved
for (let g = 0; g < 300; g++) {
  let s = eights.create({ seed: 'g' + g });
  let steps = 0;
  while (!eights.over(s) && steps++ < 2000) {
    const p = s.turn, hand = s.hands[p];
    const playable = hand.filter(c => eights.canPlay(s, c));
    let m;
    if (playable.length) { const c = playable[0]; m = { play: c, suit: c[0] === '8' ? 'H' : undefined }; }
    else if (eights.legal(s, { draw: true }, p)) m = { draw: true };
    else m = { pass: true };
    if (!eights.legal(s, m, p)) { ok(false, `eights: illegal move generated ${JSON.stringify(m)}`); break; }
    s = eights.apply(s, m, p);
    const total = s.stock.length + s.discard.length + s.hands[0].length + s.hands[1].length;
    if (total !== 52) { ok(false, `eights: card count ${total}`); break; }
  }
  if (steps >= 2000) { ok(false, 'eights: game did not end ' + g); break; }
}
{
  const s = eights.create({ seed: 'x' });
  ok(s.discard[0][0] !== '8', 'eights: starter is never an eight');
  ok(!eights.legal(s, { draw: true }, 1 - s.turn), 'eights: out-of-turn rejected');
}

// ---- Word Duel scoring
ok(words.score('crane', 'crane') === 'ggggg', 'words: exact');
ok(words.score('abbey', 'babes') === 'yygg.', 'words: duplicates ' + words.score('abbey', 'babes'));
ok(words.score('apple', 'leapp') === 'yyyyy', 'words: all present');
ok(words.score('eerie', 'never') === '.g.yy', 'words: repeated e ' + words.score('eerie', 'never'));
{
  const s = words.create({ seed: 'abc' });
  ok(words.create({ seed: 'abc' }).word === s.word, 'words: same seed same word');
  ok(words.isWord(s.word), 'words: answer is a valid guess');
  let a = words.progress(), b = words.progress();
  a = words.advance(s, a, { guess: s.word, time: 9000 });
  b = words.advance(s, b, { guess: 'xxxxx'.replace(/x/g, 'a') === 'aaaaa' && words.isWord('crane') ? 'crane' : s.word, time: 5000 });
  ok(words.check(s, a, { guess: 'crane' }) !== '', 'words: done player cannot guess');
  ok(words.check(s, words.progress(), { guess: 'zzzzq' }) !== '', 'words: non-word rejected');
}
console.log(fails ? `\n${fails} failure(s)` : 'All game checks passed');
process.exit(fails ? 1 : 0);
