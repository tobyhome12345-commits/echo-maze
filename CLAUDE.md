# Echo Maze - notes for Claude

## Keep the GitHub repo up to date

This repo is the home of the game. **Every time the game is changed, commit and push the change to `origin/main`** (owner requested this explicitly). Do it at the end of each round of changes — don't wait to be asked. Use clear commit messages that say what changed in the game.

## Constraints

- Plain HTML/CSS/JS, **no build step and no dependencies**. Scripts are classic `<script>` tags (not ES modules) so `index.html` also works from `file://`.
- **No audio files.** All sound is synthesised in `js/audio.js` with the Web Audio API. The `AudioContext` must only be created from a user click (the Begin button) — keep it that way.
- Difficulty lives in `levelConfig()` in `js/level.js`.

## Testing

Serve the folder with any static server and open `/?debug`; that exposes `window.__echo` (`info`, `tp`, `go`, `step`, `audio`). `step(seconds)` runs the simulation without needing animation frames, which is handy in headless/embedded browsers. Synthetic key events need `code` set (e.g. `new KeyboardEvent('keydown', {code: 'Space'})`).
