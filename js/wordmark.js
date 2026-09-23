'use strict';

/**
 * THE TITLE WORDMARK - "ECHO MAZE", drawn rather than typed.
 *
 * It is a piece of TITLE-SCREEN DRESSING and nothing else: its own little canvas inside the <h1>, its own clock,
 * no state that anything else reads, and it never runs while a level is being played. It draws no random numbers
 * (so it can never be confused with the simulation's), keeps no localStorage of its own, and is the same in every
 * difficulty mode.
 *
 * THE LOOK. The letters are set in the page's own font at a heavy weight with wide tracking, laid out glyph by
 * glyph (never `letter-spacing`, which not every browser honours on a canvas), auto-fitted to the width it is
 * given, and stacked onto two lines only if one line will not fit. They are lit in the game's WALL colour - the
 * blue a ripple paints a wall with, straight from js/palette.js - so the wordmark is painted with the same light
 * as the maze and follows the player's chosen palette.
 *
 * THE ECHO. Every few seconds a ring of light expands from the middle of the wordmark, brightening each letter as
 * it passes through it, with a faint wavefront arc behind - the game's own ripple, run through the logo. It is
 * additive ('lighter'), like every ripple hit in the game. One sweep every 5.5 s means the fastest thing on the
 * screen changes about 0.2 times a second, far under the game's 3-per-second flashing limit.
 *
 * THE REVEAL. The first sweep after the title appears is brighter and a little quicker, with a soft whoosh from
 * the SoundEngine (audio.titleReveal). The sound only exists once there is an AudioContext, so the very first
 * title screen - before anything has been clicked - is silent, and nothing here can delay the Begin button.
 *
 * CALM MODE (and the system's "reduce motion" setting) keep the loop but take the edge off it: a dimmer glow, a
 * shallower breath, and no brighter/faster reveal - the same sweep, every time. The logo is never removed.
 *
 * COST. The lit letters are baked into an offscreen canvas whenever the layout, the palette or calm mode change;
 * a frame is then one drawImage plus one pass of ~9 glyphs and one arc. Nothing is allocated per frame.
 */
const EchoWordmark = (() => {
  const TEXT = 'ECHO MAZE';
  const TRACK = 0.3; // letter spacing, as a fraction of the font size
  const WORD_GAP = 0.5; // extra space between the two words, same units
  const MAX_SIZE = 60; // px
  const MIN_SIZE = 24; // px: below this the wordmark stacks onto two lines instead of shrinking further
  const LINE_GAP = 1.12; // line height, as a fraction of the font size
  const FONT = "'Segoe UI', system-ui, -apple-system, Roboto, sans-serif"; // the page's own font: nothing new is loaded

  const SWEEP_SECONDS = 1.75; // how long one ring takes to cross the wordmark
  const IDLE_PERIOD = 5.5; // ... and how often it happens: ~0.18 sweeps a second
  const REVEAL_SPEED = 1.18; // the one-off reveal is a little quicker (not in calm mode)
  const REVEAL_AMP = 1.6; // ... and a little brighter (not in calm mode)
  const BREATH_SECONDS = 6.5; // a very slow rise and fall underneath it all

  /** Does the reader's system ask for less movement? Treated exactly like calm mode here. */
  function reduceMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  /**
   * env:
   *   calm()     is calm mode on? (dimmer, no brighter/faster reveal)
   *   sound()    play the reveal whoosh - called only when a reveal asks for sound
   */
  function create(env) {
    const host = document.getElementById('wordmark');
    const h1 = host && host.parentElement;
    const ctx = host && host.getContext ? host.getContext('2d') : null;
    if (!ctx) {
      // No canvas: the <h1> falls back to plain text (style.css, h1.no-canvas) and nothing below ever runs.
      if (h1) h1.classList.add('no-canvas');
      const noop = () => {};
      return { update: noop, reveal: noop, invalidate: noop, resize: noop, state: () => ({ canvas: false }) };
    }

    const baked = document.createElement('canvas'); // the lit letters, redrawn only when something about them changes
    const bakedCtx = baked.getContext('2d');

    let rgb = '95,212,255'; // the wall colour, from the palette
    let core = '170,230,255';
    let dpr = 1;
    let cssW = 0;
    let cssH = 0;
    let lines = []; // [{ glyphs: [{ ch, x }], width, y }]
    let size = MAX_SIZE;
    let maxR = 1; // how far a ring has to travel to leave the wordmark
    let dirty = true;
    let t = 0; // seconds into the current sweep, or -1 while waiting
    let wait = 0; // seconds until the next sweep
    let amp = 1; // this sweep's brightness (the reveal's is higher)
    let speed = 1;
    let breath = 0;

    EchoPalette.onChange((colors, cores) => {
      rgb = colors.wall;
      core = cores.wall;
      dirty = true;
    });

    // ------------------------------------------------------------- layout
    /** The width one line of `text` takes at `px`, and where each glyph sits. */
    function measure(text, px) {
      bakedCtx.font = `700 ${px}px ${FONT}`;
      const glyphs = [];
      let x = 0;
      for (const ch of text) {
        if (ch === ' ') {
          x += bakedCtx.measureText(' ').width + WORD_GAP * px;
          continue;
        }
        glyphs.push({ ch, x });
        x += bakedCtx.measureText(ch).width + TRACK * px;
      }
      return { glyphs, width: Math.max(0, x - TRACK * px) };
    }

    /** Fit the wordmark to the width we have been given: one line if it will go, otherwise two. */
    function layout(availW) {
      const room = Math.max(60, availW - 8); // a little air either side for the glow
      let px = MAX_SIZE;
      let one = measure(TEXT, px);
      if (one.width > room) {
        px = Math.max(MIN_SIZE, Math.floor((px * room) / one.width));
        one = measure(TEXT, px);
      }
      if (one.width <= room) {
        size = px;
        lines = [one];
      } else {
        // still too wide at the smallest single-line size: stack the two words
        px = MAX_SIZE;
        let a = measure('ECHO', px);
        let b = measure('MAZE', px);
        const widest = Math.max(a.width, b.width);
        if (widest > room) {
          px = Math.max(14, Math.floor((px * room) / widest));
          a = measure('ECHO', px);
          b = measure('MAZE', px);
        }
        size = px;
        lines = [a, b];
      }
      // centre each line, and place them down the canvas
      const lineH = size * LINE_GAP;
      const pad = size * 0.62; // room for the glow to bleed into
      cssW = Math.max(1, Math.round(availW));
      cssH = Math.round(lines.length * lineH + pad * 2);
      let y = pad + lineH * 0.5;
      for (const L of lines) {
        L.left = (cssW - L.width) / 2;
        L.y = y;
        y += lineH;
      }
      maxR = Math.hypot(cssW, cssH) * 0.55;
    }

    // -------------------------------------------------------------- paint
    /** Every glyph of every line, through whatever fill is set. */
    function paintText(c) {
      c.font = `700 ${size}px ${FONT}`;
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      for (const L of lines) for (const g of L.glyphs) c.fillText(g.ch, L.left + g.x, L.y);
    }

    /** The letters as they sit between sweeps: a wide halo, a soft inner glow, and a crisp core. */
    function bake() {
      const dim = env.calm() || reduceMotion() ? 0.72 : 1;
      baked.width = Math.round(cssW * dpr);
      baked.height = Math.round(cssH * dpr);
      const c = bakedCtx;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, cssW, cssH);
      c.globalCompositeOperation = 'lighter';
      const passes = [
        { blur: size * 0.85, shadow: 0.42 * dim, fill: `rgba(${rgb},${0.3 * dim})` },
        { blur: size * 0.3, shadow: 0.5 * dim, fill: `rgba(${core},${0.5 * dim})` },
        { blur: 0, shadow: 0, fill: `rgba(234,248,255,${0.92 * dim})` },
      ];
      for (const p of passes) {
        c.shadowBlur = p.blur * dpr;
        c.shadowColor = p.shadow ? `rgba(${rgb},${p.shadow})` : 'transparent';
        c.fillStyle = p.fill;
        paintText(c);
      }
      c.shadowBlur = 0;
      c.shadowColor = 'transparent';
      dirty = false;
    }

    function resize() {
      if (!h1) return;
      const availW = Math.round(h1.clientWidth || host.clientWidth || 0);
      // the title is hidden (behind Settings, or a level is running): keep the layout we had rather than
      // re-fitting the letters to a width of nothing
      if (availW < 40) return;
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!dirty && availW === cssW && nextDpr === dpr) return;
      dpr = nextDpr;
      layout(availW);
      host.style.width = '100%';
      host.style.height = `${cssH}px`;
      host.width = Math.round(cssW * dpr);
      host.height = Math.round(cssH * dpr);
      dirty = true;
    }

    /** One frame. `dt` in seconds; called only while the title screen is actually on show. */
    function update(dt) {
      resize();
      if (dirty) bake();
      const gentle = env.calm() || reduceMotion();

      breath = (breath + dt / BREATH_SECONDS) % 1;
      if (t >= 0) {
        t += (dt * speed) / SWEEP_SECONDS;
        if (t >= 1) {
          t = -1;
          wait = IDLE_PERIOD - SWEEP_SECONDS;
        }
      } else {
        wait -= dt;
        if (wait <= 0) start(1, 1);
      }

      const c = ctx;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, cssW, cssH);
      c.globalCompositeOperation = 'lighter';

      // the letters, breathing very slowly (+/-7%, half that when things are meant to be calm)
      const swing = gentle ? 0.035 : 0.07;
      c.globalAlpha = 1 - swing + swing * Math.cos(breath * Math.PI * 2);
      c.drawImage(baked, 0, 0, cssW, cssH);
      c.globalAlpha = 1;

      if (t >= 0) {
        const cx = cssW / 2;
        const cy = cssH / 2;
        const r = t * maxR;
        const band = Math.max(18, size * 1.15);
        const peak = Math.sin(Math.PI * t) * amp * (gentle ? 0.4 : 0.85);
        // The wavefront itself, behind the letters: faint, and gone by the time it leaves them. It is flattened
        // to the shape of the wordmark so the whole ring stays in the box - at the letters' own height (y = cy)
        // an ellipse and a circle of the same radius meet, so it lines up exactly with the light below.
        const ky = Math.min(1, (cssH * 0.42) / maxR);
        c.strokeStyle = `rgba(${rgb},${peak * 0.09})`;
        c.lineWidth = Math.max(1, size * 0.06);
        c.beginPath();
        c.ellipse(cx, cy, r, r * ky, 0, 0, Math.PI * 2);
        c.stroke();
        // ... and the light it carries through each letter it crosses
        const g = c.createRadialGradient(cx, cy, Math.max(0, r - band), cx, cy, r + band);
        g.addColorStop(0, `rgba(${core},0)`);
        g.addColorStop(0.5, `rgba(${core},${peak})`);
        g.addColorStop(1, `rgba(${core},0)`);
        c.fillStyle = g;
        c.shadowBlur = (gentle ? size * 0.18 : size * 0.4) * dpr;
        c.shadowColor = `rgba(${rgb},${peak * 0.5})`;
        paintText(c);
        c.shadowBlur = 0;
        c.shadowColor = 'transparent';
      }
      c.globalCompositeOperation = 'source-over';
    }

    function start(a, s) {
      t = 0;
      amp = a;
      speed = s;
    }

    /**
     * The title has just come up: sweep once, brighter and a touch quicker, and (if asked, and if there is an
     * AudioContext yet) with the whoosh. Calm mode and "reduce motion" get the ordinary sweep instead.
     */
    function reveal(withSound) {
      const gentle = env.calm() || reduceMotion();
      breath = 0;
      start(gentle ? 1 : REVEAL_AMP, gentle ? 1 : REVEAL_SPEED);
      if (withSound && env.sound) env.sound();
    }

    try {
      if (window.ResizeObserver && h1) new ResizeObserver(() => { dirty = true; }).observe(h1);
    } catch (e) {
      /* the window resize below is enough */
    }
    window.addEventListener('resize', () => { dirty = true; });

    return {
      update,
      reveal,
      resize,
      invalidate: () => { dirty = true; },
      state: () => ({ canvas: true, text: TEXT, size, lines: lines.length, width: cssW, height: cssH, sweep: t, waiting: +wait.toFixed(2), amp, speed, gentle: env.calm() || reduceMotion(), rgb, core }),
    };
  }

  return { create, TEXT, SWEEP_SECONDS, IDLE_PERIOD, reduceMotion };
})();
