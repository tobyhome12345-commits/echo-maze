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
 *   mimicTell         how well a disguised mimic (level 8-9) copies the exit's LOOK (js/art.js, EchoArt 'exit'):
 *                     'clear'  (Easy)   a visible slow flicker and an uneven, slightly off-colour outer ring
 *                     'subtle' (Normal) a faint wobble in the outer ring and a slightly different turning speed
 *                     'none'   (Hard, Hardcore) visually IDENTICAL to the exit - only a ripple tells them apart
 *                     This is a deliberate exception to "visuals never change the game": it is the one visual
 *                     that differs by mode, on purpose. It changes nothing but how the disguised mimic is DRAWN
 *                     (never its sound, size, speed or behaviour, and never the visual sound cue).
 *   oneLife           being caught ends the whole run
 *
 * The MUFFLER (debuts on level 11; js/game.js: updateMuffler / mufflersListen). It cannot be seen or smelled and it
 * absorbs ripples; it only HEARS you, like the stalker, but harder to hide from. The stalker already owns the plain
 * names `hear` and `presenceRadius`, so the muffler's own values are prefixed:
 *   mufflerFootstepRadius  px: it hears your footsteps (while you move, standing up) from this far
 *   mufflerPresenceRadius  px: it hears you STANDING (even still) from this far - smaller than the footstep radius
 *   mufflerCrouchRadius    px: crouching does NOT silence you fully: crouched MOVEMENT is heard from this far
 *                          (crouched standing is silent)
 *   mufflerMemorySeconds   s: how long it remembers the last spot it heard you (it goes there and waits) before it
 *                          gives up and patrols again
 * The SINGER (debuts on level 12; updateSinger): it roams and sings ripples of its own; a ripple that reaches you
 * MARKS you, and after `markSeconds` it leaps to the exact spot the wave found you at.
 *   markSeconds   s: the countdown from being marked to the leap (the same in calm mode: it is gameplay information)
 *   landRadius    px: you are caught if you are this close to the landing spot when it lands
 *   singInterval  s: between its ripples
 *   singRange     px: how far its ripples reach
 * Keep every value ordered easy < normal < hard < hardcore in difficulty (a SHORTER countdown is harder).
 */
const MODES = {
  easy: { label: 'Easy', speed: 0.72, speedCap: 105, count: 0.6, listen: 3.5, hear: 100, presenceRadius: 60, ripple: 1.2, cooldown: 0.8, puddles: 0.6, smell: 240, mimicTell: 'clear', mufflerFootstepRadius: 125, mufflerPresenceRadius: 75, mufflerCrouchRadius: 30, mufflerMemorySeconds: 3, markSeconds: 4.0, landRadius: 45, singInterval: 6, singRange: 300 },
  normal: { label: 'Normal', speed: 0.96, speedCap: 140, count: 1, listen: 4.8, hear: 124, presenceRadius: 75, ripple: 1.03, cooldown: 0.97, puddles: 1, smell: 300, mimicTell: 'subtle', mufflerFootstepRadius: 155, mufflerPresenceRadius: 95, mufflerCrouchRadius: 40, mufflerMemorySeconds: 5, markSeconds: 3.0, landRadius: 60, singInterval: 5, singRange: 360 },
  hard: { label: 'Hard', speed: 1.1, speedCap: 150, count: 1.25, listen: 6, hear: 148, presenceRadius: 90, ripple: 0.88, cooldown: 1.15, puddles: 1.3, smell: 360, mimicTell: 'none', mufflerFootstepRadius: 185, mufflerPresenceRadius: 115, mufflerCrouchRadius: 50, mufflerMemorySeconds: 6, markSeconds: 2.5, landRadius: 70, singInterval: 4, singRange: 420 },
  hardcore: { label: 'Hardcore', speed: 1.14, speedCap: 155, count: 1.35, listen: 6.5, hear: 158, presenceRadius: 100, ripple: 0.85, cooldown: 1.2, puddles: 1.4, smell: 380, mimicTell: 'none', mufflerFootstepRadius: 198, mufflerPresenceRadius: 125, mufflerCrouchRadius: 55, mufflerMemorySeconds: 7, markSeconds: 2.0, landRadius: 80, singInterval: 3.5, singRange: 460, oneLife: true },
};
const MODE_ORDER = ['easy', 'normal', 'hard', 'hardcore'];
for (const id of MODE_ORDER) {
  const m = MODES[id];
  if (!(m.presenceRadius < m.hear)) console.warn(`MODES.${id}: presenceRadius must be smaller than hear (its footstep radius)`);
  if (!['none', 'subtle', 'clear'].includes(m.mimicTell)) console.warn(`MODES.${id}: mimicTell must be 'none', 'subtle' or 'clear'`);
  // the muffler hears from farther off than the stalker does (both ways), standing is heard from nearer than moving, and a crouch is quieter than standing
  if (!(m.mufflerFootstepRadius > m.hear && m.mufflerPresenceRadius > m.presenceRadius)) console.warn(`MODES.${id}: the muffler's radii must be larger than the stalker's`);
  if (!(m.mufflerCrouchRadius < m.mufflerPresenceRadius && m.mufflerPresenceRadius < m.mufflerFootstepRadius)) console.warn(`MODES.${id}: mufflerCrouchRadius < mufflerPresenceRadius < mufflerFootstepRadius expected`);
}
for (let i = 1; i < MODE_ORDER.length; i++) {
  const a = MODES[MODE_ORDER[i - 1]];
  const b = MODES[MODE_ORDER[i]];
  const up = ['mufflerFootstepRadius', 'mufflerPresenceRadius', 'mufflerCrouchRadius', 'mufflerMemorySeconds', 'landRadius', 'singRange'];
  const down = ['markSeconds', 'singInterval']; // harder = shorter
  if (up.some((k) => !(b[k] > a[k])) || down.some((k) => !(b[k] < a[k]))) console.warn(`MODES.${MODE_ORDER[i]}: the muffler / singer values must get harder from ${MODE_ORDER[i - 1]}`);
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

// The muffler (debuts on level 11) and the singer (level 12): see MODES above and js/game.js
const MUFFLER_FROM_LEVEL = 11;
const SINGER_FROM_LEVEL = 12;
const MUFFLER_SPEED_FACTOR = 1.05; // of (70 + 8 * level) * the mode's speed
const MUFFLER_TOP_SPEED = 160; // px/s: a muffler never exceeds this (the player walks at 170)
const SINGER_SPEED_FACTOR = 0.8; // of an echo monster's speed on the same level and mode (patrolling)
const SINGER_LEAP_SECONDS = 0.6; // its leap takes this long from launch to landing
const SINGER_LAND_WAIT = 2; // s it waits where it landed before it roams and sings again
const PUDDLE_CAP = { 9: 6 }; // level 9 has two scent monsters (Normal, Hard, Hardcore): no swamp - at most this many puddles

/**
 * The monsters on each level of the game - EXACT (the number never varies from run to run; the modes differ in
 * speed, hearing, ripples and so on - and, from level 9, in Easy having one fewer). The game ends after level 12.
 *
 * Normal, Hard and Hardcore (these tables):
 *   level:   1  2  3  4  5  6  7  8  9  10  11  12
 *   echo:    0  1  1  2  2  0  1  1  0  0   1   1
 *   scent:   0  0  0  0  0  1  1  1  2  1   0   0
 *   mimic:   0  0  0  0  0  0  0  1  1  0   0   0
 *   stalker: 0  0  0  0  0  0  0  0  0  1   0   0
 *   muffler: 0  0  0  0  0  0  0  0  0  0   1   0
 *   singer:  0  0  0  0  0  0  0  0  0  0   0   1
 * Easy is the same for levels 1-8 and then (MODE_MONSTERS below):
 *   level 9:  1 scent + 1 mimic      level 10: 1 stalker      level 11: 1 muffler      level 12: 1 singer
 * (the mimic turns into an echo monster when pinged, so "no echo monsters" on level 9 still hides one threat).
 *
 * Level 6 is scent-only; level 7 brings one echo back; level 8 adds the mimic; level 9 has two scent monsters and the
 * mimic and the sonar decoy to find; level 10 is the stalker's (with one scent monster); level 11 pairs the new
 * Muffler with one familiar echo monster; level 12 pairs the new Singer with one. One new threat per level, at most
 * three monsters at a time (levels 8 and 9 are the peak; the mimic counts as one). The decoy and the smell puddles are
 * terrain, not monsters: they are on every level that had them, whatever the mode's monster mix.
 * Levels past 12 do not exist; the fallback formula below only keeps them generating sensibly for debug / testing.
 */
const ECHO_MONSTERS = { 1: 0, 2: 1, 3: 1, 4: 2, 5: 2, 6: 0, 7: 1, 8: 1, 9: 0, 10: 0, 11: 1, 12: 1 };
const SCENT_MONSTERS = { 6: 1, 7: 1, 8: 1, 9: 2, 10: 1 };
const MIMIC_MONSTERS = { 8: 1, 9: 1 };
const STALKER_MONSTERS = { 10: 1 };
const MUFFLER_MONSTERS = { 11: 1 };
const SINGER_MONSTERS = { 12: 1 };
/** Per-mode exceptions to the tables above: { mode: { level: { echo, scent, mimic, stalker, muffler, singer } } } (a level not listed here follows the tables; a kind left out is 0). */
const MODE_MONSTERS = {
  easy: {
    9: { echo: 0, scent: 1, mimic: 1 },
    10: { stalker: 1 },
    11: { muffler: 1 },
    12: { singer: 1 },
  },
};

/** Difficulty curve. Everything scales with the level number n (1-based) and the mode. */
function levelConfig(n, modeId = 'normal') {
  const m = MODES[modeId] || MODES.normal;
  const baseEnemies = n === 1 ? 0 : Math.min(1 + Math.floor((n - 2) * 0.7), 8);
  const baseScent = n < SCENT_FROM_LEVEL ? 0 : n < 9 ? 1 : 2;
  const basePuddles = n < SCENT_FROM_LEVEL ? 0 : Math.min(3 + (n - SCENT_FROM_LEVEL), 10);
  const scheduled = n in ECHO_MONSTERS; // levels 1-12 have an exact schedule; anything past them uses the fallback formula
  const pick = MODES[modeId] ? modeId : 'normal';
  const exception = scheduled && MODE_MONSTERS[pick] ? MODE_MONSTERS[pick][n] : undefined; // this mode's own mix for this level, if it has one
  const echoCount = exception ? exception.echo || 0 : scheduled ? ECHO_MONSTERS[n] : Math.min(Math.max(2, Math.round(baseEnemies * m.count)), 10);
  const scentCount = exception ? exception.scent || 0 : scheduled ? SCENT_MONSTERS[n] || 0 : baseScent === 0 ? 0 : Math.min(Math.max(1, Math.round(baseScent * m.count)), 4);
  const mimicCount = exception ? exception.mimic || 0 : scheduled ? MIMIC_MONSTERS[n] || 0 : n >= MIMIC_FROM_LEVEL ? 1 : 0;
  const stalkerCount = exception ? exception.stalker || 0 : scheduled ? STALKER_MONSTERS[n] || 0 : n >= STALKER_FROM_LEVEL ? 1 : 0;
  const mufflerCount = exception ? exception.muffler || 0 : scheduled ? MUFFLER_MONSTERS[n] || 0 : 0; // (nothing past level 12)
  const singerCount = exception ? exception.singer || 0 : scheduled ? SINGER_MONSTERS[n] || 0 : 0;
  const enemySpeed = Math.min((70 + n * 8) * m.speed, m.speedCap); // px/s while hunting
  const puddlesWanted = basePuddles === 0 ? 0 : Math.max(2, Math.round(basePuddles * m.puddles)); // what the formula asks for (the generator draws this many)
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
    puddles: PUDDLE_CAP[n] ? Math.min(puddlesWanted, PUDDLE_CAP[n]) : puddlesWanted, // how many the level ends up with (level 9 is capped: two scent monsters, no swamp)
    puddlesDrawn: puddlesWanted, // how many the generator draws before the cap is applied (so the random numbers, and everything drawn after them, stay exactly as before)
    // the mimic (level 8+) and the sonar decoy (level 8+)
    mimics: mimicCount, // see MIMIC_MONSTERS
    decoy: n >= DECOY_FROM_LEVEL, // one to find on the level
    // the stalker (level 10+): hears you (never a ripple, an echo or a decoy), a little slower than an echo monster
    stalkers: stalkerCount, // see STALKER_MONSTERS
    stalkerSpeed: Math.min(enemySpeed * STALKER_SPEED_FACTOR, STALKER_TOP_SPEED), // px/s, patrolling and hunting alike
    // the muffler (level 11): cannot be seen, absorbs ripples, hears you (a crouch only from close up)
    mufflers: mufflerCount, // see MUFFLER_MONSTERS
    mufflerSpeed: Math.min((70 + 8 * n) * m.speed * MUFFLER_SPEED_FACTOR, MUFFLER_TOP_SPEED), // px/s, patrolling and hunting alike; always < 170
    mufflerFootstepRadius: m.mufflerFootstepRadius,
    mufflerPresenceRadius: m.mufflerPresenceRadius,
    mufflerCrouchRadius: m.mufflerCrouchRadius,
    mufflerMemorySeconds: m.mufflerMemorySeconds,
    // the singer (level 12): sings ripples; one that reaches you marks you, and it leaps to that spot
    singers: singerCount, // see SINGER_MONSTERS
    singerSpeed: enemySpeed * SINGER_SPEED_FACTOR, // px/s walking (its LEAP is a jump and is the one fast thing about it)
    markSeconds: m.markSeconds,
    landRadius: m.landRadius,
    singInterval: m.singInterval,
    singRange: m.singRange,
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
  //    Puddles are always at least 3 tiles apart. A level with a cap on its puddles (PUDDLE_CAP: level 9, two scent
  //    monsters) still DRAWS the full number - so every random number after this is exactly what it always was - and
  //    then keeps only the first `cfg.puddles` of them (see the return below); the decoy below is still placed as
  //    if none had been dropped.
  const puddlesAll = [];
  const pRoom = shuffle(roomTiles.filter((i) => !blocked[i]), rand);
  const pOther = shuffle(spots.filter((i) => !roomSet.has(i)), rand);
  let pTries = cfg.puddlesDrawn * 10;
  while (puddlesAll.length < cfg.puddlesDrawn && pTries-- > 0 && (pRoom.length || pOther.length)) {
    const idx = pRoom.length && (rand() < 0.8 || !pOther.length) ? pRoom.pop() : pOther.pop();
    if (blocked[idx]) continue;
    const tx = idx % W;
    const ty = (idx / W) | 0;
    if (Math.max(Math.abs(tx - sx), Math.abs(ty - sy)) < 4) continue;
    if (Math.max(Math.abs(tx - ex), Math.abs(ty - ey)) < 2) continue;
    if (puddlesAll.some((p) => Math.hypot(p.tx - tx, p.ty - ty) < 3)) continue;
    puddlesAll.push({
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
        if (puddlesAll.some((p) => Math.hypot(p.tx - tx, p.ty - ty) < 2)) continue;
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

  // 12. Muffler (level 11) and 13. Singer (level 12) - the two newest monsters, placed after everything else and drawing
  //     nothing on a level without one, so levels 1-10 generate exactly as they always did. Both keep the same
  //     distance from the start every monster keeps (at least minStart path tiles), keep away from the other monsters,
  //     and never stand on a tile the route from the start to the exit HAS to pass through (with the tile blocked, the
  //     exit must still be reachable) - so no level can need you to walk through where one spawns.
  const routeSafe = (idx) => {
    const b = blocked.slice();
    b[idx] = 1;
    return bfsDist(b, W, H, startIdx)[exitIdx] >= 0;
  };
  const placeNewMonster = (kind, pitch) => {
    let pick = -1;
    for (const safe of [true, false]) {
      for (const minSep of [8, 5, 2, 0]) {
        for (const idx of spots) {
          if (dS[idx] < minStart || tooClose(idx, minSep) || (safe && !routeSafe(idx))) continue;
          pick = idx;
          break;
        }
        if (pick >= 0) break;
      }
      if (pick >= 0) break;
    }
    if (pick < 0) pick = spots.find((i) => dS[i] >= Math.ceil(minStart / 2) && !tooClose(i, 0)) ?? -1;
    if (pick < 0) return;
    const tx = pick % W;
    const ty = (pick / W) | 0;
    enemies.push({ kind, tx, ty, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, sleeper: false, pitch });
  };
  for (let k = 0; k < cfg.mufflers; k++) placeNewMonster('muffler', 46 + rand() * 8); // its deep hum
  for (let k = 0; k < cfg.singers; k++) placeNewMonster('singer', 200 + rand() * 40); // its sung note

  const puddles = cfg.puddles < puddlesAll.length ? puddlesAll.slice(0, cfg.puddles) : puddlesAll;
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
