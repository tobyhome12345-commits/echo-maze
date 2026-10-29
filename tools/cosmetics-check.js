'use strict';
/**
 * (v22.1) THE COSMETICS DRAW WHAT THEY SAY - in Node, in every `node tools/check.js` run, so a look that changes nothing
 * (v21.0's Heartbeat did exactly that) can never ship again.
 *
 * js/cosmetics.js is run with a canvas that only RECORDS what it is told (every stroke's colour, width and dash, and
 * where each ring is drawn), and:
 *   - every two ripple shapes draw differently at EVERY moment of the wave's way out (calm mode too) - not just once;
 *   - every shape draws its ring AT the wave's radius (only Double's second ring and Glitch's nudges sit off it, and no
 *     further than they ever have) - a look never moves the ripple;
 *   - the Heartbeat is clearly thicker than Classic all the way out, and beats twice (lub, then a smaller dub);
 *   - every two ripple colours are different colours, and every two markers draw differently.
 * The ripple's reach and timing themselves are proved in the browser (tools/cosmetics-test.js `same`: the same rays,
 * reach, speed and life in every look).
 *
 *   node tools/cosmetics-check.js [--quiet]
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const quiet = process.argv.includes('--quiet');
let passed = 0;
let failed = 0;
const ok = (name, pass, info) => {
  if (pass) passed++;
  else failed++;
  if (!pass || !quiet) console.log(`${pass ? 'ok     ' : 'FAILED '} ${name}${!pass && info !== undefined ? `  - ${typeof info === 'string' ? info : JSON.stringify(info).slice(0, 400)}` : ''}`);
};

const store = {};
const sandbox = { console, Math, JSON, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'cosmetics.js'), 'utf8'), sandbox);
const C = vm.runInContext('EchoCosmetics', sandbox);

/** A canvas that writes down what is drawn. `ring` is the wave's path: what it is asked to draw is noted too. */
function recorder() {
  const log = [];
  let dash = [];
  const ctx = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    globalCompositeOperation: 'source-over',
    setLineDash: (d) => (dash = d.slice()),
    stroke() {
      log.push(`stroke ${this.strokeStyle} w${+this.lineWidth.toFixed(3)} d${dash.join('/')}`);
    },
    fill() {
      log.push(`fill ${this.fillStyle}`);
    },
    beginPath: () => log.push('begin'),
    closePath: () => log.push('close'),
    moveTo: (x, y) => log.push(`m${x.toFixed(2)},${y.toFixed(2)}`),
    lineTo: (x, y) => log.push(`l${x.toFixed(2)},${y.toFixed(2)}`),
    arc: (x, y, r) => log.push(`a${x.toFixed(2)},${y.toFixed(2)},${r.toFixed(2)}`),
    save() {},
    restore() {},
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return { ctx, log };
}
const RAYS = 640;
/** One frame of the wavefront in a look: what it draws, and every offset from the wave's radius it asks for. */
function frame(look, u, calm) {
  const { ctx, log } = recorder();
  const offsets = [];
  const ringPath = (off) => {
    log.push('ring');
    if (typeof off === 'function') {
      const o = [];
      for (let j = 0; j < RAYS; j++) {
        const v = off(j);
        o.push(v === null ? 'gap' : +v.toFixed(3));
        if (v !== null) offsets.push(v);
      }
      log.push(`ring-off ${o.join(',')}`);
    } else {
      offsets.push(off);
      log.push(`ring-off ${off}`);
    }
    return true;
  };
  // (v22.1) where the wave lands on the walls: the same, for the landing mark
  const landed = [];
  const hitPath = (off) => {
    log.push('landing');
    if (typeof off === 'function') {
      const o = [];
      for (let j = 0; j < RAYS; j++) {
        const v = off(j);
        o.push(v === null ? 'gap' : +v.toFixed(3));
        if (v !== null) landed.push(v);
      }
      log.push(`landing-off ${o.join(',')}`);
    } else {
      landed.push(off);
      log.push(`landing-off ${off}`);
    }
    return true;
  };
  const t = 0.05 + u * 0.55; // (the age of a ripple that spreads at the game's speed: about 0.6 s to its reach)
  C.strokeWave(ctx, look, ringPath, 0.4, t, calm, u, hitPath);
  const cut = log.indexOf('landing');
  const ringLog = cut < 0 ? log : log.slice(0, cut);
  const landingStrokes = cut < 0 ? 0 : log.slice(cut).filter((l) => l.startsWith('stroke')).length;
  return { sig: log.join('|'), offsets, landed, landingStrokes, widths: ringLog.filter((l) => l.startsWith('stroke')).map((l) => +/ w([\d.]+)/.exec(l)[1]) };
}
const lookOf = (color, shape, marker) => C.look({ color: C.COLORS.find((c) => c.id === color), shape: C.SHAPES.find((s) => s.id === shape), marker: C.MARKERS.find((m) => m.id === marker) });
const US = [];
for (let u = 0.02; u < 1; u += 0.02) US.push(+u.toFixed(2));

// ------------------------------------------------------------------ the shapes
for (const calm of [false, true]) {
  const shapes = C.SHAPES.map((s) => s.id);
  const same = [];
  for (const u of US) {
    const sigs = shapes.map((id) => frame(lookOf('classic', id, 'dot'), u, calm).sig);
    for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) if (sigs[i] === sigs[j]) same.push(`${shapes[i]} = ${shapes[j]} at ${u}`);
  }
  ok(`every two ripple shapes draw differently at every moment of the wave${calm ? ' (Calm mode)' : ''} (${shapes.length} shapes x ${US.length} moments)`, same.length === 0, same.slice(0, 6));
}
// in every colour too (a shape must not be lost in one)
{
  const same = [];
  for (const c of C.COLORS) for (const u of [0.1, 0.3, 0.5, 0.8]) {
    const sigs = C.SHAPES.map((s) => frame(lookOf(c.id, s.id, 'dot'), u, false).sig);
    if (new Set(sigs).size !== sigs.length) same.push(`${c.id} at ${u}`);
  }
  ok('...and in every ripple colour', same.length === 0, same);
}
// the ring is where the wave is: no look moves it
{
  const off = [];
  for (const s of C.SHAPES) for (const u of US) {
    const f = frame(lookOf('classic', s.id, 'dot'), u, false);
    if (!f.offsets.some((o) => o === 0) && s.id !== 'glitch') off.push(`${s.id}: no ring at the radius at ${u}`);
    if (s.id === 'glitch' && !f.offsets.length) off.push(`glitch: no ring at ${u}`);
    for (const o of f.offsets) if (o < -16 || o > 2) off.push(`${s.id}: ${o} px off at ${u}`);
  }
  ok('every shape draws its ring at the wave\'s radius (Double\'s second ring 16 px inside, Glitch\'s nudges at most 2 px)', off.length === 0, off.slice(0, 6));
}
// where the wave lands on the walls (v22.1): every shape but Classic marks it, close in front of the stone; Classic draws nothing there
{
  const bad = [];
  for (const s of C.SHAPES) for (const u of [0.1, 0.3, 0.5, 0.8]) {
    const f = frame(lookOf('classic', s.id, 'dot'), u, false);
    if (s.id === 'classic' && (f.landed.length || f.landingStrokes)) bad.push('classic marks the landing');
    if (s.id !== 'classic' && !f.landingStrokes) bad.push(`${s.id}: no mark where it lands at ${u}`);
    for (const o of f.landed) if (o < -14 || o > 0) bad.push(`${s.id}: landing mark ${o} px off the stone`);
  }
  ok('where the wave lands on the walls: every shape but Classic marks it, at most 14 px in front of the stone; Classic as before', bad.length === 0, [...new Set(bad)].slice(0, 6));
}
// the Heartbeat: thick all the way, and two beats
{
  const core = (s, u, calm) => Math.max(...frame(lookOf('classic', s, 'dot'), u, calm).widths.filter((w) => w < 9));
  const classic = core('classic', 0.5, false);
  const thin = US.filter((u) => core('heartbeat', u, false) < classic * 1.6 || core('heartbeat', u, true) < classic * 1.6);
  ok(`the Heartbeat's line is clearly thicker than Classic's (${classic} px) all the way out, Calm mode too`, thin.length === 0, thin);
  const w = US.map((u) => core('heartbeat', u, false));
  const peaks = [];
  for (let i = 1; i < w.length - 1; i++) if (w[i] > w[i - 1] && w[i] >= w[i + 1]) peaks.push([US[i], w[i]]);
  const lo = Math.min(...w);
  ok(`the Heartbeat beats twice - lub, then a smaller dub (peaks ${peaks.map((p) => `${p[1]} px at ${p[0]}`).join(', ')}; ${lo} px between)`, peaks.length === 2 && peaks[0][1] > peaks[1][1] && peaks[1][1] > lo * 1.4 && peaks[0][1] >= classic * 3, peaks);
  const wc = US.map((u) => core('heartbeat', u, true));
  ok('...softer in Calm mode, but still a beat', Math.max(...wc) < Math.max(...w) && Math.max(...wc) > Math.min(...wc) * 1.2);
}

// ------------------------------------------------------------------ the colours and the markers
{
  const looks = C.COLORS.map((c) => lookOf(c.id, 'classic', 'dot'));
  const pairs = [];
  for (let i = 0; i < looks.length; i++) for (let j = i + 1; j < looks.length; j++) if (looks[i].glow === looks[j].glow || looks[i].core === looks[j].core) pairs.push(`${looks[i].color} = ${looks[j].color}`);
  ok(`every two ripple colours are different colours (${looks.length})`, pairs.length === 0, pairs);
  const sigs = C.COLORS.map((c) => frame(lookOf(c.id, 'classic', 'dot'), 0.4, false).sig);
  ok('...and draw differently', new Set(sigs).size === sigs.length);
  ok('...every colour but Classic lights the walls in itself', C.COLORS.every((c) => (c.id === 'classic' ? lookOf(c.id, 'classic', 'dot').wall === null : lookOf(c.id, 'classic', 'dot').wall === c.rgb)));
}
{
  const draw = (id, low) => {
    const { ctx, log } = recorder();
    C.drawMarker(ctx, id, 100, 100, low ? 3.2 : 4.5, low, 1.3, false);
    return log.join('|');
  };
  for (const low of [false, true]) {
    const sigs = C.MARKERS.map((m) => draw(m.id, low));
    ok(`every two markers draw differently${low ? ' (crouching)' : ''} (${sigs.length})`, new Set(sigs).size === sigs.length);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
