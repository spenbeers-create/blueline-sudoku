/* The big screen for the answer-at-once games.
   More or Less: both topics huge, who has locked in, then the hidden number counts
   up and everyone's pick lights up right or wrong, with lives below.
   Measure Up: the thing you know the height of, then on the reveal every player's
   guess as a bar beside the real height, with points and a star for the closest.
   The TV also moves the game along (reveal, next round) so nobody has to. */
(() => {
  'use strict';
  const BL = window.BL, esc = BL.esc;
  const TVG = window.BLTVGames || (window.BLTVGames = {});
  const G = window.BLGames, VML = () => window.BLViews.moreless, VMU = () => window.BLViews.measure;
  const parse = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return null; } };
  const T = '︎';
  const fmt = n => Math.round(n).toLocaleString();
  const ord = n => ['1st', '2nd', '3rd'][n - 1] || `${n}th`;

  function shared(type, extra) {
    return Object.assign({
      minPlayers: 1, maxPlayers: 8,
      defaults: () => window.BLMenus[type].settingsFor(type),
      setSetting: (st, key, v) => Object.assign({}, st, { [key]: key === 'units' ? v : +v }),
      start: code => window.BLRooms.start(code),
      unlock: () => VML().sound('unlock'),
    }, extra);
  }
  // Common frame: the clock, the player chips, the final standings, and moving the game along.
  function frame(el, ctx, type, inner, paintBody) {
    el.innerHTML = `<div class="tvq tvq-${type}"><div class="tvq-clock"><i></i></div>${inner}<div class="tvq-players"></div><div class="tvf-over" hidden></div></div>`;
    const q = s => el.querySelector(s), overBox = q('.tvf-over'), g = G[type];
    let s = null, room = null, sent = { k: '' }, overKey = '', overT = 0, seenEv = -1, lastTick = 0;
    const names = () => (room && room.seats ? room.seats.map(uid => ((room.players || {})[uid] || {}).name || 'Player') : []);
    const wins = i => (room && room.score && room.seats ? room.score[room.seats[i]] || 0 : 0);
    const snd = k => { if (ctx.soundOn()) VML().sound(k); };
    const send = mv => {
      ctx.move(cur => { const st = parse(cur); if (!st || !g.legal(st, mv, -1)) return undefined; return JSON.stringify(g.apply(st, mv, -1)); })
        .then(res => { const n = parse(res); if (n && g.over(n)) ctx.finish(g.winner(n)); }).catch(() => {});
    };
    const tick = setInterval(() => {
      if (!s) return;
      const now = ctx.now();
      VML().quizTick(s, now, send, sent);
      const clock = q('.tvq-clock');
      if (s.time && s.phase === 'ask' && s.winner == null && now >= s.askedAt) {
        const left = Math.max(0, s.deadline - now);
        clock.style.visibility = 'visible';
        clock.querySelector('i').style.width = Math.min(100, (100 * left) / s.time) + '%';
        clock.classList.toggle('low', left < 4000);
        if (left < 4000 && left > 0 && now - lastTick > 1000) { lastTick = now; snd('tick'); }
      } else clock.style.visibility = 'hidden';
    }, 200);
    function paint() {
      if (!s) return;
      const n = names();
      paintBody(q, s, n, room);
      ctx.info(`${s.rounds ? `Round ${s.round} of ${s.rounds}` : `Round ${s.round}`}`);
      if (seenEv >= 0 && s.ev !== seenEv && s.phase === 'reveal' && s.results) snd('right');
      seenEv = s.ev;
      if (g.over(s) && overKey !== `${room && room.played}`) {
        overKey = `${room && room.played}`;
        snd('win');
        clearTimeout(overT);
        overT = setTimeout(() => showOver(n), type === 'measure' ? 4000 : 2500);
      } else if (!g.over(s)) { overBox.hidden = true; overKey = ''; clearTimeout(overT); }
    }
    function showOver(n) {
      if (!s || !g.over(s)) return;
      const w = s.winner;
      const order = s.players.map((p, i) => i).sort((a, b) => (type === 'measure' ? s.players[b].score - s.players[a].score : (s.players[b].lives - s.players[a].lives) || (s.players[b].right - s.players[a].right)));
      const line = i => (type === 'measure' ? `${s.players[i].score} points` : `${s.players[i].right} right${s.players[i].out ? '' : `, ${s.players[i].lives} ${s.players[i].lives === 1 ? 'life' : 'lives'} left`}`);
      overBox.innerHTML = `
        <p class="tv-k">${esc(g.name)}</p>
        <h1>${w === 'done' ? esc(line(0)) : w === 'draw' ? 'It’s a tie' : `<i class="tvf-av" style="--c:${VML().COLORS[w % 8]}">${esc((n[w] || '?')[0].toUpperCase())}</i>${esc(n[w])} wins!`}</h1>
        ${s.players.length > 1 ? `<ol class="tvf-table">${order.map((i, k) => `<li style="--c:${VML().COLORS[i % 8]}"><span class="tvf-place">${ord(k + 1)}</span><i class="tvf-av">${esc((n[i] || '?')[0].toUpperCase())}</i><b>${esc(n[i])}</b><span>${esc(line(i))}</span><span class="tvf-best">${wins(i)} win${wins(i) === 1 ? '' : 's'}</span></li>`).join('')}</ol>` : ''}
        <div class="tvf-over-actions"><button type="button" class="btn primary big" data-a="again">Play again</button><button type="button" class="btn big" data-a="lobby">Change settings</button><button type="button" class="btn big" data-a="exit">Exit TV mode</button></div>`;
      overBox.hidden = false;
      overBox.querySelector('[data-a=again]').onclick = () => ctx.rematch();
      overBox.querySelector('[data-a=lobby]').onclick = () => ctx.playAgain();
      overBox.querySelector('[data-a=exit]').onclick = () => ctx.exit();
      try { overBox.querySelector('[data-a=again]').focus(); } catch (e) { /* ignore */ }
    }
    return {
      update(r) { const st = parse(r.state); if (!st) return; if (room && r.played !== room.played) { seenEv = -1; sent = { k: '' }; } room = r; s = st; paint(); },
      destroy() { clearInterval(tick); clearTimeout(overT); },
    };
  }
  const chip = (i, n, inner, cls = '') => `<span class="tvq-p${cls}" style="--c:${VML().COLORS[i % 8]}"><i class="tvf-av">${esc((n[i] || '?')[0].toUpperCase())}</i><b>${esc(n[i] || 'Player')}</b>${inner}</span>`;

  TVG.moreless = shared('moreless', {
    title: 'More or Less',
    settingsRows: st => [
      { key: 'lives', label: 'Lives', value: st.lives || 3, options: [[1, '1'], [3, '3'], [5, '5']] },
      { key: 'time', label: 'Timer', value: st.time || 15000, options: [[10000, '10 s'], [15000, '15 s'], [25000, '25 s']] },
    ],
    lobbyNote: () => 'Everyone sees two topics and answers on their phone: did the second get more or fewer Wikipedia views a month? A wrong answer costs a life. Last one standing wins.',
    mount(el, ctx) {
      let shown = '', countT = 0;
      return frame(el, ctx, 'moreless', `
        <div class="tvml">
          <div class="tvml-card a"><span class="tvml-e"></span><b></b><span class="tvml-n"></span><small>views a month</small></div>
          <div class="tvml-vs">vs</div>
          <div class="tvml-card b"><span class="tvml-e"></span><b></b><span class="tvml-n"></span><small>views a month</small><em class="tvml-verdict"></em></div>
        </div>`, (q, s, n) => {
        const L = G.moreless, { a, b } = L.current(s), reveal = (s.phase === 'reveal' || s.winner != null) && s.results;
        for (const [k, it] of [['a', a], ['b', b]]) {
          q(`.tvml-card.${k} .tvml-e`).textContent = L.CATS[it.c] || '❔';
          q(`.tvml-card.${k} b`).textContent = it.t;
        }
        q('.tvml-card.a .tvml-n').textContent = fmt(a.v);
        const numB = q('.tvml-card.b .tvml-n'), key = `${s.seed}:${s.round}`;
        if (reveal && shown !== key) {
          shown = key; clearInterval(countT);
          const t0 = Date.now();
          countT = setInterval(() => { const k = Math.min(1, (Date.now() - t0) / 1300); numB.textContent = fmt(b.v * (1 - Math.pow(1 - k, 3))); if (k >= 1) clearInterval(countT); }, 30);
        } else if (!reveal) { shown = ''; clearInterval(countT); numB.textContent = '?'; }
        const verdict = q('.tvml-verdict');
        verdict.textContent = reveal ? (s.results.truth === 'more' ? `More ▲${T}` : s.results.truth === 'less' ? `Less ▼${T}` : 'Same!') : '';
        q('.tvml-card.b').className = `tvml-card b${reveal ? ' ' + s.results.truth : ''}`;
        q('.tvq-players').innerHTML = s.players.map((p, i) => {
          const r = reveal ? s.results.picks[i] : null;
          let tag = p.out && !r ? 'Out' : r ? (r.pick ? `${r.pick === 'more' ? '▲' : '▼'}${T} ${r.ok ? 'Right' : 'Wrong'}` : 'No answer') : String(i) in s.answers ? 'Locked in' : s.started && Date.now() ? 'Thinking…' : '';
          if (!s.started) tag = '';
          return chip(i, n, `<em>${p.lives > 0 ? '♥'.repeat(p.lives) + T : ''}</em><small>${esc(tag)}</small>`, `${p.out && !r ? ' out' : ''}${r ? (r.ok ? ' ok' : ' bad') : String(i) in s.answers ? ' locked' : ''}`);
        }).join('');
      });
    },
  });

  TVG.measure = shared('measure', {
    title: 'Measure Up',
    settingsRows: st => [
      { key: 'rounds', label: 'Rounds', value: st.rounds || 10, options: [[5, '5'], [10, '10'], [15, '15']] },
      { key: 'time', label: 'Timer', value: st.time || 25000, options: [[15000, '15 s'], [25000, '25 s'], [40000, '40 s']] },
    ],
    lobbyNote: () => 'Everyone sees how tall one thing is and guesses the height of the next on their phone. The TV reveals every guess next to the real height. Closest guesses score the most.',
    mount(el, ctx) {
      return frame(el, ctx, 'measure', `<p class="tvmu-q"></p><div class="tvmu-stage"></div>`, (q, s, n) => {
        const M = G.measure, p = M.current(s), reveal = (s.phase === 'reveal' || s.winner != null) && s.results, fh = VMU().fmtHeight;
        q('.tvmu-q').innerHTML = `${esc(p.ref.e)} ${esc(p.ref.t)} is <b>${esc(fh(p.ref.v))}</b>. How tall is ${esc(p.tgt.e)} <b>${esc(p.tgt.t)}</b>?`;
        const cols = [{ cls: 'ref', label: p.ref.t, emoji: p.ref.e, v: p.ref.v, val: fh(p.ref.v) }];
        if (reveal) {
          cols.push({ cls: 'real', label: 'Real height', emoji: p.tgt.e, v: s.results.real, val: fh(s.results.real) });
          s.players.forEach((pl, i) => {
            const r = s.results.guesses[i];
            if (r && r.guess != null) cols.push({ cls: `guess${r.closest ? ' best' : ''}`, color: VML().COLORS[i % 8], label: n[i], v: r.guess, val: fh(r.guess), pts: r.pts, closest: r.closest });
          });
        } else cols.push({ cls: 'mystery', label: p.tgt.t, emoji: p.tgt.e, v: p.ref.v, val: '?' });
        const top = Math.max(...cols.map(c => c.v));
        q('.tvmu-stage').innerHTML = cols.map(c => `<div class="mu-col ${c.cls}" ${c.color ? `style="--c:${c.color}"` : ''}>
            <span class="mu-v">${esc(c.val)}${c.pts != null ? `<em>+${c.pts}${c.closest ? ' ★' : ''}</em>` : ''}</span>
            <span class="mu-bar" style="height:${Math.max(1.5, (100 * c.v) / top)}%">${c.emoji ? `<i>${esc(c.emoji)}</i>` : ''}</span>
            <small>${esc(c.label)}</small></div>`).join('');
        q('.tvmu-stage').dataset.n = cols.length;
        q('.tvq-players').innerHTML = s.players.map((pl, i) => {
          const r = reveal ? s.results.guesses[i] : null;
          const tag = r ? (r.guess == null ? 'No guess' : `+${r.pts}${r.closest ? ' ★' : ''}`) : String(i) in s.answers ? 'Locked in' : s.started ? 'Thinking…' : '';
          return chip(i, n, `<em class="pts">${pl.score}</em><small>${esc(tag)}</small>`, `${r && r.closest ? ' ok' : ''}${!r && String(i) in s.answers ? ' locked' : ''}`);
        }).join('');
      });
    },
  });
})();
