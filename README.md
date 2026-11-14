# Blueline

A personal, ad-free game app for two that installs on your phone and works offline.
Link two phones once, and every game works across Wi-Fi or mobile data: live when you're
both in the app, and take-your-turn when you're not.

## Games

- **Sudoku**: 9×9, 12×12 and 16×16 grids; Classic, Diagonal and Killer; six graded levels from Easy to Insane;
  notes, hints that explain the logic, three strikes, a daily puzzle, stats, puzzle codes and live races.
- **Chess**: full rules, including castling, en passant, promotion, check, checkmate, stalemate and draws.
- **Four in a Row**: drop discs and line up four.
- **Crazy Eights**: match the suit or number, eights are wild, first to empty their hand wins.
- **Word Duel**: you both get the same secret five-letter word. Fewer guesses wins.
- **Short Fuse**: type a word containing the letters shown to pass the lit fuse. Each fuse has a secret
  length; whoever holds it when it burns out loses a life. Your partner sees your letters as you type.

Board and card games also play on one phone (pass and play). Word Duel has solo practice.

## Online play (Firebase)

Online games use a free Firebase project (`js/firebase-config.js`). Each phone signs in anonymously.
The Realtime Database rules in `firebase-rules.json` let each phone read only its own data, and only
the two linked players can read or write their shared games. Paste those rules into
**Realtime Database → Rules** if the project is ever recreated.

## Put it online (GitHub Pages)

The app is plain HTML, CSS and JavaScript with no build step. GitHub Pages serves the `main` branch.
When you change the app, bump `VERSION` in `sw.js` so installed phones pick up the update.

## Install on a phone

- **Android (Chrome)**: open the link and tap **Install app**.
- **iPhone (Safari)**: open the link, tap **Share**, then **Add to Home Screen**.

## Develop

```
python -m http.server 5180
node tools/test-engine.js        # Sudoku: every size, style and level
node tools/test-games.js         # Chess (perft), Four in a Row, Crazy Eights, Word Duel
node tools/test-fuse.js          # Short Fuse
```

Word lists come from SCOWL via the `wordlist-english` package; `tools/gen.js` and `tools/gen-fuse.js`
rebuild them.
