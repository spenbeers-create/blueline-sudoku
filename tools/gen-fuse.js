const fs = require('fs');
const w = require('wordlist-english');
const [dictOut, promptOut] = process.argv.slice(2);
const all = new Set();
for (const k of ['english', 'english/american', 'english/british', 'english/canadian', 'english/australian']) for (const x of (w[k] || [])) if (/^[a-z]{2,}$/.test(x)) all.add(x);
const words = [...all].sort();
fs.writeFileSync(dictOut, words.join('\n') + '\n');
const cnt = new Map();
for (const word of words) {
  const seen = new Set();
  for (const L of [2, 3]) for (let i = 0; i + L <= word.length; i++) seen.add(word.slice(i, i + L));
  for (const s of seen) cnt.set(s, (cnt.get(s) || 0) + 1);
}
const pick = (lo, hi) => [...cnt].filter(([, c]) => c >= lo && c < hi).map(([s]) => s).sort();
const easy = pick(800, Infinity), mid = pick(250, 800), hard = pick(90, 250);
fs.writeFileSync(promptOut, `/* Short Fuse letter combos, generated from the dictionary: how many words contain each. */
(typeof self !== "undefined" ? self : globalThis).FUSE_PROMPTS = {
  easy: '${easy.join(' ')}',
  mid: '${mid.join(' ')}',
  hard: '${hard.join(' ')}',
};
`);
console.log('dictionary', words.length, 'easy', easy.length, 'mid', mid.length, 'hard', hard.length);
