# Echo Maze

**Current version:** v19.2 - the village

A 2D browser game played in **pitch black**. You can't see the maze — you have to *hear* it.

Press **SPACE** to send out a sonar ripple. It expands from your position, bounces off invisible walls, obstacles and monsters, and reveals them for a moment as it echoes back — with a sound for every bounce. But the **echo monsters** are blind: the only way one learns where you are is if your ripple wave hits it — or if it touches you.

No build step, no dependencies, no audio files. Open `index.html` in a browser (or serve the folder with any static server) and click **Begin**. New here? The first Begin walks you through a short **Tutorial** first, and there is a **Tutorial** button on the title screen whenever you want it again.

**Play it on your phone, as an app:** open https://tobyhome12345-commits.github.io/echo-maze/ and install it - on Android in Chrome, **Install app** (or the menu, then *Install app*); on an iPhone in Safari, **Share**, then *Add to Home Screen*. It gets its own icon, opens full screen, plays offline once it has been opened, and updates itself whenever it is opened with a connection - nothing to download again. Progress is kept on that phone. (On an iPhone the home-screen app keeps its own progress, apart from Safari's.)

The title screen keeps to the essentials: the difficulty, Calm mode and Visual cues, and **Begin** (or **Continue**, which takes the lead once you have a run going - `Enter` presses whichever is lit). The controls, the rules and the legend are behind **How to play**, which only describes what you have already met; anything still ahead of you shows as **???**.

## Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` (or arrows) | Move |
| `SPACE` | Send a ripple |
| `SHIFT` (hold) | Crouch: same speed, no footstep sound, no ripples (see below) |
| `E` | Drop the sonar decoy you are carrying (level 9+) |
| `P` / `Esc` | Pause |
| `M` | Mute |
| `C` | Toggle calm mode (any screen, any difficulty) |
| `V` | Toggle **Visual cues** (any screen, any difficulty; see below) |
| `Enter` | Confirm on the Try again / Next level screens |
| `Enter` / `Space` / `Esc` | Skip a cutscene (or click **Skip**) - all but one, the first time you see it (below) |
| `P` (in a cutscene) | Pause the cutscene; `P` again lets it go on |

**Every key in that table can be changed** in **Settings -> Controls** (two keys per action if you like). `Esc` always means back or pause and `Enter` always confirms, so those two are fixed. **How to play** (on the title screen) and the pause menu always list the keys you are actually using.

On a touch device the controls are on screen instead (see **Touch controls** below).

Headphones recommended: echoes and monsters are stereo-panned, muffled by walls, and shift in pitch as they come and go (see **Sound** below).

## What the colours mean

| Colour | Thing | Its shape when a ripple lights it |
| --- | --- | --- |
| Blue | Walls | a stone-joint texture along the lit outline: short seams into the wall and the odd crack |
| Amber | Obstacles | **boulders**: an irregular rock with a few cracks; **pillars**: round, with a ring on top and fluting round the edge |
| Red | Echo monsters | **spiky and eyeless**: a jagged star of a body with a gaping V mouth and ribs |
| Violet | Scent monsters (level 6+) | a **soft blob with a wavy edge**, drips trailing behind it and small bubbles inside |
| Orange | Stalkers (level 10+) | **tall and thin**: a narrow body, a tiny blind head, two feelers and long jointed limbs |
| Magenta | Singers (level 12) | a **slender body with a wide ring for a mouth**, and arcs of song radiating from it. Its own ripples are magenta too |
| (none) | The Muffler (level 11) | **never seen**: a ripple that reaches it is swallowed, so it leaves a hole in the echo map instead of a shape. The title legend has a text-only line for it |
| Lime | Smell puddles (level 6+) and your smell trail | a **glossy blob** with a shine, two bubbles and a ripple |
| Pink | The sonar decoy (level 9+) | a **small device**: a box with a dial, a short antenna and a ring round it |
| Paper | Something left behind (levels 1-16) | a **torn, dog-eared page** with a few lines written on it, or a **cassette** with two reels — see *Fragments* below |
| Brass | The key (level 14) | an **old iron key**: a ring with a hole through it, a straight shaft, two teeth |
| Green | The way out | a **portal**: concentric rings, a slowly rotating arc, a little doorway and a few soft sparkles |

Colour is never the only clue: every thing has its own silhouette and texture (drawn by [`js/art.js`](js/art.js)), and the legend in **How to play** shows them (only the ones you have met). See **How things look** below. The colours above are the Default palette - **Settings -> Display** has three others, including two for colour blindness (see **Colour palettes**), and the legend always shows the one you are using.

## The tutorial (level 0)

A short, hand-drawn maze that teaches the basics in the dark. **Tutorial** is always on the title screen, and the very first time a new player presses **Begin** it plays first — then the intro cutscene, then level 1. Anyone with a save goes straight to the intro, exactly as before.

It is **level 0**, and it is not part of the game:

- **Nothing in it can kill you.** No monsters, no smell puddles, no sonar decoy — only walls, two obstacles and the way out.
- **The same maze every time.** It is drawn by hand ([`js/tutorial.js`](js/tutorial.js)), not generated: 13 x 9 tiles, a start room, a corridor with a corner, a room with a boulder and a pillar in the middle of it, a small dead end to walk into, and the exit in the far corner. It draws no random numbers at all, so it cannot move anything on levels 1 to 12.
- **The same in every difficulty.** Easy, Normal, Hard and Hardcore all get Normal's level-1 ripple range (362 px) and recharge (0.75 s). There is **no timer** in the HUD and nothing to hurry for; Hardcore's one life does not apply, because nothing can catch you.
- **It counts for nothing.** No progress, no Continue, no medals, no stats (not a ripple, not a second, not a step) and nothing towards *levels cleared*. The campaign is still levels 1 to 12, and the HUD says **Tutorial** instead of a level and a mode.

Six prompts appear one at a time along the bottom of the screen (at the top on a touch device, clear of the controls), and **each one waits for you to actually do the thing** rather than timing out:

| | It says | It moves on when |
| --- | --- | --- |
| 1 | It is dark in here. Use *your movement keys* to move. | you have walked about 120 px |
| 2 | Press *your ripple key* to send a ripple. Your echo shows what is around you. | you send your first ripple |
| 3 | Blue lines are walls. The picture fades fast, so remember what you saw. | you walk on |
| 4 | Ripples take a moment to recharge. Move, then ping again. | you send a second ripple |
| 5 | Amber shapes are boulders and pillars. You cannot walk through them. | you get past the obstacle room (it only appears once you are in it) |
| 6 | Listen for a chime. That is the exit. Get close and it glows green. | you reach the exit |

The key names are **your own bindings** (Settings -> Controls) and change the instant you rebind one; on a touch device the prompts say *Drag on the left of the screen* and *Tap RIPPLE* instead. If you stop making progress for about 25 seconds the same lesson comes back, worded more gently. The exit's chime carries about 360 px, so you can hear it from the start long before it glimmers at 130 px.

**Skip tutorial** is on screen the whole time and in the pause menu; skipping counts as done, exactly like finishing it. When you reach the exit a **Tutorial complete** panel offers **Start the game** (on into the intro and level 1, if you got here through Begin — otherwise **Back to the title**) and **Replay tutorial**. Calm mode, Visual cues, the colour palettes, mute and the touch controls all work in it as they do anywhere else.

It is remembered in `localStorage` as `echomaze.tutorial`. A save from before it existed simply has no such key, which reads as "not done yet" and changes nothing else — and a player with progress is never shown it unless they ask for it.

## The intro

**Begin** plays a ~55 second opening (skippable; **Continue** goes straight to your level):

1. **Lore cards** over black: the maze under the old quarry, the eyeless monsters, and the cost of a ripple.
2. **The scene:** an explorer, on their 41st day in the dark, mutters that they've been in here too long and may not survive. They send out a ripple (the game's real sonar, so you see the maze the same way they do), hear something answer, and start to turn — and an echo monster leaps out of a side passage. Cut to black, then their dropped sonar device clatters to the floor and pings once, lighting up an empty corridor.
3. **"Now it is your turn"** and level 1 starts.

### The second scene (after level 5)

Clearing level 5 plays a second, shorter scene (~30 s, skippable, and **Continue** skips it) before level 6, showing what the new monster does. After a card reading *Not every monster listens.*, another explorer (day 12, a cooler, greener lamp) steps into a lime puddle and walks on, leaving a glowing trail and a draining smell ring — exactly as in the game. They rest, sure that with no pings and no noise nothing can find them. Something starts sniffing. A **scent monster** wanders in, touches the start of their trail and follows it to them. Cut to black; only the lime trail is left glowing in the dark, then *It can't hear you. It follows what you leave behind.* and level 6 begins.

### The third scene (after level 7): the mimic

Clearing level 7 plays a scene (~30 s, skippable, **Continue** skips it) before level 8. After a card reading *Not everything that glows is a way out.*, a third explorer (day 33, a coral lamp), worn out and stumbling down a corridor, hears the exit's chime and sees a green glow ahead. "That's the exit!" — but they have learned to ping before trusting anything, so they stop and send a ripple (the game's real sonar). The wave touches the glow, which turns red — it is a **mimic**, and it charges at the exact spot the ripple was sent from, where the explorer is still standing. Cut to black, their device clatters to the floor, and the card *It looks like the way out. Until your echo touches it.* Then level 8.

### The fourth scene (after level 8): the sonar decoy

Clearing level 8 plays a last scene (~30 s, skippable, **Continue** skips it) before level 9. After the card *You cannot outrun everything.*, a fourth explorer (day 19, a pink-white lamp) finds a **sonar decoy** glowing on the floor and takes it. An echo monster and a scent monster are closing in along the corridor, so they drop it (five seconds of faster, higher beeps), duck into a side passage and wait. It calls: a pink ring sweeps out, both monsters turn to it, and they are held there by pink tethers while the explorer slips away. The card *Give them somewhere else to go.* Then level 9.

### The fifth scene (after level 9): the stalker — the one who gets away

Clearing level 9 plays a scene (~25 s, skippable, **Continue** skips it) before level 10, and it is the only one where the explorer survives. After the card *Some things do not need a ripple to find you.*, a fifth explorer (day 47, a cold white lamp) is walking softly along a corridor when something breathes in behind them: a **stalker** (orange) has heard their steps. It keeps coming. They stop, drop into a **crouch** and creep up out of its way; it reaches the exact spot it heard them, stands there listening with its feelers sweeping while they hold their breath beside it, hears nothing for three seconds and walks on. "It couldn't hear me. Not a thing." / "Can't ping down here. But nothing can hear me either." The closing card is the hint: *It hears every step, even you standing still. Hold SHIFT to crouch.* Then level 10.

### The sixth scene (after level 10): the muffler — nothing comes back

Clearing level 10 plays a scene (~22 s, skippable, **Continue** skips it) before level 11. After the card *Some things swallow your echo.*, a sixth explorer (day 58, a grey-white lamp) sends one ripple down a dark corridor — and the echo just **stops**, leaving a gap: something unseen has swallowed the wave (the game's own rule: the Muffler absorbs ripples). A deep hum, then slow, dull thumps coming closer. They drop into a crouch and creep back — but the thing hears even a crouched step from close up, the thumps stop right beside them, a deep thud, blackout. The closing card: *You cannot see it. You can only hear it. Crouching helps a lot. Stay still when it is close.* The Muffler itself is never drawn, in the scene either.

### The seventh scene (after level 11): the singer — keep moving

Clearing level 11 plays a scene (~19 s, skippable, **Continue** skips it) before level 12, and the explorer gets away. After the card *Some things sing to find you.*, a seventh explorer (day 66, a violet-white lamp) hears something wavering far off; it **sings a ripple** of its own — a magenta wave that lights the corridor and reaches them. A sting and a ticking countdown that speeds up: they are **marked**. They freeze a beat, then run. At zero the Singer **leaps** over the walls and lands exactly where they were standing — and finds nothing there. *If its song finds you, keep moving.*

The explorers' voices are synthesised too: formant-shaped buzzing under typewriter subtitles, no audio files. All eight scenes live in [`js/cutscene.js`](js/cutscene.js), each driven by a single timeline of times at the top of that file. Calm mode softens all of them (no flash or shake, dimmer monsters, quieter sound). Every scene can be rewatched from the replay screen once it has played.

## Fragments: what the others left behind

You are not the first one down here. Somewhere on each of **levels 1 to 16** lies something one of the others left: a **note**, or a **recording**. There is one per level, and it is never on the way to the exit — it is always off to one side, almost always at the end of a dead end, a real detour you have to choose to take (on average about 13 tiles out of your way on level 1, about 19 on level 12).

Nothing marks it. A ripple finds it exactly the way it finds a puddle or a sonar decoy: something flat on the floor, in the colour of **old paper**, that the wave lights up and passes over. The moment **your** wave reaches it, it is read — a note appears on screen; a recording plays in the same buzzing, formant-shaped voice the cutscenes use, its words typed out as it speaks. (A Singer's song can light one up, but that is not you finding it. And crouching under a wave that has not reached it yet wipes the wave, as always, so you never read it.) It never blocks you or a ripple, and nothing a monster notices can see it.

**How likely you are to find one depends on the difficulty.** On **Easy** a level's fragment is always there, because Easy rewards looking around. On **Normal** it is there about four times in five, on **Hard** about half the time, and on **Hardcore** never — Hardcore keeps its harsher tone. The maze decides, so trying the same level again after being caught gives you the same answer; playing it again from the level select gives you a new maze and a new chance.

**Everything you find is kept for good**, whichever difficulty you found it on. A **Fragments** button appears on the title screen once you have found one, and lists them in order: notes to read again, recordings to play again. The ones you have not found only tell you which level to look on. Find all sixteen, and one more appears at the bottom of the list - and, for those who looked everywhere, something else. On **levels 13 to 16**, which are the same every time, each one always lies in the same place (one of them is not on the floor at all: it is scratched into a wall).

They are notes from people who came through before you, and they lean, one level at a time, towards what is waiting at the end. They never say what it is.

## What's new

When the game has been updated since you last played, the title screen shows you what changed, once - a short note
for each update, newest first, and **See all updates** for the rest. **Got it**, Enter, Esc or a tap outside it closes
it. A brand-new player never sees it (everything is new). Anything about the story is kept back until you have reached
that far: until then it just says there is new story content to discover. **What's new** in the bottom corner of the
title screen (on a phone held upright, in **Settings**) shows the whole history at any time.

## Replaying levels and cutscenes

Once there is something to replay, a **Levels & cutscenes** button appears under Begin on the title screen (`Esc` goes back).

- **Levels:** every level you have already **cleared on the selected difficulty** can be picked and played again (1 up to the one before your best). Levels you haven't cleared — including the one you're currently up to, which is what **Continue** is for — are dimmed and can't be picked. Each mode has its own list, so switch mode on the title screen to see another mode's levels. Replaying never lowers your saved progress, and it starts straight in the level with no cutscene, like Continue (except that a story scene you have never seen plays first — see below). **Hardcore has no level select**: it is one life from level 1 and can't be resumed, so a level select would just be a way around that. **Levels 13 to 16** are in the list like any other level, without medal pips; the capture at the end of 13 plays in full every time you finish it, and each of 14-16 plays its own opening beat every time.
- **Cutscenes:** the eight story scenes can be rewatched once they have played — or once you are past the point where they play, even if the scene was added after you got there (the ones you haven't reached yet show as locked "???"). They work in every mode, honour calm mode, can be skipped, and drop you back on this screen when they end.
- **A scene you never saw plays first:** **Continue** (and picking a level from the list) normally skips the story scenes, but if the scene that leads into that level has never been shown — for example you cleared level 7 before the mimic scene existed — it plays once before the level, then never again on Continue.

## The level editor

**Level Editor** on the title screen lets you build mazes of your own and play them with the real game. The first time you open it, it warns you that it can show every monster and mechanic in the game - including ones you may not have met yet - and asks you to press **I understand** (or **Back**); that is only asked once. If you have already finished the game on any difficulty, it never asks at all. While the editor holds monsters that are not in the main game yet, it also shows an **unreleased content** warning every single time you open it from the title (after the first-time warning, before the touch one) - **I understand** goes on, **Back** or `Esc` goes back. On a touch screen it also says, every time, that the editor works best with a mouse and keyboard - **I understand** goes on into it anyway.

It opens on **My Levels**: every level you have made, each with a small picture, marked **Playable** or **Unfinished** and with its difficulty. From there you can **Play**, **Edit**, **Duplicate**, **Move** (to a folder), **Rename** or **Delete** one (deleting asks first), or press **New level**. **Folders**: **New folder** makes one; the row along the top shows **All**, **Unsorted** and each folder with how many levels it holds, sorted by name or by the newest edit. With a folder open you can rename it, delete it (its levels go back to Unsorted - or, if you pick the separate "and its levels" option and say so twice, they go too), or **Play in order** - every playable level in it, one after another. Your levels are kept in this browser; nobody else sees them unless you share one (see **Sharing levels** below).

**The editor** (best with a mouse; a finger works too - tap to place, drag to draw or move):

- **Wall** - drag to draw walls; right-drag rubs them out. **Erase** - drag to clear tiles back to floor, walls and anything on them.
- **Select** - drag a box round part of the maze, then drag the box to move everything in it somewhere else. It will not drop on top of something you have placed outside it. Dragging a single placed thing moves just that.
- **Start** - click a tile to put it there.
- **Exit** - click tiles to add ways out, up to 8; reaching **any** of them finishes the level. Pick **Exit** or **Locked exit** in the list; a locked one needs the key. Click one to pick it, and tick or untick **Locked** in the panel.
- **Monster** - pick one from the list (every monster in the game is there) and click a floor tile to place it; drag one to move it; right-click it, or select it and press **Delete**, to take it away. Up to 40 per level.
- **Object** - a **puddle**, the **sonar decoy** (one per level), the **key** (one per level; it opens every locked exit) or a **note**: you type what it says (up to 140 characters), and choose whether it is a note (shown) or a recording (spoken). A ripple finds it and it is read, like the explorers' fragments - but nothing is kept.
- **Effect** - drag out a zone of **light** or **red glow**; drag it to move it and its corner to resize it; pick it to set its shape (rectangle or circle), colour and strength. A zone shows the stone and floor in it - only where you could really see them from where you stand - and never a monster, an object or a way out.
- **Undo / Redo** (also `Ctrl+Z` / `Ctrl+Y`), **Clear all** (asks first; Undo brings it back), the level's **title**, and its **size** (Small 21 x 15 to Huge 51 x 35; making it bigger adds solid wall to dig into).
- **Level settings** (the second tab): the exact width and height, a **title card** line (shown with the title and the difficulty when the level starts), a **colour palette** (used only for players on the Default colours - anyone who picked a palette for their eyes keeps theirs), and the level's **difficulty**.

Underneath, the editor tells you in plain words what still stops the level being played: it needs a **start**, at least one **exit**, and **a way to walk from one to the other**; a locked exit needs a key you can get to; nothing may be standing or lying inside a wall, or standing on the start; and a Level 15 / 16 monster must not be so close to the way out that no run could make it. An exit that cannot be reached when another can is only a warning, and it says which one. You can save an unfinished level at any time - it is listed as *Unfinished* and can be edited but not played until it is fixed. **Test play** plays it straight away with the real game; when you are caught, finish, or pause and go back, you are returned to the editor exactly as you left it.

**Difficulty.** Each level has its own: **Easy**, **Normal**, **Hard** or **Hardcore** - exactly how that mode tunes the game's level 12 - or **Custom**, which is Normal with three sliders: monster speed (x0.5 to x1.5), ripple range (x0.6 to x1.5) and monster hearing (x0.5 to x1.5), and **Reset to defaults**. **The level's difficulty is what everyone plays it at**: the difficulty you picked on the title screen does not change a custom level. Monsters other than the Level 15 / 16 ones never become faster than you, however the slider is set, and those two are capped too.

**What each monster does.** Point at a monster in the editor's list, move the keyboard focus to it, or pick it (a tap on a touch screen), and a small panel at the foot of the list says in a sentence or two what it does - with its Unreleased tag if it has one. Pick a monster you have placed on the map and the panel on the left says it too. A screen reader reads the same words. These descriptions are only in the editor, which is behind its spoiler warning.

**Unreleased monsters.** Two monsters were in the editor before they were in the main game, each tagged **Unreleased** in the monster list (they may still change). Since v18.0 the **Alarm** is in the story too (from level 22) - in the editor it is exactly as it was, tag and all:

- **Alarm** - it never moves and touching it is harmless, but the moment one of your ripples reaches it, it screams: every monster in the level (except the Level 15 / 16 ones) heads for the spot where you were standing when it screamed. It only screams once; after that it is a silent, dim landmark. Crouching sends no ripples, so it never sets one off, and neither does a sonar decoy's call or a Singer's song. Before you ping it you can hear it: a faint, regular tick (and its own shape with Visual cues on).
- **Screecho** - an echo monster in every way (it hunts, listens, locks on and kills like one), but when one of your ripples reaches it, it screams like an Alarm. It can scream again, but not for 20 seconds.

They are never in the campaign, the tutorial or the Bonus Levels.

**Nothing you do in a custom level counts**: no progress, no medals, no stats, no fragments - whether you are test-playing it or playing it from My Levels. On Hardcore they still let you try again, because a custom level is not a run.

### Bonus Levels

Beside **My Levels** there is a second tab, **Bonus Levels**: six ready-made levels that come with the game, from gentle to tough. They are not part of the story - they are not in the level select, they never play a cutscene and they never change your progress, medals, stats or fragments - and they sit behind the same warnings as the editor, because they can hold monsters you may not have met yet.

Play them in any order. Each shows its difficulty (set by the level, like any custom level's) and a small picture, and gets a **Done** tick the first time you finish it - the tab shows how many are done. The ticks are kept in this browser on their own, apart from your progress and your own levels. The bonus levels themselves cannot be changed, renamed or deleted; **Copy to My Levels** gives you your own copy (in Unsorted) to change as you like - it plays exactly the same until you do.

1. **Crossroads** (Easy) - no monsters, four exits.
2. **Shortcut** (Easy) - a close exit with something beside it, or the long way round with the key.
3. **Embers** (Normal) - lit rooms, red ones, and two monsters that cannot see.
4. **Lure** (Normal) - one gap through to the far side, and a sonar decoy on the way. Puddles leave a scent.
5. **The Long Way** (Hard) - a long route with loops and dead ends. Keep moving.
6. **Everything at Once** (Hardcore) - two ways out, one needing the key, and most of the above together.

### Sharing levels

Every level you can play in My Levels has a **Share** button, and every folder a **Share folder** button. They give
you a **share code** - one long line of letters and digits, starting `ECHO1` - with a **Copy** button and how long it
is. Send it however you like: a message, a chat, an email. Anyone who presses **Enter code** in their own My Levels
and pastes it sees what it holds - the title, who made it, its size, monsters, exits and difficulty, or a folder's
name and its levels - and only then chooses **Import** or **Cancel**.

- **There is no server.** The code *is* the level, packed and compressed, so it works offline and never needs
  anybody's website. That is why codes are long: about 60-130 characters for a small level, 200-480 for a big one,
  and around 900 for a folder of five.
- **What is in a code**: the level(s), their titles, and a creator name if you set one - nothing else: no progress,
  no medals, no stats, no dates, nothing about you or your browser.
- **Creator name**: optional, empty to begin with, in the editor's **Level settings** tab. If you fill it in, it goes
  into every code you share, and people who import your levels see "by" your name. A level you imported keeps its
  creator's name when you share it on - until you change it in the editor, when it is yours.
- **Importing** puts a level in **Unsorted**, and a folder in a **new folder** of its own (with a number after the name
  if you already have one called that - it is never mixed into yours). Imported levels are your own copies: play,
  edit, rename, move, duplicate, share or delete them like any other. If you already have a level with the same
  content, it tells you and asks first.
- **Folders**: only levels that can be played are shared (it tells you which were left out and why); up to 20
  levels in one code.
- **Mistakes are caught**: a code with a typo, a missing piece or junk in it says it looks incomplete or damaged; one
  from a newer version of the game says so. Spaces, line breaks and quotes that chat apps add are ignored. Nothing
  is ever saved from a code that is not right, and nothing in a shared level counts towards your progress.
- **Bonus levels** cannot be shared - everyone has them - but a copy made with Copy to My Levels can.

## Settings

A **Settings** button sits on the title screen and in the pause menu (`Esc` or **Back** returns to whichever you came from). It has four tabs.

**Controls.** Every action can be given up to **two keys**: move up / down / left / right, ripple, crouch, use item, pause, mute, calm mode, visual cues. Pick a key cap, press the new key, done. `Esc` cancels the change; `Esc` and `Enter` can never be bound to anything, because they always mean back and confirm. A key the browser owns is refused with a reason (anything held with `Ctrl`, `Alt` or `Cmd`, the function keys, `Tab`). If the key already belongs to another action the game asks whether to **swap** them rather than silently stealing it. **Reset to defaults** puts `WASD` + arrows, `SPACE`, `SHIFT`, `E`, `P`, `M`, `C`, `V` back. Your keys are saved, and the how-to on the title screen and in the pause menu is written from them, so it always matches what the game is listening for. The touch controls are not affected.

**Audio.** Three sliders instead of one:

| Slider | What it carries |
| --- | --- |
| **Master** | everything (this is the old volume slider) |
| **Sound effects** | footsteps, echoes, monster voices, screeches, chimes, the interface |
| **Ambience** | the cave drone and the soundtrack |

Effects can be taken all the way to silence, and the tab says so plainly: *sound effects carry gameplay information — turn on Visual sound cues if you lower this*. `M` still mutes the lot. Calm mode has a checkbox here too.

**Display.** The colour palette (below), **Visual cues**, and **Show timer** — the level time in the corner of the HUD, **off by default**, because medals are not meant to make you rush.

**Stats & Medals.** Your medal board for the selected difficulty and your lifetime numbers (below), with a **Reset stats** button that asks once before it clears anything.

## Colour palettes

**Settings -> Display** offers four:

| Palette | For |
| --- | --- |
| **Default** | the colours the game has always used |
| **Colour-blind friendly (red-green)** | protanopia and deuteranopia |
| **Colour-blind friendly (blue-yellow)** | tritanopia |
| **High contrast** | the same colour language as Default, pushed brighter and further apart |

A palette changes **colours only**. Every silhouette, texture and cue glyph stays exactly as it was, and nothing about the game changes — the ripples, the monsters and the mazes are identical whichever you pick. It reaches the ripple's hit colours, the art, the Visual-cue glyphs, the title legend, the menus and the HUD, and the smell-trail glow. A **disguised mimic always uses the palette's exit colour** (so on Hard and Hardcore it stays pixel-for-pixel the exit) and switches to the palette's echo-monster colour the moment a ripple turns it.

Each palette was measured with `tools/palette-check.js`, which simulates all three kinds of colour blindness and compares every pair of colours with CIEDE2000. Roughly: a difference of 5 is obvious, 10 is plainly a different colour, 20 is unmistakable. The worst pair in each palette:

| Palette | normal vision | protanopia | deuteranopia | tritanopia |
| --- | --- | --- | --- | --- |
| Default | 11.9 | 8.0 | **3.3** | **0.3** |
| Colour-blind (red-green) | 17.3 | **17.1** | **16.9** | 1.1 |
| Colour-blind (blue-yellow) | 13.7 | 2.3 | 4.2 | **13.6** |
| High contrast | **17.0** | 6.2 | 5.2 | 0.4 |

(The bold figures are the ones each palette is *for*; no palette tries to serve all three kinds at once, which is why there are three of them.) Every colour also stays at least 4.5:1 against the black background.

Two things the numbers forced, worth knowing:

- In the **red-green** palette the exit is near-white and the brightest thing in the maze, and the echo monster is a strong yellow; the maze itself stays blue.
- In the **blue-yellow** palette the echo monster is a **muted** red and the stalker a pale gold. A vivid red and a vivid orange sit only about **5** apart for a tritanope — far too close — so those two are told apart by brightness instead. Terrain is cool and green there, monsters are warm.

## Medals and stats

Each of **levels 1 to 12** keeps **three medals per difficulty**, and they are never lowered once won. (**Levels 13 to 16 have none** — each is the same hand-drawn maze every time, none of them has a *Level cleared* screen to show them on, and a medal for a maze that never changes is a medal for having learned it by heart.)

- **Time** — bronze, silver or gold.
- **Ripples** — bronze, silver or gold (bronze just for finishing).
- **Flawless** — cleared without being caught on that visit to the level. Being caught and pressing **Try again** costs it for that visit; coming back to the level later is a clean slate. On Hardcore it comes free with the clear, because there is no retry.

Every run gets a new maze, so **par is worked out from the maze you were actually given**: the shortest way from the start to the exit (`pathTiles`), and how long that would take at walking pace with no stopping, no pinging and nothing chasing you (`optimalWalkSeconds = pathTiles x 40 px / 170 px/s`). Nobody can beat that, so every par is a generous multiple of it plus a fixed allowance for the pinging, listening and doubling back the game is actually made of:

| Medal | Par |
| --- | --- |
| Time, gold | `optimalWalkSeconds x 2.2 + 20 s` |
| Time, silver | `x 3.2 + 34 s` |
| Time, bronze | `x 4.6 + 55 s` |
| Ripples, gold | `ceil(pathTiles / 4.5) + 4` |
| Ripples, silver | `ceil(pathTiles / 3) + 6` |
| Ripples, bronze | any number |

Which works out, on an average maze for each level, as:

| Level | Path | Gold | Silver | Bronze | Gold ripples | Silver ripples |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 32 tiles | 36 s | 58 s | 89 s | 12 | 17 |
| 2 | 34 | 37 s | 59 s | 92 s | 12 | 18 |
| 3 | 40 | 41 s | 64 s | 99 s | 13 | 20 |
| 4 | 43 | 42 s | 66 s | 101 s | 14 | 21 |
| 5 | 47 | 44 s | 69 s | 106 s | 15 | 22 |
| 6 | 48 | 45 s | 70 s | 107 s | 15 | 22 |
| 7 | 51 | 46 s | 72 s | 110 s | 16 | 23 |
| 8 | 54 | 48 s | 75 s | 113 s | 16 | 24 |
| 9 | 58 | 50 s | 78 s | 118 s | 17 | 26 |
| 10 | 62 | 52 s | 80 s | 122 s | 18 | 27 |
| 11 | 63 | 53 s | 82 s | 124 s | 19 | 28 |
| 12 | 69 | 56 s | 86 s | 130 s | 20 | 30 |

Medals show up on the **level-cleared** screen (with what the next tier up would need, and *New best!* where you beat your old one), as three little pips beside each level in the **Levels & cutscenes** picker, as a one-line summary on the title screen, and in full on the **Stats & Medals** tab. The pips have three different **shapes** — a circle for time, a diamond for ripples, a square for flawless — so they never depend on colour.

**There is no timer on screen unless you ask for one** (Settings -> Display -> Show timer). Medals are something to find later, not a clock ticking at you.

The **stats** the game keeps, all-time: levels cleared, deaths (and what killed you: echo monster, scent monster, mimic, stalker, Muffler, Singer), ripples sent, times crouched, sonar decoys used, times marked by the Singer, time played, distance walked, and cleared/deaths broken down by difficulty. A mimic that a ripple has already turned still counts as *the mimic* when it kills you. Tracking is counting only — nothing the game does depends on it.

## The soundtrack

From v11.0 each level has a **procedural score**: a slow pad that drifts, and the odd note from that level's own scale, played by the Web Audio API like every other sound here — no files, nothing sampled. It plays *under* the cave drone rather than replacing it, and both sit on the **Ambience** bus, so Settings -> Audio -> Ambience takes the music down without touching the sounds you need.

- **Moods.** The title screen has its own; levels 1-5, 6-8 and 9-10 each have one; **level 11** is muffled and almost noteless, like the thing that lives there; **level 12** is in whole tones, so it never settles.
- **It is deliberately sparse and quiet** — a note every few seconds at most — and a screech, the Singer's sting or its countdown ticks **duck** the whole ambience bus for a moment, so the music can never mask something you need to hear.
- **It tells you nothing new.** The only thing it reacts to is `danger`, the exact value the heartbeat and the red screen-edge already use (how close the nearest monster is). It is never told *which* monster, so there is no music cue for the mimic, the Muffler or the Singer. **In calm mode it stays flat** and never swells at all.
- It uses a lookahead scheduler on the audio clock (so nothing clicks or drifts), has its own random numbers seeded per level (so a level always sounds like itself, and the game's own random stream is untouched), and stops cleanly for cutscenes, the end of a level and quitting.

## How it works

- **Ripples are ray-cast.** Each ripple fires 640 rays through the tile grid (plus circle tests for obstacles, monsters and the exit). The wavefront expands at a fixed speed, lights up what it hits, and a reflected wave travels back along each ray. **A ripple has a limited range**: it reaches only so far from the spot you sent it (about 250-420 px depending on level and difficulty, roughly what fits on screen around you). Anything farther than that is not lit up, gives no echo, and a monster out there is not alerted.
- **Echoes arrive on time.** An object at distance `d` returns its echo `2d / speed` seconds after the ripple, so nearer things answer first. Walls tick, obstacles go *tonk*, monsters moan, the exit rings like a bell.
- **Monsters are blind.** Walking, bumping into walls and standing near a monster tell it nothing. A monster only starts hunting when your ripple's wave actually **touches** it: the wavefront has to pass over the monster *where it is at that moment* (not where it was when you pressed SPACE), within the ripple's range, with no wall, boulder or other monster in the way. A monster that has stepped out of the wave's path is missed, and one that walks into the wave is caught. When it is touched it goes to the exact spot you were standing when you sent the ripple. It is not told where you are *now*, so if you have moved on it has no idea where you went. On arrival it stands there and **listens for a few seconds** (see the modes below): if you walk "too close" to it during that window it hears your footsteps (standing still makes no sound) and **locks on**. A monster that has locked on knows exactly where you are and keeps following you — even after the listening time is up — for as long as you stay that close. The moment you get farther away than that it loses you, goes back to wandering (or sleeping) and is deaf again: it can't track you until another ripple hits it. A monster that hears nothing in its listening time gives up and is deaf too, and it is also deaf while it is still walking to a ripple spot. Touching a monster kills you.
- **You can hear them too.** Each monster has a continuous spatial voice (pitch and brightness change with mood), footsteps, and a screech when it starts hunting. A heartbeat kicks in when one is close. Echo monsters growl and click; scent monsters gurgle, sniff and squelch.
- **Scent monsters and puddles (level 6+).** A second, different monster (violet) never stands still: it walks the maze. It **ignores ripples and footsteps** — a ripple lets you *see* it, but it learns nothing from it. It follows **smell** instead. Lime **puddles** lie on the floor (a ripple lights them up and gives a wet *blorp* echo; up close they glimmer). Step in one and you are **smelly for 5 seconds of walking** — the clock only runs while you actually move, so standing still (or pushing into a wall) never wears it off, and standing in the puddle keeps topping it up. While you are smelly and within its smell range, a scent monster locks onto you and follows your live position; it loses you when the smell runs out or you get out of range. You also leave a **smell trail** behind you while smelly. It **lasts about a minute** after your smell runs out (60 seconds, fading over its last 12), or for as long as you stay smelly and keep it growing. **Your own trail can smell you again:** if you step back onto a trail you left while it is still there, you become smelly exactly as if you had stepped in a puddle (5 seconds of walking; if you are already smelly it tops you back up). Any part of any finished trail counts, including walking straight back along the one you have just laid. It can only do that once every **10 seconds**. The only parts that don't count are the trail you are still laying, and the last few steps at the tip of the trail you have just finished (you are standing on it the moment your smell runs out) until you move back along it or step off it. A scent monster that **touches a trail** at all follows it to the **other end** (the end farther along the trail from where it touched it), then carries on patrolling. Touching a scent monster kills you, just like an echo monster.
- **Procedural audio.** All sound is synthesised at runtime with the Web Audio API (`AudioContext`) in [`js/audio.js`](js/audio.js) — oscillators, filtered noise and a generated reverb impulse response. The `AudioContext` is only created when you click **Begin**, to satisfy browser autoplay rules.

## How things look

When a ripple's wave reaches something, it is drawn **as itself**, not just as a coloured arc: an echo monster is a spiky, ribbed star with a V-shaped mouth and no eyes; a scent monster a wobbling blob with drips; the stalker a thin body on long limbs; boulders are cracked rocks and pillars fluted columns; puddles glossy blobs; the sonar decoy a little device with an antenna and a ring; the exit a portal. Walls get a faint stone texture. (The table under **What the colours mean** has the full list; the title screen's legend shows the same art.) The rules it follows:

- **True size.** Every shape fits inside the thing's real collision circle, and the coloured ray arcs that always traced that circle are still drawn under it, so what you see is what blocks or kills you. A monster is drawn facing where your ripple came from (never the way it is really heading), so the shape tells you nothing extra about what it is doing.
- **Visual only.** [`js/art.js`](js/art.js) draws with plain Canvas 2D (no images, no dependencies, works from `file://`) and reads nothing from the game; the game never reads anything back from it. It never calls `Math.random` and never touches the level generator's random numbers (`mulberry32`); its small movements (a wobbling blob, twitching spikes, the exit's turning arc and sparkles) run off a render clock, and every shape is a fixed function of the thing's position. The one exception is the disguised mimic's per-mode tell (see **The mimic** above).
- **Cheap.** A few dozen path segments per lit thing, no per-frame allocation beyond the paths themselves; the busiest scene tried (level 10's monsters, obstacles and puddles lit by three ripples at once) costs about a millisecond a frame more than the old arcs did.
- **Calm mode is unchanged.**
- The **cutscenes** use the same art for their monsters, the puddle, the decoy and the mimic's "exit", just bigger, and the mimic's disguise melts into the echo monster in the mimic scene too.
- A **mimic that a ripple has just touched** melts from the exit portal into the echo monster over about **0.3 s** (a smooth cross-fade, never a flash) and is never drawn as an exit again; ripples sent after that see an ordinary echo monster.

### The title screen

**ECHO MAZE** is drawn, not typed ([`js/wordmark.js`](js/wordmark.js)). The letters are the **exit green** — `#5dffa0`, the colour of the way out, which is what the whole game is about — taken from the palette's exit role, so the colour-blind palettes get their own version of it. They are laid out glyph by glyph: the same tracking between every pair of letters, and a fixed gap between ECHO and MAZE of **half a capital's height** on top of that tracking, so the two words always read as two words at any size.

They are **lit from within**, not filtered: the glyphs are painted four times — three additive (`lighter`) passes at shadowBlur 30, 14 and 4 with rising fill, building the halo outwards, and then one ordinary pass that lays the letterforms down in the exit green itself, so they are exactly that colour and never wash out.

Every five seconds a **bright band crosses the wordmark** in just over a second, and where it passes it both **brightens** each letter (an additive fill through a moving gradient) and **thickens** it (a stroke through the same gradient, swelling with the band) — the same thing your ripple does to a wall it finds. Then it rests, and comes round again. One sweep every 5 s is about 0.2 a second, well under the game's three-a-second flashing limit. When the title first appears, and whenever a level hands back to it, the band runs once brighter and quicker with a soft whoosh (synthesised like everything else; silent until the first click has made an AudioContext, so it can never hold up **Begin**).

**Calm mode** — and your system's *reduce motion* setting — visibly softens it and never removes it: the band's peak brightness drops by **40%**, it crosses **half again more slowly** (1.65 s instead of 1.1 s), it comes round every 8 s instead of 5, and the resting glow is dimmed to 55%.

The rest of the screen is built from the same light. Two colours carry meaning and nothing else is allowed to: **blue** (the colour a ripple paints a wall) is you and your interface — the key chips, the borders, the buttons — and **green** is the way out, which is why the wordmark and the exit's legend chip are the only green things on it. The key chips are pressed and lit from their top edge; the controls, the legend, the long paragraph and the two option rows are grouped into their own blocks with hairlines between them; each legend row is a chip tinted in the colour of the thing it names, with the real in-game art glowing inside it; and the mode tiles and the Begin button take more of the same light when you reach for them. Nothing it says, and nothing any control does, is different.

### One interface

Every other screen is built out of the title screen's language, so the whole game reads as one thing. **Blue** is you and your interface and **green** is the way out, everywhere: the pause menu wears the title's panel, the caught screen wears it lit red, and level complete wears it lit green (the screen after level 13's capture is the one that deliberately wears none of it). Key chips look the same pressed-metal way wherever a key is named — the pause menu, **Settings → Controls**, the title. Buttons, the settings tabs, the level grid, the cutscene list, the checkboxes and the volume sliders all take the same glow when you hover, focus or press them.

**Nothing cuts.** Screens cross-fade in about **300 ms**: an overlay fades and its panel rises a little into place, and a change that swaps what the maze view is showing — starting a level, a cutscene ending, quitting to the title — passes through a short fade to black and back. A second press while a fade is running is ignored rather than stacked up. The one thing that never waits is sound: every button makes its click and creates or resumes the AudioContext *in the press itself*, before the fade starts, so **Begin** turns the sound on exactly as immediately as it always did.

**Numbers move.** The ripple counter and the level in the HUD tick with a quick 260 ms pulse when they change (only when they really change — the clock ticks without pulsing), the level banner eases in and out rather than appearing, and on the level-complete screen the medals reveal **one at a time, about 170 ms apart**, each with a small pop and a flare on its pip, while the time and ripple counts count up to themselves.

**Calm mode softens all of it** — fades about 40% longer, panels rising half as far, medals a little further apart — and never removes it; your system's *reduce motion* setting does the same. Nothing here repeats, so nothing here can flash: each of these plays once, when a screen changes or a number moves. It costs nothing to run — the busiest level in the game still steps and draws in about a third of a millisecond a frame.

### Telling you what happened

Three small things that say more about the game without changing any of it.

**Death tips.** The Caught screen adds one line saying what really got you — not a guess, and not a generic hint. Every monster tags itself the moment it first notices you, and the tip reads that tag back: *It heard your footsteps after your ripple found it*, *It followed your trail*, *It heard you standing nearby*, *Its ripple marked you, and it leapt to where you were*, *That exit was a mimic* — or, if it had never noticed you at all, *You walked straight into it*. A stalker that heard you walking says so; one that heard you simply standing there says that instead. There are two or three phrasings of each, chosen by hashing the level and the moment of death, so the same death always reads the same and repeated deaths do not. Hardcore's notice on the title screen carries the tip too. The buttons and everything else about the screen are unchanged — except the line under **Caught**, which names what caught you, in your own words: *The echo found me*, *The scent monster followed my trail*, *It wore a voice I trusted* (the mimic), *The stalker followed me the whole way*, *The muffler heard me first*, *The singer sang me in*, *The screecho screamed, then found me* - and on levels 15-16, which never needed an echo, *It never lost me*, or on level 16 *It was faster than me*.

**Near misses.** When something comes within a hair of you — inside one and a half times the distance that would kill you — and then backs out again without touching you, the game marks the moment: one heartbeat, a faint red pulse at the edge of the screen, and a short dip in the speed of what is *drawn*, so the maze seems to hold its breath. It is a **moment, not a mechanic**: nothing about hit detection, monster speed, hearing or AI knows the near miss exists, and the same seed plays out exactly the same with it and without it. The same monster cannot give you another one for two seconds. They are counted in **Settings → Stats & Medals** as *near misses survived*, and count towards nothing else — not medals, not difficulty.

**Progress saved.** Clear a level and a small note appears in the corner for a moment — but **only when something was really written**: a new best level, or a medal you did not have. Playing a cleared level again and doing no better writes nothing new and says nothing. If storage is off, full or blocked, nothing appears at all, rather than a promise the game cannot keep.

All three follow calm mode: the near miss keeps its cue and its pulse at about a third of the light with no time dilation, and the toast eases the way every other screen does.

## Levels

There are **twenty-seven levels** (the tutorial is **level 0** and is not one of them — see above). Levels 1 to 12 are generated mazes that grow bigger and more loop-filled as your ripple range shrinks and its cooldown grows (maze sizes run from 7 x 5 cells on level 1 to 18 x 14 on level 12). Level 1 has no monsters so you can learn the ropes. A maze for a given seed is the same in every mode. **Levels 13 to 24 are different**: they are drawn by hand, they are the same every time, and they tell one story in a row — *the capture*, *the gaol*, *the false exit* and *another one*, then **Act 2, the broken gaol** (17 to 20) and its second part, **the void** (21 to 24), and **the light** (25), and then **Act 3, the outside**: First Breath (level 26 inside the game) and Fresh Air (27), below. The story so far ends after Fresh Air.

The monsters on each level are **exact** (the number never varies from run to run). **Levels 1 to 8 are the same in every mode. From level 9 on, Easy has one fewer monster** (the modes otherwise differ in speed, hearing, ripples and puddles, not in how many monsters there are). **Normal, Hard and Hardcore:**

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Echo monsters (red) | 0 | 1 | 1 | 2 | 2 | 0 | 1 | 1 | 0 | 0 | 1 | 1 |
| Scent monsters (violet) | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 2 | 1 | 0 | 0 |
| Mimic (looks like the exit) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| Stalker (orange) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| Muffler (never seen) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| Singer (magenta) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| Sonar decoy to find | – | – | – | – | – | – | – | – | 1 | 1 | 1 | 1 |

**Easy** is identical for levels 1 to 8, and then: **level 9** has **one scent monster and one mimic** (no second scent monster); **level 10** has **only a stalker**; **level 11** has **only the Muffler** (no echo monster); **level 12** has **only the Singer** (no echo monster). The mimic turns into an echo monster when a ripple touches it, so "no echo monsters" on level 9 still hides one threat. The sonar decoy is terrain, not a monster, so it stays on those levels as before; the smell puddles do not (see below).

Each level introduces **one new threat**, and a debut level pairs the new monster with at most one familiar one (none on Easy); there are never more than **three monsters** at a time (levels 8 and 9 are the peak; the mimic counts as one). Smell puddles arrive with the scent monster on level 6, and **only exist on a level where the mode has at least one scent monster**: levels 6 to 10 on Normal, Hard and Hardcore, levels 6 to 9 on Easy. **Levels 11 and 12, and Easy's level 10, have no puddles at all** (there is nothing there to smell them). **Level 6 has no echo monsters at all** — only the scent monster, so nothing on it hears your ripples; level 7 brings an echo monster back alongside it. **Level 8** adds the **mimic** (below). **Level 9** has no echo monsters: two scent monsters and the mimic, and the **sonar decoy** (below) — and, because of the two scent monsters, **no more than six puddles** (puddles are always at least three tiles apart); from here every level has a sonar decoy to find. **Level 10** is the **stalker's**: one stalker and one scent monster, no echo monsters and no mimic, so nothing on it can be alerted by a ripple at all. **Level 11** brings the **Muffler** and **level 12** the **Singer** (both below), each with one echo monster. Both new monsters spawn far from the start like every other monster (at least `min(8 + level / 2, 16)` path tiles away), never on a tile the way from the start to the exit *has* to pass through, and never next to another monster. (Before v9.2, level 9 had two echo monsters and one scent monster in every mode.)

### Level 13: the capture

**Spoilers for the end of the game.**

Level 13 is not generated. It is a **hand-drawn maze, the same every time, in every difficulty mode** — 27 x 21 tiles, one route with six dead ends and a loop around the right-hand side, about 74 tiles of walking from the start to the far end. Its ripple range and recharge simply carry on from level 12's curve: **292 / 250 / 214 / 207 px** and a **1.2 / 1.46 / 1.73 / 1.8 s** recharge on Easy / Normal / Hard / Hardcore (nine pixels shorter than level 12, and the same recharge, which the curve had already capped).

**Nothing on level 13 can kill you.** No echo monsters, no scent monsters, no mimic, no stalker, no Muffler, no Singer, no puddles, no decoy. Everything else is the game exactly as it always was: you are blind, you move, you ripple, you crouch, and the way out chimes somewhere ahead of you.

As you get closer to the far end — measured by **how much of the route is left**, over the last 28 tiles — the level starts to lean on you: a low drone rises and roughens, the cave's own ambience bends out of tune, the floor picks up a tremor, and a red vignette closes in from the edges of the screen. All of it is **sound and picture only**: it never touches collision, your speed, your ripple's range or its accuracy. **Calm mode** climbs it more slowly, stops at under half the strength, and drops the tremor entirely — it is softened, never removed. Nothing in the ramp flashes at all, and the one flash in the whole level, on the moment of contact, is a single pulse that is gone in a third of a second (about three and a half times dimmer in calm mode, which also has no floor kick).

**The one room you can see.** The corridor opens into a large room with a big door on the far side, and that room **glows on its own** — faintly at first, brighter the closer you get. It is the only place in the whole game where you see anything without pinging it, and it is deliberate. It is an exception to the *ripple*, though, and never to the *walls*: **stone blocks it exactly as it blocks an echo**. From outside the room the only way any of its light reaches you is through the one gap in its wall, and how much of that gap you can see — by the game's own line-of-sight test, the same one the visual sound cues use — is how much of the room is lit for you. Stand in the dead end alongside it, or in the corridor that runs underneath it, and there is nothing to see but the dark. The rest of level 13 is as dark as everywhere else.

What the light shows you is a room with three walls, a rough fourth one across the far end, and the green of the way out glowing somewhere behind that. **The fourth wall is a warden.** It is as blind and eyeless as everything else down here; it does not chase you, it cannot hear your footsteps, and it will not kill you if you touch it. It was simply already there, and it is between you and the door. A ripple's rays come back off it as stone — the wall's colour, the wall's texture, the wall's echo — and there is nothing whatever to tell it apart from the room's own far wall.

Nothing about it looks like an animal, either. It is a face of **worked stone**: a jagged, asymmetrical crest cut into long uneven facets and split by deeper clefts, lying in courses like masonry, chipped and pitted all over and forked by cracks that have had a very long time to spread. The only thing on it that is not stonework is one long **seam**, closed, well off the middle — not an eye, and not a mouth. That is precisely why you could not tell it from the wall: it *is* built like the wall.

Until you walk into it. **Stepping into the room is the whole of the trigger** — you do not have to press anything and there is nothing to work out. A ripple goes out the moment you are properly inside, whether you wanted one or not: a flinch, not a decision. (It is not counted as one of your ripples, and it comes whether you are crouching or not, because it is not something you did.) The wave crosses the room in about two tenths of a second, and the wall answers. From that moment you have no controls, and what follows takes about three seconds:

1. **It lights up, and nothing happens.** Half a second where the only thing that moves is the wave going past it. Look at what has been standing in front of the door.
2. **It reaches.** Three limbs of the same cracked stone come out of the mass towards you, growing longer and visibly thicker as they come, the middle one opening into claws. The floor's tremor builds and something very large and very low swells up out of the quiet under it.
3. **It closes.** One hard flash, the room's own light warps, the floor kicks hard, and the claws shut.
4. **Out.** The picture fades to black over about eight tenths of a second — and the sound keeps going after the screen has gone, rather than being cut off with it.

Walking into that room is what **clearing** level 13 means: your progress is saved exactly as it is on any other level, and the *Level cleared* screen is skipped, because there is nothing to be pleased about. **Level 13 has no medals** — it is the same maze every time, and a Time medal would ask you to hurry through the one part of the game built to be walked slowly. It still counts towards *levels cleared* and it appears in the level select like any other level.

And then the story goes on. **Out of the black the capture ends in comes a short scene** (about half a minute, no words, lit only by dripping water) of what happens while you are out, and then **level 14 begins in the same dark** (see *The gaol*). The first time, that scene cannot be skipped - no key, tap or button gets past it, though `P` pauses it - and it only counts as seen once it has played to the end, so closing the game half way through means it plays again next time. After that it plays on the way into level 14 like the other scenes and can be skipped, and it is in **Levels & cutscenes** as *Somewhere Deeper*. A save that is already on level 14 without having seen it gets it once on **Continue**. The old *You finished the game* screen no longer plays at all: clearing level 12 leads on to level 13 like any other level, and being carried off is not a finish. Unlike the story scenes, **the capture is not once-only**: it plays in full every time you finish level 13. Those scenes are somebody else's memory, and you only need them once; this one is what happens to you, and it happens every time you walk into that room.

### Levels 14 to 16: after the capture

**Spoilers again.** All three are drawn by hand like level 13, and are the same every time and in every mode. Their ripple range and recharge are the ordinary curve's for those levels (the range has reached its floor, so **288 / 247 / 211 / 204 px** with a **1.2 / 1.46 / 1.73 / 1.8 s** recharge on Easy / Normal / Hard / Hardcore). Each one hands straight on to the next — there is no *Level cleared* screen between them, though your progress is saved at each way out exactly as on any other level, and a small *Progress saved* note appears the moment the next one gives you the controls. None of them takes medals. Each opens in the dark the last one ended in, and its opening beat plays every time, like the capture.

**Level 14: the gaol.** You wake up in a cell — your breath, a ringing in your ears, and a drop of water landing beside you whose little ripple shows you stone and **iron bars**. Nothing in here can hurt you. It is a block of barred cells along one corridor (you can see through the bars with a ripple, but not walk through them), with a heavy door at the end. **The door is locked.** Try it and it rattles, and soon after that, somewhere back along the corridor, water starts landing on metal. **The key** is lying on the floor somewhere in the gaol: a ripple finds it exactly the way it finds a puddle or a decoy — an old iron key, in brass — and the first time you can see it from where you stand, the game gives it a moment. Walk onto it to pick it up (you hear it, the top right says **Key**, and you carry a small key at your side). Take it to the door and it turns, the bolt draws back and the door grinds open. Walk out, and keep walking. Water drips all through the gaol, and every drop lights a little of the stone around it.

**Level 15: the false exit.** Partway through, at the end of a long straight passage, there is **light** — warm, the only warm thing down here, and the air around it sounds different: softer, almost like outside. It is the second place in the game where you see something without a ripple, and it keeps the same rule as level 13's room: **walls block it completely**, so you only ever see the part of it you could really see from where you stand. Get close enough and it puts the light out. A ripple goes out of you whether you want one or not, and what comes back is the same stone as level 13's — it is one of them. It reaches for you, the floor shakes, and somewhere behind you a sealed passage cracks open. From then on it is coming after you for the rest of the level.

**Level 16: another one.** You start in a quiet chamber, and somewhere below water is dripping — **the drops fall along the way out**, so the sound and the small light of each one tell you where to go. When you step into the first gallery, stone splits far behind you. This one is **faster than you**.

**How the Warden hunts (levels 15 and 16).** It **always knows exactly where you are**. Ripples, footsteps, smell, crouching, a muffler's shadow and the sonar decoy hide nothing from it and distract it from nothing — the only thing that helps is distance, and it comes the shortest way. On level 15 it moves at **three quarters of your walking speed**, so as long as you keep moving and do not run into a dead end it falls behind. On level 16 it moves at **1.05 times your walking speed**: it gains a little every second, so a clean run reaches the way out well ahead of it, and every wrong turn and every pause spends some of that lead (about three seconds of standing still in all, or a few wrong turns into the short dead ends, is what it takes for it to catch up). Touching it is death, by the same rule as every monster — your circle and its circle overlapping — and the death tip says what went wrong. Like every monster, you see it only in a ripple, and you hear it: a low grinding voice that shifts as it comes and goes, and heavy steps (the second one's are heavy enough to feel).

**Difficulty and calm mode** work on 14-16 exactly as on 13: the mazes are the same in every mode, the Warden is the same speed in every mode, and the modes differ in your ripple's range and recharge — and Hardcore is still one life. Calm mode takes away every shake and softens the flashes and the startling sounds, and never changes anything you can do.

### Levels 17 to 20: the broken gaol (Act 2)

**Spoilers.** Four more hand-drawn levels, straight on from level 16, the same every time and in every mode. The gaol is coming apart: **each level breaks one rule of the maze**, and nothing explains it - the level and its one-line hint do. There are no new monsters, no words and no cutscenes, and no fragments to find. Around the edges of each map the dark thins into a black, static-flecked void, a little more each level, with a low hum under it and, now and then, the sound of something falling a long way and never landing (all of it picture and sound only - it changes nothing you can do).

- **17 - the liar.** *Trust your ears.* Some walls a ripple draws are not there (walk into one and it comes apart), and some walls that are there a ripple does not draw (bump one and it thunks, and shows from then on). The sounds never lie.
- **18 - the shuffle.** *Listen for the grinding.* Some walls slide. Every ripple you send moves each sliding wall within about six tiles to its other place - after a grinding sound that warns you first - and the next one moves it back. Pinging is a choice. A stalker roams here.
- **19 - the loop.** *Remember the drip.* Some places fold onto others: step in and you are somewhere else (a rush of air, a flicker). One brings you back near the start. A single dripping drop is the landmark to find your way by.
- **20 - the echo behind.** *It answers late.* Your ripple crawls and what it finds shows up late. A moment after you start, stone splits behind you, and a hunter like level 15's comes after you - slower than you, so keep moving. Its way out leads to the end of the game so far.

Each takes about half a minute to a minute and a half once you know it, and every one is checked to be finishable (`tools/act2-check.js`). A save that had reached the end before carries on to level 17 - nothing is lost.

### Levels 21 to 24: the void (Act 2, part 2)

**Spoilers.** Four more hand-drawn levels after 20. The void is not at the edges any more: it is **taking the maze**. Where the floor has gone it is black with the same slow static - always there to see - and **stepping onto it is a fall** that never lands (the Caught screen says *The void took you.*). A monster that ends up over the void falls too, and is gone for that attempt. Still no words but a one-line hint, and no fragments.

- **21 - the crumble.** *Every step is one way.* Some floor is **crumbling**: it holds you, but a moment after you step off it, it cracks - you hear it - and falls away. There is no going back over it. Rush, and you can strand yourself; ping first (a ripple shows the cracks) and plan.
- **22 - dead air.** *Where nothing answers, nothing hears.* Some places are **dead air**: a ripple that goes in never comes back (a quiet black patch is all you see), and your footsteps in it are lost. And the **Alarm** is here - it cannot hurt you, but if your ripple touches it, it screams, and everything comes to where you were. A ripple sent from inside dead air never sets it off. A new scene before this level shows it (in *Levels & cutscenes* as *Only A Voice*).
- **23 - the creeping edge.** *It is coming in from the edges.* The void eats the map from the outside in, a ring at a time, on the same schedule every attempt - a low rumble as each ring goes, and the next one thins into static just before. The way out is in the middle. On Easy it comes more slowly; Hard and Hardcore are the same as Normal. The two hunters live out on the rings, and fall when their ring goes - you can lead them out there.
- **24 - the wrong way out.** *Not every way out is out.* A hard maze with a way out at the far end - which leads into a smaller, half-eaten copy of it, where the way out is back the other way and something breaks out of the stone behind you. **Caught in that second part, Try again starts the second part again**; anything else (Continue, the level list, closing the game) starts level 24 from the beginning, and nothing is saved until you are through both. Its way out leads on to level 25.

Every one is checked to be finishable (`tools/act2-check.js`: 21 over every combination of which crumbling floor is gone - which also proves you can get stuck - and 23 against the void's schedule, with time to spare). A save that had reached the end carries on to level 21 - nothing is lost.

### Level 25: the light (the end of Act 2)

**Spoilers.** Level 15's mirror. A long quiet hall, and far off down it - through a long line of bars you can see through but never walk through - a faint warm light: the only real light in the game. It grows and warms as you come, and the sound of outside (the wind, at night) grows with it. Partway along, the stone behind you splits and level 16's faster Warden is let out; a little later the floor behind starts falling into the void, so there is no going back. The way runs winding to the light. **This time the light is real**: reach it and the Warden stops at the edge and comes no further, its hum fades, and the light floods in. Then the white runs on into First Breath. The hint is *Don't stop.* It is checked to be fair (`tools/act2-check.js`): a clean run stays 6.5 s ahead of it, and the falling floor never reaches anyone who keeps moving.

### Act 3, the outside: First Breath

**Spoilers.** The white you came out into fades, and the colour comes in: **daylight**, for the first time. A big open field, grass in light and dark patches, flowers, trees you walk under, and you - seen for the first time, from above. Nothing to fight and nothing to solve: the wind and the birds, your steps in the grass, and a worn path that leads, if you follow it, to a gap in the trees on the far side where the sun comes through (the outside sound gets a little louder that way). Through it, the light again - and Fresh Air.

Out here **only the movement keys** do anything (and pause): no ripple, no crouch, and nothing on screen while you walk - no HUD, no hints, no Visual cue glyphs. Pausing brings it all back. On a touch screen only the joystick is there; tap anywhere else and the pause button shows for a few seconds. It is shown as **First Breath** everywhere (the level list, Continue, the pause menu); inside the game it is level 26, so saves just carry on. The outside levels to come each have a name too.

### Fresh Air

**Spoilers.** Past the trees, a village in the same summer daylight: cottages with their roofs and doors, two fenced gardens, a washing line, a square with a well, two market stalls and a bench, paths to every door, trees round the edge. The cottages, fences, stalls and the well are solid; the grass, the paths and the trees are as in First Breath. And people - a dozen of them, going about their day: someone carrying water from the well to a door, a child kicking a ball against a wall, someone hanging out the washing, someone sweeping, someone sitting down and getting up again, two talking, a stallholder, a gardener, people walking their rounds. They step aside to keep a little way off, and never look at you. **About every forty seconds, all of them at once, the day starts again**: they fade a little, for a moment, and are back where they began, under a half-second hush in the wind. And every sound the village makes - the murmurs, their steps, the bucket, the ball, the broom - comes again a beat later, quieter. Yours do not. The gate at the far end of the street is the end of the story so far: *More to come soon.* The same controls as First Breath: only movement (and pause), nothing on screen.

**The daylight interface.** Once you have reached First Breath, Settings -> Display has a **Daylight interface** switch: every menu and screen in a light, bright look - soft light backgrounds, dark green and slate text, a warm accent - instead of the dark one. The game itself, and the HUD and captions over it, stay as they are. Off unless you turn it on.

### Crouching (every level, every mode)

**Hold `SHIFT`** to crouch (not `Ctrl`, which closes the tab in a browser). You move at exactly the same speed, but:

- you make **no footstep sound** — so nothing can hear one;
- you **cannot send a ripple**;
- the top right shows **Crouching**, and your dot shrinks and dims;
- **the instant you start crouching, everything YOUR ripples showed you is wiped** (a Singer's waves are not yours: crouching does not stop them and does not wipe what they lit): waves still travelling, the echoes they hadn't returned yet (their sounds are cancelled and never play), every fading mark on walls, obstacles, monsters, puddles and the sonar decoy, and the exit's glimmer (the mimic's too, or the difference would give it away). **Standing up does not bring any of it back** — only a new ripple shows anything again (that includes the exit's glimmer, which stays hidden until you next send one).

Crouching works in every mode, on every level. (Bumping into a wall still makes its small mark; that is you feeling the wall, not a footstep.)

### The stalker (level 10+)

An **orange** monster, a little slower than an echo monster (**0.95 x** its speed on the same level and mode, and always well under your 170 px/s). It **ignores ripples and echoes** (a sonar decoy does call it, since v11.1): a ripple lets you *see* it (in orange) but it learns nothing from it. It only ever **hears you**, and only while you are **not crouching**, in two ways, both working at all times (it has no listening window):

- **Footsteps** — while you are moving, from within the mode's "too close" distance (100 / 124 / 148 / 158 px).
- **Presence** — while you are standing, **even completely still**, from within a smaller radius (**60 / 75 / 90 / 100 px** on Easy / Normal / Hard / Hardcore; always smaller than that mode's footstep distance).

A presence hit counts exactly like a footstep: it **walks to the exact spot it heard you**, keeps updating that spot for as long as it keeps hearing you, and **loses you if it hears nothing for 3 seconds** (even if it has not got there yet). When it hears nothing it **patrols to random tiles at a steady pace and never stands still**, so waiting in a corner does not work. **Crouching silences both.** It has its own voice — slow breathing and soft clicks, no growl — its own footsteps and a soft breath-and-click when it hears you. Touching it kills you.

### The Muffler (level 11): the thing you cannot see

A "mini boss" that is **never drawn** (the title legend says so in words: *Muffler: can't be seen, only heard*). It **absorbs ripples**: when a ripple ray reaches it, the ray simply ends there — no echo, no colour, no sound — so it is never lit, and everything behind it (walls, monsters, puddles, the decoy) is in **shadow**. That gap in your echo map is the only tell; nothing else reveals it. It absorbs the Singer's ripples too. It cannot be smelled either: it has no scent, ignores puddles and trails, and leaves none.

You can only **hear** it: a deep, dampened hum with slow, muffled thumps, spatialised like the other monsters and following the same wall-muffling and Doppler rules. It joins the heartbeat and the red screen-edge creep (both still off in calm mode), and has a small Visual-cue glyph (a pale hollow ring with a dash through it).

It **tracks by footsteps, like the stalker but harder**: it ignores ripples and echoes (a sonar decoy does call it, since v11.1); it hears your footsteps from `mufflerFootstepRadius` and hears you **standing** (even still) from the smaller `mufflerPresenceRadius` — both larger than the stalker's — at all times, with no listening window. **Crouching does not fully silence you**: a crouched *move* is heard from a small `mufflerCrouchRadius`; crouched standing is silent. When it hears you it goes to the exact spot, and keeps following while it keeps hearing you; it remembers the last spot for `mufflerMemorySeconds` after losing you (and waits there), then patrols to random tiles, **leaning towards where it last heard you**. Touching it kills (radius 14, like an echo monster). Its speed is `min((70 + 8 x level) x mode speed x 1.05, 160)` px/s — always below your 170.

### The Singer (level 12): the song that marks you

**Magenta.** It roams (at 0.8 x an echo monster's speed) and **sings ripples of its own** through the game's real ripple system: a sung tone from where it stands, and a magenta wave that lights walls, obstacles, monsters and the exit as it reaches them, so you see the maze lit by it. Its waves are blocked by walls and obstacles and swallowed by the Muffler, like any ripple. It is **deaf** to your footsteps, your standing and your ripples; it learns about you **only** when one of its waves reaches you (a sonar decoy still calls it away, since v11.1) — and **crouching does not protect you** from its waves.

- **Marked.** When a wave reaches you, the exact spot it found you at is recorded and a countdown of `markSeconds` starts. You hear a clear **sting**, then **ticking that speeds up**. The countdown audio stays at full volume in calm mode (it is gameplay information), and the countdown length never changes in calm mode. With Visual cues on, a magenta **ring shrinks around you**.
- **The leap.** At zero the Singer launches — a rising whoosh — and **jumps over the walls to the recorded spot**, taking 0.6 s from launch, and lands **exactly** on it. If you are within `landRadius` of the spot when it lands, you are caught. Touching the Singer at any time kills you. It waits about 2 s where it landed, then roams and sings again. Further wave hits during the countdown and the leap are ignored. So: **keep moving** — a marked player who runs still has the countdown *and* the 0.6 s of the leap to get clear.
- Its leap is a jump, not a walk: it covers the distance in 0.6 s, which is faster than 170 px/s — the one fast thing about it. Walking, it is slower than an echo monster.
- Voice: an eerie sustained hum with a wavering pitch (same wall-muffling and Doppler rules); its sung tone and the launch whoosh get a magenta cue glyph (a ring with three small arcs). Calm mode softens the whoosh, the landing crash and any shake; not the countdown.

### The mimic (level 8+)

A monster that **pretends to be the exit**. It is exactly as big as the exit, sits still and silent, and looks and sounds like it: it glimmers the same green when you are close, it sends out the same chime as the real exit from where it stands (so you hear two exits), and a ripple registers it as the exit (green, with the exit's bell) right up to the moment the wave reaches it. It does not show up in the colour legend, and it gives no heartbeat or growl warning. **The second a ripple's wave touches it, it turns into an ordinary echo monster** (its green rays turn red, its exit bell becomes a moan, and it goes to the spot the ripple was sent from). Walking into it before that kills you, like any monster. It never turns back.

**Where it stands** is decided by the exit's own rule, so its position gives it away no more than its look does. The real exit is *the maze cell farthest from the start*; the mimic is the farthest cell from the start that is left once the exit is ruled out, on the **same kind of spot as the real exit** (a dead end, a room, a corridor cell or a junction, whichever the exit happens to be on — the exit is a dead end or a room less than half the time, because "farthest cell" often lands in a corridor once loops are cut in). It is never within 8 path tiles of the real exit, never on a tile the only route from the start to the exit passes through, and never right next to another monster.

**How well it hides depends on the difficulty mode** (`mimicTell` in the `MODES` table; see **How things look** below). Disguised, it is drawn with the exit's portal art, in the exit's green, with the exit's glimmer. The *only* thing that can differ is a small tell in that drawing:

| Mode | `mimicTell` | What you can see of a disguised mimic (next to a real exit) |
| --- | --- | --- |
| Easy | `clear` | the portal **flickers slowly** (about twice a second, never a flash), and its outer ring is **uneven and a slightly yellower green** |
| Normal | `subtle` | a **faint wobble** in the outer ring, and it turns a little faster |
| Hard, Hardcore | `none` | **identical to the real exit, pixel for pixel** - only a ripple tells them apart |

This is an **intentional difference between modes, and a deliberate exception to the rule that the art never affects the game**: it changes nothing but how the disguised mimic is *drawn*. Its sound (the chime), size, speed, behaviour and its Visual cue (the same green chevron as the exit's) are the same in every mode.

### The sonar decoy (level 9+)

Every level from 9 has one **sonar decoy** lying somewhere (it glimmers pink when you are near, blips faintly, and shows up pink in a ripple). Walk onto it to pick it up — you can carry **only one**, shown in the top right — and press the **item key** (`E` by default) to drop it where you stand. It beeps (faster and higher) for **5 seconds**, then **calls**.

**Everything hears it.** Every monster within **480 px** of the decoy when it calls is drawn to it — an echo monster (whatever it was doing, even asleep or tracking you), a scent monster, the **stalker**, the **Muffler** and the **Singer**. Nothing is immune any more: the one item in the game answers every monster in it.

**It breaks a mimic's disguise.** A mimic inside the radius is revealed on the spot, exactly as a ripple would reveal it — the "exit" snarls, turns red and walks over with the rest. So a decoy is also a way to ask *is that really the way out?* without walking up to it.

They pathfind to the decoy at their own speeds and are **trapped there for 5 seconds after they arrive**, deaf to everything: ripples, footsteps, smell, and (new) the stalker's and the Muffler's hearing. A Singer that is called forgets a mark it had put on you — the countdown stops and the leap never comes.

Then they go back to normal: the ones that never stand still (scent, stalker, Muffler, Singer) start patrolling again from where the decoy left them, and an echo monster stands idle where it is, deaf until a ripple finds it.

It is **one time use**, and a trapped monster is still deadly to touch — get past it, don't bump it. **The range has not changed**: 480 px, straight-line, and a monster that has wandered out of it by the time the decoy calls simply never hears it.

Mazes are generated from a seed, so **Try again** gives you the same layout; a new run gets new mazes. The maze for a given seed is the same in every mode — only the monsters change (and, up to level 8, not even how many).

## Difficulty modes

Pick one on the title screen. Each mode scales the level curve (the table shows level 6 as an example). The number of monsters is not part of it — that is the same in every mode, except that from level 9 on Easy has one fewer (see **Levels**).

| | Easy | Normal | Hard | Hardcore |
| --- | --- | --- | --- | --- |
| Monster speed | 85 px/s | 113 | 130 | 135 |
| Listens after arriving | 3.5 s | 4.8 s | 6 s | 6.5 s |
| "Too close" (hears footsteps / keeps tracking) | 100 px | 124 px | 148 px | 158 px |
| Stalker hears you standing still within | 60 px | 75 px | 90 px | 100 px |
| Stalker speed on level 10 (0.95 x an echo monster's) | 100 px/s | 133 | 143 | 147 |
| Ripple range | 367 px | 315 px | 269 px | 260 px |
| Ripple recharge | 0.90 s | 1.09 s | 1.29 s | 1.34 s |
| Smell puddles on level 6 | 2 | 3 | 4 | 4 |
| Scent monster smell range | 240 px | 300 px | 360 px | 380 px |
| A disguised mimic's look (level 8-9) | clear tell | subtle tell | identical to the exit | identical to the exit |
| Muffler hears your footsteps within | 125 px | 155 px | 185 px | 198 px |
| Muffler hears you standing still within | 75 px | 95 px | 115 px | 125 px |
| Muffler hears a *crouched* move within (crouched still: never) | 30 px | 40 px | 50 px | 55 px |
| Muffler remembers the last spot for | 3 s | 5 s | 6 s | 7 s |
| Muffler speed on level 11 | 119 px/s | 159 | 160 | 160 |
| Singer: countdown once marked | 4.0 s | 3.0 s | 2.5 s | 2.0 s |
| Singer: you are caught if this close to where it lands | 45 px | 60 px | 70 px | 80 px |
| Singer sings every | 6 s | 5 s | 4 s | 3.5 s |
| Singer's ripples reach | 270 px | 320 px | 320 px | 320 px |
| Singer walking speed on level 12 (0.8 x an echo monster's) | 84 px/s | 112 | 120 | 124 |
| Your own ripple range on level 12 (for comparison) | 302 px | 260 px | 222 px | 214 px |
| The Singer's reach as a multiple of yours | 0.89 x | 1.23 x | 1.44 x | 1.50 x |
| Lives | unlimited retries | unlimited retries | unlimited retries | **one life** |

Normal is a hair easier than the game used to be (before modes existed), Hard is clearly tougher, and Hardcore is a touch harder again. In **Easy, Normal and Hard**, being caught shows *Try again*, which puts you back at the start of the level you were on (same maze, monsters reset). In **Hardcore**, being caught ends the run: you are sent straight back to the title screen, there is no Continue and no way to resume, and the next Begin starts over from level 1 on a fresh maze. Your Hardcore **high score** (the furthest level you reached, or "finished the game") stays on the title screen — on the Hardcore button and as its own line — and is never lowered by a worse run. Every monster *walks* slower than you (you walk at 170 px/s), so you can outrun a locked-on monster in any mode; the one exception is the Singer's 0.6 s leap, which is a jump over the walls to a spot it already knows — and you have the whole countdown, and the leap itself, to get clear of it.

Progress (best level unlocked) is saved separately for each mode, and your choice of mode is remembered. The cutscenes you have seen are remembered too.

## Calm mode

For anyone who finds the game a bit much. It is **purely visual and audio**, so it never changes the difficulty and can be switched on or off at any time — on the title screen, in the pause menu, or with **`C`** — in any mode. When on:

- no red creep around the screen edges when a monster is close, and no red flash or screen shake when you are caught (the *caught* screen has no red glow)
- no heartbeat
- the monster screech, growl, footsteps, the *caught* crash and the intro's lunge are much quieter, and the intro's jump scare has no flash or shake and a dimmer, smaller monster

## Visual cues (accessibility)

An independent option, like calm mode: a checkbox on the **title screen** and in the **pause menu**, the **`V`** key on any screen, and it is remembered (`localStorage`, `echomaze.visualcues`). While it is on the HUD shows **Visual cues**. It works in every difficulty, in calm mode and with the sound muted, and it **never changes the game**: it only draws (`js/cues.js`), and the game never reads anything back from it.

Each sound that has a direction is also drawn as a small glyph on a ring about **45 px around you**, pointing toward it. Its **size and brightness follow how loud the sound is** (the same distance falloff as the audio), it fades in and out smoothly, and it exists **only while the sound would be audible**. Every kind has its own **shape** as well as a colour, so colour alone is never needed:

| Sound | Cue |
| --- | --- |
| Echo monster: voice, footsteps, screech | red **spiky diamond** (a diamond with a sharp spike on every side, like the monster's jagged shape). A screech (a monster starts hunting) is a bigger, brighter one and adds a short text caption, `[monster screech]` |
| Scent monster: voice, steps | violet **round glyph with a wavy edge** and a bubble in it, like the monster's blob |
| Stalker: breathing, clicks, steps | orange **tall thin capsules**, always upright, in a row (one for a click, two for a step, three for its breathing) |
| The exit's chime | green **chevron** with a short arc of the portal's ring behind it, on the chime's own 2.4 s rhythm, only within its range |
| A mimic's fake chime | **exactly the same** green chevron as the exit's, with exactly the same tell the sound has — no more, no less (in every mode) |
| Sonar decoy | pink **four-point star in a ring**: at its drop spot, and each time it pings (and the floor one when you are near) |
| The Muffler: its hum and its thumps | a pale **hollow ring with a dash through it**. Like every cue it shows only direction, rough loudness and timing, only while the sound is audible |
| The Singer: its hum, its sung tone, its launch whoosh, its landing | a magenta **ring with three small arcs** |
| Being marked by a singer | a magenta **ring that shrinks around you** as the countdown runs out (the ticking is the sound) |
| Heartbeat | a thin **ring** around you, pulsing at the heartbeat's rate |
| Something heavy coming (levels 15-16): its voice and its steps | a pale **uneven block of stone with a seam across it** |
| Dripping water (levels 14 and 16) | a **falling drop**, in the walls' colour; the drop that lands on the key on level 14 adds `[water rings on metal]` |

- Nothing pulses more than **3 times a second**: each source is limited to one pulse per third of a second, however fast its sound repeats (a chasing monster's footsteps are heard about six times a second but flash the cue at most three).
- **Calm mode** makes the fades slower and smoother; it never makes a cue weaker. (Calm mode has no heartbeat *sound*, but the heartbeat ring is still shown, so calm mode does not weaken the cues.)
- A sound a **wall is muffling** gets a dimmer glyph (see **Sound** below).
- It does **not** show hearing radii, monster states or exact positions — only direction, rough loudness, type and timing.
- The shapes are listed in the title screen's legend while the option is on.
- **Cutscenes** get short sound captions in brackets — `[distant scraping]`, `[device clatters]`, `[heartbeat pounding]` — above the explorers' subtitles, one for each sound the scene plays.

## Sound: wall muffling and Doppler

Audio only — neither changes anything about play.

- **Muffling.** Every frame the game checks (with its own line-of-sight code, the DDA over the tile grid, plus the round obstacles) whether a **wall or obstacle** is between you and each monster's continuous voice, each monster's footsteps, and the exit's and a mimic's chime. If so the sound goes through a **low-pass at about 600 Hz** at a slightly lower gain; if the way is clear it opens back up. There are only two levels, faded with `setTargetAtTime` (about 0.1 s) so nothing clicks. The mimic's chime uses exactly the same code as the exit's, so it stays indistinguishable from it.
- **Doppler.** A monster's *voice* (not its one-shot sounds) is shifted by how fast the distance to you is changing: up while it closes in, down while it moves away — at most about **±6 %**, smoothed. Standing still, or moving sideways at a steady distance, gives no shift.

## Touch controls

On touch devices (a coarse pointer, or the first touch) the game shows on-screen controls while you play. The **Touch controls** switch in the pause menu turns them on or off for anyone (and remembers it, `echomaze.touch`).

- **Left half of the screen:** a floating **virtual joystick** — touch anywhere and drag. It is analog: any direction, and speed from a crawl to the same top speed as `WASD` (170 px/s) when pushed all the way.
- **Right side:** a big **RIPPLE** button (the same cooldown as `Space`; it fills like a clock while it recharges), a smaller **CROUCH** button (hold, like `Shift`), a small **pause** button — and an **ITEM** button that appears only while you carry a sonar decoy (there is no `E` key on a phone).
- **Multitouch:** built on Pointer Events, so you can move with one thumb and ripple with the other. A control can never get stuck: it lets go when the finger lifts or is cancelled, when the window loses focus, when the page is hidden, and whenever the game leaves the play screen.
- The page cannot be scrolled, pinch-zoomed or double-tap-zoomed while you play.
- The **pause menu** has big **Sound**, **Calm mode** and **Visual cues** buttons (a touch player has no `M`, `C` or `V`), and the title how-to shows the touch controls.
- Every button on every screen is **at least 44 px tall**. In a cutscene, **tapping anywhere** (or **Skip**) skips it, with the same 0.6 s guard (except the scene after level 13, the first time).
- The game is played in **landscape**: held upright, a friendly "please turn your device sideways" note covers the screen and a game in progress is paused. On a short landscape screen the menus scroll and keep their main buttons pinned at the bottom.
- The sound still only starts from a real tap on a button (**Begin** and friends). A short **vibration** on being caught (not in calm mode).

## Project layout

```
index.html      page + overlay screens (title, How to play, replay, settings, pause, tutorial complete, caught, level complete, ending, the level editor's four: two warnings, My Levels, the editor) + a custom level's title card + the touch layer
style.css       styling (everything for touch is under `body.touch`)
social.jpg      the picture a link to the game shows when shared (1200 x 630)
manifest.webmanifest, sw.js, icons/   the installable web app: its name, icons and full screen, and the service worker that lets it open offline (network first, so it is always the newest version when there is a connection)
js/profile.js   everything saved that is not progress: your keys, volumes, palette, medals and stats
js/palette.js   the four colour palettes, and who they hand their colours to
js/audio.js     SoundEngine - procedural Web Audio synthesis (incl. wall muffling, Doppler, the two buses)
js/music.js     the procedural soundtrack: one mood per level, on the ambience bus
js/level.js     level generation + difficulty curve (levelConfig)
js/tutorial.js  level 0: the hand-drawn tutorial maze and its teaching prompts
js/warden.js    level 13: the hand-drawn maze, the one room that glows, and the capture - and what each hunting Warden is (levels 15-16) and how it is drawn
js/story.js     levels 14-20: the hand-drawn mazes, the key and the gaol door, the false light, Act 2's broken rules and its void, and every scripted beat
js/lore.js      the lore fragments: the twelve notes and recordings, where each maze hides one, and what is found
js/wordmark.js  the drawn ECHO MAZE title wordmark and its echo (title screen only)
js/feedback.js  the death tips: what each monster says it got you with
js/art.js       EchoArt - how everything a ripple lights up is drawn (shapes, textures, the exit portal, the mimic's tell)
js/cutscene.js  the seven story cutscenes: lore cards + scripted scenes (timelines at the top)
js/cues.js      Visual cues (accessibility): the glyphs on the ring around you
js/touch.js     on-screen touch controls: the virtual joystick and buttons
js/settings.js  the Settings screen: Controls, Audio, Display, Stats & Medals
js/levelformat.js  custom levels as plain, versioned data (the format: docs/level-format.md) - reads anything as untrusted
js/levelcheck.js   is a custom level playable? (start, exit, a way between them) - the one rule, in words
js/levelstore.js   where custom levels are kept: list / get / save / delete / duplicate, and folders (kept apart from the levels); two sources: this browser (My Levels) and the bonus levels (read-only), and the bonus levels' Done ticks
js/bonus-levels.js the bonus levels - data only, in the level format (add one by adding an entry)
js/sharecode.js    share codes: a level or a folder as one line of text and back (no UI; the format: docs/level-format.md)
js/dialog.js    the small "are you sure?" / "what should it be called?" / "which folder?" questions, and the box a share code is copied from or pasted into
js/effects.js   custom levels' light and red glow zones (drawing only, clipped to what you can see)
js/editor.js    the level editor: tools, undo / redo, the map, the panels, Level settings, the problems list
js/mylevels.js  My Levels: play, edit, duplicate, move, rename and delete your levels; folders; small pictures; and the Bonus Levels tab (play, copy to My Levels, the Done ticks)
js/game.js      input, physics, ripples, monster AI, rendering, game flow
docs/           level-format.md - the custom level format, written down
tools/          developer tools, not part of the game and not exported with a version:
                art-sheet.html (every shape large and at true size, the exit beside a mimic in each mode, the morph),
                stage.js (stage a scene in the ?debug hook), identity-test.js (same seed, same game, fingerprint),
                generator-fingerprint.js (hash 2,400 generated levels 1-12, to prove none of them moved),
                layout-test.js (compare two builds' level generators, where the exit and the mimic stand, puddle counts),
                palette-check.js (simulates colour blindness and measures every pair of a palette's colours),
                story-bot.js (plays levels 14-16 through the real controls, and measures how close the Warden comes),
                editor-test.js (drives the level editor with real mouse events: every tool, saving, bad data, test
                play writing nothing, soaks; and a bot that plays a custom level), editor-test-2.js (the same for
                v15.1: the touch warning, several exits, the key and locked exits, objects, effects, the title card,
                each level's own difficulty - measured - folders, the v15.0 to v15.1 migration; and a bot that fetches
                the key first), bonus-test.js (v15.2: every bonus level through the loader, played through along
                written routes with several random seeds, the warnings in front of them, nothing saved but the ticks,
                Copy to My Levels playing identically, read-only, the ticks, broken data, a soak),
                check.js (the standard checks in one command - every file parses, the game loads with no console
                error, the generator fingerprint, the quick test suites; --full for all of them), serve.js (a static
                server for the game and the test pages), headless.js (runs an expression in a headless Chrome / Edge,
                optionally a screenshot - Windows, macOS or Linux), test-copy-check.js (checks the finished test copy),
                local-release.ps1 (the owner's PC: makes a merged version's folder, re-points the shortcut, rebuilds the
                test copy), pc-updater.ps1 and install-pc-updater.ps1 (the owner's PC keeps up with main by itself:
                a scheduled task makes each new version's folder from VERSION.json, re-points the shortcuts and rebuilds
                the test copy), undo-release.ps1 (takes a bad release back off main with one new commit - nothing
                deleted, no force-push),
                editor-about-test.js (v16.1: the editor's monster descriptions - every monster has one, its numbers come from
                the game's constants, hover / focus / pick / tap, the screen reader, the layout at laptop, tablet and phone
                sizes, nowhere outside the editor, a soak),
                monster-test.js (v15.7: the Alarm and the Screecho - what sets them off, the scream, the cooldown and the speed
                measured, calm mode, Visual cues, the unreleased-content warning, share codes, the editor, never in the campaign,
                nothing saved, a soak),
                title-test.js (v15.5: the title screen - keys, How to play and what it hides, every button, Begin
                on every difficulty with Calm / Visual cues, touch, nothing saved),
                share-test.js (v15.3: share codes - round trips, lengths, bad / hostile / oversized codes, the screens,
                creator names, imported levels playing identically, nothing written, fuzzing), sample-codes.txt (the
                codes in the test copy's READ ME),
                sample-levels.json and sample-folders.json (the test copy's sample levels and folders),
                keeper-test.js (v16.0: the scene between levels 13 and 14 - the hand-over, unskippable the first time,
                pausing, closing half way, seen and replayed, old saves, Continue and the level list, calm mode and Visual
                cues, nothing else saved, a soak),
                lore-story-test.js (v16.2: the fragments of levels 13-16 - where each lies, read only by your ripple,
                the notes and the recording, the Fragments and replay screens, the hidden scene, old saves, a soak),
                whatsnew-test.js (v16.3: the What's new screen - who sees it and when, the spoiler rule, the dialog,
                never during play, the layout at laptop and phone sizes, a soak),
                act2-check.js (v17.0, v18.0, Node: levels 17-24 can be finished through each one's broken rule -
                searched over every sliding wall's state on 18, through the folds on 19, over which crumbling floor is
                gone on 21 and against the void's schedule on 23 - and 20's and 24's Warden head start),
                act2-test.js (v17.0, v18.0: each broken rule in the real game, every level walked through with the real
                keys - both parts of 24 - old saves going on to 17 and 21, the frame time),
                perf-bench.js (draw cost), update-test-copy.ps1
```

Difficulty is tuned in one place: the `MODES` table and `levelConfig()` in [`js/level.js`](js/level.js). The two Warden speeds are there too: `WARDEN_SPEED` (0.75) and `WARDEN_UPGRADED_SPEED` (1.05), as fractions of your walking speed.

## Debugging

Open the page with `?debug` to expose `window.__echo` (`info()`, `tp(x, y)`, `go(level)`, `step(seconds)`, `intro()`, `freeze(on)`, `csTo(seconds)`, `ripples()`, `marks()`, `crouch()`, `decoys()`, `dropDecoy()`, `rippleRange()`, `cues()`, `features({ cues, touch, audioFx })`, `seed(n)`, `touch`, `soundBlocked(x0, y0, x1, y1)`, `artClock(t)` (hold the art's animation clock still; `null` lets it run), `zoom(v)` (magnify the picture), `snapCamera(x, y)`, `showMuffler(on)` (draw the Muffler, which is never drawn in normal play, as a dim ring with a dash), `newMonsters()` (the Muffler's and Singer's state), `openSettings('title'|'pause')`, `setPalette(id)`, `palette()`, `keys()`, `bindKey(action, slot, code)`, `resetKeys()`, `medals()`, `stats()`, `pars(pathTiles)`, `musicState()`, `setShowTimer(on)`, `levelDeaths()`, `markBy(singer)` (force a mark), and, for the tutorial, `go(0)` (play level 0), `startTutorial('intro'|'title')` (and where it hands over to when it ends), `skipTutorial()`, `leaveTutorial()`, `tutorialState()` (the step, the line on screen, how far you have walked), `tutorialSteps()`, `newPlayer()` (would Begin play the tutorial?) and `setTutorialDone(on)`; for the title wordmark, `wordmarkState()`, `wordmarkReveal(withSound)` and `wordmarkTick(seconds)`, `wordmarkSeek(u, isReveal)` (hold the sweep at exactly this point and freeze it there - the only way to photograph the same instant with calm mode off and on) `wordmarkRelease()`, `ui()` (the interface timings and which overlays are lit), `transition(fn)`, and `deathTip()` / `tipFor(cause, why, level, atMs)` / `whyOf()` / `nearMiss()` / `forceNearMiss()` / `savedToast()` for the death tips, near misses and the save toast; and, for level 13, `go(13)`, `wardenState()` (the phase, the dread, the glow, `sight` and `lit` - how much of the room the player can actually see and how much of its light is therefore drawn - the shake, the reach and the hit, and whether it has been revealed), `wardenCheck()` (the hand-drawn level's shape: floor tiles, dead ends, how many ways into the great room, how far the start is from it, and whether the door is sealed off), `wardenDread(x, y)`, `captureStep(seconds)` (drive the capture on once the controls are gone — `step()` cannot, because `updatePlay` is not running), `gasp()` (send the involuntary ripple walking in sends, on demand); and, for the lore fragments, `lore()` (this maze's fragment - where it lies, how far out of the way, whether it is in a dead end, whether it has been read - plus what is found and the line on screen), `placeFragment(level, seed, mode)` (where a maze WOULD hide its fragment, without playing it), `readFragment()`, `setLoreFound(ids)` (an empty list forgets them all) and `showArchive()`; and, for levels 14-16, `go(14)` / `go(15)` / `go(16)`, `storyState()` (the level's phase, its running beat, whether the controls are taken, the key, the door, the light and the drips), `scriptLock()`, `hunter()` (the Warden: where it is, its state, variant, speed and whether it has shown itself) and `wakeHunter()` (wake it now, for the measured speed test); and, for the level editor, `editor` (`state()`, `doc()`, `tileToClient(x, y)`, `setChoice(kind, id)`, `setTab(which)`), `myLevels` (`show(folder, sort)`, `setView('mine'|'bonus')`, `view()`), `levelStore`, `bonus` (the bonus levels: `list()`, `get(id)`, `isDone(id)`, `doneIds()`, `markDone(id)`), `share` (share codes: `encodeLevel(doc)`, `encodeFolder(name, docs)`, `decode(text)`, `clean(text)`, `contentKey(doc)`, `LIMITS`), `creatorName()` / `setCreatorName(name)`, `levelFormat`, `levelCheck`, `dialog`, `monsterChoices()`, `openEditorScreens()` (the title's button), `acceptGate()`, `acceptTouchGate()`, `closeEditorScreens()`, `openEditor(doc, folder)`, `editorUnlocked()`, `editorScreen()`, `playCustom(doc, from, { card, queue })` (starts a custom level at once - its title card taken away unless `card` - and returns `null` or the reason it cannot be played), `leaveCustom()`, `customRun()`, `card()` / `endCard()`, `playQueue({ name, ids })` / `queueAfter()` / `customAdvance()` (a folder played in order), `customState()` (a custom level's exits, key, notes, zones, palette, rating and its tuned numbers) and `fxZones()`; for the cutscenes (v16.0), `setSeen(kind, on)`, `seen()`, `csPaused()`, `setCsPaused(on)` and `onCaptured()`; `audio`) for poking at the game from the console. `settings()` reports `campaignLevels` (26), `medalLevels` (12 — levels 13-26 take none), `story` (the first and last story levels, your walking speed and the two Warden speeds), `warden` (its level number, how far into the room the capture starts (`insideX`), the length of the dread ramp and, while it is running, where it is `at`), `tutorial` (`done`, `after`, `newPlayer`, its `steps` and, while it is running, where it is `at`), `muffler` and `singer` (this mode's numbers from the MODES table, plus the level's speeds), `mode`, `calm`, `visualCues`, `touchControls` (`on`, and `saved`: `'1'` forced on, `'0'` forced off, `null` automatic), `audioFx` (wall muffling + Doppler; always `true` in real play), `progress`, `seen`, and (v11.0) `palette`, `showTimer`, `volumes` (master / effects / ambience), `keyBindings`, `medalPar` (this level's medal thresholds) and `music` (the mood playing and its danger). `features()` switches the accessibility / input features (and, for tests only, the audio effects) **without saving** them: with the same `seed()`, the same inputs and the same random numbers, a game plays out **identically** with everything off and everything on.
