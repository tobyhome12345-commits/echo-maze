# Echo Maze - notes for Claude

## Keep the GitHub repo up to date

This repo is the home of the game. **Every time the game is changed, commit and push the change to `origin/main`** (owner requested this explicitly). Do it at the end of each round of changes — don't wait to be asked. Use clear commit messages that say what changed in the game.

## Keep a copy of every version in `C:\Claude` (owner's PC)

The owner wants old versions preserved, **never overwritten**. Whenever the game itself changes (doc-only edits don't count), after committing and pushing:

1. Save the committed tree as a **new** folder `C:\Claude\Echo Maze\vN - short description` (e.g. `git archive --format=zip -o x.zip HEAD`, extract it, delete `CLAUDE.md` and `.gitignore` from the copy). Never edit or delete earlier `vN` folders.
2. Re-point the shortcut `C:\Claude\Play Echo Maze.lnk` at the new folder's `index.html`.

Existing versions: `v1 - first release`, `v2 - blind monsters`, `v3 - monsters go to ripple spot`, `v4 - monsters listen 5s`, `v5 - monsters lock on`, `v6 - intro cutscene` (latest). `C:\Claude\Echo Maze on GitHub.url` links to the repo.

## Monster rules (owner's design - don't loosen)

- Touching a monster (circles overlapping) kills you.
- A monster learns something only when a ripple ray hits it, and then goes to the *exact spot the ripple was sent from*. It never learns where the player is now.
- After arriving it stands still and **listens for `searchTime` (5s)**. Only during that window (state `search`) does it hear the player's footsteps, and only within `footstepRadius` (130px). Standing still is silent. If nothing is heard it goes idle and is deaf again.
- If it hears a footstep it **locks on** (state `track`): it knows the player's live position and follows it with no time limit for as long as the player stays within `footstepRadius`. The moment the player is farther away it loses them, goes idle and is deaf; it can only be re-alerted by another ripple hit. (A ripple hit on a tracking monster is ignored.)
- Everything else is ignored: no hearing while idle/hunting/sleeping, no bump hearing, no proximity sense.

## Constraints

- Plain HTML/CSS/JS, **no build step and no dependencies**. Scripts are classic `<script>` tags (not ES modules) so `index.html` also works from `file://`.
- **No audio files.** All sound is synthesised in `js/audio.js` with the Web Audio API. The `AudioContext` must only be created from a user click (the Begin button) — keep it that way.
- Difficulty lives in `levelConfig()` in `js/level.js`.

## Intro cutscene

`js/cutscene.js` (`EchoCutscene.create(env)`): lore cards, then a scripted scene in a hand-built stage that reuses the game's real ripple system (`env.castRipple`, `env.drawRippleLayer`). Everything is timed off one clock; the times are constants at the top (`S`, `LINES`, `PING_AT`, `LEAP_AT`, ...). "Begin" plays it (`newRun(1, true)`); "Continue" skips it. It is skippable (Enter/Space/Esc/button, ignored for the first 0.6s). The explorer's voice is synthesised (`audio.voice`); do not add audio files. The explorer is unnamed and ungendered on purpose - keep it that way (no pronouns in text).

## Testing

Serve the folder with any static server and open `/?debug`; that exposes `window.__echo` (`info`, `tp`, `go`, `step`, `intro`, `freeze`, `csTo`, `audio`). For the cutscene: `__echo.freeze(true); __echo.intro(); __echo.csTo(22 + 24.1)` jumps to a moment and holds it. In the embedded browser pane the canvas only repaints when a screenshot is taken, so screenshots lag one step behind - take a second one.

Web Audio gotcha: a `GainNode` sits at gain 1.0 until its first scheduled event, so if an oscillator starts before its envelope does you get a full-scale click. Start the oscillator and its `_env` at the same time. `step(seconds)` runs the simulation without needing animation frames, which is handy in headless/embedded browsers. Synthetic key events need `code` set (e.g. `new KeyboardEvent('keydown', {code: 'Space'})`).
