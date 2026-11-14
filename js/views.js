/* Screens for the two-player games. Each view gets a context from the match
   controller (hub.js) and redraws from a snapshot:
     turn games: { state, viewer, canAct }
     races:      { state, mine, theirs, over }
   ctx.send(move) returns a promise of an error message ('' when accepted). */
(() => {
  'use strict';
  const V = window.BLViews = {};
  const G = window.BLGames;
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const T = '︎'; // text-style glyphs, never emoji

  // ----------------------------------------------------------- four in a row
  V.four = {
    mount(el, ctx) {
      const { ROWS, COLS } = G.four;
      el.innerHTML = `<div class="c4"><div class="c4-grid" role="grid" aria-label="Four in a Row board">${
        Array.from({ length: ROWS * COLS }, (_, i) => `<button type="button" class="c4-cell" data-i="${i}" aria-label="Column ${i % COLS + 1}"><i></i></button>`).join('')
      }</div></div>`;
      const grid = el.querySelector('.c4-grid');
      const cells = Array.from(grid.children);
      let snap = null, hoverCol = -1;
      grid.addEventListener('click', e => {
        const b = e.target.closest('[data-i]');
        if (!b || !snap || !snap.canAct) return;
        ctx.send({ col: +b.dataset.i % COLS });
      });
      grid.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        const b = e.target.closest('[data-i]');
        const col = b ? +b.dataset.i % COLS : -1;
        if (col !== hoverCol) { hoverCol = col; paint(); }
      });
      grid.addEventListener('pointerleave', () => { hoverCol = -1; paint(); });
      function paint() {
        if (!snap) return;
        const s = snap.state, line = new Set(s.line || []);
        cells.forEach((c, i) => {
          const v = s.board[i];
          c.className = 'c4-cell' + (v === '0' ? ' p0' : v === '1' ? ' p1' : '') + (line.has(i) ? ' win' : '') +
            (i === s.last ? ' last' : '') + (snap.canAct && i % COLS === hoverCol ? ' hover' : '');
          if (i === s.last) c.style.setProperty('--drop', Math.floor(i / COLS) + 1);
        });
        grid.classList.toggle('can', !!snap.canAct);
        grid.dataset.turn = s.turn;
      }
      return { render(s) { snap = s; paint(); }, destroy() {} };
    },
  };

  // ------------------------------------------------------------------- chess
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  V.chess = {
    mount(el, ctx) {
      el.innerHTML = `
        <div class="ch">
          <div class="ch-cap" data-side="top"></div>
          <div class="ch-board" role="grid" aria-label="Chess board">${Array.from({ length: 64 }, (_, i) => `<button type="button" class="sq" data-v="${i}"></button>`).join('')}</div>
          <div class="ch-cap" data-side="bottom"></div>
          <div class="ch-moves" aria-label="Moves"></div>
          <div class="ch-promo" hidden><p>Promote to</p><div class="ch-promo-row"></div></div>
        </div>`;
      const boardEl = el.querySelector('.ch-board');
      const squares = Array.from(boardEl.children);
      const promoEl = el.querySelector('.ch-promo');
      let snap = null, selFrom = -1, targets = [];
      const flip = () => snap && snap.viewer === 1;
      const sqAt = v => (flip() ? 63 - v : v);

      boardEl.addEventListener('click', e => {
        const b = e.target.closest('[data-v]');
        if (!b || !snap) return;
        const i = sqAt(+b.dataset.v), s = snap.state;
        if (!snap.canAct) return;
        const mine = c => c !== '.' && ((s.turn === 0) === (c === c.toUpperCase()));
        const hits = targets.filter(m => m.to === i);
        if (selFrom >= 0 && hits.length) {
          if (hits.length > 1) { askPromo(hits); return; }
          const m = hits[0];
          selFrom = -1; targets = [];
          ctx.send({ from: m.from, to: m.to, promo: m.promo });
          return;
        }
        if (mine(s.board[i])) { selFrom = i === selFrom ? -1 : i; targets = selFrom >= 0 ? G.chess.movesFrom(s, i) : []; }
        else { selFrom = -1; targets = []; }
        paint();
      });

      function askPromo(hits) {
        const white = snap.state.turn === 0;
        promoEl.querySelector('.ch-promo-row').innerHTML = 'qrbn'.split('').map(p =>
          `<button type="button" class="pc ${white ? 'w' : 'b'}" data-p="${p}" aria-label="${({ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' })[p]}">${GLYPH[p]}${T}</button>`).join('');
        promoEl.hidden = false;
        promoEl.onclick = e => {
          const b = e.target.closest('[data-p]');
          if (!b) return;
          promoEl.hidden = true;
          const m = hits.find(x => x.promo === b.dataset.p);
          selFrom = -1; targets = [];
          ctx.send({ from: m.from, to: m.to, promo: m.promo });
        };
      }

      function capRow(captured, ofWhite) {
        const order = 'qrbnp';
        const list = captured.split('').filter(c => (c === c.toUpperCase()) === ofWhite).sort((a, b) => order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase()));
        return list.map(c => `<span class="${ofWhite ? 'w' : 'b'}">${GLYPH[c.toLowerCase()]}${T}</span>`).join('');
      }

      function paint() {
        if (!snap) return;
        const s = snap.state, last = s.last || {}, kingInCheck = s.check ? s.board.indexOf(s.turn === 0 ? 'K' : 'k') : -1;
        const tset = new Map(targets.map(m => [m.to, m]));
        squares.forEach((el2, v) => {
          const i = sqAt(v), p = s.board[i], f = i % 8, r = Math.floor(i / 8);
          let cls = 'sq ' + ((f + r) % 2 ? 'dk' : 'lt');
          if (i === last.from || i === last.to) cls += ' last';
          if (i === selFrom) cls += ' sel';
          if (i === kingInCheck) cls += ' check';
          if (tset.has(i)) cls += p !== '.' || tset.get(i).ep ? ' cap' : ' dot';
          el2.className = cls;
          const coord = (v % 8 === 0 ? `<em class="rk">${8 - r}</em>` : '') + (v >= 56 ? `<em class="fl">${'abcdefgh'[f]}</em>` : '');
          el2.innerHTML = (p !== '.' ? `<span class="pc ${p === p.toUpperCase() ? 'w' : 'b'}">${GLYPH[p.toLowerCase()]}${T}</span>` : '') + coord;
          el2.setAttribute('aria-label', G.chess.squareName(i) + (p !== '.' ? ' ' + p : ''));
        });
        boardEl.classList.toggle('can', !!snap.canAct);
        const meWhite = !flip();
        el.querySelector('[data-side="top"]').innerHTML = capRow(s.captured || '', meWhite);
        el.querySelector('[data-side="bottom"]').innerHTML = capRow(s.captured || '', !meWhite);
        const h = s.history || [];
        const pairs = [];
        for (let k = 0; k < h.length; k += 2) pairs.push(`<span><b>${k / 2 + 1}.</b> ${esc(h[k])}${h[k + 1] ? ' ' + esc(h[k + 1]) : ''}</span>`);
        const mv = el.querySelector('.ch-moves');
        mv.innerHTML = pairs.slice(-6).join('') || '<span class="muted">White moves first</span>';
        mv.scrollLeft = mv.scrollWidth;
      }
      return {
        render(s) {
          const turnChanged = !snap || snap.state.turn !== s.state.turn || (snap.state.history || []).length !== (s.state.history || []).length;
          snap = s;
          if (turnChanged) { selFrom = -1; targets = []; promoEl.hidden = true; }
          paint();
        },
        destroy() {},
      };
    },
  };

  // ------------------------------------------------------------ crazy eights
  const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const rankLabel = r => (r === 'T' ? '10' : r);
  const cardHtml = (c, extra = '') => `<span class="card ${'HD'.includes(c[1]) ? 'red' : 'blk'} ${extra}"><b>${rankLabel(c[0])}</b><em>${SUIT[c[1]]}${T}</em><i>${SUIT[c[1]]}${T}</i></span>`;
  V.eights = {
    mount(el, ctx) {
      el.innerHTML = `
        <div class="e8">
          <div class="e8-opp"><span class="e8-opp-name"></span><div class="e8-backs"></div></div>
          <div class="e8-table">
            <button type="button" class="e8-stock" aria-label="Draw a card"><span class="card back"></span><small></small></button>
            <div class="e8-pile"></div>
            <div class="e8-suit" hidden></div>
          </div>
          <p class="e8-status" aria-live="polite"></p>
          <div class="e8-hand" role="list"></div>
          <div class="e8-actions"><button type="button" class="btn" data-a="pass" hidden>Pass</button></div>
          <div class="e8-picker" hidden><p>Eights are wild. Pick the new suit.</p><div class="e8-suits">${
            'SHDC'.split('').map(s => `<button type="button" class="${'HD'.includes(s) ? 'red' : 'blk'}" data-s="${s}" aria-label="${G.eights.SUIT_NAMES[s]}">${SUIT[s]}${T}</button>`).join('')
          }</div></div>
          <div class="e8-cover" hidden><p></p><button type="button" class="btn primary big" data-a="reveal"></button></div>
        </div>`;
      const hand = el.querySelector('.e8-hand'), picker = el.querySelector('.e8-picker'), cover = el.querySelector('.e8-cover');
      let snap = null, pending8 = null, coverFor = -1;
      hand.addEventListener('click', e => {
        const b = e.target.closest('[data-c]');
        if (!b || !snap || !snap.canAct) return;
        const c = b.dataset.c;
        if (!G.eights.canPlay(snap.state, c)) { ctx.toast(`That card doesn’t match. Play ${SUIT[snap.state.suit]} or a ${rankLabel(G.eights.top(snap.state)[0])}, or an 8.`); return; }
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
      el.querySelector('.e8-stock').addEventListener('click', () => {
        if (!snap || !snap.canAct) return;
        const s = snap.state, me = snap.viewer;
        if (!G.eights.mustDraw(s, me)) { ctx.toast('You have a card you can play. Draw only when you’re stuck.'); return; }
        ctx.send({ draw: true });
      });
      el.querySelector('[data-a=pass]').addEventListener('click', () => ctx.send({ pass: true }));
      cover.querySelector('[data-a=reveal]').addEventListener('click', () => { cover.hidden = true; coverFor = snap ? snap.viewer : -1; paint(); });

      function paint() {
        if (!snap) return;
        const s = snap.state, me = snap.viewer, opp = 1 - me, names = ctx.names;
        // Pass-and-play: hide the hand until the right person has the phone.
        if (ctx.local && !G.eights.over(s) && coverFor !== me) {
          cover.querySelector('p').textContent = `Pass the phone to ${names[me]}.`;
          cover.querySelector('button').textContent = `I’m ${names[me]}, show my cards`;
          cover.hidden = false;
        }
        el.querySelector('.e8-opp-name').textContent = `${names[opp]} · ${s.hands[opp].length} card${s.hands[opp].length === 1 ? '' : 's'}`;
        el.querySelector('.e8-backs').innerHTML = Array.from({ length: Math.min(s.hands[opp].length, 12) }, () => '<span class="card back sm"></span>').join('');
        el.querySelector('.e8-stock small').textContent = s.stock.length ? `${s.stock.length} left` : 'Empty';
        el.querySelector('.e8-stock').classList.toggle('hot', !!snap.canAct && G.eights.mustDraw(s, me) && G.eights.legal(s, { draw: true }, me));
        el.querySelector('.e8-pile').innerHTML = cardHtml(G.eights.top(s), 'big');
        const suitEl = el.querySelector('.e8-suit');
        const topCard = G.eights.top(s);
        suitEl.hidden = !(topCard[0] === '8');
        suitEl.innerHTML = `Suit is <b class="${'HD'.includes(s.suit) ? 'red' : 'blk'}">${SUIT[s.suit]}${T}</b>`;
        const show = !ctx.local || coverFor === me || G.eights.over(s);
        const mine = s.hands[me].slice().sort((a, b) => ('SHDC'.indexOf(a[1]) - 'SHDC'.indexOf(b[1])) || ('A23456789TJQK'.indexOf(a[0]) - 'A23456789TJQK'.indexOf(b[0])));
        hand.innerHTML = show ? mine.map(c => `<button type="button" class="hand-card${snap.canAct && G.eights.canPlay(s, c) ? ' ok' : ''}" data-c="${c}" role="listitem" aria-label="${G.eights.cardName(c)}">${cardHtml(c)}</button>`).join('') : '';
        hand.style.setProperty('--n', mine.length);
        const passBtn = el.querySelector('[data-a=pass]');
        passBtn.hidden = !(snap.canAct && G.eights.legal(s, { pass: true }, me));
        const last = s.log[s.log.length - 1];
        let status = '';
        if (G.eights.over(s)) status = s.winner === me ? 'You played your last card.' : `${names[s.winner]} played their last card.`;
        else if (snap.canAct) status = G.eights.mustDraw(s, me) ? (s.stock.length || s.discard.length > 1 ? 'No match in your hand. Tap the pile to draw.' : 'No cards left to draw. Pass your turn.') : 'Your turn. Tap a card to play it.';
        else status = `${names[s.turn]} is playing…`;
        if (last && !G.eights.over(s)) {
          const who = last.p === me ? 'You' : names[last.p];
          const what = last.play ? `played the ${G.eights.cardName(last.play)}${last.suit ? ` and picked ${G.eights.SUIT_NAMES[last.suit]}` : ''}` : last.draw ? 'drew a card' : 'passed';
          status = `${who} ${what}. ${status}`;
        }
        el.querySelector('.e8-status').textContent = status;
      }
      return { render(s) { snap = s; if (!s.canAct) { picker.hidden = true; pending8 = null; } paint(); }, destroy() {} };
    },
  };

  // --------------------------------------------------------------- word duel
  const ROWS_KB = ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-'];
  V.words = {
    mount(el, ctx) {
      el.innerHTML = `
        <div class="wd">
          <div class="wd-opp" hidden><span class="wd-opp-name"></span><div class="wd-mini"></div></div>
          <div class="wd-grid" aria-label="Your guesses"></div>
          <p class="wd-note" aria-live="polite"></p>
          <div class="wd-kb">${ROWS_KB.map(r => `<div class="wd-row">${r.split('').map(k =>
            k === '+' ? '<button type="button" class="wd-key wide" data-k="enter">Enter</button>'
            : k === '-' ? '<button type="button" class="wd-key wide" data-k="back" aria-label="Delete letter">⌫</button>'
            : `<button type="button" class="wd-key" data-k="${k}">${k}</button>`).join('')}</div>`).join('')}</div>
        </div>`;
      const gridEl = el.querySelector('.wd-grid');
      let snap = null, typed = '', busy = false;
      const max = G.words.MAX;
      gridEl.innerHTML = Array.from({ length: max }, () => `<div class="wd-line">${'<span class="wd-tile"></span>'.repeat(5)}</div>`).join('');
      const lines = Array.from(gridEl.children);

      async function press(k) {
        if (!snap || snap.mine.done || busy) return;
        if (k === 'back') typed = typed.slice(0, -1);
        else if (k === 'enter') {
          if (typed.length < 5) { shake('Not enough letters'); return; }
          busy = true;
          const err = await ctx.send({ guess: typed });
          busy = false;
          if (err) { shake(err); return; }
          typed = '';
        } else if (/^[a-z]$/.test(k) && typed.length < 5) typed += k;
        paint();
      }
      function shake(msg) {
        const row = lines[snap.mine.guesses.length];
        if (row) { row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake'); }
        el.querySelector('.wd-note').textContent = msg;
      }
      el.querySelector('.wd-kb').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
      const onKey = e => {
        if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('#sheet:not([hidden])')) return;
        if (e.key === 'Enter') { e.preventDefault(); press('enter'); }
        else if (e.key === 'Backspace') { e.preventDefault(); press('back'); }
        else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toLowerCase());
      };
      document.addEventListener('keydown', onKey);

      function paint() {
        if (!snap) return;
        const m = snap.mine;
        lines.forEach((line, r) => {
          const tiles = line.children;
          const g = m.guesses[r], mark = m.marks[r];
          for (let c = 0; c < 5; c++) {
            const t = tiles[c];
            if (g) { t.textContent = g[c]; t.className = 'wd-tile ' + ({ g: 'hit', y: 'near', '.': 'miss' })[mark[c]]; t.style.setProperty('--k', c); }
            else if (r === m.guesses.length && !m.done) { t.textContent = typed[c] || ''; t.className = 'wd-tile' + (typed[c] ? ' typed' : ''); }
            else { t.textContent = ''; t.className = 'wd-tile'; }
          }
        });
        const best = {};
        m.guesses.forEach((g, r) => g.split('').forEach((ch, c) => {
          const v = m.marks[r][c] === 'g' ? 3 : m.marks[r][c] === 'y' ? 2 : 1;
          best[ch] = Math.max(best[ch] || 0, v);
        }));
        el.querySelectorAll('.wd-key[data-k]').forEach(k => {
          const v = best[k.dataset.k];
          k.className = 'wd-key' + (k.dataset.k.length > 1 ? ' wide' : '') + (v === 3 ? ' hit' : v === 2 ? ' near' : v === 1 ? ' miss' : '');
        });
        const note = el.querySelector('.wd-note');
        if (m.done) note.textContent = m.solved ? `You got it in ${m.guesses.length}.` : `Out of guesses. The word was ${snap.state.word.toUpperCase()}.`;
        else if (!note.textContent || note.dataset.row !== String(m.guesses.length)) { note.textContent = ''; }
        note.dataset.row = String(m.guesses.length);
        const opp = el.querySelector('.wd-opp');
        if (snap.theirs !== undefined) {
          opp.hidden = false;
          const t = snap.theirs;
          el.querySelector('.wd-opp-name').textContent = !t || !t.guesses.length ? `${ctx.names[1 - snap.viewer]} hasn’t guessed yet` : t.done ? `${ctx.names[1 - snap.viewer]}: ${t.solved ? 'solved in ' + t.guesses.length : 'missed it'}` : `${ctx.names[1 - snap.viewer]}: ${t.guesses.length} guess${t.guesses.length === 1 ? '' : 'es'}`;
          el.querySelector('.wd-mini').innerHTML = (t ? t.marks : []).map((mk, r) => `<div>${mk.split('').map(x => `<i class="${({ g: 'hit', y: 'near', '.': 'miss' })[x]}"></i>`).join('')}${m.done && snap.over && t.guesses[r] ? `<b>${esc(t.guesses[r])}</b>` : ''}</div>`).join('');
        }
      }
      return {
        render(s) { snap = s; paint(); },
        destroy() { document.removeEventListener('keydown', onKey); },
      };
    },
  };
  // -------------------------------------------------------------- short fuse
  V.fuse = {
    mount(el, ctx) {
      const F = G.fuse;
      el.innerHTML = `
        <div class="fz">
          <div class="fz-stage">
            <div class="fz-fuse" aria-hidden="true"><span class="fz-rope"></span><span class="fz-spark"></span></div>
            <p class="fz-holder"></p>
            <div class="fz-prompt" aria-live="polite"></div>
            <div class="fz-draft"></div>
          </div>
          <form class="fz-form" autocomplete="off">
            <input class="input" id="fz-in" type="text" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="send" maxlength="30" aria-label="Your word">
            <button type="submit" class="btn primary">Send</button>
          </form>
          <p class="fz-note" aria-live="polite"></p>
          <div class="fz-log"></div>
          <div class="fz-start" hidden><p></p><button type="button" class="btn primary big" data-a="start">Light the fuse</button><small></small></div>
          <div class="fz-boom" hidden><b>Boom</b><span></span></div>
        </div>`;
      const input = el.querySelector('#fz-in'), note = el.querySelector('.fz-note'), form = el.querySelector('.fz-form');
      const startBox = el.querySelector('.fz-start'), boomBox = el.querySelector('.fz-boom'), stage = el.querySelector('.fz-stage');
      let snap = null, dictReady = F.hasDictionary(), dictError = false, boomSent = 0, seenLog = -1, draftT = 0, lastTurnKey = '';
      F.loadDictionary().then(() => { dictReady = true; paint(); }).catch(() => { dictError = true; paint(); });

      const hl = (w, k) => { const i = w.indexOf(k); return i < 0 ? esc(w) : `${esc(w.slice(0, i))}<b>${esc(k)}</b>${esc(w.slice(i + k.length))}`; };

      form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!snap || !snap.canAct) return;
        const s = snap.state, w = input.value.trim().toLowerCase();
        if (!s.started || ctx.now() < (s.roundStart || 0)) return;
        const why = F.problem(s, w);
        if (why) { note.textContent = why; form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); return; }
        input.value = '';
        note.textContent = '';
        ctx.setDraft('');
        const err = await ctx.send({ word: w, at: ctx.now() });
        if (err) note.textContent = 'Too late, the fuse burned out.';
      });
      input.addEventListener('input', () => {
        note.textContent = '';
        clearTimeout(draftT);
        draftT = setTimeout(() => ctx.setDraft(input.value.slice(0, 30)), 120);
      });
      startBox.querySelector('[data-a=start]').addEventListener('click', () => {
        if (!snap || snap.state.started) return;
        ctx.send({ start: true, at: ctx.now() });
      });

      const tick = setInterval(() => {
        if (!snap) return;
        const s = snap.state;
        if (!s.started || F.over(s)) return;
        const now = ctx.now();
        const paused = now < (s.roundStart || 0);
        stage.classList.toggle('pause', paused);
        if (now >= s.fuseEnd && boomSent !== s.round) { boomSent = s.round; ctx.send({ boom: true, round: s.round, at: now }); }
        if (input.disabled !== (!snap.canAct || paused || !dictReady)) paint();
      }, 120);

      function paint() {
        if (!snap) return;
        const s = snap.state, names = ctx.names, me = snap.viewer, now = ctx.now();
        const over = F.over(s), paused = s.started && now < (s.roundStart || 0);
        const mine = snap.canAct && s.started && !over;
        stage.classList.toggle('mine', mine);
        stage.classList.toggle('lit', s.started && !over);
        el.querySelector('.fz-prompt').textContent = over ? '' : s.prompt.toUpperCase();
        let holder;
        if (over) holder = !ctx.local && s.winner === me ? 'You win!' : `${names[s.winner]} wins`;
        else if (!s.started) holder = 'Get ready';
        else if (paused) holder = `New round. ${ctx.local ? names[s.turn] + ' starts' : s.turn === me ? 'You start' : names[s.turn] + ' starts'}.`;
        else if (ctx.local) holder = `${names[s.turn]}, type a word with`;
        else holder = s.turn === me ? 'Your turn! Type a word with' : `${names[s.turn]} has the fuse`;
        el.querySelector('.fz-holder').textContent = holder;
        const d = snap.draft;
        el.querySelector('.fz-draft').innerHTML = !ctx.local && !mine && !over && d && d.seat === s.turn && d.text ? hl(String(d.text).toLowerCase(), s.prompt) : '';
        input.disabled = !mine || paused || !dictReady;
        input.placeholder = !dictReady ? (dictError ? 'Couldn’t load words' : 'Loading words…') : mine ? `A word with ${s.prompt.toUpperCase()}` : 'Wait for your turn';
        const key = `${s.round}:${s.n}:${mine}:${paused}`;
        if (mine && !paused && key !== lastTurnKey) { lastTurnKey = key; setTimeout(() => { try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } }, 30); }
        if (!mine && input.value) input.value = '';
        form.hidden = !s.started || over;
        el.querySelector('.fz-log').innerHTML = s.log.slice(-8).reverse().map(x => x.boom
          ? `<span class="fz-chip boom p${x.p}">${esc(names[x.p])} lost a life</span>`
          : `<span class="fz-chip p${x.p}">${hl(x.w, x.k)}</span>`).join('');
        if (!s.started) {
          const both = ctx.local || ctx.partnerHere();
          startBox.hidden = false;
          startBox.querySelector('p').textContent = ctx.local ? 'Pass the phone back and forth. Each fuse has a secret length.'
            : both ? 'You’re both here. Each fuse has a secret length.' : `Waiting for ${names[1 - me]} to open this game…`;
          startBox.querySelector('button').disabled = !both || !dictReady;
          startBox.querySelector('small').textContent = dictError ? 'The word list didn’t load. Check your connection.' : !dictReady ? 'Loading the word list…' : '';
        } else startBox.hidden = true;
        if (s.log.length !== seenLog) {
          const last = s.log[s.log.length - 1];
          if (seenLog >= 0 && last && last.boom) {
            boomBox.querySelector('span').textContent = !ctx.local && last.p === me ? 'You lost a life' : `${names[last.p]} lost a life`;
            boomBox.hidden = false;
            const box = el.querySelector('.fz');
            box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
            if (window.BL && window.BL.buzz) window.BL.buzz([60, 40, 120]);
            setTimeout(() => { boomBox.hidden = true; }, 1600);
          }
          seenLog = s.log.length;
        }
      }
      return {
        render(sn) { snap = sn; paint(); },
        destroy() { clearInterval(tick); clearTimeout(draftT); },
      };
    },
  };
})();
