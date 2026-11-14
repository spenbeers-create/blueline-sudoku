/* Four in a Row on the big screen: the board fills the middle, each player sits
   on a side with their color and the running score, discs drop as people play on
   their phones, and the winning four lights up. Play again deals the next game
   with the other player starting. */
(() => {
  'use strict';
  const F = window.BLGames.four, BL = window.BL, esc = BL.esc;
  const TVG = window.BLTVGames || (window.BLTVGames = {});
  const parse = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return null; } };
  const FV = () => window.BLViews.four;

  TVG.four = {
    title: 'Four in a Row',
    minPlayers: 2,
    maxPlayers: 2,
    defaults: () => ({ size: (BL.store.get('fourPrefs', {}) || {}).onlineSize || 'classic' }),
    settingsRows: st => [{ key: 'size', label: 'Board', value: st.size || 'classic', options: Object.entries(F.SIZES).map(([k, z]) => [k, `${z.name} ${z.sub}`]) }],
    setSetting: (st, key, v) => Object.assign({}, st, { [key]: v }),
    lobbyNote: () => 'Two players drop discs from their phones. First to line up four wins, and the other player starts the next game.',
    start: code => window.BLRooms.start(code),
    unlock: () => FV().sound('unlock'),

    mount(el, ctx) {
      el.innerHTML = `
        <div class="tv4">
          <div class="tv4-side" data-side="0"><i class="tvf-av"></i><b></b><span class="tv4-score"></span><small></small></div>
          <div class="tv4-mid"><div class="c4 tv4-c4"><div class="c4-grid"></div></div></div>
          <div class="tv4-side" data-side="1"><i class="tvf-av"></i><b></b><span class="tv4-score"></span><small></small></div>
          <div class="tvf-over" hidden></div>
        </div>`;
      const q = s => el.querySelector(s);
      const board = q('.tv4-c4'), grid = q('.c4-grid'), overBox = q('.tvf-over');
      let s = null, room = null, cells = [], dimsKey = '', seenMoves = -1, animAt = -1, animUntil = 0, overKey = '', overT = 0;
      const snd = k => { if (ctx.soundOn()) FV().sound(k); };
      const names = () => (room && room.seats ? room.seats.map(uid => ((room.players || {})[uid] || {}).name || 'Player') : ['Player 1', 'Player 2']);
      const score = i => (room && room.score && room.seats ? room.score[room.seats[i]] || 0 : 0);
      // Each player keeps their side and color all session, whoever starts each game.
      const joined = () => (room && room.players ? Object.entries(room.players).sort((a, b) => (a[1].at || 0) - (b[1].at || 0)).map(([uid]) => uid) : []);
      const seatOfSide = k => { const uid = joined()[k]; const i = room && room.seats && uid ? room.seats.indexOf(uid) : -1; return i >= 0 ? i : k; };
      const colorOfSeat = (seat, c0, c1) => (seatOfSide(0) === seat ? c0 : c1);

      function paint() {
        if (!s) return;
        const { rows, cols } = F.dims(s);
        if (dimsKey !== rows + 'x' + cols) {
          dimsKey = rows + 'x' + cols;
          board.style.setProperty('--cols', cols);
          board.style.setProperty('--rows', rows);
          grid.innerHTML = Array.from({ length: rows * cols }, () => '<span class="c4-cell"><i></i></span>').join('');
          cells = Array.from(grid.children);
        }
        const L = FV().look(), [c0, c1] = FV().seatColors(0, true, L);
        board.style.setProperty('--d0', colorOfSeat(0, c0, c1));
        board.style.setProperty('--d1', colorOfSeat(1, c0, c1));
        board.style.setProperty('--c4-frame', (FV().BOARDS[L.board] || FV().BOARDS.night).frame);
        board.className = `c4 tv4-c4 style-${FV().STYLES[L.style] ? L.style : 'shiny'}`;
        if (s.moves.length !== seenMoves) {
          if (seenMoves >= 0 && s.moves.length > seenMoves) snd('drop');
          animAt = seenMoves >= 0 ? s.last : -1; animUntil = Date.now() + 450;
          seenMoves = s.moves.length;
          setTimeout(paint, 470);
        }
        const anim = Date.now() < animUntil ? animAt : -1, line = new Set(s.line || []), over = F.over(s);
        cells.forEach((c, i) => {
          const v = s.board[i];
          c.className = 'c4-cell' + (v === '0' ? ' p0' : v === '1' ? ' p1' : '') + (line.has(i) ? ' win' : '') + (i === anim ? ' last' : '');
          if (i === s.last) c.style.setProperty('--drop', Math.floor(i / cols) + 1);
        });
        const n = names();
        el.querySelectorAll('.tv4-side').forEach(side => {
          const seat = seatOfSide(+side.dataset.side);
          side.style.setProperty('--c', colorOfSeat(seat, c0, c1));
          side.classList.toggle('turn', !over && s.turn === seat);
          side.classList.toggle('won', over && s.winner === seat);
          side.querySelector('.tvf-av').textContent = (n[seat] || '?')[0].toUpperCase();
          side.querySelector('b').textContent = n[seat];
          side.querySelector('.tv4-score').textContent = score(seat);
          side.querySelector('small').textContent = over ? (s.winner === seat ? 'Four in a row!' : '') : s.turn === seat ? 'Your move' : '';
        });
        const z = F.SIZES[s.size] || F.SIZES.classic;
        ctx.info(`Game ${(room && room.played) || 1} · ${z.name} board`);

        if (over && overKey !== (room && room.played) + ':' + s.moves.length) {
          overKey = (room && room.played) + ':' + s.moves.length;
          snd(s.winner === 'draw' ? 'drop' : 'win');
          clearTimeout(overT);
          overT = setTimeout(showOver, 1400);
        } else if (!over) { overBox.hidden = true; overKey = ''; clearTimeout(overT); }
      }

      function showOver() {
        if (!s || !F.over(s)) return;
        const n = names(), w = s.winner, [c0, c1] = FV().seatColors(0, true), a = seatOfSide(0), b = seatOfSide(1);
        const title = w === 'draw' ? 'It’s a draw' : `${n[w]} wins!`;
        overBox.innerHTML = `
          <p class="tv-k">Game ${(room && room.played) || 1}</p>
          <h1>${w !== 'draw' ? `<i class="tvf-av" style="--c:${colorOfSeat(w, c0, c1)}">${esc((n[w] || '?')[0].toUpperCase())}</i>` : ''}${esc(title)}</h1>
          <p class="tv4-tally"><span style="--c:${c0}">${esc(n[a])} <b>${score(a)}</b></span><span style="--c:${c1}"><b>${score(b)}</b> ${esc(n[b])}</span></p>
          <p class="tvf-longest">${w === 'draw' ? 'The board filled up.' : `Four in a row in ${Math.ceil(s.moves.length / 2)} moves.`} ${esc(n[w === 0 ? 1 : 0] || '')} starts the next one.</p>
          <div class="tvf-over-actions"><button type="button" class="btn primary big" data-a="again">Play again</button><button type="button" class="btn big" data-a="lobby">Change board</button><button type="button" class="btn big" data-a="exit">Exit TV mode</button></div>`;
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
          const fresh = s && (st.moves.length < s.moves.length || (room && r.played !== room.played));
          room = r;
          if (fresh) seenMoves = -1;            // a new game: no drop sound for the empty board
          s = st;
          paint();
        },
        destroy() { clearTimeout(overT); },
      };
    },
  };
})();
