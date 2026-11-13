// Engine checks: node tools/test-engine.js [quick]
const E = require('../js/engine.js');

const quick = process.argv.includes('quick');
let failures = 0;
const fail = msg => { failures++; console.log('  FAIL ' + msg); };

function validSolution(p) {
  const g = E.geometry(p.size, p.variant === 'diagonal');
  for (const u of g.units) {
    const seen = new Set(u.map(c => p.solution[c]));
    if (seen.size !== g.N) return false;
  }
  if (p.cages) {
    const covered = new Set();
    for (const cg of p.cages) {
      const ds = cg.cells.map(c => p.solution[c]);
      if (new Set(ds).size !== ds.length) return false;
      if (ds.reduce((a, b) => a + b, 0) !== cg.sum) return false;
      cg.cells.forEach(c => covered.add(c));
    }
    if (covered.size !== 81) return false;
  }
  return true;
}

// Logic hints must always point at the true digit.
function checkHints(p) {
  const vals = p.givens.slice();
  let steps = 0;
  while (vals.some(v => !v) && steps++ < 400) {
    const h = E.hint(p, vals);
    if (!h) { fail(`${p.code}: no hint on unsolved board`); return; }
    const { cell, digit } = h.step;
    if (p.solution[cell] !== digit) { fail(`${p.code}: hint ${h.step.tech} put ${digit} at ${cell}, answer is ${p.solution[cell]}`); return; }
    for (const s of h.chain) for (const [c, m] of s.elims) if (m & (1 << (p.solution[c] - 1))) { fail(`${p.code}: ${s.tech} removed the true digit at ${c}`); return; }
    vals[cell] = digit;
  }
}

const sizes = quick ? [9] : [9, 12, 16];
const combos = [];
for (const variant of ['classic', 'diagonal']) for (const size of sizes) for (const difficulty of E.LEVELS) combos.push({ variant, size, difficulty });
for (const difficulty of E.LEVELS) combos.push({ variant: 'killer', size: 9, difficulty });

console.log('variant   size level     clues tier score   ms   code');
for (const o of combos) {
  const reps = o.size === 9 ? (quick ? 1 : 3) : 1;
  for (let i = 0; i < reps; i++) {
    const t0 = Date.now();
    const p = E.generate(Object.assign({}, o, { seed: 'T' + i + 'X' + o.difficulty.slice(0, 2).toUpperCase() }));
    const ms = Date.now() - t0;
    const r = p.rating || {};
    console.log(`${o.variant.padEnd(9)} ${String(o.size).padEnd(4)} ${o.difficulty.padEnd(9)} ${String(p.clues).padStart(5)} ${String(r.tier ?? '-').padStart(4)} ${String(r.score ?? '-').padStart(5)} ${String(ms).padStart(6)}   ${p.code}`);
    if (!validSolution(p)) fail(`${p.code}: solution breaks a rule`);
    if (p.givens.some((v, c) => v && v !== p.solution[c])) fail(`${p.code}: a given disagrees with the solution`);
    const model = E.makeModel(p);
    const u = E.solve(model, p.givens, { limit: 2, cap: 2e6 });
    if (u.aborted) fail(`${p.code}: uniqueness check ran out of budget`);
    else if (u.count !== 1) fail(`${p.code}: ${u.count} solutions`);
    if (o.size === 9 && i === 0) checkHints(p);
    if (i === 0) {
      const again = E.generate(Object.assign({}, o, { seed: p.seed }));
      if (again.givens.join() !== p.givens.join()) fail(`${p.code}: same code gave a different puzzle`);
      const parsed = E.parseCode(p.code);
      if (!parsed || parsed.seed !== p.seed || parsed.size !== p.size || parsed.variant !== p.variant || parsed.difficulty !== p.difficulty) fail(`${p.code}: code does not round-trip`);
    }
  }
}
console.log(failures ? `\n${failures} failure(s)` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
