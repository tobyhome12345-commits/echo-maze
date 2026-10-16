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
 *
 * SHARING (v15.3): Share on a playable level, Share folder on a folder - a code (js/sharecode.js) in a box with
 * Copy, and how long it is - and Enter code, which reads a pasted code, shows what it holds (and whether you already
 * have any of it) and saves nothing until Import (the store's importShared: one level to Unsorted, a folder as a new
 * folder, all or nothing). Bonus levels have no Share: a copy of one does. A shared level carries its creator name:
 * the one it came with, or else the player's own (env.creator(), set in the editor's Level settings).
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

    // ---------------------------------------------------------------- sharing (v15.3)
    const count = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
    const fmt = (n) => n.toLocaleString('en-GB');
    /** What a code holds, in words: the level(s), the title(s) and the creator name - nothing else. */
    function holds(authors, many) {
      const names = [...new Set(authors.filter(Boolean))];
      const what = many ? 'the levels and their titles' : 'the level and its title';
      if (!names.length) return `The code holds ${what} - nothing else. (You can add a creator name in the editor's Level settings.)`;
      return `The code holds ${what} and the creator name${names.length > 1 ? 's' : ''} ${names.map((n) => `"${n}"`).join(', ')} - nothing else.`;
    }
    /** Copy the code: the clipboard if the browser allows it, else select it so the player can copy it themselves. */
    async function copyCode(code, api) {
      let ok = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(code);
          ok = true;
        }
      } catch (e) {
        ok = false;
      }
      const box = api.box;
      try {
        box.focus({ preventScroll: true });
        box.select();
        box.setSelectionRange(0, box.value.length);
        if (!ok && document.execCommand) ok = document.execCommand('copy');
      } catch (e) {
        /* selected (or not) - the words below say what to do */
      }
      api.status(ok ? 'Copied. Paste it wherever you like.' : 'This browser would not let the game copy it, so the code is selected: press Ctrl+C (Cmd+C on a Mac) to copy it. On a phone, press and hold it and choose Copy.');
      return ok;
    }
    function showCode(title, code, lines) {
      return env.dialog.open({
        title,
        text: lines.filter(Boolean).concat(`${fmt(code.length)} characters.`).join('\n\n'),
        area: { value: code, readonly: true, label: 'Share code' },
        buttons: [{ id: 'copy', label: 'Copy', primary: true, stay: true, act: (api) => copyCode(code, api) }, { id: 'done', label: 'Done' }],
        cancel: 'done',
      });
    }
    /** A level as it goes into a code: its own creator name if it came with one, else the player's. */
    function forSharing(doc) {
      const d = EchoLevelFormat.copy(doc);
      d.authorName = d.authorName || env.creator();
      return d;
    }
    async function share(it) {
      const got = fetch(it);
      if (!got) return;
      if (got.foreign) return tell("Can't share it", 'This level was made in a newer version of Echo Maze, and this version would leave out the parts it does not understand.');
      const doc = forSharing(got.doc);
      const res = await env.share.encodeLevel(doc);
      if (!res.ok) return tell("Couldn't share it", res.error);
      return showCode(`Share "${doc.title}"`, res.code, ['Anyone who pastes this code into their Echo Maze (My Levels, Enter code) gets their own copy of this level.', holds([doc.authorName], false)]);
    }
    async function shareFolder(f, items) {
      const ok = [];
      const skipped = [];
      for (const it of items.slice().sort((a, b) => byName(a.title, b.title) || (a.id < b.id ? -1 : 1))) {
        if (it.damaged) skipped.push(`"${it.title}" - it could not be read`);
        else if (it.foreign) skipped.push(`"${it.title}" - made in a newer version`);
        else if (!it.playable) skipped.push(`"${it.title}" - unfinished: ${it.problem}`);
        else ok.push(it);
      }
      const skippedText = skipped.length ? `Not included (only levels that can be played are shared):\n${skipped.map((x) => `• ${x}`).join('\n')}` : '';
      if (!ok.length) return tell('Nothing to share yet', [`None of the levels in "${f.name}" can be played yet, so there is nothing to share.`, skippedText].filter(Boolean).join('\n\n'));
      const tooBig = (why) => tell('This folder is too big to share', `${why} Share it in smaller folders: make a new folder and move some of the levels into it.`);
      if (ok.length > env.share.LIMITS.folderLevels) return tooBig(`A folder code can hold up to ${env.share.LIMITS.folderLevels} levels, and "${f.name}" has ${ok.length} that can be played.`);
      const docs = [];
      for (const it of ok) {
        const got = env.store.get(it.id);
        if (!got || !got.doc) return tell("Couldn't share it", `"${it.title}" could not be read.`);
        docs.push(forSharing(got.doc));
      }
      // (in a fixed order - by title, then by content - so the same folder always makes the same code)
      docs.sort((a, b) => byName(a.title, b.title) || (env.share.contentKey(a) < env.share.contentKey(b) ? -1 : 1));
      const res = await env.share.encodeFolder(f.name, docs);
      if (!res.ok) return res.code === 'tooLong' ? tooBig(`This folder's code ${res.error.charAt(0).toLowerCase()}${res.error.slice(1)}`) : tell("Couldn't share it", res.error);
      return showCode(`Share the folder "${f.name}"`, res.code, [
        `Anyone who pastes this code into their Echo Maze (My Levels, Enter code) gets a new folder "${f.name}" with ${count(docs.length, 'level')}: ${docs.map((d) => `"${d.title}"`).join(', ')}.`,
        holds(docs.map((d) => d.authorName), true),
        skippedText,
      ]);
    }

    /** One line about a level from a code (the preview). Every word in it was cleaned when the code was read. */
    function describe(doc) {
      const n = doc.enemies.length;
      return `${doc.size.w} × ${doc.size.h} · ${n ? count(n, 'monster') : 'no monsters'} · ${count(doc.exits.length, 'exit')} · ${EchoLevelFormat.ratingLabel(doc.difficulty.rating)}`;
    }
    /** Enter code: paste, read, look at what it holds, then Import or Cancel. Nothing is saved before Import. */
    async function enterCode(prefill) {
      const r = await env.dialog.open({
        title: 'Enter a code',
        text: 'Paste a level code someone shared with you. You will see what it holds before anything is saved.',
        area: { value: prefill || '', placeholder: 'ECHO1...', label: 'Level code' },
        buttons: [{ id: 'read', label: 'Preview', primary: true }, { id: 'cancel', label: 'Cancel' }],
        cancel: 'cancel',
      });
      if (r.id !== 'read') return null;
      const res = await env.share.decode(r.value || '');
      if (!res.ok) {
        const again = await env.dialog.open({ title: "Couldn't read that code", text: res.error, buttons: [{ id: 'again', label: 'Try again', primary: true }, { id: 'close', label: 'Close' }], cancel: 'close' });
        if (again.id === 'again') return enterCode(r.value);
        return null;
      }
      return preview(res);
    }
    async function preview(res) {
      // already have any of it? (the same content - walls, things, settings - whatever its title)
      const mine = new Map();
      for (const it of env.store.list()) {
        if (it.damaged) continue;
        const got = env.store.get(it.id);
        if (got && got.doc) mine.set(env.share.contentKey(got.doc), got.doc.title);
      }
      const dups = res.levels.filter((d) => mine.has(env.share.contentKey(d))).map((d) => (mine.get(env.share.contentKey(d)) === d.title ? `"${d.title}"` : `"${d.title}" (yours is called "${mine.get(env.share.contentKey(d))}")`));
      const lines = [];
      let title;
      if (res.kind === 'folder') {
        const name = env.store.freeFolderName(res.folderName);
        title = `A folder: "${res.folderName}"`;
        lines.push(`${count(res.levels.length, 'level')}:\n${res.levels.map((d) => `• "${d.title}"${d.authorName ? ` by ${d.authorName}` : ''} - ${describe(d)}`).join('\n')}`);
        lines.push(name === res.folderName ? `They will go into a new folder, "${name}".` : `You already have a folder called "${res.folderName}", so they will go into a new one, "${name}".`);
      } else {
        const d = res.levels[0];
        title = `A level: "${d.title}"`;
        lines.push([d.authorName ? `By ${d.authorName}` : 'No creator name', describe(d)].join('\n'));
        lines.push('It will go into My Levels, in Unsorted.');
      }
      if (dups.length) lines.push(`You already have ${dups.length === res.levels.length && dups.length === 1 ? 'this level' : `${dups.length === 1 ? 'one of these levels' : `${dups.length} of these levels`}`}: ${dups.join(', ')}. Import ${res.levels.length === 1 ? 'it' : 'them'} anyway?`);
      lines.push('Nothing in it counts towards your progress, medals or stats.');
      const r = await env.dialog.open({ title, text: lines.join('\n\n'), buttons: [{ id: 'import', label: dups.length ? 'Import anyway' : 'Import', primary: true }, { id: 'cancel', label: 'Cancel' }], cancel: 'cancel' });
      if (r.id !== 'import') return { imported: false };
      const done = env.store.importShared(res);
      if (!done.ok) {
        tell("Couldn't import it", done.error);
        return { imported: false, error: done.error };
      }
      setView('mine', true);
      open = done.folder ? done.folder.id : 'unsorted';
      render();
      tell('Imported', done.folder ? `The folder "${done.folder.name}" is in My Levels, with ${count(done.ids.length, 'level')} in it.` : `"${res.levels[0].title}" is in My Levels, in Unsorted.`);
      return { imported: true, ids: done.ids, folder: done.folder };
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
      else if (it.playable) meta.textContent = `${it.author ? `by ${it.author} · ` : ''}${it.size.w} × ${it.size.h} · ${it.monsters} monster${it.monsters === 1 ? '' : 's'}${it.exits > 1 ? ` · ${it.exits} exits` : ''} · saved ${when(it.updatedAt)}${where}`;
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
        button('Share', share, { disabled: !it.playable || it.foreign, why: it.damaged ? 'It could not be read.' : it.foreign ? 'Made in a newer version.' : 'Unfinished: only a level that can be played can be shared.' }),
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
          mk('Share folder', () => shareFolder(current, shown), 'quiet', !shown.length),
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
      el.note.textContent = 'Your levels are kept in this browser. Nobody else sees them unless you share a code (Share) - and Enter code imports one someone shared with you. Each one plays at the difficulty set in its own Level settings, whatever difficulty is picked on the title screen. Nothing you do in them counts towards your progress, medals or stats.';
      return shown.length;
    }

    el.sort.addEventListener('change', () => {
      sortBy = el.sort.value === 'name' ? 'name' : 'recent';
      el.sort.blur();
      render();
    });
    el.newFolder.addEventListener('click', newFolder);
    el.enterCode.addEventListener('click', () => {
      env.click();
      enterCode();
    });
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
      /** (v15.3) the sharing screens, for tests: each returns when its dialogs are done */
      share: (id) => share({ id }),
      shareFolder: (folderId) => {
        const items = env.store.list().filter((it) => it.folder === folderId);
        const f = env.store.listFolders().find((x) => x.id === folderId);
        return f ? shareFolder(f, items) : null;
      },
      enterCode: (text) => enterCode(text),
    };
  }

  return { create };
})();
