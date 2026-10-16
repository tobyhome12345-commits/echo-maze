'use strict';

/**
 * THE BONUS LEVELS (v15.2): ready-made levels that come with the game, played from the level editor's area
 * (the Bonus Levels tab beside My Levels). DATA ONLY, one level per entry, each exactly a level in the saved format
 * (docs/level-format.md, schema version 2) - so adding another is adding another entry here, nothing else.
 *
 * They are read through the same untrusted loader as every other level (js/levelstore.js reads each one with
 * EchoLevelFormat.normalise and checks it with EchoLevelCheck; the engine builds it with buildCustomLevel), so a
 * mistake here shows up as one level the list cannot play - it never stops the game. They are never written to:
 * the store refuses to save or delete them, and "Copy to My Levels" makes an editable copy with a new id.
 *
 * Rules for what goes in here (the owner's): neutral titles, no story or lore text, each its own difficulty rating,
 * hand-drawn, and every one of them can be finished (tools/bonus-test.js plays each one through).
 */
const ECHO_BONUS_LEVELS = [
  {
    "format": "echo-maze-level",
    "schemaVersion": 2,
    "id": "bonus-01-crossroads",
    "title": "Crossroads",
    "authorName": "",
    "createdAt": "2026-10-17T12:00:00.000Z",
    "updatedAt": "2026-10-17T12:00:00.000Z",
    "size": { "w": 19, "h": 15 },
    "walls": [
      "###################",
      "#.....#.....#.....#",
      "#.##..#.###.#..##.#",
      "#.#...#...#...#...#",
      "#.#.#####.#.###.#.#",
      "#...#.........#.#.#",
      "###.#.###.###.#.###",
      "#.....#.....#.....#",
      "###.#.###.###.#.###",
      "#...#.........#...#",
      "#.#.#####.#####.#.#",
      "#.#...#.....#...#.#",
      "#.##..#.###.#..##.#",
      "#.....#.....#.....#",
      "###################"
    ],
    "start": { "x": 9, "y": 7 },
    "exits": [
      { "x": 1, "y": 1, "locked": false },
      { "x": 17, "y": 1, "locked": false },
      { "x": 1, "y": 13, "locked": false },
      { "x": 17, "y": 13, "locked": false }
    ],
    "enemies": [],
    "objects": [],
    "effects": [{ "kind": "light", "shape": "circle", "x": 7, "y": 6, "w": 5, "h": 3, "colour": "warm", "intensity": "dim" }],
    "titleCard": "Four exits. Any one of them finishes the level.",
    "palette": "",
    "difficulty": { "rating": "easy", "monsterSpeed": 1, "rippleRange": 1, "hearing": 1 }
  },
  {
    "format": "echo-maze-level",
    "schemaVersion": 2,
    "id": "bonus-02-shortcut",
    "title": "Shortcut",
    "authorName": "",
    "createdAt": "2026-10-17T12:00:00.000Z",
    "updatedAt": "2026-10-17T12:00:00.000Z",
    "size": { "w": 23, "h": 13 },
    "walls": [
      "#######################",
      "#...#.....#.......#...#",
      "#.#.#.###.#.#####.#.###",
      "#.#...#.#...#...#.....#",
      "#.#####.#####.#.#####.#",
      "#.............#.......#",
      "#.#####################",
      "#.##############......#",
      "#.....................#",
      "#.##############......#",
      "#.#################.###",
      "#...................###",
      "#######################"
    ],
    "start": { "x": 1, "y": 9 },
    "exits": [
      { "x": 21, "y": 1, "locked": true },
      { "x": 21, "y": 8, "locked": false }
    ],
    "enemies": [{ "kind": "echo", "x": 18, "y": 8 }],
    "objects": [{ "kind": "key", "x": 7, "y": 3 }],
    "effects": [{ "kind": "light", "shape": "rect", "x": 19, "y": 1, "w": 4, "h": 1, "colour": "pale", "intensity": "dim" }],
    "titleCard": "One exit is close, and guarded. The other needs the key.",
    "palette": "",
    "difficulty": { "rating": "easy", "monsterSpeed": 1, "rippleRange": 1, "hearing": 1 }
  },
  {
    "format": "echo-maze-level",
    "schemaVersion": 2,
    "id": "bonus-03-embers",
    "title": "Embers",
    "authorName": "",
    "createdAt": "2026-10-17T12:00:00.000Z",
    "updatedAt": "2026-10-17T12:00:00.000Z",
    "size": { "w": 27, "h": 19 },
    "walls": [
      "###########################",
      "#.....###.........###.....#",
      "#.........................#",
      "#.....###.........###.....#",
      "#.....###.........###.....#",
      "###############.###########",
      "###############.###########",
      "###.....................###",
      "###.###################.###",
      "###.....................###",
      "###.###########.###########",
      "###.###########.###########",
      "#.......#.........###.....#",
      "#.......#.........###.....#",
      "#.......#.........###.....#",
      "#.......#.................#",
      "#.......#.........###.....#",
      "#.......#.........###.....#",
      "###########################"
    ],
    "start": { "x": 3, "y": 3 },
    "exits": [{ "x": 25, "y": 17, "locked": false }],
    "enemies": [
      { "kind": "echo", "x": 7, "y": 9 },
      { "kind": "echo", "x": 16, "y": 14 }
    ],
    "objects": [],
    "effects": [
      { "kind": "light", "shape": "circle", "x": 1, "y": 1, "w": 5, "h": 4, "colour": "warm", "intensity": "medium" },
      { "kind": "light", "shape": "rect", "x": 9, "y": 1, "w": 9, "h": 4, "colour": "cold", "intensity": "dim" },
      { "kind": "glow", "shape": "circle", "x": 21, "y": 1, "w": 5, "h": 4, "colour": "red", "intensity": "medium" },
      { "kind": "glow", "shape": "rect", "x": 14, "y": 5, "w": 3, "h": 2, "colour": "crimson", "intensity": "dim" },
      { "kind": "glow", "shape": "rect", "x": 1, "y": 12, "w": 7, "h": 6, "colour": "ember", "intensity": "medium" },
      { "kind": "light", "shape": "rect", "x": 21, "y": 12, "w": 5, "h": 6, "colour": "warm", "intensity": "bright" }
    ],
    "titleCard": "",
    "palette": "",
    "difficulty": { "rating": "normal", "monsterSpeed": 1, "rippleRange": 1, "hearing": 1 }
  },
  {
    "format": "echo-maze-level",
    "schemaVersion": 2,
    "id": "bonus-04-lure",
    "title": "Lure",
    "authorName": "",
    "createdAt": "2026-10-17T12:00:00.000Z",
    "updatedAt": "2026-10-17T12:00:00.000Z",
    "size": { "w": 25, "h": 17 },
    "walls": [
      "#########################",
      "#.....#.....#.......#...#",
      "#.....#.###.#.#####.#...#",
      "#.....#...#.#.#...#.#...#",
      "###.#####.#.#.#.#.#.###.#",
      "#.......#.#.#...#.......#",
      "#.#####.#...#####.#####.#",
      "#.#...#.###.#...#.#...#.#",
      "#...#.........#...#.#...#",
      "###.#.#####.#.#####.#.###",
      "#...#.....#.#...........#",
      "#.#####.#.#.#.#####.###.#",
      "#.....#.#...#.#.........#",
      "#####.#.###.#.#.#######.#",
      "#...#.....#.#...........#",
      "#.#...###...#############",
      "#########################"
    ],
    "start": { "x": 1, "y": 15 },
    "exits": [{ "x": 22, "y": 2, "locked": false }],
    "enemies": [
      { "kind": "mimic", "x": 12, "y": 8 },
      { "kind": "scent", "x": 20, "y": 12 }
    ],
    "objects": [
      { "kind": "puddle", "x": 17, "y": 6 },
      { "kind": "puddle", "x": 20, "y": 10 },
      { "kind": "puddle", "x": 11, "y": 11 },
      { "kind": "decoy", "x": 6, "y": 14 }
    ],
    "effects": [{ "kind": "light", "shape": "rect", "x": 10, "y": 7, "w": 5, "h": 3, "colour": "cold", "intensity": "dim" }],
    "titleCard": "There is a decoy on the way. Puddles leave a scent.",
    "palette": "",
    "difficulty": { "rating": "normal", "monsterSpeed": 1, "rippleRange": 1, "hearing": 1 }
  },
  {
    "format": "echo-maze-level",
    "schemaVersion": 2,
    "id": "bonus-05-the-long-way",
    "title": "The Long Way",
    "authorName": "",
    "createdAt": "2026-10-17T12:00:00.000Z",
    "updatedAt": "2026-10-17T12:00:00.000Z",
    "size": { "w": 31, "h": 21 },
    "walls": [
      "###############################",
      "###############################",
      "########.......#############.##",
      "########.#####.#############.##",
      "###..........................##",
      "################.#########.####",
      "#.##############.#########.####",
      "#.##########.#####.......#.####",
      "#.##########.#####.#####.#.####",
      "#.##.........................##",
      "#.##.#######################.##",
      "#.##.#######################.##",
      "#.##.###.........##############",
      "#.##.###.#######.##############",
      "#.#...........................#",
      "#.#.####################.####.#",
      "#.#.################.###.####.#",
      "#.#######.......####.########.#",
      "#.#######.#####.####.########.#",
      "#.............................#",
      "###############################"
    ],
    "start": { "x": 3, "y": 19 },
    "exits": [{ "x": 3, "y": 4, "locked": false }],
    "enemies": [{ "kind": "warden", "variant": "regular", "x": 1, "y": 6 }],
    "objects": [],
    "effects": [
      { "kind": "glow", "shape": "rect", "x": 1, "y": 15, "w": 3, "h": 5, "colour": "crimson", "intensity": "dim" },
      { "kind": "light", "shape": "circle", "x": 2, "y": 3, "w": 4, "h": 3, "colour": "warm", "intensity": "dim" }
    ],
    "titleCard": "A long way to the exit. Keep moving.",
    "palette": "",
    "difficulty": { "rating": "hard", "monsterSpeed": 1, "rippleRange": 1, "hearing": 1 }
  },
  {
    "format": "echo-maze-level",
    "schemaVersion": 2,
    "id": "bonus-06-everything-at-once",
    "title": "Everything at Once",
    "authorName": "",
    "createdAt": "2026-10-17T12:00:00.000Z",
    "updatedAt": "2026-10-17T12:00:00.000Z",
    "size": { "w": 35, "h": 25 },
    "walls": [
      "###################################",
      "#.######.....####...##########...##",
      "#.######.######.......##########.##",
      "#.######.######.......##########.##",
      "#.######..............##########.##",
      "#.######.######.......##########.##",
      "#.######...####..........#####...##",
      "#.######.#.#############.#.#####.##",
      "#.######.#.#############.#.#####.##",
      "#.######.#.#############.....###.##",
      "#.######.#################.#####.##",
      "#.######.######.........##.#####.##",
      "#.#...................#.########.##",
      "#.#.####.######..#..#...########.##",
      "#.#.####.######.........####.....##",
      "#.#.####.######.....#.......####.##",
      "#.#.####.######..#......###.####.##",
      "#.#.#....######.........###.#....##",
      "#.#.#######.#######.#######.####.##",
      "#.#.#######.#######.#######.####.##",
      "#.#.#######.#######.#######......##",
      "#.#.#######.........###############",
      "#.#.###############################",
      "#...###############################",
      "###################################"
    ],
    "start": { "x": 3, "y": 12 },
    "exits": [
      { "x": 30, "y": 1, "locked": false },
      { "x": 28, "y": 9, "locked": true }
    ],
    "enemies": [
      { "kind": "warden", "variant": "upgraded", "x": 1, "y": 1 },
      { "kind": "mimic", "x": 18, "y": 5 },
      { "kind": "scent", "x": 21, "y": 16 }
    ],
    "objects": [
      { "kind": "key", "x": 21, "y": 2 },
      { "kind": "puddle", "x": 19, "y": 12 },
      { "kind": "puddle", "x": 16, "y": 13 },
      { "kind": "puddle", "x": 22, "y": 14 },
      { "kind": "puddle", "x": 18, "y": 15 },
      { "kind": "puddle", "x": 23, "y": 17 }
    ],
    "effects": [
      { "kind": "glow", "shape": "rect", "x": 1, "y": 14, "w": 3, "h": 10, "colour": "crimson", "intensity": "dim" },
      { "kind": "light", "shape": "rect", "x": 15, "y": 2, "w": 7, "h": 5, "colour": "warm", "intensity": "medium" },
      { "kind": "light", "shape": "rect", "x": 15, "y": 11, "w": 9, "h": 7, "colour": "pale", "intensity": "dim" },
      { "kind": "glow", "shape": "circle", "x": 26, "y": 7, "w": 5, "h": 5, "colour": "ember", "intensity": "dim" },
      { "kind": "light", "shape": "circle", "x": 29, "y": 0, "w": 5, "h": 3, "colour": "warm", "intensity": "dim" }
    ],
    "titleCard": "Two ways out. One of them needs the key.",
    "palette": "",
    "difficulty": { "rating": "hardcore", "monsterSpeed": 1, "rippleRange": 1, "hearing": 1 }
  }
];
