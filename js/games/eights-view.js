/* Crazy Eights table for 2 to 6: opponents across the top (in turn order, with
   their card counts), the deck and discard pile on the felt with the current suit,
   any draw-2 penalty and the direction of play, then your hand. Tap a card to play
   it; eights ask for a suit. On one phone the hand hides between turns.
   Look (eightsLook): felt color, card backs, two- or four-color suits, big corners,
   sounds, and how your hand is sorted. */
(() => {
  'use strict';
  const V = window.BLViews, G = window.BLGames, BL = window.BL;
  const E = () => G.eights;
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const T = '︎';
  const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const FELTS = { green: { name: 'Green', c: '#1F5E45' }, blue: { name: 'Blue', c: '#1D4A86' }, red: { name: 'Red', c: '#7A2632' }, purple: { name: 'Purple', c: '#4A2C6E' }, black: { name: 'Black', c: '#1A1F2B' } };
  const BACKS = { blue: { name: 'Blue', a: '#2A64E8', b: '#2155C9' }, red: { name: 'Red', a: '#D23A2E', b: '#B02A20' }, green: { name: 'Green', a: '#2E9A5A', b: '#237A47' }, purple: { name: 'Purple', a: '#7C4DDB', b: '#6538C0' }, gold: { name: 'Gold', a: '#D9A21B', b: '#B9860E' } };
  const COLORS = ['#6F9BFF', '#FF8A5B', '#4CC38A', '#F5C451', '#C38BFF', '#FF6FA8'];
  const look = () => Object.assign({ felt: 'green', back: 'blue', four: false, big: false, sound: true, sort: 'suit' }, BL.store.get('eightsLook', {}));
  const rankLabel = r => (r === 'T' ? '10' : r);
  const suitClass = (st, four) => (four ? { S: 'cs', H: 'ch', D: 'cd', C: 'cc' }[st] : 'HD'.includes(st) ? 'red' : 'blk');
  function cardHtml(c, cls = '', L = look()) {
    const st = c[1];
    return `<span class="card ${suitClass(st, L.four)} ${cls}"><b>${rankLabel(c[0])}</b><em>${SUIT[st]}${T}</em><i>${SUIT[st]}${T}</i></span>`;
  }
  const backHtml = (cls = '') => `<span class="card back ${cls}"></span>`;
  // A steady little tilt per card so the pile looks thrown, not stacked.
  const tilt = c => ((c.charCodeAt(0) * 31 + c.charCodeAt(1) * 17) % 17) - 8;
  const sorted = (hand, by) => hand.slice().sort(by === 'rank'
    ? (a, b) => ('A23456789TJQK'.indexOf(a[0]) - 'A23456789TJQK'.indexOf(b[0])) || ('SHDC'.indexOf(a[1]) - 'SHDC'.indexOf(b[1]))
    : (a, b) => ('SHDC'.indexOf(a[1]) - 'SHDC'.indexOf(b[1])) || ('A23456789TJQK'.indexOf(a[0]) - 'A23456789TJQK'.indexOf(b[0])));
  function applyLook(root, L = look()) {
    const f = FELTS[L.felt] || FELTS.green, b = BACKS[L.back] || BACKS.blue;
    root.style.setProperty('--felt', f.c);
    root.style.setProperty('--back-a', b.a);
    root.style.setProperty('--back-b', b.b);
    root.classList.toggle('big-index', !!L.big);
  }

  let audio = null;
  function sound(kind) {
    if (!look().sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime;
      const noise = (at, dur, freq, vol) => {
        const len = Math.floor(audio.sampleRate * dur), buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
        const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
        src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol;
        src.connect(f).connect(g).connect(audio.destination); src.start(t0 + at);
      };
      const tone = (f, at, dur, vol) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(f, t0 + at);
        g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        o.connect(g).connect(audio.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
      };
      if (kind === 'play') noise(0, 0.09, 2400, 0.5);
      else if (kind === 'draw') noise(0, 0.16, 1200, 0.35);
      else if (kind === 'special') { noise(0, 0.09, 2400, 0.5); tone(880, 0.05, 0.12, 0.07); }
      else if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, 0.09));
      else if (kind === 'lose') [392, 330, 262].forEach((f, i) => tone(f, i * 0.13, 0.25, 0.07));
    } catch (e) { /* no sound */ }
  }

  // What just happened, in words.
  function describe(e, nameOf, me) {
    if (!e) return '';
    const who = e.p === me ? 'You' : nameOf(e.p);
    if (e.play) {
      let t = `${who} played ${rankLabel(e.play[0])}${SUIT[e.play[1]]}${T}`;
      if (e.suit) t += ` and picked ${E().SUIT_NAMES[e.suit]}`;
      if (e.fx === 'skip') t += `. ${e.who === me ? 'You’re' : nameOf(e.who) + ' is'} skipped`;
      if (e.fx === 'reverse') t += '. Direction reversed';
      if (e.fx === 'draw') t += `. Next player draws ${e.n} or stacks a 2`;
      return t + '.';
    }
    if (e.draw) return e.penalty ? `${who} drew ${e.draw}.` : `${who} drew a card.`;
    if (e.pass) return `${who} passed.`;
    return '';
  }

  V.eights = {
    SUIT, FELTS, BACKS, COLORS, look, cardHtml, backHtml, tilt, applyLook, sound, describe, rankLabel, suitClass,
    mount(el, ctx) {
      el.innerHTML = `
        <div class="e8 v2">
          <div class="e8-opps"></div>
          <div class="e8-table">
            <button type="button" class="e8-stock" aria-label="Draw a card">${backHtml('under')}${backHtml()}<small></small></button>
            <div class="e8-pile" aria-live="polite"></div>
            <div class="e8-badges"><span class="e8-suit"></span><span class="e8-pending" hidden></span><span class="e8-dir" hidden></span></div>
          </div>
          <p class="e8-status" aria-live="polite"></p>
          <div class="e8-hand" role="list"></div>
          <div class="e8-actions"><button type="button" class="btn" data-a="pass" hidden>Pass</button><button type="button" class="btn ghost e8-sort" data-a="sort"></button></div>
          <div class="e8-picker" hidden><p>Eights are wild. Pick the new suit.</p><div class="e8-suits"></div></div>
          <div class="e8-cover" hidden><p></p><button type="button" class="btn primary big" data-a="reveal"></button></div>
        </div>`;
      const root = el.querySelector('.e8'), hand = el.querySelector('.e8-hand'), picker = el.querySelector('.e8-picker'), cover = el.querySelector('.e8-cover');
      const pile = el.querySelector('.e8-pile'), stock = el.querySelector('.e8-stock');
      let snap = null, pending8 = null, coverFor = -1, seenEv = -1, prevHand = null, seenOver = false;
      const nameOf = i => (ctx.names && ctx.names[i]) || (snap.state.players && snap.state.players[i] ? snap.state.players[i].name : `Player ${i + 1}`);

      hand.addEventListener('click', e => {
        const b = e.target.closest('[data-c]');
        if (!b || !snap || !snap.canAct) return;
        const s = snap.state, c = b.dataset.c;
        if (s.pending > 0) {
          if (c[0] !== '2') { ctx.toast(`Stack a 2, or tap the deck to draw ${s.pending}.`); return; }
          ctx.send({ play: c });
          return;
        }
        if (!E().canPlay(s, c)) { ctx.toast(`That doesn’t match. Play a ${SUIT[s.suit]}${T} or a ${rankLabel(E().top(s)[0])}, or an 8.`); return; }
        if (c[0] === '8') { pending8 = c; picker.hidden = false; return; }
        ctx.send({ play: c });
      });
      picker.addEventListener('click', e => {
        const b = e.target.closest('[data-s]');
        if (!b || !pending8) return;
        picker.hidden = true;
        const c = pending8; pending8 = null;
        ctx.send({ play: c, suit: b.dataset.s });
      });
      stock.addEventListener('click', () => {
        if (!snap || !snap.canAct) return;
        const s = snap.state, me = snap.viewer;
        if (E().legal(s, { draw: true }, me)) { ctx.send({ draw: true }); return; }
        if (E().rules(s).drawOne && s.drew > 0) ctx.toast('You’ve drawn this turn. Play a card or pass.');
        else if (!E().mustDraw(s, me)) ctx.toast('You have a card you can play. Draw only when you’re stuck.');
      });
      el.querySelector('[data-a=pass]').addEventListener('click', () => ctx.send({ pass: true }));
      el.querySelector('[data-a=sort]').addEventListener('click', () => {
        const L = look(); L.sort = L.sort === 'rank' ? 'suit' : 'rank';
        BL.store.set('eightsLook', L); paint();
      });
      cover.querySelector('[data-a=reveal]').addEventListener('click', () => { cover.hidden = true; coverFor = snap ? snap.viewer : -1; paint(); });
      const onLook = () => paint();
      document.addEventListener('bl:eightslook', onLook);

      function paint() {
        if (!snap) return;
        const s = snap.state, me = snap.viewer, n = s.hands.length, L = look(), over = E().over(s);
        applyLook(root, L);
        el.querySelector('.e8-suits').innerHTML = 'SHDC'.split('').map(st => `<button type="button" class="${suitClass(st, L.four)}" data-s="${st}" aria-label="${E().SUIT_NAMES[st]}">${SUIT[st]}${T}</button>`).join('');
        // Pass-and-play: hide the hand until the right person has the phone.
        if (ctx.local && !over && coverFor !== me) {
          cover.querySelector('p').textContent = `Pass the phone to ${nameOf(me)}.`;
          cover.querySelector('button').textContent = `I’m ${nameOf(me)}, show my cards`;
          cover.hidden = false;
        }
        // Opponents, starting with whoever plays after me.
        const order = [];
        for (let k = 1; k < n; k++) order.push(((me + k * (s.dir || 1)) % n + n) % n);
        el.querySelector('.e8-opps').innerHTML = order.map(i => {
          const cnt = s.hands[i].length;
          return `<div class="e8-opp${s.turn === i && !over ? ' turn' : ''}${s.winner === i ? ' won' : ''}" style="--c:${COLORS[i % COLORS.length]}">
            <i class="e8-av">${esc(nameOf(i)[0].toUpperCase())}</i>
            <span class="e8-on"><b>${esc(nameOf(i))}</b><small>${cnt === 1 && !over ? '<em>Last card!</em>' : `${cnt} card${cnt === 1 ? '' : 's'}`}</small></span>
            <span class="e8-fan">${Array.from({ length: Math.min(cnt, 6) }, () => backHtml('xs')).join('')}</span>
          </div>`;
        }).join('');
        el.querySelector('.e8-opps').dataset.n = order.length;

        // Table
        const recent = s.discard.slice(-3);
        const ev = s.ev != null ? s.ev : s.log.length, last = s.log[s.log.length - 1];
        const fresh = seenEv >= 0 && ev !== seenEv;
        pile.innerHTML = recent.map((c, k) => `<span class="e8-pc${k === recent.length - 1 && fresh && last && last.play ? (last.p === me ? ' land-me' : ' land') : ''}" style="--r:${tilt(c)}deg">${cardHtml(c, 'big', L)}</span>`).join('');
        stock.querySelector('small').textContent = s.stock.length ? `${s.stock.length} left` : 'Empty';
        const canDraw = snap.canAct && E().legal(s, { draw: true }, me);
        stock.classList.toggle('hot', canDraw);
        stock.setAttribute('aria-label', s.pending > 0 ? `Draw ${s.pending}` : 'Draw a card');
        const suitEl = el.querySelector('.e8-suit');
        suitEl.className = `e8-suit ${suitClass(s.suit, L.four)}${E().top(s)[0] === '8' ? ' wild' : ''}`;
        suitEl.innerHTML = `${SUIT[s.suit]}${T}<small>${E().top(s)[0] === '8' ? 'named' : 'suit'}</small>`;
        const pen = el.querySelector('.e8-pending');
        pen.hidden = !(s.pending > 0);
        pen.textContent = `+${s.pending}`;
        const dir = el.querySelector('.e8-dir');
        dir.hidden = n < 3;
        dir.textContent = (s.dir || 1) > 0 ? '↻' : '↺';
        dir.title = (s.dir || 1) > 0 ? 'Clockwise' : 'Counterclockwise';

        // My hand
        const show = !ctx.local || coverFor === me || over;
        const mine = sorted(s.hands[me], L.sort);
        const newOnes = prevHand ? mine.filter(c => !prevHand.includes(c)) : [];
        const okCard = c => snap.canAct && !over && (s.pending > 0 ? c[0] === '2' : E().canPlay(s, c));
        hand.innerHTML = show ? mine.map(c => `<button type="button" class="hand-card${okCard(c) ? ' ok' : ''}${newOnes.includes(c) && fresh ? ' new' : ''}" data-c="${c}" role="listitem" aria-label="${E().cardName(c)}">${cardHtml(c, '', L)}</button>`).join('') : '';
        hand.style.setProperty('--n', mine.length);
        hand.classList.toggle('waiting', !snap.canAct || over);
        prevHand = show ? mine : null;
        el.querySelector('[data-a=pass]').hidden = !(snap.canAct && E().legal(s, { pass: true }, me));
        el.querySelector('[data-a=sort]').textContent = L.sort === 'rank' ? 'Sort by suit' : 'Sort by number';

        // Status
        let status = '';
        if (over) status = s.winner === me && !ctx.local ? 'You played your last card!' : `${nameOf(s.winner)} played their last card.`;
        else if (snap.canAct) {
          const rl = E().rules(s);
          if (s.pending > 0) status = s.hands[me].some(c => c[0] === '2') ? `Stack a 2, or tap the deck to draw ${s.pending}.` : `Tap the deck to draw ${s.pending}.`;
          else if (rl.drawOne && s.drew > 0) status = E().mustDraw(s, me) ? 'No luck. Pass your turn.' : 'Play the card you drew, or pass.';
          else if (E().mustDraw(s, me)) status = canDraw ? 'No match. Tap the deck to draw.' : 'Nothing left to draw. Pass your turn.';
          else status = s.hands[me].length === 1 ? 'Last card! Play it to win.' : 'Your turn.';
        } else status = `${nameOf(s.turn)}’s turn…`;
        const said = describe(last, nameOf, ctx.local ? -1 : me);
        el.querySelector('.e8-status').innerHTML = `${said ? `<span>${esc(said)}</span> ` : ''}<b>${esc(status)}</b>`;
        root.classList.toggle('mine', !!snap.canAct && !over);

        // Sounds
        if (fresh && last) sound(last.play ? (last.fx ? 'special' : 'play') : last.draw ? 'draw' : 'play');
        if (over && !seenOver && seenEv >= 0) sound(ctx.local || s.winner === me ? 'win' : 'lose');
        seenEv = ev;
        seenOver = over;
      }
      return {
        render(sn) { snap = sn; if (!sn.canAct) { picker.hidden = true; pending8 = null; } paint(); },
        refresh() { paint(); },
        destroy() { document.removeEventListener('bl:eightslook', onLook); },
      };
    },
  };
})();
