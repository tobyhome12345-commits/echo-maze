'use strict';

/**
 * The opening cutscene: a few lines of lore over black, then a scripted scene
 * in the dark maze. An explorer who has been lost for too long sends out a
 * ripple, hears something answer, and is taken by an echo monster. Then it is
 * your turn (level 1).
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

    // -------------------------------------------------------------- helpers
    const sceneT = () => time - S;
    /** Calm mode softens the scare: no flash or shake, a dimmer monster, quieter sound. */
    const isCalm = () => !!(env.calm && env.calm());

    function personX(st) {
      if (st <= WALK[0][0]) return WALK[0][1];
      for (let i = 1; i < WALK.length; i++) {
        if (st <= WALK[i][0]) {
          const [t0, x0] = WALK[i - 1];
          const [t1, x1] = WALK[i];
          return lerp(x0, x1, (st - t0) / (t1 - t0));
        }
      }
      return WALK[WALK.length - 1][1];
    }

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

    // ----------------------------------------------------------------- flow
    function start() {
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
      build();
      el.root.classList.remove('hidden');
      el.card.classList.remove('show');
      el.caption.classList.remove('show');
      el.sub.classList.remove('show');
      audio.startAmbient(1);
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
      env.finish();
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
      const walking = Math.abs(personX(sceneT() + 0.05) - personX(sceneT())) > 0.001;
      const phase = time * 9;
      ctx.save();
      ctx.translate(person.x + offX, person.y + (walking ? Math.sin(phase) * 0.8 : 0));
      ctx.scale(1.3, 1.3);
      ctx.globalCompositeOperation = 'lighter';

      // a soft pool of warm light from the failing headlamp
      let g = ctx.createRadialGradient(0, 0, 0, 0, 0, 140);
      g.addColorStop(0, `rgba(255,208,140,${0.2 * lamp})`);
      g.addColorStop(1, 'rgba(255,208,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 140, 0, TAU);
      ctx.fill();

      ctx.rotate(angle);
      g = ctx.createRadialGradient(0, 0, 4, 0, 0, 170);
      g.addColorStop(0, `rgba(255,226,170,${0.17 * lamp})`);
      g.addColorStop(1, 'rgba(255,226,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 170, -0.42, 0.42);
      ctx.closePath();
      ctx.fill();

      // the figure, seen from above: pack, shoulders, swinging hands, head
      ctx.fillStyle = 'rgba(255,226,175,0.3)';
      ctx.fillRect(-13, -7, 8, 14);
      ctx.fillStyle = 'rgba(255,226,175,0.5)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 12, 0, 0, TAU);
      ctx.fill();
      const swing = walking ? Math.sin(phase) * 4 : 0;
      ctx.fillStyle = 'rgba(255,232,190,0.55)';
      [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.arc(2 + swing * side, side * 11.5, 2.3, 0, TAU);
        ctx.fill();
      });
      ctx.fillStyle = 'rgba(255,240,212,0.9)';
      ctx.beginPath();
      ctx.arc(2, 0, 5.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(255,250,232,${0.95 * lamp})`;
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

    function draw() {
      if (!active) return;
      const { DPR, viewScale } = env.size();
      const cw = canvas.width;
      const ch = canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#010206';
      ctx.fillRect(0, 0, cw, ch);

      if (time < S) {
        drawRings(cw, ch);
        return;
      }

      const st = sceneT();
      const s = viewScale * DPR * 1.55; // a closer, more cinematic camera than the game's
      const sx = (Math.random() - 0.5) * shake * DPR;
      const sy = (Math.random() - 0.5) * shake * DPR;
      ctx.setTransform(s, 0, 0, s, cw / 2 - camX * s + sx, ch / 2 - camY * s + sy);
      env.drawRippleLayer();
      if (personVisible) drawPerson();
      if (monster) drawMonster();
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
      // for tests: the current screen flash / shake amounts
      get fx() {
        return { flash, shake };
      },
    };
  }

  return { create };
})();
