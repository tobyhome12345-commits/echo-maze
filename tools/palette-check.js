'use strict';

/*
 * Colour-palette checker (no dependencies, runs in any browser page - the game's own ?debug page will do).
 *
 *   PaletteCheck.report()                     every palette in js/palette.js, as text
 *   PaletteCheck.check(colors, 'deutan')      one {role: 'r,g,b'} map under one kind of vision
 *   PaletteCheck.optimise(colors, opts)       nudge a palette to pull its closest pair apart (a dev aid; the
 *                                             numbers it lands on are pasted into js/palette.js by hand)
 *
 * What it does. Each colour is simulated as a dichromat sees it (Viénot, Brettel & Mollon 1999: linear RGB ->
 * LMS -> collapse the missing axis -> back), then every PAIR is compared with CIEDE2000, the standard measure
 * of "how different do these look". Rough reading of dE: 1 = only just visible side by side, 5 = obvious,
 * 10+ = plainly different colours, 20+ = no chance of confusing them. Every colour is also measured against
 * the black background (WCAG contrast ratio) because the whole game is drawn on black.
 *
 * Honest caveat: this is a model of dichromacy (no cones of one type at all), which is the worst case. It says
 * nothing about anomalous trichromacy (the common, milder form), and it cannot know what a real person sees.
 */
const PaletteCheck = (() => {
  const VISIONS = ['normal', 'protan', 'deutan', 'tritan'];
  const VISION_NAMES = { normal: 'normal vision', protan: 'protanopia (no red)', deutan: 'deuteranopia (no green)', tritan: 'tritanopia (no blue)' };

  const parse = (s) => (Array.isArray(s) ? s.slice(0, 3) : String(s).split(',').map((v) => +v));
  const srgbToLinear = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const linearToSrgb = (c) => {
    const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  };

  /** Viénot/Brettel/Mollon 1999, on LINEAR rgb. */
  function simulate(rgb, vision) {
    const [r, g, b] = parse(rgb);
    if (vision === 'normal' || !vision) return [r, g, b];
    const R = srgbToLinear(r);
    const G = srgbToLinear(g);
    const B = srgbToLinear(b);
    let L = 17.8824 * R + 43.5161 * G + 4.11935 * B;
    let M = 3.45565 * R + 27.1554 * G + 3.86714 * B;
    let S = 0.0299566 * R + 0.184309 * G + 1.46709 * B;
    if (vision === 'protan') L = 2.02344 * M - 2.52581 * S;
    else if (vision === 'deutan') M = 0.494207 * L + 1.24827 * S;
    else if (vision === 'tritan') S = -0.395913 * L + 0.801109 * M;
    const R2 = 0.080944448 * L - 0.130504409 * M + 0.116721066 * S;
    const G2 = -0.0102485335 * L + 0.0540193266 * M - 0.113614708 * S;
    const B2 = -0.000365296938 * L - 0.00412161469 * M + 0.693511405 * S;
    return [linearToSrgb(R2), linearToSrgb(G2), linearToSrgb(B2)];
  }

  /** Relative luminance (WCAG) and the contrast ratio against pure black. */
  function luminance(rgb) {
    const [r, g, b] = parse(rgb);
    return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
  }
  const contrastOnBlack = (rgb) => (luminance(rgb) + 0.05) / 0.05;

  function toLab(rgb) {
    const [r, g, b] = parse(rgb);
    const R = srgbToLinear(r);
    const G = srgbToLinear(g);
    const B = srgbToLinear(b);
    // sRGB D65 -> XYZ, then XYZ -> Lab with the D65 white point
    let x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
    let y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
    let z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
    const f = (t) => (t > 0.008856451679 ? Math.cbrt(t) : 7.787037037 * t + 16 / 116);
    x = f(x);
    y = f(y);
    z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }

  /** CIEDE2000. */
  function deltaE(rgbA, rgbB) {
    const [L1, a1, b1] = toLab(rgbA);
    const [L2, a2, b2] = toLab(rgbB);
    const rad = Math.PI / 180;
    const deg = 180 / Math.PI;
    const C1 = Math.hypot(a1, b1);
    const C2 = Math.hypot(a2, b2);
    const Cb = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
    const ap1 = (1 + G) * a1;
    const ap2 = (1 + G) * a2;
    const Cp1 = Math.hypot(ap1, b1);
    const Cp2 = Math.hypot(ap2, b2);
    let hp1 = Math.atan2(b1, ap1) * deg;
    if (hp1 < 0) hp1 += 360;
    let hp2 = Math.atan2(b2, ap2) * deg;
    if (hp2 < 0) hp2 += 360;
    const dL = L2 - L1;
    const dC = Cp2 - Cp1;
    let dhp = 0;
    if (Cp1 * Cp2 !== 0) {
      dhp = hp2 - hp1;
      if (dhp > 180) dhp -= 360;
      else if (dhp < -180) dhp += 360;
    }
    const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp * rad) / 2);
    const Lb = (L1 + L2) / 2;
    const Cpb = (Cp1 + Cp2) / 2;
    let hpb = hp1 + hp2;
    if (Cp1 * Cp2 !== 0) {
      if (Math.abs(hp1 - hp2) > 180) hpb += hpb < 360 ? 360 : -360;
      hpb /= 2;
    }
    const T = 1 - 0.17 * Math.cos((hpb - 30) * rad) + 0.24 * Math.cos(2 * hpb * rad) + 0.32 * Math.cos((3 * hpb + 6) * rad) - 0.2 * Math.cos((4 * hpb - 63) * rad);
    const dTheta = 30 * Math.exp(-Math.pow((hpb - 275) / 25, 2));
    const Rc = 2 * Math.sqrt(Math.pow(Cpb, 7) / (Math.pow(Cpb, 7) + Math.pow(25, 7)));
    const Sl = 1 + (0.015 * Math.pow(Lb - 50, 2)) / Math.sqrt(20 + Math.pow(Lb - 50, 2));
    const Sc = 1 + 0.045 * Cpb;
    const Sh = 1 + 0.015 * Cpb * T;
    const Rt = -Math.sin(2 * dTheta * rad) * Rc;
    return Math.sqrt(Math.pow(dL / Sl, 2) + Math.pow(dC / Sc, 2) + Math.pow(dH / Sh, 2) + Rt * (dC / Sc) * (dH / Sh));
  }

  /** Every pair of a {role: 'r,g,b'} map under one kind of vision, worst first. */
  function check(colors, vision = 'normal', roles = null) {
    const names = roles || Object.keys(colors);
    const sim = {};
    for (const n of names) sim[n] = simulate(colors[n], vision);
    const pairs = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        pairs.push({ a: names[i], b: names[j], dE: deltaE(sim[names[i]], sim[names[j]]) });
      }
    }
    pairs.sort((p, q) => p.dE - q.dE);
    const dim = names.filter((n) => contrastOnBlack(colors[n]) < 4.5).map((n) => ({ role: n, contrast: +contrastOnBlack(colors[n]).toFixed(1) }));
    return { vision, pairs, min: pairs.length ? pairs[0].dE : Infinity, worst: pairs[0], dim, sim };
  }

  /** The smallest dE over every vision asked for (what the optimiser below maximises). */
  function scoreOf(colors, visions, roles) {
    let min = Infinity;
    for (const v of visions) {
      const c = check(colors, v, roles);
      if (c.min < min) min = c.min;
    }
    return min;
  }

  const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

  /**
   * Hill-climb a palette: jiggle one colour at a time and keep the change if the WORST pair gets better
   * (and nothing falls below the brightness floor). `opts.hue` may pin each role to a hue range in degrees
   * and `opts.lum` to a relative-luminance range, so the palette still reads like the game (a wall that
   * stays blue and dim, an exit that is the brightest thing on the screen).
   * A dev aid only - the result is pasted into js/palette.js.
   */
  function optimise(start, opts = {}) {
    const visions = opts.visions || ['normal', 'deutan', 'protan'];
    const roles = opts.roles || Object.keys(start);
    const minContrast = opts.minContrast || 4.5;
    const rounds = opts.rounds || 4000;
    const hue = opts.hue || {};
    const lum = opts.lum || {};
    const colors = {};
    for (const r of roles) colors[r] = parse(start[r]).slice();
    const fixed = new Set(opts.fixed || []);

    const hueOf = ([r, g, b]) => {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === min) return 0;
      const d = max - min;
      let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
      return h < 0 ? h + 360 : h;
    };
    const okHue = (role, rgb) => {
      const win = hue[role];
      if (!win) return true;
      const h = hueOf(rgb);
      const [lo, hi] = win;
      return lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi;
    };
    const okLum = (role, rgb) => {
      const w = lum[role];
      if (!w) return true;
      const y = luminance(rgb);
      return y >= w[0] && y <= w[1];
    };
    const okColor = (role, rgb) => contrastOnBlack(rgb) >= minContrast && Math.max(...rgb) >= (opts.minPeak || 150) && okHue(role, rgb) && okLum(role, rgb);

    // Repair the starting point first: a seed colour that breaks the rules would otherwise sit there for the
    // whole run (only CANDIDATES are checked), and the palette would come out too dim or the wrong hue.
    for (const r of roles) {
      if (fixed.has(r) || okColor(r, colors[r])) continue;
      let fix = null;
      for (let i = 0; i < 4000 && !fix; i++) {
        const c = [80 + Math.random() * 175, 80 + Math.random() * 175, 80 + Math.random() * 175].map(clamp255);
        if (okColor(r, c)) fix = c;
      }
      if (fix) colors[r] = fix;
    }

    let best = scoreOf(colors, visions, roles);
    for (let i = 0; i < rounds; i++) {
      const role = roles[(Math.random() * roles.length) | 0];
      if (fixed.has(role)) continue;
      const old = colors[role].slice();
      const step = 1 + Math.random() * 26;
      const cand = old.map((v) => clamp255(v + (Math.random() * 2 - 1) * step));
      if (!okColor(role, cand)) continue;
      colors[role] = cand;
      const s = scoreOf(colors, visions, roles);
      if (s > best) best = s;
      else colors[role] = old;
    }
    const out = {};
    for (const r of roles) out[r] = colors[r].join(',');
    return { colors: out, score: best };
  }

  const fmt = (n) => n.toFixed(1).padStart(5);

  /** A text report for one palette. */
  function reportOne(id, colors, visions, roles) {
    const lines = [`--- ${id} ---`];
    const names = roles || Object.keys(colors);
    lines.push(`colours: ${names.map((n) => `${n} ${colors[n]}`).join(' | ')}`);
    for (const v of visions) {
      const c = check(colors, v, names);
      const worst = c.pairs.slice(0, 3).map((p) => `${p.a}/${p.b} ${p.dE.toFixed(1)}`).join(', ');
      lines.push(`${VISION_NAMES[v].padEnd(22)} min dE ${fmt(c.min)}   closest: ${worst}`);
    }
    const contrasts = names.map((n) => `${n} ${contrastOnBlack(colors[n]).toFixed(1)}`).join(', ');
    lines.push(`contrast on black: ${contrasts}`);
    return lines.join('\n');
  }

  /** Every palette in js/palette.js, checked under every kind of vision. */
  function report(opts = {}) {
    if (typeof EchoPalette === 'undefined') return 'js/palette.js is not loaded on this page.';
    const roles = opts.roles || EchoPalette.RIPPLE_ROLES;
    const out = [];
    for (const p of EchoPalette.list()) out.push(reportOne(p.id, EchoPalette.colorsOf(p.id), VISIONS, roles));
    return out.join('\n\n');
  }

  /** The full matrix for one palette under one vision, as rows of numbers (for a closer look). */
  function matrix(colors, vision, roles) {
    const names = roles || Object.keys(colors);
    const sim = {};
    for (const n of names) sim[n] = simulate(colors[n], vision);
    const head = [''.padEnd(9), ...names.map((n) => n.slice(0, 5).padStart(6))].join('');
    const rows = names.map((a) => [a.padEnd(9), ...names.map((b) => (a === b ? '     -' : deltaE(sim[a], sim[b]).toFixed(0).padStart(6)))].join(''));
    return [head, ...rows].join('\n');
  }

  return { VISIONS, VISION_NAMES, simulate, deltaE, luminance, contrastOnBlack, check, scoreOf, optimise, report, reportOne, matrix };
})();
if (typeof window !== 'undefined') window.PaletteCheck = PaletteCheck;
