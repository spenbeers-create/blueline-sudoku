// Crazy Eights house rules, 2-6 players and bots: node tools/test-eights.js
const E = require('../js/games/eights.js');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL', m); } };
const total = s => s.stock.length + s.discard.length + s.hands.reduce((a, h) => a + h.length, 0);
const players = n => Array.from({ length: n }, (_, i) => ({ name: 'P' + i }));
// A fixed position: give hands and a top card directly.
function setup(n, hands, topCard, extra = {}) {
  const s = E.create({ seed: 'fix', players: players(n) });
  const used = new Set(hands.flat().concat(topCard));
  const rest = E.RANKS.split('').flatMap(r => E.SUITS.split('').map(x => r + x)).filter(c => !used.has(c));
  return Object.assign(s, { hands: hands.map(h => h.slice()), discard: [topCard], suit: topCard[1], stock: rest, turn: 0, dir: 1, pending: 0, drew: 0 }, extra);
}

// Dealing
for (const n of [2, 3, 4, 5, 6]) {
  const s = E.create({ seed: 'deal' + n, players: players(n) });
  ok(s.hands.length === n && s.hands.every(h => h.length === (n === 2 ? 7 : 5)), `${n} players: dealt ${n === 2 ? 7 : 5} each`);
  ok(total(s) === 52 && s.players.length === n, `${n} players: 52 cards`);
}
ok(E.create({ seed: 'h', players: players(3), rules: { hand: 7 } }).hands[0].length === 7, 'hand size setting');

// Twos: next player draws 2 or stacks a 2
{
  let s = setup(3, [['2H', 'KS', '3C'], ['2C', '9D', '4S'], ['5D', '6D', '7D']], '4H');
  s = E.apply(s, { play: '2H' }, 0);
  ok(s.pending === 2 && s.turn === 1, 'two: next player owes 2');
  ok(!E.legal(s, { play: '9D' }, 1) && E.legal(s, { play: '2C' }, 1) && E.legal(s, { draw: true }, 1), 'two: only another 2 or drawing');
  s = E.apply(s, { play: '2C' }, 1);
  ok(s.pending === 4 && s.turn === 2, 'two: stacking passes on 4');
  const before = s.hands[2].length;
  s = E.apply(s, { draw: true }, 2);
  ok(s.hands[2].length === before + 4 && s.pending === 0 && s.turn === 0, 'two: drawing takes all 4 and ends the turn');
  ok(total(s) === 52, 'two: 52 cards');
}
// Queens skip
{
  let s = setup(3, [['QH', 'KS'], ['9H', '4S'], ['5H', '6D']], '4H');
  s = E.apply(s, { play: 'QH' }, 0);
  ok(s.turn === 2, 'queen: player 1 is skipped');
  let t = setup(2, [['QH', 'KS'], ['9H', '4S']], '4H');
  t = E.apply(t, { play: 'QH' }, 0);
  ok(t.turn === 0, 'queen with two players: you go again');
}
// Aces reverse
{
  let s = setup(4, [['AH', 'KS'], ['9C', '4S'], ['5C', '6D'], ['7C', '3D']], '4H');
  s = E.apply(s, { play: 'AH' }, 0);
  ok(s.dir === -1 && s.turn === 3, 'ace: direction reverses');
  s = E.apply(s, { play: '7C', }, 3).winner == null ? s : s;
}
// Eights
{
  let s = setup(2, [['8S', 'KD'], ['9C', '4S']], '4H');
  ok(!E.legal(s, { play: '8S' }, 0) && E.legal(s, { play: '8S', suit: 'C' }, 0), 'eight: needs a suit');
  s = E.apply(s, { play: '8S', suit: 'C' }, 0);
  ok(s.suit === 'C' && E.legal(s, { play: '9C' }, 1) && !E.legal(s, { play: '4S' }, 1), 'eight: named suit must be followed');
}
// Drawing: until you can play, or one card then pass
{
  let s = setup(2, [['KS', '3C'], ['9D', '4S']], '4H', {});
  ok(E.legal(s, { draw: true }, 0) && !E.legal(s, { pass: true }, 0), 'draw until: stuck players draw');
  let d = setup(2, [['KS', '3C'], ['9D', '4S']], '4H', { rules: Object.assign({}, E.DEFAULT_RULES, { drawOne: true }) });
  d = E.apply(d, { draw: true }, 0);
  ok(!E.legal(d, { draw: true }, 0) && E.legal(d, { pass: true }, 0), 'draw one: then you may pass');
  d = E.apply(d, { pass: true }, 0);
  ok(d.turn === 1 && d.drew === 0, 'draw one: pass moves on');
}
// Old saved games play with plain rules
{
  const old = { seed: 'o', reshuffles: 0, stock: [], discard: ['4H'], suit: 'H', hands: [['2H', 'KS'], ['9D']], turn: 0, drew: 0, log: [], winner: null };
  const s = E.apply(old, { play: '2H' }, 0);
  ok(!s.pending && s.turn === 1, 'old games: twos are plain cards');
}
// Random full games with every rule, any number of players: always end, 52 cards
for (let g = 0; g < 300; g++) {
  const n = 2 + (g % 5);
  let s = E.create({ seed: 'r' + g, players: players(n), rules: { drawOne: g % 2 === 0 } });
  let steps = 0, bad = false;
  while (!E.over(s) && steps++ < 4000) {
    const moves = E.legalMoves(s);
    if (!moves.length) { ok(false, `no legal moves (game ${g})`); bad = true; break; }
    const m = moves[Math.floor(((g * 7919 + steps * 104729) % 1000) / 1000 * moves.length)];
    s = E.apply(s, m, s.turn);
    if (total(s) !== 52) { ok(false, `card count ${total(s)} (game ${g})`); bad = true; break; }
  }
  if (bad) break;
  if (steps >= 4000) { ok(false, 'game did not end ' + g); break; }
}
// Bots only make legal moves, and better bots win more
function play(levels, seed) {
  let s = E.create({ seed, players: players(levels.length), first: 0 });
  let steps = 0;
  while (!E.over(s) && steps++ < 4000) {
    const m = E.botMove(s, s.turn, levels[s.turn]);
    if (!E.legal(s, m, s.turn)) { ok(false, `bot made an illegal move ${JSON.stringify(m)}`); return -1; }
    s = E.apply(s, m, s.turn);
  }
  return s.winner;
}
{
  let hard = 0, games = 400;
  for (let g = 0; g < games; g++) { const w = play(g % 2 ? [3, 1] : [1, 3], 'b' + g); if (w === (g % 2 ? 0 : 1)) hard++; }
  ok(hard > games * 0.55, `Hard beats Easy more often (${hard}/${games})`);
  let normal = 0;
  for (let g = 0; g < games; g++) { const w = play(g % 2 ? [2, 1] : [1, 2], 'n' + g); if (w === (g % 2 ? 0 : 1)) normal++; }
  ok(normal > games * 0.52, `Normal beats Easy more often (${normal}/${games})`);
  console.log(`  Hard vs Easy ${hard}/${games}, Normal vs Easy ${normal}/${games}`);
  for (let g = 0; g < 50; g++) play([3, 2, 1, 3, 2], 'm' + g);
}
console.log(fails ? `${fails} failure(s)` : 'All Crazy Eights checks passed');
process.exit(fails ? 1 : 0);
