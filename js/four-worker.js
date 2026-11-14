/* Runs the Four in a Row bot off the main thread so the board stays smooth while it thinks. */
importScripts('games/four-ai.js');

self.onmessage = e => {
  const { id, state, level, time } = e.data;
  try {
    const move = self.FourAI.think(state, level, time ? { time } : {});
    self.postMessage({ id, ok: true, move });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
