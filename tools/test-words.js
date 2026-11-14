// Word Duel rule checks: node tools/test-words.js
const W = require('../js/games/words.js');
W.load();
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL', m); } };

ok(W.score('crane', 'crane') === 'ggggg', 'exact');
ok(W.score('abbey', 'babes') === 'yygg.', 'duplicates');
ok(W.score('eerie', 'never') === '.g.yy', 'repeated e');
ok(W.score('code', 'deco') === 'yyyy', '4 letters');
ok(W.score('planet', 'plants') === 'ggggy.', '6 letters: ' + W.score('planet', 'plants'));

for (const L of W.LENGTHS) {
  const s = W.create({ len: L, seed: 'x' + L });
  ok(s.word.length === L && W.isWord(s.word), `${L}-letter answer is a real word (${s.word})`);
  ok(W.create({ len: L, seed: 'x' + L }).word === s.word, `${L}-letter: same seed same word`);
}
const d1 = W.daily('2026-11-14'), d2 = W.daily('2026-11-14'), d3 = W.daily('2026-11-15');
ok(d1.word === d2.word && d1.word !== d3.word && d1.len === 5, 'daily word is the same all day and changes the next day');
ok(W.dailyNumber('2026-01-01') === 1 && W.dailyNumber('2026-11-14') === 318, 'daily numbers');

// Hard mode
{
  const s = W.create({ word: 'crane', hard: true });
  let p = W.progress();
  p = W.advance(s, p, { guess: 'trace' });            // t . r y a g c y e g  -> marks
  ok(/must include|must be/.test(W.check(s, p, { guess: 'blimp' })), 'hard mode blocks a guess that ignores hints');
  ok(W.check(s, p, { guess: 'crane' }) === '', 'hard mode allows a guess that uses the hints');
  const easy = W.create({ word: 'crane' });
  ok(W.check(easy, W.advance(easy, W.progress(), { guess: 'trace' }), { guess: 'blimp' }) === '', 'normal mode allows anything in the list');
}
ok(W.check(W.create({ word: 'crane' }), W.progress(), { guess: 'zzzzq' }) !== '', 'non-word rejected');
ok(/5 letters/.test(W.check(W.create({ word: 'crane' }), W.progress(), { guess: 'cat' })), 'wrong length rejected');

// Results
const solved = (n, t) => ({ guesses: new Array(n).fill('x'), marks: [], done: true, solved: true, time: t });
const missed = () => ({ guesses: new Array(6).fill('x'), marks: [], done: true, solved: false, time: 0 });
const playing = () => ({ guesses: ['x'], marks: [], done: false, solved: false, time: 0 });
const duel = W.create({ word: 'crane' });
ok(W.result(duel, solved(3, 50), solved(4, 10)) === 0, 'duel: fewer guesses wins');
ok(W.result(duel, solved(3, 50), solved(3, 10)) === 1, 'duel: tie goes to the faster solve');
ok(W.result(duel, solved(3, 50), playing()) === null, 'duel: waits for both');
const live = W.create({ word: 'crane', mode: 'live' });
ok(W.result(live, solved(5, 40000), playing()) === 0, 'live: first solve wins right away');
ok(W.result(live, missed(), solved(6, 90000)) === 1, 'live: the only solver wins');
ok(W.result(live, missed(), missed()) === 'draw', 'live: nobody solves, draw');
ok(W.result(live, playing(), playing()) === null, 'live: undecided while both play');
const custom = W.create({ word: 'pizza', mode: 'custom', guesser: 1 });
ok(W.result(custom, null, playing()) === null && W.result(custom, null, solved(4, 1)) === 1 && W.result(custom, null, missed()) === 0, 'custom: guesser wins by solving');

// Links
const code = W.encodeLink({ w: 'pizza', n: 'Sam', h: 'food', m: 6 });
const back = W.decodeLink(code);
ok(back && back.w === 'pizza' && back.n === 'Sam' && back.h === 'food' && !code.includes('pizza'), 'link round-trip, word hidden: ' + code);
ok(W.decodeLink('garbage!!') === null, 'bad links rejected');

console.log(fails ? `${fails} failure(s)` : 'All Word Duel checks passed');
process.exit(fails ? 1 : 0);
