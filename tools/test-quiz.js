// More or Less and Measure Up checks: node tools/test-quiz.js
const path = require('path'), fs = require('fs');
globalThis.MORELESS_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'moreless.json'), 'utf8'));
require('../js/games/rounds.js');
const ML = require('../js/games/moreless.js');
const MU = require('../js/games/measure.js');
const HEIGHTS = require('../js/games/measure-data.js');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL', m); } };
const players = n => Array.from({ length: n }, (_, i) => ({ name: 'P' + i }));

// Data
{
  const d = globalThis.MORELESS_DATA;
  ok(d.items.length >= 200, `More or Less has plenty of topics (${d.items.length})`);
  ok(d.items.every(x => x.t && x.v > 0 && ML.CATS[x.c]), 'every topic has a name, a category and views');
  ok(new Set(d.items.map(x => x.t)).size === d.items.length, 'no duplicate topics');
  ok(HEIGHTS.length >= 90 && HEIGHTS.every(x => x.t && x.v > 0 && x.e), `Measure Up heights look right (${HEIGHTS.length})`);
  ok(new Set(HEIGHTS.map(x => x.t)).size === HEIGHTS.length, 'no duplicate heights');
}

// More or Less: answering, revealing, lives
{
  let s = ML.create({ seed: 'a', players: players(2), lives: 3, time: 15000 });
  ok(s.items.length >= 60 && s.idx === 1, 'a chain of topics is picked up front');
  ok(s.items.every((x, i) => i === 0 || x.c !== s.items[i - 1].c), 'neighbors come from different categories');
  ok(!ML.legal(s, { answer: 'more', round: 1, at: 0 }, 0), 'no answers before the start');
  s = ML.apply(s, { start: true, at: 0 }, 0);
  const t = s.askedAt + 100;
  ok(!ML.legal(s, { answer: 'up', round: 1, at: t }, 0), 'only more or less');
  ok(!ML.legal(s, { reveal: true, round: 1, at: t }, -1), 'no reveal while people are thinking');
  const { a, b } = ML.current(s), truth = b.v > a.v ? 'more' : 'less', wrong = truth === 'more' ? 'less' : 'more';
  s = ML.apply(s, { answer: truth, round: 1, at: t }, 0);
  ok(!ML.legal(s, { answer: wrong, round: 1, at: t }, 0), 'one answer each');
  ok(ML.canAct(s, 1) && !ML.canAct(s, 0), 'the other player can still answer');
  s = ML.apply(s, { answer: wrong, round: 1, at: t + 50 }, 1);
  ok(ML.legal(s, { reveal: true, round: 1, at: t + 60 }, -1), 'reveal once everyone is in');
  s = ML.apply(s, { reveal: true, round: 1, at: t + 60 }, -1);
  ok(s.phase === 'reveal' && s.results.picks[0].ok && !s.results.picks[1].ok, 'right and wrong are scored');
  ok(s.players[0].lives === 3 && s.players[1].lives === 2 && s.players[0].right === 1, 'a wrong answer costs a life');
  ok(!ML.legal(s, { next: true, round: 1, at: t + 100 }, -1) && ML.legal(s, { next: true, round: 1, at: s.revealUntil }, -1), 'next only after the reveal');
  s = ML.apply(s, { next: true, round: 1, at: s.revealUntil }, -1);
  ok(s.round === 2 && s.idx === 2 && s.phase === 'ask' && !Object.keys(s.answers).length, 'the next topic comes up');
  // Time runs out: nobody answered, both lose a life.
  ok(!ML.legal(s, { reveal: true, round: 2, at: s.deadline - 1 }, -1) && ML.legal(s, { reveal: true, round: 2, at: s.deadline }, -1), 'reveal when time is up');
  s = ML.apply(s, { reveal: true, round: 2, at: s.deadline }, -1);
  ok(s.players[0].lives === 2 && s.players[1].lives === 1, 'no answer costs a life');
  ok(!ML.legal(s, { answer: 'more', round: 2, at: s.deadline }, 0), 'no answering after the reveal');
}
// Last one standing, and going out together
function playOut(nPlayers, chooser, seed) {
  let s = ML.create({ seed, players: players(nPlayers), lives: 3, time: 10000 });
  s = ML.apply(s, { start: true, at: 0 }, 0);
  let guard = 0;
  while (!ML.over(s) && guard++ < 500) {
    const { a, b } = ML.current(s), truth = b.v >= a.v ? 'more' : 'less';
    for (let p = 0; p < nPlayers; p++) if (ML.canAct(s, p)) { const ans = chooser(p, truth, s); if (ans) s = ML.apply(s, { answer: ans, round: s.round, at: s.askedAt + 10 }, p); }
    s = ML.apply(s, { reveal: true, round: s.round, at: s.deadline }, -1);
    if (!ML.over(s)) s = ML.apply(s, { next: true, round: s.round, at: s.revealUntil }, -1);
  }
  return s;
}
{
  const flip = t => (t === 'more' ? 'less' : 'more');
  const s = playOut(2, (p, truth, st) => (p === 0 ? truth : (st.round % 2 ? flip(truth) : truth)), 'x');
  ok(s.winner === 0 && s.players[1].out && !s.players[0].out, 'the player who lasts longer wins');
  const both = playOut(2, (p, truth) => flip(truth), 'y');
  ok(both.winner === 'draw' && both.round === 3, 'going out together with the same score is a tie');
  const solo = playOut(1, (p, truth, st) => (st.round <= 5 ? truth : flip(truth)), 'z');
  ok(solo.winner === 'done' && solo.players[0].right >= 5, 'alone, the game ends when your lives run out');
  for (let g = 0; g < 50; g++) {
    const r = playOut(2 + (g % 6), () => (Math.random() < 0.7 ? 'more' : 'less'), 'r' + g);
    if (r.winner == null) { ok(false, 'random game did not finish'); break; }
  }
}

// Measure Up
{
  ok(MU.points(10, 10) === 100 && MU.points(30, 10) === 0 && MU.points(10 / 3, 10) === 0, 'points: 100 for spot on, 0 when 3 times off');
  ok(MU.points(11, 10) > 85 && MU.points(15, 10) > 55 && MU.points(15, 10) < 70, 'points fall off smoothly');
  let s = MU.create({ seed: 'm', players: players(3), rounds: 5, time: 25000 });
  ok(s.pairs.length === 5 && s.pairs.every(p => { const r = Math.max(p.ref.v, p.tgt.v) / Math.min(p.ref.v, p.tgt.v); return r >= 1.3 && r <= 12; }), 'pairs are fair comparisons');
  const names = new Set();
  s.pairs.forEach(p => { names.add(p.ref.t); names.add(p.tgt.t); });
  ok(names.size === 10, 'nothing repeats within a game');
  s = MU.apply(s, { start: true, at: 0 }, 0);
  const real = MU.current(s).tgt.v, t = s.askedAt + 10;
  ok(!MU.legal(s, { answer: -1, round: 1, at: t }, 0) && !MU.legal(s, { answer: 'tall', round: 1, at: t }, 0), 'guesses must be heights');
  s = MU.apply(s, { answer: real * 1.05, round: 1, at: t }, 0);
  s = MU.apply(s, { answer: real * 2, round: 1, at: t }, 1);
  s = MU.apply(s, { reveal: true, round: 1, at: s.deadline }, -1);
  const g = s.results.guesses;
  ok(g[0].closest && !g[1].closest && g[2].guess == null, 'the closest guess is marked');
  ok(s.players[0].score === MU.points(real * 1.05, real) + MU.CLOSEST && s.players[2].score === 0, 'closest gets a bonus; no guess, no points');
  for (let r = 1; r < 5; r++) {
    s = MU.apply(s, { next: true, round: s.round, at: s.revealUntil }, -1);
    s = MU.apply(s, { answer: MU.current(s).tgt.v, round: s.round, at: s.askedAt + 10 }, 1);
    s = MU.apply(s, { reveal: true, round: s.round, at: s.deadline }, -1);
  }
  ok(MU.over(s) && s.winner === 1, 'most points after the last round wins');
  ok(!MU.legal(s, { next: true, round: s.round, at: s.revealUntil + 99 }, -1), 'nothing after the end');
  // Solo
  let solo = MU.create({ seed: 's', rounds: 3 });
  solo = MU.apply(solo, { start: true, at: 0 }, 0);
  for (let r = 0; r < 3; r++) {
    solo = MU.apply(solo, { answer: MU.current(solo).tgt.v * 1.2, round: solo.round, at: solo.askedAt + 1 }, 0);
    ok(MU.legal(solo, { reveal: true, round: solo.round, at: solo.askedAt + 2 }, -1), 'alone, reveal right after you lock in');
    solo = MU.apply(solo, { reveal: true, round: solo.round, at: solo.askedAt + 2 }, -1);
    if (!MU.over(solo)) solo = MU.apply(solo, { next: true, round: solo.round, at: solo.revealUntil }, -1);
  }
  ok(solo.winner === 'done' && solo.players[0].score > 0 && !solo.results.guesses[0].closest, 'solo ends with a score and no closest bonus');
}
console.log(fails ? `${fails} failure(s)` : 'All quiz checks passed');
process.exit(fails ? 1 : 0);
