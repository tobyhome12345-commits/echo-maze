'use strict';

/**
 * THE SAVED LEVEL FORMAT (v15.0): a custom level as plain, versioned data, and back. No UI, no DOM and no game
 * state - the editor (js/editor.js), the store (js/levelstore.js) and the engine's loader (buildCustomLevel in
 * js/level.js) all go through it, and anything that supplies levels later (sharing, importing) can too. The
 * format is written down in docs/level-format.md; keep the two in step.
 *
 * A level is a plain object:
 *   format         'echo-maze-level' (so a file can say what it is)
 *   schemaVersion  1
 *   id             1-64 of A-Z a-z 0-9 _ -  (unique)
 *   title          1-48 characters
 *   authorName     0-32 characters - always '' for now: levels are private
 *   createdAt      ISO 8601 date strings
 *   updatedAt
 *   size           { w, h } in 40 px tiles: w 5-61, h 5-45
 *   walls          h strings of w characters each: '#' a wall, '.' floor (anything else reads as floor)
 *   start, exit    { x, y } - a tile - or null while it has not been placed yet
 *   enemies        [{ kind, x, y }] - a tile each, at most 40, one per tile - plus `variant` for a kind that has
 *                  them. The kinds are MONSTER_TYPES in js/level.js, the game's own list.
 *
 * normalise(anything) reads UNTRUSTED input - a stored string, a parsed object, anything at all - and never
 * throws. It clamps every number into range, drops what cannot be used (and says so in `notes`), and ignores
 * fields it does not know: but it keeps those aside (`extra` - unknown fields; `extraEnemies` - kinds or variants
 * this version does not have) so that saving the level again cannot lose what a NEWER version put there. Such a
 * level is `foreign`: it can be played, with what this version understands, but the editor will not open it.
 *
 * Adding a new kind of content later (objects, effects, ...): give it a new top-level field, read it here with a
 * default for when it is missing - every level saved before it simply has none - and add it to KNOWN. Change the
 * meaning of an existing field: bump SCHEMA_VERSION and add a MIGRATIONS step from the old version.
 */
const EchoLevelFormat = (() => {
  const FORMAT = 'echo-maze-level';
  const SCHEMA_VERSION = 1;
  const LIMITS = { minW: 5, maxW: 61, minH: 5, maxH: 45, title: 48, author: 32, enemies: 40, id: 64, text: 400000, extra: 20000 };
  const DEFAULT_SIZE = { w: 31, h: 21 };
  const DEFAULT_TITLE = 'Untitled level';
  const WALL = '#';
  const FLOOR = '.';
  const KNOWN = ['format', 'schemaVersion', 'id', 'title', 'authorName', 'createdAt', 'updatedAt', 'size', 'walls', 'start', 'exit', 'enemies'];
  const UNSAFE = ['__proto__', 'constructor', 'prototype'];
  const RESERVED = ['extra', 'extraEnemies']; // what a read level carries in memory (see normalise); never stored
  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  /**
   * Upgrades from older versions, keyed by the version each one upgrades FROM (MIGRATIONS[1] turns a version 1
   * level into a version 2 one). There are none: version 1 is the first.
   */
  const MIGRATIONS = {};

  // ------------------------------------------------------------ small readers (none of them throws)
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  function num(v, fallback) {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    return typeof n === 'number' && isFinite(n) ? Math.round(n) : fallback;
  }
  function clampInt(v, lo, hi, fallback) {
    const n = num(v, fallback);
    return n < lo ? lo : n > hi ? hi : n;
  }
  /** Control characters, and the two that end a line without being one (0x2028, 0x2029). */
  const isControl = (n) => n < 32 || (n >= 127 && n < 160) || n === 0x2028 || n === 0x2029;
  /** A line of text: control characters out, runs of spaces made one, trimmed, at most `max` characters. */
  function text(v, max, fallback) {
    if (typeof v !== 'string') return fallback;
    const plain = Array.from(v, (ch) => (isControl(ch.charCodeAt(0)) ? ' ' : ch)).join('');
    const s = Array.from(plain.replace(/\s+/g, ' ').trim()).slice(0, max).join('').trim();
    return s || fallback;
  }
  function date(v) {
    if (typeof v !== 'string' && typeof v !== 'number') return null;
    const d = new Date(v);
    const t = d.getTime();
    // (between 2000 and 2200: anything else is not a date this game wrote)
    return isFinite(t) && t > 946684800000 && t < 7258118400000 ? d.toISOString() : null;
  }
  /** A deep copy of plain JSON data, or undefined if it is not plain data or is unreasonably big. */
  function clone(v) {
    try {
      const s = JSON.stringify(v);
      if (typeof s !== 'string' || s.length > LIMITS.extra) return undefined;
      return JSON.parse(s);
    } catch (e) {
      return undefined;
    }
  }
  function point(v, w, h) {
    if (!isObj(v)) return null;
    const x = num(v.x, -1);
    const y = num(v.y, -1);
    return x >= 0 && y >= 0 && x < w && y < h ? { x, y } : null;
  }

  /** A new id: the time, and a little randomness from the browser's own generator (never the game's). */
  function newId() {
    let r = '';
    try {
      const a = new Uint32Array(2);
      crypto.getRandomValues(a);
      r = a[0].toString(36) + a[1].toString(36);
    } catch (e) {
      r = Math.floor(Math.random() * 0x7fffffff).toString(36) + Math.floor(Math.random() * 0x7fffffff).toString(36);
    }
    return `lv-${Date.now().toString(36)}-${r.slice(0, 10)}`;
  }

  // ------------------------------------------------------------ walls
  /** The wall rows of a (normalised) level as a grid: 1 = wall, 0 = floor, row by row. */
  function wallGrid(doc) {
    const w = doc.size.w;
    const h = doc.size.h;
    const g = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = doc.walls[y] || '';
      for (let x = 0; x < w; x++) g[y * w + x] = row.charAt(x) === WALL ? 1 : 0;
    }
    return g;
  }
  /** ...and a grid back into rows. */
  function encodeWalls(grid, w, h) {
    const rows = [];
    for (let y = 0; y < h; y++) {
      let s = '';
      for (let x = 0; x < w; x++) s += grid[y * w + x] ? WALL : FLOOR;
      rows.push(s);
    }
    return rows;
  }

  // ------------------------------------------------------------ reading
  const fail = (error) => ({ doc: null, error, notes: [], foreign: false, newer: false });

  /**
   * Read anything at all as a level. -> { doc, notes, foreign, newer } or { doc: null, error }.
   * `doc` is always complete and in range: every field present, every number clamped, every tile in bounds.
   */
  function normalise(input) {
    try {
      return read(input);
    } catch (e) {
      return fail('This level could not be read.');
    }
  }

  function read(input) {
    let src = input;
    if (typeof src === 'string') {
      if (src.length > LIMITS.text) return fail('This is far too big to be a level.');
      try {
        src = JSON.parse(src);
      } catch (e) {
        return fail('This level is damaged and could not be read.');
      }
    }
    if (!isObj(src)) return fail('This is not a level.');
    if (src.format !== undefined && src.format !== FORMAT) return fail('This is not an Echo Maze level.');
    const notes = [];
    let version = num(src.schemaVersion, 0);
    if (version < 1) {
      notes.push('It did not say which version it is, so it was read as version 1.');
      version = 1;
    }
    for (let v = version; v < SCHEMA_VERSION; v++) if (MIGRATIONS[v]) src = MIGRATIONS[v](src);
    const newer = version > SCHEMA_VERSION;

    // the size: from `size`, or failing that from the walls themselves
    const rowsIn = Array.isArray(src.walls) ? src.walls : null;
    const sz = isObj(src.size) ? src.size : {};
    const w = clampInt(sz.w, LIMITS.minW, LIMITS.maxW, rowsIn && typeof rowsIn[0] === 'string' ? rowsIn[0].length : DEFAULT_SIZE.w);
    const h = clampInt(sz.h, LIMITS.minH, LIMITS.maxH, rowsIn ? rowsIn.length : DEFAULT_SIZE.h);
    if (!isObj(src.size) || num(sz.w, -1) !== w || num(sz.h, -1) !== h) notes.push(`Its size was set to ${w} x ${h}.`);

    // the walls: exactly h rows of exactly w tiles; a missing tile is floor
    const grid = new Uint8Array(w * h);
    let repaired = !rowsIn || rowsIn.length !== h;
    for (let y = 0; y < h; y++) {
      const row = rowsIn && typeof rowsIn[y] === 'string' ? rowsIn[y] : '';
      if (rowsIn && (typeof rowsIn[y] !== 'string' || row.length !== w)) repaired = true;
      for (let x = 0; x < w; x++) {
        const ch = row.charAt(x);
        if (ch === WALL) grid[y * w + x] = 1;
        else if (ch !== FLOOR) repaired = true;
      }
    }
    if (repaired) notes.push('Some of its walls were missing or unreadable and were filled in as floor.');

    const start = point(src.start, w, h);
    const exit = point(src.exit, w, h);
    if (src.start && !start) notes.push('Its start was outside the level and was removed.');
    if (src.exit && !exit) notes.push('Its exit was outside the level and was removed.');

    // the monsters: kinds from the game's own list (MONSTER_TYPES); one per tile; at most LIMITS.enemies
    const enemies = [];
    const extraEnemies = [];
    const taken = new Set();
    let dropped = 0;
    for (const m of Array.isArray(src.enemies) ? src.enemies : []) {
      if (!isObj(m) || typeof m.kind !== 'string') {
        dropped++;
        continue;
      }
      const type = monsterType(m.kind);
      let variant = null;
      let known = !!type;
      if (type && type.variants) {
        const ids = type.variants().map((v) => v.id);
        if (typeof m.variant === 'string') {
          if (ids.includes(m.variant)) variant = m.variant;
          else known = false; // a variant from a newer version
        } else {
          variant = ids[0]; // none given: the first one
          notes.push(`A monster with no variant was read as ${ids[0]}.`);
        }
      }
      if (!known) {
        // something a newer version of the game placed: kept aside, exactly as it was, so saving here cannot lose it
        const keep = extraEnemies.length < LIMITS.enemies ? clone(m) : undefined;
        if (keep) extraEnemies.push(keep);
        else dropped++;
        continue;
      }
      const x = num(m.x, -1);
      const y = num(m.y, -1);
      if (x < 0 || y < 0 || x >= w || y >= h || taken.has(y * w + x) || enemies.length >= LIMITS.enemies) {
        dropped++;
        continue;
      }
      taken.add(y * w + x);
      const e = { kind: type.kind, x, y };
      if (variant) e.variant = variant;
      enemies.push(e);
    }
    if (dropped) notes.push(`${dropped} monster${dropped === 1 ? '' : 's'} could not be placed and ${dropped === 1 ? 'was' : 'were'} left out.`);

    // fields this version does not know: kept aside, never read. (A level that has been read once already carries
    // what was kept aside in `extra` / `extraEnemies` - those two names are this module's own, never stored - and it
    // is kept aside again, not mistaken for something new.)
    const extra = {};
    const aside = (k, val) => {
      if (KNOWN.includes(k) || UNSAFE.includes(k) || RESERVED.includes(k)) return;
      const v = clone(val);
      if (v !== undefined) extra[k] = v;
    };
    for (const k of Object.keys(src)) aside(k, src[k]);
    if (isObj(src.extra)) for (const k of Object.keys(src.extra)) aside(k, src.extra[k]);
    if (Array.isArray(src.extraEnemies)) {
      for (const m of src.extraEnemies) {
        const keep = isObj(m) && typeof m.kind === 'string' && extraEnemies.length < LIMITS.enemies ? clone(m) : undefined;
        if (keep) extraEnemies.push(keep);
      }
    }

    let id = typeof src.id === 'string' && ID_RE.test(src.id) ? src.id : null;
    if (!id) {
      id = newId();
      notes.push('It had no usable id, so it was given a new one.');
    }
    const updatedAt = date(src.updatedAt) || new Date().toISOString();
    const doc = {
      format: FORMAT,
      schemaVersion: newer ? version : SCHEMA_VERSION,
      id,
      title: text(src.title, LIMITS.title, DEFAULT_TITLE),
      authorName: text(src.authorName, LIMITS.author, ''),
      createdAt: date(src.createdAt) || updatedAt,
      updatedAt,
      size: { w, h },
      walls: encodeWalls(grid, w, h),
      start,
      exit,
      enemies,
      extra, // (not part of the format: what was kept aside, folded back in by toStorable)
      extraEnemies,
    };
    const foreign = newer || Object.keys(extra).length > 0 || extraEnemies.length > 0;
    return { doc, notes, foreign, newer };
  }

  // ------------------------------------------------------------ writing
  /** The plain object that is stored: the known fields in order, then whatever was kept aside. */
  function toStorable(doc) {
    const out = {
      format: FORMAT,
      schemaVersion: doc.schemaVersion || SCHEMA_VERSION,
      id: doc.id,
      title: doc.title,
      authorName: doc.authorName || '',
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      size: { w: doc.size.w, h: doc.size.h },
      walls: doc.walls.slice(),
      start: doc.start ? { x: doc.start.x, y: doc.start.y } : null,
      exit: doc.exit ? { x: doc.exit.x, y: doc.exit.y } : null,
      enemies: doc.enemies.map((e) => (e.variant ? { kind: e.kind, variant: e.variant, x: e.x, y: e.y } : { kind: e.kind, x: e.x, y: e.y })),
    };
    if (doc.extraEnemies) for (const e of doc.extraEnemies) out.enemies.push(clone(e));
    if (doc.extra) for (const k of Object.keys(doc.extra)) if (!KNOWN.includes(k) && !UNSAFE.includes(k) && !RESERVED.includes(k)) out[k] = clone(doc.extra[k]);
    return out;
  }

  const serialise = (doc) => JSON.stringify(toStorable(doc));
  /** A separate copy of a level that nothing else holds (what a test play is given). */
  const copy = (doc) => read(toStorable(doc)).doc;

  /** A new, empty level: a ring of wall around open floor, nothing placed. */
  function blank(opts = {}) {
    const w = clampInt(opts.w, LIMITS.minW, LIMITS.maxW, DEFAULT_SIZE.w);
    const h = clampInt(opts.h, LIMITS.minH, LIMITS.maxH, DEFAULT_SIZE.h);
    const grid = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) grid[y * w + x] = 1;
    const now = new Date().toISOString();
    return {
      format: FORMAT,
      schemaVersion: SCHEMA_VERSION,
      id: newId(),
      title: text(opts.title, LIMITS.title, DEFAULT_TITLE),
      authorName: '',
      createdAt: now,
      updatedAt: now,
      size: { w, h },
      walls: encodeWalls(grid, w, h),
      start: null,
      exit: null,
      enemies: [],
      extra: {},
      extraEnemies: [],
    };
  }

  return {
    FORMAT,
    SCHEMA_VERSION,
    LIMITS,
    DEFAULT_SIZE,
    DEFAULT_TITLE,
    MIGRATIONS,
    normalise,
    toStorable,
    serialise,
    copy,
    blank,
    newId,
    wallGrid,
    encodeWalls,
    cleanTitle: (s) => text(s, LIMITS.title, DEFAULT_TITLE),
    validId: (id) => typeof id === 'string' && ID_RE.test(id),
  };
})();
