/* Blueline Sudoku: screens, game rules, input, hints, stats, daily puzzle and live races. */
(() => {
  'use strict';
  const E = window.SudokuEngine;
  const SYM = E.SYMBOLS;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const LEVELS = E.LEVELS, LEVEL_NAMES = E.LEVEL_NAMES;
  const VARIANTS = { classic: 'Classic', diagonal: 'Diagonal', killer: 'Killer' };
  const SIZES = { 9: '9×9', 12: '12×12', 16: '16×16' };
  const LEVEL_TAGS = { easy: 'Warm-up', medium: 'Steady', hard: 'Pairs, pointing', expert: 'Wings, fish', extreme: 'Past the basics', insane: 'No mercy' };
  const VARIANT_NOTES = {
    classic: '',
    diagonal: 'Both long diagonals also need every number once.',
    killer: 'Dashed cages show their sum, and numbers can’t repeat inside a cage. Killer is 9×9 only.',
  };
  const STRIKES = 3;
  const DAILY_LEVEL = ['extreme', 'easy', 'medium', 'hard', 'hard', 'expert', 'expert']; // Sunday first
  const VERSION = '1.0.2';

  // ------------------------------------------------------------- storage
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bl:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bl:' + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } },
  };

  const DEFAULTS = { theme: 'system', inputMode: 'cell', lanes: true, laneBoxes: false, sameNumbers: true, peers: true, autoClear: true, strikes: true, timer: true, haptics: true, name: '' };
  const settings = Object.assign({}, DEFAULTS, store.get('settings', {}));
  const pick = Object.assign({ variant: 'classic', size: 9, difficulty: 'medium' }, store.get('pick', {}));
  const stats = store.get('stats', {});
  const daily = Object.assign({ done: {}, streak: 0, best: 0, last: '' }, store.get('daily', {}));
  const raceRecord = Object.assign({ wins: 0, losses: 0, draws: 0 }, store.get('raceRecord', {}));
  const saveSettings = () => store.set('settings', settings);

  // --------------------------------------------------------------- utils
  const pad2 = n => String(n).padStart(2, '0');
  function fmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    return (h ? h + ':' + pad2(m) : m) + ':' + pad2(sec);
  }
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  function addDays(key, n) { const d = new Date(key + 'T12:00:00'); d.setDate(d.getDate() + n); return dayKey(d); }
  const label = o => `${LEVEL_NAMES[o.difficulty]} ${VARIANTS[o.variant]} ${SIZES[o.size]}`;
  const appUrl = () => location.origin + location.pathname;
  const buzz = pattern => {
    if (!settings.haptics || !navigator.vibrate) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    try { navigator.vibrate(pattern); } catch (e) { /* unsupported */ }
  };

  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme; else root.dataset.theme = settings.theme;
    requestAnimationFrame(() => {
      const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
      $('#meta-theme').setAttribute('content', bg || '#EDF1F7');
    });
  }
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) { /* old browser */ }

  let toastTimer = 0;
  function toast(msg, action) {
    const t = $('#toast');
    t.innerHTML = esc(msg) + (action ? ` <button type="button">${esc(action.label)}</button>` : '');
    t.hidden = false;
    if (action) t.querySelector('button').onclick = () => { t.hidden = true; action.run(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, action ? 9000 : 2600);
  }

  async function shareText(text) {
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    copyText(text);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied. Paste it in a message.'); }
    catch (e) {
      openSheet(`<h2 id="sheet-title">Copy this</h2><p class="lede">Select the text and copy it.</p><textarea class="input" id="copy-box" rows="4" readonly style="padding:12px;min-height:110px">${esc(text)}</textarea><div class="actions"><button type="button" class="btn" data-a="close">Done</button></div>`,
        { onMount: b => { const ta = b.querySelector('#copy-box'); ta.focus(); ta.select(); b.querySelector('[data-a=close]').onclick = () => closeSheet(); } });
    }
  }

  // -------------------------------------------------------------- sheets
  let sheetOnClose = null, sheetLocked = false;
  function openSheet(html, { locked = false, onClose = null, onMount = null } = {}) {
    $('#sheet-body').innerHTML = html;
    $('#sheet').hidden = false;
    $('#scrim').hidden = false;
    sheetLocked = locked;
    sheetOnClose = onClose;
    $('#sheet-body').scrollTop = 0;
    if (onMount) onMount($('#sheet-body'));
  }
  function closeSheet(reason) {
    if ($('#sheet').hidden) return;
    $('#sheet').hidden = true;
    $('#scrim').hidden = true;
    const cb = sheetOnClose;
    sheetOnClose = null; sheetLocked = false;
    if (cb) cb(reason);
  }
  const sheetOpen = () => !$('#sheet').hidden;
  $('#scrim').addEventListener('click', () => { if (!sheetLocked) closeSheet('dismiss'); });
  const on = (root, sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };

  // ------------------------------------------------------------ generator
  let worker = null, jobId = 0;
  const jobs = new Map();
  function getWorker() {
    if (worker) return worker;
    try {
      worker = new Worker('js/worker.js');
      worker.onmessage = e => {
        const j = jobs.get(e.data.id);
        if (!j) return;
        jobs.delete(e.data.id);
        if (e.data.ok) j.resolve(e.data.puzzle); else j.reject(new Error(e.data.error));
      };
      worker.onerror = () => { for (const j of jobs.values()) j.reject(new Error('worker')); jobs.clear(); worker = null; };
    } catch (e) { worker = null; }
    return worker;
  }
  function generate(opts) {
    const w = getWorker();
    if (!w) return new Promise((res, rej) => setTimeout(() => { try { res(E.generate(opts)); } catch (e) { rej(e); } }, 30));
    return new Promise((resolve, reject) => { const id = ++jobId; jobs.set(id, { resolve, reject }); w.postMessage({ id, opts }); });
  }
  function cancelGeneration() {
    if (worker) { worker.terminate(); worker = null; }
    for (const j of jobs.values()) j.reject(new Error('cancelled'));
    jobs.clear();
  }

  // ----------------------------------------------------------- game state
  let G = null;              // the current game (saved to storage)
  let model = null, geo = null;
  let cells = [], keys = [];
  let sel = -1, active = 0, laneDigit = 0, notesMode = false, hintView = null, paused = false;
  let clockStart = 0, clockTimer = 0, saveTimer = 0;

  const playable = () => !!G && (G.status === 'playing' || G.status === 'practice') && !paused;
  const isLocked = c => !!G.puzzle.givens[c] || (G.vals[c] !== 0 && G.vals[c] === G.puzzle.solution[c]);
  const snap = () => ({ vals: G.vals.slice(), notes: G.notes.slice() });
  function pushUndo(before) { G.undo.push(before); if (G.undo.length > 120) G.undo.shift(); G.redo = []; }
  const myFilled = () => G.vals.reduce((n, v, c) => n + (v && !G.puzzle.givens[c] && v === G.puzzle.solution[c] ? 1 : 0), 0);
  const emptyCount = () => G.puzzle.givens.reduce((n, v) => n + (v ? 0 : 1), 0);
  function digitDone(d) { let n = 0; G.vals.forEach((v, c) => { if (v === d && v === G.puzzle.solution[c]) n++; }); return n >= G.puzzle.size; }

  function save() {
    clearTimeout(saveTimer);
    if (!G) return;
    const copy = Object.assign({}, G, { race: null, elapsed: elapsed(), undo: G.undo.slice(G.puzzle.size > 9 ? -30 : -80), redo: [] });
    if (copy.status === 'countdown') copy.status = 'playing';
    store.set('game', copy);
  }
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); };

  function loadGame() {
    const g = store.get('game', null);
    if (!g || !g.puzzle || !Array.isArray(g.vals) || !Array.isArray(g.puzzle.solution)) return null;
    if (!['playing', 'practice'].includes(g.status)) return null;
    g.race = null; g.undo = Array.isArray(g.undo) ? g.undo : []; g.redo = [];
    g.notes = Array.isArray(g.notes) ? g.notes : new Array(g.vals.length).fill(0);
    return g;
  }

  // ---------------------------------------------------------------- clock
  function elapsed() {
    if (!G) return 0;
    if (G.race && G.race.startAt) return (G.race.endAt || Date.now()) - G.race.startAt;
    return (G.elapsed || 0) + (clockStart ? Date.now() - clockStart : 0);
  }
  function startClock() {
    if (clockStart || !G || !['playing', 'practice'].includes(G.status) || paused) return;
    clockStart = Date.now();
    clearInterval(clockTimer);
    clockTimer = setInterval(renderClock, 500);
    renderClock();
  }
  function stopClock() {
    if (!clockStart) return;
    if (G && !(G.race && G.race.startAt)) G.elapsed = (G.elapsed || 0) + Date.now() - clockStart;
    clockStart = 0;
    clearInterval(clockTimer);
    renderClock();
  }
  function renderClock() {
    if (!G) return;
    $('#g-clock').textContent = settings.timer || G.race ? fmt(elapsed()) : '';
  }

  // ------------------------------------------------------------- screens
  function show(which) {
    $('#home').hidden = which !== 'home';
    $('#game').hidden = which !== 'game';
    if (which === 'home') renderHome();
    if (which === 'game') {
      if (!history.state || history.state.s !== 'game') { try { history.pushState({ s: 'game' }, ''); } catch (e) { /* ignore */ } }
      layoutBoard();
    }
  }

  let ignorePop = false;
  function goHome(fromPop) {
    if (G && G.race) { confirmLeaveRace(); return; }
    closeHint();
    stopClock();
    save();
    if (!fromPop && history.state && history.state.s === 'game') { ignorePop = true; history.back(); }
    show('home');
  }

  // The phone's back button leaves the game for the menu instead of closing the app.
  window.addEventListener('popstate', () => {
    if (ignorePop) { ignorePop = false; return; }
    if (sheetOpen() && !sheetLocked) { closeSheet('dismiss'); if (!$('#game').hidden) history.pushState({ s: 'game' }, ''); return; }
    if (!$('#game').hidden) {
      if ((G && G.race) || sheetOpen()) { history.pushState({ s: 'game' }, ''); if (G && G.race && !sheetOpen()) confirmLeaveRace(); return; }
      goHome(true);
    }
  });

  // ---------------------------------------------------------------- board
  function startGame(puzzle, extra = {}) {
    stopClock();
    closeHint();
    G = {
      v: 1, puzzle, vals: puzzle.givens.slice(), notes: new Array(puzzle.size * puzzle.size).fill(0),
      mistakes: 0, hints: 0, elapsed: 0, status: 'playing', undo: [], redo: [],
      daily: extra.daily || null, race: extra.race || null, created: Date.now(),
    };
    sel = -1; active = 0; laneDigit = 0; notesMode = false; paused = false;
    enterGame();
    if (!G.race) startClock();
    save();
  }

  function enterGame() {
    model = E.makeModel(G.puzzle);
    geo = model.geo;
    $('#cover').hidden = true;
    $('#countdown').hidden = true;
    $('#board').classList.remove('won');
    buildBoard();
    show('game');
    updateHead();
    paint();
    if (G.race) updateRaceBar();
  }

  function buildBoard() {
    const p = G.puzzle, N = p.size, C = N * N;
    const board = $('#board');
    board.className = `board n${N}` + (p.variant === 'killer' ? ' killer' : '');
    board.style.setProperty('--n', N);
    board.style.setProperty('--nc', N === 9 ? 3 : 4);
    const noteHtml = Array.from({ length: N }, (_, i) => `<i>${SYM[i]}</i>`).join('');
    let html = '';
    for (let c = 0; c < C; c++) html += `<div class="cell" data-c="${c}" role="gridcell"><span class="v"></span><span class="nt">${noteHtml}</span></div>`;
    board.innerHTML = html;
    cells = $$('.cell', board).map(el => ({ el, v: el.children[0], notes: Array.from(el.children[1].children), cls: '', txt: null, nkey: '' }));
    if (p.cages) {
      for (const cg of p.cages) {
        const s = document.createElement('span');
        s.className = 'sum';
        s.textContent = cg.sum;
        cells[Math.min(...cg.cells)].el.appendChild(s);
      }
    }
    drawOverlay();
    buildPad();
  }

  function drawOverlay() {
    const p = G.puzzle, N = p.size, svg = $('#overlay');
    svg.setAttribute('viewBox', `0 0 ${N} ${N}`);
    let s = '';
    if (p.variant === 'diagonal') s += `<line class="diag" x1="0" y1="0" x2="${N}" y2="${N}"/><line class="diag" x1="${N}" y1="0" x2="0" y2="${N}"/>`;
    for (let i = 1; i < N; i++) {
      if (i % geo.bc) s += `<line class="thin" x1="${i}" y1="0" x2="${i}" y2="${N}"/>`;
      if (i % geo.br) s += `<line class="thin" x1="0" y1="${i}" x2="${N}" y2="${i}"/>`;
    }
    if (p.cages) s += `<path class="cage" d="${cagePath(p)}"/>`;
    for (let i = geo.bc; i < N; i += geo.bc) s += `<line class="thick" x1="${i}" y1="0" x2="${i}" y2="${N}"/>`;
    for (let i = geo.br; i < N; i += geo.br) s += `<line class="thick" x1="0" y1="${i}" x2="${N}" y2="${i}"/>`;
    svg.innerHTML = s;
  }

  // Dashed cage outlines drawn just inside each cage's edge.
  function cagePath(p) {
    const N = p.size, e = 0.09, owner = new Int16Array(N * N).fill(-1);
    p.cages.forEach((cg, i) => cg.cells.forEach(c => { owner[c] = i; }));
    const f = n => +n.toFixed(3);
    let d = '';
    for (let c = 0; c < N * N; c++) {
      const r = Math.floor(c / N), k = c % N, id = owner[c];
      const same = (dr, dk) => { const rr = r + dr, kk = k + dk; return rr >= 0 && rr < N && kk >= 0 && kk < N && owner[rr * N + kk] === id; };
      const seg = (x1, y1, x2, y2) => { d += `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`; };
      if (!same(-1, 0)) seg(!same(0, -1) ? k + e : same(-1, -1) ? k - e : k, r + e, !same(0, 1) ? k + 1 - e : same(-1, 1) ? k + 1 + e : k + 1, r + e);
      if (!same(1, 0)) seg(!same(0, -1) ? k + e : same(1, -1) ? k - e : k, r + 1 - e, !same(0, 1) ? k + 1 - e : same(1, 1) ? k + 1 + e : k + 1, r + 1 - e);
      if (!same(0, -1)) seg(k + e, !same(-1, 0) ? r + e : same(-1, -1) ? r - e : r, k + e, !same(1, 0) ? r + 1 - e : same(1, -1) ? r + 1 + e : r + 1);
      if (!same(0, 1)) seg(k + 1 - e, !same(-1, 0) ? r + e : same(-1, 1) ? r - e : r, k + 1 - e, !same(1, 0) ? r + 1 - e : same(1, 1) ? r + 1 + e : r + 1);
    }
    return d;
  }

  function buildPad() {
    const N = G.puzzle.size, pad = $('#pad');
    pad.style.setProperty('--cols', N === 9 ? 9 : N / 2);
    pad.classList.toggle('rows2', N > 9);
    pad.innerHTML = Array.from({ length: N }, (_, i) =>
      `<button type="button" class="key" data-d="${i + 1}" aria-label="Number ${SYM[i]}"><span class="kd">${SYM[i]}</span><span class="kc"></span></button>`).join('');
    keys = $$('.key', pad).map(el => ({ el, kc: el.children[1] }));
  }

  function layoutBoard() {
    if (!G || $('#game').hidden) return;
    const st = $('#stage'), cs = getComputedStyle(st);
    const w = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const N = G.puzzle.size;
    const size = Math.max(N * 16, Math.floor(Math.min(w, h, 640) / N) * N);
    const wrap = $('#board-wrap');
    wrap.style.width = size + 'px';
    wrap.style.height = size + 'px';
    $('#board').style.setProperty('--cs', size / N + 'px');
  }
  try { new ResizeObserver(() => layoutBoard()).observe($('#stage')); } catch (e) { window.addEventListener('resize', layoutBoard); }

  function paint() {
    if (!G || !cells.length) return;
    const p = G.puzzle, N = p.size, C = N * N, sol = p.solution;
    const peerMask = new Uint8Array(C), lane = new Uint8Array(C);
    // Blue lines: only for a number picked on the pad, and only on empty cells it can't use.
    const lanesOn = !!(laneDigit && settings.lanes);
    if (settings.peers && sel >= 0 && !lanesOn) for (const x of geo.peers[sel]) peerMask[x] = 1;
    if (lanesOn) {
      for (let c = 0; c < C; c++) {
        if (G.vals[c] !== laneDigit || G.vals[c] !== sol[c]) continue;
        for (const u of geo.unitsOf[c]) {
          if (geo.kinds[u] === 'box' && !settings.laneBoxes) continue;
          for (const x of geo.units[u]) if (!G.vals[x]) lane[x] = 1;
        }
      }
    }
    const hv = hintView, hArea = new Uint8Array(C), hKey = new Uint8Array(C);
    if (hv) {
      hv.area.forEach(x => { hArea[x] = 1; });
      (hv.steps || []).forEach(s => s.cells.forEach(x => { hArea[x] = 1; }));
      hv.cells.forEach(x => { hKey[x] = 1; });
    }
    const counts = new Array(N + 1).fill(0);
    const showSame = settings.sameNumbers && active;
    for (let c = 0; c < C; c++) {
      const v = G.vals[c], cell = cells[c];
      const wrong = v && v !== sol[c];
      if (v && !wrong) counts[v]++;
      let cls = 'cell';
      if (!v) cls += ' empty';
      else if (p.givens[c]) cls += ' given';
      else cls += wrong ? ' wrong' : ' user';
      if (hv) {
        if (hArea[c]) cls += ' h-area';
        if (hKey[c]) cls += ' h-key';
        if (hv.cell === c) cls += ' h-target';
      } else {
        if (peerMask[c]) cls += ' peer';
        if (lane[c]) cls += ' lane';
        if (showSame && v === active && !wrong) cls += ' same';
        if (c === sel) cls += ' sel';
      }
      if (cell.cls !== cls) { cell.el.className = cls; cell.cls = cls; }
      const txt = v ? SYM[v - 1] : '';
      if (cell.txt !== txt) { cell.v.textContent = txt; cell.txt = txt; }
      const nm = v ? 0 : G.notes[c];
      const nkey = nm + ':' + (showSame ? active : 0);
      if (cell.nkey !== nkey) {
        cell.nkey = nkey;
        for (let d = 1; d <= N; d++) {
          const onBit = nm & (1 << (d - 1));
          cell.notes[d - 1].className = onBit ? (showSame && d === active ? 'on hl' : 'on') : '';
        }
      }
    }
    for (let d = 1; d <= N; d++) {
      const k = keys[d - 1];
      if (!k) continue;
      const left = N - counts[d];
      k.kc.textContent = left > 0 ? left : '';
      k.el.classList.toggle('done', left <= 0);
      k.el.classList.toggle('active', active === d);
    }
    const ok = playable();
    $('#t-undo').disabled = !ok || !G.undo.length;
    $('#t-fill').disabled = !ok;
    $('#t-erase').disabled = !ok;
    $('#t-hint').disabled = !ok || !!G.race;
  }

  function updateHead() {
    if (!G) return;
    const p = G.puzzle;
    $('#g-level').textContent = (G.daily ? 'Daily · ' : G.race ? 'Race · ' : '') + LEVEL_NAMES[p.difficulty];
    $('#g-kind').textContent = `${VARIANTS[p.variant]} ${SIZES[p.size]}` + (G.status === 'practice' ? ' · practice' : '');
    const s = $('#g-strikes');
    const limited = (settings.strikes || G.race) && G.status !== 'practice';
    s.classList.toggle('off', !limited);
    s.innerHTML = Array.from({ length: STRIKES }, (_, i) => `<i class="${i < G.mistakes ? 'on' : ''}"></i>`).join('');
    s.setAttribute('aria-label', `Mistakes: ${G.mistakes} of ${STRIKES}`);
    $('#g-pause').hidden = !!G.race;
    $('#race-bar').hidden = !G.race;
    $('#t-notes').setAttribute('aria-pressed', String(notesMode));
    $('#notes-pill').textContent = notesMode ? 'On' : 'Off';
    renderClock();
  }

  // One-off cell animations live in data-fx so repaints (className) never cut them short.
  function fx(c, name) {
    const el = cells[c] && cells[c].el;
    if (!el) return;
    delete el.dataset.fx;
    void el.offsetWidth;
    el.dataset.fx = name;
    clearTimeout(el._fxT);
    el._fxT = setTimeout(() => { delete el.dataset.fx; }, 1500);
  }

  // ---------------------------------------------------------------- input
  function tapCell(c) {
    if (!playable()) return;
    if (hintView) closeHint();
    const v = G.vals[c];
    if (settings.inputMode === 'number' && active && !isLocked(c)) {
      sel = c;
      if (notesMode) toggleNote(c, active);
      else if (v === active) eraseCell(c);
      else if (!digitDone(active)) enter(c, active);
      else paint();
      return;
    }
    sel = c;
    if (v) {
      active = v;
      if (settings.inputMode === 'number') laneDigit = v;
      else if (laneDigit !== v) laneDigit = 0;
    }
    paint();
  }

  function tapKey(d) {
    if (!playable()) return;
    if (hintView) closeHint();
    if (settings.inputMode === 'number') { active = active === d ? 0 : d; laneDigit = active; paint(); return; }
    const editable = sel >= 0 && !isLocked(sel);
    if (!editable && laneDigit === d) { laneDigit = 0; active = 0; paint(); return; } // tap again to clear
    active = d;
    laneDigit = digitDone(d) ? 0 : d;
    if (editable) {
      if (notesMode) { toggleNote(sel, d); return; }
      if (G.vals[sel] !== d && !digitDone(d)) { enter(sel, d); return; }
    }
    paint();
  }

  function enter(c, d) {
    if (!playable() || isLocked(c)) return;
    const before = snap();
    const p = G.puzzle;
    G.vals[c] = d;
    G.notes[c] = 0;
    const correct = d === p.solution[c];
    if (correct && settings.autoClear) {
      const b = ~(1 << (d - 1));
      for (const x of model.peers[c]) G.notes[x] &= b;
    }
    pushUndo(before);
    active = d;
    if (correct && laneDigit === d && digitDone(d)) laneDigit = 0; // all placed: nothing left to guide
    if (correct) { fx(c, 'pop'); celebrate(c); buzz(8); } else addMistake(c);
    afterChange();
  }

  function eraseCell(c) {
    if (!playable() || isLocked(c)) return;
    if (!G.vals[c] && !G.notes[c]) return;
    const before = snap();
    if (G.vals[c]) G.vals[c] = 0; else G.notes[c] = 0;
    pushUndo(before);
    afterChange();
  }

  function toggleNote(c, d) {
    if (!playable() || G.vals[c]) return;
    const before = snap();
    G.notes[c] ^= 1 << (d - 1);
    pushUndo(before);
    paint();
    saveSoon();
  }

  function fillNotes() {
    if (!playable()) return;
    const p = G.puzzle, before = snap();
    const clean = G.vals.map((v, c) => (v === p.solution[c] ? v : 0));
    const cand = E.basicCandidates(p, clean);
    let n = 0;
    G.vals.forEach((v, c) => { if (!v) { G.notes[c] = cand[c]; n++; } });
    if (!n) return;
    pushUndo(before);
    paint();
    saveSoon();
    toast('Notes filled in for every empty cell');
  }

  function undo() {
    if (!playable() || !G.undo.length) return;
    G.redo.push(snap());
    const s = G.undo.pop();
    G.vals = s.vals; G.notes = s.notes;
    afterChange(true);
  }
  function redo() {
    if (!playable() || !G.redo.length) return;
    G.undo.push(snap());
    const s = G.redo.pop();
    G.vals = s.vals; G.notes = s.notes;
    afterChange(true);
  }

  function afterChange(quiet) {
    paint();
    saveSoon();
    if (G.race) { sendProgress(); updateRaceBar(); }
    if (!quiet || G.vals.every((v, c) => v === G.puzzle.solution[c])) checkWin();
  }

  function addMistake(c) {
    G.mistakes++;
    buzz([40, 50, 40]);
    fx(c, 'shake');
    updateHead();
    const limited = G.status === 'playing' && (settings.strikes || G.race);
    if (limited && G.mistakes >= STRIKES) lose();
  }

  function celebrate(c) {
    const sol = G.puzzle.solution;
    for (const u of geo.unitsOf[c]) {
      const us = geo.units[u];
      if (!us.every(x => G.vals[x] === sol[x])) continue;
      us.forEach((x, i) => { cells[x].el.style.setProperty('--i', i); fx(x, 'flash'); });
    }
  }

  const board = $('#board');
  board.addEventListener('pointerdown', e => {
    const el = e.target.closest('.cell');
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    tapCell(+el.dataset.c);
  });
  $('#pad').addEventListener('click', e => { const k = e.target.closest('.key'); if (k) tapKey(+k.dataset.d); });
  $('#t-undo').onclick = undo;
  $('#t-erase').onclick = () => { if (sel >= 0) eraseCell(sel); else toast('Tap a cell first, then Erase'); };
  $('#t-notes').onclick = () => { notesMode = !notesMode; updateHead(); };
  $('#t-fill').onclick = fillNotes;
  $('#t-hint').onclick = showHint;
  $('#g-home').onclick = () => goHome();
  $('#g-pause').onclick = openPause;
  $('#cover').onclick = resumeGame;

  document.addEventListener('keydown', e => {
    if (sheetOpen()) { if (e.key === 'Escape' && !sheetLocked) closeSheet('dismiss'); return; }
    if ($('#game').hidden || !G) return;
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    const k = e.key, N = G.puzzle.size;
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (paused && (k === ' ' || k === 'Enter')) { e.preventDefault(); resumeGame(); return; }
    if (k.startsWith('Arrow')) {
      e.preventDefault();
      if (!playable()) return;
      if (sel < 0) sel = 0;
      else {
        let r = Math.floor(sel / N), c = sel % N;
        if (k === 'ArrowUp') r = (r + N - 1) % N;
        if (k === 'ArrowDown') r = (r + 1) % N;
        if (k === 'ArrowLeft') c = (c + N - 1) % N;
        if (k === 'ArrowRight') c = (c + 1) % N;
        sel = r * N + c;
      }
      if (G.vals[sel]) { active = G.vals[sel]; if (laneDigit !== active) laneDigit = 0; }
      paint();
      return;
    }
    if (k === 'Backspace' || k === 'Delete' || (k === '0' && N <= 9)) { e.preventDefault(); if (sel >= 0) eraseCell(sel); return; }
    if (k === 'Escape') { if (hintView) closeHint(); else { sel = -1; active = 0; laneDigit = 0; paint(); } return; }
    const lower = k.toLowerCase();
    if (lower === 'n' || k === ' ') { e.preventDefault(); notesMode = !notesMode; updateHead(); return; }
    if (lower === 'u') { undo(); return; }
    if (lower === 'h' && N <= 9) { showHint(); return; }
    const idx = SYM.indexOf(k.toUpperCase());
    if (idx >= 0 && idx < N && k.length === 1) {
      e.preventDefault();
      if (!playable()) return;
      const d = idx + 1;
      if (sel >= 0 && !isLocked(sel)) {
        active = d;
        laneDigit = digitDone(d) ? 0 : d;
        if (notesMode) toggleNote(sel, d);
        else if (G.vals[sel] !== d && !digitDone(d)) enter(sel, d);
        else paint();
      } else tapKey(d);
    }
  });

  // ------------------------------------------------------------- hints
  function showHint() {
    if (!playable() || G.race) return;
    const p = G.puzzle;
    let hv;
    const wrong = G.vals.findIndex((v, c) => v && v !== p.solution[c]);
    if (wrong >= 0) {
      hv = { kind: 'wrong', name: 'Fix this first', text: `This ${SYM[G.vals[wrong] - 1]} doesn't belong here. Erase it, then look again.`, cell: wrong, digit: 0, area: [], cells: [], steps: [] };
    } else {
      const h = E.hint(p, G.vals);
      if (!h) return;
      hv = Object.assign({}, h.step, { steps: h.chain });
    }
    hintView = hv;
    G.hints++;
    sel = hv.cell;
    const steps = hv.steps || [];
    $('#hint-name').textContent = hv.name;
    $('#hint-steps').innerHTML = (steps.length > 3 ? `<li>${steps.length - 3} earlier steps narrow things down.</li>` : '') +
      steps.slice(-3).map(s => `<li><b>${esc(s.name)}.</b> ${esc(s.text)}</li>`).join('');
    $('#hint-text').textContent = (steps.length ? 'So: ' : '') + hv.text;
    $('#hint-apply').textContent = hv.kind === 'wrong' ? 'Erase it' : `Place ${SYM[hv.digit - 1]} here`;
    $('#hint').hidden = false;
    paint();
    saveSoon();
  }
  function closeHint() {
    if (!hintView) return;
    hintView = null;
    $('#hint').hidden = true;
    paint();
  }
  $('#hint-close').onclick = closeHint;
  $('#hint-apply').onclick = () => {
    const hv = hintView;
    closeHint();
    if (!hv || !playable()) return;
    if (hv.kind === 'wrong') eraseCell(hv.cell);
    else { sel = hv.cell; enter(hv.cell, hv.digit); }
  };

  // ---------------------------------------------------------- pause, end
  function pauseGame() {
    if (!G || paused || G.race || !['playing', 'practice'].includes(G.status)) return;
    paused = true;
    stopClock();
    closeHint();
    $('#cover').hidden = false;
    paint();
    save();
  }
  function resumeGame() {
    if (!paused) return;
    paused = false;
    $('#cover').hidden = true;
    startClock();
    paint();
  }

  function openPause() {
    if (!G || G.race) return;
    const wasPlaying = ['playing', 'practice'].includes(G.status);
    if (wasPlaying) pauseGame();
    const p = G.puzzle;
    openSheet(`
      <h2 id="sheet-title">Paused</h2>
      <div class="facts">
        <div class="fact"><span>Time</span><b>${fmt(elapsed())}</b></div>
        <div class="fact"><span>Mistakes</span><b>${G.mistakes}</b></div>
        <div class="fact"><span>Hints</span><b>${G.hints}</b></div>
      </div>
      <p class="small">${esc(label(p))}${p.code ? ` · code <b>${esc(p.code)}</b>` : ''}</p>
      <div class="actions">
        <button type="button" class="btn primary big" data-a="resume">Keep going</button>
        ${p.code ? '<button type="button" class="btn" data-a="share">Share this puzzle</button>' : ''}
        <button type="button" class="btn" data-a="restart">Restart this puzzle</button>
        <button type="button" class="btn" data-a="new">New puzzle, same settings</button>
        <button type="button" class="btn ghost" data-a="menu">Back to menu</button>
      </div>`, {
      onClose: () => { if (wasPlaying && !$('#game').hidden) resumeGame(); },
      onMount: b => {
        on(b, '[data-a=resume]', () => closeSheet());
        on(b, '[data-a=share]', () => shareText(`Try this Sudoku in Blueline: ${p.code}\n${appUrl()}#play-${p.code}`));
        on(b, '[data-a=restart]', () => { sheetOnClose = null; closeSheet(); restartPuzzle(); });
        on(b, '[data-a=new]', () => { sheetOnClose = null; closeSheet(); newGame({ variant: p.variant, size: p.size, difficulty: p.difficulty }); });
        on(b, '[data-a=menu]', () => { sheetOnClose = null; closeSheet(); goHome(); });
      },
    });
  }

  function restartPuzzle() {
    if (!G) return;
    const extra = { daily: G.daily };
    startGame(G.puzzle, extra);
  }

  function checkWin() {
    const sol = G.puzzle.solution;
    for (let c = 0; c < sol.length; c++) if (G.vals[c] !== sol[c]) return;
    win();
  }

  function waveFrom(c0) {
    const N = G.puzzle.size, r0 = Math.floor(c0 / N), k0 = c0 % N;
    cells.forEach((cell, c) => cell.el.style.setProperty('--d', Math.abs(Math.floor(c / N) - r0) + Math.abs(c % N - k0)));
    const b = $('#board');
    b.classList.remove('won');
    void b.offsetWidth;
    b.classList.add('won');
  }

  function win() {
    if (!['playing', 'practice'].includes(G.status)) return;
    const counted = G.status === 'playing';
    stopClock();
    if (G.race) G.race.endAt = G.race.endAt || Date.now();
    const time = elapsed();
    G.status = 'won';
    G.finalTime = time;
    const last = sel >= 0 ? sel : 0;
    sel = -1; active = 0; laneDigit = 0;
    closeHint();
    paint();
    waveFrom(last);
    buzz([20, 60, 20, 60, 40]);
    let rec = null;
    if (counted && !G.race) rec = recordResult(G.puzzle, true, time);
    if (counted && G.daily) recordDaily(G.daily, time);
    save();
    if (G.race) { raceSolved(time); return; }
    setTimeout(() => showWinSheet(time, rec, counted), 850);
  }

  function lose() {
    if (G.status !== 'playing') return;
    G.status = 'lost';
    stopClock();
    if (G.race) G.race.endAt = Date.now();
    sel = -1;
    closeHint();
    if (!G.race) recordResult(G.puzzle, false, 0);
    save();
    paint();
    updateHead();
    if (G.race) { raceOut(); return; }
    setTimeout(showLoseSheet, 500);
  }

  function showWinSheet(time, rec, counted) {
    const p = G.puzzle, s = rec && rec.stat;
    let badge = '';
    if (!counted) badge = '<span class="badge">Practice round, not counted</span>';
    else if (rec && rec.newBest) badge = '<span class="badge good">New best time</span>';
    else if (rec && rec.first) badge = `<span class="badge good">First ${esc(LEVEL_NAMES[p.difficulty])} win</span>`;
    else if (s && s.best) badge = `<span class="badge">Best ${fmt(s.best)}</span>`;
    const dailyLine = G.daily && counted ? `<p class="small">Daily streak: <b>${dailyStreakNow()} day${dailyStreakNow() === 1 ? '' : 's'}</b></p>` : '';
    openSheet(`
      <h2 id="sheet-title">Solved</h2>
      <div>${badge}</div>
      <div class="facts">
        <div class="fact"><span>Time</span><b>${fmt(time)}</b></div>
        <div class="fact"><span>Mistakes</span><b>${G.mistakes}</b></div>
        <div class="fact"><span>Hints</span><b>${G.hints}</b></div>
      </div>
      ${dailyLine}
      <p class="small">${esc(label(p))}${s ? ` · ${s.won} win${s.won === 1 ? '' : 's'}, streak ${s.streak}` : ''}</p>
      <div class="actions">
        <button type="button" class="btn primary big" data-a="new">New ${esc(LEVEL_NAMES[p.difficulty])} puzzle</button>
        ${p.code ? '<button type="button" class="btn" data-a="share">Challenge someone to beat your time</button>' : ''}
        <button type="button" class="btn ghost" data-a="menu">Back to menu</button>
      </div>`, {
      onMount: b => {
        on(b, '[data-a=new]', () => newGame({ variant: p.variant, size: p.size, difficulty: p.difficulty }));
        on(b, '[data-a=share]', () => shareText(`I solved this ${label(p)} Sudoku in ${fmt(time)}. Can you beat it? Code: ${p.code}\n${appUrl()}#play-${p.code}`));
        on(b, '[data-a=menu]', () => { closeSheet(); goHome(); });
      },
    });
  }

  function showLoseSheet() {
    const p = G.puzzle;
    openSheet(`
      <h2 id="sheet-title">Three strikes</h2>
      <p class="lede">That's three mistakes, so this one counts as a loss. You can still finish it for practice.</p>
      <div class="actions">
        <button type="button" class="btn primary big" data-a="practice">Keep playing for practice</button>
        <button type="button" class="btn" data-a="retry">Try this puzzle again</button>
        <button type="button" class="btn" data-a="new">New ${esc(LEVEL_NAMES[p.difficulty])} puzzle</button>
        <button type="button" class="btn ghost" data-a="menu">Back to menu</button>
      </div>`, {
      locked: true,
      onMount: b => {
        on(b, '[data-a=practice]', () => { closeSheet(); G.status = 'practice'; updateHead(); startClock(); paint(); save(); });
        on(b, '[data-a=retry]', () => { closeSheet(); restartPuzzle(); });
        on(b, '[data-a=new]', () => newGame({ variant: p.variant, size: p.size, difficulty: p.difficulty }));
        on(b, '[data-a=menu]', () => { closeSheet(); G = null; store.set('game', null); show('home'); });
      },
    });
  }

  // ---------------------------------------------------------------- stats
  function recordResult(p, won, ms) {
    const k = `${p.variant}:${p.size}:${p.difficulty}`;
    const s = stats[k] || (stats[k] = { played: 0, won: 0, best: 0, total: 0, streak: 0, bestStreak: 0 });
    s.played++;
    let newBest = false;
    if (won) {
      s.won++;
      s.total += ms;
      if (!s.best || ms < s.best) { newBest = s.won > 1; s.best = ms; }
      s.streak++;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
    } else s.streak = 0;
    store.set('stats', stats);
    return { newBest, first: won && s.won === 1, stat: s };
  }
  const statFor = (v, size, lvl) => stats[`${v}:${size}:${lvl}`];

  function dailyOpts(key) {
    const d = new Date(key + 'T12:00:00');
    return { variant: 'classic', size: 9, difficulty: DAILY_LEVEL[d.getDay()], seed: key.replace(/-/g, '') };
  }
  function recordDaily(key, ms) {
    if (daily.done[key]) return;
    daily.done[key] = { t: ms, m: G.mistakes };
    if (key === dayKey()) {
      daily.streak = daily.last === addDays(key, -1) ? daily.streak + 1 : 1;
      daily.last = key;
      daily.best = Math.max(daily.best, daily.streak);
    }
    const cutoff = addDays(dayKey(), -90);
    for (const k of Object.keys(daily.done)) if (k < cutoff) delete daily.done[k];
    store.set('daily', daily);
  }
  function dailyStreakNow() {
    const t = dayKey();
    return daily.last === t || daily.last === addDays(t, -1) ? daily.streak : 0;
  }

  // ---------------------------------------------------------- new games
  function inProgress() { return G && G.status === 'playing' && !G.race && G.vals.some((v, c) => v && !G.puzzle.givens[c]); }
  function confirmReplace(go) {
    if (!inProgress()) { go(); return; }
    openSheet(`
      <h2 id="sheet-title">Start a new game?</h2>
      <p class="lede">Your ${esc(label(G.puzzle))} game in progress will be replaced. It won't count as a loss.</p>
      <div class="actions">
        <button type="button" class="btn primary big" data-a="go">Start new game</button>
        <button type="button" class="btn" data-a="keep">Keep my game</button>
      </div>`, {
      onMount: b => {
        on(b, '[data-a=go]', () => { closeSheet(); go(); });
        on(b, '[data-a=keep]', () => closeSheet());
      },
    });
  }

  let genToken = 0;
  async function newGame(opts, extra = {}) {
    const o = { variant: opts.variant, size: opts.variant === 'killer' ? 9 : opts.size, difficulty: opts.difficulty, seed: opts.seed || E.randomSeed() };
    const token = ++genToken;
    const slow = o.difficulty === 'insane' || o.difficulty === 'extreme' || o.size > 9 || o.variant === 'killer';
    const t = setTimeout(() => {
      openSheet(`
        <div class="spinner big" aria-hidden="true"></div>
        <h2 id="sheet-title" style="text-align:center">Building your puzzle</h2>
        <p class="lede" style="text-align:center">${esc(label(o))}${slow ? '. The tough ones can take a few seconds.' : ''}</p>
        <div class="actions"><button type="button" class="btn" data-a="cancel">Cancel</button></div>`, {
        locked: true,
        onMount: b => on(b, '[data-a=cancel]', () => { genToken++; cancelGeneration(); closeSheet(); }),
      });
    }, 160);
    try {
      const p = await generate(o);
      clearTimeout(t);
      if (token !== genToken) return null;
      closeSheet();
      startGame(p, extra);
      return p;
    } catch (err) {
      clearTimeout(t);
      if (token === genToken) { closeSheet(); toast('That puzzle didn’t build. Try again.'); }
      return null;
    }
  }

  function playDaily() {
    const key = dayKey();
    if (G && G.daily === key && ['playing', 'practice'].includes(G.status)) { enterGame(); startClock(); return; }
    const done = daily.done[key];
    const opts = dailyOpts(key);
    if (done) {
      openSheet(`
        <h2 id="sheet-title">Today's puzzle is done</h2>
        <div class="facts">
          <div class="fact"><span>Time</span><b>${fmt(done.t)}</b></div>
          <div class="fact"><span>Mistakes</span><b>${done.m}</b></div>
          <div class="fact"><span>Streak</span><b>${dailyStreakNow()}</b></div>
        </div>
        <p class="lede">A new ${esc(LEVEL_NAMES[dailyOpts(addDays(key, 1)).difficulty])} puzzle arrives tomorrow.</p>
        <div class="actions">
          <button type="button" class="btn primary" data-a="share">Challenge someone to today's puzzle</button>
          <button type="button" class="btn" data-a="again">Play it again for practice</button>
          <button type="button" class="btn ghost" data-a="close">Close</button>
        </div>`, {
        onMount: b => {
          const code = E.makeCode(opts);
          on(b, '[data-a=share]', () => shareText(`I did today's Blueline Sudoku in ${fmt(done.t)}. Your turn: ${code}\n${appUrl()}#play-${code}`));
          on(b, '[data-a=again]', () => { closeSheet(); confirmReplace(async () => { const p = await newGame(opts); if (p && G) { G.status = 'practice'; updateHead(); save(); } }); });
          on(b, '[data-a=close]', () => closeSheet());
        },
      });
      return;
    }
    confirmReplace(() => newGame(opts, { daily: key }));
  }

  // ----------------------------------------------------------------- home
  function segSet(root, val) {
    $$('button', $(root)).forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === String(val))));
  }
  function renderLevels() {
    $('#pick-level').innerHTML = LEVELS.map(l => {
      const s = statFor(pick.variant, pick.variant === 'killer' ? 9 : pick.size, l);
      const best = s && s.best ? `Best ${fmt(s.best)}` : 'No wins yet';
      return `<button type="button" role="radio" class="level lv-${l}" data-v="${l}" aria-checked="${pick.difficulty === l}"><b>${LEVEL_NAMES[l]}</b><small>${LEVEL_TAGS[l]}</small><span class="best">${best}</span></button>`;
    }).join('');
  }

  function renderHome() {
    $('#today').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const r = $('#resume');
    if (G && ['playing', 'practice'].includes(G.status) && !G.race) {
      r.hidden = false;
      $('#resume-title').textContent = (G.daily ? 'Daily · ' : '') + label(G.puzzle);
      const pct = Math.round(100 * myFilled() / Math.max(1, emptyCount()));
      $('#resume-meta').textContent = `${fmt(elapsed())} · ${pct}% filled` + (G.mistakes ? ` · ${G.mistakes} mistake${G.mistakes > 1 ? 's' : ''}` : '') + (G.status === 'practice' ? ' · practice' : '');
    } else r.hidden = true;

    if (pick.variant === 'killer') pick.size = 9;
    segSet('#pick-variant', pick.variant);
    segSet('#pick-size', pick.size);
    $$('#pick-size button').forEach(b => { b.disabled = pick.variant === 'killer' && b.dataset.v !== '9'; });
    $('#variant-note').textContent = VARIANT_NOTES[pick.variant];
    renderLevels();
    $('#start').textContent = `Start ${LEVEL_NAMES[pick.difficulty]} ${SIZES[pick.size]}`;

    const key = dayKey(), done = daily.done[key], streak = dailyStreakNow();
    $('#daily').classList.toggle('done', !!done);
    $('#daily-title').textContent = LEVEL_NAMES[dailyOpts(key).difficulty];
    $('#daily-meta').textContent = done ? `Done in ${fmt(done.t)} · ${streak}-day streak` : streak ? `${streak}-day streak, keep it going` : 'A new puzzle every day';
    const rr = raceRecord, played = rr.wins + rr.losses + rr.draws;
    $('#race-meta').textContent = played ? `Your record ${rr.wins}–${rr.losses}${rr.draws ? '–' + rr.draws : ''}` : 'Same puzzle, live';
    $('#install').hidden = !canInstall();
  }

  $('#pick-variant').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; pick.variant = b.dataset.v; store.set('pick', pick); renderHome(); });
  $('#pick-size').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; pick.size = +b.dataset.v; store.set('pick', pick); renderHome(); });
  $('#pick-level').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; pick.difficulty = b.dataset.v; store.set('pick', pick); renderHome(); });
  $('#start').onclick = () => confirmReplace(() => newGame({ variant: pick.variant, size: pick.size, difficulty: pick.difficulty }));
  $('#resume').onclick = () => { if (!G) return; paused = false; enterGame(); startClock(); };
  $('#daily').onclick = playDaily;
  $('#race').onclick = () => openRace();
  $('#open-settings').onclick = openSettings;
  $('#open-stats').onclick = () => openStats(pick.variant, pick.size);
  $('#open-code').onclick = () => openCode();

  // ------------------------------------------------------------ settings
  function openSettings() {
    const sw = (key, title, desc) => `
      <div class="setting">
        <label for="s-${key}"><b>${title}</b><small>${desc}</small></label>
        <span class="switch"><input type="checkbox" id="s-${key}" data-k="${key}" ${settings[key] ? 'checked' : ''}><span></span></span>
      </div>`;
    const seg = (key, opts) => `<div class="seg" role="radiogroup" data-k="${key}">${Object.entries(opts).map(([v, t]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${settings[key] === v}">${t}</button>`).join('')}</div>`;
    openSheet(`
      <h2 id="sheet-title">Settings</h2>
      <div class="field"><span>Theme</span>${seg('theme', { system: 'Auto', light: 'Light', dark: 'Dark' })}</div>
      <div class="field"><span>How you enter numbers</span>${seg('inputMode', { cell: 'Cell, then number', number: 'Number, then cells' })}</div>
      <div>
        ${sw('lanes', 'Blue lines', 'Tap a number on the pad to shade the empty cells in every row and column it already sits in. The white cells left are where it can go. Tap the number again to clear.')}
        ${sw('laneBoxes', 'Shade boxes too', 'Blue lines also cover the boxes that already have that number.')}
        ${sw('sameNumbers', 'Highlight matching numbers', 'Every copy of the selected number lights up, notes included.')}
        ${sw('peers', 'Highlight row, column and box', 'Lightly shade the lines and box around the selected cell.')}
        ${sw('autoClear', 'Clear notes automatically', 'Placing a number removes it from notes in the same row, column and box.')}
        ${sw('strikes', 'Three strikes', 'Three mistakes ends the game. Races always use this rule.')}
        ${sw('timer', 'Show timer', 'Your time is still recorded when the clock is hidden.')}
        ${sw('haptics', 'Vibrate', 'A short buzz on mistakes and wins, on phones that support it.')}
      </div>
      <label class="field"><span>Your name in races</span><input class="input" id="s-name" maxlength="20" autocomplete="nickname" placeholder="Player" value="${esc(settings.name)}"></label>
      <div class="actions"><button type="button" class="btn danger" data-a="reset">Reset all stats</button></div>
      <p class="small muted">Blueline ${VERSION}. No ads, no tracking. Everything stays on this device.</p>`, {
      onMount: b => {
        $$('input[type=checkbox]', b).forEach(inp => inp.addEventListener('change', () => {
          settings[inp.dataset.k] = inp.checked;
          saveSettings();
          if (G) { updateHead(); paint(); }
        }));
        $$('.seg[data-k]', b).forEach(sg => sg.addEventListener('click', e => {
          const btn = e.target.closest('button');
          if (!btn) return;
          settings[sg.dataset.k] = btn.dataset.v;
          saveSettings();
          $$('button', sg).forEach(x => x.setAttribute('aria-checked', String(x === btn)));
          if (sg.dataset.k === 'theme') applyTheme();
          if (G) paint();
        }));
        $('#s-name', b).addEventListener('input', e => { settings.name = e.target.value.slice(0, 20); saveSettings(); });
        on(b, '[data-a=reset]', () => {
          openSheet(`<h2 id="sheet-title">Reset all stats?</h2><p class="lede">This clears best times, win streaks, your daily streak and your race record. It can't be undone.</p>
            <div class="actions"><button type="button" class="btn danger big" data-a="yes">Reset stats</button><button type="button" class="btn" data-a="no">Keep my stats</button></div>`, {
            onMount: bb => {
              on(bb, '[data-a=yes]', () => {
                for (const k of Object.keys(stats)) delete stats[k];
                Object.assign(daily, { done: {}, streak: 0, best: 0, last: '' });
                Object.assign(raceRecord, { wins: 0, losses: 0, draws: 0 });
                store.set('stats', stats); store.set('daily', daily); store.set('raceRecord', raceRecord);
                closeSheet(); renderHome(); toast('Stats reset');
              });
              on(bb, '[data-a=no]', () => openSettings());
            },
          });
        });
      },
    });
  }

  // --------------------------------------------------------------- stats
  function openStats(variant, size) {
    if (variant === 'killer') size = 9;
    let wins = 0, played = 0;
    for (const s of Object.values(stats)) { wins += s.won; played += s.played; }
    const rows = LEVELS.map(l => {
      const s = statFor(variant, size, l);
      if (!s || !s.played) return `<tr><td>${LEVEL_NAMES[l]}</td><td>0</td><td>–</td><td>–</td><td>–</td></tr>`;
      const pct = Math.round(100 * s.won / s.played);
      return `<tr><td>${LEVEL_NAMES[l]}</td><td>${s.played}</td><td>${pct}%</td><td>${s.best ? fmt(s.best) : '–'}</td><td>${s.won ? fmt(s.total / s.won) : '–'}</td></tr>`;
    }).join('');
    const rr = raceRecord;
    openSheet(`
      <h2 id="sheet-title">Stats</h2>
      <div class="facts">
        <div class="fact"><span>Wins</span><b>${wins}<small class="muted" style="font-size:13px"> / ${played}</small></b></div>
        <div class="fact"><span>Daily streak</span><b>${dailyStreakNow()}<small class="muted" style="font-size:13px"> best ${daily.best}</small></b></div>
        <div class="fact"><span>Races</span><b>${rr.wins}–${rr.losses}${rr.draws ? '–' + rr.draws : ''}</b></div>
      </div>
      <div class="seg" role="radiogroup" id="st-variant">${Object.entries(VARIANTS).map(([v, t]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${v === variant}">${t}</button>`).join('')}</div>
      <div class="seg" role="radiogroup" id="st-size">${Object.entries(SIZES).map(([v, t]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${+v === size}" ${variant === 'killer' && v !== '9' ? 'disabled' : ''}>${t}</button>`).join('')}</div>
      <div class="table-wrap"><table class="stats-table">
        <thead><tr><th>Level</th><th>Played</th><th>Won</th><th>Best</th><th>Average</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="actions"><button type="button" class="btn" data-a="close">Close</button></div>`, {
      onMount: b => {
        $('#st-variant', b).onclick = e => { const x = e.target.closest('button'); if (x) openStats(x.dataset.v, size); };
        $('#st-size', b).onclick = e => { const x = e.target.closest('button'); if (x && !x.disabled) openStats(variant, +x.dataset.v); };
        on(b, '[data-a=close]', () => closeSheet());
      },
    });
  }

  // --------------------------------------------------------- puzzle codes
  function openCode(prefill = '') {
    const current = G && G.puzzle && G.puzzle.code && ['playing', 'practice'].includes(G.status) ? G.puzzle.code : '';
    openSheet(`
      <h2 id="sheet-title">Puzzle code</h2>
      <p class="lede">Every puzzle has a code. Enter someone's code to play the exact same puzzle, then compare times.</p>
      <input class="input code" id="code-in" maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="C9H-K7P2Q" value="${esc(prefill)}" aria-label="Puzzle code">
      <p class="status-line err" id="code-err" hidden></p>
      <div class="actions">
        <button type="button" class="btn primary big" data-a="go">Play this puzzle</button>
        ${current ? `<button type="button" class="btn" data-a="share">Share my current puzzle (${esc(current)})</button>` : ''}
        <button type="button" class="btn ghost" data-a="close">Close</button>
      </div>`, {
      onMount: b => {
        const inp = $('#code-in', b), err = $('#code-err', b);
        const go = () => {
          const o = E.parseCode(inp.value);
          if (!o) { err.hidden = false; err.textContent = 'That code doesn’t look right. Codes look like C9H-K7P2Q.'; return; }
          closeSheet();
          confirmReplace(() => newGame(o));
        };
        on(b, '[data-a=go]', go);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        on(b, '[data-a=share]', () => shareText(`Try this Sudoku in Blueline: ${current}\n${appUrl()}#play-${current}`));
        on(b, '[data-a=close]', () => closeSheet());
      },
    });
  }

  // ---------------------------------------------------------------- races
  let R = null;  // lobby state
  const myName = () => (settings.name || '').trim().slice(0, 20) || 'Player';
  const cleanName = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Opponent';

  function netError(err) {
    const type = err && err.type;
    if (type === 'peer-unavailable') return `No race found with code ${R && R.code ? R.code : 'that code'}. Check the code, and make sure they're still on the waiting screen.`;
    if (type === 'timeout') return 'Couldn’t connect to that race. Make sure you’re both online, then try again.';
    if (type === 'lib') return 'Couldn’t load the race tools. Check your internet connection.';
    if (type === 'browser-incompatible') return 'This browser can’t run live races. Try Chrome or Safari.';
    if (type === 'busy') return 'That race already has two players.';
    return 'Couldn’t reach the race server. Check your internet connection and try again.';
  }

  function openRace(joinCode = '') {
    if (G && G.race) return;
    if (!R) R = { phase: 'choose', role: null, opts: { variant: pick.variant, size: pick.size, difficulty: pick.difficulty } };
    if (joinCode) { R.phase = 'join'; R.prefill = joinCode; }
    renderRace();
  }

  function selectHtml(id, opts, val, lbl) {
    return `<select class="select" id="${id}" aria-label="${lbl}">${Object.entries(opts).map(([v, t]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  }

  function renderRace() {
    if (!R) return;
    const o = R.opts;
    const nameField = `<label class="field"><span>Your name</span><input class="input" id="race-name" maxlength="20" autocomplete="nickname" placeholder="Player" value="${esc(settings.name || '')}"></label>`;
    const opp = esc(R.oppName || 'Your opponent');
    let html = '';
    switch (R.phase) {
      case 'choose':
        html = `<h2 id="sheet-title">Race</h2>
          <p class="lede">You both get the same puzzle at the same moment. First to finish wins. Three mistakes and you're out.</p>
          ${nameField}
          <div class="choice">
            <button type="button" data-a="host"><b>Create a race</b><small>Get a code to send</small></button>
            <button type="button" data-a="join"><b>Join a race</b><small>Type in their code</small></button>
          </div>
          <div class="actions"><button type="button" class="btn ghost" data-a="leave">Close</button></div>`;
        break;
      case 'setup':
        html = `<h2 id="sheet-title">Create a race</h2>
          <p class="lede">Pick the puzzle you'll both play.</p>
          <div class="selects">
            ${selectHtml('race-variant', VARIANTS, o.variant, 'Style')}
            ${selectHtml('race-size', SIZES, o.variant === 'killer' ? 9 : o.size, 'Grid size')}
            ${selectHtml('race-level', LEVEL_NAMES, o.difficulty, 'Difficulty')}
          </div>
          <div class="actions">
            <button type="button" class="btn primary big" data-a="create">Create race</button>
            <button type="button" class="btn ghost" data-a="back">Back</button>
          </div>`;
        break;
      case 'hosting':
        html = `<h2 id="sheet-title">Create a race</h2>
          <div class="status-line"><span class="spinner"></span>Setting up your race…</div>
          <div class="actions"><button type="button" class="btn ghost" data-a="leave">Cancel</button></div>`;
        break;
      case 'waiting':
        html = `<h2 id="sheet-title">Send this code</h2>
          <p class="lede">${esc(label(o))}. Your opponent opens Blueline, taps Race, then Join a race.</p>
          <div class="race-code" aria-label="Race code">${esc(R.code)}</div>
          <div class="actions row">
            <button type="button" class="btn primary" data-a="share">Share code</button>
            <button type="button" class="btn" data-a="copy">Copy</button>
          </div>
          <div class="status-line"><span class="spinner"></span>Waiting for your opponent to join…</div>
          <p class="small muted">Keep Blueline open on this screen until they join.</p>
          <div class="actions"><button type="button" class="btn ghost" data-a="leave">Cancel race</button></div>`;
        break;
      case 'ready':
        html = `<h2 id="sheet-title">${opp} is here</h2>
          <p class="lede">${esc(label(o))}. When you tap Start, you both get a 3-second countdown.</p>
          <div class="status-line ok">Connected</div>
          <div class="actions">
            <button type="button" class="btn primary big" data-a="start" ${R.starting ? 'disabled' : ''}>${R.starting ? 'Getting the puzzle ready…' : 'Start race'}</button>
            <button type="button" class="btn ghost" data-a="leave">Leave race</button>
          </div>`;
        break;
      case 'join':
        html = `<h2 id="sheet-title">Join a race</h2>
          <p class="lede">Type in the 5-letter code your opponent sent you.</p>
          <input class="input code" id="race-code-in" maxlength="5" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="K7P2Q" value="${esc(R.prefill || '')}" aria-label="Race code">
          ${R.error ? `<p class="status-line err">${esc(R.error)}</p>` : ''}
          <div class="actions">
            <button type="button" class="btn primary big" data-a="dojoin">Join race</button>
            <button type="button" class="btn ghost" data-a="back">Back</button>
          </div>`;
        break;
      case 'joining':
        html = `<h2 id="sheet-title">Join a race</h2>
          <div class="status-line"><span class="spinner"></span>Connecting to race ${esc(R.code)}…</div>
          <div class="actions"><button type="button" class="btn ghost" data-a="leave">Cancel</button></div>`;
        break;
      case 'joined':
        html = `<h2 id="sheet-title">You're in</h2>
          <p class="lede">Connected to ${opp}. The race starts when they tap Start.</p>
          <div class="status-line"><span class="spinner"></span>Waiting for the start…</div>
          <div class="actions"><button type="button" class="btn ghost" data-a="leave">Leave race</button></div>`;
        break;
      case 'error':
        html = `<h2 id="sheet-title">Race stopped</h2>
          <p class="status-line err">${esc(R.error || 'The connection dropped.')}</p>
          <div class="actions">
            <button type="button" class="btn primary" data-a="restart">Try again</button>
            <button type="button" class="btn ghost" data-a="leave">Close</button>
          </div>`;
        break;
      default: return;
    }
    openSheet(html, { locked: true, onMount: wireRace });
  }

  function wireRace(b) {
    const nameIn = $('#race-name', b);
    if (nameIn) nameIn.addEventListener('input', () => { settings.name = nameIn.value.slice(0, 20); saveSettings(); });
    on(b, '[data-a=host]', () => { R.phase = 'setup'; renderRace(); });
    on(b, '[data-a=join]', () => { R.phase = 'join'; R.error = ''; renderRace(); });
    on(b, '[data-a=back]', () => { R.phase = 'choose'; R.error = ''; renderRace(); });
    on(b, '[data-a=leave]', () => leaveRace());
    on(b, '[data-a=restart]', () => { Race.close(); R = null; openRace(); });
    const vSel = $('#race-variant', b);
    if (vSel) vSel.onchange = () => { if (vSel.value === 'killer') $('#race-size', b).value = '9'; };
    on(b, '[data-a=create]', async () => {
      R.opts = { variant: vSel.value, size: vSel.value === 'killer' ? 9 : +$('#race-size', b).value, difficulty: $('#race-level', b).value };
      R.role = 'host'; R.phase = 'hosting';
      renderRace();
      try {
        const code = await Race.host(onNet);
        if (!R || R.phase !== 'hosting') return;
        R.code = code; R.phase = 'waiting';
        R.gen = generate(Object.assign({ seed: E.randomSeed() }, R.opts));
        R.gen.catch(() => {});
        renderRace();
      } catch (err) {
        if (!R) return;
        R.phase = 'error'; R.error = netError(err);
        renderRace();
      }
    });
    on(b, '[data-a=share]', () => shareText(`Race me in Blueline Sudoku! Code: ${R.code}\n${appUrl()}#race-${R.code}`));
    on(b, '[data-a=copy]', () => copyText(R.code));
    on(b, '[data-a=start]', startRaceAsHost);
    const codeIn = $('#race-code-in', b);
    const doJoin = async () => {
      const code = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 5 || [...code].some(ch => !Race.CODE_ALPHABET.includes(ch))) {
        R.prefill = code; R.error = 'Race codes are 5 letters and numbers, like K7P2Q.';
        renderRace();
        return;
      }
      R.role = 'guest'; R.code = code; R.prefill = code; R.phase = 'joining'; R.error = '';
      renderRace();
      try {
        await Race.join(code, onNet);
        if (R && R.phase === 'joining') { R.phase = 'joined'; renderRace(); }
      } catch (err) {
        if (!R) return;
        R.phase = 'join'; R.error = netError(err);
        renderRace();
      }
    };
    if (codeIn) {
      codeIn.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
      on(b, '[data-a=dojoin]', doJoin);
    }
  }

  async function startRaceAsHost() {
    if (!R || R.starting) return;
    R.starting = true;
    renderRace();
    let p = null;
    try { p = await R.gen; } catch (e) { p = null; }
    if (!p) { try { p = await generate(Object.assign({ seed: E.randomSeed() }, R.opts)); } catch (e) { p = null; } }
    if (!R) return;
    R.starting = false;
    if (!p) { R.phase = 'error'; R.error = 'The puzzle didn’t build. Try again.'; renderRace(); return; }
    if (!Race.send({ t: 'start', puzzle: p })) { R.phase = 'error'; R.error = `${R.oppName || 'Your opponent'} disconnected.`; renderRace(); return; }
    beginRace(p);
  }

  function onNet(ev) {
    if (!R) return;
    if (ev.type === 'open') {
      Race.send({ t: 'hello', name: myName(), v: 1 });
      if (R.role === 'host' && R.phase === 'waiting') { R.phase = 'ready'; renderRace(); }
      else if (R.role === 'guest' && R.phase === 'joining') { R.phase = 'joined'; renderRace(); }
      return;
    }
    if (ev.type === 'data') { handleMsg(ev.data); return; }
    if (ev.type === 'close') { oppGone(); return; }
    if (ev.type === 'error') {
      const t = ev.error && ev.error.type;
      if (R.phase === 'waiting' && ['network', 'server-error', 'socket-error', 'socket-closed'].includes(t)) { R.phase = 'error'; R.error = netError(ev.error); renderRace(); }
    }
  }

  function handleMsg(m) {
    if (!m || typeof m !== 'object' || !R) return;
    switch (m.t) {
      case 'hello':
        R.oppName = cleanName(m.name);
        if (['ready', 'joined'].includes(R.phase) && sheetOpen() && !(G && G.race)) renderRace();
        if (G && G.race) { G.race.oppName = R.oppName; updateRaceBar(); }
        break;
      case 'busy':
        Race.close();
        R.phase = 'join'; R.error = netError({ type: 'busy' });
        renderRace();
        break;
      case 'start': {
        if (R.role !== 'guest') return;
        const p = sanitizePuzzle(m.puzzle);
        if (!p) { R.phase = 'error'; R.error = 'The race puzzle arrived damaged. Ask them to start again.'; renderRace(); return; }
        beginRace(p);
        break;
      }
      case 'progress':
        if (G && G.race) { G.race.opp.filled = Math.max(0, m.filled | 0); G.race.opp.mistakes = Math.max(0, m.mistakes | 0); updateRaceBar(); }
        break;
      case 'done':
        if (G && G.race && G.race.opp.status === 'racing') { G.race.opp.status = 'done'; G.race.opp.time = Math.max(0, +m.time || 0); G.race.opp.filled = G.race.total; resolveRace(); }
        break;
      case 'out':
        if (G && G.race && G.race.opp.status === 'racing') { G.race.opp.status = 'out'; resolveRace(); }
        break;
      case 'bye':
        oppGone();
        break;
      default:
    }
  }

  function oppGone() {
    if (!R) return;
    if (G && G.race) {
      if (G.race.opp.status === 'racing') { G.race.opp.status = 'left'; resolveRace(); }
      G.race.gone = true;
      updateRaceBar();
      if (G.race.result && sheetOpen()) showRaceResult();
      return;
    }
    if (['ready', 'joined'].includes(R.phase) || R.starting) {
      R.phase = 'error'; R.error = `${R.oppName || 'Your opponent'} left the race.`; R.starting = false;
      renderRace();
    }
  }

  function sanitizePuzzle(p) {
    try {
      if (!p || typeof p !== 'object') return null;
      const size = p.size;
      if (![9, 12, 16].includes(size)) return null;
      if (!['classic', 'diagonal', 'killer'].includes(p.variant)) return null;
      if (p.variant === 'killer' && size !== 9) return null;
      const difficulty = LEVELS.includes(p.difficulty) ? p.difficulty : 'medium';
      const C = size * size;
      const ok = a => Array.isArray(a) && a.length === C && a.every(v => Number.isInteger(v) && v >= 0 && v <= size);
      if (!ok(p.givens) || !ok(p.solution) || p.solution.some(v => v === 0)) return null;
      if (p.givens.some((v, c) => v && v !== p.solution[c])) return null;
      const g = E.geometry(size, p.variant === 'diagonal');
      for (const u of g.units) if (new Set(u.map(c => p.solution[c])).size !== size) return null;
      let cages = null;
      if (p.variant === 'killer') {
        if (!Array.isArray(p.cages) || p.cages.length > 81) return null;
        const seen = new Set();
        cages = p.cages.map(cg => {
          const cs = Array.isArray(cg.cells) ? cg.cells.filter(c => Number.isInteger(c) && c >= 0 && c < 81) : [];
          cs.forEach(c => seen.add(c));
          return { cells: cs.sort((a, b) => a - b), sum: cs.reduce((s, c) => s + p.solution[c], 0) };
        }).filter(cg => cg.cells.length);
        if (seen.size !== 81) return null;
      }
      const seed = typeof p.seed === 'string' ? p.seed.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) : '';
      const out = { size, variant: p.variant, difficulty, seed, givens: p.givens.slice(), solution: p.solution.slice(), cages, clues: p.givens.filter(Boolean).length, rating: null };
      out.code = seed.length >= 4 ? E.makeCode(out) : '';
      return out;
    } catch (e) { return null; }
  }

  function beginRace(puzzle) {
    closeSheet();
    const race = {
      role: R.role, oppName: R.oppName || 'Opponent', startAt: 0, endAt: 0,
      total: puzzle.givens.filter(v => !v).length,
      opp: { filled: 0, mistakes: 0, status: 'racing', time: 0 },
      me: 'racing', myTime: 0, result: null, gone: false, note: '',
    };
    startGame(puzzle, { race });
    G.status = 'countdown';
    paint();
    updateRaceBar();
    const el = $('#countdown');
    el.hidden = false;
    let n = 3;
    const tick = () => {
      if (!G || !G.race || G.race !== race) { el.hidden = true; return; }
      if (n === 0) {
        el.hidden = true;
        G.status = 'playing';
        race.startAt = Date.now();
        startClock();
        paint();
        return;
      }
      el.textContent = n;
      el.classList.remove('tick');
      void el.offsetWidth;
      el.classList.add('tick');
      buzz(15);
      n--;
      setTimeout(tick, 850);
    };
    tick();
  }

  function sendProgress() {
    if (G && G.race && !G.race.gone) Race.send({ t: 'progress', filled: myFilled(), mistakes: G.mistakes });
  }

  function updateRaceBar() {
    if (!G || !G.race) return;
    const r = G.race, total = Math.max(1, r.total);
    const mine = Math.round(100 * myFilled() / total), theirs = Math.round(100 * r.opp.filled / total);
    $('#rb-me').style.width = mine + '%';
    $('#rb-me-pct').textContent = r.me === 'out' ? 'Out' : mine + '%';
    $('#rb-them').style.width = theirs + '%';
    $('#rb-them-pct').textContent = r.opp.status === 'done' ? fmt(r.opp.time) : r.opp.status === 'out' ? 'Out' : r.opp.status === 'left' ? 'Left' : theirs + '%';
    $('#rb-name').textContent = r.oppName;
    let note = '';
    if (r.opp.status === 'out' && r.me === 'racing') note = `${r.oppName} is out of mistakes. Finish to win.`;
    else if (r.opp.status === 'left' || (r.gone && !r.result)) note = `${r.oppName} left the race.`;
    else if (r.opp.mistakes && r.opp.status === 'racing') note = `${r.oppName}: ${r.opp.mistakes} mistake${r.opp.mistakes > 1 ? 's' : ''}`;
    const nEl = $('#rb-note');
    nEl.textContent = note;
    nEl.hidden = !note;
  }

  function raceSolved(time) {
    const r = G.race;
    r.me = 'done'; r.myTime = time;
    Race.send({ t: 'done', time });
    resolveRace();
  }
  function raceOut() {
    G.race.me = 'out';
    Race.send({ t: 'out' });
    resolveRace();
  }

  function resolveRace() {
    const r = G.race;
    updateRaceBar();
    if (r.result) return;
    const me = r.me, op = r.opp.status;
    let result = null;
    if (me === 'done') {
      if (op === 'done') result = r.myTime < r.opp.time ? 'win' : r.myTime > r.opp.time ? 'loss' : 'draw';
      else result = 'win';
    } else if (me === 'out') {
      result = op === 'out' ? 'draw' : 'loss';
    } else if (op === 'done') result = 'loss';
    else if (op === 'left') result = 'win';
    if (!result) return;
    r.result = result;
    raceRecord[result === 'win' ? 'wins' : result === 'loss' ? 'losses' : 'draws']++;
    store.set('raceRecord', raceRecord);
    setTimeout(showRaceResult, me === 'done' ? 850 : 300);
  }

  function showRaceResult() {
    if (!G || !G.race || !G.race.result) return;
    const r = G.race, opp = esc(r.oppName);
    let title, lede;
    if (r.result === 'win') {
      title = 'You win';
      if (r.opp.status === 'done') lede = `You beat ${opp} by ${fmt(r.opp.time - r.myTime)}.`;
      else if (r.opp.status === 'out') lede = `${opp} ran out of mistakes and you finished.`;
      else if (r.opp.status === 'left') lede = `${opp} left the race, so it goes to you.`;
      else lede = `You finished first. ${opp} was at ${Math.round(100 * r.opp.filled / Math.max(1, r.total))}%.`;
    } else if (r.result === 'loss') {
      title = `${opp} wins`;
      lede = r.me === 'out' ? 'Three mistakes, so you’re out of this one.' : `${opp} finished in ${fmt(r.opp.time)}.`;
    } else {
      title = 'It’s a draw';
      lede = r.me === 'out' ? 'You both ran out of mistakes.' : 'You finished in the same time.';
    }
    const canKeep = G.status === 'playing' || G.status === 'lost';
    const host = r.role === 'host', connected = !r.gone && Race.isOpen();
    openSheet(`
      <h2 id="sheet-title">${title}</h2>
      <p class="lede">${lede}</p>
      <div class="facts">
        <div class="fact"><span>You</span><b>${r.me === 'done' ? fmt(r.myTime) : r.me === 'out' ? 'Out' : Math.round(100 * myFilled() / Math.max(1, r.total)) + '%'}</b></div>
        <div class="fact"><span>${opp}</span><b>${r.opp.status === 'done' ? fmt(r.opp.time) : r.opp.status === 'out' ? 'Out' : r.opp.status === 'left' ? 'Left' : Math.round(100 * r.opp.filled / Math.max(1, r.total)) + '%'}</b></div>
        <div class="fact"><span>Record</span><b>${raceRecord.wins}–${raceRecord.losses}${raceRecord.draws ? '–' + raceRecord.draws : ''}</b></div>
      </div>
      <div class="actions">
        ${host && connected ? '<button type="button" class="btn primary big" data-a="rematch">Rematch</button>' : ''}
        ${!host && connected ? `<div class="status-line"><span class="spinner"></span>${opp} can start a rematch.</div>` : ''}
        ${canKeep ? '<button type="button" class="btn" data-a="keep">Keep solving for practice</button>' : ''}
        <button type="button" class="btn ghost" data-a="leave">Leave race</button>
      </div>`, {
      locked: true,
      onMount: b => {
        on(b, '[data-a=rematch]', async () => {
          const btn = b.querySelector('[data-a=rematch]');
          btn.disabled = true; btn.textContent = 'Getting the puzzle ready…';
          let p = null;
          try { p = await generate(Object.assign({}, R.opts, { seed: E.randomSeed() })); } catch (e) { p = null; }
          if (!p || !Race.send({ t: 'start', puzzle: p })) { btn.disabled = false; btn.textContent = 'Rematch'; toast('Rematch didn’t start. Try again.'); return; }
          beginRace(p);
        });
        on(b, '[data-a=keep]', () => {
          closeSheet();
          G.status = 'practice';
          if (!G.race.endAt) G.race.endAt = Date.now();
          G.elapsed = elapsed();
          G.race = null;
          updateHead();
          startClock();
          paint();
          save();
        });
        on(b, '[data-a=leave]', () => leaveRace(true));
      },
    });
  }

  function confirmLeaveRace() {
    openSheet(`
      <h2 id="sheet-title">Leave the race?</h2>
      <p class="lede">${esc((G && G.race && G.race.oppName) || 'Your opponent')} wins if you leave now.</p>
      <div class="actions">
        <button type="button" class="btn danger big" data-a="leave">Leave race</button>
        <button type="button" class="btn" data-a="stay">Keep racing</button>
      </div>`, {
      onMount: b => {
        on(b, '[data-a=leave]', () => {
          if (G && G.race && !G.race.result) { G.race.result = 'loss'; raceRecord.losses++; store.set('raceRecord', raceRecord); }
          leaveRace(true);
        });
        on(b, '[data-a=stay]', () => closeSheet());
      },
    });
  }

  function leaveRace(home) {
    Race.send({ t: 'bye' });
    setTimeout(() => Race.close(), 200);
    R = null;
    closeSheet();
    if (G && G.race) {
      if (!G.race.endAt) G.race.endAt = Date.now();
      G.elapsed = elapsed();
      G.race = null;
      if (['playing', 'countdown'].includes(G.status)) G.status = 'practice';
      stopClock();
      save();
      if (home) { show('home'); return; }
      updateHead();
      paint();
    }
  }

  // ---------------------------------------------------- install, offline
  let installEvent = null;
  const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const canInstall = () => !isStandalone() && (!!installEvent || isIOS());
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; if (!$('#home').hidden) renderHome(); });
  window.addEventListener('appinstalled', () => { installEvent = null; toast('Blueline is on your home screen'); renderHome(); });
  $('#install').onclick = async () => {
    if (installEvent) {
      installEvent.prompt();
      try { await installEvent.userChoice; } catch (e) { /* dismissed */ }
      installEvent = null;
      renderHome();
      return;
    }
    openSheet(`
      <h2 id="sheet-title">Add Blueline to your home screen</h2>
      <ol class="steps-list">
        <li>Open this page in <b>Safari</b>.</li>
        <li>Tap the <b>Share</b> button (the square with an arrow pointing up).</li>
        <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
      </ol>
      <p class="small">Blueline then opens full screen like any other app and works offline.</p>
      <div class="actions"><button type="button" class="btn" data-a="close">Got it</button></div>`, { onMount: b => on(b, '[data-a=close]', () => closeSheet()) });
  };

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /[?&]sw\b/.test(location.search))) {
    // Reload only when an update replaces a running version, never on the first install.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      save();
      location.reload();
    });
    const offer = w => {
      if (!w || !navigator.serviceWorker.controller) return;
      toast('A new version of Blueline is ready.', { label: 'Update', run: () => w.postMessage('skip-waiting') });
    };
    navigator.serviceWorker.register('sw.js').then(reg => {
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
      });
    }).catch(() => { /* offline support unavailable */ });
  }

  // ------------------------------------------------------------ lifecycle
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (G && !$('#game').hidden && !G.race) pauseGame();
      save();
    }
  });
  window.addEventListener('pagehide', save);

  // Debug and test hook (no game data leaves the device).
  window.__blueline = { get game() { return G; }, engine: E, newGame, paint };

  function boot() {
    applyTheme();
    if (history.state && history.state.s === 'game') { try { history.replaceState(null, ''); } catch (e) { /* ignore */ } }
    G = loadGame();
    show('home');
    const h = location.hash;
    let m;
    if ((m = h.match(/^#race-([A-Za-z0-9]{5})$/))) openRace(m[1].toUpperCase());
    else if ((m = h.match(/^#play-([A-Za-z0-9-]{6,16})$/))) openCode(m[1].toUpperCase());
    if (h) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ } }
  }
  boot();
})();
