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
 * not kill on touch. It was simply already there. The only thing that ever shows it is a ripple - and the
 * capture waits for the player's OWN next ripple press, because that is the habit twelve levels have taught
 * them. When that wave arrives, the wall answers.
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

  // ---------------------------------------------------------------- numbers
  const DREAD_TILES = 28; // the ramp: how many tiles of REMAINING PATH the dread builds over
  const INSIDE_PX = 760; // px: the player counts as "fully inside" the room past this x (two tiles in)
  const AUTO_SECONDS = 7; // no ripple this long after entering -> an involuntary one (the safety net)
  const GASP_REVEAL = 0.4; // s: an involuntary ripple sent from somewhere the wave cannot reach still reveals it
  const REVEAL_SECONDS = 0.6; // it lights up; nothing moves yet
  const REACH_SECONDS = 1.9; // it reaches for you; the shake and the hum grow
  const BLACK_SECONDS = 1.7; // to black
  const DARK_SECONDS = 1.2; // black, and quiet
  // Seen it once: the level still ends the same way, but the set piece does not play again.
  const SHORT_REVEAL = 0.35;
  const SHORT_BLACK = 1.2;
  const SHORT_DARK = 0.7;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

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
   *   gasp()         send the involuntary ripple (the safety net)
   *   freeze()       take the controls - called exactly once, at the reveal
   *   enteredRoom()  the player is fully inside: this is what "clearing" level 13 means
   *   taken()        the capture is over; the placeholder ending follows
   */
  function create(env) {
    let lv = null; // the warden level being played, or null
    let phase = 'off'; // off | approach | armed | reveal | reach | black | dark | done
    let t = 0; // seconds in the current phase
    let dread = 0; // 0..1, smoothed: how close the room is, by remaining path
    let glow = 0; // 0..1, smoothed: how much of the room's own light is up
    let waitT = 0; // seconds since the room was entered, for the safety net
    let pending = null; // a ripple on its way to the warden: { rp, at } seconds until it arrives
    let short = false; // the capture has been seen before: play the brief version
    let armLen = 0; // 0..1 how far it has reached
    let black = 0; // 0..1 how black the screen is
    let flare = 0; // 0..1 the reveal's own flash, fading

    const warden = () => (lv ? lv.warden : null);

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

    function start(level, seenBefore) {
      lv = level && level.warden ? level : null;
      phase = lv ? 'approach' : 'off';
      short = !!seenBefore;
      t = 0;
      dread = 0;
      glow = 0;
      waitT = 0;
      armLen = 0;
      black = 0;
      flare = 0;
      pending = null;
      if (lv) {
        // Seen it once: the illusion is spent. The wall is a warden from the moment you walk in, and any
        // ripple shows it as one - there is no second first time.
        lv.warden.revealed = short;
        if (env.audio) env.audio.startWardenDrone();
      }
    }

    function stop() {
      lv = null;
      phase = 'off';
      dread = 0;
      glow = 0;
      black = 0;
      if (env.audio) env.audio.stopWardenDrone();
    }

    /** The player's own ripple (or the involuntary one). Nothing here changes the ripple in any way. */
    function onRipple(rp, involuntary) {
      if (!lv || phase !== 'armed' || lv.warden.revealed || pending) return;
      const near = nearestSurface(rp.x, rp.y);
      const reaches = near.d <= rp.R && env.los(rp.x, rp.y, near.c.x, near.c.y);
      if (reaches) pending = { rp, at: Math.max(0, near.d) / env.rippleSpeed };
      else if (involuntary) pending = { rp: null, at: GASP_REVEAL }; // the flinch reveals it wherever it was sent from
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
      flare = Math.max(0, flare - dt / 0.9);
      if (env.audio) env.audio.setWardenDread(dreadFx(), phase === 'reach' || phase === 'black');

      t += dt;
      switch (phase) {
        case 'approach':
          // "Fully entered the room": inside its walls and two tiles past the gap. Nothing is taken yet.
          if (p && p.x >= lv.warden.insideX && p.x <= lv.warden.room.x1 && p.y >= lv.warden.room.y0 && p.y <= lv.warden.room.y1) {
            env.enteredRoom(); // this is what "clearing" level 13 means: progress is written down here
            phase = short ? 'black' : 'armed';
            t = 0;
            waitT = 0;
            if (short && env.audio) env.audio.wardenTake(true);
            if (short) env.freeze();
          }
          break;
        case 'armed':
          // The player keeps every control they have ever had. All that is waited for is the habit: a ripple.
          waitT += dt;
          if (pending) {
            pending.at -= dt;
            if (pending.at <= 0) {
              const rp = pending.rp;
              pending = null;
              doReveal(rp);
            }
          } else if (waitT >= AUTO_SECONDS) {
            env.gasp(); // nobody can stand still long enough to get stuck: a flinch sends one for them
          }
          break;
        case 'reveal':
          if (t >= (short ? SHORT_REVEAL : REVEAL_SECONDS)) {
            phase = 'reach';
            t = 0;
            if (env.audio) env.audio.wardenTake(false);
            if (env.cues) env.cues.caption('[it reaches]');
          }
          break;
        case 'reach':
          armLen = clamp(t / REACH_SECONDS, 0, 1);
          if (t >= REACH_SECONDS) {
            phase = 'black';
            t = 0;
          }
          break;
        case 'black':
          black = clamp(t / (short ? SHORT_BLACK : BLACK_SECONDS), 0, 1);
          if (black >= 1) {
            phase = 'dark';
            t = 0;
            if (env.audio) env.audio.stopWardenDrone();
          }
          break;
        case 'dark':
          if (t >= (short ? SHORT_DARK : DARK_SECONDS)) {
            phase = 'done';
            env.taken(short);
          }
          break;
        default:
          break;
      }
    }

    /** How strong the dread effects are right now. Calm mode: softer, and it never reaches full. */
    function dreadFx() {
      const base = phase === 'reveal' || phase === 'reach' || phase === 'black' ? 1 : dread;
      return base * (env.calm() ? 0.45 : 1);
    }

    /** Extra screen shake, in px. Calm mode has none at all, exactly as it has none when you are caught. */
    function shake() {
      if (!lv || env.calm()) return 0;
      if (phase === 'reach') return 3 + 16 * armLen;
      if (phase === 'black') return 19 * (1 - black);
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
     * The glow is CLIPPED twice: to the room, and - while the player is still outside it - to the wedge they
     * can actually see through the one gap in its wall. So the exception to "you only see what you ping" never
     * reaches a single tile the player could not really have seen.
     */
    function draw(ctx, artT) {
      if (!lv || glow <= 0.004) return;
      const w = warden();
      const p = env.player();
      const room = w.room;
      const breathe = 0.86 + 0.14 * Math.sin(artT * 0.9); // one slow swell every seven seconds: nothing flashes
      const g = glow * breathe;

      ctx.save();
      ctx.beginPath();
      ctx.rect(room.x0, room.y0, room.x1 - room.x0, room.y1 - room.y0);
      ctx.clip();
      const outside = !p || p.x < room.x0;
      if (outside) {
        if (!p || !env.los(p.x, p.y, w.mouth.x - TILE * 0.5, (w.mouth.y0 + w.mouth.y1) / 2)) {
          ctx.restore();
          return; // a wall between you and the gap: no light reaches you, and none is drawn
        }
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
      rim(ctx, artT, w.revealed ? 0 : 0.5 * g, RGB.wall, CORE.wall, 12, 2.6);

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

    /**
     * The body, and ONE edge round the whole of it.
     *
     * The circles overlap, so the edge cannot be drawn by shrinking them: the union of the smaller circles is
     * not the smaller union, and every overlap leaves an arc inside the body. Instead the outline of every
     * circle is stroked first - arcs and all - and the union is then filled in solid black on top, which
     * covers every arc that falls inside the silhouette and the inner half of the outline with it. What is
     * left is a clean rim round the union, and a body the room's light stops dead at.
     */
    function rim(ctx, artT, a, rgb, core, blur, width) {
      const s = shiverNow(artT);
      if (a > 0.004) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = `rgba(${rgb},${0.7 * a})`;
        ctx.shadowBlur = blur;
        ctx.strokeStyle = `rgba(${rgb},${a})`;
        ctx.lineWidth = width * 2;
        bodyPath(ctx, s);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(${core},${a * 0.7})`;
        ctx.lineWidth = 2;
        bodyPath(ctx, s + 1);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = BG;
      bodyPath(ctx, s);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
    }

    /**
     * Once a ripple has revealed it: the warden itself, drawn over everything and clipped by nothing, because
     * there is no longer any question of whether you can see it. The caller has set the world transform and
     * 'lighter'. Nothing is punched out here - the ripple's own rays end on its surface, and this draws on top.
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
      rim(ctx, artT, 0.5, rgb, core, 20, 2.6);

      // The seam it has for a face - closed, and eyeless, like everything else down here - and the fissures
      // across it, and then the reach.
      const a = 0.5 + 0.5 * Math.sin(artT * 1.7);
      ctx.strokeStyle = `rgba(${core},${0.5 + 0.3 * a})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(880, 214);
      ctx.bezierCurveTo(930, 190 + 7 * a, 975, 240 - 7 * a, 1020, 216);
      ctx.stroke();
      // fissures across it, each starting on its own bit of the front edge
      ctx.strokeStyle = `rgba(${rgb},${0.34 + 0.2 * a})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 1; i < FRONT_COUNT; i += 2) {
        const c = BODY[i];
        const u = i / FRONT_COUNT;
        ctx.moveTo(c.x - c.r * 0.35, c.y);
        ctx.lineTo(c.x + 58 + Math.sin(u * 5 + artT) * 10, c.y + Math.sin(u * 13) * 18);
      }
      ctx.stroke();
      if (armLen > 0) drawReach(ctx, artT);
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
    }

    /** It reaches. Five tapering arms out of the front of it, growing towards where the player is standing. */
    function drawReach(ctx, artT) {
      const p = env.player();
      if (!p) return;
      // out of five points spread down its own front edge, wherever that happens to be
      const from = [2, 6, 9, 12, 16].map((i) => {
        const c = BODY[i];
        return { x: c.x - c.r * 0.55, y: c.y };
      });
      const e = armLen * armLen * (3 - 2 * armLen); // ease
      for (let i = 0; i < from.length; i++) {
        const s = from[i];
        const dx = p.x - s.x;
        const dy = p.y - s.y;
        const wob = Math.sin(artT * 3 + i * 1.7) * 26 * (1 - e * 0.6);
        const mx = s.x + dx * 0.55 - dy * 0.12 + wob * 0.2;
        const my = s.y + dy * 0.55 + dx * 0.12 + wob;
        const ex = s.x + dx * e;
        const ey = s.y + dy * e;
        ctx.strokeStyle = `rgba(${RGB.warden},${0.22 + 0.3 * e})`;
        ctx.lineWidth = 11 - 6 * e;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.quadraticCurveTo(mx, my, ex, ey);
        ctx.stroke();
        ctx.strokeStyle = `rgba(${CORE.warden},${0.5 + 0.4 * e})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    /**
     * On top of everything, in SCREEN coordinates: the flash the reveal makes and the fade to black. The
     * caller has reset the transform.
     */
    function veil(ctx, cw, ch) {
      if (!lv) return;
      if (flare > 0.01 && !env.calm()) {
        const f = flare * flare;
        const grad = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.5);
        grad.addColorStop(0, `rgba(${RGB.warden},${0.16 * f})`);
        grad.addColorStop(1, `rgba(${RGB.warden},0)`);
        ctx.fillStyle = grad;
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
      shake: +shake().toFixed(2),
      revealed: !!(lv && lv.warden.revealed),
      armed: phase === 'armed',
      waitFor: phase === 'armed' ? +(AUTO_SECONDS - waitT).toFixed(2) : null,
      pending: pending ? +pending.at.toFixed(3) : null,
      arm: +armLen.toFixed(3),
      black: +black.toFixed(3),
      short,
    });

    return { start, stop, update, onRipple, draw, drawAwake, veil, shake, state, dreadAt, dreadFx, get phase() { return phase; } };
  }

  return { LEVEL, MAP, BODY, ROOM_T, DOOR_T, DOOR_R, ENTRY_T, MOUTH_T, DREAD_TILES, INSIDE_PX, AUTO_SECONDS, build, create };
})();
