'use strict';

/**
 * THE SAVED LEVEL FORMAT (v15.0; schema version 2 since v15.1): a custom level as plain, versioned data, and back.
 * No UI, no DOM and no game state - the editor (js/editor.js), the store (js/levelstore.js) and the engine's loader
 * (buildCustomLevel in js/level.js) all go through it, and anything that supplies levels later (sharing, importing)
 * can too. The format is written down in docs/level-format.md; keep the two in step.
 *
 * A level is a plain object:
 *   format         'echo-maze-level' (so a file can say what it is)
 *   schemaVersion  2
 *   id             1-64 of A-Z a-z 0-9 _ -  (unique)
 *   title          1-48 characters
 *   authorName     0-32 characters - the creator name a shared level came with (v15.3), or ''
 *   createdAt      ISO 8601 date strings
 *   updatedAt
 *   size           { w, h } in 40 px tiles: w 5-61, h 5-45
 *   walls          h strings of w characters each: '#' a wall, '.' floor (anything else reads as floor)
 *   start          { x, y } - a tile - or null while it has not been placed yet
 *   exits          [{ x, y, locked }] - 0 to 8 ways out, one per tile; reaching ANY one finishes the level. A
 *                  locked one needs the key.                                                          (v15.1)
 *   exit           written for older versions of the game to read (the first open way out); never read when
 *                  `exits` is there. Schema version 1 had only this: it is migrated to `exits`.
 *   enemies        [{ kind, x, y }] - a tile each, at most 40, one per tile - plus `variant` for a kind that has
 *                  them. The kinds are MONSTER_TYPES in js/level.js, the game's own list.
 *   objects        [{ kind, x, y }] - things lying on the floor (v15.1): 'puddle' (at most 40), 'decoy' (at most
 *                  1), 'key' (at most 1), 'note' (at most 8, with `text` and `style` 'note' | 'recording').
 *   effects        [{ kind, shape, x, y, w, h, colour, intensity }] - at most 12 zones (v15.1): 'light' or 'glow',
 *                  a 'rect' or 'circle' (the ellipse inside the rect) of tiles, a colour and an intensity from
 *                  small fixed lists (EFFECTS).
 *   titleCard      0-80 characters: a line shown on the card at the start of the level ('' = none)  (v15.1)
 *   palette        '' (the player's own colours) or one of the game's palette ids                    (v15.1)
 *   difficulty     { rating, monsterSpeed, rippleRange, hearing } (v15.1): rating 'easy' | 'normal' | 'hard' |
 *                  'hardcore' | 'custom'; the three scales are 1 unless the rating is 'custom' (TUNING).
 *
 * normalise(anything) reads UNTRUSTED input - a stored string, a parsed object, anything at all - and never
 * throws. It clamps every number into range, drops what cannot be used (and says so in `notes`), and ignores
 * fields it does not know: but it keeps those aside (`extra` - unknown fields; `extraEnemies`, `extraObjects`,
 * `extraEffects` - kinds this version does not have) so that saving the level again cannot lose what a NEWER
 * version put there. Such a level is `foreign`: it can be played, with what this version understands, but the
 * editor will not open it. Text a player typed (titles, notes, the title card) is cleaned of anything that is not
 * plain, visible text.
 *
 * Adding a new kind of content later: give it a new top-level field, read it here with a default for when it is
 * missing - every level saved before it simply has none - and add it to KNOWN. Change the meaning of an existing
 * field: bump SCHEMA_VERSION and add a MIGRATIONS step from the old version.
 */
const EchoLevelFormat = (() => {
  const FORMAT = 'echo-maze-level';
  const SCHEMA_VERSION = 2;
  const LIMITS = {
    minW: 5,
    maxW: 61,
    minH: 5,
    maxH: 45,
    title: 48,
    author: 32,
    enemies: 40,
    id: 64,
    text: 400000,
    extra: 20000,
    exits: 8, // (v15.1)
    objects: 60, // all floor objects together
    effects: 12,
    noteText: 140, // a note's words
    titleCard: 80,
  };
  const DEFAULT_SIZE = { w: 31, h: 21 };
  const DEFAULT_TITLE = 'Untitled level';
  const WALL = '#';
  const FLOOR = '.';
  const KNOWN = ['format', 'schemaVersion', 'id', 'title', 'authorName', 'createdAt', 'updatedAt', 'size', 'walls', 'start', 'exits', 'enemies', 'objects', 'effects', 'titleCard', 'palette', 'difficulty'];
  const LEGACY = ['exit']; // read only to migrate a version 1 level; written as a mirror for older versions; never kept aside
  const UNSAFE = ['__proto__', 'constructor', 'prototype'];
  const RESERVED = ['extra', 'extraEnemies', 'extraObjects', 'extraEffects']; // what a read level carries in memory (see normalise); never stored
  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

  /** What can lie on the floor (v15.1), and how many of each a level may hold. */
  const OBJECTS = {
    puddle: { max: 40 },
    decoy: { max: 1 }, // the game's decoy is one per level: you can only ever carry one
    key: { max: 1 }, // one key opens every locked way out
    note: { max: 8 },
  };
  const NOTE_STYLES = ['note', 'recording'];
  /** The special-effect zones (v15.1): their colours and how strong they are. The first of each list is the default. */
  const EFFECTS = {
    light: { colours: ['warm', 'cold', 'pale'] },
    glow: { colours: ['red', 'crimson', 'ember'] },
  };
  const SHAPES = ['rect', 'circle'];
  const INTENSITIES = ['dim', 'medium', 'bright'];
  /**
   * A level's own difficulty (v15.1). The named ratings are the game's own difficulty modes, and a level rated one
   * plays exactly as that mode tunes it; 'custom' is Normal with the three scales below applied on top. Each scale
   * is clamped to its range here, so no level can ask for more.
   */
  const RATINGS = ['easy', 'normal', 'hard', 'hardcore', 'custom'];
  const DEFAULT_RATING = 'normal';
  const TUNING = {
    monsterSpeed: { min: 0.5, max: 1.5, step: 0.05, label: 'Monster speed' },
    rippleRange: { min: 0.6, max: 1.5, step: 0.05, label: 'Ripple range' },
    hearing: { min: 0.5, max: 1.5, step: 0.05, label: 'Monster hearing' },
  };
  const TUNING_KEYS = Object.keys(TUNING);
  const DEFAULT_PALETTES = ['default', 'protan', 'tritan', 'contrast'];

  /**
   * Upgrades from older versions, keyed by the version each one upgrades FROM (MIGRATIONS[1] turns a version 1
   * level into a version 2 one). Each takes the raw input and returns a new object; nothing is changed in place.
   */
  const MIGRATIONS = {
    // v15.0 -> v15.1: the single way out becomes a list of them (with nothing locked). Everything else new
    // simply starts empty, which is what reading a field that is not there gives anyway.
    1: (src) => {
      const out = { ...src };
      if (!Array.isArray(out.exits)) out.exits = out.exit && typeof out.exit === 'object' ? [{ x: out.exit.x, y: out.exit.y, locked: false }] : [];
      out.schemaVersion = 2;
      return out;
    },
  };

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
  /** A scale: a number in [lo, hi], to two decimal places; anything else is `fallback`. */
  function scale(v, lo, hi, fallback) {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    if (typeof n !== 'number' || !isFinite(n)) return fallback;
    return Math.round(Math.min(hi, Math.max(lo, n)) * 100) / 100;
  }
  /** Control characters, and the two that end a line without being one (0x2028, 0x2029). */
  const isControl = (n) => n < 32 || (n >= 127 && n < 160) || n === 0x2028 || n === 0x2029;
  /**
   * Characters that are not plain visible text but change how the text around them shows: the direction
   * overrides and isolates (0x202A-0x202E, 0x2066-0x2069, 0x200E/0x200F) and the zero-width ones (0x200B-0x200D,
   * 0x2060, 0xFEFF). Typed text loses them before it is ever shown.
   */
  const isInvisible = (n) => (n >= 0x200b && n <= 0x200f) || (n >= 0x202a && n <= 0x202e) || (n >= 0x2060 && n <= 0x2069) || n === 0xfeff;
  /** A line of text: control characters out, runs of spaces made one, trimmed, at most `max` characters. */
  function text(v, max, fallback) {
    if (typeof v !== 'string') return fallback;
    const plain = Array.from(v, (ch) => (isControl(ch.codePointAt(0)) ? ' ' : ch)).join('');
    const s = Array.from(plain.replace(/\s+/g, ' ').trim()).slice(0, max).join('').trim();
    return s || fallback;
  }
  /**
   * Words a player typed to be SHOWN in the game (a note, the title card): as `text`, and also without the
   * invisible direction/zero-width characters and without < and > - it is only ever put on screen as plain text,
   * but it should not even look like markup.
   */
  function shownText(v, max) {
    if (typeof v !== 'string') return '';
    const kept = Array.from(v, (ch) => {
      const n = ch.codePointAt(0);
      if (isControl(n)) return ' ';
      if (isInvisible(n) || ch === '<' || ch === '>') return '';
      return ch;
    }).join('');
    return text(kept, max, '');
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
  const pick = (v, list) => (typeof v === 'string' && list.includes(v) ? v : list[0]);
  /** The game's own palette ids (js/palette.js), or the four it has always had if that is not loaded. */
  const paletteIds = () => (typeof EchoPalette !== 'undefined' && EchoPalette.list ? EchoPalette.list().map((p) => p.id) : DEFAULT_PALETTES);

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

  // ------------------------------------------------------------ the parts added in v15.1
  /** The difficulty: a rating from RATINGS, and the scales - all 1 unless the rating is 'custom'. */
  function difficulty(v) {
    const d = isObj(v) ? v : {};
    const rating = typeof d.rating === 'string' && RATINGS.includes(d.rating) ? d.rating : DEFAULT_RATING;
    const out = { rating };
    for (const k of TUNING_KEYS) out[k] = rating === 'custom' ? scale(d[k], TUNING[k].min, TUNING[k].max, 1) : 1;
    return out;
  }
  const defaultDifficulty = () => difficulty(null);

  /** One effect zone, clamped inside a w x h level - or null. */
  function effect(v, w, h) {
    if (!isObj(v) || !EFFECTS[v.kind]) return null;
    const x = num(v.x, -1);
    const y = num(v.y, -1);
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    return {
      kind: v.kind,
      shape: pick(v.shape, SHAPES),
      x,
      y,
      w: clampInt(v.w, 1, w - x, 1),
      h: clampInt(v.h, 1, h - y, 1),
      colour: pick(v.colour, EFFECTS[v.kind].colours),
      intensity: typeof v.intensity === 'string' && INTENSITIES.includes(v.intensity) ? v.intensity : 'medium',
    };
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
    if (src.start && !start) notes.push('Its start was outside the level and was removed.');

    // the ways out (v15.1): a list, one per tile, at most LIMITS.exits. (A level of a version that wrote only `exit`
    // has been migrated above; this also reads one that has `exit` and no list, wherever it came from.)
    const exitsIn = Array.isArray(src.exits) ? src.exits : isObj(src.exit) ? [src.exit] : [];
    const exits = [];
    const exitTaken = new Set();
    let exitsDropped = 0;
    for (const e of exitsIn) {
      const p = point(e, w, h);
      if (!p || exitTaken.has(p.y * w + p.x) || exits.length >= LIMITS.exits) {
        exitsDropped++;
        continue;
      }
      exitTaken.add(p.y * w + p.x);
      exits.push({ x: p.x, y: p.y, locked: isObj(e) && e.locked === true });
    }
    if (exitsDropped) notes.push(`${exitsDropped} way${exitsDropped === 1 ? '' : 's'} out could not be placed and ${exitsDropped === 1 ? 'was' : 'were'} left out.`);

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

    // floor objects (v15.1): known kinds, each within its own limit, one per tile, at most LIMITS.objects in all
    const objects = [];
    const extraObjects = [];
    const objTaken = new Set();
    const counts = {};
    let objDropped = 0;
    let objEmpty = 0;
    for (const o of Array.isArray(src.objects) ? src.objects : []) {
      if (!isObj(o) || typeof o.kind !== 'string') {
        objDropped++;
        continue;
      }
      const def = OBJECTS[o.kind];
      if (!def) {
        const keep = extraObjects.length < LIMITS.objects ? clone(o) : undefined; // a kind from a newer version
        if (keep) extraObjects.push(keep);
        else objDropped++;
        continue;
      }
      const p = point(o, w, h);
      if (!p || objTaken.has(p.y * w + p.x) || (counts[o.kind] || 0) >= def.max || objects.length >= LIMITS.objects) {
        objDropped++;
        continue;
      }
      const out = { kind: o.kind, x: p.x, y: p.y };
      if (o.kind === 'note') {
        out.text = shownText(o.text, LIMITS.noteText);
        if (!out.text) {
          objEmpty++; // a note with nothing (left) written on it is not a note
          continue;
        }
        out.style = pick(o.style, NOTE_STYLES);
      }
      objTaken.add(p.y * w + p.x);
      counts[o.kind] = (counts[o.kind] || 0) + 1;
      objects.push(out);
    }
    if (objDropped) notes.push(`${objDropped} object${objDropped === 1 ? '' : 's'} could not be placed and ${objDropped === 1 ? 'was' : 'were'} left out.`);
    if (objEmpty) notes.push(`${objEmpty} note${objEmpty === 1 ? '' : 's'} had nothing written on ${objEmpty === 1 ? 'it' : 'them'} and ${objEmpty === 1 ? 'was' : 'were'} left out.`);

    // effect zones (v15.1)
    const effects = [];
    const extraEffects = [];
    let fxDropped = 0;
    for (const f of Array.isArray(src.effects) ? src.effects : []) {
      if (isObj(f) && typeof f.kind === 'string' && !EFFECTS[f.kind]) {
        const keep = extraEffects.length < LIMITS.effects ? clone(f) : undefined; // a kind from a newer version
        if (keep) extraEffects.push(keep);
        else fxDropped++;
        continue;
      }
      const z = effects.length < LIMITS.effects ? effect(f, w, h) : null;
      if (z) effects.push(z);
      else fxDropped++;
    }
    if (fxDropped) notes.push(`${fxDropped} effect${fxDropped === 1 ? '' : 's'} could not be placed and ${fxDropped === 1 ? 'was' : 'were'} left out.`);

    const palettes = paletteIds();
    const palette = typeof src.palette === 'string' && palettes.includes(src.palette) ? src.palette : '';

    // fields this version does not know: kept aside, never read. (A level that has been read once already carries
    // what was kept aside in `extra` / `extraEnemies` / ... - those names are this module's own, never stored - and
    // it is kept aside again, not mistaken for something new.)
    const extra = {};
    const aside = (k, val) => {
      if (KNOWN.includes(k) || LEGACY.includes(k) || UNSAFE.includes(k) || RESERVED.includes(k)) return;
      const v = clone(val);
      if (v !== undefined) extra[k] = v;
    };
    for (const k of Object.keys(src)) aside(k, src[k]);
    if (isObj(src.extra)) for (const k of Object.keys(src.extra)) aside(k, src.extra[k]);
    const keepAside = (list, into, max) => {
      if (!Array.isArray(list)) return;
      for (const m of list) {
        const keep = isObj(m) && typeof m.kind === 'string' && into.length < max ? clone(m) : undefined;
        if (keep) into.push(keep);
      }
    };
    keepAside(src.extraEnemies, extraEnemies, LIMITS.enemies);
    keepAside(src.extraObjects, extraObjects, LIMITS.objects);
    keepAside(src.extraEffects, extraEffects, LIMITS.effects);

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
      exits,
      enemies,
      objects,
      effects,
      titleCard: shownText(src.titleCard, LIMITS.titleCard),
      palette,
      difficulty: difficulty(src.difficulty),
      extra, // (not part of the format: what was kept aside, folded back in by toStorable)
      extraEnemies,
      extraObjects,
      extraEffects,
    };
    const foreign = newer || Object.keys(extra).length > 0 || extraEnemies.length > 0 || extraObjects.length > 0 || extraEffects.length > 0;
    return { doc, notes, foreign, newer };
  }

  // ------------------------------------------------------------ writing
  /** The way out an older version of the game (schema 1, which knew only one) is told about: the first open one. */
  function legacyExit(exits) {
    const e = exits.find((x) => !x.locked) || exits[0];
    return e ? { x: e.x, y: e.y } : null;
  }

  /** The plain object that is stored: the known fields in order, then whatever was kept aside. */
  function toStorable(doc) {
    const exits = (doc.exits || []).map((e) => ({ x: e.x, y: e.y, locked: !!e.locked }));
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
      exit: legacyExit(exits), // (for older versions of the game only: see the top of this file)
      exits,
      enemies: doc.enemies.map((e) => (e.variant ? { kind: e.kind, variant: e.variant, x: e.x, y: e.y } : { kind: e.kind, x: e.x, y: e.y })),
      objects: (doc.objects || []).map((o) => (o.kind === 'note' ? { kind: o.kind, x: o.x, y: o.y, text: o.text, style: o.style || 'note' } : { kind: o.kind, x: o.x, y: o.y })),
      effects: (doc.effects || []).map((f) => ({ kind: f.kind, shape: f.shape, x: f.x, y: f.y, w: f.w, h: f.h, colour: f.colour, intensity: f.intensity })),
      titleCard: doc.titleCard || '',
      palette: doc.palette || '',
      difficulty: { ...(doc.difficulty || defaultDifficulty()) },
    };
    if (doc.extraEnemies) for (const e of doc.extraEnemies) out.enemies.push(clone(e));
    if (doc.extraObjects) for (const o of doc.extraObjects) out.objects.push(clone(o));
    if (doc.extraEffects) for (const f of doc.extraEffects) out.effects.push(clone(f));
    if (doc.extra) for (const k of Object.keys(doc.extra)) if (!KNOWN.includes(k) && !LEGACY.includes(k) && !UNSAFE.includes(k) && !RESERVED.includes(k)) out[k] = clone(doc.extra[k]);
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
      exits: [],
      enemies: [],
      objects: [],
      effects: [],
      titleCard: '',
      palette: '',
      difficulty: defaultDifficulty(),
      extra: {},
      extraEnemies: [],
      extraObjects: [],
      extraEffects: [],
    };
  }

  /** How a rating is written on screen: the game's own name for the mode, or "Custom". */
  function ratingLabel(rating) {
    if (rating === 'custom') return 'Custom';
    if (typeof MODES !== 'undefined' && MODES[rating]) return MODES[rating].label;
    return typeof rating === 'string' && rating ? rating.charAt(0).toUpperCase() + rating.slice(1) : 'Normal';
  }

  return {
    FORMAT,
    SCHEMA_VERSION,
    LIMITS,
    DEFAULT_SIZE,
    DEFAULT_TITLE,
    MIGRATIONS,
    OBJECTS,
    NOTE_STYLES,
    EFFECTS,
    SHAPES,
    INTENSITIES,
    RATINGS,
    TUNING,
    normalise,
    toStorable,
    serialise,
    copy,
    blank,
    newId,
    wallGrid,
    encodeWalls,
    difficulty,
    ratingLabel,
    paletteIds,
    cleanTitle: (s) => text(s, LIMITS.title, DEFAULT_TITLE),
    cleanNote: (s) => shownText(s, LIMITS.noteText),
    cleanCard: (s) => shownText(s, LIMITS.titleCard),
    /** (v15.3) Any shown words from outside (a shared code's title, creator name, folder name): plain, visible text, no < or >. */
    cleanShown: (s, max) => shownText(s, max),
    validId: (id) => typeof id === 'string' && ID_RE.test(id),
  };
})();
