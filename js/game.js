'use strict';

(() => {
  // ------------------------------------------------------------- constants
  const TAU = Math.PI * 2;
  const PLAYER_R = 9;
  const ENEMY_R = 14;
  const WALK_SPEED = 170;
  const RIPPLE_SPEED = 520; // px/s - both the wave and its echo travel at this speed
  const RAYS = 640;
  const CATCH_DIST = ENEMY_R + PLAYER_R; // circles touching = you die
  // A NEAR MISS (v11.6): a monster got inside this and then backed out again without touching you. It is a
  // MOMENT, not a mechanic - nothing about hit detection, speed, hearing or AI knows this number exists.
  const NEAR_MISS_DIST = CATCH_DIST * 1.5;
  const NEAR_MISS_GAP = 2; // seconds before the same monster can give you another one
  const NEAR_MISS_SECONDS = 0.42; // how long the beat lasts
  // Levels 1-16. Level 13 is the capture (js/warden.js); 14-16 follow it (js/story.js): the gaol, the false exit
  // and the upgraded Warden. Clearing 16 is the end of the game so far.
  const CAMPAIGN_LEVELS = STORY_LAST;
  // Medals are for levels 1-12 only. 13-16 are hand-drawn, always the same, and have no "Level cleared" screen
  // to show medals on (each hands straight on to the next) - and a medal for a maze that never changes is a
  // medal for having learned it by heart. They still count for progress, for "levels cleared" and for the
  // level select; they are just not raced. (WARDEN_LEVEL and STORY_FIRST/LAST live in js/level.js.)
  const MEDAL_LEVELS = 12;
  // LEVEL 0 is the tutorial (js/tutorial.js). It is not part of the campaign: it counts for no progress, no
  // Continue, no medals, no stats and no "levels cleared". Everywhere that would score something asks `scored()`.
  const TUTORIAL_LEVEL = 0;
  // A CUSTOM LEVEL (v15.0: made in the level editor, js/editor.js) has no number. While one is being played,
  // levelNum is this - below the tutorial's 0, so `scored()` is false and it writes nothing at all: no progress,
  // no medals, no stats, no fragments, no "levels cleared". Test-playing in the editor is exactly this.
  const CUSTOM_LEVEL = -1;
  const ENDLESS_LEVEL = -2; // (v20.0) Endless mode: a depth of a run is played as this "level" - below 0, so scored() is false and nothing of the campaign is written
  // Story cutscenes: the one that plays on the way INTO a level (after clearing the one before), and the level each leads to.
  // (v16.0: 'keeper' plays between level 13's capture and level 14 - see onCaptured. Level 13 never leaves through
  // advanceLevel, so its entry here is for the Continue / level-select catch-up in newRun, the rule every scene follows.)
  const SCENE_BEFORE_LEVEL = { 6: 'scent', 8: 'mimic', 9: 'decoy', 10: 'stalker', 11: 'muffler', 12: 'singer', 14: 'keeper', 22: 'alarm' };
  const SCENE_LEADS_TO = { intro: 1, scent: 6, mimic: 8, decoy: 9, stalker: 10, muffler: 11, singer: 12, keeper: 14, alarm: 22 };
  // (v16.0) the scenes that cannot be skipped until they have been seen once - and that count as seen only when
  // they have played to the END (every other scene counts the moment it starts, as it always has)
  const SEEN_AT_END = { keeper: true, listens: true }; // (v19.3: and Dusk's scene, "Nothing Listens")
  const SAVE_KEY = 'echomaze.best'; // legacy: one best level, from before difficulty modes
  const PROGRESS_KEY = 'echomaze.progress'; // { easy: 3, normal: 5, ... } highest level unlocked per mode
  const MODE_KEY = 'echomaze.mode';
  const CALM_KEY = 'echomaze.calm';
  const SEEN_KEY = 'echomaze.seen'; // { intro: 1, scent: 1 } cutscenes that have played, so they can be replayed
  const VISUALCUES_KEY = 'echomaze.visualcues'; // '1' = the Visual cues accessibility option is on
  const LIGHTUI_KEY = 'echomaze.lightui'; // (v19.1) '1' = the daylight interface (a light look for the menus), once First Breath is reached
  const TOUCH_KEY = 'echomaze.touch'; // '1' = touch controls forced on, '0' = forced off, unset = automatic (touch devices)
  const TUTORIAL_KEY = 'echomaze.tutorial'; // '1' = the tutorial has been finished or skipped (a save without it is simply "not yet")
  const ENDLESS_KEY = 'echomaze.endless'; // (v20.0) Endless mode's own save: { best: { easy: 7, ... }, last: { mode, depth, line, at } }
  const EDITOR_KEY = 'echomaze.editor'; // '1' = the level editor's spoiler warning was read and accepted (v15.0); the levels themselves are js/levelstore.js's
  // Doppler (audio only): a monster's voice is shifted by how fast it is closing on you or moving away, at most about +/-6%
  const DOPPLER_MAX = 0.06; // fractional pitch shift at the largest closing speed
  const DOPPLER_FULL_SPEED = 180; // px/s of change in distance that gives the full shift (exaggerated so it is audible)
  const DOPPLER_SMOOTH = 0.12; // seconds: the closing speed is smoothed so the pitch glides

  const T_WALL = 1;
  const T_OBSTACLE = 2;
  const T_ENEMY = 3; // echo monster
  const T_EXIT = 4;
  const T_SCENT = 5; // scent monster (violet)
  const T_PUDDLE = 6; // smell puddle (lime) - never blocks a ripple, just shows up in it
  const T_DECOY = 7; // sonar decoy (pink) - lies flat like a puddle, shows up in a ripple but never blocks it
  const T_STALKER = 8; // stalker (orange) - a ripple can show it, but it learns nothing from it
  const T_SINGER = 9; // singer (magenta) - a ripple can show it, but it is deaf to yours. (The muffler has NO type: it absorbs the ray, so nothing is ever lit.)
  const T_WARDEN = 10; // the warden (level 13 only) - and ONLY once a ripple has revealed it. Until then its rays come back as T_WALL.
  const T_LORE = 11; // a lore fragment (js/lore.js) - lies flat like a puddle or a decoy: the wave lights it and passes over
  const T_KEY = 12; // level 14's key (js/story.js) - flat on the floor too, and found exactly the same way
  const T_ALARM = 13; // (v15.7, unreleased: custom levels only) an Alarm - a ripple shows it, and the wave reaching it sets it off
  const T_SCREECHO = 14; // (v15.7, unreleased) a Screecho - an echo monster that screams when the wave reaches it
  // The ripple's hit colours, by type. They are filled in from js/palette.js and refilled whenever the player
  // picks another palette (Settings -> Display); the array itself is never replaced, so everything that reads
  // COLORS[T_...] keeps working, and a palette can never reach anything but the drawing.
  const COLORS = [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null];
  const COLOR_ROLE = [null, 'wall', 'obstacle', 'echo', 'exit', 'scent', 'puddle', 'decoy', 'stalker', 'singer', 'warden', 'lore', 'key', 'alarm', 'screecho'];
  // which palette colour each swatch on the title legend belongs to (drawing only: it tints the chip around it)
  const LEGEND_ROLE = { wall: 'wall', boulder: 'obstacle', pillar: 'obstacle', echo: 'echo', scent: 'scent', stalker: 'stalker', singer: 'singer', alarm: 'alarm', puddle: 'puddle', decoy: 'decoy', exit: 'exit', note: 'lore' };
  const singerRgb = () => COLORS[T_SINGER]; // the tint of a singer's own ripples (magenta in the default palette)
  EchoPalette.onChange((rgb) => {
    for (let i = 1; i < COLOR_ROLE.length; i++) COLORS[i] = rgb[COLOR_ROLE[i]];
  });
  // core stroke width per type; the rays that find a round thing (obstacle, monster, exit) are a little thinner than they were,
  // because the thing itself is now drawn on top of them (EchoArt) - they still trace its true collision circle
  const LINE_W = [0, 2.4, 2.1, 2.5, 2.3, 2.5, 3, 3, 2.5, 2.5, 3.2, 3, 3, 2.4, 2.5];
  const NRAYTYPES = 15; // ray hit types are 1..5 (wall, obstacle, echo monster, exit, scent monster), 8 (stalker), 9 (singer), 10 (a warden - level 13's once revealed, and the one hunting you on 15-16), and (v15.7) 13 / 14 (an Alarm, a Screecho); 0 = nothing (also where the muffler ate the ray). 6, 7, 11 and 12 are flat marks (puddle, decoy, lore fragment, key), never rays - their buckets stay empty
  const ALPHA_LEVELS = 10;
  const SMELL_TRAIL_STEP = 12; // px between recorded trail points
  const TRAIL_TOUCH = 22; // px: how close a scent monster must be to a trail to "touch" it
  const TRAIL_STEP_ON = 14; // px: how close the player must be to a finished trail to step on it (and smell again)
  const TRAIL_TIP_GRACE = 40; // px: the last stretch of the trail you have just finished laying, which does not count until you step off it

  const COS = new Float32Array(RAYS);
  const SIN = new Float32Array(RAYS);
  for (let i = 0; i < RAYS; i++) {
    COS[i] = Math.cos((i / RAYS) * TAU);
    SIN[i] = Math.sin((i / RAYS) * TAU);
  }

  const HINTS = {
    1: '{ripple} sends a ripple. Blue is wall, amber is an obstacle. Follow the green chime.',
    2: 'You are not alone. Red means something alive. Its growl is your only warning.',
    3: 'A monster is blind to you until your ripple touches it. Then it comes for where you were.',
    4: 'Two echo monsters now. Move after every ripple - a monster you hit will hunt the spot you rippled from.',
    5: 'A monster listens for a few seconds after it arrives. If it hears you it follows while you stay close - get away to lose it.',
    6: 'No echo monsters here. A new monster follows SMELL, not sound. Lime puddles make you smelly while you walk, and you leave a trail it will follow for about a minute.',
    7: 'Your own trail can smell you again: step back onto it while it lasts and you are smelly, like a puddle. Give it about ten seconds between touches.',
    8: 'Not every green glow is the way out: something here copies the exit, and turns on you the moment your ripple touches it.',
    9: 'More things follow your smell now, so mind the puddles and your trail. A pink sonar decoy lies somewhere: walk onto it, press {item} to drop it, and five seconds later it calls EVERY monster nearby - and shows up anything pretending to be the exit - and traps them there.',
    10: 'The stalker ignores ripples and decoys. It only listens: your footsteps, and even you standing close. Hold {crouch} to crouch - you make no sound, but you cannot send a ripple.',
    11: 'If your ripple leaves a hole in the echo, something is standing in it. You cannot see it or smell it - only hear it. It listens harder than the stalker, and crouching helps a lot, but it is not a guarantee.',
    12: 'Something sings. Its song lights the maze, and if a wave of it reaches you, you are marked: a countdown ticks, then it leaps to where the song found you. Keep moving.',
    13: 'Nothing down here can kill you. That is not the same as nothing being here.',
    14: 'Somewhere in here is the key. The door at the end will not open without it.',
    15: 'Keep going. Somewhere ahead, the dark gives way.',
    16: 'Somewhere below, water drips towards the way out. Follow it, and whatever happens, keep moving.',
    // (v17.0) Act 2: one short line each - the level does the rest
    17: 'Trust your ears.',
    18: 'Listen for the grinding.',
    19: 'Remember the drip.',
    20: 'It answers late.',
    // (v18.0) Act 2 part 2
    21: 'Every step is one way.',
    22: 'Where nothing answers, nothing hears.',
    23: 'It is coming in from the edges.',
    24: 'Not every way out is out.',
    25: "Don't stop.", // (v18.2)
  };
  const GENERIC_HINTS = [
    'Ripple, listen, move. Never stay where you rippled.',
    'Echoes arrive later the farther away something is.',
    'Sleepers do nothing until a ripple hits them. Keep your waves away.',
    'A monster only goes where you were. Once you move on, it has no idea where you went.',
    'Listen for growls and clicking steps. That is how you find monsters without waking them.',
    'A monster that has locked onto you loses you the moment you get far enough away. Run.',
    'Smell only wears off while you WALK. Standing still keeps you smelly, so keep moving away.',
    'A scent monster ignores ripples and footsteps. Only smell - and its trails - lead it to you.',
    'Hold {crouch} to crouch: no footsteps, no ripples - and crouching wipes whatever your ripples had shown you.',
  ];

  // ------------------------------------------------------------------- DOM
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const overlays = ['title', 'howto', 'replay', 'archive', 'settings', 'pause', 'tutorial', 'caught', 'endless-over', 'complete', 'ending', 'editor-gate', 'editor-unreleased', 'editor-touch', 'mylevels', 'editor'];
  // states: title | cutscene | play | paused | caught | complete | tutdone (the end of level 0) |
  //         capture (level 13: the warden has you and the controls are gone) | ending (the placeholder screen after
  //         level 16) | editor (v15.0: the level editor's screens - its warning, My Levels, the editor itself; no
  //         level is running). (Levels 14-16's scripted beats are NOT a state of their own: they run inside 'play' and
  //         take the controls with `scriptLock`, so pausing, ripples and the clock all carry on as normal. Nor is
  //         playing a custom level: that is 'play' with `customRun` set.)

  const audio = new SoundEngine();
  // the player's saved volumes, ready for when the AudioContext is created on the first click
  {
    const v = EchoProfile.volumes();
    audio.volume = v.master;
    audio.fxVolume = v.effects;
    audio.ambVolume = v.ambience;
  }
  // The soundtrack (js/music.js). Audio only, on the ambience bus, and it swells on nothing but `danger`.
  const music = EchoMusic.create(audio);
  // Visual sound cues (accessibility, js/cues.js): drawn only, never read back - they cannot affect the game
  const cues = EchoCues.create({ ctx, enabled: () => visualCues, calm: () => calm });
  // The title wordmark (js/wordmark.js): title-screen dressing, drawn on its own little canvas. It runs only
  // while the title is actually on show, and nothing reads anything back from it.
  const wordmark = EchoWordmark.create({
    calm: () => calm,
    sound: () => audio.titleReveal(),
  });
  // The tutorial's teaching prompts (js/tutorial.js). It only ever writes a line of text on the screen.
  const tutorial = EchoTutorial.create({
    setHint(text) {
      tutHint = text;
      $('tut-hint').textContent = text || '';
    },
    touch: () => touchOn,
  });

  /**
   * LEVEL 13 (js/warden.js): the dread on the way to the great room, the room's own light, and the capture.
   * It reads where the player is and writes to the screen and the speakers - and it takes the controls at
   * exactly one moment, the reveal, which is the whole point of the level.
   */
  const warden = EchoWarden.create({
    player: () => player,
    audio,
    cues,
    calm: () => calm,
    los: (x0, y0, x1, y1) => hasLOS(x0, y0, x1, y1),
    rippleSpeed: RIPPLE_SPEED,
    litBy: (rp) => litByWarden(rp),
    gasp: () => wardenGasp(),
    freeze: () => {
      if (state === 'play') {
        state = 'capture'; // the one moment in the game where the controls are taken away
        touch.releaseAll();
        touch.setVisible(false);
      }
    },
    enteredRoom: () => onWardenCleared(),
    taken: () => onCaptured(),
  });

  /**
   * LORE FRAGMENTS (js/lore.js): the line on screen, and the voice, when your wave finds one. It is shown and
   * timed on the game's own clock (updatePlay), so it pauses with the game. It writes to the screen, the
   * speakers and the `echomaze.lore` save - and to nothing the game ever reads back.
   */
  const loreReader = EchoLore.createReader({ el: { box: $('lore'), head: $('lore-head'), line: $('lore-line') }, audio, cues });

  /**
   * LEVELS 14-16 (js/story.js): the gaol, the false exit and the upgraded Warden. Like level 13 it reads where
   * the player is and writes to the screen and the speakers - and these are all the things it may DO. Taking
   * the controls (`lock`) leaves the game running underneath: ripples travel, water drips, the clock ticks and
   * pausing still works. Every one of them is reached only on a story level.
   */
  const story = EchoStory.create({
    talk: () => onTalk(), // (v19.3) Dusk: the Warden has been talked to
    player: () => player,
    level: () => level,
    audio,
    cues,
    calm: () => calm,
    playerR: PLAYER_R,
    rippleSpeed: RIPPLE_SPEED,
    el: { box: $('say'), head: $('say-head'), line: $('say-line') },
    los: (x0, y0, x1, y1) => hasLOS(x0, y0, x1, y1),
    raycast: (x, y, dx, dy, max) => raycastWall(x, y, dx, dy, max),
    visible: (x, y) => visibleFrom(x, y),
    lock: (on) => {
      scriptLock = !!on;
      if (scriptLock) touch.releaseAll();
    },
    walk: (vx, vy) => {
      scriptWalk.x = vx;
      scriptWalk.y = vy;
    },
    openTile: (tx, ty) => {
      const i = ty * level.W + tx;
      level.walls[i] = 0;
      level.blocked[i] = 0;
    },
    hunter: () => enemies.find((e) => e.kind === 'warden') || null,
    wake: (e, why) => wakeWarden(e, why),
    hold: (on) => {
      for (const e of enemies) if (e.kind === 'warden') e.held = !!on;
    },
    reveal: (e, rp) => {
      e.hidden = false;
      if (rp) litByWarden(rp);
    },
    gasp: () => {
      glimmerOff = false;
      castRipple(player.x, player.y, rippleRange());
      audio.gasp();
      cues.caption('[you flinch]');
      return ripples[ripples.length - 1];
    },
    drip: (x, y, R, metal) => drip(x, y, R, metal),
    setKey: (on) => {
      player.hasKey = !!on;
      updateHud();
    },
    music: (mood) => (mood ? music.start(mood) : music.stop()),
    banner: () => showBanner(levelNum),
    notify: (title, text) => notify(title, text, 6500),
    hideBanner: () => {
      clearTimeout(bannerTimer);
      $('banner').classList.remove('show');
    },
    ready: () => {
      if (savedPending) {
        savedPending = false;
        showSaved(); // the "Progress saved" from the level before, now that there is a moment for it
      }
    },
    finish: () => {
      storyDone = true; // handled at the end of updatePlay, once this frame's outcomes are settled
    },
    nextPart: () => {
      nextPartPending = true; // (v18.0) 24: on into its second part, the same way
    },
    // (v18.2) 25: the floor behind you starts to go, on its schedule, from now
    collapse: () => {
      if (level.act2 && level.act2.creep && level.act2.creep.relative) level.act2.creep.base = levelTime;
    },
    // (v18.2) 25: the Warden's hum, 1 as ever .. 0 silent
    hush: (k) => {
      for (const e of enemies) if (e.kind === 'warden') e.hush = k;
    },
  });

  // ---------------------------------------------------------------- storage
  // Everything is wrapped in try/catch: storage can be blocked or unavailable.
  const store = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    /** Returns whether it really got written: the "Progress saved" toast must never lie (js/game.js). */
    set(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e) {
        return false; /* storage unavailable */
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        /* storage unavailable: there is nothing to take away */
      }
    },
  };

  function loadProgress() {
    let p = {};
    try {
      p = JSON.parse(store.get(PROGRESS_KEY)) || {};
    } catch (e) {
      p = {};
    }
    // Progress saved before difficulty modes existed belongs to what is now Normal.
    const legacy = parseInt(store.get(SAVE_KEY), 10);
    if (legacy > 1 && !(p.normal > 1)) p.normal = legacy;
    return p;
  }

  function loadSeen() {
    try {
      return JSON.parse(store.get(SEEN_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  // ----------------------------------------------------------------- state
  let mode = MODES[store.get(MODE_KEY)] ? store.get(MODE_KEY) : 'normal'; // easy | normal | hard | hardcore
  let calm = store.get(CALM_KEY) === '1'; // softer visuals + sound, independent of the mode
  let visualCues = store.get(VISUALCUES_KEY) === '1'; // accessibility: draw sounds as glyphs around the player (independent of calm)
  let touchPref = store.get(TOUCH_KEY); // '1' | '0' | null (automatic)
  let touchSeen = false; // a real touch has happened on this page
  let touchOn = false; // touch controls in use (see refreshTouchMode)
  let audioFx = true; // wall muffling + Doppler. Always on; ?debug can switch it off to prove it changes nothing but sound
  let progress = loadProgress();
  let seen = loadSeen();
  let replaying = false; // a cutscene is being rewatched from the replay screen (it returns there, not to a level)
  let csPaused = false; // (v16.0) a cutscene is paused (P): its clock and its sound stand still, and it cannot be skipped
  let tutorialDone = store.get(TUTORIAL_KEY) === '1'; // the tutorial has been finished or skipped (an old save just says "no")
  let tutorialAfter = 'title'; // where the tutorial goes when it ends: 'intro' (on into the game) or 'title'
  let tutHint = null; // the teaching prompt showing right now (level 0 only)
  audio.calm = calm;
  let state = 'title';
  let runSeed = 1;
  let levelNum = 1;
  let level = null;
  let cfg = null;
  let player = null;
  let enemies = [];
  let ripples = [];
  let marks = [];
  let decoys = []; // sonar decoys the player has dropped this level (level 8+)
  let decoyBlipTimer = 0;
  let glimmerOff = false; // crouching wiped the exit's glimmer; it stays gone until your next ripple (see startCrouch)
  let cooldown = 0;
  let artT = 0; // seconds: the clock the art (js/art.js) animates by. Drawing only - it never touches the simulation
  let artHold = null; // ?debug only: hold the art's clock still, for screenshots
  let singerLanded = false; // a singer has just landed within landRadius of you: you are caught (checked with the outcomes of updatePlay)
  // ---- feedback layers (v11.6). None of these is ever read by the simulation.
  let deathTip = ''; // the line the Caught screen is showing (js/feedback.js)
  let nearMiss = 0; // 0..1: a monster has just come within a hair of you and backed off - drawing and sound only
  let artLag = 0; // seconds of ART time not yet advanced: the near-miss slows what is DRAWN, never what happens
  let savedToastTimer = null;
  // ---- level 13 (js/warden.js)
  let wardenCleared = false; // the great room has been entered on this attempt: progress is written down once
  let wardenSaved = false; // ...and a new best really reached storage, so the ending may say "Progress saved"
  // ---- levels 14-16 (js/story.js)
  let scriptLock = false; // a scripted beat has the controls: no moving, no ripples, no crouch, no item
  const scriptWalk = { x: 0, y: 0 }; // ...and while it has, the beat may walk the player (px/s)
  let storyDone = false; // the level's way out has been walked through and its last beat played
  let savedPending = false; // a "Progress saved" waiting for the next level's first quiet moment
  // ---- the level editor and custom levels (v15.0)
  let cosLook = null; // (v21.0) what your own ripple and marker look like now (js/cosmetics.js look()) - drawing only
  let endlessRun = null; // (v20.0) { seed, depth, mode, startBest, passedBest } while an Endless run is being played (levelNum is ENDLESS_LEVEL)
  let customRun = null; // { doc, from: 'editor' | 'mylevels' | 'bonus', queue } while a custom level is being played (levelNum is CUSTOM_LEVEL)
  let editorScreen = null; // 'gate' | 'unreleased' | 'touch' | 'list' | 'editor': which of the editor's screens is up (state 'editor')
  // ---- custom levels, v15.1
  let fxZones = []; // the level's light / glow zones, ready to draw (js/effects.js)
  let cardTimer = 0; // seconds the title card has left (state 'card'): the level waits underneath it

  let paletteBorrowed = false; // a custom level is showing in its own palette (the player's is put back after)
  let debugShowMuffler = false; // ?debug only: draw the (never otherwise drawn) muffler dimly, for testing
  let levelTime = 0;
  let ripplesUsed = 0;
  let levelDeaths = 0; // times caught on this level since entering it: 0 at the exit wins the Flawless medal
  let showTimer = EchoProfile.getShowTimer(); // Settings -> Display: the level time in the HUD (off by default)
  let beaconTimer = 0;
  let heartTimer = 0;
  let cueBeatTimer = 0; // the heartbeat cue's own timer, for calm mode (which has no heartbeat sound to time it by)
  let danger = 0;
  let beat = 0;
  let flash = 0;
  let shake = 0;
  let camX = 0;
  let camY = 0;
  let bannerTimer = null;
  let loreBannerBack = null; // (v16.2) a hint on levels 13-16 to show again once a fragment's line has gone
  let debugFrozen = false; // ?debug only: hold the cutscene clock still
  let titleRipples = [];
  let titleTimer = 0;
  let W = 0;
  let H = 0;
  let DPR = 1;
  let viewScale = 1;
  const keys = Object.create(null);

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const down = (...codes) => codes.some((c) => keys[c]);
  /**
   * Is a key for this action held? The keys themselves are the player's own (Settings -> Controls,
   * js/profile.js); the game only ever asks about the ACTION, so rebinding cannot change how anything plays.
   * An action with no key at all simply never fires.
   */
  const act = (action) => down.apply(null, EchoProfile.keysFor(action));
  /**
   * Does what is happening right now count? The tutorial (level 0) never does: no stats, no medals, no
   * progress, no "levels cleared". Nor does a custom level (v15.0: CUSTOM_LEVEL, below 0) - test-playing one in
   * the editor or playing one from My Levels. Everything that writes to the save asks this first.
   */
  const scored = () => levelNum > TUTORIAL_LEVEL;
  const inTutorial = () => levelNum === TUTORIAL_LEVEL;
  /**
   * Every way out of the level. A generated or hand-drawn level has exactly one (`level.exit`); a custom level
   * (v15.1) may have up to eight (`level.exits`), and reaching any of them ends it. Everything that used to read
   * `level.exit` - the ripple, the wave's line, the chime, the glimmer, the finish - reads this instead, so one
   * exit or eight go through the very same code.
   */
  const exitsOf = () => level.exits || [level.exit];
  /** How a disguised mimic gives itself away in this mode (MODES.mimicTell) - a custom level's own difficulty's (v15.1). */
  const mimicTell = () => (cfg && cfg.mimicTell) || MODES[mode].mimicTell;
  /** The difficulty to SHOW: a custom level's own rating (v15.1), or the mode picked on the title. */
  const modeLabel = () => (customRun && cfg && cfg.custom ? EchoLevelFormat.ratingLabel(cfg.rating) : MODES[mode].label);
  const LOCKED_EXIT_ART_R = 18; // px: a custom level's locked way out, drawn as level 14's door (a little smaller than the gaol's 20)

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    viewScale = Math.max(0.55, Math.min(W / 1000, H / 620));
    // (v15.5) the title screen grows with a big screen - never shrinks below its own size (a small screen keeps it)
    const ts = String(+Math.max(1, Math.min(2, W / 1280, H / 800)).toFixed(3));
    for (const id of ['title', 'howto']) {
      const el = document.getElementById(id);
      if (el) el.style.setProperty('--s', ts);
    }
  }

  /** Highest level unlocked in a mode (1 = nothing cleared yet). Each mode keeps its own. */
  function getBest(m = mode) {
    return Math.max(1, parseInt(progress[m], 10) || 1);
  }

  /** Returns true only when a NEW best level was really written to storage (the toast asks). */
  function saveBest(n) {
    if (n <= getBest()) return false;
    progress[mode] = n;
    return store.set(PROGRESS_KEY, JSON.stringify(progress));
  }

  // ------------------------------------------------------------- geometry
  function isWall(tx, ty) {
    return tx < 0 || ty < 0 || tx >= level.W || ty >= level.H || level.walls[ty * level.W + tx] === 1;
  }

  function tileFree(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < level.W && ty < level.H && !level.blocked[ty * level.W + tx];
  }

  /** Distance from (ox,oy) along unit vector (dx,dy) to the first wall tile, or maxD. */
  function raycastWall(ox, oy, dx, dy, maxD) {
    let tx = Math.floor(ox / TILE);
    let ty = Math.floor(oy / TILE);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
    let tMaxX = dx > 0 ? ((tx + 1) * TILE - ox) / dx : dx < 0 ? (ox - tx * TILE) / -dx : Infinity;
    let tMaxY = dy > 0 ? ((ty + 1) * TILE - oy) / dy : dy < 0 ? (oy - ty * TILE) / -dy : Infinity;
    let t = 0;
    while (t < maxD) {
      if (isWall(tx, ty)) return t;
      if (tMaxX < tMaxY) {
        t = tMaxX;
        tMaxX += tDeltaX;
        tx += stepX;
      } else {
        t = tMaxY;
        tMaxY += tDeltaY;
        ty += stepY;
      }
    }
    return maxD;
  }

  /**
   * (v17.0) raycastWall over another grid: LEVEL 17's ripple meets what it SEES (level.rayWalls - ghost walls in,
   * hidden walls out), not what is there. Everything physical - moving, line of sight, a wave reaching a monster -
   * still asks raycastWall and the real walls.
   */
  function raycastGrid(grid, ox, oy, dx, dy, maxD) {
    const W = level.W;
    const H = level.H;
    let tx = Math.floor(ox / TILE);
    let ty = Math.floor(oy / TILE);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
    let tMaxX = dx > 0 ? ((tx + 1) * TILE - ox) / dx : dx < 0 ? (ox - tx * TILE) / -dx : Infinity;
    let tMaxY = dy > 0 ? ((ty + 1) * TILE - oy) / dy : dy < 0 ? (oy - ty * TILE) / -dy : Infinity;
    let t = 0;
    while (t < maxD) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H || grid[ty * W + tx] === 1) return t;
      if (tMaxX < tMaxY) {
        t = tMaxX;
        tMaxX += tDeltaX;
        tx += stepX;
      } else {
        t = tMaxY;
        tMaxY += tDeltaY;
        ty += stepY;
      }
    }
    return maxD;
  }

  function hasLOS(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d < 1) return true;
    return raycastWall(x0, y0, dx / d, dy / d, d) >= d;
  }

  function rayCircle(ox, oy, dx, dy, cx, cy, r) {
    const mx = ox - cx;
    const my = oy - cy;
    const b = mx * dx + my * dy;
    const c = mx * mx + my * my - r * r;
    if (c > 0 && b > 0) return -1;
    const disc = b * b - c;
    if (disc < 0) return -1;
    const t = -b - Math.sqrt(disc);
    return t < 0 ? 0 : t;
  }

  function circleHitsWall(px, py, r) {
    const tx0 = Math.floor((px - r) / TILE);
    const tx1 = Math.floor((px + r) / TILE);
    const ty0 = Math.floor((py - r) / TILE);
    const ty1 = Math.floor((py + r) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!isWall(tx, ty)) continue;
        const nx = clamp(px, tx * TILE, tx * TILE + TILE);
        const ny = clamp(py, ty * TILE, ty * TILE + TILE);
        const ddx = px - nx;
        const ddy = py - ny;
        if (ddx * ddx + ddy * ddy < r * r) return true;
      }
    }
    return false;
  }

  /** Can a circle of radius r travel the straight line without touching anything? */
  function clearLine(x0, y0, x1, y1, r) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const n = Math.ceil(Math.hypot(dx, dy) / 8);
    // (v18.0) levels 21-24: a monster never cuts a corner across the void (its centre over it is a fall)
    const vg = level.act2 && level.act2.voidGrid;
    const overGap = (x, y) => {
      for (const [ox, oy] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
        const tx = Math.floor((x + ox) / TILE);
        const ty = Math.floor((y + oy) / TILE);
        if (tx >= 0 && ty >= 0 && tx < level.W && ty < level.H && vg[ty * level.W + tx]) return true;
      }
      return false;
    };
    for (let i = 1; i <= n; i++) {
      const px = x0 + (dx * i) / n;
      const py = y0 + (dy * i) / n;
      if (circleHitsWall(px, py, r)) return false;
      if (vg && overGap(px, py)) return false;
      for (const ob of level.obstacles) {
        if (Math.hypot(px - ob.x, py - ob.y) < r + ob.r) return false;
      }
    }
    return true;
  }

  /**
   * Move a circle by (dx,dy), pushing it out of walls and obstacles.
   * Returns the contact point if it touched something, otherwise null.
   */
  function moveCircle(e, dx, dy) {
    e.x += dx;
    e.y += dy;
    let contact = null;
    for (let iter = 0; iter < 3; iter++) {
      let pushed = false;
      const tx0 = Math.floor((e.x - e.r) / TILE);
      const tx1 = Math.floor((e.x + e.r) / TILE);
      const ty0 = Math.floor((e.y - e.r) / TILE);
      const ty1 = Math.floor((e.y + e.r) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!isWall(tx, ty)) continue;
          const nx = clamp(e.x, tx * TILE, tx * TILE + TILE);
          const ny = clamp(e.y, ty * TILE, ty * TILE + TILE);
          const ddx = e.x - nx;
          const ddy = e.y - ny;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 >= e.r * e.r) continue;
          if (d2 < 1e-6) {
            e.x -= dx;
            e.y -= dy;
            return { x: e.x, y: e.y };
          }
          const d = Math.sqrt(d2);
          const pen = e.r - d;
          e.x += (ddx / d) * pen;
          e.y += (ddy / d) * pen;
          pushed = true;
          contact = { x: nx, y: ny };
        }
      }
      for (const ob of level.obstacles) {
        const ddx = e.x - ob.x;
        const ddy = e.y - ob.y;
        const d = Math.hypot(ddx, ddy);
        if (d >= e.r + ob.r || d < 1e-6) continue;
        const pen = e.r + ob.r - d;
        e.x += (ddx / d) * pen;
        e.y += (ddy / d) * pen;
        pushed = true;
        contact = { x: ob.x + (ddx / d) * ob.r, y: ob.y + (ddy / d) * ob.r };
      }
      // LEVEL 13 only: the warden is solid, exactly as the room's far wall would be. It is not a monster, it
      // is not in `enemies`, and touching it does nothing at all - it is simply in the way (js/warden.js).
      if (level.warden) {
        for (const c of level.warden.circles) {
          const ddx = e.x - c.x;
          const ddy = e.y - c.y;
          const d = Math.hypot(ddx, ddy);
          if (d >= e.r + c.r || d < 1e-6) continue;
          const pen = e.r + c.r - d;
          e.x += (ddx / d) * pen;
          e.y += (ddy / d) * pen;
          pushed = true;
          contact = { x: c.x + (ddx / d) * c.r, y: c.y + (ddy / d) * c.r };
        }
      }
      // LEVELS 14-16 only: the gaol door while it is shut, and a Warden that has not woken - stone, so far as
      // anyone can tell - are solid. (A Warden that is hunting is a monster like any other: touching it kills.)
      if (level.story) {
        for (const c of storySolids()) {
          const ddx = e.x - c.x;
          const ddy = e.y - c.y;
          const d = Math.hypot(ddx, ddy);
          if (d >= e.r + c.r || d < 1e-6) continue;
          const pen = e.r + c.r - d;
          e.x += (ddx / d) * pen;
          e.y += (ddy / d) * pen;
          pushed = true;
          contact = { x: c.x + (ddx / d) * c.r, y: c.y + (ddy / d) * c.r };
        }
      }
      // CUSTOM LEVELS (v15.1): a locked way out is a shut door, solid like level 14's, until the key opens it
      if (level.exits) {
        for (const c of level.exits) {
          if (!c.locked) continue;
          const ddx = e.x - c.x;
          const ddy = e.y - c.y;
          const d = Math.hypot(ddx, ddy);
          if (d >= e.r + c.r || d < 1e-6) continue;
          const pen = e.r + c.r - d;
          e.x += (ddx / d) * pen;
          e.y += (ddy / d) * pen;
          pushed = true;
          contact = { x: c.x + (ddx / d) * c.r, y: c.y + (ddy / d) * c.r };
        }
      }
      if (!pushed) break;
    }
    return contact;
  }

  // ----------------------------------------------------------- pathfinding
  function nearestFree(tx, ty) {
    if (tileFree(tx, ty)) return [tx, ty];
    for (let r = 1; r <= 5; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && tileFree(tx + dx, ty + dy)) return [tx + dx, ty + dy];
        }
      }
    }
    return null;
  }

  /** BFS over free tiles. Returns tile-centre waypoints (start tile excluded) or null. */
  function findPath(sx, sy, gx, gy) {
    const { W: lw, H: lh } = level;
    const start = sy * lw + sx;
    const goal = gy * lw + gx;
    if (start === goal) return [];
    const prev = new Int32Array(lw * lh).fill(-1);
    const queue = new Int32Array(lw * lh);
    let head = 0;
    let tail = 0;
    prev[start] = start;
    queue[tail++] = start;
    const dirs = [1, -1, lw, -lw];
    while (head < tail) {
      const c = queue[head++];
      if (c === goal) break;
      const cx = c % lw;
      for (let k = 0; k < 4; k++) {
        const n = c + dirs[k];
        if (n < 0 || n >= lw * lh || prev[n] >= 0 || level.blocked[n]) continue;
        const nx = n % lw;
        if (Math.abs(nx - cx) > 1) continue; // wrapped around a row edge
        prev[n] = c;
        queue[tail++] = n;
      }
    }
    if (prev[goal] < 0) return null;
    const path = [];
    for (let c = goal; c !== start; c = prev[c]) {
      path.push({ x: ((c % lw) + 0.5) * TILE, y: (((c / lw) | 0) + 0.5) * TILE });
    }
    return path.reverse();
  }

  function setPathTo(e, tx, ty) {
    const gx = Math.floor(tx / TILE);
    const gy = Math.floor(ty / TILE);
    const goal = nearestFree(gx, gy);
    if (!goal) return false;
    const path = findPath(Math.floor(e.x / TILE), Math.floor(e.y / TILE), goal[0], goal[1]);
    if (!path) return false;
    if (goal[0] === gx && goal[1] === gy) {
      if (path.length) path[path.length - 1] = { x: tx, y: ty };
      else path.push({ x: tx, y: ty });
    } else if (!path.length) {
      path.push({ x: (goal[0] + 0.5) * TILE, y: (goal[1] + 0.5) * TILE });
    }
    e.path = path;
    e.pi = 0;
    return true;
  }

  function followPath(e, speed, dt) {
    const sx = e.x;
    const sy = e.y;
    let budget = speed * dt;
    let guard = 8;
    while (budget > 0 && e.path && guard-- > 0) {
      const p = e.path;
      for (let j = Math.min(p.length - 1, e.pi + 5); j > e.pi; j--) {
        if (clearLine(e.x, e.y, p[j].x, p[j].y, e.r - 3)) {
          e.pi = j;
          break;
        }
      }
      const tgt = p[e.pi];
      const dx = tgt.x - e.x;
      const dy = tgt.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d <= budget) {
        e.x = tgt.x;
        e.y = tgt.y;
        budget -= d;
        e.pi++;
        if (e.pi >= p.length) e.path = null;
      } else {
        e.x += (dx / d) * budget;
        e.y += (dy / d) * budget;
        budget = 0;
      }
    }
    return Math.hypot(e.x - sx, e.y - sy);
  }

  // ----------------------------------------------------------------- audio
  /** Stereo pan + loudness of a world position as heard by the player. */
  function spatial(x, y, range) {
    const dx = x - player.x;
    const dy = y - player.y;
    const d = Math.hypot(dx, dy);
    return {
      d,
      pan: clamp((dx / (d + 90)) * 1.35, -1, 1),
      g: Math.pow(Math.max(0, 1 - d / range), 1.6),
    };
  }

  // --------------------------------------------------------------- enemies
  /**
   * Three kinds of monster:
   *   'echo'  (red)    blind; learns of you only from a ripple hit or your close footsteps
   *   'scent' (violet) ignores ripples and footsteps; follows SMELL. It never stands still.
   *   'mimic' (green)  passes for the EXIT: the exit's size, its green ripple echo, its glow when you are near
   *                    and its chime. It sits still and silent until the wave of a ripple touches it, and
   *                    then it becomes an ordinary 'echo' monster (see revealMimic). A sonar decoy can still
   *                    drag it around while it is disguised.
   *   'stalker' (orange) ignores ripples, echoes and the sonar decoy entirely (a ripple can SHOW it, it learns nothing).
   *                    It hears you two ways, both only while you are NOT crouching, both at all times: your footsteps
   *                    (while you move, within footstepRadius) and your presence (standing, even still, within the
   *                    smaller presenceRadius). See stalkersListen / updateStalker.
   *   'muffler' (level 11; never drawn) ABSORBS ripples (castRipple: a ray that reaches it just ends - no echo, no colour, no
   *                    sound - so it leaves a hole in the echo map and is never lit) and cannot be smelled (no scent, no
   *                    trail, ignores puddles). Like the stalker it hears you at all times with no listening window, but from
   *                    farther off, and a crouch only quiets you: crouched MOVEMENT is heard from a small radius. It
   *                    remembers the last spot for mufflerMemorySeconds. See mufflersListen / updateMuffler.
   *   'singer' (level 12; magenta) roams and SINGS ripples of its own (castRipple with { singer }); it is deaf to everything
   *                    of yours. A wave of its that reaches you MARKS you: a countdown, then it leaps to the exact spot the
   *                    wave found you at. See updateSinger / singerRippleHits.
   * `state` is idle | hunt (walking to a spot) | search (listening) | track (following you)
   * for an echo monster, patrol | follow (along a smell trail) | track (smelling you) for a scent monster,
   * patrol | hunt (walking to the exact spot it last heard you) for a stalker or a muffler, and
   * patrol | marked (counting down) | leap | recover for a singer.
   * Any monster a sonar decoy has called is `lured` (walking to it) and then `trapped` (held there for
   * DECOY_TRAP_SECONDS) before it goes back to normal (see lureEnemy / updateLured). A stalker, a muffler and a singer are never called.
   */
  function makeEnemy(spec) {
    const kind = spec.kind || 'echo';
    // what kind of monster it is comes from the game's one list of them (MONSTER_TYPES, js/level.js - v15.0), which
    // the level editor reads too: a new monster has to be there, and then it can be placed in the editor as well
    const type = monsterType(kind);
    if (!type) console.warn(`makeEnemy: '${kind}' is not in MONSTER_TYPES (js/level.js)`);
    const roamer = !!(type && type.roams); // these never stand about (scent, stalker, muffler, singer)
    // the Warden that hunts you on levels 15 and 16: what kind of one it is lives in js/warden.js (VARIANTS)
    const isWarden = kind === 'warden';
    const wv = isWarden ? EchoWarden.variant(spec.variant) : null;
    const e = {
      kind,
      x: spec.x,
      y: spec.y,
      r: kind === 'mimic' ? EXIT_R : isWarden ? wv.r : ENEMY_R, // a disguised mimic is exactly as big as the exit it copies
      pitch: spec.pitch, // kept so a mimic can get its echo-monster voice when it turns
      sleeper: spec.sleeper,
      state: isWarden ? 'dormant' : roamer ? 'patrol' : 'idle', // (a Warden sleeps in the stone until the story wakes it)
      path: null,
      pi: 0,
      timer: 0,
      repath: 0,
      pause: isWarden ? 0 : kind === 'scent' ? 0.3 + Math.random() : kind === 'stalker' || kind === 'muffler' || kind === 'singer' ? 0 : 1 + Math.random() * 2,
      everHeard: false, // muffler: it has heard you at least once (its patrol leans towards heardX/heardY)
      singCd: kind === 'singer' ? 2 + Math.random() * 2 : 0, // singer: seconds to its next song (the first comes a little after you arrive) - a draw only for a singer, so no other monster's random numbers move
      markX: 0, // singer: the exact spot the wave that marked you found you at (where it will land)
      markY: 0,
      markFrac: 0, // singer: how much of the countdown is left (1 = just marked, 0 = it leaps)
      tickCd: 0, // singer: seconds to the next countdown tick
      leapT: 0, // singer: seconds since it launched
      leapX0: 0,
      leapY0: 0,
      stepDist: 0,
      alertCd: 0,
      heardX: 0, // stalker: the exact spot it last heard you
      heardY: 0,
      deaf: 0, // stalker: seconds since it last heard you
      spotNew: false, // stalker: the spot has changed since it last planned a route
      clickCd: isWarden ? 1 : 1 + Math.random() * 2, // stalker: seconds to its next soft click
      aDist: -1, // audio only (Doppler): its distance to the player last frame, and the smoothed rate that distance is changing
      aVr: 0,
      followTrail: null, // scent monster: the trail it is following
      ignoreTrail: null, // scent monster: a trail it just finished; ignored until it walks away from it
      // a disguised mimic makes no sound of its own - and a Warden asleep in the stone makes none until it wakes
      voice: audio.ready && kind !== 'mimic' && kind !== 'alarm' && !isWarden ? audio.createEnemyVoice(spec.pitch, kind) : null,
      // (v15.7) the Alarm: it has screamed (and is silent and dim from then on); the next tick of its hum. The
      // Screecho: seconds before it can scream again (SCREECHO_COOLDOWN, js/level.js)
      spent: false,
      humCd: 0.6,
      screamCd: 0,
    };
    if (isWarden) {
      e.variant = wv.id;
      e.speed = wv.speed * WALK_SPEED; // px/s: a fraction of YOUR walking speed (js/level.js)
      e.abilities = EchoWarden.abilitiesOf(wv.id); // none yet, on either one
      e.hidden = true; // stone, to a ripple, until it shows itself
      e.held = false; // the level is over: it stops where it is
      e.lure = 0; // level 15: the warm light out of its seam (drawn by js/story.js)
      e.reach = 0; // its limbs, out towards you (the reveal on level 15)
    }
    return e;
  }

  const isChasing = (e) => e.state === 'hunt' || e.state === 'track' || e.state === 'follow' || e.state === 'summoned';

  function destroyVoices() {
    for (const e of enemies) {
      audio.destroyEnemyVoice(e.voice);
      e.voice = null;
    }
  }

  /**
   * Is a wall or an obstacle between (x0,y0) and (x1,y1)? Used for AUDIO ONLY (wall muffling) and for dimming the
   * matching visual cue. It is the game's own line-of-sight test (hasLOS, the DDA over the tile grid) plus a
   * check of the round obstacles with rayCircle (the same test the ripples use). Nothing new is cast, and
   * nothing in the game reads the result.
   */
  function soundBlocked(x0, y0, x1, y1) {
    if (!hasLOS(x0, y0, x1, y1)) return true;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d < 1) return false;
    for (const o of level.obstacles) {
      const t = rayCircle(x0, y0, dx / d, dy / d, o.x, o.y, o.r);
      if (t >= 0 && t < d) return true;
    }
    return false;
  }

  /** A sound's loudness (its audio gain, 0..1) as the visual cues show it: a square root, so quiet sounds still read. */
  const cueLoud = (g) => Math.sqrt(clamp(g, 0, 1));

  /**
   * The chime of the exit - and of a mimic, which calls this very same function from where it stands. Within the
   * chime's range (620 px, the same falloff as the sound) it plays the bell AND shows the green chevron, and a
   * wall or obstacle in the way muffles the bell and dims the chevron. Because the exit and the mimic go through
   * exactly this code, the mimic has precisely the same tell as the exit - no more, no less - by ear and by eye.
   */
  function chime(x, y) {
    const sp = spatial(x, y, 620);
    if (sp.g <= 0.015) return;
    const blocked = soundBlocked(x, y, player.x, player.y);
    audio.beacon(sp.pan, sp.g, audioFx && blocked);
    cues.pulse('exit', x, y, cueLoud(sp.g), { muffled: blocked });
  }

  function screech(e) {
    if (e.alertCd > 0) return;
    const sp = spatial(e.x, e.y, 950);
    audio.enemyAlert(sp.pan, sp.g);
    if (sp.g >= 0.01) {
      cues.pulse('echo', e.x, e.y, cueLoud(sp.g), { big: true, key: e, sub: 'alert' });
      cues.caption('[monster screech]');
    }
    e.alertCd = 2;
  }

  /**
   * Your ripple wave hit this monster. It learns exactly where the ripple was
   * sent from (ox,oy) and walks there. It is NOT told where you are now, so if
   * you have moved on it will not know. (It is deaf while it walks.)
   */
  function alertEnemy(e, ox, oy) {
    const wasHunting = e.state === 'hunt';
    if (!setPathTo(e, ox, oy)) return;
    e.state = 'hunt';
    e.why = 'ripple'; // the Caught screen's tip only (js/feedback.js): written here, never read by the AI
    if (!wasHunting) screech(e);
  }

  /**
   * A footstep of yours at (x,y). Only a monster that has just reached the spot
   * a ripple sent it to (state 'search', i.e. for searchTime seconds) is
   * listening, and only within footstepRadius. Standing still makes no sound.
   * Once it hears you it locks on and TRACKS you: it knows where you are and
   * follows for as long as you stay within footstepRadius - even after the
   * listening window is over. See the 'track' branch in updateEnemy.
   */
  function hearFootstep(x, y) {
    for (const e of enemies) {
      if (e.state !== 'search') continue;
      if (Math.hypot(e.x - x, e.y - y) > cfg.footstepRadius) continue;
      e.state = 'track';
      e.why = 'footsteps'; // tip only
      e.repath = 0;
      screech(e);
    }
  }

  function randomNearbyTile(e, radius) {
    const tx = Math.floor(e.x / TILE);
    const ty = Math.floor(e.y / TILE);
    for (let i = 0; i < 8; i++) {
      const nx = tx + Math.round((Math.random() * 2 - 1) * radius);
      const ny = ty + Math.round((Math.random() * 2 - 1) * radius);
      if (tileFree(nx, ny) && (nx !== tx || ny !== ty)) return [nx, ny];
    }
    return null;
  }

  function wander(e, radius, pauseMin) {
    const t = randomNearbyTile(e, radius);
    if (t && setPathTo(e, (t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE)) return;
    e.path = null;
    e.pause = pauseMin;
  }

  function updateEnemy(e, dt) {
    e.alertCd = Math.max(0, e.alertCd - dt);
    if (e.screamCd > 0) e.screamCd = Math.max(0, e.screamCd - dt); // (v15.7: a Screecho getting its breath back)
    if (e.state === 'lured' || e.state === 'trapped') {
      // a sonar decoy has called it: it ignores everything else (ripples, footsteps, smell) until it is released
      enemyAudio(e, updateLured(e, dt), dt);
      return;
    }
    if (e.state === 'summoned') {
      // (v15.7) a scream sent it to where you were: it walks there, waits a while, and goes back to its round
      enemyAudio(e, updateSummoned(e, dt), dt);
      return;
    }
    // a disguised mimic just sits there, silent, being an exit
    const moved =
      e.kind === 'warden' ? updateWardenHunt(e, dt) // levels 15-16: it knows where you are, always
      : e.kind === 'stalker' ? updateStalker(e, dt)
      : e.kind === 'muffler' ? updateMuffler(e, dt)
      : e.kind === 'singer' ? updateSinger(e, dt)
      : e.kind === 'scent' ? updateScent(e, dt)
      : e.kind === 'mimic' || e.kind === 'alarm' ? 0 // (v15.7: an Alarm never moves)
      : updateEcho(e, dt); // (an echo monster - and, v15.7, a Screecho, which hunts exactly like one)
    enemyAudio(e, moved, dt);
  }

  // ---------------------------------------------------------------- muffler
  /**
   * The MUFFLER (level 11). It cannot be seen (a ripple that reaches it is swallowed: see castRipple) and cannot be
   * smelled (it has no scent and ignores puddles, smell and trails). It only HEARS you, at all times (no listening
   * window), by straight-line distance through walls like every monster:
   *   - standing up: your footsteps (while you actually move) from mufflerFootstepRadius, and your presence
   *     (standing, even still) from the smaller mufflerPresenceRadius;
   *   - crouching does NOT fully silence you: crouched MOVEMENT is heard from the small mufflerCrouchRadius; crouched
   *     standing is silent.
   * It ignores ripples, echoes and the sonar decoy entirely.
   */
  function mufflersListen(walked) {
    for (const e of enemies) {
      if (e.kind !== 'muffler') continue;
      if (e.state === 'lured' || e.state === 'trapped') continue; // a decoy has it: it hears nothing else until it is released
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      const heard = player.crouching
        ? walked && d <= cfg.mufflerCrouchRadius
        : d <= cfg.mufflerPresenceRadius || (walked && d <= cfg.mufflerFootstepRadius);
      if (heard) {
        // tip only, and only on the frame it first hears you (see stalkersListen above for why)
        if (e.state !== 'hunt') e.why = !player.crouching && d <= cfg.mufflerPresenceRadius ? 'standing' : 'moving';
        mufflerHeard(e);
      }
    }
  }

  /** It heard you: it goes to the exact spot you are at right now, and keeps updating it while it keeps hearing you. */
  function mufflerHeard(e) {
    if (e.state !== 'hunt') {
      e.state = 'hunt';
      e.repath = 0; // plan the route at once
      if (e.alertCd <= 0) {
        // a single deep, dull thud as it turns towards you (a cue for it too, and a short caption)
        const sp = spatial(e.x, e.y, 700);
        audio.mufflerAlert(sp.pan, sp.g);
        if (sp.g >= 0.01) {
          cues.pulse('muffler', e.x, e.y, cueLoud(sp.g), { big: true, key: e, sub: 'alert' });
          cues.caption('[a deep thud]');
        }
        e.alertCd = 2;
      }
    }
    e.deaf = 0;
    e.everHeard = true;
    e.heardX = player.x;
    e.heardY = player.y;
    e.spotNew = true;
  }

  /** Muffler AI. Returns the distance it moved this frame. It never has a listening window and never stands about. */
  function updateMuffler(e, dt) {
    const speed = cfg.mufflerSpeed; // one steady pace, patrolling or hunting
    let moved = 0;
    if (e.state === 'hunt') {
      e.deaf += dt; // seconds since it last heard you: it remembers the spot for mufflerMemorySeconds, then gives up
      if (e.deaf >= cfg.mufflerMemorySeconds) {
        e.state = 'patrol';
        e.path = null;
        e.pause = 0;
      } else {
        e.repath -= dt;
        if (e.spotNew && e.repath <= 0) {
          e.repath = 0.15;
          e.spotNew = false;
          setPathTo(e, e.heardX, e.heardY);
        }
        moved = followPath(e, speed, dt); // at the spot it just waits there (until the memory runs out)
      }
    }
    if (e.state === 'patrol') {
      if (e.path) moved = followPath(e, speed, dt);
      else {
        e.pause -= dt;
        if (e.pause <= 0) mufflerPatrol(e);
      }
    }
    return moved;
  }

  /**
   * Patrol to a random tile a good way off - leaning towards the last place it heard you: of a handful of random
   * tiles it usually picks the one nearest that spot (and any of them the rest of the time, so it still wanders).
   */
  function mufflerPatrol(e) {
    const tiles = [];
    for (let i = 0; i < 6; i++) {
      const t = randomNearbyTile(e, 12);
      if (t) tiles.push(t);
    }
    if (e.everHeard && tiles.length > 1 && Math.random() < 0.65) {
      const dh = (t) => Math.hypot((t[0] + 0.5) * TILE - e.heardX, (t[1] + 0.5) * TILE - e.heardY);
      tiles.sort((a, b) => dh(a) - dh(b));
    }
    for (const t of tiles) {
      if (setPathTo(e, (t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE)) {
        e.pause = 0;
        return;
      }
    }
    e.path = null;
    e.pause = 0.25; // nowhere to go from here this frame: try again very shortly
  }

  // ----------------------------------------------------------------- singer
  /**
   * The SINGER (level 12) roams the maze (0.8 x an echo monster's speed) and every singInterval seconds SINGS: a ripple
   * of its own, from where it stands, through the game's real ripple system (magenta; walls and obstacles block it,
   * the muffler swallows it). It is deaf to your footsteps, your standing, your ripples and the sonar decoy; the only
   * thing it learns about you is that one of its waves reached you (singerRippleHits -> markPlayer). Crouching does
   * not stop a wave. Being marked:
   *   1. the exact spot the wave found you at is recorded and a countdown of markSeconds starts (a clear sting, then
   *      ticks that speed up - the same volume in calm mode: it is gameplay information);
   *   2. at zero it LEAPS - a jump over the walls that takes SINGER_LEAP_SECONDS from launch, with a rising whoosh -
   *      and lands exactly on the recorded spot;
   *   3. you are caught if you are within landRadius of the spot when it lands; touching it at any time also kills;
   *   4. it waits SINGER_LAND_WAIT seconds where it landed, then roams and sings again.
   * More waves reaching you while it counts down, leaps or waits are ignored. (It keeps singing during the countdown.)
   */
  function markPlayer(e) {
    if (e.state !== 'patrol') return; // marked / leaping / recovering already: further hits are ignored
    e.state = 'marked';
    e.markX = player.x;
    e.markY = player.y;
    e.timer = cfg.markSeconds;
    e.markFrac = 1;
    e.tickCd = 0.55; // the first tick follows the sting
    audio.markSting(); // not spatial and not softened in calm mode
    cues.caption('[a sting - you are marked]');
    if (scored()) EchoProfile.bump('marked'); // (v15.0: a custom level counts nothing - every scored level still does)
  }

  function updateSinger(e, dt) {
    let moved = 0;
    if (e.state === 'leap') {
      e.leapT += dt;
      const u = clamp(e.leapT / SINGER_LEAP_SECONDS, 0, 1);
      if (u >= 1) {
        // it lands EXACTLY on the recorded spot
        e.x = e.markX;
        e.y = e.markY;
        e.path = null;
        e.state = 'recover';
        e.timer = SINGER_LAND_WAIT;
        const sp = spatial(e.x, e.y, 900);
        audio.singerLand(sp.pan, Math.max(sp.g, 0.2));
        if (!calm) shake = Math.max(shake, 8 * Math.max(sp.g, 0.2));
        cues.pulse('singer', e.x, e.y, cueLoud(Math.max(sp.g, 0.3)), { big: true, key: e, sub: 'land' });
        cues.caption('[a heavy landing]');
        if (Math.hypot(player.x - e.markX, player.y - e.markY) <= cfg.landRadius) singerLanded = true; // caught: see the outcomes at the end of updatePlay
      } else {
        const k = u * u * (3 - 2 * u);
        e.x = e.leapX0 + (e.markX - e.leapX0) * k;
        e.y = e.leapY0 + (e.markY - e.leapY0) * k;
      }
      return 0; // (a jump makes no footsteps)
    }
    if (e.state === 'recover') {
      e.timer -= dt;
      if (e.timer <= 0) {
        e.state = 'patrol';
        e.pause = 0;
        e.singCd = Math.min(e.singCd, cfg.singInterval * 0.5); // it starts singing again soon after it has recovered
      }
      return 0;
    }
    // patrol (and the countdown, during which it keeps roaming and singing)
    if (e.path) moved = followPath(e, cfg.singerSpeed, dt);
    else {
      e.pause -= dt;
      if (e.pause <= 0) stalkerPatrol(e); // a random tile a good way off, and on to the next when it gets there
    }
    e.singCd -= dt;
    if (e.singCd <= 0) {
      e.singCd = cfg.singInterval;
      singerSing(e);
    }
    if (e.state === 'marked') {
      e.timer -= dt;
      e.markFrac = clamp(e.timer / cfg.markSeconds, 0, 1);
      e.tickCd -= dt;
      if (e.tickCd <= 0) {
        audio.markTick(1 - e.markFrac); // ticks that speed up (and rise) as the countdown runs out
        e.tickCd = 0.85 - 0.74 * (1 - e.markFrac);
      }
      if (e.timer <= 0) {
        // LAUNCH
        e.state = 'leap';
        e.leapT = 0;
        e.leapX0 = e.x;
        e.leapY0 = e.y;
        e.path = null;
        const sp = spatial(e.x, e.y, 1100);
        audio.singerWhoosh(sp.pan, Math.max(sp.g, 0.35));
        cues.pulse('singer', e.x, e.y, cueLoud(Math.max(sp.g, 0.4)), { big: true, key: e, sub: 'whoosh' });
        cues.caption('[a rising whoosh]');
      }
    }
    return moved;
  }

  /** One song: a magenta ripple from where it stands, and its sung tone from there. */
  function singerSing(e) {
    castRipple(e.x, e.y, cfg.singRange, { singer: e });
    const sp = spatial(e.x, e.y, 1000);
    const blocked = soundBlocked(e.x, e.y, player.x, player.y);
    audio.singerSing(sp.pan, sp.g, audioFx && blocked);
    if (sp.g >= 0.01) {
      cues.pulse('singer', e.x, e.y, cueLoud(sp.g), { big: true, key: e, sub: 'sing', muffled: blocked });
      cues.caption('[a sung tone]');
    }
  }

  /**
   * One of the singer's waves has just passed over where you are? Physically, like touchMonsters: the wavefront must
   * be passing over you now, within its range, and one of its rays must actually REACH you (a wall, an obstacle, a
   * monster - or the muffler - that ends the ray first shields you). Crouching does not matter. The first hit marks you.
   */
  function singerRippleHits(rp, r0, r1) {
    if (state !== 'play' || rp.hitPlayer || r0 >= rp.R) return;
    const dx = player.x - rp.x;
    const dy = player.y - rp.y;
    const d = Math.hypot(dx, dy);
    if (d > rp.R || d - PLAYER_R > r1 || d + PLAYER_R < r0) return;
    const j0 = Math.round((Math.atan2(dy, dx) / TAU) * RAYS);
    const span = Math.ceil(Math.atan(PLAYER_R / Math.max(d, PLAYER_R)) / (TAU / RAYS));
    for (let k = -span; k <= span; k++) {
      const j = (((j0 + k) % RAYS) + RAYS) % RAYS;
      if (rp.dist[j] >= d - 1) {
        rp.hitPlayer = true;
        if (rp.singer && rp.singer !== true) markPlayer(rp.singer);
        return;
      }
    }
  }

  // ---------------------------------------------------------------- stalker
  /**
   * Every stalker that can hear you does, this frame. It hears you in exactly two ways, and only while you are
   * NOT crouching (crouching silences both): your footsteps - while you actually move - from anywhere within
   * footstepRadius, and your presence - while you stand, even completely still - from within the smaller
   * presenceRadius. There is no listening window: it works at all times. Distance is straight-line (sound goes
   * through walls, as it does for every monster). A ripple, an echo or a sonar decoy tells it nothing.
   */
  function stalkersListen(walked) {
    if (player.crouching) return;
    for (const e of enemies) {
      if (e.kind !== 'stalker') continue;
      if (e.state === 'lured' || e.state === 'trapped') continue; // a decoy has it: it hears nothing else until it is released
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d <= cfg.presenceRadius || (walked && d <= cfg.footstepRadius)) {
        // tip only (js/feedback.js), and only on the frame it FIRST hears you: by the time it reaches you, you
        // are inside its presence radius whatever you are doing, so the last frame would always say "standing"
        if (e.state !== 'hunt') e.why = d <= cfg.presenceRadius ? 'standing' : 'moving';
        stalkerHeard(e);
      }
    }
  }

  /** It heard you: it goes to the exact spot you are at right now, and keeps updating it while it keeps hearing you. */
  function stalkerHeard(e) {
    if (e.state !== 'hunt') {
      e.state = 'hunt';
      e.repath = 0; // plan the route at once
      stalkerAlert(e);
    }
    e.deaf = 0;
    e.heardX = player.x;
    e.heardY = player.y;
    e.spotNew = true;
  }

  function stalkerAlert(e) {
    if (e.alertCd > 0) return;
    const sp = spatial(e.x, e.y, 950);
    audio.stalkerAlert(sp.pan, sp.g);
    if (sp.g >= 0.01) {
      cues.pulse('stalker', e.x, e.y, cueLoud(sp.g), { big: true, key: e, sub: 'alert' });
      cues.caption('[sharp breath, clicks]');
    }
    e.alertCd = 2;
  }

  /** Stalker AI. Returns the distance it moved this frame. It never has a listening window and never stands about. */
  function updateStalker(e, dt) {
    const speed = cfg.stalkerSpeed; // one steady pace, patrolling or hunting
    let moved = 0;
    if (e.state === 'hunt') {
      e.deaf += dt;
      if (e.deaf >= STALKER_LOSE_SECONDS) {
        // nothing heard for 3 seconds: it has lost you and goes back to patrolling from wherever it is
        e.state = 'patrol';
        e.path = null;
        e.pause = 0;
      } else {
        e.repath -= dt;
        if (e.spotNew && e.repath <= 0) {
          e.repath = 0.15;
          e.spotNew = false;
          setPathTo(e, e.heardX, e.heardY);
        }
        moved = followPath(e, speed, dt); // at the spot it just waits there (until the 3 seconds are up)
      }
    }
    if (e.state === 'patrol') {
      if (e.path) moved = followPath(e, speed, dt);
      else {
        e.pause -= dt;
        if (e.pause <= 0) stalkerPatrol(e);
      }
    }
    return moved;
  }

  /** Walk to a random tile a good way off, and on to the next one when it gets there: waiting in a corner does not work. */
  function stalkerPatrol(e) {
    for (let i = 0; i < 8; i++) {
      const t = randomNearbyTile(e, 12);
      if (t && setPathTo(e, (t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE)) {
        e.pause = 0;
        return;
      }
    }
    e.path = null;
    e.pause = 0.25; // nowhere to go from here this frame: try again very shortly
  }

  // ------------------------------------------------------------ sonar decoy
  /** A decoy has called this monster: it walks to the decoy by the shortest path. Returns false if it can't get there. */
  function lureEnemy(e, x, y) {
    if (!setPathTo(e, x, y)) return false;
    e.state = 'lured';
    e.followTrail = null;
    e.ignoreTrail = null;
    return true;
  }

  /** Each kind's own walking speed (they are all slower than the player, as ever) - for a decoy's call and a scream. */
  const speedOf = (e) =>
    e.kind === 'scent' ? cfg.scentSpeed
    : e.kind === 'stalker' ? cfg.stalkerSpeed
    : e.kind === 'muffler' ? cfg.mufflerSpeed
    : e.kind === 'singer' ? cfg.singerSpeed
    : cfg.enemySpeed;

  /** Walk to the decoy, then stay trapped there for DECOY_TRAP_SECONDS; then go back to normal. */
  function updateLured(e, dt) {
    let moved = 0;
    if (e.state === 'lured') {
      // each kind walks to the decoy at its own speed
      moved = followPath(e, speedOf(e), dt);
      if (!e.path) {
        e.state = 'trapped';
        e.timer = DECOY_TRAP_SECONDS; // counts from the moment it arrives
      }
    } else {
      e.timer -= dt;
      if (e.timer <= 0) releaseLured(e);
    }
    return moved;
  }

  /**
   * Back to normal. The kinds that never stand still (scent, stalker, muffler, singer) start patrolling again
   * from where the decoy left them; an echo monster goes idle where it is, deaf until a ripple finds it.
   */
  function releaseLured(e) {
    e.path = null;
    if (e.kind === 'scent' || e.kind === 'stalker' || e.kind === 'muffler' || e.kind === 'singer') {
      e.state = 'patrol';
      e.pause = e.kind === 'scent' ? 0.5 : 0;
      e.deaf = 0; // the stalker and the muffler start listening again from this moment
      if (e.kind === 'singer') e.singCd = Math.max(e.singCd, 1.5); // it gathers itself before it sings again
    } else {
      e.state = 'idle';
      e.pause = 1 + Math.random() * 2;
    }
  }

  /** Echo monster AI. Returns the distance it moved this frame. */
  function updateEcho(e, dt) {
    const speed = cfg.enemySpeed;

    let moved = 0;
    if (e.state === 'hunt') {
      moved = followPath(e, speed, dt);
      if (!e.path) {
        // Reached the spot the sound came from. It does not know where you
        // went, so it stands there and listens for searchTime seconds (see
        // hearFootstep) before giving up.
        e.state = 'search';
        e.timer = cfg.searchTime;
      }
    } else if (e.state === 'search') {
      e.timer -= dt;
      if (e.timer <= 0) {
        e.state = 'idle';
        e.path = null;
        e.pause = 1 + Math.random() * 2;
      }
    } else if (e.state === 'track') {
      if (Math.hypot(player.x - e.x, player.y - e.y) > cfg.footstepRadius) {
        // You got away. It can no longer sense you, and will not again until
        // another ripple hits it.
        e.state = 'idle';
        e.path = null;
        e.pause = 1 + Math.random() * 2;
      } else {
        // Still too close: it knows exactly where you are right now.
        e.repath -= dt;
        if (e.repath <= 0) {
          e.repath = 0.2;
          setPathTo(e, player.x, player.y);
        }
        moved = followPath(e, speed, dt);
      }
    } else if (!e.sleeper) {
      if (e.path) {
        moved = followPath(e, speed * 0.28, dt);
      } else {
        e.pause -= dt;
        if (e.pause <= 0) {
          wander(e, 6, 1.5);
          e.pause = 1.5 + Math.random() * 2.5;
        }
      }
    }

    return moved;
  }

  // --------------------------------------------------- smell + scent monsters
  /** A scent monster has caught wind of you. */
  function scentAlert(e) {
    if (e.alertCd > 0) return;
    const sp = spatial(e.x, e.y, 950);
    audio.scentAlert(sp.pan, sp.g);
    if (sp.g >= 0.01) {
      cues.pulse('scent', e.x, e.y, cueLoud(sp.g), { big: true, key: e, sub: 'alert' });
      cues.caption('[snorting]');
    }
    e.alertCd = 2;
  }

  /** Closest point on a smell trail to (x,y): { d, px, py, along, seg }, `along` = distance from the trail's start. */
  function nearestOnTrail(tr, x, y) {
    let best = { d: Infinity, px: 0, py: 0, along: 0, seg: 0 };
    for (let i = 0; i < tr.pts.length - 1; i++) {
      const a = tr.pts[i];
      const b = tr.pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? clamp(((x - a.x) * dx + (y - a.y) * dy) / l2, 0, 1) : 0;
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const d = Math.hypot(x - px, y - py);
      if (d < best.d) best = { d, px, py, along: tr.cum[i] + Math.sqrt(l2) * t, seg: i };
    }
    return best;
  }

  /**
   * A scent monster that touches a smell trail at all goes to the OTHER end of
   * it - whichever end is farther along the trail from where it touched it.
   */
  function checkTrailTouch(e) {
    for (const tr of level.trails) {
      if (tr.pts.length < 2) continue;
      // Once it has committed to a trail it just walks it. (Re-deciding every frame would
      // flip which end is "farther" at the halfway point and make it pace back and forth.)
      if (tr === e.followTrail) continue;
      const hit = nearestOnTrail(tr, e.x, e.y);
      if (tr === e.ignoreTrail) {
        // it has just walked this trail; do not bounce straight back until it has left it
        if (hit.d > TRAIL_TOUCH + 30) e.ignoreTrail = null;
        continue;
      }
      if (hit.d > TRAIL_TOUCH) continue;
      const toStart = hit.along;
      const toEnd = tr.len - hit.along;
      const path = [];
      if (toStart > toEnd) for (let i = hit.seg; i >= 0; i--) path.push({ x: tr.pts[i].x, y: tr.pts[i].y }); // farther end = the start
      else for (let i = hit.seg + 1; i < tr.pts.length; i++) path.push({ x: tr.pts[i].x, y: tr.pts[i].y }); // farther end = the far tip
      if (!path.length) continue;
      e.state = 'follow';
      e.why = 'trail'; // tip only (js/feedback.js)
      e.followTrail = tr;
      e.path = path;
      e.pi = 0;
      scentAlert(e);
      return;
    }
  }

  /** Scent monster AI. Returns the distance it moved this frame. */
  function updateScent(e, dt) {
    const speed = cfg.scentSpeed;
    let moved = 0;

    // 1. Smelling YOU: only while you are smelly, and only within smellRange.
    const smelly = player.smell > 0 && Math.hypot(player.x - e.x, player.y - e.y) <= cfg.smellRange;
    if (smelly) {
      if (e.state !== 'track') {
        e.state = 'track';
        e.why = 'smell'; // tip only (js/feedback.js)
        e.repath = 0;
        e.followTrail = null;
        scentAlert(e);
      }
    } else if (e.state === 'track') {
      // Your smell wore off, or you got far enough away. It has lost you.
      e.state = 'patrol';
      e.path = null;
      e.pause = 0.5;
    }

    // 2. Smelling a TRAIL you left earlier (not while it is smelling you directly).
    if (e.state !== 'track') checkTrailTouch(e);

    // 3. Move.
    if (e.state === 'track') {
      e.repath -= dt;
      if (e.repath <= 0) {
        e.repath = 0.25;
        setPathTo(e, player.x, player.y);
      }
      moved = followPath(e, speed, dt);
    } else if (e.state === 'follow') {
      moved = followPath(e, speed, dt);
      if (!e.path) {
        e.ignoreTrail = e.followTrail;
        e.followTrail = null;
        e.state = 'patrol';
        e.pause = 0.8;
      }
    } else if (e.path) {
      moved = followPath(e, speed * 0.55, dt); // patrol: an unhurried walk
    } else {
      e.pause -= dt;
      if (e.pause <= 0) patrol(e);
    }
    return moved;
  }

  /** Walk to somewhere else in the maze. A scent monster never just stands there. */
  function patrol(e) {
    for (let i = 0; i < 8; i++) {
      const t = randomNearbyTile(e, 10);
      if (t && setPathTo(e, (t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE)) {
        e.pause = 0.4 + Math.random();
        return;
      }
    }
    e.path = null;
    e.pause = 0.5;
  }

  /**
   * You step into a puddle: smelly for smellSeconds of walking (stepping in again just tops it up).
   * Stepping back onto a trail you left does the same thing (see touchOwnTrail), a bit more quietly.
   */
  function stepInPuddle(vol = 1) {
    const fresh = player.smell <= 0;
    player.smell = cfg.smellSeconds;
    audio.splash(fresh ? vol : vol * 0.5);
    marks.push({ x: player.x, y: player.y, t: 0, life: 0.9, c: COLORS[T_PUDDLE], r: 26 });
    if (!fresh) return;
    // a new smell trail begins where you stepped in
    const tr = { pts: [{ x: player.x, y: player.y }], cum: [0], len: 0, active: true };
    level.trails.push(tr);
    player.trail = tr;
  }

  /**
   * Stepping onto a smell trail you left earlier (one that is still there) makes you smelly again,
   * exactly as if you had stepped in a puddle (5 seconds of walking smell; if you are already smelly
   * it tops you back up) - at most once every TRAIL_RESMELL_COOLDOWN seconds. Any part of any
   * finished trail counts, including walking straight back along the one you have just laid.
   * The only exceptions: the trail you are still laying, and the last TRAIL_TIP_GRACE px of the
   * trail you have only just finished (you are standing on its tip the moment your smell runs out,
   * so it would restart at once) until you have stepped off it or moved back along it.
   */
  function touchOwnTrail() {
    let touching = false;
    for (const tr of level.trails) {
      if (tr.active || tr.pts.length < 2) continue;
      const hit = nearestOnTrail(tr, player.x, player.y);
      if (hit.d > TRAIL_STEP_ON) {
        if (tr === player.justLeft) player.justLeft = null; // stepped off it: it counts in full from now on
        continue;
      }
      if (tr === player.justLeft && hit.along > tr.len - TRAIL_TIP_GRACE) continue; // still at the tip you just finished
      touching = true;
    }
    if (!touching || player.trailCd > 0) return;
    player.trailCd = TRAIL_RESMELL_COOLDOWN;
    stepInPuddle(0.75);
  }

  /** While smelly and walking: the smell timer runs and the trail grows behind you. */
  function updateSmell(dt, walked) {
    player.trailCd = Math.max(0, player.trailCd - dt);
    const inside = level.puddles.some((p) => Math.hypot(player.x - p.x, player.y - p.y) < p.r);
    if (inside) {
      if (!player.inPuddle) stepInPuddle(); // just stepped in
      else player.smell = cfg.smellSeconds; // still in it: the smell stays topped up
    }
    player.inPuddle = inside;
    if (level.trails.length) touchOwnTrail(); // smelly or not: a trail you left can (re)smell you
    if (player.smell <= 0) return;
    if (!walked) return; // the smell only wears off while you WALK - standing still never runs it out
    player.smell = Math.max(0, player.smell - dt);
    const tr = player.trail;
    if (tr) {
      const last = tr.pts[tr.pts.length - 1];
      const d = Math.hypot(player.x - last.x, player.y - last.y);
      if (d >= SMELL_TRAIL_STEP || player.smell === 0) {
        if (d > 0.5) {
          tr.pts.push({ x: player.x, y: player.y });
          tr.len += d;
          tr.cum.push(tr.len);
        }
      }
      if (player.smell === 0) {
        // your smell has run out: the trail is finished, and now starts to fade (see TRAIL_LIFETIME)
        tr.active = false;
        tr.expireAt = levelTime + TRAIL_LIFETIME;
        player.trail = null;
        player.justLeft = tr; // you are standing on its tip: that stretch cannot re-smell you until you leave it
      }
    }
  }

  /**
   * Footstep clicks / squelches and the continuous voice of one monster - and, for the Visual cues option, the
   * matching glyphs. Everything in here is sound and drawing only: nothing it computes feeds back into the game.
   *   Muffling: every frame, is a wall or an obstacle between this monster and you? If so its voice and its
   *             footsteps are muffled (a low-pass and a slightly lower gain), and the matching cue is dimmed.
   *   Doppler:  its voice is shifted up while it closes on you and down while it moves away (about +/-6% at most).
   */
  function enemyAudio(e, moved, dt = 0) {
    if (e.kind === 'mimic') return; // disguised: no footsteps, no voice - the only sound it makes is the exit's chime
    if (e.kind === 'alarm') return alarmAudio(e, dt); // (v15.7) its faint hum-tick, until it has screamed
    if (e.kind === 'warden' && e.state !== 'hunt') return; // a Warden still in the stone (levels 15-16) is silent
    const scent = e.kind === 'scent';
    const stalker = e.kind === 'stalker';
    const muffler = e.kind === 'muffler';
    const singer = e.kind === 'singer';
    const warden = e.kind === 'warden';
    const chasing = isChasing(e);
    const cueKind = warden ? 'warden' : stalker ? 'stalker' : scent ? 'scent' : muffler ? 'muffler' : singer ? 'singer' : e.kind === 'screecho' ? 'screecho' : 'echo';
    const blocked = soundBlocked(e.x, e.y, player.x, player.y);
    const muf = audioFx && blocked; // what the audio does about it (?debug can switch the audio effect off; the cue still follows `blocked`)

    // Doppler: how fast is the distance to you changing? (the monster and you both move; standing still or moving sideways gives 0)
    const dNow = Math.hypot(e.x - player.x, e.y - player.y);
    if (dt > 0) {
      if (e.aDist >= 0) e.aVr += ((dNow - e.aDist) / dt - e.aVr) * (1 - Math.exp(-dt / DOPPLER_SMOOTH));
      e.aDist = dNow;
    }
    const doppler = audioFx ? 1 - DOPPLER_MAX * clamp(e.aVr / DOPPLER_FULL_SPEED, -1, 1) : 1; // closing = up, leaving = down

    e.stepDist += moved;
    const stride = warden ? 34 : stalker ? (chasing ? 22 : 19) : scent ? (chasing ? 26 : 22) : chasing ? 24 : 18;
    if (!muffler && !singer && e.stepDist >= stride) {
      // (a muffler's "footsteps" are its slow thumps, below; a singer glides - it is only its hum and its song you hear)
      e.stepDist = 0;
      const sp = spatial(e.x, e.y, warden ? 760 : 540);
      if (warden) {
        // stone coming down on stone - and the upgraded one's steps are heavy enough to feel (none of that in calm mode)
        const heavy = e.variant === 'upgraded';
        audio.wardenStep(sp.pan, sp.g, muf, heavy);
        if (heavy && !calm && sp.g > 0.2) shake = Math.max(shake, 3.2 * sp.g);
      } else if (stalker) audio.stalkerStep(sp.pan, sp.g, muf);
      else if (scent) audio.scentStep(sp.pan, sp.g, muf);
      else audio.enemyStep(sp.pan, sp.g, muf);
      if (sp.g >= 0.01) cues.pulse(cueKind, e.x, e.y, cueLoud(sp.g), { key: e, sub: 'step', dots: 2, muffled: blocked });
    }

    if (muffler) {
      // slow, dull thumps (with the humming voice below): quicker while it is on your trail, and wall-muffled like every voice
      e.clickCd -= dt;
      if (e.clickCd <= 0) {
        e.clickCd = chasing ? 0.7 : 1.35;
        const sc = spatial(e.x, e.y, 620);
        audio.mufflerThump(sc.pan, sc.g, muf);
        if (sc.g >= 0.01) cues.pulse('muffler', e.x, e.y, cueLoud(sc.g), { key: e, sub: 'thump', muffled: blocked });
      }
    }

    if (stalker) {
      // its own voice: breathing (below) and soft clicks - quicker while it is on your trail - and never a growl
      e.clickCd -= dt;
      if (e.clickCd <= 0) {
        e.clickCd = (chasing ? 0.5 : 1.3) + Math.random() * (chasing ? 0.7 : 1.7);
        const sc = spatial(e.x, e.y, 600);
        audio.stalkerClick(sc.pan, sc.g, muf);
        if (sc.g >= 0.01) cues.pulse('stalker', e.x, e.y, cueLoud(sc.g), { key: e, sub: 'click', dots: 1, muffled: blocked });
      }
    }

    const sp = spatial(e.x, e.y, warden ? 950 : 720); // (a Warden can be heard coming from further off)
    const excited = chasing || e.state === 'marked' || e.state === 'leap'; // hunting you / a singer with you marked
    const mood = excited ? 1 : e.state === 'search' ? 0.65 : e.sleeper ? 0.1 : scent || stalker || singer ? 0.5 : muffler ? 0.4 : 0.35;
    const gain = sp.g * (0.16 + 0.3 * mood) * (e.hush === undefined ? 1 : e.hush); // (v18.2: 25's Warden, falling silent at the edge)
    if (e.voice) audio.updateEnemyVoice(e.voice, { gain, pan: sp.pan, mood, muffle: muf, doppler });
    // its voice as a sustained cue, while it would be audible (the stalker's breathing: three small dots)
    if (gain >= 0.012) cues.hold(e, cueKind, e.x, e.y, cueLoud(gain / 0.46), blocked, stalker ? 3 : 1);
  }

  // ------------------------------------------------- the Alarm and the Screecho (v15.7, unreleased)
  const ALARM_HUM_GAP = 1.15; // seconds between the ticks of an Alarm's hum
  const ALARM_HUM_RANGE = 520; // px: how far off its hum can be heard (a quiet sound: you have to be listening)
  let screamLog = []; // ?debug only: every scream this level - who, where you were, and when

  /**
   * An Alarm that has not screamed yet hums: a faint, regular tick, placed and wall-muffled like any monster's
   * sound - so a careful player can hear where it is before they ping it - and its own glyph in the Visual cues.
   * Once it has screamed it is silent for good.
   */
  function alarmAudio(e, dt) {
    if (e.spent) return;
    e.humCd -= dt;
    if (e.humCd > 0) return;
    e.humCd = ALARM_HUM_GAP;
    const blocked = soundBlocked(e.x, e.y, player.x, player.y);
    const sp = spatial(e.x, e.y, ALARM_HUM_RANGE);
    audio.alarmHum(sp.pan, sp.g, audioFx && blocked);
    if (sp.g >= 0.01) cues.pulse('alarm', e.x, e.y, cueLoud(sp.g), { key: e, sub: 'hum', muffled: blocked });
  }

  /**
   * THE SCREAM - an Alarm's (once, when the wave of a ripple first reaches it) or a Screecho's (whenever the wave
   * reaches it and it has got its breath back). Every monster in the level EXCEPT the Warden - both kinds - and
   * other Alarms is sent to the spot where YOU are at this instant, however far away it is. The spot is fixed: it
   * does not follow you afterwards. Each goes there the way it would go to a ripple: an echo monster (and a
   * Screecho, and a mimic, whose disguise breaks) walks to it and listens there (alertEnemy -> search); the kinds
   * that never stand still walk to it, wait there for the same listening time and go back to their round
   * (summon -> updateSummoned). One held by a sonar decoy stays held; one already tracking you keeps tracking you
   * (it knows better, as with a ripple).
   */
  function scream(src) {
    const x = player.x;
    const y = player.y;
    const screecho = src.kind === 'screecho';
    const sp = spatial(src.x, src.y, 1600);
    const loud = Math.max(sp.g, 0.4); // it is a scream: you hear it wherever you are
    audio.scream(sp.pan, loud, screecho);
    cues.pulse(src.kind, src.x, src.y, cueLoud(loud), { big: true, key: src, sub: 'scream' });
    marks.push({ x: src.x, y: src.y, t: 0, life: 1.6, c: COLORS[screecho ? T_SCREECHO : T_ALARM], r: 70 });
    if (!calm) shake = Math.max(shake, 5);
    let sent = 0;
    for (const e of enemies) {
      if (e.kind === 'warden' || e.kind === 'alarm') continue;
      if (summon(e, x, y)) sent++;
    }
    if (screecho) src.screamCd = SCREECHO_COOLDOWN;
    // (last, so the screeches of the monsters it has just sent do not cover it: this is the sound that matters)
    cues.caption(screecho ? '[a shrieking howl]' : '[an alarm shrieks]');
    screamLog.push({ by: src.kind, x, y, at: levelTime, sent });
  }

  /** Send one monster to (x, y) because of a scream. Returns whether it went. */
  function summon(e, x, y) {
    if (e.state === 'lured' || e.state === 'trapped') return false; // a decoy's hold wins
    if (e.kind === 'singer' && (e.state === 'leap' || e.state === 'land')) return false; // in the air: it lands first
    if (e.kind === 'mimic') revealMimic(e); // the scream breaks its disguise: it is an echo monster from now on
    if (e.kind === 'echo' || e.kind === 'screecho') {
      if (e.state === 'track') return false; // it already has you
      const before = e.state;
      alertEnemy(e, x, y);
      if (e.state !== 'hunt') return false;
      if (before !== 'hunt' || e.why === 'ripple') e.why = 'scream'; // (the tip only)
      return true;
    }
    if (!setPathTo(e, x, y)) return false;
    e.state = 'summoned';
    e.timer = cfg.searchTime; // how long it waits at the spot - an echo monster's listening time
    e.followTrail = null;
    e.ignoreTrail = null;
    e.why = 'scream';
    return true;
  }

  /** A monster a scream sent: walk to the spot, wait there, then back to its round (as a decoy's release does). */
  function updateSummoned(e, dt) {
    if (e.path) return followPath(e, speedOf(e), dt);
    e.timer -= dt;
    if (e.timer <= 0) releaseLured(e);
    return 0;
  }

  // ---------------------------------------------------------------- ripples
  /**
   * How far the player's next ripple reaches, in px from where it is sent. It is a hard limit:
   * nothing beyond it is seen, echoes or alerted by that ripple. The base value comes from the
   * level and difficulty mode (levelConfig().rippleRadius); tools / upgrades will change it here.
   */
  function rippleRange() {
    return cfg.rippleRadius;
  }

  function emitRipple() {
    if (state !== 'play' || cooldown > 0 || scriptLock || a2Falling || levelFlag('noRipple')) return; // (a scripted beat on 14-16 has the controls; v18.0: nor while you fall; v19.0: nor where a level has no ripple)
    if (crouchHeld()) return; // you cannot send a ripple while crouching
    cooldown = cfg.cooldown;
    ripplesUsed++;
    if (scored()) EchoProfile.bump('ripples');
    glimmerOff = false; // a fresh ripple: the exit's glimmer that crouching wiped can show again
    castRipple(player.x, player.y, rippleRange());
    ripples[ripples.length - 1].mine = true; // (v21.0) yours: drawn in your cosmetics (drawRipple) - nothing reads it but the drawing
    audio.ping();
    if (level.act2) act2Ping(player.x, player.y); // (v17.0: 18 - the sliding walls in range grind, and move)
    if (level.story) story.onPing(); // (v17.0: 17 - the first one stutters)
    // (LEVEL 13: a ripple the player sends is an ordinary ripple and nothing more. The capture is not
    //  listening for one - walking into the great room is what sets it off. See wardenGasp below.)
  }

  /**
   * LEVEL 13. The player has just walked into the great room, and a ripple goes out whether they wanted one
   * or not: a flinch, not a decision. It ignores the recharge and a held crouch, because it is not something
   * the player did - and for the same reason it is not counted as one of their ripples.
   */
  function wardenGasp() {
    if (state !== 'play' || !level || !level.warden) return;
    glimmerOff = false;
    castRipple(player.x, player.y, rippleRange());
    audio.gasp();
    cues.caption('[you flinch]');
    warden.onRipple(ripples[ripples.length - 1]);
  }

  /**
   * The wave has reached the warden. Every ray of THIS ripple that came back as stone is the warden's colour
   * from this instant - the same trick the mimic's reveal plays (revealMimic), and for the same reason: what
   * lit up was always there, and only the reading of it has changed.
   */
  function litByWarden(rp) {
    for (let j = 0; j < RAYS; j++) {
      const id = rp.hitId[j];
      if (id >= 0 && rp.circles[id].warden) rp.type[j] = T_WARDEN;
    }
    for (const c of rp.circles) if (c.warden) c.type = T_WARDEN;
    for (let i = rp.ei; i < rp.echoes.length; i++) if (rp.echoes[i].warden) rp.echoes[i].type = T_WARDEN;
  }

  // ----------------------------------------------- ACT 2 (v17.0): levels 17-20 (js/story.js)
  /**
   * THE BROKEN GAOL. Each of these levels breaks ONE rule of the maze, and everything for it is here, behind
   * `level.act2` (built by js/story.js) - so not one line of it runs on levels 0-16 or a custom level.
   *   17 THE LIAR    ghost walls (the ripple draws them, they are not there: walk into one and it comes apart) and
   *                  hidden walls (there, and never drawn - until you bump one: a thunk, and it shows from then on).
   *                  Footsteps, bumps and monsters still tell the truth. (castRipple reads level.rayWalls.)
   *   18 THE SHUFFLE every ping of yours sends each sliding wall within range to its other place - it grinds first,
   *                  then moves (SLIDE_DELAY), and never onto anyone. Nothing random: two pings and it is back.
   *   19 THE LOOP    folds, in pairs: step onto one and you are on its pair; your waves go through too.
   *   20 THE ECHO BEHIND  the ripple, slowed and shown late (level.rippleScale / rippleLag, read by castRipple,
   *                  updateRipples and drawRipple); monsters' own sounds are as instant as ever.
   */
  const SLIDE_DELAY = 0.55; // s from the grinding starting to the wall moving: long enough to hear it coming
  let foldSpawns = []; // waves still to come out of a fold: { at, x, y, R }
  let a2Flashes = []; // tiles just found out: { i, t, kind: 'hidden' | 'ghost' }
  let foldArmed = true; // a fold you have just come out of does not take you back until you have stepped off it
  let foldHome = -1;
  const tileMid = (i) => ({ x: ((i % level.W) + 0.5) * TILE, y: (Math.floor(i / level.W) + 0.5) * TILE });
  /** Is a circle overlapping tile i? */
  function circleOnTile(c, r, i) {
    const tx = i % level.W;
    const ty = Math.floor(i / level.W);
    const nx = clamp(c.x, tx * TILE, tx * TILE + TILE);
    const ny = clamp(c.y, ty * TILE, ty * TILE + TILE);
    return (c.x - nx) * (c.x - nx) + (c.y - ny) * (c.y - ny) < r * r;
  }
  /** 18: your ping - every sliding wall in range starts to grind, and moves a moment later. */
  function act2Ping(ox, oy) {
    const a2 = level.act2;
    for (const sl of a2.slides) {
      if (sl.pending !== null || Math.hypot(sl.x - ox, sl.y - oy) > a2.slideRange) continue;
      sl.pending = levelTime + SLIDE_DELAY;
      const sp = spatial(sl.x, sl.y, 700);
      audio.stoneGrind(sp.pan, Math.max(0.25, sp.g) * 0.7);
      cues.pulse('muffler', sl.x, sl.y, Math.max(0.3, sp.g), { key: 'slide' + sl.a, big: true });
    }
  }
  /** After you have moved: a ghost wall you walked into comes apart; a hidden wall you bumped shows; a fold takes you. */
  function act2Touch() {
    const a2 = level.act2;
    for (const g of a2.ghosts) {
      if (g.gone || !circleOnTile(player, player.r, g.i)) continue;
      g.gone = true;
      level.rayWalls[g.i] = 0; // nothing there now, to the ripple either
      audio.loreStatic();
      cues.caption('[a glitch]');
      a2Flashes.push({ i: g.i, t: 0, kind: 'ghost' });
    }
    for (const h of a2.hidden) {
      if (h.shown || !circleOnTile(player, player.r + 1.5, h.i)) continue;
      h.shown = true;
      level.rayWalls[h.i] = 1; // from now on the ripple finds it too
      const c = tileMid(h.i);
      const sp = spatial(c.x, c.y, 400);
      audio.wardenStep(sp.pan, 0.55, false, true); // a dull thunk: stone where there was nothing
      cues.caption('[a dull thunk]');
      a2Flashes.push({ i: h.i, t: 0, kind: 'hidden' });
    }
    if (a2.folds.length) {
      const ti = Math.floor(player.y / TILE) * level.W + Math.floor(player.x / TILE);
      if (!foldArmed && ti !== foldHome) foldArmed = true;
      const to = a2.foldPair[ti];
      if (foldArmed && to !== undefined) {
        const c = tileMid(to);
        player.x = c.x;
        player.y = c.y;
        camX = c.x;
        camY = c.y;
        foldArmed = false;
        foldHome = to;
        audio.singerWhoosh(0, 0.5);
        cues.caption('[a rush of air]');
        story.flicker();
      }
    }
  }
  function act2Update(dt) {
    const a2 = level.act2;
    for (const sl of a2.slides) {
      if (sl.pending === null || levelTime < sl.pending) continue;
      sl.pending = null;
      const from = sl.on ? sl.b : sl.a;
      const to = sl.on ? sl.a : sl.b;
      const sp = spatial(sl.x, sl.y, 700);
      // never onto anyone: a wall that would land on you or a monster stays where it is (and you hear it catch)
      if (circleOnTile(player, player.r, to) || enemies.some((e) => circleOnTile(e, e.r, to))) {
        audio.bump(Math.max(0.2, sp.g));
        continue;
      }
      level.walls[from] = 0;
      level.blocked[from] = 0;
      level.walls[to] = 1;
      level.blocked[to] = 1;
      sl.on ^= 1;
      audio.wardenStep(sp.pan, Math.max(0.2, sp.g) * 0.6, false, true); // it settles
      cues.caption('[stone grinds into place]');
    }
    for (let k = foldSpawns.length - 1; k >= 0; k--) {
      const fs_ = foldSpawns[k];
      if (levelTime < fs_.at) continue;
      foldSpawns.splice(k, 1);
      if (fs_.R > TILE) castRipple(fs_.x, fs_.y, fs_.R, { fold: true });
    }
    for (const fl of a2Flashes) fl.t += dt;
    a2Flashes = a2Flashes.filter((fl) => fl.t < 1.6);
  }
  /** World space: a hidden wall's outline as it is found, and a ghost wall's coming apart. */
  function act2Draw() {
    if (!a2Flashes.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const fl of a2Flashes) {
      const tx = (fl.i % level.W) * TILE;
      const ty = Math.floor(fl.i / level.W) * TILE;
      const a = 1 - fl.t / 1.6;
      if (fl.kind === 'hidden') {
        ctx.strokeStyle = `rgba(${COLORS[T_WALL]},${0.8 * a})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(tx + 2, ty + 2, TILE - 4, TILE - 4);
      } else {
        // a ghost wall: a few short shards of its outline, drifting apart
        ctx.strokeStyle = `rgba(${COLORS[T_WALL]},${0.55 * a})`;
        ctx.lineWidth = 1.4;
        const sp = 1 + fl.t * 14;
        ctx.beginPath();
        for (let q = 0; q < 4; q++) {
          const cx = tx + TILE / 2 + (q % 2 ? sp : -sp);
          const cy = ty + TILE / 2 + (q < 2 ? -sp : sp);
          ctx.moveTo(cx - 8, cy);
          ctx.lineTo(cx + 8, cy);
        }
        ctx.stroke();
      }
    }
  }

  // ----------------------------------------------- ACT 2 PART 2 (v18.0): levels 21-24 (js/story.js)
  /**
   * THE VOID IS REAL. Everything here is behind `level.act2` and its new parts (voidGrid, crumbles, dead, creep), so
   * none of it runs on levels 0-20 or a custom level:
   *   THE VOID     a tile whose floor is gone (voidGrid). Step onto it - your centre over it - and you fall: a fall
   *                that never lands, then the Caught screen ('void'). A monster that is over it falls too, and is gone
   *                for this attempt. Monsters never walk onto it (or onto crumbling floor) on purpose: it is `blocked`.
   *   21 THE CRUMBLE  crumbling floor holds you; CRUMBLE_CRACK s after you step OFF it, it cracks, and CRUMBLE_FALL
   *                later it falls into the void. There is no way back over it.
   *   22 DEAD AIR  a ray that reaches it from outside goes in and never comes back (nothing drawn, no echo, nothing in
   *                it touched); what is left on the map is a quiet black patch. Your footsteps in it are lost - nothing
   *                hears them - and a ripple you send from inside it does not set an Alarm off.
   *   23 THE CREEP the void eats the map from the edges in, a ring at a time, on the level's fixed schedule.
   *   24 THE WRONG WAY OUT  its first way out leads to its second part (levelPart 2): Try again restarts THAT part,
   *                anything else (Continue, the level list, a reload) starts the level from the beginning. Nothing
   *                is saved until the second part's way out.
   */
  /** (v19.0) A per-level flag (a story level's `flags`, js/story.js): daylight, noRipple, noCrouch, noHud, movementOnly (v19.3: interact). */
  const levelFlag = (k) => !!(level && level.flags && level.flags[k]);
  const MOVE_ACTIONS = ['up', 'down', 'left', 'right'];
  /**
   * (v19.0) A level's name on screen. 1-25 are "Level N"; from 26 on it is the outside, and each outside level has a
   * name of its own (v19.1) - the next one is just the next name in OUTSIDE_NAMES. (Past the end of the list:
   * "Outside N".) The internal numbers (saves, progress) never change: only what is shown.
   */
  const OUTSIDE_FIRST = 26;
  const OUTSIDE_NAMES = ['First Breath', 'Fresh Air', 'Dusk', 'Open Ground', 'Same Sky', 'The Wall']; // 26, 27, 28 (v19.3), and the names kept for what comes after
  const levelName = (n) => (n >= OUTSIDE_FIRST ? OUTSIDE_NAMES[n - OUTSIDE_FIRST] || `Outside ${n - OUTSIDE_FIRST + 1}` : `Level ${n}`);
  const levelShort = (n) => (n >= OUTSIDE_FIRST ? levelName(n) : `Lv ${n}`);
  const levelLower = (n) => (n >= OUTSIDE_FIRST ? levelName(n) : `level ${n}`); // (inside a sentence)
  const CRUMBLE_CRACK = 0.6; // s after you step off a crumbling tile: it cracks...
  const CRUMBLE_FALL = 0.35; // ...and this much later it is gone
  const FALL_SECONDS = 0.8; // s of falling before the Caught screen
  let levelPart = 1; // 24: which part of it is being played
  let nextPartPending = false;
  let a2Falling = null; // you are falling: { t }
  let a2Tile = -1; // the tile you were last on (21)
  let deadSeen = new Map(); // 22: tile -> when a ray reached it (the black patch on the map)
  let crumbleLit = new Map(); // 21: crumbling tile -> when a ripple reached it
  let a2CreepNext = 0; // 23: the next ring to go
  const tileAt = (x, y) => Math.floor(y / TILE) * level.W + Math.floor(x / TILE);
  const onDeadAir = () => !!(level.act2 && level.act2.dead && level.act2.dead[tileAt(player.x, player.y)]);
  /** The floor under (x, y) is gone. */
  const overVoid = (x, y) => !!(level.act2 && level.act2.voidGrid && level.act2.voidGrid[tileAt(x, y)]);
  /** You step into the void: a fall that never lands, and then the Caught screen. */
  function fallIntoVoid() {
    if (a2Falling) return;
    a2Falling = { t: 0 };
    touch.releaseAll();
    audio.voidFall(0, 0.9, level.act2.void);
    cues.caption('[you fall]');
  }
  /** A monster over the void falls, from where it was, and is gone for this attempt. */
  function monsterFalls(e) {
    const sp = spatial(e.x, e.y, 1100);
    audio.voidFall(sp.pan, Math.max(0.25, sp.g) * 0.7, level.act2.void);
    cues.pulse('muffler', e.x, e.y, cueLoud(Math.max(0.3, sp.g)), { key: e, big: true });
    cues.caption('[something falls into the void]');
    audio.destroyEnemyVoice(e.voice);
    e.voice = null;
    enemies.splice(enemies.indexOf(e), 1);
  }
  /** A tile's floor is gone (21's crumbling floor, 23's rings). A wall there is gone too. */
  function becomeVoid(i) {
    const a2 = level.act2;
    a2.voidGrid[i] = 1;
    level.walls[i] = 0;
    level.blocked[i] = 1;
    if (level.rayWalls) level.rayWalls[i] = 0;
  }
  /** After you have moved: 21 - stepping off a crumbling tile starts it going; and the void under you. */
  function voidTouch() {
    const a2 = level.act2;
    const ti = tileAt(player.x, player.y);
    if (a2.crumbles.length && ti !== a2Tile) {
      const prev = a2.crumbles.find((c) => c.i === a2Tile);
      if (prev && prev.state === 0) {
        prev.state = 1;
        prev.at = levelTime + CRUMBLE_CRACK;
      }
      a2Tile = ti;
    }
    if (a2.voidGrid[ti]) fallIntoVoid();
  }
  function voidUpdate(dt) {
    const a2 = level.act2;
    for (const c of a2.crumbles) {
      if (c.state === 0 || c.state === 3 || levelTime < c.at) continue;
      const m = tileMid(c.i);
      const sp = spatial(m.x, m.y, 800);
      if (c.state === 1) {
        c.state = 2;
        c.at = levelTime + CRUMBLE_FALL;
        audio.stoneSplit(sp.pan, Math.max(0.3, sp.g) * 0.45); // it cracks
        cues.pulse('muffler', m.x, m.y, cueLoud(Math.max(0.3, sp.g)), { key: 'crumble' + c.i });
        cues.caption('[stone cracks]');
      } else {
        c.state = 3;
        becomeVoid(c.i);
        audio.voidFall(sp.pan, Math.max(0.2, sp.g) * 0.4, a2.void); // ...and falls away, and never lands
        cues.caption('[it falls away]');
      }
    }
    // 23: the next ring goes - a low rumble, a little shake
    const cr = a2.creep;
    while (cr && a2CreepNext < cr.layers.length && levelTime >= cr.layers[a2CreepNext].t + (cr.relative ? cr.base : 0)) {
      for (const i of cr.layers[a2CreepNext++].tiles) becomeVoid(i);
      audio.stoneGrind(0, 0.4);
      audio.wardenStep(0, 0.5, false, true);
      cues.pulse('muffler', player.x, player.y, 0.6, { key: 'creep', big: true });
      cues.caption('[the edge gives way]');
      if (!calm) shake = Math.max(shake, 3);
    }
    // anything over the void falls
    for (let k = enemies.length - 1; k >= 0; k--) if (overVoid(enemies[k].x, enemies[k].y)) monsterFalls(enemies[k]);
    if (overVoid(player.x, player.y)) fallIntoVoid();
    if (a2Falling) {
      a2Falling.t += dt;
      if (a2Falling.t >= FALL_SECONDS && state === 'play') {
        a2Falling = null;
        onCaught('void', 'fell', null);
      }
    }
  }
  /** World space: 21's crumbling floor where a ripple found it (and cracking), 22's black patches. */
  function voidDraw() {
    const a2 = level.act2;
    if (a2.crumbles.length) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 1.3;
      for (const c of a2.crumbles) {
        if (c.state === 3) continue;
        const lit = crumbleLit.get(c.i);
        let a = lit !== undefined && levelTime >= lit ? Math.exp(-(levelTime - lit) / 1.3) * 0.7 : 0;
        if (c.state === 2) a = Math.max(a, 0.55 + 0.25 * Math.sin(levelTime * 40)); // cracking: you can see it go
        if (c.i === tileAt(player.x, player.y)) a = Math.max(a, 0.22); // the one under your feet: you feel it
        if (a < 0.02) continue;
        const tx = (c.i % level.W) * TILE;
        const ty = Math.floor(c.i / level.W) * TILE;
        const jit = c.state === 2 && !calm ? (Math.sin(levelTime * 53 + c.i) * 1.2) : 0;
        ctx.strokeStyle = `rgba(${COLORS[T_WALL]},${a})`;
        ctx.beginPath();
        // a fixed little web of cracks for each tile (from its number - never a random draw)
        let h = (c.i * 2654435761) >>> 0;
        const r = () => ((h = (h * 1103515245 + 12345) >>> 0) % 1000) / 1000;
        for (let q = 0; q < 3; q++) {
          let x = tx + 6 + r() * 28 + jit;
          let y = ty + 6 + r() * 28;
          ctx.moveTo(x, y);
          for (let w = 0; w < 3; w++) {
            x = clamp(x + (r() - 0.5) * 18, tx + 2, tx + TILE - 2);
            y = clamp(y + (r() - 0.5) * 18, ty + 2, ty + TILE - 2);
            ctx.lineTo(x, y);
          }
        }
        ctx.strokeRect(tx + 3 + jit, ty + 3, TILE - 6, TILE - 6);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (deadSeen.size) {
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = 1;
      for (const [i, at] of deadSeen) {
        const age = levelTime - at;
        if (age < 0) continue;
        if (age > 4) {
          deadSeen.delete(i);
          continue;
        }
        const a = Math.exp(-age / 1.6);
        const tx = (i % level.W) * TILE;
        const ty = Math.floor(i / level.W) * TILE;
        ctx.fillStyle = `rgba(0,0,0,${0.9 * a})`;
        ctx.fillRect(tx, ty, TILE, TILE);
        ctx.strokeStyle = `rgba(150,160,178,${0.32 * a})`;
        ctx.strokeRect(tx + 1.5, ty + 1.5, TILE - 3, TILE - 3);
      }
      ctx.setLineDash([]);
    }
  }

  // ---------------------------------------------------- levels 14-16 (js/story.js)
  /** What is solid on a story level besides the walls: the gaol door while it is shut, and a Warden still asleep. */
  const solidsBuf = [];
  function storySolids() {
    solidsBuf.length = 0;
    const st = level.story;
    if (st.door && st.door.solid) for (const q of st.door.parts) solidsBuf.push(q);
    for (const e of enemies) if (e.kind === 'warden' && e.state === 'dormant') solidsBuf.push(e);
    return solidsBuf;
  }

  /**
   * Everything that can be seen from (x, y), as a polygon of points (x0, y0, x1, y1, ...): where a ray in each
   * direction first meets a wall. Level 15's light is clipped to it, so it can never be drawn anywhere a wall
   * stands between it and the player. Drawing only.
   */
  const VIS_RAYS = 360;
  const visBuf = new Float32Array(VIS_RAYS * 2);
  function visibleFrom(x, y) {
    for (let i = 0; i < VIS_RAYS; i++) {
      const a = (i / VIS_RAYS) * TAU;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const d = raycastWall(x, y, dx, dy, 1100);
      visBuf[2 * i] = x + dx * d;
      visBuf[2 * i + 1] = y + dy * d;
    }
    return visBuf;
  }

  /**
   * A drop of water (levels 14 and 16): a small ripple of its own from where it lands - a real one, through the
   * same castRipple as yours, lighting the stone, the bars and the key the same way - and its sound and cue.
   * It is not YOURS: it alerts nothing, it makes no echoes, and crouching does not wipe it (like a singer's).
   */
  function drip(x, y, R, metal) {
    castRipple(x, y, R, { ambient: true });
    const sp = spatial(x, y, 560);
    const blocked = soundBlocked(x, y, player.x, player.y);
    if (metal) audio.dripMetal(sp.pan, sp.g, audioFx && blocked);
    else audio.drip(sp.pan, sp.g, audioFx && blocked);
    if (sp.g >= 0.02) {
      cues.pulse('drip', x, y, cueLoud(sp.g), { muffled: blocked });
      if (metal) cues.caption('[water rings on metal]');
    }
  }

  /**
   * THE WARDEN, HUNTING (levels 15 and 16). What every variant does, whatever its abilities: it ALWAYS knows
   * exactly where the player is - ripples, footsteps, smell, crouching, a muffler's shadow and the sonar decoy
   * hide nothing from it and distract it from nothing - and it walks the shortest way there, re-planned every
   * frame, at its variant's speed (a fraction of the player's own: WARDEN_SPEED / WARDEN_UPGRADED_SPEED in
   * js/level.js). Its abilities (js/warden.js) get their hooks at fixed points; neither Warden has any yet.
   */
  function wardenApi(e) {
    return { player, dist: Math.hypot(player.x - e.x, player.y - e.y), levelTime, calm, setPathTo, followPath };
  }

  function wakeWarden(e, why) {
    e.state = 'hunt';
    e.why = why; // the Caught screen's tip only (js/feedback.js): 'hunt' on level 15, 'upgraded' on 16
    e.hidden = false;
    e.held = false;
    if (!e.voice && audio.ready) e.voice = audio.createEnemyVoice(e.pitch, 'warden');
    for (const ab of e.abilities) if (ab.start) ab.start(e, wardenApi(e));
  }

  function updateWardenHunt(e, dt) {
    if (e.state !== 'hunt' || e.held) return 0; // asleep in the stone, or the level is over
    const api = e.abilities.length ? wardenApi(e) : null;
    for (const ab of e.abilities) if (ab.update) ab.update(e, dt, api);
    let speed = e.speed;
    for (const ab of e.abilities) if (ab.speed) speed = ab.speed(e, speed, api);
    setPathTo(e, player.x, player.y); // it knows where you are, every frame, wherever that is
    return followPath(e, speed, dt);
  }

  /** A story level's way out has been walked through and its last beat played: on to the next, or the end. */
  function onStoryCleared() {
    if (state !== 'play') return;
    const n = levelNum;
    const newBest = saveBest(n + 1);
    EchoProfile.addClear(mode);
    EchoProfile.flush();
    if (n < STORY_LAST) {
      savedPending = newBest; // said at the next level's first quiet moment, not in the middle of the dark
      // (v18.0) a monster's scene before the next level plays here as it does from Next level (advanceLevel): 21 -> 22
      const scene = SCENE_BEFORE_LEVEL[n + 1];
      if (scene) {
        story.stop(); // (the void's hum and the rest of this level's sound end with it)
        startCutscene(scene);
      } else startLevel(n + 1);
      return;
    }
    onStoryEnd(newBest);
  }

  // ---------------------------------------------------------------- crouching
  /** Is a crouch key (Shift) held? Same speed as walking; no footsteps, no ripples, and a stalker cannot hear you. */
  const crouchHeld = () => !levelFlag('noCrouch') && (act('crouch') || touch.crouch); // a crouch key (Shift by default), or the touch CROUCH button held (v19.0: never where a level has no crouch)

  /**
   * The instant you start crouching, everything your ripples showed you is wiped from the screen and from the
   * air: waves still travelling (and the echoes they have not returned yet, so their sounds never play), every
   * timed mark (walls, obstacles, monsters, puddles, the decoy) and the exit's glimmer. Standing up does not
   * bring any of it back; only a NEW ripple shows anything again. (The glimmer is a proximity effect drawn
   * every frame, so wiping it is a flag - `glimmerOff` - that the next ripple clears.)
   */
  function startCrouch() {
    // Only what YOUR ripples showed is wiped. A singer's waves are not yours: crouching does not stop them, so they keep
    // travelling (and can still mark you), and what they lit stays.
    ripples = ripples.filter((rp) => rp.singer || rp.ambient); // (and a drop of water's is not yours either: levels 14 and 16)
    marks = marks.filter((m) => m.singer || m.ambient);
    glimmerOff = true;
    if (scored()) EchoProfile.bump('crouches'); // stats: counted only, never read back by the game
  }

  /** Bring `player.crouching` in line with the key. Called every frame, and straight from the key press so the wipe is instant. */
  function syncCrouch() {
    if (state !== 'play' || !player || scriptLock) return;
    const now = crouchHeld();
    if (now === !!player.crouching) return;
    player.crouching = now;
    if (now) startCrouch();
    updateHud();
  }

  /**
   * Fire a ripple of reach R (px) from (ox,oy) into the current level (also used by the cutscenes).
   * `opts` (optional):
   *   singer      a singer's OWN ripple (the enemy that sang it, or `true` in a cutscene): magenta, silent (its sung tone is
   *               played by the caller), and it lights things up but alerts nothing and is not your sonar (crouching does not
   *               wipe it); the singer itself is not part of its own wave
   *   absorbers   extra invisible absorbers [{x, y, r}] (the muffler scene of the cutscenes); the real muffler is found in `enemies`
   * A MUFFLER absorbs ripples: a ray that reaches one simply ENDS there - no echo, no colour, no sound - so the muffler is
   * never lit and everything behind it is in shadow (the gap in the echo map is the only tell).
   */
  function castRipple(ox, oy, R = cfg.rippleRadius, opts = null) {
    const singerRp = opts && opts.singer ? opts.singer : null;
    // a drop of water's ripple (levels 14 and 16): not yours, so it alerts nothing and makes no echoes of its own
    const ambient = !!(opts && opts.ambient);
    // (v17.0) LEVEL 20: the ripple travels at a fraction of its speed, and what it finds is shown late. Everywhere
    // else these are RIPPLE_SPEED and 0, and every number below comes out exactly as it always has.
    const v = level.rippleScale ? RIPPLE_SPEED * level.rippleScale : RIPPLE_SPEED;
    const lag = level.rippleLag || 0;

    // Round things the wave can bounce off (and the absorbers it cannot get past).
    const circles = [];
    level.obstacles.forEach((o) => {
      if (Math.hypot(o.x - ox, o.y - oy) < R + o.r) circles.push({ x: o.x, y: o.y, r: o.r, type: T_OBSTACLE, bar: o.bar }); // (bar: level 14's cell fronts)
    });
    enemies.forEach((e) => {
      if (e === singerRp) return; // a singer's own wave starts inside it: it is not part of it
      // a ripple SEES a scent monster (violet), a stalker (orange) and a singer (magenta) but only an echo monster (red)
      // learns of you from it; a disguised mimic is seen as an EXIT (green, with the exit's bell) until the wave touches
      // it; a muffler is not seen at all - it eats the ray
      if (Math.hypot(e.x - ox, e.y - oy) < R + e.r) {
        if (e.kind === 'muffler') {
          circles.push({ x: e.x, y: e.y, r: e.r, type: 0, absorb: true });
          return;
        }
        if (e.kind === 'warden') {
          // LEVELS 15-16: a hunting Warden. One that has not shown itself yet is STONE to a ripple - the wall's
          // colour, texture and echo, exactly the trick level 13 plays - until the moment it does (litByWarden).
          circles.push({ x: e.x, y: e.y, r: e.r, type: e.hidden ? T_WALL : T_WARDEN, enemy: e, warden: !!e.hidden });
          return;
        }
        const type = e.kind === 'scent' ? T_SCENT : e.kind === 'stalker' ? T_STALKER : e.kind === 'singer' ? T_SINGER : e.kind === 'mimic' ? T_EXIT : e.kind === 'alarm' ? T_ALARM : e.kind === 'screecho' ? T_SCREECHO : T_ENEMY;
        circles.push({ x: e.x, y: e.y, r: e.r, type, enemy: e, mimic: e.kind === 'mimic' }); // (mimic: drawn as the exit until revealMimic sets revealAt)
      }
    });
    if (opts && opts.absorbers) {
      for (const a of opts.absorbers) if (Math.hypot(a.x - ox, a.y - oy) < R + a.r) circles.push({ x: a.x, y: a.y, r: a.r, type: 0, absorb: true });
    }
    // LEVEL 13: the warden. Until a ripple has revealed it, every ray that reaches it comes back as STONE - the
    // wall's colour, the wall's stone texture and the wall's echo - so there is nothing whatever to tell it
    // apart from the room's own far wall. After the reveal the very same rays become its own (litByWarden).
    if (level.warden) {
      const wt = level.warden.revealed ? T_WARDEN : T_WALL;
      for (const c of level.warden.circles) {
        if (Math.hypot(c.x - ox, c.y - oy) < R + c.r) circles.push({ x: c.x, y: c.y, r: c.r, type: wt, warden: true });
      }
    }
    // LEVEL 14: the gaol door, while it is shut - the way out, in the way out's colour, with the way out's bell.
    // It is a slab across its doorway (three overlapping circles); all three are one door to the echo.
    const st = level.story;
    if (st && st.door && st.door.solid) {
      st.door.parts.forEach((q, i) => {
        if (Math.hypot(q.x - ox, q.y - oy) < R + q.r) circles.push({ x: q.x, y: q.y, r: q.r, type: T_EXIT, door: st.door, doorArt: i === 1 });
      });
    }
    // The way out - every one of them on a custom level (v15.1); a LOCKED one is a door, drawn as level 14's
    // gaol door (`lockedExit`), in the way out's colour and with its bell, until the key opens it.
    for (const ex of exitsOf()) {
      if (Math.hypot(ex.x - ox, ex.y - oy) < R + ex.r) circles.push(ex.locked ? { x: ex.x, y: ex.y, r: ex.r, type: T_EXIT, lockedExit: ex } : { x: ex.x, y: ex.y, r: ex.r, type: T_EXIT });
    }

    const dist = new Float32Array(RAYS);
    const type = new Uint8Array(RAYS);
    const hitId = new Int16Array(RAYS).fill(-1);
    // (v18.0) 22: dead air. From outside, a ray that reaches it goes in and never comes back; from inside, your
    // waves go out as ever - and an Alarm never hears one (rp.quiet, touchMonsters)
    const a2dead = level.act2 && level.act2.dead;
    const fromDead = !!(a2dead && a2dead[tileAt(ox, oy)]);
    const deadIn = a2dead && !fromDead ? a2dead : null;
    const deadHits = [];
    for (let i = 0; i < RAYS; i++) {
      const dx = COS[i];
      const dy = SIN[i];
      let best = level.rayWalls ? raycastGrid(level.rayWalls, ox, oy, dx, dy, R) : raycastWall(ox, oy, dx, dy, R); // (17: what it sees)
      let bt = best < R ? T_WALL : 0;
      let bid = -1;
      for (let c = 0; c < circles.length; c++) {
        const t = rayCircle(ox, oy, dx, dy, circles[c].x, circles[c].y, circles[c].r);
        if (t >= 0 && t < best) {
          best = t;
          if (circles[c].absorb) {
            bt = 0; // eaten: the ray ends here and nothing is lit
            bid = -1;
          } else {
            bt = circles[c].type;
            bid = c;
          }
        }
      }
      if (deadIn) {
        const dd = raycastGrid(deadIn, ox, oy, dx, dy, best);
        if (dd < best) {
          const ti = tileAt(ox + dx * (dd + 1), oy + dy * (dd + 1));
          if (ti >= 0 && ti < deadIn.length && deadIn[ti]) {
            best = dd;
            bt = 0; // it went in: nothing is lit, nothing comes back
            bid = -1;
            deadHits.push(ti, dd);
          }
        }
      }
      dist[i] = best;
      type[i] = bt;
      hitId[i] = bid;
    }
    if (deadHits.length && !ambient && !singerRp) {
      for (let k = 0; k < deadHits.length; k += 2) {
        const at = levelTime + deadHits[k + 1] / v + lag;
        if (!(deadSeen.get(deadHits[k]) >= at)) deadSeen.set(deadHits[k], at);
      }
    }
    // (v18.0) 21: the crumbling floor this wave can see - its cracks show as the wave reaches them
    if (level.act2 && level.act2.crumbles.length && !ambient && !singerRp) {
      for (const c of level.act2.crumbles) {
        if (c.state === 3) continue;
        const m = tileMid(c.i);
        const d = Math.hypot(m.x - ox, m.y - oy);
        if (d <= R && hasLOS(ox, oy, m.x, m.y)) crumbleLit.set(c.i, levelTime + d / v + lag);
      }
    }

    // (v17.0) LEVEL 17: which of this wave's wall hits are GHOST walls - drawn, and not there. They shimmer, very slightly:
    // the one tell, for whoever looks closely (drawRipple)
    let ghost = null;
    if (level.act2 && level.act2.ghosts.length) {
      ghost = new Uint8Array(RAYS);
      for (let i = 0; i < RAYS; i++) {
        if (type[i] !== T_WALL) continue;
        const ti = Math.floor((oy + SIN[i] * (dist[i] + 0.5)) / TILE) * level.W + Math.floor((ox + COS[i] * (dist[i] + 0.5)) / TILE);
        if (level.act2.ghosts.some((g) => !g.gone && g.i === ti)) ghost[i] = 1;
      }
    }

    // What this wave lit up, one entry per round thing (boulder, monster, exit...): its nearest hit and how many rays
    // hit it. Only the art (drawRipple) reads this; nothing in the game does.
    const objs = [];
    const slot = new Int16Array(circles.length).fill(-1);
    for (let i = 0; i < RAYS; i++) {
      const id = hitId[i];
      if (id < 0) continue;
      if (slot[id] < 0) {
        slot[id] = objs.length;
        objs.push({ c: circles[id], dmin: dist[i], n: 0 });
      }
      const ob = objs[slot[id]];
      ob.n++;
      if (dist[i] < ob.dmin) ob.dmin = dist[i];
    }

    // Turn hits into echo events: one per object, walls grouped by direction+range.
    const echoes = [];
    const wallBins = new Map();
    const objBins = new Map();
    for (let i = 0; i < RAYS; i++) {
      if (!type[i]) continue;
      const d = dist[i];
      let bin;
      if (type[i] === T_WALL) {
        const key = Math.floor((i / RAYS) * 16) * 64 + Math.floor(d / 56);
        bin = wallBins.get(key);
        if (!bin) wallBins.set(key, (bin = { type: T_WALL, n: 0, sd: 0, sx: 0 }));
      } else {
        const okey = circles[hitId[i]].door ? 'door' : hitId[i]; // (the gaol door's three parts ring once, as one door)
        bin = objBins.get(okey);
        if (!bin) objBins.set(okey, (bin = { type: type[i], n: 0, sd: 0, sx: 0, enemy: circles[hitId[i]].enemy, warden: circles[hitId[i]].warden }));
      }
      bin.n++;
      bin.sd += d;
      bin.sx += COS[i];
    }
    const wallEvents = [...wallBins.values()].sort((a, b) => b.n - a.n).slice(0, 34);
    for (const b of [...wallEvents, ...objBins.values()]) {
      const d = b.sd / b.n;
      echoes.push({
        t: (2 * d) / v + lag,
        type: b.type,
        d,
        pan: clamp((b.sx / b.n) * 0.9, -1, 1),
        w: b.type === T_WALL ? Math.min(1, 0.3 + b.n / 12) : 1,
        enemy: b.enemy, // which monster this echo is off (so a mimic's echo can turn into a monster's, see revealMimic)
        warden: b.warden, // level 13: so a "wall" echo still on its way back can turn into the warden's (litByWarden)
      });
    }
    // Puddles lie flat on the floor, so the wave passes over them (they never block a ripple).
    // Any puddle the wave can see lights up lime when it arrives, and gives a wet "blorp" echo.
    // Sonar decoys (the one lying on the floor and any that have been dropped) are the same, in pink.
    const flats = (level.puddles || []).map((p) => ({ x: p.x, y: p.y, r: p.r, type: T_PUDDLE }));
    if (level.decoy && !level.decoy.taken) flats.push({ x: level.decoy.x, y: level.decoy.y, r: 12, type: T_DECOY });
    for (const dc of decoys) flats.push({ x: dc.x, y: dc.y, r: 12, type: T_DECOY });
    // ...and a lore fragment (js/lore.js), in the colour of old paper. Nothing about how it is lit is special:
    // it is one more flat thing on the floor, and the wave finds it or it does not.
    const fr = level.fragment;
    if (fr) flats.push({ x: fr.x, y: fr.y, r: fr.r, type: T_LORE, art: fr.art || (fr.kind === 'log' ? 'log' : 'note'), lore: true }); // (v16.2: level 14's is scratches)
    // ...and level 14's key, the same: one more thing lying on the floor that a wave finds or does not
    if (st && st.key && !st.key.taken) flats.push({ x: st.key.x, y: st.key.y, r: st.key.r, type: T_KEY, art: 'key', key: true });
    // ...and on a custom level (v15.1) its key and its notes, the same two things found the same way (a custom key
    // has no story beat, so it is not `key: true`; a note carries itself, to be read when the wave reaches it)
    if (level.key && !level.key.taken) flats.push({ x: level.key.x, y: level.key.y, r: level.key.r, type: T_KEY, art: 'key' });
    if (level.notes) for (const n of level.notes) flats.push({ x: n.x, y: n.y, r: n.r, type: T_LORE, art: n.kind === 'log' ? 'log' : 'note', lore: true, note: n });
    // (Anything behind a muffler is in its shadow, puddles, decoys and fragments included.)
    const shadowed = (px, py, d) => {
      for (const c of circles) {
        if (!c.absorb) continue;
        const t = rayCircle(ox, oy, (px - ox) / d, (py - oy) / d, c.x, c.y, c.r);
        if (t >= 0 && t < d) return true;
      }
      return false;
    };
    for (const p of flats) {
      const d = Math.hypot(p.x - ox, p.y - oy);
      if (d > R || !hasLOS(ox, oy, p.x, p.y) || (d > 1 && shadowed(p.x, p.y, d))) continue;
      marks.push({ x: p.x, y: p.y, t: -d / v - lag, life: 2.8, c: COLORS[p.type], r: p.r + 10, puddle: true, art: p.art || (p.type === T_DECOY ? 'decoy' : 'puddle'), ar: p.r, singer: !!singerRp, lore: !!p.lore, key: !!p.key, note: p.note || null, ambient });
      echoes.push({ t: (2 * d) / v + lag, type: p.type, d, pan: clamp(((p.x - ox) / (d + 1)) * 0.9, -1, 1), w: 1 });
    }
    echoes.sort((a, b) => a.t - b.t);
    if (singerRp) echoes.length = 0; // a singer's wave makes no echo sounds of its own: its sung tone is played from where it stands
    if (ambient) echoes.length = 0; // nor does a drop of water: it is not your sonar, and its plink is played where it lands

    // The echo monsters this wave's rays hit at the moment it was sent (they are in `echoes`).
    // Whether a monster is really TOUCHED - and so learns of you - is not decided here: it is
    // decided as the wavefront passes over wherever the monster is at that moment (touchMonsters).
    const seen = new Set();
    for (const bin of objBins.keys()) if (circles[bin] && (circles[bin].type === T_ENEMY || circles[bin].type === T_ALARM || circles[bin].type === T_SCREECHO)) seen.add(circles[bin].enemy); // (circles[bin]: the door's bin is named, not numbered)

    ripples.push({ x: ox, y: oy, t: 0, R, dist, type, hitId, circles, objs, echoes, ei: 0, seen, touched: new Set(), life: (2 * R) / v + 2.6 + lag, singer: singerRp, hitPlayer: false, ambient, dim: ambient ? 0.62 : 1, v, lag, ghost, quiet: fromDead, deadIn });
    // (v17.0) LEVEL 19: a wave that reaches a fold goes into it, and comes out of its pair - as far again as it had
    // left to go. Your waves only (a drop of water's stays where it fell), and one fold deep.
    if (level.act2 && level.act2.folds.length && !(opts && opts.fold) && !ambient && !singerRp) {
      for (const key of Object.keys(level.act2.foldPair)) {
        const a = +key;
        const b = level.act2.foldPair[key];
        const fx = ((a % level.W) + 0.5) * TILE;
        const fy = (Math.floor(a / level.W) + 0.5) * TILE;
        const d = Math.hypot(fx - ox, fy - oy);
        if (d < R - TILE && hasLOS(ox, oy, fx, fy)) foldSpawns.push({ at: levelTime + d / v, x: ((b % level.W) + 0.5) * TILE, y: (Math.floor(b / level.W) + 0.5) * TILE, R: R - d });
      }
    }
  }

  /** Can the wave get from (ox,oy) to this monster? A wall, a boulder or another monster in the way stops it. */
  function waveReaches(ox, oy, e) {
    const dx = e.x - ox;
    const dy = e.y - oy;
    const d = Math.hypot(dx, dy);
    if (d < 1) return true;
    const ux = dx / d;
    const uy = dy / d;
    // aim at points across the monster's width: the wave touches it if it gets to any of them
    for (const k of [0, -0.8, 0.8, -0.4, 0.4]) {
      const tx = e.x - uy * k * e.r;
      const ty = e.y + ux * k * e.r;
      const dd = Math.hypot(tx - ox, ty - oy);
      const vx = (tx - ox) / dd;
      const vy = (ty - oy) / dd;
      if (raycastWall(ox, oy, vx, vy, dd) < dd) continue;
      let clear = true;
      for (const o of level.obstacles) {
        const t = rayCircle(ox, oy, vx, vy, o.x, o.y, o.r);
        if (t >= 0 && t < dd) { clear = false; break; }
      }
      if (clear) {
        for (const o of enemies) {
          if (o === e) continue;
          const t = rayCircle(ox, oy, vx, vy, o.x, o.y, o.r);
          if (t >= 0 && t < dd) { clear = false; break; }
        }
        for (const ex of exitsOf()) {
          const t = rayCircle(ox, oy, vx, vy, ex.x, ex.y, ex.r); // the exit blocks the wave too (every one of them)
          if (clear && t >= 0 && t < dd) clear = false;
        }
      }
      if (clear) return true;
    }
    return false;
  }

  /**
   * An echo monster learns of you ONLY when the outgoing wave really touches it: its front passes
   * over the monster, where the monster is at that moment (not where it was when you pressed SPACE),
   * within the ripple's reach, with nothing blocking the wave. r0..r1 is how far the front travelled
   * this frame. The monster then goes to where the ripple was sent from. (A monster already tracking
   * you knows better; scent monsters never learn from a ripple.)
   */
  function touchMonsters(rp, r0, r1) {
    if (state !== 'play' || r0 >= rp.R) return; // no monsters to alert, or the outgoing wave has ended
    for (const e of enemies) {
      if ((e.kind !== 'echo' && e.kind !== 'mimic' && e.kind !== 'alarm' && e.kind !== 'screecho') || rp.touched.has(e)) continue;
      if (rp.quiet && e.kind === 'alarm') continue; // (v18.0) 22: a ripple sent from dead air - an Alarm never hears it
      if (rp.deadIn && rp.deadIn[tileAt(e.x, e.y)]) continue; // ...and a wave from outside never gets into dead air
      const d = Math.hypot(e.x - rp.x, e.y - rp.y);
      if (d - e.r > r1 || d + e.r < r0) continue; // the front is not passing over it this frame
      if (!waveReaches(rp.x, rp.y, e)) continue;
      rp.touched.add(e);
      if (e.kind === 'alarm') {
        // (v15.7) the wave of one of YOUR ripples has reached an Alarm: it screams, once, and is spent for good.
        // (Only your own ripples come through here - never a singer's song or a drop of water - and crouching
        // sends none, so a crouched player can never set one off. Touching it does nothing at all.)
        if (!e.spent) {
          e.spent = true;
          scream(e);
        }
        continue;
      }
      if (e.kind === 'screecho') {
        // (v15.7) a Screecho screams when the wave reaches it - unless a decoy holds it, or it screamed less than
        // SCREECHO_COOLDOWN seconds ago. The scream sends it (and everything else) to where you are now; without
        // one it hears the ripple exactly as an echo monster does (below).
        if (e.state !== 'lured' && e.state !== 'trapped' && e.screamCd <= 0) {
          scream(e);
          if (!rp.seen.has(e)) {
            marks.push({ x: e.x, y: e.y, t: 0, life: 1.3, c: COLORS[T_SCREECHO], r: 34, art: 'screecho', ar: e.r, h: Math.atan2(rp.y - e.y, rp.x - e.x) });
            rp.echoes.push({ t: (2 * d) / (rp.v || RIPPLE_SPEED) + (rp.lag || 0), type: T_SCREECHO, d, pan: clamp(((e.x - rp.x) / (d + 1)) * 0.9, -1, 1), w: 1 });
            rp.echoes.sort((a, b) => a.t - b.t);
          }
          continue;
        }
      }
      if (e.kind === 'mimic') {
        // the wave touched the "exit": it was a mimic all along, and it is an echo monster from now on
        revealMimic(e);
      }
      // a monster a sonar decoy has called, and one already tracking you, ignore the ripple
      if (e.state === 'track' || e.state === 'lured' || e.state === 'trapped') continue;
      if (!rp.seen.has(e)) {
        // it walked into the wave after the ripple was sent, so no echo of it was planned: show and sound it now
        const sc = e.kind === 'screecho'; // (v15.7: a Screecho is shown and heard as itself)
        marks.push({ x: e.x, y: e.y, t: 0, life: 1.3, c: COLORS[sc ? T_SCREECHO : T_ENEMY], r: 34, art: sc ? 'screecho' : 'echo', ar: e.r, h: Math.atan2(rp.y - e.y, rp.x - e.x) });
        rp.echoes.push({ t: (2 * d) / (rp.v || RIPPLE_SPEED) + (rp.lag || 0), type: sc ? T_SCREECHO : T_ENEMY, d, pan: clamp(((e.x - rp.x) / (d + 1)) * 0.9, -1, 1), w: 1 });
        rp.echoes.sort((a, b) => a.t - b.t);
      }
      alertEnemy(e, rp.x, rp.y);
    }
  }

  /**
   * A mimic's disguise breaks: a ripple's wave touched it. From now on it is an ordinary echo monster (it
   * never goes back to being an exit). Every ripple still in the air that had bounced off it as an "exit"
   * now shows it as a monster - its rays turn red and the echo that has not arrived yet becomes a monster's
   * moan instead of the exit's bell - so what you see and hear matches what it is.
   */
  function revealMimic(e) {
    e.kind = 'echo';
    e.fromMimic = true; // for the stats only: if this one kills you, it was "the mimic that got you"
    e.r = ENEMY_R;
    e.voice = audio.ready ? audio.createEnemyVoice(e.pitch, 'echo') : null;
    marks.push({ x: e.x, y: e.y, t: 0, life: 1.4, c: COLORS[T_ENEMY], r: 40 });
    const sp = spatial(e.x, e.y, 950);
    audio.mimicReveal(sp.pan, Math.max(sp.g, 0.25));
    cues.pulse('echo', e.x, e.y, cueLoud(Math.max(sp.g, 0.25)), { big: true, key: e, sub: 'alert' }); // the "exit" snarls
    cues.caption('[the exit snarls]');
    for (const rp of ripples) {
      let hit = false;
      // the art: a ripple that bounced off it as an "exit" now melts that into the echo monster (see drawRipple)
      for (const c of rp.circles) if (c.enemy === e && c.revealAt === undefined) c.revealAt = artT;
      for (let j = 0; j < RAYS; j++) {
        const id = rp.hitId[j];
        if (id >= 0 && rp.circles[id].enemy === e) {
          rp.type[j] = T_ENEMY;
          hit = true;
        }
      }
      for (let i = rp.ei; i < rp.echoes.length; i++) if (rp.echoes[i].enemy === e) rp.echoes[i].type = T_ENEMY;
      if (hit) rp.seen.add(e); // its echo is already planned (now as a monster), so it is not "walking into the wave"
    }
  }

  function playEcho(ev, R) {
    const vol = (1 - clamp(ev.d / R, 0, 1) * 0.65) * ev.w;
    switch (ev.type) {
      case T_WALL: audio.echoWall(ev.pan, vol, ev.d); break;
      case T_OBSTACLE: audio.echoObstacle(ev.pan, vol, ev.d); break;
      case T_ENEMY: audio.echoEnemy(ev.pan, vol, ev.d); break;
      case T_EXIT: audio.echoExit(ev.pan, vol); break;
      case T_SCENT: audio.echoScent(ev.pan, vol, ev.d); break;
      case T_PUDDLE: audio.echoPuddle(ev.pan, vol, ev.d); break;
      case T_DECOY: audio.echoDecoy(ev.pan, vol, ev.d); break;
      case T_STALKER: audio.echoStalker(ev.pan, vol, ev.d); break;
      case T_SINGER: audio.echoSinger(ev.pan, vol, ev.d); break;
      case T_WARDEN: audio.echoWarden(ev.pan, vol, ev.d); break; // level 13: the wall that came back wrong
      case T_LORE: audio.echoLore(ev.pan, vol); break; // a lore fragment: paper
      case T_KEY: audio.echoKey(ev.pan, vol); break; // level 14's key: a small bright tick of metal
      case T_ALARM: audio.echoAlarm(ev.pan, vol); break; // (v15.7) an Alarm: a hard metallic ping
      case T_SCREECHO: audio.echoScreecho(ev.pan, vol, ev.d); break; // (v15.7) a Screecho: a moan with a siren in it
    }
  }

  function updateRipples(dt) {
    for (const rp of ripples) {
      const v = rp.v || RIPPLE_SPEED; // (v17.0: level 20's wave is slower)
      const before = Math.min(rp.t * v, rp.R); // where the wavefront was
      rp.t += dt;
      const after = Math.min(rp.t * v, rp.R);
      if (rp.singer) singerRippleHits(rp, before, after); // a singer's wave alerts no monster; it can only MARK you
      else if (!rp.ambient) touchMonsters(rp, before, after); // (a drop of water's wave alerts nothing at all)
      while (rp.ei < rp.echoes.length && rp.echoes[rp.ei].t <= rp.t) playEcho(rp.echoes[rp.ei++], rp.R);
    }
    ripples = ripples.filter((rp) => rp.t < rp.life);
    for (const m of marks) {
      m.t += dt;
      // A lore fragment is READ the moment the player's own wave reaches it - the same moment it lights up.
      // Not by a singer's wave (that is not you pinging it), and not once the game is over for this attempt.
      // Crouching wipes `marks`, so a wave you crouched under never gets to read it: the same rule as the rest.
      if (m.lore && !m.fired && m.t >= 0) {
        m.fired = true;
        if (!m.singer && !m.ambient && state === 'play') {
          if (m.note) readNote(m.note); // (v15.1: a note a custom level's maker wrote)
          else readFragment();
        }
      }
      // Level 14's key, lit up - by your wave or by a drop's. The first time you can really see it from where
      // you stand, the story gives it its moment (js/story.js onKeyLit).
      if (m.key && !m.fired && m.t >= 0) {
        m.fired = true;
        if (!m.singer && state === 'play') story.onKeyLit();
      }
    }
    marks = marks.filter((m) => m.t < m.life);
  }

  /** Your wave has reached this level's lore fragment (js/lore.js). Read at most once per attempt at a level. */
  function readFragment() {
    const fr = level && level.fragment;
    if (!fr || fr.read) return;
    fr.read = true;
    const info = EchoLore.markFound(fr.id);
    // the level's own banner gives way: the two sit in the same place, and this is the one worth reading
    // (v16.2) - on the hand-drawn levels 13-16 a hint up at that moment comes back once the fragment's line has gone:
    // their hints matter (level 16's says how to survive), and their fragments lie close to where the hint is shown
    if (levelNum >= WARDEN_LEVEL && $('banner').classList.contains('show')) loreBannerBack = { n: levelNum, title: $('banner-title').textContent, text: $('banner-text').textContent };
    clearTimeout(bannerTimer);
    $('banner').classList.remove('show');
    loreReader.show(EchoLore.byId(fr.id), info);
    // (v16.2) the last one found: a quiet note that something has changed in the Fragments archive - the hidden
    // scene is there now. Never the scene itself: it is never played for you.
    if (info.isNew && info.count >= EchoLore.TOTAL) showSaved(SECRET_NOTICE, 3600);
  }

  /**
   * CUSTOM LEVELS (v15.1): a note its maker wrote, reached by your wave. Read exactly as a lore fragment is - the
   * same reader, the same paper or recording - once per attempt, and NOTHING is kept: it is not one of the game's
   * fragments, so the Fragments screen and `echomaze.lore` never hear of it. Its words were cleaned when the level
   * was read (js/levelformat.js) and are only ever put on screen as plain text.
   */
  function readNote(n) {
    if (!n || n.read) return;
    n.read = true;
    clearTimeout(bannerTimer);
    $('banner').classList.remove('show');
    loreReader.show({ id: 'custom-note', kind: n.kind === 'log' ? 'log' : 'note', text: n.text, voice: n.kind === 'log' ? { pitch: 1.05, shake: 0.04, cps: 19, vol: 0.85 } : undefined }, null);
  }

  // ------------------------------------------------- custom levels: the key and the locked ways out (v15.1)
  /** Walk onto a custom level's key to take it (as on level 14). One key opens every locked way out. */
  function collectKey() {
    const k = level.key;
    if (!k || k.taken || Math.hypot(k.x - player.x, k.y - player.y) > k.r + PLAYER_R + 4) return;
    k.taken = true;
    player.hasKey = true;
    audio.keyPickup();
    cues.caption('[you take the key]');
    updateHud();
    notify('Key', 'It opens the locked ways out.', 4000);
  }

  /** You are against a locked way out: with the key it opens (as level 14's door does); without, it rattles. */
  function lockedExitTouched(ex) {
    if (ex.opening >= 0) return; // already opening
    const sp = spatial(ex.x, ex.y, 600);
    if (player.hasKey) {
      ex.opening = 0;
      audio.doorUnlock();
      cues.caption('[the key turns]');
      return;
    }
    if (ex.rattleCd > 0) return;
    ex.rattleCd = 1.5;
    audio.doorRattle(sp.pan, 0.9);
    cues.pulse('exit', ex.x, ex.y, 0.9, { key: ex, sub: 'rattle' });
    cues.caption('[the door rattles: locked]');
    notify('Locked', level.key ? 'This way out needs the key.' : 'This way out is locked.', 3500);
  }

  /** The doors opening: the key turns, then it grinds open and swings back - and it is a way out like any other. */
  function updateLockedExits(dt) {
    if (!level.exits) return;
    for (const ex of level.exits) {
      ex.rattleCd = Math.max(0, ex.rattleCd - dt);
      if (ex.opening < 0) continue;
      const before = ex.opening;
      ex.opening += dt;
      if (before < UNLOCK_SECONDS && ex.opening >= UNLOCK_SECONDS) {
        audio.doorOpen();
        cues.caption('[the door grinds open]');
        ex.locked = false; // a way out from now on: no longer solid, and reaching it ends the level
        level.blocked[ex.ty * level.W + ex.tx] = 0;
      }
      if (ex.opening >= UNLOCK_SECONDS) ex.swing = Math.min(1, ex.swing + dt / 1.1);
    }
  }
  const UNLOCK_SECONDS = 0.9; // from the key turning to the door giving way (level 14's is a scripted 2 s beat)

  // ------------------------------------------------- sonar decoy (level 8+)
  /** Pick up the decoy lying on the floor by walking onto it (you can only carry one). */
  function collectDecoy() {
    const d = level.decoy;
    if (!d || d.taken || player.hasDecoy) return;
    if (Math.hypot(d.x - player.x, d.y - player.y) > d.r + PLAYER_R + 4) return;
    d.taken = true;
    player.hasDecoy = true;
    audio.decoyPickup();
    updateHud();
    notify('Sonar decoy', 'Press E to drop it. A few seconds later it calls every monster nearby to it - and traps them there.');
  }

  /** E: drop the decoy you are carrying where you stand. */
  function dropDecoy() {
    if (state !== 'play' || !player.hasDecoy || scriptLock) return;
    player.hasDecoy = false;
    decoys.push({ x: player.x, y: player.y, t: 0, phase: 'arming', tick: 0, hum: 0, ring: 0, lured: [] });
    if (scored()) EchoProfile.bump('decoys'); // (v15.0: a custom level counts nothing)
    marks.push({ x: player.x, y: player.y, t: 0, life: 0.9, c: COLORS[T_DECOY], r: 26 });
    audio.decoyDrop();
    cues.pulse('decoy', player.x, player.y, 0.6, {}); // a cue at its drop spot (at your feet: it points the way you were facing)
    updateHud();
  }

  /** The moment a dropped decoy calls: every monster within DECOY_RADIUS is drawn to it, whatever it was doing. */
  function callMonsters(d) {
    d.phase = 'active';
    d.ring = 0;
    d.hum = 1.2;
    // EVERY kind of monster answers a decoy - the stalker, the muffler and the singer included (owner's
    // change, v11.1). A disguised mimic is not just dragged along any more either: the call breaks its
    // disguise on the spot, exactly as a ripple would, and the echo monster it becomes walks over with the rest.
    for (const e of enemies) {
      if (e.state === 'lured' || e.state === 'trapped') continue;
      if (e.kind === 'warden') continue; // the Warden (levels 15-16) is never distracted - there is no decoy there, but if there were
      if (e.kind === 'alarm') continue; // (v15.7) an Alarm never moves - and a decoy's call is not a ripple, so it does not set one off
      if (Math.hypot(e.x - d.x, e.y - d.y) > DECOY_RADIUS) continue;
      if (e.kind === 'mimic') revealMimic(e);
      if (lureEnemy(e, d.x, d.y)) d.lured.push(e);
    }
    const sp = spatial(d.x, d.y, 1100);
    audio.decoyCall(sp.pan, Math.max(sp.g, 0.3));
    cues.pulse('decoy', d.x, d.y, cueLoud(Math.max(sp.g, 0.3)), { big: true, key: d, sub: 'call' });
    cues.caption('[sonar decoy calls out]');
  }

  function updateDecoys(dt) {
    // the decoy still lying on the floor gives a faint blip when you are near, so it can be found in the dark
    const fd = level.decoy;
    if (fd && !fd.taken) {
      decoyBlipTimer -= dt;
      if (decoyBlipTimer <= 0) {
        decoyBlipTimer = 3.2;
        const sp = spatial(fd.x, fd.y, 300);
        if (sp.g > 0.02) {
          audio.decoyBlip(sp.pan, sp.g);
          cues.pulse('decoy', fd.x, fd.y, cueLoud(sp.g), { key: fd, sub: 'blip' });
        }
      }
    }
    for (let i = decoys.length - 1; i >= 0; i--) {
      const d = decoys[i];
      d.t += dt;
      if (d.phase === 'arming') {
        // a beep that speeds up and rises until it calls (one time use)
        d.tick -= dt;
        if (d.tick <= 0) {
          const f = clamp(d.t / DECOY_ARM_SECONDS, 0, 1);
          d.tick = 0.85 - 0.6 * f;
          const sp = spatial(d.x, d.y, 700);
          audio.decoyTick(sp.pan, Math.max(sp.g, 0.12), f);
          cues.pulse('decoy', d.x, d.y, cueLoud(Math.max(sp.g, 0.12)), { key: d, sub: 'tick' }); // (rate-limited: the beeps speed up past 3 a second)
        }
        if (d.t >= DECOY_ARM_SECONDS) callMonsters(d);
      } else {
        d.ring += dt;
        d.hum -= dt;
        if (d.hum <= 0) {
          d.hum = 1.2;
          const sp = spatial(d.x, d.y, 700);
          audio.decoyTick(sp.pan, Math.max(sp.g, 0.1) * 0.7, 1);
          cues.pulse('decoy', d.x, d.y, cueLoud(Math.max(sp.g, 0.1) * 0.7), { key: d, sub: 'tick' });
        }
        // spent once everything it called has been let go again
        if (d.ring > 1.2 && d.lured.every((e) => e.state !== 'lured' && e.state !== 'trapped')) decoys.splice(i, 1);
      }
    }
  }

  /** A short message in the banner (the level hint uses the same spot). */
  /**
   * Something got within a hair of you and did not get you. A beat, made out of things the game already does:
   * one heartbeat (with its Visual cue), a faint red pulse at the edge of the screen, and a short dip in the
   * speed of the ART's clock - `artLag` holds back what is DRAWN, never what happens. The simulation has
   * already finished this frame; `dt` is untouched and no monster is told anything.
   *
   * Calm mode softens it exactly as it softens the heartbeat and the red creep elsewhere: quieter, dimmer, and
   * no time dilation at all - but the cue still fires, because Visual cues must not be weaker in calm mode.
   */
  function onNearMiss() {
    if (scored()) EchoProfile.bump('nearMisses'); // counted; never read back, and nothing to do with medals
    const soft = calm ? 0.45 : 1;
    nearMiss = soft;
    if (!calm) audio.heartbeat(1);
    cues.heartbeat(0.9);
  }

  /**
   * (v16.2) A line someone SAYS (levels 13-16: #say) and a fragment's line (#lore) share the bottom of the screen
   * (the top, on touch). While both are up, the spoken one sits just beyond the fragment's instead of on top of it.
   */
  function stackSayOverLore() {
    const say = $('say');
    const lore = $('lore');
    if (!say || !lore) return;
    if (say.classList.contains('show') && lore.classList.contains('show')) {
      const r = lore.getBoundingClientRect();
      if (document.body.classList.contains('touch')) say.style.top = `${Math.round(r.bottom + 8)}px`;
      else say.style.bottom = `${Math.round(innerHeight - r.top + 8)}px`;
    } else if (say.style.top || say.style.bottom) {
      say.style.top = '';
      say.style.bottom = '';
    }
  }

  function notify(title, text, ms = 6000) {
    if (levelNum >= WARDEN_LEVEL && loreReader.state()) {
      loreBannerBack = { n: levelNum, title, text }; // (v16.2) a fragment's line is up: this waits for it
      return;
    }
    $('banner-title').textContent = title;
    $('banner-text').textContent = text;
    $('banner').classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => $('banner').classList.remove('show'), ms);
  }

  // ----------------------------------------------------------------- update
  function updatePlay(dt) {
    levelTime += dt;
    if (scored()) EchoProfile.bump('playTime', dt); // stats: written out at the end of the level, not every frame (never in the tutorial)
    cooldown = Math.max(0, cooldown - dt);
    player.bumpCd = Math.max(0, player.bumpCd - dt);
    flash = Math.max(0, flash - dt * 2.2);
    shake = Math.max(0, shake - dt * 30);
    beat = Math.max(0, beat - dt * 3.2);

    // --- player movement (crouching is the same speed as walking; it just makes no sound - see syncCrouch)
    syncCrouch();
    const ix = (act('right') ? 1 : 0) - (act('left') ? 1 : 0);
    const iy = (act('down') ? 1 : 0) - (act('up') ? 1 : 0);
    // Where to: a movement key (always full speed, exactly as ever) - or, if none is held, the touch joystick, which
    // is analog: any direction, speed from a crawl to the same 170 px/s. (0,0 unless a finger is pushing the stick.)
    let mvx = 0;
    let mvy = 0;
    if (scriptLock || a2Falling) {
      // levels 14-16: a scripted beat has the controls. The player stands still - or is walked, for a beat.
      // (v18.0: or you are falling)
      mvx = scriptWalk.x / WALK_SPEED;
      mvy = scriptWalk.y / WALK_SPEED;
    } else if (ix || iy) {
      const len = Math.hypot(ix, iy);
      mvx = ix / len;
      mvy = iy / len;
    } else {
      const s = touch.vec();
      mvx = s.x;
      mvy = s.y;
    }
    let contact = null;
    let walked = false; // did we really move this frame? (pushing into a wall does not count)
    if (mvx || mvy) {
      const px = player.x;
      const py = player.y;
      contact = moveCircle(player, mvx * WALK_SPEED * dt, mvy * WALK_SPEED * dt);
      const step = Math.hypot(player.x - px, player.y - py);
      walked = step > 0.3;
      if (walked) player.face = Math.atan2(mvy, mvx); // (v19.0: which way you are facing - drawn outside, where you are seen)
      player.stepDist += step;
      if (scored()) EchoProfile.bump('distance', step);
      if (player.stepDist >= 30) {
        player.stepDist = 0;
        if (!player.crouching) {
          // a crouching player makes no footstep sound, so nothing can hear one
          if (levelFlag('daylight')) {
            // (v19.0) outside: grass underfoot - (v19.3) on Dusk, as the light goes, the gaol's dry, quiet steps
            const dk = story.dusk();
            if (dk && dk.k > 0.55) audio.footstep(0.32);
            else audio.grassStep(dk ? 1 - 0.5 * dk.k : 1);
          }
          else if (level.act2 && onDeadAir()) audio.footstep(0.3); // (v18.0) 22: dead air - a dull step that nothing hears
          else {
            audio.footstep(1);
            hearFootstep(player.x, player.y);
          }
        }
      }
    }
    if (contact && !player.blocked && player.bumpCd <= 0) {
      player.bumpCd = 0.3;
      audio.bump(1);
      marks.push({ x: contact.x, y: contact.y, t: 0, life: 0.9, c: COLORS[T_WALL] });
    }
    player.blocked = !!contact;
    if (level.act2) {
      act2Touch(); // (v17.0: a ghost wall comes apart, a hidden one thunks, a fold takes you)
      voidTouch(); // (v18.0: crumbling floor behind you, the void under you)
    }
    stalkersListen(walked); // a stalker hears your footsteps and your presence - unless you are crouching
    mufflersListen(walked); // a muffler hears them too, from farther - and even a crouched MOVE from up close
    updateSmell(dt, walked);
    // a finished smell trail lasts about a minute, then it is gone
    for (let i = level.trails.length - 1; i >= 0; i--) {
      const tr = level.trails[i];
      if (!tr.active && levelTime >= tr.expireAt) level.trails.splice(i, 1);
    }

    collectDecoy();
    updateDecoys(dt);
    if (level.custom) {
      collectKey(); // (v15.1: a custom level's key, and its locked ways out opening)
      updateLockedExits(dt);
    }

    // --- world
    for (const e of enemies) updateEnemy(e, dt);
    updateRipples(dt);

    // exit beacon - and a mimic chimes exactly the same, from wherever it is (the very same function, so it can
    // never differ from the exit's chime in sound or in its visual cue: range, rhythm, muffling and all)
    beaconTimer -= dt;
    if (beaconTimer <= 0) {
      beaconTimer = 2.4;
      // (level 15: the real way out cannot be heard while the passage to it is still sealed - js/story.js)
      if (!(level.story && level.story.exitMuted)) for (const ex of exitsOf()) chime(ex.x, ex.y); // (a custom level may have several - each chimes)
      for (const e of enemies) if (e.kind === 'mimic') chime(e.x, e.y);
    }

    // heartbeat + danger vignette as monsters close in (a disguised mimic gives no warning: it is just an exit)
    let dmin = Infinity;
    for (const e of enemies) {
      if (e.kind === 'mimic' || e.kind === 'alarm') continue; // (v15.7: an Alarm cannot hurt you)
      if (e.kind === 'warden' && e.state !== 'hunt') continue; // (nor does a Warden still in the stone)
      const d = Math.hypot(e.x - player.x, e.y - player.y) * (isChasing(e) ? 1 : 1.35);
      if (d < dmin) dmin = d;
    }
    danger = clamp(1 - dmin / 300, 0, 1);
    // The soundtrack swells on exactly this number and nothing else, so it can never tell you anything the
    // heartbeat and the red screen-edge do not already. In calm mode it is handed 0 and stays flat.
    music.setDanger(calm ? 0 : danger);
    if (danger > 0 && !calm) {
      heartTimer -= dt;
      if (heartTimer <= 0) {
        heartTimer = 0.95 - danger * 0.6;
        audio.heartbeat(0.35 + danger * 0.65);
        cues.heartbeat(0.35 + danger * 0.65); // a ring around you, once per beat (never above ~3 a second)
        beat = 1;
      }
    } else if (danger > 0) {
      // calm mode has no heartbeat sound, but the Visual cues option must not be weaker in calm mode: it keeps its ring
      cueBeatTimer -= dt;
      if (cueBeatTimer <= 0) {
        cueBeatTimer = 0.95 - danger * 0.6;
        cues.heartbeat(0.35 + danger * 0.65);
      }
    }
    // marked by a singer: the countdown as a shrinking ring around you (Visual cues; the ticking is the sound). 0 = not marked.
    let markLeft = 0;
    for (const e of enemies) if (e.kind === 'singer' && e.state === 'marked') markLeft = Math.max(markLeft, e.markFrac);
    cues.setMark(markLeft);
    cues.update(dt, player.x, player.y);
    loreReader.update(dt); // a fragment's line on screen (js/lore.js): drawing and sound only
    stackSayOverLore();
    if (loreBannerBack && !loreReader.state()) {
      // (v16.2) the hint that gave way to a fragment's line on 13-16, back for a few seconds
      const b = loreBannerBack;
      loreBannerBack = null;
      if (levelNum === b.n) {
        $('banner-title').textContent = b.title;
        $('banner-text').textContent = b.text;
        $('banner').classList.add('show');
        clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => $('banner').classList.remove('show'), 4500);
      }
    }

    // the tutorial's teaching prompts: they read where you are and how many ripples you have sent, and write
    // a line of text. Nothing above this point knows the tutorial exists.
    if (inTutorial()) tutorial.update(dt, { x: player.x, y: player.y, ripples: ripplesUsed });

    // LEVEL 13: the dread on the way to the great room, the room's own light, and the capture (js/warden.js).
    // Like the tutorial's prompts it reads where you are and writes to the screen and the speakers. The one
    // thing it ever takes is the controls, and only at the reveal - which is what the level is for.
    if (level.warden) warden.update(dt);
    // LEVELS 14-16: their scripted beats (js/story.js) - the same kind of thing, and it may take the controls
    // for a beat at a time (scriptLock), with the game still running underneath.
    if (level.story) story.update(dt);
    if (level.act2) {
      act2Update(dt); // (v17.0: 18's walls sliding, 19's waves through folds, 17's reveals fading)
      voidUpdate(dt); // (v18.0: crumbling floor, the creep, anything falling)
      if (state !== 'play') return; // (the void took you)
    }

    // NEAR MISSES. Read-only, and last: every monster has already moved and the outcomes below decide the
    // level. All this does is notice that something came within a hair of you and did not get you.
    nearMiss = Math.max(0, nearMiss - dt / NEAR_MISS_SECONDS);
    for (const e of enemies) {
      if (e.kind === 'mimic' || e.kind === 'alarm') continue; // a disguised mimic gives nothing away, near miss or not (and an Alarm is harmless)
      if (e.kind === 'warden' && e.state !== 'hunt') continue; // nor a Warden still asleep in the stone
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      e.nmCd = Math.max(0, (e.nmCd || 0) - dt);
      // (a Warden is bigger than the other monsters: its margin is 1.5x ITS reach, the same rule)
      if (d < (e.kind === 'warden' ? (e.r + PLAYER_R) * 1.5 : NEAR_MISS_DIST)) {
        e.nmIn = true; // inside the margin: wait and see whether it gets you
      } else if (e.nmIn) {
        e.nmIn = false;
        if (e.nmCd <= 0) {
          e.nmCd = NEAR_MISS_GAP; // it cannot do this to you again for a couple of seconds
          onNearMiss();
        }
      }
    }

    // --- outcomes
    if (singerLanded) {
      singerLanded = false;
      return onCaught('singer', 'marked', enemies.find((e) => e.kind === 'singer') || null); // a singer has landed on the spot you were marked at, and you are still within landRadius of it
    }
    // Touching a monster kills you (circles overlapping). (v16.4) If more than one is touching you on the same frame,
    // the one that got there FIRST is the one that caught you - the one furthest inside its reach of you.
    let catcher = null;
    let deepest = 0;
    for (const e of enemies) {
      let reach;
      if (e.kind === 'warden') {
        // Levels 15-16: the same rule as every monster - circles overlapping kills you - with its own circle,
        // because it is bigger than they are. A Warden still asleep in the stone is solid, not deadly.
        if (e.state !== 'hunt') continue;
        reach = e.r + PLAYER_R;
      } else if (e.kind === 'alarm') continue; // (v15.7) touching an Alarm is harmless - it never kills
      else reach = CATCH_DIST;
      const inside = Math.hypot(e.x - player.x, e.y - player.y) - reach;
      if (inside < deepest) {
        deepest = inside;
        catcher = e;
      }
    }
    // (`fromMimic`: a mimic that a ripple turned into an echo monster still counts as the mimic, in the stats and on
    // the Caught screen)
    if (catcher) return onCaught(catcher.fromMimic ? 'mimic' : catcher.kind, deathWhy(catcher), catcher);
    // The way out. Level 13 has no way out: its door chimes and lights up like any other, and the warden is
    // in front of it - walking into the great room is what ends that level, not touching the door.
    // (v15.1: a custom level can have several ways out, and reaching ANY one of them is the end - unless it is a
    // locked one and you have no key: then it is a door, and it rattles. See lockedExitTouched.)
    if (!level.warden) {
      for (const ex of exitsOf()) {
        if (Math.hypot(ex.x - player.x, ex.y - player.y) >= ex.r + 10) continue;
        if (ex.locked) {
          lockedExitTouched(ex);
          continue;
        }
        if (inTutorial()) onTutorialComplete();
        else if (level.story) story.atExit(); // levels 14-16: the way out has a last beat of its own first
        else onLevelComplete();
        break;
      }
    }
    // ...and when that beat is over, on to the next level (or the end). Last, once everything above is settled.
    if (storyDone) {
      storyDone = false;
      onStoryCleared();
    }
    // (v18.0) 24: its first way out, walked through - on into its second part (nothing saved yet)
    if (nextPartPending) {
      nextPartPending = false;
      if (state === 'play') startLevel(levelNum, false, 2);
    }
  }

  // ----------------------------------------------------------------- render
  const segBuckets = [];
  const retBuckets = [];
  for (let k = 0; k < NRAYTYPES; k++) {
    segBuckets[k] = [];
    for (let a = 0; a < ALPHA_LEVELS; a++) segBuckets[k][a] = [];
    retBuckets[k] = [];
  }
  const texBuckets = []; // the stone texture on lit walls (EchoArt.wallTexture), by brightness
  for (let a = 0; a < ALPHA_LEVELS; a++) texBuckets[a] = [];
  const artOpts = { a: 1, t: 0, h: 0, seed: 0, tell: 'none' }; // reused for every thing the art draws (no garbage per frame)

  /**
   * The art for one round thing a ripple lit up (see EchoArt in js/art.js): drawn at the thing's TRUE collision
   * size, facing the ripple's origin (so it never tells you which way the monster is really heading), and fading
   * like the rays that found it. A disguised mimic is the exit (with the mode's tell), and one that has just been
   * revealed melts from the exit into the echo monster over 0.3 s - and never shows as an exit again.
   */
  function drawLit(rp, ob, a) {
    const c = ob.c;
    const o = artOpts;
    o.a = a;
    o.t = artT;
    o.h = Math.atan2(rp.y - c.y, rp.x - c.x);
    o.seed = EchoArt.seedOf(c.x, c.y);
    o.tell = 'none';
    switch (c.type) {
      case T_OBSTACLE: EchoArt.draw(ctx, c.bar ? 'bar' : EchoArt.obstacleKind(c.x, c.y), c.x, c.y, c.r, o); break; // (bar: level 14)
      case T_WARDEN:
        // levels 15-16: a hunting Warden, drawn as itself - level 13's stone, at the size of a corridor - facing
        // the ripple, like every monster, never the way it is really going. (Level 13's great mass is drawn by
        // js/warden.js itself and has no `enemy`.)
        if (c.enemy) EchoWarden.drawHunter(ctx, c.x, c.y, c.r, { a: o.a, t: artT, h: o.h, variant: c.enemy.variant, reach: c.enemy.reach || 0, tx: player.x, ty: player.y });
        break;
      case T_ENEMY: EchoArt.draw(ctx, 'echo', c.x, c.y, c.r, o); break;
      case T_SCENT: EchoArt.draw(ctx, 'scent', c.x, c.y, c.r, o); break;
      case T_STALKER: EchoArt.draw(ctx, 'stalker', c.x, c.y, c.r, o); break;
      case T_SINGER: EchoArt.draw(ctx, 'singer', c.x, c.y, c.r, o); break;
      case T_SCREECHO: EchoArt.draw(ctx, 'screecho', c.x, c.y, c.r, o); break; // (v15.7)
      case T_ALARM: {
        // (v15.7) an Alarm - drawn dimmer, silent and cracked once it has screamed: a landmark, nothing more
        const spent = !!(c.enemy && c.enemy.spent);
        o.spent = spent;
        o.a = a * (spent ? 0.42 : 1);
        EchoArt.draw(ctx, 'alarm', c.x, c.y, c.r, o);
        o.spent = false;
        break;
      }
      case T_EXIT:
        if (c.door) {
          // level 14: the gaol door - drawn once, from the middle of its three parts, swinging as it opens
          if (c.doorArt) {
            o.swing = c.door.swing;
            EchoArt.draw(ctx, 'door', c.door.x, c.door.y, c.door.r, o);
            o.swing = 0;
          }
        } else if (c.lockedExit && c.lockedExit.swing < 1) {
          // (v15.1) a custom level's locked way out: level 14's door, swinging back as the key opens it
          o.swing = c.lockedExit.swing;
          EchoArt.draw(ctx, 'door', c.x, c.y, LOCKED_EXIT_ART_R, o);
          o.swing = 0;
        } else if (!c.mimic) EchoArt.draw(ctx, 'exit', c.x, c.y, c.r, o);
        else {
          o.tell = mimicTell(); // a mimic melting into the monster starts from the look it was disguised with
          if (c.revealAt === undefined) EchoArt.draw(ctx, 'exit', c.x, c.y, c.r, o);
          else EchoArt.mimicMorph(ctx, c.x, c.y, c.r, (artT - c.revealAt) / EchoArt.MORPH_SECONDS, o);
        }
        break;
    }
  }

  function strokeBucket(b, style, width) {
    if (!b.length) return;
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i < b.length; i += 4) {
      ctx.moveTo(b[i], b[i + 1]);
      ctx.lineTo(b[i + 2], b[i + 3]);
    }
    ctx.stroke();
  }

  /**
   * (v22.1) For your cosmetics: the path along the walls where this ripple is landing right now (the rays that met a
   * wall within the last LANDING_BAND px behind its shown front), `off` px along each ray (or per ray, null = a gap).
   * Walls only - never a monster, an object or a way out - and only where the game is lighting the wall anyway.
   */
  function landingAt(rp, rr) {
    const { x, y, dist, type, R } = rp;
    const band = EchoCosmetics.LANDING_BAND;
    return (off) => {
      ctx.beginPath();
      let pen = false;
      let any = false;
      let last = 0;
      for (let i = 0; i <= RAYS; i++) {
        const j = i % RAYS;
        const d = dist[j];
        const o = typeof off === 'function' ? off(j) : off;
        if (o === null || type[j] !== T_WALL || d >= R - 0.5 || d > rr || d < rr - band) {
          pen = false;
          continue;
        }
        const px = x + COS[j] * (d + o);
        const py = y + SIN[j] * (d + o);
        if (pen && Math.abs(d - last) < 12) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
        pen = true;
        any = true;
        last = d;
      }
      return any;
    };
  }

  function drawRipple(rp) {
    const v = rp.v || RIPPLE_SPEED;
    const r = rp.t * v;
    const rr = rp.lag ? (rp.t - rp.lag) * v : r; // (v17.0: level 20 - what the wave found is shown this much later)
    const { x, y, dist, type, R } = rp;
    if (rp.ambient) ctx.globalAlpha = rp.dim; // a drop of water's ripple is fainter than yours (levels 14 and 16)
    const tint = rp.singer ? singerRgb() : null; // a singer's own wave is magenta all through: front, walls, everything it finds
    // (v21.0) one of YOUR ripples: its front, and the walls it shows you, in your cosmetics (everything else it finds
    // keeps the palette's colour). Drawing only - the rays, their reach and their timing are the same for every look.
    const mine = rp.mine && cosLook && !tint ? cosLook : null;
    const wallRgb = mine ? mine.wall : null;
    for (let k = 1; k < NRAYTYPES; k++) {
      retBuckets[k].length = 0;
      for (let a = 0; a < ALPHA_LEVELS; a++) segBuckets[k][a].length = 0;
    }
    for (let a = 0; a < ALPHA_LEVELS; a++) texBuckets[a].length = 0;

    // expanding wavefront - only where the wave has not hit anything yet
    if (r < R) {
      const a = 0.06 + 0.5 * (1 - r / R);
      // the front's path at the wave's radius (+ off: px, or per ray - null leaves a gap), only where it has not hit anything yet
      const pathAt = (off) => {
        ctx.beginPath();
        let pen = false;
        let any = false;
        for (let i = 0; i <= RAYS; i++) {
          const j = i % RAYS;
          const o = typeof off === 'function' ? off(j) : off;
          const rr = o === null ? -1 : r + o;
          if (rr > 0 && rr < dist[j]) {
            const px = x + COS[j] * rr;
            const py = y + SIN[j] * rr;
            if (pen) ctx.lineTo(px, py);
            else {
              ctx.moveTo(px, py);
              pen = true;
            }
            any = true;
          } else pen = false;
        }
        return any;
      };
      if (mine) EchoCosmetics.strokeWave(ctx, mine, pathAt, a, rp.t, calm, r / R, landingAt(rp, rr)); // (v22.1: how far it has spread, and where it lands)
      else {
        pathAt(0);
        ctx.strokeStyle = tint ? `rgba(${tint},${a * 0.3})` : `rgba(150,215,255,${a * 0.25})`;
        ctx.lineWidth = 9;
        ctx.stroke();
        ctx.strokeStyle = tint ? `rgba(255,190,255,${a})` : `rgba(190,235,255,${a})`;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
    }

    // reveal marks (fading) and the reflected wave travelling back
    const retAlpha = 0.5 * (1 - rr / (2 * R));
    for (let j = 0; j < RAYS; j++) {
      const k = type[j];
      if (!k) continue;
      const d = dist[j];
      if (rr < d) continue;
      const j2 = (j + 1) % RAYS;
      const connect = type[j2] === k && Math.abs(dist[j2] - d) < 22;
      const age = (rr - d) / v;
      let al = Math.exp(-age / 1.3);
      if (rp.ghost && rp.ghost[j]) al *= 0.8 + 0.2 * Math.sin(artT * 11 + j * 0.9); // (17: a ghost wall shimmers, a little)
      if (al > 0.03) {
        const px = x + COS[j] * d;
        const py = y + SIN[j] * d;
        const ai = Math.min(ALPHA_LEVELS - 1, Math.floor(al * ALPHA_LEVELS));
        const b = segBuckets[k][ai];
        if (connect) {
          const qx = x + COS[j2] * dist[j2];
          const qy = y + SIN[j2] * dist[j2];
          b.push(px, py, qx, qy);
          if (k === T_WALL) EchoArt.wallTexture(px, py, qx, qy, COS[j], SIN[j], texBuckets[ai]); // stone joints and the odd crack
        } else b.push(px, py, px, py);
      }
      if (rr < 2 * d && retAlpha > 0.02) {
        const s = 2 * d - rr;
        const s2 = 2 * dist[j2] - rr;
        const px = x + COS[j] * s;
        const py = y + SIN[j] * s;
        const b = retBuckets[k];
        if (connect && s2 > 0) b.push(px, py, x + COS[j2] * s2, y + SIN[j2] * s2);
        else b.push(px, py, px, py);
      }
    }
    for (let k = 1; k < NRAYTYPES; k++) {
      const col = tint || (k === T_WALL && wallRgb) || COLORS[k]; // (v21.0: your ripple's walls in your colour)
      for (let a = 0; a < ALPHA_LEVELS; a++) {
        const al = (a + 0.5) / ALPHA_LEVELS;
        strokeBucket(segBuckets[k][a], `rgba(${col},${al * 0.2})`, LINE_W[k] * 3.2);
        strokeBucket(segBuckets[k][a], `rgba(${col},${al})`, LINE_W[k]);
      }
      strokeBucket(retBuckets[k], `rgba(${col},${retAlpha * 0.3})`, 6);
      strokeBucket(retBuckets[k], `rgba(${col},${retAlpha})`, 1.6);
    }
    for (let a = 0; a < ALPHA_LEVELS; a++) strokeBucket(texBuckets[a], `rgba(${tint ? "255,170,255" : wallRgb ? mine.wallCore : EchoArt.CORE.wall},${((a + 0.5) / ALPHA_LEVELS) * 0.6})`, 1.1);

    // the things the wave found, drawn as themselves (the rays above are their true collision outline)
    for (const ob of rp.objs) {
      if (rr < ob.dmin) continue;
      const al = Math.exp(-(rr - ob.dmin) / v / 1.3);
      if (al > 0.04) drawLit(rp, ob, al * Math.min(1, 0.4 + ob.n / 10) * (tint ? 0.75 : 1));
    }
    if (rp.ambient) ctx.globalAlpha = 1;
  }

  /** Live ripples + bump flashes, in world coordinates (the caller sets the transform). */
  function drawRippleLayer() {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const rp of ripples) drawRipple(rp);

    for (const m of marks) {
      if (m.t < 0) continue; // a reveal still waiting for the wave to reach it
      const a = 1 - m.t / m.life;
      const rad = m.r || 18;
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, rad);
      g.addColorStop(0, `rgba(${m.singer ? singerRgb() : m.c},${a * 0.7})`);
      g.addColorStop(1, `rgba(${m.singer ? singerRgb() : m.c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y, rad, 0, TAU);
      ctx.fill();
      if (m.art) {
        // a puddle, a sonar decoy, or a monster that walked into the wave: drawn as itself, at its true size
        const o = artOpts;
        o.a = a * 0.9;
        o.t = artT;
        o.h = m.h || 0;
        o.seed = EchoArt.seedOf(m.x, m.y);
        o.tell = 'none';
        EchoArt.draw(ctx, m.art, m.x, m.y, m.ar, o);
      } else if (m.puddle) {
        ctx.strokeStyle = `rgba(${m.singer ? singerRgb() : m.c},${a * 0.8})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(m.x, m.y, rad * 0.62, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Smell trails you have left: faint, brighter while one is still being laid, fading out over their last 12 seconds. */
  function drawTrails() {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const tr of level.trails) {
      if (tr.pts.length < 2) continue;
      const pulse = tr.active ? 0.75 + 0.25 * Math.sin(levelTime * 7) : 1;
      const fade = tr.active ? 1 : clamp((tr.expireAt - levelTime) / 12, 0, 1);
      ctx.beginPath();
      ctx.moveTo(tr.pts[0].x, tr.pts[0].y);
      for (let i = 1; i < tr.pts.length; i++) ctx.lineTo(tr.pts[i].x, tr.pts[i].y);
      ctx.strokeStyle = `rgba(${COLORS[T_PUDDLE]},${(tr.active ? 0.22 : 0.1) * pulse * fade})`;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = `rgba(${COLORS[T_PUDDLE]},${(tr.active ? 0.6 : 0.3) * pulse * fade})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawWorld() {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // LEVEL 13 ONLY, and the one exception in the whole game to "you never see anything you have not pinged":
    // the great room glows on its own. It is clipped to the room, and - while you are still outside - to the
    // wedge you could really see through the one gap in its wall, so it never shows a tile you could not have
    // seen. See js/warden.js and the note in CLAUDE.md.
    if (level.warden) warden.draw(ctx, artT);
    // ...and the second exception, level 15's false light, held to exactly the same rule: it is clipped to what
    // the player could really see from where they stand (js/story.js draw, and the note in CLAUDE.md).
    if (level.story) story.draw(ctx, artT);
    // ...and a custom level's own light and red glow zones (v15.1), held to the same rule: clipped to what you could
    // see from where you stand, stone and floor only - never a monster, an object or a way out (js/effects.js)
    if (fxZones.length) {
      EchoEffects.draw(ctx, fxZones, { x: player.x, y: player.y, t: artT, calm, still: EchoWordmark.reduceMotion(), visible: () => visibleFrom(player.x, player.y), view: Math.max(W, H) / viewScale });
      ctx.globalCompositeOperation = 'lighter';
    }

    // the exit only glimmers when you are practically on top of it - and a disguised mimic glimmers identically.
    // (Crouching wipes it - for the mimic too, or the difference would give it away - until your next ripple.)
    // The glow is drawn by one function for both; so is the portal art on top of it (EchoArt 'exit'). The ONLY thing
    // that can differ is `tell` (MODES.mimicTell): 'none' on the real exit, and on a mimic in Hard / Hardcore.
    const glimmerExit = (x, y, r, tell) => {
      if (glimmerOff) return;
      const de = Math.hypot(x - player.x, y - player.y);
      if (de >= 130) return;
      const a = (1 - de / 130) * 0.45;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 46);
      g.addColorStop(0, `rgba(${COLORS[T_EXIT]},${a})`);
      g.addColorStop(1, `rgba(${COLORS[T_EXIT]},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 46, 0, TAU);
      ctx.fill();
      const o = artOpts;
      o.a = Math.min(1, (1 - de / 130) * 0.95);
      o.t = artT;
      o.tell = tell;
      EchoArt.draw(ctx, 'exit', x, y, r, o);
    };
    // (v15.1) a custom level's locked way out glimmers too - as the door it is, by the same rule as the exit's
    const glimmerDoor = (ex) => {
      if (glimmerOff) return;
      const de = Math.hypot(ex.x - player.x, ex.y - player.y);
      if (de >= 130) return;
      const g = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, 46);
      g.addColorStop(0, `rgba(${COLORS[T_EXIT]},${(1 - de / 130) * 0.3})`);
      g.addColorStop(1, `rgba(${COLORS[T_EXIT]},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, 46, 0, TAU);
      ctx.fill();
      const o = artOpts;
      o.a = Math.min(1, (1 - de / 130) * 0.95);
      o.t = artT;
      o.tell = 'none';
      o.swing = ex.swing;
      EchoArt.draw(ctx, 'door', ex.x, ex.y, LOCKED_EXIT_ART_R, o);
      o.swing = 0;
    };
    for (const ex of exitsOf()) {
      if (ex.locked) glimmerDoor(ex); // (v15.1: a locked way out glimmers as the door it is)
      else glimmerExit(ex.x, ex.y, ex.r, 'none');
    }
    for (const e of enemies) if (e.kind === 'mimic') glimmerExit(e.x, e.y, e.r, mimicTell());

    // sonar decoys glimmer pink when you are close: the one lying on the floor, and any you have dropped
    const glimmerDecoy = (x, y, pulse) => {
      const dd = Math.hypot(x - player.x, y - player.y);
      if (dd >= 110) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 30);
      g.addColorStop(0, `rgba(${COLORS[T_DECOY]},${(1 - dd / 110) * 0.55 * pulse})`);
      g.addColorStop(1, `rgba(${COLORS[T_DECOY]},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 30, 0, TAU);
      ctx.fill();
      const o = artOpts;
      o.a = (1 - dd / 110) * 0.9 * pulse;
      o.t = artT;
      o.tell = 'none';
      EchoArt.draw(ctx, 'decoy', x, y, 12, o);
    };
    if (level.decoy && !level.decoy.taken) glimmerDecoy(level.decoy.x, level.decoy.y, 0.7 + 0.3 * Math.sin(levelTime * 5));
    for (const d of decoys) {
      glimmerDecoy(d.x, d.y, d.phase === 'arming' ? 0.6 + 0.4 * Math.sin(d.t * (6 + 10 * (d.t / DECOY_ARM_SECONDS))) : 1);
      if (d.phase === 'active' && d.ring < 0.9) {
        // the call: a pink ring sweeping out to the edge of its reach
        const f = d.ring / 0.9;
        ctx.strokeStyle = `rgba(${COLORS[T_DECOY]},${(1 - f) * 0.5})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(d.x, d.y, DECOY_RADIUS * f, 0, TAU);
        ctx.stroke();
      }
    }

    // a puddle only glimmers when you are practically about to step in it
    for (const p of level.puddles) {
      const dp = Math.hypot(p.x - player.x, p.y - player.y);
      if (dp > 70) continue;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r + 12);
      g.addColorStop(0, `rgba(${COLORS[T_PUDDLE]},${(1 - dp / 70) * 0.5})`);
      g.addColorStop(1, `rgba(${COLORS[T_PUDDLE]},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 12, 0, TAU);
      ctx.fill();
      const o = artOpts;
      o.a = (1 - dp / 70) * 0.9;
      o.t = artT;
      o.tell = 'none';
      o.seed = EchoArt.seedOf(p.x, p.y);
      EchoArt.draw(ctx, 'puddle', p.x, p.y, p.r, o);
    }

    drawTrails();
    drawRippleLayer();
    ctx.globalCompositeOperation = 'lighter';

    // ...and once a ripple has found the warden, it is simply there, over everything (js/warden.js)
    if (level.warden) warden.drawAwake(ctx, artT);

    // ?debug only (__echo.showMuffler): the muffler is NEVER drawn in normal play - here it is, dimly, for testing
    if (debugShowMuffler) {
      for (const e of enemies) {
        if (e.kind !== 'muffler') continue;
        ctx.strokeStyle = 'rgba(200,215,235,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, TAU);
        ctx.moveTo(e.x - e.r * 1.5, e.y);
        ctx.lineTo(e.x + e.r * 1.5, e.y);
        ctx.stroke();
      }
    }

    // the player: a small pale dot with a faint halo (smaller and dimmer while crouching)
    const low = !!player.crouching;
    const fall = a2Falling ? Math.max(0, 1 - a2Falling.t / FALL_SECONDS) : 1; // (v18.0: falling away into the void)
    ctx.globalAlpha = fall;
    const g = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, 30);
    g.addColorStop(0, `rgba(200,235,255,${low ? 0.07 : 0.16})`);
    g.addColorStop(1, 'rgba(200,235,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 30, 0, TAU);
    ctx.fill();
    // (v21.0) your marker: the classic dot, or the one you have equipped (js/cosmetics.js) - the same size, the same halo
    EchoCosmetics.drawMarker(ctx, cosLook ? cosLook.marker : 'dot', player.x, player.y, (low ? 3.2 : 4.5) * (0.3 + 0.7 * fall), low, artT, calm);
    ctx.globalAlpha = 1;
    if (cooldown > 0) {
      const p = 1 - cooldown / cfg.cooldown;
      ctx.strokeStyle = 'rgba(150,215,255,0.32)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 12, -Math.PI / 2, -Math.PI / 2 + TAU * p);
      ctx.stroke();
    }
    if (player.hasKey) {
      // level 14: the key you are carrying, small, at your side - so you can see that you have it
      const o = artOpts;
      o.a = 0.85;
      o.t = artT;
      o.tell = 'none';
      EchoArt.draw(ctx, 'key', player.x + 13, player.y - 11, 6, o);
    }
    if (player.smell > 0) {
      // smelly: a lime halo, and a ring that drains as you walk (it holds still while you stand still)
      const f = player.smell / cfg.smellSeconds;
      const sg = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, 34);
      sg.addColorStop(0, `rgba(${COLORS[T_PUDDLE]},0.22)`);
      sg.addColorStop(1, `rgba(${COLORS[T_PUDDLE]},0)`);
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 34, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(${COLORS[T_PUDDLE]},0.75)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * f);
      ctx.stroke();
    }
    // (v17.0) Act 2: a hidden wall just found, a ghost one just gone - and the void eating the edges of the map
    if (level.act2) {
      act2Draw();
      voidDraw(); // (v18.0)
      story.drawVoid(ctx, artT, levelTime);
    }
    // Visual cues (accessibility): small glyphs on a ring about 45px (on screen) around you, one per audible sound
    if (visualCues) cues.draw(player.x, player.y, 1 / viewScale);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawTitleBackdrop() {
    ctx.globalCompositeOperation = lightUiOn() ? 'source-over' : 'lighter';
    for (const r of titleRipples) {
      const rad = r.t * 240 * DPR;
      const a = Math.max(0, 1 - r.t / 6) * 0.35;
      ctx.strokeStyle = lightUiOn() ? `rgba(38,102,70,${a})` : `rgba(95,212,255,${a})`;
      ctx.lineWidth = 1.5 * DPR;
      ctx.beginPath();
      ctx.arc(r.x * DPR, r.y * DPR, rad, 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function draw() {
    if (state === 'cutscene') {
      cutscene.draw();
      return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = state === 'title' && lightUiOn() ? '#f3efe3' : '#010206'; // (v19.1: the daylight interface's title)
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (state === 'title') {
      drawTitleBackdrop();
      return;
    }
    if (!level) return;
    // (v19.0) DAYLIGHT: no dark and no sonar - the field is simply there (and the white it fades in from)
    if (levelFlag('daylight')) {
      drawDaylight();
      if (level.story) story.veil(ctx, canvas.width, canvas.height);
      return;
    }

    const s = viewScale * DPR;
    // level 13 adds its own tremor on top of the game's (and none at all in calm mode - see js/warden.js)
    const sh = shake + (level.warden ? warden.shake() : 0) + (level.story ? story.shake() : 0); // (and 14-16's, none in calm mode)
    const sx = (Math.random() - 0.5) * sh * DPR;
    const sy = (Math.random() - 0.5) * sh * DPR;
    ctx.setTransform(s, 0, 0, s, canvas.width / 2 - camX * s + sx, canvas.height / 2 - camY * s + sy);
    drawWorld();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // red creep at the edges when a monster is near, a flash when caught, and a faint pulse on a near miss
    // (calm mode keeps the near miss, at about a third of the light, the way it keeps the heartbeat's cue)
    const nm = nearMiss > 0 ? Math.sin(Math.PI * Math.min(1, nearMiss)) * (calm ? 0.3 : 0.75) : 0;
    const dv = (calm ? 0 : danger * (0.55 + 0.45 * beat)) + nm * 0.5; // calm mode: no red creep of its own
    if (dv > 0.01 || flash > 0.01) {
      const cw = canvas.width;
      const ch = canvas.height;
      const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.25, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.6);
      g.addColorStop(0, 'rgba(255,30,60,0)');
      g.addColorStop(1, `rgba(255,30,60,${Math.min(0.5, dv * 0.4 + flash * 0.5)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
    }
    // level 13: the dread vignette tightening, the reveal's flash, and the fade to black at the end of it
    if (level.warden) warden.veil(ctx, canvas.width, canvas.height);
    // levels 14-16: the dark each one opens and closes in, and level 15's reveal
    if (level.story) story.veil(ctx, canvas.width, canvas.height);
  }

  // -------------------------------------------------------------- (v19.0) DAYLIGHT: the outside
  /**
   * A level with the daylight flag (Outside 1): everything around you, drawn as it is - grass in patches, a worn path,
   * flowers, the edge of the field, trees you walk under, the sun beyond the gap in them - and you, seen for the
   * first time. Only what is on screen is drawn (a few hundred rectangles, the trees in view), so it is cheap on a
   * phone. Drawing only: nothing here is read by anything else.
   */
  function drawDaylight() {
    const D = EchoPalette.daylight;
    const f = level.field;
    const cw = canvas.width;
    const ch = canvas.height;
    const s = viewScale * DPR;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = D.hedge;
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(s, 0, 0, s, cw / 2 - camX * s, ch / 2 - camY * s);
    const W = level.W;
    const x0 = Math.max(0, Math.floor((camX - cw / 2 / s) / TILE));
    const x1 = Math.min(W - 1, Math.floor((camX + cw / 2 / s) / TILE));
    const y0 = Math.max(0, Math.floor((camY - ch / 2 / s) / TILE));
    const y1 = Math.min(level.H - 1, Math.floor((camY + ch / 2 / s) / TILE));
    // the grass, in its patches; the edge of the field
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = ty * W + tx;
        ctx.fillStyle = level.walls[i] && !(f && f.built && f.built[i]) ? D.hedge : D.grass[f ? f.shade[i] : 2]; // (v19.2: a house or a fence stands on grass)
        ctx.fillRect(tx * TILE, ty * TILE, TILE + 0.5, TILE + 0.5);
      }
    }
    if (f) {
      // the worn path, and a few flowers
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const i = ty * W + tx;
          const w = f.path[i];
          if (w > 0.02) {
            ctx.fillStyle = `rgba(${D.path},${0.6 * w})`;
            ctx.fillRect(tx * TILE, ty * TILE, TILE + 0.5, TILE + 0.5);
          }
          if (f.flower[i]) {
            ctx.fillStyle = D.flowers[f.flower[i] - 1];
            const h = (i * 2654435761) >>> 0;
            for (let k = 0; k < 3; k++) {
              ctx.beginPath();
              ctx.arc(tx * TILE + 8 + ((h >> (k * 5)) & 23), ty * TILE + 8 + ((h >> (k * 5 + 9)) & 23), 2.2, 0, TAU);
              ctx.fill();
            }
          }
        }
      }
    }
    if (f && f.props) drawVillage(D, f, x0, x1, y0, y1); // (v19.2) the village: its houses, fences, well and stalls
    // the way on: sunlight beyond the gap in the trees
    const ex = level.exit;
    if (!(f && f.dusk)) {
      const glow = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, 150);
      glow.addColorStop(0, `rgba(${D.light},0.55)`);
      glow.addColorStop(1, `rgba(${D.light},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, 150, 0, TAU);
      ctx.fill();
    }
    const vx0 = camX - cw / 2 / s - 80;
    const vx1 = camX + cw / 2 / s + 80;
    const vy0 = camY - ch / 2 / s - 80;
    const vy1 = camY + ch / 2 / s + 80;
    const seen = f ? f.trees.filter((t) => t.x > vx0 && t.x < vx1 && t.y > vy0 && t.y < vy1) : [];
    // the trees' shadows on the grass, then you, then their canopies over you
    ctx.fillStyle = D.shadow;
    for (const t of seen) {
      ctx.beginPath();
      ctx.ellipse(t.x + t.r * 0.22, t.y + t.r * 0.28, t.r * 0.95, t.r * 0.8, 0, 0, TAU);
      ctx.fill();
    }
    if (f && f.people) drawVillagers(D, vx0, vx1, vy0, vy1); // (v19.2) its people
    drawWalker(D);
    for (const t of seen) {
      const under = Math.hypot(player.x - t.x, player.y - t.y) < t.r * 0.95;
      ctx.globalAlpha = under ? 0.5 : 1; // you, under it: still seen through the leaves
      const sway = Math.sin(artT * 0.7 + t.tone * 9) * 1.2;
      ctx.fillStyle = D.canopy[0];
      ctx.beginPath();
      ctx.arc(t.x + sway, t.y, t.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = D.canopy[1 + Math.floor(t.tone * 2)];
      ctx.beginPath();
      ctx.arc(t.x - t.r * 0.18 + sway, t.y - t.r * 0.2, t.r * 0.72, 0, TAU);
      ctx.fill();
      ctx.fillStyle = D.canopy[3];
      ctx.beginPath();
      ctx.arc(t.x - t.r * 0.32 + sway, t.y - t.r * 0.36, t.r * 0.34, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (f && f.dusk) drawDusk(D, cw, ch, s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  /**
   * (v19.3) DUSK: the day draining out over everything drawn so far - a warm, violet dusk, a deep blue night, then
   * black: the ground, the grass and the trees gone - and in it only you, and far ahead the Warden in its faint glow.
   * Three full-screen fills and one glow: cheap on a phone. Drawing only (js/story.js dusk() says how dark).
   */
  function drawDusk(D, cw, ch, s) {
    const dk = story.dusk();
    if (!dk) return;
    const inv = 1 / s;
    const x0 = camX - (cw / 2) * inv;
    const y0 = camY - (ch / 2) * inv;
    const fill = (rgb, a) => {
      if (a <= 0.003) return;
      ctx.fillStyle = `rgba(${rgb},${a})`;
      ctx.fillRect(x0 - 10, y0 - 10, cw * inv + 20, ch * inv + 20);
    };
    fill('78,34,70', 0.34 * dk.s1 * (1 - dk.s2)); // dusk
    fill('8,12,34', 0.8 * dk.s2); // night
    fill('1,2,6', dk.s3); // nothing
    // you, in the dark: still there
    if (dk.s2 > 0.01) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, dk.s2) * 0.85;
      drawWalker(D);
      ctx.restore();
    }
    // the Warden, still, in a faint pale glow of its own
    const K = dk.keeper;
    if (Math.abs(K.x - camX) < cw * inv && Math.abs(K.y - camY) < ch * inv) {
      const lit = 0.25 + 0.75 * dk.s2;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(K.x, K.y, 0, K.x, K.y, 130);
      g.addColorStop(0, `rgba(200,210,226,${0.2 * lit})`);
      g.addColorStop(0.5, `rgba(170,182,204,${0.07 * lit})`);
      g.addColorStop(1, 'rgba(150,160,180,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(K.x, K.y, 130, 0, TAU);
      ctx.fill();
      EchoWarden.drawHunter(ctx, K.x, K.y, 18, { a: 0.9 * lit, t: artT, h: dk.h, variant: 'regular' });
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  /** You, from above: shoulders, a head, walking - the first time you are really seen. */
  function drawWalker(D) {
    const stride = Math.sin(player.stepDist / 30 * Math.PI * 2) * (keysMoving() ? 3.2 : 0);
    drawFigure(D, player.x, player.y, player.face === undefined ? 0 : player.face, stride, D.body, D.bodyEdge, D.hair, 1, 1);
  }
  /** (v19.2) Anyone, from above, drawn as you are: you (drawWalker) and the villagers. `k` is their size (a child is smaller). */
  function drawFigure(D, x, y, a, stride, body, edge, hair, alpha, k) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.fillStyle = D.shadow;
    ctx.beginPath();
    ctx.ellipse(2, 3, 11, 8, 0, 0, TAU);
    ctx.fill();
    ctx.rotate(a);
    // feet, stepping
    ctx.fillStyle = edge;
    ctx.beginPath();
    ctx.ellipse(stride, -4.5, 3.4, 2.4, 0, 0, TAU);
    ctx.ellipse(-stride, 4.5, 3.4, 2.4, 0, 0, TAU);
    ctx.fill();
    // shoulders
    ctx.fillStyle = body;
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.6, 9, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // head, and hair at the back of it
    ctx.fillStyle = D.head;
    ctx.beginPath();
    ctx.arc(1.2, 0, 4.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(0.2, 0, 4.4, Math.PI * 0.55, Math.PI * 1.45);
    ctx.fill();
    ctx.restore();
  }

  // -------------------------------------------------------------- (v19.2) FRESH AIR: the village
  /** The village's made things, drawn over the grass where they stand (js/story.js VILLAGE): cottages, fences, the square. */
  function drawVillage(D, f, x0, x1, y0, y1) {
    const V = D.village;
    const P = f.props;
    const T = TILE;
    const inView = (ax, ay, bx, by) => bx >= x0 - 1 && ax <= x1 + 1 && by >= y0 - 1 && ay <= y1 + 1;
    // the vegetable garden: rows of soil
    for (const g of P.gardens) {
      if (!inView(g.x0, g.y0, g.x1, g.y1) || g !== P.gardens[0]) continue;
      ctx.fillStyle = V.soil;
      for (let y = g.y0 + 1; y < g.y1; y++) ctx.fillRect((g.x0 + 1) * T + 4, y * T + 13, (g.x1 - g.x0 - 1) * T - 8, 14);
    }
    // fences: a post on every tile, rails to the next one
    const fence = new Set(P.fences.map(([x, y]) => y * f.W + x));
    ctx.strokeStyle = V.fence;
    ctx.fillStyle = V.fence;
    ctx.lineWidth = 3;
    for (const [x, y] of P.fences) {
      if (x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1) continue;
      const cx = (x + 0.5) * T;
      const cy = (y + 0.5) * T;
      ctx.beginPath();
      if (fence.has(y * f.W + x + 1)) {
        ctx.moveTo(cx, cy - 3);
        ctx.lineTo(cx + T, cy - 3);
        ctx.moveTo(cx, cy + 3);
        ctx.lineTo(cx + T, cy + 3);
      }
      if (fence.has((y + 1) * f.W + x)) {
        ctx.moveTo(cx - 3, cy);
        ctx.lineTo(cx - 3, cy + T);
        ctx.moveTo(cx + 3, cy);
        ctx.lineTo(cx + 3, cy + T);
      }
      ctx.stroke();
      ctx.fillRect(cx - 4, cy - 4, 8, 8);
    }
    // the cottages: a shadow, the roof seen from above (two slopes and a ridge), a chimney, the door
    for (const h of P.houses) {
      if (!inView(h.x, h.y, h.x + h.w, h.y + h.h)) continue;
      const X = h.x * T;
      const Y = h.y * T;
      const W = h.w * T;
      const H = h.h * T;
      const [lit, dark] = V.roof[h.roof];
      ctx.fillStyle = D.shadow;
      ctx.fillRect(X + 8, Y + 10, W, H);
      ctx.fillStyle = lit;
      ctx.fillRect(X - 3, Y - 3, W + 6, H / 2 + 3);
      ctx.fillStyle = dark;
      ctx.fillRect(X - 3, Y + H / 2, W + 6, H / 2 + 3);
      ctx.strokeStyle = 'rgba(40,24,16,0.18)'; // the tiles' courses
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let yy = Y + 9; yy < Y + H; yy += 12) {
        ctx.moveTo(X - 3, yy);
        ctx.lineTo(X + W + 3, yy);
      }
      ctx.stroke();
      ctx.fillStyle = V.ridge;
      ctx.fillRect(X - 3, Y + H / 2 - 2.5, W + 6, 5);
      ctx.fillStyle = V.chimney;
      ctx.fillRect(X + W * 0.72, Y + H * 0.16, 16, 16);
      ctx.fillStyle = V.door;
      const [dx, dy] = h.door;
      const below = dy >= h.y + h.h;
      ctx.fillRect(dx * T + 9, below ? Y + H - 2 : Y - 5, 22, 7);
    }
    // the stalls: a table under a striped awning
    for (const st of P.stalls) {
      if (!inView(st.x, st.y, st.x + st.w, st.y + 1)) continue;
      const X = st.x * T;
      const Y = st.y * T;
      const [a, b] = V.awning[st.tone];
      ctx.fillStyle = D.shadow;
      ctx.fillRect(X + 6, Y + 8, st.w * T, T);
      for (let k = 0; k < st.w * 4; k++) {
        ctx.fillStyle = k % 2 ? b : a;
        ctx.fillRect(X - 2 + k * (T / 4), Y - 2, T / 4 + 0.5, T + 4);
      }
    }
    // the well
    const w = P.well;
    if (inView(w.x, w.y, w.x + 1, w.y + 1)) {
      const cx = (w.x + 0.5) * T;
      const cy = (w.y + 0.5) * T;
      ctx.fillStyle = D.shadow;
      ctx.beginPath();
      ctx.arc(cx + 4, cy + 5, 19, 0, TAU);
      ctx.fill();
      ctx.fillStyle = V.stone;
      ctx.strokeStyle = V.stoneEdge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = V.water;
      ctx.beginPath();
      ctx.arc(cx, cy, 10.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = V.wood;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 21, cy);
      ctx.lineTo(cx + 21, cy);
      ctx.stroke();
    }
    // the bench
    const bn = P.bench;
    ctx.fillStyle = V.wood;
    ctx.fillRect((bn.x - 0.5) * T, (bn.y + 0.5) * T - 5, T * 1.4, 10);
    // the washing line, and what has been hung on it so far today
    const ln = P.line;
    ctx.strokeStyle = V.wood;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo((ln.x0 + 0.5) * T, (ln.y + 0.5) * T);
    ctx.lineTo((ln.x1 + 0.5) * T, (ln.y + 0.5) * T);
    ctx.stroke();
    ctx.fillStyle = V.wood;
    ctx.fillRect((ln.x0 + 0.5) * T - 3, (ln.y + 0.5) * T - 3, 6, 6);
    ctx.fillRect((ln.x1 + 0.5) * T - 3, (ln.y + 0.5) * T - 3, 6, 6);
    const washer = (story.villagers() || []).find((v) => v.what === 'washing');
    const hung = washer ? washer.ev.filter((e) => e.snd === 'cloth' && e.t <= washer.phase).length : 0;
    for (let k = 0; k < hung; k++) {
      const cx = (ln.x0 + 0.5 + 0.5 + k * 1.6 * (ln.x1 - ln.x0 - 1) / 4.8) * T;
      const sway = Math.sin(artT * 1.3 + k * 1.7) * 1.5;
      ctx.globalAlpha = washer.alpha;
      ctx.fillStyle = V.cloth[k % V.cloth.length];
      ctx.fillRect(cx - 9 + sway, (ln.y + 0.5) * T - 1, 18, 11);
      ctx.globalAlpha = 1;
    }
    // the gate, open, at the far end of the street
    const gt = P.gate;
    if (inView(gt.x, gt.y, gt.x + 2, gt.y + 1)) {
      const gx = (gt.x + 1) * T;
      ctx.fillStyle = 'rgba(' + D.path + ',0.6)';
      ctx.fillRect(gx, gt.y * T, T, T);
      ctx.fillStyle = V.fence;
      ctx.fillRect(gx - 4, gt.y * T - 6, 8, 10);
      ctx.fillRect(gx - 4, (gt.y + 1) * T - 4, 8, 10);
      ctx.strokeStyle = V.fence;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(gx, gt.y * T);
      ctx.lineTo(gx + T * 0.7, gt.y * T - T * 0.55);
      ctx.stroke();
    }
  }
  /** The villagers, where they are in their day (js/story.js updateVillage), and what each is busy with. */
  function drawVillagers(D, vx0, vx1, vy0, vy1) {
    const V = D.village;
    for (const v of story.villagers()) {
      if (!(v.x > vx0 && v.x < vx1 && v.y > vy0 && v.y < vy1)) continue;
      const k = v.small ? 0.72 : 1;
      if (v.what === 'ball') {
        // the ball: off the foot, to the wall and back, once a kick
        const u = ((v.phase - 0.2) / 1.7 % 1 + 1) % 1;
        const d = 10 + 56 * Math.sin(Math.PI * u);
        ctx.globalAlpha = v.alpha;
        ctx.fillStyle = V.ball;
        ctx.beginPath();
        ctx.arc(v.x + Math.cos(v.face) * d, v.y + Math.sin(v.face) * d, 4, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      drawFigure(D, v.x, v.y, v.face, v.stride * 3.2, v.clothes.body, v.clothes.edge, v.hair, v.alpha, k);
      ctx.globalAlpha = v.alpha;
      if (v.what === 'water') {
        ctx.fillStyle = V.stoneEdge; // the bucket, at their side
        ctx.beginPath();
        ctx.arc(v.x - Math.sin(v.face) * 11, v.y + Math.cos(v.face) * 11, 3.6, 0, TAU);
        ctx.fill();
      } else if (v.what === 'broom') {
        ctx.strokeStyle = V.wood; // the broom, out in front, swept side to side
        ctx.lineWidth = 2;
        const s = Math.sin(artT * 5.7) * 0.5;
        ctx.beginPath();
        ctx.moveTo(v.x, v.y);
        ctx.lineTo(v.x + Math.cos(v.face + s) * 18, v.y + Math.sin(v.face + s) * 18);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  const keysMoving = () => MOVE_ACTIONS.some((k) => act(k)) || (touch.vec().x !== 0 || touch.vec().y !== 0);

  // -------------------------------------------------------------- UI / flow
  /**
   * SCREEN CHANGES. Two things move: an overlay cross-fades in or out (`showOverlay`), and a screen change that
   * swaps what the CANVAS is showing is run behind a black veil (`go`). The numbers here mirror --ui-fade in
   * style.css, and calm mode (and "reduce motion") slow them down - the movement is softened, never removed.
   */
  const FADE_MS = 300;
  const FADE_MS_CALM = 420;
  const fadeMs = () => (calm || EchoWordmark.reduceMotion() ? FADE_MS_CALM : FADE_MS);
  const veilMs = () => Math.round(fadeMs() * 0.55); // out and back again is one fade
  let overlayHideTimer = null;
  let transitioning = false;

  function showOverlay(id) {
    clearTimeout(overlayHideTimer);
    document.body.classList.toggle('on-title', state === 'title'); // (v15.5: as soon as a screen changes - the frame keeps it true after)
    for (const o of overlays) {
      const el = $(o);
      if (o === id) {
        el.classList.remove('hidden');
        // Lay it out at opacity 0 FIRST, so the fade has a starting point. This is a forced reflow rather than
        // a rAF because animation frames stop in a hidden or backgrounded tab - and a screen that only appears
        // once a frame runs is a screen that can fail to appear at all.
        void el.offsetWidth;
        el.classList.add('in');
      } else {
        el.classList.remove('in');
      }
    }
    // the ones on their way out keep their place until they have finished fading (they cannot be clicked: see
    // `.overlay:not(.in)` in style.css)
    overlayHideTimer = setTimeout(() => {
      for (const o of overlays) if (o !== id) $(o).classList.add('hidden');
    }, fadeMs());
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  /**
   * A screen change the player asked for: fade to black, do it, fade back. Only ever called from an input
   * handler (or the end of a cutscene), never from inside the flow functions - so `startLevel`, `toTitle`,
   * `advanceLevel` and the ?debug hooks all stay synchronous and the tests are unaffected.
   *
   * Anything that has to make or resume sound has ALREADY done it by the time this runs: the click handlers
   * call `audio.init()` themselves, before this, so the AudioContext is created in the gesture that created it
   * and nothing here can delay Begin. A second press while a fade is running is ignored rather than queued.
   */
  function go(fn) {
    if (transitioning) return false;
    const veil = $('veil');
    if (!veil) {
      fn();
      return true;
    }
    transitioning = true;
    veil.classList.add('on');
    const half = veilMs();
    setTimeout(() => {
      try {
        fn();
      } finally {
        veil.classList.remove('on');
        setTimeout(() => {
          transitioning = false;
        }, half);
      }
    }, half);
    return true;
  }

  /**
   * A number in the HUD that has changed: write it and give it one quick tick (a 260 ms scale pulse), so it
   * moves rather than snapping. Only called when the text really is different, so the ripple counter ticks
   * once per ripple and the level number once per level - nothing here can repeat fast enough to flash.
   */
  const hudShown = Object.create(null);
  function hudNumber(id, text, pulse = true) {
    if (hudShown[id] === text) return;
    const first = hudShown[id] === undefined;
    hudShown[id] = text;
    const el = $(id);
    el.textContent = text;
    if (!pulse || first) return;
    el.classList.remove('tick');
    void el.offsetWidth; // restart the animation from the top
    el.classList.add('tick');
  }

  function updateHud() {
    // the tutorial is not a level and is the same in every mode, so it says neither; a custom level says its name
    hudNumber('hud-level', inTutorial() ? 'Tutorial' : endlessRun ? `Depth ${endlessRun.depth} · ${MODES[mode].label}` : customRun ? `${customRun.from === 'editor' ? 'Test play' : customTitle()} · ${modeLabel()}` : `${levelName(levelNum)} · ${MODES[mode].label}`);
    hudNumber('hud-ripples', `Ripples ${ripplesUsed}`);
    hudNumber('hud-time', showTimer && scored() ? mmss(levelTime) : '', false); // the clock ticks; it does not pulse
    $('hud-item').textContent = player && player.hasDecoy ? (touchOn ? 'Sonar decoy · ITEM' : 'Sonar decoy · E') : player && player.hasKey ? 'Key' : '';
    $('hud-item').classList.toggle('key', !!(player && player.hasKey)); // (level 14: in the key's own colour)
    $('hud-crouch').textContent = player && player.crouching ? 'Crouching' : '';
    $('hud-audio').textContent = [calm ? 'Calm' : '', visualCues ? 'Visual cues' : '', audio.muted ? 'Sound off' : ''].filter(Boolean).join(' · ');
  }

  /**
   * A hint names keys as {ripple} / {item} / {crouch} and they are filled in from the player's OWN bindings
   * (Settings -> Controls), so a hint never tells them to press a key they have changed.
   */
  const hintText = (s) => s.replace(/\{(\w+)\}/g, (_, a) => EchoProfile.keysText(a).toUpperCase());

  function showBanner(n) {
    const el = $('banner');
    if (n === CUSTOM_LEVEL && customRun) {
      // a custom level (v15.0): its own title, and a reminder that nothing in it is kept
      $('banner-title').textContent = customRun.from === 'editor' ? 'Test play' : customTitle();
      $('banner-text').textContent =
        customRun.from === 'editor'
          ? 'Nothing you do here is saved. Esc to pause and go back to the editor.'
          : customRun.from === 'bonus'
            ? 'A bonus level. Nothing here counts towards your progress, medals or stats.'
            : 'Made in the level editor. Nothing here counts towards your progress, medals or stats.';
      el.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => el.classList.remove('show'), 4500);
      return;
    }
    if (n >= WARDEN_LEVEL && loreReader.state()) {
      // (v16.2) a fragment's line is up (they share the place): the hint waits until it has gone
      loreBannerBack = { n, title: levelName(n), text: hintText(HINTS[n] || GENERIC_HINTS[n % GENERIC_HINTS.length]) };
      return;
    }
    $('banner-title').textContent = levelName(n);
    $('banner-text').textContent = hintText(HINTS[n] || GENERIC_HINTS[n % GENERIC_HINTS.length]);
    el.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.classList.remove('show'), n === 1 ? 9000 : 4500);
  }

  /** `retrying` = the same level again after being caught, which is what costs you the Flawless medal. */
  function startLevel(n, retrying = false, part = 1) {
    if (!retrying) levelPart = part; // (v18.0) 24's second part: kept for a Try again, nothing else
    nextPartPending = false;
    a2Falling = null;
    a2Tile = -1;
    deadSeen = new Map();
    crumbleLit = new Map();
    a2CreepNext = 0;
    screamLog = []; // (v15.7, ?debug only)
    destroyVoices();
    warden.stop(); // level 13's drone, if the last level was it
    story.stop(); // ...and levels 14-16's beats and sounds
    scriptLock = false;
    scriptWalk.x = 0;
    scriptWalk.y = 0;
    storyDone = false;
    wardenCleared = false;
    wardenSaved = false;
    if (!retrying) levelDeaths = 0;
    levelNum = n;
    // Hardcore keeps a high score even for a run that dies on level 1. (Never for the tutorial: it is not a level.)
    if (scored() && MODES[mode].oneLife && !progress[mode]) {
      progress[mode] = 1;
      store.set(PROGRESS_KEY, JSON.stringify(progress));
    }
    if (n === CUSTOM_LEVEL) {
      // A custom level (v15.0): built from its data by the engine's custom-level loader (buildCustomLevel, js/level.js),
      // which reads it as untrusted and hands back the same shape as the hand-drawn levels 13-16 - so from here on it
      // is played by exactly the same code. It never has a lore fragment. (playCustom has already checked it can be
      // built; if it somehow cannot, nothing starts and the editor's screens come back with the reason.)
      const built = customRun ? buildCustomLevel(customRun.doc) : { error: 'There is no level to play.' };
      if (!built.level) {
        leaveCustom(built.error);
        return;
      }
      level = built.level;
      level.fragment = null;
      // (v15.1) its own colours - but only over the game's Default palette: a player who has picked a palette for
      // their eyes (colour-blind, high contrast) keeps it everywhere, custom levels included
      borrowPalette(level.custom.palette);
      fxZones = EchoEffects.prepare(level.effects, level.walls, level.W, level.H, TILE);
    } else if (n === ENDLESS_LEVEL) {
      // (v20.0) a depth of an Endless run: the campaign's generator on Endless's own config, from (run seed, depth) -
      // re-rolled until it passes the fairness rules (generateEndless, js/level.js). No lore, no hints, no story.
      fxZones = [];
      returnPalette();
      level = generateEndless(endlessRun.seed, endlessRun.depth, mode, { alarm: alarmMet() });
      level.fragment = null;
    } else {
      fxZones = [];
      returnPalette();
      level = generateLevel(n, runSeed, mode, levelPart);
      // The level's lore fragment, if this maze has one (js/lore.js). Placed AFTER the level is finished, from
      // its own random stream, reading the level and writing nothing to it - so it can move nothing else.
      level.fragment = EchoLore.place(level, n, mode, runSeed);
    }
    loreReader.hide();
    loreBannerBack = null;
    refreshCosmetics(); // (v21.0) what you wear in this level
    cfg = level.cfg;
    player = {
      x: level.start.x,
      y: level.start.y,
      r: PLAYER_R,
      stepDist: 0,
      bumpCd: 0,
      blocked: false,
      smell: 0, // seconds of WALKING left of being smelly (after stepping in a puddle)
      trail: null, // the smell trail being laid right now
      justLeft: null, // the trail you finished laying most recently, until you step off it
      trailCd: 0, // seconds until a trail can make you smelly again (TRAIL_RESMELL_COOLDOWN)
      inPuddle: false,
      hasDecoy: false, // carrying a sonar decoy (level 9+): E drops it
      hasKey: false, // level 14: carrying the gaol's key (js/story.js)
      crouching: false, // Shift held (see syncCrouch): silent, and cannot send a ripple
    };
    enemies = level.enemies.map(makeEnemy);
    // A custom level's Wardens (v15.0) have no story beat to wake them: they hunt from the moment it starts. What
    // each one is (its speed, its look) is its variant's (js/warden.js), exactly as on levels 15 and 16.
    // (v15.1: at its variant's speed scaled by the level's own monster-speed setting, never past CUSTOM_WARDEN_TOP)
    if (level.custom) {
      for (const e of enemies) {
        if (e.kind !== 'warden') continue;
        e.speed = wardenSpeedFraction(e.variant, cfg.difficulty) * WALK_SPEED;
        wakeWarden(e, e.variant === 'regular' ? 'hunt' : e.variant);
      }
    }
    decoys = [];
    decoyBlipTimer = 1.5;
    singerLanded = false;
    glimmerOff = false;
    ripples = [];
    marks = [];
    foldSpawns = []; // (v17.0: Act 2's own things in flight)
    a2Flashes = [];
    foldArmed = true;
    foldHome = -1;
    cooldown = 0;
    levelTime = 0;
    ripplesUsed = 0;
    beaconTimer = 1;
    heartTimer = 0;
    cueBeatTimer = 0;
    cues.clear();
    danger = 0;
    beat = 0;
    flash = 0;
    shake = 0;
    camX = player.x;
    camY = player.y;
    state = 'play';
    // (a custom level sounds like the level its tuning comes from - CUSTOM_CURVE_LEVEL, js/level.js)
    if (levelFlag('daylight')) {
      // (v19.0) outside: no cave drone and no score - the wind and the birds are the level's sound (js/story.js)
      audio.stopAmbient();
      music.stop();
    } else {
      const soundOf = level.custom ? CUSTOM_CURVE_LEVEL : level.endless ? level.cfg.n : n; // (v20.0: a depth sounds like the level its curve is)
      audio.startAmbient(soundOf);
      music.start(soundOf); // the level's own mood (js/music.js); silent until the AudioContext exists
    }
    showOverlay(null);
    $('hud').classList.remove('hidden');
    updateHud();
    // The tutorial has prompts of its own instead of a level banner, and they start the moment you can move.
    // (v15.1: a custom level opens on its title card - the first time only, not on a Try again - and its banner
    // comes when the card goes.)
    if (level.custom && !retrying) startCard();
    else if (inTutorial() || level.story) {
      // (levels 14-16 show their banner themselves, when their opening beat hands over the controls)
      clearTimeout(bannerTimer);
      $('banner').classList.remove('show'); // never leave a level's banner hanging over a tutorial prompt
      if (inTutorial()) tutorial.start();
    } else if (level.endless) {
      // (v20.0) Endless: no banner, no hint - the HUD says the depth
      clearTimeout(bannerTimer);
      $('banner').classList.remove('show');
    } else showBanner(n);
    // Level 13: the dread starts with the level, and the capture plays IN FULL every time it is finished.
    // It is the one cutscene in the game that is not once-only (owner's instruction): the other seven are
    // somebody else's memory, and this one is what happens to you.
    if (level.warden) warden.start(level);
    // Levels 14-16: each opens with its own beat in the dark (js/story.js), every time - like level 13's.
    if (level.story) story.start(level);
  }

  // ------------------------------------------------- custom levels: the title card (v15.1)
  /**
   * A custom level opens on a card: its title, the line its maker wrote for it (if any) and its difficulty. While
   * it is up the level WAITS - state 'card', nothing simulates, nothing can find you - and any key, click or tap
   * (or a few seconds) takes it away and the level begins. Its words are plain text: they were cleaned when the
   * level was read (js/levelformat.js) and are only ever set with textContent.
   */
  const CARD_SECONDS = 2.4; // with no line of its own
  const CARD_SECONDS_LINE = 3.6; // with one, to read it
  function startCard() {
    const c = level.custom;
    state = 'card';
    cardTimer = c.card ? CARD_SECONDS_LINE : CARD_SECONDS;
    clearTimeout(bannerTimer);
    $('banner').classList.remove('show');
    const q = customRun && customRun.queue;
    $('card-kicker').textContent = customRun && customRun.from === 'editor' ? 'Test play' : customRun && customRun.from === 'bonus' ? 'Bonus level' : q ? `${q.name} · ${q.index + 1} of ${q.ids.length}` : 'My Levels';
    $('card-title').textContent = c.title;
    $('card-line').textContent = c.card || '';
    $('card-line').classList.toggle('hidden', !c.card);
    $('card-diff').textContent = `Difficulty: ${EchoLevelFormat.ratingLabel(c.rating)}`;
    $('card-hint').textContent = touchOn ? 'Tap to begin' : 'Press any key to begin';
    const el = $('card');
    el.classList.remove('hidden');
    void el.offsetWidth;
    el.classList.add('show');
  }
  function endCard() {
    if (state !== 'card') return;
    state = 'play';
    cardTimer = 0;
    const el = $('card');
    el.classList.remove('show');
    setTimeout(() => !el.classList.contains('show') && el.classList.add('hidden'), fadeMs());
    showBanner(levelNum);
  }
  function hideCard() {
    cardTimer = 0;
    $('card').classList.remove('show');
    $('card').classList.add('hidden');
  }

  /** (v15.1) A custom level's palette over the player's Default one - put back the moment it is over. */
  function borrowPalette(id) {
    const own = EchoProfile.getPalette();
    const want = id && (own === 'default' || !own) && EchoLevelFormat.paletteIds().includes(id) ? id : null;
    if (want && EchoPalette.id !== want) {
      EchoPalette.set(want);
      paletteBorrowed = true;
    } else if (!want) returnPalette();
  }
  function returnPalette() {
    if (!paletteBorrowed) return;
    paletteBorrowed = false;
    EchoPalette.set(EchoProfile.getPalette());
  }

  // ----------------------------------------------------------- the tutorial
  /**
   * Level 0. `after` says where it goes when it is over: 'intro' (a brand-new player who pressed Begin - the
   * intro cutscene and then level 1 follow) or 'title' (the Tutorial button on the title screen).
   */
  function startTutorial(after) {
    tutorialAfter = after === 'intro' ? 'intro' : 'title';
    audio.init();
    $('title-notice').classList.add('hidden');
    startLevel(TUTORIAL_LEVEL);
  }

  /** Finished or skipped, it counts as done and the game never puts it in front of you again by itself. */
  function markTutorialDone() {
    tutorialDone = true;
    store.set(TUTORIAL_KEY, '1');
  }

  /** Where the tutorial hands over to: on into the game, or back to the title it was started from. */
  function leaveTutorial() {
    tutorial.stop();
    if (tutorialAfter === 'intro') startCutscene('intro');
    else toTitle();
  }

  function onTutorialComplete() {
    if (state !== 'play') return;
    state = 'tutdone';
    touch.releaseAll();
    tutorial.stop();
    audio.stopAmbient();
    music.stop();
    cues.clear();
    markTutorialDone();
    audio.levelComplete();
    // "Start the game" leads on into the game only when the tutorial was reached through Begin.
    $('btn-tut-start').firstChild.textContent = tutorialAfter === 'intro' ? 'Start the game ' : 'Back to the title ';
    setTimeout(() => state === 'tutdone' && showOverlay('tutorial'), 600);
  }

  /** The Skip tutorial button (on screen and in the pause menu). Skipping counts as done. */
  function skipTutorial() {
    if (!inTutorial() || (state !== 'play' && state !== 'paused')) return;
    audio.uiClick();
    audio.resume();
    markTutorialDone(); // saved at once: the fade must never sit between a decision and writing it down
    go(() => leaveTutorial());
  }

  /**
   * Is this a brand-new player? Only then does Begin put the tutorial in front of them: the tutorial has not
   * been finished or skipped, AND there is nothing to suggest they have played before (no mode is past level 1
   * and the intro has never run). Anyone with progress goes straight to the intro, exactly as they always did.
   */
  const newPlayer = () => !tutorialDone && furthestReached() <= 1 && !hasSeen('intro');

  /** Begin a run. A brand-new game plays the tutorial and then the intro cutscene; Continue skips both. */
  function newRun(fromLevel, withIntro) {
    runSeed = (Math.random() * 0x7fffffff) | 0;
    $('title-notice').classList.add('hidden');
    audio.init(); // (the click handler has already done this; it is idempotent, and this keeps ?debug honest)
    if (withIntro) {
      // first time here: the tutorial, then the intro, then level 1
      if (newPlayer()) startTutorial('intro');
      else startCutscene();
      return;
    }
    // Continue / a level picked from the list normally goes straight in - but if the story scene that leads
    // into this level has never been shown (for example you got past it before the scene existed), it plays first.
    const scene = SCENE_BEFORE_LEVEL[fromLevel];
    if (scene && !hasSeen(scene)) startCutscene(scene);
    else startLevel(fromLevel);
  }

  // ---------------------------------------------------------------- cutscene
  // The scripted scene lives in js/cutscene.js. It borrows this file's ripple
  // system so the explorer's sonar looks and sounds exactly like yours.
  const cutscene = EchoCutscene.create({
    audio,
    ctx,
    canvas,
    size: () => ({ W, H, DPR, viewScale }),
    setStage(stage) {
      level = stage;
      cfg = stage.cfg;
      player = stage.person;
      enemies = [];
      decoys = [];
      ripples = [];
      marks = [];
      cues.clear();
      danger = 0;
      flash = 0;
      shake = 0;
    },
    castRipple,
    updateRipples,
    drawRippleLayer,
    calm: () => calm,
    visualCues: () => visualCues, // the Visual cues option also adds short [sound captions] to the cutscenes
    // (v16.0) may it be skipped right now? Never while paused; and the keeper scene not until it has been seen once
    canSkip: (kind) => !csPaused && !(SEEN_AT_END[kind] && !hasSeen(kind)),
    finish(kind) {
      // (v16.0) the keeper scene is seen once it has played to its end - closing the game in the middle of it
      // leaves it unseen, and it plays again from the start next time
      if (SEEN_AT_END[kind] && !seen[kind]) {
        seen[kind] = 1;
        store.set(SEEN_KEY, JSON.stringify(seen));
      }
      setCutscenePaused(false);
      // the end of a scene is a screen change like any other, so it fades too
      go(() => {
        if (replaying) {
          // rewatched from the replay screen: go back there, no level starts
          const back = replaying;
          replaying = false;
          toTitle();
          if (back === 'archive') showArchive();
          else showReplay();
        } else if (kind === 'listens') {
          onTalkDone(); // (v19.3) after the talk in the dark: the end of the story so far
        } else {
          // each scene leads into the level it introduces (see SCENE_LEADS_TO)
          startLevel(SCENE_LEADS_TO[kind] || 1);
        }
      });
    },
  });

  /** kind: 'intro' (before level 1), 'scent' (5 -> 6), 'mimic' (7 -> 8), 'decoy' (8 -> 9) or 'stalker' (9 -> 10). */
  function startCutscene(kind = 'intro') {
    // remember that it has played, so it can be rewatched from the replay screen (the keeper scene: at its end)
    setCutscenePaused(false);
    if (!seen[kind] && !SEEN_AT_END[kind]) {
      seen[kind] = 1;
      store.set(SEEN_KEY, JSON.stringify(seen));
    }
    destroyVoices();
    loreReader.hide();
    audio.stopAmbient();
    music.stop(); // a cutscene has its own sound; the score never plays over it
    tutorial.stop(); // (coming straight out of the tutorial: nothing of it is left on screen)
    touch.setVisible(false); // no touch controls in a cutscene (a tap anywhere skips it - see below)
    state = 'cutscene';
    showOverlay(null);
    $('hud').classList.add('hidden');
    $('banner').classList.remove('show');
    cutscene.start(kind);
  }

  /**
   * (v16.0) Pause a cutscene, or let it go on: P (the pause key, rebindable) in any cutscene. The scene's clock stops
   * (frame() does not advance it) and its sound with it (the whole AudioContext is suspended, as the pause menu does),
   * a small "Paused" note shows, and while it is paused nothing skips it.
   */
  function setCutscenePaused(on) {
    on = !!on && state === 'cutscene';
    if (on === csPaused) return;
    csPaused = on;
    $('cs-paused').classList.toggle('hidden', !on);
    if (on) audio.suspend();
    else audio.resume();
  }

  /** On from a cleared level. Going into level 6, 8, 9 or 10 plays that level's story cutscene first (SCENE_BEFORE_LEVEL). */
  function advanceLevel() {
    const scene = SCENE_BEFORE_LEVEL[levelNum + 1];
    if (scene) startCutscene(scene);
    else startLevel(levelNum + 1);
  }

  /**
   * WHY it got you, for the Caught screen's tip (js/feedback.js). It reads the tag the monster left on itself
   * when it noticed you, and whether it is actually chasing you right now - a monster that had lost you, or
   * never found you, means you walked into it in the dark. Read-only: this runs after the death is decided and
   * cannot change it.
   */
  function deathWhy(e) {
    if (e.kind === 'mimic' || e.fromMimic) return 'any'; // a mimic is a mimic, disguised or not
    if (e.kind === 'warden') return e.why || 'hunt'; // levels 15-16: it always knew - which one it was is the tip
    // a singer that has marked you: whether it lands on you or its body reaches you on the way, the song is why
    if (e.kind === 'singer' && (e.state === 'marked' || e.state === 'leap' || e.state === 'land')) return 'any';
    const chasing = e.state === 'hunt' || e.state === 'track' || e.state === 'follow' || e.state === 'search';
    return chasing && e.why ? e.why : 'blind';
  }

  /**
   * (v16.4) The Caught screen's line under "Caught": what caught you, in its own way, one short sentence - (v17.1)
   * the game speaking to you ("...found you"; v16.4 had them in the explorer's own words, "...found me"). ONE table, keyed by the monster's kind (MONSTER_TYPES in js/level.js), the upgraded Warden
   * of level 16 as 'warden:upgraded'. A kind that is not here - or no monster at all - gets CAUGHT_FALLBACK.
   * The Wardens are never named: the game never names them (they say what they did, never what they are). The Alarm
   * never catches anyone (touching it is harmless); its line is here so the table has every kind.
   */
  const CAUGHT_LINES = {
    echo: 'The echo found you.',
    scent: 'The scent monster followed your trail.',
    mimic: 'That was no way out. The mimic was waiting.',
    stalker: 'The stalker followed you the whole way.',
    muffler: 'You never saw the muffler. It heard you first.',
    singer: 'The singer sang you in.',
    warden: 'It never lost you.',
    'warden:upgraded': 'You could not outrun it.',
    alarm: 'The alarm gave you away.',
    screecho: 'The screecho screamed, then it found you.',
    void: 'The void took you.', // (v18.0: not a monster - the floor was gone, levels 21-24)
  };
  const CAUGHT_FALLBACK = 'The echo found you.';
  let catchCount = 0; // (each catch numbered, so a catch's own delayed screen can never show for another)
  /** The line for what caught you: `cause` its kind, `e` the monster itself if there is one (for the Warden's variant). */
  function caughtLine(cause, e) {
    const key = cause === 'warden' && e && e.variant === 'upgraded' ? 'warden:upgraded' : cause;
    return (typeof key === 'string' && Object.prototype.hasOwnProperty.call(CAUGHT_LINES, key) && CAUGHT_LINES[key]) || CAUGHT_FALLBACK;
  }

  /**
   * `cause` is what killed you ('echo', 'scent', 'mimic', 'stalker', 'muffler', 'singer', 'warden', 'screecho') - for
   * the stats and the Caught screen; (v16.4) `catcher` the monster itself, when there is one.
   */
  function onCaught(cause, why = 'blind', catcher = null) {
    if (state !== 'play') return;
    state = 'caught';
    loreReader.hide(); // a fragment's line, if one was up (its find is already saved)
    clearTimeout(bannerTimer); // ...and a banner (a level's hint, level 16's "Faster than you"): nothing sits on the Caught screen
    $('banner').classList.remove('show');
    const line = caughtLine(cause, catcher);
    const thisCatch = ++catchCount; // (v16.4) the screen below is for THIS catch, never a later one's
    $('caught-text').textContent = line;
    // one line saying what really happened, picked without touching the game's random numbers
    deathTip = EchoFeedback.tipFor(cause, why, levelNum, Math.round(levelTime * 1000));
    $('caught-tip').textContent = deathTip;
    levelDeaths++; // one death on this level means no Flawless medal for it, even if the retry goes perfectly
    if (scored()) {
      // (v15.0: behind scored() like every other write - a custom level is the only unscored level you can die on)
      EchoProfile.addDeath(mode, cause);
      EchoProfile.flush();
    }
    // the way out of the Caught screen: the title - or, from a custom level, back to where it was started from
    $('btn-caught-title').textContent = customRun ? customBackLabel() : 'Title';
    touch.releaseAll();
    audio.caught();
    if (cause === 'warden') audio.wardenGrab(); // levels 15-16: the same blow that ends level 13
    audio.stopAmbient();
    music.stop();
    destroyVoices();
    cues.clear();
    story.stop(); // levels 14-16: their beats, their line on screen and their own sounds (Try again starts it all afresh)
    scriptLock = false;
    flash = calm ? 0 : 1; // calm mode: no red flash or screen shake
    shake = calm ? 0 : 14;
    // a short buzz on a touch device (off in calm mode, like the flash and shake)
    if (touchOn && !calm && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([90, 50, 160]);
      } catch (e) {
        /* vibration is optional */
      }
    }
    if (endlessRun) endlessOver(line);
    setTimeout(() => {
      if (state !== 'caught' || thisCatch !== catchCount) return;
      if (endlessRun) {
        $('endless-over').classList.toggle('danger', !calm);
        showOverlay('endless-over'); // (v20.0) Endless's own screen (v20.1: Hardcore starts over, the other modes try the depth again - endlessAgain)
        return;
      }
      // (a custom level is not a run: even on Hardcore it simply offers Try again - v15.0)
      if (MODES[mode].oneLife && !customRun) {
        // One life: the run is over. Back to the title screen - there is nothing to resume.
        const died = levelNum;
        const tip = deathTip;
        go(() => {
          toTitle();
          const note = $('title-notice');
          note.textContent = `☠ You died on ${levelLower(died)}: "${line}" ${tip} Hardcore gives you one life, so that run is over.`;
          note.classList.remove('hidden');
        });
        return;
      }
      // Every other mode: just try the same level again.
      $('caught').classList.toggle('danger', !calm); // calm mode: no red glow
      showOverlay('caught');
    }, 900);
  }

  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  /**
   * Run a number up to where it belongs, easing out, and then write the real thing. Drawing only: it is a
   * <b> on a screen that has already been worked out, and it never touches what was recorded.
   */
  function countTo(el, to, fmt, delayMs, durMs) {
    const end = fmt(to);
    setTimeout(() => {
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / Math.max(1, durMs));
        el.textContent = k >= 1 ? end : fmt(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1 && el.isConnected) requestAnimationFrame(step);
        else el.textContent = end;
      };
      requestAnimationFrame(step);
    }, delayMs);
  }

  /**
   * The three medals for the level just cleared, drawn as a row of "what you got, what the next one needs".
   * Par comes from the maze you were actually given (js/profile.js: the shortest start-to-exit path), because
   * every run is a different seed.
   */
  function renderMedals(el, res) {
    el.textContent = '';
    const P = EchoProfile;
    const rows = [
      { kind: 'time', tier: res.earned.time, got: mmss(levelTime), next: res.earned.time === P.GOLD ? '' : `${P.TIER_NAMES[res.earned.time + 1]} at ${mmss(res.pars.time[res.earned.time === P.SILVER ? 'gold' : res.earned.time === P.BRONZE ? 'silver' : 'bronze'])}`, isNew: res.improved.time },
      { kind: 'ripples', tier: res.earned.ripples, got: `${ripplesUsed}`, next: res.earned.ripples === P.GOLD ? '' : `${P.TIER_NAMES[res.earned.ripples + 1]} at ${res.pars.ripples[res.earned.ripples === P.SILVER ? 'gold' : 'silver']}`, isNew: res.improved.ripples },
      { kind: 'flawless', tier: res.record.flawless ? 1 : 0, got: levelDeaths === 0 ? 'no deaths' : `caught ${levelDeaths}×`, next: '', isNew: res.improved.flawless },
    ];
    const names = { time: 'Time', ripples: 'Ripples', flawless: 'Flawless' };
    const stagger = calm || EchoWordmark.reduceMotion() ? 230 : 170; // matches --ui-stagger in style.css
    rows.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = `medal-item${r.tier ? '' : ' none'}`;
      row.style.setProperty('--i', i); // style.css reveals the rows one at a time off this
      row.appendChild(settings.medalPip(r.kind, r.tier));
      const label = document.createElement('span');
      // The same sentence as ever - the number is only pulled out into its own element so it can count up to
      // itself instead of simply being there. `countTo` writes the final text when it finishes, so what ends
      // up on screen is exactly what it always was.
      if (r.kind === 'flawless') {
        label.append(document.createTextNode(r.tier ? `Flawless — ${r.got}` : `Not flawless — ${r.got}`));
      } else {
        const num = document.createElement('b');
        num.className = 'num';
        num.textContent = r.kind === 'time' ? mmss(0) : '0';
        label.append(document.createTextNode(`${names[r.kind]} `), num, document.createTextNode(` — ${r.tier ? EchoProfile.TIER_NAMES[r.tier] : 'no medal'}`));
        const to = r.kind === 'time' ? levelTime : ripplesUsed;
        const fmt = r.kind === 'time' ? mmss : (v) => `${Math.round(v)}`;
        countTo(num, to, fmt, stagger * i + stagger, stagger * 4);
      }
      row.appendChild(label);
      if (r.isNew) {
        const nb = document.createElement('b');
        nb.className = 'new-best';
        nb.textContent = 'New best!';
        row.appendChild(nb);
      } else if (r.next) {
        const nx = document.createElement('small');
        nx.textContent = r.next;
        row.appendChild(nx);
      }
      el.appendChild(row);
    });
  }

  /**
   * A small "Progress saved" note in the corner, about a second and a half from start to gone. It is only ever
   * called after a write that really happened (`store.set` reports it), so it can never claim something was
   * kept when storage is off, full or blocked - in that case nothing appears at all, which is the honest thing.
   */
  // (v16.2) the same quiet corner note, saying something else: the last fragment has opened the hidden scene
  const SECRET_NOTICE = 'Something has changed in Fragments.';
  function showSaved(text = 'Progress saved', ms = 900) {
    const el = $('saved-toast');
    if (!el) return;
    el.textContent = text;
    clearTimeout(savedToastTimer);
    el.classList.remove('hidden');
    void el.offsetWidth; // lay it out before the fade, exactly as the overlays do
    el.classList.add('show');
    savedToastTimer = setTimeout(() => {
      el.classList.remove('show');
      savedToastTimer = setTimeout(() => el.classList.add('hidden'), fadeMs());
    }, ms);
  }

  /** The Level cleared screen's buttons: the campaign's Next level, or (v15.0) a custom level's own two. */
  const COMPLETE_NOTE = 'Nothing here counts towards your progress, medals or stats.'; // (a custom level's Complete screen)
  function completeButtons(custom) {
    $('btn-next').classList.toggle('hidden', custom);
    const onward = custom && !!queueAfter(); // (v15.1: a folder played in order - then Next level is the main button)
    $('btn-custom-next').classList.toggle('hidden', !onward);
    $('btn-custom-back').classList.toggle('primary', !onward);
    $('btn-custom-back').querySelector('.key').classList.toggle('hidden', onward);
    $('btn-custom-back').classList.toggle('hidden', !custom);
    $('btn-custom-again').classList.toggle('hidden', !custom);
    $('complete-note').classList.toggle('hidden', !custom);
    $('complete-medals').classList.toggle('hidden', custom);
  }

  function onLevelComplete() {
    if (state !== 'play') return;
    state = 'complete';
    loreReader.hide();
    touch.releaseAll();
    audio.stopAmbient();
    music.stop();
    destroyVoices();
    cues.clear();
    if (endlessRun) {
      onEndlessCleared();
      return;
    }
    if (customRun) {
      // A custom level (v15.0): nothing is written - no progress, no medals, no stats - and the way on is back to
      // the editor (or My Levels), or the same level again.
      clearTimeout(bannerTimer); // (a small test level can be done before its banner has gone: never under the panel)
      $('banner').classList.remove('show');
      audio.levelComplete();
      $('complete-title').textContent = customRun.from === 'editor' ? 'Test complete' : `${customTitle()} cleared`;
      // (v15.1) a folder being played in order: where you are in it, and whether that was the last
      const q = customRun.queue;
      $('complete-note').textContent = q ? (queueAfter() ? `${q.name}: ${q.index + 1} of ${q.ids.length} done.` : `That was the last level in ${q.name}.`) : COMPLETE_NOTE;
      // (v15.2) a bonus level: ticked in Bonus Levels - its own small save, never the campaign's
      if (customRun.from === 'bonus') {
        const first = !EchoLevelStore.bonus.isDone(customRun.doc.id);
        const ticked = EchoLevelStore.bonus.markDone(customRun.doc.id);
        $('complete-note').textContent = first && ticked ? `Ticked off in Bonus Levels. ${COMPLETE_NOTE}` : COMPLETE_NOTE;
      }
      $('complete-stats').textContent = `Time ${mmss(levelTime)}  ·  Ripples ${ripplesUsed}`;
      $('custom-back-label').textContent = customBackLabel();
      completeButtons(true);
      setTimeout(() => state === 'complete' && showOverlay('complete'), 700);
      return;
    }
    completeButtons(false);
    const newBest = saveBest(levelNum + 1);
    EchoProfile.addClear(mode);
    EchoProfile.flush();
    const res = EchoProfile.recordClear(mode, levelNum, {
      time: levelTime,
      ripples: ripplesUsed,
      flawless: levelDeaths === 0,
      pathTiles: level.pathTiles,
    });
    // "Progress saved", but only when something really was: a new best level, or a medal you did not have.
    // Playing a cleared level again and doing no better writes nothing new, and says nothing.
    const newMedal = !!res.saved && Object.keys(res.improved).some((k) => res.improved[k]);
    if (newBest || newMedal) showSaved();
    // There is no "you finished the game" screen any more: clearing level 12 leads on to level 13 like any
    // other level, and level 13 does not end in a victory (see onWardenCleared / onCaptured).
    audio.levelComplete();
    $('complete-title').textContent = `Level ${levelNum} cleared`;
    $('complete-stats').textContent = `Time ${mmss(levelTime)}  ·  Ripples ${ripplesUsed}`;
    renderMedals($('complete-medals'), res);
    setTimeout(() => state === 'complete' && showOverlay('complete'), 700);
  }

  // ------------------------------------------------ level 13: the capture
  /**
   * The player is fully inside the great room. This is what "clearing" level 13 means, and it is written down
   * here exactly as any other clear is: the best level and the lifetime "levels cleared". What it does NOT do
   * is show the "Level cleared" screen - there is nothing to be pleased about - and it takes no medals, because
   * level 13 has none (see MEDAL_LEVELS). The toast waits for the ending: a note in the corner has no business
   * in the middle of this.
   */
  function onWardenCleared() {
    if (wardenCleared) return;
    wardenCleared = true;
    wardenSaved = saveBest(levelNum + 1);
    EchoProfile.addClear(mode);
    EchoProfile.flush();
  }

  /**
   * The capture is over - and the story goes on (v14.0). Level 14 begins in the same black the capture ended
   * in: the player wakes up in a cell (js/story.js). Nothing is written to `seen` here: the capture is not
   * remembered, because it is not once-only - it plays in full every time level 13 is finished. The "Progress
   * saved" from walking into the room waits for the first moment level 14 hands the controls back.
   */
  function onCaptured() {
    savedPending = wardenSaved;
    // (v16.0) the capture has faded to black: the keeper scene, in the same black, and it hands on to level 14 (its
    // finish -> SCENE_LEADS_TO.keeper). Every time, like every scene on the way into its level: unskippable the first
    // time, skippable after that.
    startCutscene('keeper');
  }

  /**
   * THE END OF THE GAME SO FAR: level 25's way out (v18.2; v18.0: 24's; v17.0: 20's; it was 16's until Act 2). STUB - the area after it has not been built yet, so the game
   * ends on a short, deliberately temporary screen and goes back to the title. (Until v14.0 this screen came
   * straight after level 13's capture.) Replace this and the `#ending` overlay in index.html together when the
   * next area exists.
   */
  function onStoryEnd(saved) {
    state = 'ending';
    touch.releaseAll();
    touch.setVisible(false);
    audio.stopAmbient();
    music.stop();
    destroyVoices();
    cues.clear();
    story.stop();
    scriptLock = false;
    level = null; // nothing behind the last screen but the light the level faded into
    $('hud').classList.add('hidden');
    $('banner').classList.remove('show');
    showEndScreen();
    if (saved) showSaved();
  }

  // ================================================================ (v20.0) ENDLESS MODE
  /**
   * ENDLESS: one generated maze after another, harder the deeper you go (js/level.js generateEndless), until you are
   * caught (v20.1: on Hardcore that ends the run; elsewhere Try again is the same depth). The score is the depth. It opens once level 12 has been cleared in any mode (every
   * monster the generated levels have has been met by then); before that its button is not there at all. Each mode
   * keeps its own best depth, in Endless's own save (ENDLESS_KEY - the campaign's are never written: levelNum is
   * ENDLESS_LEVEL, so scored() is false). Calm mode, Visual cues, the palettes and touch work as on any level.
   */
  const ENDLESS_FROM = 13; // the best level reached in some mode must be past 12
  const ENDLESS_ALARM_FROM = 22; // the Alarm comes in once it has been met in the story (level 22)
  const endlessUnlocked = () => furthestReached() >= ENDLESS_FROM;
  const alarmMet = () => furthestReached() >= ENDLESS_ALARM_FROM;
  function endlessSave() {
    let v = null;
    try {
      v = JSON.parse(store.get(ENDLESS_KEY));
    } catch (e) {
      v = null; // (damaged: as if nothing were kept)
    }
    const best = {};
    if (v && v.best && typeof v.best === 'object') for (const m of MODE_ORDER) if (Number.isFinite(v.best[m]) && v.best[m] > 0) best[m] = Math.min(Math.floor(v.best[m]), 99999);
    const last = v && v.last && typeof v.last === 'object' && MODE_ORDER.includes(v.last.mode) && Number.isFinite(v.last.depth) ? { mode: v.last.mode, depth: Math.floor(v.last.depth), line: String(v.last.line || '').slice(0, 120), at: String(v.last.at || '').slice(0, 40) } : null;
    return { best, last };
  }
  const endlessBest = (m = mode) => endlessSave().best[m] || 0;
  function endlessWrite(patch) {
    const s = endlessSave();
    if (patch.depth && patch.depth > (s.best[mode] || 0)) s.best[mode] = patch.depth;
    if (patch.last) s.last = patch.last;
    return store.set(ENDLESS_KEY, JSON.stringify(s)); // (storage off: the mode still works, it just forgets)
  }
  function refreshEndlessButton() {
    const b = $('btn-endless');
    if (!b) return;
    const on = endlessUnlocked();
    b.classList.toggle('hidden', !on);
    const best = on ? endlessBest() : 0;
    $('endless-best').textContent = best ? `Best ${best}` : '';
    $('endless-best').classList.toggle('hidden', !best);
    b.setAttribute('aria-label', best ? `Endless - best depth on ${MODES[mode].label}: ${best}` : 'Endless');
  }
  /** A new run: a new random seed, depth 1, at once. */
  function startEndless() {
    if (!endlessUnlocked()) return;
    audio.init();
    $('title-notice').classList.add('hidden');
    const startBest = endlessBest();
    endlessRun = { seed: (Math.random() * 0xffffffff) >>> 0, depth: 1, mode, startBest, passedBest: false };
    customRun = null;
    startLevel(ENDLESS_LEVEL);
  }
  /** A depth cleared: the next one, behind the usual quick fade - and a soft chime at a milestone, a mark past your best. */
  function onEndlessCleared() {
    audio.levelComplete();
    endlessRun.depth++;
    const d = endlessRun.depth;
    endlessWrite({ depth: d }); // (the best is how deep you got: kept the moment you get there)
    if (ENDLESS_MILESTONES.includes(d)) setTimeout(() => audio.milestone(), 420);
    if (endlessRun.startBest > 0 && d > endlessRun.startBest && !endlessRun.passedBest) {
      endlessRun.passedBest = true;
      showSaved('New best!', 2200);
    }
    go(() => endlessRun && startLevel(ENDLESS_LEVEL));
  }
  /**
   * Caught. The screen says how deep, the best, and what caught you (the Caught screen's own line). On Hardcore the run
   * is over; anywhere else Try again is this depth again (v20.1).
   */
  function endlessOver(line) {
    const d = endlessRun.depth;
    const prev = endlessRun.startBest;
    endlessWrite({ depth: d, last: { mode, depth: d, line, at: new Date().toISOString() } });
    const best = Math.max(prev, d, endlessBest());
    $('eo-depth').textContent = `Depth ${d}`;
    $('eo-best').textContent = `Best on ${MODES[mode].label}: ${best}`;
    $('eo-new').classList.toggle('hidden', !(d > prev));
    $('eo-line').textContent = line;
    // (v20.1) what Try again will do: Hardcore starts over, every other mode tries this depth again
    const over = MODES[mode].oneLife;
    $('eo-again-label').textContent = over ? 'Start again' : 'Try again';
    $('eo-note').textContent = over ? 'Hardcore: one life. A new run starts at depth 1.' : `Try depth ${d} again - the same maze.`;
  }
  /**
   * Try again, instantly - no fade, no screens between. (v20.1, owner's rule) Hardcore: one life, so the run is over and
   * a new one starts at depth 1. Every other mode: the same depth again - the same maze (its seed is the run's and the
   * depth's), as Try again on a campaign level.
   */
  function endlessAgain() {
    if (!endlessRun || state !== 'caught') return;
    showOverlay(null);
    if (MODES[mode].oneLife) startEndless();
    else startLevel(ENDLESS_LEVEL, true);
  }

  // ================================================================ (v21.0) COSMETICS
  /**
   * What the cosmetics' unlocks are worked out from (js/cosmetics.js) - read fresh each time, never stored: the best
   * level reached in any mode, each mode's best, Endless's best depth in any mode, and whether Endless is open.
   */
  function cosFacts() {
    const best = {};
    for (const m of MODE_ORDER) best[m] = getBest(m);
    const eb = endlessSave().best;
    return { furthest: furthestReached(), best, endless: Math.max(0, ...MODE_ORDER.map((m) => eb[m] || 0)), endlessOpen: endlessUnlocked() };
  }
  /** What is worn now, for drawing - and the "new" dot on Settings and its Cosmetics tab. */
  function refreshCosmetics() {
    const f = cosFacts();
    cosLook = EchoCosmetics.look(EchoCosmetics.current(f));
    const fresh = EchoCosmetics.fresh(f).length > 0;
    for (const id of ['settings-dot', 'cos-dot']) if ($(id)) $(id).classList.toggle('hidden', !fresh);
    if ($('btn-settings')) $('btn-settings').setAttribute('aria-label', fresh ? 'Settings - something new in Cosmetics' : 'Settings');
  }

  /**
   * (v19.3) DUSK: talking to the Warden in the dark (the interact key, or the Talk button) - its scene, "Nothing
   * Listens", and after it (onTalkDone) Dusk counts as cleared and the end screen comes up.
   */
  function onTalk() {
    if (state !== 'play' || levelNum !== STORY_LAST || !levelFlag('interact')) return;
    $('talk').classList.remove('show');
    talkShown = false;
    story.stop(); // (what is left of the outside's sound, and its hum, end with the level)
    startCutscene('listens');
  }
  function onTalkDone() {
    const newBest = saveBest(levelNum + 1);
    EchoProfile.addClear(mode);
    EchoProfile.flush();
    state = 'play'; // (onStoryEnd takes it from the level it ends)
    onStoryEnd(newBest);
  }

  /**
   * (v18.2) THE END OF THE STORY SO FAR: after level 25, the light. A calm screen - white fading to dark, one line and a
   * way back to the title. A PLACEHOLDER: when the next part of the story exists, this function and these words are
   * what get replaced (the overlay is #ending in index.html; its look is "#ending" in style.css).
   */
  const ENDING_TEXT = 'More to come soon.';
  const ENDING_BUTTON = 'Back to title';
  function showEndScreen() {
    $('ending-text').textContent = ENDING_TEXT;
    $('ending-button').textContent = ENDING_BUTTON;
    showOverlay('ending');
  }

  function pause() {
    if (state !== 'play') return;
    state = 'paused';
    touch.releaseAll(); // never carry a held finger across a screen change
    EchoProfile.flush(); // write the stats out now: the page may never come back
    $('pause-mode').textContent = inTutorial() ? 'Tutorial' : endlessRun ? `Endless · ${MODES[mode].label} · Depth ${endlessRun.depth}` : customRun ? `${modeLabel()} · ${customRun.from === 'editor' ? 'Test play' : customTitle()}` : `${MODES[mode].label} · ${levelName(levelNum)}`;
    $('btn-quit').textContent = customRun ? customBackLabel() : 'Quit to title'; // (v15.0: a custom level goes back where it came from)
    $('btn-pause-skip-tut').classList.toggle('hidden', !inTutorial()); // the way out of the tutorial, for anyone who is done with it
    refreshOptionUi();
    showOverlay('pause');
    audio.suspend();
  }

  function unpause() {
    if (state !== 'paused') return;
    state = 'play';
    showOverlay(null);
    audio.resume();
  }

  function toTitle() {
    applyLightUi(); // (v19.1: reaching First Breath unlocks it - and a stored choice applies from then on)
    destroyVoices();
    loreReader.hide();
    audio.stopAmbient();
    audio.resume();
    EchoProfile.flush();
    tutorial.stop(); // the tutorial's prompt, if one was up
    warden.stop(); // ...and level 13's drone
    story.stop(); // ...and levels 14-16's beats and their sounds
    scriptLock = false;
    savedPending = false;
    customRun = null; // (v15.0) no custom level is being played any more,
    endlessRun = null; // (v20.0) ...nor an Endless run
    editorScreen = null; // ...and none of the editor's screens is up
    hideCard(); // (v15.1: nor its title card, its zones or its colours)
    fxZones = [];
    returnPalette();
    state = 'title';
    level = null;
    music.start('title'); // the title has a mood of its own (nothing happens until there is an AudioContext)
    cues.clear();
    $('hud').classList.add('hidden');
    $('banner').classList.remove('show');
    refreshTitle();
    showOverlay('title');
    wordmark.reveal(true); // back out of the maze: the logo ripples once, with its whoosh
    setTimeout(maybeShowWhatsNew, 700); // (v16.3) if it could not come up when the page loaded, it may now (once)
  }

  const MODE_INFO = {
    easy: 'Slower monsters that give up sooner, and longer ripples. Unlimited retries.',
    normal: 'The game as it is meant to be played. Unlimited retries.',
    hard: 'More monsters, faster and sharper-eared, and shorter ripples. Unlimited retries.',
    hardcore: 'Harder than Hard, with one life: get caught and the run is over.',
  };

  /** A best level past the last real level means the game was finished. */
  const isFinished = (n) => n > CAMPAIGN_LEVELS;
  /** Hardcore's high score is the furthest you got. */
  const scoreText = (n) => (isFinished(n) ? 'finished the game' : levelLower(n));
  const scoreShort = (n) => (isFinished(n) ? 'Finished' : levelShort(n));

  /** Bring the title screen's mode picker, best-level tags and Continue button up to date. */
  function refreshTitle() {
    document.querySelectorAll('.mode').forEach((b) => {
      const m = b.dataset.mode;
      b.classList.toggle('active', m === mode);
      b.setAttribute('aria-checked', m === mode ? 'true' : 'false');
      b.tabIndex = m === mode ? 0 : -1; // (v15.5) one stop in the Tab order; the arrow keys move inside the group
      const best = getBest(m);
      const tag = b.querySelector('small');
      if (MODES[m].oneLife) tag.textContent = progress[m] ? `High score: ${scoreShort(progress[m])}` : '';
      else tag.textContent = isFinished(best) ? 'Finished' : best > 1 ? `Best: ${levelShort(best)}` : '';
    });
    $('mode-desc').textContent = MODE_INFO[mode];
    // Hardcore's high score stays visible even though it can never be resumed.
    const score = $('mode-score');
    const showScore = !!MODES[mode].oneLife && !!progress[mode];
    score.classList.toggle('hidden', !showScore);
    if (showScore) score.textContent = `☠ High score: ${scoreText(progress[mode])}`;
    // Hardcore has no Continue: dying ends the run, so there is nothing to resume.
    const best = getBest();
    const btn = $('btn-continue');
    // ...and nothing to continue once the game has been finished (there is no level after the last)
    btn.classList.toggle('hidden', best <= 1 || !!MODES[mode].oneLife || isFinished(best));
    btn.textContent = `Continue (${levelName(best)})`;
    // (v15.5) one main action: Continue when there is a game to go back to, Begin when there is not
    const resume = !btn.classList.contains('hidden');
    btn.classList.toggle('primary', resume);
    $('btn-start').classList.toggle('primary', !resume);
    $('title-first').classList.toggle('hidden', !newPlayer());
    document.querySelectorAll('.calm-toggle').forEach((c) => {
      c.checked = calm;
    });
    $('btn-replay').classList.toggle('hidden', !replayAvailable());
    refreshEndlessButton(); // (v20.0)
    refreshCosmetics(); // (v21.0: an unlock since last time - the dot)
    $('btn-archive').classList.toggle('hidden', !archiveAvailable()); // only once something has been found
    // a small medal line for the mode that is picked (Settings -> Stats & Medals has the whole board)
    const sum = EchoProfile.medalSummary(mode, MEDAL_LEVELS); // (level 13 has no medals - see MEDAL_LEVELS)
    const line = $('title-medals');
    line.classList.toggle('hidden', sum.won === 0);
    if (sum.won) line.textContent = `Medals on ${MODES[mode].label}: ${sum.won} of ${sum.total} · ${sum.gold} gold, ${sum.silver} silver, ${sum.bronze} bronze, ${sum.flawless} flawless`;
  }

  // ---------------------------------------------- replay: levels + cutscenes
  const SCENES = [
    { kind: 'intro', name: 'The Lost Explorer', blurb: 'How it all began.', locked: 'Press Begin to see it for the first time.' },
    { kind: 'scent', name: 'Not Every Monster Listens', blurb: 'What follows the scent.', locked: 'You will see it when you clear level 5.' },
    { kind: 'mimic', name: 'Not Everything That Glows', blurb: 'What waits at the end of the corridor.', locked: 'You will see it when you clear level 7.' },
    { kind: 'decoy', name: 'Somewhere Else To Go', blurb: 'How to buy five seconds.', locked: 'You will see it when you clear level 8.' },
    { kind: 'stalker', name: 'Nothing To Hear', blurb: 'What to do when something listens.', locked: 'You will see it when you clear level 9.' },
    { kind: 'muffler', name: 'Nothing Comes Back', blurb: 'What lives where the echo stops.', locked: 'You will see it when you clear level 10.' },
    { kind: 'singer', name: 'Keep Moving', blurb: 'What to do when the song finds you.', locked: 'You will see it when you clear level 11.' },
    { kind: 'keeper', name: 'Somewhere Deeper', blurb: 'Between one dark and the next.', locked: 'You will see it when you clear level 13.' },
    { kind: 'alarm', name: 'Only A Voice', blurb: 'What calls the others.', locked: 'You will see it when you clear level 21.' }, // (v18.0)
    { kind: 'listens', name: 'Nothing Listens', blurb: 'What the keeper said in the dark.', locked: 'You will see it at the end of Dusk.' }, // (v19.3) unlocked once seen
    // (v16.2) HIDDEN: not listed at all until every fragment is found (js/lore.js secretUnlocked); never played for
    // you, only from here or the Fragments screen; skippable like any scene
    { kind: 'kept', name: 'Kept', blurb: 'For the ones who looked everywhere.', secret: true },
  ];

  /** The furthest level unlocked in any mode (the cutscenes are the same in every mode). */
  const furthestReached = () => Math.max(...Object.keys(MODES).map((m) => getBest(m)));

  /**
   * Has this cutscene actually been shown? Saves from before this was tracked count for the two that
   * already existed if they got past them. The newer scenes count only once they have really played.
   * A scene that has NOT been seen plays first the next time you enter the level it leads into
   * (see newRun), so a save that got past that point before the scene existed still gets it.
   */
  function hasSeen(kind) {
    if (seen[kind]) return true;
    const reached = furthestReached();
    if (kind === 'intro') return reached > 1;
    if (kind === 'scent') return reached >= SCENT_FROM_LEVEL;
    return false;
  }

  /**
   * Can this cutscene be watched from the replay screen? Yes once it has been seen - and also once you
   * are past the point where it plays (you have unlocked the level it leads into), even if it was added
   * after you got there and you have not actually seen it.
   */
  function canReplay(kind) {
    if (kind === 'kept') return EchoLore.secretUnlocked(); // (v16.2) the hidden scene: every fragment found
    return hasSeen(kind) || (kind !== 'intro' && furthestReached() >= SCENE_LEADS_TO[kind]);
  }

  /**
   * How many levels can be replayed in this mode: the ones already cleared (1 .. best-1). The level
   * you are up to is not one of them - that is what Continue is for. Hardcore has none: it is one
   * life from level 1 and cannot be resumed, so a level select would just be a way to resume.
   */
  function clearedLevels() {
    if (MODES[mode].oneLife) return 0;
    return Math.min(getBest() - 1, CAMPAIGN_LEVELS);
  }

  function replayAvailable() {
    return clearedLevels() > 0 || SCENES.some((s) => canReplay(s.kind));
  }

  /** Fill in and show the replay screen for the current mode. */
  function showReplay() {
    const oneLife = !!MODES[mode].oneLife;
    const cleared = clearedLevels();
    $('replay-sub').textContent = `${MODES[mode].label} mode. Change the difficulty on the title screen to see another mode's levels.`;

    const grid = $('level-grid');
    grid.textContent = '';
    grid.classList.toggle('hidden', oneLife);
    if (!oneLife) {
      for (let n = 1; n <= CAMPAIGN_LEVELS; n++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'lvl';
        const num = document.createElement('span');
        if (n >= OUTSIDE_FIRST) {
          // (v19.1) a name, not a number: a word to a line, centred, its size fitted to the tile (fitLevelNames)
          b.classList.add('named');
          num.className = 'lvl-name';
          for (const w of levelName(n).split(' ')) {
            const line = document.createElement('span');
            line.textContent = w;
            num.appendChild(line);
          }
        } else num.textContent = n;
        b.appendChild(num);
        // the medals won on this level, in this mode (three little pips: time, ripples, flawless). Level 13
        // is not raced and takes none, so its button simply has no pips (see MEDAL_LEVELS).
        const rec = n <= MEDAL_LEVELS ? EchoProfile.medalsFor(mode, n) : null;
        if (rec) {
          const pips = document.createElement('span');
          pips.className = 'pips';
          pips.append(settings.medalPip('time', rec.time), settings.medalPip('ripples', rec.ripples), settings.medalPip('flawless', rec.flawless ? 1 : 0));
          b.appendChild(pips);
        }
        if (n <= cleared) {
          b.setAttribute('aria-label', `Play ${levelLower(n)} again`);
          b.addEventListener('click', () => playLevel(n));
        } else {
          b.disabled = true;
          b.title = 'Not cleared yet';
          b.setAttribute('aria-label', `${levelName(n)}, not cleared yet`);
        }
        grid.appendChild(b);
      }
    }
    $('level-note').textContent = oneLife
      ? 'Hardcore always starts on level 1 with one life, so there is no level select here. The cutscenes still work.'
      : cleared
        ? 'Levels you have already cleared on this mode. Pick one to play it again.'
        : 'Clear a level and it will show up here.';

    const list = $('scene-list');
    list.textContent = '';
    for (const s of SCENES) {
      const ok = canReplay(s.kind);
      if (s.secret && !ok) continue; // (v16.2) a hidden scene is not even a ??? until it is unlocked
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'scene';
      const name = document.createElement('b');
      name.textContent = ok ? s.name : '???';
      const sub = document.createElement('small');
      sub.textContent = ok ? s.blurb : s.locked;
      b.append(name, sub);
      if (ok) b.addEventListener('click', () => playScene(s.kind));
      else b.disabled = true;
      list.appendChild(b);
    }
    showOverlay('replay');
    fitLevelNames();
  }
  /**
   * (v19.1) A named level's tile (First Breath...) is the same size as a numbered one: its words, one to a line, at the
   * largest size that fits inside it - whatever the screen width, and for any name added later.
   */
  function fitLevelNames() {
    document.querySelectorAll('#level-grid .lvl-name').forEach((el) => {
      const box = el.parentElement;
      if (!box.clientWidth) return; // (not on screen yet)
      let fs = 14;
      el.style.fontSize = `${fs}px`;
      while (fs > 6 && (el.scrollWidth > box.clientWidth - 6 || el.offsetHeight > box.clientHeight - 4)) {
        fs -= 0.5;
        el.style.fontSize = `${fs}px`;
      }
    });
  }
  window.addEventListener('resize', () => fitLevelNames());

  // ------------------------------------------------------------ how to play (v15.5)
  /**
   * WHAT THE PLAYER HAS MET, for How to play - so it never names a monster or a thing before the game has shown
   * it. Two records, both already kept for other reasons and never written here:
   *   - the cutscene that introduces each one (`echomaze.seen`, set the moment it starts playing - just before the
   *     level it leads into: hasSeen), and
   *   - how far the player has got in any mode (`echomaze.progress`: furthestReached) - for saves from before a
   *     scene existed, and for the things that have no scene of their own.
   * Basics (walls, obstacles, the way out, echo monsters - the intro shows one - and the heartbeat) are always known.
   */
  function metThings() {
    const reached = furthestReached(); // the level the player is up to (it has been entered, or is next)
    const cleared = reached - 1;
    const byScene = (kind, level) => hasSeen(kind) || cleared >= level;
    return {
      basic: true,
      scent: byScene('scent', SCENT_FROM_LEVEL), // the scent monster and its puddles arrive together on level 6
      mimic: byScene('mimic', 8),
      decoy: byScene('decoy', DECOY_FROM_LEVEL),
      stalker: byScene('stalker', 10),
      muffler: byScene('muffler', 11),
      singer: byScene('singer', 12),
      alarm: byScene('alarm', 22), // (v18.0: in the campaign from level 22)
      fragment: EchoLore.count() > 0, // something left behind: only once one has been found
      water: reached >= 14, // the drips of levels 14 and 16 (a cue shape)
      heavy: reached >= 15, // what comes for you on 15 and 16 (a cue shape - never named)
    };
  }
  function fillHowTo() {
    const met = metThings();
    let unknown = 0;
    document.querySelectorAll('#howto [data-meet]').forEach((el) => {
      const known = !!met[el.dataset.meet];
      if (el.tagName === 'LI') {
        // a legend chip: what it is, or a blank chip with nothing on it
        if (!el.dataset.html) el.dataset.html = el.innerHTML;
        el.classList.toggle('unmet', !known);
        if (known) {
          if (el.dataset.blank) {
            el.innerHTML = el.dataset.html;
            delete el.dataset.blank;
          }
        } else {
          el.textContent = '???';
          el.dataset.blank = '1';
          el.style.removeProperty('--glow'); // (not even its colour: that would say what it is)
          if (el.closest('#legend')) unknown++;
        }
        el.setAttribute('aria-label', known ? '' : 'Not met yet');
        if (known) el.removeAttribute('aria-label');
      } else {
        el.classList.toggle('hidden', !known); // a rule: not there at all until it applies
      }
    });
    drawLegend(); // (a chip that came back has its canvas again)
    $('howto-more').textContent = unknown ? 'Deeper in, there is more to meet. It will be added here once you have.' : '';
    $('howto-more').classList.toggle('hidden', !unknown);
    const crouch = $('howto-crouch-key');
    if (crouch) crouch.textContent = EchoProfile.keysText('crouch');
  }
  function openHowTo() {
    if (state !== 'title') return;
    audio.init();
    audio.uiClick();
    fillHowTo();
    showOverlay('howto');
    setTimeout(() => {
      const back = $('btn-howto-back');
      if (back && !$('howto').classList.contains('hidden')) back.focus({ preventScroll: true });
    }, 30);
  }
  function closeHowTo() {
    audio.uiClick();
    refreshTitle();
    showOverlay('title');
    setTimeout(maybeShowWhatsNew, 450); // (v16.3) back on the title: What's new, if it has not had its chance yet
    wordmark.reveal(false);
    setTimeout(() => $('btn-howto').focus({ preventScroll: true }), 30);
  }

  function openReplay() {
    audio.init(); // a button click, so the browser lets the sound start
    audio.uiClick();
    showReplay();
  }

  function closeReplay() {
    audio.uiClick();
    refreshTitle();
    showOverlay('title');
    setTimeout(maybeShowWhatsNew, 450); // (v16.3) back on the title: What's new, if it has not had its chance yet
    wordmark.reveal(false); // the title is back: sweep once, but this is not an arrival - no sound
  }

  // ----------------------------------------------------- the fragments archive
  /**
   * FRAGMENTS: every note and recording found so far (js/lore.js), in level order, built the same way as the
   * replay screen above. A found note can be read; a found recording can be played again, in the same voice.
   * What is not found yet only says which level to look on. Once all of them are found (EchoLore.TOTAL - 16 since
   * v16.2), the bonus line can be read and (v16.2) the hidden scene 'kept' appears at the end, to be played.
   * Finds are global - not per mode - so this screen is the same whichever difficulty is picked.
   */
  const archiveAvailable = () => EchoLore.count() > 0;
  let archiveVoice = null; // the recording playing on this screen, so it can be stopped
  let archiveStatic = 0; // ...and the static at the end of the one that is cut off

  function stopArchiveVoice() {
    if (archiveVoice) archiveVoice.stop();
    archiveVoice = null;
    clearTimeout(archiveStatic);
  }

  function playArchived(f) {
    audio.init(); // a button click, so the browser lets the sound start
    stopArchiveVoice();
    const v = f.voice || {};
    const seconds = f.text.length / (v.cps || EchoLore.CPS);
    audio.loreLog(seconds + (f.cut ? 0.75 : 0.6));
    archiveVoice = audio.speak(f.text, v);
    if (f.cut) archiveStatic = setTimeout(() => audio.loreStatic(), (seconds + 0.8) * 1000);
  }

  function showArchive() {
    const total = EchoLore.TOTAL;
    const n = EchoLore.count();
    $('archive-sub').textContent = `Notes and recordings left by the ones who came through before you. ${n} of ${total} found.`;
    const list = $('fragment-list');
    list.textContent = '';
    for (const f of EchoLore.FRAGMENTS.concat([EchoLore.BONUS])) {
      const got = f.bonus ? EchoLore.bonusUnlocked() : EchoLore.isFound(f.id);
      const log = f.kind === 'log';
      const row = document.createElement(got && log ? 'button' : 'div');
      // (an unfound one is not marked as a note or a recording: which it is, is part of finding it)
      row.className = `scene fragment${got ? '' : ' locked'}${got && log ? ' log' : ''}${f.bonus ? ' bonus' : ''}`;
      const name = document.createElement('b');
      if (f.bonus) name.textContent = got ? 'Tucked behind the others' : '???';
      else name.textContent = `Level ${f.level} · ${got ? (f.label ? f.label.toLowerCase() : log ? 'a recording' : 'a note') : '???'}`;
      const text = document.createElement('small');
      if (got) text.textContent = f.text;
      else text.textContent = f.bonus ? `Find all ${total} to read this one.` : 'Not found yet. It lies somewhere off the way to the exit.';
      row.append(name, text);
      if (got && log) {
        row.type = 'button';
        const play = document.createElement('span');
        play.className = 'play';
        play.textContent = 'Play';
        name.appendChild(play);
        row.setAttribute('aria-label', `Play the recording from level ${f.level}: ${f.text}`);
        row.addEventListener('click', () => playArchived(f));
      }
      list.appendChild(row);
    }
    // (v16.2) the hidden scene, once every one is found - and not even a ??? before that
    if (EchoLore.secretUnlocked()) {
      const row = document.createElement('button');
      row.type = 'button';
      row.id = 'fragment-secret';
      row.className = 'scene fragment log bonus secret';
      const name = document.createElement('b');
      name.textContent = 'Kept';
      const play = document.createElement('span');
      play.className = 'play';
      play.textContent = 'Play';
      name.appendChild(play);
      const text = document.createElement('small');
      text.textContent = 'For the ones who looked everywhere.';
      row.append(name, text);
      row.setAttribute('aria-label', 'Play the scene Kept');
      row.addEventListener('click', () => playScene('kept', 'archive'));
      list.appendChild(row);
    }
    $('archive-note').textContent = "A level's fragment is always there on Easy, usually on Normal, sometimes on Hard, and never on Hardcore. Whatever you find is kept for good, whichever difficulty you found it on.";
    showOverlay('archive');
  }

  function openArchive() {
    audio.init();
    audio.uiClick();
    showArchive();
  }

  function closeArchive() {
    stopArchiveVoice();
    audio.uiClick();
    refreshTitle();
    showOverlay('title');
    setTimeout(maybeShowWhatsNew, 450); // (v16.3) back on the title: What's new, if it has not had its chance yet
    wordmark.reveal(false);
  }

  /** Play a cleared level again: like Continue, no cutscene first, same mode rules. */
  function playLevel(n) {
    if (state !== 'title' || n < 1 || n > clearedLevels()) return;
    audio.init();
    audio.uiClick();
    go(() => newRun(n));
  }

  /** Rewatch a cutscene that has already played. When it ends (or is skipped) you land back on the replay screen. */
  function playScene(kind, from = 'replay') {
    if (state !== 'title' || !canReplay(kind)) return;
    audio.init();
    audio.uiClick();
    stopArchiveVoice();
    replaying = from; // (v16.2: 'replay' or 'archive' - the screen it goes back to)
    go(() => startCutscene(kind));
  }

  // ------------------------------------------------- the level editor (v15.0)
  /**
   * THE LEVEL EDITOR'S SCREENS: a warning the first time (#editor-gate), My Levels (js/mylevels.js) and the editor
   * itself (js/editor.js). While one of them is up the state is 'editor' and no level is running. The editor and
   * My Levels never touch the game: they save through js/levelstore.js and ask for a level to be played through
   * playCustom - which plays it with the real engine, writes nothing to the save, and comes back to them after.
   *
   * Who can open it: anyone who has pressed "I understand" on its warning (EDITOR_KEY, kept for good) - and,
   * without ever being asked, anyone who has cleared level 16 on any difficulty (v17.0, ALL_MONSTERS_MET_AFTER below:
   * until v17.0 that was finishing the game - the test the title uses to write "Finished" - and Act 2 brings no
   * monster they have not met, so it stays the line now that the game goes on to 20).
   */
  /**
   * (v15.3) The player's creator name: empty unless they set one (the editor's Level settings tab). It is put into
   * the codes they share - in a level with no creator name of its own - and nowhere else.
   */
  const CREATOR_KEY = 'echomaze.creator';
  const creatorName = () => EchoLevelFormat.cleanShown(store.get(CREATOR_KEY) || '', EchoLevelFormat.LIMITS.author);
  function setCreatorName(v) {
    const name = EchoLevelFormat.cleanShown(typeof v === 'string' ? v : '', EchoLevelFormat.LIMITS.author);
    if (name) store.set(CREATOR_KEY, name);
    else store.remove(CREATOR_KEY);
    return name;
  }
  $('ed-creator').addEventListener('input', () => setCreatorName($('ed-creator').value));
  $('ed-creator').addEventListener('change', () => ($('ed-creator').value = setCreatorName($('ed-creator').value)));
  const anyModeFinished = () => MODE_ORDER.some((m) => isFinished(getBest(m)));
  // (v17.0) Act 2 has no monster Act 1 does not: whoever has cleared level 16 has met them all, so the editor stays
  // unlocked for them exactly as it was before 17-20 existed (when clearing 16 was finishing the game)
  const ALL_MONSTERS_MET_AFTER = 16;
  const editorUnlocked = () => store.get(EDITOR_KEY) === '1' || MODE_ORDER.some((m) => getBest(m) > ALL_MONSTERS_MET_AFTER);
  const customTitle = () => (customRun && customRun.doc ? customRun.doc.title : 'Custom level');
  const customBackLabel = () => (customRun && customRun.from === 'editor' ? 'Back to the editor' : customRun && customRun.from === 'bonus' ? 'Back to Bonus Levels' : 'Back to My Levels');

  /**
   * (v15.1) Where a NEW level is filed when it is first saved: the folder My Levels had open when New level was
   * pressed. A level saved before stays where it is. The store does the filing - which folder a level is in is
   * never part of the level itself (js/levelstore.js).
   */
  let newLevelFolder = null;
  const editorStore = {
    save(doc) {
      const before = EchoLevelStore.get(doc.id);
      const isNew = !before;
      // (v15.3) a shared level keeps its creator's name - until its content is changed here: then it is the
      // player's own. (A new title alone is not a change to the level: it keeps the name.)
      if (before && before.doc && before.doc.authorName && EchoShare.contentKey(before.doc) !== EchoShare.contentKey(doc)) doc.authorName = '';
      const res = EchoLevelStore.save(doc);
      if (res.ok && isNew && newLevelFolder) EchoLevelStore.moveLevel(res.doc.id, newLevelFolder);
      return res;
    },
  };

  const myLevels = EchoMyLevels.create({
    el: {
      list: $('mylevels-list'),
      note: $('mylevels-note'),
      folders: $('mylevels-folders'),
      sort: $('mylevels-sort'),
      folderBar: $('mylevels-folderbar'),
      newFolder: $('btn-mylevels-folder'),
      enterCode: $('btn-mylevels-code'), // (v15.3)
      // (v15.2) the two tabs: My Levels and Bonus Levels
      screen: $('mylevels'),
      tabMine: $('lv-tab-mine'),
      tabBonus: $('lv-tab-bonus'),
      bonusCount: $('lv-bonus-count'),
      head: $('mylevels-head'),
      desc: $('mylevels-desc'),
    },
    store: EchoLevelStore,
    bonus: EchoLevelStore.bonus,
    dialog: EchoDialog,
    click: () => audio.uiClick(),
    play: (doc) => playCustom(doc, 'mylevels'),
    playBonus: (doc) => playCustom(doc, 'bonus'),
    copyBonus: (id) => EchoLevelStore.copyToMine('bonus', id),
    // (v15.3) share codes, and the name that goes into them
    share: EchoShare,
    creator: () => creatorName(),
    playQueue: (queue) => playQueue(queue),
    edit: (doc, folder) => openEditor(doc, folder),
  });

  const editor = EchoEditor.create({
    el: {
      canvas: $('ed-canvas'),
      stage: $('ed-stage'),
      title: $('ed-title'),
      size: $('ed-size'),
      status: $('ed-status'),
      tools: $('ed-tools'),
      monsters: $('ed-monsters'),
      // (v16.1) what a monster does
      about: $('ed-about'),
      aboutName: $('ed-about-name'),
      aboutText: $('ed-about-text'),
      aboutTag: $('ed-about-tag'),
      aboutSr: $('ed-about-sr'),
      choices: $('ed-choices'),
      choicesHead: $('ed-choices-head'),
      inspector: $('ed-inspector'),
      hint: $('ed-hint'),
      problems: $('ed-problems'),
      undo: $('ed-undo'),
      redo: $('ed-redo'),
      del: $('ed-delete'),
      clear: $('ed-clear'),
      back: $('ed-back'),
      save: $('ed-save'),
      test: $('ed-test'),
      // (v15.1) the Level settings tab
      tabBuild: $('ed-tab-build'),
      tabSettings: $('ed-tab-settings'),
      paneBuild: $('ed-pane-build'),
      paneSettings: $('ed-pane-settings'),
      width: $('ed-w'),
      height: $('ed-h'),
      card: $('ed-card'),
      palette: $('ed-palette'),
      rating: $('ed-rating'),
      tuning: $('ed-tuning'),
      tuneReset: $('ed-tune-reset'),
    },
    store: editorStore,
    dialog: EchoDialog,
    click: () => audio.uiClick(),
    visible: () => state === 'editor' && editorScreen === 'editor',
    testPlay: (doc) => playCustom(doc, 'editor'),
    back: () => showMyLevels(),
    touch: () => touchOn, // (v15.1: its hints for a finger instead of a mouse)
  });

  /**
   * The title's Level Editor button - the ONLY way into the editor's screens (there is no shortcut and no link to
   * it). In this order, each only when it applies: the spoiler warning (until it has been accepted once), then -
   * v15.7 - the unreleased-content warning (EVERY time, while js/level.js UNRELEASED_CONTENT is not empty: nothing
   * about it is remembered), then - v15.1 - the touch warning (every time, while touch controls are on: the editor
   * works best with a mouse, but it does work), then My Levels. Moving about inside the editor's screens, and
   * coming back from a test play, go straight where they are going: no warning is in that way.
   */
  function openEditorScreens() {
    if (state !== 'title') return;
    audio.init();
    audio.uiClick();
    myLevels.setView('mine', true); // (v15.2: from the title it always opens on My Levels; out of a bonus level, back to Bonus Levels)
    if (!editorUnlocked()) showGate();
    else afterSpoilerGate();
  }
  /** What follows the spoiler warning - or comes first, once it has been accepted. */
  function afterSpoilerGate() {
    if (UNRELEASED_CONTENT.length) showUnreleasedGate();
    else afterUnreleasedGate();
  }
  function afterUnreleasedGate() {
    if (touchOn) showTouchGate();
    else showMyLevels();
  }
  /** (v15.7) The unreleased-content warning. Never remembered - asked every time, with no way to turn it off. */
  function showUnreleasedGate() {
    state = 'editor';
    editorScreen = 'unreleased';
    showOverlay('editor-unreleased');
    try {
      $('btn-unreleased-ok').focus({ preventScroll: true }); // Enter (or Space) accepts it, Tab reaches Back, Esc goes back
    } catch (err) {
      /* (an old browser without focus options) */
    }
  }
  function acceptUnreleasedGate() {
    if (editorScreen !== 'unreleased') return;
    audio.uiClick();
    afterUnreleasedGate();
  }
  function showGate() {
    state = 'editor';
    editorScreen = 'gate';
    showOverlay('editor-gate');
  }
  /** "I understand": kept for good, so the warning never shows again. */
  function acceptGate() {
    if (editorScreen !== 'gate') return;
    store.set(EDITOR_KEY, '1');
    audio.uiClick();
    afterSpoilerGate();
  }
  /** (v15.1) The touch warning: the editor is made for a mouse and a keyboard. Never remembered - asked each time. */
  function showTouchGate() {
    state = 'editor';
    editorScreen = 'touch';
    showOverlay('editor-touch');
  }
  function acceptTouchGate() {
    if (editorScreen !== 'touch') return;
    audio.uiClick();
    showMyLevels();
  }
  function showMyLevels() {
    state = 'editor';
    editorScreen = 'list';
    myLevels.render();
    showOverlay('mylevels');
  }
  /** Edit a level (a doc from the store), or start a new one (null) - filed in `folder` when it is first saved. */
  function openEditor(doc, folder) {
    if (doc && EchoLevelStore.readOnly(doc.id)) return false; // (v15.2: a bonus level is copied first - see My Levels)
    state = 'editor';
    editorScreen = 'editor';
    newLevelFolder = doc ? null : folder || null;
    showOverlay('editor'); // (first: the editor measures its stage to lay the map out)
    editor.open(doc ? EchoLevelFormat.copy(doc) : null);
    $('ed-creator').value = creatorName(); // (v15.3)
    return true;
  }
  function closeEditorScreens() {
    audio.uiClick();
    state = 'title';
    editorScreen = null;
    refreshTitle();
    showOverlay('title');
    setTimeout(maybeShowWhatsNew, 450); // (v16.3) back on the title: What's new, if it has not had its chance yet
    wordmark.reveal(false);
  }

  /**
   * Play a custom level - a test play from the editor, or one picked in My Levels. It is built by the engine's own
   * loader first (buildCustomLevel, js/level.js: untrusted data, validated and clamped); if it cannot be played,
   * nothing changes and the reason comes back as a sentence. Otherwise it fades in and plays with the real game,
   * at the level's OWN difficulty (v15.1). Nothing about it is saved: levelNum is CUSTOM_LEVEL the whole time, so
   * every write to the save (all behind scored()) is skipped. -> null, or the reason it cannot be played.
   * `queue` (v15.1): a folder being played through in order - { name, ids, index }.
   */
  function playCustom(doc, from, queue) {
    const built = buildCustomLevel(doc);
    if (!built.level) return built.error;
    if (transitioning) return null;
    audio.init(); // (in the click that asked for it)
    go(() => startCustom(doc, from, queue));
    return null;
  }
  function startCustom(doc, from, queue) {
    customRun = { doc, from: from === 'editor' || from === 'bonus' ? from : 'mylevels', queue: queue || null };
    startLevel(CUSTOM_LEVEL);
  }

  /**
   * (v15.1) Play a folder through, in the order My Levels lists it. Levels that cannot be played (unfinished,
   * damaged) are stepped over. -> null, or why nothing could be played.
   */
  function queueNext(queue, from) {
    for (let i = from; i < queue.ids.length; i++) {
      const got = EchoLevelStore.get(queue.ids[i]);
      if (got && got.doc && buildCustomLevel(got.doc).level) return { index: i, doc: got.doc };
    }
    return null;
  }
  function playQueue(queue) {
    const first = queueNext(queue, 0);
    if (!first) return 'None of the levels in this folder can be played yet.';
    const q = { name: queue.name, ids: queue.ids.slice(), index: first.index };
    return playCustom(first.doc, 'mylevels', q);
  }
  /** The next level of the folder being played through, if there is one. */
  const queueAfter = () => (customRun && customRun.queue ? queueNext(customRun.queue, customRun.queue.index + 1) : null);
  /** Complete screen: on to the next level of the folder - or, at its end, back to My Levels. */
  function customAdvance() {
    const next = queueAfter();
    if (!next) return leaveCustom();
    const q = customRun.queue;
    q.index = next.index;
    startCustom(next.doc, 'mylevels', q);
  }

  /** Out of a custom level, back where it was started from: the editor exactly as it was left, or My Levels. */
  function leaveCustom(err) {
    const from = customRun ? customRun.from : 'mylevels';
    destroyVoices();
    loreReader.hide();
    story.stop();
    audio.stopAmbient();
    audio.resume();
    cues.clear();
    touch.releaseAll();
    touch.setVisible(false);
    hideCard();
    returnPalette(); // (v15.1: the player's own colours back)
    fxZones = [];
    customRun = null;
    scriptLock = false;
    level = null;
    state = 'editor';
    music.start('title');
    clearTimeout(bannerTimer);
    $('hud').classList.add('hidden');
    $('banner').classList.remove('show');
    if (from === 'editor' && editor.isOpen()) {
      editorScreen = 'editor';
      showOverlay('editor');
      editor.resume();
    } else showMyLevels();
    if (err) EchoDialog.open({ title: "Couldn't play it", text: err, buttons: [{ id: 'ok', label: 'OK', primary: true }] });
  }

  function setMode(m) {
    if (!MODES[m]) return;
    mode = m;
    store.set(MODE_KEY, m);
    refreshTitle();
  }

  /** Calm mode is purely visual + audio, so it can be flipped anywhere, any time, on any mode. */
  function setCalm(on) {
    calm = !!on;
    audio.calm = calm;
    store.set(CALM_KEY, calm ? '1' : '0');
    // the whole interface's motion slows down and shortens with it (style.css: html[data-calm='1'])
    document.documentElement.dataset.calm = calm ? '1' : '0';
    document.querySelectorAll('.calm-toggle').forEach((c) => {
      c.checked = calm;
    });
    if (state === 'caught' || !$('caught').classList.contains('hidden')) $('caught').classList.toggle('danger', !calm);
    if (level && state !== 'title' && state !== 'cutscene') updateHud();
    wordmark.invalidate(); // calm mode dims the wordmark's glow, so it has to be painted again
    refreshOptionUi();
  }

  function toggleMute() {
    audio.setMuted(!audio.muted);
    if (state !== 'title') updateHud();
    refreshOptionUi();
  }

  /**
   * Visual cues: an accessibility option, independent of calm mode and of the difficulty, saved in localStorage.
   * It only draws (js/cues.js) and adds cutscene captions - it never touches the game.
   */
  function setVisualCues(on) {
    visualCues = !!on;
    store.set(VISUALCUES_KEY, visualCues ? '1' : '0');
    if (!visualCues) cues.clear();
    if (level && state !== 'title' && state !== 'cutscene') updateHud();
    refreshOptionUi();
  }

  /**
   * Touch controls are on for touch devices (a coarse pointer, or the first real touch) unless switched off in the
   * pause menu; the same switch turns them on for anyone else. Only the on-screen controls and the touch layout of
   * the menus depend on it (`body.touch`); the game itself does not know.
   */
  function refreshTouchMode() {
    let coarse = false;
    try {
      coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    } catch (e) {
      coarse = false;
    }
    touchOn = touchPref === '1' ? true : touchPref === '0' ? false : coarse || touchSeen;
    document.body.classList.toggle('touch', touchOn);
    tutorial.refresh(); // a tutorial prompt switches between key names and touch wording with it
    if (!touchOn) touch.setVisible(false);
    if (level && state !== 'title' && state !== 'cutscene') updateHud();
    refreshOptionUi();
  }

  function setTouchControls(on) {
    touchPref = on ? '1' : '0';
    store.set(TOUCH_KEY, touchPref);
    refreshTouchMode();
  }

  /** Keep every place that shows an option in step: the checkboxes on the title and pause screens, and the big pause-menu buttons for touch players. */
  function refreshOptionUi() {
    document.querySelectorAll('.calm-toggle').forEach((c) => {
      c.checked = calm;
    });
    document.querySelectorAll('.cues-toggle').forEach((c) => {
      c.checked = visualCues;
    });
    document.querySelectorAll('.touch-toggle').forEach((c) => {
      c.checked = touchOn;
    });
    document.body.classList.toggle('cues-on', visualCues); // the legend of cue shapes on the title screen shows only while it is on
    const set = (id, label, on) => {
      const b = $(id);
      b.textContent = `${label}: ${on ? 'On' : 'Off'}`;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('on', on);
    };
    set('pbtn-mute', 'Sound', !audio.muted);
    set('pbtn-calm', 'Calm mode', calm);
    set('pbtn-cues', 'Visual cues', visualCues);
  }

  // ------------------------------------------------------- settings screen
  /**
   * Settings opens over the title screen or over the pause menu and goes back to whichever it was; the game
   * state does not change while it is up (paused stays paused). Everything it can change is an option - the
   * keys, the volumes, the palette, the timer - so none of it can reach the simulation.
   */
  function setPalette(id) {
    EchoPalette.set(id);
    EchoProfile.setPalette(EchoPalette.id);
    drawLegend(); // the title legend is painted with the real art, so it has to be redrawn in the new colours
  }

  /**
   * (v19.1) THE DAYLIGHT INTERFACE: a light look for every menu and screen (style.css, html[data-ui='light']). Only
   * offered once the outside has been reached (level 26 in any mode - before that the option is not there at all,
   * and a stored '1' does nothing); off by default; applied at once. The game itself, and the HUD over it, never change.
   */
  const lightUnlocked = () => furthestReached() >= OUTSIDE_FIRST;
  let lightUi = store.get(LIGHTUI_KEY) === '1';
  const lightUiOn = () => lightUi && lightUnlocked();
  function applyLightUi() {
    if (lightUiOn()) document.documentElement.dataset.ui = 'light';
    else delete document.documentElement.dataset.ui;
  }
  function setLightUi(on) {
    lightUi = !!on;
    store.set(LIGHTUI_KEY, lightUi ? '1' : '0');
    applyLightUi();
  }
  function setShowTimer(on) {
    showTimer = !!on;
    EchoProfile.setShowTimer(showTimer);
    if (!showTimer) $('hud-time').textContent = '';
    if (level && state !== 'title' && state !== 'cutscene') updateHud();
  }

  /**
   * (v22.0) SAVE CODES (js/savecode.js): what the game knows, so a code's values are clamped to THIS game - its
   * levels, its scenes and fragments, its modes, bonus levels, looks, actions and palettes.
   */
  function saveCtx() {
    return {
      campaignLevels: CAMPAIGN_LEVELS,
      medalLevels: MEDAL_LEVELS,
      modes: MODE_ORDER.slice(),
      modeLabel: (m) => MODES[m].label,
      scenes: SCENES.map((s) => s.kind),
      fragments: EchoLore.FRAGMENTS.map((f) => f.id),
      bonusIds: EchoLevelStore.bonus.list().map((b) => b.id),
      cosmetics: { color: EchoCosmetics.COLORS.map((c) => c.id), shape: EchoCosmetics.SHAPES.map((c) => c.id), marker: EchoCosmetics.MARKERS.map((c) => c.id) },
      actions: EchoProfile.ACTIONS.map((a) => a.id),
      palettes: EchoPalette.list().map((p) => p.id),
    };
  }
  /** After a code was loaded (or a load undone): everything the game holds in memory read from storage again, and every screen that shows it refreshed - no reload. */
  function afterSaveLoad() {
    progress = loadProgress();
    seen = loadSeen();
    tutorialDone = store.get(TUTORIAL_KEY) === '1';
    lightUi = store.get(LIGHTUI_KEY) === '1';
    EchoProfile.reload();
    EchoLore.reload();
    EchoCosmetics.reload();
    // the settings a code may carry (each changed only if it really differs, so nothing is written that was not)
    const m = store.get(MODE_KEY);
    mode = MODES[m] ? m : 'normal'; // (as at start-up: no difficulty stored is Normal)
    const c = store.get(CALM_KEY) === '1';
    if (c !== calm) setCalm(c);
    const v = store.get(VISUALCUES_KEY) === '1';
    if (v !== visualCues) setVisualCues(v);
    touchPref = store.get(TOUCH_KEY);
    refreshTouchMode();
    if (EchoProfile.getPalette() !== EchoPalette.id) {
      EchoPalette.set(EchoProfile.getPalette());
      drawLegend();
    }
    const vol = EchoProfile.volumes();
    for (const bus of Object.keys(vol)) audio.setBusVolume(bus, vol[bus]);
    showTimer = EchoProfile.getShowTimer();
    if (!showTimer) $('hud-time').textContent = '';
    settings.renderHowTo();
    tutorial.refresh();
    releaseKeys();
    applyLightUi();
    refreshTitle();
    refreshCosmetics();
    settings.refresh();
    refreshWhatsNewDot();
  }

  const settings = EchoSettings.create({
    click: () => audio.uiClick(),
    // (v22.0) save codes
    saveCtx,
    flushSave: () => EchoProfile.flush(),
    afterSaveLoad,
    showOverlay,
    closeSettings(from) {
      if (from === 'pause') {
        showOverlay('pause');
        refreshOptionUi();
        audio.suspend(); // back to the paused game, so the sound sleeps again
      } else {
        refreshTitle();
        showOverlay('title');
        setTimeout(maybeShowWhatsNew, 450); // (v16.3) back on the title: What's new, if it has not had its chance yet
        wordmark.reveal(false);
      }
    },
    keysChanged() {
      settings.renderHowTo();
      tutorial.refresh(); // a tutorial prompt on screen names the NEW key, not the old one
      releaseKeys(); // a key held while it was being rebound must never be left stuck down
    },
    setVolume(bus, v) {
      EchoProfile.setVolume(bus, v);
      audio.init(); // dragging a slider is a real gesture, so the sound is allowed to start here
      audio.setBusVolume(bus, v);
    },
    setPalette,
    setShowTimer,
    medalsChanged: () => refreshTitle(),
    lightUnlocked, // (v19.1) the daylight interface
    lightUi: () => lightUi,
    setLightUi,
    // (v21.0) cosmetics: what unlocks them, and the look changed or seen
    cosFacts,
    cosmeticsChanged: () => refreshCosmetics(),
    paletteWall: () => EchoPalette.rgb('wall'),
    calm: () => calm,

    mode: () => mode,
    modeIds: () => MODE_ORDER,
    modeLabel: (m) => MODES[m || mode].label,
    campaignLevels: () => CAMPAIGN_LEVELS,
    medalLevels: () => MEDAL_LEVELS, // the medal board counts these (it counted the whole campaign until v14.0)
  });

  function openSettings(from) {
    audio.init();
    audio.uiClick();
    if (from === 'pause') audio.resume(); // the audio sliders have to be audible while the game is paused
    if (from === 'title') music.start('title');
    $('btn-settings-whatsnew').classList.toggle('hidden', from !== 'title'); // (v16.3) from the title only, never mid-game
    settings.open(from);
  }

  // ----------------------------------------------------------------- input
  const GAME_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

  window.addEventListener('keydown', (e) => {
    // (v15.0) A question on screen (js/dialog.js) answers its own keys. And typing in a box - a level's title, the
    // size list - is typing, not playing: no key pressed there means anything else (M must not mute mid-word).
    if (EchoDialog.isOpen()) return;
    // (v16.3) What's new is up: it answers its own keys, and nothing else hears them
    if (wnOpen) return whatsNewKey(e);
    const tgt = e.target;
    if (tgt && (tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || (tgt.tagName === 'INPUT' && /^(text|search|number)$/i.test(tgt.type)))) return;
    // Settings -> Controls is waiting for a key to bind: it takes this one and nothing else sees it
    if (settings.captureKey(e)) {
      e.preventDefault();
      return;
    }
    const a = EchoProfile.actionFor(e.code); // which ACTION this key runs, if any (Settings -> Controls)
    if (GAME_KEYS.includes(e.code) || ((state === 'play' || state === 'capture') && a)) e.preventDefault();
    keys[e.code] = true;
    if (e.repeat) return;
    // (v19.3) a level with someone to talk to: the Interact key (E by default - it may share it with the item key)
    if (state === 'play' && levelFlag('interact') && EchoProfile.keysFor('interact').includes(e.code)) {
      story.talk();
      return;
    }
    // (v19.0) a level that takes only movement (Outside 1): no other game key does anything there - pause still does
    if (state === 'play' && levelFlag('movementOnly') && a && !MOVE_ACTIONS.includes(a) && a !== 'pause') return;

    if (a === 'mute') return toggleMute();
    if (a === 'calm') return setCalm(!calm); // works on every screen, in every mode
    if (a === 'cues') return setVisualCues(!visualCues); // so does Visual cues
    // the settings screen is open over the title or the pause menu: Esc is the way back out
    if (settings.isOpen()) {
      if (e.code === 'Escape') {
        e.preventDefault();
        settings.close();
      }
      return;
    }
    switch (state) {
      case 'play':
        if (a === 'ripple') emitRipple();
        else if (a === 'crouch') syncCrouch(); // wipe the ripple information this instant
        else if (a === 'item') dropDecoy();
        else if (e.code === 'Escape' || a === 'pause') pause();
        break;
      case 'paused':
        if (e.code === 'Escape' || a === 'pause') unpause();
        break;
      case 'card':
        // (v15.1) a custom level's title card: any key and the level begins
        endCard();
        break;
      case 'title':
        if (!$('replay').classList.contains('hidden')) {
          // the replay screen is open: Esc goes back; Enter just presses the focused button
          if (e.code === 'Escape') closeReplay();
        } else if (!$('archive').classList.contains('hidden')) {
          // the fragments screen, the same way
          if (e.code === 'Escape') closeArchive();
        } else if (!$('howto').classList.contains('hidden')) {
          // (v15.5) How to play, the same way
          if (e.code === 'Escape') closeHowTo();
        } else if (e.code === 'Enter') {
          // a focused button (tabbed to) handles its own Enter; otherwise Enter is the main action: Begin - or,
          // since v15.5, Continue when there is a game to continue (it is the one lit up)
          if (document.activeElement && document.activeElement.tagName === 'BUTTON') break;
          e.preventDefault();
          audio.init();
          audio.uiClick();
          if (!$('btn-continue').classList.contains('hidden')) go(() => newRun(getBest()));
          else go(() => newRun(1, true));
        }
        break;
      case 'cutscene':
        if (a === 'pause') {
          e.preventDefault();
          setCutscenePaused(!csPaused); // (v16.0) P pauses a cutscene and P lets it go on; nothing skips it while paused
        } else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') {
          e.preventDefault();
          cutscene.skip(); // (refused while paused, and during the keeper scene's first viewing - see canSkip)
        }
        break;
      case 'caught':
        if (endlessRun) {
          // (v20.0) the run is over: Enter (or R) is a new one, at once; Esc the title
          if (!$('endless-over').classList.contains('hidden') && !transitioning) {
            if (e.code === 'Enter' || e.code === 'KeyR') {
              e.preventDefault();
              audio.uiClick();
              endlessAgain();
            } else if (e.code === 'Escape') {
              audio.uiClick();
              go(() => toTitle());
            }
          }
          break;
        }
        if (e.code === 'Enter' || e.code === 'KeyR') {
          e.preventDefault();
          if (!$('caught').classList.contains('hidden')) {
            audio.uiClick();
            go(() => retry());
          }
        }
        break;
      case 'complete':
        if (e.code === 'Enter' && !endlessRun) {
          e.preventDefault();
          if (!$('complete').classList.contains('hidden')) {
            audio.uiClick();
            go(() => (customRun ? customAdvance() : advanceLevel())); // (a custom level goes back where it came from - or on through its folder, v15.1)
          }
        }
        break;
      case 'editor':
        // the level editor's screens (v15.0): Esc is a step back; the editor itself has a few shortcuts of its own
        if (editorScreen === 'editor') editor.key(e);
        else if (e.code === 'Escape') {
          e.preventDefault();
          closeEditorScreens();
        }
        break;
      case 'tutdone':
        if (e.code === 'Enter') {
          e.preventDefault();
          if (!$('tutorial').classList.contains('hidden')) {
            audio.uiClick();
            go(() => leaveTutorial());
          }
        }
        break;
      case 'ending':
        if (e.code === 'Enter') {
          e.preventDefault();
          if (!$('ending').classList.contains('hidden')) {
            audio.uiClick();
            go(() => toTitle());
          }
        }
        break;
      // 'capture' is not here on purpose: that is the one moment the controls are gone (js/warden.js)
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  function releaseKeys() {
    for (const k in keys) keys[k] = false;
    touch.releaseAll(); // and every finger-held control, so nothing is ever left stuck down
  }

  window.addEventListener('blur', () => {
    releaseKeys();
    pause();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      releaseKeys();
      EchoProfile.flush(); // the page may be closed while it is away: save the stats now
      pause();
      if (state === 'cutscene') audio.suspend();
    } else if (state === 'cutscene') {
      audio.resume();
    }
  });

  window.addEventListener('resize', resize);

  /** Try again: back to the start of the level you were caught on (same maze). */
  function retry() {
    startLevel(levelNum, true); // a retry, so the death still counts against the Flawless medal
  }

  document.querySelectorAll('.mode').forEach((b) => {
    b.addEventListener('click', (e) => {
      setMode(b.dataset.mode);
      if (e.detail > 0) b.blur(); // (a mouse click; a key press keeps the focus where the keyboard is)
    });
  });
  // (v15.5) the difficulty is ONE choice: Tab stops on the picked one, the arrow keys move the choice
  $('modes').addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.code];
    const list = [...document.querySelectorAll('#modes .mode')];
    let to = null;
    if (step) to = list[(list.findIndex((b) => b.dataset.mode === mode) + step + list.length) % list.length];
    else if (e.code === 'Home') to = list[0];
    else if (e.code === 'End') to = list[list.length - 1];
    if (!to) return;
    e.preventDefault();
    e.stopPropagation();
    audio.uiClick();
    setMode(to.dataset.mode);
    to.focus();
  });
  // (a switch the keyboard changed on the title keeps its focus; anywhere else it lets go of it, so SPACE / ENTER
  //  never re-toggle it while playing)
  const letGo = (c) => {
    if (state !== 'title') c.blur();
  };
  document.querySelectorAll('.calm-toggle').forEach((c) => {
    c.addEventListener('change', () => {
      setCalm(c.checked);
      letGo(c);
    });
  });
  document.querySelectorAll('.cues-toggle').forEach((c) => {
    c.addEventListener('change', () => {
      setVisualCues(c.checked);
      letGo(c);
    });
  });
  document.querySelectorAll('.touch-toggle').forEach((c) => {
    c.addEventListener('change', () => {
      setTouchControls(c.checked);
      c.blur();
    });
  });
  // big pause-menu buttons, for touch players who have no M, C or V key
  $('pbtn-mute').addEventListener('click', () => toggleMute());
  $('pbtn-calm').addEventListener('click', () => setCalm(!calm));
  $('pbtn-cues').addEventListener('click', () => setVisualCues(!visualCues));

  // ------------------------------------------------------------ touch controls
  // The on-screen controls live in js/touch.js; they call the very same functions the keys do.
  const touch = EchoTouch.create({
    ripple: () => emitRipple(), // = Space (same cooldown)
    item: () => dropDecoy(), // = E
    pause: () => pause(), // = P
    crouchChanged: () => syncCrouch(), // the CROUCH button is Shift: wipe the ripple information the instant it goes down
  });
  // the first real touch turns touch controls on (unless they were switched off in the pause menu)
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'touch' && !touchSeen) {
        touchSeen = true;
        refreshTouchMode();
      }
    },
    true
  );
  try {
    const mq = window.matchMedia && window.matchMedia('(pointer: coarse)');
    if (mq && mq.addEventListener) mq.addEventListener('change', refreshTouchMode);
  } catch (e) {
    /* older browsers: the first touch still turns them on */
  }
  window.addEventListener('orientationchange', resize);
  // in a cutscene, a tap anywhere skips it (skip() itself ignores the first 0.6 s)
  // (v15.1) a custom level's title card: a click or a tap anywhere and the level begins
  window.addEventListener('pointerdown', () => {
    if (state === 'card') endCard();
  });
  $('cutscene').addEventListener('pointerdown', () => {
    if (touchOn && state === 'cutscene') cutscene.skip();
  });
  // no page scroll, no pinch zoom and no rubber-banding while the touch controls are up
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener(
    'touchmove',
    (e) => {
      if (touchOn && (state === 'play' || state === 'cutscene')) e.preventDefault();
    },
    { passive: false }
  );
  $('btn-caught-title').addEventListener('click', () => {
    click();
    go(() => (customRun ? leaveCustom() : toTitle())); // (v15.0: from a custom level, back to the editor or My Levels)
  });
  // Every one of these makes its sound FIRST and only then asks for the fade, so the click that creates or
  // resumes the AudioContext is never waiting on an animation.
  const click = () => {
    audio.init();
    audio.uiClick();
  };
  $('btn-start').addEventListener('click', () => {
    click();
    go(() => newRun(1, true));
  });
  // the tutorial: always on the title screen, always level 0, and it comes back here when it is done
  $('btn-tutorial').addEventListener('click', () => {
    if (state !== 'title') return;
    click();
    go(() => startTutorial('title'));
  });
  $('btn-tut-skip').addEventListener('click', skipTutorial);
  $('btn-pause-skip-tut').addEventListener('click', skipTutorial);
  $('btn-tut-start').addEventListener('click', () => {
    click();
    go(() => leaveTutorial());
  });
  $('btn-tut-replay').addEventListener('click', () => {
    click();
    go(() => startTutorial(tutorialAfter)); // the same way out again when it is finished the second time
  });
  $('btn-continue').addEventListener('click', () => {
    click();
    go(() => newRun(getBest()));
  });
  $('btn-replay').addEventListener('click', openReplay);
  // (v20.0) Endless
  $('btn-endless').addEventListener('click', () => {
    if (state !== 'title' || transitioning || !endlessUnlocked()) return;
    click();
    go(() => startEndless());
  });
  $('btn-endless-again').addEventListener('click', () => {
    click();
    endlessAgain();
  });
  $('btn-endless-title').addEventListener('click', () => {
    click();
    go(() => toTitle());
  });
  $('btn-replay-back').addEventListener('click', closeReplay);
  $('btn-archive').addEventListener('click', openArchive);
  $('btn-archive-back').addEventListener('click', closeArchive);
  $('btn-settings').addEventListener('click', () => openSettings('title'));
  $('btn-howto').addEventListener('click', openHowTo); // (v15.5)
  $('btn-howto-back').addEventListener('click', closeHowTo);
  $('btn-pause-settings').addEventListener('click', () => openSettings('pause'));
  $('btn-resume').addEventListener('click', () => {
    audio.uiClick();
    unpause();
  });
  $('btn-quit').addEventListener('click', () => {
    click();
    go(() => (customRun ? leaveCustom() : toTitle())); // (v15.0: from a custom level, back to the editor or My Levels)
  });
  $('btn-retry').addEventListener('click', () => {
    click();
    go(() => retry());
  });
  $('btn-next').addEventListener('click', () => {
    click();
    go(() => advanceLevel());
  });
  $('btn-ending-title').addEventListener('click', () => {
    click();
    go(() => toTitle());
  });
  // the level editor (v15.0)
  $('btn-editor').addEventListener('click', openEditorScreens);
  $('btn-gate-ok').addEventListener('click', acceptGate);
  $('btn-gate-back').addEventListener('click', closeEditorScreens);
  $('btn-touchgate-ok').addEventListener('click', acceptTouchGate); // (v15.1)
  $('btn-unreleased-ok').addEventListener('click', acceptUnreleasedGate); // (v15.7)
  $('btn-unreleased-back').addEventListener('click', closeEditorScreens);
  $('btn-touchgate-back').addEventListener('click', closeEditorScreens);
  $('btn-mylevels-new').addEventListener('click', () => {
    audio.uiClick();
    openEditor(null, myLevels.folder()); // (v15.1: a new level is filed in the folder that is open)
  });
  $('btn-mylevels-back').addEventListener('click', closeEditorScreens);
  $('btn-custom-back').addEventListener('click', () => {
    click();
    go(() => leaveCustom());
  });
  $('btn-custom-next').addEventListener('click', () => {
    click();
    go(() => customAdvance()); // (v15.1) the next level of the folder being played in order
  });
  $('btn-custom-again').addEventListener('click', () => {
    click();
    go(() => retry()); // the same level from its start (a custom level keeps no medals, so a retry costs nothing)
  });

  // (the volume sliders live in Settings -> Audio now; js/settings.js owns them)

  // -------------------------------------------------------------- main loop
  let last = performance.now();

  /**
   * (v18.1) ONE BAD FRAME MUST NEVER FREEZE THE GAME. The update and the drawing each run inside their own try, and
   * the next frame is asked for whatever happened. An error is logged the first FRAME_ERRORS_LOGGED times (an error
   * that repeats every frame would otherwise flood the console), then once more to say the rest are not shown.
   * (v18.0 froze for good with Visual cues on: a cue's rate limit threw inside updatePlay and the loop never re-armed.)
   */
  const FRAME_ERRORS_LOGGED = 5;
  let frameErrors = 0;
  function frameError(where, err) {
    frameErrors++;
    if (frameErrors <= FRAME_ERRORS_LOGGED) console.error(`Echo Maze: an error in the frame's ${where} (the game carries on)`, err);
    else if (frameErrors === FRAME_ERRORS_LOGGED + 1) console.error('Echo Maze: more frame errors - not shown');
  }
  // (v19.0) ...and there, a tap anywhere but the joystick shows the pause button for a few seconds
  let pauseShowTimer = null;
  let talkShown = false; // (v19.3) the Talk prompt is up
  // ...a tap or a click on it talks, as the Interact key does (a finger: at once, on the press)
  $('talk').addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    story.talk();
  });
  $('talk').addEventListener('click', () => {
    story.talk();
    $('talk').blur();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!document.body.classList.contains('no-hud')) return;
    if (e.target && e.target.closest && e.target.closest('#touch-zone, #touch-stick, #talk')) return;
    document.body.classList.add('show-pause');
    clearTimeout(pauseShowTimer);
    pauseShowTimer = setTimeout(() => document.body.classList.remove('show-pause'), 3000);
  });
  function frame(now) {
    try {
      frameUpdate(now);
    } catch (err) {
      frameError('update', err);
    }
    try {
      draw();
    } catch (err) {
      frameError('drawing', err);
    }
    requestAnimationFrame(frame);
  }

  function frameUpdate(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // The art's clock. A near miss slows it for a moment - `artLag` is the art time we have chosen not to
    // advance - so the maze seems to hold its breath. This is the DRAWING clock and nothing else: the
    // simulation's own `dt` above is untouched, which is why the beat cannot change an outcome.
    if (nearMiss > 0 && !calm) artLag += dt * 0.55 * Math.sin(Math.PI * Math.min(1, nearMiss));
    artT = artHold === null ? now / 1000 - artLag : artHold;

    if (state === 'play') {
      updatePlay(dt);
    } else if (state === 'card') {
      // (v15.1) a custom level's title card is up: the level waits underneath it, and only the card's clock runs
      cardTimer -= dt;
      if (cardTimer <= 0) endCard();
    } else if (state === 'cutscene') {
      if (!debugFrozen && !csPaused) cutscene.update(dt); // (v16.0: a paused cutscene stands still)
    } else if (state === 'caught' || state === 'complete') {
      flash = Math.max(0, flash - dt * 1.2);
      shake = Math.max(0, shake - dt * 20);
      updateRipples(dt);
    } else if (state === 'capture') {
      // level 13: the controls are gone, but the ripple that found it is still travelling and the warden is
      // still moving. Nothing simulates: `updatePlay` is not running, so nothing can happen to the player.
      warden.update(dt);
      updateRipples(dt);
    } else if (state === 'title') {
      titleTimer -= dt;
      if (titleTimer <= 0) {
        titleTimer = 1.1 + Math.random() * 1.4;
        titleRipples.push({ x: Math.random() * W, y: Math.random() * H, t: 0 });
      }
      for (const r of titleRipples) r.t += dt;
      titleRipples = titleRipples.filter((r) => r.t < 6);
      // the wordmark's echo, but only while the title panel is really on screen (not behind Settings or Replay)
      if (!$('title').classList.contains('hidden')) wordmark.update(dt);
    }

    if (player && level && state !== 'title' && state !== 'cutscene') {
      const k = Math.min(1, dt * 9);
      // (level 14: for one beat the camera leans towards the key - js/story.js camera())
      const f = level.story ? story.camera() : null;
      const tx = f ? player.x + (f.x - player.x) * f.k : player.x;
      const ty = f ? player.y + (f.y - player.y) * f.k : player.y;
      camX += (tx - camX) * k;
      camY += (ty - camY) * k;
      if (state === 'play') {
        hudNumber('hud-ripples', `Ripples ${ripplesUsed}`);
        if (showTimer && scored()) hudNumber('hud-time', mmss(levelTime), false);
      }
    }

    // the tutorial's prompt and its Skip button: only while level 0 is actually being played
    const teaching = inTutorial() && state === 'play';
    $('tut-hint').classList.toggle('show', teaching && !!tutHint);
    $('btn-tut-skip').classList.toggle('hidden', !teaching);

    // (v15.5) the title (and what opens over it) can be used held upright; a level still asks to be turned sideways
    const onTitle = state === 'title';
    if (document.body.classList.contains('on-title') !== onTitle) document.body.classList.toggle('on-title', onTitle);

    // touch controls: shown only while playing (and released the moment they are not)
    if (touchOn && state === 'play' && window.innerHeight > window.innerWidth) pause(); // portrait: the "rotate your device" note is up
    touch.setVisible(touchOn && state === 'play' && !scriptLock); // (not while a beat on 14-16 has the controls)
    // (v19.0) a level with nothing on screen while you play (noHud): body.no-hud hides it all (style.css)
    const bare = state === 'play' && levelFlag('noHud');
    if (document.body.classList.contains('no-hud') !== bare) document.body.classList.toggle('no-hud', bare);
    // (v19.3) the Talk prompt: the one thing on screen on Dusk, and only close to the one it is for
    const dkNow = state === 'play' && levelFlag('interact') ? story.dusk() : null;
    const talkOn = !!(dkNow && dkNow.talkable);
    if (talkOn !== talkShown) {
      talkShown = talkOn;
      $('talk').classList.toggle('show', talkOn);
      if (talkOn) {
        const keys = EchoProfile.keysFor('interact').map(EchoProfile.keyLabel).join(' / ');
        $('talk-key').textContent = keys;
        $('talk-key').classList.toggle('hidden', touchOn || !keys);
      }
    }
    if (touchOn && state === 'play') {
      touch.setCooldown(cfg.cooldown > 0 ? 1 - cooldown / cfg.cooldown : 1);
      touch.setItem(!!player.hasDecoy);
    }

    // the soundtrack schedules its next notes (it does nothing at all when it is not running)
    music.update(dt);
  }

  /**
   * The title screen's colour legend: each swatch is a little canvas showing the very art that lights up in a
   * ripple (js/art.js), so what you learn on the title is what you will see. (A disguised mimic is not in it.)
   */
  function drawLegend() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * 2;
    document.querySelectorAll('#legend canvas.swatch').forEach((cv) => {
      const w = +cv.dataset.w || cv.width;
      const h = +cv.dataset.h || cv.height;
      cv.dataset.w = w;
      cv.dataset.h = h;
      cv.style.width = `${w * 0.8}px`;
      cv.style.height = `${h * 0.8}px`;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      const g = cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      g.globalCompositeOperation = 'lighter';
      const kind = cv.dataset.art;
      const r = (kind === 'wall' ? 0.4 * w : 0.33 * h) * dpr;
      EchoArt.draw(g, kind, cv.width / 2, cv.height * (kind === 'wall' ? 0.36 : 0.5), r, { t: 0.9, h: -0.6, seed: EchoArt.seedOf(kind.length * 31, 7) });
      // Hand the legend row this thing's own colour, so the chip around it glows the way the thing does in a
      // ripple (style.css: #title .legend li). Drawing only - it follows the palette like everything else.
      const li = cv.closest('li');
      if (li) li.style.setProperty('--glow', EchoPalette.rgb(LEGEND_ROLE[kind] || 'wall'));
    });
  }

  resize();
  EchoDialog.init({ click: () => audio.uiClick() }); // the editor's and My Levels' questions (v15.0)

  // (v15.5) The version, in the title's corner - read from the folder the game was opened from ("v15.5 - ..."),
  // because the number is never written into the game's own files (CLAUDE.md). Anywhere else (a dev server, the
  // test copy) there is simply none.
  (() => {
    let path = '';
    try {
      path = decodeURIComponent(location.pathname);
    } catch (e) {
      path = location.pathname;
    }
    const m = /[\\/]v(\d+\.\d+)(?: - [^\\/]*)?[\\/][^\\/]*$/.exec(path);
    const tag = $('version-tag');
    if (m && tag) {
      tag.textContent = `v${m[1]}`;
      tag.classList.remove('hidden');
    }
  })();

  // ------------------------------------------------------------------ (v16.3) What's new
  /**
   * WHAT'S NEW: once, on the title, the first time the game is opened after an update the player has not seen notes
   * for (js/whatsnew.js decides, and has the notes), and from the corner button at any time. A small dialog over the
   * title: focus kept inside it while it is up and given back afterwards; Got it, Esc, Enter or a click/tap outside
   * it closes it. It never comes up anywhere but the title, and never over another screen, a fade or a cutscene.
   */
  const wnEl = $('whatsnew');
  let wnOpen = false;
  let wnReturn = null; // where focus goes back to
  let wnDecided = false; // this page load has decided whether to show it (it is never shown twice on one load)
  function refreshWhatsNewDot() {
    const on = EchoWhatsNew.unseen();
    $('whatsnew-dot').classList.toggle('hidden', !on);
    $('whatsnew-dot-sr').textContent = on ? ' (there is something new)' : '';
  }
  function renderWhatsNew(entries, sub, showAll) {
    $('wn-sub').textContent = sub;
    const list = $('wn-list');
    list.textContent = '';
    for (const e of entries) {
      const box = document.createElement('section');
      box.className = 'wn-entry';
      const h = document.createElement('h3');
      const v = document.createElement('span');
      v.className = 'wn-ver';
      v.textContent = e.version;
      h.append(v, document.createTextNode(e.title));
      const ul = document.createElement('ul');
      for (const l of e.lines) {
        const li = document.createElement('li');
        if (l.generic) li.className = 'wn-generic';
        if (l.tag) {
          const t = document.createElement('span');
          t.className = 'wn-tag';
          t.textContent = l.tag;
          li.append(t);
        }
        li.append(document.createTextNode(l.text));
        ul.appendChild(li);
      }
      box.append(h, ul);
      list.appendChild(box);
    }
    list.scrollTop = 0;
    // the full history can be long: then the list scrolls, and is a stop for the keyboard so it can be scrolled
    list.tabIndex = showAll ? 0 : -1;
    $('wn-all').classList.toggle('hidden', showAll);
  }
  function showWhatsNewAll() {
    renderWhatsNew(EchoWhatsNew.history(furthestReached()), 'Every update so far, newest first.', true);
    $('wn-ok').focus();
  }
  /** Open it: with the notes since the player last looked (`entries`), or (none given) the whole history. */
  function openWhatsNew(entries) {
    if (wnOpen) return;
    wnReturn = document.activeElement;
    if (entries) renderWhatsNew(entries, entries.length === 1 ? 'Since you last played' : `Since you last played: ${entries.length} updates`, false);
    else showWhatsNewAll();
    wnEl.classList.remove('hidden');
    void wnEl.offsetWidth; // (laid out before the fade, as every overlay is)
    wnEl.classList.add('in');
    wnOpen = true;
    $('wn-ok').focus();
  }
  function closeWhatsNew() {
    if (!wnOpen) return;
    wnOpen = false;
    EchoWhatsNew.markSeen(); // seen: never shown again for this version
    refreshWhatsNewDot();
    wnEl.classList.remove('in');
    setTimeout(() => {
      if (!wnOpen) wnEl.classList.add('hidden');
    }, fadeMs());
    const back = wnReturn && wnReturn !== document.body && document.contains(wnReturn) && wnReturn.offsetParent !== null ? wnReturn : !$('btn-continue').classList.contains('hidden') ? $('btn-continue') : $('btn-start');
    if (back && back.focus) back.focus({ preventScroll: true });
    wnReturn = null;
  }
  /** Is the title up, on its own, with nothing moving? Only then may the notes come up by themselves. */
  const titleAlone = () =>
    state === 'title' &&
    !transitioning &&
    $('title').classList.contains('in') &&
    ['replay', 'archive', 'howto'].every((id) => $(id).classList.contains('hidden')) &&
    !settings.isOpen() &&
    !EchoDialog.isOpen();
  function maybeShowWhatsNew() {
    if (wnDecided || wnOpen) return;
    if (!titleAlone()) return; // (not now: the next time the title comes back on this page load)
    wnDecided = true;
    const d = EchoWhatsNew.decide(furthestReached());
    refreshWhatsNewDot();
    if (!d.show) return;
    EchoWhatsNew.markShown();
    openWhatsNew(d.entries);
  }
  /** Keys while it is up: Esc closes; Enter closes (or presses the focused button); Tab stays inside. */
  function whatsNewKey(e) {
    if (e.code === 'Escape') {
      e.preventDefault();
      closeWhatsNew();
    } else if (e.code === 'Enter') {
      const t = document.activeElement;
      if (!(t && wnEl.contains(t) && t.tagName === 'BUTTON')) {
        e.preventDefault();
        closeWhatsNew();
      }
    } else if (e.code === 'Tab') {
      const stops = [...wnEl.querySelectorAll('button, [tabindex="0"]')].filter((x) => !x.classList.contains('hidden') && x.offsetParent !== null);
      if (!stops.length) return;
      const i = stops.indexOf(document.activeElement);
      const next = i < 0 ? stops[0] : stops[(i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length];
      e.preventDefault();
      next.focus();
    }
  }
  $('wn-ok').addEventListener('click', () => closeWhatsNew());
  $('wn-all').addEventListener('click', () => showWhatsNewAll());
  wnEl.addEventListener('click', (e) => {
    if (e.target === wnEl) closeWhatsNew(); // a click or tap outside the panel
  });
  $('btn-settings-whatsnew').addEventListener('click', () => {
    audio.uiClick();
    openWhatsNew(null); // (Settings, from the title: the same history - on a phone held upright this is where it lives)
  });
  $('btn-whatsnew').addEventListener('click', () => {
    audio.init();
    audio.uiClick();
    openWhatsNew(null);
  });
  refreshWhatsNewDot();

  // (v15.5) A soft ripple where the title is clicked - the screen's own rings, one more. Never in calm mode or
  // with reduced motion, never on a button or a switch, and it is drawing only.
  $('title').addEventListener('pointerdown', (e) => {
    if (state !== 'title' || calm || EchoWordmark.reduceMotion()) return;
    if (e.target.closest('button, label, input, a, kbd')) return;
    if (titleRipples.length > 12) return;
    titleRipples.push({ x: e.clientX, y: e.clientY, t: 0 });
  });
  EchoPalette.set(EchoPalette.id); // paint the saved palette into the art, the cues, the CSS and the legend
  drawLegend();
  settings.renderHowTo(); // the title / pause how-to, written with the player's own keys
  refreshTouchMode();
  refreshTitle();
  document.documentElement.dataset.calm = calm ? '1' : '0'; // the interface's motion, before anything is toggled
  showOverlay('title'); // ... and the title fades up rather than simply being there
  setTimeout(maybeShowWhatsNew, 900); // (v16.3) What's new, once, if the game has updated since this player last looked
  wordmark.reveal(false); // the first title of the session: there is no AudioContext yet, so it is silent
  applyLightUi(); // (v19.1)
  requestAnimationFrame(frame);

  // Test hook: only exposed when the page is opened with ?debug
  if (/[?&]debug\b/.test(location.search)) {
    window.__echo = {
      levelName: (n) => levelName(n), // (v19.0)
      lightUi: () => ({ on: lightUiOn(), chosen: lightUi, unlocked: lightUnlocked(), attr: document.documentElement.dataset.ui || '' }), // (v19.1)
      setLightUi: (on) => setLightUi(on),
      fitLevelNames: () => fitLevelNames(),
      info: () => ({ state, levelNum, levelTime, player, enemies, level, ripples: ripples.length, audio: audio.ctx && audio.ctx.state, part: levelPart, falling: !!a2Falling }),
      deadSeen: () => [...deadSeen.keys()], // (v18.0, 22: the black patches on the map now)
      frameErrors: () => frameErrors, // (v18.1: errors the game loop caught and carried on from)
      tp: (x, y) => {
        player.x = x;
        player.y = y;
      },
      go: (n) => {
        audio.init();
        startLevel(n);
      },
      step: (secs) => {
        for (let t = 0; t < secs && state === 'play'; t += 1 / 60) updatePlay(1 / 60);
      },
      // intro cutscene helpers: play it, hold time still, and jump to a moment
      intro: (kind = 'intro') => {
        audio.init();
        runSeed = 1;
        startCutscene(kind);
      },
      advance: () => advanceLevel(),
      toTitle: () => toTitle(), // (v15.5: the title-screen tests go back to it between runs)
      metThings: () => metThings(), // (v15.5: what How to play may show)
      openHowTo: () => openHowTo(),
      closeHowTo: () => closeHowTo(),
      ripples: () => ripples,
      marks: () => marks,
      castRipple: (x, y, R, o) => castRipple(x, y, R, o), // (v16.2: the lore tests send a drop's ripple, or a singer's)
      crouch: () => ({ crouching: !!(player && player.crouching), glimmerOff, held: crouchHeld() }),
      decoys: () => decoys,
      dropDecoy,
      rippleRange,
      freeze: (on) => {
        debugFrozen = !!on;
      },
      // (v16.0) the keeper scene: set or clear a scene's seen flag, and the cutscene pause
      setSeen: (kind, on) => {
        if (on) seen[kind] = 1;
        else delete seen[kind];
        store.set(SEEN_KEY, JSON.stringify(seen));
        return { ...seen };
      },
      seen: () => ({ ...seen }),
      csPaused: () => csPaused,
      setCsPaused: (on) => setCutscenePaused(on),
      onCaptured: () => onCaptured(),
      csTo: (secs) => {
        const start = cutscene.time;
        for (let t = start; t < secs && state === 'cutscene'; t += 1 / 60) cutscene.update(1 / 60);
        return cutscene.time;
      },
      cutscene,
      setMode,
      setCalm,
      setVisualCues,
      setTouchControls,
      // switch the accessibility / input features for a test WITHOUT saving them: { cues, touch, audioFx }
      features: (f = {}) => {
        if ('cues' in f) {
          visualCues = !!f.cues;
          if (!visualCues) cues.clear();
        }
        if ('touch' in f) {
          touchPref = f.touch ? '1' : '0';
          refreshTouchMode();
          if (state === 'play') touch.setVisible(touchOn);
        }
        if ('audioFx' in f) audioFx = !!f.audioFx;
        refreshOptionUi();
        return { cues: visualCues, touch: touchOn, audioFx };
      },
      seed: (n) => {
        runSeed = n | 0; // the maze seed, so two runs can be the same
      },
      cues: () => cues.list(),
      snapCamera: (x, y) => {
        camX = x === undefined ? player.x : x;
        camY = y === undefined ? player.y : y;
      },
      // magnify the picture (until the window is resized), so the art can be inspected on a small screen
      zoom: (v) => {
        viewScale = +v;
      },
      // hold the art's clock still (seconds), or pass null to let it run - for screenshots that must be repeatable
      artClock: (t) => {
        artHold = t === null || t === undefined ? null : +t;
        if (artHold !== null) artT = artHold;
      },
      captionText: () => ($('cue-caption').classList.contains('show') ? $('cue-caption').textContent : ''),
      touch,
      soundBlocked,
      // draw the muffler (never drawn in normal play) as a dim ring with a dash, for testing
      showMuffler: (on) => {
        debugShowMuffler = on === undefined ? !debugShowMuffler : !!on;
        return debugShowMuffler;
      },
      // markPlayer(): force a singer to mark you now (for tests); state of every singer / muffler
      markBy: (e) => markPlayer(e),
      screams: () => screamLog.map((s) => Object.assign({}, s)), // (v15.7)
      shake: () => shake,
      alarms: () => enemies.filter((e) => e.kind === 'alarm' || e.kind === 'screecho').map((e) => ({ kind: e.kind, x: e.x, y: e.y, state: e.state, spent: e.spent, screamCd: e.screamCd })),
      newMonsters: () => enemies.filter((e) => e.kind === 'muffler' || e.kind === 'singer').map((e) => ({ kind: e.kind, x: e.x, y: e.y, state: e.state, timer: e.timer, markFrac: e.markFrac, markX: e.markX, markY: e.markY, deaf: e.deaf, everHeard: e.everHeard, singCd: e.singCd })),
      // v11.0: the settings screen, the palettes, the keys, the medals, the stats and the soundtrack
      openSettings,
      settingsUi: settings,
      setPalette,
      setShowTimer,
      palette: () => ({ id: EchoPalette.id, label: EchoPalette.label(), colors: EchoPalette.colorsOf(), cores: EchoPalette.coresOf() }),
      keys: () => {
        const out = {};
        for (const a of EchoProfile.ACTIONS) out[a.id] = EchoProfile.keysFor(a.id).slice();
        return out;
      },
      bindKey: (action, slot, code) => {
        EchoProfile.bindKey(action, slot, code);
        settings.renderHowTo();
        tutorial.refresh();
        return EchoProfile.keysFor(action).slice();
      },
      resetKeys: () => {
        EchoProfile.resetKeys();
        settings.renderHowTo();
        tutorial.refresh();
      },
      // v11.6: death tips, near misses and the save toast - all feedback, none of it read by the simulation
      feedback: EchoFeedback,
      deathTip: () => deathTip,
      tipFor: (cause, why, level = 1, atMs = 0) => EchoFeedback.tipFor(cause, why, level, atMs),
      whyOf: () => enemies.map((e) => ({ kind: e.kind, state: e.state, why: e.why || null, would: deathWhy(e) })),
      nearMiss: () => ({ level: +nearMiss.toFixed(3), artLag: +artLag.toFixed(3), dist: NEAR_MISS_DIST, gap: NEAR_MISS_GAP, count: EchoProfile.stats().nearMisses, perMonster: enemies.map((e) => ({ kind: e.kind, inside: !!e.nmIn, cooldown: +(e.nmCd || 0).toFixed(2) })) }),
      forceNearMiss: () => onNearMiss(),
      savedToast: () => ({ shown: !$('saved-toast').classList.contains('hidden'), lit: $('saved-toast').classList.contains('show') }),
      showSaved,
      // v11.5: the interface's motion. `ui()` reports the timings; `go` is NOT used by any of these hooks, so
      // every one of them still changes the screen the instant it is called.
      ui: () => ({ fadeMs: fadeMs(), veilMs: veilMs(), stagger: calm || EchoWordmark.reduceMotion() ? 230 : 170, transitioning, calm, reduceMotion: EchoWordmark.reduceMotion(), veilOn: $('veil').classList.contains('on'), shown: overlays.filter((o) => !$(o).classList.contains('hidden')), lit: overlays.filter((o) => $(o).classList.contains('in')) }),
      transition: (fn) => go(fn),
      // v11.3: the title wordmark. `wordmarkTick(secs)` drives its clock by hand, for a screenshot of a sweep.
      wordmark,
      wordmarkState: () => wordmark.state(),
      wordmarkReveal: (sound = false) => wordmark.reveal(sound),
      wordmarkTick: (secs, stepSecs = 1 / 60) => {
        for (let s = 0; s < secs; s += stepSecs) wordmark.update(stepSecs);
        return wordmark.state();
      },
      // hold the sweep at exactly this point (0..1) and paint it: the same instant can then be photographed
      // with calm mode off and on, which is the only honest way to show what calm mode does to it
      wordmarkSeek: (u, isReveal = false) => wordmark.seek(u, isReveal),
      wordmarkRelease: () => wordmark.release(),
      // v11.2: the tutorial (level 0). go(0) plays it; startTutorial('intro' | 'title') sets where it hands over to.
      startTutorial,
      skipTutorial,
      leaveTutorial,
      tutorialState: () => ({ ...tutorial.state(), after: tutorialAfter, hint: tutHint, done: tutorialDone }),
      tutorialSteps: () => tutorial.stepIds(),
      newPlayer: () => newPlayer(),
      setTutorialDone: (on) => {
        if (on) markTutorialDone();
        else {
          tutorialDone = false;
          store.set(TUTORIAL_KEY, '0');
        }
        return tutorialDone;
      },
      // v13.0: lore fragments (js/lore.js)
      lore: () => ({
        here: level && level.fragment ? Object.assign({}, level.fragment) : null,
        found: EchoLore.found(),
        count: EchoLore.count(),
        reading: loreReader.state(),
      }),
      // where a maze WOULD put its fragment, without playing it: (level, run seed, mode)
      placeFragment: (n, seed, m) => EchoLore.place(generateLevel(n, seed, m || mode), n, m || mode, seed),
      readFragment: () => readFragment(),
      setLoreFound: (ids) => EchoLore.setFound(ids),
      showArchive: () => showArchive(),
      // v14.0: levels 14-16 (js/story.js). go(14..16) plays them; step() drives them (the beats run inside play).
      story,
      storyState: () => story.state(),
      // (v22.0) save codes: the context, the refresh, and the Settings tab's own calls
      saveCode: {
        ctx: () => saveCtx(),
        afterLoad: () => afterSaveLoad(),
        ui: () => settings.saveCode,
        mode: () => mode,
        progress: () => ({ ...progress }),
        seen: () => ({ ...seen }),
        tutorialDone: () => tutorialDone,
      },
      // (v21.0) cosmetics
      cosmetics: {
        facts: () => cosFacts(),
        look: () => cosLook && Object.assign({}, cosLook),
        refresh: () => refreshCosmetics(),
        ui: () => settings, // (the Settings screen: openSettings, showTab, renderCosmetics, previewRunning)
        equip: (kind, id) => {
          const ok = EchoCosmetics.equip(kind, id, cosFacts());
          refreshCosmetics();
          return ok;
        },
      },
      // (v20.0) Endless: the run, its save, and any depth of any run built again
      endless: {
        state: () => (endlessRun ? { seed: endlessRun.seed, depth: endlessRun.depth, mode: endlessRun.mode, startBest: endlessRun.startBest, passedBest: endlessRun.passedBest, levelOk: !!(level && level.endless && level.endless.ok), attempt: level && level.endless ? level.endless.attempt : null } : null),
        unlocked: () => endlessUnlocked(),
        alarmMet: () => alarmMet(),
        save: () => endlessSave(),
        start: (seed) => {
          startEndless();
          if (seed !== undefined && endlessRun) {
            endlessRun.seed = seed >>> 0;
            startLevel(ENDLESS_LEVEL);
          }
          return endlessRun && endlessRun.seed;
        },
        goDepth: (d) => {
          if (!endlessRun) return false;
          endlessRun.depth = Math.max(1, d | 0);
          startLevel(ENDLESS_LEVEL);
          return true;
        },
        build: (seed, depth, m = mode, opts) => generateEndless(seed >>> 0, depth, m, opts || { alarm: alarmMet() }),
        again: () => endlessAgain(),
      },
      dusk: () => story.dusk(), // (v19.3)
      talk: () => story.talk(),
      scriptLock: () => ({ locked: scriptLock, walk: { ...scriptWalk } }),
      hunter: () => {
        const e = enemies.find((m) => m.kind === 'warden');
        return e ? { x: e.x, y: e.y, r: e.r, state: e.state, variant: e.variant, speed: e.speed, hidden: !!e.hidden, held: !!e.held, why: e.why || null, abilities: e.abilities.length } : null;
      },
      // ?debug only, for the measured speed test: wake the Warden now, wherever it is
      wakeHunter: () => {
        const e = enemies.find((m) => m.kind === 'warden');
        if (e) wakeWarden(e, e.variant === 'upgraded' ? 'upgraded' : 'hunt'); // (v17.0: by its variant - 16 is not the last level now)
        return !!e;
      },
      // v15.0: the level editor. openEditorScreens() is the title's button; playCustom(doc, from) starts a custom
      // level at once (no fade) and returns null or the reason it cannot be played; leaveCustom() goes back.
      editor,
      myLevels,
      levelStore: EchoLevelStore,
      bonus: EchoLevelStore.bonus, // v15.2: the bonus levels (read-only) and their ticks
      share: EchoShare, // v15.3: share codes
      creatorName: () => creatorName(),
      setCreatorName: (v) => setCreatorName(v),
      levelFormat: EchoLevelFormat,
      levelCheck: EchoLevelCheck,
      dialog: EchoDialog,
      monsterChoices: () => monsterChoices(),
      openEditorScreens: () => openEditorScreens(),
      acceptGate: () => acceptGate(),
      acceptUnreleased: () => acceptUnreleasedGate(), // (v15.7)
      unreleased: () => UNRELEASED_CONTENT.slice(),
      closeEditorScreens: () => closeEditorScreens(),
      openEditor: (doc, folder) => openEditor(doc || null, folder || null),
      editorUnlocked: () => editorUnlocked(),
      editorScreen: () => editorScreen,
      // (v15.1: the title card is taken away at once unless { card: true } - the v15.0 tests expect to be playing)
      playCustom: (doc, from = 'editor', opts = {}) => {
        const built = buildCustomLevel(doc);
        if (!built.level) return built.error;
        audio.init();
        startCustom(doc, from, opts.queue || null);
        if (!opts.card) endCard();
        return null;
      },
      leaveCustom: () => leaveCustom(),
      customRun: () => (customRun ? { from: customRun.from, title: customRun.doc.title, queue: customRun.queue ? { ...customRun.queue } : null } : null),
      // v15.1: the touch warning, the title card, folders played in order, and what a custom level holds
      acceptTouchGate: () => acceptTouchGate(),
      endCard: () => endCard(),
      card: () => (state === 'card' ? { left: +cardTimer.toFixed(2), kicker: $('card-kicker').textContent, title: $('card-title').textContent, line: $('card-line').textContent, diff: $('card-diff').textContent } : null),
      playQueue: (queue) => playQueue(queue),
      customAdvance: () => customAdvance(),
      queueAfter: () => {
        const n = queueAfter();
        return n ? { index: n.index, title: n.doc.title } : null;
      },
      customState: () =>
        level && level.custom
          ? {
              exits: level.exits.map((e) => ({ x: e.x, y: e.y, tx: e.tx, ty: e.ty, locked: e.locked, opening: e.opening, swing: e.swing })),
              key: level.key ? { x: level.key.x, y: level.key.y, taken: level.key.taken } : null,
              hasKey: !!player.hasKey,
              notes: level.notes.map((n) => ({ x: n.x, y: n.y, kind: n.kind, text: n.text, read: n.read })),
              puddles: level.puddles.length,
              decoy: level.decoy ? { taken: level.decoy.taken } : null,
              zones: fxZones.length,
              palette: EchoPalette.id,
              paletteBorrowed,
              rating: cfg.rating,
              cfg: { enemySpeed: cfg.enemySpeed, scentSpeed: cfg.scentSpeed, stalkerSpeed: cfg.stalkerSpeed, mufflerSpeed: cfg.mufflerSpeed, singerSpeed: cfg.singerSpeed, footstepRadius: cfg.footstepRadius, presenceRadius: cfg.presenceRadius, smellRange: cfg.smellRange, rippleRadius: cfg.rippleRadius, mimicTell: cfg.mimicTell },
              wardens: enemies.filter((e) => e.kind === 'warden').map((e) => ({ variant: e.variant, speed: e.speed })),
            }
          : null,
      fxZones: () => fxZones,
      // v12.0: level 13, the capture (js/warden.js). go(13) plays it; the hooks below drive and inspect it.
      warden,
      wardenState: () => warden.state(),
      wardenDread: (x, y) => warden.dreadAt(x === undefined ? player.x : x, y === undefined ? player.y : y),
      // the involuntary ripple walking into the great room sends, on demand
      gasp: () => wardenGasp(),
      // step the capture on by hand once the controls are gone (updatePlay is not running then)
      captureStep: (secs) => {
        for (let t = 0; t < secs && (state === 'capture' || state === 'play'); t += 1 / 60) {
          if (state === 'play') updatePlay(1 / 60);
          else warden.update(1 / 60);
        }
        return warden.state();
      },
      /** Everything worth checking about the hand-drawn level 13: shape, reachability, the seal and the ramp. */
      wardenCheck: () => {
        if (!level || !level.warden) return null;
        const W = level.W;
        const H = level.H;
        const w = level.warden;
        const open = (i) => !level.walls[i];
        let floors = 0;
        let deadEnds = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if (!open(i)) continue;
            floors++;
            let n = 0;
            if (x > 0 && open(i - 1)) n++;
            if (x < W - 1 && open(i + 1)) n++;
            if (y > 0 && open(i - W)) n++;
            if (y < H - 1 && open(i + W)) n++;
            if (n === 1) deadEnds++;
          }
        }
        // how many ways there are into the great room (it must be exactly one)
        const R = EchoWarden.ROOM_T;
        let mouths = 0;
        for (let y = R.y0; y <= R.y1; y++) {
          if (open(y * W + R.x0 - 1)) mouths++;
          if (open(y * W + R.x1 + 1)) mouths++;
        }
        for (let x = R.x0; x <= R.x1; x++) {
          if (open((R.y0 - 1) * W + x)) mouths++;
          if (open((R.y1 + 1) * W + x)) mouths++;
        }
        const sTile = Math.floor(level.start.y / TILE) * W + Math.floor(level.start.x / TILE);
        const eTile = EchoWarden.ENTRY_T.y * W + EchoWarden.ENTRY_T.x;
        const dS = bfsDist(level.blocked, W, H, sTile);
        // can anything walk round the warden to the door's wall? (the tiles beside it must be unreachable)
        const doorSide = (DOOR_T => (DOOR_T.y * W + DOOR_T.x - 1))(EchoWarden.DOOR_T);
        return {
          size: `${W}x${H}`,
          floors,
          deadEnds,
          mouths, // 1: the room has exactly one way in
          roomTiles: level.roomTiles.length,
          startToRoom: dS[eTile], // tiles of walking from the start to the room's threshold
          pathTiles: level.pathTiles,
          doorTileReachable: dS[doorSide] >= 0, // false: the warden seals the door off
          circles: w.circles.length,
          ripple: Math.round(cfg.rippleRadius),
          cooldown: +cfg.cooldown.toFixed(3),
          monsters: enemies.length,
          dreadAt: {
            start: +warden.dreadAt(level.start.x, level.start.y).toFixed(3),
            mouth: +warden.dreadAt((EchoWarden.MOUTH_T.x + 0.5) * TILE, (EchoWarden.MOUTH_T.y + 0.5) * TILE).toFixed(3),
            inside: +warden.dreadAt(w.insideX + 20, (R.y1 + 0.5) * TILE).toFixed(3),
          },
        };
      },
      profile: EchoProfile,
      medals: () => EchoProfile.allMedals(),
      stats: () => EchoProfile.stats(),
      pars: (tiles) => EchoProfile.pars(tiles),
      music,
      musicState: () => music.state(),
      levelDeaths: () => levelDeaths,
      settings: () => ({
        campaignLevels: CAMPAIGN_LEVELS, // 20 since v17.0 (the tutorial is level 0 and is not one of them)
        medalLevels: MEDAL_LEVELS, // 12: levels 13-16 are hand-drawn, have no cleared screen and take no medals
        // level 13 (js/warden.js): the fixed level, the one room that glows, and the capture
        warden: { level: WARDEN_LEVEL, insideX: EchoWarden.INSIDE_PX, waveFallback: EchoWarden.WAVE_FALLBACK, dreadTiles: EchoWarden.DREAD_TILES, at: level && level.warden ? warden.state() : null },
        // levels 14-16 (js/story.js), and the two speeds of the Warden that hunts you on 15 and 16 (js/level.js)
        story: { first: STORY_FIRST, last: STORY_LAST, walkSpeed: WALK_SPEED, wardenSpeed: WARDEN_SPEED, wardenUpgradedSpeed: WARDEN_UPGRADED_SPEED, at: level && level.story ? story.state() : null },
        lore: { total: EchoLore.TOTAL, found: EchoLore.count(), chance: EchoLore.CHANCE[mode], bonus: EchoLore.bonusUnlocked(), secret: EchoLore.secretUnlocked(), here: level && level.fragment ? level.fragment.id : null },
        // the level editor (v15.0): open to this player? (accepted the warning, or finished a mode), and what is up
        editor: { unlocked: editorUnlocked(), accepted: store.get(EDITOR_KEY) === '1', anyModeFinished: anyModeFinished(), screen: editorScreen, custom: customRun ? customRun.from : null, curveLevel: CUSTOM_CURVE_LEVEL, levels: EchoLevelStore.list().length, bonus: EchoLevelStore.bonus.list().length, bonusDone: EchoLevelStore.bonus.doneIds().length, view: myLevels.view() },
        // the tutorial: whether it has been done, where it would hand over to, and where the lesson is up to
        tutorial: { level: TUTORIAL_LEVEL, done: tutorialDone, after: tutorialAfter, newPlayer: newPlayer(), steps: tutorial.stepIds(), at: inTutorial() ? tutorial.state() : null },
        palette: EchoPalette.id,
        showTimer,
        volumes: EchoProfile.volumes(),
        keyBindings: (() => {
          const out = {};
          for (const a of EchoProfile.ACTIONS) out[a.id] = EchoProfile.keysFor(a.id).slice();
          return out;
        })(),
        medalPar: cfg && level ? EchoProfile.pars(level.pathTiles) : null,
        music: music.state(),
        // the new monsters' numbers in this mode (from the MODES table; speeds are for the current level when one is running)
        muffler: { footstepRadius: MODES[mode].mufflerFootstepRadius, presenceRadius: MODES[mode].mufflerPresenceRadius, crouchRadius: MODES[mode].mufflerCrouchRadius, memorySeconds: MODES[mode].mufflerMemorySeconds, speed: cfg ? cfg.mufflerSpeed : null, shownForDebug: debugShowMuffler },
        singer: { markSeconds: MODES[mode].markSeconds, landRadius: MODES[mode].landRadius, singInterval: MODES[mode].singInterval, singRange: MODES[mode].singRange, speed: cfg ? cfg.singerSpeed : null, leapSeconds: SINGER_LEAP_SECONDS },
        mode,
        calm,
        visualCues,
        touchControls: { on: touchOn, saved: touchPref }, // saved: '1' forced on, '0' forced off, null = automatic
        audioFx, // wall muffling + Doppler (always true in real play)
        progress: { ...progress },
        seen: { ...seen },
      }),
      draw: () => draw(),
      // (v16.4) the Caught screen's line: what a kind (and monster) would say, and a catch on demand (the fallback tests)
      caughtLine: (cause, e) => caughtLine(cause, e),
      caughtLines: () => Object.assign({}, CAUGHT_LINES),
      forceCaught: (cause, why, e) => onCaught(cause, why, e),
      // (v16.3) What's new: open it (the full history, or these entries), close it, look again as if the page had just
      // loaded (`st` a stand-in storage, for the storage tests), and let it decide again
      whatsNew: {
        open: (entries) => openWhatsNew(entries || null),
        close: () => closeWhatsNew(),
        isOpen: () => wnOpen,
        maybe: () => maybeShowWhatsNew(),
        reload: (st) => {
          wnDecided = false;
          const r = EchoWhatsNew._reload(st);
          refreshWhatsNewDot();
          return r;
        },
        state: () => ({ open: wnOpen, decided: wnDecided, dot: !$('whatsnew-dot').classList.contains('hidden'), ...EchoWhatsNew._state() }),
        reached: () => furthestReached(),
      },
      audio,
    };
  }
})();
