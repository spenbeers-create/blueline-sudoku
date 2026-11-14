/* Crazy Eights for two: match the suit or rank of the top card, eights are wild.
   Can't play? Draw until you can (or the pile runs out, then pass). First to empty
   their hand wins. Cards are two characters: rank (A23456789TJQK) + suit (SHDC). */
(function (root) {
  'use strict';
  const GAMES = root.BLGames || (root.BLGames = {});
  const RANKS = 'A23456789TJQK', SUITS = 'SHDC';
  const SUIT_NAMES = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
  const RANK_NAMES = { A: 'ace', T: '10', J: 'jack', Q: 'queen', K: 'king' };

  function rng(seed) {
    let a = 0;
    for (let i = 0; i < seed.length; i++) a = (Math.imul(a ^ seed.charCodeAt(i), 2654435761) + i) | 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(arr, r) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

  const rank = c => c[0], suit = c => c[1];
  const cardName = c => `${RANK_NAMES[rank(c)] || rank(c)} of ${SUIT_NAMES[suit(c)]}`;
  const top = s => s.discard[s.discard.length - 1];
  const canPlay = (s, c) => rank(c) === '8' || suit(c) === s.suit || rank(c) === rank(top(s));

  function refill(s) {
    if (s.stock.length || s.discard.length <= 1) return;
    const keep = s.discard.pop();
    s.stock = shuffle(s.discard, rng(s.seed + ':' + s.reshuffles++));
    s.discard = [keep];
  }

  const clone = s => JSON.parse(JSON.stringify(s));

  const logic = {
    id: 'eights', name: 'Crazy Eights', category: 'cards', kind: 'turns', local: false,
    blurb: 'Match the suit or number. Eights are wild. Empty your hand first.',
    create(opts = {}) {
      const seed = String(opts.seed || Math.random());
      const r = rng(seed);
      const deck = shuffle(RANKS.split('').flatMap(rk => SUITS.split('').map(st => rk + st)), r);
      const hands = [deck.splice(0, 7), deck.splice(0, 7)];
      let start = deck.shift();
      while (rank(start) === '8') { deck.splice(Math.floor(r() * deck.length), 0, start); start = deck.shift(); }
      return { seed, reshuffles: 0, stock: deck, discard: [start], suit: suit(start), hands, turn: opts.first === 1 ? 1 : 0, drew: 0, log: [], winner: null };
    },
    turn: s => s.turn,
    over: s => s.winner != null,
    winner: s => s.winner,
    canPlay,
    top,
    mustDraw: (s, p) => !s.hands[p].some(c => canPlay(s, c)),
    // Moves: {play: card, suit?} (suit required for an 8), {draw: true}, {pass: true}
    legal(s, m, p) {
      if (s.winner != null || p !== s.turn || !m) return false;
      const hand = s.hands[p];
      if (m.play) {
        if (!hand.includes(m.play) || !canPlay(s, m.play)) return false;
        return rank(m.play) !== '8' || SUITS.includes(m.suit);
      }
      const stuck = !hand.some(c => canPlay(s, c));
      if (m.draw) return stuck && (s.stock.length > 0 || s.discard.length > 1);
      if (m.pass) return stuck && s.stock.length === 0 && s.discard.length <= 1;
      return false;
    },
    apply(s0, m, p) {
      const s = clone(s0);
      const hand = s.hands[p];
      if (m.play) {
        hand.splice(hand.indexOf(m.play), 1);
        s.discard.push(m.play);
        s.suit = rank(m.play) === '8' ? m.suit : suit(m.play);
        s.log.push({ p, play: m.play, suit: rank(m.play) === '8' ? m.suit : undefined });
        s.drew = 0;
        if (!hand.length) s.winner = p;
        else s.turn = 1 - p;
      } else if (m.draw) {
        refill(s);
        hand.push(s.stock.shift());
        s.drew++;
        s.log.push({ p, draw: true });
      } else if (m.pass) {
        s.log.push({ p, pass: true });
        s.drew = 0;
        s.turn = 1 - p;
      }
      if (s.log.length > 30) s.log = s.log.slice(-30);
      return s;
    },
    summary(s, names) {
      if (s.winner != null) return `${names[s.winner]} played their last card.`;
      return `${names[s.turn]} to play`;
    },
    cardName, SUIT_NAMES, rank, suit,
  };

  GAMES.eights = Object.assign(GAMES.eights || {}, logic);
  if (typeof module === 'object' && module.exports) module.exports = logic;
})(typeof self !== 'undefined' ? self : globalThis);
