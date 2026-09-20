# Echo Maze

A 2D browser game played in **pitch black**. You can't see the maze — you have to *hear* it.

Press **SPACE** to send out a sonar ripple. It expands from your position, bounces off invisible walls, obstacles and monsters, and reveals them for a moment as it echoes back — with a sound for every bounce. But the **echo monsters** are blind: the only way one learns where you are is if your ripple wave hits it — or if it touches you.

No build step, no dependencies, no audio files. Open `index.html` in a browser (or serve the folder with any static server) and click **Begin**.

## Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` (or arrows) | Move |
| `SPACE` | Send a ripple |
| `P` / `Esc` | Pause |
| `M` | Mute |
| `C` | Toggle calm mode (any screen, any difficulty) |
| `Enter` | Confirm on the Try again / Next level screens |
| `Enter` / `Space` / `Esc` | Skip the intro cutscene (or click **Skip**) |

Headphones recommended: echoes and monsters are stereo-panned.

## What the colours mean

| Colour | Thing |
| --- | --- |
| Blue | Walls |
| Amber | Obstacles (boulders and pillars) |
| Red | Echo monsters |
| Violet | Scent monsters (level 6+) |
| Lime | Smell puddles (level 6+) and your smell trail |
| Green | The way out |

## The intro

**Begin** plays a ~55 second opening (skippable; **Continue** goes straight to your level):

1. **Lore cards** over black: the maze under the old quarry, the eyeless monsters, and the cost of a ripple.
2. **The scene:** an explorer, on their 41st day in the dark, mutters that they've been in here too long and may not survive. They send out a ripple (the game's real sonar, so you see the maze the same way they do), hear something answer, and start to turn — and an echo monster leaps out of a side passage. Cut to black, then their dropped sonar device clatters to the floor and pings once, lighting up an empty corridor.
3. **"Now it is your turn"** and level 1 starts.

The explorer's voice is synthesised too: formant-shaped buzzing under typewriter subtitles, no audio files. The whole thing lives in [`js/cutscene.js`](js/cutscene.js) and is driven by a single timeline of times at the top of that file.

## How it works

- **Ripples are ray-cast.** Each ripple fires 640 rays through the tile grid (plus circle tests for obstacles, monsters and the exit). The wavefront expands at a fixed speed, lights up what it hits, and a reflected wave travels back along each ray.
- **Echoes arrive on time.** An object at distance `d` returns its echo `2d / speed` seconds after the ripple, so nearer things answer first. Walls tick, obstacles go *tonk*, monsters moan, the exit rings like a bell.
- **Monsters are blind.** Walking, bumping into walls and standing near a monster tell it nothing. A monster only starts hunting when a ray of your ripple actually reaches it (line of sight, within ripple range); it reacts when the wave arrives, and goes to the exact spot you were standing when you sent the ripple. It is not told where you are *now*, so if you have moved on it has no idea where you went. On arrival it stands there and **listens for a few seconds** (see the modes below): if you walk "too close" to it during that window it hears your footsteps (standing still makes no sound) and **locks on**. A monster that has locked on knows exactly where you are and keeps following you — even after the listening time is up — for as long as you stay that close. The moment you get farther away than that it loses you, goes back to wandering (or sleeping) and is deaf again: it can't track you until another ripple hits it. A monster that hears nothing in its listening time gives up and is deaf too, and it is also deaf while it is still walking to a ripple spot. Touching a monster kills you.
- **You can hear them too.** Each monster has a continuous spatial voice (pitch and brightness change with mood), footsteps, and a screech when it starts hunting. A heartbeat kicks in when one is close. Echo monsters growl and click; scent monsters gurgle, sniff and squelch.
- **Scent monsters and puddles (level 6+).** A second, different monster (violet) never stands still: it walks the maze. It **ignores ripples and footsteps** — a ripple lets you *see* it, but it learns nothing from it. It follows **smell** instead. Lime **puddles** lie on the floor (a ripple lights them up and gives a wet *blorp* echo; up close they glimmer). Step in one and you are **smelly for 5 seconds of walking** — the clock only runs while you actually move, so standing still (or pushing into a wall) never wears it off, and standing in the puddle keeps topping it up. While you are smelly and within its smell range, a scent monster locks onto you and follows your live position; it loses you when the smell runs out or you get out of range. You also leave a **smell trail** behind you while smelly, and it **stays for the rest of the level**. A scent monster that **touches a trail** at all follows it to the **other end** (the end farther along the trail from where it touched it), then carries on patrolling. Touching a scent monster kills you, just like an echo monster.
- **Procedural audio.** All sound is synthesised at runtime with the Web Audio API (`AudioContext`) in [`js/audio.js`](js/audio.js) — oscillators, filtered noise and a generated reverb impulse response. The `AudioContext` is only created when you click **Begin**, to satisfy browser autoplay rules.

## Levels

Ten levels, then an optional endless mode. Each level is a bigger, more loop-filled maze with more obstacles and more monsters that are faster and track more accurately — while your ripple range shrinks and its cooldown grows. Level 1 has no monsters so you can learn the ropes. From **level 4** there are always at least **two echo monsters**, in every mode. From **level 6** a **scent monster** (and smell puddles) join them.

Mazes are generated from a seed, so **Try again** gives you the same layout; a new run gets new mazes. The maze for a given seed is the same in every mode — only the monsters change.

## Difficulty modes

Pick one on the title screen. Each mode scales the level curve above (the table shows level 6 as an example):

| | Easy | Normal | Hard | Hardcore |
| --- | --- | --- | --- | --- |
| Monster speed | 85 px/s | 113 | 130 | 135 |
| Monsters | 2 | 3 | 4 | 4 |
| Listens after arriving | 3.5 s | 4.8 s | 6 s | 6.5 s |
| "Too close" (hears footsteps / keeps tracking) | 100 px | 124 px | 148 px | 158 px |
| Ripple range | 595 px | 511 px | 436 px | 422 px |
| Ripple recharge | 0.90 s | 1.09 s | 1.29 s | 1.34 s |
| Echo monsters on level 4 | 2 | 2 | 3 | 3 |
| Scent monsters on level 6 | 1 | 1 | 1 | 1 |
| Smell puddles on level 6 | 2 | 3 | 4 | 4 |
| Scent monster smell range | 240 px | 300 px | 360 px | 380 px |
| Lives | unlimited retries | unlimited retries | unlimited retries | **one life** |

Normal is a hair easier than the game used to be (before modes existed), Hard is clearly tougher, and Hardcore is a touch harder again. In **Easy, Normal and Hard**, being caught shows *Try again*, which puts you back at the start of the level you were on (same maze, monsters reset). In **Hardcore**, being caught ends the run: you are sent straight back to the title screen, there is no Continue and no way to resume, and the next Begin starts over from level 1 on a fresh maze. Your Hardcore **high score** (the furthest level you reached, or "all 10 levels cleared") stays on the title screen — on the Hardcore button and as its own line — and is never lowered by a worse run. Every monster is always slower than you (you walk at 170 px/s), so you can outrun a locked-on monster in any mode.

Progress (best level unlocked) is saved separately for each mode, and your choice of mode is remembered.

## Calm mode

For anyone who finds the game a bit much. It is **purely visual and audio**, so it never changes the difficulty and can be switched on or off at any time — on the title screen, in the pause menu, or with **`C`** — in any mode. When on:

- no red creep around the screen edges when a monster is close, and no red flash or screen shake when you are caught (the *caught* screen has no red glow)
- no heartbeat
- the monster screech, growl, footsteps, the *caught* crash and the intro's lunge are much quieter, and the intro's jump scare has no flash or shake and a dimmer, smaller monster

## Project layout

```
index.html      page + overlay screens (title, pause, caught, level complete, victory)
style.css       styling
js/audio.js     SoundEngine - procedural Web Audio synthesis
js/level.js     level generation + difficulty curve (levelConfig)
js/cutscene.js  the opening cutscene: lore cards + scripted scene (timeline at the top)
js/game.js      input, physics, ripples, monster AI, rendering, game flow
```

Difficulty is tuned in one place: the `MODES` table and `levelConfig()` in [`js/level.js`](js/level.js).

## Debugging

Open the page with `?debug` to expose `window.__echo` (`info()`, `tp(x, y)`, `go(level)`, `step(seconds)`, `intro()`, `freeze(on)`, `csTo(seconds)`, `audio`) for poking at the game from the console.
