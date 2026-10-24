# Echo Maze - notes for Claude

## FIRST: how a change is released (the owner's flow since 2026-10-18 - read this before changing anything)

**One prompt to a session does the whole release.** The owner pastes an update prompt into a session (usually a CLOUD
session - Claude Code on the web or in the Claude app, on a fresh clone with no access to the owner's PC). The session:

1. does the work, and **updates the version everywhere** (see "Releasing: the version" below);
2. **runs the release gate**, `node tools/check.js --release` (every check and suite, the version check, a headless
   browser load and three screenshots - see "The release gate");
3. **if EVERY check passed** (the gate prints `RELEASE GATE: PASSED` and exits 0): commits and **pushes straight to
   `main`** - GitHub Pages republishes the website from `main` in about a minute, and the installed phone app picks it
   up the next time it is opened;
   **if ANY check failed** (or could not run): it **must not touch `main`**. It pushes a branch, opens a pull request,
   and tells the owner exactly what failed (see "When the gate fails");
4. **never force-pushes and never rewrites history** - not on `main`, not anywhere that has been pushed. No
   `push --force`, no `reset` of a pushed branch, no amending or rebasing pushed commits. To take something back, add a
   new commit (see "Undoing a release").

**The owner's PC then catches up by itself** - no session does anything there: the PC updater (a Windows scheduled
task, see "The PC updater") notices the new version on `main` within 10 minutes, makes the new version folder
`C:\Claude\echo game\Echo Maze\vX.Y - title`, points "Play Echo Maze" at it, and rebuilds and checks the
"Test - everything finished" copy - exactly the steps local sessions used to do by hand.

**A LOCAL session** (on the owner's Windows PC: `C:\Claude\echo game` exists) follows the same flow: the same gate, the
same push-to-`main`-only-if-it-passed rule. It does NOT make the version folder, the shortcut or the test copy by hand
any more - the PC updater does, from `main`, a few minutes after the push (run it by hand to have it at once:
`powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Claude\echo game\Updater\pc-updater.ps1"`).

**Why it matters: `main` IS the public game.** Anything pushed to `main` is live for everyone at once - which is why
nothing reaches it that has not passed every check.

## The website (GitHub Pages, since 2026-10-17)

The repo is **public** and GitHub Pages serves `main` (root) at **https://tobyhome12345-commits.github.io/echo-maze/** -
the owner plays it there on their phone. Every push to `main` republishes it (about a minute). Other branches are never
published. The version tag in the title's corner shows nothing there (it reads the number from a `vX.Y - ...` folder
name), and the link preview (`social.jpg`) works there. **Since v15.6 it is an installable web app** (see v15.6): the
owner has it installed on their phone, and it picks up every push the next time it is opened online.

## Cloud sessions (Claude Code on the web / in the Claude app)

A cloud session works on a fresh clone of the repo with no access to the owner's PC. Everything a development session
needs is in the repo: the game, this file, `docs/`, and every tool in `tools/` - including the server, the headless
browser driver and the checks. What is NOT in the repo, and lives only on the owner's PC: the version folders, the
"Play Echo Maze" shortcuts, the finished test copy, the PC updater's own clone and log, and the owner's Claude memory.

### What a cloud session SKIPS (the PC does these by itself - never try them from the cloud)

- making the version folder `C:\Claude\echo game\Echo Maze\vX.Y - title`;
- re-pointing the shortcuts "Play Echo Maze" / "Play Echo Maze (test - finished)";
- rebuilding the finished test copy (`tools/update-test-copy.ps1`) and checking it (`tools/test-copy-check.js`).
The PC updater does all three from `main` (see "The PC updater"). What the cloud session DOES do is everything that
makes the updater do them right: VERSION.json, the version table row, the README line.

### Releasing: the version

1. **The version number**: the current one is in **`VERSION.json`** (and the last row of the version table below, marked
   "(latest)"). The next one follows the owner's rule in "Version numbers" below: a **major** update (a new enemy, new
   lore/cutscene, or another big new feature/system) goes to the next whole number and the decimal resets (`16.0` ->
   `17.0`); a **minor** tweak goes to the next decimal (`16.0` -> `16.1`; after `16.9` comes `16.10`). If the owner's
   brief names the number or says "minor" / "major", that wins. If it is unclear, pick one and say which. **Never reuse
   a number** - not even one that was undone (its folder is still on the PC, and the updater never overwrites a folder).
   A change that is not a game change (docs, tools only) is **not a release**: leave VERSION.json alone.
2. **Update all of these, together, in the same commit:**
   - **`VERSION.json`** - `{ "version": "v16.1", "title": "jail cutscene" }`. The title is the version folder's
     description on the PC (`v16.1 - jail cutscene`): a few plain lower-case words, at most 40 characters, nothing a
     folder name cannot hold;
   - **the version table** in this file - a new last row, "(latest)" moved to it, `PENDING` in the Commit column (a
     commit cannot hold its own hash; the next release fills the previous `PENDING` in from
     `git log --first-parent --oneline main`) - and the version's own section, as before;
   - **README.md** - its one line `**Current version:** v16.1 - jail cutscene` (near the top);
   - **`js/whatsnew.js`** (v16.3) - **this version's What's new entry, as the NEWEST entry**: a short title and one to four
     lines for a player, in plain words (see that file's header and "v16.3" below for the rules - a line about story
     content gets a `minLevel`; an editor line the 'Level editor' tag) - or `silent: true` if nothing changed that a
     player would notice. Every version needs an entry, silent or not.
   **Where the game itself stores its version: only in the What's new notes** (since v16.3 - before that, nowhere: the
   owner's rule was that the number is only in the folder name). The notes have to know which of them are new, so each
   entry in `js/whatsnew.js` names its version and the newest one is the game's own; nothing else in the game holds it. The title screen's corner tag reads it from the version folder's name, so on
   the PC it always matches VERSION.json (the updater names the folder from it) and on the website it shows nothing;
   **`sw.js` has no cache version** - it is network-first (every file fetched fresh whenever there is a connection; its
   cache `echo-maze` is only the offline copy), so nothing needs bumping there. `VERSION.json` is repo-only: it is never
   copied into a version folder or the test copy. **The version check** (in every `tools/check.js` run) fails if
   VERSION.json, the "(latest)" row and the README line disagree, if the title is not folder-safe, or if a hard-coded
   version appears in `sw.js` or the title's tag - so a forgotten one cannot reach `main`. **The What's new check** (the
   same run) fails if `js/whatsnew.js` has no entry for VERSION.json's version as its newest one, if any version in the
   table from v15.0 on has no entry, or if an entry is not well formed.
3. **Commits**: the project's pattern - a subject line in the imperative that says what changed in the game, with the
   version in brackets (`Add the jail cutscene (v16.1)`), a short body of what changed, and the attribution line
   (`Co-Authored-By: ...` - whatever the session's attribution reminder says). Write the message to a file and commit
   with `git commit -F`. Keep README.md and docs/ current, as always.

### The release gate

```
node tools/check.js --release
```
runs: every `.js` file parses and every `.json` file is valid; **the version check** (above); the game **loads in a
headless browser with no console error or exception**; the **generator fingerprint is `9097b344`** (with a real level
12 as its sanity line); **every test suite of `--full`**; and **three screenshots** in `tools/out/release/` (ignored by
git): the title on a laptop, the title on a phone, level 1 lit by a ripple - each also has to load with no error. Plus
whatever tests the brief itself asks for (identity games, story-bot, a new harness - see "Testing"), which the session
runs and must also pass. The last line says `RELEASE GATE: PASSED - main may be pushed` or `RELEASE GATE: FAILED`.
**PASSED is the only thing that allows a push to `main`.** A check reported as NOT RUN (no browser found) counts as a
failure here. Screenshots are taken because the release needs them; look at them only if something looks wrong in the
numbers (the owner does not want screenshot passes otherwise, to save usage).

Then, if it passed:
```
git fetch origin && git status          # main must not have moved on meanwhile
git push origin HEAD:main               # a plain fast-forward push - never --force
```
If `main` moved on while the session worked: merge `origin/main` into the work (never rebase pushed commits), **run the
gate again**, and push only if it passes again. If GitHub refuses the push for any reason (branch protection, a rule,
the cloud environment only allowing its own branch): do not try to get round it - fall back to the pull request below
and say why.

### When the gate fails (or the push is refused)

`main` is not touched. The session:
1. pushes its work to a branch named after the version and feature (`v16.1-jail-cutscene`, lower case, hyphens);
2. opens a pull request (`gh pr create`, or the session's own pull request tool) whose description says **which checks
   failed and their output**, what was changed, what was tested, and what could not be checked;
3. tells the owner, plainly, that the release did NOT go live and why. The owner decides: fix it in that session, or
   merge it anyway after looking. Never merge it, never enable auto-merge.
The checks also run on every pull request and every push to `main` (`.github/workflows/checks.yml`, the quick set on
Linux + Chrome), so a bad `main` is visible on GitHub as a red cross.

### What a cloud session can never check

Sound by ear, how it looks and feels to a person in motion, a real phone or touch screen, the owner's PC copies. List
them in the final message (and the pull request, if there is one).

### THE STANDING TEST RULE: Visual cues ON first (owner's instruction, v18.1 - every update from now on)

**Toby plays with Visual cues ON.** So every test of every new or changed level and feature is run in a real browser
**with Visual cues ON first** (localStorage `echomaze.visualcues` = `'1'` before the page loads - `tools/headless.js`
`--save`, or a `save` on a `tools/check.js` group), **and then again with it OFF**. Every new cue (`cues.pulse`,
`cues.hold`, `cues.caption`) must be exercised by a test and checked for console errors, **with the real game loop
running** (requestAnimationFrame - not only `__echo.step()`), because an error inside the loop is what freezes the
game. **A level is not finished until it runs error-free with cues on.** (v18.0 broke this: its new cues passed
string keys to a WeakMap and froze the game for anyone with Visual cues on; every test had run with cues off.
`Act2Test.cues` and the "Act 2, Visual cues ON" group of `tools/check.js` are the pattern to copy.)

**Tests must be gentle on the owner's PC** (v18.1): run browsers through `tools/headless.js` only (it ends each browser
with its whole process tree, sweeps up orphans of earlier runs and runs everything at below-normal priority); one
browser at a time; never leave a server or a browser running after a session's work.

### Testing in a cloud session (the same requirements as locally, as far as they go)

Everything runs from the repo with Node (22 or newer; no packages):

- `node tools/check.js` - **the standard checks**, quick set (about a minute): everything the gate runs except the
  long suites and the screenshots. `node tools/check.js --full` adds every suite that is not a soak.
  `node tools/check.js --release` is the gate (above).
- `node tools/serve.js [port]` - the repo on `http://localhost:8121/` (`?debug` for the test hooks); no caching, any
  origin allowed (so another build's page can load these files - e.g. `git worktree add ../old <old-commit>` +
  `node tools/serve.js 8122 ../old` for an old-vs-new identity run).
- `node tools/headless.js <url> --eval script.js [--save save.json] [--shot out.png] [--size 1366x768] [--mobile]` -
  run any expression in the page (e.g. load a `tools/*-test.js` harness and call its suites, exactly as the sections
  below describe) and print the result and any console errors; `--shot` saves a PNG.
- No browser on the machine? `npx -y playwright install chromium` (tools/headless.js finds it), or set `ECHO_BROWSER`
  to one. Without any, `tools/check.js` still does the syntax / JSON / version checks and works the generator
  fingerprint out in Node, and reports the browser suites as NOT RUN - which **fails the release gate**.

### GitHub settings (the owner's choice - a session never changes them)

The flow needs a session to be able to push to `main`. On 2026-10-18 `main` had a ruleset "Protect main" that
**requires a pull request** - with that on, every push to `main` is refused and every release falls back to a pull
request. What the owner should have (Settings -> Rules -> Rulesets -> "Protect main"): **Restrict deletions** ON,
**Block force pushes** ON (these two enforce "never rewrite history"), **Require a pull request before merging** OFF.
A session never changes GitHub settings; if a push is refused, it falls back to a pull request and says why.

## The PC updater (owner's PC only)

`tools/pc-updater.ps1`, installed by `tools/install-pc-updater.ps1` (run that again after changing the updater -
the scheduled task runs the installed COPY, so nothing pushed to `main` changes the updater itself):

| | |
| --- | --- |
| the installed script | `C:\Claude\echo game\Updater\pc-updater.ps1` |
| its own clone of the repo | `C:\Claude\echo game\Updater\repo` - pulled fast-forward only; never edit it (it stops if it has local changes) |
| its log | `C:\Claude\echo game\Updater\updater.log` (what it did; a quiet run adds nothing) and `last-run.txt` (when it last ran, and the result) |
| its memory | `state.json` (what it last said, the last undo it followed, a test copy still to rebuild); `updater.lock` stops two runs overlapping |
| the scheduled task | "Echo Maze updater": at log-on and every 10 minutes, catches up a run missed while the PC was off or asleep, hidden (`conhost --headless`), one at a time, at most 30 minutes |

**Every run**: fetch `main` into its own clone (fast-forward only - if `main` no longer contains what it pulled before,
i.e. history was rewritten, it logs an error and changes nothing); read `VERSION.json` and its history along `main`'s
first-parent line. **If a folder for that version already exists** (`vX.Y` or `vX.Y - anything`), **it does nothing**
- except two things that touch no version folder: following an **undo** (VERSION.json went DOWN: "Play Echo Maze" goes
back to that version's folder and the test copy is rebuilt from it, once), and retrying a test copy that failed last
time. **Otherwise** it makes the folder for every released version it does not have yet (one missed while the PC was
off is made from its OWN last commit, not the newest; an undone version is skipped), exactly as releases always were
made (the commit's top-level game files, without the repo-only `CLAUDE.md`, `VERSION.json`, `.gitignore`, `tools`,
`docs`, `.github`; LF line endings, whatever this PC's git does), points "Play Echo Maze" at the newest, rebuilds "Test
- everything finished" with `tools/update-test-copy.ps1` and the same test save as always, checks it with
`tools/test-copy-check.js` and makes sure "Play Echo Maze (test - finished)" points at it. It never overwrites, renames
or deletes a version folder, never touches the game's saves (they are in the browser), and never commits or pushes.
**Note**: it runs `tools/update-test-copy.ps1` and `tools/test-copy-check.js` from `main` - so a change to those
tools reaches the owner's PC with the next release; test them like game code.

For the owner:
```
Get-Content "C:\Claude\echo game\Updater\updater.log" -Tail 30                       # what it has done
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Claude\echo game\Updater\pc-updater.ps1"   # run it now, by hand
Start-ScheduledTask -TaskName "Echo Maze updater"                                    # or run the task now
Disable-ScheduledTask -TaskName "Echo Maze updater"                                  # turn it off (Enable-ScheduledTask: back on)
Unregister-ScheduledTask -TaskName "Echo Maze updater" -Confirm:$false               # remove it for good
```
`tools/local-release.ps1` still works as the manual way to make one version's folder (for example with the task off).

## Undoing a release

If a release turns out bad, **never force-push and never delete anything**. Add a new commit that puts `main` back as
it was at the end of the previous release:

```
powershell -NoProfile -ExecutionPolicy Bypass -File tools\undo-release.ps1 -DryRun     # look first
powershell -NoProfile -ExecutionPolicy Bypass -File tools\undo-release.ps1             # then type UNDO
```
It works in its own clone (`C:\Claude\echo game\Updater\undo-repo`), finds the version `main` is on and the release
before it (from VERSION.json's history, skipping releases already undone), and adds ONE commit,
`Undo release v16.1 (back to v16.0)`, whose files are exactly `main` at the end of v16.0 - a plain fast-forward push.
The bad release stays in the history. If the push is refused it pushes a branch `undo-v16.1-...` and opens a pull
request instead. Then: **the website** goes back within a minute or two of `main` changing; **the PC** follows by
itself at the updater's next run (within 10 minutes): "Play Echo Maze" back to the v16.0 folder, the test copy rebuilt
from it; **the v16.1 folder stays** where it is (nothing is deleted). **The fixed release then needs a new number**
(v16.2). To undo one more, run it again.

**From a cloud session** ("undo the last release"): do the same by hand - find the previous release's last commit on
`main` (`git log --first-parent -- VERSION.json`), then `git read-tree -u --reset <that commit>`, commit
`Undo release vX.Y (back to vW.Z)` with a short body, run the release gate, and push to `main` if it passes (else a
branch and a pull request). Never `git reset` or `git revert --no-commit` a range and force-push; never edit history.
The PC follows by itself, as above.

## The local release of one version by hand (owner's PC; normally the PC updater does this)

When the owner asks for a version's folder to be made by hand (the updater turned off, or a version from before
VERSION.json existed), a LOCAL session:

1. `git checkout main` and `git pull --ff-only` (if the working tree has uncommitted changes, stop and say so).
2. Find the version and its title: `VERSION.json` (or the version table and the merged pull request).
3. Look first: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\local-release.ps1 -Version v16.0 -Description "jail cutscene" -DryRun`.
4. Then run it without `-DryRun`. It makes the NEW version folder from `main` (refusing if one exists - nothing is ever
   overwritten, renamed or deleted), re-points "Play Echo Maze", rebuilds the finished test copy and checks it. It
   commits and pushes nothing.
5. Tell the owner what it printed.

## Keep a copy of every version in `C:\Claude\echo game` (owner's PC)

Everything for this game lives in `C:\Claude\echo game` on the owner's PC: the version folders (`Echo Maze\`), the shortcut `Play Echo Maze.lnk` and the link `Echo Maze on GitHub.url` (which points at the repo).

### The test copy (owner wants it kept in step with every new version)

Also there: `Test - everything finished\` and its shortcut `Play Echo Maze (test - finished).lnk` - a copy of the **newest version** that starts as a completely finished save: every level cleared in every mode and every cutscene seen. It is not a version and not in the repo, and it is not counted in the version table. It differs from the newest version folder only by the save-key prefix (`echomaze.test.*`, so it never touches the real game's save, which a browser shares between all local copies), a small "TEST COPY" notice, and `test-save.js`.

**Owner's instruction (2026-09-20): update the test copy with every new version.** So the last step after exporting each new `vX.Y` folder (and re-pointing the main shortcut) is:

```
powershell -NoProfile -ExecutionPolicy Bypass -File tools\update-test-copy.ps1
```

It rebuilds the test copy from the newest version folder (nothing is deleted, the version folders are only read). It reads `CAMPAIGN_LEVELS` and the cutscene lists (`SCENE_LEADS_TO`, `SCENES`) from `js/game.js`, so new levels and new cutscenes are marked finished/seen automatically, and it stops with an error if the version folder holds a file it does not know or `index.html`/`game.js` changed shape - then fix the script rather than the copy by hand. Since v15.0 it also unlocks the level editor (`echomaze.test.editor`) and puts the sample levels from `tools/sample-levels.json` into My Levels - and since v15.1 the folders in `tools/sample-folders.json` (`echomaze.test.folders`) - **once** (`echomaze.test.samples2`; v15.0's flag was `samples`), so a tester's deletes and edits stick until the storage is cleared. Since v16.0 its `test-save.js` also honours `echomaze.test.unseen` (a comma list of scene kinds, e.g. `keeper`): those scenes are taken out of `seen` on every load, so a tester can watch a once-unskippable scene as a first-timer again and again; the READ ME says how. Three of the samples are kept in the **v15.0 format (schema 1) on purpose**, so the copy shows old levels being read. After it runs, open the copy once (preview config on the test folder, audio muted, do not click Begin), check the title says "Finished" in all four modes, that the replay screen lists every level and cutscene, and that **Level Editor** opens straight onto My Levels with the samples (all Playable but "Half Built", Unfinished) and the folders Showcase (3) and Puzzles (2), and (v15.2) that its **Bonus Levels** tab lists the six with the first two ticked Done ("2/6" - ticked once, `echomaze.test.bonus2`), and (v15.3) that a sample code from its READ ME (`tools/sample-codes.txt`: one level, one folder, and the Showcase folder again for "you already have" + "Showcase (2)") previews and imports - nothing of sharing goes into the test save - then clear its `echomaze.test.*` storage, close the tab and stop the server. Never put a version number in the game files; the READ ME the script writes may say which version the copy was built from.

**Since 2026-10-18 the PC updater does all of this by itself**, from `main` (see "The PC updater"): steps 1-2 below and the test copy, for every version in VERSION.json. What follows is what it does - and how it was done by hand before. The owner wants old versions preserved, **never overwritten**. Whenever the game itself changes (doc-only edits don't count):

1. Save the committed tree as a **new** folder `C:\Claude\echo game\Echo Maze\vX.Y - short description` (e.g. `git archive --format=zip -o x.zip <commit> index.html style.css README.md social.jpg manifest.webmanifest sw.js icons js` - `social.jpg` since v15.5, `manifest.webmanifest`, `sw.js` and `icons` since v15.6 - then `Expand-Archive`, so `CLAUDE.md` and `.gitignore` never land in the copy). Never edit, rename or delete earlier version folders, and never edit the files inside them.
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
| v6.0 | 8d8e4fd | level 8: the mimic (new enemy) and the sonar decoy (new item); the game now ends after level 8 |
| v7.0 | f02341e | new level 9; the sonar decoy moves to level 9; two new cutscenes (mimic, before level 8; decoy, before level 9); the game now ends after level 9 |
| v7.1 | 495b690 | fix: a story scene you never saw plays first on Continue / level pick (so no need to redo level 7), and is unlocked in the replay screen once you are past it |
| v8.0 | ad2202e | MAJOR: crouching (hold Shift), the stalker (new enemy, orange), level 10, and a fifth cutscene about the stalker (before level 10); the game now ends after level 10 |
| v9.0 | 735c3ad | MAJOR (three features in one update): Visual cues (accessibility option, V key), wall muffling + Doppler for sound, and touch controls (joystick, ripple / crouch / pause buttons, portrait note); also the mimic removed from level 10 |
| v9.1 | 3bd95f4 | MINOR: clearer art - every thing a ripple lights up has its own silhouette and texture (new `js/art.js`), a redesigned exit portal, per-mode `mimicTell`, a 0.3 s exit -> monster morph, the same art in the legend and cutscenes |
| v9.2 | db5e9a2 | MINOR: monster mix changed per mode - Normal/Hard/Hardcore level 9 = 2 scent + 1 mimic (no echo monsters); Easy level 9 = 1 scent + 1 mimic and Easy level 10 = only a stalker (new `MODE_MONSTERS` in `js/level.js`) |
| v10.0 | 52db326 | MAJOR: two new monsters - the Muffler (level 11, never seen: absorbs ripples, hears you, crouching only helps) and the Singer (level 12, sings magenta ripples that mark you, then leaps to the spot) - the campaign grows to 12 levels, two new cutscenes, new per-mode values in `MODES`, Easy has one fewer monster from level 9, level-9 puddle cap |
| v10.1 | 6fb934e | MINOR, three balance fixes: the Singer's ripple range is 270 / 320 / 320 / 320 px (was 300 / 360 / 420 / 460); puddles only on levels where the mode has a scent monster (none on levels 11-12 or Easy level 10); the mimic is placed by the exit's own rule (farthest cell from the start, same kind of spot as the exit) on levels 8-9 |
| v11.0 | 159dc58 | MAJOR: a Settings screen (Controls, Audio, Display, Stats & Medals), rebindable keys, master/effects/ambience volume buses, a procedural soundtrack (`js/music.js`), four colour palettes incl. two for colour blindness (`js/palette.js`), and medals + lifetime stats (`js/profile.js`) |
| v11.1 | fcbfd84 | MINOR: the sonar decoy now calls EVERY kind of monster (the stalker, the Muffler and the Singer included) and reveals a mimic inside its radius; the range is unchanged at 480 px; level hints name the player's own keys |
| v11.2 | 0fd6b16 | MINOR: a TUTORIAL - level 0. A hand-drawn maze (`js/tutorial.js`), the same every time, no monsters, nothing that can kill you, identical in every mode, no timer; six prompts that wait for the player to do the thing; a Tutorial button on the title and the first Begin plays it before the intro; it counts for nothing |
| v11.3 | 9fee54b | MINOR, visual + audio only: a drawn ECHO MAZE title wordmark (`js/wordmark.js`) lit in the palette's wall blue, with a ring of light sweeping through the letters every 5.5 s, a brighter one-off reveal and a soft whoosh (`audio.titleReveal`) when the title appears, gentler in calm mode / reduce-motion, and a small type tidy-up on the tagline |
| v11.4 | 4163436 | MINOR, visual + audio only: the title screen rebuilt. The wordmark is now the EXIT GREEN with a four-pass additive glow and a band that visibly brightens and thickens each letter as it sweeps across; calm mode really softens it (peak -40%, half again slower, dimmer rest) and it can be proved with `wordmarkSeek`, which freezes a frame. The rest of the screen - key chips, grouped blocks, colour-tinted legend pills, lit buttons - was redesigned to match, with no text, binding or behaviour changed |
| v11.5 | 3c7109f | MINOR, visual + audio only: the title screen's language applied to every other screen - the same panels, chips, buttons and glow on pause / caught / complete / victory / replay / settings - plus cross-fades between all of them (`showOverlay` + `go`, ~300 ms, never blocking the AudioContext click), HUD numbers that tick instead of snapping, medals that reveal one at a time with their numbers counting up, and three CSS variables that calm mode and reduce-motion soften in one place |
| v11.6 | db2ecd2 | MINOR, feedback only: the Caught screen says what really got you (`js/feedback.js`, from a `why` each monster tags itself with when it first notices you, picked by a hash - never `Math.random`); a near miss (inside 1.5x the kill radius and out again) gives one heartbeat, a red pulse and a dip in the ART clock only, counted in the stats and read by nothing; and "Progress saved" appears only when a new best or a new medal really reached localStorage |
| v12.0 | aba0209 | MAJOR: LEVEL 13, the capture. A hand-drawn 27x21 maze (`js/warden.js`) with nothing in it that can kill you; a dread ramp over the last 28 tiles of the route (drone, warped ambience, tremor, red vignette - all cosmetic, softened and slowed in calm mode); a great room that GLOWS ON ITS OWN, the game's one deliberate exception to "you never see without a ripple", clipped to what you could really see; a WARDEN filling half of it that a ripple reads as stone until the player's own next ripple press reveals it (a 7 s flinch as a safety net); then the controls are taken for the first and only time and it takes you. Level 12 now leads on to 13, the victory screen is retired, and the game ends on a labelled STUB until the next area is built. Level 13 takes no medals |
| v12.1 | bd365c0 | MINOR: the level 13 capture now plays IN FULL every time the level is finished, not only the first time. The brief second-visit version is removed outright rather than bypassed - the warden is hidden again at the start of every attempt, and nothing is written to `echomaze.seen` for it, because there is no longer a version to choose |
| v12.2 | 0d6ae1d | MINOR, level 13 only: the great room's glow now respects WALLS as well as ripples - `mouthSight()` asks the game's own line-of-sight test for seven points across the room's one gap and the glow is scaled by the fraction it can see, which closed the four tiles that leaked (the corridor under the room, and the dead end beside it through a tile corner). And the warden is redrawn: a jagged faceted crest cut from the union of its own circles, masonry courses, chips, forked cracks and one sealed seam instead of a smooth blob; the grab is three filled, tapered, jagged limbs that extend AND thicken, the middle one opening into claws, instead of five straight lines; and the sequence gains a held beat, a 0.3 s IMPACT (one flash, a 36 px floor kick, a new `wardenGrab` sound) and a shorter fade the sound carries on under - 2.92 s of picture, was 4.2. Its collision circles, and therefore the level, are untouched |
| v12.3 | f69ebf4 | MINOR, level 13 only: **walking into the great room is now the whole trigger** - crossing `INSIDE_PX` fires the involuntary gasp at once instead of after a 7 s wait, so the wall still lights up because a wave washed over it and the player never has to press anything (0.217 s from the threshold to the reveal). The `armed` phase becomes `wave`, `AUTO_SECONDS`, `waitT` and the safety-net idea are gone, `emitRipple` no longer tells the warden anything, and `onRipple` lost its `involuntary` argument. A ripple the player sends on level 13 is now an ordinary ripple and nothing else. This reverses the "your own next ripple press" trigger the owner asked for in v12.0, at their request |
| v13.0 | 9cdaa90 | MAJOR: LORE FRAGMENTS (`js/lore.js`). One note or recording per level on 1-12, off the route (a dead end, 13-19 tiles out of the way on average), lit by a ripple through the SAME `flats` path as puddles and decoys and read the moment your own wave reaches it; recordings speak in the cutscenes' formant voice (`audio.speak`); present 100 / 80 / 50 / 0 % on Easy / Normal / Hard / Hardcore; kept for good (`echomaze.lore`) and listed on a new Fragments screen built like the replay screen, with a thirteenth once all twelve are found. Placed after generation from its own stream, so levels 1-12 are byte-identical (`9097b344`, and identity games that really read fragments match v11.6). A tenth palette role, `lore`, that made no palette harder to read. Also: the v12.2/v12.3 generator fingerprint was found to have been hashing nothing - corrected, and the harness is now `tools/generator-fingerprint.js` |
| v14.0 | 795ba51 | MAJOR: LEVELS 14-16 (`js/story.js`), hand-drawn like 13 and following straight on from the capture. **14, the gaol**: no enemies; a scripted wake-up, iron bars a ripple sees through, drips that are small ripples of their own, a KEY found like any floor object (`T_KEY`, brass), a locked door that rattles until it turns, a walk out. **15, the false exit**: warm light at the end of a passage (the second "seen without a ripple" exception, clipped to the player's own line of sight - 0 leaks over every tile) that turns out to be a Warden; it wakes, a sealed passage cracks open and it hunts you at `WARDEN_SPEED` 0.75 x your walking speed. **16**: another, sealed behind you, faster - `WARDEN_UPGRADED_SPEED` 1.05 - in galleries with water dripping along the way out (a clean run arrives 560 px of path ahead; ~3 s of hesitation in all catches you). The Warden always knows where you are, kills on touch by the usual rule, and has no abilities yet (`js/warden.js` `VARIANTS` / `ABILITIES`, hooks ready). The capture now leads into 14 and the ending stub moved to after 16; no medals for 13-16; the Settings medal board fixed to "of 36". Levels 1-12 byte-identical (`9097b344`, eleven identity games = v13.0) |
| v14.1 | 0526a11 | MINOR: being caught by the Warden (levels 15-16) now says **"It never lost you."** under *Caught* instead of "The echo found you." (every other death unchanged), and a banner still on screen when you are caught is cleared so nothing sits on the Caught panel |
| v15.0 | 50d5f8c | MAJOR: THE LEVEL EDITOR, part 1 of 3 (`js/editor.js`, `js/mylevels.js`, `js/levelformat.js`, `js/levelcheck.js`, `js/levelstore.js`, `js/dialog.js`; format in `docs/level-format.md`). A **Level Editor** button on the title; a one-time spoiler warning (I understand / Back), skipped for anyone who has finished a mode; **My Levels** (play, edit, rename, delete - asks first; unfinished drafts listed but not playable); the editor - walls draw / erase / box-select-and-move, start, exit, every monster from the game's own `MONSTER_TYPES` (the Wardens as "Level 15 / 16 monster"), title, size, undo/redo, clear all (asks first); live, worded validation; **Test play** with the real engine and back to the editor intact. Custom levels play through the same path as 13-16 (`buildCustomLevel`, untrusted data), tuned like level 12 in the picked mode, and **write nothing** (levelNum -1, `scored()` false). Private only: no sharing, export, codes, network or accounts. Levels 0-16 byte-identical (`9097b344`, eleven identity games and story-bot = v14.1) |
| v15.1 | 7516218 | MINOR (the owner's number): THE LEVEL EDITOR, part 2 of 3. Schema 2 (`exits`, `objects`, `effects`, `titleCard`, `palette`, `difficulty`; v15.0 levels migrated, an `exit` mirror still written for them); a **touch warning** every time the editor is opened with touch controls on; **up to 8 exits**, any one finishes, each can be **locked** (level 14's door; one key opens them all); **floor objects** - puddles, the sonar decoy, the key, **notes** in the player's own words (nothing kept); **light / red glow zones** (drawing only, clipped to sight, never a monster); **Level settings** - exact size, a **title card**, a palette (over Default only), and **each level's own difficulty** (a rating, or Custom with three clamped scales and Reset; hunters capped; a check refuses impossible levels); **folders** (kept apart from the levels; delete keeps levels unless asked twice; sort; **play in order**), **duplicate**, **thumbnails**; touch editing best effort (`js/effects.js`, `tools/editor-test-2.js`). Levels 0-16 byte-identical (`9097b344`, eleven identity games, levels 0 / 13-16 and story-bot = v15.0) |
| v15.2 | ec0cc8c | MINOR: **BONUS LEVELS** - six ready-made, hand-drawn levels that come with the game (`js/bonus-levels.js`, data only, schema 2), on a **Bonus Levels** tab beside My Levels, behind the editor's warnings: Crossroads (Easy), Shortcut (Easy), Embers (Normal), Lure (Normal), The Long Way (Hard, a regular Level 15 monster), Everything at Once (Hardcore, the upgraded one). Any order; a **Done tick** kept in its own key (`echomaze.bonus`); **read-only** - a second level source in the store (list / get; save, delete and duplicate refuse; My Levels refuses their ids) - with **Copy to My Levels** (new id, Unsorted, plays identically). Never in the campaign: no level select, cutscene, progress, medals, stats or fragments (`tools/bonus-test.js`). Levels 0-16 byte-identical (`9097b344`, eleven identity games, levels 0 / 13-16 and story-bot = v15.1) |
| v15.3 | 01693cb | MINOR: **LEVEL SHARING** (the editor, part 3 of 3) - **share codes** with no server: the code IS the level (`js/sharecode.js`, format in `docs/level-format.md` "Share codes": `ECHO1L` / `ECHO1F` + base-62 payload + CRC-32; packed, deflated when shorter; the game's own inflate as the fallback). **Share** on a playable level, **Share folder** (playable levels only, up to 20, skipped ones named), **Copy** with a select-by-hand fallback, the length shown; **Enter code** (behind the editor's warnings): a preview, nothing saved before **Import** - one level to Unsorted, a folder as a new folder ("Name (2)" on a clash), all or nothing (`EchoLevelStore.importShared`), "you already have this" by content. Codes read as untrusted (size / unpack / count caps, cleaned text, the normal loader and checker; a folder with one bad level refused whole). An optional **creator name** (editor Level settings) goes into codes; imported levels show "by ..." and keep it until edited (`tools/share-test.js`, `tools/sample-codes.txt`). Levels 0-16 byte-identical (`9097b344`, identity games and story-bot = v15.2) |
| v15.4 | 03a773f | MINOR, one line of feedback: the faster Warden's death tip "...Follow the water and do not stop." (level 16's advice) is said only on level 16; on a custom or bonus level its third tip is "...Know your way and do not stop." (`js/feedback.js` `upgradedElsewhere`, `WATER_LEVEL`). Level 16's tips are exactly as before (same pick for the same death); nothing else changed. Levels 0-16 byte-identical (`9097b344`) |
| v15.5 | a80d4be | MINOR, UI only: **the title screen polished** - no inner scroll at 1280x720 / 1366x768 / 125% / 150% zoom; the controls, rules and legend moved to a **How to play** screen that shows only what the player has met (the rest "???"); Continue takes the lead for a returning player (Enter presses whichever is lit); themed switches for Calm / Visual cues; a calmer selected difficulty; rewritten mode lines; a headphones note by Begin; a click ripple; scales up on big screens (`--s`); usable held upright on a phone or tablet; focus rings, radiogroup arrows; a version tag read from the folder name; meta / social tags and `social.jpg` (`tools/title-test.js`). Levels 0-16 byte-identical (`9097b344`) |
| v15.6 | eb0c2c9 | MINOR, no change to the game itself: **an installable web app** - `manifest.webmanifest` (full screen, the dark colours), `icons/` (made from the favicon), `sw.js` (a network-first service worker: the newest version whenever there is a connection, the last one offline), iOS home-screen tags; all only over http(s), so the `file://` copies are untouched. Levels 0-16 byte-identical (`9097b344`) |
| v15.7 | da53643 | MINOR (the owner's "next minor version"): two **UNRELEASED** monsters, in the level editor and custom levels only - the **Alarm** (never moves, harmless; the wave of one of YOUR ripples reaching it makes it scream ONCE: every monster but the Wardens goes to where you were at that moment; then spent, silent, dim; a faint positional hum-tick before) and the **Screecho** (an echo monster in every rule, that also screams when a ripple reaches it, at most once per `SCREECHO_COOLDOWN` = 20 s). Tagged "Unreleased" in the editor; share-code words added at the end; an **unreleased-content warning** every time the editor is opened from the title, driven by one list (`UNRELEASED_CONTENT`, js/level.js); three test-copy samples (`tools/monster-test.js`). Levels 0-16 byte-identical (`9097b344`; eight identity games = v15.6) |
| v16.0 | 31ad3fc | MAJOR (new lore/cutscene): **the keeper scene** - an eighth story cutscene between level 13's capture and level 14's wake-up. The Warden carries the unconscious explorer into the gaol, lays them in their cell, the cell's gate clangs shut, it locks the gaol door from outside and slides the key back in under it; the key skids away out of sight; the steps fade, a single drop, cut to level 14. About 31 s, no text but Visual cues captions, lit only by drips, on level 14's own map. **Unskippable until it has been seen once** (and it counts as seen only when it has played to its END - `SEEN_AT_END`), skippable after; **P pauses any cutscene** (new, all eight). In the replay screen as "Somewhere Deeper"; the v7.1 catch-up rule plays it before level 14 on Continue / level select when unseen. Test copy: `echomaze.test.unseen` re-creates a first viewing (`tools/keeper-test.js`). Levels 0-16 byte-identical (`9097b344`) |
| v16.1 | c85f626 | MINOR, editor UI only: **monster descriptions in the level editor** - one or two short sentences on what each monster does, in a fixed panel at the foot of the editor's side panel (the monster under the pointer, else the one with keyboard focus, else the one picked; a tap picks), with its Unreleased tag; the same words in the inspector for a placed monster and for a screen reader (aria-describedby). Each description is `about` beside the monster's definition (MONSTER_TYPES in js/level.js, VARIANTS in js/warden.js); every number in them is built from the game's constants; `tools/editor-about-test.js` fails if any monster has none. Nowhere outside the editor. Levels 0-16 byte-identical (`9097b344`) |
| v16.2 | 8bd7ce7 | MINOR (the owner's number): **lore fragments on levels 13-16** - four, placed by hand off the way through (ids `s13`-`s16`; `f13` stays the bonus line's), the same CHANCE roll from the same stream, so 16 in all and every total from the real count - and **a hidden scene, "Kept"** (`'kept'`, about 28 s, wordless, lit only by drips, in the gaol: the Warden traces the scratches on a cell wall as if counting them and lays down, one at a time, the notes it has kept) that opens only when all 16 are found: a quiet corner notice when the last one is read, then it is at the end of Fragments and of Levels & cutscenes, playable and skippable, never played for you and not listed at all before. Level 14's fragment is scratched into a cell wall (`EchoArt` 'scratches'). On 13-16 a spoken line sits above a fragment's line, and a hint waits for it. Levels 1-16 play exactly as before (`9097b344`; the capture, the wake, story-bot and identity games = v16.1) |
| v16.3 | e890295 | MINOR: **What's new** - once, on the title, the first time a returning player opens the game after an update they have not seen notes for: the notes since the version they last saw, newest first, at most five, with See all updates; a brand-new player never sees it (recorded quietly). Got it / Enter / Esc / a tap outside; a modal dialog with focus kept inside. A corner link beside the version (and, on a phone held upright, What's new in Settings) opens the whole history. One data file, `js/whatsnew.js` (an entry per version from v15.0, silent or not; lines about story content held back by level), its record in `echomaze.whatsnew`; `tools/check.js` fails without an entry for VERSION.json's version. Levels 0-16 unchanged (`9097b344`) |
| v16.4 | bc3a730 | MINOR, text only: **the Caught screen names what caught you** - one table, `CAUGHT_LINES` in js/game.js, keyed by the monster's kind (`'warden:upgraded'` for level 16's), one short first-person line each, `The echo found me.` for anything unknown; the catch hands the monster itself to `onCaught`; two monsters touching on the same frame -> the one furthest inside (it got there first); Hardcore's title notice quotes the line; each catch's delayed screen is numbered so it can only ever show for its own catch. Levels 0-16 unchanged (`9097b344`; capture, wake, story-bot and identity games = v16.3) |
| v17.0 | 14fa22c | MAJOR: **ACT 2, THE BROKEN GAOL - levels 17-20**, hand-built, each breaking one rule: **17 the liar** (ghost walls a ripple draws that are not there, hidden walls it does not draw that are), **18 the shuffle** (sliding walls every ping in range moves, after a grind), **19 the loop** (folds that move you to their pair; a drip to find your way by), **20 the echo behind** (ripples at 0.42x speed shown 0.45 s late, and a level-15 Warden that breaks out of the stone behind you). The void at the map edges and a falling sound, stronger each level (drawing and sound only); the 16 -> 17 rumble and glitch; one-line hints; no new monsters, words, scenes or fragments; the new tiles story-only. `CAMPAIGN_LEVELS` 20, the ending stub after 20, a finished-16 save continues at 17. `tools/act2-check.js` (in every check run) and `tools/act2-test.js`. Levels 0-16 unchanged (`9097b344`; capture, wake, story-bot and identity games = v16.4) |
| v17.1 | 66b78c1 | MINOR, text only: **the Caught screen's lines speak to you** - the game talking to the player ("The echo found you.", "It never lost you.") instead of v16.4's first person ("...found me"); the same table (`CAUGHT_LINES`), the same keys, the fallback "The echo found you."; the Warden still never named. Nothing else changed |
| v18.0 | 572b9c7 | MAJOR: **ACT 2 PART 2, THE VOID - levels 21-24** ("the crumble"): the void is taking the maze - story-only void tiles (a fall that never lands, "The void took you."; a monster over it falls and is gone), **21 the crumble** (crumbling floor that goes after you step off it; a rush can strand you), **22 dead air** (ripples go in and never come back, your steps are lost) **and the Alarm** in the story, with a new scene before it ("Only A Voice"), **23 the creeping edge** (the void eats the map ring by ring on a fixed schedule; Easy slower), **24 the wrong way out** (its way out leads into a smaller half-eaten copy whose way out is back west, a Warden behind you; Try again restarts that part). `CAMPAIGN_LEVELS` 24, the stub after 24, a finished-20 save continues at 21. `tools/act2-check.js` proves 17-24 (crumble states, the creep in time) and `tools/act2-test.js` plays them. Levels 0-20 unchanged (`9097b344`; 13-16 = v16.4; 17-20 walk as in v17.0) |
| v18.1 | 0cd61f0 | MINOR, a fix: **with Visual cues on the game froze** on 21 (a crumbling tile cracking), 18 (a sliding wall) and 23 (a ring going) and stayed frozen everywhere until a reload - js/cues.js kept its rate limit in a WeakMap, and v18.0 passed it string keys, which threw inside the game loop. A second Map for string keys; the game loop now catches an error in its update or its drawing, logs the first few, and always asks for the next frame. Tests: `Act2Test.cues` (the real loop, cues ON and off) and the Act 2 suites again with cues ON in `tools/check.js`; `tools/headless.js` no longer leaves browser processes behind and runs them at below-normal priority. Levels, saves, the editor and share codes unchanged |
| v18.2 | 34b57de | MINOR (the owner's number): **LEVEL 25, THE LIGHT** - the end of Act 2. Level 15's mirror: a long quiet hall, a faint warm light far off down a line of bars (seen through, never walked), growing and warming as you come with the sound of outside; past `tripX` the stone behind splits and level 16's upgraded Warden is let out, and the floor behind falls into the void on a schedule from that moment; a winding way to the light, which is REAL - it stops at the edge, its hum fades, the white floods in. The old stub ending replaced by a calm end screen, "More to come soon." (`showEndScreen`, its words in constants). `CAMPAIGN_LEVELS` 25; a finished-24 save continues at 25. No new tiles, no new monsters, no words. Also `tools/headless.js` really ends its browsers now (by profile; v18.1's tree kill missed them). Levels 0-24 unchanged (`9097b344`) |
| v19.0 | 842ed9b | MAJOR: **ACT 3 BEGINS - OUTSIDE 1** (internal level 26), in full daylight: 25's white flood runs into it (the outside sound carried on, the colour fading in), a big open field (84x56, walls only at its edge) of grass, a worn path, flowers and trees you walk under, the player seen for the first time; wind, birds, grass footsteps; no monsters, music or drone; the way on through a gap in the trees ends in the "More to come soon." screen (moved here from 25). **Per-level flags** (`daylight`, `noRipple`, `noCrouch`, `noHud`, `movementOnly`): only movement and pause work, nothing on screen while you play, the joystick only on touch, a tap shows the pause button for 3 s. **Shown as "Outside 1"** everywhere (`levelName`). `CAMPAIGN_LEVELS` 26. Levels 0-25 unchanged (`9097b344`) |
| v19.1 | b943eaf | MINOR: **"First Breath"** - level 26 renamed (from `OUTSIDE_NAMES`, js/game.js: the next outside levels are just the next names - Fresh Air, Open Ground, Same Sky, The Wall); its **level-list tile** a word to a line, centred, its font fitted to the same tile as the numbers at every width (`fitLevelNames`); and the **daylight interface** (Settings -> Display, only once level 26 is reached, off by default, `echomaze.lightui`): every menu and screen in a light look by ONE filter and the theme variables (`html[data-ui='light']`), the game and the HUD untouched. Levels, saves, the editor and share codes unchanged (`9097b344`) |
| v19.2 | e09b26d | MINOR: **"Fresh Air"** (internal level 27, `kind: 'village'`, the flags of 26): a daylight village after First Breath - cottages, fences, gardens, a washing line, a square with a well, stalls and a bench (solid: the cottages, fences, stalls, the well); twelve villagers drawn like the player, not solid, keeping 34 px off, never looking at you, each on a fixed day of keyframes; every `VILLAGE_LOOP` 40 s all of them start again at once (a soft fade, a half-second hush in the wind); every village sound echoed once, 0.45 s later, at 0.4, at most 14 waiting - never the player's; the gate at the end -> "More to come soon." (moved from 26). `CAMPAIGN_LEVELS` 27; a finished-26 save continues at 27. Levels 0-26 unchanged (`9097b344`) |
| v19.3 | 3d2d3c3 | MINOR (the owner's "next minor version"): **"Dusk"** (internal level 28, `kind: 'dusk'`, the flags of 26-27 plus a new `interact`): a long meadow on from the village in which the light drains with how far you have walked (never with time, never back) - dusk, night, then black with the ground gone (drawing only; an invisible edge) - the sound with it (wind and birds fade, the village's last murmurs and echoes die, the steps turn the gaol's dry ones); far along, a still, harmless Warden in a faint pale glow (its hum fades in, it turns to you close to); within about two tiles a **Talk** prompt, the only thing on screen (the new rebindable **Interact** action, E by default, sharing E with the item key; a Talk button on touch) -> the new scene **"Nothing Listens"** (the Warden speaks eleven lines as subtitles in a low slow voice, the knocks, one more knock, a cut to black; unskippable the first time, seen only at its end, pausable; in the replay list once seen) -> "More to come soon." (moved from 27). `CAMPAIGN_LEVELS` 28; a finished-27 save continues at 28. Levels 0-27 unchanged (`9097b344`) |
| v20.0 | PENDING | MAJOR: **ENDLESS MODE** - a title-screen **Endless** button (only once level 12 has been cleared in some mode; not shown before) for generated mazes one after another, harder each depth, until caught (one life in every mode); the score is the depth. Each depth is the campaign's own generator on its own config (`endlessConfig`, js/level.js) from (run seed, depth) - `generateLevel` takes a ready config as a new last argument, and campaign calls never pass one (`9097b344` unchanged); re-rolled until it passes `endlessCheck` (the way out reachable and a real walk away, monsters a safe distance off, nothing still on the only way through). Monsters in the campaign's order, one new kind every 3 depths (`ENDLESS_INTRO`), the Alarm only once met (level 22); sizes grow to depth 30, then monsters and speed rise slowly to caps (all < 170). The usual quick fade between depths; no hints, banners, lore or cutscenes; a soft chime at 5/10/25/50 (`audio.milestone`); "New best!" past your best. Game over: Depth N, the best for the mode, New best!, the Caught line, **Try again** (a new run at once) / **Back to title**. Its own save `echomaze.endless` (best per mode, the last run); `levelNum` = `ENDLESS_LEVEL` (-2), so nothing of the campaign is written. `tools/endless-check.js` (Node, every check run) and `tools/endless-test.js` (a 60-depth bot, the real loop at every depth, cues ON and off, a phone) (latest) |

These replace the old plain `v1`..`v13` folder names (the same 13 versions, renamed; the file contents were not touched). The old number -> new number order is 1->1.0, 2->1.1, 3->1.2, 4->1.3, 5->1.4, 6->2.0, 7->3.0, 8->3.1, 9->4.0, 10->5.0, 11->5.1, 12->5.2, 13->5.3.

## Monster rules (owner's design - don't loosen)

- Touching a monster (circles overlapping) kills you.
- A monster learns something only when a ripple's wave **actually touches it**, and then goes to the *exact spot the ripple was sent from*. It never learns where the player is now. "Touches" is physical and decided every frame in `touchMonsters()` (`js/game.js`): the outgoing wavefront must pass over the monster **where it is right then** (not where it was when SPACE was pressed - a monster that steps out of the way is missed, one that walks into the wave is caught), within the ripple's range, and `waveReaches()` must find a clear line (no wall, boulder or other monster in the way; it aims at five points across the monster's width). Each ripple touches a monster at most once (`rp.touched`). Monsters the snapshot rays hit at SPACE time (`rp.seen`) already have their echo planned; one that walks into the wave afterwards gets a reveal mark and echo sound added at that moment. Only echo monsters can be touched into hunting; scent monsters never can. There is exactly one route by which an echo monster starts hunting (`alertEnemy`, called only from `touchMonsters`); footsteps (`hearFootstep`) only matter for a monster already in its `search` window after such a touch.
- After arriving it stands still and **listens for `searchTime`** (3.5-6.5s depending on the mode). Only during that window (state `search`) does it hear the player's footsteps, and only within `footstepRadius` (100-158px depending on the mode). Standing still is silent. If nothing is heard it goes idle and is deaf again.
- If it hears a footstep it **locks on** (state `track`): it knows the player's live position and follows it with no time limit for as long as the player stays within `footstepRadius`. The moment the player is farther away it loses them, goes idle and is deaf; it can only be re-alerted by another ripple hit. (A ripple hit on a tracking monster is ignored.)
- Everything else is ignored: no hearing while idle/hunting/sleeping, no bump hearing, no proximity sense.
- A crouching player makes no footstep, so `hearFootstep` is never called for them: an echo monster in its listening window cannot hear a crouched player (one already `track`ing keeps following while within `footstepRadius` - crouching is not a lock-break; the owner did not ask for that). See "Crouching" and "Stalker" below.

## Constraints

- Plain HTML/CSS/JS, **no build step and no dependencies**. Scripts are classic `<script>` tags (not ES modules) so `index.html` also works from `file://`.
- **No audio files.** All sound is synthesised in `js/audio.js` with the Web Audio API. The `AudioContext` must only be created from a user click (the Begin button) — keep it that way.
- Difficulty lives in `levelConfig()` in `js/level.js`.
- **Level 0 is the tutorial** (`js/tutorial.js`), not part of the campaign (`CAMPAIGN_LEVELS` is 28 since v19.3 - 27 in v19.2, 26 in v19.0-v19.1, 25 in v18.2, 24 in v18.0-v18.1, 20 in v17.x, 16 from v14.0: levels 1-26). It is hand-drawn, draws no random numbers, and must never write to progress, medals or stats — in `js/game.js` every such write is behind `scored()`. Keep it that way.
- **Level 13 is the capture** (`js/warden.js`), hand-drawn in the same way and for the same reason. It IS part of the campaign (progress, "levels cleared", the level select) but takes **no medals** (`MEDAL_LEVELS` is 12). It holds the game's **first deliberate exception to "you never see anything you have not pinged"** — see the v12.0 section, and v12.2 for how the walls are made to block it.
- **Levels 14-16** (`js/story.js`, v14.0) are hand-drawn in the same way, take no medals, and hand straight on to one another; since v17.0 they hand on to **Act 2, levels 17-20**, and since v18.0 on to **21-24** (also `js/story.js`, see v17.0 and v18.0), and since v18.2 on to **25, the light**; since v19.0 on to **Outside 1** (26, Act 3); after it comes the end screen (`showEndScreen`, a placeholder - "More to come soon."). **Act 2's tiles (ghost, hidden and sliding walls, folds; v18.0: void, crumbling floor, dead air) are story-only**: never in the editor, `docs/level-format.md`, share codes or the WORDS lists. **Prove 17-24 can be finished after any change near them** with `node tools/act2-check.js`. Level 15's false light is the **second deliberate exception**, held to the same rule (clipped to the player's own line of sight). The Warden that hunts on 15-16 (and, since v17.0, the regular one on 20) is tuned by exactly two numbers, `WARDEN_SPEED` / `WARDEN_UPGRADED_SPEED` in `js/level.js` (fractions of the player's walking speed), and has **no abilities until the owner names them** - add one as an entry in `ABILITIES` in `js/warden.js` and its name in a variant's list; never by rewriting the hunt. **Prove 16 is still fair after any change near it** with `tools/story-bot.js` (a clean run, wrong turns, pauses - see v14.0).
- **The level editor and custom levels** (v15.0, see its section): a custom level is played with `levelNum` = `CUSTOM_LEVEL` (-1), so **`scored()` is false and it must write nothing** - no progress, medals, stats, fragments, seen, "levels cleared". **Every write to the save goes behind `scored()`** (v15.0 had to gate three that were not: `bump('marked')`, `bump('decoys')`, `addDeath`); `tools/editor-test.js` `noWrites()` proves it - run it after touching any save code. **`MONSTER_TYPES` in `js/level.js` is the one list of monsters**: a new monster goes there (with `name`, `roams`, `art`, `role`, `pitch` and, since v16.1, `about` - the check fails without it), and the editor, the loader and `makeEnemy` all pick it up; a Warden variant needs a `label` and a `pitch` in `js/warden.js` `VARIANTS`. **The saved format is written down in `docs/level-format.md`** - change it and `js/levelformat.js` together, never one without the other. All three parts are built (v15.0, v15.1, v15.3). **Sharing is codes only (v15.3): no network calls, no server, no accounts, ever, for version 1 codes** - a code holds the level itself. **A code holds only level content, titles and the optional creator name** - never an id, a date, a folder of the player's or any save data (`tools/share-test.js` authors / noWrites prove it); **every decoded code is untrusted** (`EchoShare.decode`: caps first, then `normalise` + `EchoLevelCheck`; text from a code only ever set with `textContent`); **imports are all or nothing** (`importShared`); **the WORDS lists in js/sharecode.js are frozen for format 1 - only add to their ends**, and anything that changes what a code means needs a new format version (and a resolver: `EchoShare.register`). Since v15.1: **every read of the way out goes through `exitsOf()`** in game.js (a custom level has `level.exits`, up to 8; every other level has `level.exit` alone, and the code it runs is unchanged); **a custom level's difficulty is its own** (`customConfig(difficulty)`, the player's title-screen mode is not read - see v15.1); **effect zones are drawing only, clipped to the player's line of sight, under the ripples, and never draw a monster, object or way out** (js/effects.js); **a custom note is read through the lore reader and nothing about it is kept**; **folders are never inside a level** (js/levelstore.js keeps them in `echomaze.folders`); and **editor text names a monster; what a monster DOES is said only by its description** (v16.1: the `about` beside its definition, shown in the editor's monster panel, the inspector and to a screen reader - nowhere else in the game; the checker's words still only say where, e.g. the hunter check says "too close to the way out"). Since v15.2: **the bonus levels are data** (`js/bonus-levels.js`, schema 2, read through the same loader and checker as everything else - add one by adding an entry, then prove it can be finished with `tools/bonus-test.js` routes); **they are read-only** (the store's `bonus` source refuses to save, delete or duplicate, `local` refuses their ids, the editor refuses them - the player gets a copy); **they are not the campaign** (played as custom levels, `scored()` false); and **their one write is the Done tick**, in its own key (`echomaze.bonus`), only when one is finished from Bonus Levels.
- **Unreleased content** (v15.7): `UNRELEASED_CONTENT` in `js/level.js` is the ONE list of things in the game's files that are not in the campaign yet (today: `'alarm'`, `'screecho'`). While it is not empty the level editor shows its unreleased-content warning EVERY time it is opened from the title (`openEditorScreens`: spoiler warning once -> this one every time -> the touch warning when touch is on; never when moving about inside the editor's screens or coming back from a test play), and the editor tags each monster in it "Unreleased" (`monsterChoices().unreleased`). **To release them, empty the list** - the warning and the tags go with it and nothing else needs to change (then give the monsters a place in the campaign, a legend entry and a How to play line). Nothing in the campaign, the tutorial, levels 13-16 or the bonus levels may use anything in the list; `tools/monster-test.js` `campaign()` checks. **Exception (v18.0, owner's brief): the Alarm is in the story from level 22**, while the owner asked for its editor behaviour to stay exactly as it was - so it is still in the list (tagged Unreleased in the editor); see v18.0.
- **Lore fragments** (`js/lore.js`, v13.0; on 13-16 since v16.2, placed by hand with `at` - the same CHANCE roll, nothing else about those levels read or moved) are the one thing added TO levels 1-12 since they were built, at the owner's request. They must stay unable to move anything else: placed AFTER `generateLevel` from their own random stream, never drawing from the generator's sequence or `Math.random`, never blocking movement or a ripple, never read by anything that decides an outcome. **Prove it after any change near them** with `tools/generator-fingerprint.js` (`9097b344` as of v13.0) and `tools/identity-test.js` runs that use `visit`/`at` so a fragment is really read.

## Ripple range (owner's request; tools will build on it later)

- A ripple has a **hard, limited reach** measured from **where the player stood when they sent it** (not the player's live position afterwards). Nothing farther is lit up, echoes or is alerted; an object counts if any part of it (its radius) is inside the range. It used to be 360-770 px, which on the small early levels (level 1 is only 600x440 px) lit the whole maze and ran off screen, so it felt infinite. Now: `max(RIPPLE_RANGE_BASE 360 - RIPPLE_RANGE_PER_LEVEL 9 * level, RIPPLE_RANGE_MIN 240) * MODES[mode].ripple` (constants in `js/level.js`, result in `levelConfig().rippleRadius`), e.g. Normal 362 px on level 1 down to 306 px on level 7; Easy 421 -> 356; Hard 309 -> 261; Hardcore 298 -> 252. Keep it about what fits on screen around the player (half the screen height is ~310 px at 1000x620).
- The player's ripple is sent with `rippleRange()` in `js/game.js` (currently just `cfg.rippleRadius`) -> `castRipple(ox, oy, R)`. **That is the one place tools/upgrades that extend or change ripple range should hook in** (the owner plans tools). `castRipple`'s third argument defaults to `cfg.rippleRadius`, which is what the cutscenes use.
- The intro cutscene's ripples use their own scripted radii (430 and 300 px on its hand-built stage, in `js/cutscene.js`), separate from the game's range.

## Crouching (owner's design, v8.0 - works in every mode, on every level)

Owner's brief: hold **Shift** to crouch (not Ctrl - Ctrl+W closes the tab). Same speed as walking. While crouching: no footstep sound, no ripples, and the HUD shows "Crouching" (`#hud-crouch`). **The instant you start crouching, all ripple information is removed and standing up does not bring it back.** Implementation (`js/game.js`):
- `crouchHeld()` = `ShiftLeft`/`ShiftRight` held; `syncCrouch()` keeps `player.crouching` in line with it, called every frame at the top of `updatePlay` AND straight from the Shift keydown so the wipe is that very instant. `emitRipple` refuses while `crouchHeld()` (it checks the key, not the flag, so Shift+Space in one frame cannot slip a ripple out). It is a no-op on every screen except `state === 'play'` (that is the only screen where you move).
- `startCrouch()` wipes: `ripples = []` (in-flight waves AND their not-yet-played echo events, so those sounds are cancelled - they are played only from `rp.echoes` in `updateRipples`) and `marks = []` (every timed mark: bump marks, puddle/decoy/monster reveals, the puddle-step flash) and sets `glimmerOff`. (v10.0: only the PLAYER's own waves and marks are wiped - a singer's waves (`rp.singer`, `m.singer`) survive, because crouching must not protect you from its song.) Tested: with a puddle in view, 3 marks -> 0 and 23 later echo sounds -> 0, versus the same run without crouching.
- **The exit glimmer** is a proximity glow drawn every frame (not a stored mark), so "removing it and not bringing it back" is the flag `glimmerOff`: set by `startCrouch`, cleared only by the next ripple you actually send (and by `startLevel`). It gates `glimmerExit()` in `drawWorld`, which draws the real exit AND every disguised mimic - it MUST stay one shared function, or crouching would show which glow is the fake. (My reading of "the exit glimmer ... standing up does not bring it back": hidden until your next ripple. The puddle and decoy proximity glimmers are NOT touched - the owner only named the exit's.)
- Footsteps: while crouched, the 30px stride event does not call `audio.footstep` or `hearFootstep`. Bumping a wall still plays the bump sound and leaves its small mark (that is feeling the wall, not a footstep; no monster hears bumps) - my call, flagged. Smell/trails/puddles work as normal while crouched.
- Visuals: the player dot is smaller and dimmer while crouched; the HUD word is brighter than the rest.
- Title how-to, legend, note and the pause screen all mention it (the pause screen got a small controls list).
- `?debug`: `__echo.crouch()` returns `{ crouching, glimmerOff, held }`, `__echo.marks()` the timed marks.

## The stalker (level 10+) (owner's design, v8.0)

Owner's brief: a new orange enemy that **ignores ripples, echoes and the sonar decoy** ("a ripple can reveal it, but it learns nothing"). It hears you two ways, **both only when you are NOT crouching and both at all times (no listening window)**: **footsteps** (while you are moving, within `footstepRadius` = the MODES `hear` value) and **presence** (while you are standing, even completely still, within the smaller `presenceRadius`: **Easy 60, Normal 75, Hard 90, Hardcore 100**, a value in every `MODES` entry in `js/level.js`, always smaller than that mode's `hear` - `levelConfig` clamps it to `hear - 1` and `level.js` warns at load if a mode breaks it). Crouching silences both. A presence hit counts as a footstep: it walks to the **exact spot it heard you**, keeps updating the spot while it keeps hearing you, and **loses you if nothing is heard for 3 s** (`STALKER_LOSE_SECONDS`). When it hears nothing it **patrols to random tiles at a steady pace** (no waiting about, so a corner does not work). Speed = **0.95 x an echo monster's** (`cfg.stalkerSpeed = min(enemySpeed * 0.95, 169)`, always < 170). Touching it kills. Own voice: soft clicks and breathing, no growl; own footsteps; legend colour orange.

Implementation:
- `kind: 'stalker'`, `T_STALKER = 8` (`COLORS[8]` = `255,116,16`; `NRAYTYPES` 9 - ray types 6/7 are the flat puddle/decoy marks and never appear as rays). In `castRipple` it is a circle typed `T_STALKER`, so a ripple shows it in orange with `audio.echoStalker`; `touchMonsters` only handles echo/mimic so it is never alerted. (`callMonsters` DID skip it until v11.1; a decoy lures it now).
- `stalkersListen(walked)` runs every frame after the player has moved (before `updateEnemy`): if not `player.crouching`, a stalker hears you when `d <= presenceRadius || (walked && d <= footstepRadius)`. `walked` is the same "really moved > 0.3px this frame" flag the smell uses (pushing into a wall = not moving). Distances are straight-line, through walls, like every monster's hearing (so a wall between two corridors does not save you inside the radius; in the real maze it then walks the long way round and often gives up after 3 s before arriving - that is the rule working, not a bug).
- `stalkerHeard` sets `state 'hunt'`, `heardX/heardY` = the player's position right now, `deaf = 0`; `updateStalker` adds dt to `deaf`, drops back to `patrol` at 3 s (even mid-route), and repaths (max every 0.15 s) only when the spot changed. At the spot it just waits until the 3 s are up. **One steady speed for patrolling and hunting** (my reading of "steady pace" and "Speed = 0.95 x"; if the owner wants a slower patrol, it is one multiplier in `updateStalker`). `stalkerPatrol` = `randomNearbyTile(e, 12)` with no pause.
- Level 10 in `js/level.js`: `ECHO_MONSTERS[10] = 0`, `SCENT_MONSTERS[10] = 1`, no `MIMIC_MONSTERS[10]` (v9.0: the owner removed the mimic from level 10), `STALKER_MONSTERS[10] = 1`; `generateLevel` step 11 places stalkers LAST and draws nothing when there are none, so levels 1-9 generate byte-identically to v7.1 (checked: 900 combinations of level x seed x mode identical old vs new, configs unchanged). It has a sonar decoy too (every level from 9); the decoy just does nothing to the stalker.
- Audio (`js/audio.js`): `_stalkerVoice` (breathing = band-passed noise swelling with a slow LFO + a faint high rattle, via `createEnemyVoice(pitch, 'stalker')`; `updateEnemyVoice` has a stalker branch), `stalkerStep` (soft pit-pat), `stalkerClick`, `stalkerAlert` (sharp breath in + two clicks; quiet, not a screech), `echoStalker`. `enemyAudio(e, moved, dt)` takes dt now for the click timer.

## v9.0: Visual cues, wall muffling + Doppler, touch controls (owner's brief; ONE update, MAJOR)

**Golden rules from the brief - keep them:** none of the three may change gameplay, difficulty, monster behaviour or the simulation; keyboard play and the desktop look stay exactly as they were; everything works in every mode, in calm mode, with sound muted, from `file://` with no build step; and cues must never reveal hidden information (only what the matching sound gives: direction, rough loudness, type, timing). **The proof is a test, keep running it after any change to these files:** with `?debug`, `__echo.features({cues, touch, audioFx})` off vs on, the same `seed()`, the same scripted inputs and the same random numbers, every enemy position / state / timer and the player must be IDENTICAL frame for frame (v9.0: 16 runs over levels 5/8/9/10 x all four modes, plus calm-mode runs, all identical; and the harness can fail: a different random stream differs). Technique: stub `Math.random` with TWO seeded streams and pick by `new Error().stack.includes('audio.js')`, because the audio engine's `_busy()` polyphony limit depends on wall-clock time and so changes how many random numbers audio consumes; snapshot `info()` every 10 frames. **Nothing new may call `Math.random`** (cues.js, touch.js, the muffling/Doppler code all avoid it).

### Visual cues (accessibility) - `js/cues.js`, hooked in `js/game.js`
- Option like calm mode: checkbox on the title screen and in the pause menu (`.cues-toggle`, kept in step by `refreshOptionUi()`), the **V** key on every screen (`setVisualCues`), saved in `localStorage` `echomaze.visualcues` (through `store`, which wraps every access in try/catch - tested with storage that throws), and a **"Visual cues" tag in the HUD** (`updateHud`). `body.cues-on` shows the shapes legend (`.cue-legend`) on the title screen, which is hidden while the option is off so the default desktop title is unchanged.
- The game only tells the module what sounded and where: `cues.pulse(kind, x, y, loud, {key, sub, big, dots, muffled})` for one-shots (rate-limited per source+sub to one per `MIN_GAP` = 0.34 s, so **never above 3 a second** - a chasing monster steps ~6 times a second but pulses the cue at most 3; the decoy's beeps speed up past 3 a second and are thinned the same way), `cues.hold(key, kind, x, y, loud, muffled, dots)` every frame for a sustained voice (fades in/out by itself), `cues.heartbeat(strength)`, `cues.caption(text)`, `cues.update(dt, px, py)` (end of `updatePlay`, before the outcomes), `cues.draw(px, py, 1/viewScale)` (in `drawWorld`, after the player), `cues.clear()` (new level, caught, complete, title, cutscene). The module reads nothing from the game and the game reads nothing back.
- **Same audibility as the audio, by construction:** each call sits next to the audio call and uses the same `spatial()` gain: a voice cue shows while its gain `>= 0.012`, steps/alerts while `sp.g >= 0.01`, the chime while `sp.g > 0.015` within 620px, decoy blips `> 0.02`, decoy ticks/call always (the audio floors them). Calm mode's audio scaling (x0.35 alerts etc.) is deliberately NOT applied to cues ("calm must not weaken them"; peak brightness is identical in calm, only the fade is slower). `cueLoud(g) = sqrt(g)` maps loudness to size/brightness.
- Shapes (distinct shape AND colour; restyled in v9.1 to echo the art in `js/art.js`): echo = red SPIKY diamond (a diamond with a spike on each side); scent = violet round glyph with a wavy edge and a bubble; stalker = orange tall thin capsules, upright, in a row (1 click, 2 step, 3 breathing, 5 alert); exit + mimic chime = green chevron with a short ring arc behind it; decoy = pink four-point star in a ring; heartbeat = thin ring around the player. (The title's `.cue-legend` SVGs must match `glyph()` in `js/cues.js`.) Glyphs sit on a 45px (screen px, so `unit = 1/viewScale`) ring pointing at the source; crowded ones are fanned apart by size (`MIN_SEPARATION` + `(sizeA+sizeB)*1.2/RING`); a cue at the player's own feet (the decoy drop) points the way they last moved.
- **The mimic / exit tell:** both go through the ONE function `chime(x, y)` in `game.js` (sound + cue + muffling), so a disguised mimic's cue is byte-for-byte the exit's cue (tested: same beacon args, same alpha, muffled or clear, and only `exit` cues from a disguised mimic). Never give the mimic its own code path.
- Screech / alert captions: `[monster screech]`, `[snorting]`, `[sharp breath, clicks]`, `[the exit snarls]` (mimic reveal), `[sonar decoy calls out]`, in `#cue-caption`. **Cutscenes** get `[sound captions]` (`#cs-fx`, `fx()` in `cutscene.js`, only when `env.visualCues()`), one per sound the scene plays (`fxs(...)` lists at the end of each `build*`); text only, so it fades and never flashes.
- **Heartbeat in calm mode:** calm removes the heartbeat SOUND (and red creep), but the ring is still shown (own timer `cueBeatTimer`), because calm must not weaken the cues. My reading; flagged to the owner.
- Extra sounds I gave cues that the brief did not list (each has a real sound): scent and stalker alerts (bigger cue + caption), stalker footsteps, the mimic reveal snarl, the floor decoy's blip.

### Wall muffling + Doppler (audio only) - `js/audio.js`, `enemyAudio` / `chime` in `game.js`
- `soundBlocked(x0,y0,x1,y1)` = the game's own `hasLOS` (DDA over the tile grid) + `rayCircle` against `level.obstacles`. No new raycast system. Called every frame per monster (voice + steps) and at each chime.
- Continuous voices (`createEnemyVoice` / `_stalkerVoice`) now route `out -> mf (low-pass, wide open) -> mfg (gain) -> pan -> master`; `setMuffle(v, blocked)` fades `mf.frequency` to `MUFFLE_HZ` = 600 and `mfg.gain` to `MUFFLE_GAIN` = 0.8 (else back to 16 kHz / 1) with `setTargetAtTime` and `MUFFLE_FADE` = 0.1 s. One-shots (`enemyStep`, `scentStep`, `stalkerStep`, `stalkerClick`, `beacon`) take a trailing `muffled` flag and pass their nodes through `_muffle()` (a fresh low-pass + gain whose `.value` is set explicitly - the GainNode-at-1.0 gotcha - so nothing clicks). Two levels only. The old ad-hoc `muffle`/`occluded` hack in `updateEnemyVoice` (low-pass x0.55, gain x0.6, walls only) was REPLACED by this (the parameter is still called `muffle`; cutscenes pass false). Screeches/alerts are not muffled (they are warnings).
- Doppler: `enemyAudio` keeps `e.aDist` / `e.aVr` (smoothed rate of change of the distance to the player, `DOPPLER_SMOOTH` 0.12 s; the player's own movement counts too) and passes `doppler = 1 - 0.06 * clamp(aVr / 180, -1, 1)` (`DOPPLER_MAX`, `DOPPLER_FULL_SPEED`) to `updateEnemyVoice`: it multiplies the oscillators' frequency (echo/scent) or the band-pass centre (the stalker's breath is noise - my adaptation). Approaching 120 px/s = 1.04, leaving = 0.96, still / orbiting at a steady distance = 1.00, clamped 0.94..1.06 (tested). Voices only, never one-shots.
- `audioFx` (default `true`) is a ?debug-only kill switch for the identity test; it is not a user setting.

### Touch controls - `js/touch.js`, hooked in `js/game.js`, `#touch` in `index.html`, `body.touch` CSS
- On when `matchMedia('(pointer: coarse)')` or after the first real touch (`pointerdown` with `pointerType: 'touch'`), unless `echomaze.touch` is `'0'`; `'1'` forces it on (the **Touch controls** checkbox in the pause menu, both keyboard and touch layouts, writes it). `refreshTouchMode()` sets `touchOn` and `body.touch`; the game itself does not depend on it except for the input merge below, the HUD word ("ITEM" instead of "E"), the vibration and portrait pause.
- Joystick: touch anywhere in the left half (`#touch-zone`), it floats to where the finger lands; radius `clamp(min(W,H)*0.16, 44, 78)`; dead zone 0.12, full speed at 0.88 of the radius; **analog** - speed is proportional up to `WALK_SPEED` = 170, a diagonal never exceeds 170 (tested: full push = 170 px in 1 s, half = 85). In `updatePlay` a held movement KEY wins (its arithmetic is unchanged: `(ix/len)*WALK_SPEED*dt`, so keyboard play is bit-identical); otherwise the stick's vector is used.
- Buttons (right side): RIPPLE (`emitRipple()`, same cooldown as Space, drawn as a clock via `--p`), CROUCH (hold = `crouchHeld()`, and it calls `syncCrouch()` on press so the wipe is instant), pause, and **ITEM (my addition, only shown while carrying a decoy - there is no E key on a phone)**. All on Pointer Events with `setPointerCapture` (wrapped in try/catch) so several fingers work; each control is released on `pointerup`, `pointercancel`, `lostpointercapture`, a window-level `pointerup`/`pointercancel` backup, window `blur`, `visibilitychange`, and `releaseAll()` whenever the game leaves the play screen (`pause`, `onCaught`, `onLevelComplete`, `startCutscene`, layer hidden). Tested each of those.
- Page: viewport meta has `maximum-scale=1, user-scalable=no, viewport-fit=cover`; `touch-action: none` on `body.touch`, canvas, `.overlay`, `#touch`; panels use `touch-action: pan-y` so menus still scroll; a `gesturestart` and a non-passive `touchmove` handler stop pinch / rubber-band while playing. The AudioContext still starts only from a real tap on a button (Begin etc.).
- Layout: in landscape everything scales (`viewScale` for the canvas; `vmin`-based button sizes). On a short landscape screen (`max-height: 560px`) the menus tighten and the main action row (`.buttons.dock`: Begin/Continue, Resume/Quit) is `position: sticky` at the bottom of the scrolling panel. (A first try with CSS columns overflowed sideways - columns cannot grow past the panel's max-height - so do not use `column-count` here.) In portrait `body.touch #rotate` (a friendly "turn your device sideways" screen) covers everything and a game in progress is paused (`frame()`).
- Every button on every screen is >= 44 px tall in touch mode (`body.touch button { min-height: 48px }`, `.mode` / `.scene` 56, labels, slider) - measured on title, replay, pause, caught, complete, victory and the in-game buttons. In a cutscene a tap anywhere skips (`body.touch #cutscene { pointer-events: auto }`, only in touch mode, so desktop clicks do not skip; `skip()` keeps its 0.6 s guard) and the Skip button is 48px. The pause menu's `.pause-toggles` (Sound / Calm mode / Visual cues, `#pbtn-*`) are `touch-only` and stand in for M / C / V; `.kb-only` / `.touch-only` swap the how-to on the title and pause screens (desktop shows the keyboard one exactly as before, plus the `V` key).
- Vibration on being caught: `navigator.vibrate([90, 50, 160])` only in touch mode, never in calm mode, in try/catch.
- Testing in the built-in browser: `resize_window` with a width under 768 (e.g. 740x360 landscape, or preset `mobile` 375x812 portrait) turns on real mobile emulation (`pointer: coarse`, touch points, an Android UA) so touch mode switches on by itself; reset with preset `desktop`. Synthetic `PointerEvent`s (with `pointerType: 'touch'`) drive the controls. The pane only runs animation frames while a screenshot is being taken, so things that update in `frame()` (showing/hiding the touch layer, portrait pause) appear after a screenshot; call `__echo.step()` for the simulation.

## v9.1: how things look - `js/art.js` (owner's brief, MINOR, visual only - with ONE deliberate exception)

Owner's problem: enemies and objects were hard to tell apart when a ripple lit them up. Brief: give each a clearer SHAPE and some TEXTURE (not just colour - colour-blind players), Canvas 2D only, no images, works from `file://`, drawn at TRUE collision size, animation never uses `mulberry32` or touches the simulation, cheap in level 10. **Keep the identity test passing (see below): this update must not change hitboxes, behaviour, speeds, difficulty or the simulation.**

**`js/art.js` = `EchoArt`** (loaded after `level.js`, before `cutscene.js`): `EchoArt.draw(ctx, kind, x, y, r, o)` draws one thing inside a circle of radius `r` (the caller sets the composite mode; the game uses `'lighter'`), `EchoArt.mimicMorph(ctx, x, y, r, p, o)` the exit -> echo-monster cross-fade (p 0..1; `EchoArt.MORPH_SECONDS` = 0.3), `EchoArt.wallTexture(x1,y1,x2,y2,rx,ry,out)`, `EchoArt.seedOf(x, y)` (position hash), `EchoArt.obstacleKind(x, y)` (`'boulder'` or `'pillar'` from the position hash - the level data does not say and the generator's random numbers are NOT touched, so levels are byte-identical), `EchoArt.RGB` / `CORE`. Options `o`: `a` brightness, `t` clock (s), `h` heading, `seed`, `tell`, `walking`, `listening`. Kinds: `echo` (jagged star body, V mouth, ribs, no eyes - facing +x), `scent` (wobbling wavy blob + drips + bubbles), `stalker` (thin body, tiny blind head, feelers, 6 jointed limbs), `boulder` (irregular rock + cracks, per-seed), `pillar` (circle + ring + fluting), `puddle` (glossy blob per-seed + shine, bubbles, ripple), `decoy` (box, dial, antenna, ring), `exit` (concentric rings, slowly rotating arc, doorway, sparkles), `wall` (legend sample). Everything is a fixed function of a seed and the clock; the private xorshift in `art.js` is NOT the game's random numbers and nothing calls `Math.random` (the identity test counts calls from `art.js` and it is 0).

Where it is used (`js/game.js`):
- `castRipple` records `rp.objs` (`{c, dmin, n}` per round thing the wave's rays hit; circles now carry `mimic: true` for a mimic); only the art reads it. `drawRipple` -> `drawLit(rp, ob, a)` draws each thing once the wavefront has reached it (`r >= dmin`), fading like the rays (`exp(-age/1.3)`), brightness scaled by how many rays hit (`0.4 + n/10`). The old collision-circle ray arcs are still drawn under it (a little thinner: `LINE_W` 2.1-2.5 for obstacle/echo/exit/scent/stalker) - they trace the true collision circle. Monsters face the ripple's origin (`h = atan2(rp.y - c.y, rp.x - c.x)`), NEVER their real heading (that would leak what they are doing). Puddles and decoys are the flat `marks` (`m.art`, `m.ar` = true radius); a monster that walks into the wave after the ping gets a mark with `art: 'echo'`.
- Walls: `EchoArt.wallTexture` is called for connected wall ray pairs in `drawRipple` and adds stone joints (fixed places on the wall, every 17px, two joints in five, seam 3-5px into the wall) and the odd jagged crack into `texBuckets` (stroked with the alpha bucket). Fixed positions, so the texture stays put from ping to ping. Subtle by design.
- Glimmers (`drawWorld`): `glimmerExit(x, y, r, tell)` draws the glow AND the exit portal art (alpha = `(1 - d/130) * 0.95`); the puddle and decoy glimmers draw their art too. `artT` (set in `frame()` from the rAF time; `artHold` via `__echo.artClock(t)`) is the art's clock.
- Title legend: `#legend` swatches are `<canvas class="swatch" data-art=...>` filled by `drawLegend()` (called once after `resize()`). The disguised mimic is not in it. NOTE the generic `canvas { position: fixed }` rule is now `#game { ... }` (and `body.touch #game`) - any other canvas is an ordinary element.
- Cutscenes (`js/cutscene.js`): `drawEchoBody` / `drawScentBody` / `drawStalkerBody` are now thin wrappers over `EchoArt.draw` (`ECHO_R` 34, `SCENT_R` 30, `STALKER_R` 44 - the game draws them at 14; a cutscene shows them bigger), the scent scene's puddle, the decoy scene's decoy and the mimic scene's "exit" portal (`MIMIC_R`) use the art too; the mimic scene morphs with `EchoArt.mimicMorph` for `MORPH_SECONDS` after `MM_TOUCH_T`. (The cutscene's mimic may look different from the exit - the owner allowed that; it uses `tell: none`.)
- Cues: the `glyph()` shapes were restyled to match (see Visual cues). The mimic's cue is still exactly the exit's (`chime()`), in every mode.

**The mimic (owner's design) - THE ONE VISUAL THAT DIFFERS BY MODE, a deliberate exception to "visual only":** `mimicTell` in every `MODES` entry (`js/level.js`; `level.js` warns at load if a value is not `'none' | 'subtle' | 'clear'`): Easy `clear`, Normal `subtle`, Hard and Hardcore `none`. A disguised mimic is drawn by the SAME `EchoArt` 'exit' code as the real exit - `glimmerExit` is one shared function (like the sound: never give the mimic its own draw path), and `drawLit` draws a lit unrevealed mimic circle (`c.mimic && c.revealAt === undefined`) as `'exit'` with `tell = MODES[mode].mimicTell`. `tell` only changes the outer ring and the clock: `clear` = a slow flicker (alpha x 0.6-1.0 at ~1.9 Hz, never a flash) and an uneven, slightly yellower ring (`166,255,96`, radius wobble 0.085); `subtle` = ring wobble 0.03 and the rotation 1.16x; `none` = nothing (identical calls). **Verified pixel for pixel:** render the real exit at P with the mimic parked far away, then the mimic at P with the exit parked away, same camera and `artClock` -> Hard/Hardcore 0 differing pixels, Normal ~5,000, Easy ~16,500 (in a 1280x720 canvas at 3x zoom). It changes nothing but how the disguised mimic is DRAWN: its sound, size (`EXIT_R`), speed, behaviour and Visual cue are the same in every mode. Revealed: `revealMimic` sets `c.revealAt = artT` on every in-flight ripple circle of that monster; `drawLit` then draws `mimicMorph(..., (artT - revealAt) / 0.3)` (a smooth cross-fade, portal grows a little as it fades, monster grows into its size), so its lit art is the echo monster (red) from the moment the wave lights it and it is never a steady exit again; a ripple sent after that sees `T_ENEMY` (plain echo art). My reading of "from the moment its echo returns to the player": the art is the monster from the moment the ripple lights it (the exit look only exists for the 0.3 s morph the owner asked for). Not in the legend; the README tells the player only that how well it hides depends on the mode.

**The identity test (run it after ANY change to art/drawing):** `tools/identity-test.js` (load into a `?debug` page, in BOTH the old and the new build; cross-origin `<script src>` works for that) runs a seeded, scripted game (movement, pings, crouching, decoy drops, optional forced mimic reveal `reveal: N`, optional `cues`, `noArt`) with `Math.random` stubbed by two seeded streams (game / `audio.js`, see v9.0), draws every 3rd frame, and fingerprints the player and every enemy's kind/position/state/timer after every step. v9.1 result: v9.0 vs the new build - 32 runs (levels 4/8/9/10 x 4 modes x 2 seeds, 1500 frames) and 24 forced-reveal runs (levels 8/9 x 4 modes x 3 seeds; 21 of them turned a mimic) all IDENTICAL; `artRandomCalls` 0; and with `noArt: true` (the art stubbed out) the same hashes again. `tools/perf-bench.js`: busiest scene (level 10 stalker + scent + 4 obstacles + 2 puddles lit by 3 ripples) ~6.2 ms/frame vs ~5 ms for v9.0 at 1280x720 in the software-rendered test browser (so about +1 ms). `tools/art-sheet.html` shows every shape large and at true size, the exit beside a mimic in each mode, and the morph (`?t=1.3` freezes the clock, `?crop=x,y,w,h` fits part of it to the window); `tools/stage.js` stages a scene in a real level (`Stage.stage(mode, level, seed)`, `Stage.ping`, `Stage.snap`) for screenshots.

Lessons: the built-in pane's first screenshot after a page change often times out or is stale - take a second one; `zoom` action is not supported (magnify inside the page instead: `__echo.zoom(v)`); a top-level `const` (e.g. `EchoArt`) is NOT a `window` property (reach it by name); a `canvas { position: fixed }` element rule silently hijacks any new `<canvas>` you add.

## v10.0: the Muffler (level 11), the Singer (level 12), 12 levels (owner's brief, MAJOR)

Owner's brief (kept close to their words): two new monsters and a 12-level campaign; **must NOT change generated mazes or existing monsters' spawns on levels 1-9** (same seed = identical maze in every mode); every new monster **stays slower than 170 px/s**; existing monsters' design rules unchanged; ONE new threat per level; at most 3 monsters at a time; first attempt should take about 1-3 minutes.

**Schedule (the tables in `js/level.js`; Easy via `MODE_MONSTERS`)** - Normal/Hard/Hardcore: echo 0,1,1,2,2,0,1,1,0,0,**1,1**; scent 0,0,0,0,0,1,1,1,2,1,**0,0**; mimic 8-9; stalker 10; **muffler 11; singer 12**. Easy is the same for 1-8, then level 9 = 1 scent + 1 mimic, 10 = 1 stalker, **11 = 1 muffler only, 12 = 1 singer only**. `CAMPAIGN_LEVELS` = 12; `SCENE_BEFORE_LEVEL` 11 -> 'muffler', 12 -> 'singer'; hints 9-12 rewritten (level 9's does not spoil the mimic). Old saves that finished the 10-level game now Continue at level 11 and play the muffler scene first (v7.1 catch-up rule).

**Generation (nothing before level 11 moved):** the muffler and singer are placed LAST (steps 12/13) and draw nothing on levels without one. Their spawn: `dS >= minStart` (`min(8 + n/2, 16)` path tiles from the start), away from other monsters (`tooClose`, 8/5/2/0 fallback), and `routeSafe` - with the tile blocked the exit must still be reachable from the start (falls back to ignoring that only if nothing qualifies). Audited over 200 seeds x 4 modes x 2 levels = 1,600 spawns: 0 start-distance violations, 0 route-cutting tiles, 0 within 2 tiles of another monster. The first echo monster on levels 11/12 is a guardian 4-10 path tiles from the exit as always. **Level 9's puddle cap (6, `PUDDLE_CAP`):** the generator still DRAWS `cfg.puddlesDrawn` puddles (so every random number after them is unchanged) and keeps the first `cfg.puddles`; the decoy is placed as if none were dropped. Verified against v9.2 over 40 seeds x levels 1-10 x 4 modes: everything (mazes, monsters incl. pitch, puddles, decoy) byte-identical except Hard/Hardcore level 9 puddles (8 -> 6). (v10.0 kept the puddle formula on levels 11-12 - 5/8/10/11 and 5/9/12/13 by mode - although no scent monster is there, flagged to the owner; **v10.1 removed those puddles, see "v10.1" below**.)

**The maze table the owner gave (sizes / loops / rooms / obstacles / cooldown) matched the code exactly; the RIPPLE RANGE column did not.** Code: `max(360 - 9n, 240) x mode.ripple` = 351 (L1) ... 252 (L12) before the mode multiplier; the owner's table said 616 ... 360 (`640 - 24n`, floor 360), which is NOT the game's formula (the range was deliberately halved in v5.4 at their request). The owner said "tell me instead of silently changing it", so it was NOT changed and was reported. If they do want it, it is `RIPPLE_RANGE_BASE` / `_PER_LEVEL` / `_MIN` in `level.js` - but that changes every existing level.

### Balance snapshot (200 seeds per row; path = BFS tiles start -> exit around obstacles, identical in every mode; seconds = tiles x 40 px / 170 px/s of pure walking)
Level (maze cells): avg path tiles / walking seconds - 1 (7x5): 31.1 / 7 - 2 (8x6): 34.2 / 8 - 3 (9x7): 40.1 / 9 - 4 (10x8): 41.7 / 10 - 5 (11x9): 47.8 / 11 - 6 (12x9): 47.4 / 11 - 7 (13x10): 51.5 / 12 - 8 (14x11): 54.1 / 13 - 9 (15x12): 57.0 / 13 - 10 (16x13): 60.8 / 14 - 11 (17x13): 64.2 / 15 - 12 (18x14): 66.9 / 16. Average puddles by mode (Easy/Normal/Hard/Hardcore): L6 2/3/4/4, L7 2/4/5/6, L8 3/5/7/7, L9 4/6/6/6, L10 0/7/9/10 (Easy has no scent monster there), L11 0, L12 0 (v10.1: no puddles where the mode has no scent monster; v10.0 had L10 4 on Easy, L11 5/8/10/11, L12 5/9/12/13). Path length grows smoothly; only 5 -> 6 is flat (47.8 -> 47.4). Pure walking time is far below the 1-3 minute target (it is the pinging, listening and hiding that takes the time) - NOT playtested, reported to the owner.
**Mimic audit (levels 8-9, the v10.0 spawns, NOT changed in v10.0 because levels 1-9 had to stay identical; v10.1 then changed them on purpose - see "v10.1"):** of 800 mimics per level, 0 sit under 6 path tiles from the exit, but ~1% sit on a tile the only route passes through, and ~89% (L8) / ~81% (L9) are in a corridor rather than "a room or dead end" (crude test: >= 6 open neighbours of 8, or <= 1 open orthogonal neighbour). The owner's rule for the mimic could only be honoured by moving existing spawns; reported instead.

### The Muffler (`kind: 'muffler'`, never drawn; `js/game.js`: `castRipple`, `mufflersListen`, `updateMuffler`, `mufflerPatrol`)
- **Absorbs ripples:** in `castRipple` a muffler adds an `absorb: true` circle; a ray whose nearest hit is one ends there with `type 0` and no `hitId` - so no colour, no echo event, never in `rp.objs`, and everything behind it is in shadow (other circles behind it are never the nearest hit; flats - puddles and decoys - are shadowed by `shadowed()`; `waveReaches` already treats every other monster as a blocker, so an echo monster behind it is not alerted). The gap in the wavefront/echo map is the only tell (owner: "do not add any other reveal"). It absorbs the Singer's waves through the same function. `opts.absorbers` gives the cutscene the same effect without an enemy.
- **Not smelled, not alerted:** no code path targets it (`touchMonsters` only handles echo/mimic; scent code only looks at trails). It IS called by a sonar decoy since v11.1 - `callMonsters` no longer skips any kind.
- **Hearing** (values are in `MODES` with the prefix `muffler...` because `hear` / `presenceRadius` already belong to the stalker): standing up: footsteps (while `walked`) within `mufflerFootstepRadius`, standing within `mufflerPresenceRadius`; crouched: only a crouched MOVE within `mufflerCrouchRadius`, crouched standing never. Straight-line, through walls; no listening window. Hunt -> exact spot, refreshed while heard; `deaf` counts to `mufflerMemorySeconds`, then patrol (targets: 6 random tiles, the one nearest the last heard spot 65% of the time). Speed `min((70 + 8n) x speed x 1.05, 160)`. Verified per mode with 1-px distance scans: boundaries equal the config values (Easy 75/125/30 ... Hardcore 125/198/55), crouched-still is never heard, memory ends exactly at the configured seconds.
- Voice `_mufflerVoice` (low sines + soft triangle through a 170 Hz low-pass, slow swell) + slow thumps (`mufflerThump`, timed in `enemyAudio`, quicker while hunting) + `mufflerAlert`; same wall-muffling (`_voiceOut` -> `_muffleStage`) and Doppler as every voice. Heartbeat/danger: it counts like any non-mimic monster. Cue: `'muffler'` (pale hollow ring with a dash). Debug: `__echo.showMuffler(true)` draws it dimly (only place it is ever drawn). Title legend: a text-only `<li class="text-only">` line, no art.

### The Singer (`kind: 'singer'`; `updateSinger`, `singerSing`, `markPlayer`, `singerRippleHits`, `castRipple(..., { singer })`)
- Roams (`stalkerPatrol`, `cfg.singerSpeed` = 0.8 x `enemySpeed`) and every `singInterval` s calls `castRipple(x, y, singRange, { singer: e })`: the game's real ripple system with `rp.singer = e` - magenta (`SINGER_RGB`) wave, walls, boulders and art tinted, **no echo sounds** (its sung tone `audio.singerSing` plays from its position), its own body excluded, it never alerts or reveals anything (`updateRipples` calls `singerRippleHits`, not `touchMonsters`), and it lights monsters/exit/puddles as any ripple does (`T_SINGER = 9`, `NRAYTYPES` 10).
- **Hit test:** `singerRippleHits` - the wavefront passes over the player's CURRENT position within range and one of the rays inside the player's angular width reaches at least that far (`rp.dist[j] >= d - 1`), so walls, obstacles, other monsters and the Muffler shield you exactly as drawn. Crouching is irrelevant; and `startCrouch` now wipes only the player's own ripples/marks (`rp.singer` waves survive) - otherwise crouching would have deleted a wave in flight. First hit only (`rp.hitPlayer`).
- **Mark:** `state 'marked'`, `markX/markY` = the player's position at that instant, `timer = markSeconds`; `audio.markSting()` and ticks (`audio.markTick(prog)`, gaps `0.85 - 0.74 x prog`) - both NOT scaled by calm (grep `calm` in them: none) and not subject to the polyphony limit. It keeps roaming/singing during the countdown; hits are ignored unless `state === 'patrol'`. **Leap:** at zero `state 'leap'` (whoosh), position eased from the launch point to the marked spot over `SINGER_LEAP_SECONDS` = 0.6 s ignoring walls; landing sets the position EXACTLY on the spot, `singerLand` crash + small shake (not in calm), `singerLanded` if `hypot(player - spot) <= landRadius` (checked with the outcomes of `updatePlay`); touching it at any time kills (the normal catch loop, incl. mid-leap). `recover` 2 s (`SINGER_LAND_WAIT`), then patrol; singing resumes soon after.
- Verified per mode (all four): countdown = `markSeconds` (+1 frame), leap 36 frames = 0.60 s, landed exactly on the mark; 2 px outside `landRadius` (and clear of the flight path) not caught, 2 px inside caught by the landing alone, standing on the spot caught by touch mid-leap (0.47 s), crouching when the wave arrives still marks, calm mode leaves the countdown at the same length; obstacle / wall / out-of-range / Muffler between = no mark; a second wave during the countdown is ignored (1 sting); recover 2.0 s then it sings again; touching kills at once; deaf to walking, crouch-walking, pinging, standing and a dropped decoy beside it.
- **Its leap is faster than 170 px/s** (distance / 0.6 s); the "slower than 170" rule was applied to walking (patrol) speed - flagged to the owner. Marked-spot distance can reach `singRange` + a few seconds of patrol.
- Visual cues: `'singer'` (ring with three arcs) for the hum, sung tone, whoosh, landing; `cues.setMark(frac)` draws the shrinking magenta ring while marked (cues on only). Art: `EchoArt` 'singer' (slender body, wide ring mouth, three drifting song arcs). Title legend swatch.

### Cutscenes 6 and 7 (`buildMuffler` / `updateMufflerScene`, `buildSinger` / `updateSingerScene`)
`'muffler'` (Day 58, grey-white lamp; card "Some things swallow your echo."): one real ripple with `opts.absorbers` at the invisible muffler (its shadow gap), hum + thumps approaching, the explorer crouches and creeps, the thumps stop beside them, `mufflerAlert`, blackout, clank; closing card "You cannot see it. You can only hear it. / Crouching helps a lot. Stay still when it is close." The muffler is never drawn. `'singer'` (Day 66, violet-white lamp; card "Some things sing to find you."): a real magenta ripple (`opts.singer: true`) from the singer's far end reaches the explorer -> `markSting`, ticks from `sgTicks()` (the game's gap rule), they freeze a beat and run, the singer is drawn in the air during its 0.6 s leap (afterimages) and lands on the empty spot; card "If its song finds you, keep moving." Each ~19-22 s, skippable, tracked in `echomaze.seen`, in the replay screen ("Nothing Comes Back", "Keep Moving"); `[sound captions]` for each sound. Explorers stay unnamed and ungendered.

### Tests for this update (all in the browser via `?debug`, no node): staged scenes with `tools/stage.js`; `tools/identity-test.js` now has `chase: N` (teleports the player next to the muffler/singer so they meet; `newStates` counts frames per state). Results: v9.2 vs v10.0 scripted games (levels 3/5/8/9/10 x 4 modes x 2 seeds, incl. forced mimic reveals) fingerprints IDENTICAL, `artRandomCalls` 0; chase soak over levels 11-12 x 4 modes x 3 seeds (2,400 frames each): 196 catches, muffler hunted 10.7k frames, singer marked 3.5k / leaping 576 / recovering 1.6k frames, no exceptions; also with a live (muted) AudioContext, every new one-shot and voice constructed in both calm settings.

## v10.1: three balance fixes (owner's brief, MINOR; "do NOT change any maze layout, and do not change any other monster's spawn")

1. **Singer range** (`MODES.*.singRange` in `js/level.js`): Easy 270 / Normal 320 / Hard 320 / Hardcore 320 px (v10.0: 300 / 360 / 420 / 460, which reached up to 2x the player's ripple because the player's range SHRINKS by mode while this grew). Hard and Hardcore stay harder through `markSeconds`, `singInterval` and `landRadius` (unchanged). The load-time ordering check in `level.js` now requires `singRange` to be non-decreasing instead of strictly increasing. **The player's ripple range on level 12** (the owner asked): `rippleRadius = max(RIPPLE_RANGE_BASE - n x RIPPLE_RANGE_PER_LEVEL, RIPPLE_RANGE_MIN) x MODES.ripple` = `max(360 - 9n, 240)`, so **252 px at level 12 before the mode multiplier** (302 / 260 / 222 / 214 with 1.2 / 1.03 / 0.88 / 0.85) - it is NOT `max(640 - 24n, 360)` (see the v10.0 ripple-range note). Singer / player on level 12 = **0.89 / 1.23 / 1.44 / 1.50 x**: the owner's target was "about 1.2-1.5x in every mode" but their own Easy figure (270) is shorter than the player's 302 on Easy (Easy's ripple multiplier is 1.2) - built as given and flagged. (The Singer's cutscene uses its own 460 px on `stage.cfg`; that is cutscene-only and was left alone.)
2. **Puddles only where the mode has a scent monster** (`levelConfig`): `puddles = scentCount === 0 ? 0 : (PUDDLE_CAP or the formula)`. So Normal/Hard/Hardcore have puddles on levels 6-10 and Easy on 6-9; **levels 11, 12 and Easy level 10 have none**. `puddlesDrawn` (what the generator DRAWS) is unchanged, so every random number - and therefore every later placement - is exactly as before; `generateLevel` still builds the full `puddlesAll` (the level-9 decoy keeps avoiding those tiles, so the decoy does not move) and returns `puddlesAll.slice(0, cfg.puddles)`. Counts: L6 2/3/4/4, L7 2/4/5/6, L8 3/5/7/7, L9 4/6/6/6, L10 0/7/9/10, L11-12 0 (Easy/Normal/Hard/Hardcore; min = max over 200 seeds).
3. **Mimic placement (levels 8-9)** (`generateLevel` step 9): "the real exit and the mimic must be indistinguishable by location - reuse the exact placement rule the real exit uses". **The exit's rule is NOT "a room or a dead end"** as the owner believed: it is *the maze cell farthest from the start* (step 4: the first cell in row-major order with the greatest `d0`). Because loops and rooms are cut in first, that cell is a **corridor cell ~53% of the time (L8: corridor 106, dead end 84, junction 6, room 4 of 200; L9: 112 / 64 / 14 / 10)**. A first attempt that put the mimic in a dead end or room only would have made every corridor "exit" real - worse - so the mimic now uses the same loop and the same ranking: `farthestCell(kind, minExit, minSep)` = the farthest cell (by `d0`, the same first-wins tie-break) on the **same `spotKind` as the real exit** (`room` / `deadend` / `corridor` / `junction`, from the walls alone), unblocked, `dS >= minStart`, `dE >= minExit`, not `tooClose` to another monster, and `routeSafe` (the only-route rule the new monsters already used). Stages, first hit wins: same kind with (8 tiles from the exit, 6 from other monsters) -> (8, 3) -> (6, 0) -> any kind (6, 0) -> the old rule as the last resort (so a mimic is found whenever one was found before). No random draw of its own: the only `rand()` is still its pitch, so every later random number is unchanged. `routeSafe` was hoisted above step 9 (it used to sit in step 12).
4. **Verification** (`tools/layout-test.js`, loaded into a `?debug` page; the old build's `level.js` is fetched as text and run inside a function, which needs a server that sends `Access-Control-Allow-Origin: *` - `tools/serve.js` does, since 2026-10-18): v10.0 vs v10.1 `generateLevel` over **12 levels x 4 modes x 200 seeds = 9,600 combos**: walls, blocked, obstacles, start and exit identical in all 9,600; every non-mimic monster (kind, tile, sleeper, pitch) identical in all 9,600; every pitch (i.e. every random draw) identical; mimic count identical; puddles identical wherever a scent monster exists (3,800 combos) and gone exactly where the mode has none (1,800 combos: L10 Easy + L11 + L12); **the mimic moved in 1,591 combos (levels 8-9: 198 / 200 and 199-200 / 200 per mode) and, as a side effect, the level-9 decoy moved in 8 of 3,200 (2 of 200 per mode) because it keeps 5 tiles away from every monster** (reported to the owner). Mimic placement per level x mode over 200 seeds: **same `spotKind` as the exit 200/200 in all 8 rows** (L8 corridor 106 / dead end 84 / junction 6 / room 4 for both; L9 112 / 64 / 14 / 10 for both), every mimic on a cell centre, **0 on the only route** (v10.0: 0 and 2-3 per 200 on L8 / L9), min path to the exit 8, none within 2 tiles of another monster, average depth 0.86-0.90 of the exit's (v10.0: 0.69-0.71); v10.0's mimics were the same kind as the exit in only ~48% of seeds and 55-60% were off the cell grid. Puddle spacing (>= 3 tiles), distance from the start (>= 4) and never-on-a-wall re-checked: 0 problems. Scripted games (`IdentityTest.run`) on levels 8-10 (with forced mimic reveals) and 11-12 (with `chase`) x 4 modes: no exceptions, `artRandomCalls` 0; `settings().singer.singRange` 270 / 320 / 320 / 320.
5. **Lessons.** Look at what the owner's premise says about the code before building on it (the "exit is in a room or dead end" belief was wrong by half - measure the existing rule first). A placement change that is meant to make two things indistinguishable must match the DISTRIBUTION of the thing it copies, not a tidier subset of it. The new mimic is deeper than before (it now sits at about 0.9 of the exit's distance from the start) - a consequence of "the same rule", reported to the owner.

## v11.0: Settings, key rebinding, audio buses, the soundtrack, palettes, medals + stats (owner's brief, MAJOR - five features in ONE update)

Owner's golden rules, all held: **none of it may change gameplay, difficulty, monster behaviour or the simulation** (same seeds -> identical mazes and identical monster behaviour); everything works in every mode, with calm mode, Visual cues and touch controls, from `file://`, no build step, no dependencies, no audio files; **every** localStorage access in a try/catch, and an old save (which has none of the new keys) loads exactly as it did; every new screen and button is usable by touch (>= 44 px), keyboard and mouse.

**New files.** `js/profile.js` (all the saved data that is not progress: keys, volumes, palette, medals, stats - pure data, no DOM, no audio, loaded FIRST so `js/palette.js` can use its `store`), `js/palette.js` (the four palettes and who they hand colours to), `js/music.js` (the soundtrack), `js/settings.js` (the Settings screen UI). Script order in `index.html`: profile, palette, audio, music, level, art, cutscene, cues, touch, settings, game.

**New save keys** (all optional, all fall back to a default): `echomaze.keys`, `echomaze.volumes`, `echomaze.palette`, `echomaze.medals`, `echomaze.stats`, `echomaze.showtimer`. The old keys (`progress`, `best`, `mode`, `calm`, `seen`, `visualcues`, `touch`) are **not touched by this update at all**.

### Key rebinding (`js/profile.js` ACTIONS / bindings, UI in `js/settings.js`)
- The game never asks about a KEY any more, only about an ACTION: `act('right')` in `game.js` is `down(...EchoProfile.keysFor('right'))`. The movement arithmetic in `updatePlay` is byte-identical otherwise (`ix`/`iy` as before), so rebinding cannot change how anything plays. An action with no key simply never fires.
- 11 actions, up to 2 keys each, `event.code` throughout. Defaults are exactly what the game used before (WASD **and** the arrows, Space, both Shifts, E, P, M, C, V).
- **Never bindable:** `Escape` (always back/pause) and `Enter` (always confirms) - they are in `RESERVED` and are also the two keys the cutscene/complete/caught screens still read by code. Refused with a friendly reason: anything with `ctrlKey`/`altKey`/`metaKey`, `F1`-`F12`, `Tab`.
- A clash **asks** ("Q is already Send a ripple. Swap them?") with Swap / Keep-as-it-is buttons in the panel - never a `window.confirm`, which is blocking and unusable on touch.
- `settings.captureKey(e)` is called FIRST in the game's keydown handler and swallows the event while a key is being captured. `keysChanged()` re-renders the title/pause how-to (`renderHowTo`, built from the bindings) and calls `releaseKeys()` so a key held while it was rebound is never left stuck down.

### Audio buses and ducking (`js/audio.js`)
- `master -> compressor -> out`; `fx -> master` (every one-shot, every voice via `_route`/`_voiceOut`, **and the reverb return**) and `amb -> ambDuck -> master` (the cave drone + the soundtrack). The reverb return had to move to the fx bus: it only ever carries effects, and "Sound effects at 0 means silent" has to include their tails.
- `setBusVolume('master'|'effects'|'ambience', v)`; `duck(amount, hold)` dips `ambDuck` and is called by `enemyAlert` (a screech, scaled by how loud), `markSting` (0.65 for 0.8 s) and `markTick` (0.45 for 0.12 s, so the quickening ticks hold the music down). Mute still cuts the master, so it silences everything.

### The soundtrack (`js/music.js`)
- One mood per stretch (`MOODS`: title / early 1-5 / scent 6-8 / deep 9-10 / muffler 11 / singer 12), each with its own key, scale, step length, note density, pad voices and low-pass. Level 11 is dull and almost noteless; level 12 is whole-tone.
- **Lookahead scheduler**: `update(dt)` (called from `frame()`) schedules every step falling inside `LOOKAHEAD` = 0.9 s straight onto the audio clock, capped at `MAX_BURST` = 6 so a stalled tab cannot dump a chord, and re-seats `nextTime` if the clock ran away. Every gain node gets its envelope at the moment it is created (a fresh GainNode sits at 1.0 until its first event - the old gotcha).
- **It has its own xorshift, seeded from the level number, and never calls `Math.random`** - so a level always sounds like itself AND `tools/identity-test.js` (which splits `Math.random` by file) is unaffected.
- `setDanger(d)`: the game passes `calm ? 0 : danger`, the very number the heartbeat uses, eased over ~1 s. It opens the pad's filter, lifts its gain and shortens the step a little. **Nothing else reaches it**, so there is no music cue for the mimic, the Muffler or the Singer.
- Started in `startLevel` (the level's mood) and `toTitle` (the title mood); stopped in `startCutscene`, `onCaught`, `onLevelComplete`. `start()` on the mood already playing is a no-op, so walking the menus never restarts it. Pause suspends the whole AudioContext (the clock freezes, so the scheduler simply does not run); opening Settings **from** the pause menu resumes the context so the sliders can be heard, and suspends it again on the way back.

### Colour palettes (`js/palette.js`, checked by `tools/palette-check.js`)
- **Nothing holds its own colours any more.** `EchoPalette.onChange(fn)` fires immediately on registration and again on every change; `game.js` refills the `COLORS` array **in place**, `art.js` refills `RGB`/`CORE` in place (boulder and pillar both map to the `obstacle` role), `cues.js` refills its `RGB` in place. Because the objects are never replaced, every existing reference keeps working. `SINGER_RGB` is gone: the singer's ripple tint is `singerRgb()` = `COLORS[T_SINGER]`.
- CSS: `applyCss()` sets `--ui-rgb` (the wall colour), `--danger-rgb` (the echo monster), `--exit-rgb`, `--decoy-rgb`, `--puddle-rgb`, `--singer-rgb`, `--muffler-rgb` on `<html>`, and `style.css` now says `rgba(var(--ui-rgb), a)` everywhere it used to hard-code `rgba(95, 212, 255, a)` / `rgba(255, 59, 92, a)` / `rgba(255, 122, 217, a)`. The inline cue SVGs in `index.html` carry `data-cue="echo"` etc. and get their `--c` set the same way.
- `core` (the pale line down the middle of a shape) is named explicitly for **Default only**, so the default look is pixel-for-pixel what it was; the other palettes derive it by lightening 45% towards white, which is how the originals were picked.
- **The mimic:** proved by recording every `EchoArt.draw` call for a frame - with a disguised mimic and the real exit the same distance away, in Hard both come out as kind `exit` with tell `none`, in **all four palettes**; in Easy the mimic keeps its deliberate `clear` tell (v9.1). And `EchoArt.RGB.exit === palette.exit` in all four. So the mimic always wears the palette's exit colour, and the echo colour once `revealMimic` flips its kind.
- **The numbers** (worst pair, CIEDE2000, over the nine things a ripple lights plus the Muffler's cue glyph; `heart` is left out on purpose - it is a lightened echo colour in every palette, as it always was, and it is the only cue that is a plain ring around YOU):

| palette | normal | protan | deutan | tritan | dimmest on black |
| --- | --- | --- | --- | --- | --- |
| default | 11.9 | 8.0 | 3.3 | 0.3 | 6.0:1 |
| protan (red-green) | 17.3 | **17.1** | **16.9** | 1.1 | 4.5:1 |
| tritan (blue-yellow) | 13.7 | 2.3 | 4.2 | **13.6** | 4.6:1 |
| contrast | **17.0** | 6.2 | 5.2 | 0.4 | 6.3:1 |

- **How they were chosen:** `PaletteCheck.optimise()` hill-climbs a palette to pull its closest pair apart, under hue windows (so the game still reads: walls cool, the echo monster hot) and luminance windows (**the exit is always the brightest thing in the maze**; walls never glare). High contrast was hand-written instead - the optimiser kept washing colours out towards white, which is not what "high contrast" should look like; the hand-written set keeps Default's hues and beats it 17.0 vs 11.9.
- **A real finding, worth keeping:** in the tritan palette the echo monster is a MUTED red and the stalker a pale gold on purpose. Pinning them to a vivid red and a vivid orange drops the worst pair to **5.1** for a tritanope (measured) - red against orange differs mainly along the blue-yellow axis, which is exactly the one tritanopia loses. They are told apart by brightness instead.
- `PaletteCheck` (tools) does Vienot/Brettel/Mollon 1999 simulation on linear RGB + CIEDE2000 + WCAG contrast; `PaletteCheck.report()` prints every palette. It is a model of full dichromacy (the worst case) and says nothing about anomalous trichromacy - said so in the README too.

### Medals and stats (`js/profile.js`)
- Par comes from the maze the player actually got: `generateLevel` now returns **`pathTiles`** (`dS[exitIdx]`, the BFS shortest route in tiles). Nothing in the game reads it - it is data, added to the return only.
- `TIME_PAR` = optimalWalkSeconds x {2.2, 3.2, 4.6} + {20, 34, 55} seconds; `RIPPLE_PAR` = ceil(pathTiles / {4.5, 3}) + {4, 6}, bronze for any. **These are looser than the owner suggested** (they proposed x1.6+15 and ceil(tiles/8)+2): pinging is the game's core verb, and at level 12 the ripple reaches 214-302 px against a ~2,700 px route, so ~11 pings barely covers seeing the route once, with nothing left for monsters. Reported to the owner with the table.
- `flawless` = `levelDeaths === 0`. `levelDeaths` is reset in `startLevel(n, retrying)` unless retrying; `retry()` passes `true`, so a death + Try again costs it for that visit but a later visit is a clean slate. Hardcore gets it free (no retry exists). Verified.
- Medals are only ever raised (`Math.max`), and `bestTime` / `bestRipples` only ever lowered.
- **Stats** are counting only, never read back: `bump()` from `emitRipple`, `startCrouch`, `dropDecoy`, `markPlayer` and `updatePlay` (playTime, distance), `addDeath(mode, cause)` from `onCaught(cause)` and `addClear` from `onLevelComplete`. `onCaught` takes the cause from the enemy that touched you, or `singer` for a landing; a revealed mimic carries `fromMimic` so it still counts as the mimic. Writes are held back and `flush()`ed at the end of a level, on pause, on `visibilitychange` and in `toTitle` - playTime and distance change every frame and must not hit localStorage that often.
- **No live timer by default**: `echomaze.showtimer`, off, Settings -> Display. `#hud-time` is blank unless it is on.
- The medal pips have three **shapes** (circle = time, diamond = ripples, square = flawless) so a palette or colour blindness can never make them the same. The tier colours themselves (bronze/silver/gold) are fixed and always carry a text label.

### Tests for this update (browser only, via `?debug`)
- **Identity, the golden rule:** `tools/identity-test.js` in the v10.1 folder (port 8768) against this build, 7 scripted games (normal L3, hard L5, normal L8 with forced mimic reveals, hard L9, easy L10, hardcore L11 with chase, normal L12 with chase, 1,200 frames each): **all 7 fingerprints identical**. Then the same 7 again with a different palette, the timer on, Visual cues on and the soundtrack actually running on a live AudioContext: **identical again**, `artRandomCalls` 0, no exceptions.
- **Rebinding** with synthetic `KeyboardEvent`s: plain rebind, Ctrl+key refused, F5 refused, Esc cancels, a clash asks and Swap moves both keys - and then the rebound key really does work in play (Space stopped rippling, E started; L moved right, D stopped).
- **Soak:** 15,000 frames of random input over 6 mode/level combinations, swapping palettes (16 times), rebinding mid-game (13 times) and toggling the timer: **no exceptions**; the stats came out sensible (38 deaths attributed by kind).
- **Old saves:** wrote a pre-v11 localStorage (progress, best, mode, calm, seen, visualcues, touch), reloaded: progress, mode, calm, cues and touch all kept, Continue still offered the right level, and every new key fell back to its default with empty medals.
- **Music:** the scheduler really schedules (steps advance on the audio clock; 13 notes over 15 steps with the density turned up for the test), the pad builds 4 oscillators + 1 delay, a screech ducks the ambience bus 1.0 -> 0.56, the mood follows the level and calm mode holds danger at 0.
- **Medals:** a clean clear wins Flawless; a death + Try again loses it; a fresh visit wins it back and it is never lowered.
- **Screenshots:** all four Settings tabs, the medal display on the level-cleared screen, and one staged scene (echo, scent, stalker, singer, boulders, puddle, decoy, exit) in each of the four palettes.
- **NOT hand-played, and the soundtrack was never judged by ear** - it was verified by counting the nodes it builds and watching its scheduler, not by listening.

### Lessons
- The browser pane only runs `requestAnimationFrame` while it is visible and being captured, so anything driven from `frame()` (like the music scheduler) does nothing during a `setTimeout` wait - drive it directly in tests, and front the tab (`tabs_select`) before staging a scene, or the canvas is 0x0.
- Re-adding a `<script src>` for a file that declares a top-level `const` throws "already declared" **silently into the console** while the old version stays live - reload the page instead of re-injecting, or a test can quietly measure the old code (it did, once).
- A staged scene has to fit inside BOTH the ripple's range for that level and mode AND the snapshot's crop, or the thing being photographed is simply not lit.

## v11.1: the sonar decoy calls everything, and reveals mimics (owner's brief, MINOR)

Owner: "just make sure that the decoy brings in all monsters, and also reveal mimics. Keep the range of it though."

- **`callMonsters` no longer skips any kind.** The `kind === 'stalker' || 'muffler' || 'singer'` guard is gone, so every monster inside `DECOY_RADIUS` answers. The radius is untouched at **480 px, straight-line** (checked: a monster 453 px away is called, one at 520 px is not).
- **A mimic in the radius is revealed on the spot**: `callMonsters` runs `revealMimic(e)` before `lureEnemy(e, ...)`, so it snarls, turns red, retags any ripple still in the air, and walks over as an echo monster. It is the same function a ripple uses - there is no second code path for this.
- **`updateLured` now walks each kind at its own speed** (`scentSpeed` / `stalkerSpeed` / `mufflerSpeed` / `singerSpeed` / `enemySpeed`); it used to use the echo speed for anything that was not a scent monster.
- **`releaseLured`**: every kind that never stands still (scent, stalker, muffler, singer) goes back to `patrol`, not `idle`; `deaf` is reset so a stalker/muffler starts listening again from that moment, and a released singer waits at least 1.5 s before it sings.
- **`stalkersListen` and `mufflersListen` skip lured/trapped monsters.** Without this the trap did not hold them at all: they would hear the player and walk straight off (measured - it was the one real bug in the first cut). `updateEnemy` already short-circuited lured/trapped for every kind, so nothing else needed a guard.
- **A Singer that is called loses its mark**: `lureEnemy` overwrites `state`, so a countdown in progress stops and the leap never comes. My call, flagged to the owner - it makes the decoy a genuine answer to being marked.

**Tests.** Over 4 modes x levels 8-12 x 6 seeds with monsters placed inside the radius on reachable tiles (120 decoy calls): **238 of 238 monsters in range at the moment of the call were lured, and 48 of 48 mimics were revealed** - no misses of any kind. A trapped stalker stayed `trapped` while the player stamped about 30 px from it for two seconds (before the listener guards it went straight to `hunt`). Released states checked per kind. Identity against v11.0 over 7 scripted games (levels 3, 5, 7, 8 x2, 9, 12): **all identical** - nothing changes until a decoy actually calls with one of the newly-affected monsters in range. A 20,795-frame random-play soak over levels 9-12 in all four modes, with 68 decoy drops and ~7,200 frames of an active decoy: no exceptions.

**Also in this version (a loose end from v11.0):** the level hints named hard-coded keys ("press E", "Hold SHIFT") even though keys are rebindable now. They use `{ripple}` / `{item}` / `{crouch}` tokens, filled in by `hintText()` from the player's own bindings. The level 9 hint also now says the decoy calls EVERY monster and shows up anything pretending to be the exit.

**Lesson (testing):** three separate "failures" in the first test runs were all the harness, not the game - the player was left standing on the decoy and killed before it called, teleported onto the exit (ending the level), or a monster was placed in a one-tile pocket that no path can leave. When a behaviour test fails, check the scaffolding before the code: measure at the moment the thing actually happens (distances at call time, not drop time), and only place monsters on tiles reachable from the spot they must walk to.

## v11.2: the tutorial - LEVEL 0 (owner's brief, MINOR; "everything else stays exactly the same")

Owner: a hand-designed level 0, the same every time, no monsters, nothing that can kill you, identical in every mode, no timer; six prompts that advance when the player DOES the thing; a Tutorial button always on the title; the first Begin for a new player plays it before the intro; skipping counts as done; it must count for nothing.

**Where it lives.** `js/tutorial.js` (loaded after `js/level.js`, before `js/game.js`) holds both halves:

- `EchoTutorial.build(cfg)` - the maze, returned in exactly the shape `generateLevel` returns, so nothing downstream can tell the difference. It is a 9-row ASCII `MAP` of 13 x 9 tiles (520 x 360 px): `#` wall, `.` corridor, `r`/`R` room floor (they become `roomTiles`), `S` start, `X` exit. Route: start room (2,2) -> east -> a corner south -> the obstacle room (x 4-7, y 5-7) -> east past a two-tile dead end at (10-11,6) -> north and east -> the exit at (11,1). `pathTiles` = 20. **It draws no random numbers at all** - not `mulberry32`, not `Math.random`.
- `EchoTutorial.create(env)` - the prompts. A list of six `STEPS`, each `{ id, text, touchText?, remind, touchRemind?, at?, done }`. `done(s)` is what the player must DO; `at(s)` gates a step until its moment, and a LATER step whose `at` fires wins (so nobody is told about walls while standing in the obstacle room). `env.setHint(text | null)` is the only thing it can do to the world.

**Hooks in the rest of the game - all of them gated on the level number, nothing else:**

- `js/level.js`: `levelConfig(0, mode)` returns `tutorialConfig(modeId)`, which is `levelConfig(1, 'normal')` with `n: 0`, the mode label, and every monster / puddle / decoy count zeroed. So every difficulty gets **Normal level 1's ripple range (361.53 px) and cooldown (0.7469 s)**, checked identical across all four modes. `generateLevel` returns `EchoTutorial.build(cfg)` **before** `mulberry32` is even constructed.
- `js/game.js`: `TUTORIAL_LEVEL = 0`, `scored() = levelNum > 0` and `inTutorial()`. `scored()` guards every write to the save: `bump('playTime')`, `bump('distance')`, `bump('ripples')`, `bump('crouches')` and Hardcore's "keep a high score from level 1" line in `startLevel`. Reaching the exit calls `onTutorialComplete()` instead of `onLevelComplete()`, so `saveBest` / `addClear` / `recordClear` are never reached. The HUD says `Tutorial` and hides the timer. New state `tutdone` (the completion overlay); new overlay id `tutorial`.
- Flow: `startTutorial(after)` (`'intro'` or `'title'`), `markTutorialDone()`, `leaveTutorial()`, `skipTutorial()`. `newPlayer() = !tutorialDone && furthestReached() <= 1 && !hasSeen('intro')` decides whether Begin plays it first.
- `TUTORIAL_KEY = 'echomaze.tutorial'` through the existing `store` (try/catch). A save without the key reads as "not done", which changes nothing for anyone who already has progress.

**Why a separate `state` and not a separate mode.** The tutorial runs as ordinary `state: 'play'` with `levelNum === 0`, so movement, ripples, drawing, pausing, calm mode, cues, palettes and touch all work with no new code paths - and no simulation code had to learn the word "tutorial". The five gates above are the whole of it.

**UI.** `#tut-hint` (banner styling, bottom centre; on `body.touch` it moves to the TOP, under the Skip button, because the bottom belongs to the joystick and the RIPPLE/CROUCH buttons) and `#btn-tut-skip` (top centre, 44 px min-height, clear of the HUD and the touch pause button), both toggled per frame on `inTutorial() && state === 'play'`. `#btn-pause-skip-tut` in the pause menu, shown by `pause()`. `#tutorial` overlay: **Start the game** (labelled **Back to the title** when the tutorial was started from the title button) and **Replay tutorial**. `startLevel(0)` also clears any level banner still up, or it would sit on top of the first prompt.

**Wording** comes from the player's own bindings: `{move}` is built from the four movement actions' bound keys (`moveLabel()`), `{ripple}` from `keysText`. `tutorial.refresh()` is called from the settings `keysChanged` callback, from `refreshTouchMode()` and from the `?debug` `bindKey`/`resetKeys` hooks, so a prompt on screen re-words itself the instant a key is rebound or touch is switched.

### Tests for this update (browser only, via `?debug`)

- **Nothing on levels 1-12 moved.** A generator fingerprint over **12 levels x 4 modes x 50 seeds = 2,400 mazes**, hashing `walls`, `blocked`, obstacles, puddles, the decoy, every monster (kind, tile, `sleeper`, pitch), start, exit, `pathTiles`, `roomTiles` and the whole `cfg`: all **48 per-row hashes identical** to v11.1.
- **Nothing plays differently.** Eight scripted `tools/identity-test.js` games against v11.1 - normal L3/s5, easy L5/s11, hard L7/s3, normal L8/s7 (5 forced mimic reveals), hardcore L9/s2, hard L11/s4 (chase), normal L12/s9 (chase), easy L10/s6 (cues on) - **every fingerprint identical**, `artRandomCalls` 0.
- **Every prompt, in order**, by scripted keys (not teleports): move -> 128 px walked; ripple -> first ping; walls -> 80 px more; recharge -> second ping; obstacles -> appears on entering the room and clears at tile x >= 8; exit -> reaching the exit. Screenshots of all six.
- **Stuck reminder** fires after 25 s of standing still, in both the keyboard and the touch wording.
- **It counts for nothing:** a full run with stats, medals, progress, `echomaze.best` and `echomaze.progress` captured before and after - the ONLY difference in the whole of localStorage was `echomaze.tutorial: null -> "1"`. On Hardcore with empty progress, nothing was written at all.
- **Flows:** a fresh save -> Begin -> tutorial -> Start the game -> intro -> level 1; a save with progress -> Begin -> intro straight away (`newPlayer()` false even with the tutorial key cleared); Tutorial button -> tutorial -> Back to the title; Replay tutorial; Skip from the on-screen button and from the pause menu, on both the Begin path (-> intro) and the title path (-> title).
- **Old saves:** a pre-v11.2 localStorage (best, progress, mode, calm, seen, visualcues, medals, stats) reloaded with no `echomaze.tutorial` key: everything kept, Continue still offered level 7, medals still "of 36", the level grid still 12 levels from 1.
- **Soak:** 25,600 frames of random play over the tutorial in 4 modes x 4 palettes with calm and cues switching, drawing every 13th frame - no exceptions, all six steps reached.

### Lesson

The tutorial needed one boulder and one pillar, but the game decides which is which from where it stands (`EchoArt.obstacleKind(x, y)`, a hash of the position) - the level never says. The first pair of tiles gave two pillars. Rather than add a `kind` field (and a second way for an obstacle to be drawn), I printed `obstacleKind` for all twelve room tiles and picked a pair that comes out one of each: (6,5) boulder, (6,6) pillar. When a value is derived from position, move the thing rather than teaching the code a new exception.

## v11.3: the title wordmark (owner's brief, MINOR; "VISUAL AND AUDIO ONLY")

Owner: replace the plain ECHO MAZE title text with a properly designed wordmark, built in the page (no image files, no new fonts, works from `file://`); tie it to the game's own light; give it a gentle looping echo and a one-off reveal with a sound; calm mode softens it but never removes it; tidy the tagline's type without changing a word of it.

**`js/wordmark.js`** (`EchoWordmark.create(env)`), loaded after `js/tutorial.js`. It is title-screen dressing and nothing else: its own canvas inside the `<h1>`, its own clock, no localStorage, **no `Math.random`**, and `update()` is only ever called from `frame()` while `state === 'title'` AND `#title` is not hidden - so it cannot run during a level or behind Settings.

- **Type.** The page's own font stack at weight 700, laid out **glyph by glyph** with `TRACK` = 0.3 em of tracking and a 0.5 em word gap - never CSS `letter-spacing` or `ctx.letterSpacing`, which not every browser honours on a canvas. `layout()` fits the wordmark to the width the `<h1>` gives it: one line between 60 px and 24 px, and only below that does it stack onto `ECHO` / `MAZE`. `resize()` bails out when the host measures less than 40 px wide (the title is hidden), so a hidden panel can never re-fit the letters to nothing.
- **Colour** is the palette's **wall** role (`EchoPalette.onChange`), so the logo is lit with the same blue a ripple paints a wall with and follows the player's palette. Chosen over the exit green because the whole UI accent (`--ui-rgb`) is already the wall colour.
- **The echo.** A ring expands from the middle of the wordmark over `SWEEP_SECONDS` = 1.75 s, once every `IDLE_PERIOD` = 5.5 s (**0.18 sweeps a second**, far under the game's 3-a-second flashing limit). The light through the letters is a circular radial gradient used as the `fillStyle` for a second pass of the glyphs, on `'lighter'`; the visible wavefront behind them is an **ellipse** flattened to the shape of the box (`ky = cssH * 0.42 / maxR`) so the whole ring stays in frame - at the letters' own height a circle and an ellipse of the same radius meet, so the arc and the light line up exactly where it matters. A very slow breath (+/-7%, 6.5 s) keeps it alive between sweeps.
- **The reveal.** `reveal(withSound)` restarts the sweep at `REVEAL_AMP` 1.6 and `REVEAL_SPEED` 1.18. Called from `toTitle()` **with** sound, and without sound at start-up, from `closeReplay()` and when Settings closes back to the title. The sound is `audio.titleReveal()` - a noise sweep through a band that opens and closes, under a 220/330/440 Hz shimmer, routed through `_route` like every other one-shot, so mute and the volume buses apply. It returns immediately when there is no `AudioContext`, so the very first title screen is silent and **nothing here can delay the Begin button**.
- **Calm mode** (and `prefers-reduced-motion: reduce`, which is treated the same) dims the baked letters to 0.72, halves the breath, cuts the sweep's peak from 0.85 to 0.4 and drops the brighter/faster reveal - the loop stays. `setCalm` calls `wordmark.invalidate()` because the letters are baked.
- **Cost.** The lit letters are baked into an offscreen canvas and only redrawn when the layout, the palette or calm mode change. A frame is one `drawImage`, one arc and one pass of nine glyphs: **0.01 ms** measured over 600 frames. Nothing is allocated per frame.
- **Fallback.** No 2D context -> the `<h1>` gets `no-canvas`, the `<span class="wordmark-text">` inside it (there for screen readers) is un-clipped and styled like the old title, and none of the module runs.

**`index.html` / `style.css`:** `<h1><canvas id="wordmark"><span class="wordmark-text">ECHO MAZE</span></h1>`; the old `h1` type rules and the `@keyframes glow` are gone (the canvas does that now) and live on only under `h1.no-canvas`. The tagline keeps its exact wording and gets a 33 em measure, 0.05 em tracking, 15px/1.55 and a slightly brighter grey (#8ea7b5 over `--dim`).

### Tests for this update

- **Nothing plays differently:** five `tools/identity-test.js` scripted games against v11.2 (normal L3/s5, normal L8/s7 with mimic reveals, hard L11/s4 chase, normal L12/s9 chase, easy L10/s6 with cues) - **every fingerprint identical**, `artRandomCalls` 0.
- **Rate:** 120 simulated seconds x 2 calm settings x 4 palettes = 7,200 frames, **22 sweeps = 0.183 a second**, no exceptions.
- **Sound:** spied on `audio.titleReveal` - 0 calls at load, 0 during a level, exactly 1 on quitting to the title. `titleReveal` returns early with no `AudioContext` and routes through the fx bus, so mute applies like everywhere else.
- **Layout:** 1100 px wide -> 55 px on one line; 720x400 in touch mode -> 60 px, 655 px wide; 380 px wide -> 31 px, still one line, no clipping (the portrait "rotate your device" card covers the title there anyway). Palette swap and calm mode both re-bake correctly. The `no-canvas` fallback renders the old styled title.
- Screenshots: at rest, and mid-sweep at t = 0.29 and t = 0.65.

### Lesson

A canvas radial gradient cannot be made elliptical for a `fillText` - a gradient is resolved against the transform in force when it is *painted*, not when it is created, and the text must not be painted through a scaled transform or the glyphs distort. The fix was to notice that the shape only has to agree where the letters are: a circle and an ellipse of the same radius meet exactly on the horizontal centre line, so the lighting stayed circular and only the drawn wavefront was flattened to fit the box.

## v11.4: the title screen, done properly (owner's brief, MINOR; visual + audio only)

Owner, on v11.3: "the wordmark was plain white bold text with a generic glow (no real colour, no visible sweep, no layered glow), and calm mode had no visible or audible effect on it at all." All three were fair. This is the rebuild.

### The wordmark (`js/wordmark.js`, rewritten)

- **Green, not white.** The letters are the palette's **exit** role - `#5dffa0` on Default. Taken from the palette rather than hard-coded so the colour-blind palettes get their own exit colour, and because it MEANS something: the exit is what the game is about.
- **Four passes, not a text-shadow.** Three additive (`lighter`) passes at shadowBlur 30 / 14 / 4 (at `REF_SIZE` 56, scaled by `size / REF_SIZE`) with fills 0.14 / 0.22 / 0.34, then ONE ordinary `source-over` pass that lays the glyphs down in the exit green. The last pass is deliberately not additive: stacking green on green past ~0.5 total alpha pushes the red and blue channels up and the letters wash out to white, which was half of what was wrong before. The additive passes build the halo; the plain pass guarantees the letterform is exactly `rgb(93,255,160)`.
- **Spacing.** `TRACK` 0.14 em between every pair of letters inside a word; the gap between ECHO and MAZE is `TRACK * size + 0.5 * capHeight` (31.5 px at 64 px type). Measured **on top of** the tracking on purpose: two letters inside a word are already held apart by their side bearings, so a word gap of "0.5 cap heights" measured from zero comes out barely wider than a letter gap and ECHOMAZE reads as one word - which is exactly what the first attempt at this looked like.
- **The sweep is real.** A band of half-width `0.95 * size` crosses left to right in `SWEEP` 1.1 s. Where it passes, a moving linear gradient is used as BOTH the `fillStyle` of an additive fill (brighter) AND the `strokeStyle` of a `strokeText` whose `lineWidth` rises to `0.11 * size` at the peak (thicker) - the same pair of things a ripple does to a wall. `sin(pi * u)` envelopes it so it never pops, and the gradient is capped at 0.85 so the hot core stays mint rather than white. `REST` 4 s between sweeps: one every ~5.1 s, about 0.2 a second.
- **The reveal** is `PEAK_REVEAL` 1.35 and `REVEAL_SWEEP` 0.8 s, with `audio.titleReveal()`.
- **CALM MODE, which is the thing that was missing.** `PEAK_CALM` 0.6 (a 40% cut), `SWEEP_CALM` 1.65 s (half again slower), `REST_CALM` 5.6 s (one every 8 s instead of 5), the baked resting glow dimmed to 0.55, and no brighter/faster reveal. `prefers-reduced-motion: reduce` is treated identically. The sound is quieter too (`titleReveal` already scales by `this.calm`).
- **`seek(u)` HOLDS the frame** (`held`), and `release()` lets go. Without the hold, the title's own animation frames repaint over a seeked frame before the screenshot is taken, and two "same timestamp" pictures come out showing different moments - which is how the first attempt at proving calm mode produced two shots with the band in different places.

### The rest of the screen (`style.css`, one appended block scoped to `#title`)

Two colours carry meaning and nothing else is allowed to: **blue** (`--ui-rgb`, the wall colour) is the interface - chips, borders, buttons - and **green** (`--exit-rgb`) is the way out, so the wordmark, the note's left rule and the exit's legend chip are the only green things. Key chips get a top-lit gradient, an inset highlight and a glow (shared with every other screen on purpose: a key should look like a key everywhere). The controls, the legend, the long paragraph and the two option rows each become their own block, with hairlines between the groups. Each legend row is a pill tinted in **that thing's own colour** - `drawLegend()` in `js/game.js` now sets `--glow` on the `li` from `EchoPalette.rgb(LEGEND_ROLE[kind])`, so it follows the palette - with the real in-game art glowing inside it. Mode tiles and the Begin button take more of the same light on hover/focus.

**Nothing in `index.html` changed at all** (`git diff --stat -- index.html` is empty), so no text, no binding and no button's job can have moved. The only `js/game.js` changes are `LEGEND_ROLE`, four lines in `drawLegend()`, and two debug hooks.

### Tests

- **Identity vs v11.3:** five scripted `tools/identity-test.js` games (normal L3/s5, normal L8/s7 with 5 mimic reveals, hard L11/s4 chase, normal L12/s9 chase, easy L10/s6 with cues) - **all five hashes identical**, `artRandomCalls` 0.
- **Calm proof:** `wordmarkSeek(0.45)` held, same width (548) and same `sweep` (0.45), photographed with calm off (`peak` 1, `sweepSeconds` 1.1) and on (`peak` 0.6, `sweepSeconds` 1.65). Plainly different pictures: a fat blown-out ring with a wide bloom against a thin pale outline with none, on a visibly dimmer wordmark. Two consecutive screenshots of the held frame are identical, which is what makes the pair honest.
- **Measured:** `colour` `rgb(93,255,160)`; word gap 31.5 px = 0.5 cap heights + tracking, stable across repeated layouts; sweeps 5.0 s apart normally, 8.0 s in calm.
- **Sound:** spied on `titleReveal` - 0 at load, 0 during a level, 1 on quitting to the title.
- **Soak:** 9,600 frames over both calm settings x four palettes, no exceptions, nothing left held.
- **Layouts checked:** 1000 px desktop, 760x420 touch landscape, and the pause menu (unchanged apart from the shared key chips).

### Lessons

1. `measureText('E').actualBoundingBoxAscent` is measured **from the current baseline**. Asking for a cap height while the context is still set to `textBaseline: 'middle'` (which is how the letters are drawn) returns about three fifths of the answer, so the word gap silently changed every time the layout was redone. Force `'alphabetic'` before measuring.
2. When a screenshot has to catch an animation at an exact moment, the animation has to be **stopped**, not just set. The rAF loop repaints between setting the frame and capturing it.

## v11.5: the title screen's language, everywhere (owner's brief, MINOR; visual + audio only)

Owner: take the new title screen as the reference standard - colour language, additive glow, chip/panel styling, button glow - and make every other screen match, plus cross-fades between screens, animated HUD numbers, staggered medals and a pause menu that arrives rather than snaps.

### The motion, in three numbers

`--ui-fade` (300 ms), `--ui-lift` (10 px) and `--ui-stagger` (170 ms) on `:root`, with `html[data-calm='1']` (set by `setCalm`) giving 420 ms / 5 px / 230 ms, and `prefers-reduced-motion: reduce` giving the same. Every animation in the interface is expressed in those, so calm mode softens ALL of it in one place instead of each rule carrying its own variant. `js/game.js` mirrors them in `FADE_MS` / `FADE_MS_CALM` where it needs the number in script. **Nothing here loops** - each plays once, when a screen changes or a number moves - so none of it can flash.

### Two kinds of screen change

- **`showOverlay(id)`** now cross-fades: the incoming overlay loses `.hidden`, is **laid out with a forced reflow** (`void el.offsetWidth`) so the fade has a starting point, then gains `.in`; the outgoing one loses `.in` and is only given `.hidden` a fade later. The reflow is deliberately not a `requestAnimationFrame`: animation frames stop in a hidden or backgrounded tab, and a screen that only appears once a frame runs is a screen that can fail to appear at all. `.overlay:not(.in) { pointer-events: none }` stops a dying overlay catching the click meant for the new one.
- **`go(fn)`** is for a change that swaps what the CANVAS shows: raise `#veil` (black, z-index 40), run `fn` at its darkest point, lower it. `veilMs()` is 55% of the fade, so out-and-back is one fade.

**`go` is only ever called from an input handler or the end of a cutscene** - never from inside `startLevel`, `toTitle`, `advanceLevel`, `retry` or `newRun`. Those stay synchronous, so every `?debug` hook and `tools/identity-test.js` still changes the screen the instant it is called, and no test had to change. A second press while a fade is running is ignored (checked: three rapid presses of Next level advance exactly one level).

**The AudioContext rule.** Every handler calls `audio.init()` and `audio.uiClick()` ITSELF, synchronously, and only then asks for the fade - so the context is created in the gesture that created it. `newRun`'s own `audio.uiClick()` was removed (it would now have sounded a fade later) and its `audio.init()` kept, harmlessly. Measured: immediately after `btn-start.click()`, `audio.ctx.state` is already `running` while `state` is still `title` and the veil is only starting.

### The look

One appended block in `style.css`. The title's button glow, `.primary` glow and pressed state go global (with red variants under `.danger`); the settings tabs, level grid, cutscene list and keycaps get the same hover/focus light; checkboxes take the exit green and sliders the interface blue. `#pause .panel` takes the title's gradient panel and its option rows the title's bars; `#caught` is the same panel lit red; `#complete` and `#victory` are lit green, because that is what they are about.

### Numbers

- `hudNumber(id, text, pulse)` writes a HUD value only when it has really changed and gives it a 260 ms scale pulse. The clock is updated with `pulse = false` - once a second would be a pulse too many.
- `renderMedals` sets `--i` per row; the CSS reveals them on `calc(var(--i) * var(--ui-stagger))` with a small pop and a flare on the pip. The number in a medal row is pulled out into its own `<b>` and run up to itself by `countTo`, which writes the exact final text when it lands - the sentence on screen is the one that was always there.

### Tests

- **Identity vs v11.4:** the same five scripted games (normal L3/s5, normal L8/s7 with mimic reveals, hard L11/s4 chase, normal L12/s9 chase, easy L10/s6 with cues) - **all five hashes identical**, `artRandomCalls` 0.
- **Flow soak, both calm settings:** title -> Continue -> level -> pause -> settings -> back -> resume -> pause -> quit -> title -> replay -> back, sixteen screen changes, every one landing on the right state with the right overlay lit and `transitioning` back to false. Caught -> Try again and complete -> Next level checked separately.
- **Audio:** `audio.ctx.state === 'running'` in the click itself (above).
- **Timings:** 300/165/170 ms normally, 420/231/230 ms in calm, in both the script and the CSS variables.
- **HUD:** the ripple counter ticks on 1, 2, 3 and 4 and at no other time.
- **Cost:** Hardcore level 12 with a live singer and three ripples in the air steps and draws in **0.342 ms a frame**.

### Lesson

A CSS transition needs the element to have been laid out at its starting value before the end value is set. Doing that with `requestAnimationFrame` looks right and works in every test - and then fails in a backgrounded tab, where frames stop and the screen never appears. A forced reflow (`void el.offsetWidth`) is synchronous and cannot be throttled.

## v11.6: death tips, near misses, save feedback (owner's brief, MINOR; feedback only)

Three layers laid ON TOP of the simulation. The rule for all three: they may READ the game's state and they may write to the screen, the speakers and the stats - they may never be read back by anything that decides an outcome.

### Death tips (`js/feedback.js`, new)

A table of `cause -> why -> [2-3 phrasings]`, and `tipFor(cause, why, level, atMs)`, which picks one by **hashing** those four things. Deliberately **not** `Math.random`: the game's random numbers belong to the simulation, and drawing one here would shift every seed after it (checked: 200 tips and a forced near miss make **zero** `Math.random` calls).

The monster tags ITSELF with a `why` at the moment it first notices you, and `onCaught` reads it back, so the tip is told what happened rather than guessing:

| where | sets |
| --- | --- |
| `alertEnemy` | `ripple` |
| `hearFootstep` | `footsteps` |
| `stalkersListen` / `mufflersListen` | `standing` or `moving` |
| `updateScent` (smelly and in range) | `smell` |
| `checkTrailTouch` | `trail` |

`e.why` is written by the AI and read by nothing but `deathWhy(e)`. Two things that took a second pass:

- **Only on the frame it FIRST hears you.** The listeners originally set `why` every frame they heard you - and by the time a stalker reaches you, you are inside its presence radius whatever you are doing, so every stalker death said "it heard you standing nearby". Now they set it only on the transition into `hunt`, which is also where they already decide whether to make their alert noise.
- **A singer mid-leap.** `deathWhy` treats `marked` / `leap` / `land` as the song's doing, because the body can reach you on the way down; without that a leap that clipped you read as "you walked straight into it".

A monster that is not chasing you (or never tagged itself) gives the `blind` line - you walked into it in the dark. Hardcore's title notice carries the tip too.

### Near misses (`js/game.js`)

`NEAR_MISS_DIST` = `CATCH_DIST * 1.5` (34.5 px), `NEAR_MISS_GAP` 2 s per monster, `NEAR_MISS_SECONDS` 0.42. Checked LAST in `updatePlay`, after every monster has moved and after the outcomes: `e.nmIn` latches while a monster is inside the margin, and the beat fires when it leaves again without having caught you. A disguised mimic is skipped - it gives nothing away.

The beat is made only of things the game already does: one `audio.heartbeat` (and its Visual cue, which fires in calm mode too, because cues must never be weaker there), a red pulse folded into the existing screen-edge gradient, and a dip in the speed of the ART clock - `artLag` is drawing time we choose not to advance, so the maze seems to hold its breath while `dt`, and therefore every monster, is untouched. Calm mode: peak 0.45 instead of 1, the red at 0.3 instead of 0.75, no heartbeat sound and no time dilation at all.

Counted as `nearMisses` in the stats (shown in Settings -> Stats & Medals). It feeds nothing else.

### Save feedback

`store.set` in both `js/game.js` and `js/profile.js` now RETURNS whether the write happened, `saveBest` returns whether a new best was really written, and `recordClear` reports `saved`. `onLevelComplete` shows the toast only when `newBest || (res.saved && something improved)`. Storage that is off, full or blocked returns false everywhere, and nothing appears - a toast that lies is worse than no toast.

### Tests

- **Every cause, by real detection** (not by setting states by hand): echo blind / ripple / footsteps, scent smell / trail, mimic, stalker standing / moving, muffler standing / moving, singer marked. Each one checked as `state/why` at the moment it noticed, then the tip it produced.
- **The tips are deterministic** (the same call twice gives the same line) and **spread** (600 picks used all three phrasings, 187 / 205 / 208).
- **The near miss cannot touch the simulation:** a scripted game (hard, L11, seed 4, 1800 frames, `chase: 45`) that really fires **3 near misses** fingerprints **51dc993c** - identical with the beat running, with it neutralised, and on v11.5.
- **Identity vs v11.5:** the usual five scripted games, all five hashes identical, `artRandomCalls` 0.
- **Near-miss behaviour:** one per pass, blocked by the 2 s gap, allowed again after it; the player survives each one.
- **The toast is honest:** shown on a first clear (new best + new medals), silent on a replay with nothing better, silent with `Storage.prototype.setItem` throwing.
- **Soak:** 57,392 frames over 2 calm settings x 4 modes x 6 levels with the player repeatedly parked beside a monster - 208 deaths, 65 near misses, 25 distinct tips, no exceptions.

### Lesson

"What killed me" is a question about a moment that has already passed, and the state at the moment of contact is the wrong place to ask it: at contact everything is close, still and touching. The answer has to be recorded when the monster *first* decides to come for you, and read back afterwards.

## v12.0: LEVEL 13 - the capture (owner's brief, MAJOR)

Owner: a hand-authored, non-procedural level 13 with no monsters; a dread ramp on the way to a large room; that room, and only that room, visible without a ripple; a warden hidden in it that only the player's OWN next ripple reveals; a capture that hands off seamlessly from live gameplay (no reenactment overlay); the old victory screen retired; a clearly temporary placeholder ending. **Levels 1-12 must not change in any way.**

### Where it lives

`js/warden.js` (`EchoWarden`), loaded after `js/level.js` and `js/tutorial.js` - the same two-halves shape the tutorial has:

- `build(cfg)` - the maze, returned in exactly the shape `generateLevel` returns. A 21-row ASCII `MAP` of 27 x 21 tiles (1080 x 840 px): `#` wall, `.` corridor, `S` start, `G` the great room's floor, `D` the door (a WALL tile that is drawn, chimes and lights up green exactly like an exit, and is never reachable). **It draws no random numbers of any kind.**
- `create(env)` - the dread ramp, the room's own light, the warden's drawing, and the capture state machine (`approach -> armed -> reveal -> reach -> black -> dark -> done`).

`js/level.js`: `WARDEN_LEVEL = 13`, `wardenConfig(modeId)` and `levelConfig(n, modeId, raw)` - the third parameter is private and exists only so `wardenConfig` can ask for the plain curve at n = 13 without recursing. `generateLevel` returns `EchoWarden.build(cfg)` **before** `mulberry32` is constructed, exactly as it does for the tutorial.

### The maze (measured, not claimed)

27 x 21 tiles, 195 floor tiles, 81 of them the great room. **Seven dead ends and one loop** round the right-hand side. **Exactly one way into the room** (the gap at tile (16, 9)). **74 tiles** of walking from the start to the room's threshold (level 12 averages 66.9, so the curve carries on). The door at (26, 5) is **not reachable**: the warden seals the room from its top wall to its bottom wall (the gaps left are 10 px and the player is 18 px across), which `wardenCheck()` asserts.

**Ripple range and recharge follow the ordinary curve at n = 13** - `max(360 - 9 x 13, 240) x mode.ripple` = **291.6 / 250.3 / 213.8 / 206.5 px** and `min(0.7 + 0.07 x 13, 1.5) x mode.cooldown` = **1.2 / 1.455 / 1.725 / 1.8 s** (Easy / Normal / Hard / Hardcore). That is nine pixels shorter than level 12 and the same recharge, which the curve had already capped. The LAYOUT is identical in every mode and for every seed (checked: the same shape hash `5d96dcad` in all four modes with a random seed each time).

### The warden

**It is not a monster.** It is not in `enemies`, so no AI, no hearing, no smell, no decoy, no heartbeat, no near miss and no catch check knows it exists - and touching it does nothing at all. It is 24 overlapping circles on `level.warden.circles`:

- **Collision**: one extra loop in `moveCircle`, behind `if (level.warden)`. It is solid, like the room's far wall.
- **The ripple**: `castRipple` pushes its circles with `type: level.warden.revealed ? T_WARDEN : T_WALL`. **Before the reveal a ray that reaches it comes back as STONE** - the wall's colour, `EchoArt.wallTexture`'s stone joints, and `audio.echoWall`. There is no second code path and no tell.
- **The reveal**: `litByWarden(rp)` re-types that ripple's own rays (and any echo of it still on its way back) to `T_WARDEN` mid-flight - the same trick `revealMimic` plays, and for the same reason: what lit up was always there, and only the reading of it has changed. 228 of 640 rays in the test shot.
- `T_WARDEN = 10`, `NRAYTYPES` 10 -> 11, a new `warden` palette role, `audio.echoWarden` (a wall that came back soft, low and far too long).

Its shape is a fixed function of position - 19 circles down a slowly waving front line so the edge reads as a lumpy WALL rather than a row of balls, and 5 big ones packed behind them into the far wall. **`build()` asserts it never covers a corridor tile**; the first version of the shape bulged through the room's floor into the corridor below and cut the level in half, and that check is what caught it.

**Drawing the union.** The rim cannot be drawn by shrinking the circles - the union of the smaller circles is NOT the smaller union, and every overlap leaves an arc inside the body (it looked like a bunch of balloons). `rim()` strokes every circle's outline first, arcs and all, and then fills the union in solid black on top: the fill covers every interior arc and the inner half of the stroke, leaving one clean edge round the whole silhouette.

### The dread ramp (cosmetic, and it has to be PROVED cosmetic)

Measured by **remaining path distance**: `bfsDist` from the room's threshold, over the last `DREAD_TILES` = 28 tiles. Smoothed, so it climbs rather than snaps. Walking the route it goes 0 (at 28 tiles out) -> 0.47 (14) -> 0.68 (8) -> 0.97 (at the threshold), monotonically.

It drives: `audio.startWardenDrone` / `setWardenDread` (a low tritone that rises and opens, noise pushed through a waveshaper until it grinds, and `_dreadBend`, which pulls the cave's own two ambience notes apart and shuts its wind down to a rumble), a tremor added to the shake **at draw time only**, and a vignette. **Nothing it touches is read by the simulation**: not collision, not speed, not `cfg.rippleRadius`, not `dt`.

**The vignette is RED, not black.** The first cut was a black vignette - invisible, because the maze is already black. It is drawn in the same red the game's danger edge uses, with its inner radius closing in as the room gets nearer.

**Calm mode** (`dreadFx`): the ramp climbs at 0.55 instead of 1.4, everything is scaled by 0.45, and there is no tremor at all - softened and slowed, never removed. Proved at the same spot with the same `dread` 0.607: `dreadFx` 0.273 vs 0.607, shake 0 vs 0.96, and two visibly different screenshots. The room's glow is NOT reduced (it is information, not spectacle). Nothing in any of it pulses faster than 0.9 Hz.

### THE ONE ROOM YOU CAN SEE - a deliberate exception, like `mimicTell`

The great room glows on its own: a pool of light on its floor, its four walls, the door, and the warden punched out of the light as a silhouette. **This is the only place in the game where geometry is visible without the player pinging it**, and it is written down here as an exception on purpose, beside the mimic's per-mode `mimicTell` (the only other one).

It is kept honest by **two clips**: to the room, and - while the player is still outside it - to the wedge they could really see through the one gap in its wall (a cone from the player through that gap's two corners, plus a line-of-sight test to the gap itself, so a wall between them shows nothing). **That line-of-sight test was not enough, and leaked on four tiles - see the v12.2 section, which is where it is actually enforced.** `drawAwake` is clipped to the room too, so the glow round a thing buried in the far wall never makes it look bigger than the space it is in.

**The door's light comes ROUND the warden.** The door is drawn, then the warden's black fill hides it, then a wide soft halo is drawn on top - so the shape of the door is occluded (and a ripple's rays stop dead on the warden) while the way out still glows behind the thing standing in front of it. The warden is backlit by the exit. That is the picture the level is for.

### The capture

`approach` -> the player is fully inside the room (`x >= 760`, two tiles past the gap) -> `enteredRoom()` **and the player keeps every control**. Then `armed`: it waits for the player's OWN next ripple press (`emitRipple` -> `warden.onRipple`), and the reveal fires when that wave really arrives (`distance / RIPPLE_SPEED`, measured: 0.157 s at 82 px). **Safety net**: no ripple within `AUTO_SECONDS` = 7 and `wardenGasp()` sends one - a flinch, not a decision, so it ignores the recharge and a held crouch and is **not counted in `ripplesUsed`**. If the gasp is somehow sent from where the wave cannot reach, the reveal happens anyway after 0.4 s - nobody can soft-lock this. **The owner later removed the wait entirely: walking in IS the trigger and the gasp fires at once - see v12.3. `armed` is now `wave` and `AUTO_SECONDS` is gone.**

At the reveal, and ONLY there, `env.freeze()` sets `state = 'capture'`: the keydown switch has no case for it, so there is no input. `reveal` 0.6 s -> `reach` 1.9 s (five arms out of its own front edge towards the player, the shake to 19 px, `audio.wardenTake` - the Muffler's absorbing hum an octave and a half down, opened into a whole room of reverb and swelled over four seconds) -> `black` 1.7 s -> `dark` 1.2 s -> the ending. Measured end to end: 5.42 s.

**Clearing level 13 is walking into the room**, not touching the door (`updatePlay`'s exit check is skipped when `level.warden`). `onWardenCleared` writes the best level and "levels cleared" exactly as any other clear does, skips the *Level cleared* screen entirely, and takes **no medals**. The **"Progress saved" toast waits for the ending** - a note in the corner has no business in the middle of this.

**Medals, and why level 13 has none** (the owner asked for the choice and the reason): it is the same maze every time, it has no cleared screen to show them on, and a Time medal would ask the player to hurry through the one part of the game built to be walked slowly. `MEDAL_LEVELS` = 12 gates `recordClear`, `medalSummary` and the level-select pips; `CAMPAIGN_LEVELS` = 13 gates progress, the level grid and `isFinished`.

### After it: a STUB

`#ending` in `index.html` and `onCaptured()` in `js/game.js` are **labelled as a stub in both files** - replace them together when the next area exists. "…" / "Not killed. Taken." / "This is as far as the maze goes for now. The next area is still being built." / Back to title. No lore about where the warden takes you is invented, because none exists.

The **old `#victory` overlay is gone** (the owner retired it): clearing level 12 leads on to level 13 like any other level, and a capture is not a finish. `audio.victory()` is left in `js/audio.js`, unused, for whatever the real ending turns out to be. A save that had finished the old 12-level game (best = 13) now reads "Best: Lv 13" and offers **Continue (Level 13)** - the new level is simply waiting for them. Best = 14 is "Finished".

**A replay** plays the whole thing again (v12.1 - see below): the capture is the one cutscene in the game that is NOT once-only.

It is **not in the title screen's colour legend** on purpose: the legend is what you learn before you play, and the whole of level 13 is that the thing in the legend's place is a wall.

### Music, sound and cues

`js/music.js` gains a `warden` mood for level 13 only (`moodFor`: `level >= 13` before the singer's `>= 12`, so level 12 is untouched): an octave below anything else, on a tritone, almost no notes, `swell: 0` - nothing hunts you here, so there is nothing for the score to swell at. New sounds: `startWardenDrone` / `setWardenDread` / `stopWardenDrone`, `wardenReveal`, `wardenTake`, `gasp`, `echoWarden`. Visual cues carry the whole thing for a deaf player: a big `muffler` glyph (the game's existing "something swallows sound" shape) and the captions `[the wall moves]` and `[it reaches]`.

### Palette

A new `warden` role in all four palettes. It is deliberately **not** one of `RIPPLE_ROLES` (the nine the colour-blind checker compares every way): level 13 holds nothing else a ripple can light, so it only ever has to be told apart from the wall and the door. Checked as that trio under normal vision, protanopia, deuteranopia and tritanopia - the **worst warden pair is 12.7 / 26.8 / 19.6 / 14.5** (default / protan / tritan / contrast), all "plainly different". The first values scored 10.4 / 10.2 / 19.6 / 9.1 and were retuned.

### Tests for this update (browser only, via `?debug`)

- **Nothing on levels 1-12 moved.** The generator fingerprint over **12 levels x 4 modes x 50 seeds = 2,400 mazes** (walls, blocked, obstacles, puddles, the decoy, every monster incl. pitch, start, exit, `pathTiles`, `roomTiles` and the whole `cfg`): **all 48 row hashes identical to v11.6**, with `Math.random` stubbed to throw - the generator never touches it.
- **Nothing plays differently.** Five scripted `tools/identity-test.js` games against v11.6 (normal L3, normal L8 with mimic reveals, hard L11 chase, normal L12 chase, easy L10 with cues): `1576c884` / `459d9a04` / `8a97492c` / `d6c7affd` / `1aeb6ac3` - **identical**, `artRandomCalls` 0.
- **The hand-drawn level**, by `wardenCheck()`: 27x21, 195 floors, 7 dead ends, **1 way into the room**, 81 room tiles, start-to-room 74 tiles, **the door unreachable**, 24 circles, 0 monsters, and the same shape hash in all four modes with random seeds.
- **The ramp**, walked tile by tile along the real route: 0 -> 0.97, monotonic, glow from 14 tiles out, shake to 2.4 px.
- **The capture**: the player's own ripple queues the reveal at 0.157 s and fires it; 228 rays re-coloured; `state` becomes `capture`; reveal 0 / reach 0.58 / black 2.50 / dark 4.22 / done 5.42 s; the ending screen up and the HUD gone.
- **The safety net**: standing perfectly still, the involuntary ripple went at 6.82 s and the reveal 0.13 s later, with **"Ripples 0"** still in the HUD.
- **Clearing it**: progress `normal: 13 -> 14`, "levels cleared" 0 -> 1, **no medals recorded for level 13**, **no overlay shown**, and the player still had the controls at that moment.
- **A replay**: revealed on entry, black at 0 s, ending at 1.88 s.
- **Level 12 -> 13**: the ordinary *Level 12 cleared* screen with medals, Next level goes to 13, and there is no `#victory` element left in the DOM.
- **Calm mode**: same spot, same `dread` 0.607 -> `dreadFx` 0.273 and shake 0, in two visibly different screenshots.
- **Touch** controls up while playing level 13 and gone the instant the capture takes over; **mute** with every new sound constructed and master gain 0; **Visual cues** giving `[the wall moves]` and `[it reaches]`; **pausing** while armed does not tick the safety net down and suspends the drone; quitting to the title stops it.
- **Soak**: **41,600 frames** over 4 modes x 2 calm settings x 2 cue settings of random play on level 13, wandering into the room at random - **64 captures reached the ending, 0 deaths, 0 exceptions**, every phase exercised.
- **Cost**: walking level 13 with the glow up **0.145 ms/frame**, the capture at its heaviest **0.226 ms/frame**, against level 12's **0.237 ms/frame** measured on the same machine at the same moment.

### Lessons

1. **A shape made of overlapping circles has no cheap erosion.** Shrinking each circle does not shrink the union, so "fill, then punch a smaller fill out" draws arcs through the middle of the body. Stroke every outline first and fill the union in black on top instead: the fill hides exactly the parts that should not be seen.
2. **A vignette of darkness on a dark game is invisible.** The dread vignette only started to read when it was drawn in the game's own danger red rather than in black.
3. **Assert the thing you are afraid of.** The warden's second shape reached through the room's floor and blocked the corridor below, cutting the level in two. The check that found it - "no tile outside the room may be blocked", and "the room must still be reachable from the start" - costs four lines in `build()` and is the reason it was a ten-minute fix rather than a mystery.

## v12.1: the capture plays every time (owner's instruction, MINOR)

Owner: "Change the level 13 capture cutscene so it plays every time the level is completed, not just the first time. Same full sequence each time."

v12.0 gave a second visit to level 13 a brief version - the warden already revealed, straight to black, about 1.9 s - on the principle that a cutscene plays once. The owner wants the whole thing, every time, so **the brief version is gone entirely rather than merely bypassed**: `SHORT_REVEAL` / `SHORT_BLACK` / `SHORT_DARK`, the `short` flag, the `short` branch in `approach`, `wardenTake(short)`, `taken(short)`, `onCaptured(short)` and the `setCaptureSeen` debug hook were all removed. Every path through `js/warden.js` is now the one path: approach -> armed -> reveal -> reach -> black -> dark, **5.43 s** from the reveal, identical on the first finish and the fiftieth.

**Nothing is written to `echomaze.seen` any more for it.** `seen.capture` was read for exactly one thing - which version to play - so with one version there is nothing to remember, and `settings().warden.seen` went with it. The key is not migrated away: a save written by v12.0 keeps a harmless `capture: 1` that nothing reads. The scan added to `tools/update-test-copy.ps1` in v12.0 (to pick up a scene marked seen by name) was reverted with it, since nothing marks one that way now.

**The warden is hidden again at the start of every attempt** (`start()` sets `lv.warden.revealed = false` unconditionally), so a ripple reads it as stone every time and the reveal is always the player's own doing. This is the one cutscene in the game that is not once-only, and it is worth saying why: the other seven are things that happened to somebody else and are remembered, and this one is what happens to *you*, every time you walk into that room.

It is still **unskippable** - the controls are gone from the reveal onwards, which is the point of the moment - and the owner asked for the full sequence each time rather than a way past it.

### Tests

- **Three finishes in a row on one save**, with nothing reset in between: identical all three times, to the frame - armed 0.00, reveal 0.13, reach 0.73, black 2.65, dark 4.37, done 5.57 s from walking in - and the warden hidden again at the start of every one of them. Then the leftover `capture: 1` a v12.0 save has was deleted and it was finished twice more: `echomaze.seen` came back byte-identical, so nothing writes it any more.
- The player's own ripple still triggers it every time, and the 7 s safety net still fires on a run where nothing is pressed.
- Levels 1-12 untouched: the 2,400-maze generator fingerprint `21bbeabe` and the five scripted games unchanged.
- **Soak re-run**: 41,600 frames over 4 modes x 2 calm settings x 2 cue settings, 54 captures, 0 deaths, 0 exceptions - and **every capture measured 5.43 s**, one value, no second version anywhere in it.

## v12.2: the glow stops at walls, and the warden is redesigned (owner's brief, MINOR)

Owner, two specific problems with what v12.0 built:

> **1.** You can see the large room's glow through walls before reaching it. It must still respect normal
> line-of-sight/occlusion like everything else - a wall between the player and the room must fully block it,
> exactly like walls block ripple echoes.
> **2.** The monster and its grab are just plain lines. [...] give it real shape and texture, matching the
> design language already used for every other monster [...] jagged, asymmetrical, with a rough stone-like or
> cracked texture that visually rhymes with the room's own walls [...] replace the straight lines entirely
> [with] shaped limbs - filled, tapered polygons [...] that visibly extend and thicken as they reach.

Both were fair, and the first one was measurable: **4 floor tiles of level 13 leaked**.

### 1. Occlusion

The exception the room's glow makes is to the RIPPLE, never to the WALLS. v12.0 only half enforced that:

- `outside` was `p.x < room.x0` - true of the corridor beside the room, false of **the corridor that runs
  underneath it** and the whole right-hand loop, which are at a greater x but behind a solid wall. On those
  tiles the wedge clip was skipped altogether and the entire room was drawn.
- The one line-of-sight test aimed at the **centre of the mouth TILE**, which sits on a tile corner from the
  dead end at (15, 8). A DDA aimed exactly at the corner of a wall tile slips diagonally between two of them,
  so that tile saw a bright wedge of room through a metre of stone.

Now (`js/warden.js`):

- **`insideRoom(p)`** is a real rect test on the room, not a test on x alone.
- **`mouthSight(p)`** returns 0..1: 1 inside the room, otherwise the fraction of `MOUTH_SAMPLES` = 7 points
  spread across the mouth's **room-side face** (`mouth.x + 2`, never the boundary itself) that `env.los` -
  the game's own walls-only DDA, `hasLOS`, the same one the visual sound cues use - can reach.
- `sight` smooths that: it eases UP at 9/s, so the light arrives as you come round into view, and **drops
  straight to the new value** when it falls, so stone really does block all of it with nothing trailing.
- Everything the room draws is multiplied by `glow * sight`, and the wedge clip through the mouth stays on
  top of that. `draw()` returns immediately when `glow * sight <= 0.004`.

**Measured, by sweeping every one of the 195 floor tiles on both builds** with the same independent oracle (a
2 px march over the tile grid to any of the room's 81 floor tiles - nothing to do with `hasLOS`), teleporting
to each tile, letting the glow settle and then summing blue-over-red across the whole canvas:

| | tiles the room is drawn on | tiles that leak |
| --- | --- | --- |
| v12.1 | 91 | **4** - (15, 8), (17, 11), (18, 11), (17, 12) |
| v12.2 | 87 | **0** |

91 - 4 = 87, so nothing legitimate was lost with them: the room still lights for the 81 tiles inside it and
the six corridor tiles (11, 9)-(16, 9) that look straight down the corridor at the opening, and nowhere else.
(`wardenState()` now reports `sight` and `lit` so this is checkable at a glance.)

### 2. The warden

**The circles did not change.** `BODY` is still the 24 circles a ripple hits and `moveCircle` stops you on -
so the level's collision, its `blocked` tiles and its ripple are all exactly what they were. What changed is
everything drawn on top of them, and it is all precomputed ONCE at load into fixed tables by a local xorshift
(`rng`, the same trick `js/art.js` uses). **It never calls `Math.random`** and it is never run again: the same
stone, in the same places, in every run of every mode.

- **`OUTLINE` - the crest.** The union of the circles is walked at 288 angles from `MID`, then resampled into
  ~40 facets of 24-58 px each, every one pulled INWARDS (by up to 4.5%, or 8.5-14% for the one in six that is
  a deeper cleft). Pulling inwards is not a detail: the drawn stone can then never claim a millimetre of room
  the solid body has not got, and the black punch-out still uses the true union so nothing shows through and a
  ripple's rays still end where the solid thing really is.
- **`COURSES`** - layers across it every 16-27 px, each **broken into blocks with gaps**, like the masonry of
  the room it is standing in. **`PITS`** - 130 small two-stroke chips. **`CRACKS`** - 10 forked runs of 5-8
  short kinks each (long straight ones read as scratches; that was the first cut). **`JOINTS`** - ticks cut
  back into the crest at the same two-in-five the game's own walls have (`EchoArt.wallTexture`).
- **`SEAM`** - one closed cleft in the upper third, well off the middle, drawn as a jagged lens that opens by
  a few px only while it is reaching. It is the one thing on the whole surface that is not stonework. **There
  are no eyes on it**, and it is not a mouth either - it is sealed.
- `rim()` was turned round: **black fill first** (the true union), then the crest on top with a faint fill,
  a glow stroke, a core stroke and its joints. v12.0 had to stroke every circle first and punch the union out
  over it; with one polygon that is no longer necessary.

**The grab.** `drawReach` drew five `quadraticCurveTo` strokes. It now draws **three limbs as filled, tapered,
jagged polygons** (`limbShape`: down one side of a quadratic spine and back up the other, the half-width
tapering as `(1-u)^0.75` and every step nicked by a fixed jag row), painted in the same three passes
everything else in the game uses - faint fill, wide dim stroke, thin core stroke. Two things make them read as
limbs rather than lumps:

- they are **rooted deep inside the mass** (`c.x + 1.6r`) and the reach is measured from the SURFACE
  (`u0 = 2.6r / distance`), so at 0 the tip is level with the crest and the limb is still a sliver inside the
  stone, and at 1 it is on the player;
- `thick` runs 0.16 -> 1.0 -> 1.26 across reach and hit, so they **extend and thicken** together.

Each arrives at its own side of the player rather than all three on one point, and the middle one opens into
**three short tapered claws** that splay as they come and shut on the hit. Nothing in the sequence is a line.

### 3. The pacing

| beat | was (v12.0/12.1) | now | what it is |
| --- | --- | --- | --- |
| reveal | 0.6 s | **0.5 s** | it lights up and NOTHING moves - a beat to look at it |
| reach | 1.9 s | **1.3 s** | the limbs come out, thickening; shake 3 -> 18 px; `wardenTake` swells |
| impact | - | **0.3 s** (new) | one hard flash, the room's light warps, 36 px floor kick, `wardenGrab` |
| black | 1.7 s | **0.8 s** | out - with the sound still going under it |
| dark | 1.2 s | **1.0 s** | black, and quiet |

**2.92 s** of picture from the reveal to full black (the owner asked for "roughly 2-3 seconds"), 3.92 s to the
ending screen. Sound: `wardenTake(reach, tail)` now takes the picture's own timings, so it peaks exactly on
contact and trails for 0.6 s past the end of the fade instead of being cut off by it; `wardenGrab()` is new -
a sub that drops from 96 to 23 Hz with a band of stone-coloured noise sliding 900 -> 180 Hz over it. The
room's own glow gains a 1.4 Hz, 20% warp from the reach onwards (2.2 Hz halved in calm mode).

**Flashing:** the hit is ONE pulse, full in a frame and gone in a third of a second, and there is no second
one anywhere - so the game's three-a-second limit is not approached. **Calm mode** keeps it (the rule is
softer, never removed): no floor kick at all, `dreadFx` capped at 0.45, and the flash at a fifth - measured as
**3.6x dimmer on screen** (mean pixel 31.1 vs 111.3 at the same instant). The reveal's flare, which v12.0
removed entirely in calm mode, is now scaled to 0.3 instead, for the same reason.

Visual cues gained the third beat: `[the wall moves]` -> `[it reaches]` -> **`[it has you]`**, plus a big
pulse at the player on the hit.

### Tests

- **Levels 1-12 are untouched.** The generator fingerprint over 12 levels x 4 modes x 50 seeds = **2,400
  mazes** (walls, blocked, obstacles, puddles, decoy, every monster incl. pitch, start, exit, `pathTiles`,
  `roomTiles`, the whole `cfg`) is **`c327ce51` on both builds, all 48 rows identical**, with `Math.random`
  stubbed to throw. **CORRECTION (found in v13.0): that fingerprint was worthless.** The harness called
  `generateLevel(cfg, seed)`, but the signature is `generateLevel(n, runSeed, modeId)` - so `n` was an object
  and it hashed the same degenerate level 2,400 times, which of course matched. Levels 1-12 WERE untouched
  (nothing here changed `js/level.js`, and the scripted games below run real levels), and the proper harness,
  now kept as `tools/generator-fingerprint.js`, gives `9097b344` on v11.6 and on v12.3 alike. The five scripted `tools/identity-test.js` games are identical too - `3504165c` /
  `feb0ec5b` / `23907df1` / `4e29d087` / `4e847fae`, 900 frames each, `artRandomCalls` 0 - and give the same
  hashes on a fresh page and on a page that has already staged level 13, so the harness is not carrying state.
- **The occlusion sweep** above: 195 tiles, 4 leaks -> 0.
- **The level itself is unchanged** (`wardenCheck`): 27x21, 195 floors, 7 dead ends, 1 way into the room, 81
  room tiles, start-to-room 74, door unreachable, 24 circles, 0 monsters.
- **Soak**: **41,528 frames** over 4 modes x 2 calm settings x 2 cue settings, 79 captures, 72 of them all the
  way to the ending, **0 deaths, 0 exceptions** - and every completed one measured **3.92 s, a single value**.
  `echomaze.seen` was still empty afterwards (v12.1's rule holds).
- **Cost**: level 13 walking **0.092 ms/frame**, the capture at its heaviest (limbs and claws fully out)
  **0.21 ms/frame** median of six runs, against level 12's **0.104 ms/frame** on the same machine at the same
  moment. Two of the six capture runs came back at ~78 ms - that is the browser pane stalling, not the game;
  the other four cluster at 0.18-0.22.
- Every new and changed sound constructed on a live (muted) AudioContext with no exceptions, and a full
  capture played through unmuted. Console clean apart from the title wordmark's 0x0-canvas `drawImage` error,
  which happens on v12.1 identically and only when the page loads with the browser pane hidden.

### Lesson

An occlusion test that aims at **one** point, and at the centre of a tile, is two bugs waiting to happen: the
single sample cannot express "you can see a bit of it", and a ray aimed at a tile centre from a diagonal
neighbour passes exactly through the corner where four tiles meet, which a DDA may let through. Sample a
short row of points on the far side of the opening instead, and let the fraction that get through be the
answer. The second half of it is not to describe a region by one coordinate: `p.x < room.x0` was a true
statement about the corridor beside the room and a false one about the corridor underneath it.

## v12.3: walking in is the trigger (owner's instruction, MINOR)

Owner: *"its supposed to happen as soon as you enter the room, not when you send a ripple."*

**This reverses the centrepiece of the owner's own v12.0 brief**, which asked at length for the capture to
wait for "the PLAYER'S OWN NEXT REAL RIPPLE PRESS [...] the player does what they've done on every other
level out of habit, and this time something answers". It was put to them in a sentence and they had already
decided, so it is built as asked. What was kept from the original idea is **the wave**: entering the room
fires the involuntary gasp `wardenGasp()` **immediately** instead of after seven seconds, so the wall still
lights up because something washed over it - which is the only way anything is ever seen in this game - and
the player simply does not have to press anything for it to happen.

### What changed

- `approach` -> the player crosses `INSIDE_PX` = 760 (two tiles past the gap, unchanged, and still what
  "clearing" level 13 means) -> `env.enteredRoom()`, `phase = 'wave'`, **`env.gasp()` at once**. The phase is
  set *before* the gasp on purpose: `wardenGasp` calls straight back into `warden.onRipple`, which refuses
  anything that is not in the `wave` phase.
- The `armed` phase is renamed **`wave`** - it is no longer waiting for input, only for the wavefront to
  cross the room - and `waitT`, `AUTO_SECONDS` and the whole safety-net idea are gone with it. Nothing can
  hold the sequence up any more, so there is nothing to have a net under.
- `onRipple(rp)` lost its `involuntary` argument. It is only ever called from `wardenGasp` now, so the
  distinction has nowhere left to live: a wave that reaches the warden reveals it on arrival
  (`distance / RIPPLE_SPEED`), and one sent from somewhere it cannot reach does so after `GASP_REVEAL` = 0.4 s.
- **`emitRipple` no longer calls `warden.onRipple` at all.** A ripple the player sends on level 13 is an
  ordinary ripple and nothing else - it still counts in `ripplesUsed`, still obeys the recharge and crouching,
  and has no bearing on the capture.
- `WAVE_FALLBACK` = 0.5 s: if no wave got sent at all, `doReveal(null)` runs anyway. Nothing in normal play
  reaches it (`wardenGasp` can only bail when `state !== 'play'`, and the transition happens inside
  `updatePlay`), and it is there so that can never become a soft lock.
- `settings().warden` reports `insideX` and `waveFallback` instead of `autoRippleSeconds`; `state()` reports
  `waving` instead of `armed` / `waitFor`. `EchoWarden` exports `WAVE_FALLBACK` in place of `AUTO_SECONDS`.

### Tests

- **Walk in with no key ever pressed** (the player nudged along by `tp`, zero input): `approach` -> `wave`
  at the instant of crossing x = 760 -> `reveal` **0.217 s later** (the wave crossing to the warden) ->
  reach -> impact -> black -> dark -> the ending, 4.13 s after entering. The HUD still says **Ripples 0**.
- **Identical while crouched** (0.217 s) and **identical while spamming the ripple key on the way in**
  (0.217 s) - the player's presses change nothing at all, and the one that got past the recharge counted as
  an ordinary ripple (HUD "Ripples 1"), so the gasp is still not one of yours.
- **Soak**: 41,518 frames over 4 modes x 2 calm settings x 2 cue settings, **92 captures, 82 all the way to
  the ending, 0 deaths, 0 exceptions**; every completed capture **3.92 s**, one value. The entry-to-reveal
  gap over all 92 ranged **0.03-0.25 s** (it is the wave's travel time, so it depends where in the room the
  player crossed the line) - always under `GASP_REVEAL` 0.4 and `WAVE_FALLBACK` 0.5, i.e. the wave path won
  every single time. `echomaze.seen` was still empty afterwards, so v12.1's rule still holds.
- **Levels 1-12 untouched**: generator fingerprint `c327ce51` over 2,400 mazes identical to v12.2 (**worthless -
  see the correction in v12.2's tests; the real fingerprint, `9097b344`, is identical to v11.6's**), and the
  five scripted identity games identical (`3504165c` / `feb0ec5b` / `23907df1` / `4e29d087` / `4e847fae`),
  `artRandomCalls` 0.

### Lesson (testing, not the game)

`updateHud()` is called from `frame()`, and the browser pane does not run animation frames while it is
hidden - so "Ripples 0" in a scripted test means *the HUD has not been repainted*, not that nothing was
counted. Reading it straight after `step()` gave a wrong answer twice before that was noticed. Force a
repaint (any option toggle calls `updateHud`) or read the number from the game rather than from the DOM.

## v13.0: lore fragments (owner's brief, MAJOR - new lore, and a new system)

Owner: collectible fragments hidden off the main path on levels 1-12, **revealed by ripple the same as any
other object (no special-casing the reveal)**; pinging one shows a written line or plays a short recording in
the cutscenes' formant voice; one per level; more on Easy, fewer or none on Hardcore; away from the critical
path; kept for good and viewable on a new screen built like the replay screen; optionally a bonus for all of
them; notes and recordings from the explorers who came before, connective tissue between the seven cutscenes,
building quietly towards level 13 **without ever naming the Warden**. The owner supplied the twelve lines.

### THE RULE: levels 1-12 did not move

A fragment is a new thing ON levels 1-12 - which is what the owner asked for - so the proof is not "nothing is
different" but "nothing that existed is different, and the new thing can touch nothing".

- **Placed after generation, from its own stream.** `EchoLore.place(level, n, mode, runSeed)` runs in
  `startLevel` AFTER `generateLevel` has returned. It reads the finished level and returns a new object
  (`level.fragment`); it writes nothing to the level. Its randomness is its own `mulberry32` seeded with
  `runSeed ^ imul(n, 0x85ebca6b) ^ 0x10a3f7c1` - a different constant from the level's own
  `runSeed ^ imul(n, 0x9e3779b1)` - so the generator's sequence is never drawn from. **`js/level.js` is not
  changed at all.** It never calls `Math.random` (spied: 0 calls over 960 placements).
- **Generator fingerprint: `9097b344`** on v11.6, on v12.3 and on this build (`tools/generator-fingerprint.js`,
  2,400 mazes, `Math.random` stubbed to throw). This is the FIRST honest run of that fingerprint since v12.1 -
  see the correction in v12.2's tests.
- **Simulation identity with fragments actually read.** The eight usual scripted games are identical to
  v11.6 - but they never wander far enough off the route to find one (a spy counted 0 reads), which proves
  nothing about the new code. So `tools/identity-test.js` gained `visit: N, at: {x, y}`: every N frames it
  stands the player beside a given spot and pings it. The spot is passed IN (from `placeFragment`), not looked
  up, so v11.6 - which has no fragments - is driven by identical inputs. **Seven runs** (Easy 2/4/6/9/12,
  Normal 8, Hard 10; with mimic reveals and a singer chase among them) **read 9 fragments between them and are
  identical to v11.6, `artRandomCalls` 0.** The voice, the line on screen and the save write reach nothing the
  simulation reads.

### Where one lies (`EchoLore.place`)

For every open tile: `extra = dS + dE - L` - how many tiles out of your way it is to walk there and carry on
(dS from the start, dE from the exit, L the shortest route). A tile on ANY shortest route has extra 0. The
fragment wants **extra >= 4 in a dead end**; failing that any tile at extra >= 4; then >= 2. It keeps clear of
the start (dS >= 4), the exit (a tile's width), and a tile's width of every puddle, the decoy and every
monster's spawn - so finding it is never the same act as walking into something.

**Chance per maze, by mode** (`CHANCE`): Easy 1, Normal 0.8, Hard 0.5, **Hardcore 0**. The FIRST draw of the
fragment's stream decides presence, the same number in every mode, so it is **nested**: a maze that has it on
Hard has it on Normal and Easy. A retry is the same maze, so the same answer; the level select makes a new
maze, so a new chance.

**Measured over 200 seeds x 12 levels x 4 modes = 9,600 mazes:** present 100% / 79.7% / 50.6% / 0%; nesting
never broken; **0 problems** (never blocked, never on the start or exit, never beside a puddle / decoy /
monster, never on the route, always reachable); on Easy **2,399 of 2,400 in a dead end** (one level-1 maze fell
through to extra 2); average detour **12.6 tiles on level 1 rising to 18.7 on level 12**; the same tile in
Easy and Normal 94% of the time (it moves only when that mode's own monsters or puddles are in the way).

### How it is found - "the same as any other object"

`castRipple` pushes it into the SAME `flats` list puddles and decoys use (`type: T_LORE` = 11, a flat mark,
never a ray - so `NRAYTYPES` is unchanged), so it is lit by exactly the same line of code: in range, line of
sight, not in a muffler's shadow -> a timed mark (`t = -d / RIPPLE_SPEED`, so it appears as the wavefront
arrives) and an echo event (`audio.echoLore`, a dry papery tick). The ONLY addition is a `lore: true` on the
mark: in `updateRipples`, when that mark's `t` first reaches 0 - the moment it lights up - `readFragment()`
runs, if `!m.singer` and `state === 'play'`. Consequences that fall out of reusing the path rather than being
written in:
- **Crouching** wipes `marks`, so a wave you crouch under before it arrives never reads it (tested: not read;
  the next ripple reads it).
- **A Singer's song** lights it (the mark is made, singer-tinted) but does not read it - that is not you
  pinging it (tested on level 12: lit, not read).
- **Once per attempt**: `level.fragment.read`. A second ping does nothing; a retry is a new attempt.
- Behind the **Muffler** it is in the shadow like everything else.

### Reading one (`EchoLore.createReader`, `#lore` in index.html)

- A **note** shows at once, set in italic (handwriting), for `2.4 + 0.055 s/char` (3.8-8 s), with
  `audio.loreNote()` (paper unfolding) and, with Visual cues on, `[paper, unfolding]`.
- A **recording** is typed out at its own `cps` while `audio.speak(text, voice)` says it, with
  `audio.loreLog()` (a key click and a bed of tape hiss) and `[a recording crackles on]`. Level 11's is **CUT**
  0.75 s after its last word: `audio.loreStatic()`, `[static]`, and the box vanishes with no fade (`.cut`).
- The head says `A note · 4 of 12 found` for a new find, just `A note` for one already found, and on the
  twelfth `... all 12 found · one more waits in Fragments`.
- It runs on the GAME's clock (`update(dt)` from `updatePlay`), so pausing freezes the typing (tested: 19
  characters before, 19 while paused, 30 after) - and the voice, being on the audio clock, freezes with the
  AudioContext that pause suspends. It is taken away on caught, level cleared, the title, a cutscene and a new
  level. It replaces the level banner (same place on screen). On touch it moves to the TOP, like the
  tutorial's prompt, because the bottom belongs to the joystick (measured: 534-641 of 720 on desktop, 64-153
  in touch mode).

**The voice.** `voice()` was split: `_syllable(code, vol, t, o)` is one syllable at a given time, and with no
`o` it is exactly what `voice()` always made - same maths, same single `Math.random` - so the cutscenes are
untouched. `speak(text, o)` schedules a whole line on the audio clock the way the cutscenes speak (a syllable
on every other letter at `cps`), and returns `{ stop(), seconds }`. Its syllables are deliberately NOT counted
by `_track`: a recording is bounded by its own length and must not crowd the monsters out of the polyphony
limit. `o.pitch` / `o.shake` / `o.vol` / `o.cps` make the speakers: level 5 is **1.22 pitch, 0.1 shake, 21 cps**
(the first recording, and the first voice that is frightened rather than careful); levels 11 and 12 are the
same last explorer, **lower (0.86 / 0.84), steadier, slower (17 / 15 cps), quieter**.

### Persistence and the Fragments screen

`echomaze.lore` = a JSON array of ids, **global, not per mode** (a find is a find). Every access in a
try/catch; with storage blocked a find still counts for the session and simply is not kept (tested: no
exception, `saved: false`). `found()` re-reads storage each time, so another tab's finds show up.

`#archive` is built the way `#replay` is (`showArchive` beside `showReplay` in js/game.js; the same `.scene`
rows and panel, in the paper colour instead of blue). A **Fragments** button on the title appears only once
something is found. Found notes show their text; found recordings are buttons that play again
(`playArchived`, with the static on level 11's); unfound ones say only `Level 9 · ???` - not even whether it is
a note or a recording, because which it is, is part of finding it. `Esc` goes back; Enter does not start a run.

**The bonus (the owner's optional stretch goal)**: once all twelve are found, a thirteenth row, *Tucked behind
the others*: "Every one of these stops before the last room. Nobody writes in there." **This line is mine, a
draft** - the owner asked for "one small bonus scene or line" and did not supply one. It keeps the rules: it
names nothing, it says nothing about where anyone was taken, and it spoils nothing about the reveal (a player
can collect all twelve before ever reaching level 13).

### The content, and the one line that was changed

The owner's twelve lines are used **verbatim except one**. Level 2 was *"Don't run when it sings. It only finds
you if you're moving."* That is the exact opposite of the Singer: its song marks where you ARE and it leaps
there, and its own cutscene ends "If its song finds you, keep moving" - a player who trusted the note would die
for it on level 12. **"sings" became "while it's listening"**, which is true of the echo monster (after a ripple
touches it, it listens for footsteps; standing still is silent) - the thing that first appears on level 2.
Flagged to the owner; it is one string in `js/lore.js` if they meant an explorer who had it wrong.

Checked against the owner's rules: no line names the Warden; no explorer is named or gendered (there are no
pronouns for people in any of them); level 8's door is level 13's door; level 3's decoy is foreshadowing (no
decoy exists before level 9, and "the north wall" is not a place in a generated maze - kept as written).

### Colour and art

A tenth ripple role, `lore`, in every palette (and `--lore-rgb` for the CSS). Each palette's colour was
searched for with `tools/palette-check.js`: warm, pale, low-saturation paper, dimmer than the exit (which must
stay the brightest thing), at least 4.5:1 on black, and **further from all nine existing colours than that
palette's own closest pair already was, under every vision the palette targets** - so no palette got harder to
read. Default `220,205,175` (its nearest neighbour 18.6 away, the palette's worst pair 11.9); red-green
`135,125,110` (18.1 vs 16.9 - that palette is tight: only 35 colours in the whole search passed); blue-yellow
`175,185,140` (14.9 vs 13.7); High contrast `220,205,180` (18.3 vs 17.2).

`EchoArt` kinds `note` (a page tilted a little, a dog-ear folded down, a torn bottom edge, lines of writing) and
`log` (a cassette: two reels turning very slowly, a label, the head window) - **no antenna and no ring**, so the
one other small device in the game, the sonar decoy, cannot be mistaken for it. Both inside radius 1 (true
size, `R` = 11 px). One title legend row, "Left behind", shows both.

### Other tests

- Hardcore: 0 fragments over all 12 levels; none on the tutorial or level 13.
- **Soak**: 30,623 frames over 4 modes x 2 calm x 2 cue settings x all 12 levels (192 level starts), cycling the
  four palettes and drawing throughout, with the player walked to the fragment in most of them: 110 mazes had
  one, 77 were read, all 12 ended up found, **0 exceptions**.
- Every new sound constructed on a live AudioContext without error.
- The test copy (`tools/update-test-copy.ps1`) now also marks every fragment found, reading the ids from
  `js/lore.js`, so its Fragments screen is full and shows the bonus.

### Lessons

1. **Test the test.** The generator fingerprint had been passing for two versions while hashing nothing: it
   called `generateLevel` with the wrong arguments, got the same degenerate level every time on both builds,
   and "matched". A fingerprint that cannot fail is not a fingerprint. It now prints a `sanity` field (the size,
   the monsters and the path length of one real level 12) so a wrong call is visible at a glance, and it lives
   in `tools/` instead of being retyped by hand, which is how the mistake got in.
2. **Make sure the new path is inside the proof.** The usual identity games all passed - and never read a
   single fragment. A counter on the new code (a spy on `markFound`) is what showed that, and the harness then
   needed a way to drive the player to it that is identical on a build without it (`visit` / `at`).
3. **`$(` in a shell substitution eats jQuery-style calls.** A perl replacement containing `$('btn-archive')`
   silently dropped the `$(...)`, leaving `.classList...` on its own line - caught only by a syntax error on
   load. Edit anything containing `$(` with the Edit tool.

## v14.0: levels 14-16 - the gaol, the false exit, the upgraded Warden (owner's brief, MAJOR)

Owner: three fixed, hand-authored levels built the same way as level 13, following straight on from the capture.
**14, the gaol**: no enemies; cinematic (wake-up, ripples revealing bars and stone, dripping, a deliberate reveal
of the key, the door unlocking, a final beat walking out); a new KEY mechanic - a ripple-revealed floor object
like puddles, decoys and fragments, its own look and pickup sound, a carried indicator, the exit locked with
feedback until it is picked up. **15, the false exit**: light peeks through ahead as if it opened on the world -
warm light, a softer sound, a clear path - and it is the Warden; it reveals itself, then you escape it for the rest
of the level; reuse the v12.2 look and sound. **16**: another Warden, stronger, its own layout and feel, fair.
**The Warden's behaviour**: detects everything (ripples, noise, scent, crouching, muffling and decoys neither hide
nor distract), **75%** of the player's normal walking speed on 15 and **105%** on 16, both named constants in
one place, structured so abilities can be added per variant without a rewrite, **and no invented abilities**;
touching it is a death by the same touch rules, with the death tips and near misses. Levels 1-12 untouched
(prove it with `tools/generator-fingerprint.js`), no lore fragments on 14-16, no explaining what the Warden is.

### Levels 1-12 did not move

- **Generator fingerprint `9097b344`** - the same as v11.6 and v13.0 - with the sanity field describing a real
  level 12 (37x29, echo + singer, 72 path tiles). `levelConfig` and `generateLevel` gained one early return
  each for `isStoryLevel(n)` (14-16), **before** `mulberry32` is constructed, exactly like the tutorial's and
  level 13's; no level 1-12 config changed (the fingerprint hashes every `cfg`).
- **Eleven scripted `tools/identity-test.js` games identical to v13.0**: the usual eight (normal L3/s5, easy
  L5/s11, hard L7/s3, normal L8/s7 with mimic reveals, hardcore L9/s2, easy L10/s6 with cues, hard L11/s4 chase,
  normal L12/s9 chase - 1,200 frames each: `5e02174d` / `67675ca5` / `d72d0668` / `e44f30fa` / `820d314c` /
  `ed3f918f` / `e15cce08` / `490fcf8f`) and three that really READ a lore fragment (`visit`/`at`: easy L4/s3,
  normal L8/s7, easy L12/s2 - `a36ce892` / `e84d1c34` / `dd6b13f3`, 3 reads on each build), because the flat-object
  code those go through (`castRipple`'s `flats`, the marks loop) is where the key was added. `artRandomCalls` 0.
- **Level 13's stone is identical, cut for cut.** `js/warden.js`'s table builders were made generic
  (`carveOutline`, `carveJoints`, `carveCourses`, `carveCracks`, `carvePits`, `carveSeam`, `carveJag`) so the
  hunting Warden is carved by the same code. Proved by evaluating v13.0's `warden.js` with its tables exported
  and comparing JSON: OUTLINE, JOINTS, COURSES, CRACKS, PITS, SEAM and LIMB_JAG all identical, and `BODY` and
  `MAP` too. `wardenCheck()` on 13 unchanged (27x21, 195 floors, 7 dead ends, 1 mouth, 74, door sealed, 24 circles).
- Every new branch in `js/game.js` is behind `level.story`, `e.kind === 'warden'`, `rp.ambient` or `scriptLock`
  (always false on 1-12), and `makeEnemy` draws exactly the same `Math.random` numbers for every other kind.

### Where it lives

- **`js/story.js` (`EchoStory`)**, loaded after `js/warden.js`. `build(n, cfg)` returns the maze in exactly the
  shape `generateLevel` returns (plus `level.story`), and draws **no random numbers at all**. `create(env)` is the
  scripted beats, the drips, the false light and the speech line; it can only do what `env` lets it (take/give the
  controls, walk the player, open a tile, wake/hold/reveal the Warden, send a drip, speak, set the key, change the
  music mood, show the banner, say the level is done). Map legend: `#` wall, `.` floor, `S`/`X` start/way out,
  `b` a row of bars across the tile, `o` an open cell door, `D` the gaol door, `K` the key, `W` a Warden, `P` a
  sealed passage, `p` a pillar, `d` a drip. **`build()` asserts the things the levels depend on** (as level 13's
  does): the way out reachable once everything opens; on 14 and 15 NOT reachable before (on 14 that is the whole of
  "the key cannot be skipped"); on 16 the Warden's pocket sealed in; the key reachable.
- **`js/level.js`**: `STORY_FIRST` 14, `STORY_LAST` 16, `isStoryLevel(n)`, `storyConfig(n, mode)` (the plain curve
  for that level and mode, every generated monster/puddle/decoy zeroed - level 13's rule). **`WARDEN_SPEED = 0.75`
  and `WARDEN_UPGRADED_SPEED = 1.05`** live here, beside the other monster speed constants, as fractions of the
  player's walking speed (`WALK_SPEED` 170 in game.js). Those two numbers are the whole of the Warden's tuning.
- **`js/warden.js`**: `VARIANTS` (`regular`: speed `WARDEN_SPEED`, r 18, sealed seam; `upgraded`: speed
  `WARDEN_UPGRADED_SPEED`, r 18, the seam standing a little open and brighter edges - drawing only), **`ABILITIES` =
  `{}`** and `abilitiesOf(id)`. An ability is an object of optional hooks the hunt calls at fixed points -
  `start(e, api)`, `update(e, dt, api)`, `speed(e, px, api)`, `draw(ctx, e, o)` - so a new one is an entry in
  ABILITIES plus its name in a variant's list, and the hunt is never rewritten. Both lists are empty (owner: do not
  invent abilities). `drawHunter(ctx, x, y, r, o)` draws it.
- **`js/game.js`**: the Warden is an ordinary member of `enemies` (`kind: 'warden'`) - so the catch, near-miss,
  heartbeat/danger, death-tip, Doppler and wall-muffling code all apply to it - with `updateWardenHunt`,
  `wakeWarden`, `storySolids`, `visibleFrom`, `drip`, `onStoryCleared`, `onStoryEnd`, and the controls lock
  `scriptLock` / `scriptWalk`.

### The hunt (`updateWardenHunt`)

States: `dormant` (in the stone - solid like a wall, silent, never deadly, skipped by danger and near misses) ->
`hunt`. While hunting it re-plans `setPathTo(player)` **every frame** - it knows where you are, always - and
`followPath` moves it `speed x dt` along that path. Nothing else reaches it: `touchMonsters` only handles echo /
mimic, the listeners and scent code filter by kind, and **`callMonsters` skips it** (no decoy exists on 15-16, but
if one did it would not be distracted). `held` freezes it for the level's last beat. **Touch = death by the same
rule as every monster - circles overlapping** - with its own circle (`e.r + PLAYER_R` = 27 px, because it is
bigger than a monster's 14); the near-miss margin is 1.5x that reach, the same rule as the others. Its `why` is
`hunt` (15) or `upgraded` (16), and `js/feedback.js` has three tips for each that say what it DOES, never what it
is; the stats count it as `warden`, shown in Settings as **"Hunted down (levels 15-16)"** - the name "Warden" is
never on screen.

**Measured speed** (on the real levels, after the real reveal / release, both moving along a straight corridor,
a 1.5 s window): player **170.0000 px/s**; regular Warden **127.5000 px/s = 0.75000x**; upgraded **178.5000 px/s =
1.05000x**. Note for the owner (reported): 178.5 px/s is faster than EVERY other monster's walking/chasing speed in
the game (all are capped under 170); only the Singer's leap is faster. Built as specified.

### Level 14: the gaol

27x11 tiles: a corridor of eight barred cells (four open, four shut), the gaol door at its east end, and a short
passage beyond it to the way out. **Bars** are ordinary obstacles (`bar: true`, r 3.4, three per tile across its
middle, 6-7 px apart): the player (18 px across) cannot pass, a ripple's rays can, so a ripple shows the cells
dashed through their fronts; drawn with `EchoArt` `bar`. **The gaol door** is a slab of three overlapping circles
(r 8 at -12 / 0 / +12 px) filling its doorway, so what a ripple finds and what stops you is the shape drawn
(`EchoArt` `door`: slab, two bands, rivets, keyhole, swinging back on its hinge as it opens), in the way out's
colour with the way out's bell (its three parts ring once: they share one echo bin). **The key** is pushed into
`castRipple`'s `flats` exactly like a puddle, decoy or fragment (`T_KEY` = 12, a flat mark, so `NRAYTYPES` is
unchanged), with `EchoArt` `key` (ring bow with a hole, shaft, two teeth), `audio.echoKey`, and a `key: true` on
its mark. **The beats**, all on the game's clock (pausing freezes them):

1. **Wake** (4.6 s, controls taken): black; `audio.wakeUp` (ringing ears, three slowing heartbeats - none in calm
   mode); the dark lifts over 2.6 s; a breath; a drop lands beside you and its ripple shows the cell and its bars;
   "...Still breathing." Then the controls, and 1.8 s later the hint banner (after the line, not over it).
2. **The door, locked**: pushing into it rattles it (`audio.doorRattle`, `[the door rattles: locked]`, an exit cue
   at the door); the first time, "Locked." - and the drop over the key starts (it lands on metal: `dripMetal`).
3. **The key's moment**: the first time a wave (yours or a drop's) lights the key while you have line of sight to
   it within 380 px, the controls go for 1.6 s and the camera leans towards it (`camera()`, 0.7 of the way; 0.45 and
   slower in calm mode), `[metal glints]`, "A key."
4. **Pickup**: walk onto it - `audio.keyPickup`, `[you take the key]`, HUD **Key** (in the key's colour) and a
   small key drawn at your side.
5. **Unlock** (2.5 s, controls taken): the key turns, the bolt draws back, the door grinds open and swings (shake 3,
   none in calm); at 2.0 s the slab stops being solid and its tile opens.
6. **Out**: reaching the way out walks you on south for 3.4 s while the cold comes up the passage
   (`audio.draught`, `[cold air]`), "Out. Not free. Just out.", fade to black - and level 15.

**The key cannot be skipped** (tested): a bot that never takes it pushed on the door for 60 s (34 tries) and never
got through; pushing into it from five angles stopped the player at x = 923.04 (the slab's face at 932 minus the
player's 9); a closed cell's bars held at y = 152.4 (140 + 3.4 + 9); and the way out is unreachable on the map
while the door is shut (`build()` asserts it).

**Drips** (`env.drip`, levels 14 and 16): `castRipple(x, y, 76, { ambient: true })` - the real ripple through the
same code as yours, lighting walls, bars and the key the same way - drawn at 0.62 alpha, with **no echoes**,
**no monster touches**, and kept by a crouch (like a singer's wave: it is not yours). `audio.drip` (muffled through
walls like every placed sound) and a `drip` cue. Each spot drips on its own period from a private xorshift.

### Level 15: the false exit

31x23 tiles. The first part winds to a junction; from there a straight passage of 17 tiles runs east to where the
Warden stands, dormant, filling the passage's end. **The light**: drawn on its own, warm (`255,214,160`), the
second deliberate exception to "you never see without a ripple" - and held to level 13's rule that it is an
exception to the ripple, never to the walls: everything is clipped to `visibleFrom(player)` (a 360-ray
line-of-sight polygon from where the player stands) and multiplied by `sight`, the fraction of six points across
the light the game's own `hasLOS` can reach. It is a pool of warm light, the stone around it lit warmly (240 rays
cast once from the light), a glare, and a crack of light in what looks like stone - the Warden's seam
(`drawHunter` with `lure`). **Sweep over every floor tile** with an independent oracle (a 2 px march to a spread of
points in the glare), counting warm pixels on the canvas: **drawn on 12 tiles, the oracle sees it from 12, 0 leaks,
0 missed.** Hope, on purpose: the first time it is in view, "...Light?", the `hope` mood (major pentatonic, the
warmest in the score) and `audio.startDaylight` - air and a warm major chord that grow as you get nearer
(`setDaylight`), and now and then birdsong; within 420 px, "Is that... outside?". The real way out is **silent**
until the reveal (`exitMuted`): it is behind sealed stone, and a chime from elsewhere would give the lie away.

**The reveal** (controls taken when your front is within 150 px of it): the soft sound is CUT dead, the music
stops, the light dips twice (under 2 Hz; a plain dimming in calm mode) and goes out; you flinch - the same
involuntary ripple as level 13 (`env.gasp`) - and when that wave REACHES it (its travel time, worked out), it is
shown for what it is (`litByWarden` re-colours the rays that came back as stone), `wardenReveal` + a short
`wardenTake`, a flare (x0.3 in calm), shake (none in calm), `[the light moves]`, and its limbs reach towards you -
level 13's limbs, at its size (`reach` 0.55, then back). At 1.0 s the sealed passage 2.4 tiles behind you cracks
open (`stoneGrind`, shake 9, `[stone grinds open behind you]`); at 1.85 s the way out starts to chime, the `hunt`
mood starts, and "Run."; you have the controls at 1.9 s; **it starts after you at 2.6 s** (`REVEAL_WAKE`).

### Level 16: another one

37x26 tiles, its own shape: an antechamber, a long corridor, two **galleries with pillars**, two long switchbacks
between them and a final run down to the way out, with **water dripping along the way out** (seven drip spots on
the route, none in the five short dead ends) - "follow the water" is in the level's hint, and it is what makes a
blind escape from something faster than you fair. Its own sound: water moving under the floor
(`audio.startCistern`), the `cistern` mood, and the upgraded Warden's heavier steps, which kick the screen a
little when it is close (not in calm mode). The upgraded Warden is sealed in a pocket behind the antechamber
(`build()` asserts nothing can reach it). **The release**: stepping into the first gallery - stone splits far behind
you (`stoneSplit`, panned to it, shake 7, `[stone splits, far behind you]`), the seal opens, "Another one."; you
have the controls at 1.6 s (and the `hunt` mood, and a message 1.4 s later: "Faster than you"); **it comes out of
the wall at 3.0 s** (`RELEASE_WAKE`). That 1.4 s is part of the head start, and the head start is what makes it fair.

**Fairness, measured** (`tools/story-bot.js`, Normal; the gap is ALONG THE PATH between their tiles, not through
walls): a clean run reaches the way out **560 px** ahead of it; one 2-tile wrong turn **440**; two **360**;
standing still 1 s **400**, 2 s **200**, 3 s **caught**; two wrong turns plus wandering back through the second
gallery **caught**. So it slowly catches you if you make mistakes - about three seconds of hesitation in all, or a
few wrong turns. (Before the 1.4 s was added a clean run arrived only 320 px ahead - two wrong turns and you were
dead - which was too tight for a blind player.) Level 15, for comparison: a clean run leaves it 600 px behind.

### Integration (the owner asked for these to be flagged)

- **Difficulty modes and calm mode: level 13's rules.** The same mazes in every mode; the ordinary curve's ripple
  range and recharge for 14-16 (the range is at its floor: 288 / 247 / 211 / 204 px, recharge 1.2 / 1.455 / 1.725
  / 1.8 s); **the Warden's speed is the same in every mode** (the owner gave exact fractions; flagged - it is the one
  thing a mode could scale if wanted); Hardcore is one life (caught on 15/16 -> the title with the tip). Calm mode
  removes every shake (story `quake`, the upgraded Warden's step kick), softens the reveal's flare to 0.3, the
  light's flicker to a plain dimming and the startling sounds; the gameplay is identical (the bot's leads at the
  way out are the same with it on).
- **No "Level cleared" screen between 13, 14, 15 and 16**: each hands straight on to the next (`env.finish` ->
  `onStoryCleared` -> `saveBest(n+1)`, `addClear`, `startLevel(n+1)`), starting in the dark the last ended in. The
  "Progress saved" toast waits for the next level's first release of the controls (`savedPending` / `env.ready`).
- **Medals: none for 13-16** (`MEDAL_LEVELS` stays 12). **Progress / level select**: `CAMPAIGN_LEVELS` =
  `STORY_LAST` = 16; the level grid shows 1-16 (13-16 without pips); best 17 = "Finished". An old save that
  finished v13.0 (best 14) now reads "Best: Lv 14" and offers **Continue (Level 14)**. **Replay screen**: no new
  cutscene entries - the beats are in-level, like the capture; levels 13-16 are replayable from the level grid.
- **The ending moved.** v12.0-v13.0 showed the `#ending` stub straight after level 13's capture (`onCaptured`).
  Now the capture hands on to level 14 (`onCaptured` -> `startLevel(14)`), and the stub (`onStoryEnd`, text "Behind
  you, the stone settles. Ahead, the dark goes on." + "This is as far as the maze goes for now...") comes after
  level 16's way out. There are still no credits anywhere in the game.
- **Lore fragments**: untouched; `EchoLore.place` returns null for any level without a fragment, so 14-16 have none.
- **A bug found and fixed on the way**: Settings -> Stats & Medals counted the whole campaign (13 levels, "of 39"
  and an always-empty cell 13) while the title said "of 36". It now asks `env.medalLevels()`: 12 cells, "of 36".
- **A latent bug found and NOT fixed (flagged)**: level 13's `JOINTS` have never been drawn - `rim()` passes
  `[x1, y1, x2, y2]` rows to `lines()`, which wants `[[x, y], ...]`, so every `moveTo` gets `undefined` and the
  canvas ignores it. Left alone so level 13 looks exactly as the owner approved it in v12.2; the hunting Warden
  copies that approved look (no joints). Switching them on is a one-line change in `rim()`.

### Words on screen (none of them explains what the Warden is)

The player speaks for the first time - in the cutscenes' formant voice (`audio.speak`, pitch 0.94), typed in a box
labelled **You** (`#say`, the lore line's plate; at the top in touch mode): "...Still breathing." / "Locked." /
"A key." / "Out. Not free. Just out." (14) - "...Light?" / "Is that... outside?" / "Run." (15) - "Another one." (16).
Hints: 14 "Somewhere in here is the key. The door at the end will not open without it." / 15 "Keep going. Somewhere
ahead, the dark gives way." (the lure, on purpose) / 16 "Somewhere below, water drips towards the way out. Follow it,
and whatever happens, keep moving." The ending stub as above. Captions for every sound (Visual cues).

### Look, sound, colour

- **The hunting Warden** (`drawHunter`): six overlapping circles in a design space of radius 72 (facing +x), carved
  by the same functions as level 13's mass with its own seeds and smaller facets, drawn at r 18 in the same passes
  (black punch of the true union, faint fill, glowing crest, core line, courses, chips, forked cracks, the seam),
  facing the ripple's origin like every monster. It is drawn only when a ripple lights it (`drawLit` T_WARDEN with
  `c.enemy`); before it shows itself it is STONE to a ripple (T_WALL with `warden: true`, re-typed by
  `litByWarden`), level 13's trick. The upgraded one's seam stands open and its edges are brighter (drawing only).
- **Sound**: `_wardenVoice` - level 13's drone (the tritone, the noise through a waveshaper) made into a voice that
  walks, with the usual wall muffling and Doppler, heard from 950 px; `wardenStep` (heavier for the upgraded one);
  `wardenGrab` when it catches you. Plus `wakeUp`, `drip`, `dripMetal`, `echoKey`, `keyPickup`, `doorRattle`,
  `doorUnlock`, `doorOpen`, `draught`, `startDaylight`/`setDaylight`/`stopDaylight`, `birdChirp`,
  `startCistern`/`stopCistern`, `stoneGrind`, `stoneSplit`; moods `gaol`, `hope`, `hunt`, `cistern`
  (`music.start` now also takes a mood's name). **All built and checked on a live AudioContext, none heard by ear.**
- **Cues**: two new glyphs - `warden` (an uneven block with a seam of light) and `drip` (a falling drop, wall
  colour) - in the title's cue legend too.
- **Colour**: a `key` role, kept out of the nine-way check like `warden` (the gaol holds only walls, bars
  = obstacle, the door = exit and the key). Picked with `tools/palette-check.js` as the nearest to old brass whose
  nearest neighbour among those three, under every vision the palette targets, is further than the palette's own
  worst ripple pair (+2): default `235,210,135` (14.0 vs 11.9), red-green `235,205,130` (22.5 vs 16.9), blue-yellow
  `240,205,125` (16.1 vs 13.7), High contrast `215,220,175` (19.2 vs 17.2). The warden colour against level 16's
  walls / pillars / exit: 24.9 / 17.5 / 27.5 / 25.0 (default / protan / tritan / contrast).

### Other tests

- **Completable on every difficulty**: `StoryBot.run` (real key presses, BFS over the live map) cleared 14, 15
  and 16 in all four modes, and again with calm mode on - 14 in 17.65 s, 15 in 20.35 s, 16 in 21.48 s.
- **Soak**: 58,100 + 11,992 frames of random play (random headings, pings, crouches, pause/resume, the player
  stood by the key / the door / the light / the tripwire) over 4 modes x calm x cues x levels 14-16, drawing every
  third frame: **0 exceptions**, 40 deaths to the Warden, every phase reached.
- **The hand-offs**: 13's capture -> level 14's wake in the same black (4.1 s from walking in); 14 -> 15 -> 16 ->
  the ending; Hardcore caught on 15 -> the title with the tip; Normal caught on 16 -> Try again restarts 16 from its
  own beginning, the Warden sealed in again.
- **Pausing** mid-beat freezes it (beat clock 1.0 -> 1.0 while paused); **touch**: the controls are hidden while a
  beat has them, and the speech box moves to the top.

### Lessons

1. **Measure the chase along the path, not through the walls.** The bot's first "closest the Warden came" said
   93 px on level 16 - in the switchbacks, where it was one wall away and 15 tiles of walking behind. The number
   that decides a catch is the distance it has to walk.
2. **A fair escape from something faster than you is built out of a head start, and the head start has to be
   measured.** The first layout looked generous on paper (15 tiles) and left a clean run 320 px ahead - two wrong
   turns from death, for someone who cannot see. 1.4 s more of it climbing out of the wall made it 560.
3. **Two things that share the bottom of the screen will meet.** The level banner and the new spoken line sat at
   12% and 11%; on level 14 the hint arrived while "...Still breathing." was still up. A spoken line now clears the
   banner, and the hints that follow a line wait for it.

## v14.1: the Caught screen fits the Warden (owner's instruction, MINOR)

Owner: *"when i got caught by the warden it said the echo found me, update it to fit the warden"*.

`#caught-text` was a fixed line, "The echo found you.", for every death. `onCaught` now writes it every time:
**"It never lost you."** when `cause === 'warden'` (levels 15-16), and "The echo found you." for everything else -
so a Warden death never leaves its line behind for the next one. It says what the Warden did (it always knew where
you were), never what it is - the owner's rule since v13.0. Constants `CAUGHT_TEXT` / `CAUGHT_TEXT_WARDEN` beside
`onCaught`. The death tips under it already had their own Warden lines (v14.0).

**Also fixed while checking it:** a banner still up when you are caught (a level's hint, or level 16's "Faster than
you") showed on top of the Caught panel. `onCaught` now clears it, the same way it already clears a lore fragment's
line. In real play this needed a death within the banner's 4.5-6.5 s; the bot met it because it plays far faster
than real time.

**Tests:** caught by the Warden on 15 and 16 -> "It never lost you." with the variant's tip; then caught by an echo
monster on level 3 -> "The echo found you." again; the banner gone and the panel clean in a screenshot. Levels
1-12: generator fingerprint `9097b344`, and three identity games that die 28 times between them (normal L8/s7
reveals, hard L11/s4 chase, normal L12/s9 chase) give `e44f30fa` / `e15cce08` / `490fcf8f`, unchanged.

## v15.0: the level editor, part 1 of 3 (owner's brief, MAJOR)

Owner: a level editor in three stages - (1) this core editor, (2) extra objects, effects and polish, (3) sharing.
**Part 1 only: levels are private** - no sharing, no export/import UI, no level codes, no network calls, no accounts;
no lighting/glow, floor objects, thumbnails or touch support (part 2). Built so both can be added without a rewrite.
Levels 0-16 and the generator unchanged. A spoiler gate; mouse-only tools (walls draw/erase/move with a region
select, start, exit, every enemy from the game's own definitions, title, undo/redo, clear all with a question);
test-play with the real engine and back to the editor intact, writing NO save data; validation (start, exit,
reachable) with friendly errors, unfinished drafts saveable but not playable from My Levels; My Levels (list, play,
edit, rename, delete with a question); plain versioned data behind one storage module (list/get/save/delete) with
the format written down; an untrusted-data loader; the test copy unlocked with sample levels.

### Where it lives

| File | What | Depends on |
| --- | --- | --- |
| `js/levelformat.js` (`EchoLevelFormat`) | the saved format: `normalise` (untrusted in, never throws), `toStorable`/`serialise`, `blank`, `copy`, `wallGrid`/`encodeWalls`, `cleanTitle`, `newId`, `LIMITS`, `SCHEMA_VERSION`, `MIGRATIONS` | `monsterType` (js/level.js) only - no UI |
| `js/levelcheck.js` (`EchoLevelCheck`) | `check(doc)` -> `{ playable, errors, warnings, pathTiles }`, each with a sentence and the tiles it is about | `bfsDist`, `EchoLevelFormat` - no UI |
| `js/levelstore.js` (`EchoLevelStore`) | `list / get / save / delete`; source `local` = localStorage, one key per level `echomaze.level.<id>`; `register(source)` for later ones | the two above |
| `js/level.js` | `MONSTER_TYPES` + `monsterType` + `monsterChoices()`; `CUSTOM_CURVE_LEVEL` (12) + `customConfig(mode)`; **`buildCustomLevel(data, mode)`, the engine's loader** | |
| `js/dialog.js` (`EchoDialog`) | the in-game confirm / rename questions (`open({title, text, input, buttons, cancel})` -> Promise) | DOM |
| `js/editor.js` (`EchoEditor`) | the editor: its own model + history, tools, drawing, the panels | everything through `env` |
| `js/mylevels.js` (`EchoMyLevels`) | the list screen | `env` |
| `js/game.js` | the gate, the screens (state `'editor'`, `editorScreen` gate/list/editor), `playCustom` / `startCustom` / `leaveCustom`, `CUSTOM_LEVEL`, `customRun`, and the custom branches | |
| `docs/level-format.md` | **the format, written down** (fields, ranges, playable rule, foreign levels, how to extend it) | |

### The gate - the flag and the condition (the owner asked to be told exactly)

`editorUnlocked() = store.get('echomaze.editor') === '1' || MODE_ORDER.some((m) => isFinished(getBest(m)))`.
The flag is written only by **I understand** (`acceptGate`), kept for good. The auto-unlock is **the very test the
title uses to write "Finished" on a mode**: `isFinished(getBest(m))`, i.e. the best level kept for that mode in
`echomaze.progress` is past `CAMPAIGN_LEVELS` (16) - only clearing level 16 (the ending stub) does that. It is worked
out live, never written. Tested: no flag + nothing finished -> the warning; Back / Esc -> title, nothing saved; I
understand -> My Levels, flag '1', never asked again after a reload; progress 16 everywhere -> still locked; only
Hardcore at 17 -> unlocked with no flag written. The warning names no monster and no story ("...every monster and
mechanic in the game - including ones you may not have met yet").

### Custom levels in the engine

- **One path with 13-16.** `buildCustomLevel` normalises and checks the data, then returns exactly the shape
  `EchoStory.build` returns (walls, blocked, enemies with tile + px + pitch, start, exit, pathTiles, `cfg`) plus
  `level.custom = { id, title }`; `startLevel(CUSTOM_LEVEL)` takes it instead of `generateLevel`, no fragment. From
  there it is the same game: same ripples, monsters, touch rule, death tips, near misses, cues, muffling.
- **Tuning**: no level number, so `customConfig(mode)` = the plain curve of `CUSTOM_CURVE_LEVEL` = 12 in the mode
  picked on the title (ripple, recharge, monster speeds and hearing), every generated monster/puddle/decoy zeroed
  like 13-16. Ambience and music: level 12's. **My choice, flagged** - it could become a per-level field later.
- **Wardens hunt from the start** (no story beat to wake them): `wakeWarden(e, variant === 'regular' ? 'hunt' :
  variant)` right after `makeEnemy`, at their variant's speed; their tips and "It never lost you." as on 15-16.
- **Writes nothing**: `levelNum` = `CUSTOM_LEVEL` (-1) so `scored()` is false; the three stats that were not behind
  it (`marked`, `decoys`, `addDeath`) now are (no change on any scored level: the tutorial is the only other
  unscored one and has no singer, decoy or death). No medals, no `saveBest`, no Hardcore one-life (a custom level
  offers Try again on every mode - not a run), and the Caught / Complete / Pause buttons say **Back to the editor**
  or **Back to My Levels**. The banner says "Test play - nothing you do here is saved" and is cleared on Complete.
- **Test play** (`playCustom`): builds first; refuses with the loader's sentence if it cannot; else fades into the
  level. `leaveCustom` returns to the editor exactly as it was (its model is its own; the game never touches it) or
  to My Levels.

### The editor (choices I made where the brief left it open)

- Its own model (grid + things) and snapshot history (200 steps; one stroke / click / move = one step; the title is
  one step per edit); a separate `toDoc()` produces the format, so the format never depends on the editor.
- **New level** = 31 x 21, a ring of wall, nothing placed. **Sizes**: Small 21x15, Medium 31x21, Large 41x29, Huge
  51x35 (the format allows 5-61 x 5-45; another size from data shows as "This level"). Growing adds **solid wall** to
  dig into; shrinking asks first if anything would be cut off. Anchored top-left.
- **Wall** never builds over something placed; right-drag rubs walls out. **Erase** clears walls and anything on
  the tile. **Start / Exit** on a wall clear that wall; refused on a monster or each other. **Monster** only on empty
  floor; at most 40; drag to move, right-click or Delete to remove. **Select**: drag a box; drag the box to move its
  walls AND what stands in it; where it lands its tiles replace what was there, but **it never lands on something
  placed outside it** (red box, refused with a sentence) - so a move can never destroy or bury anything; dragging one
  thing with Select moves just that; Delete clears the box. **Clear all** asks first and is undoable (walls back to
  the ring, start/exit/monsters gone, title and size kept).
- **Validation** (`EchoLevelCheck`) beyond the brief's three, because each would break play: start or exit inside a
  wall, start and exit on one tile, a monster inside a wall, a monster on the start (instant death). A monster on the
  exit is only a warning. The editor can never make an in-wall monster itself; data from elsewhere can.
- **Names, never descriptions** (v15.0; since v16.1 each monster also has a short description, see v16.1): the monster list uses the names the game already shows (Echo monster, Scent
  monster, Mimic, Stalker, Muffler, Singer - the title legend / Stats screen) and **"Level 15 monster" / "Level 16
  monster"** for the two Wardens (VARIANTS `label`) - the Warden is never named on screen. Each is drawn with its own
  in-game art (the mimic half way through its morph; the Muffler, never drawn in the game, as its cue's ring-and-dash).
- **Keys** are shortcuts only (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, Delete, Esc); everything is on the mouse. Typing in
  the title or a dialog never reaches the game's keys (`keydown` ignores text inputs, selects and open dialogs).
- **Touch**: not supported (part 2). On a touch device My Levels says so; levels can still be played there. (v15.1: replaced by the touch warning and touch editing - see v15.1.)

### Saved data and the future

Format in `docs/level-format.md`. Plain JSON, `format` 'echo-maze-level', `schemaVersion` 1, `id`, `title`,
`authorName` '' (placeholder), `createdAt` / `updatedAt` (ISO), `size`, `walls` (row strings), `start`, `exit`,
`enemies` [{kind, x, y, variant?}]. Playable/unfinished is never stored - always worked out. **Foreign levels**:
unknown fields and unknown monster kinds/variants are kept aside (`extra` / `extraEnemies`, in memory only) and
written back untouched, so an older version folder (the owner keeps them, and all `file://` copies share one
localStorage) can never destroy what a newer one saved; such a level plays (with what is understood) and renames,
but the editor will not open it. Adding objects/effects later = a new top-level field with a default; changing a
field's meaning = bump the version and add a `MIGRATIONS` step. A second level source = an object with the same
four calls, `EchoLevelStore.register(source)`.

### Tests (`tools/editor-test.js`, loaded into a `?debug` page)

- **gate** 9/9 (above); **tools** 41/41 (every tool with real mouse events on the canvas, a fast diagonal stroke
  gap-free, each monster kind placed, refusals with their sentences, box move and refused move, undo all the way back
  to the empty level and redo all the way forward, Ctrl+Shift+Z, clear all asked + cancel + undo, size smaller asked +
  cancel + cut off + undo, bigger, title cleaned / 48 chars / one undo step); **validation** 15/15 (every error code
  and its words, Test play refused with a reason, unreachable shown live); **storage** 22/22 (round trip byte-equal,
  serialise -> normalise -> serialise identical, open-and-close is not "unsaved", drafts saved as unfinished, the
  leave-with-changes question, My Levels play/edit/rename/delete + its question); **untrusted** 19/19 (34 hostile
  inputs incl. 3000x3000, 500 monsters, `__proto__`, a 500k string, wrong types everywhere - none threw, all clamped;
  damaged keys listed as damaged, Delete only; a newer-version level with an unknown monster and field: playable,
  not editable, renaming keeps both; storage that throws on write: Save says so); **noWrites** 20/20 (test play with
  every monster: caught, Try again, won, Play again, paused, Back to the editor - the editor state and doc
  byte-identical after; My Levels play on Hardcore: caught, still Try again; **localStorage, stats and medals
  identical** before and after, the only new key the level saved on purpose).
- **Soaks**: 35 random levels (random walls, 0-8 random monsters of every kind incl. both Wardens, sizes up to 49x37)
  x 3,000 frames of random keys - **~95,000 frames, 0 exceptions**, storage untouched; editing soak **3,300 random
  mouse actions** (every tool, undo, redo, delete, Esc), the level checked every 50 - **0 exceptions, always valid**
  (one per tile, nothing in walls, round-trips exactly). Editor render: 0.42 ms with 40 monsters on Huge.
- **Levels 0-16 did not move**: generator fingerprint **`9097b344`** (sanity: a real level 12, 37x29, echo + singer,
  72); the eight identity games `5e02174d` / `67675ca5` / `d72d0668` / `e44f30fa` / `820d314c` / `ed3f918f` /
  `e15cce08` / `490fcf8f` and the three lore-reading ones `a36ce892` / `e84d1c34` / `dd6b13f3` (3 reads) - all as
  v14.1; levels 0, 13, 14, 15, 16 generated in all four modes x 2 seeds **byte-identical to v14.1** (hashes
  `c77914bd` / `a35d01f9` / `ab344c7d` / `a8702cc1` / `b2d8ade1`, configs `2c662a07`), and `tools/story-bot.js` on
  14 / 15 / 16 / 16-hard / 16-with-a-pause gives the same results and the same per-second chase gaps as v14.1.
- **Sample levels** (`tools/sample-levels.json`, built from the game's own generator - level 4 seed 99, level 8 seed
  4242 with a sealed gallery added above it, level 3 seed 4321): "First Steps" (1 echo monster) cleared by
  `EditorTest.bot` in all four modes with and without ripples; "Crowded Dark" (Level 15 monster at the far end of a
  gallery that joins the maze only at the start - it is always behind you, 1,120 px of path - a mimic, a scent
  monster, two echo monsters) **31 of 32** bot runs cleared across the modes (the one loss: an echo monster the bot
  woke with its own ripple); "Half Built" unfinished on purpose (no exit). A stalker was tried in Crowded Dark and
  taken out: its random patrol caught a non-crouching bot ~40% of the time.

### Lessons

1. **The Write tool turns `\u2028` in source text into the real character** - a line terminator inside a regex
   literal, which killed the whole script. Check new files for raw U+2028/2029 (`perl -ne 'print if /\xe2\x80[\xa8\xa9]/'`).
2. **Round trips find the bugs.** `normalise(normalise(x).doc)` marked every level "foreign", because a read level's
   own in-memory holders (`extra`, `extraEnemies`) looked like unknown fields. Test read -> write -> read, not just read.
3. **Screenshots of a hidden pane are clipped to the pane's real width** (559 px here at DPR 1.5): emulate a viewport
   that fits (836x522) or the picture is a corner of the page.

## v15.1: the level editor, part 2 of 3 (owner's brief, MINOR by the owner's own number)

Owner: extend the editor (build on v15.0, do not rewrite it); still **no sharing, export/import UI, codes, network or
accounts**; levels 0-16 and the generator unchanged. Schema bump with a migration (v15.0's single exit -> a list),
untrusted loading kept, **folders out of the level data**. New: a **touch warning** before the editor; **several
exits** (any one finishes; each can be locked); **light and red glow zones**; **floor objects** (puddles, decoys, the
key and locked exit, notes with the player's own words); **level settings** (size, a title card line, a palette);
**each level's own difficulty** (a rating + tuning for Custom, Reset, clamps, no impossible levels); **folders**
(create, rename, delete with a choice, move, counts, sort, optionally play in order); **duplicate** and **thumbnails**;
**touch editing** best effort; new samples and sample folders in the test copy. The owner called it v15.1, so MINOR.

### Where it lives

| File | What changed |
| --- | --- |
| `js/levelformat.js` | `SCHEMA_VERSION` 2; `MIGRATIONS[1]` (exit -> exits); `exits`, `objects`, `effects`, `titleCard`, `palette`, `difficulty` read and clamped; `OBJECTS`, `EFFECTS`, `SHAPES`, `INTENSITIES`, `RATINGS`, `TUNING`; `extraObjects` / `extraEffects` kept aside like `extraEnemies`; `exit` written as a mirror for v15.0 (`LEGACY`); `shownText` cleans typed words; `difficulty()`, `ratingLabel()`, `cleanNote`, `cleanCard` |
| `js/levelcheck.js` | several exits (named "Exit 2" when there are more than one), locked exits + key (reachability with shut doors), objects in walls, shared tiles (warning), the **hunter check**, `reach[]` per exit |
| `js/level.js` | `customConfig(difficulty)` (the level's rating; Custom = Normal x scales), `CUSTOM_MONSTER_TOP` 169, `CUSTOM_WARDEN_TOP` 1.25, `wardenSpeedFraction`, `ratingMode`; `buildCustomLevel` adds `exits`, `key`, `notes`, `effects`, `puddles`, `decoy`, `custom.card/rating/palette` |
| `js/levelstore.js` | folders (`echomaze.folders`, read as untrusted), `duplicate`, summaries with `rating`, `exits`, `folder`, `preview` |
| `js/effects.js` (new) | `EchoEffects`: the zones' colours, `prepare` (the stone faces each zone lights, once), `draw` (clipped to the line of sight) |
| `js/editor.js` | tools Exit (many) / Object / Effect, the lists for them, a **picked thing** (`pick`) with its **inspector** panel, the **Level settings** tab, touch input, touch hint wording |
| `js/mylevels.js` | folder chips with counts, sort, the folder bar (Play in order / Rename / Delete), Duplicate, Move, thumbnails, rating tags |
| `js/dialog.js` | a `select` list (Move to folder) |
| `js/game.js` | `exitsOf()`, locked exits, the custom key, notes, zones, the title card (state `'card'`), the palette, the rating labels, the touch warning (`editor-touch`), folders played in order, `editorStore` (files new levels), debug hooks |
| `index.html`, `style.css` | `#editor-touch`, `#card`, the My Levels bar, the editor's tabs and panels, `#btn-custom-next`, `#dialog-select` |
| `docs/level-format.md` | rewritten for schema 2 (and folders) |
| `tools/editor-test-2.js` (new), `tools/sample-folders.json` (new), `tools/sample-levels.json` (+5), `tools/update-test-copy.ps1`, `tools/editor-test.js` | tests, samples, test copy |

### Schema 2 and the migration (the owner asked for v15.0 levels to load and play unchanged)

A version 1 level's `exit` becomes a one-item `exits` list; everything else new starts empty; walls, start, monsters,
title and size read exactly as before, **with no repair notes** (tested on the three v15.0 samples: version 2, the
exit in the list, nothing repaired, not foreign, the same playable verdicts, First Steps cleared by the bot, saved
back as version 2). Every save also writes **`exit` = the first open way out**, a mirror for older version folders
(the owner keeps them, and every `file://` copy shares one localStorage): v15.0 itself was checked to read all five
new samples as foreign, play them (with what it understands - a locked exit is just an exit to it) and rename them
keeping `exits`, `objects`, `effects` and `difficulty` byte for byte. `exit` is never read when `exits` is there.

### The touch warning

"Touch controls are active" is the game's own `touchOn` (v9.0: `pointer: coarse`, a first touch, or the pause menu's
switch). The warning is **asked every time the Level Editor is opened from the title while it is on**, after the
spoiler warning when that applies (so on first use: spoiler -> touch -> My Levels), never remembered, and never on the
way back from a test play (that goes straight to the editor). **My reading, flagged**: "before entering the editor's
build mode" + "every time the editor is opened from the menu" + "after the spoiler warning" = at the Level Editor
button, before My Levels - not each time a level is opened from My Levels.

### Several exits (`exitsOf()` - the one change to the shared engine paths)

Every place that read `level.exit` - the ripple's circles (`castRipple`), the wave's line to a monster
(`waveReaches`), the chime, the glimmer, the finish - now loops over `exitsOf()` = `level.exits || [level.exit]`, so
a generated or hand-drawn level runs **exactly the code it ran before** with its one exit (identity games and story-bot
unchanged, below). Every exit chimes (each through the same `chime()` the mimic uses, so a mimic's tell is still
exactly an exit's), glimmers and shows in a ripple; reaching any open one finishes. Up to 8 (`LIMITS.exits`). Exits are
numbered on the editor's map when there are several, and the checker names them ("Exit 2 can't be reached..." - a
warning when another can be reached, an error when none can).

### The key and locked exits (level 14's, without its script)

A locked exit is a **shut door**: drawn with level 14's `EchoArt` 'door' (r 18, `LOCKED_EXIT_ART_R`) in the exit's
colour with the exit's bell, **solid** to the player (`moveCircle`), and its tile **blocked** for monsters' paths
(`level.blocked`, as the gaol door's is). Walking into it without the key rattles it (`audio.doorRattle`, once per
1.5 s, `[the door rattles: locked]`, a "Locked" banner); with the key the key turns (`doorUnlock`), and
`UNLOCK_SECONDS` 0.9 s later it grinds open (`doorOpen`), stops being solid, swings, and is an ordinary way out - the
player pushing against it walks in and finishes (measured: 0.9-2.5 s). The key is a flat thing like level 14's
(`T_KEY`, `EchoArt` 'key', `audio.echoKey`), picked up by walking onto it (`collectKey`: `keyPickup`, HUD "Key", the
small key at your side). **One key opens every locked exit and is not used up** (my choice). Checker: locked + no key
-> error; key unreachable without passing a shut door -> error.

### Floor objects (all four slot into the existing system; nothing was skipped)

Puddles and the decoy become `level.puddles` / `level.decoy` in exactly the generator's shapes, so smell, trails, the
pickup, E to drop and the call all just work. The key is above. A **note** is `level.notes` - a flat thing found by a
ripple through the same `flats` path as a lore fragment (`T_LORE`, 'note' or 'log' art), read when your own wave
reaches it (`readNote`) through the same `loreReader` - a note shown, a recording spoken in the cutscenes' voice - and
**nothing is kept** (`markFound` is never called; tested: `echomaze.lore` unchanged). Its words: 1-140 characters,
cleaned in `normalise` (control characters, the direction overrides and zero-width characters, `<` and `>`), only ever
set with `textContent`. Limits: 40 puddles, 1 decoy (the game's own rule: you can only carry one), 1 key, 8 notes, 60
objects in all; one thing per tile (start, exit, monster, object).

### Effects: light and red glow (`js/effects.js`)

Rect or circle zones (up to 12), colour from 3 per kind, intensity dim / medium / bright. **Drawing only**, held to the
rule of levels 13 and 15's light: an exception to the ripple, **never to the walls** - clipped to `visibleFrom(player)`
- and **stone and floor only**: no monster, object or way out is ever drawn by it, and it is drawn **under** the
ripples, added on, so it can never cover what a ripple shows. Light: a soft pool on the floor and the stone faces in
it lit in its colour. Glow: a dark red wash with a slow pulse (0.35 Hz; steady in calm mode and with reduced motion)
and a little red on its stone. Tested: behind a wall, pixel-for-pixel nothing; in sight, brighter; a monster standing
in the light - identical pixels with and without it; the pulse differs between two clocks and not in calm mode. After
seeing it, both were made a little stronger (floor 0.11 / 0.16, faces 0.55 / 0.34) - a ripple still reads clearly
over a bright red glow (screenshot checked).

### Level settings

Exact width / height (5-61 x 5-45, the same grow-with-wall / shrink-asks rules), the **title card** line (0-80, cleaned
like a note), the **palette** ('' = the player's own, or one of the four), the **difficulty**. **The title card**: a
custom level opens on a card (state `'card'`: nothing simulates, no monster moves) with its title, the line (if any)
and "Difficulty: X"; any key, a click or a tap - or 2.4 s (3.6 s with a line) - starts it, and its banner follows.
Not on Try again. **The palette** is used **only for a player whose own palette is Default** (`borrowPalette` /
`returnPalette`, never saved): a colour-blind or high-contrast player keeps theirs. My choice, flagged.

### Each level's own difficulty (the owner asked me to choose and say)

**The level fixes it; the player's title-screen mode is not read for a custom level.** A rating that is a mode plays
exactly as that mode tunes level 12 (ripple range and recharge, every monster's speed and hearing, the mimic's tell);
Custom is Normal with three scales: monster speed 0.5-1.5, ripple range 0.6-1.5, hearing 0.5-1.5 (footstep, presence,
the Muffler's three radii and the smell range) - sliders, enabled only for Custom, with **Reset to defaults**. Why:
what the maker tested is what everyone plays, and the card and My Levels can say honestly what it is. A v15.0 level
(no rating) reads as **Normal** (flagged: v15.0 used the player's mode). Calm mode, Visual cues and the rest of the
player's own settings still apply; Hardcore-rated levels still offer Try again (a custom level is not a run).
**Never uncapped**: every monster but the hunters is held at 169 px/s (below the player's 170, the game's own rule);
the Level 15 / 16 monster keeps its own rule (`WARDEN_SPEED` / `WARDEN_UPGRADED_SPEED` x your speed) times the same
clamped scale, never above `CUSTOM_WARDEN_TOP` 1.25 x your speed. **No impossible levels**: the checker's hunter
check walks the shortest way out (to the key first if it must) and refuses a level where a hunter, at this level's
speed, could reach any tile of it before a perfect run does (warning under 1 s). Its words say where the monster is,
never what it does (the editor's v15.0 rule).

### Folders, duplicate, thumbnails

Folders live in `echomaze.folders` - `{ schemaVersion: 1, folders: [{id, name, createdAt, updatedAt}], levels: {levelId:
folderId} }` - read as untrusted (bad entries dropped, `__proto__`-style ids refused, membership only into folders
that exist), handled only by the store (`listFolders` / `createFolder` / `renameFolder` / `deleteFolder` / `moveLevel` /
`folderOf`); **a level's own data never mentions its folder** (tested). Flat; 50 at most; names 1-32 characters. Delete
asks: "Delete folder, keep levels" (the default, they go back to Unsorted) or "Delete folder and its N levels", which
asks a second, plain question. Sort by name or by the newest edit inside (`editedAt`) - the same choice sorts the
levels. **Play in order** (it was cheap: `customRun.queue`): the folder's playable levels in the order shown, a
"Next level" on the Complete screen and "Name: 2 of 5 done." / "That was the last level in Name."; unplayable ones are
stepped over. New level with a folder open files it there on its first save. **Duplicate**: "Copy of ...", a new id,
the same folder. **Thumbnails**: one small canvas per row (walls, start, exits; locked in the key's colour) from the
summary's `preview` - cheap, so done.

### Touch editing (best effort)

The canvas takes Pointer Events from a finger or pen and treats them as the left button (tap places, drag draws or
moves; `preventDefault` stops the browser's copied mouse events); there is no right button, so the hints say "Use
Erase" / "press Delete" on a touch screen. The tool lists, panels and tabs are ordinary buttons (40 px tall in touch
mode); under 760 px wide the side panel narrows. What stops it being good: no pinch-zoom, so Huge levels on a phone
are ~8 px tiles; and the game's portrait "turn your device" screen covers the editor too.

### Choices I made (flagged to the owner)

The touch warning's place (above); one key opens every lock and is kept; a locked exit is solid and blocks monsters'
paths while shut; the level's difficulty fixes it, v15.0 levels read as Normal; the palette only over Default; the
title card always shows (title + difficulty) and the line is optional, not on Try again; notes can be notes or
recordings; effect colours are fixed lists that avoid the monsters' and the exit's colours except the glow's reds;
Select moves exits and objects with the box but not effect zones (the Effect tool moves those); the 9th exit, 2nd key
and 2nd decoy are refused with a sentence; the hunter check (an extra validation the brief allowed).

### Tests (`tools/editor-test-2.js`, after `tools/editor-test.js`, on a clean `?debug` page)

- **v15.1 suites**: touchGate **15/15** (spoiler then touch on first use, every time, Back / Esc, not after test play,
  touch taps and drags in the editor, none with mouse+keyboard), exits **18/18**, keys **14/14**, objects **20/20**,
  effects **14/14**, card **16/16**, difficulty **27/27**, folders **25/25**, migration **15/15**, untrusted **4/4**
  (15 hostile inputs with the new fields), noWrites **7/7** (a level with all of it, played through deaths, a retry, a
  note, the decoy, the key and the locked door: storage, stats, medals and fragments identical).
- **Measured** (difficulty suite): a stalker walks 66.5 / 133 / 169 px/s at monster speed x0.5 / x1 / x1.5 (the last
  capped from 199.5); a Level 15 monster 127.5 px/s at x1 and 191.25 at x1.5; a Level 16 monster at x1.5 212.5 (the
  1.25 cap, from 267.75); the ripple reaches 155.7 / 259.6 / 389.3 px at x0.6 / x1 / x1.5 (the rays that hit nothing
  stop exactly there); a stalker hears a still player out to the tuned presence radius, x1.5 = round(x1 x 1.5); a
  level rated X plays with X's numbers whether the player is on Easy or Hardcore.
- **v15.0 suites still pass** on the new format: gate 9/9, tools 41/41, validation 15/15, storage 22/22, untrusted
  20/20, noWrites 20/20 (their test levels' two hunters were moved into a sealed gallery: on the only route they make
  the level impossible, which the checker now refuses).
- **Soaks**: ~322,000 frames on 108 random levels (37 more refused by the checker) with every new thing (several exits, locks and keys, objects,
  zones, random ratings and palettes), incl. one chunk in calm mode with Visual cues - **0 exceptions, storage
  untouched, the player's palette back every time**; random editing **2 x 1,600 + 1,500 actions** with every tool and
  panel - valid data every 40 (one thing per tile, nothing in walls, limits kept, exact round trips).
- **Levels 0-16 did not move**: generator fingerprint **`9097b344`** (sanity 37x29, echo + singer, 72); eleven scripted
  identity games identical between v15.0 and v15.1 (incl. three that really read a fragment); levels 0 / 13-16 in four
  modes x 2 seeds hash `c77914bd` / `a35d01f9` / `ab344c7d` / `a8702cc1` / `b2d8ade1` on both builds (as in v14.1);
  story-bot on 14, 15, 16, 16-hard, 16 with a pause and a deliberate catch on 15-hardcore - identical results and gaps.
- **Samples** (test copy): Many Doors (3 exits), Lanterns (5 zones), The Key (locked exit, key, decoy, puddles, a note
  and a recording), Quick Feet (Custom: x1.25 speed, x0.8 ripple, x1.15 hearing), All of It (two exits one locked, key,
  objects, three zones, the high-contrast palette, Hard) - built from the generator, bot-cleared 8/8, 8/8, 11/12,
  11/12, 7/8 (the losses: idle monsters the blind bot walked into); folders Showcase (3) and Puzzles (2).

### Lessons

1. **A heredoc in this shell eats doubled backslashes** (`\\` arrived as `\`): an edit script for a file full of
   Windows paths silently searched for the wrong text. Write such scripts with the Write tool.
2. **Validation that is right breaks old tests that were wrong.** Two v15.0 test levels had hunters on the only route
   - impossible levels the old checker let through. The fix was the test levels, not the rule.
3. **Hidden panes throttle timers**: a soak that yields with `setTimeout(0)` crawls; long runs go in the background
   (`window.__x = []` + poll) because a tool call stops waiting after 45 s.

## v15.2: the bonus levels (owner's brief, MINOR - "the next minor version after the latest one in the folder")

Owner: a small set of ready-made levels that ship with the game, played from the editor's area; **not** part of the
story (never in the level select, never a cutscene, never the ending, medals, fragments, progress or stats - playing
them writes nothing to any campaign save); behind the same gates as the editor (spoiler warning, touch warning);
a **Bonus Levels** section beside My Levels with title, difficulty and a picture; any order; **read-only** with
**Copy to My Levels** (new id, Unsorted); a **completed tick** stored apart from the campaign and from My Levels; built
as **a second, read-only level source with the store's interface** (list, get; save and delete refuse), the data in
its own file in the normal schema, through the same untrusted loader and validator, failing gracefully. About six
levels, different from each other, escalating, each with its own rating, neutral titles, no story or lore text,
hand-authored. Still **no sharing, export/import, codes, network or accounts**; levels 0-16 and the generator unchanged.

### Where it lives

| File | What |
| --- | --- |
| `js/bonus-levels.js` (new) | `ECHO_BONUS_LEVELS`: the six levels, **data only**, schema 2 exactly as stored (walls as rows). Loaded before levelstore.js; if it were missing there would simply be no bonus levels |
| `js/levelstore.js` | `readOnlySource(id, label, entries, { doneKey, refusal })` - list / get like `local` (each entry kept as its JSON text and read through `normalise` + `EchoLevelCheck` on every call; a bad or repeated id or a non-level is listed as damaged), `has`, save / delete / duplicate refuse, plus `isDone` / `doneIds` / `markDone` over one key; `bonus` = that over `ECHO_BONUS_LEVELS` with `BONUS_KEY` `echomaze.bonus`, registered as a source; `readOnly(id)`; `copyToMine(sourceId, id)`; and `local.save` refuses an id a read-only source holds |
| `js/mylevels.js` | a second tab (`view` 'mine' / 'bonus', `setView`): numbered rows with the picture, a **Done** tag, the rating, size / monsters / exits, **Play** and **Copy to My Levels** (a dialog says where it went: OK, or **Edit the copy**); the tab shows "done / total" |
| `js/game.js` | `customRun.from` can be `'bonus'`: its banner, card kicker ("Bonus level"), back labels ("Back to Bonus Levels"), and the **tick on the Complete screen** (`EchoLevelStore.bonus.markDone`; "Ticked off in Bonus Levels." the first time); `openEditor` refuses a read-only level; debug `bonus`, `settings().editor.bonus / bonusDone / view` |
| `index.html`, `style.css` | the tabs (`#lv-tab-mine`, `#lv-tab-bonus`, `#lv-bonus-count`), `#mylevels-head` / `-desc` / `-bar`, `.mine-only`; the v15.2 CSS block (`.bonus-view` hides the folder bar and New level / New folder) |
| `tools/bonus-test.js` (new) | the tests (below), the route player `walk` and the written routes `ROUTES` |
| `tools/update-test-copy.ps1` | ticks the first two bonus levels in the test copy, once (`echomaze.test.bonus2`) |
| `docs/level-format.md`, `README.md` | the second source and the ticks' key; the Bonus Levels for players |

### Choices I made (flagged to the owner)

- **Where**: a tab on the My Levels screen (same gates, same list look), not a separate screen. From the title it always
  opens on My Levels (as v15.0 did - the v15.0 / v15.1 tests rely on it); out of a bonus level it goes back to Bonus
  Levels.
- **The tick** is written only when a bonus level is finished **from Bonus Levels** - not for a copy, not for a test play,
  not when caught or left - in its own key; the date is the first finish; finishing again writes nothing.
- **Copy to My Levels** keeps the title (no "Copy of"), stamps new dates, lands in Unsorted, and offers **Edit the copy**.
  The copy is the bonus level byte for byte apart from id and dates, so it plays identically (tested by frame hashes).
- **Hardcore-rated** bonus levels still offer Try again, like every custom level (a custom level is not a run).
- **No title-card lore**: the cards are short practical lines ("Four exits. Any one of them finishes the level.").
  Embers has none. Nothing names or explains the Warden.

### The levels (`tools/bonus-test.js` ROUTES are the walkthroughs; numbers are 12 seeds each)

The engine's **idle echo monsters drift** (`wander(e, 6, 1.5)` at 0.28 x speed - not news, but it decided two designs):
an echo monster cannot "guard" a tile, so the two places a monster must stay put are **mimics** (they never move until a
ripple or a decoy touches them). The route player walks with the real keys; with `dodge` it walks round monsters where
they are right now - what a player knows just after a ping - and `BLIND` routes know only the map.

1. **Crossroads** (Easy, 19x15) - no monsters, four exits 14-18 tiles from a lit start; a gentle way in. Every exit
   walked to 12/12 (and pinging all the way).
2. **Shortcut** (Easy, 23x13) - an exit 21 tiles away in a small room with an echo monster in it (two doors, so a
   pinged one can be walked round), or the key in the north (12 tiles) and a locked exit (40 in all). Dodging: the
   shortcut 12/12, the key way 12/12 (also pinging). BLIND through the room: 8/12 and 9/12 - the risk is the point.
3. **Embers** (Normal, 27x19) - five rooms: warm light at the start, cold light, red glow in two dead-end rooms, a
   crimson glow down the shaft, bright warm light at the exit; two echo monsters (blind), one on the west lane of a
   loop, one in the dark room before the exit. No monster starts in a glow. 12/12 dodging, 11/12 pinging every 2 s.
4. **Lure** (Normal, 25x17) - the hub and the wing meet at ONE gap, and a **mimic** sits in it (it looks and chimes like
   an exit). The decoy lies on the way; drop it in the far room (within 480 px of the gap - the far corner is 501 and
   does nothing), stand clear, and the call reveals the mimic and holds it there; then through. Puddles on the quick
   ways, a dry way 6 tiles longer, a scent monster in the wing. Decoy, dry: 12/12; decoy, wet: 12/12; **a ripple at the
   mimic from the hub, crouch once the wave has landed (crouching wipes your own ripples), wait, round it: 12/12**;
   doing neither: 0/12 (the gap never clears).
5. **The Long Way** (Hard, 31x21) - four lanes, 111 tiles, nine dead ends and four loops, a regular **Level 15 monster**
   (0.75 x your speed) 15 tiles behind the start in a sealed gallery (checker slack 4.5 s at the start, growing).
   Clean run 25.6 s, closest 600 px; pinging the same; a 2 s pause 320 px; one or two wrong turns 560 px; a 4 s pause
   still clears with 40 px to spare.
6. **Everything at Once** (Hardcore, 35x25) - an **upgraded Level 16 monster** (1.05 x) at the far end of a 35-tile
   gallery; the **key way** (42 tiles: through a warm-lit room whose light shows its walls, with a **mimic** in it and the
   key in the corner, to a locked exit) and the **open way** (58 tiles: a pale-lit wet room with five puddles - a dry line
   exists - and a scent monster, then a long corridor with stubs). Checker slack 6.3 / 7.0 s. Key way 12/12 (closest
   1,040 px), with 2 s of hesitation 12/12 (640 px); open way 8-9/12 (the scent monster in the wet room costs time and
   the hunter takes it back) - the open way is the gamble, the key way the safe one. Monster kinds: warden (both),
   echo, scent, mimic.

### Tests (`tools/bonus-test.js`, on a clean `?debug` page, one suite at a time)

- **load 50/50** (each level through the store, `normalise` with nothing repaired, not foreign, the checker playable with
  no warnings, every exit reachable, `buildCustomLevel` builds it, and independently on the built level's grid: the key
  reachable without the key, each locked exit from the key, each open exit, the decoy; ratings escalate; no notes);
  **routes** 24/24 counted routes clear (table above); **gates 9/9** (spoiler warning first with the list not on screen,
  Back saves nothing, then the tab; touch warning every time; out of a bonus level straight back to the tab);
  **noWrites 15/15** (all six finished, a catch, the real Caught screen's Try again: every key but `echomaze.bonus`
  byte-identical, stats and medals identical - on a save with progress, stats, medals, seen and lore);
  **copy 52/52** (new id, Unsorted, identical but id/dates, **the same frame hash** playing the same route and seed,
  opens in the editor, saves changes, the original untouched; the button and both dialog answers); **readOnly 11/11**
  (save / delete / duplicate refused, My Levels refuses the bonus id, rename refused, the editor refuses, only Play
  and Copy on the rows, a handed-out doc changed changes nothing, `ECHO_BONUS_LEVELS` untouched, nothing written);
  **ticks 14/14** (not for a catch, a quit, a copy or a test play; written once with the first date; read back by a fresh
  reader; My Levels emptied leaves them; Done tag and "1/6" on both tabs; nine hostile values - none throws, only an id
  with a real date ticks); **invalid 12/12** (null, text, numbers, no walls, a repeated id, `__proto__`, no exit, a
  newer schema, not a level: listed, unplayable ones off, the screen draws them, an empty source says so).
- **v15.0 / v15.1 suites still pass**: gate 9/9, tools 41/41, validation 15/15, storage 22/22, untrusted 20/20, noWrites
  20/20; touchGate 15/15, exits 18/18, keys 14/14, objects 20/20, effects 14/14, card 16/16, difficulty 27/27, folders
  25/25, migration 15/15, untrusted 4/4, noWrites 7/7. (Four of them failed at first because a bonus test had left the
  screen on Bonus Levels - which is why the title now always opens on My Levels.)
- **Soak**: 720,000 frames of random keys over all six (5 x 20,000 per level, then 2 x 10,000 in calm mode with Visual
  cues), drawn every 10th frame - **0 exceptions**, storage untouched but the ticks.
- **Levels 0-16 did not move** (v15.1 folder vs this build, same script): generator `9097b344` (sanity 37x29, echo +
  singer, 72); eleven identity games identical, three of them really reading f04 / f08 / f12; levels 0 / 13-16 built in
  four modes x 2 seeds identical; story-bot on 14, 15, 16, 16-hard, 15-hardcore, 16-easy pinging - identical results
  and per-second gaps (combined `25a393c2` on both).

### Lessons

1. **An idle echo monster is not a statue.** It wanders 6 tiles at 0.28 x its speed; a "guard" in a gap was in it 5-14%
   of the time and left within ~3 s. Measure what a monster does before designing around it.
2. **Crouching wipes the ripple you just sent** - a route that pings then crouches in the same instant sends nothing.
3. **Check decoy distances from the drop spot** (480 px straight line), not from where you meant to drop it.

## v15.3: level sharing - share codes (owner's brief, MINOR)

Owner: share one level or a folder as a code anyone can paste; **no server, no network, no accounts** - the code
contains the level, compressed and encoded as text (long codes accepted, but compact); a format version in every
code and the encode/decode behind a small interface, so short online codes could be added later without breaking
old ones; a prefix, a checksum with a friendly "incomplete or damaged" message, deterministic, tolerant of pasted
whitespace, "made in a newer version" for unknown versions. Share / Share folder / Copy (with a fallback) / the
length; limits with a friendly "too big"; an optional creator name (only content, titles and that name in a code);
bonus levels not shareable but their copies are; Enter code with a preview, Import or Cancel, new ids, a folder as a
new folder with a number on a clash, "you already have it", creator name shown and kept unless edited. Safety first:
caps on everything, a decompression-bomb guard, cleaned text, nothing half-imported, no campaign data touched, the
editor's warnings in front of it. Its own UI-free module; the format written down; sample codes in the test copy's
READ ME only.

### Where it lives

| File | What |
| --- | --- |
| `js/sharecode.js` (new) | `EchoShare`: `encodeLevel`, `encodeFolder`, `decode`, `clean`, `contentKey`, `register` (resolvers by format version), `LIMITS`, and `_` (the parts, for tests): packing, base 62, CRC-32, compression through `CompressionStream('deflate-raw')` and the game's own inflate. No UI, no storage |
| `js/levelstore.js` | `importShared(result)` (new ids and dates, Unsorted or a new folder, all or nothing), `freeFolderName`, `author` in summaries |
| `js/levelformat.js` | `cleanShown(s, max)` (plain, visible text, no < >) for titles, creator and folder names from codes; `authorName` now means the creator name |
| `js/mylevels.js` | Share (rows), Share folder (the folder bar), Enter code (the dock), the preview, "by ..." on rows; test hooks `share(id)`, `shareFolder(id)`, `enterCode(text)` |
| `js/dialog.js` | `area` (a box for a code, read-only or to paste into), buttons that `stay` and `act` (Copy), a status line, text that keeps its line breaks |
| `js/game.js` | the creator name (`echomaze.creator`, `#ed-creator` in the editor's Level settings), `store.remove`, the editor's save dropping an imported level's creator name once its CONTENT changed (`EchoShare.contentKey`; a new title alone keeps it), debug `share`, `creatorName`, `setCreatorName` |
| `index.html`, `style.css` | `#btn-mylevels-code`, `#dialog-area`, `#dialog-status`, the Sharing group in Level settings, the v15.3 CSS block |
| `tools/share-test.js` (new), `tools/sample-codes.txt` (new), `tools/update-test-copy.ps1`, `tools/editor-test-2.js` | tests; the READ ME's codes; the folders test finds Delete folder by its label now (Share folder joined the bar) |

### Choices I made (flagged to the owner)

- **Letters and digits only** (base 62), not base64: nothing a chat app formats, links or breaks, and a double-click
  selects the whole code. About 3% longer than base64.
- **Compression only when it is shorter**: a single level packs so tightly (walls are one bit a tile, words are list
  numbers) that deflate usually makes it LONGER, so it is stored; folders and big levels are deflated. Determinism
  is per browser engine (another engine's deflate may write an equivalent code).
- **One level -> Unsorted** (not an "Imported" folder); **a folder -> a new folder**, "Name (2)" if taken.
- **A folder code with any level that cannot be played (or is damaged, or newer) is refused whole** - the clearest.
- **A level with an unknown monster / object is "made in a newer version"** and refused, rather than imported missing
  parts. A foreign level (from a newer version) cannot be shared either.
- **"You already have it"** = the same content (walls, start, exits, things, effects, card, palette, difficulty),
  whatever the title or creator. The question offers Import anyway / Cancel.
- **The creator name**: one setting for the player, kept in `echomaze.creator`, empty by default, shown in the
  editor's Level settings with "it goes into every code you share". A player's own levels never store it - it is
  added at share time; an imported level keeps its creator's name through renames and re-shares, and loses it when
  its content is changed and saved in the editor.

### Tests (`tools/share-test.js`, after editor-test.js, editor-test-2.js and bonus-test.js)

format 14/14 (base 62 on 300 random lengths, CRC-32 against the standard value, the game's own inflate against the
browser's deflate on 60 inputs, determinism with other ids / dates / storage round trips, the stored fallback both
ways, a registered resolver for another version); roundTrips 24/24 (every sample and bonus level, a level using
everything, 61 x 45, random levels, folders of 5 and 20, the store's import, the sample codes); lengths; bad 46/46
(eight kinds of pasting junk accepted; typos, cut-offs, garbage, empty, newer versions, unknown kind, 9999 x 9999,
41 monsters, an 8 MB bomb in 11,230 characters and a 400 KB one, 21-level folders, 200 random payloads with a correct
check, unplayable levels, hostile HTML and direction marks in title / creator / card / note / folder name - all
refused or cleaned in under 2 s each, nothing saved); screens 23/23; authors 11/11; plays 7/7 (frame hashes of the
six bonus levels and the everything level, original vs imported); noWrites 4/4 (making and reading codes reads
NOTHING from storage; an import writes only its levels and the folder list); soak: 60,000 fuzzed codes in 3.9 s,
none threw or hung, every accepted one a checked, playable, clean level; 300 random levels round-trip exactly. All
v15.0-v15.2 suites still pass. Generator `9097b344`; identity games, levels 0 / 13-16 and story-bot = v15.2
(combined `25a393c2`).

**Code lengths (characters)**: an empty 11 x 9 level 58; "First Steps" 21 x 17 117; the bonus finale 35 x 25 356; a
full 61 x 45 maze 479 (550 without the browser's compression); the everything level 188, with every note and card
written to the limit 327; a folder of five bonus levels 875 (1,018 without compression).

### Lessons

1. **A heredoc in this shell eats doubled backslashes** (again): `'\\|'` and `'tools\\sample-codes.txt'` arrived
   without them. Edit scripts that hold backslashes are written with the Write tool - no exceptions.
2. **Old tests that find buttons by position break when a button is added**: find them by their label.

## v15.5: the title screen, polished (owner's brief, MINOR; UI / UX only)

Owner's brief: no inner scroll at common laptop sizes, controls / legend / rules out of the title into How to play, no spoilers, a clear hierarchy, themed toggles and scrollbar, rewritten copy, contrast, scaling on big screens, a headphones note, keyboard and focus, an optional atmosphere touch, tab title / favicon / meta. **LOCKED: the wordmark's text, font, colour, glow and spacing** - only its overall scale changes (with the screen, below). The tagline's wording is unchanged. Every button, screen, shortcut, the touch controls and the v11.5 look are kept.

- **Scale**: `resize()` sets `--s` = `max(1, min(2, W/1280, H/800))` on `#title` / `#howto`; all v15.5 title CSS is `calc(Npx * var(--s))`, and `js/wordmark.js` reads `--s` and multiplies `MAX_SIZE` (64) by it (the glow blurs already scale with size). Two compact tiers (`max-height` 660 / 540 px) keep 125% and 150% zoom on a 1366x768 laptop free of an inner scrollbar; phones may scroll (the v9.0 sticky dock stays).
- **How to play** (`section#howto`, an overlay like the others; Esc / Back return focus to its button): the keyboard or touch controls (built by `renderHowTo` from the player's own bindings), the rules and the legend. **"Met" is decided by `metThings()`** in `js/game.js`: a thing is met when its cutscene has been seen (`hasSeen`) or the level that brings it in has been cleared (`furthestReached() - 1 >= intro level`: scent 6, mimic 8, decoy 9, stalker 10, Muffler 11, Singer 12), fragments once one is found, the water / heavier steps lines from reaching 14 / 15; walls, obstacles, the echo monster, the exit and the heartbeat always. Anything else is a grey dashed "???" chip (its colour removed too) and its rule is hidden. The title keeps a one-line key hint (`#title-hint`).
- **Hierarchy**: Begin is the primary button; **when Continue shows it becomes the primary one and Enter presses it** (my call, flagged). The selected difficulty is an outline and an underline, not a filled tile. "First time? Begin starts with a short tutorial." shows only for `newPlayer()`. The secondary buttons (How to play, Tutorial, Levels & cutscenes, Fragments, Level Editor, Settings) share one style; the conditional ones show exactly as before.
- **Toggles**: Calm mode and Visual cues are `role="switch"` checkboxes drawn as switches (one place, not two); the pause menu's and Settings' checkboxes are unchanged.
- **Keyboard**: the difficulty is a radiogroup (arrows, Home, End, one tab stop); visible focus rings; a mouse click no longer leaves a focus ring.
- **Portrait**: the title is usable held upright (`body.touch.on-title #rotate{display:none}`, `on-title` set in `frame()` and `showOverlay()`); the game itself still asks to be turned sideways.
- **Atmosphere**: a click on empty title space sends one faint ripple (`titleRipples`) - none in calm mode or with reduced motion, none on controls.
- **Version tag**: `#version-tag` in the corner reads the number from the folder name in `location.pathname` (`/vX.Y - .../index.html`), so **the number is still never written in the game files**; on a dev server or the test copy it shows nothing.
- **Head**: `<title>Echo Maze</title>` unchanged (the test-copy script matches it), a description, `theme-color`, an inline SVG favicon, og / twitter tags with `social.jpg` (1200x630, made from the title itself). The image path is relative, so link previews only work once the game is hosted somewhere.
- **The export now includes `social.jpg`**, and `tools/update-test-copy.ps1` knows and copies it.

### Tests

`tools/title-test.js` (on a `?debug` page): `keys`, `howTo`, `buttons`, `touch`, `noWrites`, `begin` (every difficulty x Calm x Visual cues, through any cutscene into play). Fresh save: 14 / 9 / 5 / 4 / 1 / 16 all passing; mid-campaign: 14 / 9 / 9 / 4 / 1 / 24; finished: 14 / 9 / 9 / 4 / 1 / 32. Generator `9097b344` (sanity 37x29, echo + singer, 72). Before / after screenshots of the title at 12 sizes x 3 saves are in `C:\Claude\echo game\Echo Maze\Title screen screenshots (v15.5)`.

### Lessons

1. **A screen change that is still fading ignores input** (v11.5's rule): a test that clicks or presses Esc straight after a change must wait for `ui().transitioning` to clear, or it reports a game bug that is not there.
2. **The hidden browser pane runs no animation frames and throttles timers**; anything timing-sensitive was run in headless Edge over the DevTools protocol instead (Node 24's own `WebSocket` and `fetch`, no packages). Edge's touch emulation wants `maxTouchPoints` 1-16, so desktop sends `{enabled:false}` only.
3. **The owner does not want screenshots or old-vs-new comparison passes** unless asked - verify with the test suites and DOM checks.

## v15.6: the installable web app (owner's request, MINOR)

Owner: an app on the phone, not from any app store, that updates without downloading it again. The game is unchanged.

- **`manifest.webmanifest`**: name, `display: fullscreen` (iOS falls back to standalone), `#010206`, `start_url` / `scope` `./`, icons 192 / 512 and a maskable 512. **`icons/`** are drawn from the favicon's own SVG (`apple-touch-icon.png` 180, full bleed, for iOS). The page adds the manifest link and registers the service worker **only over http(s)** (an inline script in the head), so a version folder opened from `file://` never asks for either and logs nothing.
- **`sw.js` is NETWORK FIRST** (`fetch(..., { cache: 'no-cache' })`, revalidated with the server's ETag): whenever there is a connection the newest files are used, so an update reaches the installed app the next time it is opened - nothing to reinstall. The saved copy (cache `echo-maze`) is only used offline. On install it reads the page's own `src` / `href` list and saves every file it names, so **a new script needs no list kept here**. Same-origin GETs only; it holds no version number (the number is never in the game files). The page's navigations are all stored under the scope URL, so `?debug` opens offline too.
- Saves are the same `localStorage` as the website's (Android shares it with Chrome; an iPhone's home-screen app has its own, apart from Safari's).
- **Checked in headless Edge** (`pwa-check.js` in the scratchpad: a tiny Node server + the DevTools protocol): no manifest errors, no installability errors, the worker active and in control, 30 files saved, and with the network cut the page, its styling and every script still load (and `?debug` too). Not checked: a real install on a real phone - the owner does that.
- **The export and the test copy include the three new things**; `tools/update-test-copy.ps1` knows them.

## v15.7: the Alarm and the Screecho - unreleased, editor only (owner's brief, MINOR)

Owner: two new monsters, built like the existing ones, **only in the level editor and custom levels for now** (the
campaign, bonus levels, tutorial and every hand-authored level must not use them; the generator unchanged); an
"Unreleased" tag in the editor; share-code words at the end of the frozen list; an unreleased-content warning every
time the editor is opened, driven by one list. Introduced in the campaign in a later update.

- **Definitions** (`js/level.js`): two `MONSTER_TYPES` entries (`alarm` 'Alarm', `screecho` 'Screecho', both `roams: false`,
  own `art` / `role` / `pitch`), so the editor, the loader, `makeEnemy`, the checker and the codes pick them up as for any
  monster. `SCREECHO_COOLDOWN` = 20 (seconds) beside the other monster constants. `UNRELEASED_CONTENT` (above).
- **The Alarm** (`js/game.js`): `T_ALARM` = 13. It never moves (`updateEnemy` gives it no AI), never kills (skipped by the
  catch loop, the heartbeat/danger loop and near misses), and a decoy does not call it. It is set off ONLY in
  `touchMonsters` - the physical "the outgoing wavefront really passes over it" test every echo monster uses - which runs
  only for the player's own ripples (never a singer's song, never a drip; crouching sends none). Then `scream(e)` once and
  `e.spent = true`: silent (no hum), drawn at 0.42 with no sound-bars and a crack. **Its hum** (`alarmAudio`): `audio.alarmHum`,
  a faint two-note tick every `ALARM_HUM_GAP` 1.15 s, positional (`spatial` over `ALARM_HUM_RANGE` 520 px) and wall-muffled
  like every monster sound, with an `'alarm'` cue glyph. **The decoy (owner asked me to choose):** its call is NOT a ripple
  (`callMonsters` is a straight-line radius, not `castRipple`), so it does not set an Alarm off - nothing "fell out
  naturally", and I did not add it.
- **The scream** (`scream(src)`, both monsters): the spot is `player.x/y` at that instant, fixed. Every monster except
  Wardens and Alarms is sent there by `summon`: an echo monster / Screecho via `alertEnemy` (hunt -> search, the ripple
  behaviour; one already tracking you keeps tracking); a mimic is revealed first (`revealMimic`) and then the same; the kinds
  that roam go to a new state `summoned` (walk there at their own `speedOf`, wait `cfg.searchTime`, then `releaseLured` back to
  their round; a stalker or muffler that hears you on the way switches to its own hunt). A decoy's hold wins (lured / trapped
  are left alone); a singer in mid-leap is left to land. `audio.scream` (a three-octave rising saw+square shriek with a fast
  flutter and a hiss; the Screecho's lower, slower-fluttering, with the echo moan under it), never muffled, calm x0.4; a
  ring mark; a 5 px shake (none in calm); a cue and a caption (`[an alarm shrieks]` / `[a shrieking howl]`), set LAST so the
  summoned monsters' own screech captions do not cover it.
- **The Screecho**: `T_SCREECHO` = 14, `updateEcho` (so the same speed - `cfg.enemySpeed`, with the monster-speed scale and
  the 169 cap - hearing, listening window, lock-on, catch, tips). In `touchMonsters`, when the wave reaches it and it is not
  held by a decoy and `screamCd` is 0: `scream` + `screamCd = SCREECHO_COOLDOWN`; otherwise it hears the ripple exactly as an
  echo monster does. Voice: the echo voice plus a thin square-wave whine near the Alarm's pitch (`createEnemyVoice` kind
  'screecho'); `echoScreecho` = the moan + a siren blip.
- **Look** (`js/art.js`): `alarm` (a dome on a plate, a round horn, three sound bars) and `screecho` (the echo monster's body,
  smaller and set back, with a flared horn mouth and two sound arcs - the Alarm's bars); cue glyphs `alarm` / `screecho` in
  `js/cues.js`. **Colours** (two new palette roles, picked with `tools/palette-check.js`, CIEDE2000 to the nearest other colour
  under the palette's visions): Default Alarm `255,236,40` siren yellow (13.5, key) / Screecho `40,255,240` aqua (18.9, exit) -
  both further than Default's own worst pair 11.9; High contrast the same two (12.5 / 16.6 vs its 17.2); red-green
  `225,255,0` / `240,105,195` (12.1 / 10.9 vs 16.9); blue-yellow `120,135,45` / `180,120,255` (16.8 / 12.6 vs 13.7). The
  crowded palettes could not fit two more colours as far apart as their own worst pair without going dull - reported to
  the owner; the shapes are what tells them apart there.
- **Editor**: `monsterChoices()` carries `unreleased`; the list button gets a small "Unreleased" tag (`.ed-tag`). Thumbnails
  draw no monsters, so nothing there. Placement and validation are the shared rules.
- **Codes**: `WORDS.monster` + `alarm`, `screecho` at the END (format 1 unchanged; no schema bump - a kind is a word).
  Measured: v15.6 opening such a code says "This code was made in a newer version..."; a SAVED level with them is read
  by v15.6 as foreign (playable without them, not editable - the v15.0 rule).
- **The warning** (`#editor-unreleased`): see "Unreleased content" in Constraints. Focus goes to I understand; Esc is Back.
- **Older test suites**: editor-test / editor-test-2 / bonus-test / share-test / title-test step through the new warning with
  a `passUnreleased()` helper (the warning has its own tests); editor-test's storage suite now spaces its "one of every
  monster" row one tile apart (two more monsters no longer fitted the gallery).

### Tests (`tools/monster-test.js`, headless Edge)

alarm 24/24 (standing on it, walking through it, crouching + pressing ripple: nothing; the hum: 4 ticks in 4 s at 200 px,
placed, a cue, silent at 700 px; a ripple from 160 px: one scream 0.28 s later, the spot = where you stood, echo / scent /
mimic (revealed) / stalker / muffler / singer all sent - the farthest 963 px away - the Level 15 monster not; you move away
and they still go to the old spot; spent, no second scream, no hum); alarmOthers 5/5 (a dropped decoy's call beside it, a
singer singing beside it: no scream); screecho 9/9 (speed MEASURED 140.0 px/s = `cfg.enemySpeed`; listens at the spot,
footsteps lock it on, touch kills with "The echo found you."; cooldown MEASURED: pinged every 1.5 s for 26 s, screams at
0 and 20.8 s - 20 s + the recharge and the wave's travel - and only twice); tuning 14/14 (monster speed x0.5 / x1.5 exact,
the 169 cap, Hardcore-rated faster and still Try again; calm: shake 0 vs 5, `audio.calm`, the cue and the caption in both);
gate 22/22 + gateFinished 4/4; sharing 6/6 (round trip, deterministic, the v15.3 sample codes still decode, 160
characters); editor 13/13 (the list and tags, placed with the mouse, refused on the start / in a wall like any monster,
test play); campaign 4/4 (204 generated levels 0-16 - four modes x three seeds, the bonus levels, levels played: neither kind); noWrites
2/2; soak 2 x 25 random levels x 40 s = 120,000 frames, 169 screams, 422 catches, 0 exceptions. Also: generator
`9097b344`; the eight identity games identical to v15.6; every v15.0-v15.3 and v15.5 suite passes.
**Not judged by ear or eye**: the hum, the scream, the Screecho's whine, the art and the colours.

## v16.0: the keeper scene - between level 13 and the gaol (owner's brief, MAJOR)

Owner: a new cutscene between level 13's capture and level 14's wake-up. The Warden carries the unconscious explorer
into the gaol, lays them in their cell, the cell door shuts, it locks the gaol door from outside and slides the key back
in under it - the key skids away out of sight - then the steps fade, a single drop falls, and it cuts to level 14's
wake-up. About 25-30 s, never over 35. No dialogue or text except Visual cues captions. **Lit only by drips; the Warden
makes no light, has no face and gains no ability**; the v12.2 Warden art through `EchoWarden.drawHunter`, everything
else `EchoArt`. The cell block shows bent bars, tally marks, an empty cell and an ambiguous slumped shape (no known
monster). Calm mode and Visual cues as in the other scenes. **First time unskippable** (no key, tap, Esc or button) but P
pauses it and pausing never skips; closing mid-scene leaves it unseen; afterwards seen, in the replay screen with a
neutral title, skippable. The existing already-seen and v7.1 catch-up rules; the seen flag with the others; no effect on
medals, stats, fragments or the editor. Keep the spelling "gaol".

### Where it lives

- **`js/cutscene.js`**: `buildKeeper()` / `updateKeeperScene(dt)` / `drawKeeperWorld()` / `keeperBlack()`, the `KP_*`
  constants (every time in the scene is one of them), `PAL_KEEPER`, and `'keeper'` rows in `SCENE_START` (0),
  `SCENE_PAL` and `SCENE_AMBIENT` (14 - level 14's drips and ambience, so the cut into the level is seamless).
  **The stage is level 14's own map** (`EchoStory.build(14, cfg)`: the same walls, bars as `bar: true` obstacles, the
  gaol door with its `swing`), with the story's key and drip spots cleared and the door open at the start. The scene's
  only light is `KP_DRIPS` - twelve drops, each a real `env.castRipple(x, y, R, { ambient: true })` through the game's
  own ripple code, so they light stone, bars, the door and the key exactly as in the level (`KP_DRIP_R` 128; the last
  drop 76, level 14's). People and the key are lit by `kpLit(x, y)` - how much drip light reaches that point now
  (`exp(-age / 1.3)`, the game's own fade) - so nothing is ever seen that a drop has not lit, and a shut door
  (`swing < 0.5`) blocks it (`kpSees`).
- **The beats** (seconds; `KP_END` 31.6): 0-2.8 in through the gaol door from the passage (`KP_IN`); 2.8-12.8 west down
  the cell block, past the bent bars (x 713-767), the slumped shape in a shut cell (`KP_SHAPE`), an empty cell and the
  tally marks (`KP_TALLY`: three groups of five and two); 13.6-15.2 the explorer laid down in the end cell
  (`KP_CELL` = level 14's start, so the wake-up finds them where they were left), the Warden's grip reaching 0.32 and
  back; 16.6-19.3 the cell's gate drawn shut with a clang and **swinging back open** (see below); 18-21.2 back east; at
  20.4-22 a cut to black and back, to the far end of the block, inside the door; 21.6-23 the gaol door swings shut;
  23.5 the lock turns; 24.6-27 the key comes in under the door and skids along the stone into the open cell at the
  bottom (`KP_KEY_PATH`, ending at level 14's key tile 13,6) where it glints once when the 25.0 drop catches it;
  27.4-31 the steps fade; 29.9 the last drop; 30.6 the fade; 31.6 `finish` -> level 14.
- **Sound** (`js/audio.js`): `keeperDrag` (a lowpassed scrape with a 38 Hz body under it; calm x0.6) and `keySkitter`
  (a bandpassed tick plus a short triangle ping; calm x0.7) are new; everything else is level 14's (`drip`, `doorRattle`,
  `doorOpen`, `doorUnlock`, `echoKey`) and the hunting Warden's (`createEnemyVoice(46.25, 'warden')`, `wardenStep`).
  Captions: `[slow, heavy steps]`, `[something heavy, dragging on stone]`, `[water drips]`, `[something set down on
  stone]`, `[iron bars clang]`, `[a heavy door swings shut]`, `[a lock turns]`, `[metal skitters across stone]`,
  `[footsteps, fading]`, `[a single drop]`.
- **`js/game.js`**: `SCENE_BEFORE_LEVEL[14]` and `SCENE_LEADS_TO.keeper` = 14; `onCaptured()` now
  `startCutscene('keeper')` (its finish hands on to level 14 through `SCENE_LEADS_TO`, every time); `SCENES` gains
  `{ kind: 'keeper', name: 'Somewhere Deeper', blurb: 'Between one dark and the next.' }`.

### The rules it adds (both in `js/game.js`, both one place)

- **`SEEN_AT_END`** (`{ keeper: true }`): scenes that (a) **cannot be skipped until they have been seen once**
  (`env.canSkip(kind)` - `cutscene.skip()` refuses, the Skip button is hidden and a tap does nothing) and (b) **count as
  seen only when they play to the end** (`env.finish` writes `echomaze.seen`; `startCutscene` does not, as it does for
  every other scene). So closing the tab mid-scene leaves it unseen and it plays again from the start. Every other scene
  is exactly as before (seen at its start, skippable after 0.6 s).
- **Cutscene pause - for every scene**: the pause action (P, rebindable) in `state === 'cutscene'` toggles
  `setCutscenePaused`: `frame()` stops advancing `cutscene.update`, the AudioContext is suspended (as the pause menu
  does), `#cs-paused` shows "Paused P", and **nothing skips while paused** (`canSkip` is false). It clears itself when a
  scene starts or finishes. No cutscene could be paused before - flagged to the owner. Touch has no P key, so a phone
  cannot pause one (the scene is unskippable only once, and the screen can be left alone).

### Choices made (flagged to the owner)

1. **The cell gate does not latch.** Level 14's map has the player's cell door OPEN (`'o'` at 3,3) - the wake-up walks
   straight out of it - so the gate is drawn shut with the clang the brief asked for and swings back ajar on its own.
   The lock that turns is the **gaol door's** (level 14's locked door). "Locks the gaol door from outside" is exactly
   that; the cell is shut, then isn't.
2. **The key** goes under the door and skids west along the corridor into the open bottom cell (12-14), coming to rest
   on level 14's key tile - out of sight from the door, where the player then finds it.
3. **Already seen: it plays on every 13 -> 14**, like every scene on the way into its level, skippable after the first
   viewing. (Level 13's own capture plays every time too, v12.1.)
4. **Existing saves**: on level 14 and unseen -> Continue plays it (unskippable) then level 14; on 15 or 16 -> no
   catch-up (it is not the scene for the level being entered - the v7.1 rule), and it is in the replay screen (unlocked
   because `furthestReached() >= 14`); played from there it is still a first viewing, so unskippable. Finished saves:
   the replay screen. At 13: it plays after the capture. A fresh save: "???" in the replay screen. The level list:
   picking 14 while unseen plays it first; 15 goes straight in.
5. The Warden is drawn at r 19 (`KP_WARDEN_R`; 18 in play) with no reach but a gentle 0.32 when laying the explorer down.

### Tests (`tools/keeper-test.js`, headless; run per save by a scratch driver)

handoff 7/7 (the capture -> the scene -> level 14 in `wake`, the same black); firstTime 17/17 (Enter / Space / Esc /
the button / a tap refused for the whole scene; P pauses - the clock and the AudioContext stand still and nothing
skips - and P resumes; seen written only at the end; level 14 after; another scene paused is not skipped by Enter
either, and is once going again); closeMid 1/1 + afterReload 2/2 (a reload mid-scene leaves it unseen, and it plays
again from the start); seenAfter 8/8 (skippable after 0.6 s, the replay screen lists and plays it, back to the replay
screen); settings 8/8 (calm on and off x Visual cues on and off: it plays through, the captions only with cues, and no
other text - no card, no subtitle); noWrites
2/2 (only `echomaze.seen` changes - no progress, medals, stats, lore or editor key); saves: fresh 2/2, at 13 2/2, on 14
4/4, on 16 5/5, finished 4/4 (point 4 above); soak 8 runs, 0 exceptions. Also `node tools/check.js --full` 50/50,
generator `9097b344`; the v15.7 folder vs this build - story-bot on 14 / 15 / 16 / 16-hard / 15-hardcore /
16-easy-pinging and the identity games normal L3/s5, L8/s7 (reveals), hard L11/s4 (chase), normal L12/s9 (chase),
**normal L13/s3 and L14/s3**: every line identical. Screenshots of ten moments (the brief asked):
`C:\Claude\echo game\Echo Maze\Cutscene screenshots (v16.0)\`. **Not judged by ear or eye in motion**: the pacing, the
drag / lock / skitter sounds, the drips moving.

## v16.1: monster descriptions in the level editor (owner's brief, MINOR; editor UI only)

Owner: a short, simple description of what each monster does, in the editor's monster list - on hover, on being picked,
on keyboard focus, and on a tap - in one consistent place that never jumps or pushes the editor off screen at any size;
for a placed monster too if it fits; stored beside the monster definitions so a new monster needs its description in
the same place, with a test that fails without one; numbers (the Wardens' speeds) built from the game's constants;
accessible (screen reader, contrast, text size, keyboard, mouse, touch); only inside the editor. Nothing else changes.

- **Where the words live**: `about` on each `MONSTER_TYPES` entry (js/level.js) and on each Warden variant (js/warden.js
  `VARIANTS`, beside its `label`) - a string, or a function when it needs a number or a name: `percentOfYou(WARDEN_SPEED)`
  / `WARDEN_UPGRADED_SPEED` (the words "slowly" / "a little faster" are chosen from the value too), `SCREECHO_COOLDOWN`,
  and `hunterNames()` (the Wardens as the editor labels them). `monsterChoices()` hands each choice its `about`.
- **The panel** (`#ed-about`, js/editor.js `renderAbout`): at the foot of the side panel, OUTSIDE the scrolling pane - the
  Build and Level settings panes now scroll on their own (`#editor .ed-side > .ed-pane`), so the panel can never cover
  the list, a button, the map or the bars, and it has a FIXED height (`clamp(86px, 24vh, 172px)`; 84 px under 560 px tall;
  a 58 px two-line strip under 420 px, the name running into the words), so changing text never moves anything; a long
  one scrolls inside it. It shows the monster under the mouse (pointerenter - a touch never "hovers"), else the one with
  keyboard focus (checked against `document.activeElement`), else the one picked; with its Unreleased tag; hidden on the
  Level settings tab. 13 px, `--ink` on the panel: contrast measured 10.4:1 (the name 11.4:1).
- **Screen readers**: each monster button has `aria-describedby` -> a span in the hidden `#ed-about-sr` with the same words
  ("Unreleased. " first for those two), so focusing or picking it reads the description; the visual panel is
  `aria-hidden` (no double reading). **A placed monster**: the inspector (already `aria-live`) shows its description under
  its name.
- **Words changed from the brief** (flagged to the owner): the Warden is never named on screen (the game's rule since
  v13.0; the editor calls them "Level 15 monster" / "Level 16 monster"), so the Wardens' and the Alarm's / Screecho's
  descriptions use those labels; the **Stalker** does NOT ignore decoys (every monster answers a decoy since v11.1), so
  its description says ripples only; the **Scent monster** does not track puddles themselves - you smell after stepping
  in one - and puddles are not lime in every palette, so it says "smell puddle" (the legend's name); the **Screecho**'s
  "short pause between screams" is "at most once every 20 seconds" (the constant).
- **Tests** (`tools/editor-about-test.js`; coverage, canFail and numbers are in the quick set of `tools/check.js`, the rest
  in `--full`, layout at 1366x768, 1280x720, a 1024x768 tablet and an 844x390 phone): coverage (every MONSTER_TYPES kind
  and every Warden variant has one, 1-3 sentences, at most 220 characters, never "Warden"), canFail (takes one away in
  memory - it fails - puts it back), numbers (every number in every description is a constant's), ui (every monster:
  hover, focus + what a screen reader gets, picked, a tap; the tag; each placed and picked shows it in the inspector;
  the tabs), layout (on screen, over nothing, never moves, every monster and control reachable, no page scroll, 13 px,
  contrast), noLeak (nowhere outside the editor, in the title, How to play or a level), soak (400 random actions).
  Screenshots: `C:\Claude\echo game\Echo Maze\Editor screenshots (v16.1)\`.

## v16.2: lore fragments on levels 13-16, and the hidden scene (owner's brief, MINOR by the owner's word)

Owner: one fragment on each of 13, 14, 15 and 16, placed by hand (not on the route, blocking nothing, reachable with no
danger the level does not already have: on 13 before the point of no return, on 15 before the light is revealed, on 16
before the Warden breaks out), found and read like the others, with the same CHANCE table; new ids (not f13), old saves
compatible (12 found -> "12 of 16"), every total from the real count; the owner's four lines; and a hidden, optional,
skippable, wordless scene that unlocks when all 16 are found - never played automatically. Gameplay, monsters, the
generator and the routes unchanged.

- **The fragments** (`js/lore.js` FRAGMENTS, `at: [tx, ty]`): s13 (17,15) the spur below the great room, walled off from
  it (the capture's involuntary gasp cannot see it); s14 (13,1) the back wall of the open middle cell of the top row,
  drawn as scratches (`art: 'scratches'`, `label: 'Scratched into the wall'`); s15 (11,16) the dead end off the first
  stretch, 700+ px from the light; s16 (1,1) the antechamber's far corner, a recording - pitch 0.8, shake 0.07, 13 cps,
  cut off in static. `place()` makes the same first draw from the same stream as levels 1-12 (`runSeed ^ imul(n,
  0x85ebca6b) ^ 0x10a3f7c1`), so presence is nested by mode; a hand-placed one makes no second draw. The level is read,
  never written. The ids are `s13`-`s16` because `f13` is the bonus line's and an id is never reused.
- **Totals**: `TOTAL` is FRAGMENTS.length (16); the reader's "N of 16", the Fragments screen, the bonus line ("Find all
  16") and the scene all use it. **A save from before this has 12 found -> "12 of 16", and the bonus line is locked again
  until all 16 are** (it unlocked at 12 before) - the owner's "every total from the real count".
- **The hidden scene** (`'kept'` in js/cutscene.js: `buildKept` / `updateKeptScene` / `drawKeptWorld`, `KT_*`): the
  keeper scene's stage (level 14) and light (`kpLit` over `KT_DRIPS`), a closer camera (x3.4) on the top row's middle
  cell. The Warden at its back wall traces forty scratches with its limbs (`drawHunter` reach + target), a soft tick per
  group; two slow steps aside; lays the notes down - one per fragment (16), pages and cassettes - one every 0.75 s, a dry
  paper sound each; stays; its hum fades; a last drop; black. About 28.6 s. No face, no light of its own, no text (Visual
  cues captions only). Calm mode: the drops' light x0.8 and quieter sounds, as the keeper scene.
- **Unlock and where it lives** (js/game.js): `EchoLore.secretUnlocked()` = every fragment found, worked out from
  `echomaze.lore` (nothing else stored); `SCENES` has `{ kind: 'kept', secret: true }` - `canReplay` is the unlock, and
  a secret one is **not listed at all** in Levels & cutscenes until then (my choice over a "???": the brief asked for
  nothing to announce it). The Fragments screen gets a last row, "Kept", to play it. `playScene(kind, from)` goes back
  to the screen it came from. It is in no SCENE_BEFORE_LEVEL / SCENE_LEADS_TO / SEEN_AT_END, so it is never played by
  the game, never caught up, and skippable from the first time; playing it marks `seen.kept` (nothing reads it).
- **The notice**: reading the LAST missing fragment shows the "Progress saved" corner toast with "Something has changed
  in Fragments." for 3.6 s (`showSaved(text, ms)`), on top of the line's own "all 16 found". Nothing before that.
- **Lines that would overlap (13-16 only)**: a hint that arrives while a fragment's line is up waits for it, and one
  that the line pushed away comes back after it (`loreBannerBack`); a spoken line (`#say`, e.g. "A key." - level 14's
  key is right below its fragment's cell) is lifted just above the fragment's line while both are up
  (`stackSayOverLore`). Levels 1-12 are unchanged.
- **Test copy**: every fragment found (the builder's regex reads `[a-z]\d+` ids); `echomaze.test.lorekeep` = N leaves only
  the first N found on every load, to test the locked state and the unlock moment (the READ ME says how).
- **Tests** (`tools/lore-story-test.js`; placement in the quick set, the rest in `--full`): placement 35/35 (a path from
  the start with nothing opened, 4+ tiles out of the way, before each point of no return; over 200 seeds the same tile,
  Easy 200 / Normal 156-172 / Hard 89-116 / Hardcore 0, nested); discovery 27/27 (crouched: no; a drop's ripple: no;
  level 13's gasp: no; a singer's song on level 12: no; your ripple: yes; the beats not set off); reading 10/10;
  archive 16/16 (12 and 15 found: no secret anywhere; the 15th: no notice; the 16th: the notice, play goes on, then it is
  in both screens); scene 8/8 (from each screen and back, skips the first time, to the end, Calm, never by itself);
  noWrites 6/6 (a find writes only `echomaze.lore`, the scene only `echomaze.seen`; medals untouched; a custom level has
  no fragment); saves on fresh / partway / 12 found / finished saves; soak 86,400 frames, 0 exceptions. **v16.1 vs this
  build, identical**: the capture's phases to the hundredth (Easy and Normal), the wake (controls back at 4.62 s), eight
  story-bot runs on 14-16 (key, door, light, release, chase gaps), eight identity games incl. levels 13-16 on Easy;
  generator `9097b344`. Screenshots: `C:\Claude\echo game\Echo Maze\Lore screenshots (v16.2)\`.

## v16.3: What's new (owner's brief, MINOR)

Owner: a "What's new" screen for returning players, once, on the title only, after an update they have not seen notes
for; never for a brand-new player; its own storage key; damaged or missing storage never crashes or nags; several
versions skipped -> the notes since the last seen, newest first, capped at five, with "See all updates"; a quiet button
that opens the whole history at any time; one data file with an entry per version; a spoiler rule for story lines; a
check that fails without an entry for VERSION.json's version; a calm, accessible dialog.

- **The notes** - `js/whatsnew.js` (`EchoWhatsNew`, no DOM), loaded FIRST of the game's scripts so it can see whether
  the browser already held a save of this game before anything on the page writes one. One entry per version, NEWEST
  FIRST, from v15.0: `{ version, title, lines, silent? }`; a line is a string or `{ text, tag: 'Level editor', minLevel }`.
  The current version is the newest entry. v15.4 is the one silent version (a death tip's wording on custom levels).
- **The spoiler rule**: a line about story content (levels 13 and up, new scenes, what is in them) has `minLevel`, and is
  shown only when the player has reached that level - the furthest level unlocked in any mode (`furthestReached()`).
  Until then it is left out and its version shows "New story content to discover." ONCE, however many of its lines are
  held back. Today: v16.0's new scene (level 14) and v16.2's fragments (level 13). Lines about the editor carry the
  'Level editor' tag and name no monster (the editor is behind its own spoiler warning); none names the Warden.
- **When it shows** (`maybeShowWhatsNew` in js/game.js): 0.9 s after the title first comes up on a page load, only if the
  title is up on its own (`state === 'title'`, no fade, no other screen, no Settings or question) - otherwise the next
  time the title is back (toTitle, closing How to play / the replay screen / Fragments / the editor / Settings). It
  decides once per page load (`EchoWhatsNew.decide`): **a brand-new player** (no `echomaze.*` key when the page loaded,
  other copies' `echomaze.test.*` ignored) - nothing shown, the current version recorded; **no record but a save** (a
  player from before v16.3) - the newest five; **a record** - every told version newer than it, newest first, at most
  five; **a damaged record** - the newest five, once, then written afresh; **storage that throws** - nothing shown, no
  error; **storage that cannot be written** - shown once on that page load, never twice. Dismissed (Got it, Esc, Enter, a
  click or tap outside the panel) -> `echomaze.whatsnew` = the current version.
- **The dialog** (`#whatsnew`): `role="dialog"`, `aria-modal`, labelled by its heading; Got it focused on opening; Tab
  goes round inside it; focus goes back where it was (or to Continue / Begin); while it is up the game's keys do nothing
  else (`whatsNewKey`). The panel uses the overlays' look; the list scrolls only when it must (a phone held sideways, or
  the whole history); a simple fade on `--ui-fade`, none with reduced motion. Five entries fit without scrolling at
  1280x720 and up.
- **Where else it lives**: a small "What's new" pill in the title's bottom-right corner, beside the version tag (with a
  dot while there are unseen notes). **On a phone held upright (max-width 640px) the pill is not shown** - the title card
  is the whole screen there and the pill sat on its buttons - and "What's new" is in Settings' bottom bar instead (from
  the title only). The phone layouts are as v16.2 (390x844: the card 814/814, Begin at 553-606).
- **Installed app and website**: the same files and the same storage; the service worker is network-first, so the new
  notes arrive with the new version (tested: a page served by the service worker shows it). On a phone the installed
  app and the browser share storage, so the notes show once, in whichever is opened first.
- **Tests** (`tools/whatsnew-test.js`; in `tools/check.js --full`, and the notes check in every run): decisions 16/16,
  spoilers 7/7 (+ two real saves, level 3 and past 16: the held-back lines shown only to the second, the generic line
  twice for the first), dialog 13/13, never 5/5 (not in play, over a cutscene or How to play; on the title afterwards,
  once), layout at 1920x1080, 1366x768, 1280x720, 844x390 and 390x844, soak 400 actions. Removing the newest entry makes
  the check fail. Screenshots: `C:\Claude\echo game\Echo Maze\What's new screenshots (v16.3)\`.

## v16.4: the Caught screen names what caught you (owner's brief, MINOR, text only)

Owner: the line under "Caught" said the echo found you whatever caught you (v14.1 had already given the Warden its own
line); name the monster that really did it, in one short line each, from ONE table keyed by type, with "The echo found
me." as the fallback; every way of being caught; the first to touch when two do; nothing else changed.

- **`CAUGHT_LINES`** (js/game.js, beside `onCaught`) - keyed by the kind (MONSTER_TYPES): echo "The echo found me.",
  scent "The scent monster followed my trail.", mimic "It wore a voice I trusted.", stalker "The stalker followed me the
  whole way.", muffler "The muffler heard me first.", singer "The singer sang me in.", warden "It never lost me.",
  'warden:upgraded' "It was faster than me.", alarm "The alarm gave me away.", screecho "The screecho screamed, then found
  me." `caughtLine(cause, e)` reads it (own keys only, so '__proto__' and the like are the fallback); `CAUGHT_FALLBACK` =
  "The echo found me." for a kind not in it or no kind at all. **First person** (the owner's examples: "The echo found
  me."); the line before was "The echo found you.". **The Warden is still never named** - the owner's example was "The
  Warden found me.", but the game has never shown that name (v13.0 on); "It never lost me." is v14.1's line in the first
  person, and level 16's gets its own. **The Alarm never catches anyone** (touching it is harmless, v15.7) - its line is
  in the table for completeness. **The sonar decoy** (named in the brief) is an item, not a monster: nothing to add.
- **The catch** (`updatePlay`'s outcomes): every monster touching you this frame is measured, and the one furthest inside
  its reach - the one that got there first - is the catcher; it is handed to `onCaught(cause, why, catcher)`. The
  singer's landing passes the singer. A revealed mimic still counts as the mimic (`fromMimic`). Same frame, same state:
  only which monster is named (and counted in the stats on a tie) can differ.
- **Hardcore** has no Caught screen: its notice on the title quotes the line. **Each catch is numbered** (`catchCount`):
  its delayed screen (900 ms) shows only for itself - before, a catch less than a second after another (possible only
  through test hooks) could show the earlier one's screen.
- **Tests** (`tools/caught-test.js`, in `--full`): custom 12/12 (every kind in a custom level, both Wardens, a mimic
  disguised and revealed, a singer's touch and its landing; the Alarm catches no one), campaign 16/16 (levels 3, 6, 8, 10,
  11, 12, 15, 16 and a Hardcore notice; the tutorial has no monsters), shared 6/6 (levels read from share codes), fallback
  7/7, together 2/2 (6 px vs 16 px on one frame, both ways round), layout at 1366x768, 390x844, 844x390 and 360x740.
  v16.3 vs v16.4 identical: the capture, the wake, eight story-bot runs, eight identity games (with chases that end in
  catches); generator `9097b344`.

## v17.0: Act 2, the broken gaol - levels 17-20 (owner's brief, MAJOR)

Owner: four hand-built levels after 16, like 13-16, each breaking ONE rule of the maze; no lore text, no cutscenes,
no new monsters or sounds, no fragments; the ending stub moves after 20; a save that finished 16 carries on to 17
without losing anything or being told it "finished"; the void (edges fading to black with slow static and flicker, a
low ambience, a rare distant fall that never lands) stronger each level, drawing and sound only, cheap on phones; the
16 -> 17 hand-over as 15 -> 16 plus a low rumble and one glitch; hints "Trust your ears." / "Listen for the grinding."
/ "Remember the drip." / "It answers late."; the existing difficulty system and caught lines; **levels 0-16 and the
generator unchanged, the new tiles STORY-ONLY** (never in the editor, its format, share codes or the WORDS lists).

### Where it lives

- **`js/level.js`**: `STORY_LAST` = 20 (so `CAMPAIGN_LEVELS` = 20, `isStoryLevel` 14-20). Nothing else.
- **`js/story.js`**: `LEVELS[17..20]` with `act2: true`, `kind` `'liar'` / `'shuffle'` / `'loop'` / `'behind'`, `void`
  1-4 (`VOID`: the band of black, the static's strength and flicker, the gap between falls - all drawing and sound);
  18 `slideRange` 240 px; 20 `ripple: { speed: 0.42, lag: 0.45 }` and `wake` 10. The map legend (story-only): `g`
  ghost wall, `h` hidden wall, `A`/`B` a sliding wall and its other place, `1`-`4` fold pairs, `E` echo monster, `T`
  stalker, `d` drip, `W` (20) a Warden. `build()` makes `level.act2` (`ghosts`, `hidden`, `slides`, `slideRange`,
  `folds`, `foldPair`, `rayWalls` = walls + ghosts - hidden: what a RIPPLE sees), `level.rayWalls`, `rippleScale`,
  `rippleLag`, and `pathTiles` from **`EchoStory.solve(level)`** - a search over (tile, every sliding wall's state)
  where a ping toggles the slides in range (never one onto your own tile) and a fold moves you to its pair. In
  `create()`: `startAct2` / `updateAct2` (the fade in, the banner, the drips, `audio.startVoid(void)`, the falls), on 17
  the rumble (`stoneGrind` + `wardenStep`) and `glitch(true)` at 0.15 s, `onPing` (17's first ripple stutters),
  `flicker` (a fold), `drawVoid` (four edge gradients and one 96 px static tile moved a few times a second - never a
  strobe; calm: slower and fainter), the glitch tear and fold flicker in `veilDraw` (calm: a plain dimming), and 20's
  Warden: the stone splits `ACT2_WARN` (1.5 s) before `wake`, then `env.wake(h, 'hunt')`.
- **`js/game.js`**: `raycastGrid(grid, ...)` (the DDA over any grid - `castRipple` uses `level.rayWalls` when there is
  one); `castRipple` / `touchMonsters` / `updateRipples` / `drawRipple` take the ripple's speed from `rp.v` and add
  `rp.lag` (so a level without them is byte-for-byte the old code path: `RIPPLE_SPEED`, lag 0); ghost rays shimmer; the
  ACT 2 block - `act2Ping` (grind + cue, then the slide moves `SLIDE_DELAY` 0.55 s later, refused with a bump if anyone
  stands on its target), `act2Touch` (a ghost comes apart with `loreStatic` and `[a glitch]`; a hidden wall thunks with
  `wardenStep` and shows; a fold teleports, `singerWhoosh`, `[a rush of air]`, the camera snapped, `story.flicker()`),
  `act2Update` (slides, the waves that come out of a fold's pair, flashes), `act2Draw`; hints 17-20;
  `ALL_MONSTERS_MET_AFTER` = 16 (the editor stays unlocked for whoever has cleared 16 - there is no Act 2 monster Act 1
  lacks); the debug `wakeHunter` reads the variant.
- **`js/audio.js`**: `startVoid(depth)` / `stopVoid()` (a low hum that deepens with the level) and `voidFall(pan, gain,
  depth)` (a falling whistle that fades out and never lands). Everything else is an existing sound.
- **`js/music.js`**: `level >= 17` -> the `gaol` mood. **`index.html`**: the ending stub's comment says 20.
- **Not touched**: `js/lore.js` (no fragments on 17-20), the editor, `js/levelformat.js`, `js/sharecode.js`.

### The levels (all `tools/act2-check.js`-checked; maps in js/story.js)

- **17 the liar** (29x14, void 1): within the first stretch the first ripple stutters, then an obvious ghost wall across
  the corridor, then a hidden wall that thunks; more of each later (ghosts on the way through, hidden walls off it).
  One echo monster.
- **18 the shuffle** (27x12, void 2): four sliding walls; the way through needs three pings (unsolvable without the slides).
  One stalker.
- **19 the loop** (26x13, void 3): two fold pairs - one brings you back beside the start (the long corridor), the way
  out goes through the other; one drip as the landmark. One echo monster in a ring of corridors that joins the way
  through only near the start (v17.0's tuning closed its other door at (23,10): it drifted into the single corridor
  the way out needs and blocked it).
- **20 the echo behind** (29x13, void 4): ripples at 0.42 x speed, shown 0.45 s late (monsters' sounds stay instant). A
  **regular Warden in the stone two tiles behind the start**: the stone splits at 8.5 s, it hunts from 10 s at level
  15's speed (`WARDEN_SPEED`). **It only ever reaches you along the way you came** (checked), so a clean run stays
  10.2 s ahead at the closest and about 9 s of standing still at the start is survivable. One echo monster deep inside,
  guarding the wrong turns. Its way out -> `onStoryEnd` (the stub).
- **Why 20 is a Warden and not a second roaming hunter (my call, within the brief's "or a hunter plus a
  standard-speed Warden")**: with a stalker the bot cleared Hard 1/6 and Hardcore 2/6, and changing the bot's tactics
  moved those numbers from 0/8 to 6/6 - a roaming hunter in one-tile corridors is a coin toss that cannot be shown
  fair. A Warden that comes from behind is fair by construction and can be measured. The first spot tried for it
  joined the way through near its END, so stopping meant meeting it head on - hence the "from behind" check.

### Saves

`CAMPAIGN_LEVELS` 20: best 17 (finished 16 before) -> "Continue (Level 17)", not "Finished"; best 21 -> Finished; the
editor unlocked for best > 16. No new keys. The test copy (built from `CAMPAIGN_LEVELS`) is finished at 21.

### Tests

`node tools/act2-check.js` (Node; in every `tools/check.js` run): 45 checks - each level builds with no warnings, is
hand-built (same walls for any seed/mode), can be finished in 25-110 tiles; 17 has ghosts on the way and hidden walls,
18 needs pings and slides, 19 needs a fold with one near the start and one drip, 20 is slowed and late with a regular
Warden whose head start is >= 3 s and who only comes from behind; every monster on open floor and roamers >= 10 tiles
from the start. `tools/act2-test.js` (`--full`): liar 13/13, shuffle 8/8, loop 4/4, behind 10/10, walkAll 4/4,
walkMonsters 13/13 (17, 19, 20 with monsters in every mode, and 20 after standing still 9 s), firstTime, perf (frame
0.1-0.5 ms at 1366x768 and 844x390 touch). **Bot fairness** (real keys, the solver's route, never pinging on 20,
crouching only when a stalker is within 190 px): 17 24/24, 19 24/24, 20 24/24 clean runs in all four modes; **18
about three in four** (per mode 8/8, 5/8, 8/8, 6/8 in one run and 5/6, 4/6, 5/6, 5/6 in another: the stalker
patrols where it likes and the bot cannot hear it - a player can).
Levels 13-16 (capture, wake, eight story-bot runs, identity games incl. 13-16) identical to v16.4; generator
`9097b344`. **Not checked**: sound and look by ear and eye, a real phone, pacing for a real player.

## v17.1: the Caught lines speak to you (owner's instruction, MINOR, text only)

Owner, on v16.4's first-person lines: *"Its supposed to be smth like 'the warden found you' Not me. But not exactly
that. More of like if the game is talking to me."* So `CAUGHT_LINES` (js/game.js) is now the game addressing the
player: echo "The echo found you.", scent "The scent monster followed your trail.", mimic "That was no way out. The
mimic was waiting.", stalker "The stalker followed you the whole way.", muffler "You never saw the muffler. It heard
you first.", singer "The singer sang you in.", warden "It never lost you." (v14.1's line again), 'warden:upgraded' "You
could not outrun it.", alarm "The alarm gave you away.", screecho "The screecho screamed, then it found you.";
`CAUGHT_FALLBACK` "The echo found you." (and the page's default in index.html). **The Warden is still not named** - the
owner's own example named it, but their standing rule is that player-facing text never does; the lines say "It".
Everything else about v16.4 (which monster counts, Hardcore's notice, the numbered catches) is unchanged.
`tools/caught-test.js` reads the table from the game, so only its fallback string changed.

## v18.0: Act 2 part 2, the void - levels 21-24 (owner's brief, MAJOR: "the crumble")

Owner: four more hand-built levels after 20, the void now physically taking the maze; no lore text (gameplay, sound
and look only); reuse the monsters and sounds; the stub ending after 24 and a finished-20 save carrying on to 21; the
void look and sound stronger than 20's; a story-only VOID tile (a fall that never lands, then the Caught screen - and
a monster over it falls and is gone); 21 crumbling floor, 22 dead air and the Alarm (exactly as in the editor) with a
replayable scene, 23 the void eating the map from the edges on a fixed schedule (Easy slower, Hardcore = Normal, at
least 30% spare time by the solver), 24 a first way out that leads into a smaller half-eaten copy (Try again restarts
that part); hints; the existing difficulty system; no fragments; **levels 0-20 and the generator unchanged; the new
tiles story-only** (never in the editor, its format, share codes or the WORDS lists); the Alarm's editor behaviour
and codes untouched.

### Where it lives

- **`js/level.js`**: `STORY_LAST` = 24; `generateLevel(n, runSeed, modeId, part = 1)` - `part` only reaches
  `EchoStory.build` (24's second part). The fingerprint stays `9097b344`.
- **`js/story.js`**: `LEVELS[21..24]` (kinds `'crumble'` / `'deadair'` / `'creep'` / `'wrong'`, `void` 5-8 - `VOID` 5-8
  stronger static and closer falls, a band that grows less so the edges stay readable), maps between `// <mapNN>`
  markers. Legend (story-only): `v` void, `c` crumbling floor, `z` dead air, `L` an Alarm (`ALARM_PITCH`). Void and
  crumbling floor are `blocked` (no monster walks onto them on purpose). `level.act2` gains `voidGrid`, `crumbles`
  ({ i, state 0 whole / 1 stepped off / 2 cracked / 3 gone, at }), `dead` (1 = dead air),
  `creep` (`creepSchedule`: ring k - k tiles in from the edge - goes at start + k x every, x `easy` on Easy; `layers`,
  `voidAt`), `part`. `build(n, cfg, part)`: part 2 is `LEVELS[24].part2` laid over the level. `solve()` grows
  `solveCrumble` (every state of which crumbling tiles are gone, as a bit mask; reports `stuck` - states the way out
  can no longer be reached from) and `solveCreep` (a breadth-first search in time against `voidAt`; `spare` = how
  much slower than a clean walk still gets out). In `create()`: `drawVoidTiles` (every void tile black with the
  static; 23's next ring thinning into static `CREEP_WARN` 2 s before it goes), 24 part 2's opening (no hint, the
  rumble and glitch of 17's), `atExit` sending 24 part 1 on through `env.nextPart()`, and 20's Warden wake beat reused
  for 24 part 2.
- **`js/game.js`** (the ACT 2 PART 2 block, after 17-20's): `CRUMBLE_CRACK` 0.6 s, `CRUMBLE_FALL` 0.35 s,
  `FALL_SECONDS` 0.8; `levelPart` / `nextPartPending` (24); `fallIntoVoid`, `monsterFalls` (its voice destroyed, the
  fall heard from where it was), `becomeVoid` (a wall there goes too), `voidTouch` (stepping OFF a crumbling tile
  starts it; your centre over the void is a fall), `voidUpdate` (crack -> gone; 23's rings; anything over the void
  falls; the fall -> `onCaught('void', 'fell')`), `voidDraw` (crumbling floor's cracks where a ripple found them, a
  cracking one shaking, the one under you faintly; dead air's black patches). Hooks: `castRipple` (dead air - below;
  `crumbleLit`), `touchMonsters` (`rp.quiet`, `rp.deadIn`), the footstep (dead air: a dull step, `hearFootstep` not
  called), movement and `emitRipple` (not while falling), `startLevel(n, retrying, part)` (a Try again keeps
  `levelPart`; anything else is part 1), `onStoryCleared` (plays `SCENE_BEFORE_LEVEL[n + 1]` as `advanceLevel` does -
  only 21 -> 22 has one), `clearLine` (a monster never string-pulls its path across the void: without it 24's Warden
  cut a corner and fell on its first step), the player's dot shrinking as you fall. `CAUGHT_LINES.void` "The void took
  you."; HINTS 21-24; `SCENE_BEFORE_LEVEL[22]` / `SCENE_LEADS_TO.alarm` = 22; `SCENES` "Only A Voice"; `metThings().alarm`;
  the legend's `alarm` role. Debug: `info().part` / `.falling`, `deadSeen()`.
- **Dead air, exactly**: from OUTSIDE, a ray that reaches it stops there - nothing lit, no echo (`deadIn`); the tile is
  remembered for a black patch (`deadSeen`, fading over 4 s). A wave from outside never touches a monster standing in
  it. A ripple sent from INSIDE (`rp.quiet`) goes out as ever (through other dead air too) and an Alarm never hears it -
  so the patches are the places to look from. Your steps in it: `audio.footstep(0.3)` and nothing hears them.
- **`js/cutscene.js`**: `'alarm'` (`buildAlarm` / `updateAlarmScene` / `drawAlarmWorld`, `AL_*`, `PAL_ALARM`): an
  explorer pings; the wave reaches an Alarm (the game's art and its own hum and scream); an echo monster comes fast
  for the spot they stood on; they are in the side passage, still; it listens and goes. Cards "Some things only call."
  / "It cannot hurt you. Never let your ripple touch it. When it screams, they all come to where you stood." About
  26 s, skippable like every monster scene (only the keeper scene is unskippable the first time), seen at its start.
- **`js/audio.js`**: `startVoid` / `voidFall` take depth 5-8 (1-4 exactly as before). **`js/feedback.js`**: `void`
  tips. **`js/profile.js`** / **`js/settings.js`**: deaths by `void` ("Fell into the void"); the Warden's row now says
  levels 15, 16, 20, 24. **`index.html`**: the stub's comment (24); How to play's Alarm line and legend chip (met by the
  scene or clearing 21).
- **The Alarm in the story, its editor untouched (owner's instruction)**: it stays in `UNRELEASED_CONTENT`, so the
  editor still tags it "Unreleased" and still shows the unreleased-content warning - exactly as before. That list now
  means "not released in the editor's eyes"; `tools/monster-test.js` `campaign()` checks levels 0-16 and the bonus
  levels, which stay free of it. If the owner wants the tag gone, take `'alarm'` out of the list.

### The levels (maps in js/story.js; `node tools/act2-check.js` prints each with its way through)

- **21 the crumble** (34x13, void 5): a 4-tile crumbling bridge over the void right after the start (the teaching:
  cross, hear it crack and fall behind you); a junction where the bridge straight on leads to a closed room (stuck)
  and the true way goes down into a hall (the echo monster's - the bridges are the edge of its world); a second
  junction (straight on: another closed room; north: the bridge on); stepping stones over a field of void (straight
  on: an island; the turn north: the way out). 47 steps; 414 of 752 crumble states are stuck.
- **22 dead air** (33x15, void 6): dead air right along from the start (ping it, walk it); two echo monsters in rooms
  behind; the Alarm on the north wall of a hall with dead air in both ends; after it a corridor with one more patch.
  49 steps; 8 tiles of the way in the Alarm's reach (Normal), 5 tiles of dead air in its reach to hide in.
- **23 the creeping edge** (35x23, void 7): four square corridors one inside another, the way in from each at a
  different side, the exit in the middle; `creep: { start: 10, every: 6, rings: 8, easy: 1.35 }`. 84 steps; a clean
  walk has **127% spare on Normal, 206% on Easy** (an average player at half the speed still gets out); the two
  echo monsters live out on rings 1 and 3 and fall when their ring goes.
- **24 the wrong way out** (part 1 31x13, void 8: a maze west -> east, two echo monsters off the way; part 2 21x11:
  you arrive at its east end, half of it void, and the way out is back west where the first part began; a regular
  Warden in the stone in a pocket behind you, `wake` 10 - a clean run stays 12.1 s ahead and it only comes from
  behind). 50 + 30 steps.

### Tests

`node tools/act2-check.js` (every `tools/check.js` run): 109 checks over 17-24 and 24's second part. `tools/act2-test.js`:
crumble 10/10, deadair 8/8, creep 8/8, wrongway 9/9, walkAll 8/8 (and both parts of 24), walkMonsters (17, 19-24 in
every mode), firstTime (best 21 -> Continue (Level 21), past 24 Finished, fresh -> tutorial), perf 0.1-0.5 ms a frame
at 1366x768 and 844x390 touch (23 with 672 void tiles: 0.08 ms). **Bot fairness with monsters in** (real keys, the
solver's route, 6 seeds x 4 modes): 21, 22, 23, 24 **24/24 each**. The Alarm's scene plays through to level 22.
The test-copy builder rehearsed in a scratch folder: 24 levels, progress 25, 'alarm' seen. Levels 13-16 (capture,
wake, story-bot, identity games) identical to v16.4; generator `9097b344`; 17-20 walk exactly as in v17.0.
**Not checked**: sound and look by ear and eye, a real phone, pacing for a real player (the bot never pings on 22,
so it never meets the Alarm's scream in a run).

## v18.1: the Visual cues freeze (owner's brief, MINOR)

**The bug (v18.0's).** With Visual cues on, level 21 froze about 0.6 s after stepping off a crumbling tile and the
page stayed frozen on every level until a reload. js/cues.js rate-limits a pulse per source in `lastPulse = new
WeakMap()`; v18.0 passed three STRING keys (`'crumble' + c.i` on 21, `'slide' + sl.a` on 18, `'creep'` on 23), the
WeakMap threw "Invalid value used as weak map key" inside `updatePlay`, and `frame()` never re-armed
requestAnimationFrame. Every v18.0 test had run with Visual cues off (cues.pulse returns at once when they are off).

**The fix.** js/cues.js: `lastPulseByName = new Map()` beside the WeakMap, chosen by `typeof o.key` (object or
function: the WeakMap; anything else: the Map). `clock` never goes back, so a name's old time can never block a
pulse; `clear()` never touched the rate limit and still does not. Searched: no other WeakMap / WeakSet in the game,
every other cue key is an object, and `cues.hold` keeps its keys in an ordinary Map. js/game.js: `frame()` is now a
guard around `frameUpdate()` and `draw()` - each in its own try; an error is logged (`FRAME_ERRORS_LOGGED` = 5, then
one line saying the rest are not shown) and the next frame is always asked for; `__echo.frameErrors()` counts them.

**The tests (and the owner's PC).** `Act2Test.cues` runs whatever Visual cues setting the page opened with, with the
REAL loop: 21's bridge crossed with the keys (every tile cracks and falls), 18's walls slid by a ping, 23's first two
rings, every level 0-24 started and running, captions seen with cues on, no console error, no exception, nothing
caught by the loop. Run against v18.0 with cues on it fails with the owner's exact error. `tools/check.js` runs it
with cues on and off, and the Act 2 suites again with cues on (groups can now open with a `save`). The owner's PC
struggled while tests ran: `tools/headless.js` used `browser.kill()`, which on Windows ends only the browser's main
process - its page processes stayed behind, each still running the game, one more per run. It now ends the whole
tree (taskkill /T), ends every open browser if the process exits for any reason, sweeps orphans of earlier runs
(anything running from an `echo-headless-` profile) and their old temp profiles, runs at below-normal priority and
puts every one of the browser's own processes there too, and starts the browser lighter (one renderer, no
extensions, no background networking). Checked: 14 processes while a page is open, all below-normal; 0 afterwards.

## v18.2: level 25, the light - the end of Act 2 (owner's brief, MINOR)

Owner: the finale of Act 2 and, for now, of the story - level 15's mirror: a light at the end of a long way, the
Warden let out behind you, and this time the light is real. No lore text, no cutscene; light, sound and the chase.
Reuse 15, 16 and 21-24's code; no new monsters or tiles. Then a calm placeholder end screen.

- **js/story.js** `LEVELS[25]`: `kind: 'outside'`, `act2` (for the void machinery), `void: 2`, `hunter: 'upgraded'` (the
  W tile builds level 16's Warden - `fast` in `build`), `tripX`, `wake` 1.6 s, `lightFar` 2000 px, `collapse: { delay: 6,
  every: 0.28, stopShort: 14 }`. Map (56x11): the Warden's pocket sealed (`P`) behind the start; a long hall with
  pillars (its middle row clear); two rows of bars (`b`, level 14's) from the hall to the way out - the sight line,
  seen through, never walked; north of them a winding way with four 1-tile stubs (17 turns). **`collapseSchedule`**:
  the floor goes in order of walking distance from the start, one tile every `every` s from `delay` s after the
  release, `relative` (its times count from `creep.base`, which `env.collapse()` sets at the release - Infinity until
  then; js/game.js's creep loop and `drawVoidTiles`' warning add it), stopping `stopShort` tiles before the way out.
  **`startOutside` / `updateOutside` / `releaseOutside`**: level 15's `light` object and drawing at the way out (`draw`
  now runs for `'outside'` too, its pool and glare scaled by `light.k`, which grows from 0.18 to 1 with nearness - 15 is
  exactly as before), `audio.startDaylight` / `setDaylight` growing (no birdsong: it is night); at `tripX` level 16's
  release without words (stone splits, seals open, `hunt` music, `env.collapse()`, the Warden wakes `wake` s later).
  **`atExit`** for `'outside'`: the Warden held at once (`env.hold`), its hum fading (`hushK` -> `env.hush` -> `e.hush`, a
  multiplier on its voice's gain in `enemyAudio` - undefined everywhere else), 3.2 s of quiet, then `white` floods in
  (`veilDraw`, over 3.2 s, never a flash) with the outside sound up full, then faded, and `env.finish()` at 7.4 s.
- **js/game.js**: HINTS 25 "Don't stop."; `env.collapse`, `env.hush`; `onStoryEnd` -> **`showEndScreen()`** with
  `ENDING_TEXT` "More to come soon." and `ENDING_BUTTON` - the one place to change for the next part (the overlay is
  `#ending`, now white fading to dark in style.css; no chime). **js/level.js** `STORY_LAST` 25.
- **Tests**: `tools/act2-check.js` 25 (15 checks): the Warden is the upgraded one and alone; the trip after a long arrival
  (20 steps); **a clean run stays 6.5 s ahead of it** to the light (>= 1.5 s); the run 14.8 s of clean walking; **the
  falling floor never within 11.6 s of a player who keeps moving**, starts after the Warden is past the start and is
  slower than it walks; stops 14 tiles short; the light in sight from the start; 17 turns. `Act2Test.light` (15): seen
  from the start, growing with the sound; the split at the trip, the Warden, the floor going; walked through to the
  end screen; its button; Continue / the save at 26; the last beat (held, hum to 0, white). With Visual cues ON and
  OFF, no page error. `walkAll` / `walkMonsters` / `perf` / `cues` include 25; `wrongway` now expects 24 -> 25.
- **tools/headless.js** (the owner's PC): v18.1's `taskkill /T` missed every page process (the process `spawn` returns
  is not the one that owns them) - 290 were found after a gate run. Now it asks the browser to close
  (`Browser.close`) and then ends every process started from that run's temp profile (`killByProfile`); checked: 0
  left after each of two runs in a row (14 before).

## v19.0: Act 3 begins - Outside 1 (owner's brief, MAJOR: "the outside")

Owner: the first level outside, in full daylight - a calm, wordless breather after 25 levels of dark; a big open field,
nothing to fight or solve; the darkness and sonar off; grass, path, flowers, trees walked under; the player drawn for
the first time; 25's white flood running into it; wind, birds, grass steps, no monsters or music; only movement (and
pause) works and nothing is drawn while you play; generic per-level flags; shown as "Outside 1" but level 26 inside.

- **js/story.js**: `FIELD` (built once at load from its own xorshift - never Math.random): 84x56, walls only at the edge,
  S (4,30), X (82,18); a worn path along one slow curve between them (`path`, 0..1 wear); grass shades from a smooth
  noise (`shade` 0-4); flowers (`flower`); trees (`trees`: a line across the far side with ONE gap where the path goes
  through, and others scattered, never on the path or where you come out). `LEVELS[26]`: `kind: 'field'` and the flags.
  `build` gives EVERY story level `flags` (all false but where a level sets them) and 26 `field`; `exitMuted` for daylight
  (no chime: the wind tells you). `startField` / `updateField`: no black veil - `white` 1 fading to 0 over 4.5 s; the
  outside sound (`startDaylight`, already running from 25: `carryDaylight` keeps `stop()` from cutting it between them)
  louder towards the way on; birdsong every 1.6-5.2 s. `atExit` for `'field'`: white again, `env.finish()` -> the end
  screen. 25's own end no longer stops the sound and finishes into 26.
- **js/game.js**: `levelFlag(k)`; `noRipple` (emitRipple), `noCrouch` (crouchHeld), `movementOnly` (the keydown handler:
  in play, any action but up/down/left/right and pause does nothing - M, C, V and E included), `daylight` (no ambience
  drone or music in `startLevel`; `draw()` -> `drawDaylight()`: only the tiles and trees on screen - grass, path,
  flowers, the edge as hedge, sunlight at the way on, tree shadows, you (`drawWalker`: shadow, stepping feet,
  shoulders, head - facing `player.face`), canopies over you, see-through while you are under one; and
  `audio.grassStep` for footsteps), `noHud` (`body.no-hud`, set each frame while playing such a level: style.css hides
  the HUD, banner, captions, fragment and speech lines, the saved toast and every touch button but the joystick; a
  pointerdown away from the joystick sets `body.show-pause` for 3 s). **Names**: `levelName(n)` ("Level N" / from
  `OUTSIDE_FIRST` 26 "Outside N-25"), `levelShort`, `levelLower` - the HUD, banner, pause line, Continue, the title's
  Best tag, Hardcore's high score and notice, the level list (and its aria labels). **js/palette.js** `daylight` (not one
  of the four palettes: nothing out there has to be told apart by colour). **js/audio.js** `grassStep`.
- **Tests**: `Act2Test.outside` (19, desktop and 844x390 touch, Visual cues ON and off, no page error): 25 -> 26 with
  the sound never stopped, the white then the colour, "Outside 1" / "Level 25" / "Outside 2", nothing on screen, Space /
  Shift / E / V / C / M doing nothing, walking, grass steps (no stone ones), pause shows the menu and closing it hides
  everything again, the tap-to-show pause button for ~3 s, no ripple or crouch button on touch, the joystick walking you,
  the way on -> "More to come soon." -> the title. `walkAll`, `perf`, `cues` (every level 0-26) and `firstTime` (best 26 ->
  "Continue (Outside 1)", 27 Finished) include it; `light` now ends in Outside 1.

## v19.1: First Breath, its tile, and the daylight interface (owner's brief, MINOR)

- **The name**: level 26 is "First Breath" wherever a level's name is shown - one table, `OUTSIDE_NAMES` in js/game.js
  (`levelName` reads it; past its end: "Outside N"). Fresh Air, Open Ground, Same Sky and The Wall are already in it for
  the levels to come: add a level, and its name is there.
- **The tile**: a named level's tile in the level list holds its words one to a line (`.lvl-name`, a span a word),
  centred, at the largest size that fits inside the same tile as the numbered ones (`fitLevelNames`, after the list is
  shown and on every resize, down to 6 px). Checked at 1366x768, 844x390 and 390x844 - and with a longer name.
- **The daylight interface** (`LIGHTUI_KEY` `echomaze.lightui`, Settings -> Display "Daylight interface"): offered only
  once level 26 has been reached in any mode (`lightUnlocked` - before that the row is hidden and a stored '1' does
  nothing), off by default, applied at once (`applyLightUi`, at start-up and on every return to the title). It is ONE
  rule in style.css: `html[data-ui='light'] .overlay, #dialog, #whatsnew { filter: invert(1) hue-rotate(180deg) }` - every
  screen drawn as ever, then its lightness inverted with its hues kept, so every text, border, chip, focus ring and
  button keeps its contrast by construction - and the theme variables set inside those screens to the values that come
  OUT of the filter as dark green (`--ui-rgb`), warm amber (`--exit-rgb`), deep red (`--danger-rgb`) and slate text
  (`--ink`, `--dim`) - they beat the palette's, which are set on <html>, so Calm, Visual cues and every palette work as
  ever. The canvases inside screens (the wordmark, the legend's art, the editor's map) go through the filter too, so they
  read dark-on-light with their hues. Not filtered: the game, the HUD and everything over play (hints, banners,
  captions - readable on the dark and on the daylight), the end screen (its own white-to-dark), the cutscenes. The
  touch buttons get a light plate. The title's own backdrop goes light under it (draw(), drawTitleBackdrop). The test
  copy has it unlocked (its save is past 26).
- **Tests**: `tools/lightui-test.js` - `gate` (hidden before 26, even with '1' stored; there after; off by default; on and
  off at once and remembered), `screens` (the title, How to play, Levels & cutscenes, Fragments, every Settings tab,
  What's new, My Levels and the pause menu - each light, and the worst text contrast on each worked out through the
  filter, at least 3:1), `tiles`, `play` (levels 3, 15 and 26 played with it on, the HUD and captions unfiltered); in
  `tools/check.js` with Visual cues ON and off, on a save before 26, and the tile on phones both ways up.

## v19.2: Fresh Air, the village - level 27 (owner's brief, MINOR)

- **js/story.js** `VILLAGE` (built once at load from its own xorshift): 64x42, S (2,20) at the west end of a street,
  X (62,20) at the east (an open gate in the hedge). `props`: seven `houses` ({x, y, w, h, door, roof}), two fenced
  `gardens` (each with a gap), `fences`, the `well` (a `p` pillar tile), two `stalls`, the `bench`, the washing
  `line`, the `gate`; `built` marks the solid made things (drawn as themselves on grass, not as hedge); `path`,
  `shade`, `flower`, `trees` as FIELD's. **`people`**: each `person({ what, clothes, hair, pitch, small, speed,
  route, every })` - a route of [x, y] tiles walked at `speed` and stops `{ wait, snd, at, face }`, repeated to fill
  `VILLAGE_LOOP` (40 s) into `kf` (keyframes) and `ev` (sounds at fixed moments); `every` a sound made over and over.
  `LEVELS[27]` `kind: 'village'`; `build` hands it as `level.field`. `startField` / `updateField` / `atExit` serve
  both 26 and 27; `atExit` sets `carryDaylight` only when there is a next level (`LEVELS[S.n + 1]`), so the wind goes
  on from 26 into 27 and stops at the end screen. **`updateVillage`**: the day's moment is `clock % VILLAGE_LOOP` - ONE
  clock, so the reset is the same instant for everyone by construction; at the reset `vHush` (`HUSH` 0.5 s) dips the
  wind (`setDaylight` x (1 - 0.65 sin)), and each villager's `alpha` is `0.12 + 0.88 smooth(edge / RESET_FADE)`
  (`RESET_FADE` 0.35 s either side: never a flash); a villager within `KEEP_AWAY` 34 px of you is pushed out to it
  (drawing only - they are never solid and never look at you: their facing is their own route's); `villagePlay`
  plays a sound from where it is (distance and pan) and queues ONE echo `ECHO_DELAY` 0.45 s later at `ECHO_GAIN` 0.4
  (`ECHO_MAX` 14 waiting at most; an echo is played with `echo = true` and never queues another). Footsteps every 26 px
  a villager moves. The player's steps (game.js `audio.grassStep(1)`) never go through it. `villagers()` and
  `state().village` (`phase`, `cycle`, `resets`, `echoes`, `hush`, `people`, `queue`) for drawing and tests.
- **js/game.js** `drawDaylight`: `drawVillage` (the garden's soil rows, fences post by post with rails, the cottages'
  roofs with a ridge, courses, chimney and door, the stalls' striped awnings, the well, the bench, the washing line with
  as many cloths as have been hung so far today, the open gate) and `drawVillagers` (`drawFigure`, the player's drawing
  made general - clothes, hair, size, alpha - plus the ball, the bucket, the broom). **js/palette.js** `daylight.village`.
  **js/audio.js** `murmur` (two or three syllables of the explorers' voice, placed), `ballKick`, `sweep`; `_syllable`
  takes `o.pan`. **js/level.js** `STORY_LAST` 27. The name comes from `OUTSIDE_NAMES` ("Fresh Air").
- **Tests**: `tools/act2-check.js` 27 (12): builds clean, hand-built, open (60 tiles), the houses / fences / stalls solid,
  every door reachable, 12 villagers, no villager's day ever in a wall, every day inside 0-40 s, the tasks and the
  sounds, nobody at the start. `Act2Test.village` (31; 33 on touch): 26 -> 27 with the sound never stopped, the fade in,
  "Fresh Air", nothing on screen, only movement keys, a cottage solid, walking at the sweeper (it makes room, closest
  >= 33 px, never stops you), the same day twice, the reset (one at 40 s, every alpha equal, down to 0.12, at most ~0.1 a
  frame, the wind's hush), the ball's echo (0.45 s later, 0.4 as loud, once), the echoes in the square never above the
  cap and never yours, the joystick, pause, the real loop, the gate -> "More to come soon." -> the title; with Visual
  cues ON and off, desktop and 844x390 touch. `outside` now ends in 27; `firstTime` (best 27 -> "Continue (Fresh
  Air)", 28 Finished), `cues` 0-27, `walkAll`, `perf` and the tiles include it.

## v19.3: Dusk - level 28, and "Nothing Listens" (owner's brief, MINOR)

The owner called it Act 2 in the brief; they had asked earlier not to use the "act" names, so nothing calls it that.

- **js/story.js** `DUSK` (built once, its own xorshift): 150x13, walls only at the edge (the invisible boundary in the
  dark), S (3,6), the Warden's tile `KEEPER` (136,6) as a `p` obstacle of radius 18 (on 28 only - solid, its own size),
  X (148,6) past it, which does nothing (`atExit` returns at once on 'dusk': nothing happens but the talk); a path that
  fades out before the light does; flowers and trees thinning out, none in the last 30 tiles. `field.dusk` = { keeper,
  from, to } - `to` is 3 tiles short of it. `LEVELS[28]` `kind: 'dusk'`, `interact: true`; `build` hands it as
  `level.field`; every story level's `flags` now carry `interact`. `startField` / `updateField` serve it too (the
  white fade in from Fresh Air's end; `carryDaylight` from 27 keeps the wind going). **`updateDusk`**: `dk.p` = the
  FURTHEST you have been between `from` and `to` (so standing still and turning round change nothing); `s1` dusk,
  `s2` night, `s3` nothing (smoothsteps over p 0.10-0.38, 0.34-0.64, 0.60-0.82), `k` the sound's day (0.08-0.78):
  `setDaylight(0.6 (1 - k))`, birds scaled out by k 0.4, a murmur from the village behind every 2.6-5.6 s while k < 0.3
  with its echo 0.45 s later at 0.4. The Warden: never moves; its hum (`createEnemyVoice(46.25, 'warden')`, destroyed in
  `stop()`) at `0.16 (1 - d / 1500)^1.5`, panned; it turns (slowly) to face you within `DUSK_TURN` 165 px; within
  `DUSK_TALK` 92 px you can talk (`talk()`: once, takes the controls, `env.talk()`). `dusk()` and `state().dusk` for
  drawing and tests.
- **js/game.js**: `OUTSIDE_NAMES` gains 'Dusk' (26 First Breath, 27 Fresh Air, 28 Dusk, then Open Ground, Same Sky, The
  Wall for later); `drawDusk` after the daylight drawing (no sunlight at its way out): three full-screen fills (a violet
  dusk, a deep blue night, black), you drawn again over them, and the Warden (`EchoWarden.drawHunter`, r 18, `regular`)
  in a faint pale glow; footsteps: grass (quieter as it darkens) until `k` > 0.55, then `audio.footstep(0.32)`. **The
  Talk prompt** `#talk` (index.html, style.css): a button, shown each frame only while `dusk().talkable` (and nothing
  else on screen: `no-hud` as ever), with the interact key's cap on a keyboard; a tap or a click talks too (and does not
  set off the tap-to-show pause). The interact key is read BEFORE the movement-only filter (`levelFlag('interact')`).
  `onTalk` (story.stop(), `startCutscene('listens')`) -> the scene's finish -> `onTalkDone` (`saveBest(29)`, `addClear`,
  `onStoryEnd` -> "More to come soon."). `SEEN_AT_END.listens` (unskippable until seen, seen only at the end - the keeper
  scene's rule), `SCENES` "Nothing Listens" / "What the keeper said in the dark." (unlocked once seen: it leads into no
  level). Debug `dusk()`, `talk()`.
- **js/profile.js / js/settings.js**: the action `interact` ('Interact (talk)', default E) and `SHARED` - item and
  interact may share a key (never both of use at once): `actionFor(code, except)` skips the one being bound and its
  partner, so binding E to one is no clash, and `bindKey` never takes the key from the partner. Old saved bindings have
  no `interact` and read the default.
- **js/cutscene.js** `'listens'` (`buildListens` / `updateListensScene` / `drawListensWorld`, `LS_*`): the black void,
  you (drawn as outside) and the Warden facing you in its glow; the owner's eleven lines exactly (`LS_LINES`, with the
  pause before each), typed at `LS_CPS` 12 and spoken whole by `audio.speak` (pitch 0.5, slow syllables `len` 1.7 -
  `_syllable` takes `o.len` and `o.wet` now); subtitles always shown (dialogue), with no speaker name; the hum swells on
  lines 7 and 10 (`LS_SWELL`), drops before the knocks; after "Listen..." 1.8 s of silence, three slow knocks 1.7 s apart
  (`audio.knock`, new: a low hollow blow nearly all reverb, each played again at 0.34 and 0.13 as its long echo), it turns
  its head 0.5 rad towards them; one more knock 2.4 s after the last line, then a CUT to black (`ls.cut`), and the end at
  `LS.end` (~100 s). No ambience (near silence). Captions (Visual cues): [a low hum], [the hum swells], [silence], [three
  slow knocks], [a long echo], [one more knock]. Test getters `listens` and `LISTENS`.
- **Tests**: `tools/act2-check.js` 28 (9): builds clean, the flags with interact, hand-built, no monsters, the Warden
  solid at r 18, the way to it open (131 tiles), the walk about 31 s, the edge walled, no trees at the end.
  `Act2Test.dusk` (42): 27 -> 28 with the sound carried on, the fade in, "Dusk", nothing on screen (no prompt far off),
  standing still 8 s changes nothing, Space/Shift nothing, grass early, the light following the distance through dusk
  and night to black, walking back keeps it dark, then no birds, no wind, dry steps; the hum coming up; it turns to you;
  the prompt only near it with its key; walking into it: stopped, nothing happens, it does not move; Interact rebound to
  F (E no longer talks, the item keeps E) and F (or a tap on touch) starts the scene; first time: Enter / Space / Esc /
  Skip do nothing and the button is hidden; P pauses and resumes; all eleven lines as subtitles in order, whole; three
  knocks then a fourth; no speaker name; the captions with cues on, none with them off; the cut; seen only at the end;
  "More to come soon.", cleared (29), its button to the title; then in the replay list, skippable there, back to it.
  `Act2Test.duskScreen`: the longest line on screen and at 14 px or more, at 1366x768, 844x390 and 740x360 touch.
  `village` now ends in 28; `firstTime` (28 -> "Continue (Dusk)", 29 Finished, campaign 28), `cues` 0-28, `perf` (28
  in the dark by the Warden) and the tiles ("Dusk" one line) include it. Visual cues ON and off, desktop and phone.

## v20.0: Endless mode (owner's brief, MAJOR)

- **js/level.js**: `generateLevel(n, runSeed, modeId, part, given)` - `given` is a ready config (Endless): the hand-built
  levels are skipped and the generator runs on it exactly as on a campaign config; a new last placement step adds
  `cfg.alarms` Alarms (placed like the Muffler and the Singer, and only drawing a random number when there are any, so no
  campaign config - none has `alarms` - is touched). The fingerprint is `9097b344` as before. **Endless**:
  `ENDLESS_INTRO` (echo 1, scent 4, mimic 7, decoy 10, stalker 13, muffler 16, singer 19, alarm 22 - every 3 depths, the
  campaign's order), `ENDLESS_CAP` per kind, `ENDLESS_MAX_MONSTERS` 6, `ENDLESS_SIZE_DEPTH` 30, `ENDLESS_SPEED_TOP` 1.12,
  `ENDLESS_TRIES` 24, `ENDLESS_MILESTONES`. `endlessSeed(runSeed, depth, attempt)` (a hash); `endlessMonsters(depth)` (1 to
  depth 3, 2 to 9, 3 to 18, 4 to 30, then up by one every 15 depths to 6; Easy one fewer from 3); `endlessKinds(depth,
  {alarm})`; `endlessConfig(depth, mode, opts, rand)` = `levelConfig(min(depth, 12), mode)` (ripple, recharge, hearing,
  speeds) with Endless's size (7x5 cells growing to 23x18 at depth 30), loops, rooms, obstacles, counts (the newest kind
  always once in its first stretch, at least one echo monster from depth 4, the rest picked from the kinds met, never past
  a cap - the mix from its own stream, never the generator's), the decoy from depth 10, puddles with a scent monster, and
  past depth 30 every speed x up to 1.12 (all below 170: echo <= 165, stalker 169, muffler 160); `endlessCheck(level,
  depth)`; `generateEndless(runSeed, depth, mode, opts)` -> the level with `level.endless` { depth, runSeed, attempt, ok,
  why, kinds }.
- **js/game.js**: `ENDLESS_LEVEL` -2 (so `scored()` is false: no progress, medals, stats, deaths, fragments), `ENDLESS_KEY`
  `echomaze.endless` ({ best: { mode: depth }, last: { mode, depth, line, at } }, read as untrusted, writes that fail are
  simply not kept), `endlessRun` { seed, depth, mode, startBest, passedBest }, `endlessUnlocked()` (`furthestReached() >= 13`),
  `alarmMet()` (`>= 22`). `startEndless` (a new random seed, depth 1), `startLevel(ENDLESS_LEVEL)` builds it with
  `generateEndless` (no fragment, no banner; the music and drone of `cfg.n`), `onEndlessCleared` (from `onLevelComplete`:
  the clear sound, depth + 1, the best written as soon as it is reached, the milestone chime, "New best!" in the corner
  toast once past the run's starting best, then `go(startLevel)`), `endlessOver` (from `onCaught`: the last run and the
  best written, the screen filled) and `#endless-over` after the usual 900 ms (Hardcore too - not the title),
  `endlessAgain` (Try again / Enter / R: a new run at once, no fade), Esc / Back to title. HUD "Depth N · Mode", the pause
  line "Endless · Mode · Depth N". The Enter key on the Level cleared screen does nothing during a run. `toTitle` ends the
  run. The title's `#btn-endless` (in the dock, after Begin) with the picked mode's best. Debug `endless` { state, unlocked,
  alarmMet, save, start(seed), goDepth(d), build(seed, depth, mode, opts), again }. **js/audio.js** `milestone`.
- **Test copy**: its save is past every level, so Endless is open there; its key becomes `echomaze.test.endless` like
  every other.
- **Tests**: `tools/endless-check.js` (Node, in every `tools/check.js` run): 1,440 depths (1-60, 6 runs x 4 modes, half
  with the Alarm met) all fair (17 needed a second seed, none a third), only met kinds in order, the newest in its first
  stretch, no Screecho or Warden, all speeds < 170, at most 6 monsters, depths 1-3 small with one echo monster, sizes
  stop at 30, speed rising slowly to its cap, deterministic, a campaign level built the same around it.
  `tools/endless-test.js`: unlock (fresh save: no button, no run; best 13: there), run 15, caught 19 (Normal and Hardcore:
  Depth N, the best, New best!, the line; Try again in ~2 ms with a new seed; Enter; Back to title), modes 4 (bests per
  mode; storage that throws), noWrites 4 (only `echomaze.endless` changes; stats and Continue as they were), fair, bot (60
  depths with the real keys in ~24 s), live (the real loop at every depth 1-60 with its monsters, a ripple at each),
  screen (the button and the game-over screen on a phone, 0.15 ms a frame at depths 30 and 60). Visual cues ON and off,
  a phone with Calm mode. The title tests with the button showing at 1366x768, 1280x720 and 844x390.

## Mimic (level 8+) and sonar decoy (level 9+) (owner's design)

Owner's brief: level 8 has 1 mimic, 1 echo, 1 scent. The mimic "mimics the end": same green glow, same sound as being near an exit, and "the second your echo touches it, it turns into an echo monster". The sonar decoy (first built on level 8 in v6.0; the owner then moved it to the NEW level 9 in v7.0, `DECOY_FROM_LEVEL` = 9, so level 8 has no decoy): one per level from level 9; collect it, drop it with E (never more than one carried), and 5 seconds after dropping it attracts ALL monsters in a fairly large radius (one time use), including a mimic that has not turned yet; attracted monsters pathfind to it and are trapped there for 5 seconds after they ARRIVE before returning to normal.

**Mimic** (`kind: 'mimic'`, `js/game.js`, spawned in `generateLevel` step 9 by the exit's own rule - since v10.1 the farthest cell from the start, on the same kind of spot as the real exit, >= 8 path tiles from it and never on the only route; see "v10.1"):
- It is a perfect exit fake on every channel (only its LOOK has a per-mode tell since v9.1 - see "v9.1: how things look"): exit size (`EXIT_R`, so `e.r` = 16 while disguised, 14 once turned); in `castRipple` it is a `T_EXIT` circle so its rays are green with the exit bell; `drawWorld` gives it the same glimmer within 130px (`glimmerExit`); the beacon loop in `updatePlay` chimes from it exactly like the exit (`audio.beacon`, from its own position, so you hear two exits); it has NO voice, NO footsteps (`enemyAudio` returns early) and is skipped by the heartbeat/danger loop, and it is not in the title colour legend.
- Only the wave touching it breaks the disguise (`touchMonsters` -> `revealMimic`): `kind` becomes `'echo'`, `r` 14, a voice is created, and every ripple in flight that had bounced off it as an exit is retagged (its rays -> `T_ENEMY`, its not-yet-played echo -> the monster moan, via `rp.hitId`/`rp.circles`/`echo.enemy`). It is then alerted like any echo monster (goes to the ripple spot) unless a decoy has called it. It never turns back. Unpinged, it sits still forever.
- Walking into a disguised mimic kills (it is a monster): my call, flagged to the owner. While disguised it blocks the ripple's rays exactly as the exit does.
- A decoy can drag a disguised mimic: it stays a mimic, walks silently, and after the trap ends goes `idle` (still disguised) where it is (my reading of "return to normal"; flagged to the owner).

**Sonar decoy** (`level.decoy` = the pickup on the floor, `decoys[]` = dropped ones, `player.hasDecoy`; constants `DECOY_*` in `js/level.js`):
- Pickup: walk onto it (`collectDecoy`), only when not already carrying one; HUD shows "Sonar decoy · E"; E (`dropDecoy`) drops it at the player's feet.
- Arming `DECOY_ARM_SECONDS` = 5: beeps that speed up and rise. Then `callMonsters`: every monster within `DECOY_RADIUS` = 480px (STRAIGHT-LINE distance, my choice for "fairly large") of EVERY kind (v11.1: the stalker, the Muffler and the Singer too) and in ANY state (asleep, hunting, listening, tracking you, marked-and-counting-down) that has a path gets `lureEnemy` -> state `lured` (walks there by the shortest path at its normal speed) -> on arrival `trapped` for `DECOY_TRAP_SECONDS` = 5 (`updateLured`) -> `releaseLured`: echo `idle`, and every kind that never stands still (scent, stalker, muffler, singer) `patrol`. A mimic inside the radius is passed through `revealMimic` FIRST, so it walks over as an echo monster (v11.1). Lured/trapped monsters ignore ripples (`touchMonsters` skips them), footsteps and smell - and since v11.1 `stalkersListen` and `mufflersListen` skip them too, or a trapped stalker/muffler would simply hear you and walk off. Still deadly to touch. The decoy is removed once all it called are released (min ~1.2s so the ring can play). One time use; one decoy per level so there is never a second.
- Visible/audible: pink (`T_DECOY` = 7, `COLORS[7]`) - shows in ripples like a puddle (a flat mark + `echoDecoy`, never blocks), glimmers within 110px, the floor one blips every 3.2s within ~300px (my addition so it can be found in the dark), and the call draws a pink ring out to the 480px radius. All sounds are procedural (`audio.decoy*`, `mimicReveal`).
- New level/restart resets everything (`startLevel`); the cutscene stage clears `decoys`.

## Scent monster, smell puddles and trails (owner's design, level 6+)

- **(v9.2 - the schedule for levels 9-12 is now in "v10.0" above.) CURRENT SCHEDULE (v9.2, owner's change - it supersedes the "identical in every mode" bullet below for levels 9 and 10 only).** Normal / Hard / Hardcore (the four tables in `js/level.js`): echo 0,1,1,2,2,0,1,1,**0**,0; scent 0,0,0,0,0,1,1,1,**2**,1; mimic 0...0,1,1,0 (levels 8, 9); stalker level 10 only. **Easy** is the same for levels 1-8 and then, via the new `MODE_MONSTERS = { easy: { 9: {echo:0, scent:1, mimic:1, stalker:0}, 10: {echo:0, scent:0, mimic:0, stalker:1} } }` (per-mode exceptions to the tables; `levelConfig(n, mode)` uses it only for levels 1-10, the fallback formula past level 10 is untouched): level 9 = 1 scent + 1 mimic and nothing else, level 10 = only a stalker. The owner's words: "for normal, hard and hardcore: level 9 no echoes, two scent people, 1 mimic; level 10 1 scent, 1 stalker; level 8 stays the same. Easy: level 10 only a stalker, no scents, nothing else; level 9 1 mimic, 1 scent and that's it. Nothing else needs changing." My readings, flagged: the sonar decoy and the smell puddles are TERRAIN, not monsters, so they stay (Easy level 10 keeps its decoy, which does nothing to a stalker, and its puddles, which nothing smells - trivially removable in `generateLevel` if the owner wants them gone). Verified against the real generator: comparing v9.1 with v9.2 over 12 seeds x 10 levels x 4 modes, 35 of the 40 level/mode combinations (mazes AND monster/puddle/decoy placement) are byte-identical, and exactly the five that should differ do (level 9 in all four modes, level 10 on Easy); no maze layout changed anywhere (the maze is drawn from the seed before any monster). Live game: `go(n)` gives the expected monsters for levels 8-10 x 4 modes; 24 scripted runs (with 39 forced mimic reveals) threw nothing; levels 9/10 can still be finished. Adding another per-mode mix = one more entry in `MODE_MONSTERS`.
- **(History up to v9.1) Monsters per level are EXACT and identical in every mode** (`ECHO_MONSTERS` / `SCENT_MONSTERS` / `MIMIC_MONSTERS` / `STALKER_MONSTERS` in `js/level.js`, owner's schedule): echo 0,1,1,2,2,0,1,1,2,0; scent 0,0,0,0,0,1,1,1,1,1; mimic 0,0,0,0,0,0,0,1,1,0; stalker 0 for levels 1-9 and 1 on level 10. Levels 4-5 = 2 echo; **level 6 = scent only (no echo monsters, owner's later change - it was 1 echo + 1 scent up to v5.1)**; level 7 = 1 echo + 1 scent; **level 8 = 1 echo + 1 scent + 1 mimic** (no decoy - the owner moved it to 9); **level 9 = 2 echo + 1 scent + 1 mimic + the sonar decoy - the level 9 monster mix is MY choice (the owner only said it is a new level with the decoy); it is one line in each table in `js/level.js` if they want it changed**; **level 10 = 1 stalker + 1 scent, NO echo monsters and (since v9.0) NO mimic (owner: it was 1 stalker + 1 scent + 1 mimic in v8.0, then "Remove the mimic on level 10"; it still has a decoy, like every level from 9, which only the scent monster can be drawn to). In the v8.0 brief the owner wrote "Levels 8 and 9: [tell me what you want]" - an unfilled placeholder - so 8 and 9 were left exactly as they were and this was flagged.** The modes differ in speed, hearing, ripples and puddles - NOT in monster counts. (Levels past 10 use a placeholder formula only so debug/testing keeps working; they are not part of the game.)
- **(v10.0: `CAMPAIGN_LEVELS` is now 12 - the finish trigger, victory text and progress rules all use it.) The game ends after level 10** (`CAMPAIGN_LEVELS` = 10; it was 7 up to v5.6, 8 in v6.0 and 9 in v7.x): clearing it shows "You finished the game" with only a Back to title button (no endless mode, "more levels are coming"). Progress past the last level counts as finished (no Continue, tag "Finished"). Saves that said "Finished" at an earlier end now show Continue at the level after it (a save that had finished the 9-level game now says Continue (Level 10) and plays the stalker scene first - see Cutscenes; a Hardcore high score of 10 now reads "level 10" instead of "finished").
- **Scent monster** (`kind: 'scent'`, violet, `T_SCENT`): a second monster type, from level 6 (`SCENT_FROM_LEVEL`). It **never stands still** (state `patrol`, walks to random tiles), **cannot track echoes or footsteps** (a ripple *sees* it - its own violet colour and echo sound - but never alerts it; it is not in `alerts`), and **touching it kills you** exactly like an echo monster (restart depends on the mode).
- **Puddles** (`level.puddles`, lime, `PUDDLE_R`): stepping in makes you smelly for `SMELL_SECONDS` = 5 of **walking** time. **The clock only runs while the player actually moves** (`walked`, > 0.3px/frame): standing still or pushing into a wall never runs it out, and standing in a puddle tops it up. This is deliberate - it stops players just waiting out the 5 seconds. Puddles never block a ripple; a ripple that has line of sight lights them up (timed mark) and plays `echoPuddle`.
- While smelly the player leaves a **trail** (`level.trails`, points every 12px). A finished trail **lasts about a minute** (`TRAIL_LIFETIME` = 60s of level time, counted from when the smell ran out, drawn fading over its last 12s); a trail still being laid never expires; all trails reset when the level restarts. While smelly and within `smellRange`, a scent monster `track`s the player's live position and loses them when the smell ends or they leave range.
- **Your own trail re-smells you** (owner's request, `touchOwnTrail()` in `js/game.js`): stepping onto a *finished* trail of yours (within `TRAIL_STEP_ON` = 14px, before it expires) does exactly what stepping into a puddle does (`stepInPuddle`: 5s of walking smell + a new trail, or - if you are already smelly - a top-up back to 5s, exactly like a second puddle; a slightly quieter splash). **Cooldown `TRAIL_RESMELL_COOLDOWN` = 10s** (in `js/level.js`, `player.trailCd`, counts game time) from each trail re-smell; puddles ignore it. **Any part of any finished trail counts, INCLUDING walking straight back along the trail you have just laid** (that is the most natural way to step on your own trail: get smelly in a corridor, turn round, walk back). The only exceptions: the trail still being laid (`tr.active`), and the last `TRAIL_TIP_GRACE` = 40px of the trail just finished (`player.justLeft`, until the player steps off it) - without that the smell would restart instantly, because you are standing on the tip of the trail the moment your smell runs out. History/lesson: v5.3-v5.5 wrongly exempted the WHOLE just-finished trail until the player stepped off it, so turning round at the end and walking back along it never re-smelled you (owner reported it), and skipped the re-smell entirely if you were already smelly; both fixed in v5.6. Standing on a trail when the cooldown ends counts (you are on it). Because the cooldown (10s) is longer than the smell (5s of walking), following your own old trail can never keep you permanently smelly.
- A scent monster that **touches a trail at all** (`TRAIL_TOUCH`) goes to **the other end**: the end farther along the trail from where it touched (`checkTrailTouch`). Once committed (`followTrail`) it must NOT re-evaluate that trail every frame (the "farther end" flips at the midpoint and it would pace back and forth - this was a real bug). After finishing it ignores that trail until it has walked away from it (`ignoreTrail`).
- Scent monster speed is 0.9x an echo monster's and always below the player's 170px/s.

## Difficulty modes and calm mode (owner's design)

- Four modes in the `MODES` table in `js/level.js` (`easy`, `normal`, `hard`, `hardcore`); each scales the baseline curve in `levelConfig(n, mode)`. Owner's brief: Normal is *very slightly* easier than the game was before modes existed; Hard is harder than that; Hardcore is one life and a *tiny bit* harder than Hard. Keep every monster speed below the player's 170px/s and keep the order easy < normal < hard < hardcore. Mazes must be identical across modes for one seed (only monsters differ).
- Hardcore = one life: being caught sends the player **straight back to the title screen** (with a death notice) - no overlay, no Continue, nothing to resume; the next Begin is a fresh run from level 1. Other modes: being caught shows "Try again", which restarts the same level (same maze, monsters reset). The owner asked for exactly this split.
- Hardcore's **high score stays visible** on the title screen (its button tag and a "High score" line): the furthest level reached, or "finished the game" once level 10 (the last) is cleared. It is recorded when a level is cleared (and on starting a Hardcore level, so a run that dies on level 1 still counts) and is never lowered. Level 1 has no monsters, so you cannot die there.
- Progress is saved per mode (`echomaze.progress`, best level unlocked, never lowered); mode and calm are remembered (`echomaze.mode`, `echomaze.calm`); the old single `echomaze.best` is migrated to Normal.
- **Calm mode is purely visual + audio and must never change difficulty or gameplay.** It is a flag (`calm` in game.js, mirrored to `audio.calm`), toggled on the title, in the pause menu and with `C`, any time, any mode. It removes the red edge creep, the caught flash/shake/red glow, the heartbeat, and softens screech/growl/steps/caught/lunge and the intro's scare.

## Cutscenes

(Level 13's capture is an eighth, and is NOT here: it is not a reenactment, it only ever happens inside its own level, and unlike these it plays every time - see the v12.0, v12.1 and v12.2 sections.) `js/cutscene.js` (`EchoCutscene.create(env)`) holds **eight scenes** (v10.0 added `'muffler'` before level 11 and `'singer'` before level 12 - see the v10.0 section; v16.0 added `'keeper'` between level 13's capture and level 14, which has its own rules - unskippable until seen, seen only at its end - see the v16.0 section; v16.2 added the hidden `'kept'`, which belongs to no level and is only ever played from a screen - see the v16.2 section), chosen by `start(kind)`; which one plays before which level is `SCENE_BEFORE_LEVEL` / `SCENE_LEADS_TO` in `js/game.js` (`advanceLevel()` looks it up, so adding a scene is one row there plus a builder in cutscene.js, an entry in `SCENES` for the replay screen, and rows in `SCENE_START` / `SCENE_PAL` / `SCENE_AMBIENT`):
- `'intro'` (before level 1, played by "Begin": lore cards, then a lost explorer taken by an echo monster; "Now it is your turn.").
- `'scent'` (owner's request: after clearing level 5, before level 6 - another explorer steps in a puddle, leaves a trail, and a scent monster touches the trail and follows it to them; ends on "It can't hear you. It follows what you leave behind.").
- `'mimic'` (owner's request: after clearing level 7, before level 8 - "includes the mimic and a person dying to that"; card "Not everything that glows is a way out.", Day 33, a coral lamp: the explorer follows the exit chime to a green glow, pings first, the wave touches it (`MM_TOUCH_T`, computed from the distance so it matches the game), it turns, and runs to the spot the ripple was sent from where the explorer still stands; blackout, the device clatters; ends on "It looks like the way out. / Until your echo touches it.").
- `'decoy'` (owner's request: after clearing level 8, before level 9 - "a new cutscene about the sonar decoy"; card "You cannot outrun everything.", Day 19, a pink-white lamp: the explorer finds and takes a decoy while an echo monster and a scent monster close in, drops it, hides in the side passage, it beeps 5s then calls (`DC_CALL_T` = `DC_DROP_T` + 5, like the game), both monsters turn, are held at it by pink tethers and the explorer slips away; ends on "Give them somewhere else to go.").
- `'stalker'` (owner's request, mid-way through the v8.0 turn: after clearing level 9, before level 10 - "about the stalker, but instead, this person ESCAPES from the stalker (giving a hint to the player on how to defend themselves)"; replay title "Nothing To Hear"; card "Some things do not need a ripple to find you.", Day 47, a cold white lamp so the orange stalker stands out): the explorer walks softly, a stalker breathes in behind them (`stalkerAlert`), they stop, drop into a crouch (`crouchAmt`: smaller, lamp dimmed, no more footsteps, breath held) and creep up out of its lane; it walks to the exact spot it heard them (`ST_STOP_X`), stands there with its feelers sweeping while they hold still beside it, and after 3 s of nothing (`ST_LOSE_T` = `ST_CROUCH_T` + 3, the game's own rule) walks on. Lines: "Soft steps. Keep them soft." / "...Something just breathed in." / "It's still coming. Get low." / (silence while it is beside them) / "It couldn't hear me. Not a thing." / "Can't ping down here. But nothing can hear me either."; closing card "It hears every step, even you standing still. / Hold SHIFT to crouch." - the hint (the camera drifts aside so the explorer is not under the text). The stalker's lane is `ST_MON_Y` = 6px below the explorer's so a crouched explorer beside it is not overlapped. Body = `drawStalkerBody` (since v9.1 a wrapper over the game's own `EchoArt` 'stalker': long body, small blind head, two feelers, six tall thin legs). Nobody dies in this scene, and there is no flash or shake.
All are scripted in a hand-built stage (a corridor with side passages); the intro and mimic scenes reuse the game's real ripple system (`env.castRipple`, `env.drawRippleLayer`); the decoy and stalker scenes light the walls near the explorer with `drawLitWalls`. The monsters are drawn with the shared `drawEchoBody` / `drawScentBody` / `drawStalkerBody`, which (v9.1) call `EchoArt.draw` - the same art as in the game, just bigger. Everything is timed off one clock; the times are constants at the top (`S`, `LINES`, `PING_AT`, ... `SC_*` scent, `MM_*` mimic, `DC_*` decoy, `ST_*` stalker). Try again and skipping never replay them, and all work the same in every mode. **"Continue" / a level picked from the list skips a scene you have SEEN, but plays a scene that has never been shown once before the level (catch-up, `newRun`)** - owner's fix in v7.1: they had cleared level 7 before the mimic scene existed and would otherwise have had to redo level 7 to see it. Two separate ideas in `js/game.js`: `hasSeen(kind)` = actually shown (`echomaze.seen`; only the intro and scent scene are derived for old saves, the newer ones count only when really shown - this is what triggers catch-up) and `canReplay(kind)` = seen OR you have already unlocked the level the scene leads into (`furthestReached() >= SCENE_LEADS_TO[kind]`, this is what unlocks it on the replay screen). A catch-up plays only the scene for the level being entered (Continue at level 9 plays the decoy scene; an unseen mimic scene is then just watchable in the replay screen; Continue at level 10 plays the stalker scene - which is what a save that finished the old 9-level game gets). Each scene is skippable (Enter/Space/Esc/button, ignored for the first 0.6s); starting one marks it seen even if skipped. The explorers' voices are synthesised (`audio.voice`); do not add audio files. **The explorers are unnamed and ungendered on purpose - keep it that way (no pronouns in text).** Calm mode: no flash/shake, dimmer monsters.

## Replay screen: level select + cutscene replay (owner's request)

- Title button "Levels & cutscenes" (`#btn-replay`, only shown when there is something to replay) opens the `#replay` overlay (`showReplay()` in `js/game.js`; `state` stays `'title'`, Esc goes back, and Enter on it must NOT start a run).
- **Levels:** only levels **already cleared in the selected mode** are pickable: `clearedLevels()` = `min(best - 1, CAMPAIGN_LEVELS)`. The level you are up to (`best`) is NOT pickable - that is Continue. Locked levels are shown dimmed/disabled. Picking one calls `newRun(n)`: no cutscene (like Continue), replaying never lowers `progress`, Next level continues normally (5 -> 6 still plays the scent scene).
- **Hardcore has no level select** (deliberate): it is one life from level 1 with no resuming, so picking a level would be a back door around that rule. Its cutscenes still work. If the owner wants hardcore level select, ask what it should do to the high score.
- **Cutscenes:** `SEEN_KEY` = `echomaze.seen` (`{intro:1, scent:1}`), set in `startCutscene()` when a scene starts (skipping counts - they were shown it). `hasSeen(kind)` also counts old saves that got past the scene (any mode's best > 1 for the intro, >= 6 for the scent scene). Global, not per mode. Unseen ones show as locked "???" with a hint. Rewatching sets `replaying`; `cutscene`'s `finish` (end OR skip) then goes `toTitle()` + `showReplay()` instead of `startLevel`.

## Testing

**Start with `node tools/check.js`** (see "Testing in a cloud session" - the same in a local one). Serve the folder (`node tools/serve.js`, or any static server) and open `/?debug`; that exposes `window.__echo` (`info`, `tp`, `go`, `step`, `intro`, `freeze`, `csTo`, `setMode`, `setCalm`, `settings`, `draw`, `ripples`, `marks`, `crouch`, `decoys`, `dropDecoy`, `rippleRange`, `cues`, `captionText`, `features`, `seed`, `snapCamera(x, y)`, `zoom(v)`, `artClock(t)`, `showMuffler(on)`, `newMonsters()`, `markBy(singer)`, `touch`, `soundBlocked`, `setVisualCues`, `setTouchControls`, `audio`; and for the tutorial `go(0)`, `startTutorial('intro'|'title')`, `skipTutorial`, `leaveTutorial`, `tutorialState()`, `tutorialSteps()`, `newPlayer()`, `setTutorialDone(on)`; and for the title wordmark `wordmarkState()`, `wordmarkReveal(withSound)`, `wordmarkTick(seconds)`, `wordmarkSeek(u, isReveal)` and `wordmarkRelease()`, plus `ui()` and `transition(fn)` for the screen fades, and `deathTip()`, `tipFor()`, `whyOf()`, `nearMiss()`, `forceNearMiss()`, `savedToast()` and `showSaved()` for the v11.6 feedback layers; and for level 13 `go(13)`, `wardenState()`, `wardenCheck()` (the hand-drawn level's shape, dead ends, ways into the room, start-to-room distance and whether the door is sealed), `wardenDread(x, y)`, `captureStep(secs)` (`step()` cannot drive the capture: `updatePlay` is not running once the controls are gone), `gasp()` (the involuntary ripple walking into the great room sends) - seek FREEZES the frame, which is the only way to photograph the same instant of the sweep with calm mode off and on: the rAF loop otherwise repaints over it before the screenshot is taken). `settings()` = `{ campaignLevels (13), medalLevels (12), warden: {level, insideX, waveFallback, dreadTiles, at}, lore: {total, found, chance, bonus, here}, tutorial: {level, done, after, newPlayer, steps, at}, palette, showTimer, volumes, keyBindings, medalPar, music, muffler, singer, mode, calm, visualCues, touchControls: {on, saved}, audioFx, progress, seen }`. To photograph cues: build the scene and call `__echo.snapCamera(); __echo.draw()` in ONE call, copy the region round the player onto a temporary big `<canvas>` you leave on the page (the game keeps running in real time between calls, so one-shot cues fade before a screenshot), and take two screenshots. For the cutscenes: `__echo.freeze(true); __echo.intro(); __echo.csTo(22 + 24.1)` jumps to a moment of the intro and holds it; `__echo.intro('scent')` plays the level 5 -> 6 scene (scene starts at 4.6s, `csTo(4.6 + 16.66)` is its impact); `intro('mimic')` the 7 -> 8 scene (scene starts at 4.4s: `csTo(20.4)` is the moment the wave touches it, `csTo(21.3)` the hit); `intro('decoy')` the 8 -> 9 scene (starts at 4.6s: the decoy calls at `csTo(21.0)`, the monsters are held by ~23); `intro('stalker')` the 9 -> 10 scene (starts at 4.4s: `csTo(4.4 + 3.7)` the stalker hears them, `+ 6.2` they crouch, `+ 7.96` it reaches the spot, `+ 9.2` it gives up, `+ 15.6` the closing card - the card and subtitles fade in real time, so wait ~2s before a screenshot); `__echo.advance()` does what the Next level button does. **Testing the stalker / crouching** (all done this way in v8.0, no node needed): mute first (`__echo.audio.setMuted(true)` before any `go`), `go(10)`, clear the maze for a clean field (`level.walls.fill(0); level.blocked.fill(0); level.obstacles.length = 0`), drop the other monsters from `info().enemies` (it is the live array), park the stalker with `s.pause = 99`, place things with `tp` and `s.x/s.y` (keep the player INSIDE the level bounds or they are stuck in a wall), and judge hearing with ONE frame (`step(1/60)`) so it does not move; hold keys with `window.dispatchEvent(new KeyboardEvent('keydown', {code:'ShiftLeft'}))`. Spy on `audio.*` methods to count footsteps / echo sounds. **To prove levels 1-12 did not move, load `tools/generator-fingerprint.js` into a `?debug` page of each build and compare `GENFP().combined`** (`9097b344` from v11.6 to v13.0) - and look at its `sanity` field, which must describe a real level 12 (37x29, an echo monster and a singer): the harness went two versions hashing nothing because `generateLevel` was called with the wrong arguments. The real signature is `generateLevel(n, runSeed, modeId)`. For the lore fragments: `lore()`, `placeFragment(level, seed, mode)`, `readFragment()`, `setLoreFound(ids)`, `showArchive()`. For levels 14-16 (v14.0): `go(14..16)`, `storyState()`, `scriptLock()`, `hunter()`, `wakeHunter()`; `step()` drives them (their beats run inside `play`). **`tools/story-bot.js` plays them through the real keys** - `StoryBot.run({ level, mode, detours, pauses, skipKey, tryDoorFirst })` - and reports whether it cleared, was caught, and the gap to the Warden ALONG THE PATH (never measure the chase through the walls). The pane only runs animation frames while a screenshot is being taken, so to photograph a moment, `draw()` it and copy the canvas into an overlay canvas first (and dispatch a `resize` event after a reload, or the canvas is 0x0). Compare generation with the previous `js/level.js` (`git show HEAD:js/level.js`, both evaluated with `new Function`) to prove old levels did not change. In the embedded browser pane the canvas only repaints when a screenshot is taken, so screenshots lag one step behind - take a second one.

**The level editor (v15.0): `tools/editor-test.js`** - load it into a `?debug` page and run `EditorTest.gate()`, `.tools()`, `.validation()`, `.storage()`, `.untrusted()`, `.noWrites()`, `.soak(levels, frames, seed)`, `.editSoak(ops, seed)` one at a time (each is async and returns pass/fail with what failed; keep each call under ~20 s - the soaks in chunks), and `EditorTest.bot(doc, { mode, pingEvery })` plays a custom level with the real keys. It drives the editor with real `MouseEvent`s aimed at tiles (`__echo.editor.tileToClient`). Several suites write levels and flags to localStorage: run them on the scratch server and clear its storage after (`EditorTest.clearAll()`). In a background tab `focus()`/`blur()` do not fire, so dispatch those events yourself; and load the harness with a cache-busting query (it assigns `window.EditorTest`, so it can be loaded again). **v15.1: `tools/editor-test-2.js`** (load it after `editor-test.js`; it reuses its mouse helpers): `EditorTest2.touchGate()`, `.exits()`, `.keys()`, `.objects()`, `.effects()`, `.card()`, `.difficulty()` (it MEASURES monster speed, hunter speed, ripple reach and hearing), `.folders()`, `.migration()` (fetches `tools/sample-levels.json`), `.untrusted()`, `.noWrites()`, `.soak(levels, frames, seed)`, `.editSoak(ops, seed)`, and `EditorTest2.bot(doc, { pingEvery })`, which fetches the key first when it must. `__echo.playCustom(doc, from, { card: true })` keeps the title card up (by default the hook takes it away, so v15.0's tests still start in `play`). The edit soak yields to the page after every action, and a hidden pane throttles that: start long runs in the background (`window.__x = []; (async () => {...})()`) and poll, because a tool call stops waiting after 45 s. **v15.2: `tools/bonus-test.js`** (on its own, no other harness): `BonusTest.load()`, `.routes(seeds, onlyIds)` (every written route in `ROUTES` with the real keys and seeded random numbers; `dodge` routes walk round monsters as a player who has just pinged would, `BLIND` ones do not and are only reported), `.gates()`, `.noWrites()`, `.copy()`, `.readOnly()`, `.ticks()`, `.invalid()`, `.soak(frames, seeds, { calm, cues })`, and `BonusTest.walk(doc, steps, opts)` to play any custom level along a route. Its save keys follow the copy it runs in (`echomaze.` or `echomaze.test.`). **v15.3: `tools/share-test.js`** (after the three above): `ShareTest.format()`, `.roundTrips()`, `.lengths()`, `.bad()`, `.screens()`, `.authors()`, `.plays()`, `.noWrites()`, `.soak(n, seed)`; it answers the game's dialogs by pressing their real buttons. In a hidden browser pane the clipboard refuses a scripted Copy, so the suite accepts either "Copied" or the select-by-hand message - check Copy by hand with a real click. **v16.0: `tools/keeper-test.js`** (the keeper scene): `KeeperTest.handoff()`, `.firstTime()`, `.closeMid()` (it asks to be reloaded - then `.afterReload()` on the same storage), `.seenAfter()`, `.saves()` (reads whatever save the page was opened with), `.settings()`, `.noWrites()`, `.soak(n)`; `__echo.setSeen(kind, on)`, `seen()`, `csPaused()`, `setCsPaused(on)` and `onCaptured()` are its hooks, and `__echo.cutscene.keeper` / `.canSkip` / `.KEEPER_END` read the scene.

Web Audio gotcha: a `GainNode` sits at gain 1.0 until its first scheduled event, so if an oscillator starts before its envelope does you get a full-scale click. Start the oscillator and its `_env` at the same time. `step(seconds)` runs the simulation without needing animation frames, which is handy in headless/embedded browsers. Synthetic key events need `code` set (e.g. `new KeyboardEvent('keydown', {code: 'Space'})`).
