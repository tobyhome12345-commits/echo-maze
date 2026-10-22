'use strict';

/**
 * LEVELS 14, 15 AND 16 - AFTER THE CAPTURE.
 *
 * Level 13 ends with the player taken. These three follow on from it, and they are built the way 13 is: each is
 * hand-drawn, the same every time and in every difficulty mode, and never touches the level generator's random
 * numbers (mulberry32) or Math.random - so nothing on levels 1-12 can move because of them.
 *
 *   14  THE GAOL. You wake in a cell. Nothing in here can hurt you; the gaol's door is locked, and somewhere
 *       inside is the key. Water drips from the roof, and every drop is a small ripple of its own that lights a
 *       little of the stone and the bars around it. Find the key, open the door, walk out.
 *   15  THE FALSE EXIT. Partway through, there is LIGHT at the end of a long straight passage - warm, and with a
 *       softer sound than anything down here, as if the maze opens onto the world. It is the Warden. When you
 *       are close it puts the light out and wakes, a sealed passage behind you cracks open in the shaking, and
 *       it comes after you for the rest of the level. It is slower than you (WARDEN_SPEED).
 *   16  THE DEEP. Another one, sealed into the wall behind where you start. It breaks out when you reach the
 *       first gallery, and this one is FASTER than you (WARDEN_UPGRADED_SPEED): it gains a little every second,
 *       so every wrong turn and every pause is ground it takes back. Water drips along the way out.
 *
 * THE SECOND DELIBERATE EXCEPTION TO "YOU NEVER SEE WITHOUT A RIPPLE": the false light on level 15 shines on its
 * own, like level 13's room. It is held to the same standard - walls block it completely: it is drawn only
 * inside what the player could really see from where they stand (their own line-of-sight polygon), and scaled
 * by how much of the light itself is in view. Written down in CLAUDE.md beside level 13's.
 *
 * Two halves, the same shape as js/tutorial.js and js/warden.js:
 *   build(n, cfg)   the maze, in exactly the shape generateLevel() returns. Draws no random numbers at all.
 *   create(env)     the scripted beats - the wake-up, the key, the door, the light, the reveal, the release and
 *                   the walk out of each level - and the drawing and sound that go with them. It can do only
 *                   what `env` lets it: take and give back the controls, walk the player for a beat, open a
 *                   tile, wake a Warden, send a drop of water, speak a line, and say that the level is done.
 *
 * The Warden itself - what each one is and how it is drawn - lives in js/warden.js (VARIANTS); how it hunts is
 * in js/game.js (updateWardenHunt). Its two speeds are WARDEN_SPEED and WARDEN_UPGRADED_SPEED in js/level.js.
 */
const EchoStory = (() => {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (u) => {
    const t = clamp(u, 0, 1);
    return t * t * (3 - 2 * t);
  };

  /**
   * The maps, one character per 40 px tile.
   *   #  wall                    .  floor               S  where you start        X  the way out
   *   b  a row of iron bars across the middle of the tile: you cannot pass, a ripple can (between them)
   *   o  a cell door, standing open
   *   D  the gaol door - a floor tile with a heavy, LOCKED door in it until the key turns
   *   K  the key                 d  water drips here (a small ripple of its own, every few seconds)
   *   W  where a Warden stands   P  a passage sealed with stone, until something cracks it open
   *   p  a pillar (an ordinary obstacle, like the generated levels' boulders and pillars)
   */
  const LEVELS = {
    14: {
      kind: 'gaol',
      map: [
        '###########################',
        '##...##...##...##...#######',
        '##.S.##...##...##...#######',
        '##bob##bbb##bob##bbb#######',
        '#d......d..........d...D..#',
        '##bbb##bob##bob##bbb#####.#',
        '##...##...##.K.##...#####.#',
        '##...##...##...##...#####.#',
        '#########################X#',
        '#########################.#',
        '###########################',
      ],
      // the drop that wakes you, in your own cell beside you (px)
      wakeDrip: { x: 126, y: 72 },
    },
    15: {
      kind: 'light',
      map: [
        '###############################',
        '##########.####################',
        '##########.####################',
        '#..........##.#################',
        '####.#####.##.#################',
        '####.#####.......##############',
        '####.###########.##############',
        '####.###########........#######',
        '####.##############.###.#######',
        '####....X##########.###.#######',
        '####.##################P#######',
        '####.#######.................W#',
        '############.##################',
        '########.....##################',
        '########.######################',
        '########.######################',
        '########....###################',
        '########.######################',
        '####.###.######################',
        '####.###.######################',
        '####.###.######################',
        '#S.......######################',
        '###############################',
      ],
      // the reveal: once you are this close to the light (px, to the Warden's front edge)
      revealDist: 150,
    },
    16: {
      kind: 'deep',
      map: [
        '#####################################',
        '#....#########.......################',
        '#.S..................################',
        '#....#########..p.p..################',
        '##P###########.........##############',
        '#.W.##########..p.p..################',
        '#...##########.......################',
        '##############.......################',
        '###########.#####d###################',
        '###########.#####.###################',
        '#####..d..........###################',
        '#####.###############################',
        '#####d###############################',
        '#####.......d........################',
        '#########.##########.################',
        '#########.##########d################',
        '##################.........##########',
        '##################..........d......##',
        '##################..p.p.p..#######.##',
        '##################.........#######.##',
        '################......p....#######d##',
        '##################.........#######.##',
        '#######################.##########.##',
        '#######################.##########.##',
        '##################################X##',
        '#####################################',
      ],
      // the release: when you step into the first gallery (px)
      tripX: 14 * 40 + 12,
    },
    // ================================================================== ACT 2 (v17.0): THE BROKEN GAOL
    // The gaol is being unmade, drifting into a void. Each level breaks ONE rule of the maze. No words but a hint.
    // Story-only tiles (never in the editor, its format or share codes):
    //   g  GHOST WALL  - a ripple draws it like stone; it is not there. Walk into it and it comes apart (a glitch).
    //   h  HIDDEN WALL - real stone a ripple does NOT draw. Bump it and it thunks - and from then on it shows.
    //   A / B          - a SLIDING WALL: in A to begin with; every ping of yours within `slideRange` sends it
    //                    to its B (the tile beside it), and back. Ground before it moves.
    //   1 2 3 4        - FOLDS, in pairs: step onto one and you are on its pair. A ripple goes through as well.
    //   E  an echo monster      T  a stalker      d  a drip (19: the one sound you can find your way by)
    //   W  (20) a Warden at level 15's speed, in the stone behind you until `wake` s in - then it always knows
    //      where you are, and comes after you
    // (v18.0) ACT 2 PART 2 - the void is real now, and it is taking the maze:
    //   v  VOID - the floor is gone. Step onto it and you fall; so does a monster. Always shown (drawVoid).
    //   c  (21) CRUMBLING FLOOR - it holds you, but a moment after you step OFF it, it cracks and falls into the void
    //   z  (22) DEAD AIR - walkable. A ripple that goes in never comes back; your footsteps in it are lost (nothing
    //      hears them); and a ripple you send from INSIDE it does not set an Alarm off
    //   L  an Alarm (js/game.js, exactly as in the editor) - in the campaign from 22
    // 23 has `creep` (the void eating the map from the edges in, ring by ring, on a fixed schedule) and 24 has
    // `part2` (what you reach through its first way out - js/game.js starts it as level 24, part 2).
    17: {
      kind: 'liar',
      act2: true,
      void: 1,
      map: [
        '#############################',
        '#############################',
        '#S..g..h....#################',
        '######.######################',
        '######.......h............###',
        '##########.########.#####.###',
        '##########.########.#####.###',
        '##########.########.#####.###',
        '#.............g.....#####g###',
        '#.#######.###############.###',
        '#.#######.###############.###',
        '#.#######.###############.###',
        '#.......E.........h......X###',
        '#############################',
      ],
    },
    18: {
      kind: 'shuffle',
      act2: true,
      void: 2,
      slideRange: 240, // px from where you ping to a sliding wall: about six tiles
      map: [
        '###########################',
        '###B########B##############',
        '#S.A........A....##########',
        '################.##########',
        '################.##########',
        '#######..........##########',
        '#######..........###B######',
        '#######....T........A..X###',
        '#######..........######.###',
        '#########.#####A#######.###',
        '#########......B........###',
        '###########################',
      ],
    },
    19: {
      kind: 'loop',
      act2: true,
      void: 3,
      map: [
        '##########################',
        '####################2...X#',
        '##########################',
        '#1.S.d..................1#',
        '########.#################',
        '####.....#...............#',
        '####.###.#.#############.#',
        '####.#...#.#...........#.#',
        '####.#.###.#.#########.#.#',
        '####.......#.#..E......#.#',
        '########.###.#.#######.#.#',
        '########.....#.#########2#',
        '##########################',
      ],
    },
    20: {
      kind: 'behind',
      act2: true,
      void: 4,
      // the ripple, here: it travels at this fraction of its usual speed, and what it finds shows this much later
      ripple: { speed: 0.42, lag: 0.45 },
      // s into the level when the Warden breaks out of the stone just behind where you start (you can move from
      // 0.7 s). It only ever reaches you along the way you came, so this is your head start: about 10 s of standing
      // still in all, more for every stretch you walk (tools/act2-check.js measures it - and fails under 3 s)
      wake: 10.0,
      map: [
        '#############################',
        '#W.S..#.........#...........#',
        '#####.#.#######.#.#########.#',
        '#.....#.#.....#...#.......#.#',
        '#.#####.#.###.#####.#####.#.#',
        '#.#.....#.#.#.......#...#...#',
        '#.#.#####.#.#########.#.###.#',
        '#...#.....#...........#.....#',
        '#####.#############.#######.#',
        '#.....#......E....#.#.......#',
        '#.#####.#########.#.#.#.#####',
        '#.......#.........#...#....X#',
        '#############################',
      ],
    },
    // ================================================================== ACT 2 PART 2 (v18.0): THE VOID IS REAL
    21: {
      kind: 'crumble',
      act2: true,
      void: 5,
      map: [
        // <map21>
        '##################################',
        '#S.cccc.##############vvccccc.Xvv#',
        '###vvvv.##############vvcvvvvvvvv#',
        '#######.#############.cccccccv..v#',
        '#######.vvvvv...#####.vvvvvvcc..v#',
        '#######.ccccc...#####.vvvvvvvvvvv#',
        '#######.vvvvv...####vcv###########',
        '#######.############vcv###########',
        '#######.############vcv###########',
        '##..............p....cvvvv...#####',
        '##.E......p...........cccc...#####',
        '##...................#vvvv...#####',
        '##################################',
        // </map21>
      ],
    },
    22: {
      kind: 'deadair',
      act2: true,
      void: 6,
      map: [
        // <map22>
        '#################################',
        '##.E....#########################',
        '##......#################......##',
        '####.####################.####.##',
        '####.#######....L....####.####.##',
        '####.#######.........####.###zz##',
        '####.#zz####zz.....zz####.###zz##',
        '#S....zz....zz.p...zz.....####.##',
        '##....zz....zz.....zz#########.##',
        '######zz#.##zz...p.zz#########.##',
        '#########.##.........#########.##',
        '#########.################X....##',
        '########.....####################',
        '########...E.####################',
        '#################################',
        // </map22>
      ],
    },
    23: {
      kind: 'creep',
      act2: true,
      void: 7,
      // the void comes in from the edges: ring 0 (the outer wall) goes at `start` s, the next ring `every` s later,
      // and so on for `rings` rings - the same every attempt. Easy: every time x `easy`. Hardcore = Normal.
      creep: { start: 10, every: 6, rings: 8, easy: 1.35 },
      map: [
        // <map23>
        '###################################',
        '#.................................#',
        '#.#######.#######.#######.#######.#',
        '#S#.............................#.#',
        '#.#.###########################.#.#',
        '#.#.#.........................#.#.#',
        '#.#.#.#######################...#.#',
        '#.#.#.#.....................#.#.#.#',
        '#.#.#.#.###################.#.#.#.#',
        '#.#.#.#.###################.#.#.#.#',
        '#.#.#.#.###################.#.#.#.#',
        '#.#.#.#......X#############.#...#.#',
        '#.#.#.#.###################.#.#.#.#',
        '#.#.#.#.###################.#.#.#.#',
        '#.#.#.#.###################.#.#.#.#',
        '#.#.#.#.....................#.#.#.#',
        '#.#.#.#####.#####.######.####...#.#',
        '#.#.#.........................#.#.#',
        '#.#.###########################.#.#',
        '#.#E............................#.#',
        '#.###############################.#',
        '#................................E#',
        '###################################',
        // </map23>
      ],
    },
    24: {
      kind: 'wrong',
      act2: true,
      void: 8,
      map: [
        // <map24>
        '###############################',
        '#S......#...#.....#...........#',
        '#.#####.#.#######.#.#########.#',
        '#.#...#...#.....#...#.......#.#',
        '#.#.#.#####.###.#####.#####.###',
        '#...#.......#.#.......#...#...#',
        '#.###.#####.#.#######.#.#.###.#',
        '#.#...#...#...#.....#...#...#.#',
        '#.#.###.#.#####.###.#######.#.#',
        '#...#...#.E.....#...#.......#.#',
        '###.#.###########.###.#####.#.#',
        '#.....#.......E...#.......#..X#',
        '###############################',
        // </map24>
      ],
      // through the first way out: a smaller copy of it, half eaten, whose real way out is the other way
      part2: {
        wake: 10.0,
        map: [
          // <map24b>
          '#####################',
          '#X.#######....#vvvvv#',
          '##.#######.####vvvvv#',
          '##.###.........vvvvv#',
          '##.vv#.#######.######',
          '##.v##.vvvvvv#.....S#',
          '##.###.#######.vvvv.#',
          '##.....###.....vvvv.#',
          '####.####vvvvv#vvvv.#',
          '####.....vvvvv#W....#',
          '#####################',
          // </map24b>
        ],
      },
    },
  };
  /**
   * (v17.0) THE VOID, by `void` level (17: 1 ... 20: 4). Drawing and sound only - nothing in it is read by anything
   * that decides anything. band: tiles of black creeping in from each edge of the map; staticA: how strong its
   * static is; flick: how much that static flickers; fallEvery: [min, spread] seconds between the distant falls.
   */
  const VOID = {
    1: { band: 1.4, staticA: 0.05, flick: 0.25, fallEvery: [34, 22] },
    2: { band: 2.0, staticA: 0.08, flick: 0.35, fallEvery: [28, 18] },
    3: { band: 2.7, staticA: 0.11, flick: 0.45, fallEvery: [22, 16] },
    4: { band: 3.5, staticA: 0.15, flick: 0.6, fallEvery: [16, 14] },
    // (v18.0) 21-24: the void is real - the static thicker, the falls closer together (the band of black grows less:
    // the void is inside the map now, and the edges must still be readable)
    5: { band: 3.7, staticA: 0.17, flick: 0.65, fallEvery: [14, 12] },
    6: { band: 3.9, staticA: 0.19, flick: 0.7, fallEvery: [12, 10] },
    7: { band: 4.1, staticA: 0.21, flick: 0.75, fallEvery: [11, 9] },
    8: { band: 4.3, staticA: 0.23, flick: 0.8, fallEvery: [10, 8] },
  };
  /** (v17.0) Act 2's levels: hand-drawn like 13-16, each breaking one rule of the maze. */
  const isAct2 = (n) => !!(LEVELS[n] && LEVELS[n].act2);

  const ALARM_PITCH = 1380; // (v18.0) an Alarm's hum: the middle of its range in MONSTER_TYPES (js/level.js)
  const BAR_R = 3.4; // px: an iron bar, seen from above
  const BAR_AT = [7, 20, 33]; // px across its tile: gaps of 6-7 px, and you are 18 px across
  const DOOR_R = 20; // px: the gaol door fills its 40 px doorway (this is the size it is DRAWN at)
  // ...and what is solid of it: a slab across the doorway, as three overlapping circles - the shape a ripple
  // finds and the shape that stops you are the shape that is drawn (it is not a round thing)
  const DOOR_PARTS = [-12, 0, 12];
  const DOOR_PART_R = 8;
  const KEY_R = 11; // px: as big as a lore fragment
  const DRIP_R = 76; // px: how far one drop's ripple reaches
  const LIGHT_RGB = '255,214,160'; // the false light: warm - nothing else down here is
  const LIGHT_REACH = 340; // px: how far it lights the stone around it
  // s into level 16's release beat: you have the controls back at 1.6 s, and it comes out of the wall at this
  const RELEASE_WAKE = 3.0;
  // s into level 15's reveal beat: you have the controls back at 1.9 s, and it starts after you at this
  const REVEAL_WAKE = 2.6;
  // (v17.0) s before level 20's Warden comes out (its `wake`) that the stone behind you splits: the warning
  const ACT2_WARN = 1.5;

  // ------------------------------------------------------------ the maze
  function build(n, cfg, part = 1) {
    // (v18.0) level 24 is played in two parts: the second is its `part2` laid over the level's own settings
    const base = LEVELS[n];
    const spec = part === 2 && base.part2 ? Object.assign({}, base, base.part2, { part: 2, part2: null }) : base;
    const map = spec.map;
    const H = map.length;
    const W = map[0].length;
    const walls = new Uint8Array(W * H);
    const obstacles = [];
    const drips = [];
    const seals = [];
    const barTiles = [];
    let start = null;
    let exit = null;
    let key = null;
    let door = null;
    let hunter = null;
    // (v17.0) Act 2's story-only tiles, and its monsters
    const ghosts = [];
    const hidden = [];
    const slideA = [];
    const slideB = new Set();
    const foldTiles = {};
    const monsters = [];
    // (v18.0) Act 2 part 2's
    const voids = [];
    const crumbleTiles = [];
    const deadTiles = [];
    const c = (tx) => (tx + 0.5) * TILE;
    for (let y = 0; y < H; y++) {
      if (map[y].length !== W) console.warn(`EchoStory: level ${n} row ${y} is ${map[y].length} tiles, not ${W}`);
      for (let x = 0; x < W; x++) {
        const ch = map[y][x];
        const i = y * W + x;
        walls[i] = ch === '#' || ch === 'P' || ch === 'h' || ch === 'A' ? 1 : 0; // (a hidden wall and a sliding wall in A are stone; the void, crumbling floor and dead air are not)
        if (ch === 'S') start = { x: c(x), y: c(y) };
        else if (ch === 'X') exit = { x: c(x), y: c(y), r: EXIT_R };
        else if (ch === 'K') key = { x: c(x), y: c(y), r: KEY_R, taken: false };
        else if (ch === 'D') door = { x: c(x), y: c(y), r: DOOR_R, tx: x, ty: y, solid: true, swing: 0, parts: DOOR_PARTS.map((dy) => ({ x: c(x), y: c(y) + dy, r: DOOR_PART_R })) };
        else if (ch === 'W') hunter = { x: c(x), y: c(y) };
        else if (ch === 'P') seals.push({ tx: x, ty: y });
        else if (ch === 'd') drips.push({ x: c(x), y: c(y) });
        else if (ch === 'p') obstacles.push({ x: c(x), y: c(y), r: OBSTACLE_R });
        else if (ch === 'g') ghosts.push({ i, tx: x, ty: y, gone: false });
        else if (ch === 'h') hidden.push({ i, tx: x, ty: y, shown: false });
        else if (ch === 'A') slideA.push(i);
        else if (ch === 'B') slideB.add(i);
        else if (ch >= '1' && ch <= '4') (foldTiles[ch] = foldTiles[ch] || []).push(i);
        else if (ch === 'E') monsters.push({ kind: 'echo', x: c(x), y: c(y), pitch: 52 });
        else if (ch === 'T') monsters.push({ kind: 'stalker', x: c(x), y: c(y), pitch: 64 });
        else if (ch === 'v') voids.push(i);
        else if (ch === 'c') crumbleTiles.push(i);
        else if (ch === 'z') deadTiles.push(i);
        else if (ch === 'L') monsters.push({ kind: 'alarm', x: c(x), y: c(y), pitch: ALARM_PITCH });
        else if (ch === 'b') {
          barTiles.push(y * W + x);
          for (const bx of BAR_AT) obstacles.push({ x: x * TILE + bx, y: c(y), r: BAR_R, bar: true });
        }
      }
    }
    if (!start || !exit) console.warn(`EchoStory: level ${n} needs a start (S) and a way out (X)`);

    // what cannot be walked through: walls, every tile with a pillar or a row of bars in it, and the gaol door
    const blocked = walls.slice();
    for (const o of obstacles) blocked[Math.floor(o.y / TILE) * W + Math.floor(o.x / TILE)] = 1;
    // (v18.0) no monster ever walks onto the void on purpose - nor onto crumbling floor, so a bridge over the void is
    // the edge of its world (it still falls if the void comes to it)
    for (const i of voids) blocked[i] = 1;
    for (const i of crumbleTiles) blocked[i] = 1;
    if (door) blocked[door.ty * W + door.tx] = 1;

    // Assert what the level depends on (cheap, and the reason a broken map is a warning rather than a mystery):
    // the way out must be reachable once everything has opened - and NOT before, where something has to open it.
    const sIdx = Math.floor(start.y / TILE) * W + Math.floor(start.x / TILE);
    const eIdx = Math.floor(exit.y / TILE) * W + Math.floor(exit.x / TILE);
    const opened = blocked.slice();
    if (door) opened[door.ty * W + door.tx] = 0;
    for (const s of seals) opened[s.ty * W + s.tx] = 0;
    const dOpen = bfsDist(opened, W, H, sIdx);
    const dShut = bfsDist(blocked, W, H, sIdx);
    if (!spec.act2 && dOpen[eIdx] < 0) console.warn(`EchoStory: level ${n}'s way out cannot be reached even with everything open`);
    // 14 (the door) and 15 (the sealed passage): the way out must NOT be reachable until the story opens it -
    // on 14 that is the whole of "the key cannot be skipped"
    if (!spec.act2 && spec.kind !== 'deep' && dShut[eIdx] >= 0) console.warn(`EchoStory: level ${n}'s way out can be reached without opening anything`);
    // 16: the seal is the Warden's - nothing may reach it, and it may reach nothing, until it breaks out
    if (spec.kind === 'deep' && hunter && dShut[Math.floor(hunter.y / TILE) * W + Math.floor(hunter.x / TILE)] >= 0) console.warn(`EchoStory: level ${n}'s Warden is not sealed in`);
    if (key && dShut[Math.floor(key.y / TILE) * W + Math.floor(key.x / TILE)] < 0) console.warn(`EchoStory: level ${n}'s key cannot be reached`);

    const enemies = [];
    if (hunter) enemies.push({ kind: 'warden', x: hunter.x, y: hunter.y, variant: n === 16 ? 'upgraded' : 'regular', pitch: n === 16 ? 41.2 : 46.25 });
    for (const m of monsters) enemies.push(m); // (v17.0: Act 2's ordinary monsters, where the map puts them)

    // (v17.0) ACT 2: what each level's broken rule needs to know (js/game.js reads it; nothing else does)
    let act2 = null;
    if (spec.act2) {
      const slides = slideA.map((a) => {
        const b = [a - 1, a + 1, a - W, a + W].find((j) => slideB.has(j));
        if (b === undefined) console.warn(`EchoStory: level ${n}'s sliding wall at ${a % W},${(a / W) | 0} has no B beside it`);
        return { a, b, on: 0, pending: null, x: (c(a % W) + c(b % W)) / 2, y: (c((a / W) | 0) + c((b / W) | 0)) / 2 };
      });
      const folds = [];
      const foldPair = {};
      for (const k of Object.keys(foldTiles).sort()) {
        const t = foldTiles[k];
        if (t.length !== 2) console.warn(`EchoStory: level ${n}'s fold ${k} has ${t.length} ends, not 2`);
        else {
          folds.push({ a: t[0], b: t[1] });
          foldPair[t[0]] = t[1];
          foldPair[t[1]] = t[0];
        }
      }
      // what a ripple sees, where it is not what is there: a ghost wall is drawn, a hidden one is not
      let rayWalls = null;
      if (ghosts.length || hidden.length) {
        rayWalls = walls.slice();
        for (const g of ghosts) rayWalls[g.i] = 1;
        for (const h of hidden) rayWalls[h.i] = 0;
      }
      // (v18.0) the void (1 = the floor is gone), the crumbling floor, dead air, and 23's schedule
      const voidGrid = new Uint8Array(W * H);
      for (const i of voids) voidGrid[i] = 1;
      let dead = null;
      if (deadTiles.length) {
        dead = new Uint8Array(W * H);
        for (const i of deadTiles) dead[i] = 1;
      }
      const crumbles = crumbleTiles.map((i) => ({ i, state: 0, at: 0 })); // 0 whole, 1 stepped off, 2 cracked, 3 gone
      act2 = { kind: spec.kind, void: spec.void || 1, ghosts, hidden, slides, slideRange: spec.slideRange || 240, folds, foldPair, rayWalls, voidGrid, crumbles, dead, creep: spec.creep ? creepSchedule(W, H, walls, spec.creep, cfg.mode) : null, part: spec.part || 1 };
    }

    const built = {
      cfg,
      W,
      H,
      walls,
      blocked,
      roomTiles: [],
      obstacles,
      puddles: [],
      decoy: null,
      trails: [],
      enemies,
      start,
      exit,
      pathTiles: dOpen[eIdx],
      pxW: W * TILE,
      pxH: H * TILE,
      story: {
        n,
        kind: spec.kind,
        key, // 14: the key, lying on the floor until you take it
        door, // 14: the gaol door, solid and locked until the key turns
        seals, // 15 and 16: passages of stone that open when the story says
        drips, // where water drips (a small ripple of its own)
        barTiles,
        hunterAt: hunter,
        exitMuted: spec.kind === 'light', // 15: no chime from the real way out while it is sealed off
        spec,
      },
      act2,
      rayWalls: act2 ? act2.rayWalls : null, // (17: what a ripple's rays meet instead of level.walls)
      rippleScale: spec.ripple ? spec.ripple.speed : 0, // (20: the ripple's speed, as a fraction of its usual)
      rippleLag: spec.ripple ? spec.ripple.lag : 0, // (20: seconds before what it found is shown)
    };
    if (act2) {
      // Act 2's levels are puzzles of their broken rules: the way out must be reachable THROUGH them (solve)
      const sol = solve(built);
      if (!sol.ok) console.warn(`EchoStory: level ${n} cannot be finished: ${sol.why}`);
      built.pathTiles = sol.ok ? sol.steps : -1;
    }
    return built;
  }

  /**
   * (v18.0) 23: when each tile goes. Ring k (0 = the outer wall, k tiles in from the edge) goes into the void at
   * start + k x every seconds (x `easy` on Easy; Hardcore is Normal), for `rings` rings - fixed, the same every time.
   * Returns { layers: [{ t, tiles }], voidAt: seconds per tile (Infinity: never) }.
   */
  function creepSchedule(W, H, walls, cr, mode) {
    const k = mode === 'easy' ? cr.easy || 1 : 1;
    const voidAt = new Float32Array(W * H).fill(Infinity);
    const layers = [];
    for (let r = 0; r < cr.rings; r++) layers.push({ t: (cr.start + r * cr.every) * k, tiles: [] });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const r = Math.min(x, y, W - 1 - x, H - 1 - y);
        if (r >= cr.rings) continue;
        layers[r].tiles.push(y * W + x);
        voidAt[y * W + x] = layers[r].t;
      }
    }
    return { layers, voidAt };
  }

  /**
   * (v17.0) Can Act 2's level be finished, through its own broken rule? A search over where you stand AND every
   * sliding wall's state (18: a ping of yours toggles each one in range, exactly as the game does - and one never
   * slides onto the tile you are on), stepping through folds (19) and walking through ghost walls but not hidden
   * ones (17). Monsters are left out: this is about the shape of the level. Returns { ok, steps, pings, route, why }.
   * Pure: it reads the level and changes nothing. tools/act2-check.js runs it for 17-20 and fails loudly.
   */
  function solve(level) {
    const W = level.W;
    const H = level.H;
    const a2 = level.act2;
    if (a2 && a2.crumbles && a2.crumbles.length) return solveCrumble(level);
    if (a2 && a2.creep) return solveCreep(level);
    const tileOf = (p) => Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE);
    const s0 = tileOf(level.start);
    const goal = tileOf(level.exit);
    const slides = a2 ? a2.slides : [];
    if (slides.length > 14) return { ok: false, why: 'too many sliding walls to search' };
    const slideOf = new Map(); // tile -> [slide index, is it the A tile]
    slides.forEach((sl, k) => {
      slideOf.set(sl.a, [k, true]);
      slideOf.set(sl.b, [k, false]);
    });
    const blockedAt = (i, bits) => {
      const sl = slideOf.get(i);
      if (sl) return ((bits >> sl[0]) & 1) === 1 ? !sl[1] : sl[1]; // A is stone in state 0, B in state 1
      return level.blocked[i] === 1;
    };
    const fold = a2 ? a2.foldPair : {};
    const range = a2 ? a2.slideRange : 0;
    const pingMask = (i) => {
      const x = ((i % W) + 0.5) * TILE;
      const y = (((i / W) | 0) + 0.5) * TILE;
      let m = 0;
      slides.forEach((sl, k) => {
        if (Math.hypot(sl.x - x, sl.y - y) <= range && sl.a !== i && sl.b !== i) m |= 1 << k;
      });
      return m;
    };
    const N = 1 << slides.length;
    const seen = new Int32Array(W * H * N).fill(-1); // the state it was reached from
    const how = new Int8Array(W * H * N); // 0 a step, 1 a ping
    const q = [s0 * N];
    seen[s0 * N] = s0 * N;
    let head = 0;
    let found = -1;
    while (head < q.length) {
      const key = q[head++];
      const i = Math.floor(key / N);
      const bits = key % N;
      if (i === goal) {
        found = key;
        break;
      }
      const x = i % W;
      const y = (i / W) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j < 0 || blockedAt(j, bits)) continue;
        const to = fold[j] !== undefined ? fold[j] : j; // a fold puts you on its pair
        const k2 = to * N + bits;
        if (seen[k2] >= 0) continue;
        seen[k2] = key;
        how[k2] = 0;
        q.push(k2);
      }
      if (slides.length) {
        const m = pingMask(i);
        if (m) {
          const k2 = i * N + (bits ^ m);
          if (seen[k2] < 0) {
            seen[k2] = key;
            how[k2] = 1;
            q.push(k2);
          }
        }
      }
    }
    if (found < 0) return { ok: false, why: 'no way from the start to the way out', steps: -1 };
    const route = [];
    let pings = 0;
    for (let k = found; k !== seen[k] || k !== s0 * N; k = seen[k]) {
      route.push({ tile: Math.floor(k / N), ping: how[k] === 1 });
      if (how[k] === 1) pings++;
      if (k === s0 * N) break;
    }
    route.reverse();
    return { ok: true, steps: route.length - pings, pings, route, why: '' };
  }

  /**
   * (v18.0) 21: the crumbling floor. A crumbling tile holds you once: the moment you step off it, it is gone. So the
   * search is over where you stand AND which crumbling tiles are gone (a set, kept as a bit mask - every crumbling
   * tile you have left). It searches EVERY state it can reach, so it can also say whether there is a way to get
   * STUCK - somewhere the way out can no longer be reached from (`stuck`: how many such places).
   */
  function solveCrumble(level) {
    const W = level.W;
    const H = level.H;
    const cr = level.act2.crumbles;
    const bit = new Map(cr.map((c, k) => [c.i, 1n << BigInt(k)]));
    const tileOf = (p) => Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE);
    const s0 = tileOf(level.start);
    const goal = tileOf(level.exit);
    const open = (i, mask) => {
      const b = bit.get(i);
      if (b !== undefined) return (mask & b) === 0n; // a crumbling tile: there until you have left it
      return level.blocked[i] !== 1;
    };
    const key = (i, mask) => i + ':' + mask.toString(36);
    const from = new Map([[key(s0, 0n), null]]);
    const states = [[s0, 0n]];
    const next = new Map(); // state -> the states it leads to (for the stuck count)
    for (let h = 0; h < states.length; h++) {
      if (states.length > 400000) return { ok: false, why: 'too many states to search', steps: -1 };
      const [i, mask] = states[h];
      const k0 = key(i, mask);
      const outs = [];
      if (i !== goal) {
        const x = i % W;
        const y = (i / W) | 0;
        const left = bit.has(i) ? mask | bit.get(i) : mask; // stepping off a crumbling tile: gone
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
          if (j < 0 || !open(j, left)) continue;
          const k2 = key(j, left);
          outs.push(k2);
          if (from.has(k2)) continue;
          from.set(k2, k0);
          states.push([j, left]);
        }
      }
      next.set(k0, outs);
    }
    // which states can still get out (backwards from every state on the way out)
    const back = new Map();
    for (const [k, outs] of next) for (const o of outs) (back.get(o) || back.set(o, []).get(o)).push(k);
    const canOut = new Set();
    const q = [];
    for (const k of next.keys()) if (+k.split(':')[0] === goal) {
      canOut.add(k);
      q.push(k);
    }
    while (q.length) {
      const k = q.pop();
      for (const p of back.get(k) || []) if (!canOut.has(p)) {
        canOut.add(p);
        q.push(p);
      }
    }
    let stuck = 0;
    for (const k of next.keys()) if (!canOut.has(k)) stuck++;
    // the shortest way out (the states were searched breadth-first, so the first one at the goal is it)
    const end = states.find(([i]) => i === goal);
    if (!end) return { ok: false, why: 'no way from the start to the way out', steps: -1, stuck };
    const route = [];
    for (let k = key(end[0], end[1]); k !== null; k = from.get(k)) route.push({ tile: +k.split(':')[0], ping: false });
    route.reverse();
    return { ok: true, steps: route.length - 1, pings: 0, route, why: '', stuck, states: states.length };
  }

  /**
   * (v18.0) 23: the creep. Every tile is there until its ring goes (voidAt); walking at your speed from the moment you
   * can move, can you always be off a tile before it goes? A breadth-first search in time (waiting never helps: the
   * void only grows). `spare` is how much slower than a clean walk you could go along the way it found and still
   * get out (0.3 = 30% slower), counting from when the level gives you the controls.
   */
  const CREEP_CONTROLS_AT = 0.7; // s: when the level hands you the controls (startAct2)
  function solveCreep(level) {
    const W = level.W;
    const H = level.H;
    const voidAt = level.act2.creep.voidAt;
    const tileOf = (p) => Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE);
    const s0 = tileOf(level.start);
    const goal = tileOf(level.exit);
    const tau = TILE / 170; // s a tile, at walking speed
    const steps = new Int32Array(W * H).fill(-1);
    const from = new Int32Array(W * H).fill(-1);
    steps[s0] = 0;
    const q = [s0];
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      if (i === goal) break;
      const t = CREEP_CONTROLS_AT + steps[i] * tau;
      const x = i % W;
      const y = (i / W) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j < 0 || steps[j] >= 0 || level.blocked[j] === 1) continue;
        if (t + tau >= voidAt[j] || t + tau >= voidAt[i]) continue; // it would be gone before you got there - or under you as you left
        steps[j] = steps[i] + 1;
        from[j] = i;
        q.push(j);
      }
    }
    if (steps[goal] < 0) return { ok: false, why: 'the void gets there first', steps: -1 };
    const route = [];
    for (let i = goal; i >= 0; i = from[i]) route.push({ tile: i, ping: false });
    route.reverse();
    // the tightest tile of the way: (time you leave it) / (time it goes)
    let use = 0;
    route.forEach((r, k) => {
      if (voidAt[r.tile] === Infinity) return;
      use = Math.max(use, (CREEP_CONTROLS_AT + (k + 1) * tau) / voidAt[r.tile]);
    });
    return { ok: true, steps: route.length - 1, pings: 0, route, why: '', spare: use > 0 ? 1 / use - 1 : Infinity };
  }

  // ------------------------------------------------------------ the beats
  /**
   * env (all functions unless said otherwise):
   *   player()              the player                    level()      the level being played
   *   audio, cues           the sound engine and the visual cues (cues.caption only shows with Visual cues on)
   *   calm()                calm mode                     playerR      the player's radius (px)
   *   los(x0, y0, x1, y1)   a clear line between two points (walls only - the game's own hasLOS)
   *   raycast(x, y, dx, dy, max)   distance along a unit direction to the first wall
   *   lock(on)              take the controls away / give them back (the game keeps running underneath)
   *   walk(vx, vy)          move the player at this velocity (px/s) while the controls are taken (0, 0 stops)
   *   openTile(tx, ty)      turn a sealed tile into floor
   *   hunter()              the Warden on this level (a monster in the game's list), or null
   *   wake(e, why)          the Warden starts hunting      hold(on)     freeze every Warden where it is
   *   reveal(e, rp)         the Warden is shown for what it is (rp: the ripple whose rays found it, re-coloured)
   *   gasp()                the involuntary ripple from the player (returns it)
   *   drip(x, y, R, metal)  a drop of water: a small ripple of its own, and its sound
   *   setKey(on)            the player is carrying the key (the HUD shows it)
   *   music(mood)           change the soundtrack's mood ('hope', 'hunt', ...)
   *   banner()              show this level's hint      notify(title, text)   a short message in the same place
   *   ready()               the controls are the player's for the first time this level
   *   finish()              this level is done: on to the next one (or the end)
   *   el                    { box, head, line } - the line on screen when the player speaks
   */
  function create(env) {
    let lv = null; // the level being played, or null
    let S = null; // its story block
    let kind = 'off';
    let phase = 'off';
    let clock = 0; // seconds since the level started (the game's clock: pausing stops it)
    let tl = null; // the scripted beat running now
    let timers = []; // things to do a little later that are not part of a beat (see after)
    let locked = false;
    let veil = 0; // 0..1 of black over everything
    let veilFrom = 0;
    let veilTo = 0;
    let veilT = 0;
    let veilDur = 0;
    let flare = 0; // the reveal's flash, fading
    let quake = 0; // px of extra shake, fading
    let focus = null; // { x, y, k, to, rate }: where the camera is drawn towards for a beat
    let drips = []; // { x, y, period, next, on, metal, rnd }
    let speech = null;
    let doorCd = 0; // seconds before trying the locked door says so again
    let tried = 0; // times the locked door has been tried
    let keyRevealed = false;
    let light = null; // 15: { x, y, k, sight, seen, near, rays }
    let chirpCd = 0;
    let chirpRnd = null;
    let readyDone = false;
    // (v17.0) Act 2
    let glitchT = 0; // s of the screen's glitch still to run
    let glitchBig = false;
    let firstPing = false; // 17: the first ripple stutters
    let fallIn = 0; // s to the next distant fall
    let voidRnd = null;
    let staticCanvas = null; // the void's static: drawn once, moved about
    let foldFlick = 0;

    const P = () => env.player();
    const calm = () => !!env.calm();
    const audio = env.audio;
    const caption = (text) => env.cues && env.cues.caption(text);

    // ----------------------------------------------------------- helpers
    /** A small xorshift of its own (drips, chirps): never Math.random, never the generator's numbers. */
    function rng(seed) {
      let s = seed >>> 0 || 0x9e3779b9;
      return () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return (s >>> 0) / 4294967296;
      };
    }

    /** Run a beat: [[seconds, fn], ...] on the game's clock. Only one runs at a time. */
    function play(events, onEnd) {
      tl = { t: 0, ev: events.slice().sort((a, b) => a[0] - b[0]), i: 0, onEnd };
    }
    function runBeat(dt) {
      if (!tl) return;
      const me = tl;
      me.t += dt;
      while (tl === me && me.i < me.ev.length && me.ev[me.i][0] <= me.t) me.ev[me.i++][1]();
      if (tl === me && me.i >= me.ev.length) {
        tl = null;
        if (me.onEnd) me.onEnd();
      }
    }

    function setLock(on) {
      locked = !!on;
      env.lock(locked);
      if (!locked) env.walk(0, 0);
    }

    /** Give the player the controls, and the first time this level, everything that waited for that. */
    function release() {
      setLock(false);
      if (!readyDone) {
        readyDone = true;
        env.ready();
      }
    }

    /** Fade to (or from) black over `dur` seconds. */
    function fade(to, dur) {
      veilFrom = veil;
      veilTo = to;
      veilT = 0;
      veilDur = Math.max(0.001, dur * (calm() ? 1.25 : 1));
    }

    function shakeBy(px) {
      if (!calm()) quake = Math.max(quake, px);
    }

    /** The player says something: typed out on the game's clock while the explorers' voice says it. */
    function speak(text, o = {}) {
      const cps = o.cps || 15;
      if (speech && speech.voice) speech.voice.stop();
      speech = {
        text,
        t: 0,
        shown: -1,
        cps,
        hold: o.hold === undefined ? 1.7 : o.hold,
        voice: audio ? audio.speak(text, { pitch: 0.94, shake: o.shake || 0.02, vol: o.vol || 0.8, cps }) : null,
      };
      env.hideBanner(); // (the two share the bottom of the screen, and what you say is the one worth reading)
      if (env.el && env.el.box) {
        env.el.head.textContent = 'You';
        env.el.line.textContent = '';
        env.el.box.classList.add('show');
      }
    }
    function updateSpeech(dt) {
      if (!speech) return;
      speech.t += dt;
      const n = Math.min(speech.text.length, Math.floor(speech.t * speech.cps));
      if (n !== speech.shown) {
        speech.shown = n;
        if (env.el && env.el.line) env.el.line.textContent = speech.text.slice(0, n);
      }
      if (speech.t > speech.text.length / speech.cps + speech.hold) hideSpeech();
    }
    function hideSpeech() {
      if (speech && speech.voice) speech.voice.stop();
      speech = null;
      if (env.el && env.el.box) env.el.box.classList.remove('show');
    }

    // ---------------------------------------------------------- the drips
    function setDrips(list, opts = {}) {
      drips = list.map((d, i) => {
        const rnd = rng(0x2f6b1 + i * 7919 + (S ? S.n * 104729 : 0));
        return { x: d.x, y: d.y, period: opts.period || 4.2, next: (opts.first || 0.8) + rnd() * (opts.spread || 3), on: d.on !== false, metal: !!d.metal, rnd, key: !!d.key };
      });
    }
    function updateDrips(dt) {
      for (const d of drips) {
        if (!d.on) continue;
        d.next -= dt;
        if (d.next <= 0) {
          d.next = d.period * (0.75 + 0.5 * d.rnd());
          env.drip(d.x, d.y, DRIP_R, d.metal);
        }
      }
    }

    // ------------------------------------------------------------- start
    function start(level) {
      stop();
      lv = level && level.story ? level : null;
      if (!lv) return;
      S = lv.story;
      kind = S.kind;
      clock = 0;
      tl = null;
      timers = [];
      flare = 0;
      quake = 0;
      focus = null;
      doorCd = 0;
      tried = 0;
      keyRevealed = false;
      readyDone = false;
      light = null;
      chirpCd = 2;
      chirpRnd = rng(0x5eed15);
      veil = 1; // every one of these begins in the dark the last one ended in
      veilFrom = 1;
      veilTo = 1;
      veilDur = 0.001;
      if (kind === 'gaol') startGaol();
      else if (kind === 'light') startLight();
      else if (S.spec.act2) startAct2();
      else startDeep();
    }

    function stop() {
      hideSpeech();
      if (audio) {
        audio.stopDaylight(true);
        audio.stopCistern();
        audio.stopVoid(); // (v17.0)
      }
      glitchT = 0;
      foldFlick = 0;
      lv = null;
      S = null;
      kind = 'off';
      phase = 'off';
      tl = null;
      drips = [];
      timers = [];
      locked = false;
      veil = 0;
      veilTo = 0;
      flare = 0;
      quake = 0;
      focus = null;
      light = null;
    }

    // ============================================================ 14: THE GAOL
    function startGaol() {
      phase = 'wake';
      setLock(true);
      // the drops: the corridor's, and one over the key that only starts once you know you need it
      const list = S.drips.map((d) => ({ x: d.x, y: d.y }));
      list.push({ x: S.key.x, y: S.key.y, on: false, metal: true, key: true });
      setDrips(list, { period: 4.6, first: 5, spread: 4 });
      const wd = S.spec.wakeDrip;
      // THE WAKE. Black; your own breath and a ringing in your ears; the dark lifts a little; one drop of water
      // lands beside you and its ripple shows you the stone and the bars; then you speak, and you can move.
      play(
        [
          [0, () => {
            if (audio) audio.wakeUp();
            caption('[ringing in your ears]');
          }],
          [1.1, () => fade(0, 2.6)],
          [1.3, () => audio && audio.breath(0.9)],
          [2.2, () => env.drip(wd.x, wd.y, DRIP_R + 36, false)], // (a little further than most: it shows you the whole cell)
          [3.0, () => speak('...Still breathing.', { cps: 12 })],
          [4.6, () => {
            phase = 'explore';
            after(1.8, () => env.banner()); // the level's hint, once the line has had its moment
          }],
        ],
        release
      );
    }

    /** The key has been lit by a wave (yours or a drop's). The first time you can SEE it from here, the beat. */
    function onKeyLit() {
      if (kind !== 'gaol' || keyRevealed || S.key.taken || tl || locked) return;
      const p = P();
      const k = S.key;
      if (Math.hypot(p.x - k.x, p.y - k.y) > 380 || !env.los(p.x, p.y, k.x, k.y)) return;
      keyRevealed = true;
      setLock(true);
      if (audio) audio.dripMetal(0, 0.7);
      caption('[metal glints]');
      focus = { x: k.x, y: k.y, k: 0, to: calm() ? 0.45 : 0.7, rate: calm() ? 1.6 : 2.6 };
      play(
        [
          [0.35, () => speak('A key.', { cps: 10, hold: 1.2 })],
          [1.35, () => {
            focus.to = 0;
          }],
        ],
        release
      );
    }

    function tryDoor() {
      const p = P();
      const d = S.door;
      if (!d.solid || locked || tl) return;
      // pressed up against it (the slab, not the doorway round it)
      if (!d.parts.some((q) => Math.hypot(p.x - q.x, p.y - q.y) <= q.r + env.playerR + 4)) return;
      if (S.hasKey) return unlockDoor();
      if (doorCd > 0) return;
      doorCd = 1.5;
      tried++;
      if (audio) audio.doorRattle(0, 0.9);
      if (env.cues) env.cues.pulse('exit', d.x, d.y, 0.9, { key: d, sub: 'rattle' });
      caption('[the door rattles: locked]');
      if (tried === 1) {
        speak('Locked.', { cps: 11, hold: 1.2 });
        // ...and somewhere back there, water starts landing on metal
        for (const dr of drips) {
          if (dr.key) {
            dr.on = true;
            dr.next = 1.4;
          }
        }
      }
    }

    function unlockDoor() {
      const d = S.door;
      setLock(true);
      if (audio) audio.doorUnlock();
      caption('[the key turns]');
      play(
        [
          [0.85, () => caption('[a bolt draws back]')],
          [1.15, () => {
            if (audio) audio.doorOpen();
            caption('[the door grinds open]');
            d.opening = true;
            shakeBy(3);
          }],
          [2.0, () => {
            d.solid = false; // the way is open from here
            env.openTile(d.tx, d.ty);
          }],
          [2.5, () => {
            S.hasKey = false;
            env.setKey(false);
            phase = 'out';
            for (const dr of drips) dr.on = dr.key ? false : dr.on;
          }],
        ],
        release
      );
    }

    function updateGaol(dt) {
      const p = P();
      doorCd = Math.max(0, doorCd - dt);
      if (S.door.opening) S.door.swing = Math.min(1, S.door.swing + dt / 1.1); // it swings back over a second
      if (phase === 'explore' || phase === 'out') {
        // the key: walk onto it
        const k = S.key;
        if (!k.taken && Math.hypot(p.x - k.x, p.y - k.y) < k.r + env.playerR + 2) {
          k.taken = true;
          S.hasKey = true;
          env.setKey(true);
          if (audio) audio.keyPickup();
          caption('[you take the key]');
          for (const dr of drips) if (dr.key) dr.on = false;
        }
        if (S.door.solid) tryDoor();
      }
    }

    // ===================================================== 15: THE FALSE EXIT
    function startLight() {
      phase = 'dark';
      setLock(true);
      const h = env.hunter();
      // The light is where the Warden stands, just in front of it, down the passage it is facing.
      const lx = S.hunterAt.x - 9;
      const ly = S.hunterAt.y;
      // where its own light falls: the stone round it, worked out once (it never moves while it is a light)
      const rays = [];
      const N = 240;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU;
        rays.push(env.raycast(lx, ly, Math.cos(a), Math.sin(a), LIGHT_REACH));
      }
      light = { x: lx, y: ly, k: 1, sight: 0, seen: false, near: false, rays, N, flick: 0 };
      if (h) h.lure = 1;
      play(
        [
          [0, () => fade(0, 1.4)],
          [0.7, () => env.banner()],
        ],
        release
      );
    }

    /** How much of the light is in view from here, 0..1 - a row of points across it, each tested for line of sight. */
    function lightSight(p) {
      let n = 0;
      const pts = [[0, 0], [-10, -12], [-10, 12], [-16, 0], [4, -7], [4, 7]];
      for (const [dx, dy] of pts) if (env.los(p.x, p.y, light.x + dx, light.y + dy)) n++;
      return n / pts.length;
    }

    function updateLight(dt) {
      const p = P();
      const h = env.hunter();
      if (!light) return;
      if (h && h.reachGoal !== undefined) h.reach = (h.reach || 0) + (h.reachGoal - (h.reach || 0)) * Math.min(1, 5 * dt);
      const see = lightSight(p);
      // up gently as it comes into view, and straight down to whatever can be seen when a wall gets in the way
      light.sight = see < light.sight ? see : light.sight + (see - light.sight) * Math.min(1, 6 * dt);
      const d = Math.hypot(p.x - light.x, p.y - light.y);
      if (phase === 'dark' || phase === 'lure') {
        // HOPE, ON PURPOSE. The first sight of it, a softer sound than anything down here, and a line.
        if (!light.seen && see > 0.3 && !locked) {
          light.seen = true;
          phase = 'lure';
          if (audio) audio.startDaylight();
          env.music('hope');
          speak('...Light?', { cps: 10, hold: 1.4 });
        }
        if (light.seen) {
          // the closer, the warmer the air sounds - and only while it is in view
          const near = clamp(1 - (d - 160) / 640, 0, 1);
          if (audio) audio.setDaylight(0.25 + 0.75 * near * Math.max(0.35, light.sight));
          chirpCd -= dt;
          if (chirpCd <= 0 && near > 0.25) {
            chirpCd = 2.8 + 3 * chirpRnd();
            if (audio) audio.birdChirp(clamp((light.x - p.x) / 600, -0.6, 0.6), 0.25 + 0.5 * near);
            caption('[birdsong, far off]');
          }
          if (!light.near && d < 420 && see > 0.3 && !speech) {
            light.near = true;
            speak('Is that... outside?', { cps: 13, hold: 1.4 });
          }
        }
        // the reveal: close enough, and standing in the passage that leads to it
        const front = h ? Math.hypot(p.x - h.x, p.y - h.y) - h.r : d;
        if (!locked && front <= S.spec.revealDist && see > 0.2) revealWarden();
      }
    }

    /**
     * IT WAS NEVER A WAY OUT. The light flickers and goes out, the soft sound is cut off dead, you flinch - a
     * ripple goes out of you whether you want one or not, the same gasp as level 13 - and the wave finds stone
     * that moves. It reaches for you, the floor shakes, and somewhere behind you a sealed passage cracks open.
     */
    function revealWarden() {
      const h = env.hunter();
      phase = 'reveal';
      setLock(true);
      if (audio) audio.stopDaylight(true);
      env.music(null);
      caption('[the light flickers]');
      let rp = null;
      play(
        [
          [0, () => {
            light.flick = 1;
          }],
          [0.55, () => {
            light.k = 0;
            light.flick = 0;
            if (h) h.lure = 0;
            rp = env.gasp(); // you flinch: the ripple goes out on its own
            // ...and the wall answers when the wave really reaches it (well before the next beat, at 1.0 s)
            const p = P();
            const arrive = h ? clamp((Math.hypot(h.x - p.x, h.y - p.y) - h.r) / env.rippleSpeed, 0, 0.4) : 0.25;
            setTimeoutBeat(0.55 + arrive, () => {
              if (h) {
                env.reveal(h, rp);
                h.reachGoal = 0.55; // and it reaches for you - the same limbs as level 13's, not yet all the way
              }
              flare = 1;
              shakeBy(5);
              if (audio) {
                audio.wardenReveal();
                audio.wardenTake(0.65, 0.9);
              }
              caption('[the light moves]');
            });
          }],
          [1.55, () => {
            if (h) h.reachGoal = 0;
          }],
          [1.0, () => {
            for (const s of S.seals) env.openTile(s.tx, s.ty);
            const s0 = S.seals[0];
            const pan = s0 ? clamp(((s0.tx + 0.5) * TILE - P().x) / 300, -0.8, 0.8) : 0;
            if (audio) audio.stoneGrind(pan, 0.8);
            shakeBy(9);
            caption('[stone grinds open behind you]');
          }],
          [1.85, () => {
            S.exitMuted = false; // and now, somewhere, the way out can be heard
            env.music('hunt');
            speak('Run.', { cps: 14, hold: 0.9, shake: 0.12 });
          }],
          [REVEAL_WAKE, () => {
            if (h) env.wake(h, 'hunt'); // a moment for you to turn round, and it is coming
            phase = 'chase';
          }],
        ],
        null
      );
      // the controls come back while it is still gathering itself (the beat goes on to 2.6 s)
      setTimeoutBeat(1.9, release);
    }

    /** Something to do a little later, on the game's clock, without holding a beat open (a banner, a message). */
    function after(seconds, fn) {
      timers.push({ t: seconds, fn });
    }
    function runTimers(dt) {
      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].t -= dt;
        if (timers[i].t <= 0) timers.splice(i, 1)[0].fn();
      }
    }

    /** Something to do partway through the running beat without ending it (it shares the beat's clock). */
    function setTimeoutBeat(at, fn) {
      if (tl) {
        tl.ev.push([at, fn]);
        tl.ev.sort((a, b) => a[0] - b[0]);
      }
    }

    // ======================================================== 16: THE DEEP
    function startDeep() {
      phase = 'calm';
      setLock(true);
      setDrips(S.drips, { period: 3.4, first: 0.6, spread: 2.2 });
      if (audio) audio.startCistern();
      play(
        [
          [0, () => fade(0, 1.4)],
          [0.7, () => env.banner()],
        ],
        release
      );
    }

    function updateDeep() {
      const p = P();
      if (phase === 'calm' && !locked && p.x >= S.spec.tripX) releaseWarden();
    }

    /** ANOTHER ONE. Stone splits far behind you, the seal it was set into falls open, and it comes. */
    function releaseWarden() {
      const h = env.hunter();
      phase = 'release';
      setLock(true);
      env.music(null);
      const s0 = S.seals[0];
      const p = P();
      const sx = s0 ? (s0.tx + 0.5) * TILE : p.x - 400;
      if (audio) audio.stoneSplit(clamp((sx - p.x) / 500, -0.9, 0.9), 0.75);
      caption('[stone splits, far behind you]');
      shakeBy(7);
      for (const s of S.seals) env.openTile(s.tx, s.ty);
      if (h) h.hidden = false; // there is nothing left to pretend to be
      play(
        [
          [0.7, () => speak('Another one.', { cps: 12, hold: 1.1 })],
          [1.6, () => {
            env.music('hunt');
            phase = 'chase';
            release(); // you can move...
            after(1.4, () => env.notify('Faster than you', 'This one gains on you all the time. Keep moving, follow the water, and do not go back.'));
          }],
          // ...and it is still tearing itself out of the wall for a moment longer. That moment is the head start
          // that makes this fair: a clean run reaches the way out well ahead of it, and every wrong turn and
          // every pause spends some of that lead (measured with tools/story-bot.js - see CLAUDE.md, v14.0).
          [RELEASE_WAKE, () => {
            if (audio) audio.stoneGrind(0, 0.45);
            if (h) env.wake(h, 'upgraded');
          }],
        ],
        null
      );
    }

    // ===================================================== 17-20: ACT 2, THE BROKEN GAOL
    // No words, no cutscene: each level opens in the dark the last one ended in, with its hint, and the void around it.
    function startAct2() {
      phase = 'calm';
      setLock(true);
      firstPing = false;
      glitchT = 0;
      foldFlick = 0;
      voidRnd = rng(0x51ab1e + S.n * 7919);
      const V = VOID[S.spec.void] || VOID[1];
      fallIn = V.fallEvery[0] * 0.5 + voidRnd() * V.fallEvery[1];
      setDrips(S.drips, { period: 3.6, first: 0.8, spread: 1.2 }); // (19: the one drip you can find your way by)
      if (audio) audio.startVoid(S.spec.void);
      const ev = [
        [0, () => fade(0, 1.4)],
        [0.7, () => env.banner()],
      ];
      // 16 -> 17: the same fade as 15 -> 16 - and as 17 begins, a low rumble and the picture glitching, once.
      // (v18.0) 24's second part opens the same way, without its hint: the "way out" was not one.
      if (S.spec.part === 2) ev.splice(1, 1);
      if (S.n === 17 || S.spec.part === 2) {
        ev.push([0.15, () => {
          if (audio) {
            audio.stoneGrind(0, 0.35);
            audio.wardenStep(0, 0.6, false, true);
          }
          caption('[a low rumble]');
          glitch(true);
        }]);
      }
      play(ev, release);
      // 20: a Warden in the stone, far off. A moment after you can move, the stone splits and it comes - and from
      // then on it always knows where you are (level 15's, at level 15's speed: you are faster, if you keep going)
      const h = env.hunter();
      if (h && S.spec.wake) {
        // the stone splits first (a warning, as on 16) - and a moment later it is out and coming
        after(S.spec.wake - ACT2_WARN, () => {
          if (!lv || phase === 'leaving') return;
          if (audio) audio.stoneSplit(clamp((h.x - P().x) / 500, -0.9, 0.9), 0.6);
          caption('[stone splits, behind you]');
          shakeBy(4);
          env.music('hunt');
        });
        after(S.spec.wake, () => {
          if (!lv || phase === 'leaving') return;
          if (audio) audio.stoneGrind(clamp((h.x - P().x) / 500, -0.9, 0.9), 0.4);
          env.wake(h, 'hunt');
        });
      }
    }
    function updateAct2(dt) {
      glitchT = Math.max(0, glitchT - dt);
      foldFlick = Math.max(0, foldFlick - dt);
      fallIn -= dt;
      if (fallIn <= 0) {
        // far off, something falls - and never lands
        const V = VOID[S.spec.void] || VOID[1];
        fallIn = V.fallEvery[0] + voidRnd() * V.fallEvery[1];
        if (audio) audio.voidFall(voidRnd() * 1.6 - 0.8, 0.55, S.spec.void);
        caption('[something falls, far away]');
      }
    }
    /** The picture stutters for a moment (a glitch) - and its sound: a burst of static. */
    function glitch(big) {
      glitchT = big ? 0.55 : 0.4;
      glitchBig = !!big;
      if (audio) audio.loreStatic();
    }
    /** (js/game.js) a ripple of yours has gone out. On 17 the first one stutters - the first sign it cannot be trusted. */
    function onPing() {
      if (!lv || kind !== 'liar' || firstPing) return;
      firstPing = true;
      glitch(false);
      caption('[the echo stutters]');
    }
    /** (js/game.js) a fold has just taken you: a brief flicker. */
    function flicker() {
      foldFlick = 0.22;
    }
    /**
     * World space, over everything in the maze: the void eating the edges of the map - bands of black creeping in
     * from every side, and a slow static in them that flickers. Stronger each level (VOID). Drawing only.
     */
    function drawVoid(ctx, artT, now = clock) {
      if (!lv || !S.spec.act2) return;
      drawVoidTiles(ctx, artT, now); // (v18.0: the void inside the map)
      const V = VOID[S.spec.void] || VOID[1];
      const W = lv.pxW;
      const H = lv.pxH;
      const b = V.band * TILE;
      const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(0,0,0,0.92)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(rx, ry, rw, rh);
      };
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      edge(0, 0, b, 0, 0, 0, b, H);
      edge(W, 0, W - b, 0, W - b, 0, b, H);
      edge(0, 0, 0, b, 0, 0, W, b);
      edge(0, H, 0, H - b, 0, H - b, W, b);
      // the static: one small tile of specks, drawn once, laid along the edges and moved on a few times a second
      if (!staticCanvas) {
        staticCanvas = document.createElement('canvas');
        staticCanvas.width = 96;
        staticCanvas.height = 96;
        const g = staticCanvas.getContext('2d');
        const r = rng(0x5747);
        for (let i = 0; i < 420; i++) {
          const v = 120 + Math.floor(r() * 120);
          g.fillStyle = `rgba(${v},${v + 10},${v + 20},${0.25 + r() * 0.6})`;
          g.fillRect(Math.floor(r() * 96), Math.floor(r() * 96), 1 + Math.floor(r() * 2), 1);
        }
      }
      const step = Math.floor(artT * (calm() ? 3 : 6)); // a few new arrangements a second - slow, never a strobe
      const flick = 1 - V.flick * (0.5 + 0.5 * Math.sin(artT * 1.7)) * (calm() ? 0.5 : 1);
      ctx.globalAlpha = V.staticA * flick * (calm() ? 0.6 : 1);
      const pat = ctx.createPattern(staticCanvas, 'repeat');
      if (pat) {
        const ox = (step * 37) % 96;
        const oy = (step * 61) % 96;
        ctx.translate(-ox, -oy);
        ctx.fillStyle = pat;
        ctx.fillRect(ox, oy, b * 0.8, H);
        ctx.fillRect(ox + W - b * 0.8, oy, b * 0.8, H);
        ctx.fillRect(ox, oy, W, b * 0.8);
        ctx.fillRect(ox, oy + H - b * 0.8, W, b * 0.8);
      }
      ctx.restore();
    }

    /**
     * (v18.0) The void INSIDE the map: every tile whose floor is gone, black with the same slow static - always shown,
     * like the void at the edges (it is not something a ripple finds: it is where there is nothing to find). On 23 the
     * next ring to go shows a thin static over it for the last 2 s before it goes. Drawing only.
     */
    const CREEP_WARN = 2.0;
    function drawVoidTiles(ctx, artT, now) {
      const a2 = lv.act2;
      if (!a2 || !a2.voidGrid) return;
      const W = lv.W;
      const g = a2.voidGrid;
      let any = false;
      const path = new Path2D();
      for (let i = 0; i < g.length; i++) {
        if (!g[i]) continue;
        any = true;
        path.rect((i % W) * TILE, Math.floor(i / W) * TILE, TILE, TILE);
      }
      const warn = [];
      if (a2.creep) {
        for (const L of a2.creep.layers) {
          const left = L.t - now;
          if (left > 0 && left < CREEP_WARN) warn.push({ L, k: 1 - left / CREEP_WARN });
        }
      }
      if (!any && !warn.length) return;
      ensureStatic();
      const V = VOID[S.spec.void] || VOID[1];
      const step = Math.floor(artT * (calm() ? 3 : 6));
      ctx.save();
      if (any) {
        ctx.fillStyle = 'rgba(0,0,0,0.94)';
        ctx.fill(path);
        const pat = ctx.createPattern(staticCanvas, 'repeat');
        if (pat) {
          try {
            pat.setTransform(new DOMMatrix([1, 0, 0, 1, -((step * 37) % 96), -((step * 61) % 96)])); // the static moves; the void does not
          } catch (e) {
            /* an old browser: the static simply stands still */
          }
          ctx.globalAlpha = Math.min(0.5, V.staticA * 2.2) * (calm() ? 0.6 : 1);
          ctx.fillStyle = pat;
          ctx.fill(path);
        }
      }
      // 23: the next ring, about to go - a faint static over it, thickening (never a flash)
      for (const w of warn) {
        const wp = new Path2D();
        for (const i of w.L.tiles) if (!g[i]) wp.rect((i % W) * TILE, Math.floor(i / W) * TILE, TILE, TILE);
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(0,0,0,${0.45 * w.k})`;
        ctx.fill(wp);
        const pat = ctx.createPattern(staticCanvas, 'repeat');
        if (pat) {
          ctx.globalAlpha = 0.35 * w.k * (calm() ? 0.6 : 1);
          ctx.fillStyle = pat;
          ctx.fill(wp);
        }
      }
      ctx.restore();
    }
    function ensureStatic() {
      if (staticCanvas) return;
      staticCanvas = document.createElement('canvas');
      staticCanvas.width = 96;
      staticCanvas.height = 96;
      const g = staticCanvas.getContext('2d');
      const r = rng(0x5747);
      for (let i = 0; i < 420; i++) {
        const v = 120 + Math.floor(r() * 120);
        g.fillStyle = `rgba(${v},${v + 10},${v + 20},${0.25 + r() * 0.6})`;
        g.fillRect(Math.floor(r() * 96), Math.floor(r() * 96), 1 + Math.floor(r() * 2), 1);
      }
    }

    // ===================================================== the way out of each
    /** The player has reached this level's way out (js/game.js asks, instead of finishing the level itself). */
    function atExit() {
      if (!lv || phase === 'leaving' || phase === 'wake' || phase === 'reveal' || phase === 'release') return;
      if (kind === 'gaol' && S.door && S.door.solid) return; // (cannot happen: the door is in the way)
      phase = 'leaving';
      hideSpeech();
      setLock(true);
      env.hold(true); // whatever was behind you stops where it is
      if (kind === 'gaol') {
        // THE LAST BEAT OF THE GAOL: you keep walking, the cold comes up the passage, and the dark closes in
        env.walk(0, 55);
        if (audio) audio.draught();
        caption('[cold air]');
        play(
          [
            [0.4, () => speak('Out. Not free. Just out.', { cps: 13, hold: 1.2 })],
            [1.0, () => fade(1, 2.0)],
            [3.4, () => env.walk(0, 0)],
            [3.6, () => env.finish()],
          ],
          null
        );
      } else {
        env.walk(0, 0);
        if (audio) audio.breath(1);
        env.music(null);
        // (v18.0) 24: its first way out feels exactly like any other - and leads into its second part, not out
        const onward = kind === 'wrong' && S.spec.part !== 2;
        play(
          [
            [0.2, () => fade(1, 1.1)],
            [1.5, () => (onward ? env.nextPart() : env.finish())],
          ],
          null
        );
      }
    }

    // --------------------------------------------------------------- update
    function update(dt) {
      if (!lv) return;
      clock += dt;
      if (veilT < veilDur) {
        veilT = Math.min(veilDur, veilT + dt);
        veil = veilFrom + (veilTo - veilFrom) * smooth(veilT / veilDur);
      } else veil = veilTo;
      flare = Math.max(0, flare - dt / 0.9);
      quake = Math.max(0, quake - dt * 14);
      if (focus) {
        focus.k += (focus.to - focus.k) * Math.min(1, focus.rate * dt);
        if (focus.to === 0 && focus.k < 0.01) focus = null;
      }
      if (light && light.flick > 0) {
        // two slow dips and out - under two a second, nowhere near anything that could flash
        light.flick = Math.max(0, light.flick - dt / 0.55);
        const u = 1 - light.flick;
        light.k = calm() ? 1 - 0.6 * u : 0.65 + 0.35 * Math.cos(u * 4 * Math.PI) * (1 - u * 0.4);
      }
      updateDrips(dt);
      updateSpeech(dt);
      runTimers(dt);
      runBeat(dt);
      if (!lv) return; // (the beat may have finished the level)
      if (kind === 'gaol') updateGaol(dt);
      else if (kind === 'light') updateLight(dt);
      else if (S.spec.act2) updateAct2(dt);
      else updateDeep(dt);
    }

    // -------------------------------------------------------------- drawing
    /** World space, under the ripples: level 15's light, and everything it falls on. */
    function draw(ctx, artT) {
      if (!lv || kind !== 'light' || !light) return;
      const p = P();
      const g = light.k * light.sight * (0.9 + 0.1 * Math.sin(artT * 0.8));
      if (g <= 0.004) return;
      ctx.save();
      // OCCLUSION: only what the player could really see from where they stand. The light is an exception to
      // the ripple, never to the walls.
      const vis = env.visible(p.x, p.y);
      ctx.beginPath();
      for (let i = 0; i < vis.length; i += 2) {
        if (i) ctx.lineTo(vis[i], vis[i + 1]);
        else ctx.moveTo(vis[i], vis[i + 1]);
      }
      ctx.closePath();
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      // 1. a pool of warm light that is simply there
      const pool = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, LIGHT_REACH);
      pool.addColorStop(0, `rgba(${LIGHT_RGB},${0.2 * g})`);
      pool.addColorStop(0.35, `rgba(${LIGHT_RGB},${0.07 * g})`);
      pool.addColorStop(1, `rgba(${LIGHT_RGB},0)`);
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.arc(light.x, light.y, LIGHT_REACH, 0, TAU);
      ctx.fill();
      // 2. the stone it falls on, brighter the nearer the light
      ctx.lineCap = 'round';
      for (let band = 0; band < 5; band++) {
        ctx.beginPath();
        for (let i = 0; i < light.N; i++) {
          const d = light.rays[i];
          if (d >= LIGHT_REACH) continue;
          const b = Math.min(4, Math.floor((1 - d / LIGHT_REACH) * 5));
          if (b !== band) continue;
          const j = (i + 1) % light.N;
          const d2 = light.rays[j];
          const a = (i / light.N) * TAU;
          const a2 = (j / light.N) * TAU;
          ctx.moveTo(light.x + Math.cos(a) * d, light.y + Math.sin(a) * d);
          if (d2 < LIGHT_REACH && Math.abs(d2 - d) < 18) ctx.lineTo(light.x + Math.cos(a2) * d2, light.y + Math.sin(a2) * d2);
        }
        const al = ((band + 1) / 5) * ((band + 1) / 5);
        ctx.strokeStyle = `rgba(${LIGHT_RGB},${0.14 * al * g})`;
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,236,206,${0.7 * al * g})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      // 3. the glare at the heart of it - the "opening"
      const glare = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, 54);
      glare.addColorStop(0, `rgba(255,246,228,${0.6 * g})`);
      glare.addColorStop(1, `rgba(${LIGHT_RGB},0)`);
      ctx.fillStyle = glare;
      ctx.beginPath();
      ctx.arc(light.x, light.y, 54, 0, TAU);
      ctx.fill();
      // 4. and where it comes from: a crack of light in what looks like stone (it is the Warden's seam)
      const h = env.hunter();
      if (h && h.lure > 0) EchoWarden.drawHunter(ctx, h.x, h.y, h.r, { a: 0, lure: h.lure * light.k * light.sight, h: Math.PI, lureRgb: LIGHT_RGB, variant: h.variant, t: artT });
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
    }

    /** Screen space, over everything: the fades, and the reveal's flash. */
    function veilDraw(ctx, cw, ch) {
      if (!lv) return;
      // (v17.0) a glitch: the picture tears into a few bands, offset, for a moment - just once, never a strobe.
      // Calm mode: only a slight dimming.
      if (glitchT > 0) {
        const k = glitchT / (glitchBig ? 0.55 : 0.4);
        if (calm()) {
          ctx.fillStyle = `rgba(0,0,0,${0.25 * k})`;
          ctx.fillRect(0, 0, cw, ch);
        } else {
          const r = rng(0x6c17 + Math.floor(glitchT * 30));
          for (let i = 0; i < (glitchBig ? 7 : 4); i++) {
            const y = Math.floor(r() * ch);
            const h = Math.floor(ch * (0.01 + r() * 0.05));
            const dx = Math.floor((r() - 0.5) * cw * 0.06 * k);
            try {
              ctx.drawImage(ctx.canvas, 0, y, cw, h, dx, y, cw, h);
            } catch (e) {
              /* a canvas that cannot be read back: no tear, just the tint */
            }
            ctx.fillStyle = `rgba(95,212,255,${0.06 * k})`;
            ctx.fillRect(0, y, cw, h);
          }
        }
      }
      if (foldFlick > 0) {
        ctx.fillStyle = `rgba(0,0,0,${(calm() ? 0.35 : 0.7) * (foldFlick / 0.22)})`;
        ctx.fillRect(0, 0, cw, ch);
      }
      if (flare > 0.01) {
        const f = flare * flare * (calm() ? 0.3 : 1);
        const grad = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.5);
        grad.addColorStop(0, `rgba(${EchoPalette.rgb('warden')},${0.18 * f})`);
        grad.addColorStop(1, `rgba(${EchoPalette.rgb('warden')},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cw, ch);
      }
      if (veil > 0.001) {
        ctx.fillStyle = `rgba(0,0,0,${veil})`;
        ctx.fillRect(0, 0, cw, ch);
      }
    }

    const shake = () => (lv && !calm() ? quake : 0);
    const camera = () => (focus && focus.k > 0.001 ? focus : null);

    const state = () => ({
      on: !!lv,
      level: S ? S.n : null,
      kind,
      phase,
      clock: +clock.toFixed(3),
      beat: tl ? +tl.t.toFixed(3) : null,
      locked,
      veil: +veil.toFixed(3),
      key: S && S.key ? { taken: S.key.taken, carried: !!S.hasKey, revealed: keyRevealed, x: S.key.x, y: S.key.y } : null,
      door: S && S.door ? { solid: S.door.solid, swing: +S.door.swing.toFixed(3), tried } : null,
      light: light ? { k: +light.k.toFixed(3), sight: +light.sight.toFixed(3), seen: light.seen, x: light.x, y: light.y } : null,
      exitMuted: S ? !!S.exitMuted : false,
      drips: drips.map((d) => ({ x: d.x, y: d.y, on: d.on, metal: d.metal })),
      speaking: speech ? speech.text : null,
      act2: S && S.spec.act2 ? { glitch: +glitchT.toFixed(3), firstPing, fallIn: +fallIn.toFixed(2), flicker: +foldFlick.toFixed(3) } : null, // (v17.0)
    });

    return {
      start,
      stop,
      update,
      draw,
      veil: veilDraw,
      shake,
      camera,
      atExit,
      onKeyLit,
      onPing, // (v17.0)
      flicker,
      drawVoid,
      state,
      get on() {
        return !!lv;
      },
      get locked() {
        return locked;
      },
    };
  }

  return { LEVELS, BAR_R, DOOR_R, KEY_R, DRIP_R, LIGHT_RGB, build, create, solve, isAct2, creepSchedule };
})();
