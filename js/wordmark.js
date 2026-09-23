'use strict';

/**
 * THE TITLE WORDMARK - "ECHO MAZE", drawn with Canvas 2D.
 *
 * It is title-screen dressing and nothing else: its own canvas inside the <h1>, its own clock, nothing saved,
 * no `Math.random`, and `update()` is only ever called while the title panel is really on screen - never during
 * a level, never behind Settings.
 *
 * COLOUR. The letters are the EXIT green (#5dffa0 in the default palette - the colour of the way out, which is
 * what the whole game is about). It is taken from the palette's `exit` role rather than hard-coded, so a player
 * on one of the colour-blind palettes gets that palette's exit colour and the logo still means the same thing.
 *
 * LIT FROM WITHIN, not filtered. The letters are painted four times:
 *   three ADDITIVE passes ('lighter') at shadowBlur 30 / 14 / 4 (at the reference size, scaled with the type)
 *   and rising fill alpha, which build the halo outwards from the letterforms; then one ordinary pass that lays
 *   the crisp glyphs down in the exit green itself. The additive passes are kept deliberately faint: stacking
 *   green on green past ~0.5 total alpha drives the red and blue channels up and the colour washes out towards
 *   white, which is exactly what this was not supposed to look like.
 *
 * THE SWEEP. A bright band crosses the wordmark left to right in about 1.1 s, and where it touches a letter it
 * both BRIGHTENS it (an additive fill through a moving linear gradient) and THICKENS it (a stroke through the
 * same gradient, its width rising with the band) - the same thing a ripple does to a wall it finds. Then the
 * wordmark rests for a few seconds and the band comes round again.
 *
 * CALM MODE (and the system's "reduce motion" setting) SOFTENS IT, visibly: the band's peak drops by 40%, it
 * crosses half again more slowly, it comes round less often, and the resting glow is dimmer. The animation is
 * never removed. The reveal whoosh is quieter too (js/audio.js, titleReveal).
 *
 * THE REVEAL. The first sweep after the title appears (at start-up, and every time a level hands back) is
 * brighter and quicker - about 0.8 s - with a soft whoosh from the SoundEngine. There is no sound until an
 * AudioContext exists, so the very first title screen is silent and nothing here can delay the Begin button.
 */
const EchoWordmark = (() => {
  const WORDS = ['ECHO', 'MAZE'];
  const TRACK = 0.14; // letter spacing inside a word, as a fraction of the font size - the same for every letter
  // The space between ECHO and MAZE, as a fraction of ONE LETTER'S HEIGHT (the cap height), ON TOP of the
  // ordinary tracking. It has to be measured that way round: two letters inside a word are already held apart
  // by their own side bearings as well as the tracking, so a word gap of "0.5 cap heights" measured from zero
  // comes out barely wider than a letter gap and ECHO MAZE reads as one word.
  const WORD_GAP = 0.5;
  const MAX_SIZE = 64; // px
  const MIN_SIZE = 26; // px; below this the two words stack instead of shrinking further
  const LINE_GAP = 1.15;
  const FONT_STACK = "'Segoe UI', system-ui, -apple-system, Roboto, sans-serif"; // the page's own font: nothing is loaded
  const WEIGHT = 700;

  // The glow, at REF_SIZE; every blur is scaled by (size / REF_SIZE) so the halo keeps its proportions.
  const REF_SIZE = 56;
  const GLOW = [
    { blur: 30, fill: 0.14, shadow: 0.62 },
    { blur: 14, fill: 0.22, shadow: 0.66 },
    { blur: 4, fill: 0.34, shadow: 0.72 },
  ];

  const SWEEP = 1.1; // seconds for the band to cross, when things are lively
  const SWEEP_CALM = 1.65; // ... and when they are not: half again as long
  const REVEAL_SWEEP = 0.8; // the one-off arrival is quicker
  const REST = 4.0; // seconds of quiet between sweeps (so one every ~5.1 s: 0.2 a second)
  const REST_CALM = 5.6;
  const PEAK = 1; // the band's brightness
  const PEAK_CALM = 0.6; // calm mode: 40% less
  const PEAK_REVEAL = 1.35;
  const BAND = 0.95; // the band's half-width, as a fraction of the font size: wide enough to hold 2-3 letters
  const BAND_CAP = 0.85; // the band's brightest stop; above this the additive green clips to white
  const SWELL = 0.11; // how much thicker a letter's stroke gets at the band's peak, as a fraction of the size

  /** Does the reader's system ask for less movement? Treated exactly like calm mode here. */
  function reduceMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  /** '93,255,160' -> '#5dffa0'-ish rgba string helper. */
  const rgba = (rgb, a) => `rgba(${rgb},${a})`;

  /**
   * env:
   *   calm()   is calm mode on? (a softer, slower sweep and a dimmer rest)
   *   sound()  play the reveal whoosh - called only when a reveal asks for it
   */
  function create(env) {
    const host = document.getElementById('wordmark');
    const h1 = host && host.parentElement;
    const ctx = host && host.getContext ? host.getContext('2d') : null;
    if (!ctx) {
      // No canvas: the <h1> falls back to plain text (style.css, h1.no-canvas) and none of this runs.
      if (h1) h1.classList.add('no-canvas');
      const noop = () => {};
      return { update: noop, reveal: noop, invalidate: noop, resize: noop, seek: noop, state: () => ({ canvas: false }) };
    }

    const baked = document.createElement('canvas'); // the resting letters; repainted only when something changes
    const bakedCtx = baked.getContext('2d');

    let rgb = '93,255,160'; // the exit colour, from the palette
    let core = '170,255,205';
    let dpr = 1;
    let cssW = 0;
    let cssH = 0;
    let lines = []; // [{ glyphs: [{ ch, x }], width, left, y }]
    let size = MAX_SIZE;
    let capH = MAX_SIZE * 0.72;
    let dirty = true;
    let t = -1; // 0..1 through the sweep, or -1 while resting
    let rest = 0;
    let peak = PEAK;
    let span = SWEEP; // this sweep's length in seconds
    let held = false; // seek() only: hold this exact frame (tests and screenshots)

    EchoPalette.onChange((colors, cores) => {
      rgb = colors.exit;
      core = cores.exit;
      dirty = true;
    });

    const gentle = () => env.calm() || reduceMotion();

    // ------------------------------------------------------------- layout
    /** Lay one word out glyph by glyph: the tracking is the same between every pair of letters. */
    function measureWord(word, px) {
      bakedCtx.font = `${WEIGHT} ${px}px ${FONT_STACK}`;
      const glyphs = [];
      let x = 0;
      for (const ch of word) {
        glyphs.push({ ch, x });
        x += bakedCtx.measureText(ch).width + TRACK * px;
      }
      return { glyphs, width: Math.max(0, x - TRACK * px) };
    }

    /**
     * The height of a capital at this size - what the gap between the words is measured in. The baseline has
     * to be forced back to 'alphabetic' first: `actualBoundingBoxAscent` is measured FROM the current baseline,
     * so asking this while the context is still set to 'middle' (which is how the letters are drawn) gives
     * about three fifths of the answer, and the word gap would change every time the layout was redone.
     */
    function capHeightAt(px) {
      const was = bakedCtx.textBaseline;
      bakedCtx.textBaseline = 'alphabetic';
      bakedCtx.font = `${WEIGHT} ${px}px ${FONT_STACK}`;
      const m = bakedCtx.measureText('E');
      bakedCtx.textBaseline = was;
      return m.actualBoundingBoxAscent || px * 0.72;
    }

    /** ECHO and MAZE on one line, with a fixed gap of WORD_GAP cap-heights between them. */
    function oneLine(px) {
      const a = measureWord(WORDS[0], px);
      const b = measureWord(WORDS[1], px);
      const gap = TRACK * px + WORD_GAP * capHeightAt(px);
      const glyphs = a.glyphs.concat(b.glyphs.map((g) => ({ ch: g.ch, x: g.x + a.width + gap })));
      return { glyphs, width: a.width + gap + b.width };
    }

    function layout(availW) {
      const room = Math.max(60, availW - 10); // a little air either side for the halo
      let px = MAX_SIZE;
      let L = oneLine(px);
      if (L.width > room) {
        px = Math.max(MIN_SIZE, Math.floor((px * room) / L.width));
        L = oneLine(px);
      }
      if (L.width <= room) {
        size = px;
        lines = [L];
      } else {
        // too wide even at the smallest single-line size: stack the two words
        px = MAX_SIZE;
        let a = measureWord(WORDS[0], px);
        let b = measureWord(WORDS[1], px);
        const widest = Math.max(a.width, b.width);
        if (widest > room) {
          px = Math.max(14, Math.floor((px * room) / widest));
          a = measureWord(WORDS[0], px);
          b = measureWord(WORDS[1], px);
        }
        size = px;
        lines = [a, b];
      }
      capH = capHeightAt(size);
      const lineH = size * LINE_GAP;
      const pad = size * 0.78; // room for the widest blur to bleed into
      cssW = Math.max(1, Math.round(availW));
      cssH = Math.round(lines.length * lineH + pad * 2);
      let y = pad + lineH * 0.5;
      for (const L2 of lines) {
        L2.left = (cssW - L2.width) / 2;
        L2.y = y;
        y += lineH;
      }
    }

    // -------------------------------------------------------------- paint
    function setFont(c) {
      c.font = `${WEIGHT} ${size}px ${FONT_STACK}`;
      c.textBaseline = 'middle';
      c.textAlign = 'left';
    }

    function fillGlyphs(c) {
      for (const L of lines) for (const g of L.glyphs) c.fillText(g.ch, L.left + g.x, L.y);
    }

    function strokeGlyphs(c) {
      for (const L of lines) for (const g of L.glyphs) c.strokeText(g.ch, L.left + g.x, L.y);
    }

    /**
     * The wordmark at rest: three additive halo passes at falling blur, then the crisp letters in the exit
     * green itself (an ordinary pass, so the letterforms are exactly that colour and never wash out).
     */
    function bake() {
      const dim = gentle() ? 0.55 : 1; // calm mode rests dimmer too
      const k = size / REF_SIZE;
      baked.width = Math.round(cssW * dpr);
      baked.height = Math.round(cssH * dpr);
      const c = bakedCtx;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, cssW, cssH);
      setFont(c);
      c.globalCompositeOperation = 'lighter';
      for (const p of GLOW) {
        c.shadowBlur = p.blur * k * dpr;
        c.shadowColor = rgba(rgb, p.shadow * dim);
        c.fillStyle = rgba(rgb, p.fill * dim);
        fillGlyphs(c);
      }
      c.globalCompositeOperation = 'source-over';
      c.shadowBlur = 3 * k * dpr;
      c.shadowColor = rgba(rgb, 0.85 * dim);
      c.fillStyle = `rgb(${rgb})`; // the letters themselves: the exit green, nothing else
      fillGlyphs(c);
      c.shadowBlur = 0;
      c.shadowColor = 'transparent';
      dirty = false;
    }

    function resize() {
      if (!h1) return;
      const availW = Math.round(h1.clientWidth || host.clientWidth || 0);
      // the title is hidden: keep the layout we had rather than re-fitting the letters to a width of nothing
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

    /** Where the band is, and how hard it is hitting, at this moment of the sweep. */
    function bandAt(u) {
      const halfBand = BAND * size;
      const x = -halfBand + u * (cssW + halfBand * 2);
      const envelope = Math.sin(Math.PI * Math.min(1, Math.max(0, u))); // in and out again, never a pop
      return { x, halfBand, strength: envelope * peak };
    }

    /** Draw the band over the resting letters: brighter, and thicker, exactly where it is passing. */
    function drawSweep(c) {
      const { x, halfBand, strength } = bandAt(t);
      if (strength <= 0.001) return;
      const k = size / REF_SIZE;
      const g = c.createLinearGradient(x - halfBand, 0, x + halfBand, 0);
      g.addColorStop(0, rgba(core, 0));
      g.addColorStop(0.35, rgba(core, Math.min(BAND_CAP, strength) * 0.45));
      g.addColorStop(0.5, rgba(core, Math.min(BAND_CAP, strength)));
      g.addColorStop(0.65, rgba(core, Math.min(BAND_CAP, strength) * 0.45));
      g.addColorStop(1, rgba(core, 0));
      c.globalCompositeOperation = 'lighter';
      setFont(c);
      // thicker: the letter's stroke swells as the band goes over it
      c.strokeStyle = g;
      c.lineJoin = 'round';
      c.lineWidth = Math.max(0.6, size * SWELL * strength);
      c.shadowBlur = 22 * k * strength * dpr;
      c.shadowColor = rgba(rgb, 0.7 * strength);
      strokeGlyphs(c);
      // brighter: and the letter itself lights up inside the band
      c.fillStyle = g;
      c.shadowBlur = 10 * k * strength * dpr;
      fillGlyphs(c);
      c.shadowBlur = 0;
      c.shadowColor = 'transparent';
      c.globalCompositeOperation = 'source-over';
    }

    /** One frame. `dt` in seconds; called only while the title screen is actually on show. */
    function update(dt) {
      resize();
      if (dirty) bake();
      // held by seek() for a screenshot: keep painting the same instant instead of moving on. Nothing sets this
      // in normal play - the title's own animation frames would otherwise repaint over a held frame before the
      // picture was taken, which is how two "same timestamp" shots end up showing different moments.
      if (held) {
        render();
        return;
      }
      if (t >= 0) {
        t += dt / span;
        if (t >= 1) {
          t = -1;
          rest = gentle() ? REST_CALM : REST;
        }
      } else {
        rest -= dt;
        if (rest <= 0) start(false);
      }
      render();
    }

    function render() {
      const c = ctx;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, cssW, cssH);
      c.drawImage(baked, 0, 0, cssW, cssH);
      if (t >= 0) drawSweep(c);
    }

    /** Begin a sweep. `isReveal` is the one-off arrival: brighter and quicker (calm mode keeps its own pace). */
    function start(isReveal) {
      const soft = gentle();
      t = 0;
      peak = soft ? PEAK_CALM : isReveal ? PEAK_REVEAL : PEAK;
      span = soft ? SWEEP_CALM : isReveal ? REVEAL_SWEEP : SWEEP;
    }

    function reveal(withSound) {
      held = false;
      start(true);
      if (withSound && env.sound) env.sound();
    }

    /**
     * Tests and screenshots: put the sweep at exactly this point (0..1), paint it, and HOLD it there until
     * `release()` (or the next reveal), so the animation cannot move on between setting it up and photographing
     * it. A negative `u` holds the wordmark at rest instead.
     */
    function seek(u, isReveal = false) {
      resize();
      if (dirty) bake();
      start(!!isReveal);
      t = u < 0 ? -1 : Math.min(0.999, u);
      held = true;
      render();
      return state();
    }

    function release() {
      held = false;
      return state();
    }

    const state = () => ({
      canvas: true,
      words: WORDS.join(' '),
      colour: `rgb(${rgb})`,
      size,
      capHeight: +capH.toFixed(1),
      wordGapPx: +(TRACK * size + WORD_GAP * capH).toFixed(1),
      wordGapInCapHeights: WORD_GAP,
      trackingPx: +(TRACK * size).toFixed(1),
      lines: lines.length,
      width: cssW,
      height: cssH,
      sweep: +t.toFixed(3),
      resting: +Math.max(0, rest).toFixed(2),
      peak,
      sweepSeconds: span,
      calm: gentle(),
      held,
    });

    try {
      if (window.ResizeObserver && h1) new ResizeObserver(() => { dirty = true; }).observe(h1);
    } catch (e) {
      /* the window resize below is enough */
    }
    window.addEventListener('resize', () => { dirty = true; });

    return { update, reveal, resize, seek, release, invalidate: () => { dirty = true; }, state };
  }

  return { create, WORDS, SWEEP, REST, PEAK, PEAK_CALM, reduceMotion };
})();
