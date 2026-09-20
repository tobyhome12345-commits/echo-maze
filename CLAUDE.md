# Echo Maze - notes for Claude

## Keep the GitHub repo up to date

This repo is the home of the game. **Every time the game is changed, commit and push the change to `origin/main`** (owner requested this explicitly). Do it at the end of each round of changes — don't wait to be asked. Use clear commit messages that say what changed in the game.

## Keep a copy of every version in `C:\Claude` (owner's PC)

The owner wants old versions preserved, **never overwritten**. Whenever the game itself changes (doc-only edits don't count), after committing and pushing:

1. Save the committed tree as a **new** folder `C:\Claude\Echo Maze\vN - short description` (e.g. `git archive --format=zip -o x.zip HEAD`, extract it, delete `CLAUDE.md` and `.gitignore` from the copy). Never edit or delete earlier `vN` folders.
2. Re-point the shortcut `C:\Claude\Play Echo Maze.lnk` at the new folder's `index.html`.

Existing versions: `v1 - first release`, `v2 - blind monsters`, `v3 - monsters go to ripple spot`, `v4 - monsters listen 5s`, `v5 - monsters lock on`, `v6 - intro cutscene`, `v7 - difficulty modes and calm mode`, `v8 - hardcore returns to title`, `v9 - scent monster and puddles` (latest). `C:\Claude\Echo Maze on GitHub.url` links to the repo.

## Monster rules (owner's design - don't loosen)

- Touching a monster (circles overlapping) kills you.
- A monster learns something only when a ripple ray hits it, and then goes to the *exact spot the ripple was sent from*. It never learns where the player is now.
- After arriving it stands still and **listens for `searchTime`** (3.5-6.5s depending on the mode). Only during that window (state `search`) does it hear the player's footsteps, and only within `footstepRadius` (100-158px depending on the mode). Standing still is silent. If nothing is heard it goes idle and is deaf again.
- If it hears a footstep it **locks on** (state `track`): it knows the player's live position and follows it with no time limit for as long as the player stays within `footstepRadius`. The moment the player is farther away it loses them, goes idle and is deaf; it can only be re-alerted by another ripple hit. (A ripple hit on a tracking monster is ignored.)
- Everything else is ignored: no hearing while idle/hunting/sleeping, no bump hearing, no proximity sense.

## Constraints

- Plain HTML/CSS/JS, **no build step and no dependencies**. Scripts are classic `<script>` tags (not ES modules) so `index.html` also works from `file://`.
- **No audio files.** All sound is synthesised in `js/audio.js` with the Web Audio API. The `AudioContext` must only be created from a user click (the Begin button) — keep it that way.
- Difficulty lives in `levelConfig()` in `js/level.js`.

## Scent monster, smell puddles and trails (owner's design, level 6+)

- **Level 4+: at least two echo monsters in every mode** (`levelConfig`: floor of 2 from level 4). Hard/Hardcore keep their extra ones.
- **Scent monster** (`kind: 'scent'`, violet, `T_SCENT`): a second monster type, from level 6 (`SCENT_FROM_LEVEL`). It **never stands still** (state `patrol`, walks to random tiles), **cannot track echoes or footsteps** (a ripple *sees* it - its own violet colour and echo sound - but never alerts it; it is not in `alerts`), and **touching it kills you** exactly like an echo monster (restart depends on the mode).
- **Puddles** (`level.puddles`, lime, `PUDDLE_R`): stepping in makes you smelly for `SMELL_SECONDS` = 5 of **walking** time. **The clock only runs while the player actually moves** (`walked`, > 0.3px/frame): standing still or pushing into a wall never runs it out, and standing in a puddle tops it up. This is deliberate - it stops players just waiting out the 5 seconds. Puddles never block a ripple; a ripple that has line of sight lights them up (timed mark) and plays `echoPuddle`.
- While smelly the player leaves a **trail** (`level.trails`, points every 12px). Trails **persist for the whole level** (they reset when the level restarts). While smelly and within `smellRange`, a scent monster `track`s the player's live position and loses them when the smell ends or they leave range.
- A scent monster that **touches a trail at all** (`TRAIL_TOUCH`) goes to **the other end**: the end farther along the trail from where it touched (`checkTrailTouch`). Once committed (`followTrail`) it must NOT re-evaluate that trail every frame (the "farther end" flips at the midpoint and it would pace back and forth - this was a real bug). After finishing it ignores that trail until it has walked away from it (`ignoreTrail`).
- Scent monster speed is 0.9x an echo monster's and always below the player's 170px/s.

## Difficulty modes and calm mode (owner's design)

- Four modes in the `MODES` table in `js/level.js` (`easy`, `normal`, `hard`, `hardcore`); each scales the baseline curve in `levelConfig(n, mode)`. Owner's brief: Normal is *very slightly* easier than the game was before modes existed; Hard is harder than that; Hardcore is one life and a *tiny bit* harder than Hard. Keep every monster speed below the player's 170px/s and keep the order easy < normal < hard < hardcore. Mazes must be identical across modes for one seed (only monsters differ).
- Hardcore = one life: being caught sends the player **straight back to the title screen** (with a death notice) - no overlay, no Continue, nothing to resume; the next Begin is a fresh run from level 1. Other modes: being caught shows "Try again", which restarts the same level (same maze, monsters reset). The owner asked for exactly this split.
- Hardcore's **high score stays visible** on the title screen (its button tag and a "High score" line): the furthest level reached, 11 = all ten cleared. It is recorded when a level is cleared (and on starting a Hardcore level, so a run that dies on level 1 still counts) and is never lowered. Level 1 has no monsters, so you cannot die there.
- Progress is saved per mode (`echomaze.progress`, best level unlocked, never lowered); mode and calm are remembered (`echomaze.mode`, `echomaze.calm`); the old single `echomaze.best` is migrated to Normal.
- **Calm mode is purely visual + audio and must never change difficulty or gameplay.** It is a flag (`calm` in game.js, mirrored to `audio.calm`), toggled on the title, in the pause menu and with `C`, any time, any mode. It removes the red edge creep, the caught flash/shake/red glow, the heartbeat, and softens screech/growl/steps/caught/lunge and the intro's scare.

## Intro cutscene

`js/cutscene.js` (`EchoCutscene.create(env)`): lore cards, then a scripted scene in a hand-built stage that reuses the game's real ripple system (`env.castRipple`, `env.drawRippleLayer`). Everything is timed off one clock; the times are constants at the top (`S`, `LINES`, `PING_AT`, `LEAP_AT`, ...). "Begin" plays it (`newRun(1, true)`); "Continue" skips it. It is skippable (Enter/Space/Esc/button, ignored for the first 0.6s). The explorer's voice is synthesised (`audio.voice`); do not add audio files. The explorer is unnamed and ungendered on purpose - keep it that way (no pronouns in text).

## Testing

Serve the folder with any static server and open `/?debug`; that exposes `window.__echo` (`info`, `tp`, `go`, `step`, `intro`, `freeze`, `csTo`, `setMode`, `setCalm`, `settings`, `draw`, `audio`). For the cutscene: `__echo.freeze(true); __echo.intro(); __echo.csTo(22 + 24.1)` jumps to a moment and holds it. In the embedded browser pane the canvas only repaints when a screenshot is taken, so screenshots lag one step behind - take a second one.

Web Audio gotcha: a `GainNode` sits at gain 1.0 until its first scheduled event, so if an oscillator starts before its envelope does you get a full-scale click. Start the oscillator and its `_env` at the same time. `step(seconds)` runs the simulation without needing animation frames, which is handy in headless/embedded browsers. Synthetic key events need `code` set (e.g. `new KeyboardEvent('keydown', {code: 'Space'})`).
