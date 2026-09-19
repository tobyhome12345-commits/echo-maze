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
| `Enter` | Confirm on the Try again / Next level screens |

Headphones recommended: echoes and monsters are stereo-panned.

## What the colours mean

| Colour | Thing |
| --- | --- |
| Blue | Walls |
| Amber | Obstacles (boulders and pillars) |
| Red | Echo monsters |
| Green | The way out |

## How it works

- **Ripples are ray-cast.** Each ripple fires 640 rays through the tile grid (plus circle tests for obstacles, monsters and the exit). The wavefront expands at a fixed speed, lights up what it hits, and a reflected wave travels back along each ray.
- **Echoes arrive on time.** An object at distance `d` returns its echo `2d / speed` seconds after the ripple, so nearer things answer first. Walls tick, obstacles go *tonk*, monsters moan, the exit rings like a bell.
- **Monsters are blind.** Walking, bumping into walls and standing near a monster tell it nothing. A monster only starts hunting when a ray of your ripple actually reaches it (line of sight, within ripple range); it reacts when the wave arrives, and goes to the exact spot you were standing when you sent the ripple. It is not told where you are *now*, so if you have moved on it has no idea where you went. On arrival it stands there and **listens for 5 seconds**: if you walk within ~130px of it during that window it hears your footsteps and goes to where you took that step (standing still makes no sound). After the 5 seconds it goes back to wandering — or sleeping — and is deaf again. Touching a monster kills you.
- **You can hear them too.** Each monster has a continuous spatial voice (pitch and brightness change with mood), clicking footsteps, and a screech when it starts hunting. A heartbeat kicks in when one is close.
- **Procedural audio.** All sound is synthesised at runtime with the Web Audio API (`AudioContext`) in [`js/audio.js`](js/audio.js) — oscillators, filtered noise and a generated reverb impulse response. The `AudioContext` is only created when you click **Begin**, to satisfy browser autoplay rules.

## Levels

Ten levels, then an optional endless mode. Each level is a bigger, more loop-filled maze with more obstacles and more monsters that are faster and track more accurately — while your ripple range shrinks and its cooldown grows. Level 1 has no monsters so you can learn the ropes.

Mazes are generated from a seed, so **Try again** gives you the same layout; a new run gets new mazes.

## Project layout

```
index.html      page + overlay screens (title, pause, caught, level complete, victory)
style.css       styling
js/audio.js     SoundEngine - procedural Web Audio synthesis
js/level.js     level generation + difficulty curve (levelConfig)
js/game.js      input, physics, ripples, monster AI, rendering, game flow
```

Difficulty is tuned in one place: `levelConfig()` in [`js/level.js`](js/level.js).

## Debugging

Open the page with `?debug` to expose `window.__echo` (`info()`, `tp(x, y)`, `go(level)`, `step(seconds)`, `audio`) for poking at the game from the console.
