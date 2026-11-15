/* Rounds: the engine behind the answer-at-once games (More or Less, Measure Up).
   Each round everyone still in locks in an answer; when all have, or time runs out,
   anyone can reveal it, and after a short look at the results anyone can move on.
   Moves carry `at` (the shared clock), so every phone and the TV agree.
     {start, at} · {answer, round, at} · {reveal, round, at} · {next, round, at}
   A game supplies: setup(opts, rand) -> extra state, valid(s, answer), reveal(s) to
   score the round, done(s) -> winner or null, advance(s) to load the next question. */
(function (root) {
  'use strict';
  const GAMES = root.BLGames || (root.BLGames = {});
  const READY = 1500, GRACE = 1500;

  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; }
  function rng(seed) {
    let a = hash(String(seed)) | 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const clone = s => JSON.parse(JSON.stringify(s));
  const inGame = (s, p) => !!s.players[p] && !s.players[p].out;
  const waiting = s => s.players.map((x, i) => i).filter(i => inGame(s, i) && !(String(i) in s.answers));

  function make(def) {
    const logic = {
      id: def.id, name: def.name, category: def.category || 'quiz', kind: 'turns', quiz: true, local: false,
      blurb: def.blurb, READY, rng, hash,
      create(opts = {}) {
        const seed = String(opts.seed || Math.random());
        const list = Array.isArray(opts.players) ? opts.players : [{ name: 'You' }];
        const time = opts.time === 0 ? 0 : Math.min(60000, Math.max(5000, +opts.time || def.time || 15000));
        const s = {
          game: def.id, seed, time, round: 1, phase: 'ask', answers: {}, results: null, started: false,
          askedAt: 0, deadline: 0, revealUntil: 0, winner: null, ev: 0,
          players: list.slice(0, 8).map(p => ({ name: String(p.name || 'Player').slice(0, 20), out: false })),
        };
        Object.assign(s, def.setup(s, opts, rng(seed)));
        return s;
      },
      turn: s => { const w = waiting(s); return w.length ? w[0] : 0; },
      over: s => s.winner != null,
      winner: s => s.winner,
      canAct: (s, p) => s.started && s.phase === 'ask' && s.winner == null && inGame(s, p) && !(String(p) in s.answers),
      waiting,
      inGame,
      legal(s, m, p) {
        if (!m || s.winner != null) return false;
        if (m.start) return !s.started;
        if (!s.started || typeof m.at !== 'number') return false;
        if (m.answer != null) return logic.canAct(s, p) && m.round === s.round && m.at >= s.askedAt - 300 && (!s.time || m.at <= s.deadline + GRACE) && def.valid(s, m.answer);
        if (m.reveal) return s.phase === 'ask' && m.round === s.round && (!waiting(s).length || (!!s.time && m.at >= s.deadline));
        if (m.next) return s.phase === 'reveal' && m.round === s.round && m.at >= s.revealUntil;
        return false;
      },
      apply(s0, m, p) {
        const s = clone(s0);
        s.ev = (s.ev || 0) + 1;
        if (m.start) {
          s.started = true;
          s.askedAt = m.at + READY;
          s.deadline = s.time ? s.askedAt + s.time : 0;
          return s;
        }
        if (m.answer != null) { s.answers[String(p)] = m.answer; return s; }
        if (m.reveal) {
          def.reveal(s);
          s.phase = 'reveal';
          s.revealUntil = m.at + (def.revealMs || 3500);
          const w = def.done(s);
          if (w != null) s.winner = w;
          return s;
        }
        if (m.next) {
          const more = def.advance(s);
          if (!more) { s.winner = def.finish(s); return s; }
          s.round++;
          s.answers = {};
          s.results = null;
          s.phase = 'ask';
          s.askedAt = m.at + 600;
          s.deadline = s.time ? s.askedAt + s.time : 0;
          return s;
        }
        return s;
      },
      summary: (s, names) => def.summary(s, names),
    };
    Object.assign(logic, def.extra || {});
    return logic;
  }

  const api = { make, rng, hash };
  GAMES.rounds = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
