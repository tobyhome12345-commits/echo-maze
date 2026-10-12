'use strict';

/**
 * SPECIAL EFFECTS IN CUSTOM LEVELS (v15.1): light, and red glow. A level can hold a few ZONES (js/levelformat.js
 * `effects`) - a rectangle of tiles, or the ellipse inside one - each a kind, a colour and an intensity from small
 * fixed lists. Drawing only: nothing here is read by the simulation, nothing here draws a random number, and the
 * same level always looks the same.
 *
 *   light   a pool of light: the floor in the zone is faintly lit and the stone faces in it show, in its colour.
 *           Warm, cold or pale.
 *   glow    a red glow: the zone is washed in a slow, dark red pulse (steady in calm mode and with reduced motion),
 *           and its stone faces catch a little of it. Red, crimson or ember.
 *
 * FAIRNESS - the rules every zone keeps:
 *   - It is an exception to "you never see without a ripple", like levels 13 and 15's own light, and held to THEIR
 *     rule: it is an exception to the ripple, never to the walls. Everything is clipped to what the player could
 *     really see from where they stand (the game's own line-of-sight polygon), so a zone behind a wall shows
 *     nothing.
 *   - It shows STONE AND FLOOR ONLY. No monster, object or way out is ever drawn by it: those are still found by a
 *     ripple, exactly as everywhere else (a light over a monster does not show the monster).
 *   - It is drawn UNDER the ripples, added on, never over: it can brighten what a ripple shows but never cover it,
 *     and its brightest floor is far dimmer than any ripple's line.
 *
 *   prepare(effects, walls, W, H, TILE)  -> zones in world px, with the stone faces each one lights (once per level)
 *   draw(ctx, zones, o)                  world space; o = { x, y, t, calm, still, visible, view }
 *   COLOURS, STRENGTH, inside(zone, tx, ty)
 */
const EchoEffects = (() => {
  const TAU = Math.PI * 2;
  const COLOURS = {
    warm: '255,214,160', // level 15's own light
    cold: '178,212,255',
    pale: '226,232,242',
    red: '255,46,66',
    crimson: '206,22,52',
    ember: '255,104,52',
  };
  const COLOUR_NAMES = { warm: 'Warm', cold: 'Cold', pale: 'Pale', red: 'Red', crimson: 'Crimson', ember: 'Ember' };
  const STRENGTH = { dim: 0.45, medium: 0.72, bright: 1 };
  const KIND_NAMES = { light: 'Light', glow: 'Red glow' };
  const FLOOR_ALPHA = { light: 0.11, glow: 0.16 }; // the floor at full strength, at the heart of the zone
  const FACE_ALPHA = { light: 0.55, glow: 0.34 }; // a stone face in the zone, at full strength
  const GLOW_HZ = 0.35; // the red glow's slow pulse

  /** Is the tile (tx, ty) inside the zone (a zone in TILES: x, y, w, h, shape)? */
  function inside(z, tx, ty) {
    if (tx < z.x || ty < z.y || tx >= z.x + z.w || ty >= z.y + z.h) return false;
    if (z.shape !== 'circle') return true;
    const rx = z.w / 2;
    const ry = z.h / 2;
    const dx = (tx + 0.5 - (z.x + rx)) / rx;
    const dy = (ty + 0.5 - (z.y + ry)) / ry;
    return dx * dx + dy * dy <= 1.0001;
  }

  /**
   * The zones of a level, in world px, ready to draw: each with the faces of stone it lights - every edge between a
   * wall tile and a floor tile whose floor side is in the zone (the face you would see standing there).
   */
  function prepare(effects, walls, W, H, TILE) {
    const out = [];
    for (const f of effects || []) {
      if (!COLOURS[f.colour] || !FLOOR_ALPHA[f.kind]) continue;
      const faces = [];
      const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !walls[y * W + x];
      for (let ty = f.y; ty < f.y + f.h; ty++) {
        for (let tx = f.x; tx < f.x + f.w; tx++) {
          if (!open(tx, ty) || !inside(f, tx, ty)) continue;
          const X = tx * TILE;
          const Y = ty * TILE;
          if (!open(tx, ty - 1)) faces.push(X, Y, X + TILE, Y);
          if (!open(tx, ty + 1)) faces.push(X, Y + TILE, X + TILE, Y + TILE);
          if (!open(tx - 1, ty)) faces.push(X, Y, X, Y + TILE);
          if (!open(tx + 1, ty)) faces.push(X + TILE, Y, X + TILE, Y + TILE);
        }
      }
      out.push({
        kind: f.kind,
        shape: f.shape,
        rgb: COLOURS[f.colour],
        k: STRENGTH[f.intensity] || STRENGTH.medium,
        x0: f.x * TILE,
        y0: f.y * TILE,
        x1: (f.x + f.w) * TILE,
        y1: (f.y + f.h) * TILE,
        cx: (f.x + f.w / 2) * TILE,
        cy: (f.y + f.h / 2) * TILE,
        rx: (f.w / 2) * TILE,
        ry: (f.h / 2) * TILE,
        faces: new Float32Array(faces),
        seed: (f.x * 7 + f.y * 13) % 17, // (the pulse is offset per zone, so two glows do not beat as one)
      });
    }
    return out;
  }

  function shapePath(ctx, z) {
    ctx.beginPath();
    if (z.shape === 'circle') ctx.ellipse(z.cx, z.cy, z.rx, z.ry, 0, 0, TAU);
    else ctx.rect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
  }

  /**
   * Draw every zone near the player. `o.visible` is the player's line-of-sight polygon (x0, y0, x1, y1, ...) - or a
   * function that makes it, called only if a zone is close enough to matter; `o.view` the half-size of the screen in
   * world px (zones further off are skipped).
   */
  function draw(ctx, zones, o) {
    if (!zones || !zones.length) return;
    const reach = o.view || 900;
    const near = zones.filter((z) => z.x1 > o.x - reach && z.x0 < o.x + reach && z.y1 > o.y - reach && z.y0 < o.y + reach);
    if (!near.length) return;
    const vis = typeof o.visible === 'function' ? o.visible() : o.visible;
    ctx.save();
    if (vis && vis.length >= 6) {
      ctx.beginPath();
      for (let i = 0; i < vis.length; i += 2) {
        if (i) ctx.lineTo(vis[i], vis[i + 1]);
        else ctx.moveTo(vis[i], vis[i + 1]);
      }
      ctx.closePath();
      ctx.clip();
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const z of near) {
      let k = z.k;
      if (z.kind === 'glow') k *= o.still || o.calm ? 0.85 : 0.72 + 0.28 * Math.sin((o.t * GLOW_HZ + z.seed / 17) * TAU);
      // the floor: brightest at the heart of the zone, fading to its edge
      ctx.save();
      shapePath(ctx, z);
      ctx.clip();
      const r = Math.max(z.rx, z.ry) * 1.25;
      const g = ctx.createRadialGradient(z.cx, z.cy, 0, z.cx, z.cy, r);
      g.addColorStop(0, `rgba(${z.rgb},${FLOOR_ALPHA[z.kind] * k})`);
      g.addColorStop(0.7, `rgba(${z.rgb},${FLOOR_ALPHA[z.kind] * k * 0.55})`);
      g.addColorStop(1, `rgba(${z.rgb},${FLOOR_ALPHA[z.kind] * k * 0.25})`);
      ctx.fillStyle = g;
      ctx.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
      ctx.restore();
      // the stone it falls on
      if (z.faces.length) {
        ctx.beginPath();
        for (let i = 0; i < z.faces.length; i += 4) {
          ctx.moveTo(z.faces[i], z.faces[i + 1]);
          ctx.lineTo(z.faces[i + 2], z.faces[i + 3]);
        }
        ctx.strokeStyle = `rgba(${z.rgb},${FACE_ALPHA[z.kind] * k * 0.3})`;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.strokeStyle = `rgba(${z.rgb},${FACE_ALPHA[z.kind] * k})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  return { COLOURS, COLOUR_NAMES, KIND_NAMES, STRENGTH, inside, prepare, draw };
})();
