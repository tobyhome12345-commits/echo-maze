'use strict';

/**
 * MY LEVELS (v15.0): every level this player has made, from the store (js/levelstore.js). Play one, edit it,
 * rename it, delete it (it asks first), or start a new one. A level that is not finished (js/levelcheck.js) is
 * listed as "Unfinished" and cannot be played from here - only edited. One that could not be read is listed as
 * damaged and can only be deleted; one made by a newer version of the game can be played and renamed here, but
 * not edited (this version would lose what it does not understand). It does nothing to the game itself: `env`
 * plays and edits.
 */
const EchoMyLevels = (() => {
  function create(env) {
    const el = env.el;

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

    function row(it) {
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
      const meta = document.createElement('small');
      if (it.damaged) meta.textContent = `${it.problem} It can only be deleted.`;
      else if (it.foreign) meta.textContent = 'Made in a newer version of Echo Maze: it can be played here, but not edited.';
      else if (it.playable) meta.textContent = `${it.size.w} × ${it.size.h} · ${it.monsters} monster${it.monsters === 1 ? '' : 's'} · saved ${when(it.updatedAt)}`;
      else meta.textContent = `${it.problem} Edit it to finish it.`;
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
        button('Rename', rename, { disabled: it.damaged, why: 'It could not be read.' }),
        button('Delete', remove)
      );
      r.append(info, acts);
      return r;
    }

    function render() {
      const items = env.store.list();
      el.list.textContent = '';
      if (!items.length) {
        const p = document.createElement('p');
        p.className = 'lv-empty';
        p.textContent = 'Nothing here yet. Press New level to make your first one.';
        el.list.appendChild(p);
      }
      for (const it of items) el.list.appendChild(row(it));
      el.note.textContent = `Your levels are kept in this browser, and only you can see them. They play on ${env.modeLabel()} - change the difficulty on the title screen. Nothing you do in them counts towards your progress, medals or stats.`;
      return items.length;
    }

    return { render };
  }

  return { create };
})();
