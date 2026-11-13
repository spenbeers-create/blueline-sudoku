# Blueline Sudoku

A personal, ad-free Sudoku app that installs on your phone and works offline.

- **Blue lines**: tap a number and every row and column it already sits in turns see-through blue. The white cells left are where it can still go.
- **Grids**: 9×9, 12×12 and 16×16 (16×16 uses 1–9 and A–G).
- **Styles**: Classic, Diagonal (both long diagonals count) and Killer (cage sums, 9×9).
- **Six levels**: Easy, Medium, Hard, Expert, Extreme and Insane. Each puzzle is graded by the techniques it needs, and Insane picks the toughest of many attempts.
- **Races**: create a race, send the 5-letter code, and you both get the same puzzle with a 3-second countdown. Live progress bars, three strikes and you're out, rematch button.
- **Puzzle codes**: every puzzle has a code like `C9H-K7P2Q`. Anyone who enters it gets the exact same puzzle, so you can compare times.
- **Daily puzzle** with a streak, **stats** with best and average times, **hints** that explain the logic, notes, auto-notes, undo and a 3-strike rule.

## Put it online (GitHub Pages)

1. Push this folder to a public GitHub repository.
2. In the repository, open **Settings → Pages**, set **Source** to *Deploy from a branch*, pick `main` and `/ (root)`, then **Save**.
3. After about a minute the app is at `https://<username>.github.io/<repository>/`.

When you change the app, bump `VERSION` in `sw.js` so installed phones pick up the update.

## Install on a phone

- **Android (Chrome)**: open the link and tap **Install app** on the home screen, or the browser's **Add to Home screen** prompt.
- **iPhone (Safari)**: open the link, tap **Share**, then **Add to Home Screen**.

## Develop

```
python -m http.server 5180
node tools/test-engine.js        # checks every size, style and level
node tools/make-icons.js         # redraws the icons
```

The service worker only runs over HTTPS, or locally when you add `?sw` to the address.
Live races use the free public PeerJS server to connect the two phones; the moves then go directly between them.
