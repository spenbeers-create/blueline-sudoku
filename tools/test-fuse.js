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
console.log(fails ? `${fails} failure(s)` : 'All Short Fuse checks passed');
process.exit(fails ? 1 : 0);
