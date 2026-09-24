'use strict';

/**
 * LEVEL 13 - THE CAPTURE.
 *
 * A hand-drawn level, the SAME every time, in every difficulty mode. Like the tutorial (js/tutorial.js) it is
 * not generated: it never touches the game's random numbers (mulberry32), so no seed and no maze on levels
 * 1-12 can be moved by it. It holds no monsters, no puddles and no decoy - nothing on level 13 can kill you.
 * Everything else is the game exactly as it always was: you are blind, you move, you ripple, you crouch, and
 * the maze is dark.
 *
 * Except in one place. THE DELIBERATE EXCEPTION TO "YOU NEVER SEE WITHOUT A RIPPLE": the great room at the far
 * end of the maze glows on its own. Its walls and its door become visible as you approach, without you pinging
 * anything - the only such place in the whole game. It is a one-off, it is confined to that room by a clip
 * (you only ever see the part of it you could really see, through the one gap in its wall), and it is written
 * down as an exception in CLAUDE.md beside the mimic's `mimicTell`.
 *
 * What is in the room is a WARDEN: blind and eyeless like everything else down here, big enough to fill half
 * the room, and shaped like the room's own far wall. It does not chase, it does not hunt by footstep, it does
 * not kill on touch. It was simply already there. The only thing that ever shows it is a ripple - and WALKING
 * INTO THE ROOM sends one, whether the player wants to or not: a flinch, a gasp, over before they have taken
 * a breath. When that wave arrives, the wall answers. Nothing about the capture waits on a key.
 *
 * Three halves live here:
 *   build(cfg)    the maze, in the same shape generateLevel() returns, so the rest of the game cannot tell
 *                 the difference. Draws no random numbers of any kind.
 *   create(env)   the dread ramp and the capture itself: a small state machine that reads where the player
 *                 is and writes to the screen and the speakers. It takes control exactly once (at the reveal)
 *                 and never before.
 *   draw / veil   the room's glow, the warden, and the fade to black - all of it drawing only.
 *
 * Everything before the reveal is COSMETIC: the ramp never touches collision, movement speed, ripple range or
 * accuracy, or any other simulated value. Calm mode softens and slows it and never removes it.
 */
const EchoWarden = (() => {
  const TAU = Math.PI * 2;
  const LEVEL = 13; // (js/level.js decides which level number comes here; this is only for the warning below)
  const BG = '#010206'; // the page's own black: what the warden's silhouette is punched out with
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /**
   * The maze, one character per 40 px tile. 27 x 21 tiles = 1080 x 840 px.
   *   #  wall (and the border)      .  corridor floor
   *   S  where you start            G  the great room's floor
   *   D  the door in the far wall - a WALL tile: it is drawn (and chimes, and lights up green in a ripple)
   *      exactly like an exit, and it is never reachable. The warden is in the way, and always was.
   *
   * A single route with six dead ends and one loop around the right-hand side. It reads as a maze - the way
   * on is never obvious - but every branch closes and only one line of corridor reaches the great room, at
   * the top right, through the one gap in its wall at (16, 9).
   */
  const MAP = [
    '###########################',
    '#################GGGGGGGGG#',
    '#################GGGGGGGGG#',
    '###############.#GGGGGGGGG#',
    '###############.#GGGGGGGGG#',
    '###############.#GGGGGGGGGD',
    '###############.#GGGGGGGGG#',
    '###############.#GGGGGGGGG#',
    '###############.#GGGGGGGGG#',
    '###########......GGGGGGGGG#',
    '###########.###############',
    '#####.....#...............#',
    '#####.###########.#######.#',
    '#####.#####.....#.#####.#.#',
    '#####.#####.###.#.#####.#.#',
    '#.....#...#.###.#.#####.#.#',
    '#.###.#.###.###.#######.#.#',
    '#.#.#.#.###.###.........#.#',
    '#.#.#.#.###.#########.###.#',
    '#S..#.............###.....#',
    '###########################',
  ];

  const ROOM_T = { x0: 17, y0: 1, x1: 25, y1: 9 }; // the great room, in tiles (inclusive)
  const MOUTH_T = { x: 16, y: 9 }; // the ONE gap in its wall
  const ENTRY_T = { x: 17, y: 9 }; // the first floor tile inside it - the dread ramp measures from here
  const DOOR_T = { x: 26, y: 5 }; // the door, buried in the far wall
  const DOOR_R = 26; // px: bigger than an ordinary exit (EXIT_R is 16). It is a door, not a crack.

  /**
   * The warden's body: eight overlapping circles, hugging the far wall and sealed against the room's top and
   * bottom walls (the gaps left are 10 px, and the player is 18 px across), so the door behind it can never be
   * reached. Before the reveal these are handed to the ripple as WALL - stone colour, stone texture, stone
   * echo - and to `moveCircle` as something solid. There is nothing to tell them apart from the room's own
   * far wall, which is the whole point.
   */
  const FRONT_COUNT = 19;
  const BODY = (() => {
    const out = [];
    // The front: a column of heavily overlapping circles down a slowly waving line, so what the light finds is
    // a lumpy EDGE rather than a row of balls. Every number here is a fixed function of how far down the line
    // it is - there is no randomness of any kind in the shape, and it is the same in every run.
    for (let i = 0; i < FRONT_COUNT; i++) {
      const u = i / (FRONT_COUNT - 1);
      const y = 56 + u * 328;
      const x = 926 - 26 * Math.sin(Math.PI * u) + 18 * Math.sin(u * 11.2) + 8 * Math.sin(u * 27);
      out.push({ x, y, r: 38 });
    }
    // and the mass behind it, packed from there to the far wall the door is set into. It is kept clear of the
    // corridor that runs along under the room: this thing belongs to the room and nowhere else (build() checks).
    for (let i = 0; i < 5; i++) out.push({ x: 970, y: 74 + i * 72, r: 84 });
    return out;
  })();

  // ------------------------------------------------------- what it looks like
  /**
   * A small xorshift of its own, run ONCE while this file loads, to cut the warden's outline and scatter its
   * cracks. It is not the game's randomness and not the level generator's (mulberry32): it never touches
   * Math.random, it is never run again, and every table below it is therefore a fixed table - the same stone,
   * in the same place, in every run of every mode.
   */
  function rng(seed) {
    let s = seed >>> 0 || 0x9e3779b9;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  const MID = { x: 948, y: 220 }; // the middle of the mass: what its outline is cut around

  /** How wide the body is at this height: [left, right] in px, or null above or below all of it. */
  function spanAt(y) {
    let L = Infinity;
    let R = -Infinity;
    for (const c of BODY) {
      const dy = y - c.y;
      if (Math.abs(dy) >= c.r) continue;
      const w = Math.sqrt(c.r * c.r - dy * dy);
      if (c.x - w < L) L = c.x - w;
      if (c.x + w > R) R = c.x + w;
    }
    return L <= R ? [L, R] : null;
  }

  /**
   * THE CREST - what you see. The circles above are what a ripple hits and what stops you; they are a smooth
   * blob, and a smooth blob is not what this is. So the union's boundary is walked once here and cut into a
   * few dozen long, uneven facets, every one of them pulled INWARDS (so the drawn stone can never claim a
   * millimetre of room the solid body has not got) and roughly one in six of them bitten back into a deeper
   * cleft. Nothing about it is regular and nothing about it is symmetrical: it is worked stone, not an animal.
   */
  const OUTLINE = (() => {
    const N = 288;
    const raw = [];
    for (let i = 0; i < N; i++) {
      const th = (i / N) * TAU;
      const dx = Math.cos(th);
      const dy = Math.sin(th);
      let far = 0;
      for (const c of BODY) {
        const mx = MID.x - c.x;
        const my = MID.y - c.y;
        const b = mx * dx + my * dy;
        const disc = b * b - (mx * mx + my * my - c.r * c.r);
        if (disc < 0) continue;
        const d = -b + Math.sqrt(disc);
        if (d > far) far = d; // the far side of the outermost circle along this ray IS the union's edge
      }
      raw.push({ th, d: far, x: MID.x + dx * far, y: MID.y + dy * far });
    }
    const R = rng(0x57a9e1);
    const out = [];
    let acc = 1e9;
    let want = 0;
    for (let i = 0; i < N; i++) {
      const p = raw[i];
      const q = raw[(i + N - 1) % N];
      acc += Math.hypot(p.x - q.x, p.y - q.y);
      if (acc < want) continue; // a facet every 24-58 px of edge, so no two are the same length
      acc = 0;
      want = 24 + R() * 34;
      const cleft = R() < 0.17;
      const bite = cleft ? 0.085 + R() * 0.055 : R() * 0.045;
      const d = p.d * (1 - bite);
      out.push({ x: MID.x + Math.cos(p.th) * d, y: MID.y + Math.sin(p.th) * d, th: p.th });
    }
    return out;
  })();

  /** Joints cut into the crest, at the same two-in-five the game's own walls have (js/art.js, wallTexture). */
  const JOINTS = (() => {
    const R = rng(0x1b4c07);
    const out = [];
    for (const p of OUTLINE) {
      if (R() > 0.42) continue;
      const len = 5 + R() * 8;
      out.push([p.x, p.y, p.x - Math.cos(p.th) * len, p.y - Math.sin(p.th) * len]);
    }
    return out;
  })();

  /**
   * Courses: the layers the stone lies in, and - like the masonry of the room it is standing in - broken
   * along each one into blocks with gaps between them, rather than running the whole width as a single line.
   */
  const COURSES = (() => {
    const R = rng(0x2c6f11);
    const out = [];
    for (let y = -6; y < 456; y += 16 + R() * 11) {
      const sp = spanAt(y);
      if (!sp || sp[1] - sp[0] < 70) continue;
      let x = sp[0] + 8 + R() * 16;
      while (x < sp[1] - 24) {
        const end = Math.min(x + 32 + R() * 94, sp[1] - 9);
        const line = [];
        for (let i = 0; i <= 4; i++) {
          const u = i / 4;
          line.push([x + (end - x) * u, y + Math.sin(u * 4.1 + y * 0.09) * 2.4 + (R() - 0.5) * 2.4]);
        }
        out.push(line);
        x = end + 9 + R() * 24; // the gap to the next block along the course
      }
    }
    return out;
  })();

  /** And the cracks across them: jagged, forked - what gives away how long it has been standing here. */
  const CRACKS = (() => {
    const R = rng(0x3ff20d);
    const out = [];
    const walk = (x, y, dx, dy, n) => {
      const line = [];
      for (let i = 0; i <= n; i++) {
        const sp = spanAt(y);
        if (!sp || sp[1] - sp[0] < 30) break;
        line.push([clamp(x, sp[0] + 8, sp[1] - 8), y]);
        x += dx * (0.7 + R() * 0.6);
        y += dy * (0.7 + R() * 0.6) + (R() - 0.5) * 13;
      }
      return line.length > 1 ? line : null;
    };
    // Short steps and plenty of them: a crack is a jagged run of small kinks, not a long straight scratch.
    for (let k = 0; k < 10; k++) {
      const y0 = 8 + k * 42 + R() * 20;
      const sp = spanAt(y0);
      if (!sp) continue;
      const main = walk(sp[0] + 10 + R() * 50, y0, 9 + R() * 7, (R() - 0.5) * 13, 5 + ((R() * 4) | 0));
      if (!main) continue;
      out.push(main);
      const j = main[Math.min(2, main.length - 1)];
      const fork = walk(j[0], j[1], 8, R() < 0.5 ? 12 : -12, 3); // and where it forks
      if (fork) out.push(fork);
    }
    return out;
  })();

  /** Pitting: the small angular chips a surface picks up over a very long time standing perfectly still. */
  const PITS = (() => {
    const R = rng(0x6a10bd);
    const out = [];
    for (let i = 0; i < 130; i++) {
      const y = -6 + R() * 458;
      const sp = spanAt(y);
      if (!sp || sp[1] - sp[0] < 44) continue;
      const x = sp[0] + 9 + R() * (sp[1] - sp[0] - 18);
      const th = R() * TAU;
      const len = 2 + R() * 4;
      const bend = th + 1.6 + R() * 1.2; // two short strokes meeting at an angle: a chip, not a stick
      out.push([
        [x + Math.cos(th) * len, y + Math.sin(th) * len],
        [x, y],
        [x + Math.cos(bend) * len, y + Math.sin(bend) * len],
      ]);
    }
    return out;
  })();

  /**
   * The seam. NOT an eye - nothing down here has eyes - and not a mouth it eats with either: one closed line
   * across the upper third of it, well off the middle, that is the only thing on the whole surface which is
   * not masonry. It opens by a hair, and only while it is reaching.
   */
  const SEAM = (() => {
    const y = 198;
    const sp = spanAt(y);
    const len = (sp[1] - sp[0]) * 0.32;
    const R = rng(0x4d3c21);
    const lip = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      // closed at both ends (sin), and no two bites of it the same depth
      lip.push([-len / 2 + len * u, Math.sin(Math.PI * u) * (0.55 + R() * 0.65)]);
    }
    return { x: sp[0] + (sp[1] - sp[0]) * 0.44, y, len, tilt: 0.14, lip };
  })();

  /**
   * THE LIMBS. Three of them, rooted at three circles down its front edge, each with its own curl and its own
   * thickness - and each drawn as a filled, tapering polygon with the same nicked edge the crest has, never
   * as a line. `jag` is a fixed row of half-width multipliers, so a limb is knobbly in the same places every
   * time it comes out.
   */
  const LIMBS = [
    { i: 3, curl: -1.0, w0: 14, w1: 3, off: -1, claws: 0 },
    { i: 9, curl: 0.25, w0: 17, w1: 4, off: 0.15, claws: 3 }, // the middle one is the hand
    { i: 15, curl: 1.05, w0: 12, w1: 2.6, off: 1, claws: 0 },
  ];
  const LIMB_JAG = (() => {
    const R = rng(0x77b1c5);
    const out = [];
    for (let k = 0; k < LIMBS.length; k++) {
      const row = [];
      for (let i = 0; i < 29; i++) row.push(0.86 + R() * 0.3);
      out.push(row);
    }
    return out;
  })();

  // ---------------------------------------------------------------- numbers
  const DREAD_TILES = 28; // the ramp: how many tiles of REMAINING PATH the dread builds over
  const INSIDE_PX = 760; // px: the player counts as "fully inside" the room past this x (two tiles in)
  // WALKING IN IS THE TRIGGER (owner's instruction). Crossing INSIDE_PX sends the involuntary ripple at once -
  // a gasp, not a decision - so the wall still lights up because a wave washed over it, which is the only way
  // anything is ever seen down here, and the player does not have to press a thing. Nothing waits on input.
  const GASP_REVEAL = 0.4; // s: an involuntary ripple sent from somewhere the wave cannot reach still reveals it
  const WAVE_FALLBACK = 0.5; // s: and if no wave got sent at all, it happens anyway. Nothing can hold this up.
  const MOUTH_SAMPLES = 7; // how finely the one gap in the room's wall is tested for line of sight
  // THE CAPTURE, BEAT BY BEAT. Under three seconds of picture, and it is meant to be: a held breath, a reach,
  // a hit, and then nothing. The sound is handed the first two of these numbers so it peaks on the hit and is
  // still going after the screen has gone (js/audio.js, wardenTake).
  const REVEAL_SECONDS = 0.5; // it lights up, and NOTHING moves: a beat to look at what has been looking at you
  const REACH_SECONDS = 1.3; // the limbs come out of it, thickening as they go; the shake and the hum swell
  const IMPACT_SECONDS = 0.3; // and close: one hard flash, the room's light warps, the floor kicks under you
  const BLACK_SECONDS = 0.8; // out - and the sound carries on past the end of the picture rather than stopping
  const DARK_SECONDS = 1.0; // black, and quiet, before the screen that follows
  // The capture plays IN FULL every time level 13 is finished (owner's instruction). It is the one cutscene
  // in the game that is not once-only: the other seven are things that happened to somebody else and are
  // remembered, and this one is what happens to you, every time you walk into that room.


  // The colours, refilled in place whenever the palette changes (js/palette.js) - exactly as everything else
  // that holds its own copy does, so a palette can never reach anything but the drawing.
  const RGB = {};
  const CORE = {};
  EchoPalette.onChange((rgb, core) => {
    for (const k of ['wall', 'warden', 'exit']) {
      RGB[k] = rgb[k];
      CORE[k] = core[k];
    }
  });

  // --------------------------------------------------------------- the maze
  /** The maze, in the shape generateLevel() returns. Draws no random numbers of any kind. */
  function build(cfg) {
    const H = MAP.length;
    const W = MAP[0].length;
    const walls = new Uint8Array(W * H);
    const roomTiles = [];
    let startTile = null;
    for (let y = 0; y < H; y++) {
      if (MAP[y].length !== W) console.warn(`EchoWarden: row ${y} of the map is ${MAP[y].length} tiles, not ${W}`);
      for (let x = 0; x < W; x++) {
        const ch = MAP[y][x];
        const i = y * W + x;
        walls[i] = ch === '.' || ch === 'G' || ch === 'S' ? 0 : 1; // '#' and the door 'D' are both wall
        if (ch === 'G') roomTiles.push(i);
        if (ch === 'S') startTile = { x, y };
      }
    }
    if (!startTile) console.warn('EchoWarden: the map has no start (S)');

    // The warden's circles, and the tiles they cover marked as blocked. The player is stopped by the CIRCLES
    // (js/game.js moveCircle), not by these tiles; the tiles only keep anything that reads the map honest.
    const circles = BODY.map((c) => ({ x: c.x, y: c.y, r: c.r }));
    const blocked = walls.slice();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (blocked[y * W + x]) continue;
        const cx = (x + 0.5) * TILE;
        const cy = (y + 0.5) * TILE;
        for (const c of circles) {
          if (Math.hypot(cx - c.x, cy - c.y) < c.r) {
            blocked[y * W + x] = 1;
            break;
          }
        }
      }
    }

    // It must stand in the room and nowhere else: not one tile of corridor may be taken by it.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const inRoom = x >= ROOM_T.x0 && x <= ROOM_T.x1 && y >= ROOM_T.y0 && y <= ROOM_T.y1;
        if (!walls[i] && blocked[i] && !inRoom) console.warn(`EchoWarden: the warden is blocking the corridor at (${x}, ${y})`);
      }
    }

    const startIdx = startTile.y * W + startTile.x;
    const entryIdx = ENTRY_T.y * W + ENTRY_T.x;
    const dS = bfsDist(blocked, W, H, startIdx);
    if (dS[entryIdx] < 0) console.warn('EchoWarden: the great room cannot be reached from the start');
    // The dread ramp's own field: how many tiles of walking are left to the room's threshold. It is measured
    // over `walls` (not `blocked`), so every tile of the room's floor has a distance even where the warden
    // stands. Drawing and sound read it; nothing else ever does.
    const toRoom = bfsDist(walls, W, H, entryIdx);

    const roomPx = { x0: ROOM_T.x0 * TILE, y0: ROOM_T.y0 * TILE, x1: (ROOM_T.x1 + 1) * TILE, y1: (ROOM_T.y1 + 1) * TILE };
    return {
      cfg,
      W,
      H,
      walls,
      blocked,
      roomTiles,
      obstacles: [], // no boulders, no pillars
      puddles: [], // nothing to smell
      decoy: null, // and nothing to find
      trails: [],
      enemies: [], // nothing alive that the game knows about: the warden is not a monster (see below)
      start: { x: (startTile.x + 0.5) * TILE, y: (startTile.y + 0.5) * TILE },
      // The door. It chimes and lights up like any exit - and touching it is not how this level ends
      // (js/game.js never runs the exit check here), because the warden is in front of it.
      exit: { x: (DOOR_T.x + 0.5) * TILE, y: (DOOR_T.y + 0.5) * TILE, r: DOOR_R },
      // How far it is to the point of no return, for anything that wants a length. Level 13 has no medals
      // (see CLAUDE.md), so nothing works a par out from it.
      pathTiles: dS[entryIdx] + 2,
      pxW: W * TILE,
      pxH: H * TILE,
      // Everything about the warden that the rest of the game needs to see (the ripple and the collision).
      warden: {
        circles,
        room: roomPx,
        // the room-side face of the one gap in its wall: what you can see the room THROUGH from outside
        mouth: { x: (MOUTH_T.x + 1) * TILE, y0: MOUTH_T.y * TILE, y1: (MOUTH_T.y + 1) * TILE },
        door: { x: (DOOR_T.x + 0.5) * TILE, y: (DOOR_T.y + 0.5) * TILE, r: DOOR_R },
        toRoom, // tiles of remaining path, per tile
        insideX: INSIDE_PX,
        revealed: false, // until a ripple finds it, every ray that reaches it comes back as stone
      },
    };
  }

  // ------------------------------------------------------------ the capture
  /**
   * env:
   *   level()        the level being played (or null) - this does nothing unless it has a `warden`
   *   player()       the player
   *   audio, cues    the sound engine and the visual sound cues
   *   calm()         calm mode
   *   los(x0,y0,x1,y1)   clear line of sight (walls only)
   *   rippleSpeed    px/s, so the reveal lands when the wave really arrives
   *   litBy(rp)      re-colour the rays of this ripple that found the warden (js/game.js owns the ray arrays)
   *   gasp()         send the involuntary ripple - what walking into the room does to you
   *   freeze()       take the controls - called exactly once, at the reveal
   *   enteredRoom()  the player is fully inside: this is what "clearing" level 13 means
   *   taken()        the capture is over; the placeholder ending follows
   */
  function create(env) {
    let lv = null; // the warden level being played, or null
    let phase = 'off'; // off | approach | wave | reveal | reach | impact | black | dark | done
    let t = 0; // seconds in the current phase
    let dread = 0; // 0..1, smoothed: how close the room is, by remaining path
    let glow = 0; // 0..1, smoothed: how much of the room's own light is up
    let sight = 0; // 0..1, smoothed UP only: how much of that light can actually reach the player
    let pending = null; // a ripple on its way to the warden: { rp, at } seconds until it arrives
    let armLen = 0; // 0..1 how far it has reached
    let grab = 0; // 0..1 the hit: the limbs closing on the moment of contact
    let black = 0; // 0..1 how black the screen is
    let flare = 0; // 0..1 the reveal's own flash, fading
    let flash = 0; // 0..1 the hit's flash - one pulse, and gone in a third of a second

    const warden = () => (lv ? lv.warden : null);

    /** Is the player really IN the great room? (Not merely past its left wall - a corridor runs under it.) */
    function insideRoom(p) {
      if (!p) return false;
      const r = warden().room;
      return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
    }

    /**
     * HOW MUCH OF THE ROOM'S LIGHT CAN REACH THE PLAYER, 0..1.
     *
     * The room's glow is the game's one exception to "you only ever see what a ripple lights up" - but it is
     * an exception to the RIPPLE, never to the walls. From outside the room the only way any of it can reach
     * you is through the single gap in its wall, so this asks the game's own line-of-sight test (`env.los` =
     * `hasLOS`, the walls-only DDA the visual sound cues use) for a row of points across that gap's room-side
     * face, and returns the fraction of them you can really see. With stone in the way that is 0, and then
     * nothing whatever is drawn.
     */
    function mouthSight(p) {
      if (!p) return 0;
      if (insideRoom(p)) return 1;
      const m = warden().mouth;
      const span = m.y1 - m.y0 - 12;
      let n = 0;
      for (let i = 0; i < MOUTH_SAMPLES; i++) {
        // just INSIDE the room, never on the tile boundary itself: a ray aimed exactly at the corner of a
        // wall tile can slip diagonally between two of them, and that is how the first cut of this leaked.
        if (env.los(p.x, p.y, m.x + 2, m.y0 + 6 + (span * i) / (MOUTH_SAMPLES - 1))) n++;
      }
      return n / MOUTH_SAMPLES;
    }

    /** How close the room is from here, 0..1, by REMAINING PATH (not by how the crow flies - a wall is a wall). */
    function dreadAt(x, y) {
      if (!lv) return 0;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (tx < 0 || ty < 0 || tx >= lv.W || ty >= lv.H) return 0;
      const d = lv.warden.toRoom[ty * lv.W + tx];
      if (d < 0) return 0;
      return clamp(1 - d / DREAD_TILES, 0, 1);
    }

    /** px from a point to the nearest bit of the warden's surface (negative = inside it). */
    function nearestSurface(x, y) {
      let best = Infinity;
      let at = null;
      for (const c of warden().circles) {
        const d = Math.hypot(c.x - x, c.y - y) - c.r;
        if (d < best) {
          best = d;
          at = c;
        }
      }
      return { d: best, c: at };
    }

    function start(level) {
      lv = level && level.warden ? level : null;
      phase = lv ? 'approach' : 'off';
      t = 0;
      dread = 0;
      glow = 0;
      sight = 0;
      armLen = 0;
      grab = 0;
      black = 0;
      flare = 0;
      flash = 0;
      pending = null;
      if (lv) {
        // Always hidden again at the start of the level, however many times it has been played: the wall is a
        // wall until the player's own ripple says otherwise.
        lv.warden.revealed = false;
        if (env.audio) env.audio.startWardenDrone();
      }
    }

    function stop() {
      lv = null;
      phase = 'off';
      dread = 0;
      glow = 0;
      sight = 0;
      black = 0;
      if (env.audio) env.audio.stopWardenDrone();
    }

    /**
     * The involuntary ripple walking into the room just sent (js/game.js, wardenGasp). It is the only ripple
     * this ever listens to. Nothing here changes the ripple in any way: it is timed, not altered.
     */
    function onRipple(rp) {
      if (!lv || phase !== 'wave' || lv.warden.revealed || pending) return;
      const near = nearestSurface(rp.x, rp.y);
      const reaches = near.d <= rp.R && env.los(rp.x, rp.y, near.c.x, near.c.y);
      // when the wave really arrives - or, from a corner it cannot reach round, shortly anyway
      pending = reaches ? { rp, at: Math.max(0, near.d) / env.rippleSpeed } : { rp: null, at: GASP_REVEAL };
    }

    /** The wave has arrived. This is the one moment the game takes the controls. */
    function doReveal(rp) {
      lv.warden.revealed = true;
      if (rp && env.litBy) env.litBy(rp); // the rays that came back as stone are the warden's colour from now on
      flare = 1;
      phase = 'reveal';
      t = 0;
      if (env.audio) env.audio.wardenReveal();
      if (env.cues) {
        const c = warden().circles[0];
        env.cues.pulse('muffler', c.x, c.y, 1, { big: true });
        env.cues.caption('[the wall moves]');
      }
      env.freeze();
    }

    function update(dt) {
      if (!lv || phase === 'off' || phase === 'done') return;
      const p = env.player();
      const calm = !!env.calm();

      // --- the ramp. Cosmetic, and smoothed: calm mode climbs it more slowly and never gets as far.
      const target = p ? dreadAt(p.x, p.y) : 0;
      dread += (target - dread) * Math.min(1, (calm ? 0.55 : 1.4) * dt);
      const want = phase === 'approach' ? clamp((target - 0.45) / 0.55, 0, 1) : 1;
      glow += (want - glow) * Math.min(1, (calm ? 0.8 : 1.8) * dt);
      // The occlusion. It eases UP, so the room's light arrives as you come round into view of the gap
      // rather than snapping on - and it drops STRAIGHT to whatever you can see the moment you cannot see
      // it, so a wall between you and the room really does block all of it, with nothing trailing behind.
      const see = p ? mouthSight(p) : 0;
      sight = see < sight ? see : sight + (see - sight) * Math.min(1, 9 * dt);
      flare = Math.max(0, flare - dt / 0.9);
      flash = Math.max(0, flash - dt / 0.34);
      if (env.audio) env.audio.setWardenDread(dreadFx(), phase === 'reach' || phase === 'impact' || phase === 'black');

      t += dt;
      switch (phase) {
        case 'approach':
          // "Fully entered the room": inside its walls and two tiles past the gap. That is the trigger, and
          // it is the whole of the trigger - nothing here is waiting on the player to do anything.
          if (p && p.x >= lv.warden.insideX && p.x <= lv.warden.room.x1 && p.y >= lv.warden.room.y0 && p.y <= lv.warden.room.y1) {
            env.enteredRoom(); // this is what "clearing" level 13 means: progress is written down here
            phase = 'wave'; // set BEFORE the gasp: env.gasp() calls straight back into onRipple()
            t = 0;
            env.gasp(); // you walk in, and you flinch. The wave is on its way before you have taken a breath.
          }
          break;
        case 'wave':
          // The involuntary ripple is crossing the room. The controls are still the player's for these last
          // couple of tenths of a second - they are simply not needed for anything any more.
          if (pending) {
            pending.at -= dt;
            if (pending.at <= 0) {
              const rp = pending.rp;
              pending = null;
              doReveal(rp);
            }
          } else if (t >= WAVE_FALLBACK) {
            doReveal(null); // no wave was sent at all (nothing should stop one): it happens regardless
          }
          break;
        case 'reveal':
          // It is lit, and it does NOTHING. The beat is the point: a moment to look at what has been
          // standing in front of the door the whole time before any of it moves.
          if (t >= REVEAL_SECONDS) {
            phase = 'reach';
            t = 0;
            // the sound is given the picture's own timing, so it peaks on the hit and is still going
            // after the screen has gone black rather than being cut off by it
            if (env.audio) env.audio.wardenTake(REACH_SECONDS, IMPACT_SECONDS + BLACK_SECONDS + 0.6);
            if (env.cues) env.cues.caption('[it reaches]');
          }
          break;
        case 'reach':
          armLen = clamp(t / REACH_SECONDS, 0, 1);
          if (t >= REACH_SECONDS) {
            phase = 'impact';
            t = 0;
            armLen = 1;
            flash = 1; // one pulse, on the frame of contact
            if (env.audio) env.audio.wardenGrab();
            if (env.cues) {
              env.cues.pulse('muffler', p ? p.x : 0, p ? p.y : 0, 1, { big: true });
              env.cues.caption('[it has you]');
            }
          }
          break;
        case 'impact':
          grab = clamp(t / IMPACT_SECONDS, 0, 1);
          if (t >= IMPACT_SECONDS) {
            phase = 'black';
            t = 0;
          }
          break;
        case 'black':
          black = clamp(t / BLACK_SECONDS, 0, 1);
          if (black >= 1) {
            phase = 'dark';
            t = 0;
            if (env.audio) env.audio.stopWardenDrone();
          }
          break;
        case 'dark':
          if (t >= DARK_SECONDS) {
            phase = 'done';
            env.taken();
          }
          break;
        default:
          break;
      }
    }

    /** How strong the dread effects are right now. Calm mode: softer, and it never reaches full. */
    function dreadFx() {
      const base = phase === 'reveal' || phase === 'reach' || phase === 'impact' || phase === 'black' ? 1 : dread;
      return base * (env.calm() ? 0.45 : 1);
    }

    /** Extra screen shake, in px. Calm mode has none at all, exactly as it has none when you are caught. */
    function shake() {
      if (!lv || env.calm()) return 0;
      if (phase === 'reach') return 3 + 15 * armLen;
      if (phase === 'impact') return 6 + 30 * (1 - grab) * (1 - grab); // the hit: the floor kicks, then settles
      if (phase === 'black') return 12 * (1 - black);
      if (phase === 'reveal') return 4;
      if (phase === 'dark' || phase === 'done') return 0; // it is over, and the screen is black
      return dread * dread * 2.6; // a tremor in the floor, and only that, until it wakes
    }

    // ------------------------------------------------------------- drawing
    /** The union of the warden's circles as one path (nonzero fill = the union; `grow` swells or shrinks it). */
    function bodyPath(ctx, grow) {
      ctx.beginPath();
      for (const c of warden().circles) {
        const r = Math.max(1, c.r + grow);
        ctx.moveTo(c.x + r, c.y);
        ctx.arc(c.x, c.y, r, 0, TAU);
      }
    }

    /**
     * The room's own light, and the thing standing in it. The caller has set the world transform and
     * 'lighter'; this puts it back the way it found it.
     *
     * OCCLUSION. The exception is to the ripple, never to the walls: a wall between the player and the room
     * blocks its light exactly as it blocks an echo. Three things enforce that together - `sight` (above),
     * which is the fraction of the room's one gap the game's own line-of-sight test says the player can see
     * and which multiplies everything below; a clip to the room; and, while the player is outside it, a clip
     * to the wedge they could really see THROUGH that gap. So not one pixel of this ever reaches a tile the
     * player could not have seen from where they are standing.
     */
    function draw(ctx, artT) {
      const p = env.player();
      if (!lv || !p || glow * sight <= 0.004) return;
      const w = warden();
      const room = w.room;
      const breathe = 0.86 + 0.14 * Math.sin(artT * 0.9); // one slow swell every seven seconds: nothing flashes
      // once it is awake the room's light is not steady any more. 1.4 Hz at a fifth of the brightness: a
      // warp, well inside the game's three-pulses-a-second limit, and slower again in calm mode.
      const woke = phase === 'reach' || phase === 'impact' || phase === 'black';
      const warp = woke ? 1 - 0.2 * (0.5 + 0.5 * Math.sin(artT * (env.calm() ? 4.4 : 8.6))) : 1;
      const g = glow * sight * breathe * warp;

      ctx.save();
      ctx.beginPath();
      ctx.rect(room.x0, room.y0, room.x1 - room.x0, room.y1 - room.y0);
      ctx.clip();
      const outside = !insideRoom(p);
      if (outside) {
        const K = 60;
        const ax = w.mouth.x - p.x;
        const ay = w.mouth.y0 - p.y;
        const bx = w.mouth.x - p.x;
        const by = w.mouth.y1 - p.y;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + ax * K, p.y + ay * K);
        ctx.lineTo(p.x + bx * K, p.y + by * K);
        ctx.closePath();
        ctx.clip();
      }

      // 1. the light itself: a pool that is simply THERE, with no wave to explain it
      ctx.globalCompositeOperation = 'lighter';
      const cx = (room.x0 + room.x1) / 2;
      const cy = (room.y0 + room.y1) / 2;
      const rad = Math.hypot(room.x1 - room.x0, room.y1 - room.y0) * 0.55;
      const pool = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      pool.addColorStop(0, `rgba(${RGB.wall},${0.055 * g})`);
      pool.addColorStop(1, `rgba(${RGB.wall},0)`);
      ctx.fillStyle = pool;
      ctx.fillRect(room.x0, room.y0, room.x1 - room.x0, room.y1 - room.y0);

      // 2. the architecture: the room's four walls, drawn from the inside
      ctx.strokeStyle = `rgba(${RGB.wall},${0.1 * g})`;
      ctx.lineWidth = 9;
      ctx.strokeRect(room.x0 + 1, room.y0 + 1, room.x1 - room.x0 - 2, room.y1 - room.y0 - 2);
      ctx.strokeStyle = `rgba(${CORE.wall},${0.34 * g})`;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(room.x0 + 1, room.y0 + 1, room.x1 - room.x0 - 2, room.y1 - room.y0 - 2);

      // 3. the door in the far wall - the way out, drawn exactly as any other exit is
      const dr = w.door;
      const dg = ctx.createRadialGradient(dr.x, dr.y, 0, dr.x, dr.y, dr.r * 2.4);
      dg.addColorStop(0, `rgba(${RGB.exit},${0.45 * g})`);
      dg.addColorStop(1, `rgba(${RGB.exit},0)`);
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.arc(dr.x, dr.y, dr.r * 2.4, 0, TAU);
      ctx.fill();
      EchoArt.draw(ctx, 'exit', dr.x, dr.y, dr.r, { a: 0.6 * g, t: artT, tell: 'none', h: Math.PI });

      // 4. the thing in the room: solid black with one edge round the whole of it, so all the room's own light
      //    ever shows of it is a lumpy far wall - until a ripple says otherwise. It stands in front of the
      //    door, which is why the door can never be reached.
      // (once it is awake, drawAwake draws the edge instead - and unclipped; here it is only punched out)
      // (no fill of its own here, and no cracks: asleep it is a rough face of the room's masonry and nothing
      //  more, and the light has to stop dead at it the way it stops at the wall it is pretending to be)
      rim(ctx, artT, w.revealed ? 0 : 0.5 * g, RGB.wall, CORE.wall, 12, 2.6, 0);

      // 5. ...and the door's light coming round it. The shape of the door is hidden - the mass is in the way,
      //    and a ripple's rays stop dead on it - but a big soft glow does not stop at an edge, so what the room
      //    shows is the way out behind something, and the something in front of it as a silhouette.
      const spill = dr.r * 7;
      const sg = ctx.createRadialGradient(dr.x, dr.y, dr.r, dr.x, dr.y, spill);
      sg.addColorStop(0, `rgba(${RGB.exit},${0.19 * g})`);
      sg.addColorStop(1, `rgba(${RGB.exit},0)`);
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(dr.x, dr.y, spill, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
    }

    const shiverNow = (artT) => (lv && lv.warden.revealed ? Math.sin(artT * 2.2) * 1.4 : 0); // awake, it is never quite still

    /** The crest (OUTLINE) as one closed path, breathing by the same hair the body does. */
    function crestPath(ctx, s) {
      const k = 1 + s / 150;
      ctx.beginPath();
      for (let i = 0; i < OUTLINE.length; i++) {
        const x = MID.x + (OUTLINE[i].x - MID.x) * k;
        const y = MID.y + (OUTLINE[i].y - MID.y) * k;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
    }

    /** Stroke a list of polylines as one path - courses, cracks, joints. */
    function lines(ctx, list, rgb, a, width) {
      ctx.beginPath();
      for (const line of list) {
        ctx.moveTo(line[0][0], line[0][1]);
        for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]);
      }
      ctx.strokeStyle = `rgba(${rgb},${a})`;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    /**
     * THE MASS, AND THE EDGE ROUND IT.
     *
     * The body is punched out FIRST, in the page's own black, over the true union of the circles - so nothing
     * behind it shows through and a ripple's rays end exactly where the solid thing really is. The edge is
     * then the cut crest (OUTLINE), drawn on top: long uneven facets, deep clefts and masonry joints, so what
     * the light finds is a worked stone face rather than the rim of a blob. Drawing it in that order is also
     * what keeps the two honest - the jagged crest lies just inside the circles everywhere, so it can never
     * promise a millimetre of body that is not solid.
     */
    function rim(ctx, artT, a, rgb, core, blur, width, fillA) {
      const s = shiverNow(artT);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = BG;
      bodyPath(ctx, s);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      if (a <= 0.004) return;
      ctx.save();
      ctx.lineJoin = 'round';
      crestPath(ctx, s);
      if (fillA > 0) {
        ctx.fillStyle = `rgba(${rgb},${fillA * a})`;
        ctx.fill();
      }
      ctx.shadowColor = `rgba(${rgb},${0.7 * a})`;
      ctx.shadowBlur = blur;
      ctx.strokeStyle = `rgba(${rgb},${a})`;
      ctx.lineWidth = width * 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(${core},${a * 0.72})`;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      lines(ctx, JOINTS, core, a * 0.45, 1.3); // the joints, cut back into the crest
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
    }

    /**
     * Once a ripple has revealed it: the warden itself, over everything, clipped by nothing but the room -
     * there is no longer any question of whether you can see it. Ancient and quarried rather than alive: a
     * crest of facets, courses of stone lying across it in layers, long forked cracks through those courses,
     * and one closed seam where a face would be if it had one. There are no eyes anywhere on it, and there is
     * nothing on it that any other monster in this game has.
     */
    function drawAwake(ctx, artT) {
      if (!lv || !lv.warden.revealed) return;
      const rgb = RGB.warden;
      const core = CORE.warden;
      const room = lv.warden.room;
      // Clipped to the room - not to hide it, but because it is IN the room: its back is buried in the far
      // wall, and a glow spilling out through the stone would make it look bigger than the space it is in.
      ctx.save();
      ctx.beginPath();
      ctx.rect(room.x0, room.y0, room.x1 - room.x0, room.y1 - room.y0);
      ctx.clip();
      rim(ctx, artT, 0.5, rgb, core, 20, 2.6, 0.13);
      const a = 0.5 + 0.5 * Math.sin(artT * 1.7);
      lines(ctx, COURSES, rgb, 0.24 + 0.05 * a, 1.1); // the layers it was laid down in
      lines(ctx, PITS, rgb, 0.13 + 0.04 * a, 1.1); // the chips over all of it
      lines(ctx, CRACKS, core, 0.19 + 0.09 * a, 1.3); // and what a very long time has done to the courses
      seam(ctx, core, 0.34 + 0.16 * a, 4.5 + 7 * Math.max(armLen, grab));
      if (armLen > 0) drawReach(ctx, artT);
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
    }

    /**
     * The seam: a long closed cleft, tied shut across its length, that opens by a hair and only while it is
     * reaching. It is SEALED, not looking - there is nothing here that could be mistaken for an eye.
     */
    function seam(ctx, core, a, open) {
      const lip = SEAM.lip;
      ctx.save();
      ctx.translate(SEAM.x, SEAM.y);
      ctx.rotate(SEAM.tilt);
      ctx.beginPath();
      for (let i = 0; i < lip.length; i++) {
        if (i) ctx.lineTo(lip[i][0], -lip[i][1] * open);
        else ctx.moveTo(lip[i][0], -lip[i][1] * open);
      }
      for (let i = lip.length - 1; i >= 0; i--) ctx.lineTo(lip[i][0], lip[i][1] * open * 0.82);
      ctx.closePath();
      ctx.fillStyle = `rgba(${core},${0.14 * a})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${core},${a})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    /**
     * One limb, as a filled polygon: down one side of a curved spine and back up the other, the half-width
     * tapering to the tip and every step of it nicked by the same kind of jag the crest has. It leaves the
     * path open for the caller to fill and stroke. Nothing here is ever a line.
     */
    function limbShape(ctx, sx, sy, mx, my, ex, ey, w0, w1, jag, K) {
      const px = [];
      const py = [];
      const nx = [];
      const ny = [];
      for (let i = 0; i <= K; i++) {
        const u = i / K;
        const v = 1 - u;
        px.push(v * v * sx + 2 * v * u * mx + u * u * ex);
        py.push(v * v * sy + 2 * v * u * my + u * u * ey);
        const tx = 2 * (v * (mx - sx) + u * (ex - mx));
        const ty = 2 * (v * (my - sy) + u * (ey - my));
        const m = Math.hypot(tx, ty) || 1;
        nx.push(-ty / m);
        ny.push(tx / m);
      }
      const half = (i, off) => (w0 * Math.pow(1 - i / K, 0.75) + w1) * jag[(i + off) % jag.length];
      ctx.beginPath();
      for (let i = 0; i <= K; i++) {
        const w = half(i, 0);
        if (i) ctx.lineTo(px[i] + nx[i] * w, py[i] + ny[i] * w);
        else ctx.moveTo(px[i] + nx[i] * w, py[i] + ny[i] * w);
      }
      for (let i = K; i >= 0; i--) {
        const w = half(i, 7);
        ctx.lineTo(px[i] - nx[i] * w, py[i] - ny[i] * w);
      }
      ctx.closePath();
    }

    /** Fill and stroke whatever limb path is open, in the three passes everything else in the game uses. */
    function paintLimb(ctx, a, core) {
      ctx.lineJoin = 'round';
      ctx.fillStyle = `rgba(${RGB.warden},${0.17 * a})`;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = `rgba(${RGB.warden},${0.28 * a})`;
      ctx.stroke();
      ctx.lineWidth = core;
      ctx.strokeStyle = `rgba(${CORE.warden},${0.62 * a})`;
      ctx.stroke();
    }

    /**
     * THE REACH. Three limbs come out of its own front edge towards the player, growing longer AND thicker as
     * they go - the way a limb does, rather than a line that gets drawn further - and each ends in three
     * short claws that splay while it is coming and shut on the hit.
     */
    function drawReach(ctx, artT) {
      const p = env.player();
      if (!p) return;
      const e = armLen * armLen * (3 - 2 * armLen);
      const thick = 0.16 + 0.84 * e + 0.26 * grab; // it thickens as it comes, and hardest as it closes
      for (let k = 0; k < LIMBS.length; k++) {
        const L = LIMBS[k];
        const c = BODY[L.i];
        // rooted deep INSIDE the mass, so what comes out of it is a long taper and not a stump on its edge
        const sx = c.x + c.r * 1.6;
        const sy = c.y;
        // each one arrives to its own side of the player rather than all three on the same point
        const tgx = p.x - 13 * L.off * 0.6;
        const tgy = p.y + 15 * L.off;
        const dx = tgx - sx;
        const dy = tgy - sy;
        const bend = L.curl * (1 - e * 0.55);
        const wob = Math.sin(artT * 2.4 + k * 1.9) * 18 * (1 - e * 0.8);
        const mx = sx + dx * 0.5 - dy * 0.15 * bend;
        const my = sy + dy * 0.5 + dx * 0.15 * bend + wob;
        // The reach is measured from the SURFACE, not from the root: at 0 the tip is level with the crest
        // and the whole limb is still a sliver inside the stone; at 1 it is on the player.
        const u0 = Math.min(0.75, (c.r * 2.6) / (Math.hypot(dx, dy) || 1));
        const u = u0 + (1 - u0) * e;
        const ex = sx + dx * u;
        const ey = sy + dy * u;
        const a = 0.55 + 0.45 * e;
        limbShape(ctx, sx, sy, mx, my, ex, ey, L.w0 * thick, L.w1 * thick, LIMB_JAG[k], 20);
        paintLimb(ctx, a, 1.6);
        // ...and what the middle one ends in: short tapered claws, splayed while it comes and shut on the hit
        if (L.claws && e > 0.5) {
          const f = clamp((e - 0.5) / 0.5, 0, 1);
          const ang = Math.atan2(ey - my, ex - mx);
          const reach = 10 + 22 * f;
          for (let j = -1; j <= 1; j++) {
            const ax = ang + (0.82 - 0.6 * grab) * j;
            const tx = ex + Math.cos(ax) * reach;
            const ty = ey + Math.sin(ax) * reach;
            limbShape(ctx, ex, ey, (ex + tx) / 2 - Math.sin(ax) * 4 * j, (ey + ty) / 2 + Math.cos(ax) * 4 * j, tx, ty, L.w1 * thick * 0.9, 0.8, LIMB_JAG[(k + j + 3) % LIMB_JAG.length], 6);
            paintLimb(ctx, a * f, 1.2);
          }
        }
      }
    }

    /**
     * On top of everything, in SCREEN coordinates: the flash the reveal makes and the fade to black. The
     * caller has reset the transform.
     */
    function veil(ctx, cw, ch) {
      if (!lv) return;
      const calm = !!env.calm();
      if (flare > 0.01) {
        const f = flare * flare * (calm ? 0.3 : 1); // softened in calm mode rather than taken away
        const grad = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.5);
        grad.addColorStop(0, `rgba(${RGB.warden},${0.16 * f})`);
        grad.addColorStop(1, `rgba(${RGB.warden},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cw, ch);
      }
      // THE HIT. One pulse - it arrives in a frame and is gone in a third of a second, and there is no
      // second one - so nothing here comes anywhere near the game's three-flashes-a-second limit. Calm mode
      // gets a fifth of it, which is still plainly a hit.
      if (flash > 0.01) {
        const k = flash * (calm ? 0.2 : 1);
        ctx.fillStyle = `rgba(${CORE.warden},${0.46 * k})`;
        ctx.fillRect(0, 0, cw, ch);
      }
      // The dread vignette, TIGHTENING: its inner edge closes in as the room gets nearer. It is drawn in the
      // same red the game's own danger edge uses, not in black - the maze is already black, and a vignette of
      // darkness on darkness is a vignette nobody can see.
      const d = dreadFx();
      if (d > 0.01) {
        const inner = Math.min(cw, ch) * (0.46 - 0.3 * d);
        const grad = ctx.createRadialGradient(cw / 2, ch / 2, inner, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.56);
        grad.addColorStop(0, 'rgba(255,30,60,0)');
        grad.addColorStop(0.5, `rgba(180,18,40,${0.1 * d})`);
        grad.addColorStop(1, `rgba(255,30,60,${0.34 * d})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cw, ch);
      }
      if (black > 0) {
        ctx.fillStyle = `rgba(0,0,0,${black})`;
        ctx.fillRect(0, 0, cw, ch);
      }
    }

    const state = () => ({
      on: !!lv,
      phase,
      t: +t.toFixed(3),
      dread: +dread.toFixed(3),
      dreadFx: +dreadFx().toFixed(3),
      glow: +glow.toFixed(3),
      sight: +sight.toFixed(3),
      lit: +(glow * sight).toFixed(3), // what actually reaches the screen: 0 behind a wall
      shake: +shake().toFixed(2),
      revealed: !!(lv && lv.warden.revealed),
      waving: phase === 'wave',
      pending: pending ? +pending.at.toFixed(3) : null,
      arm: +armLen.toFixed(3),
      grab: +grab.toFixed(3),
      flash: +flash.toFixed(3),
      black: +black.toFixed(3),
    });

    return { start, stop, update, onRipple, draw, drawAwake, veil, shake, state, dreadAt, dreadFx, get phase() { return phase; } };
  }

  return { LEVEL, MAP, BODY, ROOM_T, DOOR_T, DOOR_R, ENTRY_T, MOUTH_T, DREAD_TILES, INSIDE_PX, WAVE_FALLBACK, build, create };
})();
