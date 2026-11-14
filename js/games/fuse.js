/* Short Fuse: a lit fuse passes back and forth. On your turn, type any real word
   that contains the letters shown (like "ing") to pass it on. Every round's fuse
   has a secret length; whoever holds it when it burns out loses a life. Words
   can't be reused. Three lives each; last one standing wins.
   Moves carry `at`, the shared clock time, so both phones agree on the fuse. */
(function (root) {
  'use strict';
  const GAMES = root.BLGames || (root.BLGames = {});
  const LIVES = 3, PAUSE = 2200;
  let dict = null, dictP = null, prompts = null;

  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; }
  function lists() {
    if (prompts) return prompts;
    const src = root.FUSE_PROMPTS || (typeof require === 'function' ? (require('./fuse-prompts.js'), root.FUSE_PROMPTS) : null);
    prompts = { easy: src.easy.split(' '), mid: src.mid.split(' '), hard: src.hard.split(' ') };
    return prompts;
  }
  // The first few prompts are easy; later ones mix in harder letter combos.
  function promptFor(seed, n) {
    const p = lists();
    const pool = n < 6 ? p.easy : n < 16 ? p.easy.concat(p.mid) : p.mid.concat(p.hard);
    return pool[hash(seed + ':p' + n) % pool.length];
  }
  const fuseFor = (seed, round) => 9000 + (hash(seed + ':f' + round) % 13000); // 9 to 22 seconds

  const clean = w => String(w || '').toLowerCase().replace(/[^a-z]/g, '');

  const logic = {
    id: 'fuse', name: 'Short Fuse', category: 'words', kind: 'turns', live: true, local: true,
    blurb: 'Type a word with the letters before the fuse burns out. Three lives each.',
    LIVES,
    setDictionary(words) { dict = words instanceof Set ? words : new Set(words); },
    hasDictionary: () => !!dict,
    loadDictionary(url = 'data/dictionary.txt') {
      if (dict) return Promise.resolve();
      if (!dictP) {
        dictP = fetch(url).then(r => { if (!r.ok) throw new Error('dictionary'); return r.text(); })
          .then(t => { dict = new Set(t.split('\n').filter(Boolean)); })
          .catch(e => { dictP = null; throw e; });
      }
      return dictP;
    },
    create(opts = {}) {
      const seed = String(opts.seed || Math.random());
      return { seed, round: 1, n: 0, prompt: promptFor(seed, 0), used: [], lives: [LIVES, LIVES], turn: opts.first === 1 ? 1 : 0,
        started: false, fuseEnd: 0, log: [], winner: null, last: null };
    },
    turn: s => s.turn,
    over: s => s.winner != null,
    winner: s => s.winner,
    // A reason the word won't count, or '' if it's good.
    problem(s, word) {
      const w = clean(word);
      if (w.length < 2) return 'Type a word first.';
      if (!w.includes(s.prompt)) return `It needs the letters ${s.prompt.toUpperCase()} together.`;
      if (s.used.includes(w)) return 'That word was already played.';
      if (!dict) return 'Still loading the dictionary…';
      if (!dict.has(w)) return 'That’s not in the dictionary.';
      return '';
    },
    legal(s, m, p) {
      if (!m || s.winner != null) return false;
      if (m.start) return !s.started;
      if (m.boom) return s.started && m.round === s.round && m.at >= s.fuseEnd;
      if (m.word != null) return s.started && p === s.turn && m.at < s.fuseEnd && !logic.problem(s, m.word);
      return false;
    },
    apply(s0, m, p) {
      const s = JSON.parse(JSON.stringify(s0));
      if (m.start) {
        s.started = true;
        s.fuseEnd = m.at + PAUSE + fuseFor(s.seed, s.round);
        s.roundStart = m.at + PAUSE;
        return s;
      }
      if (m.word != null) {
        const w = clean(m.word);
        s.used.push(w);
        s.log.push({ p, w, k: s.prompt });
        s.last = { p, w, k: s.prompt };
        s.turn = 1 - p;
        s.n++;
        s.prompt = promptFor(s.seed, s.n);
      } else if (m.boom) {
        const loser = s.turn;
        s.lives[loser]--;
        s.log.push({ p: loser, boom: true });
        s.last = { p: loser, boom: true };
        if (s.lives[loser] <= 0) { s.winner = 1 - loser; return s; }
        s.round++;
        s.n++;
        s.prompt = promptFor(s.seed, s.n);
        s.fuseEnd = m.at + PAUSE + fuseFor(s.seed, s.round);
        s.roundStart = m.at + PAUSE;
      }
      if (s.log.length > 40) s.log = s.log.slice(-40);
      if (s.used.length > 400) s.used = s.used.slice(-400);
      return s;
    },
    summary(s, names) {
      if (s.winner != null) return `${names[1 - s.winner]} ran out of lives.`;
      return `${names[s.turn]} has the fuse`;
    },
    promptFor, fuseFor, PAUSE,
  };

  GAMES.fuse = Object.assign(GAMES.fuse || {}, logic);
  if (typeof module === 'object' && module.exports) module.exports = logic;
})(typeof self !== 'undefined' ? self : globalThis);
