/* Runs the Checkers bot off the main thread so the board stays smooth while it thinks. */
importScripts('games/checkers.js', 'games/checkers-ai.js');

self.onmessage = e => {
  const { id, state, level, time } = e.data;
  try {
    const move = self.CheckersAI.think(state, level, time ? { time } : {});
    self.postMessage({ id, ok: true, move });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
