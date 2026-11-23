# It's Just Solitaire

A mobile-first Klondike solitaire web app (plain HTML/CSS/JS, no dependencies).

## Run locally
```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```
Then open http://localhost:8080.

## Files
- `engine.js` — pure game rules and scoring (no DOM). Reusable when porting to native apps.
- `game.js` — rendering, card artwork, drag/tap input, animations, save/restore.
- `styles.css`, `index.html` — layout and UI chrome.

## Features
- Draw 1 / Draw 3, chosen when starting a new game (remembered)
- Tap a card to auto-move it, or drag cards/stacks
- Unlimited undo, standard scoring (+10 to foundation, +5 waste→tableau, +5 reveal,
  −15 foundation→tableau, −100/−20 per stock recycle, −2 every 10s, time bonus on win)
- Timer (starts on first move, pauses when app is hidden), move counter
- Hint button: highlights the most useful move (tap again to cycle through others),
  or tells you when no useful moves are left
- Statistics per mode (Draw 1 / Draw 3): played, won, win rate, current and best
  streak, best score, fastest win, fewest moves. Starting a new game mid-game counts
  as a loss for streaks.
- Auto Finish once every card is face up; win celebration with new personal bests
- Sound effects with an on/off toggle (speaker button in the header, remembered)
- Game is saved automatically and resumes on reload

## Artwork
All card faces, court card emblems, suit shapes, card back and table texture are original
and generated in code (`index.html` suit symbols, `game.js` card SVGs). No third-party
images, fonts or assets are used.

## Sound
All sound effects are synthesised at runtime in `sound.js` using the Web Audio API
(oscillators and filtered white noise). There are no audio files or samples.
