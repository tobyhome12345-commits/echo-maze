'use strict';

/**
 * WHERE CUSTOM LEVELS ARE KEPT (v15.0; folders and duplicates since v15.1). Every save and every load of a custom
 * level goes through here, and nothing else in the game touches them. The interface for levels is four calls:
 *   list()          -> [summary]   every level this source has, newest first (see `summary` below)
 *   get(id)         -> { id, doc, foreign, notes } | { id, damaged: true, error } | null (no such level)
 *   save(doc)       -> { ok: true, doc } | { ok: false, error }   (stamps updatedAt; `doc` is what was stored)
 *   delete(id)      -> true when it is gone
 * and one more since v15.1:
 *   duplicate(id)   -> { ok: true, doc } | { ok: false, error }   (a copy with a new id, "Copy of ...", in the same folder)
 * A summary: { id, source, title, updatedAt, createdAt, size: { w, h }, monsters, playable, problem, foreign,
 * damaged, rating, exits, folder, preview } - `problem` is the first thing stopping it being played
 * (js/levelcheck.js), or ''; `rating` is its difficulty; `folder` the id of the folder it is in, or null (Unsorted);
 * `preview` what a small picture of it needs ({ w, h, walls, start, exits }).
 *
 * FOLDERS (v15.1). Flat - a folder holds levels, never other folders - and a level is in one folder or in none
 * ("Unsorted"). Which folder a level is in is NOT part of the level: a level stays a clean piece of data that
 * could be handed to someone on its own. It is kept in its own list, one key (FOLDERS_KEY):
 *   { schemaVersion: 1, folders: [{ id, name, createdAt, updatedAt }], levels: { <level id>: <folder id> } }
 *   listFolders() -> [{ id, name, createdAt, updatedAt, count, editedAt }]   (editedAt: its newest level's, or its own)
 *   createFolder(name) / renameFolder(id, name)  -> { ok, folder } | { ok: false, error }
 *   deleteFolder(id, { withLevels })              -> { ok, moved, deleted }  (by default its levels go back to Unsorted)
 *   moveLevel(levelId, folderId | null)           -> true when it was moved (null = Unsorted)
 *   folderOf(levelId)                             -> a folder id, or null
 * A level that is deleted leaves its folder too; a folder entry for a level that is not there is ignored (and
 * tidied away on the next write). v15.0 had no folders: every level it made is simply in Unsorted.
 *
 * SOURCES. Today there is one, `local`: this browser's localStorage, the same storage every other save in the
 * game uses (`echomaze.*`), one key per level (LEVEL_PREFIX + its id) holding it as JSON in the saved format
 * (js/levelformat.js). A later update can add another source - levels from online, or imported ones - by making an
 * object with the same calls (plus `id`, `label` and `writable`) and handing it to register(). The calls at the
 * top level are the local source's; sources() lists them all.
 *
 * Everything read is UNTRUSTED (anything could have written to this browser's storage, and later a source could
 * be anyone's): it is read through EchoLevelFormat.normalise (and the folder list through readFolders), a level that
 * cannot be read is listed as damaged rather than thrown over, and no call here ever throws.
 */
const EchoLevelStore = (() => {
  const LEVEL_PREFIX = 'echomaze.level.';
  const FOLDERS_KEY = 'echomaze.folders';
  const FOLDER_LIMITS = { folders: 50, name: 32 };
  const FOLDER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const UNSAFE = ['__proto__', 'constructor', 'prototype']; // (never an id: they are names objects already have)

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

  // ------------------------------------------------------------------ folders
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const cleanName = (s) => {
    if (typeof s !== 'string') return '';
    const plain = Array.from(s, (ch) => {
      const n = ch.codePointAt(0);
      return n < 32 || (n >= 127 && n < 160) || n === 0x2028 || n === 0x2029 ? ' ' : ch;
    }).join('');
    return Array.from(plain.replace(/\s+/g, ' ').trim()).slice(0, FOLDER_LIMITS.name).join('').trim();
  };
  const isoOr = (v, fallback) => {
    const t = typeof v === 'string' ? new Date(v).getTime() : NaN;
    return isFinite(t) && t > 946684800000 && t < 7258118400000 ? new Date(t).toISOString() : fallback;
  };
  function newFolderId() {
    let r = '';
    try {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      r = a[0].toString(36);
    } catch (e) {
      r = Math.floor(Math.random() * 0x7fffffff).toString(36);
    }
    return `fd-${Date.now().toString(36)}-${r}`;
  }

  /** The folder list, read as untrusted: bad entries dropped, names tidied, membership only into folders that exist. */
  function readFolders() {
    const empty = { schemaVersion: 1, folders: [], levels: {} };
    let src = null;
    try {
      const raw = ls.get(FOLDERS_KEY);
      if (raw && raw.length < 200000) src = JSON.parse(raw);
    } catch (e) {
      src = null;
    }
    if (!isObj(src)) return empty;
    const now = new Date().toISOString();
    const folders = [];
    const ids = new Set();
    for (const f of Array.isArray(src.folders) ? src.folders : []) {
      if (!isObj(f) || typeof f.id !== 'string' || !FOLDER_ID_RE.test(f.id) || UNSAFE.includes(f.id) || ids.has(f.id) || folders.length >= FOLDER_LIMITS.folders) continue;
      const name = cleanName(f.name) || 'Folder';
      ids.add(f.id);
      const createdAt = isoOr(f.createdAt, now);
      folders.push({ id: f.id, name, createdAt, updatedAt: isoOr(f.updatedAt, createdAt) });
    }
    const levels = {};
    if (isObj(src.levels)) {
      for (const k of Object.keys(src.levels)) {
        if (UNSAFE.includes(k)) continue;
        if (EchoLevelFormat.validId(k) && ids.has(src.levels[k])) levels[k] = src.levels[k];
      }
    }
    return { schemaVersion: 1, folders, levels };
  }
  function writeFolders(data) {
    return ls.set(FOLDERS_KEY, JSON.stringify({ schemaVersion: 1, folders: data.folders, levels: data.levels }));
  }
  const storageError = 'This browser is not letting the game store anything right now (its storage may be full, or turned off).';

  function folderOf(levelId) {
    const data = readFolders();
    return Object.prototype.hasOwnProperty.call(data.levels, levelId) ? data.levels[levelId] : null;
  }

  function listFolders() {
    const data = readFolders();
    const levelIds = new Set(ls.keys().map((k) => k.slice(LEVEL_PREFIX.length)));
    return data.folders.map((f) => {
      const members = Object.keys(data.levels).filter((id) => data.levels[id] === f.id && levelIds.has(id));
      let editedAt = f.updatedAt;
      for (const id of members) {
        const got = local.get(id);
        if (got && got.doc && got.doc.updatedAt > editedAt) editedAt = got.doc.updatedAt;
      }
      return { ...f, count: members.length, editedAt };
    });
  }

  function createFolder(name) {
    const n = cleanName(name);
    if (!n) return { ok: false, error: 'A folder needs a name.' };
    const data = readFolders();
    if (data.folders.length >= FOLDER_LIMITS.folders) return { ok: false, error: `You can have ${FOLDER_LIMITS.folders} folders at most.` };
    const now = new Date().toISOString();
    const f = { id: newFolderId(), name: n, createdAt: now, updatedAt: now };
    data.folders.push(f);
    if (!writeFolders(data)) return { ok: false, error: `The folder could not be made. ${storageError}` };
    return { ok: true, folder: f };
  }

  function renameFolder(id, name) {
    const n = cleanName(name);
    if (!n) return { ok: false, error: 'A folder needs a name.' };
    const data = readFolders();
    const f = data.folders.find((x) => x.id === id);
    if (!f) return { ok: false, error: 'That folder is not there any more.' };
    f.name = n;
    f.updatedAt = new Date().toISOString();
    if (!writeFolders(data)) return { ok: false, error: `The folder could not be renamed. ${storageError}` };
    return { ok: true, folder: f };
  }

  /** Delete a folder. Its levels go back to Unsorted - unless `withLevels`, when they are deleted for good too. */
  function deleteFolder(id, opts = {}) {
    const data = readFolders();
    if (!data.folders.some((x) => x.id === id)) return { ok: false, error: 'That folder is not there any more.', moved: 0, deleted: 0 };
    const members = Object.keys(data.levels).filter((lid) => data.levels[lid] === id);
    let deleted = 0;
    let moved = 0;
    for (const lid of members) {
      if (opts.withLevels) {
        if (local.delete(lid)) deleted++;
      } else moved++;
      delete data.levels[lid];
    }
    data.folders = data.folders.filter((x) => x.id !== id);
    if (!writeFolders(data)) return { ok: false, error: `The folder could not be deleted. ${storageError}`, moved: 0, deleted };
    return { ok: true, moved, deleted };
  }

  /** Put a level in a folder - or, with null, back in Unsorted. */
  function moveLevel(levelId, folderId) {
    if (!EchoLevelFormat.validId(levelId)) return false;
    const data = readFolders();
    if (folderId !== null && folderId !== undefined && !data.folders.some((x) => x.id === folderId)) return false;
    if (folderId === null || folderId === undefined) delete data.levels[levelId];
    else {
      data.levels[levelId] = folderId;
      const f = data.folders.find((x) => x.id === folderId);
      f.updatedAt = new Date().toISOString();
    }
    // (tidy: forget levels that are not there any more)
    const levelIds = new Set(ls.keys().map((k) => k.slice(LEVEL_PREFIX.length)));
    for (const k of Object.keys(data.levels)) if (!levelIds.has(k) && k !== levelId) delete data.levels[k];
    return writeFolders(data);
  }

  // ------------------------------------------------------------------ levels
  function summary(source, id, read, folders) {
    const folder = folders && Object.prototype.hasOwnProperty.call(folders.levels, id) ? folders.levels[id] : null;
    if (!read || !read.doc) {
      return { id, source, title: 'Damaged level', updatedAt: '', createdAt: '', size: null, monsters: 0, playable: false, problem: (read && read.error) || 'It could not be read.', foreign: false, damaged: true, rating: null, exits: 0, folder, preview: null };
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
      rating: doc.difficulty.rating,
      exits: doc.exits.length,
      folder,
      preview: { w: doc.size.w, h: doc.size.h, walls: EchoLevelFormat.wallGrid(doc), start: doc.start, exits: doc.exits.map((e) => ({ x: e.x, y: e.y, locked: e.locked })) },
    };
  }

  /** This browser's own levels. */
  const local = {
    id: 'local',
    label: 'My Levels',
    writable: true,
    list() {
      const out = [];
      const folders = readFolders();
      for (const k of ls.keys()) {
        const id = k.slice(LEVEL_PREFIX.length);
        if (!EchoLevelFormat.validId(id)) continue; // (not a key this game wrote)
        const read = EchoLevelFormat.normalise(ls.get(k));
        if (read.doc) read.doc.id = id; // the key it is filed under is its id, whatever the inside says
        out.push(summary('local', id, read, folders));
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
        return { ok: false, error: `The level could not be saved: ${storageError.charAt(0).toLowerCase()}${storageError.slice(1)}` };
      }
      return { ok: true, doc: d };
    },
    delete(id) {
      if (!EchoLevelFormat.validId(id)) return false;
      const gone = ls.remove(LEVEL_PREFIX + id);
      if (gone) {
        const data = readFolders();
        if (data.levels[id]) {
          delete data.levels[id];
          writeFolders(data);
        }
      }
      return gone;
    },
    duplicate(id) {
      const got = local.get(id);
      if (!got || !got.doc) return { ok: false, error: got && got.damaged ? 'This level is damaged and could not be read.' : 'This level is not there any more.' };
      const d = EchoLevelFormat.copy(got.doc);
      d.id = EchoLevelFormat.newId();
      d.title = EchoLevelFormat.cleanTitle(`Copy of ${got.doc.title}`);
      d.createdAt = new Date().toISOString();
      const res = local.save(d);
      if (res.ok) {
        const f = folderOf(id);
        if (f) moveLevel(res.doc.id, f);
      }
      return res;
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
    FOLDERS_KEY,
    FOLDER_LIMITS,
    local,
    sources: () => all.slice(),
    source: (id) => all.find((s) => s.id === id) || null,
    register,
    list: () => local.list(),
    get: (id) => local.get(id),
    save: (doc) => local.save(doc),
    delete: (id) => local.delete(id),
    duplicate: (id) => local.duplicate(id),
    listFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    moveLevel,
    folderOf,
    cleanFolderName: cleanName,
  };
})();
