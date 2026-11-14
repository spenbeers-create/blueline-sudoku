/* Short Fuse screen for 1 to 8 players: player cards with lives and bonus-letter
   progress, the burning fuse and letters to use, live typing from whoever holds
   the fuse, your bonus-letter tracker, recent words, and a boom when it blows.
   ctx.mode: 'online' (partner or room), 'bots', 'local'. */
(() => {
  'use strict';
  const V = window.BLViews, F = window.BLGames.fuse, BL = window.BL;
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const T = '︎';
  const prefs = () => Object.assign({ sound: true }, BL.store.get('fusePrefs', {}));

  let audio = null;
  function sound(kind) {
    if (!prefs().sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime;
      const tone = (f, at, dur, type, vol) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t0 + at);
        g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        o.connect(g).connect(audio.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
      };
      if (kind === 'pass') { tone(660, 0, 0.08, 'triangle', 0.08); tone(990, 0.06, 0.1, 'triangle', 0.07); }
      else if (kind === 'bonus') { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.16, 'triangle', 0.09)); }
      else if (kind === 'bad') tone(180, 0, 0.12, 'square', 0.04);
      else if (kind === 'tick') tone(2200, 0, 0.018, 'square', 0.012);
      else if (kind === 'go') { tone(523, 0, 0.12, 'triangle', 0.08); tone(784, 0.12, 0.2, 'triangle', 0.09); }
      else if (kind === 'boom') {
        const len = Math.floor(audio.sampleRate * 0.6), buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
        const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
        src.buffer = buf; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0.9;
        src.connect(f).connect(g).connect(audio.destination); src.start(t0);
        tone(70, 0, 0.5, 'sine', 0.3);
      }
    } catch (e) { /* no sound */ }
  }

  V.fuse = {
    sound,
    mount(el, ctx) {
      el.innerHTML = `
        <div class="fz">
          <div class="fz-players"></div>
          <div class="fz-stage">
            <div class="fz-fuse" aria-hidden="true"><span class="fz-rope"></span><span class="fz-spark"></span></div>
            <div class="fz-clock" hidden><i></i></div>
            <p class="fz-holder"></p>
            <div class="fz-prompt" aria-live="polite"></div>
            <div class="fz-draft"></div>
          </div>
          <form class="fz-form" autocomplete="off">
            <input class="input" id="fz-in" type="text" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="send" maxlength="30" aria-label="Your word">
            <button type="submit" class="btn primary">Send</button>
          </form>
          <p class="fz-note" aria-live="polite"></p>
          <div class="fz-letters" aria-label="Your bonus letters"></div>
          <div class="fz-log"></div>
          <div class="fz-start" hidden><p></p><button type="button" class="btn primary big" data-a="start">Light the fuse</button><small></small></div>
          <div class="fz-boom" hidden><b>Boom</b><span></span></div>
        </div>`;
      const input = el.querySelector('#fz-in'), note = el.querySelector('.fz-note'), form = el.querySelector('.fz-form');
      const startBox = el.querySelector('.fz-start'), boomBox = el.querySelector('.fz-boom'), stage = el.querySelector('.fz-stage');
      let lastKey = 0, holdAt = 0;
      let snap = null, dictReady = F.hasDictionary(), dictError = false, boomSent = 0, seenLog = -1, draftT = 0, lastTurnKey = '';
      F.loadDictionary().then(() => { dictReady = true; paint(); }).catch(() => { dictError = true; paint(); });

      const nameOf = i => (snap.state.players && snap.state.players.length > 2 ? snap.state.players[i].name : (ctx.names[i] || (snap.state.players ? snap.state.players[i].name : `Player ${i + 1}`)));
      const hl = (w, k) => { const i = w.indexOf(k); return i < 0 ? esc(w) : `${esc(w.slice(0, i))}<b>${esc(k)}</b>${esc(w.slice(i + k.length))}`; };
      const me = () => snap.viewer;

      form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!snap || !snap.canAct) return;
        const s = snap.state, w = input.value.trim().toLowerCase();
        if (!s.started || ctx.now() < (s.roundStart || 0)) return;
        const why = F.problem(s, w);
        if (why) { note.textContent = why; sound('bad'); form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); return; }
        input.value = '';
        note.textContent = '';
        ctx.setDraft('');
        const err = await ctx.send({ word: w, at: ctx.now() });
        if (err) note.textContent = 'Too late, the fuse burned out.';
      });
      input.addEventListener('input', () => {
        note.textContent = '';
        // Every letter keeps the fuse lit for you (the tick below asks for more time).
        if (snap && snap.canAct) lastKey = ctx.now();
        clearTimeout(draftT);
        draftT = setTimeout(() => ctx.setDraft(input.value.slice(0, 30)), 100);
      });
      startBox.querySelector('[data-a=start]').addEventListener('click', () => {
        if (!snap || snap.state.started) return;
        ctx.send({ start: true, at: ctx.now() });
      });

      const tick = setInterval(() => {
        if (!snap) return;
        const s = snap.state;
        if (!s.started || F.over(s)) return;
        const now = ctx.now(), paused = now < (s.roundStart || 0);
        stage.classList.toggle('pause', paused);
        if (s.variant === 'last') {
          const left = Math.max(0, s.deadline - now), total = (s.settings && s.settings.limit) || 12000;
          el.querySelector('.fz-clock i').style.width = (paused ? 100 : Math.round(100 * left / total)) + '%';
          el.querySelector('.fz-clock').classList.toggle('low', !paused && left < 3000);
          if (now >= s.deadline && boomSent !== s.round) { boomSent = s.round; ctx.send({ timeout: true, round: s.round, at: now }); }
        } else {
          // While you're typing, ask for more fuse before it runs low (only near the end,
          // so a normal turn sends nothing extra).
          if (snap.canAct && !paused && input.value && now - lastKey < 2000 && s.fuseEnd - now < 2600 && now < s.fuseEnd && now - holdAt > 700 && (s.heldN !== s.n || (s.held || 0) < F.MAX_HOLD)) {
            holdAt = now;
            ctx.send({ typing: true, at: now });
          }
          // Other phones wait a moment longer, so a hold that's still on its way wins.
          const wait = snap.canAct ? 0 : 600;
          if (now >= s.fuseEnd + wait && boomSent !== s.round) { boomSent = s.round; ctx.send({ boom: true, round: s.round, at: now }); }
        }
        if (input.disabled !== (!snap.canAct || paused || !dictReady)) paint();
      }, 120);

      function paint() {
        if (!snap) return;
        const s = snap.state, now = ctx.now(), players = s.players || [];
        const over = F.over(s), paused = s.started && now < (s.roundStart || 0), last = s.variant === 'last';
        const mine = snap.canAct && s.started && !over;
        const doneMap = s.done || {};
        el.querySelector('.fz-clock').hidden = !last || !s.started || over;
        el.querySelector('.fz-fuse').hidden = last;
        // Player cards
        el.querySelector('.fz-players').innerHTML = players.map((p, i) => {
          const out = p.lives <= 0, cur = !over && s.started && (last ? !doneMap[i] && !out : s.turn === i);
          const hearts = Array.from({ length: Math.max(p.lives, 0) }, () => `<i class="ht">♥${T}</i>`).join('') || '<i class="ht out">Out</i>';
          const pct = Math.round(100 * (p.letters || '').length / F.BONUS.length);
          return `<div class="fz-p${cur ? ' cur' : ''}${out ? ' out' : ''}${i === me() && ctx.mode !== 'local' ? ' me' : ''}">
            <b>${esc(nameOf(i))}${i === me() && ctx.mode !== 'local' ? ' <small>(you)</small>' : ''}${p.bot ? ' <small>bot</small>' : ''}</b>
            <span class="fz-hearts">${hearts}</span>
            <span class="fz-bar" title="Bonus letters"><i style="width:${pct}%"></i></span>
            ${last && doneMap[i] ? `<span class="fz-said">${esc(doneMap[i].w)}</span>` : ''}
          </div>`;
        }).join('');
        el.querySelector('.fz-players').classList.toggle('many', players.length > 2);
        stage.classList.toggle('mine', mine);
        stage.classList.toggle('lit', s.started && !over);
        el.querySelector('.fz-prompt').textContent = over ? '' : s.prompt.toUpperCase();
        let holder;
        if (over) holder = s.winner === 'done' ? `Game over. ${s.used.length} word${s.used.length === 1 ? '' : 's'}.` : s.winner === 'draw' ? 'Nobody made it' : s.winner === me() && ctx.mode !== 'local' ? 'You win!' : `${nameOf(s.winner)} wins`;
        else if (!s.started) holder = 'Get ready';
        else if (paused && last) holder = s.round > 1 ? 'Next round…' : 'Get ready…';
        else if (paused) holder = `${s.round > 1 ? 'New round. ' : ''}${ctx.mode !== 'local' && s.turn === me() ? 'You start' : nameOf(s.turn) + ' starts'}…`;
        else if (last) holder = mine ? 'Quick! Type a word with' : players[me()] && players[me()].lives > 0 ? 'You’re in. Waiting for the others…' : 'You’re out. Watch the rest';
        else if (ctx.mode === 'local') holder = `${nameOf(s.turn)}, type a word with`;
        else holder = s.turn === me() ? 'Your turn! Type a word with' : `${nameOf(s.turn)} has the fuse`;
        el.querySelector('.fz-holder').textContent = holder;
        const d = snap.draft;
        el.querySelector('.fz-draft').innerHTML = !last && !mine && !over && d && d.seat === s.turn && (d.n == null || d.n === s.n) && d.text ? hl(String(d.text).toLowerCase(), s.prompt) : '';
        input.disabled = !mine || paused || !dictReady;
        input.placeholder = !dictReady ? (dictError ? 'Couldn’t load words' : 'Loading words…') : mine ? `A word with ${s.prompt.toUpperCase()}` : 'Wait for your turn';
        const key = `${s.round}:${s.n}:${mine}:${paused}:${last ? Object.keys(doneMap).length : ''}`;
        if (mine && !paused && key !== lastTurnKey) { lastTurnKey = key; setTimeout(() => { try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } }, 30); }
        if (!mine && input.value) input.value = '';
        form.hidden = !s.started || over;
        // Bonus letters you still need
        const mineP = players[ctx.mode === 'local' ? s.turn : me()];
        el.querySelector('.fz-letters').innerHTML = mineP && s.started && !over ? F.BONUS.split('').map(ch => `<span class="${mineP.letters.includes(ch) ? 'got' : ''}">${ch}</span>`).join('') : '';
        el.querySelector('.fz-log').innerHTML = s.log.slice(-8).reverse().map(x => x.boom
          ? `<span class="fz-chip boom">${esc(nameOf(x.p))} lost a life</span>`
          : `<span class="fz-chip${x.bonus ? ' bonus' : ''}"><small>${esc(nameOf(x.p))}</small> ${hl(x.w, x.k)}${x.bonus ? ' <em>+1 life</em>' : ''}</span>`).join('');
        // Two-player partner games start when both are in.
        if (!s.started) {
          const both = ctx.mode === 'local' || ctx.mode === 'bots' || ctx.partnerHere();
          startBox.hidden = false;
          startBox.querySelector('p').textContent = ctx.local ? 'Pass the phone around. Each fuse has a secret length.' : both ? 'You’re both here. Each fuse has a secret length.' : `Waiting for ${nameOf(1 - me())} to open this game…`;
          startBox.querySelector('button').disabled = !both || !dictReady;
          startBox.querySelector('small').textContent = dictError ? 'The word list didn’t load. Check your connection.' : !dictReady ? 'Loading the word list…' : '';
        } else startBox.hidden = true;
        // Sounds and the boom
        const ev = s.ev != null ? s.ev : s.log.length;
        if (ev !== seenLog) {
          const last = s.log[s.log.length - 1];
          const quiet = ctx.quiet && ctx.quiet();      // a TV in the room makes the noise
          if (seenLog >= 0 && last) {
            if (last.boom) {
              const fresh = s.log.slice(Math.max(0, s.log.length - (ev - seenLog))).filter(x => x.boom).map(x => x.p);
              const who = fresh.map(p => (ctx.mode !== 'local' && p === me() ? 'You' : nameOf(p)));
              boomBox.querySelector('span').textContent = who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]} lost a life` : `${who[0] || nameOf(last.p)} lost a life`;
              boomBox.hidden = false;
              const box = el.querySelector('.fz');
              box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
              if (!quiet) sound('boom');
              if (BL.buzz) BL.buzz([60, 40, 120]);
              setTimeout(() => { boomBox.hidden = true; }, 1600);
            } else if (!quiet) sound(last.bonus ? 'bonus' : 'pass');
          }
          seenLog = ev;
        }
      }
      return {
        render(sn) { snap = sn; paint(); },
        refresh() { paint(); },
        destroy() { clearInterval(tick); clearTimeout(draftT); },
      };
    },
  };
})();
