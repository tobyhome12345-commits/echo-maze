'use strict';

/**
 * GHOST RUNS (v23.0): on a bonus level or one of My Levels (imported ones included), your fastest finished run is kept
 * as that level's GHOST, and every later attempt shows it - a faint, cool copy of your marker walking the way you went,
 * where you were at that moment. Nowhere else: never the campaign, Endless, the tutorial, a cutscene, the daylight
 * levels or the editor's Test play (js/game.js decides that - ghostEligible - and only ever calls this file then).
 *
 * A ghost is a PICTURE and nothing more. Nothing here is read by the simulation: it has no body, makes no sound, lights
 * nothing, and monsters, ripples and the map never hear of it. Recording only reads where you are; playing back only
 * draws. No Math.random anywhere.
 *
 * WHAT IS KEPT - one key, GHOSTS_KEY: { schemaVersion: 1, ghosts: [entry] }, an entry being
 *   { s: 'bonus' | 'mylevels', id, h: the level's layout hash, m: the difficulty it is played at,
 *     t: the run's time in ms, at: when it was kept (ms since 1970), x, y: where it started (px),
 *     d: the path - a sample every STEP s, each one the move since the last (dx, dy in whole px), packed by `pack` }
 * - one per level and difficulty (`m`: a level's own difficulty is what changes its monsters - the player's title-screen
 *   mode does not reach a custom level), and only the best. The hash is of the layout alone (size, walls, start, ways
 *   out, monsters, objects), so renaming a level keeps its ghost and changing its maze does not: a ghost whose hash no
 *   longer matches its level is thrown away (on the next save or play of it - levelChanged / best). Deleting a level
 *   deletes its ghosts (forgetLevel, from js/levelstore.js). At most MAX_GHOSTS in all - the oldest kept goes first -
 *   and a run longer than MAX_SECONDS is not kept, so storage never grows without limit. Storage off or full: nothing
 *   is kept and nothing is said. Ghosts are in no share code, folder code or save code (js/savecode.js reads only its
 *   own list of keys).
 *
 *   enabled() / setEnabled(on)          Settings -> Display "Ghost" (GHOST_KEY, on unless '0')
 *   modeOf(doc)                         the difficulty a level is played at, as a key
 *   hashOf(doc)                         its layout's hash
 *   best(source, doc)                   the ghost to race (an entry), or null
 *   recorder(x, y) / sample(rec, t, x, y)   record a run (call every frame while it is played)
 *   offer(source, doc, rec, t, x, y)    a finished run: kept if it is the fastest -> { best: previous ms or 0, kept, newBest }
 *   playback(entry) / at(pb, t)         where its ghost is at time t -> { x, y, a } (a: how visible, 0 once it is gone)
 *   forgetLevel(source, id) / levelChanged(source, doc) / sweep(source, ids)
 */
const EchoGhosts = (() => {
  const GHOSTS_KEY = 'echomaze.ghosts';
  const GHOST_KEY = 'echomaze.ghost'; // the Settings switch: '0' = off (on by default)
  const STEP = 0.1; // s between samples: 10 a second
  const MAX_SECONDS = 300; // a run longer than this (5 minutes) is not kept
  const MAX_GHOSTS = 40; // in all; the oldest kept goes first
  const FADE = 0.6; // s - at the way out the ghost fades over this
  const SOURCES = ['bonus', 'mylevels'];
  const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-'; // 63 one-character moves, -31..31
  const ESC = '_'; // anything bigger: '_' + the number + '.'

  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch (e) {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
        return true;
      } catch (e) {
        return false; // (storage off or full: nothing is kept, nothing is said)
      }
    },
  };

  let on = null; // (read once: the game asks every frame)
  const enabled = () => (on === null ? (on = store.get(GHOST_KEY) !== '0') : on);
  function setEnabled(v) {
    on = !!v;
    store.set(GHOST_KEY, on ? '1' : '0');
  }

  // ---------------------------------------------------------------- which level, which difficulty
  /** The difficulty the level is played at: its rating, and for a Custom one its three scales too. */
  function modeOf(doc) {
    const d = EchoLevelFormat.difficulty(doc && doc.difficulty);
    return d.rating === 'custom' ? `custom:${d.monsterSpeed},${d.rippleRange},${d.hearing}` : d.rating;
  }
  /** JSON with its keys in order, so the same level always gives the same text. */
  function stable(v) {
    if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
    if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
    return JSON.stringify(v === undefined ? null : v);
  }
  /** FNV-1a over the layout: what you walk through and what is in it - not its name, card, colours or difficulty. */
  function hashOf(doc) {
    const d = doc || {};
    const s = stable({ size: d.size, walls: d.walls, start: d.start, exits: d.exits || (d.exit ? [d.exit] : []), enemies: d.enemies, objects: d.objects });
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  // ---------------------------------------------------------------- the store (read as untrusted)
  const idOk = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
  function okEntry(e) {
    return (
      e && typeof e === 'object' && SOURCES.includes(e.s) && idOk(e.id) && typeof e.h === 'string' && /^[0-9a-f]{8}$/.test(e.h) &&
      typeof e.m === 'string' && e.m.length <= 40 && Number.isFinite(e.t) && e.t > 0 && e.t <= MAX_SECONDS * 1000 &&
      Number.isFinite(e.at) && Number.isFinite(e.x) && Number.isFinite(e.y) && typeof e.d === 'string' && e.d.length <= MAX_SECONDS * 30
    );
  }
  function read() {
    let v = null;
    try {
      v = JSON.parse(store.get(GHOSTS_KEY));
    } catch (e) {
      v = null;
    }
    return v && Array.isArray(v.ghosts) ? v.ghosts.filter(okEntry) : [];
  }
  const write = (list) => store.set(GHOSTS_KEY, JSON.stringify({ schemaVersion: 1, ghosts: list }));
  const sameLevel = (e, source, id) => e.s === source && e.id === id;

  /** The ghost to race on this level at its difficulty - and any of its ghosts from before it was changed, gone. */
  function best(source, doc) {
    if (!SOURCES.includes(source) || !doc || !idOk(doc.id)) return null;
    const h = hashOf(doc);
    const m = modeOf(doc);
    const all = read();
    const keep = all.filter((e) => !(sameLevel(e, source, doc.id) && e.h !== h));
    if (keep.length !== all.length) write(keep);
    return keep.find((e) => sameLevel(e, source, doc.id) && e.m === m) || null;
  }
  /** A level was saved: its ghosts stay only if its layout is still the one they were run on. */
  function levelChanged(source, doc) {
    if (!doc || !idOk(doc.id)) return;
    const h = hashOf(doc);
    const all = read();
    const keep = all.filter((e) => !(sameLevel(e, source, doc.id) && e.h !== h));
    if (keep.length !== all.length) write(keep);
  }
  /** A level was deleted: every ghost of it, at every difficulty. */
  function forgetLevel(source, id) {
    const all = read();
    const keep = all.filter((e) => !sameLevel(e, source, id));
    if (keep.length !== all.length) write(keep);
  }
  /** Only the levels a source still has keep ghosts (after a save code has replaced My Levels, say). */
  function sweep(source, ids) {
    const have = new Set(ids);
    const all = read();
    const keep = all.filter((e) => e.s !== source || have.has(e.id));
    if (keep.length !== all.length) write(keep);
  }

  // ---------------------------------------------------------------- the path: whole px, one move per sample
  function pack(moves) {
    let out = '';
    for (const v of moves) out += v >= -31 && v <= 31 ? ALPH[v + 31] : `${ESC}${v}.`;
    return out;
  }
  function unpack(s) {
    const out = [];
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === ESC) {
        const end = s.indexOf('.', i);
        const v = end > i ? parseInt(s.slice(i + 1, end), 10) : NaN;
        if (!Number.isFinite(v) || Math.abs(v) > 99999) return null;
        out.push(v);
        i = end;
      } else {
        const k = ALPH.indexOf(c);
        if (k < 0) return null;
        out.push(k - 31);
      }
    }
    return out.length % 2 ? null : out;
  }

  // ---------------------------------------------------------------- recording
  function recorder(x, y) {
    return { x0: Math.round(x), y0: Math.round(y), lx: Math.round(x), ly: Math.round(y), moves: [], n: 0, over: false };
  }
  /** Every frame: a sample each STEP s of the run (where you are now), until the run is too long to keep. */
  function sample(rec, t, x, y) {
    if (!rec || rec.over) return;
    while ((rec.n + 1) * STEP <= t + 1e-9) {
      if ((rec.n + 1) * STEP > MAX_SECONDS) {
        rec.over = true;
        return;
      }
      const px = Math.round(x);
      const py = Math.round(y);
      rec.moves.push(px - rec.lx, py - rec.ly);
      rec.lx = px;
      rec.ly = py;
      rec.n++;
    }
  }
  /** A finished run (time t, ended at x, y): kept as the ghost if it is the fastest at this difficulty. */
  function offer(source, doc, rec, t, x, y) {
    const res = { best: 0, kept: false, newBest: false };
    if (!rec || !SOURCES.includes(source) || !doc || !idOk(doc.id)) return res;
    const prev = best(source, doc);
    res.best = prev ? prev.t : 0;
    const ms = Math.max(1, Math.round(t * 1000));
    if (prev && ms >= prev.t) return res; // (slower, or the same: the ghost you have stays)
    res.newBest = !!prev;
    sample(rec, t, x, y);
    if (rec.over || t > MAX_SECONDS) return res;
    // the last move: to exactly where the run ended (its time is `t`, a little after the last sample)
    const moves = rec.moves.concat([Math.round(x) - rec.lx, Math.round(y) - rec.ly]);
    const entry = { s: source, id: doc.id, h: hashOf(doc), m: modeOf(doc), t: ms, at: Date.now(), x: rec.x0, y: rec.y0, d: pack(moves) };
    let list = read().filter((e) => !(sameLevel(e, source, doc.id) && e.m === entry.m));
    list.push(entry);
    list.sort((a, b) => a.at - b.at);
    while (list.length > MAX_GHOSTS) list.shift(); // (the oldest kept goes first)
    res.kept = write(list);
    if (!res.kept) res.newBest = false; // (nothing was kept, so nothing was beaten for good)
    return res;
  }

  // ---------------------------------------------------------------- playing back
  function playback(entry) {
    if (!entry) return null;
    const moves = unpack(entry.d);
    if (!moves || moves.length < 2) return null;
    const n = moves.length / 2;
    const xs = new Float32Array(n + 1);
    const ys = new Float32Array(n + 1);
    xs[0] = entry.x;
    ys[0] = entry.y;
    for (let i = 0; i < n; i++) {
      xs[i + 1] = xs[i] + moves[2 * i];
      ys[i + 1] = ys[i] + moves[2 * i + 1];
    }
    // sample k is at k * STEP s; the last one (n) at the run's own time
    return { xs, ys, n, total: entry.t / 1000 };
  }
  const timeOf = (pb, k) => (k >= pb.n ? pb.total : k * STEP);
  /** Where the ghost is t s into the run: between its two samples, then still at the way out, fading. */
  function at(pb, t) {
    if (!pb) return null;
    if (t >= pb.total) {
      const a = 1 - (t - pb.total) / FADE;
      return a > 0 ? { x: pb.xs[pb.n], y: pb.ys[pb.n], a } : null;
    }
    const k = Math.min(pb.n - 1, Math.max(0, Math.floor(t / STEP)));
    const t0 = timeOf(pb, k);
    const t1 = timeOf(pb, k + 1);
    const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
    return { x: pb.xs[k] + (pb.xs[k + 1] - pb.xs[k]) * u, y: pb.ys[k] + (pb.ys[k + 1] - pb.ys[k]) * u, a: 1 };
  }

  return { GHOSTS_KEY, GHOST_KEY, STEP, MAX_SECONDS, MAX_GHOSTS, FADE, enabled, setEnabled, modeOf, hashOf, best, recorder, sample, offer, playback, at, forgetLevel, levelChanged, sweep, _: { read, pack, unpack } };
})();
