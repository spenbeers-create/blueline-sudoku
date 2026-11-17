// Short Fuse rule checks: node tools/test-fuse.js
const fs = require('fs');
const path = require('path');
const fuse = require('../js/games/fuse.js');
const words = fs.readFileSync(path.join(__dirname, '..', 'data', 'dictionary.txt'), 'utf8').split('\n').filter(Boolean);
fuse.setDictionary(words);
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL', m); } };

let s = fuse.create({ seed: 'abc' });
ok(!fuse.legal(s, { word: 'sing', at: 0 }, 0), 'no words before start');
s = fuse.apply(s, { start: true, at: 1000 }, 0);
ok(s.started && s.fuseEnd > 1000 + fuse.PAUSE + 8999 && s.fuseEnd <= 1000 + fuse.PAUSE + 22000, 'fuse length 9-22s');
const find = (st) => words.find(w => w.includes(st.prompt) && !st.used.includes(w));
const w1 = find(s);
ok(fuse.legal(s, { word: w1, at: 2000 }, 0), 'valid word accepted: ' + w1 + ' for ' + s.prompt);
ok(!fuse.legal(s, { word: w1, at: 2000 }, 1), 'wrong player rejected');
ok(fuse.problem(s, 'zzzz' + s.prompt) !== '', 'non-word rejected');
ok(/letters/.test(fuse.problem(s, 'cat'.includes(s.prompt) ? 'dog' : 'cat')), 'missing letters rejected');
const p0 = s.prompt;
s = fuse.apply(s, { word: w1, at: 2000 }, 0);
ok(s.turn === 1 && s.used.includes(w1), 'turn passes');
ok(fuse.problem(Object.assign({}, s, { prompt: p0 }), w1).includes('already'), 'reused word rejected');
ok(!fuse.legal(s, { boom: true, round: 1, at: s.fuseEnd - 1 }, 0), 'no early boom');
ok(fuse.legal(s, { boom: true, round: 1, at: s.fuseEnd }, 0), 'boom when fuse ends (either player can report it)');
ok(!fuse.legal(s, { word: find(s), at: s.fuseEnd + 5 }, 1), 'late word rejected');
const holder = s.turn;
s = fuse.apply(s, { boom: true, round: 1, at: s.fuseEnd }, 0);
ok(s.lives[holder] === fuse.LIVES - 1 && s.round === 2 && s.turn === holder, 'holder loses a life and starts the next round');
ok(!fuse.legal(s, { boom: true, round: 1, at: s.fuseEnd + 99999 }, 0), 'stale boom for old round rejected');
// play out: always boom on player 1
let g = fuse.create({ seed: 'x' });
g = fuse.apply(g, { start: true, at: 0 }, 0);
let guard = 0;
while (!fuse.over(g) && guard++ < 100) {
  if (g.turn === 0) g = fuse.apply(g, { word: find(g), at: g.fuseEnd - 100 }, 0);
  else g = fuse.apply(g, { boom: true, round: g.round, at: g.fuseEnd }, 1);
}
ok(fuse.over(g) && g.winner === 0 && g.lives[1] === 0, 'game ends when lives run out');
// every prompt in the lists has plenty of words
const P = global.FUSE_PROMPTS;
const thin = P.easy.split(' ').concat(P.mid.split(' ')).filter(p => words.filter(w => w.includes(p)).length < 200);
ok(thin.length === 0, 'thin prompts: ' + thin.slice(0, 5).join(','));

// Groups: turn order skips players who are out.
{
  let g = fuse.create({ seed: 'grp', players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], lives: 1, longLife: false });
  g = fuse.apply(g, { start: true, at: 0 }, 0);
  ok(g.turn === 0, 'group starts with the first player');
  g = fuse.apply(g, { word: find(g), at: 3000 }, 0);
  ok(g.turn === 1, 'fuse passes to the next player');
  g = fuse.apply(g, { boom: true, round: g.round, at: g.fuseEnd }, 2);
  ok(g.players[1].lives === 0 && g.turn === 2 && !fuse.over(g), 'B is out, C takes the fuse');
  g = fuse.apply(g, { word: find(g), at: g.roundStart + 100 }, 2);
  ok(g.turn === 0, 'turn skips B on the way round');
  g = fuse.apply(g, { boom: true, round: g.round, at: g.fuseEnd }, 1);
  ok(fuse.over(g) && g.winner === 2, 'last one standing wins');
}
// Bonus life for using every bonus letter.
{
  let g = fuse.create({ seed: 'bonus', players: [{ name: 'A' }, { name: 'B' }], lives: 2, maxLives: 3 });
  g = fuse.apply(g, { start: true, at: 0 }, 0);
  g.players[0].letters = fuse.BONUS.replace('y', '');
  const w = words.find(x => x.includes(g.prompt) && x.includes('y'));
  g = fuse.apply(g, { word: w, at: 1000 }, 0);
  ok(g.players[0].lives === 3 && g.players[0].letters === '' && g.last.bonus, 'all bonus letters earn a life and reset (' + w + ')');
}
// A word of 6+ letters earns a life, up to 3 (or the starting lives if more); off when turned off.
{
  const pick = (g, long) => words.find(x => x.includes(g.prompt) && !g.used.includes(x) && (long ? x.length >= 6 : x.length <= 5 && x.length > g.prompt.length));
  let g = fuse.create({ seed: 'longw', players: [{ name: 'A' }, { name: 'B' }], lives: 1, maxLives: 3 });
  g = fuse.apply(g, { start: true, at: 0 }, 0);
  const short = pick(g, false);
  if (short) { const h = fuse.apply(g, { word: short, at: 1000 }, 0); ok(h.players[0].lives === 1 && !h.last.bonus, 'a short word earns nothing (' + short + ')'); }
  g = fuse.apply(g, { word: pick(g, true), at: 1000 }, 0);
  ok(g.players[0].lives === 2 && g.last.bonus && g.last.gained === 1, 'a 6+ letter word earns a life (' + g.last.w + ')');
  g = fuse.apply(g, { word: pick(g, true), at: 2000 }, 1);
  g = fuse.apply(g, { word: pick(g, true), at: 3000 }, 0);
  ok(g.players[0].lives === 3, 'another long word: 3 lives');
  g = fuse.apply(g, { word: pick(g, true), at: 4000 }, 1);
  g = fuse.apply(g, { word: pick(g, true), at: 5000 }, 0);
  ok(g.players[0].lives === 3 && !g.last.bonus, 'never more than 3');
  let five = fuse.create({ seed: 'longw5', players: [{ name: 'A' }, { name: 'B' }], lives: 5, maxLives: 5 });
  five = fuse.apply(five, { start: true, at: 0 }, 0);
  five.players[0].lives = 4;
  five = fuse.apply(five, { word: pick(five, true), at: 1000 }, 0);
  ok(five.players[0].lives === 5, 'with 5 starting lives, long words refill up to 5');
  for (const off of [false, 'off']) {
    let o = fuse.create({ seed: 'longoff', players: [{ name: 'A' }, { name: 'B' }], lives: 1, longLife: off });
    o = fuse.apply(o, { start: true, at: 0 }, 0);
    o = fuse.apply(o, { word: pick(o, true), at: 1000 }, 0);
    ok(o.players[0].lives === 1 && !o.last.bonus, 'turned off (' + off + '): long words earn nothing');
  }
  let lw = fuse.create({ seed: 'longlast', variant: 'last', players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], lives: 1 });
  lw = fuse.apply(lw, { start: true, at: 0 }, 0);
  lw = fuse.apply(lw, { word: pick(lw, true), at: lw.roundStart + 100 }, 0);
  ok(lw.players[0].lives === 2, 'Last Word: long words earn a life too');
}
// Solo survival ends when your lives run out.
{
  let g = fuse.create({ seed: 'solo', players: [{ name: 'Me' }], lives: 1, longLife: false });
  g = fuse.apply(g, { start: true, at: 0 }, 0);
  g = fuse.apply(g, { word: find(g), at: 1000 }, 0);
  ok(g.turn === 0 && !fuse.over(g), 'solo: the fuse comes straight back to you');
  g = fuse.apply(g, { boom: true, round: g.round, at: g.fuseEnd }, 0);
  ok(g.winner === 'done', 'solo: game over when lives run out');
}
// Bots find real words that fit.
{
  let r = 1; const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  let g = fuse.create({ seed: 'bot', difficulty: 'hard' });
  let good = 0;
  for (let i = 0; i < 40; i++) {
    g.prompt = fuse.promptFor('bot', i + 20, 'hard');
    const w = fuse.botWord(g, rand);
    if (w && w.includes(g.prompt) && fuse.problem(g, w) === '') good++;
  }
  ok(good >= 38, `bots find words for hard prompts (${good}/40)`);
}

// Last Word: everyone answers at once; the slowest loses a life.
{
  let g = fuse.create({ seed: 'last', variant: 'last', players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], lives: 1, longLife: false });
  g = fuse.apply(g, { start: true, at: 0 }, 0);
  const t = g.roundStart + 500;
  ok(fuse.canAct(g, 0) && fuse.canAct(g, 1) && fuse.canAct(g, 2), 'last word: everyone can answer');
  g = fuse.apply(g, { word: find(g), at: t }, 2);
  ok(!fuse.canAct(g, 2) && fuse.canAct(g, 0), 'last word: answered players wait');
  g = fuse.apply(g, { word: find(g), at: t + 100 }, 0);
  ok(g.players[1].lives === 0 && g.winner === null && g.round === 2, 'last word: the slowest (B) loses a life');
  ok(!fuse.legal(g, { timeout: true, round: 2, at: g.deadline - 1 }, 0) && fuse.legal(g, { timeout: true, round: 2, at: g.deadline }, 0), 'last word: timeout only after the deadline');
  g = fuse.apply(g, { timeout: true, round: 2, at: g.deadline }, 0);
  ok(g.winner === 'draw', 'last word: both remaining players timing out is a draw');
}

// End-of-game table: words, longest word, who went out when, and an event counter
// that keeps counting after the log is trimmed.
{
  let g = fuse.create({ seed: 'table', variant: 'last', players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], lives: 2 });
  g = fuse.apply(g, { start: true, at: 0 }, 0);
  let evs = 0, rounds = 0;
  while (!fuse.over(g) && rounds++ < 10) {
    const t = g.roundStart + 100;
    if (g.players[0].lives > 0) g = fuse.apply(g, { word: find(g), at: t }, 0);
    if (!fuse.over(g) && g.players[2].lives > 0 && fuse.canAct(g, 2)) g = fuse.apply(g, { word: find(g), at: t + 50 }, 2);
    if (!fuse.over(g) && fuse.canAct(g, 1)) g = fuse.apply(g, { timeout: true, round: g.round, at: g.deadline }, 0);
    evs = g.ev;
  }
  ok(fuse.over(g) && g.winner === 0, 'table game: A wins');
  ok(g.players[0].words >= 2 && g.players[0].best.length >= 3, 'words and longest word are counted');
  ok(g.out[0] === 1, 'B went out first');
  const order = fuse.standings(g);
  ok(order[0] === 0 && order[order.length - 1] === 1 && order.length === 3, 'standings: winner first, first out last');
  ok(evs === g.log.length || evs > 0, 'event counter moves');
  let long = fuse.create({ seed: 'long' });
  long = fuse.apply(long, { start: true, at: 0 }, 0);
  for (let i = 0; i < 60; i++) long = fuse.apply(long, { word: find(long), at: long.roundStart + 1 }, long.turn);
  ok(long.log.length === 40 && long.ev === 60, 'log trims to 40 but the counter keeps going');
}
// Nobody gets blown up the moment the fuse reaches them, and typing buys time.
{
  let g = fuse.create({ seed: 'grace', players: [{ name: 'A' }, { name: 'B' }] });
  g = fuse.apply(g, { start: true, at: 0 }, 0);
  const late = g.fuseEnd - 200;
  g = fuse.apply(g, { word: find(g), at: late }, 0);
  ok(g.turn === 1 && g.fuseEnd === late + fuse.GRACE, 'fuse reaching you with 0.2s left gives you the grace period');
  ok(!fuse.legal(g, { boom: true, round: g.round, at: late + 1000 }, 0), 'no boom during the grace period');
  ok(!fuse.legal(g, { typing: true, at: late + 500 }, 0), 'only the holder can hold the fuse');
  ok(fuse.legal(g, { typing: true, at: late + 1000 }, 1), 'the holder typing is allowed');
  g = fuse.apply(g, { typing: true, at: late + 1000 }, 1);
  ok(g.fuseEnd === late + 1000 + fuse.KEEP, 'a letter keeps the fuse lit');
  ok(fuse.legal(g, { typing: true, at: late + 4000 }, 1), 'every letter counts, not just the first');
  g = fuse.apply(g, { typing: true, at: late + 4000 }, 1);
  ok(g.fuseEnd === late + 4000 + fuse.KEEP, 'the next letter keeps it lit again');
  ok(!fuse.legal(g, { boom: true, round: g.round, at: late + 7000 }, 0), 'no boom while they keep typing');
  ok(fuse.legal(g, { word: find(g), at: late + 7200 }, 1), 'they can still send their word');
  // Nobody can stall forever: typing adds at most MAX_HOLD in one turn.
  let t = late + 4000, guard = 0;
  while (fuse.legal(g, { typing: true, at: t + 3000 }, 1) && guard++ < 50) { t += 3000; g = fuse.apply(g, { typing: true, at: t }, 1); }
  ok(guard < 50 && g.held <= fuse.MAX_HOLD && g.held >= fuse.MAX_HOLD - fuse.KEEP, `typing time is capped (${g.held} ms)`);
  ok(fuse.legal(g, { boom: true, round: g.round, at: g.fuseEnd }, 0), 'the fuse blows once the cap is used up');
  // The next player starts fresh.
  g = fuse.apply(g, { word: find(g), at: g.fuseEnd - 10 }, 1);
  ok(fuse.legal(g, { typing: true, at: g.fuseEnd - 100 }, g.turn), 'the cap resets for the next player');
  // A long fuse isn't shortened by any of this.
  let h = fuse.create({ seed: 'grace2', players: [{ name: 'A' }, { name: 'B' }] });
  h = fuse.apply(h, { start: true, at: 0 }, 0);
  const end = h.fuseEnd;
  h = fuse.apply(h, { word: find(h), at: h.roundStart + 100 }, 0);
  h = fuse.apply(h, { typing: true, at: h.roundStart + 200 }, 1);
  ok(h.fuseEnd === end, 'grace and typing never shorten the fuse');
  let lw = fuse.create({ seed: 'g3', variant: 'last', players: [{ name: 'A' }, { name: 'B' }] });
  lw = fuse.apply(lw, { start: true, at: 0 }, 0);
  ok(!fuse.legal(lw, { typing: true, at: lw.roundStart + 10 }, 0), 'no typing hold in Last Word');
}
console.log(fails ? `${fails} failure(s)` : 'All Short Fuse checks passed');
process.exit(fails ? 1 : 0);
