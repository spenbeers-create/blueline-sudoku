/* Online play through Firebase Realtime Database.
   Layout:
     users/{uid}/pairs/{pid}            which partners this phone is linked with
     invites/{code}                     short-lived link codes
     pairs/{pid}/members/{uid}          the two linked players
     pairs/{pid}/names/{uid}            display names
     pairs/{pid}/here/{uid}             who has the app open, and which game
     pairs/{pid}/games/{gid}            every shared game (state saved as JSON text)
   Each phone signs in anonymously; Firebase keeps that sign-in on the device. */
(() => {
  'use strict';
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let db = null, uid = null, readyP = null, offset = 0;
  const listeners = [];

  const configured = () => !!(window.BLUELINE_FIREBASE && window.BLUELINE_FIREBASE.apiKey);

  function load(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src; s.async = false; s.dataset.src = src;
      s.onload = resolve;
      s.onerror = () => { s.remove(); reject(Object.assign(new Error('sdk'), { code: 'offline' })); };
      document.head.appendChild(s);
    });
  }

  function ready() {
    if (readyP) return readyP;
    readyP = (async () => {
      if (!configured()) throw Object.assign(new Error('not set up'), { code: 'no-config' });
      await load(SDK + 'firebase-app-compat.js');
      await load(SDK + 'firebase-auth-compat.js');
      await load(SDK + 'firebase-database-compat.js');
      const fb = window.firebase;
      if (!fb.apps.length) fb.initializeApp(window.BLUELINE_FIREBASE);
      db = fb.database();
      const user = await new Promise((resolve, reject) => {
        const off = fb.auth().onAuthStateChanged(u => {
          if (u) { off(); resolve(u); }
          else fb.auth().signInAnonymously().catch(err => { off(); reject(err); });
        });
      });
      uid = user.uid;
      db.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
      return uid;
    })();
    readyP.catch(() => { readyP = null; });
    return readyP;
  }

  const ref = path => db.ref(path);
  const now = () => Date.now() + offset;
  const TS = () => window.firebase.database.ServerValue.TIMESTAMP;
  function code(n = 6) {
    const a = new Uint32Array(n);
    crypto.getRandomValues(a);
    return Array.from(a, x => CODE_ALPHA[x % CODE_ALPHA.length]).join('');
  }
  function watch(path, event, fn) {
    const r = ref(path);
    const cb = s => fn(s.val(), s.key);
    r.on(event, cb);
    const off = () => r.off(event, cb);
    listeners.push(off);
    return off;
  }

  // ---------------------------------------------------------------- pairing
  async function partners() {
    await ready();
    const pids = Object.keys((await ref(`users/${uid}/pairs`).get()).val() || {});
    const out = [];
    for (const pid of pids) {
      try {
        const p = (await ref(`pairs/${pid}`).child('members').get()).val();
        if (!p) continue;
        const names = (await ref(`pairs/${pid}/names`).get()).val() || {};
        const other = Object.keys(p).find(k => k !== uid);
        if (other) out.push({ pid, uid: other, name: names[other] || 'Partner', myName: names[uid] || '' });
      } catch (e) { /* no access any more */ }
    }
    return out;
  }

  // Shows a code, resolves with the new partner once they enter it.
  async function invite(myName, onCode) {
    await ready();
    let c = code();
    for (let i = 0; i < 4; i++) {
      const exists = (await ref(`invites/${c}`).get()).exists();
      if (!exists) break;
      c = code();
    }
    await ref(`invites/${c}`).set({ from: uid, name: myName, at: TS() });
    ref(`invites/${c}`).onDisconnect().remove();
    onCode(c);
    return new Promise((resolve, reject) => {
      const r = ref(`invites/${c}`);
      const cb = async s => {
        const v = s.val();
        if (!v) { r.off('value', cb); reject(Object.assign(new Error('gone'), { code: 'cancelled' })); return; }
        if (!v.pair) return;
        r.off('value', cb);
        await ref(`users/${uid}/pairs/${v.pair}`).set(true);
        await r.onDisconnect().cancel();
        await r.remove();
        resolve({ pid: v.pair, uid: v.to, name: v.toName || 'Partner' });
      };
      r.on('value', cb, err => reject(err));
      invite.cancel = async () => { r.off('value', cb); try { await r.onDisconnect().cancel(); await r.remove(); } catch (e) { /* gone */ } reject(Object.assign(new Error('cancelled'), { code: 'cancelled' })); };
    });
  }

  async function accept(c, myName) {
    await ready();
    const snap = await ref(`invites/${c}`).get();
    const v = snap.val();
    if (!v || !v.from) throw Object.assign(new Error('no invite'), { code: 'no-invite' });
    if (v.from === uid) throw Object.assign(new Error('self'), { code: 'self' });
    const pid = ref('pairs').push().key;
    await ref(`pairs/${pid}`).set({
      members: { [v.from]: true, [uid]: true },
      names: { [v.from]: v.name || 'Partner', [uid]: myName },
      created: TS(),
    });
    await ref(`users/${uid}/pairs/${pid}`).set(true);
    await ref(`invites/${c}`).update({ to: uid, toName: myName, pair: pid });
    return { pid, uid: v.from, name: v.name || 'Partner' };
  }

  async function setName(pid, name) { await ready(); await ref(`pairs/${pid}/names/${uid}`).set(name); }

  async function unlink(pid) { await ready(); await ref(`users/${uid}/pairs/${pid}`).remove(); }

  // --------------------------------------------------------------- presence
  let hereRef = null;
  async function here(pid, where) {
    await ready();
    if (hereRef && hereRef.key !== uid) hereRef = null;
    const r = ref(`pairs/${pid}/here/${uid}`);
    if (!hereRef) { hereRef = r; r.onDisconnect().remove(); }
    await r.set({ at: TS(), game: where || '' });
  }
  function watchHere(pid, fn) { return watch(`pairs/${pid}/here`, 'value', v => fn(v || {})); }

  // ------------------------------------------------------------------ games
  async function createGame(pid, rec) {
    await ready();
    const r = ref(`pairs/${pid}/games`).push();
    await r.set(Object.assign({ created: TS(), updated: TS(), by: uid, status: 'active' }, rec));
    return r.key;
  }
  function watchGames(pid, fn) { return watch(`pairs/${pid}/games`, 'value', v => fn(v || {})); }
  function watchGame(pid, gid, fn) { return watch(`pairs/${pid}/games/${gid}`, 'value', v => fn(v)); }

  // Runs fn on the latest copy of the game; fn returns the new record, or undefined to cancel.
  async function update(pid, gid, fn) {
    await ready();
    const res = await ref(`pairs/${pid}/games/${gid}`).transaction(cur => {
      if (cur === null) return cur;
      const next = fn(JSON.parse(JSON.stringify(cur)));
      if (next === undefined) return undefined;
      next.updated = TS();
      return next;
    });
    return res.committed ? res.snapshot.val() : null;
  }
  // quiet: save without counting as a move (no alerts on the other phone).
  async function setProgress(pid, gid, seat, prog, quiet) {
    await ready();
    const upd = { [`prog/${seat}`]: JSON.stringify(prog) };
    if (!quiet) upd.updated = TS();
    await ref(`pairs/${pid}/games/${gid}`).update(upd);
  }
  async function patch(pid, gid, fields) {
    await ready();
    await ref(`pairs/${pid}/games/${gid}`).update(Object.assign({ updated: TS() }, fields));
  }
  async function removeGame(pid, gid) { await ready(); await ref(`pairs/${pid}/games/${gid}`).remove(); }
  // Live typing for word games. Not a move, so it leaves 'updated' alone.
  async function draft(pid, gid, value) { await ready(); await ref(`pairs/${pid}/games/${gid}/draft`).set(value); }
  // A "hurry up" deadline for whoever's turn it is. Not a move, so 'updated' stays put.
  async function hurry(pid, gid, value) { await ready(); await ref(`pairs/${pid}/games/${gid}/hurry`).set(value); }


  // ----------------------------------------------------------- party rooms
  // rooms/{code}: anyone signed in who knows the code can join (2 to 8 players).
  // asScreen: a TV or laptop that shows the game but doesn't play in it.
  async function createRoom(name, settings, asScreen, game, max) {
    await ready();
    let c = code(5);
    for (let i = 0; i < 5 && (await ref(`rooms/${c}`).get()).exists(); i++) c = code(5);
    const rec = { host: uid, game: game || 'fuse', max: max || 8, status: 'lobby', created: TS(), updated: TS(), settings };
    if (asScreen) rec.screen = uid;
    else rec.players = { [uid]: { name, at: TS() } };
    await ref(`rooms/${c}`).set(rec);
    return c;
  }
  async function joinRoom(c, name) {
    await ready();
    const snap = await ref(`rooms/${c}`).get();
    const r = snap.val();
    if (!r) throw Object.assign(new Error('no room'), { code: 'no-room' });
    const mine = r.players && r.players[uid];
    if (!mine && r.status !== 'lobby') throw Object.assign(new Error('started'), { code: 'started' });
    if (!mine && Object.keys(r.players || {}).length >= (r.max || 8)) throw Object.assign(new Error('full'), { code: 'full' });
    await ref(`rooms/${c}/players/${uid}`).update({ name, at: TS() });
    return r;
  }
  function watchRoom(c, fn) { return watch(`rooms/${c}`, 'value', v => fn(v)); }
  async function updateRoom(c, fn) {
    await ready();
    const res = await ref(`rooms/${c}`).transaction(cur => {
      if (cur === null) return cur;
      const next = fn(JSON.parse(JSON.stringify(cur)));
      if (next === undefined) return undefined;
      next.updated = TS();
      return next;
    });
    return res.committed ? res.snapshot.val() : null;
  }
  // Moves run on the game state alone, so typing and presence writes never slow them down.
  async function roomMove(c, fn) {
    await ready();
    const res = await ref(`rooms/${c}/state`).transaction(cur => {
      if (cur === null) return cur;
      const next = fn(cur);
      return next === undefined ? undefined : next;
    });
    return res.committed ? res.snapshot.val() : null;
  }
  async function getRoom(c) { await ready(); return (await ref(`rooms/${c}`).get()).val(); }
  // Each player's progress in a race lives under its own key, so players never collide.
  async function roomProg(c, seat, value) { await ready(); await ref(`rooms/${c}/prog/${seat}`).set(value); }
  async function patchRoom(c, fields) { await ready(); await ref(`rooms/${c}`).update(Object.assign({ updated: TS() }, fields)); }
  async function roomDraft(c, value) { await ready(); await ref(`rooms/${c}/draft`).set(value); }
  async function roomHurry(c, value) { await ready(); await ref(`rooms/${c}/hurry`).set(value); }
  async function roomHere(c, on) {
    await ready();
    const r = ref(`rooms/${c}/here/${uid}`);
    if (on === false) { await r.remove(); return; }
    r.onDisconnect().remove();
    await r.set(TS());
  }
  async function leaveRoom(c, isHost, lobby) {
    await ready();
    if (isHost && lobby) { await ref(`rooms/${c}`).remove(); return; }
    await ref(`rooms/${c}/here/${uid}`).remove();
    if (!lobby) return;
    await ref(`rooms/${c}/players/${uid}`).remove();
    // Last one out of an empty lobby tidies the room away.
    const r = (await ref(`rooms/${c}`).get()).val();
    if (r && !r.screen && !Object.keys(r.players || {}).length) await ref(`rooms/${c}`).remove();
  }

  window.Online = {
    configured, ready, partners, invite, accept, setName, unlink,
    here, watchHere, createGame, watchGames, watchGame, update, setProgress, patch, removeGame, draft, hurry, roomHurry,
    createRoom, joinRoom, watchRoom, getRoom, updateRoom, roomMove, roomProg, patchRoom, roomDraft, roomHere, leaveRoom,
    me: () => uid, now, code,
  };
})();
