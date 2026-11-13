/* Live races: phone-to-phone connection through PeerJS.
   The public PeerJS server only introduces the two phones; game data then
   flows directly between them. */
(() => {
  'use strict';
  const LIB = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const PREFIX = 'blueline-sudoku-v1-';
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  let peer = null, conn = null, listener = () => {}, libPromise = null;

  function loadLib() {
    if (window.Peer) return Promise.resolve();
    if (libPromise) return libPromise;
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LIB;
      s.async = true;
      s.onload = () => (window.Peer ? resolve() : reject(Object.assign(new Error('lib'), { type: 'lib' })));
      s.onerror = () => { libPromise = null; s.remove(); reject(Object.assign(new Error('lib'), { type: 'lib' })); };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  function newCode() {
    const a = new Uint32Array(5);
    crypto.getRandomValues(a);
    return Array.from(a, x => ALPHA[x % ALPHA.length]).join('');
  }

  const emit = ev => { try { listener(ev); } catch (e) { console.error(e); } };

  function wire(c) {
    conn = c;
    c.on('open', () => { if (conn === c) emit({ type: 'open' }); });
    c.on('data', data => { if (conn === c) emit({ type: 'data', data }); });
    c.on('close', () => { if (conn === c) { conn = null; emit({ type: 'close' }); } });
    c.on('error', error => { if (conn === c) emit({ type: 'error', error }); });
  }

  function openPeer(id) {
    return new Promise((resolve, reject) => {
      const p = id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 });
      peer = p;
      let opened = false;
      p.on('open', () => { opened = true; resolve(p); });
      p.on('error', err => {
        if (!opened) {
          try { p.destroy(); } catch (e) { /* already gone */ }
          if (peer === p) peer = null;
          reject(err);
        } else if (peer === p) emit({ type: 'error', error: err });
      });
      p.on('connection', c => {
        if (conn && conn.open) {
          c.on('open', () => { c.send({ t: 'busy' }); setTimeout(() => c.close(), 400); });
          return;
        }
        wire(c);
      });
      p.on('disconnected', () => { if (peer === p && !p.destroyed) { try { p.reconnect(); } catch (e) { /* retry later */ } } });
    });
  }

  async function host(onEvent) {
    await loadLib();
    close();
    listener = onEvent;
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = newCode();
      try { await openPeer(PREFIX + code); return code; }
      catch (err) { if (err && err.type === 'unavailable-id') continue; throw err; }
    }
    throw Object.assign(new Error('no code'), { type: 'server-error' });
  }

  async function join(code, onEvent) {
    await loadLib();
    close();
    listener = onEvent;
    const p = await openPeer(null);
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (err) => { if (done) return; done = true; clearTimeout(timer); err ? reject(err) : resolve(); };
      const timer = setTimeout(() => finish(Object.assign(new Error('timeout'), { type: 'timeout' })), 15000);
      p.on('error', err => finish(err));
      const c = p.connect(PREFIX + code, { reliable: true });
      wire(c);
      c.on('open', () => finish());
    });
  }

  function send(msg) {
    if (conn && conn.open) { try { conn.send(msg); return true; } catch (e) { return false; } }
    return false;
  }

  function close() {
    const c = conn, p = peer;
    conn = null; peer = null; listener = () => {};
    try { if (c) c.close(); } catch (e) { /* ignore */ }
    try { if (p) p.destroy(); } catch (e) { /* ignore */ }
  }

  window.Race = { host, join, send, close, isOpen: () => !!(conn && conn.open), CODE_ALPHABET: ALPHA };
})();
