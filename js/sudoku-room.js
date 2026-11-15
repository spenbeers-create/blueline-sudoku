/* Sudoku races in a room: up to 8 players solve the same puzzle at once, on their
   phones, optionally with the TV showing everyone's progress. The puzzle is built
   before dealing, everyone gets a shared countdown, and each phone reports how far
   along it is (rooms/{code}/prog/{seat}). On the phone it's the normal Sudoku
   screen with the race bar showing whoever is doing best. */
(() => {
  'use strict';
  const BL = window.BL, O = window.Online, E = window.SudokuEngine;
  const $ = s => document.querySelector(s);
  const R = () => window.BLRooms;
  const parse = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return null; } };
  const options = st => ({ variant: st.variant || 'classic', size: st.variant === 'killer' ? 9 : +st.size || 9, difficulty: st.difficulty || 'medium' });
  const describe = st => { const o = options(st); return `${BL.LEVEL_NAMES[o.difficulty] || 'Medium'} · ${BL.VARIANTS[o.variant]} ${BL.SIZES[o.size]}`; };

  // Who's winning: the fastest finisher, or a draw once everyone is done without one.
  function standing(progs) {
    let best = Infinity, who = null;
    progs.forEach((p, i) => { if (p && p.status === 'done' && p.time < best) { best = p.time; who = i; } });
    const settled = progs.every(p => p && p.status !== 'racing');
    return { leader: who, over: settled, winner: settled ? (who != null ? who : 'draw') : null };
  }

  R().register('sudoku', {
    title: 'Sudoku race', maxPlayers: 8,
    minPlayers: r => (r.screen ? 1 : 2),
    describe,
    prepare: r => BL.generate(Object.assign({ seed: E.randomSeed() }, options(r.settings || {}))),
    start(r, entries, puzzle) {
      r.seats = entries.map(([uid]) => uid);
      r.state = JSON.stringify({ puzzle, total: puzzle.givens.filter(v => !v).length });
      r.startAt = O.now() + 6000;
    },
    standing,
  });

  // --------------------------------------------------------- on the phone
  let cur = null;
  function open(code, seat, api) {
    close();
    const me = cur = { code, seat, api, played: null, prog: null, stop: null, switching: false };
    O.roomHere(code).catch(() => {});
    me.stop = O.watchRoom(code, r => onRoom(me, r));
  }
  function close() {
    if (!cur) return;
    if (cur.stop) cur.stop();
    O.roomHere(cur.code, false).catch(() => {});
    cur = null;
  }
  // End my race on this phone without telling the room I left.
  function quietEnd(me, home) {
    me.switching = true;
    if (BL.roomRace.active()) BL.roomRace.end(home);
    me.switching = false;
  }
  function onRoom(me, r) {
    if (cur !== me) return;
    if (!r) { quietEnd(me, true); close(); BL.toast('The room closed.'); return; }
    if (r.status === 'lobby') { quietEnd(me, true); close(); R().lobby(me.code, me.api); return; }
    const idx = Array.isArray(r.seats) ? r.seats.indexOf(O.me()) : -1;
    const st = parse(r.state);
    if (idx < 0 || !st) return;
    me.seat = idx;
    const names = r.seats.map(uid => ((r.players || {})[uid] || {}).name || 'Player');
    if (r.played !== me.played) {
      me.played = r.played;
      me.prog = null;
      quietEnd(me, false);
      const ok = BL.roomRace.begin(st.puzzle, {
        oppName: names.length > 1 ? 'Everyone else' : 'The clock',
        delay: Math.max(0, (r.startAt || 0) - O.now() - 2550),
        send: msg => report(me, msg, st.total),
        again: () => R().rematch(me.code),
        leave: () => { if (!me.switching) { close(); R().leave(me.code, false); } },
      });
      if (!ok) { BL.toast('The race puzzle arrived damaged.'); return; }
    }
    // The rival on my race bar is whoever is doing best.
    const prog = r.prog || {};
    const all = r.seats.map((u, i) => (i === idx ? me.prog || { status: 'racing', filled: 0, mistakes: 0 } : parse(prog[i]) || { status: 'racing', filled: 0, mistakes: 0 }));
    const others = all.map((p, i) => ({ p, i })).filter(x => x.i !== idx);
    if (others.length) {
      const done = others.filter(x => x.p.status === 'done').sort((a, b) => a.p.time - b.p.time);
      const racing = others.filter(x => x.p.status === 'racing').sort((a, b) => b.p.filled - a.p.filled);
      const top = done[0] || racing[0] || others[0];
      const status = done.length ? 'done' : racing.length ? 'racing' : others.every(x => x.p.status === 'left') ? 'left' : 'out';
      BL.roomRace.rival({ status, filled: top.p.filled || 0, mistakes: top.p.mistakes || 0, time: top.p.time || 0 }, names[top.i]);
    }
    const s = standing(all);
    if (r.status === 'playing' && s.over) R().finish(me.code, s.winner);
  }
  // Turn the race's messages into my progress in the room.
  function report(me, msg, total) {
    if (cur !== me) return;
    const p = Object.assign({ status: 'racing', filled: 0, mistakes: 0 }, me.prog || {});
    if (msg.t === 'progress') { if (p.status !== 'racing') return; p.filled = msg.filled; p.mistakes = msg.mistakes; }
    else if (msg.t === 'done') { p.status = 'done'; p.time = msg.time; p.filled = total; }
    else if (msg.t === 'out') p.status = 'out';
    else if (msg.t === 'bye') { if (me.switching || p.status !== 'racing') return; p.status = 'left'; }
    else return;
    p.cells = BL.roomRace.cells();
    p.mistakes = Math.max(p.mistakes || 0, BL.roomRace.mistakes());
    me.prog = p;
    O.roomProg(me.code, me.seat, JSON.stringify(p)).catch(() => {});
  }

  // Sudoku menu: TV mode and race rooms.
  const api = () => window.BLHub && window.BLHub.api;
  $('#sudoku-tv').onclick = () => api() && api().startTv('sudoku');
  $('#sudoku-room-new').onclick = () => api() && R().create('sudoku', BL.pick(), api());
  $('#sudoku-room-join').onclick = () => api() && R().joinPrompt('', '', api());

  window.BLSudokuRoom = { open, close, standing, describe, options };
})();
