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

/** Difficulty curve. Everything scales with the level number n (1-based). */
function levelConfig(n) {
  return {
    n,
    cw: Math.min(6 + n, 19), // maze width in cells
    ch: Math.min(5 + Math.floor(n * 0.8), 14), // maze height in cells
    loopFrac: Math.min(0.08 + n * 0.015, 0.22), // extra openings -> loops
    rooms: Math.min(1 + Math.floor(n / 2), 8),
    obstacles: Math.min(2 + n, 22),
    enemies: n === 1 ? 0 : Math.min(1 + Math.floor((n - 2) * 0.7), 8),
    enemySpeed: Math.min(70 + n * 8, 145), // px/s while hunting
    searchTime: 5, // seconds a monster listens after reaching the spot it was sent to
    footstepRadius: 130, // px: "too close" - a listening monster hears your steps inside this, and a monster that has locked on keeps tracking you only while you stay inside it
    rippleRadius: Math.max(640 - n * 24, 360),
    cooldown: Math.min(0.7 + n * 0.07, 1.5),
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
function generateLevel(n, runSeed) {
  const cfg = levelConfig(n);
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
      tx,
      ty,
      x: (tx + 0.5) * TILE,
      y: (ty + 0.5) * TILE,
      sleeper: n >= 3 && k % 3 === 2,
      pitch: 44 + rand() * 22,
    });
  }

  return {
    cfg,
    W,
    H,
    walls,
    blocked,
    obstacles,
    enemies,
    start: { x: (sx + 0.5) * TILE, y: (sy + 0.5) * TILE },
    exit: { x: (ex + 0.5) * TILE, y: (ey + 0.5) * TILE, r: EXIT_R },
    pxW: W * TILE,
    pxH: H * TILE,
  };
}
