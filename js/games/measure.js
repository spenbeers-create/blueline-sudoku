/* Measure Up: you're shown something with a known height, then guess how tall the
   next thing is. Everyone locks in a guess; the reveal shows every guess next to the
   real height. Points for being close (100 for spot on, nothing if you're off by 3
   times or more) plus 20 for the closest guess. Most points after the last round
   wins. Pairs for the game are picked at the start and kept in the game. */
(function (root) {
  'use strict';
  const GAMES = root.BLGames || (root.BLGames = {});
  const R = GAMES.rounds || (typeof require === 'function' ? require('./rounds.js') : null);
  const DATA = () => root.MEASURE_DATA || (typeof require === 'function' ? require('./measure-data.js') : null);
  const CLOSEST = 20;

  // Pairs where the target is between 1.3 and 12 times taller or shorter than the reference.
  function pickPairs(n, rand) {
    const all = DATA().slice(), used = new Set(), out = [];
    for (let tries = 0; out.length < n && tries < 4000; tries++) {
      const a = all[Math.floor(rand() * all.length)], b = all[Math.floor(rand() * all.length)];
      if (a === b || used.has(a.t) || used.has(b.t)) continue;
      const r = Math.max(a.v, b.v) / Math.min(a.v, b.v);
      if (r < 1.3 || r > 12) continue;
      used.add(a.t); used.add(b.t);
      out.push({ ref: a, tgt: b });
    }
    return out;
  }
  const points = (guess, real) => Math.round(100 * Math.max(0, 1 - Math.abs(Math.log(guess / real)) / Math.log(3)));

  const logic = R.make({
    id: 'measure', name: 'Measure Up', category: 'quiz', time: 25000, revealMs: 6500,
    blurb: 'How tall is it next to the other thing? Closest guess scores the most.',
    setup(s, opts, rand) {
      const rounds = Math.min(20, Math.max(3, +opts.rounds || 10));
      s.players.forEach(p => { p.score = 0; p.closest = 0; });
      return { rounds, pairs: pickPairs(rounds, rand) };
    },
    valid(s, a) {
      const ref = s.pairs[s.round - 1].ref.v;
      return typeof a === 'number' && isFinite(a) && a >= ref / 200 && a <= ref * 200;
    },
    reveal(s) {
      const real = s.pairs[s.round - 1].tgt.v;
      s.results = { real, guesses: {} };
      let bestErr = Infinity;
      s.players.forEach((pl, i) => {
        const g = s.answers[String(i)];
        if (g == null) { s.results.guesses[i] = { guess: null, pts: 0 }; return; }
        const err = Math.abs(Math.log(g / real));
        s.results.guesses[i] = { guess: g, err, pts: points(g, real) };
        bestErr = Math.min(bestErr, err);
      });
      s.players.forEach((pl, i) => {
        const r = s.results.guesses[i];
        if (r.guess != null && s.players.length > 1 && Math.abs(r.err - bestErr) < 1e-9) { r.closest = true; r.pts += CLOSEST; pl.closest++; }
        pl.score += r.pts;
      });
    },
    done: s => (s.round >= s.rounds ? logic.finishNow(s) : null),
    advance: s => s.round < s.rounds,
    finish: s => logic.finishNow(s),
    summary(s, names) {
      if (s.winner === 'done') return `${s.players[0].score} points from ${s.rounds} rounds.`;
      if (s.winner === 'draw') return 'A tie on points.';
      if (s.winner != null) return `${names[s.winner] || s.players[s.winner].name} scored ${s.players[s.winner].score} points.`;
      return `Round ${s.round} of ${s.rounds}`;
    },
    extra: {
      CLOSEST, points, pickPairs,
      finishNow(s) {
        if (s.players.length === 1) return 'done';
        const best = Math.max(...s.players.map(p => p.score)), top = s.players.map((p, i) => i).filter(i => s.players[i].score === best);
        return top.length === 1 ? top[0] : 'draw';
      },
      current: s => s.pairs[s.round - 1],
    },
  });

  GAMES.measure = Object.assign(GAMES.measure || {}, logic);
  if (typeof module === 'object' && module.exports) module.exports = logic;
})(typeof self !== 'undefined' ? self : globalThis);
