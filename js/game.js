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
  const CAMPAIGN_LEVELS = 7; // the game so far: clearing level 7 ends it ("you finished") - more levels come later
  const SAVE_KEY = 'echomaze.best'; // legacy: one best level, from before difficulty modes
  const PROGRESS_KEY = 'echomaze.progress'; // { easy: 3, normal: 5, ... } highest level unlocked per mode
  const MODE_KEY = 'echomaze.mode';
  const CALM_KEY = 'echomaze.calm';
  const SEEN_KEY = 'echomaze.seen'; // { intro: 1, scent: 1 } cutscenes that have played, so they can be replayed

  const T_WALL = 1;
  const T_OBSTACLE = 2;
  const T_ENEMY = 3; // echo monster
  const T_EXIT = 4;
  const T_SCENT = 5; // scent monster (violet)
  const T_PUDDLE = 6; // smell puddle (lime) - never blocks a ripple, just shows up in it
  const COLORS = [null, '95,212,255', '255,179,71', '255,59,92', '93,255,160', '176,124,255', '190,240,70'];
  const LINE_W = [0, 2.4, 2.8, 3.4, 3.2, 3.4, 3]; // core stroke width per type
  const NRAYTYPES = 6; // ray hit types are 1..5 (wall, obstacle, echo monster, exit, scent monster); 0 = nothing
  const ALPHA_LEVELS = 10;
  const SMELL_TRAIL_STEP = 12; // px between recorded trail points
  const TRAIL_TOUCH = 22; // px: how close a scent monster must be to a trail to "touch" it
  const TRAIL_STEP_ON = 12; // px: how close the player must be to a finished trail to step on it (and smell again)

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
  ];

  // ------------------------------------------------------------------- DOM
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const overlays = ['title', 'replay', 'pause', 'caught', 'complete', 'victory'];
  // states: title | cutscene | play | paused | caught | complete

  const audio = new SoundEngine();

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
  let cooldown = 0;
  let levelTime = 0;
  let ripplesUsed = 0;
  let beaconTimer = 0;
  let heartTimer = 0;
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
   * Two kinds of monster:
   *   'echo'  (red)    blind; learns of you only from a ripple hit or your close footsteps
   *   'scent' (violet) ignores ripples and footsteps; follows SMELL. It never stands still.
   * `state` is idle | hunt (walking to a spot) | search (listening) | track (following you)
   * for an echo monster, and patrol | follow (along a smell trail) | track (smelling you) for a scent monster.
   */
  function makeEnemy(spec) {
    const kind = spec.kind || 'echo';
    return {
      kind,
      x: spec.x,
      y: spec.y,
      r: ENEMY_R,
      sleeper: spec.sleeper,
      state: kind === 'scent' ? 'patrol' : 'idle',
      path: null,
      pi: 0,
      timer: 0,
      repath: 0,
      pause: kind === 'scent' ? 0.3 + Math.random() : 1 + Math.random() * 2,
      stepDist: 0,
      alertCd: 0,
      followTrail: null, // scent monster: the trail it is following
      ignoreTrail: null, // scent monster: a trail it just finished; ignored until it walks away from it
      voice: audio.ready ? audio.createEnemyVoice(spec.pitch, kind) : null,
    };
  }

  const isChasing = (e) => e.state === 'hunt' || e.state === 'track' || e.state === 'follow';

  function destroyVoices() {
    for (const e of enemies) {
      audio.destroyEnemyVoice(e.voice);
      e.voice = null;
    }
  }

  function screech(e) {
    if (e.alertCd > 0) return;
    const sp = spatial(e.x, e.y, 950);
    audio.enemyAlert(sp.pan, sp.g);
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
    enemyAudio(e, e.kind === 'scent' ? updateScent(e, dt) : updateEcho(e, dt));
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
   * exactly as if you had stepped in a puddle - at most once every TRAIL_RESMELL_COOLDOWN seconds.
   * Only when you are not smelly already, and never the trail you have only just finished laying
   * until you have stepped off it (you are standing on its tip the moment your smell runs out).
   */
  function touchOwnTrail() {
    let touching = false;
    for (const tr of level.trails) {
      if (tr.active || tr.pts.length < 2) continue;
      const on = nearestOnTrail(tr, player.x, player.y).d <= TRAIL_STEP_ON;
      if (tr === player.justLeft) {
        if (!on) player.justLeft = null; // stepped off: it counts from now on
        continue;
      }
      if (on) touching = true;
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
    if (player.smell <= 0 && level.trails.length) touchOwnTrail();
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
        player.justLeft = tr; // you are standing on its tip: it cannot re-smell you until you step off it
      }
    }
  }

  /** Footstep clicks / squelches and the continuous voice of one monster. */
  function enemyAudio(e, moved) {
    const scent = e.kind === 'scent';
    const chasing = isChasing(e);
    e.stepDist += moved;
    const stride = scent ? (chasing ? 26 : 22) : chasing ? 24 : 18;
    if (e.stepDist >= stride) {
      e.stepDist = 0;
      const sp = spatial(e.x, e.y, 540);
      if (scent) audio.scentStep(sp.pan, sp.g);
      else audio.enemyStep(sp.pan, sp.g);
    }

    if (e.voice) {
      const sp = spatial(e.x, e.y, 720);
      const occluded = !hasLOS(e.x, e.y, player.x, player.y);
      const mood = chasing ? 1 : e.state === 'search' ? 0.65 : e.sleeper ? 0.1 : scent ? 0.5 : 0.35;
      const gain = sp.g * (0.16 + 0.3 * mood) * (occluded ? 0.6 : 1);
      audio.updateEnemyVoice(e.voice, { gain, pan: sp.pan, mood, muffle: occluded });
    }
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
    cooldown = cfg.cooldown;
    ripplesUsed++;
    castRipple(player.x, player.y, rippleRange());
    audio.ping();
  }

  /** Fire a ripple of reach R (px) from (ox,oy) into the current level (also used by the cutscenes). */
  function castRipple(ox, oy, R = cfg.rippleRadius) {

    // Round things the wave can bounce off.
    const circles = [];
    level.obstacles.forEach((o) => {
      if (Math.hypot(o.x - ox, o.y - oy) < R + o.r) circles.push({ x: o.x, y: o.y, r: o.r, type: T_OBSTACLE });
    });
    enemies.forEach((e) => {
      // a ripple SEES a scent monster (violet) but only an echo monster (red) learns of you from it
      if (Math.hypot(e.x - ox, e.y - oy) < R + e.r) {
        circles.push({ x: e.x, y: e.y, r: e.r, type: e.kind === 'scent' ? T_SCENT : T_ENEMY, enemy: e });
      }
    });
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
          bt = circles[c].type;
          bid = c;
        }
      }
      dist[i] = best;
      type[i] = bt;
      hitId[i] = bid;
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
        if (!bin) objBins.set(hitId[i], (bin = { type: type[i], n: 0, sd: 0, sx: 0 }));
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
      });
    }
    // Puddles lie flat on the floor, so the wave passes over them (they never block a ripple).
    // Any puddle the wave can see lights up lime when it arrives, and gives a wet "blorp" echo.
    for (const p of level.puddles || []) {
      const d = Math.hypot(p.x - ox, p.y - oy);
      if (d > R || !hasLOS(ox, oy, p.x, p.y)) continue;
      marks.push({ x: p.x, y: p.y, t: -d / RIPPLE_SPEED, life: 2.8, c: COLORS[T_PUDDLE], r: p.r + 10, puddle: true });
      echoes.push({ t: (2 * d) / RIPPLE_SPEED, type: T_PUDDLE, d, pan: clamp(((p.x - ox) / (d + 1)) * 0.9, -1, 1), w: 1 });
    }
    echoes.sort((a, b) => a.t - b.t);

    // A monster only learns of you if a ray of the wave actually reaches it
    // (line of sight, within range). It reacts when the wave arrives.
    const alerts = [];
    for (const bin of objBins.keys()) {
      if (circles[bin].type !== T_ENEMY) continue;
      const b = objBins.get(bin);
      alerts.push({ t: b.sd / b.n / RIPPLE_SPEED, e: circles[bin].enemy });
    }
    alerts.sort((a, b) => a.t - b.t);

    ripples.push({ x: ox, y: oy, t: 0, R, dist, type, echoes, ei: 0, alerts, ai: 0, life: (2 * R) / RIPPLE_SPEED + 2.6 });
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
    }
  }

  function updateRipples(dt) {
    for (const rp of ripples) {
      rp.t += dt;
      while (rp.ei < rp.echoes.length && rp.echoes[rp.ei].t <= rp.t) playEcho(rp.echoes[rp.ei++], rp.R);
      while (rp.ai < rp.alerts.length && rp.alerts[rp.ai].t <= rp.t) {
        const a = rp.alerts[rp.ai++];
        // a monster already tracking you knows better than the ripple spot
        if (state === 'play' && a.e.state !== 'track') alertEnemy(a.e, rp.x, rp.y);
      }
    }
    ripples = ripples.filter((rp) => rp.t < rp.life);
    for (const m of marks) m.t += dt;
    marks = marks.filter((m) => m.t < m.life);
  }

  // ----------------------------------------------------------------- update
  function updatePlay(dt) {
    levelTime += dt;
    cooldown = Math.max(0, cooldown - dt);
    player.bumpCd = Math.max(0, player.bumpCd - dt);
    flash = Math.max(0, flash - dt * 2.2);
    shake = Math.max(0, shake - dt * 30);
    beat = Math.max(0, beat - dt * 3.2);

    // --- player movement
    const ix = (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0);
    const iy = (down('KeyS', 'ArrowDown') ? 1 : 0) - (down('KeyW', 'ArrowUp') ? 1 : 0);
    let contact = null;
    let walked = false; // did we really move this frame? (pushing into a wall does not count)
    if (ix || iy) {
      const len = Math.hypot(ix, iy);
      const px = player.x;
      const py = player.y;
      contact = moveCircle(player, (ix / len) * WALK_SPEED * dt, (iy / len) * WALK_SPEED * dt);
      const step = Math.hypot(player.x - px, player.y - py);
      walked = step > 0.3;
      player.stepDist += step;
      if (player.stepDist >= 30) {
        player.stepDist = 0;
        audio.footstep(1);
        hearFootstep(player.x, player.y);
      }
    }
    if (contact && !player.blocked && player.bumpCd <= 0) {
      player.bumpCd = 0.3;
      audio.bump(1);
      marks.push({ x: contact.x, y: contact.y, t: 0, life: 0.9, c: COLORS[T_WALL] });
    }
    player.blocked = !!contact;
    updateSmell(dt, walked);
    // a finished smell trail lasts about a minute, then it is gone
    for (let i = level.trails.length - 1; i >= 0; i--) {
      const tr = level.trails[i];
      if (!tr.active && levelTime >= tr.expireAt) level.trails.splice(i, 1);
    }

    // --- world
    for (const e of enemies) updateEnemy(e, dt);
    updateRipples(dt);

    // exit beacon
    beaconTimer -= dt;
    if (beaconTimer <= 0) {
      beaconTimer = 2.4;
      const sp = spatial(level.exit.x, level.exit.y, 620);
      if (sp.g > 0.015) audio.beacon(sp.pan, sp.g);
    }

    // heartbeat + danger vignette as monsters close in
    let dmin = Infinity;
    for (const e of enemies) {
      const d = Math.hypot(e.x - player.x, e.y - player.y) * (isChasing(e) ? 1 : 1.35);
      if (d < dmin) dmin = d;
    }
    danger = clamp(1 - dmin / 300, 0, 1);
    if (danger > 0 && !calm) {
      heartTimer -= dt;
      if (heartTimer <= 0) {
        heartTimer = 0.95 - danger * 0.6;
        audio.heartbeat(0.35 + danger * 0.65);
        beat = 1;
      }
    }

    // --- outcomes
    for (const e of enemies) {
      if (Math.hypot(e.x - player.x, e.y - player.y) < CATCH_DIST) return onCaught();
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
    for (let k = 1; k < NRAYTYPES; k++) {
      retBuckets[k].length = 0;
      for (let a = 0; a < ALPHA_LEVELS; a++) segBuckets[k][a].length = 0;
    }

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
      ctx.strokeStyle = `rgba(150,215,255,${a * 0.25})`;
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.strokeStyle = `rgba(190,235,255,${a})`;
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
        const b = segBuckets[k][Math.min(ALPHA_LEVELS - 1, Math.floor(al * ALPHA_LEVELS))];
        if (connect) b.push(px, py, x + COS[j2] * dist[j2], y + SIN[j2] * dist[j2]);
        else b.push(px, py, px, py);
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
        strokeBucket(segBuckets[k][a], `rgba(${COLORS[k]},${al * 0.2})`, LINE_W[k] * 3.2);
        strokeBucket(segBuckets[k][a], `rgba(${COLORS[k]},${al})`, LINE_W[k]);
      }
      strokeBucket(retBuckets[k], `rgba(${COLORS[k]},${retAlpha * 0.3})`, 6);
      strokeBucket(retBuckets[k], `rgba(${COLORS[k]},${retAlpha})`, 1.6);
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
      g.addColorStop(0, `rgba(${m.c},${a * 0.7})`);
      g.addColorStop(1, `rgba(${m.c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y, rad, 0, TAU);
      ctx.fill();
      if (m.puddle) {
        ctx.strokeStyle = `rgba(${m.c},${a * 0.8})`;
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

    // the exit only glimmers when you are practically on top of it
    const de = Math.hypot(level.exit.x - player.x, level.exit.y - player.y);
    if (de < 130) {
      const a = (1 - de / 130) * 0.45;
      const g = ctx.createRadialGradient(level.exit.x, level.exit.y, 0, level.exit.x, level.exit.y, 46);
      g.addColorStop(0, `rgba(${COLORS[T_EXIT]},${a})`);
      g.addColorStop(1, `rgba(${COLORS[T_EXIT]},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(level.exit.x, level.exit.y, 46, 0, TAU);
      ctx.fill();
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
    }

    drawTrails();
    drawRippleLayer();
    ctx.globalCompositeOperation = 'lighter';

    // the player: a small pale dot with a faint halo
    const g = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, 30);
    g.addColorStop(0, 'rgba(200,235,255,0.16)');
    g.addColorStop(1, 'rgba(200,235,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 30, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(235,248,255,0.95)';
    ctx.beginPath();
    ctx.arc(player.x, player.y, 4.5, 0, TAU);
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
    $('hud-audio').textContent = [calm ? 'Calm' : '', audio.muted ? 'Sound off' : ''].filter(Boolean).join(' · ');
  }

  function showBanner(n) {
    const el = $('banner');
    $('banner-title').textContent = `Level ${n}`;
    $('banner-text').textContent = HINTS[n] || GENERIC_HINTS[n % GENERIC_HINTS.length];
    el.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.classList.remove('show'), n === 1 ? 9000 : 4500);
  }

  function startLevel(n) {
    destroyVoices();
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
    };
    enemies = level.enemies.map(makeEnemy);
    ripples = [];
    marks = [];
    cooldown = 0;
    levelTime = 0;
    ripplesUsed = 0;
    beaconTimer = 1;
    heartTimer = 0;
    danger = 0;
    beat = 0;
    flash = 0;
    shake = 0;
    camX = player.x;
    camY = player.y;
    state = 'play';
    audio.startAmbient(n);
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
    if (withIntro) startCutscene();
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
      ripples = [];
      marks = [];
      danger = 0;
      flash = 0;
      shake = 0;
    },
    castRipple,
    updateRipples,
    drawRippleLayer,
    calm: () => calm,
    finish(kind) {
      if (replaying) {
        // rewatched from the replay screen: go back there, no level starts
        replaying = false;
        toTitle();
        showReplay();
      } else {
        // the intro leads into level 1; the scent-monster scene leads into level 6
        startLevel(kind === 'scent' ? SCENT_FROM_LEVEL : 1);
      }
    },
  });

  /** kind: 'intro' (before level 1) or 'scent' (between levels 5 and 6). */
  function startCutscene(kind = 'intro') {
    // remember that it has played, so it can be rewatched from the replay screen
    if (!seen[kind]) {
      seen[kind] = 1;
      store.set(SEEN_KEY, JSON.stringify(seen));
    }
    destroyVoices();
    audio.stopAmbient();
    state = 'cutscene';
    showOverlay(null);
    $('hud').classList.add('hidden');
    $('banner').classList.remove('show');
    cutscene.start(kind);
  }

  /** On from a cleared level. Going from level 5 to 6 plays the scent-monster cutscene first. */
  function advanceLevel() {
    audio.uiClick();
    if (levelNum + 1 === SCENT_FROM_LEVEL) startCutscene('scent');
    else startLevel(levelNum + 1);
  }

  function onCaught() {
    if (state !== 'play') return;
    state = 'caught';
    audio.caught();
    audio.stopAmbient();
    destroyVoices();
    flash = calm ? 0 : 1; // calm mode: no red flash or screen shake
    shake = calm ? 0 : 14;
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

  function onLevelComplete() {
    if (state !== 'play') return;
    state = 'complete';
    audio.stopAmbient();
    destroyVoices();
    saveBest(levelNum + 1);
    const m = Math.floor(levelTime / 60);
    const s = Math.floor(levelTime % 60);
    const stats = `Time ${m}:${String(s).padStart(2, '0')}  ·  Ripples ${ripplesUsed}`;
    if (levelNum >= CAMPAIGN_LEVELS) {
      // The end of the game so far. There is no level 8 yet.
      $('victory-text').textContent = MODES[mode].oneLife
        ? 'You cleared every level on a single life. The echoes fade behind you… More levels are coming.'
        : `You cleared every level on ${MODES[mode].label}. The echoes fade behind you… More levels are coming.`;
      audio.victory();
      setTimeout(() => state === 'complete' && showOverlay('victory'), 700);
    } else {
      audio.levelComplete();
      $('complete-title').textContent = `Level ${levelNum} cleared`;
      $('complete-stats').textContent = stats;
      setTimeout(() => state === 'complete' && showOverlay('complete'), 700);
    }
  }

  function pause() {
    if (state !== 'play') return;
    state = 'paused';
    $('pause-mode').textContent = `${MODES[mode].label} · Level ${levelNum}`;
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
    state = 'title';
    level = null;
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
  }

  // ---------------------------------------------- replay: levels + cutscenes
  const SCENES = [
    { kind: 'intro', name: 'The Lost Explorer', blurb: 'How it all began.', locked: 'Press Begin to see it for the first time.' },
    { kind: 'scent', name: 'Not Every Monster Listens', blurb: 'What follows the scent.', locked: 'You will see it when you clear level 5.' },
  ];

  /** Has this cutscene played? Saves from before this was tracked count if they got past it. */
  function hasSeen(kind) {
    if (seen[kind]) return true;
    const reached = Math.max(...Object.keys(MODES).map((m) => getBest(m)));
    return kind === 'intro' ? reached > 1 : reached >= SCENT_FROM_LEVEL;
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
    return clearedLevels() > 0 || SCENES.some((s) => hasSeen(s.kind));
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
        b.textContent = n;
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
      const ok = hasSeen(s.kind);
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
    if (state !== 'title' || !hasSeen(kind)) return;
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
  }

  function toggleMute() {
    audio.setMuted(!audio.muted);
    if (state !== 'title') updateHud();
  }

  // ----------------------------------------------------------------- input
  const GAME_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (e.repeat) return;

    if (e.code === 'KeyM') return toggleMute();
    if (e.code === 'KeyC') return setCalm(!calm); // works on every screen, in every mode
    switch (state) {
      case 'play':
        if (e.code === 'Space') emitRipple();
        else if (e.code === 'Escape' || e.code === 'KeyP') pause();
        break;
      case 'paused':
        if (e.code === 'Escape' || e.code === 'KeyP') unpause();
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
  }

  window.addEventListener('blur', () => {
    releaseKeys();
    pause();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      releaseKeys();
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
    startLevel(levelNum);
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
  $('btn-caught-title').addEventListener('click', () => {
    audio.uiClick();
    toTitle();
  });
  $('btn-start').addEventListener('click', () => newRun(1, true));
  $('btn-continue').addEventListener('click', () => newRun(getBest()));
  $('btn-replay').addEventListener('click', openReplay);
  $('btn-replay-back').addEventListener('click', closeReplay);
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

  document.querySelectorAll('.vol-slider').forEach((sl) => {
    sl.addEventListener('input', () => {
      const v = sl.value / 100;
      audio.setVolume(v);
      document.querySelectorAll('.vol-slider').forEach((o) => {
        o.value = sl.value;
      });
    });
  });

  // -------------------------------------------------------------- main loop
  let last = performance.now();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

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
      }
    }

    draw();
    requestAnimationFrame(frame);
  }

  resize();
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
      settings: () => ({ mode, calm, progress: { ...progress }, seen: { ...seen } }),
      draw: () => draw(),
      audio,
    };
  }
})();
