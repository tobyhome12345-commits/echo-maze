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
  const CAMPAIGN_LEVELS = 10;
  const SAVE_KEY = 'echomaze.best';

  const T_WALL = 1;
  const T_OBSTACLE = 2;
  const T_ENEMY = 3;
  const T_EXIT = 4;
  const COLORS = [null, '95,212,255', '255,179,71', '255,59,92', '93,255,160'];
  const LINE_W = [0, 2.4, 2.8, 3.4, 3.2]; // core stroke width per type
  const ALPHA_LEVELS = 10;

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
    4: 'Move after every ripple - a monster you hit will hunt the spot you rippled from.',
    5: 'A monster listens for 5 seconds after it arrives. Stand still, or keep your footsteps far from it.',
  };
  const GENERIC_HINTS = [
    'Ripple, listen, move. Never stay where you rippled.',
    'Echoes arrive later the farther away something is.',
    'Sleepers do nothing until a ripple hits them. Keep your waves away.',
    'A monster only goes where you were. Once you move on, it has no idea where you went.',
    'Listen for growls and clicking steps. That is how you find monsters without waking them.',
  ];

  // ------------------------------------------------------------------- DOM
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const overlays = ['title', 'pause', 'caught', 'complete', 'victory'];

  const audio = new SoundEngine();

  // ----------------------------------------------------------------- state
  let state = 'title';
  let runSeed = 1;
  let endless = false;
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

  function getBest() {
    try {
      return parseInt(localStorage.getItem(SAVE_KEY), 10) || 1;
    } catch (e) {
      return 1;
    }
  }

  function saveBest(n) {
    try {
      if (n > getBest()) localStorage.setItem(SAVE_KEY, String(n));
    } catch (e) {
      /* storage unavailable */
    }
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
  function makeEnemy(spec) {
    return {
      x: spec.x,
      y: spec.y,
      r: ENEMY_R,
      sleeper: spec.sleeper,
      state: 'idle', // idle | hunt | search
      path: null,
      pi: 0,
      timer: 0,
      pause: 1 + Math.random() * 2,
      stepDist: 0,
      alertCd: 0,
      voice: audio.ready ? audio.createEnemyVoice(spec.pitch) : null,
    };
  }

  function destroyVoices() {
    for (const e of enemies) {
      audio.destroyEnemyVoice(e.voice);
      e.voice = null;
    }
  }

  /**
   * A monster learns of a sound at (ox,oy) - exactly where it was made - and
   * goes there. It is NOT told where you are now, so if you have moved on it
   * will not know. Two things can trigger this, and only these two (apart from
   * touching you, which kills you outright):
   *   1. your ripple wave hits it (see updateRipples), or
   *   2. it is listening (see hearFootstep) and you walk too close.
   */
  function alertEnemy(e, ox, oy) {
    const wasHunting = e.state === 'hunt';
    if (!setPathTo(e, ox, oy)) return;
    e.state = 'hunt';
    if (!wasHunting && e.alertCd <= 0) {
      const sp = spatial(e.x, e.y, 950);
      audio.enemyAlert(sp.pan, sp.g);
      e.alertCd = 2;
    }
  }

  /**
   * A footstep of yours at (x,y). Only a monster that has just reached the spot
   * a ripple sent it to (state 'search', i.e. for searchTime seconds) is
   * listening, and only within footstepRadius. Standing still makes no sound.
   */
  function hearFootstep(x, y) {
    for (const e of enemies) {
      if (e.state !== 'search') continue;
      if (Math.hypot(e.x - x, e.y - y) > cfg.footstepRadius) continue;
      alertEnemy(e, x, y);
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

    // clicking footsteps, faster while hunting
    e.stepDist += moved;
    const stride = e.state === 'hunt' ? 24 : 18;
    if (e.stepDist >= stride) {
      e.stepDist = 0;
      const sp = spatial(e.x, e.y, 540);
      audio.enemyStep(sp.pan, sp.g);
    }

    // continuous voice
    if (e.voice) {
      const sp = spatial(e.x, e.y, 720);
      const occluded = !hasLOS(e.x, e.y, player.x, player.y);
      const mood = e.state === 'hunt' ? 1 : e.state === 'search' ? 0.65 : e.sleeper ? 0.1 : 0.35;
      const gain = sp.g * (0.16 + 0.3 * mood) * (occluded ? 0.6 : 1);
      audio.updateEnemyVoice(e.voice, { gain, pan: sp.pan, mood, muffle: occluded });
    }
  }

  // ---------------------------------------------------------------- ripples
  function emitRipple() {
    if (state !== 'play' || cooldown > 0) return;
    cooldown = cfg.cooldown;
    ripplesUsed++;

    const R = cfg.rippleRadius;
    const ox = player.x;
    const oy = player.y;

    // Round things the wave can bounce off.
    const circles = [];
    level.obstacles.forEach((o) => {
      if (Math.hypot(o.x - ox, o.y - oy) < R + o.r) circles.push({ x: o.x, y: o.y, r: o.r, type: T_OBSTACLE });
    });
    enemies.forEach((e) => {
      if (Math.hypot(e.x - ox, e.y - oy) < R + e.r) circles.push({ x: e.x, y: e.y, r: e.r, type: T_ENEMY, enemy: e });
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

    audio.ping();
  }

  function playEcho(ev, R) {
    const vol = (1 - clamp(ev.d / R, 0, 1) * 0.65) * ev.w;
    switch (ev.type) {
      case T_WALL: audio.echoWall(ev.pan, vol, ev.d); break;
      case T_OBSTACLE: audio.echoObstacle(ev.pan, vol, ev.d); break;
      case T_ENEMY: audio.echoEnemy(ev.pan, vol, ev.d); break;
      case T_EXIT: audio.echoExit(ev.pan, vol); break;
    }
  }

  function updateRipples(dt) {
    for (const rp of ripples) {
      rp.t += dt;
      while (rp.ei < rp.echoes.length && rp.echoes[rp.ei].t <= rp.t) playEcho(rp.echoes[rp.ei++], rp.R);
      while (rp.ai < rp.alerts.length && rp.alerts[rp.ai].t <= rp.t) {
        const a = rp.alerts[rp.ai++];
        if (state === 'play') alertEnemy(a.e, rp.x, rp.y);
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
    if (ix || iy) {
      const len = Math.hypot(ix, iy);
      const px = player.x;
      const py = player.y;
      contact = moveCircle(player, (ix / len) * WALK_SPEED * dt, (iy / len) * WALK_SPEED * dt);
      player.stepDist += Math.hypot(player.x - px, player.y - py);
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
      const d = Math.hypot(e.x - player.x, e.y - player.y) * (e.state === 'hunt' ? 1 : 1.35);
      if (d < dmin) dmin = d;
    }
    danger = clamp(1 - dmin / 300, 0, 1);
    if (danger > 0) {
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
  for (let k = 0; k < 5; k++) {
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
    for (let k = 1; k < 5; k++) {
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
    for (let k = 1; k < 5; k++) {
      for (let a = 0; a < ALPHA_LEVELS; a++) {
        const al = (a + 0.5) / ALPHA_LEVELS;
        strokeBucket(segBuckets[k][a], `rgba(${COLORS[k]},${al * 0.2})`, LINE_W[k] * 3.2);
        strokeBucket(segBuckets[k][a], `rgba(${COLORS[k]},${al})`, LINE_W[k]);
      }
      strokeBucket(retBuckets[k], `rgba(${COLORS[k]},${retAlpha * 0.3})`, 6);
      strokeBucket(retBuckets[k], `rgba(${COLORS[k]},${retAlpha})`, 1.6);
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

    for (const rp of ripples) drawRipple(rp);

    for (const m of marks) {
      const a = 1 - m.t / m.life;
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 18);
      g.addColorStop(0, `rgba(${m.c},${a * 0.7})`);
      g.addColorStop(1, `rgba(${m.c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 18, 0, TAU);
      ctx.fill();
    }

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
    const dv = danger * (0.55 + 0.45 * beat);
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
    $('hud-level').textContent = `Level ${levelNum}`;
    $('hud-ripples').textContent = `Ripples ${ripplesUsed}`;
    $('hud-audio').textContent = audio.muted ? 'Sound off' : '';
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
    level = generateLevel(n, runSeed);
    cfg = level.cfg;
    player = { x: level.start.x, y: level.start.y, r: PLAYER_R, stepDist: 0, bumpCd: 0, blocked: false };
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

  function newRun(fromLevel) {
    runSeed = (Math.random() * 0x7fffffff) | 0;
    endless = false;
    audio.init();
    audio.uiClick();
    startLevel(fromLevel);
  }

  function onCaught() {
    if (state !== 'play') return;
    state = 'caught';
    audio.caught();
    audio.stopAmbient();
    destroyVoices();
    flash = 1;
    shake = 14;
    setTimeout(() => {
      if (state === 'caught') showOverlay('caught');
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
    if (levelNum === CAMPAIGN_LEVELS && !endless) {
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

  function refreshTitle() {
    const best = getBest();
    const btn = $('btn-continue');
    btn.classList.toggle('hidden', best <= 1);
    btn.textContent = `Continue (Level ${best})`;
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
    switch (state) {
      case 'play':
        if (e.code === 'Space') emitRipple();
        else if (e.code === 'Escape' || e.code === 'KeyP') pause();
        break;
      case 'paused':
        if (e.code === 'Escape' || e.code === 'KeyP') unpause();
        break;
      case 'title':
        if (e.code === 'Enter') {
          e.preventDefault();
          newRun(1);
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
          if (!$('complete').classList.contains('hidden')) startLevel(levelNum + 1);
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
    }
  });

  window.addEventListener('resize', resize);

  function retry() {
    audio.uiClick();
    startLevel(levelNum);
  }

  $('btn-start').addEventListener('click', () => newRun(1));
  $('btn-continue').addEventListener('click', () => newRun(getBest()));
  $('btn-resume').addEventListener('click', () => {
    audio.uiClick();
    unpause();
  });
  $('btn-quit').addEventListener('click', () => {
    audio.uiClick();
    toTitle();
  });
  $('btn-retry').addEventListener('click', retry);
  $('btn-next').addEventListener('click', () => {
    audio.uiClick();
    startLevel(levelNum + 1);
  });
  $('btn-endless').addEventListener('click', () => {
    audio.uiClick();
    endless = true;
    startLevel(levelNum + 1);
  });
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

    if (player && level && state !== 'title') {
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
      info: () => ({ state, levelNum, player, enemies, level, ripples: ripples.length, audio: audio.ctx && audio.ctx.state }),
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
      audio,
    };
  }
})();
