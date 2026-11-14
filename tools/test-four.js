// Four in a Row rules and bot checks: node tools/test-four.js
const four = require('../js/games/four.js');
const AI = require('../js/games/four-ai.js');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL', m); } };
const playAll = (s, cols) => { for (const col of cols) s = four.apply(s, { col }, s.turn); return s; };

// Board sizes
for (const [size, rows, cols] of [['quick', 5, 6], ['classic', 6, 7], ['big', 7, 9]]) {
  let s = four.create({ size });
  ok(s.rows === rows && s.cols === cols && s.board.length === rows * cols, `${size}: ${cols}×${rows}`);
  ok(four.legalMoves(s).length === cols, `${size}: every column open`);
  for (let i = 0; i < rows; i++) s = four.apply(s, { col: cols - 1 }, s.turn);
  ok(!four.legal(s, { col: cols - 1 }, s.turn) && four.legal(s, { col: 0 }, s.turn), `${size}: full column closes`);
  let w = playAll(four.create({ size }), [0, 1, 0, 1, 0, 1, 0]);
  ok(w.winner === 0 && w.line.length === 4, `${size}: vertical four wins`);
}
// Old saved games (no size) still work
{
  const old = { board: '.'.repeat(42), turn: 0, moves: [], winner: null, line: null, last: -1 };
  const s = four.apply(old, { col: 3 }, 0);
  ok(s.board[38] === '0' && s.rows === 6 && s.cols === 7, 'old saves default to 7×6');
}
// Threats
{
  const s = playAll(four.create(), [0, 6, 1, 6, 2]);   // blue has 0,1,2 on the bottom row
  const t = four.threats(s, 0);
  ok(t.includes(5 * 7 + 3), 'threat found at the end of three in a row');
  ok(four.threats(s, 1).length === 0, 'no threats for orange');
}
// First player
{
  const s = four.create({ first: 1 });
  ok(s.turn === 1 && s.first === 1, 'second player can start');
}

// Bot: takes a win, blocks a loss, never sets up the opponent
{
  const s = playAll(four.create(), [0, 6, 1, 6, 2, 5]);    // blue to move with 0,1,2 on the bottom
  for (const lv of AI.LEVELS) ok(AI.think(s, lv.id).col === 3, `${lv.name} takes the win`);
  const b = playAll(four.create(), [6, 0, 6, 1, 5, 2]);    // orange threatens column 3; blue to move
  for (const lv of AI.LEVELS.slice(1)) ok(AI.think(b, lv.id).col === 3, `${lv.name} blocks`);
  // Playing column 2 would let orange win on top of it (diagonal), so Hard avoids it.
  let trap = four.create();
  trap = playAll(trap, [3, 3, 4, 4, 2, 4, 5, 5, 6, 5, 1, 6]);
  if (trap.winner == null) {
    const bad = [];
    for (const { col } of four.legalMoves(trap)) {
      const n = four.apply(trap, { col }, trap.turn);
      if (n.winner == null && four.threats(n, n.turn).length) bad.push(col);
    }
    const mv = AI.think(trap, 3).col;
    ok(!bad.includes(mv) || bad.length === four.legalMoves(trap).length, `Hard doesn't hand over a win (played ${mv}, bad ${bad})`);
  }
}

// Strength: stronger levels beat weaker ones
function match(a, b, games, size) {
  let wa = 0, wb = 0, d = 0;
  for (let g = 0; g < games; g++) {
    let s = four.create({ size, first: g % 2 });
    const lv = [a, b];
    while (!four.over(s)) s = four.apply(s, AI.think(s, lv[s.turn], lv[s.turn] === 4 ? { time: 150 } : {}), s.turn);
    if (s.winner === 0) wa++; else if (s.winner === 1) wb++; else d++;
  }
  return { wa, wb, d };
}
const randomPlay = (s) => { const m = four.legalMoves(s); return m[Math.floor(Math.random() * m.length)]; };
{
  let wins = 0;
  for (let g = 0; g < 10; g++) {
    let s = four.create({ first: g % 2 });
    while (!four.over(s)) s = four.apply(s, s.turn === 0 ? AI.think(s, 2) : randomPlay(s), s.turn);
    if (s.winner === 0) wins++;
  }
  ok(wins >= 9, `Normal beats random moves (${wins}/10)`);
}
{
  const r = match(3, 1, 8, 'classic');
  ok(r.wa >= 6, `Hard beats Easy (${r.wa}-${r.wb}-${r.d})`);
  const r2 = match(4, 2, 6, 'classic');
  ok(r2.wa >= 4, `Expert beats Normal (${r2.wa}-${r2.wb}-${r2.d})`);
  const r3 = match(3, 2, 4, 'big');
  ok(r3.wa >= 2, `Hard beats Normal on the big board (${r3.wa}-${r3.wb}-${r3.d})`);
}
// Speed
{
  for (const size of ['classic', 'big']) {
    const s = playAll(four.create({ size }), [3, 3, 2]);
    let t = Date.now(); AI.think(s, 3); const hard = Date.now() - t;
    t = Date.now(); AI.think(s, 4); const exp = Date.now() - t;
    ok(hard < 1500, `${size}: Hard answers quickly (${hard} ms)`);
    ok(exp < 1400, `${size}: Expert stays inside its time (${exp} ms)`);
  }
}
console.log(fails ? `${fails} failure(s)` : 'All Four in a Row checks passed');
process.exit(fails ? 1 : 0);
