/* Word Duel screen: any word length, hard mode, high-contrast colors, a live
   race start with countdown, the opponent's colors as they play, and a watch
   view when your partner is guessing a word you picked.
   Snapshot: { state, viewer, mine, theirs, over, startAt }. */
(() => {
  'use strict';
  const V = window.BLViews, W = window.BLGames.words, BL = window.BL;
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const KB = ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-'];
  const CLS = { g: 'hit', y: 'near', '.': 'miss' };
  const prefs = () => Object.assign({ len: 5, hard: false, contrast: false }, BL.store.get('wordsPrefs', {}));

  // Tiles update in place so the flip animation plays once, when a guess is revealed.
  function syncBoard(container, guesses, marks, rows, len, typed, current) {
    const dims = rows + 'x' + len;
    if (container._dims !== dims) {
      container._dims = dims;
      container.innerHTML = Array.from({ length: rows }, () => `<div class="wd-line" style="--len:${len}">${'<span class="wd-tile"></span>'.repeat(len)}</div>`).join('');
    }
    for (let r = 0; r < rows; r++) {
      const line = container.children[r];
      for (let c = 0; c < len; c++) {
        const t = line.children[c];
        let text = '', cls = 'wd-tile';
        if (guesses[r]) { text = guesses[r][c]; cls += ' ' + CLS[marks[r][c]]; }
        else if (r === current && typed && typed[c]) { text = typed[c]; cls += ' typed'; }
        if (t.textContent !== text) t.textContent = text;
        if (t.className !== cls) { t.style.setProperty('--k', c); t.className = cls; }
      }
    }
  }

  V.words = {
    mount(el, ctx) {
      el.innerHTML = `
        <div class="wd">
          <div class="wd-top"></div>
          <div class="wd-opp" hidden><span class="wd-opp-name"></span><div class="wd-mini"></div></div>
          <div class="wd-grid" aria-label="Your guesses"></div>
          <p class="wd-note" aria-live="polite"></p>
          <div class="wd-kb">${KB.map(r => `<div class="wd-row">${r.split('').map(k =>
            k === '+' ? '<button type="button" class="wd-key wide" data-k="enter">Enter</button>'
            : k === '-' ? '<button type="button" class="wd-key wide" data-k="back" aria-label="Delete letter">⌫</button>'
            : `<button type="button" class="wd-key" data-k="${k}">${k}</button>`).join('')}</div>`).join('')}</div>
          <div class="wd-watch" hidden></div>
          <div class="wd-start" hidden><p></p><button type="button" class="btn primary big" data-a="go">Start the race</button><small></small></div>
          <div class="wd-count" hidden></div>
        </div>`;
      const root = el.querySelector('.wd'), gridEl = el.querySelector('.wd-grid'), note = el.querySelector('.wd-note');
      const startBox = el.querySelector('.wd-start'), countEl = el.querySelector('.wd-count');
      let snap = null, typed = '', busy = false, lastRows = -1, wonRow = -1;

      const role = () => {
        const s = snap.state;
        if (s.mode === 'custom' && ctx.mode === 'online' && s.guesser !== snap.viewer) return 'setter';
        return 'player';
      };
      const liveLocked = () => {
        const s = snap.state;
        if (s.mode !== 'live' || ctx.mode !== 'online') return false;
        return !snap.startAt || ctx.now() < snap.startAt;
      };

      async function press(k) {
        if (!snap || snap.mine.done || snap.over || busy || role() === 'setter' || liveLocked()) return;
        const L = snap.state.len || snap.state.word.length;
        if (k === 'back') typed = typed.slice(0, -1);
        else if (k === 'enter') {
          if (typed.length < L) { shake('Not enough letters'); return; }
          busy = true;
          const move = { guess: typed };
          if (snap.state.mode === 'live' && snap.startAt) move.time = Math.max(0, ctx.now() - snap.startAt);
          const err = await ctx.send(move);
          busy = false;
          if (err) { shake(err); return; }
          typed = '';
          note.textContent = '';
        } else if (/^[a-z]$/.test(k) && typed.length < L) { typed += k; note.textContent = ''; }
        paint();
      }
      function shake(msg) {
        note.textContent = msg;
        const row = gridEl.children[snap.mine.guesses.length];
        if (row) { row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake'); }
        if (BL.buzz) BL.buzz(30);
      }
      el.querySelector('.wd-kb').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
      const onKey = e => {
        if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('#sheet:not([hidden])')) return;
        if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
        if (e.key === 'Enter') { e.preventDefault(); press('enter'); }
        else if (e.key === 'Backspace') { e.preventDefault(); press('back'); }
        else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toLowerCase());
      };
      document.addEventListener('keydown', onKey);
      startBox.querySelector('[data-a=go]').addEventListener('click', () => ctx.startLive && ctx.startLive());

      const tick = setInterval(() => { if (snap && snap.state.mode === 'live' && ctx.mode === 'online') paintLive(); }, 250);

      function paintLive() {
        const s = snap.state;
        if (s.mode !== 'live' || ctx.mode !== 'online' || snap.over) { startBox.hidden = true; countEl.hidden = true; return; }
        const now = ctx.now();
        if (!snap.startAt) {
          const both = ctx.partnerHere();
          startBox.hidden = false;
          startBox.querySelector('p').textContent = both ? 'You’re both here. Same word, first to solve wins.' : `Waiting for ${ctx.names[1 - snap.viewer]} to open this race…`;
          startBox.querySelector('button').disabled = !both;
          startBox.querySelector('small').textContent = both ? 'Either of you can start it.' : 'The race starts once you’re both in.';
          countEl.hidden = true;
        } else if (now < snap.startAt) {
          startBox.hidden = true;
          countEl.hidden = false;
          const n = Math.ceil((snap.startAt - now) / 1000);
          if (countEl.textContent !== String(n)) { countEl.textContent = n; countEl.classList.remove('tick'); void countEl.offsetWidth; countEl.classList.add('tick'); }
        } else {
          if (!countEl.hidden) { countEl.hidden = true; paint(); }
          startBox.hidden = true;
        }
      }

      function paint() {
        if (!snap) return;
        const s = snap.state, m = snap.mine, L = s.len || s.word.length, rows = s.max || 6;
        root.classList.toggle('hc', !!prefs().contrast);
        root.style.setProperty('--len', L);
        const setter = role() === 'setter';
        // Top line: what kind of game this is.
        let top = '';
        if (s.mode === 'daily') top = `<b>Daily word #${W.dailyNumber(s.daily)}</b>`;
        else if (s.mode === 'custom') top = setter ? `<b>Your word: ${esc(s.word.toUpperCase())}</b>` : `<b>${esc(s.by || 'Someone')}’s word</b>`;
        else if (s.mode === 'live') top = '<b>Live race</b><span>First to solve wins</span>';
        else if (ctx.mode === 'online') top = '<b>Duel</b><span>Fewer guesses wins</span>';
        else top = `<b>${L} letters</b>`;
        if (s.hard) top += '<span class="tag">Hard mode</span>';
        if (s.hint && !setter) top += `<span class="hint-line">Hint: ${esc(s.hint)}</span>`;
        el.querySelector('.wd-top').innerHTML = top;

        el.querySelector('.wd-kb').hidden = setter;
        gridEl.hidden = setter;
        const watch = el.querySelector('.wd-watch');
        watch.hidden = !setter;
        if (setter) {
          const t = snap.theirs || W.progress(), who = ctx.names[s.guesser];
          if (!watch.querySelector('.wd-grid')) watch.innerHTML = '<p></p><div class="wd-grid"></div>';
          watch.querySelector('p').textContent = t.guesses.length ? (t.done ? (t.solved ? `${who} got it in ${t.guesses.length}.` : `${who} couldn’t get it.`) : `${who} is guessing…`) : `${who} hasn’t started guessing yet.`;
          syncBoard(watch.querySelector('.wd-grid'), t.guesses, t.marks, rows, L, '', -1);
          note.textContent = '';
        } else {
          syncBoard(gridEl, m.guesses, m.marks, rows, L, typed, m.done ? -1 : m.guesses.length);
          if (m.solved && wonRow !== m.guesses.length - 1 && lastRows !== -1 && m.guesses.length > lastRows) {
            wonRow = m.guesses.length - 1;
            const row = gridEl.children[wonRow];
            if (row) setTimeout(() => row.classList.add('win'), 80 * L + 200);
          }
          lastRows = m.guesses.length;
          // Keyboard colors from your own guesses.
          const best = {};
          m.guesses.forEach((g, r) => g.split('').forEach((ch, c) => {
            const v = m.marks[r][c] === 'g' ? 3 : m.marks[r][c] === 'y' ? 2 : 1;
            best[ch] = Math.max(best[ch] || 0, v);
          }));
          el.querySelectorAll('.wd-key[data-k]').forEach(k => {
            const v = best[k.dataset.k];
            k.className = 'wd-key' + (k.dataset.k.length > 1 ? ' wide' : '') + (v === 3 ? ' hit' : v === 2 ? ' near' : v === 1 ? ' miss' : '');
          });
          if (m.done) note.textContent = m.solved ? `You got it in ${m.guesses.length}.` : `The word was ${s.word.toUpperCase()}.`;
        }
        // Opponent's colors (letters only once it's all over).
        const opp = el.querySelector('.wd-opp');
        if (snap.theirs !== undefined && !setter && s.mode !== 'custom') {
          opp.hidden = false;
          const t = snap.theirs || W.progress(), who = snap.theirsName || ctx.names[1 - snap.viewer];
          el.querySelector('.wd-opp-name').textContent = !t.guesses.length ? `${who} hasn’t guessed yet` : t.done ? `${who}: ${t.solved ? 'solved in ' + t.guesses.length : 'missed it'}` : `${who}: ${t.guesses.length} guess${t.guesses.length === 1 ? '' : 'es'}`;
          el.querySelector('.wd-mini').innerHTML = t.marks.map((mk, r) => `<div>${mk.split('').map(x => `<i class="${CLS[x]}"></i>`).join('')}${snap.over && t.guesses[r] ? `<b>${esc(t.guesses[r])}</b>` : ''}</div>`).join('');
        } else opp.hidden = true;
        paintLive();
      }
      return {
        render(sn) { snap = sn; paint(); },
        refresh() { paint(); },
        destroy() { clearInterval(tick); document.removeEventListener('keydown', onKey); },
      };
    },
  };
})();
