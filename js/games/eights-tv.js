/* Crazy Eights on the big screen: the felt with the deck, the discard pile, the
   suit to follow, any draw penalty and the direction of play; every player across
   the top with their card count and wins; and what just happened, in words.
   Hands stay private on the phones. */
(() => {
  'use strict';
  const BL = window.BL, esc = BL.esc;
  const TVG = window.BLTVGames || (window.BLTVGames = {});
  const E = () => window.BLGames.eights, EV = () => window.BLViews.eights;
  const T = '︎';
  const parse = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return null; } };
  const onOff = [['1', 'On'], ['0', 'Off']];

  TVG.eights = {
    title: 'Crazy Eights',
    minPlayers: 2,
    maxPlayers: 6,
    defaults: () => ({ rules: window.BLMenus.eights.prefs().rules }),
    settingsRows(st) {
      const rl = Object.assign({}, E().DEFAULT_RULES, st.rules || {});
      return [
        { key: 'twos', label: 'Twos', value: rl.twos ? '1' : '0', options: onOff },
        { key: 'skip', label: 'Queens skip', value: rl.skip ? '1' : '0', options: onOff },
        { key: 'reverse', label: 'Aces reverse', value: rl.reverse ? '1' : '0', options: onOff },
        { key: 'drawOne', label: 'Drawing', value: rl.drawOne ? '1' : '0', options: [['0', 'Until you can'], ['1', 'One card']] },
        { key: 'hand', label: 'Hand', value: String(rl.hand || 0), options: [['0', 'Usual'], ['5', '5 cards'], ['7', '7 cards']] },
      ];
    },
    setSetting(st, key, v) {
      const rl = Object.assign({}, E().DEFAULT_RULES, st.rules || {});
      rl[key] = key === 'hand' ? +v : v === '1';
      return Object.assign({}, st, { rules: rl });
    },
    lobbyNote: () => 'Everyone holds their cards on their phone. Match the suit or the number, eights are wild, and the first to empty their hand wins. Up to 6 players.',
    start: code => window.BLRooms.start(code),
    unlock: () => EV().sound('unlock'),

    mount(el, ctx) {
      el.innerHTML = `
        <div class="tv8">
          <div class="tv8-seats"></div>
          <div class="tv8-table">
            <div class="tv8-stock"><span class="card back"></span><span class="card back"></span><small></small></div>
            <div class="tv8-pile"></div>
            <div class="tv8-info"><span class="tv8-suit"></span><span class="tv8-pen" hidden></span><span class="tv8-dir" hidden></span></div>
          </div>
          <p class="tv8-say"></p>
          <div class="tvf-over" hidden></div>
        </div>`;
      const q = s => el.querySelector(s), overBox = q('.tvf-over');
      let s = null, room = null, seenEv = -1, overKey = '', overT = 0;
      const snd = k => { if (ctx.soundOn()) EV().sound(k); };
      const nameOf = i => (s.players && s.players[i] ? s.players[i].name : `Player ${i + 1}`);
      const uidOf = i => (room && room.seats ? room.seats[i] : null);
      const wins = i => (room && room.score && uidOf(i) ? room.score[uidOf(i)] || 0 : 0);
      // Colors follow the person (by join order), not the seat, so they stay put between games.
      const colorOf = i => {
        const joined = room && room.players ? Object.entries(room.players).sort((a, b) => (a[1].at || 0) - (b[1].at || 0)).map(([u]) => u) : [];
        const k = joined.indexOf(uidOf(i));
        return EV().COLORS[(k >= 0 ? k : i) % EV().COLORS.length];
      };

      function paint() {
        if (!s) return;
        const L = EV().look(), over = E().over(s), n = s.hands.length;
        EV().applyLook(q('.tv8'), L);
        q('.tv8-seats').innerHTML = s.hands.map((h, i) => {
          const cnt = h.length;
          return `<div class="tv8-seat${s.turn === i && !over ? ' turn' : ''}${s.winner === i ? ' won' : ''}" style="--c:${colorOf(i)}">
            <i class="tvf-av">${esc(nameOf(i)[0].toUpperCase())}</i>
            <b>${esc(nameOf(i))}</b>
            <span class="tv8-count">${cnt}</span>
            <span class="tv8-fan">${Array.from({ length: Math.min(cnt, 8) }, () => '<span class="card back xs"></span>').join('')}</span>
            <small>${over ? (s.winner === i ? 'Out first!' : '') : cnt === 1 ? '<em>Last card!</em>' : s.turn === i ? 'Their turn' : ''}</small>
            ${room && room.played > 1 || wins(i) ? `<span class="tv8-wins">${wins(i)} win${wins(i) === 1 ? '' : 's'}</span>` : ''}
          </div>`;
        }).join('');
        q('.tv8-seats').dataset.n = n;
        q('.tv8-stock small').textContent = s.stock.length ? `${s.stock.length} left` : 'Empty';
        const recent = s.discard.slice(-4), ev = s.ev != null ? s.ev : s.log.length, last = s.log[s.log.length - 1];
        const fresh = seenEv >= 0 && ev !== seenEv;
        q('.tv8-pile').innerHTML = recent.map((c, k) => `<span class="e8-pc${k === recent.length - 1 && fresh && last && last.play ? ' land' : ''}" style="--r:${EV().tilt(c)}deg">${EV().cardHtml(c, 'big', L)}</span>`).join('');
        const top = E().top(s);
        const suit = q('.tv8-suit');
        suit.className = `tv8-suit ${EV().suitClass(s.suit, L.four)}${top[0] === '8' ? ' wild' : ''}`;
        suit.innerHTML = `${EV().SUIT[s.suit]}${T}<small>${top[0] === '8' ? `${esc(E().SUIT_NAMES[s.suit])}, named` : esc(E().SUIT_NAMES[s.suit])}</small>`;
        const pen = q('.tv8-pen');
        pen.hidden = !(s.pending > 0);
        pen.textContent = `+${s.pending} for ${nameOf(s.turn)}`;
        const dir = q('.tv8-dir');
        dir.hidden = n < 3;
        dir.innerHTML = `${(s.dir || 1) > 0 ? '↻' : '↺'}<small>${(s.dir || 1) > 0 ? 'clockwise' : 'reversed'}</small>`;
        const said = EV().describe(last, nameOf, -1);
        q('.tv8-say').innerHTML = over ? '' : `${said ? `${esc(said)} ` : ''}<b>${esc(nameOf(s.turn))}’s turn.</b>`;
        ctx.info(`Game ${(room && room.played) || 1} · ${n} players`);
        if (fresh && last) snd(last.play ? (last.fx ? 'special' : 'play') : last.draw ? 'draw' : 'play');
        seenEv = ev;

        if (over && overKey !== (room && room.played) + ':' + ev) {
          overKey = (room && room.played) + ':' + ev;
          snd('win');
          clearTimeout(overT);
          overT = setTimeout(showOver, 1300);
        } else if (!over) { overBox.hidden = true; overKey = ''; clearTimeout(overT); }
      }

      function showOver() {
        if (!s || !E().over(s)) return;
        const order = s.hands.map((h, i) => i).sort((a, b) => s.hands[a].length - s.hands[b].length);
        overBox.innerHTML = `
          <p class="tv-k">Game ${(room && room.played) || 1}</p>
          <h1><i class="tvf-av" style="--c:${colorOf(s.winner)}">${esc(nameOf(s.winner)[0].toUpperCase())}</i>${esc(nameOf(s.winner))} wins!</h1>
          <ol class="tvf-table">${order.map((i, k) => `<li style="--c:${colorOf(i)}"><span class="tvf-place">${k === 0 ? '1st' : ''}</span><i class="tvf-av">${esc(nameOf(i)[0].toUpperCase())}</i><b>${esc(nameOf(i))}</b><span>${s.hands[i].length ? `${s.hands[i].length} card${s.hands[i].length === 1 ? '' : 's'} left` : 'Out!'}</span><span class="tvf-best">${wins(i)} win${wins(i) === 1 ? '' : 's'}</span></li>`).join('')}</ol>
          <div class="tvf-over-actions"><button type="button" class="btn primary big" data-a="again">Deal again</button><button type="button" class="btn big" data-a="lobby">Change rules</button><button type="button" class="btn big" data-a="exit">Exit TV mode</button></div>`;
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
          if (s && st.seed !== s.seed) seenEv = -1;
          room = r; s = st;
          paint();
        },
        destroy() { clearTimeout(overT); },
      };
    },
  };
})();
