/*
 * Echo Maze - cosmetics (v21.0): looks for YOUR sonar ripple and YOUR marker, unlocked by playing.
 *
 * PURELY VISUAL. Nothing here is read by the simulation: a ripple's range, speed, timing, what it finds, what a monster
 * hears or sees, and what you can see are all exactly what they were. What changes is how the game DRAWS three things:
 *   - your own ripple's colour - the wavefront and the walls it shows you (js/game.js drawRipple, for ripples you sent:
 *     `rp.mine`). Monsters, the way out and everything else keep the palette's colours, so nothing can be mistaken.
 *   - your own ripple's shape - the wavefront only (the walls it finds stay solid lines, for reading the maze);
 *   - your marker in the dark (js/game.js drawWorld).
 * Not in cutscenes (they cast their own ripples, never `mine`, and draw their own people) and not outside (the daylight
 * levels have no ripple and draw you as you are seen in daylight).
 *
 * UNLOCKS are worked out from what the game already keeps (the best level per mode, Endless's best depth) every time
 * they are asked for - nothing "unlocked" is ever stored, so it can never disagree with the progress. Stored, in its
 * own key (COS_KEY): only what is equipped and which unlocks have been seen (for the "new" dot). Storage that is not
 * there: the defaults.
 *
 * READABILITY: every colour is at least 9:1 on black and was picked (tools/palette-check.js's CIEDE2000) to stay
 * at least 10 apart from every other thing a ripple lights, in all four palettes; every shape keeps a solid glow under
 * whatever it does to its core line; every marker is a pale shape at least the size of the classic dot, with its halo.
 */
const EchoCosmetics = (() => {
  const COS_KEY = 'echomaze.cosmetics';

  // `need`: { clear: N } (level N cleared in some mode), { mode: 'hard' } (a level cleared on that mode),
  // { endless: D } (depth D reached in Endless, any mode). null = always there.
  const COLORS = [
    { id: 'classic', name: 'Classic', rgb: null, need: null },
    { id: 'amber', name: 'Amber', rgb: '252,193,151', need: { clear: 5 } },
    { id: 'mint', name: 'Mint', rgb: '83,198,159', need: { clear: 10 } },
    { id: 'rose', name: 'Rose', rgb: '255,189,222', need: { clear: 15 } },
    { id: 'violet', name: 'Violet', rgb: '220,182,251', need: { clear: 20 } },
    { id: 'gold', name: 'Gold', rgb: '198,167,83', need: { clear: 25 } },
    { id: 'whitehot', name: 'White-hot', rgb: '235,228,241', need: { endless: 10 } },
  ];
  const SHAPES = [
    { id: 'classic', name: 'Classic', need: null },
    { id: 'double', name: 'Double', need: { clear: 8 } },
    { id: 'dotted', name: 'Dotted', need: { clear: 12 } },
    { id: 'soft', name: 'Soft', need: { clear: 18 } },
    { id: 'heartbeat', name: 'Heartbeat', need: { endless: 5 } },
    { id: 'glitch', name: 'Glitch', need: { clear: 20 } },
  ];
  const MARKERS = [
    { id: 'dot', name: 'Dot', need: null },
    { id: 'ring', name: 'Ring', need: { clear: 3 } },
    { id: 'diamond', name: 'Diamond', need: { mode: 'hard' } },
    { id: 'star', name: 'Star', need: { clear: 25 } },
    { id: 'ember', name: 'Ember', need: { mode: 'hardcore' } },
  ];
  const LISTS = { color: COLORS, shape: SHAPES, marker: MARKERS };
  const DEFAULTS = { color: 'classic', shape: 'classic', marker: 'dot' };
  const CLASSIC_GLOW = '150,215,255'; // the wavefront's own colours, as they have always been
  const CLASSIC_CORE = '190,235,255';
  const MODE_NAMES = { hard: 'Hard', hardcore: 'Hardcore' };

  // ---------------------------------------------------------------- storage (every access in a try/catch)
  function load() {
    let v = null;
    try {
      v = JSON.parse(localStorage.getItem(COS_KEY));
    } catch (e) {
      v = null;
    }
    const out = { color: DEFAULTS.color, shape: DEFAULTS.shape, marker: DEFAULTS.marker, seen: [] };
    if (v && typeof v === 'object') {
      for (const k of ['color', 'shape', 'marker']) if (typeof v[k] === 'string' && LISTS[k].some((i) => i.id === v[k])) out[k] = v[k];
      if (Array.isArray(v.seen)) out.seen = v.seen.filter((s) => typeof s === 'string' && /^(color|shape|marker):[a-z]+$/.test(s)).slice(0, 64);
    }
    return out;
  }
  function save(s) {
    try {
      localStorage.setItem(COS_KEY, JSON.stringify({ color: s.color, shape: s.shape, marker: s.marker, seen: s.seen }));
      return true;
    } catch (e) {
      return false; // (no storage: what is equipped lasts until the page is closed)
    }
  }
  let state = load();

  // ---------------------------------------------------------------- unlocks
  /**
   * `facts` comes from the game, read fresh each time: { furthest (the best level unlocked in any mode), best ({ mode:
   * level unlocked }), endless (the best depth in any mode), endlessOpen (Endless is unlocked) }.
   */
  function isUnlocked(item, f) {
    const n = item.need;
    if (!n) return true;
    if (n.clear) return (f.furthest || 0) > n.clear;
    if (n.mode) return ((f.best && f.best[n.mode]) || 0) >= 2;
    if (n.endless) return (f.endless || 0) >= n.endless;
    return false;
  }
  /** What a locked one says, in plain words - and never anything the player has not met: Endless's only once it is open. */
  function condition(item, f) {
    const n = item.need;
    if (!n) return '';
    if (n.clear) return n.clear > 25 ? '???' : `Clear level ${n.clear}`;
    if (n.mode) return `Clear a level on ${MODE_NAMES[n.mode] || n.mode}`;
    if (n.endless) return f.endlessOpen ? `Reach depth ${n.endless} in Endless` : '???';
    return '???';
  }
  const find = (kind, id) => LISTS[kind].find((i) => i.id === id) || LISTS[kind][0];
  /** What is worn: the equipped ones - or, for one no longer unlocked (a save that went back), the default. */
  function current(f) {
    const out = {};
    for (const k of ['color', 'shape', 'marker']) {
      const it = find(k, state[k]);
      out[k] = isUnlocked(it, f) ? it : LISTS[k][0];
    }
    return out;
  }
  function equip(kind, id, f) {
    if (!LISTS[kind]) return false;
    const it = LISTS[kind].find((i) => i.id === id);
    if (!it || !isUnlocked(it, f)) return false;
    state[kind] = id;
    save(state);
    return true;
  }
  /** Unlocked ones not yet seen on the Cosmetics tab (the defaults never count as new). */
  function fresh(f) {
    const out = [];
    for (const k of ['color', 'shape', 'marker']) for (const it of LISTS[k]) if (it.need && isUnlocked(it, f) && !state.seen.includes(`${k}:${it.id}`)) out.push(`${k}:${it.id}`);
    return out;
  }
  function markSeen(f) {
    const add = fresh(f);
    if (!add.length) return false;
    state.seen = state.seen.concat(add).slice(-64);
    save(state);
    return true;
  }

  // ---------------------------------------------------------------- the look, for drawing
  function lighten(rgb, k) {
    const [r, g, b] = rgb.split(',').map(Number);
    return [r, g, b].map((v) => Math.round(v + (255 - v) * k)).join(',');
  }
  /** What drawRipple / drawWorld need: the wavefront's colours, the walls' colour (null = the palette's), shape, marker. */
  function look(cur) {
    const c = cur.color;
    return {
      color: c.id,
      glow: c.rgb || CLASSIC_GLOW,
      core: c.rgb ? lighten(c.rgb, 0.45) : CLASSIC_CORE,
      wall: c.rgb,
      wallCore: c.rgb ? lighten(c.rgb, 0.45) : null,
      shape: cur.shape.id,
      marker: cur.marker.id,
    };
  }
  const hash = (n) => (Math.imul(n | 0, 2654435761) >>> 0) / 4294967296; // a fixed function: never Math.random

  /**
   * The wavefront in a shape. `path(off)` draws the ring's path: `off` a number (px added to the radius) or a function
   * (ray index -> px, or null for a gap). `a` is its brightness now, `t` the ripple's age (s). The classic one is
   * exactly the game's own two strokes; every other keeps a solid glow under what it does to the core line.
   */
  function strokeWave(ctx, lk, path, a, t, calm) {
    const s = lk.shape;
    const line = (rgb, alpha, w) => {
      ctx.strokeStyle = `rgba(${rgb},${Math.min(1, alpha)})`;
      ctx.lineWidth = w;
      ctx.stroke();
    };
    if (s === 'soft') {
      path(0);
      line(lk.glow, a * 0.2, 18);
      line(lk.glow, a * 0.3, 6);
      line(lk.core, a * 0.85, 1.4);
      return;
    }
    if (s === 'heartbeat') {
      const k = 1 + (calm ? 0.25 : 0.6) * (0.5 + 0.5 * Math.sin(t * 13));
      path(0);
      line(lk.glow, a * 0.28, 11 * k);
      line(lk.core, a, 2.6 * k);
      return;
    }
    path(0);
    line(lk.glow, a * 0.25, 9);
    if (s === 'dotted') {
      ctx.setLineDash([3, 6]);
      line(lk.core, a * 1.15, 2.6);
      ctx.setLineDash([]);
      return;
    }
    if (s === 'glitch') {
      const frame = Math.floor(t * (calm ? 4 : 9));
      path((j) => {
        const seg = j >> 3;
        const v = hash(seg * 131 + frame * 977);
        if (v < 0.14) return null; // a gap in the ring
        return v < 0.32 ? (hash(seg * 71 + frame * 13) - 0.5) * 4 : 0; // a segment knocked a little out of line
      });
      line(lk.core, a, 1.9);
      return;
    }
    line(lk.core, a, 1.8);
    if (s === 'double') {
      if (path(-16)) line(lk.core, a * 0.45, 1.4);
    }
  }

  /**
   * Your marker in the dark, at (x, y): `size` the classic dot's radius (4.5, or 3.2 crouching, smaller as you fall),
   * `low` crouching (dimmer). Every one is a pale shape at least the dot's size; the halo round it is the game's.
   */
  function drawMarker(ctx, id, x, y, size, low, t, calm) {
    const fill = low ? 'rgba(200,225,240,0.6)' : 'rgba(235,248,255,0.95)';
    ctx.fillStyle = fill;
    ctx.beginPath();
    if (id === 'ring') {
      ctx.strokeStyle = fill;
      ctx.lineWidth = Math.max(1.4, size * 0.42);
      ctx.arc(x, y, size * 1.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, size * 0.42, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (id === 'diamond') {
      ctx.moveTo(x, y - size * 1.55);
      ctx.lineTo(x + size * 1.2, y);
      ctx.lineTo(x, y + size * 1.55);
      ctx.lineTo(x - size * 1.2, y);
      ctx.closePath();
      ctx.fill();
      return;
    }
    if (id === 'star') {
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? size * 0.75 : size * 1.7;
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        if (i) ctx.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
        else ctx.moveTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
      }
      ctx.closePath();
      ctx.fill();
      return;
    }
    if (id === 'ember') {
      // a soft warm glow that flickers slowly (under 2.5 Hz, and half as much in calm mode) - never a flash
      const f = (0.6 * Math.sin(t * 5.3) + 0.4 * Math.sin(t * 8.9 + 1)) * (calm ? 0.4 : 1);
      const R = size * 5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, `rgba(255,170,90,${(low ? 0.12 : 0.24) + 0.07 * f})`);
      g.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.fillStyle = g;
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = low ? 'rgba(255,215,180,0.65)' : 'rgba(255,232,205,0.97)';
      ctx.arc(x, y, size * (1.05 + 0.08 * f), 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.arc(x, y, size, 0, Math.PI * 2); // the classic dot
    ctx.fill();
  }

  /**
   * The Cosmetics tab's preview, and its tiles: on a dark ground, a small square room, your marker in the middle and
   * your ripple going out from it every RIPPLE_EVERY seconds, lighting the room's walls as it reaches them.
   * `opts`: { t (s), still (draw one frame of the wave, for a tile), wave (false: no ripple), wallsLit (0..1) }.
   */
  const RIPPLE_EVERY = 2.2;
  function drawPreview(ctx, w, h, lk, opts = {}) {
    const t = opts.t || 0;
    const calm = !!opts.calm;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#010206';
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const half = Math.min(w, h) * 0.38;
    const R = half * 1.5;
    const age = opts.still !== undefined ? opts.still : t % RIPPLE_EVERY;
    const r = (age / RIPPLE_EVERY) * R * 1.25;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // the room's walls: lit as the wave reaches them, fading after
    if (opts.walls !== false) {
      const lit = r >= half ? Math.exp(-Math.max(0, r - half) / (R * 0.8)) : 0;
      if (lit > 0.02) {
        const wall = lk.wall || opts.paletteWall || '95,212,255';
        ctx.strokeStyle = `rgba(${wall},${lit * 0.2})`;
        ctx.lineWidth = 7;
        ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);
        ctx.strokeStyle = `rgba(${wall},${lit})`;
        ctx.lineWidth = 2.2;
        ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);
      }
    }
    // the wavefront: the same strokes as in the game, on a circle clipped to the room
    if (opts.wave !== false && r > 1 && r < half * 1.42) {
      const a = 0.06 + 0.5 * (1 - r / (half * 1.42)) * 1.4;
      const N = 160;
      const inRoom = (px, py) => Math.abs(px - cx) <= half && Math.abs(py - cy) <= half;
      const path = (off) => {
        ctx.beginPath();
        let pen = false;
        let any = false;
        for (let i = 0; i <= N; i++) {
          const j = i % N;
          const o = typeof off === 'function' ? off(Math.floor((j * 640) / N)) : off;
          if (o === null) {
            pen = false;
            continue;
          }
          const rr = r + o;
          if (rr <= 0) {
            pen = false;
            continue;
          }
          const ang = (j / N) * Math.PI * 2;
          const px = cx + Math.cos(ang) * rr;
          const py = cy + Math.sin(ang) * rr;
          if (!inRoom(px, py)) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
          pen = true;
          any = true;
        }
        return any;
      };
      strokeWave(ctx, lk, path, a, age, calm);
    }
    // you, with the game's halo
    if (opts.marker !== false) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
      g.addColorStop(0, 'rgba(200,235,255,0.16)');
      g.addColorStop(1, 'rgba(200,235,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 30, 0, Math.PI * 2);
      ctx.fill();
      drawMarker(ctx, lk.marker, cx, cy, opts.size || 4.5, false, t, calm);
    }
    ctx.restore();
  }

  return {
    KEY: COS_KEY,
    COLORS,
    SHAPES,
    MARKERS,
    LISTS,
    DEFAULTS,
    RIPPLE_EVERY,
    isUnlocked,
    condition,
    current,
    equip,
    fresh,
    markSeen,
    look,
    strokeWave,
    drawMarker,
    drawPreview,
    reload() {
      state = load();
    },
    get state() {
      return { color: state.color, shape: state.shape, marker: state.marker, seen: state.seen.slice() };
    },
  };
})();
