'use strict';

/**
 * The story cutscenes - four scripted scenes in the dark maze, chosen by start(kind):
 *   'intro' (before level 1)   an explorer who has been lost for too long sends out a ripple, hears
 *                              something answer, and is taken by an echo monster. Then it is your turn.
 *   'scent' (level 5 -> 6)     an explorer steps in a puddle and a scent monster follows their trail.
 *   'mimic' (level 7 -> 8)     an explorer follows the exit's chime to a glow, pings it - and it is a mimic.
 *   'decoy' (level 8 -> 9)     an explorer finds a sonar decoy and uses it to trap two monsters.
 *
 * Everything runs off one clock (`time`, seconds since the cutscene began), and
 * everything you hear is synthesised - including the mumble of the explorer's
 * voice, which is just formant-shaped buzzing under the subtitles.
 *
 * The explorer's sonar is the game's real ripple system (env.castRipple), so it
 * looks and sounds exactly like yours.
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

  const PAL_INTRO = { glow: '255,208,140', cone: '255,226,170', body: '255,226,175', hand: '255,232,190', head: '255,240,212', lamp: '255,250,232' };
  const PAL_SCENT = { glow: '196,236,170', cone: '210,242,196', body: '206,236,196', hand: '214,242,204', head: '234,250,228', lamp: '246,255,240' };
  const PAL_MIMIC = { glow: '255,176,156', cone: '255,200,182', body: '255,200,186', hand: '255,210,196', head: '255,228,216', lamp: '255,242,234' }; // a coral lamp
  const PAL_DECOY = { glow: '255,196,236', cone: '255,214,242', body: '255,214,240', hand: '255,224,246', head: '255,240,250', lamp: '255,248,252' }; // a pink-white lamp
  const LIME = '190,240,70';
  const VIOLET = '176,124,255';
  const EXITGREEN = '93,255,160'; // the exit's green, which the mimic copies
  const PINK = '255,122,217'; // the sonar decoy's pink

  // per-scene set-up: when the scene proper begins, the lamp colours, and which level's ambient drone plays
  const SCENE_START = { intro: S, scent: SC_S, mimic: MM_S, decoy: DC_S };
  const SCENE_PAL = { intro: PAL_INTRO, scent: PAL_SCENT, mimic: PAL_MIMIC, decoy: PAL_DECOY };
  const SCENE_AMBIENT = { intro: 1, scent: 6, mimic: 8, decoy: 9 };

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

    // which scene is playing: 'intro', 'scent', 'mimic' or 'decoy' (see the header comment)
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

    // ----------------------------------------------------------------- flow
    /** kind: 'intro' (before level 1), 'scent' (5 -> 6), 'mimic' (7 -> 8) or 'decoy' (8 -> 9). */
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
      else build();
      el.root.classList.remove('hidden');
      el.card.classList.remove('show');
      el.caption.classList.remove('show');
      el.sub.classList.remove('show');
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
      const walking = kind === 'mimic' || kind === 'decoy' ? isWalking : Math.abs(xAt(sceneT() + 0.05) - xAt(sceneT())) > 0.001;
      const phase = time * 9;
      ctx.save();
      ctx.translate(person.x + offX, person.y + (walking ? Math.sin(phase) * 0.8 : 0));
      ctx.scale(1.3, 1.3);
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

    /** An echo monster's body at (mx,my), facing `heading`: red glowing line-art. */
    function drawEchoBody(mx, my, heading, scale, alpha) {
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(heading);
      ctx.scale(scale, scale);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const path = () => {
        ctx.beginPath();
        // body: an outer ring and a listening "dish" inside it
        ctx.moveTo(15, 0);
        ctx.arc(0, 0, 15, 0, TAU);
        ctx.moveTo(7, 0);
        ctx.arc(0, 0, 7, 0, TAU);
        // eyeless head: a ragged, gaping mouth at the front
        for (let k = -3; k <= 3; k++) {
          const a = k * 0.13;
          ctx.moveTo(Math.cos(a) * 15, Math.sin(a) * 15);
          ctx.lineTo(Math.cos(a + 0.05) * (26 + (k % 2 ? 6 : 0)), Math.sin(a + 0.05) * (26 + (k % 2 ? 6 : 0)));
        }
        // ear fins that sweep forward
        ctx.moveTo(Math.cos(0.6) * 20, Math.sin(0.6) * 20);
        ctx.arc(0, 0, 20, 0.6, 1.25);
        ctx.moveTo(Math.cos(-0.6) * 20, Math.sin(-0.6) * 20);
        ctx.arc(0, 0, 20, -0.6, -1.25, true);
        // eight skittering legs
        for (let i = 0; i < 8; i++) {
          const base = (i / 8) * TAU + 0.4;
          const sw = Math.sin(time * 26 + i * 1.9) * 0.22;
          const kneeA = base + 0.35 + sw;
          const footA = base - 0.12 + sw * 1.4;
          ctx.moveTo(Math.cos(base) * 13, Math.sin(base) * 13);
          ctx.lineTo(Math.cos(kneeA) * 30, Math.sin(kneeA) * 30);
          ctx.lineTo(Math.cos(footA) * 46, Math.sin(footA) * 46);
        }
      };
      path();
      ctx.strokeStyle = `rgba(255,59,92,${0.24 * alpha})`;
      ctx.lineWidth = 12;
      ctx.stroke();
      path();
      ctx.strokeStyle = `rgba(255,120,140,${0.95 * alpha})`;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.restore();
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

    /** A scent monster's body at (x,y): violet line-art with a sniffing snout. `follow` = it has a trail (faster sniffing and legs). */
    function drawScentBody(x, y, scale, alpha, follow) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.arc(0, 0, 16, 0, TAU); // body
        ctx.moveTo(8, 0);
        ctx.arc(0, 0, 8, 0, TAU);
        // the snout, sniffing up and down
        const sn = Math.sin(time * (follow ? 14 : 7)) * 3;
        ctx.moveTo(15, -5);
        ctx.lineTo(36, -4 + sn);
        ctx.moveTo(15, 5);
        ctx.lineTo(36, 4 + sn);
        ctx.moveTo(38 + 2, -2 + sn);
        ctx.arc(38, -2 + sn, 2, 0, TAU);
        ctx.moveTo(40, 3 + sn);
        ctx.arc(38, 3 + sn, 2, 0, TAU);
        // six legs
        for (let i = 0; i < 6; i++) {
          const base = (i / 6) * TAU + 0.5;
          const sw = Math.sin(time * (follow ? 22 : 12) + i * 2.1) * 0.25;
          ctx.moveTo(Math.cos(base) * 14, Math.sin(base) * 14);
          ctx.lineTo(Math.cos(base + 0.3 + sw) * 28, Math.sin(base + 0.3 + sw) * 28);
          ctx.lineTo(Math.cos(base - 0.1 + sw * 1.3) * 40, Math.sin(base - 0.1 + sw * 1.3) * 40);
        }
      };
      path();
      ctx.strokeStyle = `rgba(${VIOLET},${0.22 * alpha})`;
      ctx.lineWidth = 11;
      ctx.stroke();
      path();
      ctx.strokeStyle = `rgba(200,165,255,${0.95 * alpha})`;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.restore();
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
      ctx.strokeStyle = `rgba(${LIME},${0.3 + 0.4 * lit})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(SC_PUDDLE_X, PY, 15, 0, TAU);
      ctx.stroke();

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
        ctx.strokeStyle = `rgba(${EXITGREEN},${0.4 * appear * pulse})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(MM_X, PY, 16, 0, TAU);
        ctx.stroke();
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
        drawEchoBody(mm.x, PY, Math.PI, lerp(0.9, soft ? 1.1 : 1.45, smooth(t / 0.8)), soft ? 0.5 : 1);
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
        ctx.strokeStyle = `rgba(${PINK},${0.7 * strength})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, TAU);
        ctx.stroke();
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
