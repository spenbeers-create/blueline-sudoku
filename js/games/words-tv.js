/* Word Duel on the big screen: a 3-2-1 countdown, then every player's board filling
   in live, colors only so nobody can copy letters, with a race clock. The first to
   solve wins; the word is revealed at the end with everyone's results. */
(() => {
  'use strict';
  const BL = window.BL, esc = BL.esc;
  const TVG = window.BLTVGames || (window.BLTVGames = {});
  const W = () => window.BLGames.words;
  const parse = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return null; } };
  const COLORS = ['#6F9BFF', '#FF8A5B', '#4CC38A', '#F5C451', '#C38BFF', '#FF6FA8', '#4DD0E1', '#B9C4D6'];
  const fmt = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

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
      else if (kind === 'guess') tone(520, 0, 0.06, 0.04);
      else if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, 0.09));
    } catch (e) { /* no sound */ }
  }

  TVG.words = {
    title: 'Word Duel',
    minPlayers: 1,
    maxPlayers: 8,
    defaults: () => { const p = Object.assign({ len: 5, hard: false }, BL.store.get('wordsPrefs', {})); return { len: p.len, hard: !!p.hard }; },
    settingsRows: st => [
      { key: 'len', label: 'Letters', value: st.len || 5, options: [[4, '4'], [5, '5'], [6, '6'], [7, '7']] },
      { key: 'hard', label: 'Hard mode', value: st.hard ? '1' : '0', options: [['0', 'Off'], ['1', 'On']] },
    ],
    setSetting: (st, key, v) => Object.assign({}, st, { [key]: key === 'len' ? +v : v === '1' }),
    lobbyNote: () => 'Everyone guesses the same word on their phone. The TV shows each board in colors only, so no peeking at letters. First to solve it wins.',
    start: code => window.BLRooms.start(code),
    unlock: () => sound('unlock'),

    mount(el, ctx) {
      el.innerHTML = `
        <div class="tvw">
          <div class="tvw-top"><span class="tvw-clock"></span><span class="tvw-word"></span></div>
          <div class="tvw-boards"></div>
          <div class="tvw-count" hidden></div>
          <div class="tvf-over" hidden></div>
        </div>`;
      const q = s => el.querySelector(s), overBox = q('.tvf-over'), count = q('.tvw-count');
      let s = null, room = null, overKey = '', overT = 0, lastCount = null, seen = {};
      const names = () => (room && room.seats ? room.seats.map(uid => ((room.players || {})[uid] || {}).name || 'Player') : []);
      const progs = () => (room && room.seats ? room.seats.map((u, i) => parse((room.prog || {})[i]) || W().progress()) : []);
      const wins = i => (room && room.score && room.seats ? room.score[room.seats[i]] || 0 : 0);
      const snd = k => { if (ctx.soundOn()) sound(k); };

      const tick = setInterval(() => {
        if (!s || !room) return;
        const now = ctx.now(), start = room.startAt || 0, over = room.status === 'over';
        if (now < start) {
          const n = Math.ceil((start - now) / 1000);
          count.hidden = false;
          count.textContent = n;
          if (n !== lastCount) { lastCount = n; if (n <= 3) snd('beep'); }
        } else {
          if (!count.hidden) { count.hidden = true; snd('go'); }
          lastCount = null;
        }
        q('.tvw-clock').textContent = now < start ? 'Get ready' : over ? '' : fmt(now - start);
      }, 200);

      function paint() {
        if (!s || !room) return;
        const n = names(), ps = progs(), L = s.len || s.word.length, over = room.status === 'over';
        q('.tvw-word').innerHTML = over ? '' : `${L} letters${s.hard ? ' · hard mode' : ''}`;
        q('.tvw-boards').dataset.n = n.length;
        q('.tvw-boards').innerHTML = n.map((name, i) => {
          const p = ps[i], rows = [];
          for (let r = 0; r < s.max; r++) {
            const mark = p.marks[r];
            rows.push(`<div class="tvw-row">${Array.from({ length: L }, (_, k) => `<i class="${mark ? ({ g: 'hit', y: 'near' })[mark[k]] || 'miss' : r === p.guesses.length && !p.done ? 'next' : ''}"></i>`).join('')}</div>`);
          }
          const status = p.solved ? `Solved in ${p.guesses.length}!` : p.done ? 'Out of guesses' : p.guesses.length ? `${p.guesses.length} guess${p.guesses.length === 1 ? '' : 'es'}` : 'Thinking…';
          const winner = over && room.winner === i;
          return `<div class="tvw-board${p.solved ? ' solved' : ''}${winner ? ' won' : ''}${p.done && !p.solved ? ' out' : ''}" style="--c:${COLORS[i % COLORS.length]}">
            <div class="tvw-name"><i class="tvf-av">${esc((name || '?')[0].toUpperCase())}</i><b>${esc(name)}</b>${wins(i) ? `<span>${wins(i)}</span>` : ''}</div>
            <div class="tvw-grid" style="--len:${L}">${rows.join('')}</div>
            <small>${esc(status)}</small>
          </div>`;
        }).join('');
        // A soft tick for every new guess anywhere.
        ps.forEach((p, i) => { const k = `${room.played}:${i}`; if (seen[k] != null && p.guesses.length > seen[k]) snd('guess'); seen[k] = p.guesses.length; });
        ctx.info(`Word ${(room && room.played) || 1}`);
        // The TV can call the winner too, in case a phone went to sleep.
        if (room.status === 'playing') {
          let best = Infinity, who = null, tie = false;
          ps.forEach((p, i) => { if (p.solved) { if (p.time < best) { best = p.time; who = i; tie = false; } else if (p.time === best) tie = true; } });
          const w = who != null ? (tie ? 'draw' : who) : ps.length && ps.every(p => p.done) ? 'draw' : null;
          if (w != null) ctx.finish(w);
        }
        if (over && overKey !== `${room.played}`) {
          overKey = `${room.played}`;
          snd('win');
          clearTimeout(overT);
          overT = setTimeout(showOver, 1500);
        } else if (!over) { overBox.hidden = true; overKey = ''; clearTimeout(overT); }
      }

      function showOver() {
        if (!s || !room || room.status !== 'over') return;
        const n = names(), ps = progs(), w = room.winner;
        const order = n.map((x, i) => i).sort((a, b) => {
          const ka = ps[a].solved ? ps[a].time : 1e12 + (ps[a].done ? 0 : 1), kb = ps[b].solved ? ps[b].time : 1e12 + (ps[b].done ? 0 : 1);
          return ka - kb;
        });
        overBox.innerHTML = `
          <p class="tv-k">The word was</p>
          <div class="tvw-reveal">${s.word.toUpperCase().split('').map((ch, k) => `<i style="--k:${k}">${esc(ch)}</i>`).join('')}</div>
          <h1>${w === 'draw' ? 'Nobody got it first' : `${esc(n[w])} wins!`}</h1>
          ${n.length > 1 ? `<ol class="tvf-table">${order.map((i, k) => `<li style="--c:${COLORS[i % COLORS.length]}"><span class="tvf-place">${ps[i].solved ? ['1st', '2nd', '3rd'][k] || `${k + 1}th` : ''}</span><i class="tvf-av">${esc((n[i] || '?')[0].toUpperCase())}</i><b>${esc(n[i])}</b><span>${ps[i].solved ? `${ps[i].guesses.length} guess${ps[i].guesses.length === 1 ? '' : 'es'}, ${fmt(ps[i].time)}` : ps[i].done ? 'Missed' : 'Still guessing'}</span><span class="tvf-best">${wins(i)} win${wins(i) === 1 ? '' : 's'}</span></li>`).join('')}</ol>` : ''}
          <div class="tvf-over-actions"><button type="button" class="btn primary big" data-a="again">Next word</button><button type="button" class="btn big" data-a="lobby">Change settings</button><button type="button" class="btn big" data-a="exit">Exit TV mode</button></div>`;
        overBox.hidden = false;
        overBox.querySelector('[data-a=again]').onclick = () => ctx.rematch();
        overBox.querySelector('[data-a=lobby]').onclick = () => ctx.playAgain();
        overBox.querySelector('[data-a=exit]').onclick = () => ctx.exit();
        try { overBox.querySelector('[data-a=again]').focus(); } catch (e) { /* ignore */ }
      }

      return {
        update(r) { const st = parse(r.state); if (!st) return; room = r; s = st; paint(); },
        destroy() { clearInterval(tick); clearTimeout(overT); },
      };
    },
  };
})();
