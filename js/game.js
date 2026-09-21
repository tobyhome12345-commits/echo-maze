'use strict';

(() => {
  // ------------------------------------------------------------- constants
  const TAU = Math.PI * 2;
  const PLAYER_R = 9;
  const ENEMY_R = 14;
  const WALK_SPEED = 170;
  const RIPPLE_SPEED = 520; // px/s - both the wave and its echo travel at this speed
  const RAYS = 640;
  const CATCH_DIST = ENEMY_R + PLAYER_R; // circles touching = you die
  const CAMPAIGN_LEVELS = 12; // the game so far: clearing level 12 ends it ("you finished") - more levels may come later
  // Story cutscenes: the one that plays on the way INTO a level (after clearing the one before), and the level each leads to.
  const SCENE_BEFORE_LEVEL = { 6: 'scent', 8: 'mimic', 9: 'decoy', 10: 'stalker', 11: 'muffler', 12: 'singer' };
  const SCENE_LEADS_TO = { intro: 1, scent: 6, mimic: 8, decoy: 9, stalker: 10, muffler: 11, singer: 12 };
  const SAVE_KEY = 'echomaze.best'; // legacy: one best level, from before difficulty modes
  const PROGRESS_KEY = 'echomaze.progress'; // { easy: 3, normal: 5, ... } highest level unlocked per mode
  const MODE_KEY = 'echomaze.mode';
  const CALM_KEY = 'echomaze.calm';
  const SEEN_KEY = 'echomaze.seen'; // { intro: 1, scent: 1 } cutscenes that have played, so they can be replayed
  const VISUALCUES_KEY = 'echomaze.visualcues'; // '1' = the Visual cues accessibility option is on
  const TOUCH_KEY = 'echomaze.touch'; // '1' = touch controls forced on, '0' = forced off, unset = automatic (touch devices)
  // Doppler (audio only): a monster's voice is shifted by how fast it is closing on you or moving away, at most about +/-6%
  const DOPPLER_MAX = 0.06; // fractional pitch shift at the largest closing speed
  const DOPPLER_FULL_SPEED = 180; // px/s of change in distance that gives the full shift (exaggerated so it is audible)
  const DOPPLER_SMOOTH = 0.12; // seconds: the closing speed is smoothed so the pitch glides

  const T_WALL = 1;
  const T_OBSTACLE = 2;
  const T_ENEMY = 3; // echo monster
  const T_EXIT = 4;
  const T_SCENT = 5; // scent monster (violet)
  const T_PUDDLE = 6; // smell puddle (lime) - never blocks a ripple, just shows up in it
  const T_DECOY = 7; // sonar decoy (pink) - lies flat like a puddle, shows up in a ripple but never blocks it
  const T_STALKER = 8; // stalker (orange) - a ripple can show it, but it learns nothing from it
  const T_SINGER = 9; // singer (magenta) - a ripple can show it, but it is deaf to yours. (The muffler has NO type: it absorbs the ray, so nothing is ever lit.)
  // The ripple's hit colours, by type. They are filled in from js/palette.js and refilled whenever the player
  // picks another palette (Settings -> Display); the array itself is never replaced, so everything that reads
  // COLORS[T_...] keeps working, and a palette can never reach anything but the drawing.
  const COLORS = [null, null, null, null, null, null, null, null, null, null];
  const COLOR_ROLE = [null, 'wall', 'obstacle', 'echo', 'exit', 'scent', 'puddle', 'decoy', 'stalker', 'singer'];
  const singerRgb = () => COLORS[T_SINGER]; // the tint of a singer's own ripples (magenta in the default palette)
  EchoPalette.onChange((rgb) => {
    for (let i = 1; i < COLOR_ROLE.length; i++) COLORS[i] = rgb[COLOR_ROLE[i]];
  });
  // core stroke width per type; the rays that find a round thing (obstacle, monster, exit) are a little thinner than they were,
  // because the thing itself is now drawn on top of them (EchoArt) - they still trace its true collision circle
  const LINE_W = [0, 2.4, 2.1, 2.5, 2.3, 2.5, 3, 3, 2.5, 2.5];
  const NRAYTYPES = 10; // ray hit types are 1..5 (wall, obstacle, echo monster, exit, scent monster), 8 (stalker) and 9 (singer); 0 = nothing (also where the muffler ate the ray). 6 and 7 are flat marks (puddle, decoy), never rays
  const ALPHA_LEVELS = 10;
  const SMELL_TRAIL_STEP = 12; // px between recorded trail points
  const TRAIL_TOUCH = 22; // px: how close a scent monster must be to a trail to "touch" it
  const TRAIL_STEP_ON = 14; // px: how close the player must be to a finished trail to step on it (and smell again)
  const TRAIL_TIP_GRACE = 40; // px: the last stretch of the trail you have just finished laying, which does not count until you step off it

  const COS = new Float32Array(RAYS);
  const SIN = new Float32Array(RAYS);
  for (let i = 0; i < RAYS; i++) {
    COS[i] = Math.cos((i / RAYS) * TAU);
    SIN[i] = Math.sin((i / RAYS) * TAU);
  }

  const HINTS = {
    1: 'SPACE sends a ripple. Blue is wall, amber is an obstacle. Follow the green chime.',
    2: 'You are not alone. Red means something alive. Its growl is your only warning.',
    3: 'A monster is blind to you until your ripple touches it. Then it comes for where you were.',
    4: 'Two echo monsters now. Move after every ripple - a monster you hit will hunt the spot you rippled from.',
    5: 'A monster listens for a few seconds after it arrives. If it hears you it follows while you stay close - get away to lose it.',
    6: 'No echo monsters here. A new monster follows SMELL, not sound. Lime puddles make you smelly while you walk, and you leave a trail it will follow for about a minute.',
    7: 'Your own trail can smell you again: step back onto it while it lasts and you are smelly, like a puddle. Give it about ten seconds between touches.',
    8: 'Not every green glow is the way out: something here copies the exit, and turns on you the moment your ripple touches it.',
    9: 'More things follow your smell now, so mind the puddles and your trail. A pink sonar decoy lies somewhere: walk onto it, press E to drop it, and five seconds later it calls every monster nearby and traps them there.',
    10: 'The stalker ignores ripples and decoys. It only listens: your footsteps, and even you standing close. Hold SHIFT to crouch - you make no sound, but you cannot send a ripple.',
    11: 'If your ripple leaves a hole in the echo, something is standing in it. You cannot see it or smell it - only hear it. It listens harder than the stalker, and crouching helps a lot, but it is not a guarantee.',
    12: 'Something sings. Its song lights the maze, and if a wave of it reaches you, you are marked: a countdown ticks, then it leaps to where the song found you. Keep moving.',
  };
  const GENERIC_HINTS = [
    'Ripple, listen, move. Never stay where you rippled.',
    'Echoes arrive later the farther away something is.',
    'Sleepers do nothing until a ripple hits them. Keep your waves away.',
    'A monster only goes where you were. Once you move on, it has no idea where you went.',
    'Listen for growls and clicking steps. That is how you find monsters without waking them.',
    'A monster that has locked onto you loses you the moment you get far enough away. Run.',
    'Smell only wears off while you WALK. Standing still keeps you smelly, so keep moving away.',
    'A scent monster ignores ripples and footsteps. Only smell - and its trails - lead it to you.',
    'Hold SHIFT to crouch: no footsteps, no ripples - and crouching wipes whatever your ripples had shown you.',
  ];

  // ------------------------------------------------------------------- DOM
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const overlays = ['title', 'replay', 'settings', 'pause', 'caught', 'complete', 'victory'];
  // states: title | cutscene | play | paused | caught | complete

  const audio = new SoundEngine();
  // the player's saved volumes, ready for when the AudioContext is created on the first click
  {
    const v = EchoProfile.volumes();
    audio.volume = v.master;
    audio.fxVolume = v.effects;
    audio.ambVolume = v.ambience;
  }
  // The soundtrack (js/music.js). Audio only, on the ambience bus, and it swells on nothing but `danger`.
  const music = EchoMusic.create(audio);
  // Visual sound cues (accessibility, js/cues.js): drawn only, never read back - they cannot affect the game
  const cues = EchoCues.create({ ctx, enabled: () => visualCues, calm: () => calm });

  // ---------------------------------------------------------------- storage
  // Everything is wrapped in try/catch: storage can be blocked or unavailable.
  const store = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        /* storage unavailable */
      }
    },
  };

  function loadProgress() {
    let p = {};
    try {
      p = JSON.parse(store.get(PROGRESS_KEY)) || {};
    } catch (e) {
      p = {};
    }
    // Progress saved before difficulty modes existed belongs to what is now Normal.
    const legacy = parseInt(store.get(SAVE_KEY), 10);
    if (legacy > 1 && !(p.normal > 1)) p.normal = legacy;
    return p;
  }

  function loadSeen() {
    try {
      return JSON.parse(store.get(SEEN_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  // ----------------------------------------------------------------- state
  let mode = MODES[store.get(MODE_KEY)] ? store.get(MODE_KEY) : 'normal'; // easy | normal | hard | hardcore
  let calm = store.get(CALM_KEY) === '1'; // softer visuals + sound, independent of the mode
  let visualCues = store.get(VISUALCUES_KEY) === '1'; // accessibility: draw sounds as glyphs around the player (independent of calm)
  let touchPref = store.get(TOUCH_KEY); // '1' | '0' | null (automatic)
  let touchSeen = false; // a real touch has happened on this page
  let touchOn = false; // touch controls in use (see refreshTouchMode)
  let audioFx = true; // wall muffling + Doppler. Always on; ?debug can switch it off to prove it changes nothing but sound
  let progress = loadProgress();
  let seen = loadSeen();
  let replaying = false; // a cutscene is being rewatched from the replay screen (it returns there, not to a level)
  audio.calm = calm;
  let state = 'title';
  let runSeed = 1;
  let levelNum = 1;
  let level = null;
  let cfg = null;
  let player = null;
  let enemies = [];
  let ripples = [];
  let marks = [];
  let decoys = []; // sonar decoys the player has dropped this level (level 8+)
  let decoyBlipTimer = 0;
  let glimmerOff = false; // crouching wiped the exit's glimmer; it stays gone until your next ripple (see startCrouch)
  let cooldown = 0;
  let artT = 0; // seconds: the clock the art (js/art.js) animates by. Drawing only - it never touches the simulation
  let artHold = null; // ?debug only: hold the art's clock still, for screenshots
  let singerLanded = false; // a singer has just landed within landRadius of you: you are caught (checked with the outcomes of updatePlay)
  let debugShowMuffler = false; // ?debug only: draw the (never otherwise drawn) muffler dimly, for testing
  let levelTime = 0;
  let ripplesUsed = 0;
  let levelDeaths = 0; // times caught on this level since entering it: 0 at the exit wins the Flawless medal
  let showTimer = EchoProfile.getShowTimer(); // Settings -> Display: the level time in the HUD (off by default)
  let beaconTimer = 0;
  let heartTimer = 0;
  let cueBeatTimer = 0; // the heartbeat cue's own timer, for calm mode (which has no heartbeat sound to time it by)
  let danger = 0;
  let beat = 0;
  let flash = 0;
  let shake = 0;
  let camX = 0;
  let camY = 0;
  let bannerTimer = null;
  let debugFrozen = false; // ?debug only: hold the cutscene clock still
  let titleRipples = [];
  let titleTimer = 0;
  let W = 0;
  let H = 0;
  let DPR = 1;
  let viewScale = 1;
  const keys = Object.create(null);

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const down = (...codes) => codes.some((c) => keys[c]);
  /**
   * Is a key for this action held? The keys themselves are the player's own (Settings -> Controls,
   * js/profile.js); the game only ever asks about the ACTION, so rebinding cannot change how anything plays.
   * An action with no key at all simply never fires.
   */
  const act = (action) => down.apply(null, EchoProfile.keysFor(action));

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    viewScale = Math.max(0.55, Math.min(W / 1000, H / 620));
  }

  /** Highest level unlocked in a mode (1 = nothing cleared yet). Each mode keeps its own. */
  function getBest(m = mode) {
    return Math.max(1, parseInt(progress[m], 10) || 1);
  }

  function saveBest(n) {
    if (n <= getBest()) return;
    progress[mode] = n;
    store.set(PROGRESS_KEY, JSON.stringify(progress));
  }

  // ------------------------------------------------------------- geometry
  function isWall(tx, ty) {
    return tx < 0 || ty < 0 || tx >= level.W || ty >= level.H || level.walls[ty * level.W + tx] === 1;
  }

  function tileFree(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < level.W && ty < level.H && !level.blocked[ty * level.W + tx];
  }

  /** Distance from (ox,oy) along unit vector (dx,dy) to the first wall tile, or maxD. */
  function raycastWall(ox, oy, dx, dy, maxD) {
    let tx = Math.floor(ox / TILE);
    let ty = Math.floor(oy / TILE);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
    let tMaxX = dx > 0 ? ((tx + 1) * TILE - ox) / dx : dx < 0 ? (ox - tx * TILE) / -dx : Infinity;
    let tMaxY = dy > 0 ? ((ty + 1) * TILE - oy) / dy : dy < 0 ? (oy - ty * TILE) / -dy : Infinity;
    let t = 0;
    while (t < maxD) {
      if (isWall(tx, ty)) return t;
      if (tMaxX < tMaxY) {
        t = tMaxX;
        tMaxX += tDeltaX;
        tx += stepX;
      } else {
        t = tMaxY;
        tMaxY += tDeltaY;
        ty += stepY;
      }
    }
    return maxD;
  }

  function hasLOS(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d < 1) return true;
    return raycastWall(x0, y0, dx / d, dy / d, d) >= d;
  }

  function rayCircle(ox, oy, dx, dy, cx, cy, r) {
    const mx = ox - cx;
    const my = oy - cy;
    const b = mx * dx + my * dy;
    const c = mx * mx + my * my - r * r;
    if (c > 0 && b > 0) return -1;
    const disc = b * b - c;
    if (disc < 0) return -1;
    const t = -b - Math.sqrt(disc);
    return t < 0 ? 0 : t;
  }

  function circleHitsWall(px, py, r) {
    const tx0 = Math.floor((px - r) / TILE);
    const tx1 = Math.floor((px + r) / TILE);
    const ty0 = Math.floor((py - r) / TILE);
    const ty1 = Math.floor((py + r) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!isWall(tx, ty)) continue;
        const nx = clamp(px, tx * TILE, tx * TILE + TILE);
        const ny = clamp(py, ty * TILE, ty * TILE + TILE);
        const ddx = px - nx;
        const ddy = py - ny;
        if (ddx * ddx + ddy * ddy < r * r) return true;
      }
    }
    return false;
  }

  /** Can a circle of radius r travel the straight line without touching anything? */
  function clearLine(x0, y0, x1, y1, r) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const n = Math.ceil(Math.hypot(dx, dy) / 8);
    for (let i = 1; i <= n; i++) {
      const px = x0 + (dx * i) / n;
      const py = y0 + (dy * i) / n;
      if (circleHitsWall(px, py, r)) return false;
      for (const ob of level.obstacles) {
        if (Math.hypot(px - ob.x, py - ob.y) < r + ob.r) return false;
      }
    }
    return true;
  }

  /**
   * Move a circle by (dx,dy), pushing it out of walls and obstacles.
   * Returns the contact point if it touched something, otherwise null.
   */
  function moveCircle(e, dx, dy) {
    e.x += dx;
    e.y += dy;
    let contact = null;
    for (let iter = 0; iter < 3; iter++) {
      let pushed = false;
      const tx0 = Math.floor((e.x - e.r) / TILE);
      const tx1 = Math.floor((e.x + e.r) / TILE);
      const ty0 = Math.floor((e.y - e.r) / TILE);
      const ty1 = Math.floor((e.y + e.r) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!isWall(tx, ty)) continue;
          const nx = clamp(e.x, tx * TILE, tx * TILE + TILE);
          const ny = clamp(e.y, ty * TILE, ty * TILE + TILE);
          const ddx = e.x - nx;
          const ddy = e.y - ny;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 >= e.r * e.r) continue;
          if (d2 < 1e-6) {
            e.x -= dx;
            e.y -= dy;
            return { x: e.x, y: e.y };
          }
          const d = Math.sqrt(d2);
          const pen = e.r - d;
          e.x += (ddx / d) * pen;
          e.y += (ddy / d) * pen;
          pushed = true;
          contact = { x: nx, y: ny };
        }
      }
      for (const ob of level.obstacles) {
        const ddx = e.x - ob.x;
        const ddy = e.y - ob.y;
        const d = Math.hypot(ddx, ddy);
        if (d >= e.r + ob.r || d < 1e-6) continue;
        const pen = e.r + ob.r - d;
        e.x += (ddx / d) * pen;
        e.y += (ddy / d) * pen;
        pushed = true;
        contact = { x: ob.x + (ddx / d) * ob.r, y: ob.y + (ddy / d) * ob.r };
      }
      if (!pushed) break;
    }
    return contact;
  }

  // ----------------------------------------------------------- pathfinding
  function nearestFree(tx, ty) {
    if (tileFree(tx, ty)) return [tx, ty];
    for (let r = 1; r <= 5; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && tileFree(tx + dx, ty + dy)) return [tx + dx, ty + dy];
        }
      }
    }
    return null;
  }

  /** BFS over free tiles. Returns tile-centre waypoints (start tile excluded) or null. */
  function findPath(sx, sy, gx, gy) {
    const { W: lw, H: lh } = level;
    const start = sy * lw + sx;
    const goal = gy * lw + gx;
    if (start === goal) return [];
    const prev = new Int32Array(lw * lh).fill(-1);
    const queue = new Int32Array(lw * lh);
    let head = 0;
    let tail = 0;
    prev[start] = start;
    queue[tail++] = start;
    const dirs = [1, -1, lw, -lw];
    while (head < tail) {
      const c = queue[head++];
      if (c === goal) break;
      const cx = c % lw;
      for (let k = 0; k < 4; k++) {
        const n = c + dirs[k];
        if (n < 0 || n >= lw * lh || prev[n] >= 0 || level.blocked[n]) continue;
        const nx = n % lw;
        if (Math.abs(nx - cx) > 1) continue; // wrapped around a row edge
        prev[n] = c;
        queue[tail++] = n;
      }
    }
    if (prev[goal] < 0) return null;
    const path = [];
    for (let c = goal; c !== start; c = prev[c]) {
      path.push({ x: ((c % lw) + 0.5) * TILE, y: (((c / lw) | 0) + 0.5) * TILE });
    }
    return path.reverse();
  }

  function setPathTo(e, tx, ty) {
    const gx = Math.floor(tx / TILE);
    const gy = Math.floor(ty / TILE);
    const goal = nearestFree(gx, gy);
    if (!goal) return false;
    const path = findPath(Math.floor(e.x / TILE), Math.floor(e.y / TILE), goal[0], goal[1]);
    if (!path) return false;
    if (goal[0] === gx && goal[1] === gy) {
      if (path.length) path[path.length - 1] = { x: tx, y: ty };
      else path.push({ x: tx, y: ty });
    } else if (!path.length) {
      path.push({ x: (goal[0] + 0.5) * TILE, y: (goal[1] + 0.5) * TILE });
    }
    e.path = path;
    e.pi = 0;
    return true;
  }

  function followPath(e, speed, dt) {
    const sx = e.x;
    const sy = e.y;
    let budget = speed * dt;
    let guard = 8;
    while (budget > 0 && e.path && guard-- > 0) {
      const p = e.path;
      for (let j = Math.min(p.length - 1, e.pi + 5); j > e.pi; j--) {
        if (clearLine(e.x, e.y, p[j].x, p[j].y, e.r - 3)) {
          e.pi = j;
          break;
        }
      }
      const tgt = p[e.pi];
      const dx = tgt.x - e.x;
      const dy = tgt.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d <= budget) {
        e.x = tgt.x;
        e.y = tgt.y;
        budget -= d;
        e.pi++;
        if (e.pi >= p.length) e.path = null;
      } else {
        e.x += (dx / d) * budget;
        e.y += (dy / d) * budget;
        budget = 0;
      }
    }
    return Math.hypot(e.x - sx, e.y - sy);
  }

  // ----------------------------------------------------------------- audio
  /** Stereo pan + loudness of a world position as heard by the player. */
  function spatial(x, y, range) {
    const dx = x - player.x;
    const dy = y - player.y;
    const d = Math.hypot(dx, dy);
    return {
      d,
      pan: clamp((dx / (d + 90)) * 1.35, -1, 1),
      g: Math.pow(Math.max(0, 1 - d / range), 1.6),
    };
  }

  // --------------------------------------------------------------- enemies
  /**
   * Three kinds of monster:
   *   'echo'  (red)    blind; learns of you only from a ripple hit or your close footsteps
   *   'scent' (violet) ignores ripples and footsteps; follows SMELL. It never stands still.
   *   'mimic' (green)  passes for the EXIT: the exit's size, its green ripple echo, its glow when you are near
   *                    and its chime. It sits still and silent until the wave of a ripple touches it, and
   *                    then it becomes an ordinary 'echo' monster (see revealMimic). A sonar decoy can still
   *                    drag it around while it is disguised.
   *   'stalker' (orange) ignores ripples, echoes and the sonar decoy entirely (a ripple can SHOW it, it learns nothing).
   *                    It hears you two ways, both only while you are NOT crouching, both at all times: your footsteps
   *                    (while you move, within footstepRadius) and your presence (standing, even still, within the
   *                    smaller presenceRadius). See stalkersListen / updateStalker.
   *   'muffler' (level 11; never drawn) ABSORBS ripples (castRipple: a ray that reaches it just ends - no echo, no colour, no
   *                    sound - so it leaves a hole in the echo map and is never lit) and cannot be smelled (no scent, no
   *                    trail, ignores puddles). Like the stalker it hears you at all times with no listening window, but from
   *                    farther off, and a crouch only quiets you: crouched MOVEMENT is heard from a small radius. It
   *                    remembers the last spot for mufflerMemorySeconds. See mufflersListen / updateMuffler.
   *   'singer' (level 12; magenta) roams and SINGS ripples of its own (castRipple with { singer }); it is deaf to everything
   *                    of yours. A wave of its that reaches you MARKS you: a countdown, then it leaps to the exact spot the
   *                    wave found you at. See updateSinger / singerRippleHits.
   * `state` is idle | hunt (walking to a spot) | search (listening) | track (following you)
   * for an echo monster, patrol | follow (along a smell trail) | track (smelling you) for a scent monster,
   * patrol | hunt (walking to the exact spot it last heard you) for a stalker or a muffler, and
   * patrol | marked (counting down) | leap | recover for a singer.
   * Any monster a sonar decoy has called is `lured` (walking to it) and then `trapped` (held there for
   * DECOY_TRAP_SECONDS) before it goes back to normal (see lureEnemy / updateLured). A stalker, a muffler and a singer are never called.
   */
  function makeEnemy(spec) {
    const kind = spec.kind || 'echo';
    const roamer = kind === 'scent' || kind === 'stalker' || kind === 'muffler' || kind === 'singer'; // these never stand about
    return {
      kind,
      x: spec.x,
      y: spec.y,
      r: kind === 'mimic' ? EXIT_R : ENEMY_R, // a disguised mimic is exactly as big as the exit it copies
      pitch: spec.pitch, // kept so a mimic can get its echo-monster voice when it turns
      sleeper: spec.sleeper,
      state: roamer ? 'patrol' : 'idle',
      path: null,
      pi: 0,
      timer: 0,
      repath: 0,
      pause: kind === 'scent' ? 0.3 + Math.random() : kind === 'stalker' || kind === 'muffler' || kind === 'singer' ? 0 : 1 + Math.random() * 2,
      everHeard: false, // muffler: it has heard you at least once (its patrol leans towards heardX/heardY)
      singCd: kind === 'singer' ? 2 + Math.random() * 2 : 0, // singer: seconds to its next song (the first comes a little after you arrive) - a draw only for a singer, so no other monster's random numbers move
      markX: 0, // singer: the exact spot the wave that marked you found you at (where it will land)
      markY: 0,
      markFrac: 0, // singer: how much of the countdown is left (1 = just marked, 0 = it leaps)
      tickCd: 0, // singer: seconds to the next countdown tick
      leapT: 0, // singer: seconds since it launched
      leapX0: 0,
      leapY0: 0,
      stepDist: 0,
      alertCd: 0,
      heardX: 0, // stalker: the exact spot it last heard you
      heardY: 0,
      deaf: 0, // stalker: seconds since it last heard you
      spotNew: false, // stalker: the spot has changed since it last planned a route
      clickCd: 1 + Math.random() * 2, // stalker: seconds to its next soft click
      aDist: -1, // audio only (Doppler): its distance to the player last frame, and the smoothed rate that distance is changing
      aVr: 0,
      followTrail: null, // scent monster: the trail it is following
      ignoreTrail: null, // scent monster: a trail it just finished; ignored until it walks away from it
      voice: audio.ready && kind !== 'mimic' ? audio.createEnemyVoice(spec.pitch, kind) : null, // a disguised mimic makes no sound of its own
    };
  }

  const isChasing = (e) => e.state === 'hunt' || e.state === 'track' || e.state === 'follow';

  function destroyVoices() {
    for (const e of enemies) {
      audio.destroyEnemyVoice(e.voice);
      e.voice = null;
    }
  }

  /**
   * Is a wall or an obstacle between (x0,y0) and (x1,y1)? Used for AUDIO ONLY (wall muffling) and for dimming the
   * matching visual cue. It is the game's own line-of-sight test (hasLOS, the DDA over the tile grid) plus a
   * check of the round obstacles with rayCircle (the same test the ripples use). Nothing new is cast, and
   * nothing in the game reads the result.
   */
  function soundBlocked(x0, y0, x1, y1) {
    if (!hasLOS(x0, y0, x1, y1)) return true;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d < 1) return false;
    for (const o of level.obstacles) {
      const t = rayCircle(x0, y0, dx / d, dy / d, o.x, o.y, o.r);
      if (t >= 0 && t < d) return true;
    }
    return false;
  }

  /** A sound's loudness (its audio gain, 0..1) as the visual cues show it: a square root, so quiet sounds still read. */
  const cueLoud = (g) => Math.sqrt(clamp(g, 0, 1));

  /**
   * The chime of the exit - and of a mimic, which calls this very same function from where it stands. Within the
   * chime's range (620 px, the same falloff as the sound) it plays the bell AND shows the green chevron, and a
   * wall or obstacle in the way muffles the bell and dims the chevron. Because the exit and the mimic go through
   * exactly this code, the mimic has precisely the same tell as the exit - no more, no less - by ear and by eye.
   */
  function chime(x, y) {
    const sp = spatial(x, y, 620);
    if (sp.g <= 0.015) return;
    const blocked = soundBlocked(x, y, player.x, player.y);
    audio.beacon(sp.pan, sp.g, audioFx && blocked);
    cues.pulse('exit', x, y, cueLoud(sp.g), { muffled: blocked });
  }

  function screech(e) {
    if (e.alertCd > 0) return;
    const sp = spatial(e.x, e.y, 950);
    audio.enemyAlert(sp.pan, sp.g);
    if (sp.g >= 0.01) {
      cues.pulse('echo', e.x, e.y, cueLoud(sp.g), { big: true, key: e, sub: 'alert' });
      cues.caption('[monster screech]');
    }
    e.alertCd = 2;
  }

  /**
   * Your ripple wave hit this monster. It learns exactly where the ripple was
   * sent from (ox,oy) and walks there. It is NOT told where you are now, so if
   * you have moved on it will not know. (It is deaf while it walks.)
   */
  function alertEnemy(e, ox, oy) {
    const wasHunting = e.state === 'hunt';
    if (!setPathTo(e, ox, oy)) return;
    e.state = 'hunt';
    if (!wasHunting) screech(e);
  }

  /**
   * A footstep of yours at (x,y). Only a monster that has just reached the spot
   * a ripple sent it to (state 'search', i.e. for searchTime seconds) is
   * listening, and only within footstepRadius. Standing still makes no sound.
   * Once it hears you it locks on and TRACKS you: it knows where you are and
   * follows for as long as you stay within footstepRadius - even after the
   * listening window is over. See the 'track' branch in updateEnemy.
   */
  function hearFootstep(x, y) {
    for (const e of enemies) {
      if (e.state !== 'search') continue;
      if (Math.hypot(e.x - x, e.y - y) > cfg.footstepRadius) continue;
      e.state = 'track';
      e.repath = 0;
      screech(e);
    }
  }

  function randomNearbyTile(e, radius) {
    const tx = Math.floor(e.x / TILE);
    const ty = Math.floor(e.y / TILE);
    for (let i = 0; i < 8; i++) {
      const nx = tx + Math.round((Math.random() * 2 - 1) * radius);
      const ny = ty + Math.round((Math.random() * 2 - 1) * radius);
      if (tileFree(nx, ny) && (nx !== tx || ny !== ty)) return [nx, ny];
    }
    return null;
  }

  function wander(e, radius, pauseMin) {
    const t = randomNearbyTile(e, radius);
    if (t && setPathTo(e, (t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE)) return;
    e.path = null;
    e.pause = pauseMin;
  }

  function updateEnemy(e, dt) {
    e.alertCd = Math.max(0, e.alertCd - dt);
    if (e.state === 'lured' || e.state === 'trapped') {
      // a sonar decoy has called it: it ignores everything else (ripples, footsteps, smell) until it is released
      enemyAudio(e, updateLured(e, dt), dt);
      return;
    }
    // a disguised mimic just sits there, silent, being an exit
    const moved =
      e.kind === 'stalker' ? updateStalker(e, dt)
      : e.kind === 'muffler' ? updateMuffler(e, dt)
      : e.kind === 'singer' ? updateSinger(e, dt)
      : e.kind === 'scent' ? updateScent(e, dt)
      : e.kind === 'mimic' ? 0
      : updateEcho(e, dt);
    enemyAudio(e, moved, dt);
  }

  // ---------------------------------------------------------------- muffler
  /**
   * The MUFFLER (level 11). It cannot be seen (a ripple that reaches it is swallowed: see castRipple) and cannot be
   * smelled (it has no scent and ignores puddles, smell and trails). It only HEARS you, at all times (no listening
   * window), by straight-line distance through walls like every monster:
   *   - standing up: your footsteps (while you actually move) from mufflerFootstepRadius, and your presence
   *     (standing, even still) from the smaller mufflerPresenceRadius;
   *   - crouching does NOT fully silence you: crouched MOVEMENT is heard from the small mufflerCrouchRadius; crouched
   *     standing is silent.
   * It ignores ripples, echoes and the sonar decoy entirely.
   */
  function mufflersListen(walked) {
    for (const e of enemies) {
      if (e.kind !== 'muffler') continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      const heard = player.crouching
        ? walked && d <= cfg.mufflerCrouchRadius
        : d <= cfg.mufflerPresenceRadius || (walked && d <= cfg.mufflerFootstepRadius);
      if (heard) mufflerHeard(e);
    }
  }

  /** It heard you: it goes to the exact spot you are at right now, and keeps updating it while it keeps hearing you. */
  function mufflerHeard(e) {
    if (e.state !== 'hunt') {
      e.state = 'hunt';
      e.repath = 0; // plan the route at once
      if (e.alertCd <= 0) {
        // a single deep, dull thud as it turns towards you (a cue for it too, and a short caption)
        const sp = spatial(e.x, e.y, 700);
        audio.mufflerAlert(sp.pan, sp.g);
        if (sp.g >= 0.01) {
          cues.pulse('muffler', e.x, e.y, cueLoud(sp.g), { big: true, key: e, sub: 'alert' });
          cues.caption('[a deep thud]');
        }
        e.alertCd = 2;
      }
    }
    e.deaf = 0;
    e.everHeard = true;
    e.heardX = player.x;
    e.heardY = player.y;
    e.spotNew = true;
  }

  /** Muffler AI. Returns the distance it moved this frame. It never has a listening window and never stands about. */
  function updateMuffler(e, dt) {
    const speed = cfg.mufflerSpeed; // one steady pace, patrolling or hunting
    let moved = 0;
    if (e.state === 'hunt') {
      e.deaf += dt; // seconds since it last heard you: it remembers the spot for mufflerMemorySeconds, then gives up
      if (e.deaf >= cfg.mufflerMemorySeconds) {
        e.state = 'patrol';
        e.path = null;
        e.pause = 0;
      } else {
        e.repath -= dt;
        if (e.spotNew && e.repath <= 0) {
          e.repath = 0.15;
          e.spotNew = false;
          setPathTo(e, e.heardX, e.heardY);
        }
        moved = followPath(e, speed, dt); // at the spot it just waits there (until the memory runs out)
      }
    }
    if (e.state === 'patrol') {
      if (e.path) moved = followPath(e, speed, dt);
      else {
        e.pause -= dt;
        if (e.pause <= 0) mufflerPatrol(e);
      }
    }
    return moved;
  }

  /**
   * Patrol to a random tile a good way off - leaning towards the last place it heard you: of a handful of random
   * tiles it usually picks the one nearest that spot (and any of them the rest of the time, so it still wanders).
   */
  function mufflerPatrol(e) {
    const tiles = [];
    for (let i = 0; i < 6; i++) {
      const t = randomNearbyTile(e, 12);
      if (t) tiles.push(t);
    }
    if (e.everHeard && tiles.length > 1 && Math.random() < 0.65) {
      const dh = (t) => Math.hypot((t[0] + 0.5) * TILE - e.heardX, (t[1] + 0.5) * TILE - e.heardY);
      tiles.sort((a, b) => dh(a) - dh(b));
    }
    for (const t of tiles) {
      if (setPathTo(e, (t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE)) {
        e.pause = 0;
        return;
      }
    }
    e.path = null;
    e.pause = 0.25; // nowhere to go from here this frame: try again very shortly
  }

  // ----------------------------------------------------------------- singer
  /**
   * The SINGER (level 12) roams the maze (0.8 x an echo monster's speed) and every singInterval seconds SINGS: a ripple
   * of its own, from where it stands, through the game's real ripple system (magenta; walls and obstacles block it,
   * the muffler swallows it). It is deaf to your footsteps, your standing, your ripples and the sonar decoy; the only
   * thing it learns about you is that one of its waves reached you (singerRippleHits -> markPlayer). Crouching does
   * not stop a wave. Being marked:
   *   1. the exact spot the wave found you at is recorded and a countdown of markSeconds starts (a clear sting, then
   *      ticks that speed up - the same volume in calm mode: it is gameplay information);
   *   2. at zero it LEAPS - a jump over the walls that takes SINGER_LEAP_SECONDS from launch, with a rising whoosh -
   *      and lands exactly on the recorded spot;
   *   3. you are caught if you are within landRadius of the spot when it lands; touching it at any time also kills;
   *   4. it waits SINGER_LAND_WAIT seconds where it landed, then roams and sings again.
   * More waves reaching you while it counts down, leaps or waits are ignored. (It keeps singing during the countdown.)
   */
  function markPlayer(e) {
    if (e.state !== 'patrol') return; // marked / leaping / recovering already: further hits are ignored
    e.state = 'marked';
    e.markX = player.x;
    e.markY = player.y;
    e.timer = cfg.markSeconds;
    e.markFrac = 1;
    e.tickCd = 0.55; // the first tick follows the sting
    audio.markSting(); // not spatial and not softened in calm mode
    cues.caption('[a sting - you are marked]');
    EchoProfile.bump('marked');
  }

  function updateSinger(e, dt) {
    let moved = 0;
    if (e.state === 'leap') {
      e.leapT += dt;
      const u = clamp(e.leapT / SINGER_LEAP_SECONDS, 0, 1);
      if (u >= 1) {
        // it lands EXACTLY on the recorded spot
        e.x = e.markX;
        e.y = e.markY;
        e.path = null;
        e.state = 'recover';
        e.timer = SINGER_LAND_WAIT;
        const sp = spatial(e.x, e.y, 900);
        audio.singerLand(sp.pan, Math.max(sp.g, 0.2));
        if (!calm) shake = Math.max(shake, 8 * Math.max(sp.g, 0.2));
        cues.pulse('singer', e.x, e.y, cueLoud(Math.max(sp.g, 0.3)), { big: true, key: e, sub: 'land' });
        cues.caption('[a heavy landing]');
        if (Math.hypot(player.x - e.markX, player.y - e.markY) <= cfg.landRadius) singerLanded = true; // caught: see the outcomes at the end of updatePlay
      } else {
        const k = u * u * (3 - 2 * u);
        e.x = e.leapX0 + (e.markX - e.leapX0) * k;
        e.y = e.leapY0 + (e.markY - e.leapY0) * k;
      }
      return 0; // (a jump makes no footsteps)
    }
    if (e.state === 'recover') {
      e.timer -= dt;
      if (e.timer <= 0) {
        e.state = 'patrol';
        e.pause = 0;
        e.singCd = Math.min(e.singCd, cfg.singInterval * 0.5); // it starts singing again soon after it has recovered
      }
      return 0;
    }
    // patrol (and the countdown, during which it keeps roaming and singing)
    if (e.path) moved = followPath(e, cfg.singerSpeed, dt);
    else {
      e.pause -= dt;
      if (e.pause <= 0) stalkerPatrol(e); // a random tile a good way off, and on to the next when it gets there
    }
    e.singCd -= dt;
    if (e.singCd <= 0) {
      e.singCd = cfg.singInterval;
      singerSing(e);
    }
    if (e.state === 'marked') {
      e.timer -= dt;
      e.markFrac = clamp(e.timer / cfg.markSeconds, 0, 1);
      e.tickCd -= dt;
      if (e.tickCd <= 0) {
        audio.markTick(1 - e.markFrac); // ticks that speed up (and rise) as the countdown runs out
        e.tickCd = 0.85 - 0.74 * (1 - e.markFrac);
      }
      if (e.timer <= 0) {
        // LAUNCH
        e.state = 'leap';
        e.leapT = 0;
        e.leapX0 = e.x;
        e.leapY0 = e.y;
        e.path = null;
        const sp = spatial(e.x, e.y, 1100);
        audio.singerWhoosh(sp.pan, Math.max(sp.g, 0.35));
        cues.pulse('singer', e.x, e.y, cueLoud(Math.max(sp.g, 0.4)), { big: true, key: e, sub: 'whoosh' });
        cues.caption('[a rising whoosh]');
      }
    }
    return moved;
  }

  /** One song: a magenta ripple from where it stands, and its sung tone from there. */
  function singerSing(e) {
    castRipple(e.x, e.y, cfg.singRange, { singer: e });
    const sp = spatial(e.x, e.y, 1000);
    const blocked = soundBlocked(e.x, e.y, player.x, player.y);
    audio.singerSing(sp.pan, sp.g, audioFx && blocked);
    if (sp.g >= 0.01) {
      cues.pulse('singer', e.x, e.y, cueLoud(sp.g), { big: true, key: e, sub: 'sing', muffled: blocked });
      cues.caption('[a sung tone]');
    }
  }

  /**
   * One of the singer's waves has just passed over where you are? Physically, like touchMonsters: the wavefront must
   * be passing over you now, within its range, and one of its rays must actually REACH you (a wall, an obstacle, a
   * monster - or the muffler - that ends the ray first shields you). Crouching does not matter. The first hit marks you.
   */
  function singerRippleHits(rp, r0, r1) {
    if (state !== 'play' || rp.hitPlayer || r0 >= rp.R) return;
    const dx = player.x - rp.x;
    const dy = player.y - rp.y;
    const d = Math.hypot(dx, dy);
    if (d > rp.R || d - PLAYER_R > r1 || d + PLAYER_R < r0) return;
    const j0 = Math.round((Math.atan2(dy, dx) / TAU) * RAYS);
    const span = Math.ceil(Math.atan(PLAYER_R / Math.max(d, PLAYER_R)) / (TAU / RAYS));
    for (let k = -span; k <= span; k++) {
      const j = (((j0 + k) % RAYS) + RAYS) % RAYS;
      if (rp.dist[j] >= d - 1) {
        rp.hitPlayer = true;
        if (rp.singer && rp.singer !== true) markPlayer(rp.singer);
        return;
      }
    }
  }

  // ---------------------------------------------------------------- stalker
  /**
   * Every stalker that can hear you does, this frame. It hears you in exactly two ways, and only while you are
   * NOT crouching (crouching silences both): your footsteps - while you actually move - from anywhere within
   * footstepRadius, and your presence - while you stand, even completely still - from within the smaller
   * presenceRadius. There is no listening window: it works at all times. Distance is straight-line (sound goes
   * through walls, as it does for every monster). A ripple, an echo or a sonar decoy tells it nothing.
   */
  function stalkersListen(walked) {
    if (player.crouching) return;
    for (const e of enemies) {
      if (e.kind !== 'stalker') continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d <= cfg.presenceRadius || (walked && d <= cfg.footstepRadius)) stalkerHeard(e);
    }
  }

  /** It heard you: it goes to the exact spot you are at right now, and keeps updating it while it keeps hearing you. */
  function stalkerHeard(e) {
    if (e.state !== 'hunt') {
      e.state = 'hunt';
      e.repath = 0; // plan the route at once
      stalkerAlert(e);
    }
    e.deaf = 0;
    e.heardX = player.x;
    e.heardY = player.y;
    e.spotNew = true;
  }

  function stalkerAlert(e) {
    if (e.alertCd > 0) return;
    const sp = spatial(e.x, e.y, 950);
    audio.stalkerAlert(sp.pan, sp.g);
    if (sp.g >= 0.01) {
      cues.pulse('stalker', e.x, e.y, cueLoud(sp.g), { big: true, key: e, sub: 'alert' });
      cues.caption('[sharp breath, clicks]');
    }
    e.alertCd = 2;
  }

  /** Stalker AI. Returns the distance it moved this frame. It never has a listening window and never stands about. */
  function updateStalker(e, dt) {
    const speed = cfg.stalkerSpeed; // one steady pace, patrolling or hunting
    let moved = 0;
    if (e.state === 'hunt') {
      e.deaf += dt;
      if (e.deaf >= STALKER_LOSE_SECONDS) {
        // nothing heard for 3 seconds: it has lost you and goes back to patrolling from wherever it is
        e.state = 'patrol';
        e.path = null;
        e.pause = 0;
      } else {
        e.repath -= dt;
        if (e.spotNew && e.repath <= 0) {
          e.repath = 0.15;
          e.spotNew = false;
          setPathTo(e, e.heardX, e.heardY);
        }
        moved = followPath(e, speed, dt); // at the spot it just waits there (until the 3 seconds are up)
      }
    }
    if (e.state === 'patrol') {
      if (e.path) moved = followPath(e, speed, dt);
      else {
        e.pause -= dt;
        if (e.pause <= 0) stalkerPatrol(e);
      }
    }
    return moved;
  }

  /** Walk to a random tile a good way off, and on to the next one when it gets there: waiting in a corner does not work. */
  function stalkerPatrol(e) {
    for (let i = 0; i < 8; i++) {
      const t = randomNearbyTile(e, 12);
      if (t && setPathTo(e, (t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE)) {
        e.pause = 0;
        return;
      }
    }
    e.path = null;
    e.pause = 0.25; // nowhere to go from here this frame: try again very shortly
  }

  // ------------------------------------------------------------ sonar decoy
  /** A decoy has called this monster: it walks to the decoy by the shortest path. Returns false if it can't get there. */
  function lureEnemy(e, x, y) {
    if (!setPathTo(e, x, y)) return false;
    e.state = 'lured';
    e.followTrail = null;
    e.ignoreTrail = null;
    return true;
  }

  /** Walk to the decoy, then stay trapped there for DECOY_TRAP_SECONDS; then go back to normal. */
  function updateLured(e, dt) {
    let moved = 0;
    if (e.state === 'lured') {
      moved = followPath(e, e.kind === 'scent' ? cfg.scentSpeed : cfg.enemySpeed, dt);
      if (!e.path) {
        e.state = 'trapped';
        e.timer = DECOY_TRAP_SECONDS; // counts from the moment it arrives
      }
    } else {
      e.timer -= dt;
      if (e.timer <= 0) releaseLured(e);
    }
    return moved;
  }

  /** Back to normal: a scent monster patrols again; an echo monster or a still-disguised mimic goes idle where it is. */
  function releaseLured(e) {
    e.path = null;
    if (e.kind === 'scent') {
      e.state = 'patrol';
      e.pause = 0.5;
    } else {
      e.state = 'idle';
      e.pause = 1 + Math.random() * 2;
    }
  }

  /** Echo monster AI. Returns the distance it moved this frame. */
  function updateEcho(e, dt) {
    const speed = cfg.enemySpeed;

    let moved = 0;
    if (e.state === 'hunt') {
      moved = followPath(e, speed, dt);
      if (!e.path) {
        // Reached the spot the sound came from. It does not know where you
        // went, so it stands there and listens for searchTime seconds (see
        // hearFootstep) before giving up.
        e.state = 'search';
        e.timer = cfg.searchTime;
      }
    } else if (e.state === 'search') {
      e.timer -= dt;
      if (e.timer <= 0) {
        e.state = 'idle';
        e.path = null;
        e.pause = 1 + Math.random() * 2;
      }
    } else if (e.state === 'track') {
      if (Math.hypot(player.x - e.x, player.y - e.y) > cfg.footstepRadius) {
        // You got away. It can no longer sense you, and will not again until
        // another ripple hits it.
        e.state = 'idle';
        e.path = null;
        e.pause = 1 + Math.random() * 2;
      } else {
        // Still too close: it knows exactly where you are right now.
        e.repath -= dt;
        if (e.repath <= 0) {
          e.repath = 0.2;
          setPathTo(e, player.x, player.y);
        }
        moved = followPath(e, speed, dt);
      }
    } else if (!e.sleeper) {
      if (e.path) {
        moved = followPath(e, speed * 0.28, dt);
      } else {
        e.pause -= dt;
        if (e.pause <= 0) {
          wander(e, 6, 1.5);
          e.pause = 1.5 + Math.random() * 2.5;
        }
      }
    }

    return moved;
  }

  // --------------------------------------------------- smell + scent monsters
  /** A scent monster has caught wind of you. */
  function scentAlert(e) {
    if (e.alertCd > 0) return;
    const sp = spatial(e.x, e.y, 950);
    audio.scentAlert(sp.pan, sp.g);
    if (sp.g >= 0.01) {
      cues.pulse('scent', e.x, e.y, cueLoud(sp.g), { big: true, key: e, sub: 'alert' });
      cues.caption('[snorting]');
    }
    e.alertCd = 2;
  }

  /** Closest point on a smell trail to (x,y): { d, px, py, along, seg }, `along` = distance from the trail's start. */
  function nearestOnTrail(tr, x, y) {
    let best = { d: Infinity, px: 0, py: 0, along: 0, seg: 0 };
    for (let i = 0; i < tr.pts.length - 1; i++) {
      const a = tr.pts[i];
      const b = tr.pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? clamp(((x - a.x) * dx + (y - a.y) * dy) / l2, 0, 1) : 0;
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const d = Math.hypot(x - px, y - py);
      if (d < best.d) best = { d, px, py, along: tr.cum[i] + Math.sqrt(l2) * t, seg: i };
    }
    return best;
  }

  /**
   * A scent monster that touches a smell trail at all goes to the OTHER end of
   * it - whichever end is farther along the trail from where it touched it.
   */
  function checkTrailTouch(e) {
    for (const tr of level.trails) {
      if (tr.pts.length < 2) continue;
      // Once it has committed to a trail it just walks it. (Re-deciding every frame would
      // flip which end is "farther" at the halfway point and make it pace back and forth.)
      if (tr === e.followTrail) continue;
      const hit = nearestOnTrail(tr, e.x, e.y);
      if (tr === e.ignoreTrail) {
        // it has just walked this trail; do not bounce straight back until it has left it
        if (hit.d > TRAIL_TOUCH + 30) e.ignoreTrail = null;
        continue;
      }
      if (hit.d > TRAIL_TOUCH) continue;
      const toStart = hit.along;
      const toEnd = tr.len - hit.along;
      const path = [];
      if (toStart > toEnd) for (let i = hit.seg; i >= 0; i--) path.push({ x: tr.pts[i].x, y: tr.pts[i].y }); // farther end = the start
      else for (let i = hit.seg + 1; i < tr.pts.length; i++) path.push({ x: tr.pts[i].x, y: tr.pts[i].y }); // farther end = the far tip
      if (!path.length) continue;
      e.state = 'follow';
      e.followTrail = tr;
      e.path = path;
      e.pi = 0;
      scentAlert(e);
      return;
    }
  }

  /** Scent monster AI. Returns the distance it moved this frame. */
  function updateScent(e, dt) {
    const speed = cfg.scentSpeed;
    let moved = 0;

    // 1. Smelling YOU: only while you are smelly, and only within smellRange.
    const smelly = player.smell > 0 && Math.hypot(player.x - e.x, player.y - e.y) <= cfg.smellRange;
    if (smelly) {
      if (e.state !== 'track') {
        e.state = 'track';
        e.repath = 0;
        e.followTrail = null;
        scentAlert(e);
      }
    } else if (e.state === 'track') {
      // Your smell wore off, or you got far enough away. It has lost you.
      e.state = 'patrol';
      e.path = null;
      e.pause = 0.5;
    }

    // 2. Smelling a TRAIL you left earlier (not while it is smelling you directly).
    if (e.state !== 'track') checkTrailTouch(e);

    // 3. Move.
    if (e.state === 'track') {
      e.repath -= dt;
      if (e.repath <= 0) {
        e.repath = 0.25;
        setPathTo(e, player.x, player.y);
      }
      moved = followPath(e, speed, dt);
    } else if (e.state === 'follow') {
      moved = followPath(e, speed, dt);
      if (!e.path) {
        e.ignoreTrail = e.followTrail;
        e.followTrail = null;
        e.state = 'patrol';
        e.pause = 0.8;
      }
    } else if (e.path) {
      moved = followPath(e, speed * 0.55, dt); // patrol: an unhurried walk
    } else {
      e.pause -= dt;
      if (e.pause <= 0) patrol(e);
    }
    return moved;
  }

  /** Walk to somewhere else in the maze. A scent monster never just stands there. */
  function patrol(e) {
    for (let i = 0; i < 8; i++) {
      const t = randomNearbyTile(e, 10);
      if (t && setPathTo(e, (t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE)) {
        e.pause = 0.4 + Math.random();
        return;
      }
    }
    e.path = null;
    e.pause = 0.5;
  }

  /**
   * You step into a puddle: smelly for smellSeconds of walking (stepping in again just tops it up).
   * Stepping back onto a trail you left does the same thing (see touchOwnTrail), a bit more quietly.
   */
  function stepInPuddle(vol = 1) {
    const fresh = player.smell <= 0;
    player.smell = cfg.smellSeconds;
    audio.splash(fresh ? vol : vol * 0.5);
    marks.push({ x: player.x, y: player.y, t: 0, life: 0.9, c: COLORS[T_PUDDLE], r: 26 });
    if (!fresh) return;
    // a new smell trail begins where you stepped in
    const tr = { pts: [{ x: player.x, y: player.y }], cum: [0], len: 0, active: true };
    level.trails.push(tr);
    player.trail = tr;
  }

  /**
   * Stepping onto a smell trail you left earlier (one that is still there) makes you smelly again,
   * exactly as if you had stepped in a puddle (5 seconds of walking smell; if you are already smelly
   * it tops you back up) - at most once every TRAIL_RESMELL_COOLDOWN seconds. Any part of any
   * finished trail counts, including walking straight back along the one you have just laid.
   * The only exceptions: the trail you are still laying, and the last TRAIL_TIP_GRACE px of the
   * trail you have only just finished (you are standing on its tip the moment your smell runs out,
   * so it would restart at once) until you have stepped off it or moved back along it.
   */
  function touchOwnTrail() {
    let touching = false;
    for (const tr of level.trails) {
      if (tr.active || tr.pts.length < 2) continue;
      const hit = nearestOnTrail(tr, player.x, player.y);
      if (hit.d > TRAIL_STEP_ON) {
        if (tr === player.justLeft) player.justLeft = null; // stepped off it: it counts in full from now on
        continue;
      }
      if (tr === player.justLeft && hit.along > tr.len - TRAIL_TIP_GRACE) continue; // still at the tip you just finished
      touching = true;
    }
    if (!touching || player.trailCd > 0) return;
    player.trailCd = TRAIL_RESMELL_COOLDOWN;
    stepInPuddle(0.75);
  }

  /** While smelly and walking: the smell timer runs and the trail grows behind you. */
  function updateSmell(dt, walked) {
    player.trailCd = Math.max(0, player.trailCd - dt);
    const inside = level.puddles.some((p) => Math.hypot(player.x - p.x, player.y - p.y) < p.r);
    if (inside) {
      if (!player.inPuddle) stepInPuddle(); // just stepped in
      else player.smell = cfg.smellSeconds; // still in it: the smell stays topped up
    }
    player.inPuddle = inside;
    if (level.trails.length) touchOwnTrail(); // smelly or not: a trail you left can (re)smell you
    if (player.smell <= 0) return;
    if (!walked) return; // the smell only wears off while you WALK - standing still never runs it out
    player.smell = Math.max(0, player.smell - dt);
    const tr = player.trail;
    if (tr) {
      const last = tr.pts[tr.pts.length - 1];
      const d = Math.hypot(player.x - last.x, player.y - last.y);
      if (d >= SMELL_TRAIL_STEP || player.smell === 0) {
        if (d > 0.5) {
          tr.pts.push({ x: player.x, y: player.y });
          tr.len += d;
          tr.cum.push(tr.len);
        }
      }
      if (player.smell === 0) {
        // your smell has run out: the trail is finished, and now starts to fade (see TRAIL_LIFETIME)
        tr.active = false;
        tr.expireAt = levelTime + TRAIL_LIFETIME;
        player.trail = null;
        player.justLeft = tr; // you are standing on its tip: that stretch cannot re-smell you until you leave it
      }
    }
  }

  /**
   * Footstep clicks / squelches and the continuous voice of one monster - and, for the Visual cues option, the
   * matching glyphs. Everything in here is sound and drawing only: nothing it computes feeds back into the game.
   *   Muffling: every frame, is a wall or an obstacle between this monster and you? If so its voice and its
   *             footsteps are muffled (a low-pass and a slightly lower gain), and the matching cue is dimmed.
   *   Doppler:  its voice is shifted up while it closes on you and down while it moves away (about +/-6% at most).
   */
  function enemyAudio(e, moved, dt = 0) {
    if (e.kind === 'mimic') return; // disguised: no footsteps, no voice - the only sound it makes is the exit's chime
    const scent = e.kind === 'scent';
    const stalker = e.kind === 'stalker';
    const muffler = e.kind === 'muffler';
    const singer = e.kind === 'singer';
    const chasing = isChasing(e);
    const cueKind = stalker ? 'stalker' : scent ? 'scent' : muffler ? 'muffler' : singer ? 'singer' : 'echo';
    const blocked = soundBlocked(e.x, e.y, player.x, player.y);
    const muf = audioFx && blocked; // what the audio does about it (?debug can switch the audio effect off; the cue still follows `blocked`)

    // Doppler: how fast is the distance to you changing? (the monster and you both move; standing still or moving sideways gives 0)
    const dNow = Math.hypot(e.x - player.x, e.y - player.y);
    if (dt > 0) {
      if (e.aDist >= 0) e.aVr += ((dNow - e.aDist) / dt - e.aVr) * (1 - Math.exp(-dt / DOPPLER_SMOOTH));
      e.aDist = dNow;
    }
    const doppler = audioFx ? 1 - DOPPLER_MAX * clamp(e.aVr / DOPPLER_FULL_SPEED, -1, 1) : 1; // closing = up, leaving = down

    e.stepDist += moved;
    const stride = stalker ? (chasing ? 22 : 19) : scent ? (chasing ? 26 : 22) : chasing ? 24 : 18;
    if (!muffler && !singer && e.stepDist >= stride) {
      // (a muffler's "footsteps" are its slow thumps, below; a singer glides - it is only its hum and its song you hear)
      e.stepDist = 0;
      const sp = spatial(e.x, e.y, 540);
      if (stalker) audio.stalkerStep(sp.pan, sp.g, muf);
      else if (scent) audio.scentStep(sp.pan, sp.g, muf);
      else audio.enemyStep(sp.pan, sp.g, muf);
      if (sp.g >= 0.01) cues.pulse(cueKind, e.x, e.y, cueLoud(sp.g), { key: e, sub: 'step', dots: 2, muffled: blocked });
    }

    if (muffler) {
      // slow, dull thumps (with the humming voice below): quicker while it is on your trail, and wall-muffled like every voice
      e.clickCd -= dt;
      if (e.clickCd <= 0) {
        e.clickCd = chasing ? 0.7 : 1.35;
        const sc = spatial(e.x, e.y, 620);
        audio.mufflerThump(sc.pan, sc.g, muf);
        if (sc.g >= 0.01) cues.pulse('muffler', e.x, e.y, cueLoud(sc.g), { key: e, sub: 'thump', muffled: blocked });
      }
    }

    if (stalker) {
      // its own voice: breathing (below) and soft clicks - quicker while it is on your trail - and never a growl
      e.clickCd -= dt;
      if (e.clickCd <= 0) {
        e.clickCd = (chasing ? 0.5 : 1.3) + Math.random() * (chasing ? 0.7 : 1.7);
        const sc = spatial(e.x, e.y, 600);
        audio.stalkerClick(sc.pan, sc.g, muf);
        if (sc.g >= 0.01) cues.pulse('stalker', e.x, e.y, cueLoud(sc.g), { key: e, sub: 'click', dots: 1, muffled: blocked });
      }
    }

    const sp = spatial(e.x, e.y, 720);
    const excited = chasing || e.state === 'marked' || e.state === 'leap'; // hunting you / a singer with you marked
    const mood = excited ? 1 : e.state === 'search' ? 0.65 : e.sleeper ? 0.1 : scent || stalker || singer ? 0.5 : muffler ? 0.4 : 0.35;
    const gain = sp.g * (0.16 + 0.3 * mood);
    if (e.voice) audio.updateEnemyVoice(e.voice, { gain, pan: sp.pan, mood, muffle: muf, doppler });
    // its voice as a sustained cue, while it would be audible (the stalker's breathing: three small dots)
    if (gain >= 0.012) cues.hold(e, cueKind, e.x, e.y, cueLoud(gain / 0.46), blocked, stalker ? 3 : 1);
  }

  // ---------------------------------------------------------------- ripples
  /**
   * How far the player's next ripple reaches, in px from where it is sent. It is a hard limit:
   * nothing beyond it is seen, echoes or alerted by that ripple. The base value comes from the
   * level and difficulty mode (levelConfig().rippleRadius); tools / upgrades will change it here.
   */
  function rippleRange() {
    return cfg.rippleRadius;
  }

  function emitRipple() {
    if (state !== 'play' || cooldown > 0) return;
    if (crouchHeld()) return; // you cannot send a ripple while crouching
    cooldown = cfg.cooldown;
    ripplesUsed++;
    EchoProfile.bump('ripples');
    glimmerOff = false; // a fresh ripple: the exit's glimmer that crouching wiped can show again
    castRipple(player.x, player.y, rippleRange());
    audio.ping();
  }

  // ---------------------------------------------------------------- crouching
  /** Is a crouch key (Shift) held? Same speed as walking; no footsteps, no ripples, and a stalker cannot hear you. */
  const crouchHeld = () => act('crouch') || touch.crouch; // a crouch key (Shift by default), or the touch CROUCH button held

  /**
   * The instant you start crouching, everything your ripples showed you is wiped from the screen and from the
   * air: waves still travelling (and the echoes they have not returned yet, so their sounds never play), every
   * timed mark (walls, obstacles, monsters, puddles, the decoy) and the exit's glimmer. Standing up does not
   * bring any of it back; only a NEW ripple shows anything again. (The glimmer is a proximity effect drawn
   * every frame, so wiping it is a flag - `glimmerOff` - that the next ripple clears.)
   */
  function startCrouch() {
    // Only what YOUR ripples showed is wiped. A singer's waves are not yours: crouching does not stop them, so they keep
    // travelling (and can still mark you), and what they lit stays.
    ripples = ripples.filter((rp) => rp.singer);
    marks = marks.filter((m) => m.singer);
    glimmerOff = true;
    EchoProfile.bump('crouches'); // stats: counted only, never read back by the game
  }

  /** Bring `player.crouching` in line with the key. Called every frame, and straight from the key press so the wipe is instant. */
  function syncCrouch() {
    if (state !== 'play' || !player) return;
    const now = crouchHeld();
    if (now === !!player.crouching) return;
    player.crouching = now;
    if (now) startCrouch();
    updateHud();
  }

  /**
   * Fire a ripple of reach R (px) from (ox,oy) into the current level (also used by the cutscenes).
   * `opts` (optional):
   *   singer      a singer's OWN ripple (the enemy that sang it, or `true` in a cutscene): magenta, silent (its sung tone is
   *               played by the caller), and it lights things up but alerts nothing and is not your sonar (crouching does not
   *               wipe it); the singer itself is not part of its own wave
   *   absorbers   extra invisible absorbers [{x, y, r}] (the muffler scene of the cutscenes); the real muffler is found in `enemies`
   * A MUFFLER absorbs ripples: a ray that reaches one simply ENDS there - no echo, no colour, no sound - so the muffler is
   * never lit and everything behind it is in shadow (the gap in the echo map is the only tell).
   */
  function castRipple(ox, oy, R = cfg.rippleRadius, opts = null) {
    const singerRp = opts && opts.singer ? opts.singer : null;

    // Round things the wave can bounce off (and the absorbers it cannot get past).
    const circles = [];
    level.obstacles.forEach((o) => {
      if (Math.hypot(o.x - ox, o.y - oy) < R + o.r) circles.push({ x: o.x, y: o.y, r: o.r, type: T_OBSTACLE });
    });
    enemies.forEach((e) => {
      if (e === singerRp) return; // a singer's own wave starts inside it: it is not part of it
      // a ripple SEES a scent monster (violet), a stalker (orange) and a singer (magenta) but only an echo monster (red)
      // learns of you from it; a disguised mimic is seen as an EXIT (green, with the exit's bell) until the wave touches
      // it; a muffler is not seen at all - it eats the ray
      if (Math.hypot(e.x - ox, e.y - oy) < R + e.r) {
        if (e.kind === 'muffler') {
          circles.push({ x: e.x, y: e.y, r: e.r, type: 0, absorb: true });
          return;
        }
        const type = e.kind === 'scent' ? T_SCENT : e.kind === 'stalker' ? T_STALKER : e.kind === 'singer' ? T_SINGER : e.kind === 'mimic' ? T_EXIT : T_ENEMY;
        circles.push({ x: e.x, y: e.y, r: e.r, type, enemy: e, mimic: e.kind === 'mimic' }); // (mimic: drawn as the exit until revealMimic sets revealAt)
      }
    });
    if (opts && opts.absorbers) {
      for (const a of opts.absorbers) if (Math.hypot(a.x - ox, a.y - oy) < R + a.r) circles.push({ x: a.x, y: a.y, r: a.r, type: 0, absorb: true });
    }
    const ex = level.exit;
    if (Math.hypot(ex.x - ox, ex.y - oy) < R + ex.r) circles.push({ x: ex.x, y: ex.y, r: ex.r, type: T_EXIT });

    const dist = new Float32Array(RAYS);
    const type = new Uint8Array(RAYS);
    const hitId = new Int16Array(RAYS).fill(-1);
    for (let i = 0; i < RAYS; i++) {
      const dx = COS[i];
      const dy = SIN[i];
      let best = raycastWall(ox, oy, dx, dy, R);
      let bt = best < R ? T_WALL : 0;
      let bid = -1;
      for (let c = 0; c < circles.length; c++) {
        const t = rayCircle(ox, oy, dx, dy, circles[c].x, circles[c].y, circles[c].r);
        if (t >= 0 && t < best) {
          best = t;
          if (circles[c].absorb) {
            bt = 0; // eaten: the ray ends here and nothing is lit
            bid = -1;
          } else {
            bt = circles[c].type;
            bid = c;
          }
        }
      }
      dist[i] = best;
      type[i] = bt;
      hitId[i] = bid;
    }

    // What this wave lit up, one entry per round thing (boulder, monster, exit...): its nearest hit and how many rays
    // hit it. Only the art (drawRipple) reads this; nothing in the game does.
    const objs = [];
    const slot = new Int16Array(circles.length).fill(-1);
    for (let i = 0; i < RAYS; i++) {
      const id = hitId[i];
      if (id < 0) continue;
      if (slot[id] < 0) {
        slot[id] = objs.length;
        objs.push({ c: circles[id], dmin: dist[i], n: 0 });
      }
      const ob = objs[slot[id]];
      ob.n++;
      if (dist[i] < ob.dmin) ob.dmin = dist[i];
    }

    // Turn hits into echo events: one per object, walls grouped by direction+range.
    const echoes = [];
    const wallBins = new Map();
    const objBins = new Map();
    for (let i = 0; i < RAYS; i++) {
      if (!type[i]) continue;
      const d = dist[i];
      let bin;
      if (type[i] === T_WALL) {
        const key = Math.floor((i / RAYS) * 16) * 64 + Math.floor(d / 56);
        bin = wallBins.get(key);
        if (!bin) wallBins.set(key, (bin = { type: T_WALL, n: 0, sd: 0, sx: 0 }));
      } else {
        bin = objBins.get(hitId[i]);
        if (!bin) objBins.set(hitId[i], (bin = { type: type[i], n: 0, sd: 0, sx: 0, enemy: circles[hitId[i]].enemy }));
      }
      bin.n++;
      bin.sd += d;
      bin.sx += COS[i];
    }
    const wallEvents = [...wallBins.values()].sort((a, b) => b.n - a.n).slice(0, 34);
    for (const b of [...wallEvents, ...objBins.values()]) {
      const d = b.sd / b.n;
      echoes.push({
        t: (2 * d) / RIPPLE_SPEED,
        type: b.type,
        d,
        pan: clamp((b.sx / b.n) * 0.9, -1, 1),
        w: b.type === T_WALL ? Math.min(1, 0.3 + b.n / 12) : 1,
        enemy: b.enemy, // which monster this echo is off (so a mimic's echo can turn into a monster's, see revealMimic)
      });
    }
    // Puddles lie flat on the floor, so the wave passes over them (they never block a ripple).
    // Any puddle the wave can see lights up lime when it arrives, and gives a wet "blorp" echo.
    // Sonar decoys (the one lying on the floor and any that have been dropped) are the same, in pink.
    const flats = (level.puddles || []).map((p) => ({ x: p.x, y: p.y, r: p.r, type: T_PUDDLE }));
    if (level.decoy && !level.decoy.taken) flats.push({ x: level.decoy.x, y: level.decoy.y, r: 12, type: T_DECOY });
    for (const dc of decoys) flats.push({ x: dc.x, y: dc.y, r: 12, type: T_DECOY });
    // (Anything behind a muffler is in its shadow, puddles and decoys included.)
    const shadowed = (px, py, d) => {
      for (const c of circles) {
        if (!c.absorb) continue;
        const t = rayCircle(ox, oy, (px - ox) / d, (py - oy) / d, c.x, c.y, c.r);
        if (t >= 0 && t < d) return true;
      }
      return false;
    };
    for (const p of flats) {
      const d = Math.hypot(p.x - ox, p.y - oy);
      if (d > R || !hasLOS(ox, oy, p.x, p.y) || (d > 1 && shadowed(p.x, p.y, d))) continue;
      marks.push({ x: p.x, y: p.y, t: -d / RIPPLE_SPEED, life: 2.8, c: COLORS[p.type], r: p.r + 10, puddle: true, art: p.type === T_DECOY ? 'decoy' : 'puddle', ar: p.r, singer: !!singerRp });
      echoes.push({ t: (2 * d) / RIPPLE_SPEED, type: p.type, d, pan: clamp(((p.x - ox) / (d + 1)) * 0.9, -1, 1), w: 1 });
    }
    echoes.sort((a, b) => a.t - b.t);
    if (singerRp) echoes.length = 0; // a singer's wave makes no echo sounds of its own: its sung tone is played from where it stands

    // The echo monsters this wave's rays hit at the moment it was sent (they are in `echoes`).
    // Whether a monster is really TOUCHED - and so learns of you - is not decided here: it is
    // decided as the wavefront passes over wherever the monster is at that moment (touchMonsters).
    const seen = new Set();
    for (const bin of objBins.keys()) if (circles[bin].type === T_ENEMY) seen.add(circles[bin].enemy);

    ripples.push({ x: ox, y: oy, t: 0, R, dist, type, hitId, circles, objs, echoes, ei: 0, seen, touched: new Set(), life: (2 * R) / RIPPLE_SPEED + 2.6, singer: singerRp, hitPlayer: false });
  }

  /** Can the wave get from (ox,oy) to this monster? A wall, a boulder or another monster in the way stops it. */
  function waveReaches(ox, oy, e) {
    const dx = e.x - ox;
    const dy = e.y - oy;
    const d = Math.hypot(dx, dy);
    if (d < 1) return true;
    const ux = dx / d;
    const uy = dy / d;
    // aim at points across the monster's width: the wave touches it if it gets to any of them
    for (const k of [0, -0.8, 0.8, -0.4, 0.4]) {
      const tx = e.x - uy * k * e.r;
      const ty = e.y + ux * k * e.r;
      const dd = Math.hypot(tx - ox, ty - oy);
      const vx = (tx - ox) / dd;
      const vy = (ty - oy) / dd;
      if (raycastWall(ox, oy, vx, vy, dd) < dd) continue;
      let clear = true;
      for (const o of level.obstacles) {
        const t = rayCircle(ox, oy, vx, vy, o.x, o.y, o.r);
        if (t >= 0 && t < dd) { clear = false; break; }
      }
      if (clear) {
        for (const o of enemies) {
          if (o === e) continue;
          const t = rayCircle(ox, oy, vx, vy, o.x, o.y, o.r);
          if (t >= 0 && t < dd) { clear = false; break; }
        }
        const t = rayCircle(ox, oy, vx, vy, level.exit.x, level.exit.y, level.exit.r); // the exit blocks the wave too
        if (clear && t >= 0 && t < dd) clear = false;
      }
      if (clear) return true;
    }
    return false;
  }

  /**
   * An echo monster learns of you ONLY when the outgoing wave really touches it: its front passes
   * over the monster, where the monster is at that moment (not where it was when you pressed SPACE),
   * within the ripple's reach, with nothing blocking the wave. r0..r1 is how far the front travelled
   * this frame. The monster then goes to where the ripple was sent from. (A monster already tracking
   * you knows better; scent monsters never learn from a ripple.)
   */
  function touchMonsters(rp, r0, r1) {
    if (state !== 'play' || r0 >= rp.R) return; // no monsters to alert, or the outgoing wave has ended
    for (const e of enemies) {
      if ((e.kind !== 'echo' && e.kind !== 'mimic') || rp.touched.has(e)) continue;
      const d = Math.hypot(e.x - rp.x, e.y - rp.y);
      if (d - e.r > r1 || d + e.r < r0) continue; // the front is not passing over it this frame
      if (!waveReaches(rp.x, rp.y, e)) continue;
      rp.touched.add(e);
      if (e.kind === 'mimic') {
        // the wave touched the "exit": it was a mimic all along, and it is an echo monster from now on
        revealMimic(e);
      }
      // a monster a sonar decoy has called, and one already tracking you, ignore the ripple
      if (e.state === 'track' || e.state === 'lured' || e.state === 'trapped') continue;
      if (!rp.seen.has(e)) {
        // it walked into the wave after the ripple was sent, so no echo of it was planned: show and sound it now
        marks.push({ x: e.x, y: e.y, t: 0, life: 1.3, c: COLORS[T_ENEMY], r: 34, art: 'echo', ar: e.r, h: Math.atan2(rp.y - e.y, rp.x - e.x) });
        rp.echoes.push({ t: (2 * d) / RIPPLE_SPEED, type: T_ENEMY, d, pan: clamp(((e.x - rp.x) / (d + 1)) * 0.9, -1, 1), w: 1 });
        rp.echoes.sort((a, b) => a.t - b.t);
      }
      alertEnemy(e, rp.x, rp.y);
    }
  }

  /**
   * A mimic's disguise breaks: a ripple's wave touched it. From now on it is an ordinary echo monster (it
   * never goes back to being an exit). Every ripple still in the air that had bounced off it as an "exit"
   * now shows it as a monster - its rays turn red and the echo that has not arrived yet becomes a monster's
   * moan instead of the exit's bell - so what you see and hear matches what it is.
   */
  function revealMimic(e) {
    e.kind = 'echo';
    e.fromMimic = true; // for the stats only: if this one kills you, it was "the mimic that got you"
    e.r = ENEMY_R;
    e.voice = audio.ready ? audio.createEnemyVoice(e.pitch, 'echo') : null;
    marks.push({ x: e.x, y: e.y, t: 0, life: 1.4, c: COLORS[T_ENEMY], r: 40 });
    const sp = spatial(e.x, e.y, 950);
    audio.mimicReveal(sp.pan, Math.max(sp.g, 0.25));
    cues.pulse('echo', e.x, e.y, cueLoud(Math.max(sp.g, 0.25)), { big: true, key: e, sub: 'alert' }); // the "exit" snarls
    cues.caption('[the exit snarls]');
    for (const rp of ripples) {
      let hit = false;
      // the art: a ripple that bounced off it as an "exit" now melts that into the echo monster (see drawRipple)
      for (const c of rp.circles) if (c.enemy === e && c.revealAt === undefined) c.revealAt = artT;
      for (let j = 0; j < RAYS; j++) {
        const id = rp.hitId[j];
        if (id >= 0 && rp.circles[id].enemy === e) {
          rp.type[j] = T_ENEMY;
          hit = true;
        }
      }
      for (let i = rp.ei; i < rp.echoes.length; i++) if (rp.echoes[i].enemy === e) rp.echoes[i].type = T_ENEMY;
      if (hit) rp.seen.add(e); // its echo is already planned (now as a monster), so it is not "walking into the wave"
    }
  }

  function playEcho(ev, R) {
    const vol = (1 - clamp(ev.d / R, 0, 1) * 0.65) * ev.w;
    switch (ev.type) {
      case T_WALL: audio.echoWall(ev.pan, vol, ev.d); break;
      case T_OBSTACLE: audio.echoObstacle(ev.pan, vol, ev.d); break;
      case T_ENEMY: audio.echoEnemy(ev.pan, vol, ev.d); break;
      case T_EXIT: audio.echoExit(ev.pan, vol); break;
      case T_SCENT: audio.echoScent(ev.pan, vol, ev.d); break;
      case T_PUDDLE: audio.echoPuddle(ev.pan, vol, ev.d); break;
      case T_DECOY: audio.echoDecoy(ev.pan, vol, ev.d); break;
      case T_STALKER: audio.echoStalker(ev.pan, vol, ev.d); break;
      case T_SINGER: audio.echoSinger(ev.pan, vol, ev.d); break;
    }
  }

  function updateRipples(dt) {
    for (const rp of ripples) {
      const before = Math.min(rp.t * RIPPLE_SPEED, rp.R); // where the wavefront was
      rp.t += dt;
      const after = Math.min(rp.t * RIPPLE_SPEED, rp.R);
      if (rp.singer) singerRippleHits(rp, before, after); // a singer's wave alerts no monster; it can only MARK you
      else touchMonsters(rp, before, after);
      while (rp.ei < rp.echoes.length && rp.echoes[rp.ei].t <= rp.t) playEcho(rp.echoes[rp.ei++], rp.R);
    }
    ripples = ripples.filter((rp) => rp.t < rp.life);
    for (const m of marks) m.t += dt;
    marks = marks.filter((m) => m.t < m.life);
  }

  // ------------------------------------------------- sonar decoy (level 8+)
  /** Pick up the decoy lying on the floor by walking onto it (you can only carry one). */
  function collectDecoy() {
    const d = level.decoy;
    if (!d || d.taken || player.hasDecoy) return;
    if (Math.hypot(d.x - player.x, d.y - player.y) > d.r + PLAYER_R + 4) return;
    d.taken = true;
    player.hasDecoy = true;
    audio.decoyPickup();
    updateHud();
    notify('Sonar decoy', 'Press E to drop it. A few seconds later it calls every monster nearby to it - and traps them there.');
  }

  /** E: drop the decoy you are carrying where you stand. */
  function dropDecoy() {
    if (state !== 'play' || !player.hasDecoy) return;
    player.hasDecoy = false;
    decoys.push({ x: player.x, y: player.y, t: 0, phase: 'arming', tick: 0, hum: 0, ring: 0, lured: [] });
    EchoProfile.bump('decoys');
    marks.push({ x: player.x, y: player.y, t: 0, life: 0.9, c: COLORS[T_DECOY], r: 26 });
    audio.decoyDrop();
    cues.pulse('decoy', player.x, player.y, 0.6, {}); // a cue at its drop spot (at your feet: it points the way you were facing)
    updateHud();
  }

  /** The moment a dropped decoy calls: every monster within DECOY_RADIUS is drawn to it, whatever it was doing. */
  function callMonsters(d) {
    d.phase = 'active';
    d.ring = 0;
    d.hum = 1.2;
    for (const e of enemies) {
      if (e.kind === 'stalker' || e.kind === 'muffler' || e.kind === 'singer') continue; // a stalker, a muffler and a singer ignore the decoy: they only listen for you / sing
      if (e.state === 'lured' || e.state === 'trapped') continue;
      if (Math.hypot(e.x - d.x, e.y - d.y) > DECOY_RADIUS) continue;
      if (lureEnemy(e, d.x, d.y)) d.lured.push(e);
    }
    const sp = spatial(d.x, d.y, 1100);
    audio.decoyCall(sp.pan, Math.max(sp.g, 0.3));
    cues.pulse('decoy', d.x, d.y, cueLoud(Math.max(sp.g, 0.3)), { big: true, key: d, sub: 'call' });
    cues.caption('[sonar decoy calls out]');
  }

  function updateDecoys(dt) {
    // the decoy still lying on the floor gives a faint blip when you are near, so it can be found in the dark
    const fd = level.decoy;
    if (fd && !fd.taken) {
      decoyBlipTimer -= dt;
      if (decoyBlipTimer <= 0) {
        decoyBlipTimer = 3.2;
        const sp = spatial(fd.x, fd.y, 300);
        if (sp.g > 0.02) {
          audio.decoyBlip(sp.pan, sp.g);
          cues.pulse('decoy', fd.x, fd.y, cueLoud(sp.g), { key: fd, sub: 'blip' });
        }
      }
    }
    for (let i = decoys.length - 1; i >= 0; i--) {
      const d = decoys[i];
      d.t += dt;
      if (d.phase === 'arming') {
        // a beep that speeds up and rises until it calls (one time use)
        d.tick -= dt;
        if (d.tick <= 0) {
          const f = clamp(d.t / DECOY_ARM_SECONDS, 0, 1);
          d.tick = 0.85 - 0.6 * f;
          const sp = spatial(d.x, d.y, 700);
          audio.decoyTick(sp.pan, Math.max(sp.g, 0.12), f);
          cues.pulse('decoy', d.x, d.y, cueLoud(Math.max(sp.g, 0.12)), { key: d, sub: 'tick' }); // (rate-limited: the beeps speed up past 3 a second)
        }
        if (d.t >= DECOY_ARM_SECONDS) callMonsters(d);
      } else {
        d.ring += dt;
        d.hum -= dt;
        if (d.hum <= 0) {
          d.hum = 1.2;
          const sp = spatial(d.x, d.y, 700);
          audio.decoyTick(sp.pan, Math.max(sp.g, 0.1) * 0.7, 1);
          cues.pulse('decoy', d.x, d.y, cueLoud(Math.max(sp.g, 0.1) * 0.7), { key: d, sub: 'tick' });
        }
        // spent once everything it called has been let go again
        if (d.ring > 1.2 && d.lured.every((e) => e.state !== 'lured' && e.state !== 'trapped')) decoys.splice(i, 1);
      }
    }
  }

  /** A short message in the banner (the level hint uses the same spot). */
  function notify(title, text, ms = 6000) {
    $('banner-title').textContent = title;
    $('banner-text').textContent = text;
    $('banner').classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => $('banner').classList.remove('show'), ms);
  }

  // ----------------------------------------------------------------- update
  function updatePlay(dt) {
    levelTime += dt;
    EchoProfile.bump('playTime', dt); // stats: written out at the end of the level, not every frame
    cooldown = Math.max(0, cooldown - dt);
    player.bumpCd = Math.max(0, player.bumpCd - dt);
    flash = Math.max(0, flash - dt * 2.2);
    shake = Math.max(0, shake - dt * 30);
    beat = Math.max(0, beat - dt * 3.2);

    // --- player movement (crouching is the same speed as walking; it just makes no sound - see syncCrouch)
    syncCrouch();
    const ix = (act('right') ? 1 : 0) - (act('left') ? 1 : 0);
    const iy = (act('down') ? 1 : 0) - (act('up') ? 1 : 0);
    // Where to: a movement key (always full speed, exactly as ever) - or, if none is held, the touch joystick, which
    // is analog: any direction, speed from a crawl to the same 170 px/s. (0,0 unless a finger is pushing the stick.)
    let mvx = 0;
    let mvy = 0;
    if (ix || iy) {
      const len = Math.hypot(ix, iy);
      mvx = ix / len;
      mvy = iy / len;
    } else {
      const s = touch.vec();
      mvx = s.x;
      mvy = s.y;
    }
    let contact = null;
    let walked = false; // did we really move this frame? (pushing into a wall does not count)
    if (mvx || mvy) {
      const px = player.x;
      const py = player.y;
      contact = moveCircle(player, mvx * WALK_SPEED * dt, mvy * WALK_SPEED * dt);
      const step = Math.hypot(player.x - px, player.y - py);
      walked = step > 0.3;
      player.stepDist += step;
      EchoProfile.bump('distance', step);
      if (player.stepDist >= 30) {
        player.stepDist = 0;
        if (!player.crouching) {
          // a crouching player makes no footstep sound, so nothing can hear one
          audio.footstep(1);
          hearFootstep(player.x, player.y);
        }
      }
    }
    if (contact && !player.blocked && player.bumpCd <= 0) {
      player.bumpCd = 0.3;
      audio.bump(1);
      marks.push({ x: contact.x, y: contact.y, t: 0, life: 0.9, c: COLORS[T_WALL] });
    }
    player.blocked = !!contact;
    stalkersListen(walked); // a stalker hears your footsteps and your presence - unless you are crouching
    mufflersListen(walked); // a muffler hears them too, from farther - and even a crouched MOVE from up close
    updateSmell(dt, walked);
    // a finished smell trail lasts about a minute, then it is gone
    for (let i = level.trails.length - 1; i >= 0; i--) {
      const tr = level.trails[i];
      if (!tr.active && levelTime >= tr.expireAt) level.trails.splice(i, 1);
    }

    collectDecoy();
    updateDecoys(dt);

    // --- world
    for (const e of enemies) updateEnemy(e, dt);
    updateRipples(dt);

    // exit beacon - and a mimic chimes exactly the same, from wherever it is (the very same function, so it can
    // never differ from the exit's chime in sound or in its visual cue: range, rhythm, muffling and all)
    beaconTimer -= dt;
    if (beaconTimer <= 0) {
      beaconTimer = 2.4;
      chime(level.exit.x, level.exit.y);
      for (const e of enemies) if (e.kind === 'mimic') chime(e.x, e.y);
    }

    // heartbeat + danger vignette as monsters close in (a disguised mimic gives no warning: it is just an exit)
    let dmin = Infinity;
    for (const e of enemies) {
      if (e.kind === 'mimic') continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y) * (isChasing(e) ? 1 : 1.35);
      if (d < dmin) dmin = d;
    }
    danger = clamp(1 - dmin / 300, 0, 1);
    // The soundtrack swells on exactly this number and nothing else, so it can never tell you anything the
    // heartbeat and the red screen-edge do not already. In calm mode it is handed 0 and stays flat.
    music.setDanger(calm ? 0 : danger);
    if (danger > 0 && !calm) {
      heartTimer -= dt;
      if (heartTimer <= 0) {
        heartTimer = 0.95 - danger * 0.6;
        audio.heartbeat(0.35 + danger * 0.65);
        cues.heartbeat(0.35 + danger * 0.65); // a ring around you, once per beat (never above ~3 a second)
        beat = 1;
      }
    } else if (danger > 0) {
      // calm mode has no heartbeat sound, but the Visual cues option must not be weaker in calm mode: it keeps its ring
      cueBeatTimer -= dt;
      if (cueBeatTimer <= 0) {
        cueBeatTimer = 0.95 - danger * 0.6;
        cues.heartbeat(0.35 + danger * 0.65);
      }
    }
    // marked by a singer: the countdown as a shrinking ring around you (Visual cues; the ticking is the sound). 0 = not marked.
    let markLeft = 0;
    for (const e of enemies) if (e.kind === 'singer' && e.state === 'marked') markLeft = Math.max(markLeft, e.markFrac);
    cues.setMark(markLeft);
    cues.update(dt, player.x, player.y);

    // --- outcomes
    if (singerLanded) {
      singerLanded = false;
      return onCaught('singer'); // a singer has landed on the spot you were marked at, and you are still within landRadius of it
    }
    for (const e of enemies) {
      // (`fromMimic`: a mimic that a ripple turned into an echo monster still counts as the mimic in the stats)
      if (Math.hypot(e.x - player.x, e.y - player.y) < CATCH_DIST) return onCaught(e.fromMimic ? 'mimic' : e.kind);
    }
    if (Math.hypot(level.exit.x - player.x, level.exit.y - player.y) < level.exit.r + 10) onLevelComplete();
  }

  // ----------------------------------------------------------------- render
  const segBuckets = [];
  const retBuckets = [];
  for (let k = 0; k < NRAYTYPES; k++) {
    segBuckets[k] = [];
    for (let a = 0; a < ALPHA_LEVELS; a++) segBuckets[k][a] = [];
    retBuckets[k] = [];
  }
  const texBuckets = []; // the stone texture on lit walls (EchoArt.wallTexture), by brightness
  for (let a = 0; a < ALPHA_LEVELS; a++) texBuckets[a] = [];
  const artOpts = { a: 1, t: 0, h: 0, seed: 0, tell: 'none' }; // reused for every thing the art draws (no garbage per frame)

  /**
   * The art for one round thing a ripple lit up (see EchoArt in js/art.js): drawn at the thing's TRUE collision
   * size, facing the ripple's origin (so it never tells you which way the monster is really heading), and fading
   * like the rays that found it. A disguised mimic is the exit (with the mode's tell), and one that has just been
   * revealed melts from the exit into the echo monster over 0.3 s - and never shows as an exit again.
   */
  function drawLit(rp, ob, a) {
    const c = ob.c;
    const o = artOpts;
    o.a = a;
    o.t = artT;
    o.h = Math.atan2(rp.y - c.y, rp.x - c.x);
    o.seed = EchoArt.seedOf(c.x, c.y);
    o.tell = 'none';
    switch (c.type) {
      case T_OBSTACLE: EchoArt.draw(ctx, EchoArt.obstacleKind(c.x, c.y), c.x, c.y, c.r, o); break;
      case T_ENEMY: EchoArt.draw(ctx, 'echo', c.x, c.y, c.r, o); break;
      case T_SCENT: EchoArt.draw(ctx, 'scent', c.x, c.y, c.r, o); break;
      case T_STALKER: EchoArt.draw(ctx, 'stalker', c.x, c.y, c.r, o); break;
      case T_SINGER: EchoArt.draw(ctx, 'singer', c.x, c.y, c.r, o); break;
      case T_EXIT:
        if (!c.mimic) EchoArt.draw(ctx, 'exit', c.x, c.y, c.r, o);
        else {
          o.tell = MODES[mode].mimicTell; // a mimic melting into the monster starts from the look it was disguised with
          if (c.revealAt === undefined) EchoArt.draw(ctx, 'exit', c.x, c.y, c.r, o);
          else EchoArt.mimicMorph(ctx, c.x, c.y, c.r, (artT - c.revealAt) / EchoArt.MORPH_SECONDS, o);
        }
        break;
    }
  }

  function strokeBucket(b, style, width) {
    if (!b.length) return;
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i < b.length; i += 4) {
      ctx.moveTo(b[i], b[i + 1]);
      ctx.lineTo(b[i + 2], b[i + 3]);
    }
    ctx.stroke();
  }

  function drawRipple(rp) {
    const r = rp.t * RIPPLE_SPEED;
    const { x, y, dist, type, R } = rp;
    const tint = rp.singer ? singerRgb() : null; // a singer's own wave is magenta all through: front, walls, everything it finds
    for (let k = 1; k < NRAYTYPES; k++) {
      retBuckets[k].length = 0;
      for (let a = 0; a < ALPHA_LEVELS; a++) segBuckets[k][a].length = 0;
    }
    for (let a = 0; a < ALPHA_LEVELS; a++) texBuckets[a].length = 0;

    // expanding wavefront - only where the wave has not hit anything yet
    if (r < R) {
      const a = 0.06 + 0.5 * (1 - r / R);
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= RAYS; i++) {
        const j = i % RAYS;
        if (r < dist[j]) {
          const px = x + COS[j] * r;
          const py = y + SIN[j] * r;
          if (pen) ctx.lineTo(px, py);
          else {
            ctx.moveTo(px, py);
            pen = true;
          }
        } else pen = false;
      }
      ctx.strokeStyle = tint ? `rgba(${tint},${a * 0.3})` : `rgba(150,215,255,${a * 0.25})`;
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.strokeStyle = tint ? `rgba(255,190,255,${a})` : `rgba(190,235,255,${a})`;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

    // reveal marks (fading) and the reflected wave travelling back
    const retAlpha = 0.5 * (1 - r / (2 * R));
    for (let j = 0; j < RAYS; j++) {
      const k = type[j];
      if (!k) continue;
      const d = dist[j];
      if (r < d) continue;
      const j2 = (j + 1) % RAYS;
      const connect = type[j2] === k && Math.abs(dist[j2] - d) < 22;
      const age = (r - d) / RIPPLE_SPEED;
      const al = Math.exp(-age / 1.3);
      if (al > 0.03) {
        const px = x + COS[j] * d;
        const py = y + SIN[j] * d;
        const ai = Math.min(ALPHA_LEVELS - 1, Math.floor(al * ALPHA_LEVELS));
        const b = segBuckets[k][ai];
        if (connect) {
          const qx = x + COS[j2] * dist[j2];
          const qy = y + SIN[j2] * dist[j2];
          b.push(px, py, qx, qy);
          if (k === T_WALL) EchoArt.wallTexture(px, py, qx, qy, COS[j], SIN[j], texBuckets[ai]); // stone joints and the odd crack
        } else b.push(px, py, px, py);
      }
      if (r < 2 * d && retAlpha > 0.02) {
        const s = 2 * d - r;
        const s2 = 2 * dist[j2] - r;
        const px = x + COS[j] * s;
        const py = y + SIN[j] * s;
        const b = retBuckets[k];
        if (connect && s2 > 0) b.push(px, py, x + COS[j2] * s2, y + SIN[j2] * s2);
        else b.push(px, py, px, py);
      }
    }
    for (let k = 1; k < NRAYTYPES; k++) {
      for (let a = 0; a < ALPHA_LEVELS; a++) {
        const al = (a + 0.5) / ALPHA_LEVELS;
        strokeBucket(segBuckets[k][a], `rgba(${tint || COLORS[k]},${al * 0.2})`, LINE_W[k] * 3.2);
        strokeBucket(segBuckets[k][a], `rgba(${tint || COLORS[k]},${al})`, LINE_W[k]);
      }
      strokeBucket(retBuckets[k], `rgba(${tint || COLORS[k]},${retAlpha * 0.3})`, 6);
      strokeBucket(retBuckets[k], `rgba(${tint || COLORS[k]},${retAlpha})`, 1.6);
    }
    for (let a = 0; a < ALPHA_LEVELS; a++) strokeBucket(texBuckets[a], `rgba(${tint ? "255,170,255" : EchoArt.CORE.wall},${((a + 0.5) / ALPHA_LEVELS) * 0.6})`, 1.1);

    // the things the wave found, drawn as themselves (the rays above are their true collision outline)
    for (const ob of rp.objs) {
      if (r < ob.dmin) continue;
      const al = Math.exp(-(r - ob.dmin) / RIPPLE_SPEED / 1.3);
      if (al > 0.04) drawLit(rp, ob, al * Math.min(1, 0.4 + ob.n / 10) * (tint ? 0.75 : 1));
    }
  }

  /** Live ripples + bump flashes, in world coordinates (the caller sets the transform). */
  function drawRippleLayer() {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const rp of ripples) drawRipple(rp);

    for (const m of marks) {
      if (m.t < 0) continue; // a reveal still waiting for the wave to reach it
      const a = 1 - m.t / m.life;
      const rad = m.r || 18;
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, rad);
      g.addColorStop(0, `rgba(${m.singer ? singerRgb() : m.c},${a * 0.7})`);
      g.addColorStop(1, `rgba(${m.singer ? singerRgb() : m.c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y, rad, 0, TAU);
      ctx.fill();
      if (m.art) {
        // a puddle, a sonar decoy, or a monster that walked into the wave: drawn as itself, at its true size
        const o = artOpts;
        o.a = a * 0.9;
        o.t = artT;
        o.h = m.h || 0;
        o.seed = EchoArt.seedOf(m.x, m.y);
        o.tell = 'none';
        EchoArt.draw(ctx, m.art, m.x, m.y, m.ar, o);
      } else if (m.puddle) {
        ctx.strokeStyle = `rgba(${m.singer ? singerRgb() : m.c},${a * 0.8})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(m.x, m.y, rad * 0.62, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Smell trails you have left: faint, brighter while one is still being laid, fading out over their last 12 seconds. */
  function drawTrails() {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const tr of level.trails) {
      if (tr.pts.length < 2) continue;
      const pulse = tr.active ? 0.75 + 0.25 * Math.sin(levelTime * 7) : 1;
      const fade = tr.active ? 1 : clamp((tr.expireAt - levelTime) / 12, 0, 1);
      ctx.beginPath();
      ctx.moveTo(tr.pts[0].x, tr.pts[0].y);
      for (let i = 1; i < tr.pts.length; i++) ctx.lineTo(tr.pts[i].x, tr.pts[i].y);
      ctx.strokeStyle = `rgba(${COLORS[T_PUDDLE]},${(tr.active ? 0.22 : 0.1) * pulse * fade})`;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = `rgba(${COLORS[T_PUDDLE]},${(tr.active ? 0.6 : 0.3) * pulse * fade})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawWorld() {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // the exit only glimmers when you are practically on top of it - and a disguised mimic glimmers identically.
    // (Crouching wipes it - for the mimic too, or the difference would give it away - until your next ripple.)
    // The glow is drawn by one function for both; so is the portal art on top of it (EchoArt 'exit'). The ONLY thing
    // that can differ is `tell` (MODES.mimicTell): 'none' on the real exit, and on a mimic in Hard / Hardcore.
    const glimmerExit = (x, y, r, tell) => {
      if (glimmerOff) return;
      const de = Math.hypot(x - player.x, y - player.y);
      if (de >= 130) return;
      const a = (1 - de / 130) * 0.45;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 46);
      g.addColorStop(0, `rgba(${COLORS[T_EXIT]},${a})`);
      g.addColorStop(1, `rgba(${COLORS[T_EXIT]},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 46, 0, TAU);
      ctx.fill();
      const o = artOpts;
      o.a = Math.min(1, (1 - de / 130) * 0.95);
      o.t = artT;
      o.tell = tell;
      EchoArt.draw(ctx, 'exit', x, y, r, o);
    };
    glimmerExit(level.exit.x, level.exit.y, level.exit.r, 'none');
    for (const e of enemies) if (e.kind === 'mimic') glimmerExit(e.x, e.y, e.r, MODES[mode].mimicTell);

    // sonar decoys glimmer pink when you are close: the one lying on the floor, and any you have dropped
    const glimmerDecoy = (x, y, pulse) => {
      const dd = Math.hypot(x - player.x, y - player.y);
      if (dd >= 110) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 30);
      g.addColorStop(0, `rgba(${COLORS[T_DECOY]},${(1 - dd / 110) * 0.55 * pulse})`);
      g.addColorStop(1, `rgba(${COLORS[T_DECOY]},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 30, 0, TAU);
      ctx.fill();
      const o = artOpts;
      o.a = (1 - dd / 110) * 0.9 * pulse;
      o.t = artT;
      o.tell = 'none';
      EchoArt.draw(ctx, 'decoy', x, y, 12, o);
    };
    if (level.decoy && !level.decoy.taken) glimmerDecoy(level.decoy.x, level.decoy.y, 0.7 + 0.3 * Math.sin(levelTime * 5));
    for (const d of decoys) {
      glimmerDecoy(d.x, d.y, d.phase === 'arming' ? 0.6 + 0.4 * Math.sin(d.t * (6 + 10 * (d.t / DECOY_ARM_SECONDS))) : 1);
      if (d.phase === 'active' && d.ring < 0.9) {
        // the call: a pink ring sweeping out to the edge of its reach
        const f = d.ring / 0.9;
        ctx.strokeStyle = `rgba(${COLORS[T_DECOY]},${(1 - f) * 0.5})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(d.x, d.y, DECOY_RADIUS * f, 0, TAU);
        ctx.stroke();
      }
    }

    // a puddle only glimmers when you are practically about to step in it
    for (const p of level.puddles) {
      const dp = Math.hypot(p.x - player.x, p.y - player.y);
      if (dp > 70) continue;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r + 12);
      g.addColorStop(0, `rgba(${COLORS[T_PUDDLE]},${(1 - dp / 70) * 0.5})`);
      g.addColorStop(1, `rgba(${COLORS[T_PUDDLE]},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 12, 0, TAU);
      ctx.fill();
      const o = artOpts;
      o.a = (1 - dp / 70) * 0.9;
      o.t = artT;
      o.tell = 'none';
      o.seed = EchoArt.seedOf(p.x, p.y);
      EchoArt.draw(ctx, 'puddle', p.x, p.y, p.r, o);
    }

    drawTrails();
    drawRippleLayer();
    ctx.globalCompositeOperation = 'lighter';

    // ?debug only (__echo.showMuffler): the muffler is NEVER drawn in normal play - here it is, dimly, for testing
    if (debugShowMuffler) {
      for (const e of enemies) {
        if (e.kind !== 'muffler') continue;
        ctx.strokeStyle = 'rgba(200,215,235,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, TAU);
        ctx.moveTo(e.x - e.r * 1.5, e.y);
        ctx.lineTo(e.x + e.r * 1.5, e.y);
        ctx.stroke();
      }
    }

    // the player: a small pale dot with a faint halo (smaller and dimmer while crouching)
    const low = !!player.crouching;
    const g = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, 30);
    g.addColorStop(0, `rgba(200,235,255,${low ? 0.07 : 0.16})`);
    g.addColorStop(1, 'rgba(200,235,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 30, 0, TAU);
    ctx.fill();
    ctx.fillStyle = low ? 'rgba(200,225,240,0.6)' : 'rgba(235,248,255,0.95)';
    ctx.beginPath();
    ctx.arc(player.x, player.y, low ? 3.2 : 4.5, 0, TAU);
    ctx.fill();
    if (cooldown > 0) {
      const p = 1 - cooldown / cfg.cooldown;
      ctx.strokeStyle = 'rgba(150,215,255,0.32)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 12, -Math.PI / 2, -Math.PI / 2 + TAU * p);
      ctx.stroke();
    }
    if (player.smell > 0) {
      // smelly: a lime halo, and a ring that drains as you walk (it holds still while you stand still)
      const f = player.smell / cfg.smellSeconds;
      const sg = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, 34);
      sg.addColorStop(0, `rgba(${COLORS[T_PUDDLE]},0.22)`);
      sg.addColorStop(1, `rgba(${COLORS[T_PUDDLE]},0)`);
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 34, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(${COLORS[T_PUDDLE]},0.75)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * f);
      ctx.stroke();
    }
    // Visual cues (accessibility): small glyphs on a ring about 45px (on screen) around you, one per audible sound
    if (visualCues) cues.draw(player.x, player.y, 1 / viewScale);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawTitleBackdrop() {
    ctx.globalCompositeOperation = 'lighter';
    for (const r of titleRipples) {
      const rad = r.t * 240 * DPR;
      const a = Math.max(0, 1 - r.t / 6) * 0.35;
      ctx.strokeStyle = `rgba(95,212,255,${a})`;
      ctx.lineWidth = 1.5 * DPR;
      ctx.beginPath();
      ctx.arc(r.x * DPR, r.y * DPR, rad, 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function draw() {
    if (state === 'cutscene') {
      cutscene.draw();
      return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#010206';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (state === 'title') {
      drawTitleBackdrop();
      return;
    }
    if (!level) return;

    const s = viewScale * DPR;
    const sx = (Math.random() - 0.5) * shake * DPR;
    const sy = (Math.random() - 0.5) * shake * DPR;
    ctx.setTransform(s, 0, 0, s, canvas.width / 2 - camX * s + sx, canvas.height / 2 - camY * s + sy);
    drawWorld();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // red creep at the edges when a monster is near, and a flash when caught
    const dv = calm ? 0 : danger * (0.55 + 0.45 * beat); // calm mode: no red creep
    if (dv > 0.01 || flash > 0.01) {
      const cw = canvas.width;
      const ch = canvas.height;
      const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.25, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.6);
      g.addColorStop(0, 'rgba(255,30,60,0)');
      g.addColorStop(1, `rgba(255,30,60,${Math.min(0.5, dv * 0.4 + flash * 0.5)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
    }
  }

  // -------------------------------------------------------------- UI / flow
  function showOverlay(id) {
    overlays.forEach((o) => $(o).classList.toggle('hidden', o !== id));
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function updateHud() {
    $('hud-level').textContent = `Level ${levelNum} · ${MODES[mode].label}`;
    $('hud-ripples').textContent = `Ripples ${ripplesUsed}`;
    $('hud-time').textContent = showTimer ? mmss(levelTime) : '';
    $('hud-item').textContent = player && player.hasDecoy ? (touchOn ? 'Sonar decoy · ITEM' : 'Sonar decoy · E') : '';
    $('hud-crouch').textContent = player && player.crouching ? 'Crouching' : '';
    $('hud-audio').textContent = [calm ? 'Calm' : '', visualCues ? 'Visual cues' : '', audio.muted ? 'Sound off' : ''].filter(Boolean).join(' · ');
  }

  function showBanner(n) {
    const el = $('banner');
    $('banner-title').textContent = `Level ${n}`;
    $('banner-text').textContent = HINTS[n] || GENERIC_HINTS[n % GENERIC_HINTS.length];
    el.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.classList.remove('show'), n === 1 ? 9000 : 4500);
  }

  /** `retrying` = the same level again after being caught, which is what costs you the Flawless medal. */
  function startLevel(n, retrying = false) {
    destroyVoices();
    if (!retrying) levelDeaths = 0;
    levelNum = n;
    // Hardcore keeps a high score even for a run that dies on level 1.
    if (MODES[mode].oneLife && !progress[mode]) {
      progress[mode] = 1;
      store.set(PROGRESS_KEY, JSON.stringify(progress));
    }
    level = generateLevel(n, runSeed, mode);
    cfg = level.cfg;
    player = {
      x: level.start.x,
      y: level.start.y,
      r: PLAYER_R,
      stepDist: 0,
      bumpCd: 0,
      blocked: false,
      smell: 0, // seconds of WALKING left of being smelly (after stepping in a puddle)
      trail: null, // the smell trail being laid right now
      justLeft: null, // the trail you finished laying most recently, until you step off it
      trailCd: 0, // seconds until a trail can make you smelly again (TRAIL_RESMELL_COOLDOWN)
      inPuddle: false,
      hasDecoy: false, // carrying a sonar decoy (level 9+): E drops it
      crouching: false, // Shift held (see syncCrouch): silent, and cannot send a ripple
    };
    enemies = level.enemies.map(makeEnemy);
    decoys = [];
    decoyBlipTimer = 1.5;
    singerLanded = false;
    glimmerOff = false;
    ripples = [];
    marks = [];
    cooldown = 0;
    levelTime = 0;
    ripplesUsed = 0;
    beaconTimer = 1;
    heartTimer = 0;
    cueBeatTimer = 0;
    cues.clear();
    danger = 0;
    beat = 0;
    flash = 0;
    shake = 0;
    camX = player.x;
    camY = player.y;
    state = 'play';
    audio.startAmbient(n);
    music.start(n); // the level's own mood (js/music.js); silent until the AudioContext exists
    showOverlay(null);
    $('hud').classList.remove('hidden');
    updateHud();
    showBanner(n);
  }

  /** Begin a run. A brand-new game plays the intro cutscene first; Continue skips it. */
  function newRun(fromLevel, withIntro) {
    runSeed = (Math.random() * 0x7fffffff) | 0;
    $('title-notice').classList.add('hidden');
    audio.init();
    audio.uiClick();
    if (withIntro) {
      startCutscene();
      return;
    }
    // Continue / a level picked from the list normally goes straight in - but if the story scene that leads
    // into this level has never been shown (for example you got past it before the scene existed), it plays first.
    const scene = SCENE_BEFORE_LEVEL[fromLevel];
    if (scene && !hasSeen(scene)) startCutscene(scene);
    else startLevel(fromLevel);
  }

  // ---------------------------------------------------------------- cutscene
  // The scripted scene lives in js/cutscene.js. It borrows this file's ripple
  // system so the explorer's sonar looks and sounds exactly like yours.
  const cutscene = EchoCutscene.create({
    audio,
    ctx,
    canvas,
    size: () => ({ W, H, DPR, viewScale }),
    setStage(stage) {
      level = stage;
      cfg = stage.cfg;
      player = stage.person;
      enemies = [];
      decoys = [];
      ripples = [];
      marks = [];
      cues.clear();
      danger = 0;
      flash = 0;
      shake = 0;
    },
    castRipple,
    updateRipples,
    drawRippleLayer,
    calm: () => calm,
    visualCues: () => visualCues, // the Visual cues option also adds short [sound captions] to the cutscenes
    finish(kind) {
      if (replaying) {
        // rewatched from the replay screen: go back there, no level starts
        replaying = false;
        toTitle();
        showReplay();
      } else {
        // each scene leads into the level it introduces (see SCENE_LEADS_TO)
        startLevel(SCENE_LEADS_TO[kind] || 1);
      }
    },
  });

  /** kind: 'intro' (before level 1), 'scent' (5 -> 6), 'mimic' (7 -> 8), 'decoy' (8 -> 9) or 'stalker' (9 -> 10). */
  function startCutscene(kind = 'intro') {
    // remember that it has played, so it can be rewatched from the replay screen
    if (!seen[kind]) {
      seen[kind] = 1;
      store.set(SEEN_KEY, JSON.stringify(seen));
    }
    destroyVoices();
    audio.stopAmbient();
    music.stop(); // a cutscene has its own sound; the score never plays over it
    touch.setVisible(false); // no touch controls in a cutscene (a tap anywhere skips it - see below)
    state = 'cutscene';
    showOverlay(null);
    $('hud').classList.add('hidden');
    $('banner').classList.remove('show');
    cutscene.start(kind);
  }

  /** On from a cleared level. Going into level 6, 8, 9 or 10 plays that level's story cutscene first (SCENE_BEFORE_LEVEL). */
  function advanceLevel() {
    audio.uiClick();
    const scene = SCENE_BEFORE_LEVEL[levelNum + 1];
    if (scene) startCutscene(scene);
    else startLevel(levelNum + 1);
  }

  /** `cause` is what killed you ('echo', 'scent', 'mimic', 'stalker', 'muffler', 'singer') - for the stats. */
  function onCaught(cause) {
    if (state !== 'play') return;
    state = 'caught';
    levelDeaths++; // one death on this level means no Flawless medal for it, even if the retry goes perfectly
    EchoProfile.addDeath(mode, cause);
    EchoProfile.flush();
    touch.releaseAll();
    audio.caught();
    audio.stopAmbient();
    music.stop();
    destroyVoices();
    cues.clear();
    flash = calm ? 0 : 1; // calm mode: no red flash or screen shake
    shake = calm ? 0 : 14;
    // a short buzz on a touch device (off in calm mode, like the flash and shake)
    if (touchOn && !calm && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([90, 50, 160]);
      } catch (e) {
        /* vibration is optional */
      }
    }
    setTimeout(() => {
      if (state !== 'caught') return;
      if (MODES[mode].oneLife) {
        // One life: the run is over. Back to the title screen - there is nothing to resume.
        const died = levelNum;
        toTitle();
        const note = $('title-notice');
        note.textContent = `☠ You died on level ${died}. Hardcore gives you one life, so that run is over.`;
        note.classList.remove('hidden');
        return;
      }
      // Every other mode: just try the same level again.
      $('caught').classList.toggle('danger', !calm); // calm mode: no red glow
      showOverlay('caught');
    }, 900);
  }

  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  /**
   * The three medals for the level just cleared, drawn as a row of "what you got, what the next one needs".
   * Par comes from the maze you were actually given (js/profile.js: the shortest start-to-exit path), because
   * every run is a different seed.
   */
  function renderMedals(el, res) {
    el.textContent = '';
    const P = EchoProfile;
    const rows = [
      { kind: 'time', tier: res.earned.time, got: mmss(levelTime), next: res.earned.time === P.GOLD ? '' : `${P.TIER_NAMES[res.earned.time + 1]} at ${mmss(res.pars.time[res.earned.time === P.SILVER ? 'gold' : res.earned.time === P.BRONZE ? 'silver' : 'bronze'])}`, isNew: res.improved.time },
      { kind: 'ripples', tier: res.earned.ripples, got: `${ripplesUsed}`, next: res.earned.ripples === P.GOLD ? '' : `${P.TIER_NAMES[res.earned.ripples + 1]} at ${res.pars.ripples[res.earned.ripples === P.SILVER ? 'gold' : 'silver']}`, isNew: res.improved.ripples },
      { kind: 'flawless', tier: res.record.flawless ? 1 : 0, got: levelDeaths === 0 ? 'no deaths' : `caught ${levelDeaths}×`, next: '', isNew: res.improved.flawless },
    ];
    const names = { time: 'Time', ripples: 'Ripples', flawless: 'Flawless' };
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = `medal-item${r.tier ? '' : ' none'}`;
      row.appendChild(settings.medalPip(r.kind, r.tier));
      const label = document.createElement('span');
      const text = r.kind === 'flawless' ? (r.tier ? `Flawless — ${r.got}` : `Not flawless — ${r.got}`) : `${names[r.kind]} ${r.got} — ${r.tier ? EchoProfile.TIER_NAMES[r.tier] : 'no medal'}`;
      label.append(document.createTextNode(text));
      row.appendChild(label);
      if (r.isNew) {
        const nb = document.createElement('b');
        nb.className = 'new-best';
        nb.textContent = 'New best!';
        row.appendChild(nb);
      } else if (r.next) {
        const nx = document.createElement('small');
        nx.textContent = r.next;
        row.appendChild(nx);
      }
      el.appendChild(row);
    }
  }

  function onLevelComplete() {
    if (state !== 'play') return;
    state = 'complete';
    touch.releaseAll();
    audio.stopAmbient();
    music.stop();
    destroyVoices();
    cues.clear();
    saveBest(levelNum + 1);
    EchoProfile.addClear(mode);
    EchoProfile.flush();
    const res = EchoProfile.recordClear(mode, levelNum, {
      time: levelTime,
      ripples: ripplesUsed,
      flawless: levelDeaths === 0,
      pathTiles: level.pathTiles,
    });
    const stats = `Time ${mmss(levelTime)}  ·  Ripples ${ripplesUsed}`;
    if (levelNum >= CAMPAIGN_LEVELS) {
      // The end of the game so far: there is no level after CAMPAIGN_LEVELS yet.
      $('victory-text').textContent = MODES[mode].oneLife
        ? 'You cleared every level on a single life. The echoes fade behind you… More levels are coming.'
        : `You cleared every level on ${MODES[mode].label}. The echoes fade behind you… More levels are coming.`;
      renderMedals($('victory-medals'), res);
      audio.victory();
      setTimeout(() => state === 'complete' && showOverlay('victory'), 700);
    } else {
      audio.levelComplete();
      $('complete-title').textContent = `Level ${levelNum} cleared`;
      $('complete-stats').textContent = stats;
      renderMedals($('complete-medals'), res);
      setTimeout(() => state === 'complete' && showOverlay('complete'), 700);
    }
  }

  function pause() {
    if (state !== 'play') return;
    state = 'paused';
    touch.releaseAll(); // never carry a held finger across a screen change
    EchoProfile.flush(); // write the stats out now: the page may never come back
    $('pause-mode').textContent = `${MODES[mode].label} · Level ${levelNum}`;
    refreshOptionUi();
    showOverlay('pause');
    audio.suspend();
  }

  function unpause() {
    if (state !== 'paused') return;
    state = 'play';
    showOverlay(null);
    audio.resume();
  }

  function toTitle() {
    destroyVoices();
    audio.stopAmbient();
    audio.resume();
    EchoProfile.flush();
    state = 'title';
    level = null;
    music.start('title'); // the title has a mood of its own (nothing happens until there is an AudioContext)
    cues.clear();
    $('hud').classList.add('hidden');
    $('banner').classList.remove('show');
    refreshTitle();
    showOverlay('title');
  }

  const MODE_INFO = {
    easy: 'Slower monsters, fewer of them, longer ripples, and they lose you sooner. Unlimited retries.',
    normal: 'The intended game, a touch gentler than it used to be. Unlimited retries.',
    hard: 'Faster and more monsters, sharper ears, shorter ripples. Unlimited retries.',
    hardcore: 'A little harder than Hard — and you only get one life. Get caught and you are sent back to the title screen; there is no resuming.',
  };

  /** A best level past the last real level means the game was finished. */
  const isFinished = (n) => n > CAMPAIGN_LEVELS;
  /** Hardcore's high score is the furthest you got. */
  const scoreText = (n) => (isFinished(n) ? 'finished the game' : `level ${n}`);
  const scoreShort = (n) => (isFinished(n) ? 'Finished' : `Lv ${n}`);

  /** Bring the title screen's mode picker, best-level tags and Continue button up to date. */
  function refreshTitle() {
    document.querySelectorAll('.mode').forEach((b) => {
      const m = b.dataset.mode;
      b.classList.toggle('active', m === mode);
      b.setAttribute('aria-checked', m === mode ? 'true' : 'false');
      const best = getBest(m);
      const tag = b.querySelector('small');
      if (MODES[m].oneLife) tag.textContent = progress[m] ? `High score: ${scoreShort(progress[m])}` : '';
      else tag.textContent = isFinished(best) ? 'Finished' : best > 1 ? `Best: Lv ${best}` : '';
    });
    $('mode-desc').textContent = MODE_INFO[mode];
    // Hardcore's high score stays visible even though it can never be resumed.
    const score = $('mode-score');
    const showScore = !!MODES[mode].oneLife && !!progress[mode];
    score.classList.toggle('hidden', !showScore);
    if (showScore) score.textContent = `☠ High score: ${scoreText(progress[mode])}`;
    // Hardcore has no Continue: dying ends the run, so there is nothing to resume.
    const best = getBest();
    const btn = $('btn-continue');
    // ...and nothing to continue once the game has been finished (there is no level after the last)
    btn.classList.toggle('hidden', best <= 1 || !!MODES[mode].oneLife || isFinished(best));
    btn.textContent = `Continue (Level ${best})`;
    document.querySelectorAll('.calm-toggle').forEach((c) => {
      c.checked = calm;
    });
    $('btn-replay').classList.toggle('hidden', !replayAvailable());
    // a small medal line for the mode that is picked (Settings -> Stats & Medals has the whole board)
    const sum = EchoProfile.medalSummary(mode, CAMPAIGN_LEVELS);
    const line = $('title-medals');
    line.classList.toggle('hidden', sum.won === 0);
    if (sum.won) line.textContent = `Medals on ${MODES[mode].label}: ${sum.won} of ${sum.total} · ${sum.gold} gold, ${sum.silver} silver, ${sum.bronze} bronze, ${sum.flawless} flawless`;
  }

  // ---------------------------------------------- replay: levels + cutscenes
  const SCENES = [
    { kind: 'intro', name: 'The Lost Explorer', blurb: 'How it all began.', locked: 'Press Begin to see it for the first time.' },
    { kind: 'scent', name: 'Not Every Monster Listens', blurb: 'What follows the scent.', locked: 'You will see it when you clear level 5.' },
    { kind: 'mimic', name: 'Not Everything That Glows', blurb: 'What waits at the end of the corridor.', locked: 'You will see it when you clear level 7.' },
    { kind: 'decoy', name: 'Somewhere Else To Go', blurb: 'How to buy five seconds.', locked: 'You will see it when you clear level 8.' },
    { kind: 'stalker', name: 'Nothing To Hear', blurb: 'What to do when something listens.', locked: 'You will see it when you clear level 9.' },
    { kind: 'muffler', name: 'Nothing Comes Back', blurb: 'What lives where the echo stops.', locked: 'You will see it when you clear level 10.' },
    { kind: 'singer', name: 'Keep Moving', blurb: 'What to do when the song finds you.', locked: 'You will see it when you clear level 11.' },
  ];

  /** The furthest level unlocked in any mode (the cutscenes are the same in every mode). */
  const furthestReached = () => Math.max(...Object.keys(MODES).map((m) => getBest(m)));

  /**
   * Has this cutscene actually been shown? Saves from before this was tracked count for the two that
   * already existed if they got past them. The newer scenes count only once they have really played.
   * A scene that has NOT been seen plays first the next time you enter the level it leads into
   * (see newRun), so a save that got past that point before the scene existed still gets it.
   */
  function hasSeen(kind) {
    if (seen[kind]) return true;
    const reached = furthestReached();
    if (kind === 'intro') return reached > 1;
    if (kind === 'scent') return reached >= SCENT_FROM_LEVEL;
    return false;
  }

  /**
   * Can this cutscene be watched from the replay screen? Yes once it has been seen - and also once you
   * are past the point where it plays (you have unlocked the level it leads into), even if it was added
   * after you got there and you have not actually seen it.
   */
  function canReplay(kind) {
    return hasSeen(kind) || (kind !== 'intro' && furthestReached() >= SCENE_LEADS_TO[kind]);
  }

  /**
   * How many levels can be replayed in this mode: the ones already cleared (1 .. best-1). The level
   * you are up to is not one of them - that is what Continue is for. Hardcore has none: it is one
   * life from level 1 and cannot be resumed, so a level select would just be a way to resume.
   */
  function clearedLevels() {
    if (MODES[mode].oneLife) return 0;
    return Math.min(getBest() - 1, CAMPAIGN_LEVELS);
  }

  function replayAvailable() {
    return clearedLevels() > 0 || SCENES.some((s) => canReplay(s.kind));
  }

  /** Fill in and show the replay screen for the current mode. */
  function showReplay() {
    const oneLife = !!MODES[mode].oneLife;
    const cleared = clearedLevels();
    $('replay-sub').textContent = `${MODES[mode].label} mode. Change the difficulty on the title screen to see another mode's levels.`;

    const grid = $('level-grid');
    grid.textContent = '';
    grid.classList.toggle('hidden', oneLife);
    if (!oneLife) {
      for (let n = 1; n <= CAMPAIGN_LEVELS; n++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'lvl';
        const num = document.createElement('span');
        num.textContent = n;
        b.appendChild(num);
        // the medals won on this level, in this mode (three little pips: time, ripples, flawless)
        const rec = EchoProfile.medalsFor(mode, n);
        if (rec) {
          const pips = document.createElement('span');
          pips.className = 'pips';
          pips.append(settings.medalPip('time', rec.time), settings.medalPip('ripples', rec.ripples), settings.medalPip('flawless', rec.flawless ? 1 : 0));
          b.appendChild(pips);
        }
        if (n <= cleared) {
          b.setAttribute('aria-label', `Play level ${n} again`);
          b.addEventListener('click', () => playLevel(n));
        } else {
          b.disabled = true;
          b.title = 'Not cleared yet';
          b.setAttribute('aria-label', `Level ${n}, not cleared yet`);
        }
        grid.appendChild(b);
      }
    }
    $('level-note').textContent = oneLife
      ? 'Hardcore always starts on level 1 with one life, so there is no level select here. The cutscenes still work.'
      : cleared
        ? 'Levels you have already cleared on this mode. Pick one to play it again.'
        : 'Clear a level and it will show up here.';

    const list = $('scene-list');
    list.textContent = '';
    for (const s of SCENES) {
      const ok = canReplay(s.kind);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'scene';
      const name = document.createElement('b');
      name.textContent = ok ? s.name : '???';
      const sub = document.createElement('small');
      sub.textContent = ok ? s.blurb : s.locked;
      b.append(name, sub);
      if (ok) b.addEventListener('click', () => playScene(s.kind));
      else b.disabled = true;
      list.appendChild(b);
    }
    showOverlay('replay');
  }

  function openReplay() {
    audio.init(); // a button click, so the browser lets the sound start
    audio.uiClick();
    showReplay();
  }

  function closeReplay() {
    audio.uiClick();
    refreshTitle();
    showOverlay('title');
  }

  /** Play a cleared level again: like Continue, no cutscene first, same mode rules. */
  function playLevel(n) {
    if (state !== 'title' || n < 1 || n > clearedLevels()) return;
    newRun(n);
  }

  /** Rewatch a cutscene that has already played. When it ends (or is skipped) you land back on the replay screen. */
  function playScene(kind) {
    if (state !== 'title' || !canReplay(kind)) return;
    audio.init();
    audio.uiClick();
    replaying = true;
    startCutscene(kind);
  }

  function setMode(m) {
    if (!MODES[m]) return;
    mode = m;
    store.set(MODE_KEY, m);
    refreshTitle();
  }

  /** Calm mode is purely visual + audio, so it can be flipped anywhere, any time, on any mode. */
  function setCalm(on) {
    calm = !!on;
    audio.calm = calm;
    store.set(CALM_KEY, calm ? '1' : '0');
    document.querySelectorAll('.calm-toggle').forEach((c) => {
      c.checked = calm;
    });
    if (state === 'caught' || !$('caught').classList.contains('hidden')) $('caught').classList.toggle('danger', !calm);
    if (level && state !== 'title' && state !== 'cutscene') updateHud();
    refreshOptionUi();
  }

  function toggleMute() {
    audio.setMuted(!audio.muted);
    if (state !== 'title') updateHud();
    refreshOptionUi();
  }

  /**
   * Visual cues: an accessibility option, independent of calm mode and of the difficulty, saved in localStorage.
   * It only draws (js/cues.js) and adds cutscene captions - it never touches the game.
   */
  function setVisualCues(on) {
    visualCues = !!on;
    store.set(VISUALCUES_KEY, visualCues ? '1' : '0');
    if (!visualCues) cues.clear();
    if (level && state !== 'title' && state !== 'cutscene') updateHud();
    refreshOptionUi();
  }

  /**
   * Touch controls are on for touch devices (a coarse pointer, or the first real touch) unless switched off in the
   * pause menu; the same switch turns them on for anyone else. Only the on-screen controls and the touch layout of
   * the menus depend on it (`body.touch`); the game itself does not know.
   */
  function refreshTouchMode() {
    let coarse = false;
    try {
      coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    } catch (e) {
      coarse = false;
    }
    touchOn = touchPref === '1' ? true : touchPref === '0' ? false : coarse || touchSeen;
    document.body.classList.toggle('touch', touchOn);
    if (!touchOn) touch.setVisible(false);
    if (level && state !== 'title' && state !== 'cutscene') updateHud();
    refreshOptionUi();
  }

  function setTouchControls(on) {
    touchPref = on ? '1' : '0';
    store.set(TOUCH_KEY, touchPref);
    refreshTouchMode();
  }

  /** Keep every place that shows an option in step: the checkboxes on the title and pause screens, and the big pause-menu buttons for touch players. */
  function refreshOptionUi() {
    document.querySelectorAll('.calm-toggle').forEach((c) => {
      c.checked = calm;
    });
    document.querySelectorAll('.cues-toggle').forEach((c) => {
      c.checked = visualCues;
    });
    document.querySelectorAll('.touch-toggle').forEach((c) => {
      c.checked = touchOn;
    });
    document.body.classList.toggle('cues-on', visualCues); // the legend of cue shapes on the title screen shows only while it is on
    const set = (id, label, on) => {
      const b = $(id);
      b.textContent = `${label}: ${on ? 'On' : 'Off'}`;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('on', on);
    };
    set('pbtn-mute', 'Sound', !audio.muted);
    set('pbtn-calm', 'Calm mode', calm);
    set('pbtn-cues', 'Visual cues', visualCues);
  }

  // ------------------------------------------------------- settings screen
  /**
   * Settings opens over the title screen or over the pause menu and goes back to whichever it was; the game
   * state does not change while it is up (paused stays paused). Everything it can change is an option - the
   * keys, the volumes, the palette, the timer - so none of it can reach the simulation.
   */
  function setPalette(id) {
    EchoPalette.set(id);
    EchoProfile.setPalette(EchoPalette.id);
    drawLegend(); // the title legend is painted with the real art, so it has to be redrawn in the new colours
  }

  function setShowTimer(on) {
    showTimer = !!on;
    EchoProfile.setShowTimer(showTimer);
    if (!showTimer) $('hud-time').textContent = '';
    if (level && state !== 'title' && state !== 'cutscene') updateHud();
  }

  const settings = EchoSettings.create({
    click: () => audio.uiClick(),
    showOverlay,
    closeSettings(from) {
      if (from === 'pause') {
        showOverlay('pause');
        refreshOptionUi();
        audio.suspend(); // back to the paused game, so the sound sleeps again
      } else {
        refreshTitle();
        showOverlay('title');
      }
    },
    keysChanged() {
      settings.renderHowTo();
      releaseKeys(); // a key held while it was being rebound must never be left stuck down
    },
    setVolume(bus, v) {
      EchoProfile.setVolume(bus, v);
      audio.init(); // dragging a slider is a real gesture, so the sound is allowed to start here
      audio.setBusVolume(bus, v);
    },
    setPalette,
    setShowTimer,
    medalsChanged: () => refreshTitle(),
    mode: () => mode,
    modeIds: () => MODE_ORDER,
    modeLabel: (m) => MODES[m || mode].label,
    campaignLevels: () => CAMPAIGN_LEVELS,
  });

  function openSettings(from) {
    audio.init();
    audio.uiClick();
    if (from === 'pause') audio.resume(); // the audio sliders have to be audible while the game is paused
    if (from === 'title') music.start('title');
    settings.open(from);
  }

  // ----------------------------------------------------------------- input
  const GAME_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

  window.addEventListener('keydown', (e) => {
    // Settings -> Controls is waiting for a key to bind: it takes this one and nothing else sees it
    if (settings.captureKey(e)) {
      e.preventDefault();
      return;
    }
    const a = EchoProfile.actionFor(e.code); // which ACTION this key runs, if any (Settings -> Controls)
    if (GAME_KEYS.includes(e.code) || (state === 'play' && a)) e.preventDefault();
    keys[e.code] = true;
    if (e.repeat) return;

    if (a === 'mute') return toggleMute();
    if (a === 'calm') return setCalm(!calm); // works on every screen, in every mode
    if (a === 'cues') return setVisualCues(!visualCues); // so does Visual cues
    // the settings screen is open over the title or the pause menu: Esc is the way back out
    if (settings.isOpen()) {
      if (e.code === 'Escape') {
        e.preventDefault();
        settings.close();
      }
      return;
    }
    switch (state) {
      case 'play':
        if (a === 'ripple') emitRipple();
        else if (a === 'crouch') syncCrouch(); // wipe the ripple information this instant
        else if (a === 'item') dropDecoy();
        else if (e.code === 'Escape' || a === 'pause') pause();
        break;
      case 'paused':
        if (e.code === 'Escape' || a === 'pause') unpause();
        break;
      case 'title':
        if (!$('replay').classList.contains('hidden')) {
          // the replay screen is open: Esc goes back; Enter just presses the focused button
          if (e.code === 'Escape') closeReplay();
        } else if (e.code === 'Enter') {
          // a focused button (tabbed to) handles its own Enter; otherwise Enter means Begin
          if (document.activeElement && document.activeElement.tagName === 'BUTTON') break;
          e.preventDefault();
          newRun(1, true);
        }
        break;
      case 'cutscene':
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') {
          e.preventDefault();
          cutscene.skip();
        }
        break;
      case 'caught':
        if (e.code === 'Enter' || e.code === 'KeyR') {
          e.preventDefault();
          if (!$('caught').classList.contains('hidden')) retry();
        }
        break;
      case 'complete':
        if (e.code === 'Enter') {
          e.preventDefault();
          if (!$('complete').classList.contains('hidden')) advanceLevel();
        }
        break;
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  function releaseKeys() {
    for (const k in keys) keys[k] = false;
    touch.releaseAll(); // and every finger-held control, so nothing is ever left stuck down
  }

  window.addEventListener('blur', () => {
    releaseKeys();
    pause();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      releaseKeys();
      EchoProfile.flush(); // the page may be closed while it is away: save the stats now
      pause();
      if (state === 'cutscene') audio.suspend();
    } else if (state === 'cutscene') {
      audio.resume();
    }
  });

  window.addEventListener('resize', resize);

  /** Try again: back to the start of the level you were caught on (same maze). */
  function retry() {
    audio.uiClick();
    startLevel(levelNum, true); // a retry, so the death still counts against the Flawless medal
  }

  document.querySelectorAll('.mode').forEach((b) => {
    b.addEventListener('click', () => {
      setMode(b.dataset.mode);
      b.blur();
    });
  });
  document.querySelectorAll('.calm-toggle').forEach((c) => {
    c.addEventListener('change', () => {
      setCalm(c.checked);
      c.blur(); // so SPACE / ENTER never re-toggle it while playing
    });
  });
  document.querySelectorAll('.cues-toggle').forEach((c) => {
    c.addEventListener('change', () => {
      setVisualCues(c.checked);
      c.blur();
    });
  });
  document.querySelectorAll('.touch-toggle').forEach((c) => {
    c.addEventListener('change', () => {
      setTouchControls(c.checked);
      c.blur();
    });
  });
  // big pause-menu buttons, for touch players who have no M, C or V key
  $('pbtn-mute').addEventListener('click', () => toggleMute());
  $('pbtn-calm').addEventListener('click', () => setCalm(!calm));
  $('pbtn-cues').addEventListener('click', () => setVisualCues(!visualCues));

  // ------------------------------------------------------------ touch controls
  // The on-screen controls live in js/touch.js; they call the very same functions the keys do.
  const touch = EchoTouch.create({
    ripple: () => emitRipple(), // = Space (same cooldown)
    item: () => dropDecoy(), // = E
    pause: () => pause(), // = P
    crouchChanged: () => syncCrouch(), // the CROUCH button is Shift: wipe the ripple information the instant it goes down
  });
  // the first real touch turns touch controls on (unless they were switched off in the pause menu)
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'touch' && !touchSeen) {
        touchSeen = true;
        refreshTouchMode();
      }
    },
    true
  );
  try {
    const mq = window.matchMedia && window.matchMedia('(pointer: coarse)');
    if (mq && mq.addEventListener) mq.addEventListener('change', refreshTouchMode);
  } catch (e) {
    /* older browsers: the first touch still turns them on */
  }
  window.addEventListener('orientationchange', resize);
  // in a cutscene, a tap anywhere skips it (skip() itself ignores the first 0.6 s)
  $('cutscene').addEventListener('pointerdown', () => {
    if (touchOn && state === 'cutscene') cutscene.skip();
  });
  // no page scroll, no pinch zoom and no rubber-banding while the touch controls are up
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener(
    'touchmove',
    (e) => {
      if (touchOn && (state === 'play' || state === 'cutscene')) e.preventDefault();
    },
    { passive: false }
  );
  $('btn-caught-title').addEventListener('click', () => {
    audio.uiClick();
    toTitle();
  });
  $('btn-start').addEventListener('click', () => newRun(1, true));
  $('btn-continue').addEventListener('click', () => newRun(getBest()));
  $('btn-replay').addEventListener('click', openReplay);
  $('btn-replay-back').addEventListener('click', closeReplay);
  $('btn-settings').addEventListener('click', () => openSettings('title'));
  $('btn-pause-settings').addEventListener('click', () => openSettings('pause'));
  $('btn-resume').addEventListener('click', () => {
    audio.uiClick();
    unpause();
  });
  $('btn-quit').addEventListener('click', () => {
    audio.uiClick();
    toTitle();
  });
  $('btn-retry').addEventListener('click', retry);
  $('btn-next').addEventListener('click', advanceLevel);
  $('btn-victory-title').addEventListener('click', () => {
    audio.uiClick();
    toTitle();
  });

  // (the volume sliders live in Settings -> Audio now; js/settings.js owns them)

  // -------------------------------------------------------------- main loop
  let last = performance.now();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    artT = artHold === null ? now / 1000 : artHold;

    if (state === 'play') {
      updatePlay(dt);
    } else if (state === 'cutscene') {
      if (!debugFrozen) cutscene.update(dt);
    } else if (state === 'caught' || state === 'complete') {
      flash = Math.max(0, flash - dt * 1.2);
      shake = Math.max(0, shake - dt * 20);
      updateRipples(dt);
    } else if (state === 'title') {
      titleTimer -= dt;
      if (titleTimer <= 0) {
        titleTimer = 1.1 + Math.random() * 1.4;
        titleRipples.push({ x: Math.random() * W, y: Math.random() * H, t: 0 });
      }
      for (const r of titleRipples) r.t += dt;
      titleRipples = titleRipples.filter((r) => r.t < 6);
    }

    if (player && level && state !== 'title' && state !== 'cutscene') {
      const k = Math.min(1, dt * 9);
      camX += (player.x - camX) * k;
      camY += (player.y - camY) * k;
      if (state === 'play') {
        $('hud-ripples').textContent = `Ripples ${ripplesUsed}`;
        if (showTimer) $('hud-time').textContent = mmss(levelTime);
      }
    }

    // touch controls: shown only while playing (and released the moment they are not)
    if (touchOn && state === 'play' && window.innerHeight > window.innerWidth) pause(); // portrait: the "rotate your device" note is up
    touch.setVisible(touchOn && state === 'play');
    if (touchOn && state === 'play') {
      touch.setCooldown(cfg.cooldown > 0 ? 1 - cooldown / cfg.cooldown : 1);
      touch.setItem(!!player.hasDecoy);
    }

    // the soundtrack schedules its next notes (it does nothing at all when it is not running)
    music.update(dt);

    draw();
    requestAnimationFrame(frame);
  }

  /**
   * The title screen's colour legend: each swatch is a little canvas showing the very art that lights up in a
   * ripple (js/art.js), so what you learn on the title is what you will see. (A disguised mimic is not in it.)
   */
  function drawLegend() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * 2;
    document.querySelectorAll('#legend canvas.swatch').forEach((cv) => {
      const w = +cv.dataset.w || cv.width;
      const h = +cv.dataset.h || cv.height;
      cv.dataset.w = w;
      cv.dataset.h = h;
      cv.style.width = `${w * 0.8}px`;
      cv.style.height = `${h * 0.8}px`;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      const g = cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      g.globalCompositeOperation = 'lighter';
      const kind = cv.dataset.art;
      const r = (kind === 'wall' ? 0.4 * w : 0.33 * h) * dpr;
      EchoArt.draw(g, kind, cv.width / 2, cv.height * (kind === 'wall' ? 0.36 : 0.5), r, { t: 0.9, h: -0.6, seed: EchoArt.seedOf(kind.length * 31, 7) });
    });
  }

  resize();
  EchoPalette.set(EchoPalette.id); // paint the saved palette into the art, the cues, the CSS and the legend
  drawLegend();
  settings.renderHowTo(); // the title / pause how-to, written with the player's own keys
  refreshTouchMode();
  refreshTitle();
  requestAnimationFrame(frame);

  // Test hook: only exposed when the page is opened with ?debug
  if (/[?&]debug\b/.test(location.search)) {
    window.__echo = {
      info: () => ({ state, levelNum, levelTime, player, enemies, level, ripples: ripples.length, audio: audio.ctx && audio.ctx.state }),
      tp: (x, y) => {
        player.x = x;
        player.y = y;
      },
      go: (n) => {
        audio.init();
        startLevel(n);
      },
      step: (secs) => {
        for (let t = 0; t < secs && state === 'play'; t += 1 / 60) updatePlay(1 / 60);
      },
      // intro cutscene helpers: play it, hold time still, and jump to a moment
      intro: (kind = 'intro') => {
        audio.init();
        runSeed = 1;
        startCutscene(kind);
      },
      advance: () => advanceLevel(),
      ripples: () => ripples,
      marks: () => marks,
      crouch: () => ({ crouching: !!(player && player.crouching), glimmerOff, held: crouchHeld() }),
      decoys: () => decoys,
      dropDecoy,
      rippleRange,
      freeze: (on) => {
        debugFrozen = !!on;
      },
      csTo: (secs) => {
        const start = cutscene.time;
        for (let t = start; t < secs && state === 'cutscene'; t += 1 / 60) cutscene.update(1 / 60);
        return cutscene.time;
      },
      cutscene,
      setMode,
      setCalm,
      setVisualCues,
      setTouchControls,
      // switch the accessibility / input features for a test WITHOUT saving them: { cues, touch, audioFx }
      features: (f = {}) => {
        if ('cues' in f) {
          visualCues = !!f.cues;
          if (!visualCues) cues.clear();
        }
        if ('touch' in f) {
          touchPref = f.touch ? '1' : '0';
          refreshTouchMode();
          if (state === 'play') touch.setVisible(touchOn);
        }
        if ('audioFx' in f) audioFx = !!f.audioFx;
        refreshOptionUi();
        return { cues: visualCues, touch: touchOn, audioFx };
      },
      seed: (n) => {
        runSeed = n | 0; // the maze seed, so two runs can be the same
      },
      cues: () => cues.list(),
      snapCamera: (x, y) => {
        camX = x === undefined ? player.x : x;
        camY = y === undefined ? player.y : y;
      },
      // magnify the picture (until the window is resized), so the art can be inspected on a small screen
      zoom: (v) => {
        viewScale = +v;
      },
      // hold the art's clock still (seconds), or pass null to let it run - for screenshots that must be repeatable
      artClock: (t) => {
        artHold = t === null || t === undefined ? null : +t;
        if (artHold !== null) artT = artHold;
      },
      captionText: () => ($('cue-caption').classList.contains('show') ? $('cue-caption').textContent : ''),
      touch,
      soundBlocked,
      // draw the muffler (never drawn in normal play) as a dim ring with a dash, for testing
      showMuffler: (on) => {
        debugShowMuffler = on === undefined ? !debugShowMuffler : !!on;
        return debugShowMuffler;
      },
      // markPlayer(): force a singer to mark you now (for tests); state of every singer / muffler
      markBy: (e) => markPlayer(e),
      newMonsters: () => enemies.filter((e) => e.kind === 'muffler' || e.kind === 'singer').map((e) => ({ kind: e.kind, x: e.x, y: e.y, state: e.state, timer: e.timer, markFrac: e.markFrac, markX: e.markX, markY: e.markY, deaf: e.deaf, everHeard: e.everHeard, singCd: e.singCd })),
      // v11.0: the settings screen, the palettes, the keys, the medals, the stats and the soundtrack
      openSettings,
      settingsUi: settings,
      setPalette,
      setShowTimer,
      palette: () => ({ id: EchoPalette.id, label: EchoPalette.label(), colors: EchoPalette.colorsOf(), cores: EchoPalette.coresOf() }),
      keys: () => {
        const out = {};
        for (const a of EchoProfile.ACTIONS) out[a.id] = EchoProfile.keysFor(a.id).slice();
        return out;
      },
      bindKey: (action, slot, code) => {
        EchoProfile.bindKey(action, slot, code);
        settings.renderHowTo();
        return EchoProfile.keysFor(action).slice();
      },
      resetKeys: () => {
        EchoProfile.resetKeys();
        settings.renderHowTo();
      },
      profile: EchoProfile,
      medals: () => EchoProfile.allMedals(),
      stats: () => EchoProfile.stats(),
      pars: (tiles) => EchoProfile.pars(tiles),
      music,
      musicState: () => music.state(),
      levelDeaths: () => levelDeaths,
      settings: () => ({
        campaignLevels: CAMPAIGN_LEVELS, // 12
        palette: EchoPalette.id,
        showTimer,
        volumes: EchoProfile.volumes(),
        keyBindings: (() => {
          const out = {};
          for (const a of EchoProfile.ACTIONS) out[a.id] = EchoProfile.keysFor(a.id).slice();
          return out;
        })(),
        medalPar: cfg && level ? EchoProfile.pars(level.pathTiles) : null,
        music: music.state(),
        // the new monsters' numbers in this mode (from the MODES table; speeds are for the current level when one is running)
        muffler: { footstepRadius: MODES[mode].mufflerFootstepRadius, presenceRadius: MODES[mode].mufflerPresenceRadius, crouchRadius: MODES[mode].mufflerCrouchRadius, memorySeconds: MODES[mode].mufflerMemorySeconds, speed: cfg ? cfg.mufflerSpeed : null, shownForDebug: debugShowMuffler },
        singer: { markSeconds: MODES[mode].markSeconds, landRadius: MODES[mode].landRadius, singInterval: MODES[mode].singInterval, singRange: MODES[mode].singRange, speed: cfg ? cfg.singerSpeed : null, leapSeconds: SINGER_LEAP_SECONDS },
        mode,
        calm,
        visualCues,
        touchControls: { on: touchOn, saved: touchPref }, // saved: '1' forced on, '0' forced off, null = automatic
        audioFx, // wall muffling + Doppler (always true in real play)
        progress: { ...progress },
        seen: { ...seen },
      }),
      draw: () => draw(),
      audio,
    };
  }
})();
