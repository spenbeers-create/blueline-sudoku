/* Chess on the big screen: the board in the middle (white at the bottom), each
   player on their side with a big clock and the pieces they've taken, the last few
   moves underneath, check and the last move highlighted, and the result with a
   running score. Both players move from their phones; colors swap each game. */
(() => {
  'use strict';
  const BL = window.BL, esc = BL.esc;
  const TVG = window.BLTVGames || (window.BLTVGames = {});
  const C = () => window.BLGames.chess, CV = () => window.BLViews.chess;
  const parse = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return null; } };
  const CLOCKS = () => window.BLMenus.chess.CLOCKS;
  const fmtClock = ms => {
    if (ms == null) return '';
    ms = Math.max(0, ms);
    if (ms < 10000) return (ms / 1000).toFixed(1);
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  TVG.chess = {
    title: 'Chess',
    minPlayers: 2,
    maxPlayers: 2,
    defaults: () => { const p = Object.assign({ tc: '10+0' }, BL.store.get('chessPrefs', {})); return { tc: p.tc }; },
    settingsRows: st => [{ key: 'tc', label: 'Clock', value: st.tc || '', options: [['', 'None']].concat(CLOCKS().map(c => [c.id, c.id === '3+2' || c.id === '15+10' ? c.id : c.label])) }],
    setSetting: (st, key, v) => Object.assign({}, st, { [key]: v }),
    lobbyNote: () => 'Two players move from their phones. The first to join plays white, and colors swap every game.',
    start: code => window.BLRooms.start(code),
    unlock: () => CV().sound('unlock'),

    mount(el, ctx) {
      el.innerHTML = `
        <div class="tvc">
          <div class="tvc-side" data-seat="0"><i class="tvf-av"></i><b></b><span class="tvc-clock"></span><span class="tvc-cap"></span><small></small><span class="tvc-wins"></span></div>
          <div class="tvc-mid"><div class="ch tvc-board"><div class="ch-board"></div></div><p class="tvc-moves"></p></div>
          <div class="tvc-side" data-seat="1"><i class="tvf-av"></i><b></b><span class="tvc-clock"></span><span class="tvc-cap"></span><small></small><span class="tvc-wins"></span></div>
          <div class="tvf-over" hidden></div>
        </div>`;
      const q = s => el.querySelector(s), boardEl = q('.ch-board'), overBox = q('.tvf-over');
      boardEl.innerHTML = Array.from({ length: 64 }, (_, i) => `<span class="sq ${((i % 8) + Math.floor(i / 8)) % 2 ? 'dk' : 'lt'}"></span>`).join('');
      const squares = Array.from(boardEl.children);
      let s = null, room = null, seenMoves = -1, prevCaptured = 0, overKey = '', overT = 0;
      const snd = k => { if (ctx.soundOn()) CV().sound(k); };
      const names = () => (room && room.seats ? room.seats.map(uid => ((room.players || {})[uid] || {}).name || 'Player') : ['White', 'Black']);
      const wins = i => (room && room.score && room.seats ? room.score[room.seats[i]] || 0 : 0);

      const tick = setInterval(() => {
        if (!s || !s.clock) return;
        for (const side of el.querySelectorAll('.tvc-side')) {
          const seat = +side.dataset.seat, left = C().clockLeft(s, seat, ctx.now());
          const clk = side.querySelector('.tvc-clock');
          clk.textContent = fmtClock(left);
          clk.classList.toggle('run', !!s.clock.running && s.turn === seat && !C().over(s));
          clk.classList.toggle('low', left < 20000);
        }
      }, 200);

      function paint() {
        if (!s) return;
        const L = CV().look(), b = CV().BOARDS[L.board] || CV().BOARDS.blue;
        const board = q('.tvc-board');
        board.className = `ch tvc-board set-${L.pieces} colors-${L.colors}`;
        board.style.setProperty('--sq-lt', b.lt);
        board.style.setProperty('--sq-dk', b.dk);
        const last = s.last || {}, king = s.check ? s.board.indexOf(s.turn === 0 ? 'K' : 'k') : -1;
        squares.forEach((cell, i) => {
          const p = s.board[i];
          let cls = 'sq ' + (((i % 8) + Math.floor(i / 8)) % 2 ? 'dk' : 'lt');
          if (i === last.from || i === last.to) cls += ' last';
          if (i === king) cls += ' check';
          if (cell.className !== cls) cell.className = cls;
          const html = p !== '.' ? CV().pieceHtml(p, L.pieces) : '';
          if (cell._html !== html) { cell.innerHTML = html; cell._html = html; }
        });
        const n = names(), over = C().over(s);
        let diff = 0;
        for (const ch of s.board) if (ch !== '.') diff += (ch === ch.toUpperCase() ? 1 : -1) * VAL[ch.toLowerCase()];
        el.querySelectorAll('.tvc-side').forEach(side => {
          const seat = +side.dataset.seat, white = seat === 0;
          side.classList.toggle('turn', !over && s.turn === seat);
          side.classList.toggle('won', over && s.winner === seat);
          side.querySelector('.tvf-av').textContent = (n[seat] || '?')[0].toUpperCase();
          side.querySelector('.tvf-av').className = `tvf-av ${white ? 'w' : 'b'}`;
          side.querySelector('b').textContent = n[seat];
          const taken = (s.captured || '').split('').filter(c => (c === c.toLowerCase()) === white)
            .sort((a, x) => 'qrbnp'.indexOf(a.toLowerCase()) - 'qrbnp'.indexOf(x.toLowerCase()));
          const adv = white ? diff : -diff;
          side.querySelector('.tvc-cap').innerHTML = `<span class="ch set-${L.pieces} colors-${L.colors}">${taken.map(c => `<i>${CV().pieceHtml(c, L.pieces)}</i>`).join('')}</span>${adv > 0 ? `<em>+${adv}</em>` : ''}`;
          side.querySelector('.tvc-clock').hidden = !s.clock;
          if (s.clock) side.querySelector('.tvc-clock').textContent = fmtClock(C().clockLeft(s, seat, ctx.now()));
          let note = white ? 'White' : 'Black';
          if (over) note = s.winner === seat ? 'Wins!' : s.winner === 'draw' ? 'Draw' : '';
          else if (s.turn === seat) note = s.check ? 'In check!' : 'To move';
          if (!over && s.offer === seat) note = 'Offers a draw';
          side.querySelector('small').textContent = note;
          side.querySelector('.tvc-wins').textContent = room && (room.played > 1 || wins(seat)) ? `${wins(seat)} win${wins(seat) === 1 ? '' : 's'}` : '';
        });
        const h = s.history || [], pairs = [];
        for (let k = Math.max(0, h.length - 8 - (h.length % 2)); k < h.length; k += 2) pairs.push(`<span><b>${k / 2 + 1}.</b> ${esc(h[k])}${h[k + 1] ? ' ' + esc(h[k + 1]) : ''}</span>`);
        q('.tvc-moves').innerHTML = pairs.join('') || '<span>White to move</span>';
        ctx.info(`Game ${(room && room.played) || 1}${s.clock ? '' : ' · no clock'}`);
        const moves = (s.moves || []).length;
        if (seenMoves >= 0 && moves > seenMoves) snd(over ? 'end' : s.check ? 'check' : (s.captured || '').length > (prevCaptured || 0) ? 'capture' : 'move');
        prevCaptured = (s.captured || '').length;
        seenMoves = moves;
        if (over && overKey !== `${room && room.played}:${moves}:${s.result}`) {
          overKey = `${room && room.played}:${moves}:${s.result}`;
          clearTimeout(overT);
          overT = setTimeout(showOver, 1200);
        } else if (!over) { overBox.hidden = true; overKey = ''; clearTimeout(overT); }
      }
      function showOver() {
        if (!s || !C().over(s)) return;
        const n = names(), w = s.winner;
        const title = w === 'draw' ? 'It’s a draw' : `${n[w]} wins!`;
        overBox.innerHTML = `
          <p class="tv-k">Game ${(room && room.played) || 1}</p>
          <h1>${w !== 'draw' ? `<i class="tvf-av ${w === 0 ? 'w' : 'b'}">${esc((n[w] || '?')[0].toUpperCase())}</i>` : ''}${esc(title)}</h1>
          <p class="tvf-longest">${esc(C().summary(s, n))}</p>
          <p class="tv4-tally"><span class="tvc-w">${esc(n[0])} <b>${wins(0)}</b></span><span class="tvc-b"><b>${wins(1)}</b> ${esc(n[1])}</span></p>
          <p class="tvf-longest">${esc(n[1])} plays white next.</p>
          <div class="tvf-over-actions"><button type="button" class="btn primary big" data-a="again">Play again</button><button type="button" class="btn big" data-a="lobby">Change clock</button><button type="button" class="btn big" data-a="exit">Exit TV mode</button></div>`;
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
          const fresh = s && (room && r.played !== room.played);
          room = r;
          if (fresh) { seenMoves = -1; prevCaptured = 0; }
          s = st;
          paint();
        },
        destroy() { clearInterval(tick); clearTimeout(overT); },
      };
    },
  };
})();
