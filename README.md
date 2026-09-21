# Echo Maze

A 2D browser game played in **pitch black**. You can't see the maze — you have to *hear* it.

Press **SPACE** to send out a sonar ripple. It expands from your position, bounces off invisible walls, obstacles and monsters, and reveals them for a moment as it echoes back — with a sound for every bounce. But the **echo monsters** are blind: the only way one learns where you are is if your ripple wave hits it — or if it touches you.

No build step, no dependencies, no audio files. Open `index.html` in a browser (or serve the folder with any static server) and click **Begin**.

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
| `Enter` / `Space` / `Esc` | Skip the intro cutscene (or click **Skip**) |

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
| Green | The way out | a **portal**: concentric rings, a slowly rotating arc, a little doorway and a few soft sparkles |

Colour is never the only clue: every thing has its own silhouette and texture (drawn by [`js/art.js`](js/art.js)), and the title screen's legend shows them. See **How things look** below.

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

The explorers' voices are synthesised too: formant-shaped buzzing under typewriter subtitles, no audio files. All seven scenes live in [`js/cutscene.js`](js/cutscene.js), each driven by a single timeline of times at the top of that file. Calm mode softens all of them (no flash or shake, dimmer monsters, quieter sound). Every scene can be rewatched from the replay screen once it has played.

## Replaying levels and cutscenes

Once there is something to replay, a **Levels & cutscenes** button appears under Begin on the title screen (`Esc` goes back).

- **Levels:** every level you have already **cleared on the selected difficulty** can be picked and played again (1 up to the one before your best). Levels you haven't cleared — including the one you're currently up to, which is what **Continue** is for — are dimmed and can't be picked. Each mode has its own list, so switch mode on the title screen to see another mode's levels. Replaying never lowers your saved progress, and it starts straight in the level with no cutscene, like Continue (except that a story scene you have never seen plays first — see below). **Hardcore has no level select**: it is one life from level 1 and can't be resumed, so a level select would just be a way around that.
- **Cutscenes:** the seven story scenes can be rewatched once they have played — or once you are past the point where they play, even if the scene was added after you got there (the ones you haven't reached yet show as locked "???"). They work in every mode, honour calm mode, can be skipped, and drop you back on this screen when they end.
- **A scene you never saw plays first:** **Continue** (and picking a level from the list) normally skips the story scenes, but if the scene that leads into that level has never been shown — for example you cleared level 7 before the mimic scene existed — it plays once before the level, then never again on Continue.

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

## Levels

There are **twelve levels**. Clearing level 12 ends the game with a *You finished the game* screen. Each level is a bigger, more loop-filled maze with more obstacles, while your ripple range shrinks and its cooldown grows (maze sizes run from 7 x 5 cells on level 1 to 18 x 14 on level 12). Level 1 has no monsters so you can learn the ropes. A maze for a given seed is the same in every mode.

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

### Crouching (every level, every mode)

**Hold `SHIFT`** to crouch (not `Ctrl`, which closes the tab in a browser). You move at exactly the same speed, but:

- you make **no footstep sound** — so nothing can hear one;
- you **cannot send a ripple**;
- the top right shows **Crouching**, and your dot shrinks and dims;
- **the instant you start crouching, everything YOUR ripples showed you is wiped** (a Singer's waves are not yours: crouching does not stop them and does not wipe what they lit): waves still travelling, the echoes they hadn't returned yet (their sounds are cancelled and never play), every fading mark on walls, obstacles, monsters, puddles and the sonar decoy, and the exit's glimmer (the mimic's too, or the difference would give it away). **Standing up does not bring any of it back** — only a new ripple shows anything again (that includes the exit's glimmer, which stays hidden until you next send one).

Crouching works in every mode, on every level. (Bumping into a wall still makes its small mark; that is you feeling the wall, not a footstep.)

### The stalker (level 10+)

An **orange** monster, a little slower than an echo monster (**0.95 x** its speed on the same level and mode, and always well under your 170 px/s). It **ignores ripples, echoes and the sonar decoy**: a ripple lets you *see* it (in orange) but it learns nothing from it, and a decoy never calls it. It only ever **hears you**, and only while you are **not crouching**, in two ways, both working at all times (it has no listening window):

- **Footsteps** — while you are moving, from within the mode's "too close" distance (100 / 124 / 148 / 158 px).
- **Presence** — while you are standing, **even completely still**, from within a smaller radius (**60 / 75 / 90 / 100 px** on Easy / Normal / Hard / Hardcore; always smaller than that mode's footstep distance).

A presence hit counts exactly like a footstep: it **walks to the exact spot it heard you**, keeps updating that spot for as long as it keeps hearing you, and **loses you if it hears nothing for 3 seconds** (even if it has not got there yet). When it hears nothing it **patrols to random tiles at a steady pace and never stands still**, so waiting in a corner does not work. **Crouching silences both.** It has its own voice — slow breathing and soft clicks, no growl — its own footsteps and a soft breath-and-click when it hears you. Touching it kills you.

### The Muffler (level 11): the thing you cannot see

A "mini boss" that is **never drawn** (the title legend says so in words: *Muffler: can't be seen, only heard*). It **absorbs ripples**: when a ripple ray reaches it, the ray simply ends there — no echo, no colour, no sound — so it is never lit, and everything behind it (walls, monsters, puddles, the decoy) is in **shadow**. That gap in your echo map is the only tell; nothing else reveals it. It absorbs the Singer's ripples too. It cannot be smelled either: it has no scent, ignores puddles and trails, and leaves none.

You can only **hear** it: a deep, dampened hum with slow, muffled thumps, spatialised like the other monsters and following the same wall-muffling and Doppler rules. It joins the heartbeat and the red screen-edge creep (both still off in calm mode), and has a small Visual-cue glyph (a pale hollow ring with a dash through it).

It **tracks by footsteps, like the stalker but harder**: it ignores ripples, echoes and the sonar decoy; it hears your footsteps from `mufflerFootstepRadius` and hears you **standing** (even still) from the smaller `mufflerPresenceRadius` — both larger than the stalker's — at all times, with no listening window. **Crouching does not fully silence you**: a crouched *move* is heard from a small `mufflerCrouchRadius`; crouched standing is silent. When it hears you it goes to the exact spot, and keeps following while it keeps hearing you; it remembers the last spot for `mufflerMemorySeconds` after losing you (and waits there), then patrols to random tiles, **leaning towards where it last heard you**. Touching it kills (radius 14, like an echo monster). Its speed is `min((70 + 8 x level) x mode speed x 1.05, 160)` px/s — always below your 170.

### The Singer (level 12): the song that marks you

**Magenta.** It roams (at 0.8 x an echo monster's speed) and **sings ripples of its own** through the game's real ripple system: a sung tone from where it stands, and a magenta wave that lights walls, obstacles, monsters and the exit as it reaches them, so you see the maze lit by it. Its waves are blocked by walls and obstacles and swallowed by the Muffler, like any ripple. It is **deaf** to your footsteps, your standing, your ripples and the sonar decoy; it learns about you **only** when one of its waves reaches you — and **crouching does not protect you** from its waves.

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

Every level from 9 has one **sonar decoy** lying somewhere (it glimmers pink when you are near, blips faintly, and shows up pink in a ripple). Walk onto it to pick it up — you can carry **only one**, shown in the top right — and press **`E`** to drop it where you stand. It beeps (faster and higher) for **5 seconds**, then **calls**: every monster within **480 px** of it — an echo monster (whatever it was doing, even asleep or tracking you), a scent monster, or a mimic **even if it hasn't turned yet** — is drawn to it. They pathfind to it and are **trapped there for 5 seconds after they arrive**, deaf to ripples, footsteps and smell, and then go back to normal (echo monsters and disguised mimics stand idle where they are; scent monsters patrol again). It is **one time use**. A trapped monster is still deadly to touch, so get past it, don't bump it. A mimic that is dragged over stays disguised and silent while it walks (only its chime moves).

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
- Every button on every screen is **at least 44 px tall**. In a cutscene, **tapping anywhere** (or **Skip**) skips it, with the same 0.6 s guard.
- The game is played in **landscape**: held upright, a friendly "please turn your device sideways" note covers the screen and a game in progress is paused. On a short landscape screen the menus scroll and keep their main buttons pinned at the bottom.
- The sound still only starts from a real tap on a button (**Begin** and friends). A short **vibration** on being caught (not in calm mode).

## Project layout

```
index.html      page + overlay screens (title, replay, pause, caught, level complete, victory) + the touch layer
style.css       styling (everything for touch is under `body.touch`)
js/audio.js     SoundEngine - procedural Web Audio synthesis (incl. wall muffling and Doppler)
js/level.js     level generation + difficulty curve (levelConfig)
js/art.js       EchoArt - how everything a ripple lights up is drawn (shapes, textures, the exit portal, the mimic's tell)
js/cutscene.js  the seven story cutscenes: lore cards + scripted scenes (timelines at the top)
js/cues.js      Visual cues (accessibility): the glyphs on the ring around you
js/touch.js     on-screen touch controls: the virtual joystick and buttons
js/game.js      input, physics, ripples, monster AI, rendering, game flow
tools/          developer tools, not part of the game and not exported with a version:
                art-sheet.html (every shape large and at true size, the exit beside a mimic in each mode, the morph),
                stage.js (stage a scene in the ?debug hook), identity-test.js (same seed, same game, fingerprint),
                layout-test.js (compare two builds' level generators, where the exit and the mimic stand, puddle counts),
                perf-bench.js (draw cost), update-test-copy.ps1
```

Difficulty is tuned in one place: the `MODES` table and `levelConfig()` in [`js/level.js`](js/level.js).

## Debugging

Open the page with `?debug` to expose `window.__echo` (`info()`, `tp(x, y)`, `go(level)`, `step(seconds)`, `intro()`, `freeze(on)`, `csTo(seconds)`, `ripples()`, `marks()`, `crouch()`, `decoys()`, `dropDecoy()`, `rippleRange()`, `cues()`, `features({ cues, touch, audioFx })`, `seed(n)`, `touch`, `soundBlocked(x0, y0, x1, y1)`, `artClock(t)` (hold the art's animation clock still; `null` lets it run), `zoom(v)` (magnify the picture), `snapCamera(x, y)`, `showMuffler(on)` (draw the Muffler, which is never drawn in normal play, as a dim ring with a dash), `newMonsters()` (the Muffler's and Singer's state), `markBy(singer)` (force a mark), `audio`) for poking at the game from the console. `settings()` reports `campaignLevels` (12), `muffler` and `singer` (this mode's numbers from the MODES table, plus the level's speeds), `mode`, `calm`, `visualCues`, `touchControls` (`on`, and `saved`: `'1'` forced on, `'0'` forced off, `null` automatic), `audioFx` (wall muffling + Doppler; always `true` in real play), `progress` and `seen`. `features()` switches the accessibility / input features (and, for tests only, the audio effects) **without saving** them: with the same `seed()`, the same inputs and the same random numbers, a game plays out **identically** with everything off and everything on.
