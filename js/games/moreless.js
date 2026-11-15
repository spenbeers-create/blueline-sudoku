/* More or Less: one topic shows how many people look it up on Wikipedia each month;
   did the next one get more, or less? Everyone answers at once and has 3 lives.
   Get it wrong (or run out of time) and you lose one. Last one standing wins, and
   if the last players go out together, whoever got more right wins. Alone, it's a
   streak: see how far you get. The topics for a game are picked at the start and
   kept in the game, so every phone sees exactly the same numbers. */
(function (root) {
  'use strict';
  const GAMES = root.BLGames || (root.BLGames = {});
  const R = GAMES.rounds || (typeof require === 'function' ? require('./rounds.js') : null);
  const DATA = () => root.MORELESS_DATA || (typeof require === 'function' ? require('./moreless-data.js') : null);
  const CATS = { food: '🍕', animals: '🐾', places: '🌍', screen: '🎬', games: '🎮', sports: '⚽', music: '🎵', history: '🏛️', space: '🔭', brands: '📱', fun: '🎉' };
  const SEQ = 90;

  // A chain of topics where each is a fair comparison with the one before.
  function pickChain(rand) {
    const all = DATA().items.slice(), out = [];
    let cur = all.splice(Math.floor(rand() * all.length), 1)[0];
    out.push(cur);
    while (out.length < SEQ && all.length) {
      const ok = all.map((x, i) => i).filter(i => {
        const r = Math.max(all[i].v, cur.v) / Math.max(1, Math.min(all[i].v, cur.v));
        return r >= 1.1 && r <= 25 && all[i].c !== cur.c;
      });
      const pool = ok.length ? ok : all.map((x, i) => i);
      cur = all.splice(pool[Math.floor(rand() * pool.length)], 1)[0];
      out.push(cur);
    }
    return out.map(x => ({ t: x.t, c: x.c, v: x.v }));
  }

  const logic = R.make({
    id: 'moreless', name: 'More or Less', category: 'quiz', time: 15000, revealMs: 3200,
    blurb: 'Higher or lower: did more people look up this one? Three lives each.',
    setup(s, opts, rand) {
      const lives = Math.min(5, Math.max(1, +opts.lives || 3));
      s.players.forEach(p => { p.lives = lives; p.right = 0; p.best = 0; p.run = 0; });
      return { lives, items: pickChain(rand), idx: 1, from: DATA().from, to: DATA().to };
    },
    valid: (s, a) => a === 'more' || a === 'less',
    reveal(s) {
      const a = s.items[s.idx - 1], b = s.items[s.idx];
      const truth = b.v > a.v ? 'more' : b.v < a.v ? 'less' : 'either';
      s.results = { truth, picks: {} };
      s.players.forEach((pl, i) => {
        if (pl.out) return;
        const pick = s.answers[String(i)] || null, ok = !!pick && (truth === 'either' || pick === truth);
        s.results.picks[i] = { pick, ok };
        if (ok) { pl.right++; pl.run++; pl.best = Math.max(pl.best, pl.run); }
        else { pl.lives--; pl.run = 0; }
      });
      // Everyone who hit zero this round goes out together.
      s.results.outNow = [];
      s.players.forEach((pl, i) => { if (!pl.out && pl.lives <= 0) { pl.out = true; s.results.outNow.push(i); } });
    },
    done(s) {
      const left = s.players.map((p, i) => i).filter(i => !s.players[i].out);
      if (s.players.length === 1) return left.length ? null : 'done';
      if (left.length > 1) return null;
      if (left.length === 1) return left[0];
      // The last players went out together: most right answers wins.
      const last = s.results.outNow, best = Math.max(...last.map(i => s.players[i].right));
      const top = last.filter(i => s.players[i].right === best);
      return top.length === 1 ? top[0] : 'draw';
    },
    advance(s) { if (s.idx + 1 >= s.items.length) return false; s.idx++; return true; },
    finish(s) {
      if (s.players.length === 1) return 'done';
      const left = s.players.map((p, i) => i).filter(i => !s.players[i].out);
      const score = i => s.players[i].lives * 1000 + s.players[i].right;
      const best = Math.max(...left.map(score)), top = left.filter(i => score(i) === best);
      return top.length === 1 ? top[0] : 'draw';
    },
    summary(s, names) {
      if (s.winner === 'done') return `${s.players[0].right} right in all, best streak ${s.players[0].best}.`;
      if (s.winner === 'draw') return 'Nobody outlasted the rest.';
      if (s.winner != null) return `${names[s.winner] || s.players[s.winner].name} lasted the longest with ${s.players[s.winner].right} right.`;
      return `Round ${s.round}`;
    },
    extra: { CATS, pickChain, current: s => ({ a: s.items[s.idx - 1], b: s.items[s.idx] }) },
  });

  GAMES.moreless = Object.assign(GAMES.moreless || {}, logic);
  if (typeof module === 'object' && module.exports) module.exports = logic;
})(typeof self !== 'undefined' ? self : globalThis);
