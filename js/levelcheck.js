'use strict';

/**
 * IS THIS LEVEL PLAYABLE? (v15.0) No UI and no game state: it reads a level in the saved format (js/levelformat.js,
 * already normalised) and says what is wrong with it, in words a player can act on. The editor shows the list
 * while you build, My Levels marks a level "unfinished" by it, and the engine's loader (buildCustomLevel in
 * js/level.js) refuses to play anything it does not pass - so the rule is written exactly once, here.
 *
 * A level is playable when it has a start and an exit, both on floor, on different tiles, the exit can be walked
 * to from the start (through floor tiles, the same four-way steps the game's own pathfinding takes), and nothing
 * is standing inside a wall or on the start. Warnings never stop a level being played.
 *   check(doc) -> { playable, errors: [{ code, text, at }], warnings: [{ code, text, at }], pathTiles }
 *   (`at`: the tiles the problem is about, for the editor to point at; pathTiles: the walk from the start to the
 *    exit in tiles, or -1)
 */
const EchoLevelCheck = (() => {
  const plural = (n, one, many) => (n === 1 ? one : many);

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
    const { start, exit } = doc;

    if (!start) errors.push({ code: 'no-start', text: 'There is no start yet. Pick Start, then click a floor tile.', at: [] });
    else if (wallAt(start)) errors.push({ code: 'start-in-wall', text: 'The start is inside a wall. Move it onto a floor tile.', at: [start] });
    if (!exit) errors.push({ code: 'no-exit', text: 'There is no exit yet. Pick Exit, then click a floor tile.', at: [] });
    else if (wallAt(exit)) errors.push({ code: 'exit-in-wall', text: 'The exit is inside a wall. Move it onto a floor tile.', at: [exit] });
    const same = start && exit && start.x === exit.x && start.y === exit.y;
    if (same) errors.push({ code: 'same-tile', text: 'The start and the exit are on the same tile. Move one of them.', at: [start] });

    let pathTiles = -1;
    if (start && exit && !same && !wallAt(start) && !wallAt(exit)) {
      pathTiles = bfsDist(grid, w, h, start.y * w + start.x)[exit.y * w + exit.x];
      if (pathTiles < 0) errors.push({ code: 'unreachable', text: "The exit can't be reached from the start. Open up a way between them.", at: [start, exit] });
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
    if (exit && doc.enemies.some((e) => e.x === exit.x && e.y === exit.y)) {
      warnings.push({ code: 'monster-on-exit', text: 'A monster is standing on the exit.', at: [exit] });
    }
    return { playable: errors.length === 0, errors, warnings, pathTiles };
  }

  return { check };
})();
