/* Short Fuse: a lit fuse passes around the group. On your turn, type any real
   word containing the letters shown (like "ing") to pass it on. Each round's fuse
   has a secret length and keeps burning across turns; whoever holds it when it
   runs out loses a life. Use every bonus letter across your words to earn a life
   back. Last player standing wins (alone, it's a survival run).
   Last Word variant: everyone races to type a word for the same letters at once;
   the last one in (or anyone still empty-handed when time runs out) loses a life.
   Moves carry `at`, the shared clock time, so every phone agrees on the fuse. */
(function (root) {
  'use strict';
  const GAMES = root.BLGames || (root.BLGames = {});
  const PAUSE = 2200;
  const BONUS = 'abcdefghiklmnoprstuvwy';   // every letter except j, q, x, z
  let dict = null, dictArr = null, dictP = null, prompts = null, common = null;

  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; }
  function lists() {
    if (prompts) return prompts;
    const src = root.FUSE_PROMPTS || (typeof require === 'function' ? (require('./fuse-prompts.js'), root.FUSE_PROMPTS) : null);
    prompts = { easy: src.easy.split(' '), mid: src.mid.split(' '), hard: src.hard.split(' ') };
    return prompts;
  }
  // Prompts get harder as a game goes on; the room's difficulty shifts the mix.
  function promptFor(seed, n, difficulty) {
    const p = lists();
    let pool;
    if (difficulty === 'easy') pool = n < 20 ? p.easy : p.easy.concat(p.mid);
    else if (difficulty === 'hard') pool = n < 6 ? p.easy.concat(p.mid) : p.mid.concat(p.hard);
    else pool = n < 6 ? p.easy : n < 16 ? p.easy.concat(p.mid) : p.mid.concat(p.hard);
    return pool[hash(seed + ':p' + n) % pool.length];
  }
  const fuseFor = (seed, round, min) => (min || 9000) + (hash(seed + ':f' + round) % 13000); // min to min+13 s
  const clean = w => String(w || '').toLowerCase().replace(/[^a-z]/g, '');
  const alive = s => s.players.map((p, i) => (p.lives > 0 ? i : -1)).filter(i => i >= 0);
  function nextAlive(s, from) {
    const n = s.players.length;
    for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (s.players[i].lives > 0) return i; }
    return from;
  }

  function logIt(s, e) { s.log.push(e); s.ev = (s.ev || 0) + 1; }
  // Count the word for the end-of-game table, then the bonus letters.
  function addLetters(pl, w, st) {
    pl.words = (pl.words || 0) + 1;
    if (w.length > (pl.best || '').length) pl.best = w;
    const have = new Set(pl.letters.split(''));
    for (const ch of w) if (BONUS.includes(ch)) have.add(ch);
    let bonus = false;
    if (have.size >= BONUS.length) { have.clear(); if (pl.lives < st.maxLives) { pl.lives++; bonus = true; } }
    pl.letters = BONUS.split('').filter(ch => have.has(ch)).join('');
    return bonus;
  }
  function applyLast(s, m, p, st) {
    s.done = s.done || {};
    let losers = null;
    if (m.word != null) {
      const w = clean(m.word);
      s.used.push(w);
      const bonus = addLetters(s.players[p], w, st);
      s.done[p] = { w, at: m.at };
      logIt(s, { p, w, k: s.prompt, bonus });
      s.last = { p, w, k: s.prompt, bonus };
      const left = alive(s), waiting = left.filter(i => !s.done[i]);
      if (left.length > 1 && waiting.length === 1) losers = waiting;      // the last one loses
      if (left.length === 1 && waiting.length === 0) losers = [];          // alone: survived the round
    } else if (m.timeout) {
      losers = alive(s).filter(i => !s.done[i]);
    }
    if (losers) {
      for (const i of losers) {
        s.players[i].lives--;
        if (s.players[i].lives === 0) (s.out = s.out || []).push(i);
        logIt(s, { p: i, boom: true, many: losers.length > 1 });
        s.last = { p: i, boom: true };
      }
      const left = alive(s);
      if (s.players.length === 1 ? left.length === 0 : left.length <= 1) s.winner = s.players.length === 1 ? 'done' : left.length ? left[0] : 'draw';
      else {
        s.round++; s.n++;
        s.prompt = promptFor(s.seed, s.n, st.difficulty);
        s.done = {};
        s.roundStart = m.at + PAUSE;
        s.deadline = s.roundStart + (st.limit || 12000);
      }
    }
    s.lives = s.players.map(x => x.lives);
    if (s.log.length > 40) s.log = s.log.slice(-40);
    return s;
  }

  const logic = {
    id: 'fuse', name: 'Short Fuse', category: 'words', kind: 'turns', live: true, local: true,
    blurb: 'Type a word with the letters before the fuse burns out. Play with friends or bots.',
    LIVES: 3, PAUSE, BONUS,
    setDictionary(words) { dict = words instanceof Set ? words : new Set(words); dictArr = null; },
    setCommon(words) { common = words; },
    hasDictionary: () => !!dict,
    loadDictionary(url = 'data/dictionary.txt') {
      if (dict) return Promise.resolve();
      if (!dictP) {
        dictP = fetch(url).then(r => { if (!r.ok) throw new Error('dictionary'); return r.text(); })
          .then(t => { dict = new Set(t.split('\n').filter(Boolean)); dictArr = null; })
          .catch(e => { dictP = null; throw e; });
      }
      return dictP;
    },
    // opts: players [{name, bot?}] (or a count), seed, first, lives, maxLives, difficulty, minFuse
    create(opts = {}) {
      const seed = String(opts.seed || Math.random());
      const lives = Math.min(5, Math.max(1, +opts.lives || 3));
      const names = Array.isArray(opts.players) ? opts.players : Array.from({ length: opts.players || 2 }, (_, i) => ({ name: `Player ${i + 1}` }));
      const settings = { lives, maxLives: Math.max(lives, Math.min(5, +opts.maxLives || lives)), difficulty: opts.difficulty || 'normal', minFuse: Math.min(15000, Math.max(5000, +opts.minFuse || 9000)), limit: Math.min(20000, Math.max(6000, +opts.limit || 12000)) };
      const first = Math.min(names.length - 1, Math.max(0, +opts.first || 0));
      return {
        seed, settings, variant: opts.variant === 'last' ? 'last' : 'pass', done: {}, deadline: 0,
        round: 1, n: 0, prompt: promptFor(seed, 0, settings.difficulty), used: [],
        players: names.map(p => ({ name: String(p.name || 'Player').slice(0, 20), bot: p.bot || 0, lives, letters: '', words: 0, best: '' })),
        out: [],                         // seats in the order they ran out of lives
        lives: names.map(() => lives),   // kept for older two-player screens
        turn: first, started: false, fuseEnd: 0, roundStart: 0, log: [], winner: null, last: null,
      };
    },
    turn: s => s.turn,
    // Who may play right now: the fuse holder, or (Last Word) anyone still in who hasn't answered.
    canAct: (s, p) => (s.variant === 'last' ? !!(s.players[p] && s.players[p].lives > 0 && !(s.done || {})[p]) : s.turn === p),
    over: s => s.winner != null,
    winner: s => s.winner,
    alive,
    standings(s) {
      const out = (s.out || []).slice().reverse();
      const rest = s.players.map((_, i) => i).filter(i => !out.includes(i)).sort((a, b) => s.players[b].lives - s.players[a].lives);
      return rest.concat(out);
    },
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
      if (s.variant === 'last') {
        if (m.timeout) return s.started && m.round === s.round && m.at >= s.deadline;
        if (m.word != null) return s.started && !!s.players[p] && s.players[p].lives > 0 && !(s.done || {})[p] && m.at >= s.roundStart - 300 && m.at < s.deadline && !logic.problem(s, m.word);
        return false;
      }
      if (m.boom) return s.started && m.round === s.round && m.at >= s.fuseEnd;
      if (m.word != null) return s.started && p === s.turn && m.at < s.fuseEnd && !logic.problem(s, m.word);
      return false;
    },
    apply(s0, m, p) {
      const s = JSON.parse(JSON.stringify(s0));
      const st = s.settings || { lives: 3, maxLives: 3, difficulty: 'normal', minFuse: 9000 };
      if (m.start) {
        s.started = true;
        s.roundStart = m.at + PAUSE;
        s.fuseEnd = s.roundStart + fuseFor(s.seed, s.round, st.minFuse);
        s.deadline = s.roundStart + (st.limit || 12000);
        return s;
      }
      if (s.variant === 'last') return applyLast(s, m, p, st);
      if (m.word != null) {
        const w = clean(m.word);
        s.used.push(w);
        const bonus = addLetters(s.players[p], w, st);
        logIt(s, { p, w, k: s.prompt, bonus });
        s.last = { p, w, k: s.prompt, bonus };
        s.turn = nextAlive(s, p);
        s.n++;
        s.prompt = promptFor(s.seed, s.n, st.difficulty);
      } else if (m.boom) {
        const loser = s.turn;
        s.players[loser].lives--;
        if (s.players[loser].lives === 0) (s.out = s.out || []).push(loser);
        logIt(s, { p: loser, boom: true });
        s.last = { p: loser, boom: true };
        const left = alive(s);
        if (s.players.length === 1 ? left.length === 0 : left.length <= 1) {
          s.winner = s.players.length === 1 ? 'done' : left.length ? left[0] : 'draw';
        } else {
          s.round++;
          s.n++;
          s.prompt = promptFor(s.seed, s.n, st.difficulty);
          s.roundStart = m.at + PAUSE;
          s.fuseEnd = s.roundStart + fuseFor(s.seed, s.round, st.minFuse);
          if (s.players[loser].lives <= 0) s.turn = nextAlive(s, loser);
        }
      }
      s.lives = s.players.map(x => x.lives);
      if (s.log.length > 40) s.log = s.log.slice(-40);
      if (s.used.length > 500) s.used = s.used.slice(-500);
      return s;
    },
    summary(s, names) {
      if (s.winner === 'done') return `Game over. ${s.used.length} word${s.used.length === 1 ? '' : 's'}.`;
      if (s.winner === 'draw') return 'Nobody made it.';
      if (s.winner != null) return `${names[s.winner] || s.players[s.winner].name} is the last one standing.`;
      return `${names[s.turn] || s.players[s.turn].name} has the fuse`;
    },
    // A word for a bot to play: common words first, then the full dictionary.
    botWord(s, rand) {
      const k = s.prompt, used = new Set(s.used);
      const scan = arr => {
        const hits = [], n = arr.length, from = Math.floor(rand() * n);
        for (let i = 0; i < n && hits.length < 300; i++) {
          const w = arr[(from + i) % n];
          if (w.length > k.length && w.length <= 12 && w.includes(k) && !used.has(w)) hits.push(w);
        }
        return hits.length ? hits[Math.floor(rand() * hits.length)] : null;
      };
      if (common) { const w = scan(common); if (w && dict && dict.has(w)) return w; }
      if (!dictArr && dict) dictArr = Array.from(dict);
      return dictArr ? scan(dictArr) : null;
    },
    promptFor, fuseFor, PAUSE_MS: PAUSE,
  };

  GAMES.fuse = Object.assign(GAMES.fuse || {}, logic);
  if (typeof module === 'object' && module.exports) module.exports = logic;
})(typeof self !== 'undefined' ? self : globalThis);
