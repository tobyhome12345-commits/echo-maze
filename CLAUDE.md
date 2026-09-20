# Echo Maze - notes for Claude

## Keep the GitHub repo up to date

This repo is the home of the game. **Every time the game is changed, commit and push the change to `origin/main`** (owner requested this explicitly). Do it at the end of each round of changes — don't wait to be asked. Use clear commit messages that say what changed in the game.

## Keep a copy of every version in `C:\Claude\echo game` (owner's PC)

Everything for this game lives in `C:\Claude\echo game` on the owner's PC: the version folders (`Echo Maze\`), the shortcut `Play Echo Maze.lnk` and the link `Echo Maze on GitHub.url` (which points at the repo).

The owner wants old versions preserved, **never overwritten**. Whenever the game itself changes (doc-only edits don't count), after committing and pushing:

1. Save the committed tree as a **new** folder `C:\Claude\echo game\Echo Maze\vX.Y - short description` (e.g. `git archive --format=zip -o x.zip <commit> index.html style.css README.md js`, then `Expand-Archive`, so `CLAUDE.md` and `.gitignore` never land in the copy). Never edit, rename or delete earlier version folders, and never edit the files inside them.
2. Re-point the shortcut `C:\Claude\echo game\Play Echo Maze.lnk` at the new folder's `index.html`.

**Version numbers (owner's rule):** every version has a number `X.Y`. A **major** update - a new enemy, new lore/cutscene, or another big new feature/system - goes to the next whole number and the decimal resets (`1.4` -> `2.0`). A **minor** tweak goes to the next decimal (`1.2` -> `1.3`; after `1.9` comes `1.10`, not `2.0`). The number is only in the folder name (`vX.Y - ...`); it is NOT written inside the game's files. If it is unclear whether an update is major or minor, pick one and tell the owner which. When you add a version, add a row to the table below.

| Version | Commit | What changed |
| --- | --- | --- |
| v1.0 | 7b56267 | first release |
| v1.1 | 68091bd | blind monsters (only a ripple hit or touching you alerts them) |
| v1.2 | 1d93cd2 | monsters go to the exact ripple spot; touching kills |
| v1.3 | 4a5dfd7 | monsters listen 5s after arriving |
| v1.4 | 6b318e0 | monsters lock on and keep tracking while close |
| v2.0 | 52ce8af | intro cutscene (new lore) |
| v3.0 | 5c84273 | difficulty modes and calm mode |
| v3.1 | 4b8368c | hardcore dying returns to the title |
| v4.0 | d5e3b24 | scent monster and smell puddles (new enemy) |
| v5.0 | a3647db | scent cutscene and ending (new lore), exact monster schedule |
| v5.1 | af2dcf9 | level select and cutscene replay |
| v5.2 | 7411670 | level 6 scent only |
| v5.3 | 76f1d29 | stepping on your own trail smells you again |
| v5.4 | 0d27706 | ripples have a limited range (about half of what it was) - see "Ripple range" |
| v5.5 | 7abfb31 | a monster is alerted only when the wave really touches it where it is now (see Monster rules) |
| v5.6 | 19d4186 | fix: stepping on your own trail now also works when you walk straight back along it, and when already smelly |
| v6.0 | 8d8e4fd | level 8: the mimic (new enemy) and the sonar decoy (new item); the game now ends after level 8 (latest) |

These replace the old plain `v1`..`v13` folder names (the same 13 versions, renamed; the file contents were not touched). The old number -> new number order is 1->1.0, 2->1.1, 3->1.2, 4->1.3, 5->1.4, 6->2.0, 7->3.0, 8->3.1, 9->4.0, 10->5.0, 11->5.1, 12->5.2, 13->5.3.

## Monster rules (owner's design - don't loosen)

- Touching a monster (circles overlapping) kills you.
- A monster learns something only when a ripple's wave **actually touches it**, and then goes to the *exact spot the ripple was sent from*. It never learns where the player is now. "Touches" is physical and decided every frame in `touchMonsters()` (`js/game.js`): the outgoing wavefront must pass over the monster **where it is right then** (not where it was when SPACE was pressed - a monster that steps out of the way is missed, one that walks into the wave is caught), within the ripple's range, and `waveReaches()` must find a clear line (no wall, boulder or other monster in the way; it aims at five points across the monster's width). Each ripple touches a monster at most once (`rp.touched`). Monsters the snapshot rays hit at SPACE time (`rp.seen`) already have their echo planned; one that walks into the wave afterwards gets a reveal mark and echo sound added at that moment. Only echo monsters can be touched into hunting; scent monsters never can. There is exactly one route by which an echo monster starts hunting (`alertEnemy`, called only from `touchMonsters`); footsteps (`hearFootstep`) only matter for a monster already in its `search` window after such a touch.
- After arriving it stands still and **listens for `searchTime`** (3.5-6.5s depending on the mode). Only during that window (state `search`) does it hear the player's footsteps, and only within `footstepRadius` (100-158px depending on the mode). Standing still is silent. If nothing is heard it goes idle and is deaf again.
- If it hears a footstep it **locks on** (state `track`): it knows the player's live position and follows it with no time limit for as long as the player stays within `footstepRadius`. The moment the player is farther away it loses them, goes idle and is deaf; it can only be re-alerted by another ripple hit. (A ripple hit on a tracking monster is ignored.)
- Everything else is ignored: no hearing while idle/hunting/sleeping, no bump hearing, no proximity sense.

## Constraints

- Plain HTML/CSS/JS, **no build step and no dependencies**. Scripts are classic `<script>` tags (not ES modules) so `index.html` also works from `file://`.
- **No audio files.** All sound is synthesised in `js/audio.js` with the Web Audio API. The `AudioContext` must only be created from a user click (the Begin button) — keep it that way.
- Difficulty lives in `levelConfig()` in `js/level.js`.

## Ripple range (owner's request; tools will build on it later)

- A ripple has a **hard, limited reach** measured from **where the player stood when they sent it** (not the player's live position afterwards). Nothing farther is lit up, echoes or is alerted; an object counts if any part of it (its radius) is inside the range. It used to be 360-770 px, which on the small early levels (level 1 is only 600x440 px) lit the whole maze and ran off screen, so it felt infinite. Now: `max(RIPPLE_RANGE_BASE 360 - RIPPLE_RANGE_PER_LEVEL 9 * level, RIPPLE_RANGE_MIN 240) * MODES[mode].ripple` (constants in `js/level.js`, result in `levelConfig().rippleRadius`), e.g. Normal 362 px on level 1 down to 306 px on level 7; Easy 421 -> 356; Hard 309 -> 261; Hardcore 298 -> 252. Keep it about what fits on screen around the player (half the screen height is ~310 px at 1000x620).
- The player's ripple is sent with `rippleRange()` in `js/game.js` (currently just `cfg.rippleRadius`) -> `castRipple(ox, oy, R)`. **That is the one place tools/upgrades that extend or change ripple range should hook in** (the owner plans tools). `castRipple`'s third argument defaults to `cfg.rippleRadius`, which is what the cutscenes use.
- The intro cutscene's ripples use their own scripted radii (430 and 300 px on its hand-built stage, in `js/cutscene.js`), separate from the game's range.

## Mimic and sonar decoy (owner's design, level 8+)

Owner's brief: level 8 has 1 mimic, 1 echo, 1 scent. The mimic "mimics the end": same green glow, same sound as being near an exit, and "the second your echo touches it, it turns into an echo monster". The sonar decoy: one per level from level 8; collect it, drop it with E (never more than one carried), and 5 seconds after dropping it attracts ALL monsters in a fairly large radius (one time use), including a mimic that has not turned yet; attracted monsters pathfind to it and are trapped there for 5 seconds after they ARRIVE before returning to normal.

**Mimic** (`kind: 'mimic'`, `js/game.js`, spawned in `generateLevel` step 9 well away from the start, >= 8 path-tiles from the real exit):
- It is a perfect exit fake on every channel: exit size (`EXIT_R`, so `e.r` = 16 while disguised, 14 once turned); in `castRipple` it is a `T_EXIT` circle so its rays are green with the exit bell; `drawWorld` gives it the identical glimmer within 130px (`glimmerExit`); the beacon loop in `updatePlay` chimes from it exactly like the exit (`audio.beacon`, from its own position, so you hear two exits); it has NO voice, NO footsteps (`enemyAudio` returns early) and is skipped by the heartbeat/danger loop, and it is not in the title colour legend.
- Only the wave touching it breaks the disguise (`touchMonsters` -> `revealMimic`): `kind` becomes `'echo'`, `r` 14, a voice is created, and every ripple in flight that had bounced off it as an exit is retagged (its rays -> `T_ENEMY`, its not-yet-played echo -> the monster moan, via `rp.hitId`/`rp.circles`/`echo.enemy`). It is then alerted like any echo monster (goes to the ripple spot) unless a decoy has called it. It never turns back. Unpinged, it sits still forever.
- Walking into a disguised mimic kills (it is a monster): my call, flagged to the owner. While disguised it blocks the ripple's rays exactly as the exit does.
- A decoy can drag a disguised mimic: it stays a mimic, walks silently, and after the trap ends goes `idle` (still disguised) where it is (my reading of "return to normal"; flagged to the owner).

**Sonar decoy** (`level.decoy` = the pickup on the floor, `decoys[]` = dropped ones, `player.hasDecoy`; constants `DECOY_*` in `js/level.js`):
- Pickup: walk onto it (`collectDecoy`), only when not already carrying one; HUD shows "Sonar decoy · E"; E (`dropDecoy`) drops it at the player's feet.
- Arming `DECOY_ARM_SECONDS` = 5: beeps that speed up and rise. Then `callMonsters`: every monster within `DECOY_RADIUS` = 480px (STRAIGHT-LINE distance, my choice for "fairly large") in ANY state (asleep, hunting, listening, tracking you, disguised mimic) that has a path gets `lureEnemy` -> state `lured` (walks there by the shortest path at its normal speed) -> on arrival `trapped` for `DECOY_TRAP_SECONDS` = 5 (`updateLured`) -> `releaseLured`: echo/mimic `idle`, scent `patrol`. Lured/trapped monsters ignore ripples (`touchMonsters` skips them, though a trapped mimic still turns), footsteps and smell, but are still deadly to touch. The decoy is removed once all it called are released (min ~1.2s so the ring can play). One time use; one decoy per level so there is never a second.
- Visible/audible: pink (`T_DECOY` = 7, `COLORS[7]`) - shows in ripples like a puddle (a flat mark + `echoDecoy`, never blocks), glimmers within 110px, the floor one blips every 3.2s within ~300px (my addition so it can be found in the dark), and the call draws a pink ring out to the 480px radius. All sounds are procedural (`audio.decoy*`, `mimicReveal`).
- New level/restart resets everything (`startLevel`); the cutscene stage clears `decoys`.

## Scent monster, smell puddles and trails (owner's design, level 6+)

- **Monsters per level are EXACT and identical in every mode** (`ECHO_MONSTERS` / `SCENT_MONSTERS` / `MIMIC_MONSTERS` in `js/level.js`, owner's schedule): echo 0,1,1,2,2,0,1,1; scent 0,0,0,0,0,1,1,1; mimic 0,0,0,0,0,0,0,1 for levels 1-8. Levels 4-5 = 2 echo; **level 6 = scent only (no echo monsters, owner's later change - it was 1 echo + 1 scent up to v5.1)**; level 7 = 1 echo + 1 scent; **level 8 = 1 echo + 1 scent + 1 mimic (and the sonar decoy)**. The modes differ in speed, hearing, ripples and puddles - NOT in monster counts. (Levels past 8 use a placeholder formula only so debug/testing keeps working; they are not part of the game.)
- **The game ends after level 8** (`CAMPAIGN_LEVELS` = 8; it was 7 up to v5.6): clearing it shows "You finished the game" with only a Back to title button (no endless mode, "more levels are coming"). Progress past the last level counts as finished (no Continue, tag "Finished"), which also covers old saves from when there were ten levels. Saves that said "Finished" when level 7 was the end (progress 8) now show Continue (Level 8).
- **Scent monster** (`kind: 'scent'`, violet, `T_SCENT`): a second monster type, from level 6 (`SCENT_FROM_LEVEL`). It **never stands still** (state `patrol`, walks to random tiles), **cannot track echoes or footsteps** (a ripple *sees* it - its own violet colour and echo sound - but never alerts it; it is not in `alerts`), and **touching it kills you** exactly like an echo monster (restart depends on the mode).
- **Puddles** (`level.puddles`, lime, `PUDDLE_R`): stepping in makes you smelly for `SMELL_SECONDS` = 5 of **walking** time. **The clock only runs while the player actually moves** (`walked`, > 0.3px/frame): standing still or pushing into a wall never runs it out, and standing in a puddle tops it up. This is deliberate - it stops players just waiting out the 5 seconds. Puddles never block a ripple; a ripple that has line of sight lights them up (timed mark) and plays `echoPuddle`.
- While smelly the player leaves a **trail** (`level.trails`, points every 12px). A finished trail **lasts about a minute** (`TRAIL_LIFETIME` = 60s of level time, counted from when the smell ran out, drawn fading over its last 12s); a trail still being laid never expires; all trails reset when the level restarts. While smelly and within `smellRange`, a scent monster `track`s the player's live position and loses them when the smell ends or they leave range.
- **Your own trail re-smells you** (owner's request, `touchOwnTrail()` in `js/game.js`): stepping onto a *finished* trail of yours (within `TRAIL_STEP_ON` = 14px, before it expires) does exactly what stepping into a puddle does (`stepInPuddle`: 5s of walking smell + a new trail, or - if you are already smelly - a top-up back to 5s, exactly like a second puddle; a slightly quieter splash). **Cooldown `TRAIL_RESMELL_COOLDOWN` = 10s** (in `js/level.js`, `player.trailCd`, counts game time) from each trail re-smell; puddles ignore it. **Any part of any finished trail counts, INCLUDING walking straight back along the trail you have just laid** (that is the most natural way to step on your own trail: get smelly in a corridor, turn round, walk back). The only exceptions: the trail still being laid (`tr.active`), and the last `TRAIL_TIP_GRACE` = 40px of the trail just finished (`player.justLeft`, until the player steps off it) - without that the smell would restart instantly, because you are standing on the tip of the trail the moment your smell runs out. History/lesson: v5.3-v5.5 wrongly exempted the WHOLE just-finished trail until the player stepped off it, so turning round at the end and walking back along it never re-smelled you (owner reported it), and skipped the re-smell entirely if you were already smelly; both fixed in v5.6. Standing on a trail when the cooldown ends counts (you are on it). Because the cooldown (10s) is longer than the smell (5s of walking), following your own old trail can never keep you permanently smelly.
- A scent monster that **touches a trail at all** (`TRAIL_TOUCH`) goes to **the other end**: the end farther along the trail from where it touched (`checkTrailTouch`). Once committed (`followTrail`) it must NOT re-evaluate that trail every frame (the "farther end" flips at the midpoint and it would pace back and forth - this was a real bug). After finishing it ignores that trail until it has walked away from it (`ignoreTrail`).
- Scent monster speed is 0.9x an echo monster's and always below the player's 170px/s.

## Difficulty modes and calm mode (owner's design)

- Four modes in the `MODES` table in `js/level.js` (`easy`, `normal`, `hard`, `hardcore`); each scales the baseline curve in `levelConfig(n, mode)`. Owner's brief: Normal is *very slightly* easier than the game was before modes existed; Hard is harder than that; Hardcore is one life and a *tiny bit* harder than Hard. Keep every monster speed below the player's 170px/s and keep the order easy < normal < hard < hardcore. Mazes must be identical across modes for one seed (only monsters differ).
- Hardcore = one life: being caught sends the player **straight back to the title screen** (with a death notice) - no overlay, no Continue, nothing to resume; the next Begin is a fresh run from level 1. Other modes: being caught shows "Try again", which restarts the same level (same maze, monsters reset). The owner asked for exactly this split.
- Hardcore's **high score stays visible** on the title screen (its button tag and a "High score" line): the furthest level reached, or "finished the game" once level 8 (the last) is cleared. It is recorded when a level is cleared (and on starting a Hardcore level, so a run that dies on level 1 still counts) and is never lowered. Level 1 has no monsters, so you cannot die there.
- Progress is saved per mode (`echomaze.progress`, best level unlocked, never lowered); mode and calm are remembered (`echomaze.mode`, `echomaze.calm`); the old single `echomaze.best` is migrated to Normal.
- **Calm mode is purely visual + audio and must never change difficulty or gameplay.** It is a flag (`calm` in game.js, mirrored to `audio.calm`), toggled on the title, in the pause menu and with `C`, any time, any mode. It removes the red edge creep, the caught flash/shake/red glow, the heartbeat, and softens screech/growl/steps/caught/lunge and the intro's scare.

## Cutscenes

`js/cutscene.js` (`EchoCutscene.create(env)`) holds **two scenes**, chosen by `start(kind)`: `'intro'` (before level 1: lore cards, then a lost explorer taken by an echo monster) and `'scent'` (owner's request: after clearing level 5, before level 6 - another explorer steps in a puddle, leaves a trail, and a scent monster touches the trail and follows it to them; ends on the card "It can't hear you. It follows what you leave behind."). Both are scripted in a hand-built stage; the intro reuses the game's real ripple system (`env.castRipple`, `env.drawRippleLayer`). Everything is timed off one clock; the times are constants at the top (`S`, `LINES`, `PING_AT`, `LEAP_AT`, ... and the `SC_*` constants for the scent scene). The intro is played by "Begin" (`newRun(1, true)`); the scent scene by `advanceLevel()` when going 5 -> 6. "Continue", Try again and skipping never replay them, and both work the same in every mode. The scent scene shows the real mechanics (5s of walking smell, a trail, following it to the other end). It is skippable (Enter/Space/Esc/button, ignored for the first 0.6s). The explorer's voice is synthesised (`audio.voice`); do not add audio files. The explorer is unnamed and ungendered on purpose - keep it that way (no pronouns in text).

## Replay screen: level select + cutscene replay (owner's request)

- Title button "Levels & cutscenes" (`#btn-replay`, only shown when there is something to replay) opens the `#replay` overlay (`showReplay()` in `js/game.js`; `state` stays `'title'`, Esc goes back, and Enter on it must NOT start a run).
- **Levels:** only levels **already cleared in the selected mode** are pickable: `clearedLevels()` = `min(best - 1, CAMPAIGN_LEVELS)`. The level you are up to (`best`) is NOT pickable - that is Continue. Locked levels are shown dimmed/disabled. Picking one calls `newRun(n)`: no cutscene (like Continue), replaying never lowers `progress`, Next level continues normally (5 -> 6 still plays the scent scene).
- **Hardcore has no level select** (deliberate): it is one life from level 1 with no resuming, so picking a level would be a back door around that rule. Its cutscenes still work. If the owner wants hardcore level select, ask what it should do to the high score.
- **Cutscenes:** `SEEN_KEY` = `echomaze.seen` (`{intro:1, scent:1}`), set in `startCutscene()` when a scene starts (skipping counts - they were shown it). `hasSeen(kind)` also counts old saves that got past the scene (any mode's best > 1 for the intro, >= 6 for the scent scene). Global, not per mode. Unseen ones show as locked "???" with a hint. Rewatching sets `replaying`; `cutscene`'s `finish` (end OR skip) then goes `toTitle()` + `showReplay()` instead of `startLevel`.

## Testing

Serve the folder with any static server and open `/?debug`; that exposes `window.__echo` (`info`, `tp`, `go`, `step`, `intro`, `freeze`, `csTo`, `setMode`, `setCalm`, `settings`, `draw`, `ripples`, `decoys`, `dropDecoy`, `rippleRange`, `audio`). For the cutscenes: `__echo.freeze(true); __echo.intro(); __echo.csTo(22 + 24.1)` jumps to a moment of the intro and holds it; `__echo.intro('scent')` plays the level 5 -> 6 scene (scene starts at 4.6s, `csTo(4.6 + 16.66)` is its impact); `__echo.advance()` does what the Next level button does. In the embedded browser pane the canvas only repaints when a screenshot is taken, so screenshots lag one step behind - take a second one.

Web Audio gotcha: a `GainNode` sits at gain 1.0 until its first scheduled event, so if an oscillator starts before its envelope does you get a full-scale click. Start the oscillator and its `_env` at the same time. `step(seconds)` runs the simulation without needing animation frames, which is handy in headless/embedded browsers. Synthetic key events need `code` set (e.g. `new KeyboardEvent('keydown', {code: 'Space'})`).
