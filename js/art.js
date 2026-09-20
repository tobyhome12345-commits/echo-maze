'use strict';

/**
 * The look of everything a ripple can light up: one silhouette per thing, plus a little texture, so they can be
 * told apart at a glance (and not by colour alone). Plain Canvas 2D line-art: no images, no dependencies.
 *
 *   echo monster  (red)     spiky and eyeless: a jagged star of a body with a gaping V mouth and ribs
 *   scent monster (violet)  a soft blob with a wavy edge, drips trailing behind it and small bubbles
 *   stalker       (orange)  a thin body with a tiny blind head, two feelers and long, jointed limbs
 *   boulder       (amber)   an irregular rock with a few cracks
 *   pillar        (amber)   a round column: a ring on top and fluting round the edge
 *   puddle        (lime)    a glossy blob with a shine, two bubbles and a ripple
 *   sonar decoy   (pink)    a small device: a box, a short antenna and a ring round it
 *   exit          (green)   a portal: concentric rings, a slow rotating arc, a doorway and a few soft sparkles
 *   wall          (blue)    stone joints and the odd crack, along the lit outline (see wallTexture)
 *
 * Rules this file keeps:
 *   - VISUAL ONLY. It draws what it is handed and reads nothing from the game; nothing in the game reads anything
 *     back from it. It never calls Math.random and never touches the level generator's random numbers
 *     (mulberry32): every shape is a fixed function of a seed (the object's position) and, for the little
 *     movements, of the clock `o.t` the caller passes in.
 *   - TRUE SIZE. Everything is drawn inside a circle of radius r (the object's real collision radius), so what
 *     you see is what blocks or kills you. (The cutscenes pass a larger r, to show the same art bigger.)
 *   - CHEAP. A few dozen path segments and three or four strokes per thing; no images, no gradients per thing.
 *
 * EchoArt.draw(ctx, kind, x, y, r, o) draws one thing. The caller sets the composite mode (the game uses
 * 'lighter', like everything else in the dark). The options o:
 *   a        brightness 0..1 (default 1)
 *   t        the animation clock, in seconds
 *   h        heading in radians (echo monster, scent monster, stalker; default 0 = facing right)
 *   seed     which boulder / puddle this is (EchoArt.seedOf(x, y) of its position)
 *   tell     the exit only: how a disguised mimic differs from the real exit - 'none' | 'subtle' | 'clear'
 *   walking, listening   the stalker only: legs going / feelers sweeping wide
 */
const EchoArt = (() => {
  const TAU = Math.PI * 2;

  // the colours (the same ones the ripples use), and a paler tint for the bright core line of each
  const RGB = {
    wall: '95,212,255',
    boulder: '255,179,71',
    pillar: '255,179,71',
    echo: '255,59,92',
    exit: '93,255,160',
    scent: '176,124,255',
    puddle: '190,240,70',
    decoy: '255,122,217',
    stalker: '255,116,16',
  };
  const CORE = {
    wall: '170,230,255',
    boulder: '255,214,140',
    pillar: '255,214,140',
    echo: '255,130,150',
    exit: '170,255,205',
    scent: '208,176,255',
    puddle: '222,255,130',
    decoy: '255,182,236',
    stalker: '255,186,116',
  };
  const HEADED = { echo: 1, scent: 1, stalker: 1 };

  // ----------------------------------------------------------- tiny helpers
  function hash2(a, b) {
    let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }
  /** A small private xorshift generator, so a shape can be a fixed function of its seed. (Not the game's random numbers.) */
  function rng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }
  /** A repeatable number for something standing at (x, y): the same spot always gives the same shape. */
  const seedOf = (x, y) => hash2(Math.round(x), Math.round(y));
  /** Obstacles are drawn as boulders or pillars, decided by where they stand (the level itself does not say). */
  const obstacleKind = (x, y) => (seedOf(x, y) & 1 ? 'pillar' : 'boulder');

  // --------------------------------------------------------------- painting
  /** Fill, glow and core-stroke the path that is currently open. w = core line width (in the drawing's own units). */
  function paint(ctx, rgb, core, a, w, fillA) {
    if (fillA > 0) {
      ctx.fillStyle = `rgba(${rgb},${fillA * a})`;
      ctx.fill();
    }
    ctx.lineWidth = w * 3.4;
    ctx.strokeStyle = `rgba(${rgb},${0.2 * a})`;
    ctx.stroke();
    ctx.lineWidth = w;
    ctx.strokeStyle = `rgba(${core},${Math.min(1, 0.95 * a)})`;
    ctx.stroke();
  }
  /** Stroke the open path as thinner detail lines (ribs, cracks, flutes...). */
  function detail(ctx, core, a, w, k = 0.62) {
    ctx.lineWidth = w * k;
    ctx.strokeStyle = `rgba(${core},${0.72 * a})`;
    ctx.stroke();
  }
  const circle = (ctx, x, y, r) => {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  };

  // ------------------------------------------------------------ echo monster
  // A jagged star of a body facing right (+x): two mandibles round a gaping V, spikes down both sides, a long tail.
  // [x, y, isTip]. Built once, mirrored, and scaled so no point is farther than 0.95 from the middle.
  const ECHO = (() => {
    const lower = [
      [1.0, 0.2, 1], [0.6, 0.3, 0], [0.84, 0.64, 1], [0.4, 0.5, 0], [0.46, 0.9, 1],
      [0.06, 0.54, 0], [-0.2, 0.94, 1], [-0.38, 0.5, 0], [-0.74, 0.8, 1], [-0.62, 0.28, 0],
    ];
    const pts = lower.map((p) => p.slice());
    pts.push([-1.0, 0, 1]);
    for (let i = lower.length - 1; i >= 0; i--) pts.push([lower[i][0], -lower[i][1], lower[i][2]]);
    pts.push([0.64, 0, 0]); // the notch of the mouth, between the two mandible tips
    let m = 0;
    for (const p of pts) m = Math.max(m, Math.hypot(p[0], p[1]));
    for (const p of pts) {
      p[0] *= 0.95 / m;
      p[1] *= 0.95 / m;
    }
    return pts;
  })();

  function echo(ctx, a, w, o) {
    const t = o.t || 0;
    ctx.beginPath();
    for (let i = 0; i < ECHO.length; i++) {
      const p = ECHO[i];
      const k = p[2] ? 1 + 0.05 * (0.5 + 0.5 * Math.sin(t * 6 + i * 1.7)) : 1; // the points twitch a little
      if (i) ctx.lineTo(p[0] * k, p[1] * k);
      else ctx.moveTo(p[0] * k, p[1] * k);
    }
    ctx.closePath();
    paint(ctx, RGB.echo, CORE.echo, a, w, 0.16);
    // ribs across the body, and a spine - no eyes anywhere
    ctx.beginPath();
    for (const x of [-0.46, -0.1, 0.26]) {
      ctx.moveTo(x, -0.36);
      ctx.quadraticCurveTo(x + 0.16, 0, x, 0.36);
    }
    ctx.moveTo(-0.68, 0);
    ctx.lineTo(0.46, 0);
    detail(ctx, CORE.echo, a, w);
  }

  // ----------------------------------------------------------- scent monster
  function scent(ctx, a, w, o) {
    const t = o.t || 0;
    ctx.beginPath();
    const N = 36;
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * TAU;
      const rr = 0.68 + 0.07 * Math.sin(2 * th + t * 1.4) + 0.05 * Math.sin(3 * th - t * 1.1 + 1) + 0.05 * Math.sin(9 * th + t * 2.4);
      if (i) ctx.lineTo(Math.cos(th) * rr, Math.sin(th) * rr);
      else ctx.moveTo(Math.cos(th) * rr, Math.sin(th) * rr);
    }
    ctx.closePath();
    paint(ctx, RGB.scent, CORE.scent, a, w, 0.16);
    ctx.beginPath();
    // drips trailing behind it, each ending in a drop
    const drips = [[Math.PI - 0.6, 0.24], [Math.PI + 0.04, 0.3], [Math.PI + 0.62, 0.22]];
    for (let i = 0; i < drips.length; i++) {
      const th = drips[i][0];
      const len = drips[i][1] * (0.85 + 0.15 * Math.sin(t * 2 + i * 2.1));
      const c = Math.cos(th);
      const s = Math.sin(th);
      ctx.moveTo(c * 0.64, s * 0.64);
      ctx.lineTo(c * (0.66 + len), s * (0.66 + len));
      circle(ctx, c * (0.66 + len + 0.05), s * (0.66 + len + 0.05), 0.045);
    }
    // small bubbles inside
    const b = [[0.22, -0.18, 0.11], [-0.1, 0.22, 0.08], [0.3, 0.2, 0.06]];
    for (let i = 0; i < b.length; i++) circle(ctx, b[i][0], b[i][1] + 0.03 * Math.sin(t * 1.7 + i * 2), b[i][2]);
    detail(ctx, CORE.scent, a, w, 0.7);
  }

  // ----------------------------------------------------------------- stalker
  // Thin body, a small blind head, two feelers, six long jointed limbs.
  function stalker(ctx, a, w, o) {
    const t = o.t || 0;
    const listening = !!o.listening;
    const flick = Math.sin(t * (listening ? 8 : 5)) * (listening ? 0.16 : 0.07);
    const walk = o.walking ? 0.07 : 0.015;
    ctx.beginPath();
    ctx.moveTo(0.5, 0);
    ctx.ellipse(-0.1, 0, 0.6, 0.13, 0, 0, TAU); // the long, thin body
    circle(ctx, 0.66, 0, 0.1); // the small head: nothing to look with
    paint(ctx, RGB.stalker, CORE.stalker, a, w, 0.2);
    ctx.beginPath();
    ctx.moveTo(0.72, -0.05);
    ctx.quadraticCurveTo(0.86, -0.1, 0.9, -0.3 + flick); // two feelers, listening
    ctx.moveTo(0.72, 0.05);
    ctx.quadraticCurveTo(0.86, 0.1, 0.9, 0.3 - flick);
    const hip = [0.3, -0.05, -0.38];
    const kneeX = [0.12, 0.05, -0.08];
    const kneeY = [0.42, 0.55, 0.45];
    const footX = [0.34, 0.06, -0.25];
    const footY = [0.7, 0.9, 0.74];
    for (let k = 0; k < 3; k++) {
      const sw = Math.sin(t * 6 + k * 2.1) * walk;
      for (const side of [-1, 1]) {
        ctx.moveTo(hip[k], side * 0.1);
        ctx.lineTo(hip[k] + kneeX[k] + sw * side * 0.4, side * kneeY[k]);
        ctx.lineTo(hip[k] + footX[k] + sw, side * footY[k]);
      }
    }
    detail(ctx, CORE.stalker, a, w, 0.9);
  }

  // ------------------------------------------------------------- obstacles
  const rockCache = new Map();
  function rockData(seed) {
    let d = rockCache.get(seed);
    if (d) return d;
    const R = rng(seed);
    const N = 9;
    const pts = [];
    let m = 0;
    for (let i = 0; i < N; i++) {
      const th = ((i + (R() - 0.5) * 0.55) / N) * TAU;
      const rr = 0.7 + 0.3 * R();
      pts.push([Math.cos(th) * rr, Math.sin(th) * rr]);
      m = Math.max(m, rr);
    }
    for (const p of pts) {
      p[0] *= 0.97 / m;
      p[1] *= 0.97 / m;
    }
    const cracks = [];
    const c0 = Math.floor(R() * N);
    for (const idx of [c0, (c0 + 4) % N]) {
      const v = pts[idx];
      const px = -v[1];
      const py = v[0];
      const line = [];
      for (const f of [0.9, 0.66, 0.44, 0.24]) line.push([v[0] * f + px * (R() - 0.5) * 0.28, v[1] * f + py * (R() - 0.5) * 0.28]);
      cracks.push(line);
    }
    d = { pts, cracks };
    if (rockCache.size > 300) rockCache.clear();
    rockCache.set(seed, d);
    return d;
  }

  function boulder(ctx, a, w, o) {
    const d = rockData(o.seed | 0);
    ctx.beginPath();
    for (let i = 0; i < d.pts.length; i++) {
      if (i) ctx.lineTo(d.pts[i][0], d.pts[i][1]);
      else ctx.moveTo(d.pts[i][0], d.pts[i][1]);
    }
    ctx.closePath();
    paint(ctx, RGB.boulder, CORE.boulder, a, w, 0.14);
    ctx.beginPath();
    for (const line of d.cracks) {
      ctx.moveTo(line[0][0], line[0][1]);
      for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]);
    }
    detail(ctx, CORE.boulder, a, w, 0.66);
  }

  function pillar(ctx, a, w) {
    ctx.beginPath();
    circle(ctx, 0, 0, 0.97);
    paint(ctx, RGB.pillar, CORE.pillar, a, w, 0.12);
    ctx.beginPath();
    circle(ctx, 0, 0, 0.56); // the ring on top
    circle(ctx, 0, 0, 0.1);
    for (let i = 0; i < 10; i++) {
      // fluting round the edge
      const th = (i / 10) * TAU + 0.3;
      ctx.moveTo(Math.cos(th) * 0.68, Math.sin(th) * 0.68);
      ctx.lineTo(Math.cos(th) * 0.9, Math.sin(th) * 0.9);
    }
    detail(ctx, CORE.pillar, a, w, 0.66);
  }

  // ---------------------------------------------------------- puddle / decoy
  function puddle(ctx, a, w, o) {
    const R = rng((o.seed | 0) + 17);
    const f1 = R() * TAU;
    const f2 = R() * TAU;
    const t = o.t || 0;
    ctx.beginPath();
    const N = 30;
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * TAU;
      const rr = 0.8 + 0.11 * Math.sin(2 * th + f1) + 0.07 * Math.sin(3 * th + f2);
      if (i) ctx.lineTo(Math.cos(th) * rr, Math.sin(th) * rr);
      else ctx.moveTo(Math.cos(th) * rr, Math.sin(th) * rr);
    }
    ctx.closePath();
    paint(ctx, RGB.puddle, CORE.puddle, a, w, 0.2);
    ctx.beginPath();
    // the shine (two short arcs at the top left), a ripple at the bottom right, two bubbles
    ctx.moveTo(Math.cos(-2.75) * 0.5, Math.sin(-2.75) * 0.5);
    ctx.arc(0, 0, 0.5, -2.75, -1.85);
    ctx.moveTo(Math.cos(-2.6) * 0.36, Math.sin(-2.6) * 0.36);
    ctx.arc(0, 0, 0.36, -2.6, -2.1);
    ctx.moveTo(Math.cos(0.1) * 0.58, Math.sin(0.1) * 0.58);
    ctx.arc(0, 0, 0.58, 0.1, 1.2);
    circle(ctx, 0.3, 0.16 - 0.02 * Math.sin(t * 1.3), 0.13);
    circle(ctx, -0.02, 0.34 + 0.02 * Math.sin(t * 1.1 + 1), 0.085);
    detail(ctx, CORE.puddle, a, w, 0.72);
  }

  function decoy(ctx, a, w) {
    // a small box with two lights, a short antenna with a ball on it, and a ring round the whole device
    ctx.beginPath();
    const x0 = -0.4;
    const x1 = 0.4;
    const y0 = -0.2;
    const y1 = 0.5;
    const c = 0.12;
    ctx.moveTo(x0 + c, y0);
    ctx.lineTo(x1 - c, y0);
    ctx.quadraticCurveTo(x1, y0, x1, y0 + c);
    ctx.lineTo(x1, y1 - c);
    ctx.quadraticCurveTo(x1, y1, x1 - c, y1);
    ctx.lineTo(x0 + c, y1);
    ctx.quadraticCurveTo(x0, y1, x0, y1 - c);
    ctx.lineTo(x0, y0 + c);
    ctx.quadraticCurveTo(x0, y0, x0 + c, y0);
    ctx.closePath();
    paint(ctx, RGB.decoy, CORE.decoy, a, w, 0.2);
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(0, -0.62);
    circle(ctx, 0, -0.72, 0.09);
    circle(ctx, 0, 0.16, 0.14); // a dial
    circle(ctx, 0, 0.16, 0.03);
    ctx.moveTo(-0.24, 0.39);
    ctx.lineTo(-0.1, 0.39);
    ctx.moveTo(0.1, 0.39);
    ctx.lineTo(0.24, 0.39);
    detail(ctx, CORE.decoy, a, w, 0.75);
    ctx.beginPath();
    circle(ctx, 0, 0, 0.97);
    ctx.lineWidth = w * 0.55;
    ctx.strokeStyle = `rgba(${RGB.decoy},${0.55 * a})`;
    ctx.stroke();
  }

  // -------------------------------------------------------------------- exit
  // A portal seen from above. The real exit and a disguised mimic go through this very function: they differ
  // only through `tell`, which the game sets from the difficulty mode (MODES.mimicTell):
  //   none    identical to the real exit (Hard, Hardcore)      the ripple is the only test
  //   subtle  a faint wobble in the outer ring, and it turns a little faster (Normal)
  //   clear   the outer ring is uneven and a little yellow-green, and the whole thing flickers slowly (Easy)
  function exit(ctx, a, w, o) {
    const t = o.t || 0;
    const tell = o.tell || 'none';
    let ringRgb = RGB.exit;
    let ringCore = CORE.exit;
    let wob = 0;
    let spin = 0.55;
    let A = a;
    if (tell === 'clear') {
      ringRgb = '166,255,96';
      ringCore = '206,255,150';
      wob = 0.085;
      A *= 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 11.7 + 1.6 * Math.sin(t * 2.3))); // about two slow flickers a second, never a flash
    } else if (tell === 'subtle') {
      wob = 0.03;
      spin *= 1.16;
    }
    const base = tell === 'clear' ? 0.87 : 0.92;
    // the outer ring
    ctx.beginPath();
    if (wob > 0) {
      const N = 44;
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * TAU;
        const rr = base + wob * Math.sin(3 * th + t * (tell === 'clear' ? 1.3 : 0.9)) + wob * 0.45 * Math.sin(7 * th - t * 0.8);
        if (i) ctx.lineTo(Math.cos(th) * rr, Math.sin(th) * rr);
        else ctx.moveTo(Math.cos(th) * rr, Math.sin(th) * rr);
      }
    } else {
      ctx.arc(0, 0, base, 0, TAU);
    }
    ctx.lineWidth = w * 3.2;
    ctx.strokeStyle = `rgba(${ringRgb},${0.17 * A})`;
    ctx.stroke();
    ctx.lineWidth = w * 0.85;
    ctx.strokeStyle = `rgba(${ringCore},${0.62 * A})`;
    ctx.stroke();
    // the slow rotating arc, with a shorter one opposite it
    const th0 = t * spin;
    ctx.beginPath();
    ctx.arc(0, 0, base, th0, th0 + 1.25);
    ctx.lineWidth = w * 2.3;
    ctx.strokeStyle = `rgba(${ringRgb},${0.3 * A})`;
    ctx.stroke();
    ctx.lineWidth = w * 1.2;
    ctx.strokeStyle = `rgba(${ringCore},${0.95 * A})`;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, base, th0 + Math.PI, th0 + Math.PI + 0.5);
    ctx.lineWidth = w * 0.9;
    ctx.stroke();
    // the middle ring, in five pieces turning the other way
    ctx.beginPath();
    const th1 = -t * 0.35;
    for (let i = 0; i < 5; i++) {
      const s = th1 + (i / 5) * TAU;
      ctx.moveTo(Math.cos(s) * 0.62, Math.sin(s) * 0.62);
      ctx.arc(0, 0, 0.62, s, s + 0.9);
    }
    ctx.lineWidth = w * 0.75;
    ctx.strokeStyle = `rgba(${RGB.exit},${0.7 * A})`;
    ctx.stroke();
    // the doorway in the middle, on a soft pool of light
    ctx.beginPath();
    circle(ctx, 0, 0, 0.3);
    ctx.fillStyle = `rgba(${RGB.exit},${0.13 * A})`;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.17, 0.2);
    ctx.lineTo(-0.17, -0.02);
    ctx.arc(0, -0.02, 0.17, Math.PI, 0);
    ctx.lineTo(0.17, 0.2);
    ctx.lineWidth = w * 0.85;
    ctx.strokeStyle = `rgba(${CORE.exit},${0.85 * A})`;
    ctx.stroke();
    // a few soft sparkles that swell and fade (a quarter of a beat a second at the quickest)
    ctx.lineWidth = w * 0.6;
    for (let k = 0; k < 4; k++) {
      const tw = 0.5 + 0.5 * Math.sin(t * 1.5 + k * 2.3);
      const ang = k * 1.7 + t * 0.22;
      const rad = [0.5, 0.76, 0.62, 0.4][k];
      const sx = Math.cos(ang) * rad;
      const sy = Math.sin(ang) * rad;
      const sz = 0.04 + 0.06 * tw;
      ctx.strokeStyle = `rgba(${CORE.exit},${(0.16 + 0.6 * tw) * A})`;
      ctx.beginPath();
      ctx.moveTo(sx - sz, sy);
      ctx.lineTo(sx + sz, sy);
      ctx.moveTo(sx, sy - sz);
      ctx.lineTo(sx, sy + sz);
      ctx.stroke();
    }
  }

  // -------------------------------------------------------------- wall sample
  /** A short piece of lit wall with its stone joints and a crack - for the title legend and the art sheet. */
  function wall(ctx, a, w) {
    const out = [];
    ctx.beginPath();
    ctx.moveTo(-1, 0);
    ctx.lineTo(1, 0);
    paint(ctx, RGB.wall, CORE.wall, a, w, 0);
    ctx.beginPath();
    for (const x of [-0.72, -0.28, 0.16, 0.6]) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, x === -0.28 ? 0.42 : 0.3);
    }
    ctx.moveTo(0.16, 0.3);
    ctx.lineTo(0.3, 0.46);
    ctx.lineTo(0.22, 0.6);
    ctx.lineTo(0.34, 0.74);
    detail(ctx, CORE.wall, a, w, 0.8);
    return out;
  }

  // ----------------------------------------------------- the wall's stone look
  const BRICK = 17; // px between stone joints along a wall
  /**
   * Stone texture for a lit wall. (x1,y1) and (x2,y2) are the hit points of two neighbouring rays of one ripple
   * on the same wall; (rx,ry) is the direction of the ray (into the wall). Wherever the pair straddles one of the
   * wall's stone joints (every BRICK px along it, at fixed places on the wall so the texture stays put from ripple
   * to ripple) it pushes a short seam going into the wall, and now and then a jagged crack, onto `out` as
   * x1,y1,x2,y2 segments. Most joints are left out, so the outline is only ever lightly marked.
   */
  function wallTexture(x1, y1, x2, y2, rx, ry, out) {
    const horiz = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    const s1 = horiz ? x1 : y1;
    const s2 = horiz ? x2 : y2;
    const k1 = Math.floor(s1 / BRICK);
    const k2 = Math.floor(s2 / BRICK);
    if (k1 === k2) return;
    const k = Math.max(k1, k2);
    const h = hash2(k, Math.round((horiz ? y1 : x1) / 8) + (horiz ? 0 : 7919));
    if (h % 5 > 1) return; // two joints in five
    const f = (k * BRICK - s1) / (s2 - s1);
    const px = x1 + (x2 - x1) * f;
    const py = y1 + (y2 - y1) * f;
    const nx = horiz ? 0 : rx >= 0 ? 1 : -1; // into the wall
    const ny = horiz ? (ry >= 0 ? 1 : -1) : 0;
    const len = 3 + ((h >>> 3) % 3);
    out.push(px, py, px + nx * len, py + ny * len);
    if ((h >>> 6) % 6 === 0) {
      // a crack: a few jagged strokes into the wall
      const sg = (h >>> 9) & 1 ? 1 : -1;
      const tx = horiz ? sg : 0;
      const ty = horiz ? 0 : sg;
      let cx = px + nx * len;
      let cy = py + ny * len;
      for (let i = 0; i < 3; i++) {
        const j = i % 2 ? -1 : 1.6;
        const ex = cx + nx * 3 + tx * j * 1.6;
        const ey = cy + ny * 3 + ty * j * 1.6;
        out.push(cx, cy, ex, ey);
        cx = ex;
        cy = ey;
      }
    }
  }

  // ---------------------------------------------------------------- drawing
  const SHAPES = { echo, scent, stalker, boulder, pillar, puddle, decoy, exit, wall };
  const NO = {};

  function draw(ctx, kind, x, y, r, o) {
    o = o || NO;
    const a = o.a === undefined ? 1 : o.a;
    if (!(a > 0.01)) return;
    const fn = SHAPES[kind];
    if (!fn) return;
    ctx.save();
    ctx.translate(x, y);
    if (o.h && HEADED[kind]) ctx.rotate(o.h);
    ctx.scale(r, r);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    fn(ctx, Math.min(1, a), Math.max(1.9, r * 0.11) / r, o); // the line width stays about 2 px however big the drawing
    ctx.restore();
  }

  /**
   * A mimic's disguise breaking: the exit look melts into the echo monster in about 0.3 s. p runs 0 -> 1; it is
   * a smooth cross-fade (the portal grows a little as it fades, the monster grows into its size), never a flash.
   */
  function mimicMorph(ctx, x, y, r, p, o) {
    o = o || NO;
    const e = p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p);
    const a = o.a === undefined ? 1 : o.a;
    if (e < 0.999) draw(ctx, 'exit', x, y, r * (1 + 0.12 * e), { t: o.t, a: a * (1 - e), tell: o.tell });
    if (e > 0.001) draw(ctx, 'echo', x, y, r * (0.7 + 0.3 * e), { t: o.t, a: a * e, h: o.h });
  }

  return { draw, mimicMorph, wallTexture, seedOf, obstacleKind, RGB, CORE, MORPH_SECONDS: 0.3 };
})();
