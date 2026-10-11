'use strict';

/**
 * WHERE CUSTOM LEVELS ARE KEPT (v15.0). Every save and every load of a custom level goes through here, and nothing
 * else in the game touches them. The interface is four calls:
 *   list()          -> [summary]   every level this source has, newest first (see `summary` below)
 *   get(id)         -> { id, doc, foreign, notes } | { id, damaged: true, error } | null (no such level)
 *   save(doc)       -> { ok: true, doc } | { ok: false, error }   (stamps updatedAt; `doc` is what was stored)
 *   delete(id)      -> true when it is gone
 * A summary: { id, source, title, updatedAt, createdAt, size: { w, h }, monsters, playable, problem, foreign,
 * damaged } - `problem` is the first thing stopping it being played (js/levelcheck.js), or ''.
 *
 * SOURCES. Today there is one, `local`: this browser's localStorage, the same storage every other save in the
 * game uses (`echomaze.*`), one key per level (LEVEL_PREFIX + its id) holding it as JSON in the saved format
 * (js/levelformat.js). A later update can add another source - levels from online, or imported ones - by making an
 * object with the same four calls (plus `id`, `label` and `writable`) and handing it to register(). The calls at
 * the top level are the local source's; sources() lists them all.
 *
 * Everything read is UNTRUSTED (anything could have written to this browser's storage, and later a source could
 * be anyone's): it is read through EchoLevelFormat.normalise, a level that cannot be read is listed as damaged
 * rather than thrown over, and no call here ever throws.
 */
const EchoLevelStore = (() => {
  const LEVEL_PREFIX = 'echomaze.level.';

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
        return localStorage.getItem(k) === null;
      } catch (e) {
        return false;
      }
    },
    keys() {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf(LEVEL_PREFIX) === 0) out.push(k);
        }
      } catch (e) {
        /* storage is blocked: there is nothing to list */
      }
      return out;
    },
  };

  function summary(source, id, read) {
    if (!read || !read.doc) {
      return { id, source, title: 'Damaged level', updatedAt: '', createdAt: '', size: null, monsters: 0, playable: false, problem: (read && read.error) || 'It could not be read.', foreign: false, damaged: true };
    }
    const doc = read.doc;
    const verdict = EchoLevelCheck.check(doc);
    return {
      id,
      source,
      title: doc.title,
      updatedAt: doc.updatedAt,
      createdAt: doc.createdAt,
      size: { w: doc.size.w, h: doc.size.h },
      monsters: doc.enemies.length + doc.extraEnemies.length,
      playable: verdict.playable,
      problem: verdict.playable ? '' : verdict.errors[0].text,
      foreign: !!read.foreign,
      damaged: false,
    };
  }

  /** This browser's own levels. */
  const local = {
    id: 'local',
    label: 'My Levels',
    writable: true,
    list() {
      const out = [];
      for (const k of ls.keys()) {
        const id = k.slice(LEVEL_PREFIX.length);
        if (!EchoLevelFormat.validId(id)) continue; // (not a key this game wrote)
        const read = EchoLevelFormat.normalise(ls.get(k));
        if (read.doc) read.doc.id = id; // the key it is filed under is its id, whatever the inside says
        out.push(summary('local', id, read));
      }
      out.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : b.updatedAt < a.updatedAt ? -1 : a.id < b.id ? -1 : 1));
      return out;
    },
    get(id) {
      if (!EchoLevelFormat.validId(id)) return null;
      const raw = ls.get(LEVEL_PREFIX + id);
      if (raw === null) return null;
      const read = EchoLevelFormat.normalise(raw);
      if (!read.doc) return { id, damaged: true, error: read.error };
      read.doc.id = id;
      return { id, doc: read.doc, foreign: read.foreign, notes: read.notes };
    },
    save(doc) {
      if (!doc || typeof doc !== 'object') return { ok: false, error: 'There was nothing to save.' };
      const read = EchoLevelFormat.normalise(EchoLevelFormat.toStorable(doc));
      if (!read.doc) return { ok: false, error: read.error || 'This level could not be saved.' };
      const d = read.doc;
      d.updatedAt = new Date().toISOString();
      if (!d.createdAt || d.createdAt > d.updatedAt) d.createdAt = d.updatedAt;
      if (!ls.set(LEVEL_PREFIX + d.id, EchoLevelFormat.serialise(d))) {
        return { ok: false, error: 'The level could not be saved: this browser is not letting the game store anything right now (its storage may be full, or turned off).' };
      }
      return { ok: true, doc: d };
    },
    delete(id) {
      if (!EchoLevelFormat.validId(id)) return false;
      return ls.remove(LEVEL_PREFIX + id);
    },
  };

  const all = [local];
  /** A later source of levels: an object with id, label, writable, list, get, save and delete. */
  function register(source) {
    if (!source || typeof source.id !== 'string' || all.some((s) => s.id === source.id)) return false;
    for (const fn of ['list', 'get', 'save', 'delete']) if (typeof source[fn] !== 'function') return false;
    all.push(source);
    return true;
  }

  return {
    LEVEL_PREFIX,
    local,
    sources: () => all.slice(),
    source: (id) => all.find((s) => s.id === id) || null,
    register,
    list: () => local.list(),
    get: (id) => local.get(id),
    save: (doc) => local.save(doc),
    delete: (id) => local.delete(id),
  };
})();
