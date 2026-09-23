'use strict';

/**
 * Everything the player has SAVED that is not their progress through the game: which keys they use, how loud
 * each bus is, which colour palette they picked, the medals they have won and their lifetime stats.
 *
 * This file is pure data. It never touches the DOM, the audio or the simulation - the game reads it and acts
 * on it. It is loaded first, so js/palette.js and js/game.js can both use `EchoProfile.store`.
 *
 * Every localStorage access goes through `store`, which swallows every error: storage can be turned off,
 * full, or blocked in a private window, and the game must still run. A key that is missing or corrupt always
 * falls back to the default, so an old save (which has none of these keys) loads exactly as it always did -
 * the older keys (progress, mode, calm, seen, visualcues, touch) are not touched by this file at all.
 */
const EchoProfile = (() => {
  const KEYS_KEY = 'echomaze.keys'; // { up: ['KeyW','ArrowUp'], ... }
  const VOL_KEY = 'echomaze.volumes'; // { master: 0.8, effects: 1, ambience: 1 }
  const PALETTE_KEY = 'echomaze.palette'; // 'default' | 'protan' | 'tritan' | 'contrast'
  const MEDALS_KEY = 'echomaze.medals'; // { normal: { 3: { time: 2, ripples: 3, flawless: 1, bestTime, bestRipples } } }
  const STATS_KEY = 'echomaze.stats';
  const TIMER_KEY = 'echomaze.showtimer'; // '1' = show the level time in the HUD (off by default)

  const store = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    /** Returns whether it really got written: the "Progress saved" toast must never lie (js/game.js). */
    set(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e) {
        return false; /* storage unavailable */
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        /* storage unavailable */
      }
    },
    json(key, fallback) {
      try {
        const v = JSON.parse(store.get(key));
        return v && typeof v === 'object' ? v : fallback;
      } catch (e) {
        return fallback;
      }
    },
  };

  // ------------------------------------------------------------------ keys
  /**
   * The actions a key can be bound to, in the order the Controls tab lists them. Up to MAX_KEYS keys each.
   * Esc (always back / pause) and Enter (always confirm) are never bound to anything here - see `bindable`.
   */
  const ACTIONS = [
    { id: 'up', label: 'Move up', group: 'move' },
    { id: 'down', label: 'Move down', group: 'move' },
    { id: 'left', label: 'Move left', group: 'move' },
    { id: 'right', label: 'Move right', group: 'move' },
    { id: 'ripple', label: 'Send a ripple', group: 'act' },
    { id: 'crouch', label: 'Crouch (hold)', group: 'act' },
    { id: 'item', label: 'Use / drop your item', group: 'act' },
    { id: 'pause', label: 'Pause', group: 'act' },
    { id: 'mute', label: 'Mute', group: 'opt' },
    { id: 'calm', label: 'Calm mode', group: 'opt' },
    { id: 'cues', label: 'Visual cues', group: 'opt' },
  ];
  const MAX_KEYS = 2;
  const DEFAULT_KEYS = {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    ripple: ['Space'],
    crouch: ['ShiftLeft', 'ShiftRight'],
    item: ['KeyE'],
    pause: ['KeyP'],
    mute: ['KeyM'],
    calm: ['KeyC'],
    cues: ['KeyV'],
  };
  /** Keys the game keeps for itself whatever the bindings say. */
  const RESERVED = { Escape: 'Esc always means back or pause', Enter: 'Enter always confirms' };

  let bindings = loadKeys();

  function cleanCodes(list) {
    if (!Array.isArray(list)) return null;
    const out = [];
    for (const c of list) {
      if (typeof c === 'string' && c && !RESERVED[c] && out.indexOf(c) < 0) out.push(c);
      if (out.length >= MAX_KEYS) break;
    }
    return out;
  }

  function loadKeys() {
    const saved = store.json(KEYS_KEY, null);
    const out = {};
    for (const a of ACTIONS) {
      const from = saved ? cleanCodes(saved[a.id]) : null;
      out[a.id] = from && from.length ? from : DEFAULT_KEYS[a.id].slice();
    }
    return out;
  }

  function saveKeys() {
    store.set(KEYS_KEY, JSON.stringify(bindings));
  }

  /** The codes bound to an action (never empty unless the player cleared it). */
  const keysFor = (action) => bindings[action] || [];

  /** Which action a key code runs, or null. */
  function actionFor(code) {
    for (const a of ACTIONS) if (bindings[a.id].indexOf(code) >= 0) return a.id;
    return null;
  }

  /**
   * May this key be bound? Anything held with Ctrl / Alt / Meta, the function keys and the two reserved keys
   * are refused, because the browser (or the game) already owns them. `e` is the KeyboardEvent.
   */
  function bindable(e) {
    const code = e.code;
    if (!code) return { ok: false, why: 'That key has no code the game can save.' };
    if (RESERVED[code]) return { ok: false, why: `${RESERVED[code]}, so it cannot be rebound.` };
    if (e.ctrlKey || e.altKey || e.metaKey) return { ok: false, why: 'Keys held with Ctrl, Alt or Cmd belong to the browser.' };
    if (/^F\d{1,2}$/.test(code)) return { ok: false, why: 'The function keys belong to the browser.' };
    if (code === 'Tab') return { ok: false, why: 'Tab moves between buttons, so it cannot be rebound.' };
    return { ok: true };
  }

  /** Put `code` in slot `slot` of `action`. Any other action that had it loses it (the caller asks first). */
  function bindKey(action, slot, code) {
    if (!bindings[action]) return;
    for (const a of ACTIONS) {
      if (a.id === action) continue;
      const i = bindings[a.id].indexOf(code);
      if (i >= 0) bindings[a.id].splice(i, 1);
    }
    const list = bindings[action].filter((c) => c !== code);
    list[Math.min(slot, list.length)] = code;
    bindings[action] = list.slice(0, MAX_KEYS);
    saveKeys();
  }

  /** Swap a key between two actions: `code` moves to `action`, and `action`'s key in that slot goes the other way. */
  function swapKey(action, slot, code, otherAction) {
    const mine = bindings[action][slot];
    const theirs = bindings[otherAction];
    const i = theirs.indexOf(code);
    if (i >= 0) {
      if (mine) theirs[i] = mine;
      else theirs.splice(i, 1);
    }
    const list = bindings[action].slice();
    list[Math.min(slot, list.length)] = code;
    bindings[action] = list.slice(0, MAX_KEYS).filter(Boolean);
    bindings[otherAction] = theirs.filter(Boolean);
    saveKeys();
  }

  function clearKey(action, slot) {
    if (!bindings[action]) return;
    bindings[action] = bindings[action].filter((_, i) => i !== slot);
    saveKeys();
  }

  function resetKeys() {
    bindings = {};
    for (const a of ACTIONS) bindings[a.id] = DEFAULT_KEYS[a.id].slice();
    saveKeys();
  }

  const isDefaultKeys = () => ACTIONS.every((a) => bindings[a.id].join(' ') === DEFAULT_KEYS[a.id].join(' '));

  /** A short name to show on a key cap: 'KeyW' -> 'W', 'ArrowUp' -> '↑', 'Space' -> 'SPACE'. */
  function keyLabel(code) {
    if (!code) return '—';
    const named = {
      Space: 'SPACE',
      ArrowUp: '↑',
      ArrowDown: '↓',
      ArrowLeft: '←',
      ArrowRight: '→',
      ShiftLeft: 'SHIFT',
      ShiftRight: 'R SHIFT',
      ControlLeft: 'CTRL',
      ControlRight: 'R CTRL',
      AltLeft: 'ALT',
      AltRight: 'R ALT',
      Backquote: '`',
      Minus: '-',
      Equal: '=',
      BracketLeft: '[',
      BracketRight: ']',
      Backslash: '\\',
      Semicolon: ';',
      Quote: "'",
      Comma: ',',
      Period: '.',
      Slash: '/',
      CapsLock: 'CAPS',
      Backspace: 'BKSP',
      Delete: 'DEL',
      Insert: 'INS',
      Home: 'HOME',
      End: 'END',
      PageUp: 'PG UP',
      PageDown: 'PG DN',
    };
    if (named[code]) return named[code];
    let m = /^Key([A-Z])$/.exec(code);
    if (m) return m[1];
    m = /^Digit(\d)$/.exec(code);
    if (m) return m[1];
    m = /^Numpad(.+)$/.exec(code);
    if (m) return `NUM ${m[1].toUpperCase()}`;
    return code.toUpperCase();
  }

  /** "W or ↑" - how an action's keys read in a sentence. */
  const keysText = (action) => (keysFor(action).map(keyLabel).join(' or ') || 'unbound');

  // --------------------------------------------------------------- volumes
  // master = the old single volume slider; effects and ambience are the two buses under it (see js/audio.js).
  const DEFAULT_VOLUMES = { master: 0.8, effects: 1, ambience: 1 };
  let volumes = loadVolumes();

  function loadVolumes() {
    const saved = store.json(VOL_KEY, null);
    const out = { ...DEFAULT_VOLUMES };
    if (saved) {
      for (const k of Object.keys(DEFAULT_VOLUMES)) {
        const v = +saved[k];
        if (isFinite(v) && v >= 0 && v <= 1) out[k] = v;
      }
    }
    return out;
  }

  function setVolume(bus, v) {
    if (!(bus in volumes)) return;
    volumes[bus] = Math.max(0, Math.min(1, +v || 0));
    store.set(VOL_KEY, JSON.stringify(volumes));
  }

  // --------------------------------------------------------------- display
  const getPalette = () => store.get(PALETTE_KEY) || 'default';
  const setPalette = (id) => store.set(PALETTE_KEY, id);
  const getShowTimer = () => store.get(TIMER_KEY) === '1';
  const setShowTimer = (on) => store.set(TIMER_KEY, on ? '1' : '0');

  // ---------------------------------------------------------------- medals
  /**
   * Three medals per level per mode. TIME and RIPPLES have three tiers, FLAWLESS is won or not.
   *
   * Par is worked out from the maze you were actually given, because every run has a new seed: `pathTiles` is
   * the length of the shortest way from the start to the exit (BFS over the level's blocked tiles, in tiles of
   * TILE px). `optimalWalkSeconds` is how long that path takes at the player's walking speed with no stopping,
   * no pinging and no monsters - nobody can beat it, so every par is a generous multiple of it plus a fixed
   * allowance for the pinging and listening the game is actually made of.
   */
  const NONE = 0;
  const BRONZE = 1;
  const SILVER = 2;
  const GOLD = 3;
  const TIER_NAMES = ['', 'Bronze', 'Silver', 'Gold'];
  const WALK_SPEED = 170; // px/s (the player's speed; js/game.js WALK_SPEED)
  const TILE_PX = 40; // px (js/level.js TILE)
  // time = optimalWalkSeconds x mul + add (seconds). The `add` is what carries a level: it is the pinging,
  // the waiting and the backtracking, which do not scale with the size of the maze nearly as much as walking does.
  const TIME_PAR = { gold: [2.2, 20], silver: [3.2, 34], bronze: [4.6, 55] };
  // ripples = ceil(pathTiles / div) + add. A ripple every few tiles of the route is what a careful player sends.
  const RIPPLE_PAR = { gold: [4.5, 4], silver: [3, 6] };

  function pars(pathTiles) {
    const optimal = (Math.max(1, pathTiles) * TILE_PX) / WALK_SPEED;
    const t = (k) => Math.round(optimal * TIME_PAR[k][0] + TIME_PAR[k][1]);
    const r = (k) => Math.ceil(Math.max(1, pathTiles) / RIPPLE_PAR[k][0]) + RIPPLE_PAR[k][1];
    return {
      optimal,
      time: { gold: t('gold'), silver: t('silver'), bronze: t('bronze') },
      ripples: { gold: r('gold'), silver: r('silver') },
    };
  }

  /** Which tier a finished level earns. Ripples always earn at least bronze; time can miss out. */
  function tiersFor(pathTiles, time, ripples) {
    const p = pars(pathTiles);
    const timeTier = time <= p.time.gold ? GOLD : time <= p.time.silver ? SILVER : time <= p.time.bronze ? BRONZE : NONE;
    const rippleTier = ripples <= p.ripples.gold ? GOLD : ripples <= p.ripples.silver ? SILVER : BRONZE;
    return { time: timeTier, ripples: rippleTier, pars: p };
  }

  let medals = store.json(MEDALS_KEY, {});

  const medalsFor = (mode, level) => (medals[mode] && medals[mode][level]) || null;

  /**
   * Record a cleared level. Medals are only ever raised, never lowered, and the best time and ripple count are
   * kept too. Returns what was won and whether each part is a new best, for the level-complete screen.
   */
  function recordClear(mode, level, { time, ripples, flawless, pathTiles }) {
    const got = tiersFor(pathTiles, time, ripples);
    const had = medalsFor(mode, level) || { time: 0, ripples: 0, flawless: 0 };
    const rec = {
      time: Math.max(had.time || 0, got.time),
      ripples: Math.max(had.ripples || 0, got.ripples),
      flawless: had.flawless || (flawless ? 1 : 0),
      bestTime: had.bestTime != null ? Math.min(had.bestTime, time) : time,
      bestRipples: had.bestRipples != null ? Math.min(had.bestRipples, ripples) : ripples,
    };
    if (!medals[mode]) medals[mode] = {};
    medals[mode][level] = rec;
    const saved = store.set(MEDALS_KEY, JSON.stringify(medals));
    return {
      earned: got,
      record: rec,
      pars: got.pars,
      saved, // did the write actually happen? (the toast in js/game.js only appears when it did)
      improved: {
        time: got.time > (had.time || 0),
        ripples: got.ripples > (had.ripples || 0),
        flawless: !!flawless && !had.flawless,
        bestTime: had.bestTime == null || time < had.bestTime,
        bestRipples: had.bestRipples == null || ripples < had.bestRipples,
      },
    };
  }

  /** Totals for a mode: how many of each tier have been won, out of how many are on offer. */
  function medalSummary(mode, levels) {
    const out = { gold: 0, silver: 0, bronze: 0, flawless: 0, won: 0, total: levels * 3 };
    const m = medals[mode] || {};
    for (let n = 1; n <= levels; n++) {
      const r = m[n];
      if (!r) continue;
      for (const k of ['time', 'ripples']) {
        const t = r[k] || 0;
        if (t === GOLD) out.gold++;
        else if (t === SILVER) out.silver++;
        else if (t === BRONZE) out.bronze++;
        if (t > 0) out.won++;
      }
      if (r.flawless) {
        out.flawless++;
        out.won++;
      }
    }
    return out;
  }

  function resetMedals() {
    medals = {};
    store.remove(MEDALS_KEY);
  }

  // ----------------------------------------------------------------- stats
  const DEATH_KINDS = ['echo', 'scent', 'mimic', 'stalker', 'muffler', 'singer'];
  const MODE_IDS = ['easy', 'normal', 'hard', 'hardcore'];

  function blankStats() {
    const byKind = {};
    for (const k of DEATH_KINDS) byKind[k] = 0;
    const byMode = {};
    for (const m of MODE_IDS) byMode[m] = { cleared: 0, deaths: 0 };
    return { cleared: 0, deaths: 0, deathsBy: byKind, byMode, ripples: 0, crouches: 0, decoys: 0, marked: 0, nearMisses: 0, playTime: 0, distance: 0 };
  }

  function loadStats() {
    const saved = store.json(STATS_KEY, null);
    const s = blankStats();
    if (!saved) return s;
    for (const k of ['cleared', 'deaths', 'ripples', 'crouches', 'decoys', 'marked', 'nearMisses', 'playTime', 'distance']) {
      const v = +saved[k];
      if (isFinite(v) && v >= 0) s[k] = v;
    }
    if (saved.deathsBy) for (const k of DEATH_KINDS) if (isFinite(+saved.deathsBy[k])) s.deathsBy[k] = +saved.deathsBy[k];
    if (saved.byMode) {
      for (const m of MODE_IDS) {
        const row = saved.byMode[m];
        if (!row) continue;
        if (isFinite(+row.cleared)) s.byMode[m].cleared = +row.cleared;
        if (isFinite(+row.deaths)) s.byMode[m].deaths = +row.deaths;
      }
    }
    return s;
  }

  let stats = loadStats();
  let dirty = false;

  /**
   * Counting only - nothing here is ever read back by the game, so tracking can never change what happens.
   * Writes are held back until `flush` (the game calls it at the end of a level, when it pauses and when the
   * page is hidden), because playTime and distance change every single frame.
   */
  function bump(field, n = 1) {
    if (!(field in stats) || !isFinite(n)) return;
    stats[field] += n;
    dirty = true;
  }

  function addDeath(mode, kind) {
    stats.deaths++;
    if (stats.deathsBy[kind] !== undefined) stats.deathsBy[kind]++;
    if (stats.byMode[mode]) stats.byMode[mode].deaths++;
    dirty = true;
  }

  function addClear(mode) {
    stats.cleared++;
    if (stats.byMode[mode]) stats.byMode[mode].cleared++;
    dirty = true;
  }

  function flush() {
    if (!dirty) return;
    dirty = false;
    store.set(STATS_KEY, JSON.stringify(stats));
  }

  function resetStats() {
    stats = blankStats();
    dirty = false;
    store.remove(STATS_KEY);
  }

  return {
    store,
    // keys
    ACTIONS,
    MAX_KEYS,
    DEFAULT_KEYS,
    RESERVED,
    keysFor,
    keysText,
    keyLabel,
    actionFor,
    bindable,
    bindKey,
    swapKey,
    clearKey,
    resetKeys,
    isDefaultKeys,
    // volumes
    volumes: () => ({ ...volumes }),
    setVolume,
    DEFAULT_VOLUMES,
    // display
    getPalette,
    setPalette,
    getShowTimer,
    setShowTimer,
    // medals
    NONE,
    BRONZE,
    SILVER,
    GOLD,
    TIER_NAMES,
    TIME_PAR,
    RIPPLE_PAR,
    pars,
    tiersFor,
    medalsFor,
    recordClear,
    medalSummary,
    resetMedals,
    allMedals: () => JSON.parse(JSON.stringify(medals)),
    // stats
    DEATH_KINDS,
    stats: () => JSON.parse(JSON.stringify(stats)),
    bump,
    addDeath,
    addClear,
    flush,
    resetStats,
  };
})();
