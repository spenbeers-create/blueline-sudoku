/* Checkers on the big screen: the board in the middle, each player on their side
   with their pieces left, kings and captures, the last move traced on the board,
   and a running score. The first player swaps each game. */
(() => {
  'use strict';
  const BL = window.BL, esc = BL.esc;
  const TVG = window.BLTVGames || (window.BLTVGames = {});
  const K = () => window.BLGames.checkers, KV = () => window.BLViews.checkers;
  const parse = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return null; } };
  const onOff = [['1', 'On'], ['0', 'Off']];

  TVG.checkers = {
    title: 'Checkers',
    minPlayers: 2,
    maxPlayers: 2,
    defaults: () => ({ rules: window.BLMenus.checkers ? Object.assign({}, K().DEFAULT_RULES, (BL.store.get('checkersPrefs', {}) || {}).rules || {}) : K().DEFAULT_RULES }),
    settingsRows(st) {
      const rl = Object.assign({}, K().DEFAULT_RULES, st.rules || {});
      return [
        { key: 'forced', label: 'Must jump', value: rl.forced !== false ? '1' : '0', options: onOff },
        { key: 'flying', label: 'Flying kings', value: rl.flying ? '1' : '0', options: onOff },
      ];
    },
    setSetting(st, key, v) { const rl = Object.assign({}, K().DEFAULT_RULES, st.rules || {}); rl[key] = v === '1'; return Object.assign({}, st, { rules: rl }); },
    lobbyNote: () => 'Two players move from their phones. Tap a piece, then where it goes; for a double jump, tap each landing. The first player swaps every game.',
    start: code => window.BLRooms.start(code),
    unlock: () => KV().sound('unlock'),

    mount(el, ctx) {
      el.innerHTML = `
        <div class="tv4 tvk">
          <div class="tv4-side" data-side="0"><i class="tvf-av"></i><b></b><span class="tv4-score"></span><span class="tvk-left"></span><small></small></div>
          <div class="tv4-mid"><div class="ck tvk-board"><div class="ck-board">${Array.from({ length: 64 }, (_, i) => `<span class="ck-sq ${(Math.floor(i / 8) + i % 8) % 2 ? 'dk' : 'lt'}"></span>`).join('')}</div></div></div>
          <div class="tv4-side" data-side="1"><i class="tvf-av"></i><b></b><span class="tv4-score"></span><span class="tvk-left"></span><small></small></div>
          <div class="tvf-over" hidden></div>
        </div>`;
      const q = s => el.querySelector(s), board = q('.tvk-board'), overBox = q('.tvf-over');
      const squares = Array.from(el.querySelectorAll('.ck-sq'));
      let s = null, room = null, seenMoves = -1, overKey = '', overT = 0;
      const snd = k => { if (ctx.soundOn()) KV().sound(k); };
      const names = () => (room && room.seats ? room.seats.map(uid => ((room.players || {})[uid] || {}).name || 'Player') : ['Player 1', 'Player 2']);
      const wins = i => (room && room.score && room.seats ? room.score[room.seats[i]] || 0 : 0);
      // Players keep their side all session; their piece color follows who moves first.
      const joined = () => (room && room.players ? Object.entries(room.players).sort((a, b) => (a[1].at || 0) - (b[1].at || 0)).map(([u]) => u) : []);
      const seatOfSide = k => { const uid = joined()[k]; const i = room && room.seats && uid ? room.seats.indexOf(uid) : -1; return i >= 0 ? i : k; };

      function paint() {
        if (!s) return;
        KV().applyLook(board);
        const last = s.last || {}, trail = new Set(last.path || []), over = K().over(s);
        squares.forEach((cell, i) => {
          const cls = `ck-sq ${(Math.floor(i / 8) + i % 8) % 2 ? 'dk' : 'lt'}${trail.has(i) ? ' last' : ''}`;
          if (cell.className !== cls) cell.className = cls;
          const html = KV().pieceHtml(s.board[i]);
          if (cell._html !== html) { cell.innerHTML = html; cell._html = html; }
        });
        const n = names(), L = KV().look(), set = KV().SETS[L.set] || KV().SETS.classic;
        el.querySelectorAll('.tv4-side').forEach(side => {
          const seat = seatOfSide(+side.dataset.side), left = K().pieces(s, seat);
          side.style.setProperty('--c', set.c[seat]);
          side.classList.toggle('turn', !over && s.turn === seat);
          side.classList.toggle('won', over && s.winner === seat);
          side.querySelector('.tvf-av').textContent = (n[seat] || '?')[0].toUpperCase();
          side.querySelector('b').textContent = n[seat];
          side.querySelector('.tv4-score').textContent = wins(seat);
          side.querySelector('.tvk-left').textContent = `${left.men + left.kings} piece${left.men + left.kings === 1 ? '' : 's'}${left.kings ? ` · ${left.kings} king${left.kings === 1 ? '' : 's'}` : ''}`;
          side.querySelector('small').textContent = over ? (s.winner === seat ? 'Wins!' : '') : s.turn === seat ? (K().mustCapture(s) ? 'Has to jump' : 'Your move') : '';
        });
        ctx.info(`Game ${(room && room.played) || 1}`);
        if (seenMoves >= 0 && s.moves.length > seenMoves) snd(last.crowned ? 'king' : (last.caps || []).length ? 'capture' : 'move');
        seenMoves = s.moves.length;
        if (over && overKey !== `${room && room.played}:${s.moves.length}`) {
          overKey = `${room && room.played}:${s.moves.length}`;
          snd('win');
          clearTimeout(overT);
          overT = setTimeout(showOver, 1300);
        } else if (!over) { overBox.hidden = true; overKey = ''; clearTimeout(overT); }
      }

      function showOver() {
        if (!s || !K().over(s)) return;
        const n = names(), w = s.winner, set = (KV().SETS[KV().look().set] || KV().SETS.classic).c, a = seatOfSide(0), b = seatOfSide(1);
        overBox.innerHTML = `
          <p class="tv-k">Game ${(room && room.played) || 1}</p>
          <h1>${w !== 'draw' ? `<i class="tvf-av" style="--c:${set[w]}">${esc((n[w] || '?')[0].toUpperCase())}</i>` : ''}${esc(w === 'draw' ? 'It’s a draw' : `${n[w]} wins!`)}</h1>
          <p class="tvf-longest">${esc(K().summary(s, n))}</p>
          <p class="tv4-tally"><span style="--c:${set[a]}">${esc(n[a])} <b>${wins(a)}</b></span><span style="--c:${set[b]}"><b>${wins(b)}</b> ${esc(n[b])}</span></p>
          <p class="tvf-longest">${esc(n[1] || '')} moves first next game.</p>
          <div class="tvf-over-actions"><button type="button" class="btn primary big" data-a="again">Play again</button><button type="button" class="btn big" data-a="lobby">Change rules</button><button type="button" class="btn big" data-a="exit">Exit TV mode</button></div>`;
        overBox.hidden = false;
        overBox.querySelector('[data-a=again]').onclick = () => ctx.rematch();
        overBox.querySelector('[data-a=lobby]').onclick = () => ctx.playAgain();
        overBox.querySelector('[data-a=exit]').onclick = () => ctx.exit();
        try { overBox.querySelector('[data-a=again]').focus(); } catch (e) { /* ignore */ }
      }

      return {
        update(r) {
          const st = parse(r.state);
          if (!st) return;
          if (room && r.played !== room.played) seenMoves = -1;
          room = r; s = st;
          paint();
        },
        destroy() { clearTimeout(overT); },
      };
    },
  };
})();
