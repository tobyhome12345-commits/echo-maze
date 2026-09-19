# Echo Maze - notes for Claude

## Keep the GitHub repo up to date

This repo is the home of the game. **Every time the game is changed, commit and push the change to `origin/main`** (owner requested this explicitly). Do it at the end of each round of changes — don't wait to be asked. Use clear commit messages that say what changed in the game.

## Keep a copy of every version in `C:\Claude` (owner's PC)

The owner wants old versions preserved, **never overwritten**. Whenever the game itself changes (doc-only edits don't count), after committing and pushing:

1. Save the committed tree as a **new** folder `C:\Claude\Echo Maze\vN - short description` (e.g. `git archive --format=zip -o x.zip HEAD`, extract it, delete `CLAUDE.md` and `.gitignore` from the copy). Never edit or delete earlier `vN` folders.
2. Re-point the shortcut `C:\Claude\Play Echo Maze.lnk` at the new folder's `index.html`.

Existing versions: `v1 - first release`, `v2 - blind monsters`, `v3 - monsters go to ripple spot`, `v4 - monsters listen 5s` (latest). `C:\Claude\Echo Maze on GitHub.url` links to the repo.

## Monster rules (owner's design - don't loosen)

- Touching a monster (circles overlapping) kills you.
- A monster learns something only when a ripple ray hits it, and then goes to the *exact spot the ripple was sent from*. It never learns where the player is now.
- After arriving it stands still and **listens for `searchTime` (5s)**. Only during that window (state `search`) does it hear the player's footsteps, and only within `footstepRadius` (130px); it then goes to the exact spot of that footstep. Standing still is silent. After the window it goes idle and is deaf again.
- Everything else is ignored: no hearing while idle/hunting/sleeping, no bump hearing, no proximity sense.

## Constraints

- Plain HTML/CSS/JS, **no build step and no dependencies**. Scripts are classic `<script>` tags (not ES modules) so `index.html` also works from `file://`.
- **No audio files.** All sound is synthesised in `js/audio.js` with the Web Audio API. The `AudioContext` must only be created from a user click (the Begin button) — keep it that way.
- Difficulty lives in `levelConfig()` in `js/level.js`.

## Testing

Serve the folder with any static server and open `/?debug`; that exposes `window.__echo` (`info`, `tp`, `go`, `step`, `audio`). `step(seconds)` runs the simulation without needing animation frames, which is handy in headless/embedded browsers. Synthetic key events need `code` set (e.g. `new KeyboardEvent('keydown', {code: 'Space'})`).
