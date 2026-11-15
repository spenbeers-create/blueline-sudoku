# Blueline

A personal, ad-free game app for two that installs on your phone and works offline.
Link two phones once, and every game works across Wi-Fi or mobile data: live when you're
both in the app, and take-your-turn when you're not.

## Games

- **Sudoku**: 9×9, 12×12 and 16×16 grids; Classic, Diagonal and Killer; six graded levels from Easy to Insane;
  notes, hints that explain the logic, three strikes, a daily puzzle, stats, puzzle codes and live races.
- **Chess**: full rules; six bot levels (Beginner to Master) with hints and takebacks; live games with a clock or
  take-turns games with your partner; draw offers; board themes and three piece sets.
- **Four in a Row**: drop discs and line up four. Four bot levels (Easy to Expert) with Undo and Hint, three
  board sizes, live or take-turns games with your partner, rooms for anyone with a code, warnings where
  someone can win next, and your own disc colors, board and disc style.
- **Checkers**: 8×8, must-jump and multi-jumps, kings, and an optional flying-kings rule. Four bot levels
  (Easy to Expert) with Undo and Hint, live or take-turns games with your partner, rooms, pass and play,
  and your own piece colors and board.
- **Crazy Eights**: match the suit or number, eights are wild, first to empty their hand wins. 2 to 6 players:
  1 to 5 bots (Easy, Normal, Hard), party rooms, your partner, or pass and play. House rules: twos make the
  next player draw (and stack), queens skip, aces reverse, draw one or draw till you can, hand size. Table
  color, card backs, four-color suits and big corners.
- **Word Duel**: guess the secret word in 4 to 7 letters. A daily word with streaks and a guess chart, practice,
  hard mode and high-contrast colors. With your partner: duels (fewer guesses wins), live races (first to solve
  wins) and words you pick for each other. Make a word and share a link anyone can play.
- **Short Fuse**: type a word containing the letters shown to pass the lit fuse. Each fuse has a secret
  length; whoever holds it when it burns out loses a life. Use every letter except J, Q, X and Z to win
  a life back. Two ways to play: Pass the fuse, or Last Word (everyone types at once and the last one in
  loses a life). Play bots (three skill levels), practice alone, challenge your partner, or open a
  party room for up to 8 phones.
- **TV mode** (every game): open Blueline in a TV's web browser, or on a laptop plugged into the TV, and
  tap TV mode in any game's menu. The screen shows a room code and QR code, everyone joins on their
  phones, and the game plays out on the big screen: Short Fuse letters and lives, the Four in a Row board,
  the Crazy Eights table, the chess and checkers boards, every Word Duel board (colors only), and every
  Sudoku racer's progress.
- **Rooms**: every game can also be played with anyone who has the room code, no linking needed.
  Word Duel and Sudoku rooms are races for up to 8.
- **Hurry up**: in Chess, Checkers, Four in a Row and Crazy Eights against your partner or in a room, tap
  Hurry up while it's someone else's turn (and they're in the game). They get 30 seconds; then a sensible
  move is made for them and the game moves on. The countdown shows on everyone's phone and on the TV.

Board and card games also play on one phone (pass and play). Word Duel has solo practice.

## Online play (Firebase)

Online games use a free Firebase project (`js/firebase-config.js`). Each phone signs in anonymously.
The Realtime Database rules in `firebase-rules.json` let each phone read only its own data, and only
the two linked players can read or write their shared games. Party rooms and TV mode live under
`rooms/`, which anyone signed in with the room code can join. Paste those rules into
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
node tools/test-games.js         # Chess (perft), Four in a Row, Crazy Eights
node tools/test-chess-ai.js      # the chess bot: perft, legal moves, mates, strength
node tools/test-words.js         # Word Duel
node tools/test-fuse.js          # Short Fuse
node tools/test-four.js          # Four in a Row sizes and bot levels
node tools/test-eights.js        # Crazy Eights house rules, 2-6 players, bots
node tools/test-checkers.js      # Checkers rules and bot levels
```

Word lists come from SCOWL via the `wordlist-english` package; the scripts in `tools/`
rebuild them (`tools/gen-words.js` for Word Duel, `tools/gen-fuse.js` for Short Fuse).
