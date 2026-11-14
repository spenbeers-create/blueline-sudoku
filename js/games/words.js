/* Word Duel: you both get the same secret five-letter word and six guesses.
   Fewer guesses wins; on a tie the faster solve wins. Each player's board is
   their own "progress"; the shared state only holds the word. */
(function (root) {
  'use strict';
  const GAMES = root.BLGames || (root.BLGames = {});
  let lists = null;
  function data() {
    if (lists) return lists;
    const src = root.WORDS5 || (typeof require === 'function' ? (require('./words-data.js'), root.WORDS5) : null);
    lists = { answers: src.answers.split(' '), allowed: new Set(src.allowed.split(' ')) };
    for (const a of lists.answers) lists.allowed.add(a);
    return lists;
  }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; }

  // 'g' right letter right spot, 'y' in the word elsewhere, '.' not in the word.
  function score(answer, guess) {
    const res = ['.', '.', '.', '.', '.'], left = {};
    for (let i = 0; i < 5; i++) {
      if (guess[i] === answer[i]) res[i] = 'g';
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < 5; i++) {
      if (res[i] === 'g') continue;
      if (left[guess[i]]) { res[i] = 'y'; left[guess[i]]--; }
    }
    return res.join('');
  }

  const MAX = 6;
  const logic = {
    id: 'words', name: 'Word Duel', category: 'words', kind: 'race', local: true,
    blurb: 'Same secret word for both of you. Fewer guesses wins.',
    create(opts = {}) {
      const { answers } = data();
      const seed = String(opts.seed || Math.random());
      return { word: answers[hash(seed) % answers.length], max: MAX, seed };
    },
    progress: () => ({ guesses: [], marks: [], done: false, solved: false, time: 0 }),
    isWord: w => data().allowed.has(w),
    // move: {guess: 'crane', time: ms}
    check(s, prog, m) {
      if (prog.done) return 'You’re finished with this one.';
      const g = String(m.guess || '').toLowerCase();
      if (!/^[a-z]{5}$/.test(g)) return 'Guesses need 5 letters.';
      if (!data().allowed.has(g)) return 'That word isn’t in the word list.';
      return '';
    },
    advance(s, prog, m) {
      const g = m.guess.toLowerCase();
      const mark = score(s.word, g);
      const n = { guesses: prog.guesses.concat(g), marks: prog.marks.concat(mark), done: false, solved: mark === 'ggggg', time: m.time || 0 };
      n.done = n.solved || n.guesses.length >= s.max;
      return n;
    },
    done: prog => !!prog.done,
    // 0 or 1 = winner, 'draw', or null while someone is still playing.
    result(s, a, b) {
      if (!a.done || !b.done) return null;
      const sa = a.solved ? a.guesses.length : 99, sb = b.solved ? b.guesses.length : 99;
      if (sa !== sb) return sa < sb ? 0 : 1;
      if (sa === 99) return 'draw';
      if (a.time !== b.time) return a.time < b.time ? 0 : 1;
      return 'draw';
    },
    score,
    MAX,
  };

  GAMES.words = Object.assign(GAMES.words || {}, logic);
  if (typeof module === 'object' && module.exports) module.exports = logic;
})(typeof self !== 'undefined' ? self : globalThis);
