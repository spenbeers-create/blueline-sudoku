/* Crazy Eights for 2 to 6: match the suit or rank of the top card, eights are wild
   and name the next suit. First to empty their hand wins.
   House rules (rules): twos make the next player draw 2 (they can stack another 2
   to pass it on), queens skip the next player, aces reverse the direction (with two
   players an ace works like a skip), and drawing is either "until you can play" or
   "one card, then you may pass". Cards are two characters: rank (A23456789TJQK) +
   suit (SHDC). Games saved before house rules existed play with none. */
(function (root) {
  'use strict';
  const GAMES = root.BLGames || (root.BLGames = {});
  const RANKS = 'A23456789TJQK', SUITS = 'SHDC';
  const SUIT_NAMES = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
  const RANK_NAMES = { A: 'ace', T: '10', J: 'jack', Q: 'queen', K: 'king' };
  const DEFAULT_RULES = { twos: true, skip: true, reverse: true, drawOne: false, hand: 0 };
  const NO_RULES = { twos: false, skip: false, reverse: false, drawOne: false, hand: 0 };

  function rng(seed) {
    let a = 0;
    for (let i = 0; i < seed.length; i++) a = (Math.imul(a ^ seed.charCodeAt(i), 2654435761) + i) | 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(arr, r) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

  const rank = c => c[0], suit = c => c[1];
  const cardName = c => `${RANK_NAMES[rank(c)] || rank(c)} of ${SUIT_NAMES[suit(c)]}`;
  const top = s => s.discard[s.discard.length - 1];
  const rules = s => s.rules || NO_RULES;
  const canPlay = (s, c) => rank(c) === '8' || suit(c) === s.suit || rank(c) === rank(top(s));
  const canDraw = s => s.stock.length > 0 || s.discard.length > 1;
  const next = (s, p, k = 1) => { const n = s.hands.length, d = s.dir || 1; return (((p + d * k) % n) + n) % n; };

  function refill(s) {
    if (s.stock.length || s.discard.length <= 1) return;
    const keep = s.discard.pop();
    s.stock = shuffle(s.discard, rng(s.seed + ':' + s.reshuffles++));
    s.discard = [keep];
  }
  function logIt(s, e) { s.log.push(e); s.ev = (s.ev || 0) + 1; if (s.log.length > 30) s.log = s.log.slice(-30); }
  const clone = s => JSON.parse(JSON.stringify(s));

  const logic = {
    id: 'eights', name: 'Crazy Eights', category: 'cards', kind: 'turns', local: false,
    blurb: 'Match the suit or number. Eights are wild. Empty your hand first.',
    DEFAULT_RULES, RANKS, SUITS,
    // opts: players [{name, bot?}] or a count, seed, first, rules
    create(opts = {}) {
      const seed = String(opts.seed || Math.random());
      const r = rng(seed);
      const list = Array.isArray(opts.players) ? opts.players : Array.from({ length: Math.max(2, +opts.players || 2) }, (_, i) => ({ name: `Player ${i + 1}` }));
      const n = Math.min(6, Math.max(2, list.length));
      const rl = Object.assign({}, opts.rules === false ? NO_RULES : DEFAULT_RULES, opts.rules || {});
      const size = +rl.hand || (n === 2 ? 7 : 5);
      const deck = shuffle(RANKS.split('').flatMap(rk => SUITS.split('').map(st => rk + st)), r);
      const hands = Array.from({ length: n }, () => deck.splice(0, size));
      let start = deck.shift();
      while (rank(start) === '8') { deck.splice(Math.floor(r() * deck.length), 0, start); start = deck.shift(); }
      return {
        seed, reshuffles: 0, stock: deck, discard: [start], suit: suit(start), hands,
        players: list.slice(0, n).map(p => ({ name: String(p.name || 'Player').slice(0, 20), bot: p.bot || 0 })),
        turn: Math.min(n - 1, Math.max(0, +opts.first || 0)), dir: 1, drew: 0, pending: 0, rules: rl, log: [], ev: 0, winner: null,
      };
    },
    turn: s => s.turn,
    over: s => s.winner != null,
    winner: s => s.winner,
    canPlay, top, rules, next,
    mustDraw: (s, p) => !s.hands[p].some(c => canPlay(s, c)),
    // Moves: {play: card, suit?} (suit required for an 8), {draw: true}, {pass: true}
    legal(s, m, p) {
      if (s.winner != null || p !== s.turn || !m) return false;
      const hand = s.hands[p], rl = rules(s);
      if (s.pending > 0) {
        if (m.play) return hand.includes(m.play) && rank(m.play) === '2';
        return !!m.draw;                                  // take the penalty
      }
      if (m.play) {
        if (!hand.includes(m.play) || !canPlay(s, m.play)) return false;
        return rank(m.play) !== '8' || SUITS.includes(m.suit);
      }
      const stuck = !hand.some(c => canPlay(s, c));
      if (m.draw) return stuck && canDraw(s) && (!rl.drawOne || s.drew === 0);
      if (m.pass) return (rl.drawOne && s.drew > 0) || (stuck && !canDraw(s));
      return false;
    },
    apply(s0, m, p) {
      const s = clone(s0), rl = rules(s), hand = s.hands[p];
      if (m.play) {
        hand.splice(hand.indexOf(m.play), 1);
        s.discard.push(m.play);
        const eight = rank(m.play) === '8';
        s.suit = eight ? m.suit : suit(m.play);
        s.drew = 0;
        const e = { p, play: m.play };
        if (eight) e.suit = m.suit;
        if (!hand.length) { s.winner = p; logIt(s, e); return s; }
        let step = 1;
        const rk = rank(m.play);
        if (rk === '2' && rl.twos) { s.pending = (s.pending || 0) + 2; e.fx = 'draw'; e.n = s.pending; }
        else if (rk === 'Q' && rl.skip) { step = 2; e.fx = 'skip'; e.who = next(s, p, 1); }
        else if (rk === 'A' && rl.reverse) {
          if (s.hands.length === 2) { step = 2; e.fx = 'skip'; e.who = next(s, p, 1); }
          else { s.dir = -(s.dir || 1); e.fx = 'reverse'; }
        }
        s.turn = next(s, p, step);
        logIt(s, e);
      } else if (m.draw) {
        if (s.pending > 0) {
          let got = 0;
          for (let k = 0; k < s.pending; k++) { refill(s); if (!s.stock.length) break; hand.push(s.stock.shift()); got++; }
          logIt(s, { p, draw: got, penalty: true });
          s.pending = 0; s.drew = 0;
          s.turn = next(s, p, 1);
        } else {
          refill(s);
          hand.push(s.stock.shift());
          s.drew++;
          logIt(s, { p, draw: 1, on: s.suit });
        }
      } else if (m.pass) {
        logIt(s, { p, pass: true, on: s.suit });
        s.drew = 0;
        s.turn = next(s, p, 1);
      }
      return s;
    },
    legalMoves(s) {
      const p = s.turn, out = [];
      if (s.winner != null) return out;
      for (const c of s.hands[p]) {
        if (rank(c) === '8') { for (const st of SUITS) if (logic.legal(s, { play: c, suit: st }, p)) out.push({ play: c, suit: st }); }
        else if (logic.legal(s, { play: c }, p)) out.push({ play: c });
      }
      if (logic.legal(s, { draw: true }, p)) out.push({ draw: true });
      if (logic.legal(s, { pass: true }, p)) out.push({ pass: true });
      return out;
    },

    // A move for a bot. Easy plays anything that fits. Normal keeps its eights and
    // follows its longest suit. Hard also saves specials for when the next player is
    // close to going out, and steers the suit toward ones opponents have run out of.
    botMove(s, p, level, rand = Math.random) {
      const hand = s.hands[p], rl = rules(s);
      if (s.pending > 0) {
        const two = hand.find(c => rank(c) === '2');
        return two && (level > 1 || rand() < 0.5) ? { play: two } : { draw: true };
      }
      if (rl.drawOne && s.drew > 0 && !hand.some(c => canPlay(s, c))) return { pass: true };
      const playable = hand.filter(c => canPlay(s, c));
      if (!playable.length) return logic.legal(s, { draw: true }, p) ? { draw: true } : { pass: true };
      const counts = { S: 0, H: 0, D: 0, C: 0 };
      for (const c of hand) if (rank(c) !== '8') counts[suit(c)]++;
      const longest = () => { let best = SUITS[Math.floor(rand() * 4)]; for (const st of SUITS) if (counts[st] > counts[best]) best = st; return best; };
      if (level <= 1) {
        const c = playable[Math.floor(rand() * playable.length)];
        return rank(c) === '8' ? { play: c, suit: SUITS[Math.floor(rand() * 4)] } : { play: c };
      }
      const nxt = next(s, p, 1), nextLeft = s.hands[nxt].length;
      // Suits each opponent has shown they're out of (they drew or passed on them since).
      const weak = {};
      if (level >= 3) {
        for (const e of s.log) {
          if (e.p === p) continue;
          weak[e.p] = weak[e.p] || new Set();
          if ((e.draw && !e.penalty) || e.pass) { if (e.on) weak[e.p].add(e.on); }
          else if (e.play && rank(e.play) !== '8') weak[e.p].delete(suit(e.play));
        }
      }
      const nextWeak = weak[nxt] || new Set();
      let best = null, bestScore = -Infinity;
      const near = level >= 3 && nextLeft <= 2;
      for (const c of playable) {
        const rk = rank(c);
        let sc = rand() * (level >= 3 ? 0.5 : 12);
        // Eights are the only way out of a jam, so save them (Hard saves them harder).
        if (rk === '8') sc += hand.length <= 2 ? 40 : level >= 3 ? -60 : -25;
        else {
          sc += counts[suit(c)] * 3;                                   // follow my longest suit
          if (level >= 3 && nextWeak.has(suit(c))) sc += 12;           // leave them a suit they lack
        }
        if (rk === '2' && rl.twos) sc += 6 + (near ? 30 : 0);
        if (rk === 'Q' && rl.skip) sc += 4 + (near ? 30 : 0);
        if (rk === 'A' && rl.reverse) sc += 2 + (near && s.hands.length === 2 ? 30 : 0);
        if (sc > bestScore) { bestScore = sc; best = c; }
      }
      if (rank(best) !== '8') return { play: best };
      let pick = longest();
      if (level >= 3) {
        let bestSt = -1;
        for (const st of SUITS) { const v = counts[st] + (nextWeak.has(st) ? 2 : 0); if (v > bestSt) { bestSt = v; pick = st; } }
      }
      return { play: best, suit: pick };
    },

    summary(s, names) {
      if (s.winner != null) return `${names[s.winner] || (s.players && s.players[s.winner] && s.players[s.winner].name)} played their last card.`;
      return `${names[s.turn]} to play`;
    },
    cardName, SUIT_NAMES, rank, suit,
  };

  GAMES.eights = Object.assign(GAMES.eights || {}, logic);
  if (typeof module === 'object' && module.exports) module.exports = logic;
})(typeof self !== 'undefined' ? self : globalThis);
