/* Blueline Sudoku engine: board geometry, fast solver, puzzle generator,
   difficulty grader and step-by-step hints. Runs in the page, in a Web
   Worker (importScripts) and in Node (require) for tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SudokuEngine = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const SYMBOLS = '123456789ABCDEFG';
  const BOX = { 4: [2, 2], 6: [2, 3], 9: [3, 3], 12: [3, 4], 16: [4, 4] };
  const POP = new Uint8Array(1 << 16);
  for (let i = 1; i < POP.length; i++) POP[i] = POP[i >> 1] + (i & 1);
  const digitOf = b => 32 - Math.clz32(b);
  const lowDigit = m => digitOf(m & -m);
  const highDigit = m => 32 - Math.clz32(m);
  const range = n => Array.from({ length: n }, (_, i) => i);
  function digitsOf(m) { const out = []; while (m) { const b = m & -m; out.push(digitOf(b)); m ^= b; } return out; }

  // ---------------------------------------------------------------- random
  function hashString(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 ^ h2) >>> 0;
  }
  function makeRng(seed) {
    let a = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed));
    const r = function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = n => Math.floor(r() * n);
    r.shuffle = arr => {
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      return arr;
    };
    return r;
  }
  const SEED_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function randomSeed(len = 5, rnd = Math.random) {
    let s = '';
    for (let i = 0; i < len; i++) s += SEED_ALPHABET[Math.floor(rnd() * SEED_ALPHABET.length)];
    return s;
  }

  // -------------------------------------------------------------- geometry
  const GEO = new Map();
  function geometry(size, diagonal) {
    const key = size + (diagonal ? 'd' : 'c');
    let g = GEO.get(key);
    if (g) return g;
    if (!BOX[size]) throw new Error('Unsupported size ' + size);
    const [br, bc] = BOX[size], N = size, C = N * N, across = N / bc;
    const units = [], kinds = [], nums = [];
    const add = (cells, kind, n) => { units.push(cells); kinds.push(kind); nums.push(n); };
    for (let r = 0; r < N; r++) add(range(N).map(c => r * N + c), 'row', r);
    for (let c = 0; c < N; c++) add(range(N).map(r => r * N + c), 'col', c);
    for (let b = 0; b < N; b++) {
      const r0 = Math.floor(b / across) * br, c0 = (b % across) * bc, cells = [];
      for (let r = 0; r < br; r++) for (let c = 0; c < bc; c++) cells.push((r0 + r) * N + c0 + c);
      add(cells, 'box', b);
    }
    if (diagonal) {
      add(range(N).map(i => i * N + i), 'diag', 0);
      add(range(N).map(i => i * N + (N - 1 - i)), 'diag', 1);
    }
    const unitsOf = range(C).map(() => []);
    units.forEach((u, i) => u.forEach(c => unitsOf[c].push(i)));
    const inUnit = units.map(u => { const a = new Uint8Array(C); u.forEach(c => { a[c] = 1; }); return a; });
    const peers = range(C).map(c => {
      const s = new Set();
      unitsOf[c].forEach(u => units[u].forEach(x => { if (x !== c) s.add(x); }));
      return Int16Array.from([...s].sort((a, b) => a - b));
    });
    const rowOf = range(C).map(c => Math.floor(c / N));
    const colOf = range(C).map(c => c % N);
    const boxOf = range(C).map(c => Math.floor(rowOf[c] / br) * across + Math.floor(colOf[c] / bc));
    const lockPairs = [];
    for (let a = 0; a < units.length; a++) for (let b = 0; b < units.length; b++) {
      if (a === b || (kinds[a] !== 'box' && kinds[b] !== 'box')) continue;
      let n = 0;
      for (const c of units[a]) if (inUnit[b][c]) n++;
      if (n >= 2) lockPairs.push([a, b]);
    }
    g = { N, C, br, bc, across, diagonal: !!diagonal, units, kinds, nums, unitsOf, inUnit, peers,
      rowOf, colOf, boxOf, lockPairs, ALL: (1 << N) - 1, total: N * (N + 1) / 2 };
    GEO.set(key, g);
    return g;
  }

  // A model is the geometry plus variant rules (killer cages add peers).
  function makeModel(p) {
    const g = geometry(p.size, p.variant === 'diagonal');
    const cages = p.variant === 'killer' && p.cages && p.cages.length ? p.cages : null;
    let peers = g.peers, cageOf = null;
    if (cages) {
      cageOf = new Int16Array(g.C).fill(-1);
      cages.forEach((cg, i) => cg.cells.forEach(c => { cageOf[c] = i; }));
      peers = g.peers.map((pe, c) => {
        if (cageOf[c] < 0) return pe;
        const s = new Set(pe);
        cages[cageOf[c]].cells.forEach(x => { if (x !== c) s.add(x); });
        return Int16Array.from(s);
      });
    }
    const isPeer = new Uint8Array(g.C * g.C);
    peers.forEach((pe, c) => pe.forEach(x => { isPeer[c * g.C + x] = 1; }));
    return { geo: g, peers, cages, cageOf, isPeer };
  }

  // Killer combinations: can `k` distinct digits drawn from `mask` sum to `s`? (9x9 only)
  let KT = null;
  function canMake(mask, k, s) {
    if (!KT) {
      KT = new Uint8Array(512 * 10 * 46);
      for (let m = 0; m < 512; m++) {
        for (let sub = m; ; sub = (sub - 1) & m) {
          let sum = 0;
          for (let d = 1; d <= 9; d++) if (sub & (1 << (d - 1))) sum += d;
          KT[(m * 10 + POP[sub]) * 46 + sum] = 1;
          if (sub === 0) break;
        }
      }
    }
    if (s < 0 || s > 45 || k < 0 || k > 9) return false;
    return KT[((mask & 511) * 10 + k) * 46 + s] === 1;
  }

  // ---------------------------------------------------------------- solver
  // State: vals (0 = empty) and cand (bitmask of possible digits, 0 once filled).
  function assign(model, S, c, d, q) {
    if (S.vals[c]) return S.vals[c] === d;
    const bit = 1 << (d - 1);
    if (!(S.cand[c] & bit)) return false;
    S.vals[c] = d; S.cand[c] = 0;
    const pe = model.peers[c];
    for (let i = 0; i < pe.length; i++) {
      const p = pe[i], m = S.cand[p];
      if (m & bit) {
        const nm = m & ~bit;
        S.cand[p] = nm;
        if (nm === 0) return false;
        if ((nm & (nm - 1)) === 0) q.push(p);
      }
    }
    return true;
  }

  // All 9-bit digit sets with k digits that add up to `sum`.
  let KC = null;
  function cageCombos(k, sum) {
    if (!KC) {
      KC = Array.from({ length: 10 * 46 }, () => []);
      for (let m = 0; m < 512; m++) {
        let s = 0;
        for (let d = 1; d <= 9; d++) if (m & (1 << (d - 1))) s += d;
        KC[POP[m] * 46 + s].push(m);
      }
    }
    if (k < 0 || k > 9 || sum < 0 || sum > 45) return [];
    return KC[k * 46 + sum];
  }

  // Which digit sets can still fill a group of distinct cells? Returns null on contradiction.
  function feasibleCombos(cand, cells, rem) {
    let avail = 0;
    for (const c of cells) avail |= cand[c];
    let union = 0, must = 0x1ff, any = false;
    for (const s of cageCombos(cells.length, rem)) {
      if ((s & avail) !== s) continue;
      let cover = 0, ok = true;
      for (const c of cells) { const m = cand[c] & s; if (!m) { ok = false; break; } cover |= m; }
      if (!ok || cover !== s) continue;
      any = true; union |= s; must &= s;
    }
    return any ? { union, must } : null;
  }

  function cagePrune(model, S, q) {
    const g = model.geo;
    let changed = false;
    const shrink = (c, nm) => {
      if (nm === S.cand[c]) return true;
      S.cand[c] = nm; changed = true;
      if (!nm) return false;
      if (!(nm & (nm - 1))) q.push(c);
      return true;
    };
    for (let ci = 0; ci < model.cages.length; ci++) {
      const cg = model.cages[ci];
      let rem = cg.sum;
      const E = [];
      for (const c of cg.cells) { if (S.vals[c]) rem -= S.vals[c]; else E.push(c); }
      if (!E.length) { if (rem !== 0) return -1; continue; }
      const f = feasibleCombos(S.cand, E, rem);
      if (!f) return -1;
      for (const c of E) if (!shrink(c, S.cand[c] & f.union)) return -1;
      let mm = f.must;
      while (mm) {
        const b = mm & -mm; mm ^= b;
        const pos = [];
        for (const c of E) if (S.cand[c] & b) pos.push(c);
        if (!pos.length) return -1;
        if (pos.length === 1) { if (!shrink(pos[0], b)) return -1; continue; }
        // The cage must hold this digit; if every spot shares a row, column or box, clear the rest of it.
        for (const u of g.unitsOf[pos[0]]) {
          const inU = g.inUnit[u];
          if (!pos.every(c => inU[c])) continue;
          for (const x of g.units[u]) {
            if (S.vals[x] || model.cageOf[x] === ci || !(S.cand[x] & b)) continue;
            if (!shrink(x, S.cand[x] & ~b)) return -1;
          }
        }
      }
    }
    return changed ? 1 : 0;
  }

  function propagate(model, S, q) {
    const g = model.geo, units = g.units, ALL = g.ALL;
    for (;;) {
      while (q.length) {
        const c = q.pop();
        if (S.vals[c]) continue;
        const m = S.cand[c];
        if (m === 0) return false;
        if ((m & (m - 1)) === 0 && !assign(model, S, c, digitOf(m), q)) return false;
      }
      let progress = false;
      for (let u = 0; u < units.length; u++) {
        const cells = units[u];
        let once = 0, twice = 0, placed = 0;
        for (let i = 0; i < cells.length; i++) {
          const c = cells[i];
          if (S.vals[c]) { placed |= 1 << (S.vals[c] - 1); continue; }
          const m = S.cand[c];
          twice |= once & m; once |= m;
        }
        if ((once | placed) !== ALL) return false;
        let hidden = once & ~twice & ~placed;
        while (hidden) {
          const b = hidden & -hidden; hidden ^= b;
          let found = false;
          for (let i = 0; i < cells.length; i++) {
            const c = cells[i];
            if (S.cand[c] & b) {
              if (!assign(model, S, c, digitOf(b), q)) return false;
              found = true; progress = true; break;
            }
          }
          if (!found) { let placedNow = false; for (const c of cells) if (S.vals[c] === digitOf(b)) placedNow = true; if (!placedNow) return false; }
        }
      }
      if (!progress && !q.length && model.cages) {
        const r = cagePrune(model, S, q);
        if (r === -1) return false;
        if (r === 1) progress = true;
      }
      if (!progress && !q.length) return true;
    }
  }

  function search(model, S, ctx) {
    if (++ctx.nodes > ctx.cap) { ctx.aborted = true; return; }
    const C = model.geo.C;
    let best = -1, bestN = 99;
    for (let c = 0; c < C; c++) {
      if (S.vals[c]) continue;
      const n = POP[S.cand[c]];
      if (n < bestN) { bestN = n; best = c; if (n <= 2) break; }
    }
    if (best < 0) {
      ctx.count++;
      if (ctx.sols.length < 2) ctx.sols.push(Array.from(S.vals));
      return;
    }
    const digits = digitsOf(S.cand[best]);
    if (ctx.rng) ctx.rng.shuffle(digits);
    for (const d of digits) {
      const T = { vals: S.vals.slice(), cand: S.cand.slice() };
      const q = [];
      if (assign(model, T, best, d, q) && propagate(model, T, q)) search(model, T, ctx);
      if (ctx.count >= ctx.limit || ctx.aborted) return;
    }
  }

  // Count solutions (up to `limit`). `exclude: [cell, digit]` forbids one placement.
  function solve(model, givens, opts = {}) {
    const { limit = 2, cap = 200000, rng = null, exclude = null } = opts;
    const g = model.geo;
    const S = { vals: new Int8Array(g.C), cand: new Int32Array(g.C).fill(g.ALL) };
    const ctx = { count: 0, limit, cap, nodes: 0, aborted: false, sols: [], rng };
    const q = [];
    for (let c = 0; c < g.C; c++) if (givens[c] && !assign(model, S, c, givens[c], q)) return ctx;
    if (exclude) {
      const [c, d] = exclude;
      if (S.vals[c]) { if (S.vals[c] === d) return ctx; }
      else {
        const m = S.cand[c] & ~(1 << (d - 1));
        S.cand[c] = m;
        if (!m) return ctx;
        if (!(m & (m - 1))) q.push(c);
      }
    }
    if (propagate(model, S, q)) search(model, S, ctx);
    return ctx;
  }

  // ------------------------------------------------------- logical solving
  class LogicBoard {
    constructor(model, vals) {
      const g = this.geo = model.geo;
      this.model = model;
      this.vals = Int8Array.from(vals);
      this.cand = new Int32Array(g.C);
      this.empty = 0;
      for (let c = 0; c < g.C; c++) {
        if (this.vals[c]) continue;
        this.empty++;
        let m = g.ALL;
        for (const p of model.peers[c]) if (this.vals[p]) m &= ~(1 << (this.vals[p] - 1));
        this.cand[c] = m;
      }
    }
    place(c, d) {
      if (this.vals[c]) return;
      this.vals[c] = d; this.cand[c] = 0; this.empty--;
      const b = 1 << (d - 1);
      for (const p of this.model.peers[c]) this.cand[p] &= ~b;
    }
    apply(st) {
      if (st.kind === 'place') this.place(st.cell, st.digit);
      else for (const [c, m] of st.elims) this.cand[c] &= ~m;
    }
  }

  const TECH = {
    fullHouse:    { tier: 1, w: 1,  name: 'Last empty cell' },
    hiddenSingle: { tier: 1, w: 1.5, name: 'Only spot' },
    nakedSingle:  { tier: 1, w: 2,  name: 'Only number' },
    cage:         { tier: 2, w: 3,  name: 'Cage math' },
    houseSum:     { tier: 2, w: 5,  name: 'The 45 rule' },
    pointing:     { tier: 2, w: 4,  name: 'Pointing' },
    claiming:     { tier: 2, w: 4,  name: 'Box and line' },
    nakedPair:    { tier: 2, w: 5,  name: 'Naked pair' },
    hiddenPair:   { tier: 2, w: 6,  name: 'Hidden pair' },
    nakedTriple:  { tier: 3, w: 8,  name: 'Naked triple' },
    hiddenTriple: { tier: 3, w: 10, name: 'Hidden triple' },
    xWing:        { tier: 3, w: 10, name: 'X-Wing' },
    xyWing:       { tier: 3, w: 12, name: 'XY-Wing' },
    swordfish:    { tier: 3, w: 14, name: 'Swordfish' },
  };

  function combos(arr, k, fn, start = 0, acc = []) {
    if (acc.length === k) return fn(acc);
    for (let i = start; i <= arr.length - (k - acc.length); i++) {
      acc.push(arr[i]);
      if (combos(arr, k, fn, i + 1, acc)) return true;
      acc.pop();
    }
    return false;
  }

  function fullHouse(B) {
    const g = B.geo;
    for (let u = 0; u < g.units.length; u++) {
      let last = -1, n = 0;
      for (const c of g.units[u]) if (!B.vals[c]) { n++; last = c; if (n > 1) break; }
      if (n === 1 && POP[B.cand[last]] === 1) return { kind: 'place', tech: 'fullHouse', unit: u, cell: last, digit: lowDigit(B.cand[last]) };
    }
    return null;
  }

  function hiddenSingle(B, which) {
    const g = B.geo;
    for (let u = 0; u < g.units.length; u++) {
      const isBox = g.kinds[u] === 'box';
      if ((which === 'box') !== isBox) continue;
      let once = 0, twice = 0;
      for (const c of g.units[u]) { const m = B.cand[c]; twice |= once & m; once |= m; }
      const hidden = once & ~twice;
      if (!hidden) continue;
      const b = hidden & -hidden;
      for (const c of g.units[u]) if (B.cand[c] & b) {
        if (POP[B.cand[c]] === 1) break; // that's a naked single, reported elsewhere
        return { kind: 'place', tech: 'hiddenSingle', unit: u, cell: c, digit: digitOf(b) };
      }
    }
    return null;
  }

  function nakedSingle(B) {
    for (let c = 0; c < B.geo.C; c++) {
      if (!B.vals[c] && POP[B.cand[c]] === 1) return { kind: 'place', tech: 'nakedSingle', cell: c, digit: lowDigit(B.cand[c]) };
    }
    return null;
  }

  function pruneGroup(B, cells, total, distinct) {
    let rem = total, used = 0;
    const E = [];
    for (const c of cells) { if (B.vals[c]) { rem -= B.vals[c]; used |= 1 << (B.vals[c] - 1); } else E.push(c); }
    const elims = [];
    if (!E.length) return elims;
    const k = E.length;
    if (distinct && B.geo.N === 9) {
      const f = feasibleCombos(B.cand, E, rem);
      if (!f) return elims;
      for (const c of E) { const bad = B.cand[c] & ~f.union; if (bad && bad !== B.cand[c]) elims.push([c, bad]); }
      return elims;
    }
    for (let i = 0; i < k; i++) {
      const c = E[i];
      let others = 0, lo = 0, hi = 0;
      for (let j = 0; j < k; j++) if (j !== i) { const m = B.cand[E[j]]; others |= m; lo += lowDigit(m); hi += highDigit(m); }
      let bad = 0, mm = B.cand[c];
      while (mm) {
        const b = mm & -mm; mm ^= b;
        const r = rem - digitOf(b);
        const ok = distinct ? canMake(others & ~used & ~b, k - 1, r) : (r >= lo && r <= hi);
        if (!ok) bad |= b;
      }
      if (bad && bad !== B.cand[c]) elims.push([c, bad]);
    }
    return elims;
  }

  function cageStep(B) {
    const cages = B.model.cages;
    if (!cages) return null;
    for (let i = 0; i < cages.length; i++) {
      const elims = pruneGroup(B, cages[i].cells, cages[i].sum, true);
      if (elims.length) return { kind: 'elim', tech: 'cage', cage: i, cells: cages[i].cells.slice(), elims };
    }
    return null;
  }

  function allPeers(B, cells) {
    const { isPeer } = B.model, C = B.geo.C;
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) if (!isPeer[cells[i] * C + cells[j]]) return false;
    return true;
  }

  function houseSumStep(B) {
    const { model } = B, g = B.geo;
    if (!model.cages) return null;
    for (let u = 0; u < g.units.length; u++) {
      if (g.kinds[u] === 'diag') continue;
      const inU = g.inUnit[u];
      const touching = new Set();
      for (const c of g.units[u]) touching.add(model.cageOf[c]);
      let inner = 0, outer = 0;
      const covered = new Uint8Array(g.C), out = [];
      for (const ci of touching) {
        const cg = model.cages[ci];
        outer += cg.sum;
        if (cg.cells.every(c => inU[c])) { inner += cg.sum; cg.cells.forEach(c => { covered[c] = 1; }); }
        else cg.cells.forEach(c => { if (!inU[c]) out.push(c); });
      }
      const rest = g.units[u].filter(c => !covered[c]);
      if (rest.length && rest.length <= 4) {
        const elims = pruneGroup(B, rest, g.total - inner, true);
        if (elims.length) return { kind: 'elim', tech: 'houseSum', mode: 'in', unit: u, cells: rest, sum: g.total - inner, elims };
      }
      if (out.length && out.length <= 3) {
        const elims = pruneGroup(B, out, outer - g.total, allPeers(B, out));
        if (elims.length) return { kind: 'elim', tech: 'houseSum', mode: 'out', unit: u, cells: out, sum: outer - g.total, elims };
      }
    }
    return null;
  }

  function lockedCandidates(B) {
    const g = B.geo;
    for (const [a, b] of g.lockPairs) {
      const A = g.units[a], inB = g.inUnit[b], inA = g.inUnit[a];
      for (let d = 1; d <= g.N; d++) {
        const bit = 1 << (d - 1);
        const pos = [];
        let ok = true;
        for (const c of A) if (B.cand[c] & bit) { if (!inB[c]) { ok = false; break; } pos.push(c); }
        if (!ok || pos.length < 2) continue;
        const elims = [];
        for (const c of g.units[b]) if (!inA[c] && (B.cand[c] & bit)) elims.push([c, bit]);
        if (elims.length) return { kind: 'elim', tech: g.kinds[a] === 'box' ? 'pointing' : 'claiming', digit: d, units: [a, b], cells: pos, elims };
      }
    }
    return null;
  }

  function nakedSubset(B, k) {
    const g = B.geo;
    for (let u = 0; u < g.units.length; u++) {
      const empties = g.units[u].filter(c => !B.vals[c]);
      if (empties.length <= k) continue;
      const pool = empties.filter(c => POP[B.cand[c]] >= 2 && POP[B.cand[c]] <= k);
      if (pool.length < k) continue;
      let res = null;
      combos(pool, k, sel => {
        let m = 0;
        for (const c of sel) m |= B.cand[c];
        if (POP[m] !== k) return false;
        const elims = [];
        for (const c of empties) if (!sel.includes(c) && (B.cand[c] & m)) elims.push([c, B.cand[c] & m]);
        if (!elims.length) return false;
        res = { kind: 'elim', tech: k === 2 ? 'nakedPair' : 'nakedTriple', unit: u, cells: sel.slice(), digits: m, elims };
        return true;
      });
      if (res) return res;
    }
    return null;
  }

  function hiddenSubset(B, k) {
    const g = B.geo;
    for (let u = 0; u < g.units.length; u++) {
      const E = g.units[u].filter(c => !B.vals[c]);
      if (E.length <= k) continue;
      const pos = [];
      for (let d = 1; d <= g.N; d++) {
        const bit = 1 << (d - 1);
        let m = 0;
        E.forEach((c, i) => { if (B.cand[c] & bit) m |= 1 << i; });
        if (POP[m] >= 2 && POP[m] <= k) pos.push([d, m]);
      }
      if (pos.length < k) continue;
      let res = null;
      combos(pos, k, sel => {
        let um = 0, dm = 0;
        for (const [d, m] of sel) { um |= m; dm |= 1 << (d - 1); }
        if (POP[um] !== k) return false;
        const cells = [], elims = [];
        E.forEach((c, i) => {
          if (!(um & (1 << i))) return;
          cells.push(c);
          const extra = B.cand[c] & ~dm;
          if (extra) elims.push([c, extra]);
        });
        if (!elims.length) return false;
        res = { kind: 'elim', tech: k === 2 ? 'hiddenPair' : 'hiddenTriple', unit: u, cells, digits: dm, elims };
        return true;
      });
      if (res) return res;
    }
    return null;
  }

  function fish(B, k) {
    const g = B.geo, N = g.N;
    for (let d = 1; d <= N; d++) {
      const bit = 1 << (d - 1);
      for (const orient of [0, 1]) {
        const at = (base, cover) => (orient ? cover * N + base : base * N + cover);
        const lines = [];
        for (let i = 0; i < N; i++) {
          let m = 0, placed = false;
          for (let j = 0; j < N; j++) { const c = at(i, j); if (B.vals[c] === d) placed = true; if (B.cand[c] & bit) m |= 1 << j; }
          if (!placed && POP[m] >= 2 && POP[m] <= k) lines.push([i, m]);
        }
        if (lines.length < k) continue;
        let res = null;
        combos(lines, k, sel => {
          let um = 0;
          for (const [, m] of sel) um |= m;
          if (POP[um] !== k) return false;
          const base = new Set(sel.map(s => s[0]));
          const elims = [];
          for (let j = 0; j < N; j++) {
            if (!(um & (1 << j))) continue;
            for (let i = 0; i < N; i++) { if (base.has(i)) continue; const c = at(i, j); if (B.cand[c] & bit) elims.push([c, bit]); }
          }
          if (!elims.length) return false;
          const cells = [];
          for (const [i, m] of sel) for (let j = 0; j < N; j++) if (m & (1 << j)) cells.push(at(i, j));
          res = { kind: 'elim', tech: k === 2 ? 'xWing' : 'swordfish', digit: d, orient, lines: sel.map(s => s[0]), cover: digitsOf(um).map(x => x - 1), cells, elims };
          return true;
        });
        if (res) return res;
      }
    }
    return null;
  }

  function xyWing(B) {
    const g = B.geo, C = g.C, { isPeer, peers } = B.model;
    const bi = [];
    for (let c = 0; c < C; c++) if (!B.vals[c] && POP[B.cand[c]] === 2) bi.push(c);
    for (const p of bi) {
      const pm = B.cand[p];
      const wings = bi.filter(c => c !== p && isPeer[p * C + c] && POP[B.cand[c] & pm] === 1);
      for (let i = 0; i < wings.length; i++) for (let j = i + 1; j < wings.length; j++) {
        const a = wings[i], b = wings[j], am = B.cand[a], bm = B.cand[b];
        if ((am & pm) === (bm & pm)) continue;
        const z = am & ~pm;
        if (!z || z !== (bm & ~pm)) continue;
        const elims = [];
        for (const c of peers[a]) if (c !== b && c !== p && isPeer[b * C + c] && (B.cand[c] & z)) elims.push([c, z]);
        if (elims.length) return { kind: 'elim', tech: 'xyWing', cells: [p, a, b], digit: digitOf(z), elims };
      }
    }
    return null;
  }

  function findStep(B, maxTier = 3) {
    return fullHouse(B) || hiddenSingle(B, 'box') || nakedSingle(B) || hiddenSingle(B, 'line') ||
      (B.model.cages && (cageStep(B) || houseSumStep(B))) ||
      (maxTier >= 2 && (lockedCandidates(B) || nakedSubset(B, 2) || hiddenSubset(B, 2))) ||
      (maxTier >= 3 && (nakedSubset(B, 3) || hiddenSubset(B, 3) || fish(B, 2) || xyWing(B) || fish(B, 3))) ||
      null;
  }

  function grade(model, givens) {
    const B = new LogicBoard(model, givens);
    let tier = 1, score = 0, steps = 0;
    const used = {};
    while (B.empty > 0 && steps++ < 4000) {
      const st = findStep(B, 3);
      if (!st) {
        const r = solve(model, Array.from(B.vals), { limit: 1, cap: 50000 });
        return { tier: 4, score: Math.round(score + 60 + Math.min(r.nodes, 400) / 2 + B.empty), used };
      }
      const t = TECH[st.tech];
      tier = Math.max(tier, t.tier);
      score += t.w;
      used[st.tech] = (used[st.tech] || 0) + 1;
      B.apply(st);
    }
    return { tier, score: Math.round(score), used };
  }

  // ------------------------------------------------------------- generator
  const LEVELS = ['easy', 'medium', 'hard', 'expert', 'extreme', 'insane'];
  const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert', extreme: 'Extreme', insane: 'Insane' };
  // band: which technique tiers the puzzle must need (1 singles, 2 pairs/pointing,
  // 3 triples/wings/fish, 4 beyond those). floor: minimum clues kept (classic / diagonal).
  const SPEC = {
    easy:    { band: [1, 1], sym: true,  floor: { 9: 38, 12: 80, 16: 150 }, dfloor: { 9: 36, 12: 72, 16: 138 }, tries: { 9: 6,   12: 4,  16: 3 } },
    medium:  { band: [1, 1], sym: true,  floor: { 9: 31, 12: 68, 16: 132 }, dfloor: { 9: 29, 12: 62, 16: 122 }, tries: { 9: 10,  12: 6,  16: 4 } },
    hard:    { band: [2, 2], sym: true,  floor: { 9: 0,  12: 60, 16: 115 }, dfloor: { 9: 0,  12: 52, 16: 103 }, tries: { 9: 200, 12: 40, 16: 30 } },
    expert:  { band: [3, 3], sym: false, floor: { 9: 0,  12: 56, 16: 110 }, dfloor: { 9: 0,  12: 48, 16: 98 },  tries: { 9: 300, 12: 50, 16: 30 }, harder: true },
    extreme: { band: [4, 4], sym: false, floor: { 9: 0,  12: 0,  16: 0 },   dfloor: { 9: 0,  12: 0,  16: 0 },   tries: { 9: 40,  12: 8,  16: 2 } },
    insane:  { band: [4, 4], sym: false, floor: { 9: 0,  12: 0,  16: 0 },   dfloor: { 9: 0,  12: 0,  16: 0 },   tries: { 9: 60,  12: 10, 16: 3 }, best: true },
  };
  const KILLER = {
    easy:    { sizes: [2, 3], givens: 16, tries: 1 },
    medium:  { sizes: [2, 4], givens: 8,  tries: 1 },
    hard:    { sizes: [2, 4], givens: 3,  tries: 2 },
    expert:  { sizes: [2, 5], givens: 0,  tries: 2 },
    extreme: { sizes: [3, 5], givens: 0,  tries: 2 },
    insane:  { sizes: [3, 6], givens: 0,  tries: 2 },
  };

  function randomSolution(model, rng) {
    const empty = new Array(model.geo.C).fill(0);
    for (let t = 0; t < 40; t++) {
      const r = solve(model, empty, { limit: 1, cap: 30000, rng });
      if (r.count) return r.sols[0];
    }
    throw new Error('Could not build a grid');
  }

  function stillUnique(model, puzzle, group, sol, cap) {
    for (const c of group) {
      const r = solve(model, puzzle, { limit: 1, cap, exclude: [c, sol[c]] });
      if (r.count || r.aborted) return false;
    }
    return true;
  }

  function removeClues(model, sol, rng, floor, sym, cap) {
    const C = model.geo.C, puzzle = sol.slice(), done = new Uint8Array(C);
    let clues = C;
    for (const c of rng.shuffle(range(C))) {
      if (done[c]) continue;
      const m = C - 1 - c;
      const group = sym && m !== c ? [c, m] : [c];
      group.forEach(x => { done[x] = 1; });
      if (clues - group.length < floor) continue;
      group.forEach(x => { puzzle[x] = 0; });
      if (stillUnique(model, puzzle, group, sol, cap)) clues -= group.length;
      else group.forEach(x => { puzzle[x] = sol[x]; });
    }
    return { puzzle, clues };
  }

  function generateClassic(o, rng) {
    const model = makeModel(o);
    const spec = SPEC[o.difficulty];
    const N = o.size;
    const floor = (o.variant === 'diagonal' ? spec.dfloor : spec.floor)[N] || 0;
    const tries = spec.tries[N] || 1;
    const cap = N === 9 ? 4000 : N === 12 ? 1500 : 600;
    const [lo, hi] = spec.band;
    let best = null, bestKey = -Infinity;
    for (let t = 0; t < tries; t++) {
      const sol = randomSolution(model, rng);
      const { puzzle, clues } = removeClues(model, sol, rng, floor, spec.sym, cap);
      const rating = grade(model, puzzle);
      const dist = rating.tier < lo ? lo - rating.tier : rating.tier > hi ? rating.tier - hi : 0;
      const key = -dist * 1e6 + (spec.harder && rating.tier > hi ? 1000 : 0) + (spec.best ? rating.score : -t);
      if (key > bestKey) { bestKey = key; best = { sol, puzzle, clues, rating }; }
      if (dist === 0 && !spec.best) break;
    }
    return { givens: best.puzzle, solution: best.sol, clues: best.clues, rating: { tier: best.rating.tier, score: best.rating.score }, cages: null };
  }

  function orthogonal(g, c) {
    const r = g.rowOf[c], col = g.colOf[c], N = g.N, out = [];
    if (r > 0) out.push(c - N);
    if (r < N - 1) out.push(c + N);
    if (col > 0) out.push(c - 1);
    if (col < N - 1) out.push(c + 1);
    return out;
  }

  function makeCages(g, sol, rng, [lo, hi]) {
    const owner = new Int16Array(g.C).fill(-1), cages = [];
    for (const start of rng.shuffle(range(g.C))) {
      if (owner[start] >= 0) continue;
      const id = cages.length, cells = [start];
      owner[start] = id;
      let used = 1 << (sol[start] - 1);
      const target = lo + rng.int(hi - lo + 1);
      while (cells.length < target) {
        const opts = [];
        for (const c of cells) for (const nb of orthogonal(g, c)) if (owner[nb] < 0 && !(used & (1 << (sol[nb] - 1)))) opts.push(nb);
        if (!opts.length) break;
        const nb = opts[rng.int(opts.length)];
        owner[nb] = id; cells.push(nb); used |= 1 << (sol[nb] - 1);
      }
      cages.push(cells);
    }
    for (let i = 0; i < cages.length; i++) {
      if (cages[i].length !== 1) continue;
      const c = cages[i][0];
      for (const nb of rng.shuffle(orthogonal(g, c))) {
        const j = owner[nb];
        if (j === i || cages[j].length >= hi + 1 || cages[j].some(x => sol[x] === sol[c])) continue;
        cages[j].push(c); owner[c] = j; cages[i] = [];
        break;
      }
    }
    return cages.filter(c => c.length).map(cells => ({ cells: cells.sort((a, b) => a - b), sum: cells.reduce((s, c) => s + sol[c], 0) }));
  }

  function generateKiller(o, rng) {
    const spec = KILLER[o.difficulty];
    const base = makeModel({ size: 9, variant: 'classic' });
    let best = null;
    for (let t = 0; t < spec.tries; t++) {
      const sol = randomSolution(base, rng);
      const cages = makeCages(base.geo, sol, rng, spec.sizes);
      const model = makeModel({ size: 9, variant: 'killer', cages });
      const giv = new Array(81).fill(0);
      for (let guard = 0; guard < 81; guard++) {
        const r = solve(model, giv, { limit: 2, cap: 6000 });
        if (r.count === 1 && !r.aborted) break;
        let pick;
        if (r.count >= 2) {
          const diff = [];
          for (let c = 0; c < 81; c++) if (!giv[c] && r.sols[0][c] !== r.sols[1][c]) diff.push(c);
          pick = diff[rng.int(diff.length)];
        } else {
          const empty = [];
          for (let c = 0; c < 81; c++) if (!giv[c]) empty.push(c);
          pick = empty[rng.int(empty.length)];
        }
        giv[pick] = sol[pick];
      }
      const n = giv.filter(Boolean).length;
      if (!best || n < best.n) best = { sol, cages, giv, n };
      if (n === 0) break;
    }
    let have = best.n;
    for (const c of rng.shuffle(range(81))) {
      if (have >= spec.givens) break;
      if (!best.giv[c]) { best.giv[c] = best.sol[c]; have++; }
    }
    return { givens: best.giv, solution: best.sol, cages: best.cages, clues: have, rating: null };
  }

  function generate(opts) {
    const o = {
      size: opts.size || 9,
      variant: opts.variant || 'classic',
      difficulty: LEVELS.includes(opts.difficulty) ? opts.difficulty : 'medium',
      seed: opts.seed || randomSeed(),
    };
    if (o.variant === 'killer') o.size = 9;
    const rng = makeRng(`${o.variant}|${o.size}|${o.difficulty}|${o.seed}`);
    const res = o.variant === 'killer' ? generateKiller(o, rng) : generateClassic(o, rng);
    return Object.assign(o, res, { code: makeCode(o) });
  }

  // ----------------------------------------------------------------- codes
  const VAR_CODE = { classic: 'C', diagonal: 'D', killer: 'K' };
  const LVL_CODE = { easy: 'E', medium: 'M', hard: 'H', expert: 'X', extreme: 'Z', insane: 'I' };
  const invert = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
  const VAR_FROM = invert(VAR_CODE), LVL_FROM = invert(LVL_CODE);
  function makeCode(o) { return VAR_CODE[o.variant] + o.size + LVL_CODE[o.difficulty] + '-' + o.seed; }
  function parseCode(str) {
    const s = String(str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const m = s.match(/^([CDK])(9|12|16)([EMHXZI])([A-Z0-9]{4,8})$/);
    if (!m) return null;
    const o = { variant: VAR_FROM[m[1]], size: +m[2], difficulty: LVL_FROM[m[3]], seed: m[4] };
    if (o.variant === 'killer' && o.size !== 9) return null;
    return o;
  }

  // ----------------------------------------------------------------- hints
  const sym = d => SYMBOLS[d - 1];
  function listSyms(mask) {
    const ds = digitsOf(mask).map(sym);
    return ds.length <= 1 ? ds.join('') : ds.slice(0, -1).join(', ') + ' and ' + ds[ds.length - 1];
  }
  function unitName(g, u) {
    const k = g.kinds[u], n = g.nums[u] + 1;
    if (k === 'row') return `row ${n}`;
    if (k === 'col') return `column ${n}`;
    if (k === 'box') return `box ${n}`;
    return n === 1 ? 'the main diagonal' : 'the other diagonal';
  }
  const capFirst = s => s.charAt(0).toUpperCase() + s.slice(1);

  function describe(st, model) {
    const g = model.geo;
    const where = ['row', 'column', 'box'];
    if (g.diagonal) where.push('diagonal');
    if (model.cages) where.push('cage');
    const whereText = where.slice(0, -1).join(', ') + ' or ' + where[where.length - 1];
    const elimDigits = st.elims ? st.elims.reduce((m, [, x]) => m | x, 0) : 0;
    switch (st.tech) {
      case 'fullHouse': return `${capFirst(unitName(g, st.unit))} has one empty cell left, and the only number missing is ${sym(st.digit)}.`;
      case 'nakedSingle': return `This cell can only be ${sym(st.digit)}. Every other number already appears in its ${whereText}.`;
      case 'hiddenSingle': return `In ${unitName(g, st.unit)}, ${sym(st.digit)} fits in only one cell.`;
      case 'pointing': return `In ${unitName(g, st.units[0])}, ${sym(st.digit)} can only go in the highlighted cells, and they all sit in ${unitName(g, st.units[1])}. So ${sym(st.digit)} can't go anywhere else in ${unitName(g, st.units[1])}.`;
      case 'claiming': return `In ${unitName(g, st.units[0])}, ${sym(st.digit)} can only go in the highlighted cells, and they are all inside ${unitName(g, st.units[1])}. So ${sym(st.digit)} can't go anywhere else in that box.`;
      case 'nakedPair': case 'nakedTriple':
        return `In ${unitName(g, st.unit)}, the highlighted cells can only hold ${listSyms(st.digits)}. So no other cell in ${unitName(g, st.unit)} can hold ${POP[st.digits] === 2 ? 'either' : 'any'} of them.`;
      case 'hiddenPair': case 'hiddenTriple':
        return `In ${unitName(g, st.unit)}, ${listSyms(st.digits)} can only go in the highlighted cells. So those cells can't hold anything else.`;
      case 'xWing': case 'swordfish': {
        const k = st.lines.length, base = st.orient ? 'column' : 'row', cross = st.orient ? 'row' : 'column';
        const names = st.lines.map(i => i + 1).join(st.lines.length === 2 ? ' and ' : ', ');
        return `In ${base}s ${names}, ${sym(st.digit)} has at most ${k} spots, and they line up in the same ${k} ${cross}s. So ${sym(st.digit)} can't go anywhere else in those ${cross}s.`;
      }
      case 'xyWing': return `The three highlighted cells each have two options. However they work out, one of the two outer cells will be ${sym(st.digit)}. So a cell that shares a line or box with both outer cells can't be ${sym(st.digit)}.`;
      case 'cage': {
        const cg = model.cages[st.cage];
        return `The ${cg.sum} cage has ${cg.cells.length} cells with no repeats. ${capFirst(listSyms(elimDigits))} can't be part of a mix that adds up to ${cg.sum} here.`;
      }
      case 'houseSum':
        return st.mode === 'in'
          ? `Every ${g.kinds[st.unit] === 'box' ? 'box' : 'line'} adds up to 45. The cages fully inside ${unitName(g, st.unit)} make ${g.total - st.sum}, so the highlighted cells must add up to ${st.sum}.`
          : `The cages touching ${unitName(g, st.unit)} add up to ${g.total + st.sum}. Take away the 45 inside it, and the highlighted cells sticking out must add up to ${st.sum}.`;
      default: return '';
    }
  }

  function stepView(st, model) {
    const g = model.geo;
    let area = [];
    if (st.unit != null) area = g.units[st.unit].slice();
    if (st.units) area = [...new Set([...g.units[st.units[0]], ...g.units[st.units[1]]])];
    if (st.tech === 'cage') area = st.cells.slice();
    if (st.tech === 'houseSum') area = g.units[st.unit].slice();
    if (st.tech === 'nakedSingle') area = Array.from(model.peers[st.cell]);
    if (st.tech === 'xWing' || st.tech === 'swordfish') {
      const N = g.N;
      for (const i of st.lines) for (let j = 0; j < N; j++) area.push(st.orient ? j * N + i : i * N + j);
      for (const j of st.cover) for (let i = 0; i < N; i++) area.push(st.orient ? j * N + i : i * N + j);
      area = [...new Set(area)];
    }
    return {
      tech: st.tech,
      name: TECH[st.tech] ? TECH[st.tech].name : 'Reveal',
      text: describe(st, model),
      kind: st.kind,
      cell: st.cell != null ? st.cell : -1,
      digit: st.digit || 0,
      area,
      cells: st.cells ? st.cells.slice() : [],
      elims: st.elims ? st.elims.map(([c, m]) => [c, m]) : [],
    };
  }

  // vals: current board holding only correct digits.
  function hint(p, vals) {
    const model = makeModel(p);
    const B = new LogicBoard(model, vals);
    const chain = [];
    for (let i = 0; i < 24; i++) {
      const st = findStep(B, 3);
      if (!st) break;
      if (st.kind === 'place') {
        return { chain: chain.map(s => stepView(s, model)), step: stepView(st, model) };
      }
      chain.push(st);
      B.apply(st);
    }
    let best = -1, bn = 99;
    for (let c = 0; c < model.geo.C; c++) {
      if (vals[c]) continue;
      const n = POP[B.cand[c]];
      if (n < bn) { bn = n; best = c; }
    }
    if (best < 0) return null;
    return {
      chain: [],
      step: { tech: 'reveal', name: 'Reveal', kind: 'place', cell: best, digit: p.solution[best], area: [], cells: [], elims: [],
        text: `This board needs advanced logic for its next step, so this cell is revealed. It's ${sym(p.solution[best])}.` },
    };
  }

  function basicCandidates(p, vals) {
    const model = makeModel(p);
    return Array.from(new LogicBoard(model, vals).cand);
  }

  return {
    SYMBOLS, LEVELS, LEVEL_NAMES, TECH, POP,
    geometry, makeModel, solve, grade, generate, hint, basicCandidates,
    makeCode, parseCode, randomSeed, makeRng, hashString, digitsOf,
    _internal: { removeClues, randomSolution, makeCages, SPEC, KILLER },
  };
});
