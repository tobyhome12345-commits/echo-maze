'use strict';

/**
 * The story cutscenes - seven scripted scenes in the dark maze, chosen by start(kind):
 *   'intro'   (before level 1) an explorer who has been lost for too long sends out a ripple, hears
 *                              something answer, and is taken by an echo monster. Then it is your turn.
 *   'scent'   (level 5 -> 6)   an explorer steps in a puddle and a scent monster follows their trail.
 *   'mimic'   (level 7 -> 8)   an explorer follows the exit's chime to a glow, pings it - and it is a mimic.
 *   'decoy'   (level 8 -> 9)   an explorer finds a sonar decoy and uses it to trap two monsters.
 *   'stalker' (level 9 -> 10)  a stalker hears an explorer's steps and comes for the spot; they crouch, creep
 *                              clear and it finds nothing. The one scene where the explorer gets away, and
 *                              it shows the player how (hold SHIFT to crouch).
 *   'muffler' (level 10 -> 11) an explorer pings a corridor and the echo just stops: something unseen swallows the wave.
 *                              A hum, slow thumps; even a crouched creep is heard from close up. Blackout.
 *   'singer'  (level 11 -> 12) something far off sings a magenta ripple; when it reaches an explorer they are marked
 *                              (sting, ticking countdown). It leaps to the spot they were at - they kept moving.
 *
 * Everything runs off one clock (`time`, seconds since the cutscene began), and
 * everything you hear is synthesised - including the mumble of the explorer's
 * voice, which is just formant-shaped buzzing under the subtitles.
 *
 * The explorer's sonar is the game's real ripple system (env.castRipple), so it
 * looks and sounds exactly like yours. So do the things it lights: the monsters, the
 * puddle, the decoy and the mimic's "exit" are drawn with the game's own art (js/art.js,
 * EchoArt), just bigger.
 */
const EchoCutscene = (() => {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };

  // ------------------------------------------------------------------ script
  // Times are seconds from the start of the cutscene (S = when the scene proper begins).
  const S = 22.0;
  const CPS = 20; // subtitle typing speed, characters per second

  /** Lore cards over black: [start, duration, text]. */
  const CARDS = [
    [0.8, 4.6, 'Beneath the old quarry lies a maze that no one built.'],
    [6.2, 4.2, 'No light reaches it. Only sound travels there.'],
    [11.0, 4.8, 'Its monsters have no eyes. They find whatever the dark throws back.'],
    [16.4, 5.4, 'Send out a ripple and you can see. But whatever it touches will know where you stood.'],
  ];

  /** The explorer's lines, scene-relative: [start, text]. */
  const LINES = [
    [1.8, "I've been in here too long."],
    [4.6, "I don't know if I'll survive."],
    [8.0, 'Every ripple costs me. Something out there is always listening.'],
    [13.2, 'One more. Just one more.'],
    [17.0, '…Nothing. Good.'],
    [20.0, 'Did you hear that?'],
    [22.8, 'Hello…?'],
    [23.65, 'N— no—'],
  ];

  const PING_AT = 14.6; // the explorer sends a ripple
  const LISTEN_AT = 19.0; // something starts breathing in the dark
  const CLICKS = [21.4, 22.1, 22.6, 23.0, 23.3, 23.55, 23.75]; // its steps, quickening
  const BEATS = [[22.4, 0.45], [23.1, 0.65], [23.65, 0.9]]; // the explorer's heartbeat
  const NOTICE_AT = 23.6; // "!"
  const LEAP_AT = 23.85; // the monster launches from the side passage
  const HIT_AT = 24.3; // ...and reaches them
  const GONE_AT = 24.55; // blackout
  const CLANK_AT = 25.6; // their sonar device clatters to the floor
  const LAST_PING_AT = 26.4; // and pings once, alone
  const FINAL_CARD_AT = 29.4;
  const END_AT = 34.0;

  /** Explorer's path: [scene time, x]. They walk, stop to talk, ping, then walk on. */
  const WALK = [[0, 100], [6.3, 330], [17.6, 330], [22.4, 560]];
  const PY = 178; // corridor height they walk at
  const STUB = { x: 700, y: 62 }; // where the monster waits, in the side passage
  const TURN_START = 22.4;
  const TURN_END = 23.1;

  // ------------------------------------------------ the scent scene (levels 5 -> 6)
  // A second explorer steps in a smell puddle, walks on leaving a trail, rests
  // believing nothing can find them, and a scent monster picks up the trail and
  // follows it to them. It plays after level 5 is cleared. Times are scene-relative
  // (SC_S = when the scene proper begins, after one lore card).
  const SC_S = 4.6;
  const SC_SPEED = 55; // the explorer's walking pace, px/s
  const SC_START_X = 100;
  const SC_PUDDLE_X = 300;
  const SC_SMELL = 5; // seconds of walking they stay smelly - exactly as in the game
  const SC_PUDDLE_T = (SC_PUDDLE_X - SC_START_X) / SC_SPEED; // they step into the puddle
  const SC_STOP_T = SC_PUDDLE_T + SC_SMELL; // the smell has run out; they stop walking
  const SC_STOP_X = SC_START_X + SC_SPEED * SC_STOP_T;
  const SC_MON_X0 = 40; // the scent monster comes in from the left
  const SC_MON_T0 = 9.8;
  const SC_MON_PATROL = 62; // px/s while it wanders
  const SC_MON_FOLLOW = 95; // px/s once it has the trail
  const SC_TOUCH_T = SC_MON_T0 + (SC_PUDDLE_X - SC_MON_X0) / SC_MON_PATROL; // it touches the start of the trail
  const SC_REACH = SC_STOP_X - 26; // where it stops: right behind the explorer
  const SC_HIT_T = SC_TOUCH_T + (SC_REACH - SC_PUDDLE_X) / SC_MON_FOLLOW; // ...and reaches them
  const SC_CARD_T = SC_HIT_T + 3.2;
  const SC_END_T = SC_HIT_T + 8.4;
  const SC_LINES = [
    [1.3, 'Almost through this part.'],
    [4.1, "Ugh. What is this? It's all over my boots."],
    [6.4, "It's fading... as long as I keep moving."],
    [9.3, 'There. No pings, no noise. Nothing can find me now.'],
    [12.0, '...Is that sniffing?'],
    [SC_TOUCH_T + 0.5, "It's following my trail!"],
  ];

  // ------------------------------------------------ the mimic scene (levels 7 -> 8)
  // A third explorer, worn out, hears the exit's chime and sees its green glow down the corridor. They
  // have learned to ping before trusting anything - and the wave touches it. It is a mimic: it turns
  // into an echo monster and goes to the spot the ripple was sent from, where the explorer is still
  // standing. Plays after level 7 is cleared. Times are scene-relative (MM_S = when the scene proper begins).
  const MM_S = 4.4;
  const MM_WALK = [[0, 100], [8.0, 330], [10.6, 330], [13.6, 430], [99, 430]]; // [scene time, x]
  const MM_X = 640; // the mimic, sitting in the corridor like an exit
  const MM_R = 330; // reach of the explorer's ping
  const MM_CHIME_T = 7.6; // the "exit" starts to chime and glow...
  const MM_PING_T = 15.6; // ...they stop, and ping it
  const MM_TOUCH_T = MM_PING_T + (MM_X - 16 - 430) / 520; // the wave reaches it: the disguise breaks
  const MM_RUN = 250; // px/s once it has turned
  const MM_HIT_T = MM_TOUCH_T + 0.12 + (MM_X - (430 + 26)) / MM_RUN; // it reaches the spot they pinged from
  const MM_CARD_T = MM_HIT_T + 3.2;
  const MM_END_T = MM_HIT_T + 8.0;
  const MM_LINES = [
    [0.9, 'Still walking. Still nothing.'],
    [4.0, 'Every corner looks the same now.'],
    [8.3, '...Wait. Do you hear that?'],
    [11.0, "That chime. That's the exit. That's the way out!"],
    [14.2, 'Ping first. Always ping first.'],
    [MM_TOUCH_T + 0.3, "It's not—"],
  ];

  // ------------------------------------------------- the decoy scene (levels 8 -> 9)
  // A fourth explorer finds a sonar decoy on the floor and takes it. Two monsters are closing in along
  // the corridor; they drop it, hide in a side passage, and five seconds later it calls: both monsters
  // turn, go to it and are held there while the explorer walks away. Plays after level 8 is cleared.
  const DC_S = 4.6;
  const DC_Y = 178; // the corridor row they walk along
  const DC_FLOOR_X = 260; // the decoy lying on the floor
  const DC_PICK_T = 4.7;
  const DC_X = 560; // where it is dropped
  const DC_DROP_T = 11.4;
  const DC_CALL_T = DC_DROP_T + 5; // five seconds later, exactly as in the game
  // [scene time, x, y]: down the corridor, pick it up, drop it, into the side passage, out again, away
  const DC_PATH = [[0, 100, DC_Y], [4.6, 260, DC_Y], [6.4, 260, DC_Y], [11.2, 560, DC_Y], [12.2, 560, DC_Y], [13.0, 700, DC_Y], [14.2, 700, 80], [18.6, 700, 80], [19.8, 700, DC_Y], [24.0, 900, DC_Y], [99, 900, DC_Y]];
  // the two monsters: they come along the corridor from the left, and at the call go to the decoy instead
  const DC_ECHO = { y: 148, v: 95, vLured: 130, xCall: 370, stop: DC_X - 22 }; // xCall = where it is when the decoy calls
  const DC_SCENT = { y: 178, v: 80, vLured: 117, xCall: 300, stop: DC_X - 54 };
  const DC_ECHO_T0 = DC_CALL_T - (DC_ECHO.xCall - 60) / DC_ECHO.v; // when each sets off from the left edge
  const DC_SCENT_T0 = DC_CALL_T - (DC_SCENT.xCall - 60) / DC_SCENT.v;
  const DC_ECHO_TRAP_T = DC_CALL_T + (DC_ECHO.stop - DC_ECHO.xCall) / DC_ECHO.vLured; // when each is caught
  const DC_SCENT_TRAP_T = DC_CALL_T + (DC_SCENT.stop - DC_SCENT.xCall) / DC_SCENT.vLured;
  const DC_CARD_T = 20.6;
  const DC_END_T = 25.0;
  const DC_LINES = [
    [1.0, 'Still alive. Barely.'],
    [3.4, "Something's lying on the floor…"],
    [5.6, 'A sonar decoy. Someone left it for whoever came next.'],
    [8.7, 'One drop. Five seconds. Then it calls every monster nearby.'],
    [11.8, 'Please work.'],
    [14.7, '...Here they come.'],
    [DC_CALL_T + 0.8, "They turned. They're all going to it."],
    [DC_SCENT_TRAP_T + 0.6, "Five seconds. That's all I need."],
  ];

  // ------------------------------------------------ the stalker scene (levels 9 -> 10)
  // A fifth explorer walks softly along the corridor when something they cannot see breathes in: a stalker has
  // heard their steps. They stop to listen, and it keeps coming - a stalker hears you even standing still, if you
  // are close. They drop into a crouch and creep out of its way. It reaches the exact spot it heard them, finds
  // nothing, and after three quiet seconds (as in the game) gives up and walks on. The explorer gets away, and
  // the scene ends on the way to do it. Plays after level 9 is cleared. Times are scene-relative (ST_S = when the
  // scene proper begins, after one lore card).
  const ST_S = 4.4;
  const ST_Y = 178; // the corridor row the explorer walks along
  const ST_MON_Y = ST_Y + 6; // the stalker walks a little below it, so a crouching explorer beside it is not overlapped
  const ST_STOP_X = 300; // where the explorer stops, and so the exact spot the stalker is heading for
  const ST_WALK_END_T = 5.6; // they reach it and stop
  const ST_CROUCH_T = 6.2; // they drop to a crouch...
  const ST_CREEP_T = 1.7; // ...and creep up out of the lane, this long
  const ST_CREEP_Y = 132; // beside where it will stand
  const ST_MON_X0 = 60; // it steps in out of the dark here
  const ST_MON_T0 = 3.6;
  const ST_MON_V = 55; // its steady pace, px/s, hunting and patrolling alike
  const ST_ARRIVE_T = ST_MON_T0 + (ST_STOP_X - ST_MON_X0) / ST_MON_V; // it reaches the spot it heard them at
  const ST_LOSE_T = ST_CROUCH_T + 3; // nothing heard for 3 s, exactly as in the game: it gives up and walks on
  const ST_CARD_T = 15.6;
  const ST_END_T = 20.4;
  // the explorer: walk to the spot, stand, crouch and creep out of the lane, stay low, edge away
  const ST_PATH = [[0, 100, ST_Y], [ST_WALK_END_T, ST_STOP_X, ST_Y], [ST_CROUCH_T, ST_STOP_X, ST_Y], [ST_CROUCH_T + ST_CREEP_T, ST_STOP_X, ST_CREEP_Y], [12.6, ST_STOP_X, ST_CREEP_Y], [16.5, 272, ST_CREEP_Y], [99, 272, ST_CREEP_Y]];
  const ST_LINES = [
    [1.0, 'Soft steps. Keep them soft.'],
    [3.9, '...Something just breathed in.'],
    [5.4, "It's still coming. Get low."],
    // (then silence: it is standing right beside them and must hear nothing)
    [10.6, "It couldn't hear me. Not a thing."],
    [12.8, "Can't ping down here. But nothing can hear me either."],
  ];

  // ------------------------------------------------ the muffler scene (levels 10 -> 11)
  // A sixth explorer pings a dark corridor and the echo simply STOPS: something swallows the wave, leaving a gap in
  // the echo map. A deep hum, and slow dull thumps that come closer. They drop into a crouch and creep back - but a
  // muffler hears even a crouched step from close up, and it stops beside them. Blackout. It is never seen: the only
  // things on screen are the hole in the ripple and the explorer's failing lamp. (Plays after level 10 is cleared.)
  const MF_S = 4.4;
  const MF_X0 = 640; // where it waits, in the corridor (never drawn)
  const MF_R = 26; // how big its shadow is in the scene (the game's muffler is 14 px; this reads better on a small stage)
  const MF_PING_T = 5.4; // they send one ripple...
  const MF_MOVE_T = 6.6; // ...it starts walking towards where the sound came from...
  const MF_V = 48; // ...at this pace, px/s
  const MF_CROUCH_T = 9.2; // they drop low...
  const MF_STOP_X = 330; // ...and it stops here, right beside them
  const MF_ARRIVE_T = MF_MOVE_T + (MF_X0 - MF_STOP_X) / MF_V; // (about 13.1)
  const MF_HIT_T = MF_ARRIVE_T + 0.1; // a deep thud, and blackout
  const MF_CARD_T = 16.6;
  const MF_END_T = 21.6;
  const MF_PATH = [[0, 100, PY], [3.8, 300, PY], [MF_CROUCH_T, 300, PY], [12.3, 262, PY], [99, 262, PY]]; // they walk in, stand, then creep back crouched
  const MF_LINES = [
    [1.2, 'Nothing but my own steps.'],
    [3.9, 'One ping. Just to be sure.'],
    [7.3, '...It just stopped. Right there.'],
    [9.0, 'Something is humming. Something big.'],
    [10.9, 'Low. Slow. Quiet.'],
    [12.4, "It stopped. It knows-"],
  ];

  // ------------------------------------------------ the singer scene (levels 11 -> 12)
  // A seventh explorer walks the corridor while something far off sings. Its song is a ripple: a magenta wave lights the
  // corridor - and reaches them. A sting, and a countdown that ticks faster and faster: they are marked. They run. At
  // zero it LEAPS over the walls, lands exactly on the spot the wave found them at - and finds nothing there. They keep
  // moving and get away; the scene ends on the way to that. (Plays after level 11 is cleared.)
  const SG_S = 4.4;
  const SG_X0 = 780; // where it sings from (never lit until it leaps)
  const SG_SING_T = 4.4; // its song (a ripple of its own)
  const SG_MARK_X = 380; // where the explorer is when the wave reaches them - the spot it will land on
  const SG_MARK_T = SG_SING_T + (SG_X0 - SG_MARK_X) / 520; // the wave (RIPPLE_SPEED 520) reaches them
  const SG_COUNT = 3.0; // the countdown: Normal's markSeconds. The same length in calm mode.
  const SG_LEAP_T = SG_MARK_T + SG_COUNT; // it launches...
  const SG_LEAP_S = 0.6; // ...the leap takes this long (SINGER_LEAP_SECONDS)...
  const SG_LAND_T = SG_LEAP_T + SG_LEAP_S; // ...and lands on the marked spot
  const SG_CARD_T = 13.8;
  const SG_END_T = 18.8;
  const SG_PATH = [[0, 100, PY], [SG_MARK_T, SG_MARK_X, PY], [SG_MARK_T + 0.5, SG_MARK_X, PY], [SG_LEAP_T + 0.3, 200, PY], [SG_LAND_T + 3.8, 150, PY], [99, 150, PY]]; // walk, get marked, freeze a beat, then run
  const SG_LINES = [
    [1.0, 'Long way yet.'],
    [3.4, '...Is something singing?'],
    [SG_MARK_T + 0.3, 'It found me! Move, move-'],
    [SG_LAND_T + 0.9, 'It landed right where I was.'],
    [SG_LAND_T + 3.0, 'Keep moving. Never stop.'],
  ];
  /** The gaps between the ticks of the countdown: the same rule the game uses (0.85 s shrinking to 0.11 s). Returns [time since the sting, progress 0..1]. */
  function sgTicks() {
    const out = [];
    for (let tt = 0.55; tt < SG_COUNT; ) {
      const pr = tt / SG_COUNT;
      out.push([tt, pr]);
      tt += 0.85 - 0.74 * pr;
    }
    return out;
  }

  const PAL_MUFFLER = { glow: '204,214,228', cone: '216,224,236', body: '214,222,234', hand: '222,230,240', head: '238,243,249', lamp: '250,252,255' }; // a grey-white lamp: nothing warm down here
  const PAL_SINGER = { glow: '236,196,250', cone: '240,212,252', body: '238,208,250', hand: '244,222,254', head: '250,238,255', lamp: '254,248,255' }; // a violet-white lamp
  const MAGENTA = '236,64,236'; // the singer's tint
  const PAL_INTRO = { glow: '255,208,140', cone: '255,226,170', body: '255,226,175', hand: '255,232,190', head: '255,240,212', lamp: '255,250,232' };
  const PAL_SCENT = { glow: '196,236,170', cone: '210,242,196', body: '206,236,196', hand: '214,242,204', head: '234,250,228', lamp: '246,255,240' };
  const PAL_MIMIC = { glow: '255,176,156', cone: '255,200,182', body: '255,200,186', hand: '255,210,196', head: '255,228,216', lamp: '255,242,234' }; // a coral lamp
  const PAL_DECOY = { glow: '255,196,236', cone: '255,214,242', body: '255,214,240', hand: '255,224,246', head: '255,240,250', lamp: '255,248,252' }; // a pink-white lamp
  const PAL_STALKER = { glow: '170,226,240', cone: '196,238,248', body: '196,232,242', hand: '206,240,248', head: '228,248,253', lamp: '242,254,255' }; // a cold white lamp, so the orange stalker stands out
  const LIME = '190,240,70';
  const EXITGREEN = '93,255,160'; // the exit's green, which the mimic copies
  const PINK = '255,122,217'; // the sonar decoy's pink
  const ORANGE = '255,116,16'; // the stalker's orange

  // per-scene set-up: when the scene proper begins, the lamp colours, and which level's ambient drone plays
  const SCENE_START = { intro: S, scent: SC_S, mimic: MM_S, decoy: DC_S, stalker: ST_S, muffler: MF_S, singer: SG_S };
  const SCENE_PAL = { intro: PAL_INTRO, scent: PAL_SCENT, mimic: PAL_MIMIC, decoy: PAL_DECOY, stalker: PAL_STALKER, muffler: PAL_MUFFLER, singer: PAL_SINGER };
  const SCENE_AMBIENT = { intro: 1, scent: 6, mimic: 8, decoy: 9, stalker: 10, muffler: 11, singer: 12 };

  // ------------------------------------------------------------------- stage
  /** A small hand-built stretch of maze: a two-wide corridor with side passages and two pillars. */
  function buildStage() {
    const W = 24;
    const H = 9;
    const walls = new Uint8Array(W * H).fill(1);
    const carve = (x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) walls[y * W + x] = 0;
    };
    carve(1, 3, 22, 4); // main corridor
    carve(8, 1, 8, 2); // dead-end passage
    carve(17, 1, 17, 2); // the passage the monster comes out of
    carve(11, 5, 11, 7); // dead-end passage
    const obstacles = [[5, 3], [13, 3]].map(([tx, ty]) => ({
      x: (tx + 0.5) * TILE,
      y: (ty + 0.5) * TILE,
      r: OBSTACLE_R,
      tx,
      ty,
    }));
    const blocked = walls.slice();
    obstacles.forEach((o) => {
      blocked[o.ty * W + o.tx] = 1;
    });
    return {
      cfg: { rippleRadius: 430, cooldown: 1 },
      W,
      H,
      walls,
      blocked,
      obstacles,
      enemies: [],
      start: { x: 100, y: PY },
      exit: { x: -9999, y: -9999, r: 16 },
      pxW: W * TILE,
      pxH: H * TILE,
      person: { x: WALK[0][1], y: PY, r: 9 },
    };
  }

  // ---------------------------------------------------------------- factory
  function create(env) {
    const { audio, ctx, canvas } = env;
    const $ = (id) => document.getElementById(id);
    const el = {
      root: $('cutscene'),
      card: $('cs-card'),
      caption: $('cs-caption'),
      sub: $('cs-sub'),
      speaker: $('cs-speaker'),
      line: $('cs-line'),
      skip: $('cs-skip'),
      fx: $('cs-fx'), // [sound captions] (Visual cues option)
    };

    let active = false;
    let time = 0;
    let events = [];
    let ev = 0;
    let stage = null;
    let person = null;
    let sub = null; // the line currently being typed: { text, start, shown }
    let rings = []; // decorative rings over the lore cards
    let ringTimer = 0;
    let camX = 0;
    let camY = 0;
    let fxUntil = 0; // scene time at which the current [sound caption] fades away (0 = none showing)

    // scene state
    let angle = 0;
    let offX = 0;
    let stepDist = 0;
    let lastX = 0;
    let lampFlicker = 1;
    let noticed = false;
    let personVisible = true;
    let lampOn = true;
    let dark = false;
    let flash = 0;
    let shake = 0;
    let monster = null; // the leaping monster
    let mvoice = null; // its growl, heard before it is seen
    let danger = 0; // 0..1 how close the thing feels

    // which scene is playing: 'intro', 'scent', 'mimic', 'decoy' or 'stalker' (see the header comment)
    let kind = 'intro';
    let sceneStart = S;
    let pal = PAL_INTRO;
    // mimic scene state
    let mm = null; // the mimic: { phase: 'glow' | 'monster', x, stepDist }
    let glowPulse = 0; // 0..1: it flares with each chime
    let isWalking = false; // the mimic and decoy scenes move the explorer freely (and up into a passage)
    // decoy scene state
    let mm2 = { echoX: -200, scentX: -200 }; // where the two monsters are along the corridor (off in the dark until they set out)
    let mvoice2 = null; // the scent monster's voice (the echo monster's is `mvoice`)
    let dcStep = { echo: 0, scent: 0 }; // distance walked since each monster's last footstep
    // stalker scene state
    let crouchAmt = 0; // 0..1: how far down the explorer is (smaller, and the lamp dims)
    let stMon = { x: -200, heading: 0, stepDist: 0, clickCd: 0.8, listening: false, moving: false }; // the stalker
    // muffler scene state (the muffler itself is never drawn)
    let mfMon = { x: MF_X0, stepDist: 0, thumpCd: 0.6, stopped: false }; // where it is, and its slow thumps
    // singer scene state
    let sgMon = { x: SG_X0, y: PY, phase: 'sing', arc: 0 }; // phase: sing | leap | landed; arc = its height above the corridor in the leap
    let sgTickIdx = 0; // which countdown tick comes next
    let sgHit = false; // the wave has reached the explorer: they are marked (until it launches)
    // scent scene state
    let smell = 0; // seconds of walking left of being smelly
    let trail = null; // the smell trail behind the explorer: { pts, active }
    let scentMon = null; // the scent monster: { x, state: 'patrol' | 'follow', stepDist }
    let lunge = 0; // 0..1: the last rush at the explorer

    // -------------------------------------------------------------- helpers
    const sceneT = () => time - sceneStart;
    /** Calm mode softens the scare: no flash or shake, a dimmer monster, quieter sound. */
    const isCalm = () => !!(env.calm && env.calm());

    /** Where the explorer of the scent scene is: walking at a steady pace, then stopped. */
    const scWalkX = (st) => SC_START_X + SC_SPEED * clamp(st, 0, SC_STOP_T);
    /** Explorer's x at scene time st, whichever scene is playing. */
    const xAt = (st) => (kind === 'scent' ? scWalkX(st) : personX(st));

    /** Value of a piecewise-linear path at scene time st. Each point is [time, value] (or [time, x, y] for a 2D path, then use pathAt). */
    function lerpPath(list, st) {
      if (st <= list[0][0]) return list[0][1];
      for (let i = 1; i < list.length; i++) {
        if (st <= list[i][0]) {
          const [t0, x0] = list[i - 1];
          const [t1, x1] = list[i];
          return lerp(x0, x1, (st - t0) / (t1 - t0));
        }
      }
      return list[list.length - 1][1];
    }

    /** Position on a [time, x, y] path at scene time st. */
    function pathAt(list, st) {
      if (st <= list[0][0]) return { x: list[0][1], y: list[0][2] };
      for (let i = 1; i < list.length; i++) {
        if (st <= list[i][0]) {
          const [t0, x0, y0] = list[i - 1];
          const [t1, x1, y1] = list[i];
          const u = (st - t0) / (t1 - t0);
          return { x: lerp(x0, x1, u), y: lerp(y0, y1, u) };
        }
      }
      const last = list[list.length - 1];
      return { x: last[1], y: last[2] };
    }

    const personX = (st) => lerpPath(WALK, st);

    /** Pan and loudness of something at (x,y) as heard by the explorer. */
    function heard(x, y, range) {
      const dx = x - person.x;
      const dy = y - person.y;
      const d = Math.hypot(dx, dy);
      return { d, pan: clamp((dx / (d + 90)) * 1.35, -1, 1), g: Math.pow(Math.max(0, 1 - d / range), 1.5) };
    }

    function showCard(text) {
      el.card.textContent = text;
      el.card.classList.add('show');
    }
    function hideCard() {
      el.card.classList.remove('show');
    }

    /**
     * A short sound caption in [brackets], shown above the explorer's subtitles for people who use the Visual cues
     * option: [distant scraping], [device clatters]. Each one goes with a sound the scene really plays; it is text,
     * so it fades and never flashes. Does nothing when the option is off.
     */
    function fx(text, dur = 2.1) {
      if (!(env.visualCues && env.visualCues()) || !el.fx) return;
      el.fx.textContent = text;
      el.fx.classList.add('show');
      fxUntil = time + dur;
    }

    function say(text) {
      sub = { text, start: time, shown: 0 };
      el.speaker.textContent = 'Explorer';
      el.line.textContent = '';
      el.sub.classList.add('show');
    }
    function clearSub() {
      sub = null;
      el.sub.classList.remove('show');
    }
    function updateSub() {
      if (!sub) return;
      const n = Math.min(sub.text.length, Math.floor((time - sub.start) * CPS));
      if (n !== sub.shown) {
        for (let i = sub.shown; i < n; i++) {
          const ch = sub.text[i];
          if (/[a-z]/i.test(ch) && i % 2 === 0) audio.voice(ch.toLowerCase().charCodeAt(0));
        }
        sub.shown = n;
        el.line.textContent = sub.text.slice(0, n);
      }
      if (n >= sub.text.length && time - (sub.start + sub.text.length / CPS) > 1.6) clearSub();
    }

    function stopMonsterVoice() {
      if (mvoice) audio.destroyEnemyVoice(mvoice);
      mvoice = null;
      if (mvoice2) audio.destroyEnemyVoice(mvoice2);
      mvoice2 = null;
    }

    // ----------------------------------------------------------- the timeline
    function build() {
      events = [];
      ev = 0;
      const at = (t, fn) => events.push({ t, fn });

      // lore cards
      CARDS.forEach(([t, dur, text], i) => {
        at(t, () => {
          showCard(text);
          audio.swell(52 + i * 4);
        });
        at(t + dur - 1.2, hideCard);
      });

      // scene
      at(S, () => {
        rings = [];
      });
      at(S + 0.8, () => {
        el.caption.textContent = 'Day 41';
        el.caption.classList.add('show');
      });
      at(S + 4.6, () => el.caption.classList.remove('show'));

      LINES.forEach(([t, text]) => at(S + t, () => say(text)));

      [2.2, 5.6, 9.4, 15.6, 22.9, 23.5].forEach((t) => at(S + t, () => audio.breath(t > 22 ? 1.4 : 1)));

      at(S + PING_AT, () => {
        audio.ping(0.85);
        env.castRipple(person.x, person.y);
      });

      // the thing in the dark
      at(S + LISTEN_AT, () => {
        mvoice = audio.createEnemyVoice(46);
      });
      CLICKS.forEach((t) =>
        at(S + t, () => {
          const h = heard(STUB.x, STUB.y, 700);
          audio.enemyStep(h.pan, 0.5 + 0.5 * danger);
        })
      );
      BEATS.forEach(([t, g]) => at(S + t, () => audio.heartbeat(g)));
      at(S + NOTICE_AT, () => {
        noticed = true;
      });

      // the leap
      at(S + LEAP_AT, () => {
        monster = { t: 0 };
        audio.lunge();
      });
      at(S + HIT_AT, () => {
        flash = isCalm() ? 0 : 1;
        shake = isCalm() ? 0 : 16;
        personVisible = false;
        lampOn = false;
        stopMonsterVoice();
        clearSub();
        audio.stopAmbient();
        audio.silence(1.25);
      });
      at(S + GONE_AT, () => {
        dark = true;
        monster = null;
      });

      // what is left behind
      at(S + CLANK_AT, () => audio.clank());
      at(S + LAST_PING_AT, () => {
        stage.cfg.rippleRadius = 300;
        audio.ping(0.4);
        env.castRipple(person.x, person.y);
      });
      at(S + FINAL_CARD_AT, () => {
        showCard('Now it is your turn.');
        audio.swell(48, 1.1);
      });
      at(S + FINAL_CARD_AT + 3.4, hideCard);
      at(S + END_AT, () => finish());

      // [sound captions] (Visual cues option), one per sound the scene plays
      const fxs = (t, text, dur) => at(S + t, () => fx(text, dur));
      fxs(2.2, '[slow, tired breathing]');
      fxs(PING_AT, '[sonar ping]', 1.4);
      fxs(PING_AT + 1.5, '[echoes ticking back off the walls]');
      fxs(LISTEN_AT, '[something breathing in the dark]');
      fxs(21.4, '[clicking footsteps, closer]', 1.4);
      fxs(22.4, '[heartbeat pounding]', 1.3);
      fxs(LEAP_AT, '[a monster lunges]', 1.0);
      fxs(GONE_AT, '[silence]', 1.5);
      fxs(CLANK_AT, '[device clatters]', 1.2);
      fxs(LAST_PING_AT, '[a lone ping]');

      events.sort((a, b) => a.t - b.t); // update() walks this list in order
    }

    // --------------------------------------------- the scent scene: the timeline
    function buildScent() {
      events = [];
      ev = 0;
      const at = (t, fn) => events.push({ t, fn });
      const S2 = SC_S;

      // one line of lore, then the scene
      at(0.6, () => {
        showCard('Not every monster listens.');
        audio.swell(50);
      });
      at(S2 - 1.0, hideCard);
      at(S2, () => {
        rings = [];
      });
      at(S2 + 0.8, () => {
        el.caption.textContent = 'Day 12';
        el.caption.classList.add('show');
      });
      at(S2 + 3.4, () => el.caption.classList.remove('show'));
      SC_LINES.forEach(([t, text]) => at(S2 + t, () => say(text)));
      [2.0, 5.2, 9.0].forEach((t) => at(S2 + t, () => audio.breath(0.9)));

      // in the puddle: the smell, and its trail, begin
      at(S2 + SC_PUDDLE_T, () => {
        smell = SC_SMELL;
        trail = { pts: [{ x: SC_PUDDLE_X, y: PY }], active: true };
        audio.splash(1);
      });

      // something comes in from the left, wandering - it has not heard a thing
      at(S2 + SC_MON_T0, () => {
        scentMon = { x: SC_MON_X0, state: 'patrol', stepDist: 0 };
        mvoice = audio.createEnemyVoice(78, 'scent');
      });
      // ...until it touches the start of the trail, and follows it to the other end
      at(S2 + SC_TOUCH_T, () => {
        if (!scentMon) return;
        scentMon.state = 'follow';
        const h = heard(scentMon.x, PY, 900);
        audio.scentAlert(h.pan, 1);
      });
      [[2.6, 0.5], [1.7, 0.7], [0.95, 0.9]].forEach(([before, g]) => at(S2 + SC_HIT_T - before, () => audio.heartbeat(g)));
      at(S2 + SC_HIT_T - 0.7, () => {
        noticed = true;
      });
      at(S2 + SC_HIT_T - 0.35, () => audio.lunge());
      at(S2 + SC_HIT_T, () => {
        flash = isCalm() ? 0 : 1;
        shake = isCalm() ? 0 : 14;
        personVisible = false;
        lampOn = false;
        stopMonsterVoice();
        clearSub();
        audio.stopAmbient();
        audio.silence(1.1);
      });
      at(S2 + SC_HIT_T + 0.25, () => {
        dark = true;
        scentMon = null;
      });

      // only the trail is left glowing in the dark
      at(S2 + SC_CARD_T, () => {
        showCard("It can't hear you.\nIt follows what you leave behind.");
        audio.swell(46, 1.1);
      });
      at(S2 + SC_CARD_T + 4.2, hideCard);
      at(S2 + SC_END_T, () => finish());

      // [sound captions] (Visual cues option)
      const fxs = (t, text, dur) => at(S2 + t, () => fx(text, dur));
      fxs(SC_PUDDLE_T, '[a wet splash]', 1.6);
      fxs(SC_MON_T0, '[wet gurgling, far off]');
      fxs(SC_MON_T0 + 1.8, '[soft, wet footsteps]');
      fxs(SC_TOUCH_T, '[a sharp sniffing snort]', 1.6);
      fxs(SC_HIT_T - 1.7, '[heartbeat pounding]', 1.2);
      fxs(SC_HIT_T - 0.35, '[a rush of wet footsteps]', 1.0);
      fxs(SC_HIT_T + 0.6, '[silence]', 1.6);

      events.sort((a, b) => a.t - b.t);
    }

    /** Per-frame logic of the scent scene. */
    function updateScentScene(dt) {
      if (time < SC_S) {
        ringTimer -= dt;
        if (ringTimer <= 0) {
          ringTimer = 2.4;
          rings.push({ t: 0 });
        }
        for (const r of rings) r.t += dt;
        rings = rings.filter((r) => r.t < 7);
        return;
      }
      const st = time - SC_S;
      flash = Math.max(0, flash - dt * 2.4);
      shake = Math.max(0, shake - dt * 30);

      // the explorer walks at a steady pace until their smell has run out
      const before = person.x;
      person.x = scWalkX(st);
      person.y = PY;
      const walking = st < SC_STOP_T && personVisible;
      if (walking) {
        stepDist += person.x - before;
        if (stepDist >= 30) {
          stepDist = 0;
          audio.footstep(0.35);
        }
      }

      // smell: the clock only runs while they are walking, and a trail grows behind them
      if (smell > 0 && walking) {
        smell = Math.max(0, smell - dt);
        if (trail) {
          const last = trail.pts[trail.pts.length - 1];
          if (person.x - last.x >= 12 || (smell === 0 && person.x - last.x > 1)) trail.pts.push({ x: person.x, y: PY });
          if (smell === 0) trail.active = false;
        }
      }

      // they turn towards the sniffing behind them, and flinch when they see what is coming
      angle = Math.PI * smooth((st - (SC_TOUCH_T - 0.6)) / 0.7);
      if (noticed) offX = lerp(offX, 12, Math.min(1, dt * 14));

      // the scent monster: wanders in, touches the trail, follows it to the other end
      if (scentMon) {
        const follow = scentMon.state === 'follow';
        const px = scentMon.x;
        scentMon.x = Math.min(follow ? SC_REACH : SC_PUDDLE_X, px + (follow ? SC_MON_FOLLOW : SC_MON_PATROL) * dt);
        scentMon.stepDist += scentMon.x - px;
        if (scentMon.stepDist >= 26) {
          scentMon.stepDist = 0;
          const h = heard(scentMon.x, PY, 700);
          audio.scentStep(h.pan, 0.5 + 0.5 * danger);
        }
      }
      lunge = clamp((st - (SC_HIT_T - 0.35)) / 0.35, 0, 1);
      danger = clamp((st - SC_MON_T0) / (SC_HIT_T - SC_MON_T0), 0, 1);
      if (mvoice && scentMon) {
        const h = heard(scentMon.x, PY, 800);
        audio.updateEnemyVoice(mvoice, { gain: h.g * (0.12 + 0.4 * danger), pan: h.pan, mood: 0.35 + 0.65 * danger, muffle: false });
      }

      // the headlamp gutters as it gets close
      const wobble = 0.82 + 0.18 * Math.sin(time * 21) + (Math.random() - 0.5) * 0.12;
      const dropout = danger > 0.5 && Math.sin(time * 9.3) * Math.sin(time * 4.1) > 0.82 ? 0.25 : 1;
      lampFlicker = lampOn ? wobble * dropout : 0;

      camX = lerp(camX, person.x + (st < SC_STOP_T ? 70 : -60), Math.min(1, dt * 2.5));
      camY = 150;
    }

    // ------------------------------------------- the mimic scene: the timeline
    function buildMimic() {
      events = [];
      ev = 0;
      const at = (t, fn) => events.push({ t, fn });
      const S3 = MM_S;

      at(0.6, () => {
        showCard('Not everything that glows is a way out.');
        audio.swell(50);
      });
      at(S3 - 1.0, hideCard);
      at(S3, () => {
        rings = [];
      });
      at(S3 + 0.8, () => {
        el.caption.textContent = 'Day 33';
        el.caption.classList.add('show');
      });
      at(S3 + 3.4, () => el.caption.classList.remove('show'));
      MM_LINES.forEach(([t, text]) => at(S3 + t, () => say(text)));
      [2.4, 6.0, 9.2, 13.0].forEach((t) => at(S3 + t, () => audio.breath(0.9)));

      // the "exit" starts to chime - the very same sound as the real one - and to glow
      for (let t = MM_CHIME_T; t < MM_TOUCH_T; t += 2.4) {
        at(S3 + t, () => {
          const h = heard(MM_X, PY, 900);
          audio.beacon(h.pan, Math.max(h.g, 0.45));
          glowPulse = 1;
        });
      }

      // they ping it...
      at(S3 + MM_PING_T, () => {
        audio.ping(0.85);
        stage.cfg.rippleRadius = MM_R;
        env.castRipple(person.x, person.y);
      });
      // ...the wave touches it, and it turns into an echo monster
      at(S3 + MM_TOUCH_T, () => {
        if (!mm) return;
        mm.phase = 'monster';
        const h = heard(MM_X, PY, 900);
        audio.mimicReveal(h.pan, 1);
        mvoice = audio.createEnemyVoice(50);
        noticed = true;
      });
      [[0.35, 0.55], [0.7, 0.8]].forEach(([dt, g]) => at(S3 + MM_TOUCH_T + dt, () => audio.heartbeat(g)));
      at(S3 + MM_HIT_T - 0.35, () => audio.lunge());
      at(S3 + MM_HIT_T, () => {
        flash = isCalm() ? 0 : 1;
        shake = isCalm() ? 0 : 14;
        personVisible = false;
        lampOn = false;
        stopMonsterVoice();
        clearSub();
        audio.stopAmbient();
        audio.silence(1.25);
      });
      at(S3 + MM_HIT_T + 0.25, () => {
        dark = true;
        mm = null;
      });
      at(S3 + MM_HIT_T + 1.3, () => audio.clank()); // their sonar device clatters to the floor
      at(S3 + MM_CARD_T, () => {
        showCard('It looks like the way out.\nUntil your echo touches it.');
        audio.swell(46, 1.1);
      });
      at(S3 + MM_CARD_T + 4.2, hideCard);
      at(S3 + MM_END_T, () => finish());

      // [sound captions] (Visual cues option)
      const fxs = (t, text, dur) => at(S3 + t, () => fx(text, dur));
      fxs(MM_CHIME_T, '[a chime, far down the corridor]', 2.4);
      fxs(MM_PING_T, '[sonar ping]', 1.3);
      fxs(MM_TOUCH_T + 0.03, '[the chime turns into a snarl - something charges]', 1.9);
      fxs(MM_HIT_T + 0.6, '[silence]', 1.4);
      fxs(MM_HIT_T + 1.3, '[device clatters]', 1.6);

      events.sort((a, b) => a.t - b.t);
    }

    /** Per-frame logic of the mimic scene. */
    function updateMimicScene(dt) {
      if (time < MM_S) {
        ringTimer -= dt;
        if (ringTimer <= 0) {
          ringTimer = 2.4;
          rings.push({ t: 0 });
        }
        for (const r of rings) r.t += dt;
        rings = rings.filter((r) => r.t < 7);
        return;
      }
      const st = time - MM_S;
      flash = Math.max(0, flash - dt * 2.4);
      shake = Math.max(0, shake - dt * 30);
      glowPulse = Math.max(0, glowPulse - dt * 1.1);

      // the explorer trudges, stops when they hear the chime, then hurries towards it, then stops to ping
      const before = person.x;
      person.x = lerpPath(MM_WALK, st);
      person.y = PY;
      isWalking = personVisible && Math.abs(person.x - before) > 0.01;
      if (isWalking) {
        stepDist += person.x - before;
        if (stepDist >= 30) {
          stepDist = 0;
          audio.footstep(0.35);
        }
      }
      angle = 0;
      if (noticed) offX = lerp(offX, -12, Math.min(1, dt * 14));

      // once it has turned it runs straight at the spot the ripple was sent from
      if (mm && mm.phase === 'monster') {
        const px = mm.x;
        mm.x = Math.max(430 + 26, MM_X - MM_RUN * Math.max(0, st - (MM_TOUCH_T + 0.12)));
        mm.stepDist += px - mm.x;
        if (mm.stepDist >= 24) {
          mm.stepDist = 0;
          const h = heard(mm.x, PY, 700);
          audio.enemyStep(h.pan, 0.5 + 0.5 * danger);
        }
      }
      danger = clamp((st - MM_TOUCH_T) / (MM_HIT_T - MM_TOUCH_T), 0, 1);
      if (mvoice && mm) {
        const h = heard(mm.x, PY, 800);
        audio.updateEnemyVoice(mvoice, { gain: h.g * (0.2 + 0.4 * danger), pan: h.pan, mood: 0.5 + 0.5 * danger, muffle: false });
      }

      // the headlamp gutters as it comes
      const wobble = 0.82 + 0.18 * Math.sin(time * 21) + (Math.random() - 0.5) * 0.12;
      const dropout = danger > 0.3 && Math.sin(time * 9.3) * Math.sin(time * 4.1) > 0.82 ? 0.25 : 1;
      lampFlicker = lampOn ? wobble * dropout : 0;

      camX = lerp(camX, person.x + 110, Math.min(1, dt * 2.5));
      camY = 150;
    }

    // ------------------------------------------- the decoy scene: the timeline
    /** Where a monster is at scene time st: it walks in from the left, then at the call heads for the decoy and stops there. */
    function dcMonsterX(m, t0, st) {
      if (st < t0) return -200; // still out of sight in the dark
      if (st < DC_CALL_T) return 60 + m.v * (st - t0);
      return Math.min(m.stop, m.xCall + m.vLured * (st - DC_CALL_T));
    }

    function buildDecoy() {
      events = [];
      ev = 0;
      const at = (t, fn) => events.push({ t, fn });
      const S4 = DC_S;

      at(0.6, () => {
        showCard('You cannot outrun everything.');
        audio.swell(50);
      });
      at(S4 - 1.0, hideCard);
      at(S4, () => {
        rings = [];
      });
      at(S4 + 0.8, () => {
        el.caption.textContent = 'Day 19';
        el.caption.classList.add('show');
      });
      at(S4 + 3.4, () => el.caption.classList.remove('show'));
      DC_LINES.forEach(([t, text]) => at(S4 + t, () => say(text)));
      [2.2, 7.4, 10.6, 15.0].forEach((t) => at(S4 + t, () => audio.breath(0.9)));

      // they find it, and take it
      at(S4 + DC_PICK_T, () => audio.decoyPickup());
      // the monsters are heard long before they are seen
      at(S4 + DC_CALL_T - 6.6, () => {
        mvoice = audio.createEnemyVoice(50);
        mvoice2 = audio.createEnemyVoice(78, 'scent');
      });
      // they put it down. It beeps - faster and higher - for five seconds, then it calls
      at(S4 + DC_DROP_T, () => audio.decoyDrop());
      for (let t = 0.4; t < 5; ) {
        const f = t / 5;
        at(S4 + DC_DROP_T + t, () => {
          const h = heard(DC_X, DC_Y, 900);
          audio.decoyTick(h.pan, Math.max(h.g, 0.4), f);
        });
        t += 0.85 - 0.6 * f;
      }
      at(S4 + DC_CALL_T, () => {
        const h = heard(DC_X, DC_Y, 1100);
        audio.decoyCall(h.pan, Math.max(h.g, 0.5));
      });
      at(S4 + DC_CARD_T, () => {
        showCard('Give them somewhere else to go.');
        audio.swell(52, 1.1);
      });
      at(S4 + DC_CARD_T + 3.8, hideCard);
      at(S4 + DC_END_T, () => finish());

      // [sound captions] (Visual cues option)
      const fxs = (t, text, dur) => at(S4 + t, () => fx(text, dur));
      fxs(DC_PICK_T, '[a soft chime as it is picked up]', 1.8);
      fxs(DC_CALL_T - 6.6, '[distant scraping]', 2.6);
      fxs(DC_DROP_T, '[the decoy beeps, faster and higher]', 3.4);
      fxs(DC_CALL_T, '[the decoy calls out]', 1.8);
      fxs(DC_SCENT_TRAP_T + 0.4, '[monsters held in place, growling]', 2.4);

      events.sort((a, b) => a.t - b.t);
    }

    /** Per-frame logic of the decoy scene. */
    function updateDecoyScene(dt) {
      if (time < DC_S) {
        ringTimer -= dt;
        if (ringTimer <= 0) {
          ringTimer = 2.4;
          rings.push({ t: 0 });
        }
        for (const r of rings) r.t += dt;
        rings = rings.filter((r) => r.t < 7);
        return;
      }
      const st = time - DC_S;
      flash = Math.max(0, flash - dt * 2.4);
      shake = Math.max(0, shake - dt * 30);

      // the explorer: down the corridor, picks it up, drops it, ducks into the side passage, waits, slips away
      const bx = person.x;
      const by = person.y;
      const p = pathAt(DC_PATH, st);
      person.x = p.x;
      person.y = p.y;
      const moved = Math.hypot(person.x - bx, person.y - by);
      isWalking = moved > 0.01;
      if (isWalking) {
        angle = Math.atan2(person.y - by, person.x - bx);
        stepDist += moved;
        if (stepDist >= 30) {
          stepDist = 0;
          audio.footstep(0.35);
        }
      } else if (st > 14.0 && st < 19.6) {
        angle = Math.atan2(DC_Y - person.y, DC_X - person.x); // watching the corridor from the passage
      }
      lampFlicker = 0.86 + 0.14 * Math.sin(time * 19) + (Math.random() - 0.5) * 0.08;

      // the two monsters: their footsteps and voices
      const xe = dcMonsterX(DC_ECHO, DC_ECHO_T0, st);
      const xs = dcMonsterX(DC_SCENT, DC_SCENT_T0, st);
      const prev = { e: mm2.echoX, s: mm2.scentX };
      mm2.echoX = xe;
      mm2.scentX = xs;
      if (xe > 0 && prev.e > 0) {
        dcStep.echo += Math.abs(xe - prev.e);
        if (dcStep.echo >= 22) {
          dcStep.echo = 0;
          const h = heard(xe, DC_ECHO.y, 700);
          audio.enemyStep(h.pan, 0.45 + 0.4 * h.g);
        }
      }
      if (xs > 0 && prev.s > 0) {
        dcStep.scent += Math.abs(xs - prev.s);
        if (dcStep.scent >= 24) {
          dcStep.scent = 0;
          const h = heard(xs, DC_SCENT.y, 700);
          audio.scentStep(h.pan, 0.45 + 0.4 * h.g);
        }
      }
      const calledIn = clamp((st - (DC_CALL_T - 4)) / 4, 0, 1);
      if (mvoice) {
        const h = heard(xe, DC_ECHO.y, 900);
        audio.updateEnemyVoice(mvoice, { gain: h.g * (0.1 + 0.32 * calledIn), pan: h.pan, mood: st > DC_ECHO_TRAP_T ? 0.3 : 0.4 + 0.6 * calledIn, muffle: false });
      }
      if (mvoice2) {
        const h = heard(xs, DC_SCENT.y, 900);
        audio.updateEnemyVoice(mvoice2, { gain: h.g * (0.1 + 0.3 * calledIn), pan: h.pan, mood: st > DC_SCENT_TRAP_T ? 0.3 : 0.4 + 0.5 * calledIn, muffle: false });
      }

      // the camera: with them, then held on the decoy while it does its work, then with them again
      let target = person.x + 80;
      if (st >= DC_DROP_T - 0.3 && st < 19.6) target = 610;
      camX = lerp(camX, target, Math.min(1, dt * 2.2));
      camY = 150;
    }

    // ------------------------------------------- the stalker scene: the timeline
    /** Where the stalker is at scene time st: out of sight, then walking in, standing at the spot it heard, then walking on. */
    function stalkerX(st) {
      if (st < ST_MON_T0) return -200;
      if (st < ST_ARRIVE_T) return ST_MON_X0 + ST_MON_V * (st - ST_MON_T0);
      if (st < ST_LOSE_T) return ST_STOP_X;
      return ST_STOP_X + ST_MON_V * (st - ST_LOSE_T);
    }

    function buildStalker() {
      events = [];
      ev = 0;
      const at = (t, fn) => events.push({ t, fn });
      const S5 = ST_S;

      at(0.6, () => {
        showCard('Some things do not need a ripple to find you.');
        audio.swell(50);
      });
      at(S5 - 1.0, hideCard);
      at(S5, () => {
        rings = [];
      });
      at(S5 + 0.8, () => {
        el.caption.textContent = 'Day 47';
        el.caption.classList.add('show');
      });
      at(S5 + 3.4, () => el.caption.classList.remove('show'));
      ST_LINES.forEach(([t, text]) => at(S5 + t, () => say(text)));
      // their breathing: normal, then held while it stands beside them, then let go
      [2.0, 4.8].forEach((t) => at(S5 + t, () => audio.breath(0.9)));
      at(S5 + ST_LOSE_T + 1.0, () => audio.breath(1.3));

      // it is heard before it is seen: breathing in the dark, then it hears their steps and turns
      at(S5 + ST_MON_T0 - 0.6, () => {
        mvoice = audio.createEnemyVoice(64, 'stalker');
      });
      at(S5 + ST_MON_T0 + 0.1, () => {
        const h = heard(stMon.x > 0 ? stMon.x : ST_MON_X0, ST_MON_Y, 900);
        audio.stalkerAlert(h.pan, Math.max(h.g, 0.5));
      });
      at(S5 + 4.0, () => {
        noticed = true;
      });
      at(S5 + ST_CROUCH_T - 0.3, () => {
        noticed = false;
      });
      [[5.4, 0.5], [6.3, 0.65], [7.1, 0.8], [7.9, 0.9], [8.7, 0.85], [9.5, 0.7]].forEach(([t, g]) => at(S5 + t, () => audio.heartbeat(g)));

      at(S5 + ST_CARD_T, () => {
        showCard('It hears every step, even you standing still.\nHold SHIFT to crouch.');
        audio.swell(52, 1.1);
      });
      at(S5 + ST_CARD_T + 4.6, hideCard);
      at(S5 + ST_END_T, () => finish());

      // [sound captions] (Visual cues option)
      const fxs = (t, text, dur) => at(S5 + t, () => fx(text, dur));
      fxs(ST_MON_T0 - 0.6, '[breathing in the dark]', 1.7);
      fxs(ST_MON_T0 + 0.1, '[a sharp breath, then clicks]', 1.5);
      fxs(4.7, '[soft, quick footsteps]', 1.5);
      fxs(5.4, '[heartbeat pounding]', 1.5);
      fxs(ST_ARRIVE_T, '[soft clicks, right beside them]', 2.0);
      fxs(ST_LOSE_T + 0.9, '[a slow breath out]', 1.6);
      fxs(12.0, '[footsteps fading]', 1.8);

      events.sort((a, b) => a.t - b.t);
    }

    /** Per-frame logic of the stalker scene. */
    function updateStalkerScene(dt) {
      if (time < ST_S) {
        ringTimer -= dt;
        if (ringTimer <= 0) {
          ringTimer = 2.4;
          rings.push({ t: 0 });
        }
        for (const r of rings) r.t += dt;
        rings = rings.filter((r) => r.t < 7);
        return;
      }
      const st = time - ST_S;
      flash = 0;
      shake = 0;

      // the explorer: walks to the spot, stops, drops into a crouch and creeps out of the lane; a crouch makes no footsteps
      crouchAmt = smooth((st - ST_CROUCH_T) / 0.5);
      const bx = person.x;
      const by = person.y;
      const p = pathAt(ST_PATH, st);
      person.x = p.x;
      person.y = p.y;
      const moved = Math.hypot(person.x - bx, person.y - by);
      isWalking = moved > 0.01;
      if (isWalking && crouchAmt < 0.5) {
        stepDist += moved;
        if (stepDist >= 30) {
          stepDist = 0;
          audio.footstep(0.35);
        }
      }
      // they turn to face the sound when they stop, and look ahead again once it has gone
      const lookBack = st > ST_LOSE_T + 1.3 ? smooth((st - (ST_LOSE_T + 1.3)) / 0.8) : 0;
      angle = Math.PI * smooth((st - (ST_WALK_END_T - 0.2)) / 0.5) * (1 - lookBack);

      // the stalker: a steady walk in, stands at the exact spot listening, gives up, walks on
      const px = stMon.x;
      stMon.x = stalkerX(st);
      stMon.listening = st >= ST_ARRIVE_T && st < ST_LOSE_T;
      stMon.moving = stMon.x > 0 && !stMon.listening && px > 0 && Math.abs(stMon.x - px) > 0.01;
      stMon.heading = stMon.listening ? 0.55 * Math.sin(time * 2.3) : 0;
      if (stMon.moving) {
        stMon.stepDist += Math.abs(stMon.x - px);
        if (stMon.stepDist >= 19) {
          stMon.stepDist = 0;
          const h = heard(stMon.x, ST_MON_Y, 700);
          audio.stalkerStep(h.pan, 0.45 + 0.4 * h.g);
        }
      }
      if (stMon.x > 0) {
        stMon.clickCd -= dt;
        if (stMon.clickCd <= 0) {
          stMon.clickCd = 0.9 + Math.random() * 0.9;
          const h = heard(stMon.x, ST_MON_Y, 700);
          audio.stalkerClick(h.pan, 0.4 + 0.5 * h.g);
        }
      }
      // the breathing swells as it comes close, and thins out once it has lost them
      danger = st < ST_LOSE_T ? clamp((st - ST_MON_T0) / (ST_ARRIVE_T - ST_MON_T0), 0, 1) : clamp(1 - (st - ST_LOSE_T) / 3, 0, 1);
      if (mvoice) {
        const h = heard(stMon.x > 0 ? stMon.x : ST_MON_X0, ST_MON_Y, 800);
        audio.updateEnemyVoice(mvoice, { gain: h.g * (0.14 + 0.32 * danger), pan: h.pan, mood: 0.4 + 0.6 * danger, muffle: false });
      }

      // the lamp gutters as it nears, and is turned down while they are crouched
      const wobble = 0.86 + 0.14 * Math.sin(time * 19) + (Math.random() - 0.5) * 0.08;
      const dropout = danger > 0.5 && st < ST_LOSE_T && Math.sin(time * 9.3) * Math.sin(time * 4.1) > 0.85 ? 0.3 : 1;
      lampFlicker = wobble * dropout * (1 - 0.4 * crouchAmt);

      // the camera stays with them - then, for the closing card, drifts aside so the explorer is not under the text
      camX = lerp(camX, person.x + (st > ST_CARD_T - 1.2 ? 300 : 70), Math.min(1, dt * 2.5));
      camY = 150;
    }

    // ------------------------------------------- the muffler scene: the timeline
    /** Where the (unseen) muffler is at scene time st: it waits in the corridor, then walks towards where the sound came from and stops beside the explorer. */
    function mufflerX(st) {
      if (st < MF_MOVE_T) return MF_X0;
      return Math.max(MF_STOP_X, MF_X0 - MF_V * (st - MF_MOVE_T));
    }

    function buildMuffler() {
      events = [];
      ev = 0;
      const at = (t, fn) => events.push({ t, fn });
      const S6 = MF_S;

      at(0.6, () => {
        showCard('Some things swallow your echo.');
        audio.swell(48);
      });
      at(S6 - 1.0, hideCard);
      at(S6, () => {
        rings = [];
      });
      at(S6 + 0.8, () => {
        el.caption.textContent = 'Day 58';
        el.caption.classList.add('show');
      });
      at(S6 + 3.4, () => el.caption.classList.remove('show'));
      MF_LINES.forEach(([t, text]) => at(S6 + t, () => say(text)));
      [2.0, 5.0, 8.6].forEach((t) => at(S6 + t, () => audio.breath(0.9)));

      // its hum starts far down the corridor, long before anything else - and nothing is ever seen
      at(S6 + 2.4, () => {
        mvoice = audio.createEnemyVoice(50, 'muffler');
      });
      // one ripple down the corridor: the wave that reaches the muffler simply ENDS there (the game's own rule, via an absorber)
      at(S6 + MF_PING_T, () => {
        audio.ping(0.85);
        stage.cfg.rippleRadius = 430;
        env.castRipple(person.x, person.y, 430, { absorbers: [{ x: MF_X0, y: PY, r: MF_R }] });
      });
      [[10.2, 0.5], [11.0, 0.65], [11.8, 0.8], [12.5, 0.9]].forEach(([t, g]) => at(S6 + t, () => audio.heartbeat(g)));
      at(S6 + MF_HIT_T - 0.05, () => {
        const h = heard(mfMon.x, PY, 900);
        audio.mufflerAlert(h.pan, 1);
      });
      at(S6 + MF_HIT_T, () => {
        flash = isCalm() ? 0 : 1;
        shake = isCalm() ? 0 : 14;
        personVisible = false;
        lampOn = false;
        stopMonsterVoice();
        clearSub();
        audio.stopAmbient();
        audio.silence(1.25);
      });
      at(S6 + MF_HIT_T + 0.25, () => {
        dark = true;
      });
      at(S6 + MF_HIT_T + 1.3, () => audio.clank()); // their sonar device clatters to the floor
      at(S6 + MF_CARD_T, () => {
        showCard('You cannot see it. You can only hear it.\nCrouching helps a lot. Stay still when it is close.');
        audio.swell(46, 1.1);
      });
      at(S6 + MF_CARD_T + 4.6, hideCard);
      at(S6 + MF_END_T, () => finish());

      // [sound captions] (Visual cues option)
      const fxs = (t, text, dur) => at(S6 + t, () => fx(text, dur));
      fxs(2.4, '[a low, dampened hum]', 1.9);
      fxs(MF_PING_T, '[sonar ping]', 1.3);
      fxs(MF_PING_T + 1.4, '[the echo stops short]', 1.8);
      fxs(MF_MOVE_T + 0.6, '[slow, heavy thumps]', 2.2);
      fxs(10.2, '[heartbeat pounding]', 1.6);
      fxs(12.5, '[the thumps stop]', 1.3);
      fxs(MF_HIT_T - 0.05, '[a deep thud]', 1.2);
      fxs(MF_HIT_T + 1.3, '[device clatters]', 1.6);

      events.sort((a, b) => a.t - b.t);
    }

    /** Per-frame logic of the muffler scene. */
    function updateMufflerScene(dt) {
      if (time < MF_S) {
        ringTimer -= dt;
        if (ringTimer <= 0) {
          ringTimer = 2.4;
          rings.push({ t: 0 });
        }
        for (const r of rings) r.t += dt;
        rings = rings.filter((r) => r.t < 7);
        return;
      }
      const st = time - MF_S;
      flash = Math.max(0, flash - dt * 2.4);
      shake = Math.max(0, shake - dt * 30);

      // the explorer walks in, stands, drops into a crouch and creeps back (a crouch makes no footsteps)
      crouchAmt = smooth((st - MF_CROUCH_T) / 0.5);
      const bx = person.x;
      const by = person.y;
      const p = pathAt(MF_PATH, st);
      person.x = p.x;
      person.y = p.y;
      const moved = Math.hypot(person.x - bx, person.y - by);
      isWalking = personVisible && moved > 0.01;
      if (isWalking && crouchAmt < 0.5) {
        stepDist += moved;
        if (stepDist >= 30) {
          stepDist = 0;
          audio.footstep(0.35);
        }
      }
      angle = 0;

      // the muffler (invisible): waits, then walks towards them with slow, dull thumps - and the thumps stop when it is beside them
      const before = mfMon.x;
      mfMon.x = mufflerX(st);
      mfMon.stopped = st >= MF_ARRIVE_T - 0.55;
      if (mfMon.x < before - 0.001 && !mfMon.stopped && personVisible) {
        mfMon.thumpCd -= dt;
        if (mfMon.thumpCd <= 0) {
          const near = clamp((MF_X0 - mfMon.x) / (MF_X0 - MF_STOP_X), 0, 1);
          mfMon.thumpCd = 1.15 - 0.5 * near; // quicker as it closes in
          const h = heard(mfMon.x, PY, 800);
          audio.mufflerThump(h.pan, 0.5 + 0.5 * h.g);
        }
      }
      danger = personVisible ? clamp((st - MF_MOVE_T) / (MF_HIT_T - MF_MOVE_T), 0, 1) : 0;
      if (mvoice) {
        const h = heard(mfMon.x, PY, 900);
        audio.updateEnemyVoice(mvoice, { gain: h.g * (0.16 + 0.4 * danger), pan: h.pan, mood: 0.3 + 0.7 * danger, muffle: false });
      }

      // the lamp gutters as it comes, and is turned down while they are crouched
      const wobble = 0.86 + 0.14 * Math.sin(time * 19) + (Math.random() - 0.5) * 0.08;
      const dropout = danger > 0.5 && Math.sin(time * 9.3) * Math.sin(time * 4.1) > 0.85 ? 0.3 : 1;
      lampFlicker = lampOn ? wobble * dropout * (1 - 0.4 * crouchAmt) : 0;

      camX = lerp(camX, person.x + (st > MF_CARD_T - 1.2 ? 300 : 120), Math.min(1, dt * 2.5));
      camY = 150;
    }

    // ------------------------------------------- the singer scene: the timeline
    function buildSinger() {
      events = [];
      ev = 0;
      const at = (t, fn) => events.push({ t, fn });
      const S7 = SG_S;

      at(0.6, () => {
        showCard('Some things sing to find you.');
        audio.swell(52);
      });
      at(S7 - 1.0, hideCard);
      at(S7, () => {
        rings = [];
      });
      at(S7 + 0.8, () => {
        el.caption.textContent = 'Day 66';
        el.caption.classList.add('show');
      });
      at(S7 + 3.4, () => el.caption.classList.remove('show'));
      SG_LINES.forEach(([t, text]) => at(S7 + t, () => say(text)));
      [2.0, 6.4].forEach((t) => at(S7 + t, () => audio.breath(0.9)));

      // its hum, far off, then its song: a ripple of its own from where it stands (the game's real ripple system, in magenta)
      at(S7 + SG_SING_T - 2.0, () => {
        mvoice = audio.createEnemyVoice(215, 'singer');
      });
      at(S7 + SG_SING_T, () => {
        const h = heard(SG_X0, PY, 1100);
        audio.singerSing(h.pan, Math.max(h.g, 0.5));
        stage.cfg.rippleRadius = 460;
        env.castRipple(SG_X0, PY, 460, { singer: true });
      });
      // the wave reaches them: a sting, then a countdown of ticks that speed up (never softened in calm mode)
      at(S7 + SG_MARK_T, () => {
        sgHit = true;
        noticed = true;
        audio.markSting();
      });
      at(S7 + SG_MARK_T + 0.55, () => {
        noticed = false;
      });
      sgTicks().forEach(([tt, pr]) => at(S7 + SG_MARK_T + tt, () => audio.markTick(pr)));
      [[1.0, 0.45], [1.8, 0.65], [2.4, 0.85], [2.8, 0.95]].forEach(([t, g]) => at(S7 + SG_MARK_T + t, () => audio.heartbeat(g)));
      // it launches - a rising whoosh - and lands on the spot they WERE at
      at(S7 + SG_LEAP_T, () => {
        sgHit = false;
        sgMon.phase = 'leap';
        const h = heard(SG_X0, PY, 1200);
        audio.singerWhoosh(h.pan, Math.max(h.g, 0.5));
      });
      at(S7 + SG_LAND_T, () => {
        sgMon.phase = 'landed';
        const h = heard(SG_MARK_X, PY, 1000);
        audio.singerLand(h.pan, Math.max(h.g, 0.5));
        shake = isCalm() ? 0 : 6;
      });
      at(S7 + SG_CARD_T, () => {
        showCard('If its song finds you, keep moving.');
        audio.swell(50, 1.1);
      });
      at(S7 + SG_CARD_T + 4.2, hideCard);
      at(S7 + SG_END_T, () => finish());

      // [sound captions] (Visual cues option)
      const fxs = (t, text, dur) => at(S7 + t, () => fx(text, dur));
      fxs(SG_SING_T - 2.0, '[an eerie, wavering hum]', 1.9);
      fxs(SG_SING_T, '[a long, sung tone]', 1.6);
      fxs(SG_MARK_T, '[a sting - they are marked]', 1.5);
      fxs(SG_MARK_T + 0.9, '[ticking, faster and faster]', 2.0);
      fxs(SG_LEAP_T, '[a rising whoosh]', 1.0);
      fxs(SG_LAND_T, '[a heavy landing]', 1.4);
      fxs(SG_LAND_T + 2.3, '[footsteps, hurrying away]', 1.8);

      events.sort((a, b) => a.t - b.t);
    }

    /** Per-frame logic of the singer scene. */
    function updateSingerScene(dt) {
      if (time < SG_S) {
        ringTimer -= dt;
        if (ringTimer <= 0) {
          ringTimer = 2.4;
          rings.push({ t: 0 });
        }
        for (const r of rings) r.t += dt;
        rings = rings.filter((r) => r.t < 7);
        return;
      }
      const st = time - SG_S;
      flash = 0;
      shake = Math.max(0, shake - dt * 30);

      // the explorer walks, is marked (a beat's freeze), then runs - away from the spot the wave found them at
      const bx = person.x;
      const by = person.y;
      const p = pathAt(SG_PATH, st);
      person.x = p.x;
      person.y = p.y;
      const moved = Math.hypot(person.x - bx, person.y - by);
      isWalking = moved > 0.01;
      if (isWalking) {
        stepDist += moved;
        if (stepDist >= 30) {
          stepDist = 0;
          audio.footstep(st > SG_MARK_T ? 0.5 : 0.35);
        }
      }
      angle = lerp(angle, st > SG_MARK_T + 0.4 ? Math.PI : 0, Math.min(1, dt * 8)); // they turn and run

      // the singer: stays where it sings from; at zero it leaps over the corridor's walls (an arc) to the marked spot, and stays there
      if (sgMon.phase === 'leap') {
        const u = clamp((st - SG_LEAP_T) / SG_LEAP_S, 0, 1);
        sgMon.x = lerp(SG_X0, SG_MARK_X, u * u * (3 - 2 * u));
        sgMon.arc = 90 * Math.sin(Math.PI * u);
      } else if (sgMon.phase === 'landed') {
        sgMon.x = SG_MARK_X;
        sgMon.arc = 0;
      }
      danger = st < SG_MARK_T ? 0 : st < SG_LAND_T ? clamp((st - SG_MARK_T) / SG_COUNT, 0, 1) : clamp(1 - (st - SG_LAND_T) / 3, 0, 1);
      if (mvoice) {
        const h = heard(sgMon.x, PY, 1000);
        audio.updateEnemyVoice(mvoice, { gain: h.g * (0.14 + 0.34 * (0.4 + 0.6 * danger)), pan: h.pan, mood: 0.4 + 0.6 * danger, muffle: false });
      }

      const wobble = 0.86 + 0.14 * Math.sin(time * 19) + (Math.random() - 0.5) * 0.08;
      const dropout = danger > 0.6 && st < SG_LAND_T && Math.sin(time * 9.3) * Math.sin(time * 4.1) > 0.85 ? 0.3 : 1;
      lampFlicker = wobble * dropout;

      camX = lerp(camX, person.x + (st > SG_CARD_T - 1.2 ? 300 : 110), Math.min(1, dt * 2.5));
      camY = 150;
    }

    // ----------------------------------------------------------------- flow
    /** kind: 'intro' (before level 1), 'scent' (5 -> 6), 'mimic' (7 -> 8), 'decoy' (8 -> 9), 'stalker' (9 -> 10), 'muffler' (10 -> 11) or 'singer' (11 -> 12). */
    function start(k = 'intro') {
      kind = SCENE_START[k] !== undefined ? k : 'intro';
      sceneStart = SCENE_START[kind];
      pal = SCENE_PAL[kind];
      smell = 0;
      trail = null;
      scentMon = null;
      lunge = 0;
      mm = kind === 'mimic' ? { phase: 'glow', x: MM_X, stepDist: 0 } : null;
      mm2 = { echoX: -200, scentX: -200 };
      dcStep = { echo: 0, scent: 0 };
      crouchAmt = 0;
      stMon = { x: -200, heading: 0, stepDist: 0, clickCd: 0.8, listening: false, moving: false };
      mfMon = { x: MF_X0, stepDist: 0, thumpCd: 0.6, stopped: false };
      sgMon = { x: SG_X0, y: PY, phase: 'sing', arc: 0 };
      sgTickIdx = 0;
      sgHit = false;
      glowPulse = 0;
      isWalking = false;
      active = true;
      time = 0;
      stage = buildStage();
      person = stage.person;
      env.setStage(stage);
      sub = null;
      rings = [];
      ringTimer = 0;
      angle = 0;
      offX = 0;
      stepDist = 0;
      lastX = person.x;
      noticed = false;
      personVisible = true;
      lampOn = true;
      dark = false;
      flash = 0;
      shake = 0;
      monster = null;
      mvoice = null;
      danger = 0;
      camX = person.x;
      camY = 150;
      if (kind === 'scent') buildScent();
      else if (kind === 'mimic') buildMimic();
      else if (kind === 'decoy') buildDecoy();
      else if (kind === 'stalker') buildStalker();
      else if (kind === 'muffler') buildMuffler();
      else if (kind === 'singer') buildSinger();
      else build();
      el.root.classList.remove('hidden');
      el.card.classList.remove('show');
      el.caption.classList.remove('show');
      el.sub.classList.remove('show');
      fxUntil = 0;
      if (el.fx) el.fx.classList.remove('show');
      audio.startAmbient(SCENE_AMBIENT[kind]);
    }

    function cleanup() {
      active = false;
      stopMonsterVoice();
      audio.stopAmbient();
      audio._applyMaster(); // in case we are cut off mid-silence
      el.card.classList.remove('show');
      el.caption.classList.remove('show');
      el.sub.classList.remove('show');
      fxUntil = 0;
      if (el.fx) el.fx.classList.remove('show');
      el.root.classList.add('hidden');
    }

    function finish() {
      if (!active) return;
      cleanup();
      env.finish(kind);
    }

    function skip() {
      if (active && time > 0.6) finish();
    }

    // --------------------------------------------------------------- update
    function update(dt) {
      if (!active) return;
      time += dt;
      while (ev < events.length && events[ev].t <= time) events[ev++].fn();
      if (!active) return; // an event may have finished the cutscene
      if (fxUntil && time > fxUntil) {
        fxUntil = 0;
        if (el.fx) el.fx.classList.remove('show'); // the [sound caption] fades
      }

      env.updateRipples(dt);
      updateSub();

      if (kind === 'scent') {
        updateScentScene(dt);
        return;
      }
      if (kind === 'mimic') {
        updateMimicScene(dt);
        return;
      }
      if (kind === 'decoy') {
        updateDecoyScene(dt);
        return;
      }
      if (kind === 'stalker') {
        updateStalkerScene(dt);
        return;
      }
      if (kind === 'muffler') {
        updateMufflerScene(dt);
        return;
      }
      if (kind === 'singer') {
        updateSingerScene(dt);
        return;
      }

      if (time < S) {
        ringTimer -= dt;
        if (ringTimer <= 0) {
          ringTimer = 2.4;
          rings.push({ t: 0 });
        }
        for (const r of rings) r.t += dt;
        rings = rings.filter((r) => r.t < 7);
        return;
      }

      const st = sceneT();
      flash = Math.max(0, flash - dt * 2.4);
      shake = Math.max(0, shake - dt * 30);

      // the explorer: walks the scripted path, stops to talk, turns, flinches
      person.x = personX(st);
      person.y = PY;
      if (st > TURN_START) {
        const toStub = Math.atan2(STUB.y - PY, STUB.x - person.x);
        angle = toStub * smooth((st - TURN_START) / (TURN_END - TURN_START));
      }
      if (noticed) offX = lerp(offX, -12, Math.min(1, dt * 14));
      const moved = Math.abs(person.x - lastX);
      lastX = person.x;
      stepDist += moved;
      if (stepDist >= 30 && personVisible) {
        stepDist = 0;
        audio.footstep(0.35);
      }

      // the growl swells as the thing gets closer
      danger = clamp((st - LISTEN_AT) / (HIT_AT - LISTEN_AT), 0, 1);
      if (mvoice) {
        const h = heard(STUB.x, STUB.y, 760);
        const gain = h.g * (0.12 + 0.4 * danger);
        audio.updateEnemyVoice(mvoice, { gain, pan: h.pan, mood: 0.3 + 0.7 * danger, muffle: false });
      }

      // the headlamp gutters, more so as the thing nears
      const wobble = 0.82 + 0.18 * Math.sin(time * 21) + (Math.random() - 0.5) * 0.12;
      const dropout = danger > 0.2 && Math.sin(time * 9.3) * Math.sin(time * 4.1) > 0.82 ? 0.25 : 1;
      lampFlicker = lampOn ? wobble * dropout : 0;

      if (monster) monster.t = clamp((time - (S + LEAP_AT)) / (HIT_AT - LEAP_AT), 0, 1.6);

      // camera drifts after the explorer
      camX = lerp(camX, person.x + 90, Math.min(1, dt * 2.5));
      camY = 150;
    }

    // ----------------------------------------------------------------- draw
    function drawRings(cw, ch) {
      ctx.globalCompositeOperation = 'lighter';
      for (const r of rings) {
        const a = Math.max(0, 1 - r.t / 7) * 0.4;
        ctx.strokeStyle = `rgba(95,212,255,${a})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cw / 2, ch * 0.46, r.t * 0.11 * cw, 0, TAU);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    function drawPerson() {
      const lamp = lampFlicker;
      const walking = kind === 'mimic' || kind === 'decoy' || kind === 'stalker' || kind === 'muffler' || kind === 'singer' ? isWalking : Math.abs(xAt(sceneT() + 0.05) - xAt(sceneT())) > 0.001;
      const phase = time * 9;
      ctx.save();
      ctx.translate(person.x + offX, person.y + (walking ? Math.sin(phase) * 0.8 : 0));
      ctx.scale(1.3 - 0.34 * crouchAmt, 1.3 - 0.34 * crouchAmt); // a crouching explorer is smaller
      ctx.globalCompositeOperation = 'lighter';

      // a soft pool of light from the failing headlamp (warm in the intro, a cooler white in the scent scene)
      let g = ctx.createRadialGradient(0, 0, 0, 0, 0, 140);
      g.addColorStop(0, `rgba(${pal.glow},${0.2 * lamp})`);
      g.addColorStop(1, `rgba(${pal.glow},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 140, 0, TAU);
      ctx.fill();

      ctx.rotate(angle);
      g = ctx.createRadialGradient(0, 0, 4, 0, 0, 170);
      g.addColorStop(0, `rgba(${pal.cone},${0.17 * lamp})`);
      g.addColorStop(1, `rgba(${pal.cone},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 170, -0.42, 0.42);
      ctx.closePath();
      ctx.fill();

      // the figure, seen from above: pack, shoulders, swinging hands, head
      ctx.fillStyle = `rgba(${pal.body},0.3)`;
      ctx.fillRect(-13, -7, 8, 14);
      ctx.fillStyle = `rgba(${pal.body},0.5)`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 12, 0, 0, TAU);
      ctx.fill();
      const swing = walking ? Math.sin(phase) * 4 : 0;
      ctx.fillStyle = `rgba(${pal.hand},0.55)`;
      [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.arc(2 + swing * side, side * 11.5, 2.3, 0, TAU);
        ctx.fill();
      });
      ctx.fillStyle = `rgba(${pal.head},0.9)`;
      ctx.beginPath();
      ctx.arc(2, 0, 5.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(${pal.lamp},${0.95 * lamp})`;
      ctx.beginPath();
      ctx.arc(6.6, 0, 1.7, 0, TAU);
      ctx.fill();
      ctx.restore();

      if (noticed && personVisible) {
        ctx.save();
        ctx.font = 'bold 26px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,110,110,0.95)';
        ctx.fillText('!', person.x + offX, person.y - 30);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    /** The echo monster, drawn like everything else in the dark: as glowing line-art. */
    function drawMonster() {
      const t = monster.t;
      // out of the side passage, then a hard swoop down onto the explorer
      const p0 = STUB;
      const p1 = { x: STUB.x, y: 144 };
      const p2 = { x: person.x + offX + 6, y: PY - 6 };
      const u = clamp(t, 0, 1);
      const e = u * u * (3 - 2 * u) * 0.6 + u * u * 0.4; // accelerating
      const mx = (1 - e) * (1 - e) * p0.x + 2 * (1 - e) * e * p1.x + e * e * p2.x;
      const my = (1 - e) * (1 - e) * p0.y + 2 * (1 - e) * e * p1.y + e * e * p2.y;
      const ahead = Math.min(1, e + 0.05);
      const hx = (1 - ahead) * (1 - ahead) * p0.x + 2 * (1 - ahead) * ahead * p1.x + ahead * ahead * p2.x;
      const hy = (1 - ahead) * (1 - ahead) * p0.y + 2 * (1 - ahead) * ahead * p1.y + ahead * ahead * p2.y;
      const heading = Math.atan2(hy - my, hx - mx);
      const soft = isCalm();
      const scale = lerp(0.9, soft ? 1.15 : 1.7, smooth(u));
      const alpha = (t > 1 ? Math.max(0, 1 - (t - 1) * 2.5) : 1) * (soft ? 0.45 : 1);
      if (alpha <= 0) return;
      drawEchoBody(mx, my, heading, scale, alpha);
    }

    // The monsters are drawn with the very same art as in the game (js/art.js). The game draws them at their true
    // collision size (14 px); a cutscene shows them bigger, so these are the sizes it passes.
    const ECHO_R = 34;
    const SCENT_R = 30;
    const STALKER_R = 44;
    const SINGER_R = 40; // the singer, shown bigger than the game's 14 px
    const MIMIC_R = ECHO_R * 0.9; // the mimic's "exit" in the scene: the size of the monster it turns into as it starts to

    /** An echo monster's body at (mx,my), facing `heading`: the spiky, eyeless, ribbed monster of the game, in red line-art. */
    function drawEchoBody(mx, my, heading, scale, alpha) {
      ctx.globalCompositeOperation = 'lighter';
      EchoArt.draw(ctx, 'echo', mx, my, ECHO_R * scale, { a: alpha, t: time, h: heading });
      ctx.globalCompositeOperation = 'source-over';
    }

    /** The scent monster: violet line-art with a long, sniffing snout and six wet legs. */
    function drawScentMonster() {
      const m = scentMon;
      const soft = isCalm();
      // a faint violet glow out in the dark, clearer as it comes into the explorer's light
      const near = clamp((300 - Math.abs(m.x - person.x)) / 140, 0.3, 1);
      const alpha = near * (soft ? 0.55 : 1);
      const scale = 1 + (soft ? 0.15 : 0.45) * lunge;
      drawScentBody(m.x + 26 * lunge, PY, scale, alpha, m.state === 'follow');
    }

    /** A scent monster's body at (x,y): the soft violet blob of the game, wobbling, with its drips behind it (it walks right). `follow` = it has a trail (it wobbles faster). */
    function drawScentBody(x, y, scale, alpha, follow) {
      ctx.globalCompositeOperation = 'lighter';
      EchoArt.draw(ctx, 'scent', x, y, SCENT_R * scale, { a: alpha, t: time * (follow ? 1.7 : 1), h: 0 });
      ctx.globalCompositeOperation = 'source-over';
    }

    /** Everything in the scent scene: the puddle, the trail, the explorer and what is following them. */
    function drawScentWorld() {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // the puddle, lit by the explorer's lamp as they approach
      const lit = clamp(1 - Math.abs(person.x - SC_PUDDLE_X) / 240, 0, 1);
      const pg = ctx.createRadialGradient(SC_PUDDLE_X, PY, 0, SC_PUDDLE_X, PY, 30);
      pg.addColorStop(0, `rgba(${LIME},${0.22 + 0.4 * lit})`);
      pg.addColorStop(1, `rgba(${LIME},0)`);
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(SC_PUDDLE_X, PY, 30, 0, TAU);
      ctx.fill();
      EchoArt.draw(ctx, 'puddle', SC_PUDDLE_X, PY, 22, { a: 0.3 + 0.6 * lit, t: time, seed: EchoArt.seedOf(SC_PUDDLE_X, PY) });

      // the trail they leave: brighter while it is being laid and while something is walking it
      if (trail && trail.pts.length > 1) {
        const busy = trail.active || (scentMon && scentMon.state === 'follow');
        const pulse = busy ? 0.75 + 0.25 * Math.sin(time * 7) : 1;
        ctx.beginPath();
        ctx.moveTo(trail.pts[0].x, trail.pts[0].y);
        for (let i = 1; i < trail.pts.length; i++) ctx.lineTo(trail.pts[i].x, trail.pts[i].y);
        ctx.strokeStyle = `rgba(${LIME},${(busy ? 0.22 : 0.12) * pulse})`;
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.strokeStyle = `rgba(${LIME},${(busy ? 0.6 : 0.34) * pulse})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';

      if (personVisible) {
        drawPerson();
        if (smell > 0) {
          // smelly: a lime halo and a ring that drains as they walk - the same as in the game
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(person.x, PY, 0, person.x, PY, 40);
          g.addColorStop(0, `rgba(${LIME},0.24)`);
          g.addColorStop(1, `rgba(${LIME},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(person.x, PY, 40, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = `rgba(${LIME},0.8)`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(person.x, PY, 22, -Math.PI / 2, -Math.PI / 2 + TAU * (smell / SC_SMELL));
          ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      if (scentMon) drawScentMonster();
    }

    /** The mimic: at first just the exit's green glow (which brightens with each chime), then, when the wave touches it, an echo monster. */
    function drawMimicThing() {
      if (!mm) return;
      const st = sceneT();
      ctx.globalCompositeOperation = 'lighter';
      if (mm.phase === 'glow') {
        if (st < MM_CHIME_T - 0.4) return; // nothing to see until it starts to chime
        const appear = smooth((st - (MM_CHIME_T - 0.4)) / 1.2);
        const near = clamp(1 - (MM_X - person.x) / 520, 0.15, 1);
        const pulse = 0.7 + 0.3 * Math.sin(time * 2.6) + 0.5 * glowPulse;
        const g = ctx.createRadialGradient(MM_X, PY, 0, MM_X, PY, 70);
        g.addColorStop(0, `rgba(${EXITGREEN},${appear * (0.16 + 0.34 * near) * pulse})`);
        g.addColorStop(1, `rgba(${EXITGREEN},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(MM_X, PY, 70, 0, TAU);
        ctx.fill();
        // the exit's portal (the game's new exit art), which brightens with each chime. It is what the explorer sees
        // - and here the mimic may look a little different from the real exit; in the game that depends on the mode.
        EchoArt.draw(ctx, 'exit', MM_X, PY, MIMIC_R, { a: clamp(appear * (0.5 + 0.4 * near) * pulse, 0, 1), t: time });
      } else {
        const t = st - MM_TOUCH_T;
        const soft = isCalm();
        if (t < 0.7) {
          // the disguise breaks: a red flare rolls out from where the exit was
          ctx.strokeStyle = `rgba(255,59,92,${(1 - t / 0.7) * (soft ? 0.3 : 0.7)})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(MM_X, PY, 10 + t * 420, 0, TAU);
          ctx.stroke();
        }
        const scale = lerp(0.9, soft ? 1.1 : 1.45, smooth(t / 0.8));
        if (t < EchoArt.MORPH_SECONDS) EchoArt.mimicMorph(ctx, mm.x, PY, ECHO_R * scale, t / EchoArt.MORPH_SECONDS, { a: soft ? 0.5 : 1, t: time, h: Math.PI }); // the portal melts into the monster in 0.3 s
        else drawEchoBody(mm.x, PY, Math.PI, scale, soft ? 0.5 : 1);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    /** Faint wall edges near a light (the explorer's lamp, the decoy's glow), so the passages can be made out. */
    function drawLitWalls(cx, cy, radius, alpha) {
      const { W, H, walls } = stage;
      const x0 = Math.max(0, Math.floor((cx - radius) / TILE));
      const x1 = Math.min(W - 1, Math.floor((cx + radius) / TILE));
      const y0 = Math.max(0, Math.floor((cy - radius) / TILE));
      const y1 = Math.min(H - 1, Math.floor((cy + radius) / TILE));
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'butt'; // flat ends, so the little pieces run together instead of showing as dots
      ctx.lineWidth = 2;
      const edge = (ax, ay, bx, by) => {
        for (let k = 0; k < 4; k++) {
          const sx = ax + ((bx - ax) * k) / 4;
          const sy = ay + ((by - ay) * k) / 4;
          const ex = ax + ((bx - ax) * (k + 1)) / 4;
          const ey = ay + ((by - ay) * (k + 1)) / 4;
          const a = alpha * (1 - Math.hypot((sx + ex) / 2 - cx, (sy + ey) / 2 - cy) / radius);
          if (a <= 0.01) continue;
          ctx.strokeStyle = `rgba(95,212,255,${a})`;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
      };
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (walls[ty * W + tx]) continue; // an open tile: draw the sides of it that face a wall
          const px = tx * TILE;
          const py = ty * TILE;
          if (tx === 0 || walls[ty * W + tx - 1]) edge(px, py, px, py + TILE);
          if (tx === W - 1 || walls[ty * W + tx + 1]) edge(px + TILE, py, px + TILE, py + TILE);
          if (ty === 0 || walls[(ty - 1) * W + tx]) edge(px, py, px + TILE, py);
          if (ty === H - 1 || walls[(ty + 1) * W + tx]) edge(px, py + TILE, px + TILE, py + TILE);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    /** Everything in the decoy scene: the decoy (on the floor, then dropped), its call, the two monsters and the explorer. */
    function drawDecoyWorld() {
      const st = sceneT();
      const soft = isCalm();
      drawLitWalls(person.x, person.y, 170, 0.45);
      if (st >= DC_DROP_T) drawLitWalls(DC_X, DC_Y, 120, 0.25);

      ctx.globalCompositeOperation = 'lighter';
      const pinkGlow = (x, y, strength) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, 42);
        g.addColorStop(0, `rgba(${PINK},${0.55 * strength})`);
        g.addColorStop(1, `rgba(${PINK},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 42, 0, TAU);
        ctx.fill();
        EchoArt.draw(ctx, 'decoy', x, y, 20, { a: clamp(strength, 0, 1), t: time }); // the game's sonar decoy
      };
      // lying on the floor, glimmering, until they take it
      if (st < DC_PICK_T) pinkGlow(DC_FLOOR_X, DC_Y, clamp(1 - Math.abs(DC_FLOOR_X - person.x) / 260, 0.15, 1) * (0.7 + 0.3 * Math.sin(time * 4)));
      // dropped: it pulses with its beeps, faster as it nears the call - then the call sweeps out
      if (st >= DC_DROP_T) {
        const since = st - DC_DROP_T;
        const arming = st < DC_CALL_T;
        pinkGlow(DC_X, DC_Y, arming ? 0.7 + 0.3 * Math.sin(since * (6 + 10 * clamp(since / 5, 0, 1))) : 1);
        const r = (st - DC_CALL_T) / 0.9;
        if (!arming && r < 1) {
          ctx.strokeStyle = `rgba(${PINK},${(1 - r) * 0.5})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(DC_X, DC_Y, 480 * r, 0, TAU);
          ctx.stroke();
        }
      }

      // held at the decoy: pink tethers that shiver, and monsters that cannot quite keep still
      const heldE = st >= DC_ECHO_TRAP_T;
      const heldS = st >= DC_SCENT_TRAP_T;
      const jit = () => (Math.random() - 0.5) * 2.4;
      ctx.lineWidth = 1.5;
      [[heldE, mm2.echoX, DC_ECHO.y], [heldS, mm2.scentX, DC_SCENT.y]].forEach(([held, mx, my]) => {
        if (!held) return;
        ctx.strokeStyle = `rgba(${PINK},${0.22 + 0.16 * Math.sin(time * 11)})`;
        ctx.beginPath();
        ctx.moveTo(DC_X, DC_Y);
        ctx.lineTo(mx + jit(), my + jit());
        ctx.stroke();
      });
      ctx.globalCompositeOperation = 'source-over';

      if (mm2.echoX > 0) drawEchoBody(mm2.echoX + (heldE ? jit() : 0), DC_ECHO.y + (heldE ? jit() : 0), 0, 1, soft ? 0.55 : 0.95);
      if (mm2.scentX > 0) drawScentBody(mm2.scentX + (heldS ? jit() : 0), DC_SCENT.y + (heldS ? jit() : 0), 1, soft ? 0.6 : 1, !heldS);
      if (personVisible) drawPerson();
    }

    /**
     * A stalker's body at (x,y), facing `heading`: orange line-art, long and lean - a narrow body, a small blind
     * head with two long feelers that flick, and tall thin legs. `walking` sets the legs going; `listening` makes
     * the feelers sweep wide, the way it does when it stands still and strains to hear.
     */
    function drawStalkerBody(x, y, heading, alpha, walking, listening) {
      ctx.globalCompositeOperation = 'lighter';
      EchoArt.draw(ctx, 'stalker', x, y, STALKER_R, { a: alpha, t: time * 1.6, h: heading, walking: !!walking, listening: !!listening });
      ctx.globalCompositeOperation = 'source-over';
    }

    /** Everything in the stalker scene: the lit walls, the stalker (fading into the dark as it gets farther from the lamp) and the explorer. */
    function drawStalkerWorld() {
      const st = sceneT();
      drawLitWalls(person.x, person.y, 170, 0.45);
      if (stMon.x > 0) {
        const soft = isCalm();
        const near = clamp((300 - Math.abs(stMon.x - person.x)) / 150, 0.22, 1);
        // the moment it hears them: a ring rolls out from it
        const since = st - (ST_MON_T0 + 0.1);
        if (since > 0 && since < 0.9) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(${ORANGE},${(1 - since / 0.9) * (soft ? 0.25 : 0.55)})`;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(stMon.x, ST_MON_Y, 14 + since * 170, 0, TAU);
          ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        }
        drawStalkerBody(stMon.x, ST_MON_Y, stMon.heading, near * (soft ? 0.6 : 1), stMon.moving, stMon.listening);
      }
      if (personVisible) drawPerson();
    }

    /** Everything in the muffler scene: the lit walls, the wave that ends in nothing, the explorer. The muffler itself is NEVER drawn. */
    function drawMufflerWorld() {
      if (!dark) drawLitWalls(person.x, person.y, 170, 0.45);
      env.drawRippleLayer(); // the explorer's ping: the wave that hits the muffler just stops, leaving a hole in the picture
      if (personVisible) drawPerson();
    }

    /** Everything in the singer scene: the lit walls, its magenta song, the singer in the air during its leap, the marked ring, the explorer. */
    function drawSingerWorld() {
      const st = sceneT();
      const soft = isCalm();
      drawLitWalls(person.x, person.y, 170, 0.45);
      env.drawRippleLayer(); // its song is a real ripple (magenta) that lights the corridor
      // the singer is not lit by its own song: a faint glow while it sings, then seen in the air as it leaps, and where it lands
      let a = 0;
      if (sgMon.phase === 'sing') a = st > SG_SING_T - 0.1 && st < SG_SING_T + 1.3 ? 0.3 * (1 - (st - SG_SING_T) / 1.4) : 0;
      else if (sgMon.phase === 'leap') a = 0.95;
      else a = clamp((300 - Math.abs(sgMon.x - person.x)) / 160, 0.15, 1) * clamp(1 - (st - (SG_LAND_T + 2.6)) / 2.4, 0, 1);
      if (a > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        if (sgMon.phase === 'leap') {
          // a streak of afterimages behind it
          for (let k = 3; k >= 1; k--) {
            const u = clamp((st - SG_LEAP_T) / SG_LEAP_S - k * 0.07, 0, 1);
            EchoArt.draw(ctx, 'singer', lerp(SG_X0, SG_MARK_X, u * u * (3 - 2 * u)), sgMon.y - 90 * Math.sin(Math.PI * u), SINGER_R, { a: (0.32 / k) * (soft ? 0.6 : 1), t: time, h: Math.PI });
          }
        }
        EchoArt.draw(ctx, 'singer', sgMon.x, sgMon.y - sgMon.arc, SINGER_R, { a: a * (soft ? 0.6 : 1), t: time, h: Math.PI });
        ctx.globalCompositeOperation = 'source-over';
      }
      // marked: the countdown as a magenta ring that shrinks around the explorer (only with the Visual cues option, as in the game)
      if (sgHit && env.visualCues && env.visualCues()) {
        const frac = clamp(1 - (st - SG_MARK_T) / SG_COUNT, 0, 1);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(${MAGENTA},0.85)`;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(person.x, person.y, 14 + 34 * frac, 0, TAU);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
      if (personVisible) drawPerson();
    }

    function draw() {
      if (!active) return;
      const { DPR, viewScale } = env.size();
      const cw = canvas.width;
      const ch = canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#010206';
      ctx.fillRect(0, 0, cw, ch);

      if (time < sceneStart) {
        drawRings(cw, ch);
        return;
      }

      const st = sceneT();
      const s = viewScale * DPR * 1.55; // a closer, more cinematic camera than the game's
      const sx = (Math.random() - 0.5) * shake * DPR;
      const sy = (Math.random() - 0.5) * shake * DPR;
      ctx.setTransform(s, 0, 0, s, cw / 2 - camX * s + sx, ch / 2 - camY * s + sy);
      if (kind === 'scent') {
        drawScentWorld();
      } else if (kind === 'mimic') {
        env.drawRippleLayer(); // the explorer's real ping lights the corridor
        drawMimicThing();
        if (personVisible) drawPerson();
      } else if (kind === 'decoy') {
        drawDecoyWorld();
      } else if (kind === 'stalker') {
        drawStalkerWorld();
      } else if (kind === 'muffler') {
        drawMufflerWorld();
      } else if (kind === 'singer') {
        drawSingerWorld();
      } else {
        env.drawRippleLayer();
        if (personVisible) drawPerson();
        if (monster) drawMonster();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // heavy vignette: the world is only what little light there is
      let g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.2, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.55);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);

      // the impact flash
      if (flash > 0.01) {
        ctx.fillStyle = `rgba(255,${Math.round(90 + 130 * flash)},${Math.round(100 + 120 * flash)},${Math.min(1, flash) * 0.9})`;
        ctx.fillRect(0, 0, cw, ch);
      }

      // fade in from black, then cinema bars
      const fade = 1 - smooth(st / 1.6);
      if (fade > 0.005) {
        ctx.fillStyle = `rgba(1,2,6,${fade})`;
        ctx.fillRect(0, 0, cw, ch);
      }
      const bar = ch * 0.085 * smooth(st / 1.2);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cw, bar);
      ctx.fillRect(0, ch - bar, cw, bar);
    }

    el.skip.addEventListener('click', () => {
      skip();
      el.skip.blur();
    });

    return {
      start,
      update,
      draw,
      skip,
      get time() {
        return time;
      },
      get active() {
        return active;
      },
      get kind() {
        return kind;
      },
      // for tests: the current screen flash / shake amounts
      get fx() {
        return { flash, shake };
      },
    };
  }

  return { create };
})();
