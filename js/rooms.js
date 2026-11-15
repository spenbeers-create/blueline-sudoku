/* Rooms: play anyone with a 5-letter code, on phones or with a TV. Shared by every
   game that supports rooms. A game registers how to describe its settings and how
   to deal a new game:
     BLRooms.register(type, { title, describe(settings), minPlayers(room), maxPlayers,
                              prepare?(room) -> Promise (slow work before dealing, like building a puzzle),
                              start(room, entries, prepared) -> sets room.seats and room.state })
   rooms/{code}: { game, host, screen?, max, status: lobby|playing|over, settings,
                   players/{uid}: {name, at}, here/{uid}, seats[], state, draft, prog/{seat}, score/{uid}, played } */
(() => {
  'use strict';
  const BL = window.BL, O = window.Online, esc = BL.esc;
  const $ = (s, el = document) => el.querySelector(s);
  const on = (root, sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
  const appUrl = () => location.origin + location.pathname;
  const myName = () => (BL.settings.name || '').trim() || 'Player';
  const DEFS = {};

  function err(e) {
    if (e && e.code === 'no-room') return 'No room with that code. Check it and try again.';
    if (e && e.code === 'started') return 'That game already started. Ask them to send a new room after this one.';
    if (e && e.code === 'full') return 'That room is full.';
    if (e && e.code === 'no-config') return 'Online play isn’t set up yet.';
    if (e && /permission/i.test(e.message || '')) return 'Rooms need one more database rule. Add the “rooms” rule in Firebase, then try again.';
    return 'Couldn’t reach the server. Check your connection.';
  }
  const def = type => DEFS[type] || DEFS.fuse;

  async function create(type, settings, api, opts = {}) {
    try {
      await O.ready();
      BL.openSheet('<h2 id="sheet-title">Making a room…</h2><div class="status-line"><span class="spinner"></span>One moment</div>', { locked: true });
      const code = await O.createRoom(myName(), settings, false, type, def(type).maxPlayers || 8);
      const partner = opts.invite && api.partner && api.partner();
      if (partner) {
        await O.roomInvite(partner.pid, { game: type, code, by: O.me(), name: myName(), at: Date.now() });
        BL.toast(`Sent ${partner.name} an invite.`);
      }
      lobby(code, api);
    } catch (e) {
      BL.openSheet(`<h2 id="sheet-title">Couldn’t make a room</h2><p class="status-line err">${esc(err(e))}</p><div class="actions"><button type="button" class="btn" data-a="x">Close</button></div>`, { onMount: b => on(b, '[data-a=x]', () => BL.closeSheet()) });
    }
  }

  // Join straight away (from an invite).
  async function join(code, api) {
    try {
      const r = await O.joinRoom(code, myName());
      if (api.openMenu && r && r.game && api.menuId && api.menuId() !== r.game) api.openMenu(r.game);
      lobby(code, api);
    } catch (e) { joinPrompt(code, err(e), api); }
  }
  function joinPrompt(prefill, problem, api) {
    BL.openSheet(`
      <h2 id="sheet-title">Join a room</h2>
      <p class="lede">Type the 5-letter room code from the TV or your friend’s phone.</p>
      <input class="input code" id="rm-code" maxlength="5" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="K7P2Q" value="${esc(prefill || '')}" aria-label="Room code">
      ${problem ? `<p class="status-line err">${esc(problem)}</p>` : ''}
      <label class="field"><span>Your name</span><input class="input" id="rm-name" maxlength="20" value="${esc(BL.settings.name || '')}" placeholder="Your name"></label>
      <div class="actions"><button type="button" class="btn primary big" data-a="go">Join</button><button type="button" class="btn ghost" data-a="x">Cancel</button></div>`, {
      onMount: b => {
        const go = async () => {
          const c = $('#rm-code', b).value.toUpperCase().replace(/[^A-Z0-9]/g, '');
          const n = $('#rm-name', b).value.trim().slice(0, 20);
          if (n) { BL.settings.name = n; BL.saveSettings(); }
          if (c.length !== 5) { joinPrompt(c, 'Room codes have 5 letters and numbers.', api); return; }
          try {
            const r = await O.joinRoom(c, myName());
            if (api.openMenu && r && r.game && api.menuId && api.menuId() !== r.game) api.openMenu(r.game);
            lobby(c, api);
          } catch (e) { joinPrompt(c, err(e), api); }
        };
        on(b, '[data-a=go]', go);
        $('#rm-code', b).addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        on(b, '[data-a=x]', () => BL.closeSheet());
      },
    });
  }

  // The lobby listener can fire before watchRoom returns, so each lobby gets a token
  // and a listener that arrives after its lobby ended is switched straight off.
  let stopLobby = null, lobbyToken = null;
  function endLobby() {
    lobbyToken = null;
    if (stopLobby) { stopLobby(); stopLobby = null; }
  }
  function leave(code, lobbyPhase) {
    endLobby();
    O.ready().then(() => O.leaveRoom(code, false, lobbyPhase)).catch(() => {});
  }
  function lobby(code, api) {
    endLobby();
    const token = lobbyToken = {};
    O.roomHere(code).catch(() => {});
    const paint = r => {
      if (lobbyToken !== token) return;
      if (!r) { BL.closeSheet(); BL.toast('The room closed.'); endLobby(); return; }
      const me = O.me(), d = def(r.game);
      if ((r.status === 'playing' || r.status === 'over') && Array.isArray(r.seats) && r.seats.includes(me) && r.state) {
        endLobby();
        BL.closeSheet();
        api.openRoom(code, r.seats.indexOf(me), r.game || 'fuse');
        return;
      }
      const players = Object.entries(r.players || {}).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
      const st = r.settings || {}, need = d.minPlayers ? d.minPlayers(r) : 2, max = r.max || d.maxPlayers || 8;
      const ready = players.length >= need;
      BL.openSheet(`
        <h2 id="sheet-title">Room ${esc(code)}</h2>
        <p class="lede">${esc(d.title)} · ${esc(d.describe(st))}${r.screen ? ' · on the TV' : ''}</p>
        <div class="room-players">${players.map(([uid, p]) => `<span class="room-p${uid === me ? ' me' : ''}"><i>${esc((p.name || '?')[0].toUpperCase())}</i>${esc(p.name || 'Player')}${uid === me ? ' (you)' : ''}</span>`).join('') || '<span class="muted">Nobody yet</span>'}</div>
        <div class="actions row"><button type="button" class="btn" data-a="share">Invite</button><button type="button" class="btn" data-a="copy">Copy code</button></div>
        <div class="actions">
          <button type="button" class="btn primary big" data-a="start" ${ready ? '' : 'disabled'}>${ready ? `Start with ${players.length} player${players.length === 1 ? '' : 's'}` : 'Waiting for players…'}</button>
          <button type="button" class="btn ghost" data-a="leave">Leave room</button>
        </div>
        <p class="small muted">${r.screen ? 'Watch the TV. Anyone can start, from here or on the TV.' : max === 2 ? 'Send the code to one friend. Either of you can start.' : `Up to ${max} players. Anyone in the room can start.`}</p>`, {
        locked: true,
        onMount: b => {
          on(b, '[data-a=share]', () => BL.shareText(`Join my ${d.title} room in Blueline: ${code}\n${appUrl()}#room-${code}`));
          on(b, '[data-a=copy]', () => BL.copyText(code));
          on(b, '[data-a=start]', () => start(code));
          on(b, '[data-a=leave]', () => { leave(code, true); BL.closeSheet(); });
        },
      });
    };
    O.ready().then(() => {
      const off = O.watchRoom(code, paint);
      if (lobbyToken === token) stopLobby = off; else off();
    }).catch(e => BL.toast(err(e)));
  }

  // Deal a new game. Anyone in the room (or the TV) can start, and a finished game
  // can be dealt again with the same players.
  let starting = false;
  async function start(code, again) {
    if (starting) return;
    starting = true;
    try {
      const now = await O.getRoom(code);
      if (!now || !(now.status === 'lobby' || (again && now.status === 'over'))) return;
      const d = def(now.game);
      let prepared;
      if (d.prepare) {
        BL.toast('Getting the game ready…');
        try { prepared = await d.prepare(now); } catch (e) { BL.toast('That didn’t load. Check your connection and try again.'); return; }
      }
      await O.updateRoom(code, r => {
        if (!(r.status === 'lobby' || (again && r.status === 'over'))) return undefined;
        const entries = Object.entries(r.players || {}).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
        if (entries.length < (d.minPlayers ? d.minPlayers(r) : 2)) return undefined;
        r.prog = null;
        r.winner = null;
        d.start(r, entries, prepared);
        r.status = 'playing';
        r.draft = null;
        r.played = (r.played || 0) + 1;
        return r;
      });
    } catch (e) { BL.toast(err(e)); }
    finally { starting = false; }
  }
  // Mark the game finished once, and add a point to the winner's tally.
  function finish(code, winner) {
    return O.updateRoom(code, r => {
      if (r.status !== 'playing') return undefined;
      r.status = 'over';
      r.winner = winner == null ? null : winner;
      if (typeof winner === 'number' && r.seats && r.seats[winner]) {
        r.score = r.score || {};
        r.score[r.seats[winner]] = (r.score[r.seats[winner]] || 0) + 1;
      }
      return r;
    }).catch(() => null);
  }
  const toLobby = code => O.patchRoom(code, { status: 'lobby', state: null, draft: null, prog: null }).catch(() => BL.toast('Couldn’t reach the room.'));

  window.BLRooms = {
    register(type, d) { DEFS[type] = d; },
    def, create, join, joinPrompt, lobby, start, rematch: code => start(code, true), finish, toLobby, leave, err,
  };
})();
