/* Builds puzzles off the main thread so the screen never freezes. */
importScripts('engine.js');

self.onmessage = e => {
  const { id, opts } = e.data;
  try {
    const puzzle = self.SudokuEngine.generate(opts);
    self.postMessage({ id, ok: true, puzzle });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
