'use strict';

const TILE = 40;
const OBSTACLE_R = 13;
const EXIT_R = 16;

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Difficulty modes. The level curve below is the baseline (it used to be the
 * only difficulty); each mode scales it:
 *   speed / speedCap  monster hunting speed multiplier, and its ceiling (the
 *                     player walks at 170px/s, so every ceiling stays below that)
 *   count             multiplier on how many monsters a level has
 *   listen            seconds a monster listens after reaching a ripple spot
 *   hear              px: "too close" - a listening monster hears your steps
 *                     inside this, and a monster that has locked on keeps
 *                     tracking you only while you stay inside it
 *   ripple / cooldown multipliers on your ripple's range / recharge time
 *   puddles           multiplier on how many smell puddles a level has (level 6+)
 *   smell             px: how far away a scent monster can smell you while you
 *                     are smelly (it loses you beyond this)
 *   presenceRadius    px: how close a stalker (level 10+) must be to hear you just
 *                     STANDING there (a footstep is heard from `hear`). Always
 *                     smaller than `hear`: levelConfig() clamps it and the check
 *                     below warns if a mode breaks that.
 *   oneLife           being caught ends the whole run
 */
const MODES = {
  easy: { label: 'Easy', speed: 0.72, speedCap: 105, count: 0.6, listen: 3.5, hear: 100, presenceRadius: 60, ripple: 1.2, cooldown: 0.8, puddles: 0.6, smell: 240 },
  normal: { label: 'Normal', speed: 0.96, speedCap: 140, count: 1, listen: 4.8, hear: 124, presenceRadius: 75, ripple: 1.03, cooldown: 0.97, puddles: 1, smell: 300 },
  hard: { label: 'Hard', speed: 1.1, speedCap: 150, count: 1.25, listen: 6, hear: 148, presenceRadius: 90, ripple: 0.88, cooldown: 1.15, puddles: 1.3, smell: 360 },
  hardcore: { label: 'Hardcore', speed: 1.14, speedCap: 155, count: 1.35, listen: 6.5, hear: 158, presenceRadius: 100, ripple: 0.85, cooldown: 1.2, puddles: 1.4, smell: 380, oneLife: true },
};
const MODE_ORDER = ['easy', 'normal', 'hard', 'hardcore'];
for (const id of MODE_ORDER) {
  if (!(MODES[id].presenceRadius < MODES[id].hear)) console.warn(`MODES.${id}: presenceRadius must be smaller than hear (its footstep radius)`);
}

/**
 * How far a ripple reaches from where the player was standing when they sent it. It
 * never goes farther, whatever is beyond (walls, monsters, the exit and puddles past
 * this distance are simply not seen and never alert anything). This is the base range
 * at level 1; it shrinks a little each level down to a minimum, and the difficulty mode
 * scales it (MODES.ripple). Keep it around what fits on screen around the player.
 * The ripple a player actually sends uses rippleRange() in game.js, which is where
 * tools / upgrades can extend it.
 */
const RIPPLE_RANGE_BASE = 360; // px at level 1, before the mode multiplier
const RIPPLE_RANGE_PER_LEVEL = 9; // px lost per level
const RIPPLE_RANGE_MIN = 240; // px floor, before the mode multiplier

// The mimic (arrives on level 8) and the sonar decoy (arrives on level 9)
const MIMIC_FROM_LEVEL = 8; // a monster that pretends to be the exit until a ripple touches it
const DECOY_FROM_LEVEL = 9; // every level from here has one sonar decoy lying somewhere to find
const DECOY_ARM_SECONDS = 5; // after it is dropped, seconds before it starts calling
const DECOY_RADIUS = 480; // px: every monster within this of a decoy when it calls is drawn to it
const DECOY_TRAP_SECONDS = 5; // seconds a monster stays trapped at the decoy once it has arrived
const DECOY_PICKUP_R = 12; // px

// The stalker (arrives on level 10): ignores ripples, echoes and the sonar decoy; it only ever HEARS you, and only
// when you are not crouching (see game.js: updateStalker / stalkersListen).
const STALKER_FROM_LEVEL = 10;
const STALKER_SPEED_FACTOR = 0.95; // of an echo monster's speed on the same level and mode (patrolling and hunting alike)
const STALKER_TOP_SPEED = 169; // px/s: whatever the factor works out to, a stalker is always slower than the player's 170
const STALKER_LOSE_SECONDS = 3; // it loses you when nothing has been heard for this long

const PUDDLE_R = 14;
const SCENT_FROM_LEVEL = 6; // the scent monster and the smell puddles arrive together
const SMELL_SECONDS = 5; // seconds of WALKING you stay smelly after stepping in a puddle
const TRAIL_LIFETIME = 60; // seconds a finished smell trail lasts before it fades away
const TRAIL_RESMELL_COOLDOWN = 10; // seconds after a trail re-smells you before a trail can do it again

/**
 * The monsters on each level of the game so far - EXACT, and the same in every
 * mode (the modes differ in speed, hearing, ripples and so on, not in how many
 * monsters there are). The game currently ends after level 10.
 *   level:   1  2  3  4  5  6  7  8  9  10
 *   echo:    0  1  1  2  2  0  1  1  2  0
 *   scent:   0  0  0  0  0  1  1  1  1  1
 *   mimic:   0  0  0  0  0  0  0  1  1  0
 *   stalker: 0  0  0  0  0  0  0  0  0  1
 * Level 6 is scent-only (no echo monsters); level 7 brings one echo back; level 8
 * adds the mimic; level 9 adds a second echo monster and the sonar decoy to find
 * (the owner did not give a monster mix for level 9 - this one is my choice);
 * level 10 is the stalker's: 1 stalker + 1 scent monster, and NO echo monsters and
 * NO mimic (the owner first asked for a mimic there too, then removed it in v9.0);
 * it has the sonar decoy, like every level from 9.
 * Levels past 10 do not exist yet; the fallback formula below only keeps them
 * generating sensibly (debug/testing) until they are designed.
 */
const ECHO_MONSTERS = { 1: 0, 2: 1, 3: 1, 4: 2, 5: 2, 6: 0, 7: 1, 8: 1, 9: 2, 10: 0 };
const SCENT_MONSTERS = { 6: 1, 7: 1, 8: 1, 9: 1, 10: 1 };
const MIMIC_MONSTERS = { 8: 1, 9: 1 };
const STALKER_MONSTERS = { 10: 1 };

/** Difficulty curve. Everything scales with the level number n (1-based) and the mode. */
function levelConfig(n, modeId = 'normal') {
  const m = MODES[modeId] || MODES.normal;
  const baseEnemies = n === 1 ? 0 : Math.min(1 + Math.floor((n - 2) * 0.7), 8);
  const baseScent = n < SCENT_FROM_LEVEL ? 0 : n < 9 ? 1 : 2;
  const basePuddles = n < SCENT_FROM_LEVEL ? 0 : Math.min(3 + (n - SCENT_FROM_LEVEL), 10);
  const echoCount = n in ECHO_MONSTERS ? ECHO_MONSTERS[n] : Math.min(Math.max(2, Math.round(baseEnemies * m.count)), 10);
  const scentCount = n in ECHO_MONSTERS ? SCENT_MONSTERS[n] || 0 : baseScent === 0 ? 0 : Math.min(Math.max(1, Math.round(baseScent * m.count)), 4);
  const mimicCount = n in ECHO_MONSTERS ? MIMIC_MONSTERS[n] || 0 : n >= MIMIC_FROM_LEVEL ? 1 : 0;
  const stalkerCount = n in ECHO_MONSTERS ? STALKER_MONSTERS[n] || 0 : n >= STALKER_FROM_LEVEL ? 1 : 0;
  const enemySpeed = Math.min((70 + n * 8) * m.speed, m.speedCap); // px/s while hunting
  return {
    n,
    mode: modeId,
    cw: Math.min(6 + n, 19), // maze width in cells
    ch: Math.min(5 + Math.floor(n * 0.8), 14), // maze height in cells
    loopFrac: Math.min(0.08 + n * 0.015, 0.22), // extra openings -> loops
    rooms: Math.min(1 + Math.floor(n / 2), 8),
    obstacles: Math.min(2 + n, 22),
    enemies: echoCount, // echo monsters (see ECHO_MONSTERS)
    enemySpeed,
    searchTime: m.listen, // seconds a monster listens after reaching the spot it was sent to
    footstepRadius: m.hear, // px, see MODES
    presenceRadius: Math.min(m.presenceRadius, m.hear - 1), // px, see MODES: always smaller than footstepRadius
    rippleRadius: Math.max(RIPPLE_RANGE_BASE - n * RIPPLE_RANGE_PER_LEVEL, RIPPLE_RANGE_MIN) * m.ripple, // px from where it is sent
    cooldown: Math.min(0.7 + n * 0.07, 1.5) * m.cooldown,
    // scent monsters + smell puddles (level 6+)
    scentMonsters: scentCount, // see SCENT_MONSTERS
    scentSpeed: enemySpeed * 0.9, // a little slower than an echo monster; always well under the player's 170
    smellRange: m.smell,
    smellSeconds: SMELL_SECONDS,
    puddles: basePuddles === 0 ? 0 : Math.max(2, Math.round(basePuddles * m.puddles)),
    // the mimic (level 8+) and the sonar decoy (level 8+)
    mimics: mimicCount, // see MIMIC_MONSTERS
    decoy: n >= DECOY_FROM_LEVEL, // one to find on the level
    // the stalker (level 10+): hears you (never a ripple, an echo or a decoy), a little slower than an echo monster
    stalkers: stalkerCount, // see STALKER_MONSTERS
    stalkerSpeed: Math.min(enemySpeed * STALKER_SPEED_FACTOR, STALKER_TOP_SPEED), // px/s, patrolling and hunting alike
  };
}

/** Breadth-first distances over unblocked tiles. -1 = unreachable. */
function bfsDist(blocked, W, H, start) {
  const dist = new Int32Array(W * H).fill(-1);
  const queue = new Int32Array(W * H);
  let head = 0;
  let tail = 0;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const c = queue[head++];
    const x = c % W;
    const y = (c / W) | 0;
    const d = dist[c] + 1;
    if (x > 0 && !blocked[c - 1] && dist[c - 1] < 0) { dist[c - 1] = d; queue[tail++] = c - 1; }
    if (x < W - 1 && !blocked[c + 1] && dist[c + 1] < 0) { dist[c + 1] = d; queue[tail++] = c + 1; }
    if (y > 0 && !blocked[c - W] && dist[c - W] < 0) { dist[c - W] = d; queue[tail++] = c - W; }
    if (y < H - 1 && !blocked[c + W] && dist[c + W] < 0) { dist[c + W] = d; queue[tail++] = c + W; }
  }
  return dist;
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/**
 * Build a level. Same (n, runSeed) always produces the same layout so that
 * retrying a level after being caught gives you the same maze.
 */
function generateLevel(n, runSeed, modeId = 'normal') {
  const cfg = levelConfig(n, modeId);
  const rand = mulberry32((runSeed ^ Math.imul(n, 0x9e3779b1)) >>> 0);
  const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));

  const cw = cfg.cw;
  const ch = cfg.ch;
  const W = 2 * cw + 1;
  const H = 2 * ch + 1;
  const walls = new Uint8Array(W * H).fill(1);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // 1. Perfect maze with a randomised depth-first search.
  const visited = new Uint8Array(cw * ch);
  const stack = [[0, 0]];
  visited[0] = 1;
  walls[W + 1] = 0;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const opts = [];
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && ny >= 0 && nx < cw && ny < ch && !visited[ny * cw + nx]) opts.push([dx, dy]);
    }
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = opts[Math.floor(rand() * opts.length)];
    const nx = cx + dx;
    const ny = cy + dy;
    visited[ny * cw + nx] = 1;
    walls[(2 * cy + 1 + dy) * W + (2 * cx + 1 + dx)] = 0;
    walls[(2 * ny + 1) * W + (2 * nx + 1)] = 0;
    stack.push([nx, ny]);
  }

  // 2. Knock out a few extra walls so there are loops to run around.
  let loops = Math.floor(cw * ch * cfg.loopFrac);
  let guard = loops * 30;
  while (loops > 0 && guard-- > 0) {
    const cx = randInt(0, cw - 1);
    const cy = randInt(0, ch - 1);
    const [dx, dy] = dirs[randInt(0, 3)];
    const nx = cx + dx;
    const ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
    const wi = (2 * cy + 1 + dy) * W + (2 * cx + 1 + dx);
    if (walls[wi]) {
      walls[wi] = 0;
      loops--;
    }
  }

  // 3. Open a few chambers (rooms) - these are where obstacles go.
  const roomTiles = [];
  for (let i = 0; i < cfg.rooms; i++) {
    const rw = randInt(2, 3);
    const rh = randInt(2, 3);
    if (rw > cw || rh > ch) continue;
    const cx0 = randInt(0, cw - rw);
    const cy0 = randInt(0, ch - rh);
    if (cx0 === 0 && cy0 === 0) continue; // keep the start area a plain corridor
    for (let y = 2 * cy0 + 1; y <= 2 * (cy0 + rh - 1) + 1; y++) {
      for (let x = 2 * cx0 + 1; x <= 2 * (cx0 + rw - 1) + 1; x++) {
        walls[y * W + x] = 0;
        roomTiles.push(y * W + x);
      }
    }
  }

  // 4. Start in the top-left; the exit is the farthest reachable cell.
  const startIdx = W + 1;
  const d0 = bfsDist(walls, W, H, startIdx);
  let exitIdx = startIdx;
  let far = -1;
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      const idx = (2 * cy + 1) * W + (2 * cx + 1);
      if (d0[idx] > far) {
        far = d0[idx];
        exitIdx = idx;
      }
    }
  }

  // 5. Obstacles (round pillars / boulders). Never seal off the exit.
  const blocked = walls.slice();
  const obstacles = [];
  const roomSet = new Set(roomTiles);
  const roomList = shuffle(Array.from(roomSet), rand);
  const otherList = [];
  for (let i = 0; i < W * H; i++) if (!walls[i] && !roomSet.has(i)) otherList.push(i);
  shuffle(otherList, rand);
  const sx = startIdx % W;
  const sy = (startIdx / W) | 0;
  const ex = exitIdx % W;
  const ey = (exitIdx / W) | 0;
  let tries = cfg.obstacles * 6;
  while (obstacles.length < cfg.obstacles && tries-- > 0 && (roomList.length || otherList.length)) {
    const useRoom = roomList.length && (rand() < 0.7 || !otherList.length);
    const idx = useRoom ? roomList.pop() : otherList.pop();
    const tx = idx % W;
    const ty = (idx / W) | 0;
    if (Math.max(Math.abs(tx - sx), Math.abs(ty - sy)) < 3) continue;
    if (Math.max(Math.abs(tx - ex), Math.abs(ty - ey)) < 2) continue;
    blocked[idx] = 1;
    if (bfsDist(blocked, W, H, startIdx)[exitIdx] < 0) {
      blocked[idx] = 0;
      continue;
    }
    obstacles.push({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, r: OBSTACLE_R, tx, ty });
  }

  // 6. Enemy spawns: away from the start; the first one guards the exit later on.
  const dS = bfsDist(blocked, W, H, startIdx);
  const dE = bfsDist(blocked, W, H, exitIdx);
  const enemies = [];
  const minStart = Math.min(8 + Math.floor(n / 2), 16);
  const spots = [];
  for (let i = 0; i < W * H; i++) if (!blocked[i] && dS[i] >= 0) spots.push(i);
  shuffle(spots, rand);
  const tooClose = (idx, minDist) =>
    enemies.some((e) => Math.hypot(e.tx - (idx % W), e.ty - ((idx / W) | 0)) < minDist);
  for (let k = 0; k < cfg.enemies; k++) {
    const guardian = k === 0 && n >= 4;
    let pick = -1;
    for (const minSep of [6, 3, 0]) {
      for (const idx of spots) {
        if (dS[idx] < minStart) continue;
        if (guardian && (dE[idx] < 4 || dE[idx] > 10)) continue;
        if (tooClose(idx, minSep)) continue;
        pick = idx;
        break;
      }
      if (pick >= 0) break;
    }
    if (pick < 0) pick = spots.find((i) => dS[i] >= 4 && !tooClose(i, 0)) ?? -1;
    if (pick < 0) continue;
    const tx = pick % W;
    const ty = (pick / W) | 0;
    enemies.push({
      kind: 'echo',
      tx,
      ty,
      x: (tx + 0.5) * TILE,
      y: (ty + 0.5) * TILE,
      sleeper: n >= 3 && k % 3 === 2,
      pitch: 44 + rand() * 22,
    });
  }

  // 7. Scent monsters (level 6+): they walk the maze and follow smell instead of sound.
  for (let k = 0; k < cfg.scentMonsters; k++) {
    let pick = -1;
    for (const minSep of [8, 5, 2, 0]) {
      for (const idx of spots) {
        if (dS[idx] < minStart || tooClose(idx, minSep)) continue;
        pick = idx;
        break;
      }
      if (pick >= 0) break;
    }
    if (pick < 0) pick = spots.find((i) => dS[i] >= 4 && !tooClose(i, 0)) ?? -1;
    if (pick < 0) continue;
    const tx = pick % W;
    const ty = (pick / W) | 0;
    enemies.push({
      kind: 'scent',
      tx,
      ty,
      x: (tx + 0.5) * TILE,
      y: (ty + 0.5) * TILE,
      sleeper: false,
      pitch: 70 + rand() * 20,
    });
  }

  // 8. Smell puddles (level 6+). Mostly in rooms, where you can walk around them.
  const puddles = [];
  const pRoom = shuffle(roomTiles.filter((i) => !blocked[i]), rand);
  const pOther = shuffle(spots.filter((i) => !roomSet.has(i)), rand);
  let pTries = cfg.puddles * 10;
  while (puddles.length < cfg.puddles && pTries-- > 0 && (pRoom.length || pOther.length)) {
    const idx = pRoom.length && (rand() < 0.8 || !pOther.length) ? pRoom.pop() : pOther.pop();
    if (blocked[idx]) continue;
    const tx = idx % W;
    const ty = (idx / W) | 0;
    if (Math.max(Math.abs(tx - sx), Math.abs(ty - sy)) < 4) continue;
    if (Math.max(Math.abs(tx - ex), Math.abs(ty - ey)) < 2) continue;
    if (puddles.some((p) => Math.hypot(p.tx - tx, p.ty - ty) < 3)) continue;
    puddles.push({
      x: (tx + 0.5) * TILE + (rand() - 0.5) * 10,
      y: (ty + 0.5) * TILE + (rand() - 0.5) * 10,
      r: PUDDLE_R,
      tx,
      ty,
    });
  }

  // 9. Mimics (level 8+): a monster that passes for the exit. It sits well away from the start (so it is a
  //    plausible exit), and never right next to the real one. (These come after every other random draw so
  //    that levels without a mimic generate exactly as they always did.)
  const exitFar = dS[exitIdx];
  for (let k = 0; k < cfg.mimics; k++) {
    let pick = -1;
    for (const [minSep, farFrac] of [[6, 0.5], [3, 0.3], [0, 0]]) {
      for (const idx of spots) {
        if (dS[idx] < Math.max(minStart, exitFar * farFrac) || dE[idx] < 8 || tooClose(idx, minSep)) continue;
        pick = idx;
        break;
      }
      if (pick >= 0) break;
    }
    if (pick < 0) pick = spots.find((i) => dS[i] >= 4 && dE[i] >= 4 && !tooClose(i, 0)) ?? -1;
    if (pick < 0) continue;
    const tx = pick % W;
    const ty = (pick / W) | 0;
    enemies.push({
      kind: 'mimic',
      tx,
      ty,
      x: (tx + 0.5) * TILE,
      y: (ty + 0.5) * TILE,
      sleeper: false,
      pitch: 50 + rand() * 10, // its voice, once it has turned into an echo monster
    });
  }

  // 10. The sonar decoy (level 8+): one to find, fairly early on, away from every monster, the exit and the puddles.
  let decoy = null;
  if (cfg.decoy) {
    let pick = -1;
    for (const [lo, hi, minSep] of [[5, 16, 5], [4, 22, 3], [3, 999, 0]]) {
      for (const idx of spots) {
        const tx = idx % W;
        const ty = (idx / W) | 0;
        if (dS[idx] < lo || dS[idx] > hi || tooClose(idx, minSep)) continue;
        if (Math.max(Math.abs(tx - ex), Math.abs(ty - ey)) < 3) continue;
        if (puddles.some((p) => Math.hypot(p.tx - tx, p.ty - ty) < 2)) continue;
        pick = idx;
        break;
      }
      if (pick >= 0) break;
    }
    if (pick >= 0) {
      const tx = pick % W;
      const ty = (pick / W) | 0;
      decoy = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, r: DECOY_PICKUP_R, tx, ty, taken: false };
    }
  }

  // 11. Stalkers (level 10+): far from the start and from every other monster. (Last, after every other random
  //     draw, and it draws nothing on a level without one, so levels 1-9 generate exactly as they always did.)
  for (let k = 0; k < cfg.stalkers; k++) {
    let pick = -1;
    for (const minSep of [8, 5, 2, 0]) {
      for (const idx of spots) {
        if (dS[idx] < minStart || tooClose(idx, minSep)) continue;
        pick = idx;
        break;
      }
      if (pick >= 0) break;
    }
    if (pick < 0) pick = spots.find((i) => dS[i] >= 4 && !tooClose(i, 0)) ?? -1;
    if (pick < 0) continue;
    const tx = pick % W;
    const ty = (pick / W) | 0;
    enemies.push({
      kind: 'stalker',
      tx,
      ty,
      x: (tx + 0.5) * TILE,
      y: (ty + 0.5) * TILE,
      sleeper: false,
      pitch: 60 + rand() * 12, // its breathing
    });
  }

  return {
    cfg,
    W,
    H,
    walls,
    blocked,
    obstacles,
    puddles,
    decoy, // the sonar decoy lying on the floor waiting to be picked up (level 8+), or null
    trails: [], // smell trails laid by the player this level (see game.js)
    enemies,
    start: { x: (sx + 0.5) * TILE, y: (sy + 0.5) * TILE },
    exit: { x: (ex + 0.5) * TILE, y: (ey + 0.5) * TILE, r: EXIT_R },
    pxW: W * TILE,
    pxH: H * TILE,
  };
}
