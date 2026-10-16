'use strict';

/**
 * MY LEVELS (v15.0; folders, duplicates and pictures since v15.1): every level this player has made, from the store
 * (js/levelstore.js). Play one, edit it, duplicate it, move it to a folder, rename it, delete it (it asks first), or
 * start a new one. A level that is not finished (js/levelcheck.js) is listed as "Unfinished" and cannot be played
 * from here - only edited. One that could not be read is listed as damaged and can only be deleted; one made by a
 * newer version of the game can be played and renamed here, but not edited (this version would lose what it does
 * not understand). It does nothing to the game itself: `env` plays and edits.
 *
 * FOLDERS: a row of them along the top - All, Unsorted and each folder, with how many levels it holds - sorted by
 * name or by the newest edit in them (the same choice sorts the levels). With a folder open: rename it, delete it
 * (its levels go back to Unsorted; deleting them too is a separate, clearly worded choice that asks twice), or
 * play it through in order. Which folder a level is in is kept by the store, never in the level.
 *
 * BONUS LEVELS (v15.2): a second tab on the same screen, for the levels that come with the game (the store's
 * read-only `bonus` source, js/bonus-levels.js). Listed in their own order with their difficulty, a picture and a
 * tick once finished; Play, and Copy to My Levels (an editable copy with a new id, in Unsorted). Nothing here edits,
 * renames or deletes them: there are no such buttons, and the store refuses anyway.
 */
const EchoMyLevels = (() => {
  function create(env) {
    const el = env.el;
    let open = 'all'; // 'all' | 'unsorted' | a folder's id
    let sortBy = 'recent'; // 'recent' | 'name'
    let view = 'mine'; // (v15.2) 'mine' | 'bonus': which tab is showing

    function when(iso) {
      const d = new Date(iso);
      if (!isFinite(d.getTime())) return '';
      try {
        return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      } catch (e) {
        return d.toISOString().slice(0, 10);
      }
    }

    const tell = (title, text) => env.dialog.open({ title, text, buttons: [{ id: 'ok', label: 'OK', primary: true }] });
    const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

    /** The level itself, read again from the store (the list may be older than what is stored). */
    function fetch(it) {
      const got = env.store.get(it.id);
      if (!got || !got.doc) {
        tell("Couldn't open it", got && got.damaged ? 'This level is damaged and could not be read.' : 'This level is not there any more.');
        render();
        return null;
      }
      return got;
    }

    function play(it) {
      const got = fetch(it);
      if (!got) return;
      const err = env.play(got.doc);
      if (err) tell("Can't play it yet", err);
    }

    function edit(it) {
      const got = fetch(it);
      if (!got) return;
      if (got.foreign) {
        tell("Can't edit it here", 'This level was made in a newer version of Echo Maze, and this version would lose the parts it does not understand. You can still play it and rename it.');
        return;
      }
      env.edit(got.doc);
    }

    async function rename(it) {
      const got = fetch(it);
      if (!got) return;
      const r = await env.dialog.open({
        title: 'Rename level',
        input: { value: got.doc.title, max: EchoLevelFormat.LIMITS.title, label: 'Level name' },
        buttons: [{ id: 'ok', label: 'Rename', primary: true }, { id: 'cancel', label: 'Cancel' }],
        cancel: 'cancel',
      });
      if (r.id !== 'ok') return;
      got.doc.title = EchoLevelFormat.cleanTitle(r.value);
      const res = env.store.save(got.doc);
      if (!res.ok) tell("Couldn't rename it", res.error);
      render();
    }

    async function remove(it) {
      const r = await env.dialog.open({
        title: 'Delete this level?',
        text: `"${it.title}" will be gone for good. This can't be undone.`,
        buttons: [{ id: 'delete', label: 'Delete', primary: true, danger: true }, { id: 'cancel', label: 'Cancel' }],
        cancel: 'cancel',
      });
      if (r.id !== 'delete') return;
      if (!env.store.delete(it.id)) tell("Couldn't delete it", 'This browser would not let the game change what it has stored.');
      render();
    }

    /** (v15.1) A copy, called "Copy of ...", in the same folder. */
    function duplicate(it) {
      const res = env.store.duplicate(it.id);
      if (!res.ok) tell("Couldn't duplicate it", res.error);
      render();
    }

    /** (v15.1) Into a folder, or back to Unsorted. */
    async function move(it) {
      const folders = env.store.listFolders().sort((a, b) => byName(a.name, b.name));
      if (!folders.length) {
        tell('No folders yet', 'Make a folder first with New folder, then move levels into it.');
        return;
      }
      const r = await env.dialog.open({
        title: `Move "${it.title}"`,
        select: { options: [{ value: '', label: 'Unsorted' }].concat(folders.map((f) => ({ value: f.id, label: f.name }))), value: it.folder || '', label: 'Folder' },
        buttons: [{ id: 'move', label: 'Move', primary: true }, { id: 'cancel', label: 'Cancel' }],
        cancel: 'cancel',
      });
      if (r.id !== 'move') return;
      if (!env.store.moveLevel(it.id, r.value || null)) tell("Couldn't move it", 'This browser would not let the game change what it has stored.');
      render();
    }

    // ---------------------------------------------------------------- bonus levels (v15.2)
    function playBonus(it) {
      const got = env.bonus.get(it.id);
      if (!got || !got.doc) {
        tell("Couldn't open it", 'This bonus level could not be read.');
        render();
        return;
      }
      const err = env.playBonus(got.doc);
      if (err) tell("Can't play it", err);
    }
    async function copyBonus(it) {
      const res = env.copyBonus(it.id);
      if (!res.ok) {
        tell("Couldn't copy it", res.error);
        return;
      }
      const r = await env.dialog.open({
        title: 'Copied to My Levels',
        text: `Your copy of "${it.title}" is in My Levels, in Unsorted. It is yours to change; the bonus level stays as it is.`,
        buttons: [{ id: 'edit', label: 'Edit the copy', primary: true }, { id: 'ok', label: 'OK' }],
        cancel: 'ok',
      });
      if (r.id === 'edit') {
        setView('mine', true);
        env.edit(res.doc);
      } else render();
    }
    function bonusRow(it, n) {
      const r = document.createElement('div');
      r.className = `lv-row bonus ${it.damaged ? 'damaged' : it.playable ? 'playable' : 'unfinished'}${it.done ? ' done' : ''}`;
      r.dataset.id = it.id;
      const info = document.createElement('div');
      info.className = 'lv-info';
      const head = document.createElement('div');
      head.className = 'lv-head';
      const num = document.createElement('span');
      num.className = 'lv-num';
      num.textContent = n;
      const name = document.createElement('b');
      name.textContent = it.title;
      head.append(num, name);
      if (it.done) {
        const tick = document.createElement('span');
        tick.className = 'lv-tag lv-done';
        tick.textContent = 'Done';
        tick.title = 'You have finished this one';
        head.append(tick);
      }
      if (it.rating) {
        const d = document.createElement('span');
        d.className = `lv-tag lv-diff diff-${it.rating}`;
        d.textContent = EchoLevelFormat.ratingLabel(it.rating);
        head.append(d);
      }
      const meta = document.createElement('small');
      if (it.damaged || !it.playable) meta.textContent = `This level can't be played: ${it.problem}`;
      else meta.textContent = `${it.size.w} × ${it.size.h} · ${it.monsters ? `${it.monsters} monster${it.monsters === 1 ? '' : 's'}` : 'no monsters'}${it.exits > 1 ? ` · ${it.exits} exits` : ''}`;
      info.append(head, meta);
      const acts = document.createElement('div');
      acts.className = 'lv-actions';
      const button = (label, fn, opts = {}) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.className = opts.primary ? 'primary' : 'quiet';
        b.dataset.act = opts.act;
        b.setAttribute('aria-label', `${label}: ${it.title}`);
        b.disabled = !!opts.disabled;
        b.addEventListener('click', () => {
          env.click();
          fn(it);
        });
        return b;
      };
      acts.append(
        button('Play', playBonus, { primary: true, act: 'play', disabled: !it.playable }),
        button('Copy to My Levels', copyBonus, { act: 'copy', disabled: it.damaged })
      );
      r.append(thumb(it), info, acts);
      return r;
    }
    function renderBonus(items) {
      el.list.textContent = '';
      if (!items.length) {
        const p = document.createElement('p');
        p.className = 'lv-empty';
        p.textContent = 'There are no bonus levels in this copy of the game.';
        el.list.appendChild(p);
      }
      items.forEach((it, i) => el.list.appendChild(bonusRow(it, i + 1)));
      const done = items.filter((it) => it.done).length;
      el.note.textContent = `${done} of ${items.length} done. These levels come with the game: play them in any order. They can't be changed here - Copy to My Levels makes a version of your own. Nothing you do in them counts towards your progress, medals or stats.`;
      return items.length;
    }
    /** My Levels or Bonus Levels. */
    function setView(v, quiet) {
      view = v === 'bonus' && env.bonus ? 'bonus' : 'mine';
      const bonus = view === 'bonus';
      el.screen.classList.toggle('bonus-view', bonus);
      el.tabMine.classList.toggle('on', !bonus);
      el.tabBonus.classList.toggle('on', bonus);
      el.tabMine.setAttribute('aria-selected', bonus ? 'false' : 'true');
      el.tabBonus.setAttribute('aria-selected', bonus ? 'true' : 'false');
      el.head.textContent = bonus ? 'Bonus Levels' : 'My Levels';
      el.desc.textContent = bonus ? 'Ready-made levels that come with the game, from gentle to tough.' : 'Levels you have made. Play them, change them, or make a new one.';
      if (!quiet) render();
    }

    // ---------------------------------------------------------------- folders
    async function newFolder() {
      env.click();
      const r = await env.dialog.open({
        title: 'New folder',
        input: { value: '', max: EchoLevelStore.FOLDER_LIMITS.name, label: 'Folder name' },
        buttons: [{ id: 'ok', label: 'Make folder', primary: true }, { id: 'cancel', label: 'Cancel' }],
        cancel: 'cancel',
      });
      if (r.id !== 'ok') return;
      const res = env.store.createFolder(r.value);
      if (!res.ok) tell("Couldn't make it", res.error);
      else open = res.folder.id;
      render();
    }
    async function renameFolder(f) {
      const r = await env.dialog.open({
        title: 'Rename folder',
        input: { value: f.name, max: EchoLevelStore.FOLDER_LIMITS.name, label: 'Folder name' },
        buttons: [{ id: 'ok', label: 'Rename', primary: true }, { id: 'cancel', label: 'Cancel' }],
        cancel: 'cancel',
      });
      if (r.id !== 'ok') return;
      const res = env.store.renameFolder(f.id, r.value);
      if (!res.ok) tell("Couldn't rename it", res.error);
      render();
    }
    async function deleteFolder(f) {
      const n = f.count;
      const levels = `${n} level${n === 1 ? '' : 's'}`;
      const r = await env.dialog.open({
        title: `Delete the folder "${f.name}"?`,
        text: n ? `Its ${levels} will be kept, and go back to Unsorted.` : 'It is empty.',
        buttons: n
          ? [{ id: 'keep', label: 'Delete folder, keep levels', primary: true }, { id: 'all', label: `Delete folder and its ${levels}`, danger: true }, { id: 'cancel', label: 'Cancel' }]
          : [{ id: 'keep', label: 'Delete folder', primary: true }, { id: 'cancel', label: 'Cancel' }],
        cancel: 'cancel',
      });
      if (r.id === 'cancel') return;
      let withLevels = false;
      if (r.id === 'all') {
        // a second, plain question: this one cannot be undone
        const sure = await env.dialog.open({
          title: `Delete ${levels} for good?`,
          text: `The folder "${f.name}" and every level in it will be gone for good. This can't be undone.`,
          buttons: [{ id: 'delete', label: `Delete ${levels}`, primary: true, danger: true }, { id: 'cancel', label: 'Cancel' }],
          cancel: 'cancel',
        });
        if (sure.id !== 'delete') return;
        withLevels = true;
      }
      const res = env.store.deleteFolder(f.id, { withLevels });
      if (!res.ok) tell("Couldn't delete it", res.error);
      open = 'all';
      render();
    }
    function playFolder(f, items) {
      const err = env.playQueue({ name: f.name, ids: items.map((it) => it.id) });
      if (err) tell("Can't play it yet", err);
    }

    // ---------------------------------------------------------------- drawing
    /** (v15.1) A small picture of the level: its walls, its start and its ways out. Cheap: one canvas, no art. */
    function thumb(it) {
      const c = document.createElement('canvas');
      c.className = 'lv-thumb';
      c.setAttribute('aria-hidden', 'true');
      const p = it.preview;
      const W = 76;
      const H = 52;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      c.style.width = `${W}px`;
      c.style.height = `${H}px`;
      if (!p) return c;
      const g = c.getContext('2d');
      const s = Math.min((W * dpr) / p.w, (H * dpr) / p.h);
      const ox = (W * dpr - s * p.w) / 2;
      const oy = (H * dpr - s * p.h) / 2;
      g.fillStyle = `rgba(${EchoPalette.rgb('wall')},0.08)`;
      g.fillRect(ox, oy, s * p.w, s * p.h);
      g.fillStyle = `rgba(${EchoPalette.rgb('wall')},0.6)`;
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.walls[y * p.w + x]) g.fillRect(ox + x * s, oy + y * s, Math.ceil(s), Math.ceil(s));
      const dot = (q, rgb, r) => {
        g.fillStyle = `rgb(${rgb})`;
        g.beginPath();
        g.arc(ox + (q.x + 0.5) * s, oy + (q.y + 0.5) * s, Math.max(1.6 * dpr, s * r), 0, Math.PI * 2);
        g.fill();
      };
      for (const e of p.exits) dot(e, e.locked ? EchoPalette.rgb('key') : EchoPalette.rgb('exit'), 0.7);
      if (p.start) dot(p.start, '238,248,255', 0.6);
      return c;
    }

    function row(it, folderName) {
      const r = document.createElement('div');
      r.className = `lv-row ${it.damaged ? 'damaged' : it.playable ? 'playable' : 'unfinished'}`;
      r.dataset.id = it.id;
      const info = document.createElement('div');
      info.className = 'lv-info';
      const head = document.createElement('div');
      head.className = 'lv-head';
      const name = document.createElement('b');
      name.textContent = it.title;
      const tag = document.createElement('span');
      tag.className = 'lv-tag';
      tag.textContent = it.damaged ? 'Damaged' : it.playable ? 'Playable' : 'Unfinished';
      head.append(name, tag);
      if (it.rating) {
        const d = document.createElement('span');
        d.className = `lv-tag lv-diff diff-${it.rating}`;
        d.textContent = EchoLevelFormat.ratingLabel(it.rating);
        head.append(d);
      }
      const meta = document.createElement('small');
      const where = folderName ? ` · in ${folderName}` : '';
      if (it.damaged) meta.textContent = `${it.problem} It can only be deleted.`;
      else if (it.foreign) meta.textContent = `Made in a newer version of Echo Maze: it can be played here, but not edited.${where}`;
      else if (it.playable) meta.textContent = `${it.size.w} × ${it.size.h} · ${it.monsters} monster${it.monsters === 1 ? '' : 's'}${it.exits > 1 ? ` · ${it.exits} exits` : ''} · saved ${when(it.updatedAt)}${where}`;
      else meta.textContent = `${it.problem} Edit it to finish it.${where}`;
      info.append(head, meta);
      const acts = document.createElement('div');
      acts.className = 'lv-actions';
      const button = (label, fn, opts = {}) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.className = opts.primary ? 'primary' : 'quiet';
        b.dataset.act = label.toLowerCase();
        b.setAttribute('aria-label', `${label}: ${it.title}`);
        if (opts.disabled) {
          b.disabled = true;
          if (opts.why) b.title = opts.why;
        }
        b.addEventListener('click', () => {
          env.click();
          fn(it);
        });
        return b;
      };
      acts.append(
        button('Play', play, { primary: true, disabled: !it.playable, why: it.damaged ? 'It could not be read.' : 'Unfinished: edit it to finish it.' }),
        button('Edit', edit, { disabled: it.damaged || it.foreign, why: it.foreign ? 'Made in a newer version.' : 'It could not be read.' }),
        button('Duplicate', duplicate, { disabled: it.damaged, why: 'It could not be read.' }),
        button('Move', move),
        button('Rename', rename, { disabled: it.damaged, why: 'It could not be read.' }),
        button('Delete', remove)
      );
      r.append(thumb(it), info, acts);
      return r;
    }

    function chip(id, label, count, onNow) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `lv-chip${onNow ? ' on' : ''}`;
      b.dataset.folder = id;
      b.setAttribute('aria-pressed', onNow ? 'true' : 'false');
      const n = document.createElement('span');
      n.textContent = label;
      const c = document.createElement('small');
      c.textContent = count;
      b.append(n, c);
      b.addEventListener('click', () => {
        env.click();
        open = id;
        render();
      });
      return b;
    }

    function render() {
      // (v15.2) the Bonus Levels tab says how many are done, whichever tab is showing
      const bonusItems = env.bonus ? env.bonus.list() : [];
      el.bonusCount.textContent = bonusItems.length ? `${bonusItems.filter((it) => it.done).length}/${bonusItems.length}` : '';
      el.tabBonus.classList.toggle('hidden', !env.bonus);
      if (view === 'bonus') return renderBonus(bonusItems);
      const all = env.store.list();
      const folders = env.store.listFolders();
      if (open !== 'all' && open !== 'unsorted' && !folders.some((f) => f.id === open)) open = 'all';
      // sorted by name, or by the newest edit
      folders.sort(sortBy === 'name' ? (a, b) => byName(a.name, b.name) : (a, b) => (b.editedAt > a.editedAt ? 1 : b.editedAt < a.editedAt ? -1 : byName(a.name, b.name)));
      const levels = all.slice().sort(sortBy === 'name' ? (a, b) => byName(a.title, b.title) : (a, b) => (b.updatedAt > a.updatedAt ? 1 : b.updatedAt < a.updatedAt ? -1 : 0));
      const nameOf = new Map(folders.map((f) => [f.id, f.name]));
      const unsorted = levels.filter((it) => !it.folder || !nameOf.has(it.folder));

      // the folder row
      el.folders.textContent = '';
      el.folders.append(chip('all', 'All', all.length, open === 'all'), chip('unsorted', 'Unsorted', unsorted.length, open === 'unsorted'));
      for (const f of folders) el.folders.append(chip(f.id, f.name, f.count, open === f.id));
      if (el.sort.value !== sortBy) el.sort.value = sortBy;

      // what is open
      const current = folders.find((f) => f.id === open) || null;
      const shown = open === 'all' ? levels : open === 'unsorted' ? unsorted : levels.filter((it) => it.folder === open);
      el.folderBar.textContent = '';
      el.folderBar.classList.toggle('hidden', !current);
      if (current) {
        const label = document.createElement('span');
        label.className = 'lv-folder-name';
        label.textContent = `${current.name} · ${current.count} level${current.count === 1 ? '' : 's'}`;
        const mk = (text, fn, cls, disabled) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = text;
          b.className = cls || 'quiet';
          b.disabled = !!disabled;
          b.addEventListener('click', () => {
            env.click();
            fn();
          });
          return b;
        };
        el.folderBar.append(
          label,
          mk('Play in order', () => playFolder(current, shown), 'primary', !shown.some((it) => it.playable)),
          mk('Rename folder', () => renameFolder(current)),
          mk('Delete folder', () => deleteFolder(current))
        );
      }

      el.list.textContent = '';
      if (!shown.length) {
        const p = document.createElement('p');
        p.className = 'lv-empty';
        p.textContent = !all.length ? 'Nothing here yet. Press New level to make your first one.' : current ? 'This folder is empty. Use Move on a level to put it here.' : 'Nothing here.';
        el.list.appendChild(p);
      }
      for (const it of shown) el.list.appendChild(row(it, open === 'all' && it.folder ? nameOf.get(it.folder) : ''));
      el.note.textContent = 'Your levels are kept in this browser, and only you can see them. Each one plays at the difficulty set in its own Level settings, whatever difficulty is picked on the title screen. Nothing you do in them counts towards your progress, medals or stats.';
      return shown.length;
    }

    el.sort.addEventListener('change', () => {
      sortBy = el.sort.value === 'name' ? 'name' : 'recent';
      el.sort.blur();
      render();
    });
    el.newFolder.addEventListener('click', newFolder);
    el.tabMine.addEventListener('click', () => {
      if (view !== 'mine') env.click();
      setView('mine');
    });
    el.tabBonus.addEventListener('click', () => {
      if (view !== 'bonus') env.click();
      setView('bonus');
    });

    return {
      render,
      /** The folder that is open (a new level is filed there), or null. */
      folder: () => (open !== 'all' && open !== 'unsorted' ? open : null),
      /** ?debug / tests: open a folder ('all', 'unsorted' or an id) and pick the sort. */
      show(id, sort) {
        if (id) open = id;
        if (sort) sortBy = sort === 'name' ? 'name' : 'recent';
        return render();
      },
      state: () => ({ open, sortBy, view }),
      /** (v15.2) 'mine' or 'bonus': which tab is showing. */
      view: () => view,
      setView: (v, quiet) => setView(v, quiet),
    };
  }

  return { create };
})();
