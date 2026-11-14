/* Word Duel: guess a secret word. Green means right letter, right spot; yellow
   means it's in the word somewhere else; grey means it isn't in the word.
   Modes: daily (same word for everyone each day), practice (4 to 7 letters),
   duel (same word, fewer guesses wins), live (same word, first to solve wins)
   and custom (one player picks the word, the other guesses it).
   Word lists load from data/words.json the first time they're needed. */
(function (root) {
  'use strict';
  const GAMES = root.BLGames || (root.BLGames = {});
  const LENGTHS = [4, 5, 6, 7];
  let lists = null, loadP = null;

  function setData(d) {
    lists = {};
    for (const L of Object.keys(d)) {
      const answers = d[L].answers.split(' ');
      const allowed = new Set(d[L].allowed.split(' '));
      answers.forEach(a => allowed.add(a));
      lists[L] = { answers, allowed };
    }
  }
  function load(url = 'data/words.json') {
    if (lists) return Promise.resolve();
    if (typeof window === 'undefined' && typeof require === 'function') {
      setData(JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'data', 'words.json'), 'utf8')));
      return Promise.resolve();
    }
    if (!loadP) {
      loadP = fetch(url).then(r => { if (!r.ok) throw new Error('words'); return r.json(); })
        .then(setData).catch(e => { loadP = null; throw e; });
    }
    return loadP;
  }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; }

  // 'g' right letter right spot, 'y' in the word elsewhere, '.' not in the word.
  function score(answer, guess) {
    const n = answer.length, res = new Array(n).fill('.'), left = {};
    for (let i = 0; i < n; i++) {
      if (guess[i] === answer[i]) res[i] = 'g';
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < n; i++) {
      if (res[i] === 'g') continue;
      if (left[guess[i]]) { res[i] = 'y'; left[guess[i]]--; }
    }
    return res.join('');
  }

  const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];
  // Hard mode: every hint you've been given has to be used in the next guess.
  function hardProblem(prog, guess) {
    for (let r = 0; r < prog.guesses.length; r++) {
      const g = prog.guesses[r], mk = prog.marks[r];
      for (let i = 0; i < g.length; i++) if (mk[i] === 'g' && guess[i] !== g[i]) return `Hard mode: the ${ORD[i]} letter must be ${g[i].toUpperCase()}.`;
      const need = {};
      for (let i = 0; i < g.length; i++) if (mk[i] !== '.') need[g[i]] = (need[g[i]] || 0) + 1;
      for (const [ch, n] of Object.entries(need)) {
        const have = guess.split('').filter(x => x === ch).length;
        if (have < n) return `Hard mode: your guess must include ${ch.toUpperCase()}.`;
      }
    }
    return '';
  }

  const DAY0 = Date.UTC(2026, 0, 1);
  const dailyNumber = key => { const [y, m, d] = key.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - DAY0) / 86400000) + 1; };

  // Shareable puzzle links: lightly scrambled so the word isn't readable in the link.
  const KEY = 'blueline-words';
  function encodeLink(o) {
    const bytes = Array.from(new TextEncoder().encode(JSON.stringify(o)), (b, i) => b ^ KEY.charCodeAt(i % KEY.length));
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeLink(code) {
    try {
      const bin = atob(String(code).replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = Uint8Array.from(bin, (c, i) => c.charCodeAt(0) ^ KEY.charCodeAt(i % KEY.length));
      const o = JSON.parse(new TextDecoder().decode(bytes));
      const w = String(o.w || '').toLowerCase();
      if (!/^[a-z]{4,7}$/.test(w)) return null;
      return { w, n: String(o.n || '').slice(0, 20), h: String(o.h || '').slice(0, 60), m: Math.min(8, Math.max(4, +o.m || 6)) };
    } catch (e) { return null; }
  }

  const len = s => s.len || s.word.length;

  const logic = {
    id: 'words', name: 'Word Duel', category: 'words', kind: 'race', local: true,
    blurb: 'Guess the secret word. Race each other, or make words for friends.',
    LENGTHS, MAX: 6, load, setData, ready: () => !!lists, score, hardProblem, dailyNumber, encodeLink, decodeLink,
    create(opts = {}) {
      const word = opts.word ? String(opts.word).toLowerCase() : null;
      const L = word ? word.length : (LENGTHS.includes(+opts.len) ? +opts.len : 5);
      const seed = String(opts.seed || Math.random());
      let w = word;
      if (!w) { const a = lists[L].answers; w = a[hash(seed) % a.length]; }
      return {
        word: w, len: L, max: Math.min(8, Math.max(4, +opts.max || 6)), seed, hard: !!opts.hard,
        mode: opts.mode || 'duel', by: opts.by || null, hint: opts.hint || '', guesser: opts.guesser != null ? opts.guesser : null,
        daily: opts.daily || null,
      };
    },
    daily(key, hard) { return logic.create({ len: 5, seed: 'daily:' + key, mode: 'daily', daily: key, hard }); },
    progress: () => ({ guesses: [], marks: [], done: false, solved: false, time: 0 }),
    isWord: w => !!(lists && lists[w.length] && lists[w.length].allowed.has(w)),
    check(s, prog, m) {
      if (prog.done) return 'You’re finished with this one.';
      const g = String(m.guess || '').toLowerCase(), L = len(s);
      if (!new RegExp(`^[a-z]{${L}}$`).test(g)) return `Guesses need ${L} letters.`;
      if (!lists) return 'Still loading the word list…';
      if (!logic.isWord(g)) return 'That word isn’t in the word list.';
      if (s.hard) { const why = hardProblem(prog, g); if (why) return why; }
      return '';
    },
    advance(s, prog, m) {
      const g = m.guess.toLowerCase();
      const mark = score(s.word, g);
      const n = { guesses: prog.guesses.concat(g), marks: prog.marks.concat(mark), done: false, solved: mark === 'g'.repeat(len(s)), time: m.time || 0 };
      if (prog.started) n.started = prog.started;
      n.done = n.solved || n.guesses.length >= s.max;
      return n;
    },
    done: prog => !!(prog && prog.done),
    // 0 or 1 = winner, 'draw', or null while it's still undecided.
    result(s, a, b) {
      if (s.mode === 'custom') {
        const p = s.guesser === 0 ? a : b;
        if (!p || !p.done) return null;
        return p.solved ? s.guesser : 1 - s.guesser;
      }
      if (s.mode === 'live') {
        // First to solve wins; the clock only moves forward, so the first solve is final.
        const sa = a && a.solved ? a.time : Infinity, sb = b && b.solved ? b.time : Infinity;
        if (sa === Infinity && sb === Infinity) return a && b && a.done && b.done ? 'draw' : null;
        if (sa === sb) return 'draw';
        return sa < sb ? 0 : 1;
      }
      if (!a || !b || !a.done || !b.done) return null;
      const ga = a.solved ? a.guesses.length : 99, gb = b.solved ? b.guesses.length : 99;
      if (ga !== gb) return ga < gb ? 0 : 1;
      if (ga === 99) return 'draw';
      if (a.time !== b.time) return a.time < b.time ? 0 : 1;
      return 'draw';
    },
  };

  GAMES.words = Object.assign(GAMES.words || {}, logic);
  if (typeof module === 'object' && module.exports) module.exports = logic;
})(typeof self !== 'undefined' ? self : globalThis);
