// Builds data/words.json for Word Duel: answer and guess lists for 4 to 7 letters.
// Needs the wordlist-english package: npm install wordlist-english
const fs = require('fs');
const path = require('path');
const w = require('wordlist-english');

const all = new Set();
for (const k of ['english', 'english/american', 'english/british', 'english/canadian', 'english/australian']) for (const x of (w[k] || [])) if (/^[a-z]+$/.test(x)) all.add(x);
const common = new Set();
for (const t of [10, 20, 35]) for (const k of ['english', 'english/american']) for (const x of (w[`${k}/${t}`] || [])) if (/^[a-z]+$/.test(x)) common.add(x);

const BLOCK = new Set(('bitch whore pussy penis vagina vagin dildo boobs balls slave nazis nazi rapes raped rapist rape sluts slut porno pimps homos bimbo semen sperm horny butts boner niger nigga negro negroes dykes dyke fags fuck fucks fucked fucker shits shit twats twat wanks wank cunts cunt arses arse asses hoes hooker hookers bastard bastards whores sexual erotic orgasm penises vaginas rapists killer killers murder murders suicide genocide incest cock cocks booby boobies dick dicks tits titty crap pimp pimped').split(' '));

const out = {};
for (const len of [4, 5, 6, 7]) {
  const answers = [...common].filter(x => {
    if (x.length !== len || BLOCK.has(x)) return false;
    if (x.endsWith('s') && !x.endsWith('ss') && all.has(x.slice(0, -1))) return false;
    if (x.endsWith('es') && all.has(x.slice(0, -2))) return false;
    if (x.endsWith('ed') && (all.has(x.slice(0, -2)) || all.has(x.slice(0, -1)))) return false;
    if (x.endsWith('ing') && (all.has(x.slice(0, -3)) || all.has(x.slice(0, -3) + 'e'))) return false;
    if (x.endsWith('er') && len >= 6 && all.has(x.slice(0, -2))) return false;
    if (x.endsWith('ly') && len >= 6 && all.has(x.slice(0, -2))) return false;
    const dbl = (n) => x.length > n + 1 && x[x.length - n - 1] === x[x.length - n - 2];
    if (/(ies|ied|ier)$/.test(x) && all.has(x.slice(0, -3) + 'y')) return false;
    if (x.endsWith('iest') && all.has(x.slice(0, -4) + 'y')) return false;
    if (x.endsWith('est') && len >= 6 && (all.has(x.slice(0, -3)) || all.has(x.slice(0, -2)))) return false;
    if (x.endsWith('ed') && dbl(2) && all.has(x.slice(0, -3))) return false;
    if (x.endsWith('ing') && dbl(3) && all.has(x.slice(0, -4))) return false;
    if (x.endsWith('er') && dbl(2) && all.has(x.slice(0, -3))) return false;
    return true;
  }).sort();
  const allowed = [...all].filter(x => x.length === len).sort();
  out[len] = { answers: answers.join(' '), allowed: allowed.join(' ') };
  console.log(`${len} letters: ${answers.length} answers, ${allowed.length} allowed`);
}
const file = path.join(__dirname, '..', 'data', 'words.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log('wrote', file, fs.statSync(file).size, 'bytes');
