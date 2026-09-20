'use strict';

/**
 * Visual sound cues - an accessibility option (the "Visual cues" switch, key V). Every sound that has a
 * direction is also drawn as a small glyph on a ring about 45 px around the player, pointing toward it.
 *
 *   echo monster (voice, footsteps, screech)   red diamond              (a screech: bigger, brighter + a caption)
 *   scent monster (voice, steps)               violet round glyph with a wavy edge
 *   stalker (breathing, clicks, steps)         small orange dots
 *   exit chime, and a mimic's fake chime       green chevron            (the very same cue for both)
 *   sonar decoy (drop spot, its pings)         pink four-point star
 *   heartbeat                                  a thin ring around the player, pulsing at the heartbeat's rate
 *
 * Every cue has its own SHAPE as well as its colour, so colour alone is never needed.
 *
 * What this module must never do:
 *   - change the game. It only DRAWS what the game hands it, and it reads nothing but its own state. It never
 *     calls Math.random (a drawing effect must not shift the game's random numbers), and the game never reads
 *     anything back from it.
 *   - give more than the sound gives. The game only calls it where it also plays the sound, with the same
 *     distance falloff, so a cue exists only while the sound would be audible. Direction, rough loudness
 *     (size and brightness), type and timing - never a radius, a monster's state or an exact position.
 *   - flash. Nothing pulses more than 3 times a second (each source is rate-limited to one pulse per
 *     MIN_GAP), and every cue fades in and out smoothly. In calm mode the fades are simply slower; calm mode
 *     never makes a cue weaker.
 *   - hide when muffled: a sound that a wall is muffling gets a dimmer glyph, the way it gets a duller sound.
 *
 * It works with the sound muted (it follows what WOULD be heard) and does not depend on the AudioContext.
 */
const EchoCues = (() => {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const RING = 45; // px on screen: the ring of glyphs around the player
  const MIN_GAP = 0.34; // seconds between two pulses of the same source: at most 2.9 a second
  const MUFFLED_DIM = 0.45; // brightness factor while a wall muffles the sound
  const MAX_PULSES = 28;
  const MIN_SEPARATION = 0.36; // radians: glyphs on the ring are nudged apart so they do not sit on top of each other

  const RGB = {
    echo: '255,59,92',
    scent: '176,124,255',
    stalker: '255,116,16',
    exit: '93,255,160',
    decoy: '255,122,217',
    heart: '255,132,150',
  };

  const smooth = (t) => {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };

  function create(env) {
    const { ctx } = env;
    const capEl = document.getElementById('cue-caption');

    let clock = 0; // seconds of play, advanced by update()
    let frame = 0;
    let pulses = []; // one-shot cues: { kind, x, y, loud, big, dots, muffled, born }
    const holds = new Map(); // sustained cues (a voice): key -> { kind, x, y, target, a, dim, muffled, dots, frame }
    const lastPulse = new WeakMap(); // source -> { sub: clock time of its last pulse }
    let beats = []; // heartbeat rings: { strength, born }
    let lastBeat = -9;
    let facing = -Math.PI / 2; // the way the player last moved (where a cue at the player's own feet points)
    let prevX = null;
    let prevY = null;
    let capTimer = 0;
    let capText = '';

    const on = () => !!(env.enabled && env.enabled());
    const calm = () => !!(env.calm && env.calm());

    /**
     * A one-shot cue at world (x,y): a footstep, a chime, a screech, a click. `loud` 0..1 is how loud the matching
     * sound is at the player (the same falloff as the audio); it sets the size and brightness.
     *   o.key + o.sub  the source and kind of sound, for the rate limit (one pulse per source per MIN_GAP)
     *   o.big          a louder, more urgent sound (a screech): larger, brighter, longer
     *   o.dots         for the stalker: how many dots
     *   o.muffled      a wall is in the way: dimmer
     */
    function pulse(kind, x, y, loud, o = {}) {
      if (!on()) return;
      if (o.key !== undefined && o.key !== null) {
        let t = lastPulse.get(o.key);
        if (!t) lastPulse.set(o.key, (t = {}));
        const sub = o.sub || '';
        if (t[sub] !== undefined && clock - t[sub] < MIN_GAP) return;
        t[sub] = clock;
      }
      pulses.push({ kind, x, y, loud: clamp(loud, 0, 1), big: !!o.big, dots: o.dots || 1, muffled: !!o.muffled, born: clock });
      if (pulses.length > MAX_PULSES) pulses.shift();
    }

    /**
     * A sustained cue for something that is making a continuous sound (a voice). Call it every frame while it is
     * audible; it fades in, follows the source, and fades out by itself once the calls stop.
     */
    function hold(key, kind, x, y, loud, muffled, dots) {
      if (!on()) return;
      let h = holds.get(key);
      if (!h) holds.set(key, (h = { kind, a: 0, dim: 1, phase: holds.size * 1.7 }));
      h.kind = kind;
      h.x = x;
      h.y = y;
      h.target = clamp(loud, 0, 1);
      h.muffled = !!muffled;
      h.dots = dots || 1;
      h.frame = frame;
    }

    /** One heartbeat: a ring around the player. The game calls this at the heartbeat's own rate (never above 3 a second). */
    function heartbeat(strength) {
      if (!on() || clock - lastBeat < MIN_GAP) return;
      lastBeat = clock;
      beats.push({ strength: clamp(strength, 0, 1), born: clock });
      if (beats.length > 4) beats.shift();
    }

    /** A short text caption for a loud sound, e.g. "[monster screech]". */
    function caption(text) {
      if (!on() || !capEl) return;
      if (text === capText && capTimer > 0.6) return;
      capText = text;
      capTimer = 1.9;
      capEl.textContent = text;
      capEl.classList.add('show');
    }

    function clear() {
      pulses = [];
      holds.clear();
      beats = [];
      capTimer = 0;
      capText = '';
      if (capEl) capEl.classList.remove('show');
    }

    function update(dt, px, py) {
      clock += dt;
      if (prevX !== null && Math.hypot(px - prevX, py - prevY) > 0.4) facing = Math.atan2(py - prevY, px - prevX);
      prevX = px;
      prevY = py;
      if (!on()) {
        if (pulses.length || holds.size || beats.length) clear();
        return;
      }
      const life = (p) => (p.big ? 1.15 : 0.7) * (calm() ? 1.35 : 1);
      pulses = pulses.filter((p) => clock - p.born < life(p));
      beats = beats.filter((b) => clock - b.born < 0.75);
      const kv = 1 - Math.exp(-dt / (calm() ? 0.4 : 0.25));
      const kd = 1 - Math.exp(-dt / 0.1);
      for (const [key, h] of holds) {
        const live = h.frame === frame;
        h.a += ((live ? h.target : 0) - h.a) * kv;
        h.dim += ((h.muffled ? MUFFLED_DIM : 1) - h.dim) * kd;
        if (!live && h.a < 0.01) holds.delete(key);
      }
      frame++;
      if (capTimer > 0) {
        capTimer -= dt;
        if (capTimer <= 0 && capEl) capEl.classList.remove('show');
      }
    }

    // ------------------------------------------------------------ drawing
    /** How bright a one-shot cue is right now, 0..1: a smooth rise, then a smooth fall (slower in calm mode). */
    function envelope(p) {
      const age = clock - p.born;
      const atk = calm() ? 0.25 : 0.08;
      const total = (p.big ? 1.15 : 0.7) * (calm() ? 1.35 : 1);
      if (age < atk) return smooth(age / atk);
      return smooth(1 - (age - atk) / (total - atk));
    }

    function glyph(kind, gx, gy, ang, size, alpha, dots, t, phase) {
      const rgb = RGB[kind];
      ctx.save();
      ctx.translate(gx, gy);
      // a soft glow so the shape reads in the dark
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.4);
      g.addColorStop(0, `rgba(${rgb},${alpha * 0.34})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, size * 2.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(${rgb},${alpha * 0.55})`;
      ctx.strokeStyle = `rgba(${rgb},${Math.min(1, alpha * 1.05)})`;
      ctx.lineWidth = Math.max(1.4, size * 0.2);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (kind === 'echo') {
        // a diamond
        ctx.moveTo(0, -size * 1.1);
        ctx.lineTo(size * 0.85, 0);
        ctx.lineTo(0, size * 1.1);
        ctx.lineTo(-size * 0.85, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (kind === 'scent') {
        // a round glyph with a wavy edge
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * TAU;
          const r = size * (1 + 0.2 * Math.sin(a * 6 + phase));
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (kind === 'stalker') {
        // small dots, laid out along the ring (1 = a click, 2 = a step, 3 = breathing, 5 = it heard you)
        ctx.rotate(ang + Math.PI / 2);
        const n = dots;
        const r = size * 0.36;
        for (let i = 0; i < n; i++) {
          const dx = (i - (n - 1) / 2) * r * 2.9;
          ctx.beginPath();
          ctx.arc(dx, 0, r, 0, TAU);
          ctx.fill();
          ctx.stroke();
        }
      } else if (kind === 'exit') {
        // a chevron pointing away from the player, toward the chime
        ctx.rotate(ang);
        ctx.lineWidth = Math.max(2, size * 0.32);
        ctx.moveTo(-size * 0.55, -size * 0.95);
        ctx.lineTo(size * 0.6, 0);
        ctx.lineTo(-size * 0.55, size * 0.95);
        ctx.stroke();
      } else if (kind === 'decoy') {
        // a four-point star
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU - Math.PI / 2;
          const r = i % 2 ? size * 0.4 : size * 1.25;
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    /**
     * Draw every cue around the player. The caller has set the world transform; `unit` = world px per screen px
     * (1 / the view scale), so the ring is really about 45 px on screen whatever the size of the window.
     */
    function draw(px, py, unit) {
      if (!on() || (!pulses.length && !holds.size && !beats.length)) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const items = [];
      for (const p of pulses) {
        const e = envelope(p);
        if (e <= 0.01) continue;
        const L = p.loud;
        items.push({ kind: p.kind, x: p.x, y: p.y, size: (3.5 + 6.5 * L) * (p.big ? 1.7 : 1), alpha: Math.min(1, (0.3 + 0.7 * L) * (p.big ? 1.25 : 1)) * e * (p.muffled ? MUFFLED_DIM : 1), dots: p.big && p.kind === 'stalker' ? 5 : p.dots });
      }
      for (const h of holds.values()) {
        if (h.a < 0.02) continue;
        // a voice: steady, with a slow swell (well under 3 a second)
        const swell = 0.85 + 0.15 * Math.sin(clock * 3.4 + h.phase);
        items.push({ kind: h.kind, x: h.x, y: h.y, size: 3 + 5 * h.a, alpha: Math.min(1, 0.22 + 0.7 * h.a) * h.dim * swell, dots: h.dots });
      }
      // where each one points; then nudge glyphs that would overlap apart along the ring
      for (const it of items) {
        const dx = it.x - px;
        const dy = it.y - py;
        it.ang = Math.hypot(dx, dy) < 4 ? facing : Math.atan2(dy, dx);
      }
      items.sort((a, b) => a.ang - b.ang);
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 1; i < items.length; i++) {
          // bigger glyphs need more room: the two must clear each other's edges on the 45px ring
          const need = Math.max(MIN_SEPARATION, ((items[i].size + items[i - 1].size) * 1.2) / RING);
          const gap = items[i].ang - items[i - 1].ang;
          if (gap < need) {
            const push = (need - gap) / 2;
            items[i - 1].ang -= push;
            items[i].ang += push;
          }
        }
      }
      const R = RING * unit;
      for (const it of items) {
        glyph(it.kind, px + Math.cos(it.ang) * R, py + Math.sin(it.ang) * R, it.ang, it.size * unit, it.alpha, it.dots, clock, clock * 1.4 + it.ang);
      }
      // heartbeat: a thin ring around the player that swells and fades once per beat
      for (const b of beats) {
        const age = clock - b.born;
        const a = smooth(1 - age / 0.75) * (calm() ? 0.9 : 1) * (0.35 + 0.5 * b.strength);
        const rr = (17 + 11 * smooth(age / 0.6) + 5 * b.strength) * unit;
        ctx.strokeStyle = `rgba(${RGB.heart},${a})`;
        ctx.lineWidth = 1.8 * unit;
        ctx.beginPath();
        ctx.arc(px, py, rr, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    /** For tests: what is drawn right now (kind and brightness only). */
    function list() {
      const out = [];
      for (const p of pulses) out.push({ kind: p.kind, type: 'pulse', alpha: Math.round(envelope(p) * (p.muffled ? MUFFLED_DIM : 1) * 100) / 100, big: p.big, muffled: p.muffled, born: Math.round(p.born * 1000) / 1000, loud: Math.round(p.loud * 100) / 100 });
      for (const h of holds.values()) out.push({ kind: h.kind, type: 'hold', alpha: Math.round(h.a * h.dim * 100) / 100, muffled: h.muffled });
      for (const b of beats) out.push({ kind: 'heart', type: 'ring', alpha: Math.round(smooth(1 - (clock - b.born) / 0.75) * 100) / 100, born: Math.round(b.born * 1000) / 1000 });
      return out;
    }

    return { pulse, hold, heartbeat, caption, clear, update, draw, list, get pulseCount() { return pulses.length; } };
  }

  return { create, MIN_GAP, RING };
})();
