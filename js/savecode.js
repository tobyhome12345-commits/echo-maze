'use strict';

/**
 * SAVE CODES (v22.0): the player's save as one line of text - to keep as a backup, to carry to another device, or to
 * send to a friend - and back again. Built on the level share codes' own machinery (js/sharecode.js: the packing,
 * base 62, the CRC-32 check and the compression), with its own kind letter:
 *
 *   ECHO1S<payload><check>      a save         (ECHO1L a level, ECHO1F a folder - each refuses the others, by name)
 *
 * WHAT IS IN ONE - a WHITELIST: nothing goes in unless it is listed in RECORDS below, and nothing comes out unless it
 * is listed there too.
 *   progress (always): the best level reached in each mode (Hardcore's is its high score), the cutscenes seen, the lore
 *     fragments found, the tutorial done, the medals, Endless's best depths, the cosmetics worn and seen, the daylight
 *     interface choice, the What's new notes seen, the level editor unlocked, the bonus levels ticked, the stats;
 *   settings (only if asked: "Include my settings"): the difficulty picked, Calm mode, Visual cues, touch controls,
 *     the keys, the volumes, the palette, the timer, the creator name;
 *   levels (only if asked: "Also include my levels and folders"): My Levels, each packed as a level code packs it
 *     (EchoShare), and the folders by name.
 * Each record is a tag, a length and its bytes. A tag this version does not know means the code came from a newer
 * version: it is refused whole ("loads nothing"), never half read.
 *
 * READING ONE treats it as a stranger's data, exactly as the level codes do: the prefix, the format version, the
 * check, the size (LIMITS: the code's length, what it may unpack to, how many levels), and then EVERY value - levels
 * clamped to the real campaign, only known cutscene / fragment / bonus / cosmetic / action / palette ids kept, anything
 * else dropped - and the levels through EchoLevelFormat.normalise and EchoLevelCheck. Nothing is ever evaluated.
 *
 * LOADING ONE: Merge (the best of both - the highest level in each mode, every scene and fragment either side has,
 * the better medals, the higher bests) or Replace (the code's sections instead of this device's). Before anything is
 * written a snapshot of every key the load will touch is kept (UNDO_KEY) for "Undo last load", until the next load.
 *
 * WHICH SAVE: every key is PREFIX + a name. The test copy's builder (tools/update-test-copy.ps1) turns 'echomaze.' into
 * 'echomaze.test.' in every file, this one too - so the finished test copy reads and writes only its own slot, and the
 * real game only its own. Levels and folders go through EchoLevelStore, which keeps its own keys the same way.
 *
 * No DOM here and no game state: `ctx` (from js/game.js) says what the game knows - its levels, scenes, fragments,
 * modes... - so the clamps follow the game. Nothing throws: every result is { ok: true, ... } or { ok: false, code, error }.
 *
 *   gather(ctx, { settings, levels })      -> a save object, read from this device's storage (and cleaned like a code)
 *   encode(save)                           -> Promise<{ ok, code, chars, long } | { ok: false, code, error }>
 *   decode(text, ctx)                      -> Promise<{ ok, save } | { ok: false, code, error }>
 *   preview(save, mine, ctx)               -> { lines: [string], ahead: boolean }
 *   merge(mine, theirs, ctx)               -> a save object: the best of both
 *   load(save, ctx, { replace })           -> { ok, undo: boolean } | { ok: false, error }   (writes storage)
 *   canUndo() / undo()                     -> boolean / { ok } | { ok: false, error }
 *   clean(text)                            -> the save code inside whatever was pasted, or ''
 */
const EchoSave = (() => {
  const PREFIX = 'echomaze.'; // (the test copy's builder makes this 'echomaze.test.', like every save key in the game)
  const K = (name) => PREFIX + name;
  const UNDO_KEY = K('saveundo');
  const HEAD = 'ECHO1S';
  const FORMAT = 1; // the save format inside the code (the first number of the payload)
  const LIMITS = {
    codeChars: 1500000, // a save with many big levels is long - the file carries it
    inflated: 8388608, // bytes a save code may unpack to
    levels: 500,
    folders: 50,
    warnChars: 2000, // longer than this: the screen suggests the file
    fileBytes: 4000000, // the most "Load from file" reads
  };

  // ------------------------------------------------------------------ the frozen lists (only ever add to the END)
  const MODES = ['easy', 'normal', 'hard', 'hardcore'];
  const SCENES = ['intro', 'scent', 'mimic', 'decoy', 'stalker', 'muffler', 'singer', 'keeper', 'alarm', 'listens', 'kept'];
  const FRAGMENTS = ['f01', 'f02', 'f03', 'f04', 'f05', 'f06', 'f07', 'f08', 'f09', 'f10', 'f11', 'f12', 's13', 's14', 's15', 's16', 'f13'];
  const STAT_FIELDS = ['cleared', 'deaths', 'ripples', 'crouches', 'decoys', 'marked', 'nearMisses', 'playTime', 'distance'];
  const DEATHS = ['echo', 'scent', 'mimic', 'stalker', 'muffler', 'singer', 'warden', 'void'];
  const VOLUME_BUSES = ['master', 'effects', 'ambience'];
  /** The records, by tag - FROZEN: a tag is never reused or renumbered. `part`: which section it belongs to. */
  const RECORDS = {
    1: 'progress', 2: 'seen', 3: 'lore', 4: 'tutorial', 5: 'medals', 6: 'endless', 7: 'cosmetics', 8: 'lightui', 9: 'whatsnew', 10: 'editor', 11: 'bonus', 12: 'stats',
    20: 'mode', 21: 'calm', 22: 'cues', 23: 'touch', 24: 'keys', 25: 'volumes', 26: 'palette', 27: 'timer', 28: 'creator',
    40: 'levels',
  };
  const TAG = {};
  for (const t of Object.keys(RECORDS)) TAG[RECORDS[t]] = +t;
  const PROGRESS = ['progress', 'seen', 'lore', 'tutorial', 'medals', 'endless', 'cosmetics', 'lightui', 'whatsnew', 'editor', 'bonus', 'stats'];
  const SETTINGS = ['mode', 'calm', 'cues', 'touch', 'keys', 'volumes', 'palette', 'timer', 'creator'];
  /** The storage key each record lives in (a name after PREFIX). */
  const KEY = {
    progress: 'progress', seen: 'seen', lore: 'lore', tutorial: 'tutorial', medals: 'medals', endless: 'endless', cosmetics: 'cosmetics', lightui: 'lightui', whatsnew: 'whatsnew', editor: 'editor', bonus: 'bonus', stats: 'stats',
    mode: 'mode', calm: 'calm', cues: 'visualcues', touch: 'touch', keys: 'keys', volumes: 'volumes', palette: 'palette', timer: 'showtimer', creator: 'creator',
  };
  const LEGACY_BEST = 'best'; // (before difficulty modes: Normal's best level - js/game.js loadProgress)

  const ERR = {
    empty: 'Paste a save code first.',
    notCode: "That doesn't look like an Echo Maze save code. A save code is one long line that starts with ECHO1S.",
    level: "That's a level code, not a save code. Load it in My Levels (Level Editor -> Enter code).",
    folder: "That's a folder code, not a save code. Load it in My Levels (Level Editor -> Enter code).",
    damaged: "That code is damaged or incomplete. Check that you copied all of it - it is one long line that starts with ECHO1S. Nothing was changed.",
    newer: 'That save code was made in a newer version of Echo Maze, so this version cannot read all of it. Update the game to load it. Nothing was changed.',
    tooBig: 'That is too big to be an Echo Maze save code, so it was not read. Nothing was changed.',
    storage: "Your browser's storage is full or turned off, so the save could not be changed. Nothing was changed.",
  };
  const fail = (code, error) => ({ ok: false, code, error: error || ERR[code] || ERR.damaged });
  const X = () => EchoShare._;
  const bad = (why) => new (X().Bad)(why);

  // ------------------------------------------------------------------ storage (every access in a try)
  const ls = {
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
        return false;
      }
    },
    remove(k) {
      try {
        localStorage.removeItem(k);
        return true;
      } catch (e) {
        return false;
      }
    },
    json(k) {
      try {
        return JSON.parse(localStorage.getItem(k));
      } catch (e) {
        return null;
      }
    },
  };

  // ------------------------------------------------------------------ cleaning (a code's values, or this device's)
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, lo, hi) => {
    const n = Math.floor(+v);
    return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null;
  };
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const VERSION_RE = /^v(\d{1,3})\.(\d{1,3})$/;
  const versionNum = (v) => {
    const m = VERSION_RE.exec(String(v || ''));
    return m ? +m[1] * 1000 + +m[2] : -1;
  };
  const CODE_RE = /^[A-Za-z0-9]{1,24}$/;

  /** A plain save object (from a code or from storage) -> only what this game knows, every number in range. */
  function cleanSave(raw, ctx) {
    const s = { progress: {}, seen: [], lore: [], tutorial: false, medals: {}, endless: {}, cosmetics: null, lightui: null, whatsnew: null, editor: false, bonus: [], stats: null, settings: null, levels: null };
    if (!isObj(raw)) return s;
    const top = ctx.campaignLevels + 1;
    if (isObj(raw.progress)) for (const m of ctx.modes) if (own(raw.progress, m)) {
      const v = num(raw.progress[m], 1, top);
      if (v && v > 1) s.progress[m] = v;
    }
    const keep = (list, known) => (Array.isArray(list) ? known.filter((id) => list.includes(id)) : []);
    s.seen = keep(raw.seen, ctx.scenes);
    s.lore = keep(raw.lore, ctx.fragments);
    s.tutorial = raw.tutorial === true;
    s.editor = raw.editor === true;
    s.bonus = keep(raw.bonus, ctx.bonusIds);
    if (isObj(raw.medals)) for (const m of ctx.modes) if (isObj(raw.medals[m])) {
      const rows = {};
      for (let n = 1; n <= ctx.medalLevels; n++) {
        const r = raw.medals[m][n];
        if (!isObj(r)) continue;
        const row = { time: num(r.time, 0, 3) || 0, ripples: num(r.ripples, 0, 3) || 0, flawless: r.flawless ? 1 : 0 };
        const bt = +r.bestTime;
        if (isFinite(bt) && bt >= 0) row.bestTime = Math.min(360000, Math.round(bt * 10) / 10);
        const br = num(r.bestRipples, 0, 100000);
        if (br !== null && r.bestRipples != null) row.bestRipples = br;
        if (row.time || row.ripples || row.flawless || row.bestTime != null) rows[n] = row;
      }
      if (Object.keys(rows).length) s.medals[m] = rows;
    }
    if (isObj(raw.endless)) for (const m of ctx.modes) {
      const v = num(raw.endless[m], 0, 99999);
      if (v) s.endless[m] = v;
    }
    if (isObj(raw.cosmetics)) {
      const c = raw.cosmetics;
      const pick = (kind, v) => (ctx.cosmetics[kind].includes(v) ? v : ctx.cosmetics[kind][0]);
      const seen = Array.isArray(c.seen) ? c.seen.filter((x) => typeof x === 'string' && /^(color|shape|marker):[a-z]+$/.test(x) && ctx.cosmetics[x.split(':')[0]].includes(x.split(':')[1])) : [];
      s.cosmetics = { color: pick('color', c.color), shape: pick('shape', c.shape), marker: pick('marker', c.marker), seen: [...new Set(seen)] };
    }
    if (raw.lightui === '1' || raw.lightui === '0') s.lightui = raw.lightui;
    if (VERSION_RE.test(String(raw.whatsnew || ''))) s.whatsnew = String(raw.whatsnew);
    if (isObj(raw.stats)) {
      const st = { deathsBy: {}, byMode: {} };
      for (const f of STAT_FIELDS) st[f] = num(raw.stats[f], 0, 1e12) || 0;
      for (const k of DEATHS) st.deathsBy[k] = (isObj(raw.stats.deathsBy) && num(raw.stats.deathsBy[k], 0, 1e12)) || 0;
      for (const m of MODES) {
        const row = isObj(raw.stats.byMode) && isObj(raw.stats.byMode[m]) ? raw.stats.byMode[m] : {};
        st.byMode[m] = { cleared: num(row.cleared, 0, 1e12) || 0, deaths: num(row.deaths, 0, 1e12) || 0 };
      }
      s.stats = st;
    }
    if (isObj(raw.settings)) {
      const r = raw.settings;
      const o = {};
      if (ctx.modes.includes(r.mode)) o.mode = r.mode;
      for (const k of ['calm', 'cues', 'timer']) if (typeof r[k] === 'boolean') o[k] = r[k];
      if (r.touch === '1' || r.touch === '0' || r.touch === null) o.touch = r.touch;
      if (isObj(r.keys)) {
        const keys = {};
        for (const a of ctx.actions) {
          if (!Array.isArray(r.keys[a])) continue;
          const codes = [...new Set(r.keys[a].filter((c) => typeof c === 'string' && CODE_RE.test(c) && c !== 'Escape' && c !== 'Enter'))].slice(0, 2);
          keys[a] = codes;
        }
        if (Object.keys(keys).length) o.keys = keys;
      }
      if (isObj(r.volumes)) {
        const v = {};
        for (const b of VOLUME_BUSES) {
          const x = +r.volumes[b];
          if (isFinite(x)) v[b] = Math.max(0, Math.min(1, Math.round(x * 100) / 100));
        }
        if (Object.keys(v).length) o.volumes = v;
      }
      if (ctx.palettes.includes(r.palette)) o.palette = r.palette;
      if (typeof r.creator === 'string') o.creator = EchoLevelFormat.cleanShown(r.creator, EchoLevelFormat.LIMITS.author);
      s.settings = o;
    }
    if (isObj(raw.levels) && Array.isArray(raw.levels.levels)) {
      const docs = [];
      for (const lv of raw.levels.levels.slice(0, LIMITS.levels)) docs.push(lv);
      const folders = [];
      if (Array.isArray(raw.levels.folders)) {
        for (const f of raw.levels.folders.slice(0, LIMITS.folders)) {
          if (!isObj(f)) continue;
          const name = EchoLevelStore.cleanFolderName(f.name);
          if (!name) continue;
          const levels = Array.isArray(f.levels) ? [...new Set(f.levels.filter((i) => Number.isInteger(i) && i >= 0 && i < docs.length))] : [];
          folders.push({ name, levels });
        }
      }
      s.levels = { levels: docs, folders };
    }
    return s;
  }

  // ------------------------------------------------------------------ this device's save
  function gatherLevels() {
    const docs = [];
    const where = {}; // folder id -> [index]
    for (const sum of EchoLevelStore.list()) {
      const got = EchoLevelStore.get(sum.id);
      if (!got || !got.doc || got.foreign) continue; // (a damaged level, or one from a newer version, stays here untouched)
      if (docs.length >= LIMITS.levels) break;
      const f = EchoLevelStore.folderOf(sum.id);
      if (f) (where[f] = where[f] || []).push(docs.length);
      docs.push(got.doc);
    }
    const folders = EchoLevelStore.listFolders().map((f) => ({ name: f.name, levels: where[f.id] || [] }));
    return { levels: docs, folders };
  }

  function gather(ctx, opts = {}) {
    const raw = {};
    const progress = isObj(ls.json(K(KEY.progress))) ? ls.json(K(KEY.progress)) : {};
    const legacy = parseInt(ls.get(K(LEGACY_BEST)), 10); // (js/game.js loadProgress: the old single best is Normal's)
    if (legacy > 1 && !(progress.normal > 1)) progress.normal = legacy;
    raw.progress = progress;
    const seen = ls.json(K(KEY.seen));
    raw.seen = isObj(seen) ? Object.keys(seen).filter((k) => seen[k]) : [];
    raw.lore = ls.json(K(KEY.lore));
    raw.tutorial = ls.get(K(KEY.tutorial)) === '1';
    raw.editor = ls.get(K(KEY.editor)) === '1';
    raw.medals = ls.json(K(KEY.medals));
    const en = ls.json(K(KEY.endless));
    raw.endless = isObj(en) && isObj(en.best) ? en.best : {};
    raw.cosmetics = ls.json(K(KEY.cosmetics));
    raw.lightui = ls.get(K(KEY.lightui));
    raw.whatsnew = ls.get(K(KEY.whatsnew));
    const bonus = ls.json(K(KEY.bonus));
    raw.bonus = isObj(bonus) && isObj(bonus.done) ? Object.keys(bonus.done) : [];
    raw.stats = ls.json(K(KEY.stats));
    if (opts.settings) {
      const touch = ls.get(K(KEY.touch));
      raw.settings = {
        mode: ls.get(K(KEY.mode)),
        calm: ls.get(K(KEY.calm)) === '1',
        cues: ls.get(K(KEY.cues)) === '1',
        touch: touch === '1' || touch === '0' ? touch : null,
        keys: ls.json(K(KEY.keys)),
        volumes: ls.json(K(KEY.volumes)),
        palette: ls.get(K(KEY.palette)),
        timer: ls.get(K(KEY.timer)) === '1',
        creator: ls.get(K(KEY.creator)) || '',
      };
    }
    const s = cleanSave(raw, ctx);
    if (opts.levels) s.levels = gatherLevels();
    return s;
  }

  // ------------------------------------------------------------------ the bytes
  function bitset(w, list, words) {
    const bits = new Uint8Array(Math.ceil(words.length / 8));
    const extra = [];
    for (const id of list) {
      const i = words.indexOf(id);
      if (i >= 0) bits[i >> 3] |= 1 << (i & 7);
      else extra.push(id);
    }
    w.uint(bits.length);
    w.bytes(bits);
    w.uint(extra.length);
    for (const e of extra) w.str(e);
  }
  function readBitset(r, words) {
    const n = r.uint(64);
    const bits = r.bytes(n);
    const out = [];
    for (let i = 0; i < n * 8; i++) if (bits[i >> 3] & (1 << (i & 7))) out.push(i < words.length ? words[i] : `#${i}`); // (#n: a newer game's - dropped by cleanSave)
    const extra = r.uint(256);
    for (let i = 0; i < extra; i++) out.push(r.str(64));
    return out;
  }
  const bool = (v) => (v ? 1 : 0);

  /** One record's bytes. */
  function packRecord(name, s) {
    const w = X().writer();
    switch (name) {
      case 'progress':
        w.uint(MODES.length);
        for (const m of MODES) w.uint(s.progress[m] || 0);
        break;
      case 'seen':
        bitset(w, s.seen, SCENES);
        break;
      case 'lore':
        bitset(w, s.lore, FRAGMENTS);
        break;
      case 'tutorial':
      case 'editor':
        w.byte(1);
        break;
      case 'medals': {
        const modes = MODES.filter((m) => s.medals[m]);
        w.uint(modes.length);
        for (const m of modes) {
          w.uint(MODES.indexOf(m));
          const rows = Object.keys(s.medals[m]).map(Number).sort((a, b) => a - b);
          w.uint(rows.length);
          for (const n of rows) {
            const r = s.medals[m][n];
            w.uint(n);
            w.uint((r.time & 3) | ((r.ripples & 3) << 2) | (r.flawless ? 16 : 0));
            w.uint(r.bestTime != null ? Math.round(r.bestTime * 10) + 1 : 0);
            w.uint(r.bestRipples != null ? r.bestRipples + 1 : 0);
          }
        }
        break;
      }
      case 'endless':
        w.uint(MODES.length);
        for (const m of MODES) w.uint(s.endless[m] || 0);
        break;
      case 'cosmetics':
        w.str(s.cosmetics.color);
        w.str(s.cosmetics.shape);
        w.str(s.cosmetics.marker);
        w.uint(s.cosmetics.seen.length);
        for (const x of s.cosmetics.seen) w.str(x);
        break;
      case 'lightui':
        w.byte(s.lightui === '1' ? 1 : 0);
        break;
      case 'whatsnew':
        w.str(s.whatsnew);
        break;
      case 'bonus':
        w.uint(s.bonus.length);
        for (const id of s.bonus) w.str(id);
        break;
      case 'stats':
        w.uint(STAT_FIELDS.length);
        for (const f of STAT_FIELDS) w.uint(s.stats[f]);
        w.uint(DEATHS.length);
        for (const k of DEATHS) w.uint(s.stats.deathsBy[k]);
        w.uint(MODES.length);
        for (const m of MODES) {
          w.uint(s.stats.byMode[m].cleared);
          w.uint(s.stats.byMode[m].deaths);
        }
        break;
      case 'mode':
      case 'palette':
      case 'creator':
        w.str(s.settings[name]);
        break;
      case 'calm':
      case 'cues':
      case 'timer':
        w.byte(bool(s.settings[name]));
        break;
      case 'touch':
        w.byte(s.settings.touch === '1' ? 1 : s.settings.touch === '0' ? 2 : 0);
        break;
      case 'keys': {
        const acts = Object.keys(s.settings.keys);
        w.uint(acts.length);
        for (const a of acts) {
          w.str(a);
          w.uint(s.settings.keys[a].length);
          for (const c of s.settings.keys[a]) w.str(c);
        }
        break;
      }
      case 'volumes': {
        const buses = VOLUME_BUSES.filter((b) => s.settings.volumes[b] != null);
        w.uint(buses.length);
        for (const b of buses) {
          w.uint(VOLUME_BUSES.indexOf(b));
          w.uint(Math.round(s.settings.volumes[b] * 100));
        }
        break;
      }
      case 'levels': {
        w.uint(s.levels.levels.length);
        for (const d of s.levels.levels) {
          const b = X().packLevel(d);
          w.uint(b.length);
          w.bytes(b);
        }
        w.uint(s.levels.folders.length);
        for (const f of s.levels.folders) {
          w.str(f.name);
          w.uint(f.levels.length);
          for (const i of f.levels) w.uint(i);
        }
        break;
      }
      default:
        break;
    }
    return w.done();
  }

  /** Which records this save has something for. */
  function present(s) {
    const out = [];
    if (Object.keys(s.progress).length) out.push('progress');
    if (s.seen.length) out.push('seen');
    if (s.lore.length) out.push('lore');
    if (s.tutorial) out.push('tutorial');
    if (Object.keys(s.medals).length) out.push('medals');
    if (Object.keys(s.endless).length) out.push('endless');
    if (s.cosmetics) out.push('cosmetics');
    if (s.lightui) out.push('lightui');
    if (s.whatsnew) out.push('whatsnew');
    if (s.editor) out.push('editor');
    if (s.bonus.length) out.push('bonus');
    if (s.stats) out.push('stats');
    if (s.settings) for (const k of SETTINGS) if (s.settings[k] !== undefined) out.push(k);
    if (s.levels) out.push('levels');
    return out;
  }

  async function encode(s) {
    try {
      const w = X().writer();
      w.uint(FORMAT);
      // flags: 1 = settings were asked for, 2 = levels were asked for (so "none" is told apart from "not included")
      w.uint((s.settings ? 1 : 0) | (s.levels ? 2 : 0));
      for (const name of present(s)) {
        const b = packRecord(name, s);
        w.uint(TAG[name]);
        w.uint(b.length);
        w.bytes(b);
      }
      const res = await X().wrap('S', w.done(), LIMITS.codeChars);
      if (!res.ok) return res;
      return { ok: true, code: res.code, chars: res.chars, long: res.chars > LIMITS.warnChars };
    } catch (e) {
      return fail('damaged', 'Your save could not be turned into a code.');
    }
  }

  /** One record's bytes -> its part of a plain save object (untrusted: cleanSave comes after). */
  function readRecord(name, r, raw) {
    const st = (raw.settings = raw.settings || {});
    switch (name) {
      case 'progress': {
        const n = r.uint(16);
        for (let i = 0; i < n; i++) {
          const v = r.uint(100000);
          if (i < MODES.length) raw.progress[MODES[i]] = v;
        }
        break;
      }
      case 'seen':
        raw.seen = readBitset(r, SCENES);
        break;
      case 'lore':
        raw.lore = readBitset(r, FRAGMENTS);
        break;
      case 'tutorial':
      case 'editor':
        raw[name] = r.byte() === 1;
        break;
      case 'medals': {
        const n = r.uint(16);
        for (let i = 0; i < n; i++) {
          const m = MODES[r.uint(16)] || `#${i}`;
          const rows = r.uint(1000);
          const out = (raw.medals[m] = raw.medals[m] || {});
          for (let j = 0; j < rows; j++) {
            const lv = r.uint(1000);
            const t = r.uint(255);
            const bt = r.uint(1e7);
            const br = r.uint(1e7);
            out[lv] = { time: t & 3, ripples: (t >> 2) & 3, flawless: t & 16 ? 1 : 0, bestTime: bt ? (bt - 1) / 10 : undefined, bestRipples: br ? br - 1 : undefined };
          }
        }
        break;
      }
      case 'endless': {
        const n = r.uint(16);
        for (let i = 0; i < n; i++) {
          const v = r.uint(1e7);
          if (i < MODES.length) raw.endless[MODES[i]] = v;
        }
        break;
      }
      case 'cosmetics': {
        const c = { color: r.str(32), shape: r.str(32), marker: r.str(32), seen: [] };
        const n = r.uint(200);
        for (let i = 0; i < n; i++) c.seen.push(r.str(48));
        raw.cosmetics = c;
        break;
      }
      case 'lightui':
        raw.lightui = r.byte() === 1 ? '1' : '0';
        break;
      case 'whatsnew':
        raw.whatsnew = r.str(16);
        break;
      case 'bonus': {
        const n = r.uint(1000);
        for (let i = 0; i < n; i++) raw.bonus.push(r.str(64));
        break;
      }
      case 'stats': {
        const s = { deathsBy: {}, byMode: {} };
        const a = r.uint(64);
        for (let i = 0; i < a; i++) {
          const v = r.uint(2 ** 40);
          if (i < STAT_FIELDS.length) s[STAT_FIELDS[i]] = v;
        }
        const b = r.uint(64);
        for (let i = 0; i < b; i++) {
          const v = r.uint(2 ** 40);
          if (i < DEATHS.length) s.deathsBy[DEATHS[i]] = v;
        }
        const c = r.uint(16);
        for (let i = 0; i < c; i++) {
          const row = { cleared: r.uint(2 ** 40), deaths: r.uint(2 ** 40) };
          if (i < MODES.length) s.byMode[MODES[i]] = row;
        }
        raw.stats = s;
        break;
      }
      case 'mode':
      case 'palette':
        st[name] = r.str(32);
        break;
      case 'creator':
        st.creator = r.str(EchoLevelFormat.LIMITS.author);
        break;
      case 'calm':
      case 'cues':
      case 'timer':
        st[name] = r.byte() === 1;
        break;
      case 'touch': {
        const t = r.byte();
        st.touch = t === 1 ? '1' : t === 2 ? '0' : null;
        break;
      }
      case 'keys': {
        const n = r.uint(64);
        st.keys = {};
        for (let i = 0; i < n; i++) {
          const a = r.str(32);
          const m = r.uint(8);
          const codes = [];
          for (let j = 0; j < m; j++) codes.push(r.str(32));
          if (a !== '__proto__' && a !== 'constructor' && a !== 'prototype') st.keys[a] = codes;
        }
        break;
      }
      case 'volumes': {
        const n = r.uint(16);
        st.volumes = {};
        for (let i = 0; i < n; i++) {
          const b = VOLUME_BUSES[r.uint(16)];
          const v = r.uint(1000) / 100;
          if (b) st.volumes[b] = v;
        }
        break;
      }
      case 'levels': {
        const n = r.uint(LIMITS.levels);
        const levels = [];
        for (let i = 0; i < n; i++) {
          const size = r.uint(LIMITS.inflated);
          levels.push(X().unpackLevel(r.bytes(size)));
        }
        const nf = r.uint(LIMITS.folders);
        const folders = [];
        for (let i = 0; i < nf; i++) {
          const name = r.str(EchoLevelStore.FOLDER_LIMITS.name);
          const m = r.uint(LIMITS.levels);
          const idx = [];
          for (let j = 0; j < m; j++) idx.push(r.uint(LIMITS.levels));
          folders.push({ name, levels: idx });
        }
        raw.levels = { levels, folders };
        break;
      }
      default:
        throw bad('newer');
    }
  }

  /** The save code inside whatever was pasted (or read from a file): from "ECHO" + a digit on, letters and digits only. */
  function clean(text) {
    if (typeof text !== 'string') return '';
    const t = text.length > LIMITS.codeChars * 2 ? text.slice(0, LIMITS.codeChars * 2) : text;
    const squeezed = t.replace(X().INVISIBLE, '');
    const at = squeezed.search(/echo\d/i);
    if (at < 0) return '';
    return squeezed.slice(at).replace(/[^0-9A-Za-z]/g, '');
  }

  async function decode(text, ctx) {
    try {
      if (typeof text !== 'string' || !text.trim()) return fail('empty');
      if (text.length > LIMITS.codeChars * 2) return fail('tooBig');
      const code = clean(text);
      if (!code) return fail('notCode');
      if (code.length > LIMITS.codeChars) return fail('tooBig');
      const m = /^ECHO(\d{1,4})([A-Za-z])/i.exec(code);
      if (!m) return fail('notCode');
      const kind = m[2].toUpperCase();
      if (kind === 'L') return fail('level');
      if (kind === 'F') return fail('folder');
      if (kind !== 'S') return fail('damaged');
      if (Number(m[1]) > 1) return fail('newer');
      if (Number(m[1]) !== 1) return fail('damaged');
      const bytes = await X().unwrap(code, HEAD, LIMITS.inflated);
      const r = X().reader(bytes);
      const format = r.uint(1e6);
      if (format > FORMAT) return fail('newer');
      if (format !== FORMAT) return fail('damaged');
      const flags = r.uint(255);
      const raw = { progress: {}, seen: [], lore: [], medals: {}, endless: {}, bonus: [] };
      const seenTags = new Set();
      while (!r.end()) {
        const tag = r.uint(1e6);
        const len = r.uint(bytes.length);
        const body = r.bytes(len);
        const name = RECORDS[tag];
        if (!name) return fail('newer');
        if (seenTags.has(tag)) return fail('damaged');
        seenTags.add(tag);
        const rr = X().reader(body);
        readRecord(name, rr, raw);
        if (!rr.end()) return fail('damaged');
      }
      if (flags & 1) raw.settings = raw.settings || {};
      else delete raw.settings;
      if (flags & 2) raw.levels = raw.levels || { levels: [], folders: [] };
      else delete raw.levels;
      const s = cleanSave(raw, ctx);
      // the levels: through the level loader and checker, like every level from outside the game
      if (s.levels) {
        const docs = [];
        for (const lv of s.levels.levels) {
          lv.title = EchoLevelFormat.cleanShown(lv.title, EchoLevelFormat.LIMITS.title) || EchoLevelFormat.DEFAULT_TITLE;
          lv.authorName = EchoLevelFormat.cleanShown(lv.authorName, EchoLevelFormat.LIMITS.author);
          const read = EchoLevelFormat.normalise(lv);
          if (!read.doc) return fail('damaged');
          if (read.foreign || read.newer) return fail('newer');
          read.doc.playable = EchoLevelCheck.check(read.doc).playable; // (kept as a draft if not: My Levels keeps drafts)
          docs.push(read.doc);
        }
        s.levels.levels = docs;
      }
      return { ok: true, save: s };
    } catch (e) {
      const why = e && e.why;
      return fail(why === 'newer' ? 'newer' : why === 'tooBig' ? 'tooBig' : 'damaged');
    }
  }

  // ------------------------------------------------------------------ in plain words
  function preview(s, mine, ctx) {
    const lines = [];
    const top = ctx.campaignLevels + 1;
    const lvl = (n) => (n >= top ? 'finished' : `level ${n}`);
    const prog = ctx.modes.filter((m) => s.progress[m]).map((m) => `${ctx.modeLabel(m)}: ${lvl(s.progress[m])}`);
    lines.push(prog.length ? `${prog.join('. ')}.` : 'No levels cleared yet.');
    const bits = [];
    if (s.lore.length) bits.push(`${s.lore.length} fragment${s.lore.length === 1 ? '' : 's'}`);
    if (s.seen.length) bits.push(`${s.seen.length} cutscene${s.seen.length === 1 ? '' : 's'} seen`);
    let medals = 0;
    for (const m of Object.keys(s.medals)) for (const n of Object.keys(s.medals[m])) {
      const r = s.medals[m][n];
      medals += (r.time ? 1 : 0) + (r.ripples ? 1 : 0) + (r.flawless ? 1 : 0);
    }
    if (medals) bits.push(`${medals} medal${medals === 1 ? '' : 's'}`);
    const eb = ctx.modes.filter((m) => s.endless[m]).map((m) => `${ctx.modeLabel(m)} ${s.endless[m]}`);
    if (eb.length) bits.push(`Endless best: ${eb.join(', ')}`);
    if (s.bonus.length) bits.push(`${s.bonus.length} bonus level${s.bonus.length === 1 ? '' : 's'} done`);
    if (s.tutorial) bits.push('the tutorial done');
    if (bits.length) lines.push(`${bits.join('. ')}.`.replace(/^./, (c) => c.toUpperCase()));
    if (s.levels) {
      const n = s.levels.levels.length;
      const drafts = s.levels.levels.filter((d) => d.playable === false).length;
      const f = s.levels.folders.length;
      lines.push(n || f ? `${n} of your own level${n === 1 ? '' : 's'}${drafts ? ` (${drafts} unfinished)` : ''}${f ? ` in ${f} folder${f === 1 ? '' : 's'}` : ''}.` : 'Levels and folders: none.');
    }
    if (s.settings) lines.push('Settings: included (keys, sound, look and options).');
    // is it further along than this device? (then it unlocks things not played here)
    let ahead = false;
    if (mine) {
      for (const m of ctx.modes) if ((s.progress[m] || 1) > (mine.progress[m] || 1)) ahead = true;
      if (s.seen.some((k) => !mine.seen.includes(k))) ahead = true;
      if (s.lore.some((k) => !mine.lore.includes(k))) ahead = true;
      for (const m of ctx.modes) if ((s.endless[m] || 0) > (mine.endless[m] || 0)) ahead = true;
    }
    return { lines, ahead };
  }

  // ------------------------------------------------------------------ merging: the best of both
  const union = (a, b, order) => order.filter((x) => a.includes(x) || b.includes(x));
  function merge(mine, theirs, ctx) {
    const s = cleanSave({}, ctx);
    for (const m of ctx.modes) {
      const v = Math.max(mine.progress[m] || 0, theirs.progress[m] || 0);
      if (v > 1) s.progress[m] = v;
      const e = Math.max(mine.endless[m] || 0, theirs.endless[m] || 0);
      if (e) s.endless[m] = e;
    }
    s.seen = union(mine.seen, theirs.seen, ctx.scenes);
    s.lore = union(mine.lore, theirs.lore, ctx.fragments);
    s.bonus = union(mine.bonus, theirs.bonus, ctx.bonusIds);
    s.tutorial = mine.tutorial || theirs.tutorial;
    s.editor = mine.editor || theirs.editor;
    for (const m of ctx.modes) {
      const a = mine.medals[m] || {};
      const b = theirs.medals[m] || {};
      const rows = {};
      for (const n of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const x = a[n] || {};
        const y = b[n] || {};
        const lo = (p, q) => (p == null ? q : q == null ? p : Math.min(p, q));
        const row = { time: Math.max(x.time || 0, y.time || 0), ripples: Math.max(x.ripples || 0, y.ripples || 0), flawless: x.flawless || y.flawless ? 1 : 0 };
        const bt = lo(x.bestTime, y.bestTime);
        const br = lo(x.bestRipples, y.bestRipples);
        if (bt != null) row.bestTime = bt;
        if (br != null) row.bestRipples = br;
        rows[n] = row;
      }
      if (Object.keys(rows).length) s.medals[m] = rows;
    }
    // choices: this device's, unless it has never made one
    s.cosmetics = mine.cosmetics || theirs.cosmetics;
    if (mine.cosmetics && theirs.cosmetics) s.cosmetics = Object.assign({}, mine.cosmetics, { seen: [...new Set([...mine.cosmetics.seen, ...theirs.cosmetics.seen])] });
    s.lightui = mine.lightui || theirs.lightui;
    s.whatsnew = versionNum(mine.whatsnew) >= versionNum(theirs.whatsnew) ? mine.whatsnew : theirs.whatsnew;
    if (mine.stats || theirs.stats) {
      const a = mine.stats || cleanSave({ stats: {} }, ctx).stats;
      const b = theirs.stats || a;
      const st = { deathsBy: {}, byMode: {} };
      // (the higher of each, never the sum: loading the same code twice must not count anything twice)
      for (const f of STAT_FIELDS) st[f] = Math.max(a[f], b[f]);
      for (const k of DEATHS) st.deathsBy[k] = Math.max(a.deathsBy[k], b.deathsBy[k]);
      for (const m of MODES) st.byMode[m] = { cleared: Math.max(a.byMode[m].cleared, b.byMode[m].cleared), deaths: Math.max(a.byMode[m].deaths, b.byMode[m].deaths) };
      s.stats = st;
    }
    // settings asked for in the code: the code's (they are choices - there is no "best" of two)
    s.settings = theirs.settings ? Object.assign({}, mine.settings || {}, theirs.settings) : null;
    s.levels = theirs.levels;
    return s;
  }

  // ------------------------------------------------------------------ writing it
  /** The keys a load with this save would write (names after PREFIX), and whether it touches the levels. */
  function touched(s) {
    const keys = PROGRESS.map((p) => KEY[p]).concat([LEGACY_BEST]);
    if (s.settings) for (const k of SETTINGS) keys.push(KEY[k]);
    return { keys, levels: !!s.levels };
  }
  const levelKeys = () => {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(EchoLevelStore.LEVEL_PREFIX)) out.push(k);
      }
    } catch (e) {
      /* no storage: nothing to list */
    }
    return out;
  };

  function snapshot(s) {
    const t = touched(s);
    const snap = { at: new Date().toISOString(), keys: {}, levels: null };
    for (const k of t.keys) snap.keys[k] = ls.get(K(k));
    if (t.levels) {
      snap.levels = { folders: ls.get(EchoLevelStore.FOLDERS_KEY), items: {} };
      for (const k of levelKeys()) snap.levels.items[k] = ls.get(k);
    }
    return snap;
  }
  function restore(snap) {
    let ok = true;
    for (const k of Object.keys(snap.keys)) {
      const v = snap.keys[k];
      ok = (v == null ? ls.remove(K(k)) : ls.set(K(k), v)) && ok;
    }
    if (snap.levels) {
      for (const k of levelKeys()) if (!own(snap.levels.items, k)) ls.remove(k);
      for (const k of Object.keys(snap.levels.items)) ok = ls.set(k, snap.levels.items[k]) && ok;
      const f = snap.levels.folders;
      ok = (f == null ? ls.remove(EchoLevelStore.FOLDERS_KEY) : ls.set(EchoLevelStore.FOLDERS_KEY, f)) && ok;
    }
    return ok;
  }

  /** The progress and settings records -> storage values (null: take the key away). */
  function values(s) {
    const v = {};
    v.progress = Object.keys(s.progress).length ? JSON.stringify(s.progress) : null;
    v[LEGACY_BEST] = null; // (folded into progress when this device's save was read)
    const seen = {};
    for (const k of s.seen) seen[k] = 1;
    v.seen = s.seen.length ? JSON.stringify(seen) : null;
    v.lore = s.lore.length ? JSON.stringify(s.lore) : null;
    v.tutorial = s.tutorial ? '1' : null;
    v.editor = s.editor ? '1' : null;
    v.medals = Object.keys(s.medals).length ? JSON.stringify(s.medals) : null;
    const en = ls.json(K(KEY.endless));
    const last = isObj(en) && isObj(en.last) ? en.last : undefined;
    v.endless = Object.keys(s.endless).length || last ? JSON.stringify(last ? { best: s.endless, last } : { best: s.endless }) : null;
    v.cosmetics = s.cosmetics ? JSON.stringify(s.cosmetics) : null;
    v.lightui = s.lightui;
    v.whatsnew = s.whatsnew;
    const bonus = ls.json(K(KEY.bonus));
    const had = isObj(bonus) && isObj(bonus.done) ? bonus.done : {};
    const now = new Date().toISOString();
    const done = {};
    for (const id of s.bonus) done[id] = typeof had[id] === 'string' ? had[id] : now;
    v.bonus = s.bonus.length ? JSON.stringify({ schemaVersion: 1, done }) : null;
    v.stats = s.stats ? JSON.stringify(s.stats) : null;
    if (s.settings) {
      const o = s.settings;
      if (o.mode !== undefined) v.mode = o.mode;
      if (o.calm !== undefined) v.calm = o.calm ? '1' : '0';
      if (o.cues !== undefined) v.visualcues = o.cues ? '1' : '0';
      if (o.touch !== undefined) v.touch = o.touch;
      if (o.keys !== undefined) v.keys = JSON.stringify(o.keys);
      if (o.volumes !== undefined) v.volumes = JSON.stringify(o.volumes);
      if (o.palette !== undefined) v.palette = o.palette;
      if (o.timer !== undefined) v.showtimer = o.timer ? '1' : '0';
      if (o.creator !== undefined) v.creator = o.creator || null;
    }
    return v;
  }

  function writeLevels(lv, replace) {
    if (replace) {
      for (const sum of EchoLevelStore.list()) EchoLevelStore.delete(sum.id);
      for (const f of EchoLevelStore.listFolders()) EchoLevelStore.deleteFolder(f.id);
    }
    // merging: a level this device already has (the same content and title) is not added twice
    const have = new Set();
    if (!replace) for (const sum of EchoLevelStore.list()) {
      const got = EchoLevelStore.get(sum.id);
      if (got && got.doc) have.add(`${EchoShare.contentKey(got.doc)}|${got.doc.title}`);
    }
    const ids = [];
    const now = new Date().toISOString();
    for (const d0 of lv.levels) {
      const key = `${EchoShare.contentKey(d0)}|${d0.title}`;
      if (have.has(key)) {
        ids.push(null);
        continue;
      }
      have.add(key);
      const d = EchoLevelFormat.copy(d0);
      delete d.playable;
      d.id = EchoLevelFormat.newId();
      d.createdAt = now;
      d.updatedAt = now;
      const r = EchoLevelStore.save(d);
      if (!r.ok) return false;
      ids.push(r.doc.id);
    }
    for (const f of lv.folders) {
      const mineF = EchoLevelStore.listFolders().find((x) => x.name.toLowerCase() === f.name.toLowerCase());
      let fid = mineF ? mineF.id : null;
      const members = f.levels.map((i) => ids[i]).filter(Boolean);
      if (!fid) {
        const made = EchoLevelStore.createFolder(f.name);
        if (!made.ok) return false;
        fid = made.folder.id;
      }
      for (const id of members) if (!EchoLevelStore.moveLevel(id, fid)) return false;
    }
    return true;
  }

  /**
   * Load a decoded save: merged with this device's (the default) or instead of it (`replace`), every key it touches
   * kept first for Undo. All or nothing: if a write fails, what was there is put back.
   */
  function load(theirs, ctx, opts = {}) {
    try {
      const replace = !!opts.replace;
      const mine = gather(ctx, { settings: !!theirs.settings, levels: false });
      const s = replace ? Object.assign(cleanSave({}, ctx), theirs) : merge(mine, theirs, ctx);
      if (replace && theirs.settings) s.settings = Object.assign({}, mine.settings || {}, theirs.settings);
      const snap = snapshot(s);
      ls.remove(UNDO_KEY);
      const undo = ls.set(UNDO_KEY, JSON.stringify(snap));
      if (opts.requireUndo && !undo) return fail('noUndo', 'There is not enough room in storage to keep a copy for Undo.');
      const v = values(s);
      let ok = true;
      for (const name of Object.keys(v)) ok = (v[name] == null ? ls.remove(K(name)) : ls.set(K(name), v[name])) && ok;
      if (ok && s.levels) ok = writeLevels(s.levels, replace);
      if (!ok) {
        restore(snap);
        ls.remove(UNDO_KEY);
        return fail('storage');
      }
      return { ok: true, undo };
    } catch (e) {
      return fail('storage');
    }
  }

  /** Would a load of this save have room for its Undo copy? (Asked before loading, so the player can choose.) */
  function undoFits(theirs, ctx) {
    try {
      const snap = JSON.stringify(snapshot(Object.assign(cleanSave({}, ctx), { settings: theirs.settings, levels: theirs.levels })));
      const probe = K('saveundo.probe');
      const ok = ls.set(probe, snap);
      ls.remove(probe);
      return ok;
    } catch (e) {
      return false;
    }
  }

  const canUndo = () => {
    const u = ls.json(UNDO_KEY);
    return isObj(u) && isObj(u.keys);
  };
  function undo() {
    const u = ls.json(UNDO_KEY);
    if (!isObj(u) || !isObj(u.keys)) return fail('noUndo', 'There is no load to undo.');
    // only the keys a load can touch are ever put back (the snapshot is untrusted storage too)
    const allowed = new Set(PROGRESS.map((p) => KEY[p]).concat(SETTINGS.map((p) => KEY[p]), [LEGACY_BEST]));
    const keys = {};
    for (const k of Object.keys(u.keys)) if (allowed.has(k) && (u.keys[k] === null || typeof u.keys[k] === 'string')) keys[k] = u.keys[k];
    let levels = null;
    if (isObj(u.levels) && isObj(u.levels.items)) {
      const items = {};
      for (const k of Object.keys(u.levels.items)) if (k.startsWith(EchoLevelStore.LEVEL_PREFIX) && typeof u.levels.items[k] === 'string') items[k] = u.levels.items[k];
      levels = { folders: typeof u.levels.folders === 'string' ? u.levels.folders : null, items };
    }
    const ok = restore({ keys, levels });
    ls.remove(UNDO_KEY);
    return ok ? { ok: true } : fail('storage');
  }

  return { PREFIX, HEAD, FORMAT, LIMITS, ERR, RECORDS, UNDO_KEY, gather, encode, decode, preview, merge, load, undoFits, canUndo, undo, clean, _: { cleanSave, present } };
})();
