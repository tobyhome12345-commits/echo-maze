'use strict';

/**
 * ENDLESS TWISTS (v22.2): with Twists on, some depths of an Endless run are twist levels - one or more of the broken
 * gaol's rules (levels 17-23) laid on top of THAT depth's generated maze, for that one maze only. The schedule is
 * FIXED (SCHEDULE: the same twists at the same depths on every run, so they can be learned) and stops at LAST: after it,
 * no more twists, ever.
 *
 * A twist is the campaign's own mechanic, not a copy: this file only BUILDS `level.act2` (and level.rayWalls /
 * rippleScale / rippleLag) for a generated maze, in exactly the shape js/story.js builds it for 17-23 - and js/game.js
 * then runs the same code it runs there (ghost and hidden walls, dead air, crumbling floor, the void and the creep,
 * the slowed and late ripple), with the same sounds and cues. The campaign levels are not touched at all.
 *
 * Fair, or not at all: a twist level is checked WITH its twist (check): the way out reachable through crumbling floor
 * and ahead of the creep - walking at your speed with at least CREEP.minSpare spare - never anything under the start,
 * and the creep never takes the ground just before the way out. js/level.js generateEndless re-rolls the depth's maze
 * (the next attempt's seed) when a twist will not fit it. Everything here comes from its own random stream (from the
 * depth's seed) - never Math.random, never the generator's numbers - so with Twists off, and at every depth without a
 * twist, Endless is exactly what it was.
 *
 * Never in the editor, its format, share codes or the WORDS lists: twists exist only inside Endless.
 *
 *   SCHEDULE / LAST / at(depth)        the twists at a depth (an array of kinds), or null
 *   apply(lv, depth, mode, seed)       lay a depth's twists on its maze -> { ok, why } (lv is changed only if ok)
 *   check(lv)                          is it fair WITH its twists -> { ok, why, steps, spare }
 */
const EchoTwists = (() => {
  /** THE SCHEDULE: depth -> the twists there. One small table, so it is trivial to change. After LAST: none. */
  const SCHEDULE = {
    5: ['late'], //                       level 20's echo behind: ripples slow, and what they find shown late
    10: ['liar'], //                      level 17's liar: walls drawn that are not there, and real ones not drawn
    15: ['dead'], //                      level 22's dead air: patches a ripple goes into and never comes back from
    20: ['crumble'], //                   level 21's crumble: floor that falls away after you step off it
    25: ['creep'], //                     level 23's creeping edge: the void eats the map from the outside in
    30: ['liar', 'late'],
    35: ['dead', 'crumble'],
    40: ['creep', 'liar'],
    45: ['late', 'dead', 'liar'],
    50: ['creep', 'crumble', 'late'], //  the last twist
  };
  const LAST = 50;
  const KINDS = ['late', 'liar', 'dead', 'crumble', 'creep'];
  const at = (depth) => (depth <= LAST && SCHEDULE[depth] ? SCHEDULE[depth].slice() : null);

  // the rules' numbers - level 20's ripple, and how much of each the other twists lay down
  const LATE = { speed: 0.42, lag: 0.45 };
  const LIAR = { ghosts: 3, hidden: 4, spacing: 7 };
  const DEAD = { patches: 4, size: 3, spacing: 7 };
  const CRUMBLE = { bridges: 3, min: 3, max: 4, spacing: 6 };
  /** 23's creep: rings from the edge, one every `every` s from `start` s (x `easy` on Easy); the pace is slowed until a
   * clean walk has `minSpare` spare (0.5 = you could go half again slower). The ground within `keep` tiles of the way
   * out never goes. */
  const CREEP = { start: 10, every: [6, 7, 8, 9, 10, 11, 12, 13, 14, 16], easy: 1.35, rings: 8, keep: 6, minSpare: 0.5 };
  const VOID_DEPTH = 5; // how the void sounds (js/audio.js voidFall / startVoid): 21's
  const FROM_START = 4; // nothing laid down within this many tiles of the start
  const TAU = TILE / 170; // s a tile, at walking speed
  const CONTROLS_AT = 0.7; // s - the creep is timed as if you could only move from here (as 23 is): extra slack

  // ---------------------------------------------------------------- helpers
  const tileOf = (lv, p) => Math.floor(p.y / TILE) * lv.W + Math.floor(p.x / TILE);
  const nbrs = (lv, i) => {
    const x = i % lv.W;
    const y = (i / lv.W) | 0;
    return [x > 0 ? i - 1 : -1, x < lv.W - 1 ? i + 1 : -1, y > 0 ? i - lv.W : -1, y < lv.H - 1 ? i + lv.W : -1];
  };
  /** The shortest way from the start to the exit, as tiles (start first). */
  function route(lv) {
    const s = tileOf(lv, lv.start);
    const e = tileOf(lv, lv.exit);
    const from = new Int32Array(lv.W * lv.H).fill(-1);
    from[s] = s;
    const q = [s];
    for (let h = 0; h < q.length && from[e] < 0; h++) for (const j of nbrs(lv, q[h])) if (j >= 0 && !lv.blocked[j] && from[j] < 0) {
      from[j] = q[h];
      q.push(j);
    }
    if (from[e] < 0) return [];
    const out = [];
    for (let i = e; ; i = from[i]) {
      out.push(i);
      if (i === s) break;
    }
    return out.reverse();
  }
  const isOpen = (lv, i) => i >= 0 && !lv.blocked[i];
  /** A corridor tile: open on exactly two opposite sides. */
  function corridor(lv, i) {
    const [l, r, u, d] = nbrs(lv, i);
    const h = isOpen(lv, l) && isOpen(lv, r) && !isOpen(lv, u) && !isOpen(lv, d);
    const v = isOpen(lv, u) && isOpen(lv, d) && !isOpen(lv, l) && !isOpen(lv, r);
    return h || v;
  }
  const interior = (lv, i) => {
    const x = i % lv.W;
    const y = (i / lv.W) | 0;
    return x > 0 && y > 0 && x < lv.W - 1 && y < lv.H - 1;
  };
  /** Pick up to n of `list` in a random order, keeping them `spacing` apart along the way (by index in `order`). */
  function spaced(list, n, spacing, rand, order) {
    const pool = list.slice();
    for (let k = pool.length - 1; k > 0; k--) {
      const j = Math.floor(rand() * (k + 1));
      [pool[k], pool[j]] = [pool[j], pool[k]];
    }
    const out = [];
    for (const c of pool) {
      if (out.length >= n) break;
      if (out.every((o) => Math.abs(order(o) - order(c)) >= spacing)) out.push(c);
    }
    return out;
  }

  // ---------------------------------------------------------------- laying them down
  function apply(lv, depth, mode, seed) {
    const kinds = at(depth);
    if (!kinds) return { ok: true, why: '' };
    const rand = mulberry32((seed ^ 0x7a157e55) >>> 0); // (its own stream: the maze's numbers are untouched)
    const W = lv.W;
    const R = route(lv);
    if (R.length < 12) return { ok: false, why: 'the way through is too short for a twist' };
    const s = R[0];
    const e = R[R.length - 1];
    const pos = new Map(R.map((t, k) => [t, k]));
    const spawn = new Set(lv.enemies.map((m) => m.ty * W + m.tx));
    if (lv.decoy) spawn.add(tileOf(lv, lv.decoy));
    const used = new Set([s, e]); // tiles one twist has already taken
    const nearStart = (k) => k < FROM_START;

    const a2 = { kind: 'twist', void: VOID_DEPTH, ghosts: [], hidden: [], slides: [], slideRange: 240, folds: [], foldPair: {}, rayWalls: null, voidGrid: new Uint8Array(W * lv.H), crumbles: [], dead: null, creep: null, part: 1 };
    const blocked = lv.blocked.slice();
    let rippleScale = 0;
    let rippleLag = 0;

    if (kinds.includes('late')) {
      rippleScale = LATE.speed;
      rippleLag = LATE.lag;
    }
    if (kinds.includes('liar')) {
      // ghost walls: across the corridor on the way through (drawn, not there); hidden walls: real walls beside it, not drawn
      const ghostAt = R.filter((t, k) => !nearStart(k) && k < R.length - 2 && corridor(lv, t) && !spawn.has(t) && !used.has(t));
      const ghosts = spaced(ghostAt, LIAR.ghosts, LIAR.spacing, rand, (t) => pos.get(t));
      if (ghosts.length < 2) return { ok: false, why: 'nowhere for the liar\'s ghost walls' };
      const side = [];
      R.forEach((t, k) => {
        if (nearStart(k) || k > R.length - 3) return;
        for (const j of nbrs(lv, t)) if (j >= 0 && lv.walls[j] && interior(lv, j) && !used.has(j)) side.push({ j, k });
      });
      const hidden = spaced(side, LIAR.hidden, LIAR.spacing, rand, (h) => h.k).map((h) => h.j);
      if (hidden.length < 2) return { ok: false, why: 'nowhere for the liar\'s hidden walls' };
      a2.ghosts = ghosts.map((i) => ({ i, tx: i % W, ty: (i / W) | 0, gone: false }));
      a2.hidden = [...new Set(hidden)].map((i) => ({ i, tx: i % W, ty: (i / W) | 0, shown: false }));
      for (const t of ghosts.concat(hidden)) used.add(t);
    }
    if (kinds.includes('dead')) {
      // patches of dead air: a few tiles each, on the way through and beside it
      const seeds = spaced(R.filter((t, k) => k >= FROM_START + 2 && k < R.length - 3 && !used.has(t)), DEAD.patches, DEAD.spacing, rand, (t) => pos.get(t));
      if (seeds.length < 3) return { ok: false, why: 'nowhere for dead air' };
      const dead = new Uint8Array(W * lv.H);
      for (const t of seeds) {
        const patch = [t];
        for (let h = 0; h < patch.length && patch.length < DEAD.size; h++) for (const j of nbrs(lv, patch[h])) if (isOpen(lv, j) && !patch.includes(j) && !used.has(j) && j !== e && patch.length < DEAD.size) patch.push(j);
        for (const i of patch) {
          dead[i] = 1;
          used.add(i);
        }
      }
      a2.dead = dead;
    }
    if (kinds.includes('crumble')) {
      // bridges: a few corridor tiles in a row on the way through, that fall away behind you
      const runs = [];
      for (let k = FROM_START + 1; k < R.length - 3; k++) {
        let n = 0;
        while (n < CRUMBLE.max && k + n < R.length - 2 && corridor(lv, R[k + n]) && !spawn.has(R[k + n]) && !used.has(R[k + n])) n++;
        if (n >= CRUMBLE.min) runs.push({ k, n });
      }
      const picked = spaced(runs, CRUMBLE.bridges, CRUMBLE.spacing + CRUMBLE.max, rand, (r) => r.k);
      if (picked.length < 2) return { ok: false, why: 'nowhere for crumbling floor' };
      for (const r of picked) for (let q = 0; q < r.n; q++) {
        const i = R[r.k + q];
        a2.crumbles.push({ i, state: 0, at: 0 });
        blocked[i] = 1; // (no monster walks onto crumbling floor on purpose - 21's rule)
        used.add(i);
      }
    }
    if (kinds.includes('creep')) a2.creep = 'pending'; // (its pace is worked out against the finished level, below)

    // what a ripple sees, where it is not what is there (17)
    if (a2.ghosts.length || a2.hidden.length) {
      a2.rayWalls = lv.walls.slice();
      for (const g of a2.ghosts) a2.rayWalls[g.i] = 1;
      for (const h of a2.hidden) a2.rayWalls[h.i] = 0;
    }
    const trial = Object.assign({}, lv, { blocked, act2: a2 });
    if (a2.creep === 'pending') {
      // the void from the edges in, the ground just before the way out kept; the slowest pace in the list that is
      // still a creep, and the quickest one that leaves a clean walk real slack
      const dE = bfsDist(lv.blocked, W, lv.H, e);
      const rings = Math.min(CREEP.rings, Math.floor(Math.min(W, lv.H) / 2) - 2);
      let ok = null;
      for (const every of CREEP.every) {
        const cr = EchoStory.creepSchedule(W, lv.H, lv.walls, { start: CREEP.start, every, rings, easy: CREEP.easy }, mode);
        for (const L of cr.layers) L.tiles = L.tiles.filter((i) => !(dE[i] >= 0 && dE[i] <= CREEP.keep) && i !== e);
        for (let i = 0; i < cr.voidAt.length; i++) if ((dE[i] >= 0 && dE[i] <= CREEP.keep) || i === e) cr.voidAt[i] = Infinity;
        trial.act2.creep = cr;
        const c = check(trial);
        if (c.ok) {
          ok = cr;
          break;
        }
      }
      if (!ok) return { ok: false, why: 'the creep cannot be outrun with room to spare' };
      a2.creep = ok;
    }
    const verdict = check(trial);
    if (!verdict.ok) return verdict;
    // fits: lay it on the maze
    lv.blocked = blocked;
    lv.act2 = a2;
    lv.rayWalls = a2.rayWalls;
    lv.rippleScale = rippleScale;
    lv.rippleLag = rippleLag;
    lv.twist = { depth, kinds: kinds.slice(), steps: verdict.steps, spare: verdict.spare, route: verdict.route }; // (route: the way it proved - the test bot walks it)
    return { ok: true, why: '' };
  }

  // ---------------------------------------------------------------- is it fair WITH its twists?
  /**
   * The way out, walking at your speed from the moment you can move: through crumbling floor (a tile you leave is gone -
   * the search is over where you stand AND which crumbling tiles are gone, as 21's solver does) and ahead of the creep
   * (a tile must still be there as you reach it and as you leave it, as 23's does). Ghost walls are floor, hidden ones
   * stone: the true walls decide. Monsters are left out (endlessCheck has placed them fairly). Never something under
   * the start. -> { ok, why, steps, spare } (spare: how much slower than this walk would still get out; Infinity
   * without a creep).
   */
  function check(lv) {
    const a2 = lv.act2;
    const W = lv.W;
    const s = tileOf(lv, lv.start);
    const e = tileOf(lv, lv.exit);
    const cr = (a2 && a2.crumbles) || [];
    const creep = a2 && a2.creep && a2.creep !== 'pending' ? a2.creep : null;
    if (cr.some((c) => c.i === s)) return { ok: false, why: 'crumbling floor under the start' };
    if (a2 && a2.voidGrid && a2.voidGrid[s]) return { ok: false, why: 'the void under the start' };
    if (creep && creep.voidAt[s] < CONTROLS_AT + 3 * TAU) return { ok: false, why: 'the start goes at once' };
    if (creep && creep.voidAt[e] !== Infinity) return { ok: false, why: 'the creep takes the way out' };
    if (cr.length > 30) return { ok: false, why: 'too much crumbling floor to search' };
    const bit = new Map(cr.map((c, k) => [c.i, 1n << BigInt(k)]));
    const voidAt = creep ? creep.voidAt : null;
    const open = (i, mask) => {
      const b = bit.get(i);
      if (b !== undefined) return (mask & b) === 0n;
      return !lv.blocked[i];
    };
    const key = (i, mask) => `${i}:${mask.toString(36)}`;
    const from = new Map([[key(s, 0n), null]]);
    const states = [[s, 0n, 0]];
    let end = null;
    for (let h = 0; h < states.length; h++) {
      if (states.length > 300000) return { ok: false, why: 'too many states to search' };
      const [i, mask, steps] = states[h];
      if (i === e) {
        end = states[h];
        break;
      }
      const t = CONTROLS_AT + steps * TAU;
      const left = bit.has(i) ? mask | bit.get(i) : mask;
      for (const j of nbrs(lv, i)) {
        if (j < 0 || !open(j, left)) continue;
        if (voidAt && (t + TAU >= voidAt[j] || t + TAU >= voidAt[i])) continue; // gone before you get there, or under you as you leave
        const k2 = key(j, left);
        if (from.has(k2)) continue;
        from.set(k2, key(i, mask));
        states.push([j, left, steps + 1]);
      }
    }
    if (!end) return { ok: false, why: creep ? 'the void gets there first' : 'no way through the crumbling floor' };
    let spare = Infinity;
    const path = [];
    for (let k = key(end[0], end[1]); k !== null; k = from.get(k)) path.push(+k.split(':')[0]);
    path.reverse();
    if (voidAt) {
      // the tightest tile of the way it found: (when you leave it) / (when it goes)
      let use = 0;
      path.forEach((tile, k) => {
        if (voidAt[tile] !== Infinity) use = Math.max(use, (CONTROLS_AT + (k + 1) * TAU) / voidAt[tile]);
      });
      spare = use > 0 ? 1 / use - 1 : Infinity;
      if (spare < CREEP.minSpare) return { ok: false, why: `only ${Math.round(spare * 100)}% spare ahead of the creep`, spare };
    }
    return { ok: true, why: '', steps: end[2], spare, route: path };
  }

  return { SCHEDULE, LAST, KINDS, LATE, CREEP, VOID_DEPTH, at, apply, check, route };
})();
