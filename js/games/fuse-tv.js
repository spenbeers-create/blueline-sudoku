/* Short Fuse on the big screen: the letters huge in the middle, the fuse or the
   countdown, live typing from whoever holds the fuse, everyone's lives around the
   bottom, a boom everybody can see, and the final standings. The screen also calls
   time when the fuse runs out, so the game keeps moving even if a phone sleeps. */
(() => {
  'use strict';
  const F = window.BLGames.fuse, BL = window.BL, esc = BL.esc;
  const TVG = window.BLTVGames || (window.BLTVGames = {});
  const T = '︎';
  const VARIANTS = { pass: 'Pass the fuse', last: 'Last Word' };
  const SPEEDS = { short: [6000, 8000], normal: [9000, 12000], long: [12000, 16000] };
  const speedOf = st => ((st.minFuse || 9000) <= 6000 ? 'short' : (st.minFuse || 9000) >= 12000 ? 'long' : 'normal');
  const parse = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return null; } };
  const hl = (w, k) => { const i = w.indexOf(k); return i < 0 ? esc(w) : `${esc(w.slice(0, i))}<b>${esc(k)}</b>${esc(w.slice(i + k.length))}`; };
  const ord = n => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

  TVG.fuse = {
    title: 'Short Fuse',
    minPlayers: 1,
    defaults() {
      const M = window.BLMenus.fuse;
      return Object.assign(M.settingsFrom(M.prefs()), { variant: BL.store.get('tvVariant', 'last') });
    },
    settingsRows(st) {
      return [
        { key: 'variant', label: 'Mode', value: st.variant || 'pass', options: [['last', 'Last Word'], ['pass', 'Pass the fuse']] },
        { key: 'lives', label: 'Lives', value: st.lives || 3, options: [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']] },
        { key: 'difficulty', label: 'Letters', value: st.difficulty || 'normal', options: [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']] },
        { key: 'speed', label: 'Timer', value: speedOf(st), options: [['short', 'Short'], ['normal', 'Normal'], ['long', 'Long']] },
      ];
    },
    setSetting(st, key, v) {
      const n = Object.assign({}, st);
      if (key === 'speed') { n.minFuse = SPEEDS[v][0]; n.limit = SPEEDS[v][1]; }
      else if (key === 'lives') { n.lives = +v; n.maxLives = Math.max(3, +v); }
      else n[key] = v;
      if (key === 'variant') BL.store.set('tvVariant', v);
      return n;
    },
    lobbyNote: st => (st.variant === 'last'
      ? 'Last Word: everyone gets the same letters and types a word on their phone. The last one in loses a life.'
      : 'Pass the fuse: take turns typing a word with the letters. Whoever holds the fuse when it blows loses a life.'),
    start: code => window.BLRooms.start(code),
    unlock: () => window.BLViews.fuse.sound('unlock'),

    mount(el, ctx) {
      el.innerHTML = `
        <div class="tvf">
          <div class="tvf-stage">
            <p class="tvf-holder"></p>
            <div class="tvf-prompt"></div>
            <div class="tvf-fuse" aria-hidden="true"><span class="tvf-rope"></span><span class="tvf-spark"></span></div>
            <div class="tvf-clock" aria-hidden="true"><i></i></div>
            <div class="tvf-draft"></div>
          </div>
          <div class="tvf-seats"></div>
          <div class="tvf-feed"></div>
          <div class="tvf-boom" hidden><b></b><span></span></div>
          <div class="tvf-over" hidden></div>
        </div>`;
      const q = s => el.querySelector(s);
      const stage = q('.tvf-stage'), boomBox = q('.tvf-boom'), overBox = q('.tvf-over');
      let s = null, draft = null, seenEv = -1, sent = '', wasPaused = null, lastTick = 0, overKey = '', boomT = 0;
      const snd = kind => { if (ctx.soundOn()) window.BLViews.fuse.sound(kind); };
      const color = i => ctx.colors[i % ctx.colors.length];
      const name = i => (s.players[i] ? s.players[i].name : 'Player');

      // The screen also calls time, so a sleeping phone can't stall the game.
      function send(move) {
        ctx.move(cur => {
          const st = parse(cur);
          if (!st || !F.legal(st, move, -1)) return undefined;
          return JSON.stringify(F.apply(st, move, -1));
        }).then(res => { const n = parse(res); if (n && F.over(n)) ctx.finish(F.winner(n)); }).catch(() => {});
      }

      const tick = setInterval(() => {
        if (!s || !s.started || F.over(s)) return;
        const now = ctx.now(), paused = now < (s.roundStart || 0), last = s.variant === 'last';
        if (paused !== wasPaused) { if (wasPaused && !paused) snd('go'); wasPaused = paused; paint(); }
        if (last) {
          const left = Math.max(0, s.deadline - now), total = (s.settings && s.settings.limit) || 12000;
          q('.tvf-clock i').style.width = (paused ? 100 : (100 * left) / total) + '%';
          q('.tvf-clock').classList.toggle('low', !paused && left < 3000);
          if (!paused && now - lastTick >= (left < 3000 ? 250 : 1000)) { lastTick = now; snd('tick'); }
          if (now >= s.deadline && sent !== 't' + s.round) { sent = 't' + s.round; send({ timeout: true, round: s.round, at: now }); }
        } else {
          if (!paused && now - lastTick >= 500) { lastTick = now; snd('tick'); }
          if (now >= s.fuseEnd + 600 && sent !== 'b' + s.round) { sent = 'b' + s.round; send({ boom: true, round: s.round, at: now }); }
        }
      }, 100);

      function paint() {
        if (!s) return;
        const now = ctx.now(), over = F.over(s), last = s.variant === 'last';
        const paused = s.started && now < (s.roundStart || 0), done = s.done || {};
        ctx.info(over ? 'Game over' : `Round ${s.round} · ${VARIANTS[s.variant] || ''}`);
        stage.classList.toggle('lit', s.started && !over && !paused);
        stage.classList.toggle('pause', paused);
        stage.classList.toggle('last', last);
        q('.tvf-prompt').textContent = over ? '' : s.prompt.toUpperCase();
        let holder = '';
        if (!over) {
          if (paused) holder = last ? (s.round === 1 ? 'Get ready…' : 'Next round…') : `${s.round === 1 ? 'Get ready. ' : 'Next round. '}${name(s.turn)} starts`;
          else if (last) holder = 'Everyone, type a word with';
          else holder = `${name(s.turn)} has the fuse`;
        }
        q('.tvf-holder').innerHTML = !over && !last && !paused ? `<i style="--c:${color(s.turn)}"></i>${esc(holder)}` : esc(holder);
        q('.tvf-draft').innerHTML = !last && !over && draft && draft.seat === s.turn && (draft.n == null || draft.n === s.n) && draft.text ? hl(String(draft.text).toLowerCase(), s.prompt) : '';

        // Order people got their words in (Last Word)
        const rank = {};
        Object.entries(done).sort((a, b) => a[1].at - b[1].at).forEach(([p], i) => { rank[p] = i + 1; });
        q('.tvf-seats').innerHTML = s.players.map((p, i) => {
          const out = p.lives <= 0, cur = !over && s.started && !last && s.turn === i;
          const hearts = out ? '' : Array.from({ length: p.lives }, () => `♥${T}`).join('');
          const pct = Math.round((100 * (p.letters || '').length) / F.BONUS.length);
          let status = '';
          if (out) status = 'Out';
          else if (over) status = `${p.words || 0} word${p.words === 1 ? '' : 's'}`;
          else if (last && done[i]) status = `<em>${ord(rank[i])}</em> ${esc(done[i].w.toUpperCase())}`;
          else if (last) status = paused ? '' : 'thinking…';
          else if (cur) status = 'has the fuse';
          return `<div class="tvf-seat${cur ? ' cur' : ''}${last && done[i] ? ' done' : ''}${out ? ' out' : ''}" style="--c:${color(i)}">
              <i class="tvf-av">${esc((p.name || '?')[0].toUpperCase())}</i>
              <b class="tvf-name">${esc(p.name)}</b>
              <span class="tvf-hearts" aria-label="${p.lives} lives">${hearts}</span>
              <span class="tvf-bar" title="Bonus letters"><i style="width:${pct}%"></i></span>
              <span class="tvf-status">${status}</span>
            </div>`;
        }).join('');
        q('.tvf-seats').dataset.n = s.players.length;

        q('.tvf-feed').innerHTML = s.log.filter(x => x.w).slice(-7).reverse().map(x =>
          `<span class="tvf-chip${x.bonus ? ' bonus' : ''}" style="--c:${color(x.p)}"><small>${esc(name(x.p))}</small><span>${hl(x.w, x.k)}</span>${x.bonus ? '<em>+1 life</em>' : ''}</span>`).join('');

        // Sounds and the boom
        const ev = s.ev != null ? s.ev : s.log.length;
        if (ev !== seenEv) {
          const lastEv = s.log[s.log.length - 1];
          if (seenEv >= 0 && lastEv) {
            const fresh = s.log.slice(Math.max(0, s.log.length - (ev - seenEv)));
            const booms = fresh.filter(x => x.boom).map(x => x.p);
            if (booms.length) {
              const who = booms.map(name);
              q('.tvf-boom b').textContent = last ? (booms.length > 1 || s.players.length === 1 ? 'Time’s up!' : 'Too slow!') : 'BOOM';
              const list = who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}` : who[0];
              const allOut = booms.every(p => s.players[p].lives <= 0);
              q('.tvf-boom span').textContent = allOut ? `${list} ${who.length > 1 ? 'are' : 'is'} out!` : `${list} lost a life`;
              boomBox.hidden = false;
              boomBox.classList.remove('go'); void boomBox.offsetWidth; boomBox.classList.add('go');
              snd('boom');
              clearTimeout(boomT);
              boomT = setTimeout(() => { boomBox.hidden = true; }, 1900);
            } else snd(fresh.some(x => x.bonus) ? 'bonus' : 'pass');
          }
          seenEv = ev;
        }

        // Final standings
        if (over && overKey !== s.seed) {
          overKey = s.seed;
          setTimeout(() => showOver(), boomBox.hidden ? 0 : 1500);
        } else if (!over) { overBox.hidden = true; overKey = ''; }
      }

      function showOver() {
        if (!s || !F.over(s)) return;
        const order = F.standings(s);
        let title;
        if (s.winner === 'done') title = `${s.players[0].words || 0} word${s.players[0].words === 1 ? '' : 's'}`;
        else if (s.winner === 'draw') title = 'Nobody made it';
        else title = `${name(s.winner)} wins!`;
        const longest = s.players.reduce((a, p, i) => ((p.best || '').length > (a.w || '').length ? { w: p.best, i } : a), { w: '', i: -1 });
        overBox.innerHTML = `
          <p class="tv-k">Game over</p>
          <h1>${s.winner != null && s.winner !== 'draw' && s.winner !== 'done' ? `<i class="tvf-av" style="--c:${color(s.winner)}">${esc(name(s.winner)[0].toUpperCase())}</i>` : ''}${esc(title)}</h1>
          ${s.players.length > 1 ? `<ol class="tvf-table">${order.map((i, k) => `<li style="--c:${color(i)}"><span class="tvf-place">${ord(k + 1)}</span><i class="tvf-av">${esc(name(i)[0].toUpperCase())}</i><b>${esc(name(i))}</b><span>${s.players[i].words || 0} word${s.players[i].words === 1 ? '' : 's'}</span><span class="tvf-best">${s.players[i].best ? esc(s.players[i].best.toUpperCase()) : ''}</span></li>`).join('')}</ol>` : ''}
          ${longest.w ? `<p class="tvf-longest">Longest word: <b>${esc(longest.w.toUpperCase())}</b> by ${esc(name(longest.i))}</p>` : ''}
          <div class="tvf-over-actions"><button type="button" class="btn primary big" data-a="again">Play again</button><button type="button" class="btn big" data-a="exit">Exit TV mode</button></div>`;
        overBox.hidden = false;
        overBox.querySelector('[data-a=again]').onclick = () => ctx.playAgain();
        overBox.querySelector('[data-a=exit]').onclick = () => ctx.exit();
        try { overBox.querySelector('[data-a=again]').focus(); } catch (e) { /* ignore */ }
      }

      return {
        update(room) {
          const st = parse(room.state);
          if (!st) return;
          if (s && st.seed !== s.seed) { seenEv = -1; sent = ''; overKey = ''; }
          s = st; draft = room.draft || null;
          paint();
        },
        destroy() { clearInterval(tick); clearTimeout(boomT); },
      };
    },
  };
})();
