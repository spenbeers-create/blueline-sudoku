/* Sudoku races on the big screen: a countdown, then a card for each player with a
   mini board that fills in as they solve (no numbers, just which cells are done),
   their progress and mistakes, and their place as they finish. The fastest
   finisher wins; three mistakes and you're out. */
(() => {
  'use strict';
  const BL = window.BL, esc = BL.esc;
  const TVG = window.BLTVGames || (window.BLTVGames = {});
  const parse = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return null; } };
  const COLORS = ['#6F9BFF', '#FF8A5B', '#4CC38A', '#F5C451', '#C38BFF', '#FF6FA8', '#4DD0E1', '#B9C4D6'];
  const fmt = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const ord = n => ['1st', '2nd', '3rd'][n - 1] || `${n}th`;
  const SR = () => window.BLSudokuRoom;

  let audio = null;
  function sound(kind) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime;
      const tone = (f, at, dur, vol) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(f, t0 + at);
        g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        o.connect(g).connect(audio.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
      };
      if (kind === 'beep') tone(660, 0, 0.12, 0.08);
      else if (kind === 'go') tone(990, 0, 0.25, 0.1);
      else if (kind === 'miss') tone(180, 0, 0.15, 0.06);
      else if (kind === 'done') [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.2, 0.08));
      else if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, 0.09));
    } catch (e) { /* no sound */ }
  }

  TVG.sudoku = {
    title: 'Sudoku race',
    minPlayers: 1,
    maxPlayers: 8,
    defaults: () => BL.pick(),
    settingsRows(st) {
      const o = SR().options(st);
      return [
        { key: 'variant', label: 'Style', value: o.variant, options: Object.entries(BL.VARIANTS) },
        { key: 'size', label: 'Grid', value: o.size, options: Object.entries(BL.SIZES).map(([k, v]) => [k, v]) },
        { key: 'difficulty', label: 'Level', value: o.difficulty, options: Object.entries(BL.LEVEL_NAMES) },
      ];
    },
    setSetting(st, key, v) {
      const n = Object.assign({}, SR().options(st), { [key]: key === 'size' ? +v : v });
      if (n.variant === 'killer') n.size = 9;
      return n;
    },
    lobbyNote: st => `Everyone solves the same ${SR().describe(st).toLowerCase()} puzzle on their phone. Fastest to finish wins; three mistakes and you’re out.`,
    start: code => window.BLRooms.start(code),
    unlock: () => sound('unlock'),

    mount(el, ctx) {
      el.innerHTML = `
        <div class="tvs">
          <div class="tvs-top"><span class="tvs-clock"></span><span class="tvs-what"></span></div>
          <div class="tvs-cards"></div>
          <div class="tvw-count" hidden></div>
          <div class="tvf-over" hidden></div>
        </div>`;
      const q = s => el.querySelector(s), overBox = q('.tvf-over'), count = q('.tvw-count');
      let st = null, room = null, overKey = '', overT = 0, lastCount = null, seen = {};
      const names = () => (room && room.seats ? room.seats.map(uid => ((room.players || {})[uid] || {}).name || 'Player') : []);
      const progs = () => (room && room.seats ? room.seats.map((u, i) => parse((room.prog || {})[i]) || { status: 'racing', filled: 0, mistakes: 0 }) : []);
      const wins = i => (room && room.score && room.seats ? room.score[room.seats[i]] || 0 : 0);
      const snd = k => { if (ctx.soundOn()) sound(k); };
      // Finishing order so far.
      const places = ps => ps.map((p, i) => ({ p, i })).filter(x => x.p.status === 'done').sort((a, b) => a.p.time - b.p.time).map(x => x.i);

      const tick = setInterval(() => {
        if (!st || !room) return;
        const now = ctx.now(), start = room.startAt || 0, over = room.status === 'over';
        if (now < start) {
          const n = Math.ceil((start - now) / 1000);
          count.hidden = false;
          count.textContent = n > 3 ? 'Get ready' : n;
          count.classList.toggle('small', n > 3);
          if (n !== lastCount) { lastCount = n; if (n <= 3) snd('beep'); }
        } else {
          if (!count.hidden) { count.hidden = true; snd('go'); }
          lastCount = null;
        }
        q('.tvs-clock').textContent = now < start || over ? '' : fmt(now - start);
      }, 250);

      function paint() {
        if (!st || !room) return;
        const n = names(), ps = progs(), p0 = st.puzzle, size = p0.size, total = st.total || 1, order = places(ps);
        const over = room.status === 'over';
        q('.tvs-what').textContent = SR().describe({ variant: p0.variant, size, difficulty: p0.difficulty });
        const box = size === 9 ? 3 : size === 12 ? [3, 4] : 4;
        const [bh, bw] = Array.isArray(box) ? box : [box, box];
        q('.tvs-cards').dataset.n = n.length;
        q('.tvs-cards').innerHTML = n.map((name, i) => {
          const p = ps[i], pct = Math.round((100 * (p.filled || 0)) / total), cells = p.cells || p0.givens.map(v => (v ? '2' : '0')).join('');
          const place = order.indexOf(i);
          const mini = cells.split('').map((c, k) => {
            const r = Math.floor(k / size), col = k % size;
            const edge = `${(col + 1) % bw === 0 && col < size - 1 ? ' br' : ''}${(r + 1) % bh === 0 && r < size - 1 ? ' bb' : ''}`;
            return `<i class="${c === '2' ? 'g' : c === '1' ? 'f' : ''}${edge}"></i>`;
          }).join('');
          const status = p.status === 'done' ? `${ord(place + 1)} · ${fmt(p.time)}` : p.status === 'out' ? 'Out: three mistakes' : p.status === 'left' ? 'Left the race' : `${pct}%`;
          return `<div class="tvs-card ${p.status}${over && room.winner === i ? ' won' : ''}" style="--c:${COLORS[i % COLORS.length]}">
            <div class="tvs-name"><i class="tvf-av">${esc((name || '?')[0].toUpperCase())}</i><b>${esc(name)}</b>${wins(i) ? `<span>${wins(i)}</span>` : ''}</div>
            <div class="tvs-mini" style="--n:${size}">${mini}</div>
            <div class="tvs-bar"><i style="width:${p.status === 'done' ? 100 : pct}%"></i></div>
            <div class="tvs-foot"><small>${esc(status)}</small><span class="tvs-x">${'✕'.repeat(Math.min(3, p.mistakes || 0))}</span></div>
          </div>`;
        }).join('');
        ps.forEach((p, i) => {
          const k = `${room.played}:${i}`, prev = seen[k] || { m: 0, s: 'racing' };
          if ((p.mistakes || 0) > prev.m) snd('miss');
          if (p.status === 'done' && prev.s !== 'done') snd('done');
          seen[k] = { m: p.mistakes || 0, s: p.status };
        });
        ctx.info(`Race ${room.played || 1}`);
        const s = SR().standing(ps);
        if (room.status === 'playing' && s.over) ctx.finish(s.winner);
        if (over && overKey !== `${room.played}`) {
          overKey = `${room.played}`;
          snd('win');
          clearTimeout(overT);
          overT = setTimeout(showOver, 1500);
        } else if (!over) { overBox.hidden = true; overKey = ''; clearTimeout(overT); }
      }

      function showOver() {
        if (!st || !room || room.status !== 'over') return;
        const n = names(), ps = progs(), w = room.winner, order = places(ps);
        const rest = n.map((x, i) => i).filter(i => !order.includes(i)).sort((a, b) => (ps[b].filled || 0) - (ps[a].filled || 0));
        const total = st.total || 1;
        overBox.innerHTML = `
          <p class="tv-k">Race ${room.played || 1}</p>
          <h1>${w === 'draw' ? 'Nobody finished' : `<i class="tvf-av" style="--c:${COLORS[w % COLORS.length]}">${esc((n[w] || '?')[0].toUpperCase())}</i>${esc(n[w])} wins!`}</h1>
          <ol class="tvf-table">${order.concat(rest).map((i, k) => `<li style="--c:${COLORS[i % COLORS.length]}"><span class="tvf-place">${k < order.length ? ord(k + 1) : ''}</span><i class="tvf-av">${esc((n[i] || '?')[0].toUpperCase())}</i><b>${esc(n[i])}</b><span>${ps[i].status === 'done' ? fmt(ps[i].time) : ps[i].status === 'out' ? 'Out' : ps[i].status === 'left' ? 'Left' : `${Math.round((100 * (ps[i].filled || 0)) / total)}%`}</span><span class="tvf-best">${ps[i].mistakes || 0} mistake${ps[i].mistakes === 1 ? '' : 's'}</span></li>`).join('')}</ol>
          <div class="tvf-over-actions"><button type="button" class="btn primary big" data-a="again">Next puzzle</button><button type="button" class="btn big" data-a="lobby">Change puzzle</button><button type="button" class="btn big" data-a="exit">Exit TV mode</button></div>`;
        overBox.hidden = false;
        overBox.querySelector('[data-a=again]').onclick = () => ctx.rematch();
        overBox.querySelector('[data-a=lobby]').onclick = () => ctx.playAgain();
        overBox.querySelector('[data-a=exit]').onclick = () => ctx.exit();
        try { overBox.querySelector('[data-a=again]').focus(); } catch (e) { /* ignore */ }
      }

      return {
        update(r) { const s = parse(r.state); if (!s || !s.puzzle) return; room = r; st = s; paint(); },
        destroy() { clearInterval(tick); clearTimeout(overT); },
      };
    },
  };
})();
