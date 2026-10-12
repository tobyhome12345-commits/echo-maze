'use strict';

/**
 * IS THIS LEVEL PLAYABLE? (v15.0; ways out, objects and difficulty since v15.1) No UI and no game state: it reads a
 * level in the saved format (js/levelformat.js, already normalised) and says what is wrong with it, in words a
 * player can act on. The editor shows the list while you build, My Levels marks a level "unfinished" by it, and the
 * engine's loader (buildCustomLevel in js/level.js) refuses to play anything it does not pass - so the rule is
 * written exactly once, here.
 *
 * A level is playable when it has a start and at least one way out, all on floor, none on the start; at least one
 * way out can be walked to from the start (through floor tiles, the same four-way steps the game's own pathfinding
 * takes; a LOCKED way out is a closed door until you hold the key); a locked way out has a key that can be reached;
 * nothing is standing or lying inside a wall; no monster is on the start; and no hunter (a monster that always
 * knows where you are) can cut off even a perfect run to the way out. Warnings never stop a level being played -
 * a way out that cannot be reached when another can is one, and it is named.
 *   check(doc) -> { playable, errors: [{ code, text, at }], warnings: [{ code, text, at }], pathTiles }
 *   (`at`: the tiles the problem is about, for the editor to point at; pathTiles: the walk from the start to the
 *    nearest way out in tiles, or -1)
 */
const EchoLevelCheck = (() => {
  const plural = (n, one, many) => (n === 1 ? one : many);
  /** The player's walking speed, px/s (WALK_SPEED in js/game.js) - only the hunter check needs it. */
  const PLAYER_SPEED = 170;
  const TILE_PX = 40;
  /** A hunter that arrives on your way less than this many seconds after you is "close": a warning, not an error. */
  const HUNTER_WARN_SECONDS = 1;
  /** How far a hunter reaches: its body and yours (js/warden.js VARIANTS r 18 + the player's 9). */
  const HUNTER_REACH = 27;
  const OBJECT_NAMES = { puddle: 'A puddle', decoy: 'The sonar decoy', key: 'The key', note: 'A note' };

  /** Walk back down a distance field from `to` to the source: the tiles of one shortest route, source first. */
  function route(dist, w, h, to) {
    if (dist[to] < 0) return null;
    const out = [to];
    let c = to;
    while (dist[c] > 0) {
      const x = c % w;
      const want = dist[c] - 1;
      const next = [c - 1, c + 1, c - w, c + w].find((n, k) => n >= 0 && n < w * h && (k > 1 || Math.abs((n % w) - x) === 1) && dist[n] === want);
      if (next === undefined) break;
      out.push(next);
      c = next;
    }
    return out.reverse();
  }

  function check(doc) {
    const errors = [];
    const warnings = [];
    if (!doc || !doc.size || !Array.isArray(doc.walls) || !Array.isArray(doc.enemies)) {
      return { playable: false, errors: [{ code: 'unreadable', text: 'This level could not be read.', at: [] }], warnings, pathTiles: -1 };
    }
    const w = doc.size.w;
    const h = doc.size.h;
    const grid = EchoLevelFormat.wallGrid(doc);
    const wallAt = (p) => grid[p.y * w + p.x] === 1;
    const idx = (p) => p.y * w + p.x;
    const start = doc.start;
    const exits = Array.isArray(doc.exits) ? doc.exits : [];
    const objects = Array.isArray(doc.objects) ? doc.objects : [];
    const many = exits.length > 1;
    const exitName = (i) => (many ? `Exit ${i + 1}` : 'The exit');

    if (!start) errors.push({ code: 'no-start', text: 'There is no start yet. Pick Start, then click a floor tile.', at: [] });
    else if (wallAt(start)) errors.push({ code: 'start-in-wall', text: 'The start is inside a wall. Move it onto a floor tile.', at: [start] });
    if (!exits.length) errors.push({ code: 'no-exit', text: 'There is no exit yet. Pick Exit, then click a floor tile.', at: [] });
    exits.forEach((e, i) => {
      if (wallAt(e)) errors.push({ code: 'exit-in-wall', text: `${exitName(i)} is inside a wall. Move it onto a floor tile.`, at: [e] });
      if (start && e.x === start.x && e.y === start.y) errors.push({ code: 'same-tile', text: `The start and ${many ? exitName(i) : 'the exit'} are on the same tile. Move one of them.`, at: [start] });
    });

    // the key and the locked ways out
    const key = objects.find((o) => o.kind === 'key') || null;
    const lockedAny = exits.some((e) => e.locked);
    if (lockedAny && !key) {
      const locked = exits.filter((e) => e.locked);
      errors.push({ code: 'no-key', text: `${locked.length === 1 && !many ? 'The exit is' : locked.length === 1 ? `${exitName(exits.indexOf(locked[0]))} is` : `${locked.length} exits are`} locked, but there is no key. Place a key, or unlock ${plural(locked.length, 'it', 'them')}.`, at: locked.map((e) => ({ x: e.x, y: e.y })) });
    }

    // objects inside walls
    const objInWall = objects.filter(wallAt);
    if (objInWall.length) {
      errors.push({
        code: 'object-in-wall',
        text: objInWall.length === 1 ? `${OBJECT_NAMES[objInWall[0].kind] || 'An object'} is inside a wall. Move it onto floor.` : `${objInWall.length} objects are inside walls. Move them onto floor.`,
        at: objInWall.map((o) => ({ x: o.x, y: o.y })),
      });
    }

    // Can you get there? Without the key a locked way out is a shut door (`noKey`); with it every door opens (`withKey`).
    let pathTiles = -1;
    let dNoKey = null;
    let dKey = null;
    const reach = new Array(exits.length).fill(false);
    let keyOk = false;
    if (start && !wallAt(start)) {
      const shut = grid.slice();
      for (const e of exits) if (e.locked) shut[idx(e)] = 1;
      dNoKey = bfsDist(shut, w, h, idx(start));
      dKey = bfsDist(grid, w, h, idx(start));
      keyOk = !!key && !wallAt(key) && dNoKey[idx(key)] >= 0;
      if (lockedAny && key && !wallAt(key) && !keyOk) errors.push({ code: 'key-unreachable', text: "The key can't be reached from the start. Open up a way to it.", at: [{ x: key.x, y: key.y }] });
      exits.forEach((e, i) => {
        if (wallAt(e) || (e.x === start.x && e.y === start.y)) return;
        const open = !e.locked && dNoKey[idx(e)] >= 0;
        const viaKey = keyOk && dKey[idx(e)] >= 0;
        reach[i] = open || viaKey;
        if (reach[i]) {
          const d = open ? dNoKey[idx(e)] : dKey[idx(e)];
          if (pathTiles < 0 || d < pathTiles) pathTiles = d;
        }
      });
      const candidates = exits.filter((e, i) => !wallAt(e) && !(e.x === start.x && e.y === start.y) && !(e.locked && !keyOk));
      if (exits.length && !reach.some(Boolean) && candidates.length) {
        errors.push({ code: 'unreachable', text: many ? "None of the exits can be reached from the start. Open up a way to one of them." : "The exit can't be reached from the start. Open up a way between them.", at: [start, ...candidates.map((e) => ({ x: e.x, y: e.y }))] });
      } else if (reach.some(Boolean)) {
        exits.forEach((e, i) => {
          if (!reach[i] && !wallAt(e) && !(e.locked && !keyOk)) warnings.push({ code: 'exit-unreachable', text: `${exitName(i)} can't be reached from the start. The level can still be finished by another exit.`, at: [{ x: e.x, y: e.y }] });
        });
      }
    }

    const inWalls = doc.enemies.filter(wallAt);
    if (inWalls.length) {
      errors.push({
        code: 'monster-in-wall',
        text: `${inWalls.length === 1 ? 'A monster is' : `${inWalls.length} monsters are`} inside ${plural(inWalls.length, 'a wall', 'walls')}. Move ${plural(inWalls.length, 'it', 'them')} onto floor.`,
        at: inWalls.map((e) => ({ x: e.x, y: e.y })),
      });
    }
    if (start && doc.enemies.some((e) => e.x === start.x && e.y === start.y)) {
      errors.push({ code: 'monster-on-start', text: 'A monster is standing on the start. Move one of them.', at: [start] });
    }
    exits.forEach((e, i) => {
      if (doc.enemies.some((m) => m.x === e.x && m.y === e.y)) warnings.push({ code: 'monster-on-exit', text: `A monster is standing on ${many ? exitName(i).toLowerCase() : 'the exit'}.`, at: [{ x: e.x, y: e.y }] });
    });
    // two things on one tile (the editor never does this; data from elsewhere might)
    const things = new Map();
    const note = (p, what) => {
      const k = idx(p);
      if (!things.has(k)) things.set(k, []);
      things.get(k).push(what);
    };
    if (start) note(start, 'start');
    exits.forEach((e) => note(e, 'exit'));
    doc.enemies.forEach((e) => note(e, 'monster'));
    objects.forEach((o) => note(o, 'object'));
    const shared = [...things.entries()].filter(([, l]) => l.includes('object') && l.length > 1);
    if (shared.length) {
      warnings.push({ code: 'object-shares-tile', text: `${shared.length === 1 ? 'An object shares its tile' : `${shared.length} objects share their tiles`} with something else.`, at: shared.map(([k]) => ({ x: k % w, y: (k / w) | 0 })) });
    }

    // HUNTERS (the Level 15 / 16 monsters: they always know where you are, and hunt from the start). Could even a
    // perfect run - straight along the shortest way to a way out, never stopping - be cut off? For each tile of that
    // way, when would you be there, and how soon could a hunter be? (Through the same floor, with shut doors shut.)
    if (errors.length === 0 && start && dNoKey && pathTiles >= 0) {
      const hunters = doc.enemies.filter((m) => m.kind === 'warden');
      if (hunters.length) {
        const shut = grid.slice();
        for (const e of exits) if (e.locked) shut[idx(e)] = 1;
        // your way: to the nearest open way out you can reach without the key - or to the key and on to the nearest door
        let way = null;
        const openTargets = exits.filter((e) => !e.locked && dNoKey[idx(e)] >= 0).sort((a, b) => dNoKey[idx(a)] - dNoKey[idx(b)]);
        if (openTargets.length) way = route(dNoKey, w, h, idx(openTargets[0]));
        else if (keyOk) {
          const fromKey = bfsDist(grid, w, h, idx(key));
          const doors = exits.filter((e) => fromKey[idx(e)] >= 0).sort((a, b) => fromKey[idx(a)] - fromKey[idx(b)]);
          const a = route(dNoKey, w, h, idx(key));
          const b = doors.length ? route(fromKey, w, h, idx(doors[0])) : null;
          if (a && b) way = a.concat(b.slice(1));
        }
        if (way) {
          let worst = Infinity;
          let worstAt = null;
          for (const m of hunters) {
            const v = wardenSpeedFraction(m.variant, doc.difficulty) * PLAYER_SPEED;
            const dW = bfsDist(shut, w, h, idx(m));
            way.forEach((t, step) => {
              if (dW[t] < 0) return;
              const you = (step * TILE_PX) / PLAYER_SPEED;
              const it = Math.max(0, dW[t] * TILE_PX - HUNTER_REACH) / v;
              if (it - you < worst) {
                worst = it - you;
                worstAt = { x: m.x, y: m.y };
              }
            });
          }
          // (the words say where it is, never what it does - the editor names no monster's behaviour)
          if (worst <= 0) errors.push({ code: 'hunter-cuts-off', text: "This level can't be finished: a Level 15 / 16 monster is too close to the way out. Move it further away, slow the monsters down in Level settings, or open another way.", at: [worstAt] });
          else if (worst < HUNTER_WARN_SECONDS) warnings.push({ code: 'hunter-close', text: 'A Level 15 / 16 monster is very close to the way out: this level leaves almost no room for mistakes.', at: [worstAt] });
        }
      }
    }
    return { playable: errors.length === 0, errors, warnings, pathTiles, reach };
  }

  return { check, PLAYER_SPEED };
})();
