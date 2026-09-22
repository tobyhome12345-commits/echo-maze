'use strict';

/**
 * LEVEL 0 - the tutorial.
 *
 * A small maze drawn by hand, the SAME every time: it is not generated and it never touches the game's random
 * numbers (mulberry32), so no seed and no maze anywhere else in the game can be moved by it. It holds no monsters,
 * no puddles and no decoy, nothing in it can kill you, and it plays identically in every difficulty mode (level 0
 * borrows Normal's ripple range and recharge - see levelConfig in js/level.js).
 *
 * It teaches six things and nothing else: moving, sending a ripple, reading what lights up, the recharge,
 * obstacles, and finding the exit by its chime. Crouching, decoys and every monster are left for the game itself.
 *
 * Level 0 counts for nothing: no progress, no Continue, no medals, no stats, no "levels cleared" (js/game.js
 * gates all of that on `levelNum > 0`). The campaign is still levels 1-12.
 *
 * Two halves live here:
 *   build(cfg)   the maze, in the same shape generateLevel() returns, so the rest of the game cannot tell the
 *                difference
 *   create(env)  the teaching prompts: a short list of steps, each of which advances when the player actually
 *                DOES the thing (never on a timer alone), with a gentle reminder if they are stuck
 */
const EchoTutorial = (() => {
  /**
   * The maze, one character per 40 px tile. 13 x 9 tiles = 520 x 360 px.
   *   #  wall          .  corridor floor
   *   r  start room    R  the room with the obstacles (both are floor; `roomTiles` for the tests)
   *   S  where you start   X  the exit
   *
   * The route is a single line with one small dead end, so nothing can be got wrong:
   *   start room -> corridor east -> a corner south -> the obstacle room -> east past a dead end -> north and
   *   east -> the exit in the top right. Eighteen tiles of walking, and the exit's chime carries about 360 px
   *   straight-line from the start (muffled through the walls), so it is heard long before it glimmers at 130 px.
   */
  const MAP = [
    '#############',
    '#rrr#######X#',
    '#rSr..#####.#',
    '#####.###...#',
    '#####.###.###',
    '####RRRR#.###',
    '####RRRR....#',
    '####RRRR#####',
    '#############',
  ];

  /**
   * The two obstacles, in the middle room: [tileX, tileY]. Which is a boulder and which is a pillar is decided
   * by where it stands (EchoArt.obstacleKind), exactly as everywhere else in the game - these two tiles give one
   * of each: (6,5) comes out a boulder and (6,6) a pillar. They stand one above the other in the middle of the
   * room, right across the way in, with too small a gap between them to squeeze through - so the room has to be
   * walked round, the south way, and "you cannot walk through them" is learned by walking.
   */
  const OBSTACLES = [
    [6, 5],
    [6, 6],
  ];

  /** The maze, in the shape generateLevel() returns. Draws no random numbers of any kind. */
  function build(cfg) {
    const H = MAP.length;
    const W = MAP[0].length;
    const walls = new Uint8Array(W * H);
    const roomTiles = [];
    let startTile = null;
    let exitTile = null;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ch = MAP[y][x];
        const i = y * W + x;
        walls[i] = ch === '#' ? 1 : 0;
        if (ch === 'r' || ch === 'R' || ch === 'S') roomTiles.push(i);
        if (ch === 'S') startTile = { x, y };
        if (ch === 'X') exitTile = { x, y };
      }
    }
    const blocked = walls.slice();
    const obstacles = OBSTACLES.map(([tx, ty]) => {
      blocked[ty * W + tx] = 1;
      return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, r: OBSTACLE_R, tx, ty };
    });
    const startIdx = startTile.y * W + startTile.x;
    const exitIdx = exitTile.y * W + exitTile.x;
    const dS = bfsDist(blocked, W, H, startIdx);
    if (dS[exitIdx] < 0) console.warn('EchoTutorial: the obstacles have sealed the exit off');
    return {
      cfg,
      W,
      H,
      walls,
      blocked,
      roomTiles,
      obstacles,
      puddles: [], // no smell in the tutorial
      decoy: null, // and no sonar decoy
      trails: [],
      enemies: [], // nothing alive: nothing here can kill you
      start: { x: (startTile.x + 0.5) * TILE, y: (startTile.y + 0.5) * TILE },
      exit: { x: (exitTile.x + 0.5) * TILE, y: (exitTile.y + 0.5) * TILE, r: EXIT_R },
      pathTiles: dS[exitIdx],
      pxW: W * TILE,
      pxH: H * TILE,
    };
  }

  // ------------------------------------------------------------- the lesson
  const STEP_PX = 120; // px walked before the "move" step is done
  const READ_PX = 80; // px walked before the "the picture fades" step is done
  const NUDGE_PX = 40; // px walked (or one ripple) that counts as "still doing something"
  const STUCK_SECONDS = 25; // no progress for this long on a step -> a gentle reminder
  const SHOWN_SECONDS = 9; // a prompt fades out after this long, but only once the player is moving

  /** Tiles of the room with the obstacles, and the corridor tile just past it (where the room step is done). */
  const OBSTACLE_ROOM = { x0: 4, x1: 7, y0: 5, y1: 7 };
  const PAST_ROOM_X = 8;

  /**
   * The six prompts. `done(s)` is what the player has to DO; `at(s)` (optional) means the step is not shown
   * until then - and, if a later step's `at` fires first, the lesson jumps to it, so nobody is told about
   * walls while they are standing in the obstacle room.
   * {move} and {ripple} are filled in from the player's OWN key bindings (js/profile.js), so a prompt never
   * names a key that has been changed away; `touchText` / `touchRemind` are what a touch player is told
   * instead, and a step with no keys in it needs neither.
   */
  const STEPS = [
    {
      id: 'move',
      text: 'It is dark in here. Use {move} to move.',
      touchText: 'It is dark in here. Drag on the left of the screen to move.',
      remind: 'Nothing down here can hurt you. Use {move} and have a walk.',
      touchRemind: 'Nothing down here can hurt you. Drag on the left and have a walk.',
      done: (s) => s.walked >= STEP_PX,
    },
    {
      id: 'ripple',
      text: 'Press {ripple} to send a ripple. Your echo shows what is around you.',
      touchText: 'Tap RIPPLE to send a ripple. Your echo shows what is around you.',
      remind: 'The dark stays dark until you ping. Press {ripple}.',
      touchRemind: 'The dark stays dark until you ping. Tap RIPPLE.',
      done: (s) => s.ripples >= 1,
    },
    {
      id: 'walls',
      text: 'Blue lines are walls. The picture fades fast, so remember what you saw.',
      remind: 'Walk on. The walls you saw have not moved.',
      done: (s) => s.walkedInStep >= READ_PX,
    },
    {
      id: 'recharge',
      text: 'Ripples take a moment to recharge. Move, then ping again.',
      remind: 'Take a few steps, then send another ripple.',
      done: (s) => s.ripples >= 2,
    },
    {
      id: 'obstacles',
      text: 'Amber shapes are boulders and pillars. You cannot walk through them.',
      remind: 'Go around them - there is a way through this room.',
      at: (s) => s.tx >= OBSTACLE_ROOM.x0 && s.tx <= OBSTACLE_ROOM.x1 && s.ty >= OBSTACLE_ROOM.y0 && s.ty <= OBSTACLE_ROOM.y1,
      done: (s) => s.tx >= PAST_ROOM_X,
    },
    {
      id: 'exit',
      text: 'Listen for a chime. That is the exit. Get close and it glows green.',
      remind: 'Follow the chime. It gets louder as you get nearer.',
      at: (s) => s.tx >= PAST_ROOM_X,
      done: () => false, // reaching the exit ends the tutorial (js/game.js)
    },
  ];

  /** "W A S D or up left down right", from whatever the player has actually bound. */
  function moveLabel() {
    const P = EchoProfile;
    const slot = (i) => ['up', 'left', 'down', 'right'].map((a) => P.keysFor(a)[i]).filter(Boolean).map(P.keyLabel);
    const first = slot(0);
    const second = slot(1);
    if (!first.length) return second.length ? second.join(' ') : 'your movement keys';
    return second.length === 4 ? `${first.join(' ')} or ${second.join(' ')}` : first.join(' ');
  }

  /** Fill {move} / {ripple} in with the player's own keys. */
  function fill(text) {
    return text.replace(/\{(\w+)\}/g, (_, token) => (token === 'move' ? moveLabel() : EchoProfile.keysText(token).toUpperCase()));
  }

  /**
   * What this step says right now: its touch wording on a touch device, if it has any, and otherwise the
   * keyboard line with the player's own keys written into it.
   * `key` is 'text' (the lesson) or 'remind' (the gentle nudge when they are stuck).
   */
  function lineOf(step, key, isTouch) {
    const touchLine = key === 'text' ? step.touchText : step.touchRemind;
    return fill(isTouch && touchLine ? touchLine : step[key]);
  }

  /**
   * env:
   *   setHint(text)  show this line (null hides it)
   *   touch()        are the touch controls in use?
   */
  function create(env) {
    let i = 0; // which step
    let walked = 0; // px walked since the tutorial began
    let stepWalked = 0; // px walked since this step began
    let ripples = 0;
    let idle = 0; // seconds since the player last did anything
    let nudged = 0; // px walked since `idle` was last reset
    let shown = 0; // seconds this prompt has been up
    let hinting = false;
    let px = 0;
    let py = 0;
    let first = true;
    let saidKey = 'text'; // which line of this step is on screen ('text' or 'remind')

    const line = (key) => lineOf(STEPS[i], key, !!env.touch());

    function say(key) {
      hinting = true;
      shown = 0;
      saidKey = key;
      env.setHint(line(key));
    }

    /** Say the same thing again in the player's new words: they have rebound a key, or switched touch on or off. */
    function refresh() {
      if (hinting) env.setHint(line(saidKey));
    }

    function hide() {
      if (!hinting) return;
      hinting = false;
      env.setHint(null);
    }

    function enter(n) {
      i = n;
      stepWalked = 0;
      idle = 0;
      nudged = 0;
    }

    function start() {
      walked = 0;
      ripples = 0;
      first = true;
      enter(0);
      say('text');
    }

    /** p: the player's { x, y } and the ripples sent so far this level. Prompts only - it changes nothing. */
    function update(dt, p) {
      if (first) {
        px = p.x;
        py = p.y;
        first = false;
      }
      const step = Math.hypot(p.x - px, p.y - py);
      px = p.x;
      py = p.y;
      walked += step;
      stepWalked += step;
      nudged += step;
      const pinged = p.ripples > ripples;
      ripples = p.ripples;

      // "still doing something": a few steps, or a ripple
      if (pinged || nudged >= NUDGE_PX) {
        idle = 0;
        nudged = 0;
      } else {
        idle += dt;
      }

      const s = { walked, walkedInStep: stepWalked, ripples, tx: Math.floor(p.x / TILE), ty: Math.floor(p.y / TILE) };

      // a later step whose moment has come wins: nobody is told about walls while standing in the obstacle room
      for (let k = STEPS.length - 1; k > i; k--) {
        if (STEPS[k].at && STEPS[k].at(s)) {
          enter(k);
          say('text');
          return;
        }
      }
      if (STEPS[i].done(s)) {
        const n = i + 1;
        if (n >= STEPS.length) return;
        enter(n);
        // the next step waits for its own moment, if it has one: a clear screen until then
        if (STEPS[n].at && !STEPS[n].at(s)) hide();
        else say('text');
        return;
      }
      if (STEPS[i].at && !STEPS[i].at(s)) {
        hide(); // this step has not started yet
        return;
      }
      if (!hinting) say('text');

      shown += dt;
      if (idle >= STUCK_SECONDS) {
        say('remind'); // stuck: the same lesson, said more kindly
        idle = 0;
        nudged = 0;
      } else if (shown >= SHOWN_SECONDS && idle < 1) {
        hide(); // they are getting on with it: give the screen back
      }
    }

    const state = () => ({ step: STEPS[i].id, index: i, of: STEPS.length, walked: Math.round(walked), ripples, idle: +idle.toFixed(1), showing: hinting });

    return { start, update, state, refresh, stop: hide, stepIds: () => STEPS.map((s) => s.id) };
  }

  return { build, create, MAP, OBSTACLES, STEPS, moveLabel, fill, lineOf };
})();
