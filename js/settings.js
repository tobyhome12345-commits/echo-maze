'use strict';

/**
 * The Settings screen: Controls, Audio, Display, Stats & Medals.
 *
 * Only the interface lives here. What it changes lives elsewhere - the saved data in js/profile.js, the
 * colours in js/palette.js, the buses in js/audio.js - and the game passes in the few things it owns
 * (mode, calm, cues, touch) as callbacks. Nothing in this file can reach the simulation.
 *
 * It opens from the title screen and from the pause menu and goes back to whichever it came from. Every
 * control is a real button or input, keyboard-reachable, and at least 44 px tall in touch mode (style.css).
 */
const EchoSettings = (() => {
  const P = EchoProfile;
  const $ = (id) => document.getElementById(id);

  function create(env) {
    let openFrom = null; // 'title' | 'pause' - where Back goes
    let tab = 'controls';
    let capturing = null; // { action, slot } while waiting for a key
    let pending = null; // { action, slot, code, other } while asking whether to swap
    let confirmingReset = false;

    const msgEl = () => $('keybind-msg');

    function message(text, kind = '') {
      const el = msgEl();
      el.textContent = text || '';
      el.className = `keybind-msg${kind ? ` ${kind}` : ''}${text ? '' : ' hidden'}`;
    }

    // ------------------------------------------------------------ controls
    function stopCapture() {
      capturing = null;
      pending = null;
      renderKeys();
    }

    function renderKeys() {
      const box = $('keybinds');
      box.textContent = '';
      for (const a of P.ACTIONS) {
        const row = document.createElement('div');
        row.className = 'keyrow';
        const name = document.createElement('span');
        name.className = 'keyname';
        name.textContent = a.label;
        row.appendChild(name);

        const slots = document.createElement('span');
        slots.className = 'keyslots';
        const codes = P.keysFor(a.id);
        for (let slot = 0; slot < P.MAX_KEYS; slot++) {
          const code = codes[slot];
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'keycap';
          const listening = capturing && capturing.action === a.id && capturing.slot === slot;
          if (listening) {
            b.classList.add('listening');
            b.textContent = 'press a key…';
          } else if (code) {
            b.textContent = P.keyLabel(code);
          } else {
            b.classList.add('empty');
            b.textContent = '+';
          }
          b.setAttribute('aria-label', code ? `${a.label}: ${P.keyLabel(code)}. Choose a new key` : `${a.label}: add a key`);
          b.addEventListener('click', () => {
            if (capturing && capturing.action === a.id && capturing.slot === slot) return stopCapture();
            pending = null;
            capturing = { action: a.id, slot };
            renderKeys();
            message('Press the key you want. Esc cancels.', 'live');
          });
          slots.appendChild(b);

          if (code && codes.length > 1) {
            const x = document.createElement('button');
            x.type = 'button';
            x.className = 'keyclear';
            x.textContent = '×';
            x.title = 'Remove this key';
            x.setAttribute('aria-label', `Remove ${P.keyLabel(code)} from ${a.label}`);
            x.addEventListener('click', () => {
              P.clearKey(a.id, slot);
              env.keysChanged();
              stopCapture();
              message(`${a.label}: ${P.keysText(a.id)}.`);
            });
            slots.appendChild(x);
          }
        }
        row.appendChild(slots);
        box.appendChild(row);

        // the "this key is already used - swap?" question sits under the row it belongs to
        if (pending && pending.action === a.id) {
          const ask = document.createElement('div');
          ask.className = 'keyask';
          const q = document.createElement('span');
          const otherLabel = (P.ACTIONS.find((x) => x.id === pending.other) || {}).label || pending.other;
          q.textContent = `${P.keyLabel(pending.code)} is already ${otherLabel}. Swap them?`;
          const yes = document.createElement('button');
          yes.type = 'button';
          yes.className = 'primary';
          yes.textContent = 'Swap';
          yes.addEventListener('click', () => {
            P.swapKey(pending.action, pending.slot, pending.code, pending.other);
            const done = `${a.label} is now ${P.keysText(a.id)}; ${otherLabel} is ${P.keysText(pending.other)}.`;
            env.keysChanged();
            stopCapture();
            message(done);
          });
          const no = document.createElement('button');
          no.type = 'button';
          no.textContent = 'Keep as it is';
          no.addEventListener('click', () => {
            stopCapture();
            message('');
          });
          ask.append(q, yes, no);
          box.appendChild(ask);
        }
      }
      $('btn-keys-reset').disabled = P.isDefaultKeys();
    }

    /**
     * A key was pressed while the Controls tab is waiting for one. Returns true if it was swallowed, so the
     * game does not also act on it. Called from the game's own keydown handler, before anything else.
     */
    function captureKey(e) {
      if (!capturing) return false;
      if (e.code === 'Escape') {
        stopCapture();
        message('Left as it was.');
        return true;
      }
      const ok = P.bindable(e);
      if (!ok.ok) {
        message(ok.why, 'warn');
        return true;
      }
      const { action, slot } = capturing;
      const other = P.actionFor(e.code, action); // (v19.3: an action that may share the key is not a clash)
      if (other && other !== action) {
        pending = { action, slot, code: e.code, other };
        capturing = null;
        renderKeys();
        message('');
        return true;
      }
      const label = (P.ACTIONS.find((x) => x.id === action) || {}).label || action;
      P.bindKey(action, slot, e.code);
      env.keysChanged();
      stopCapture();
      message(`${label} is now ${P.keysText(action)}.`);
      return true;
    }

    // --------------------------------------------------------------- audio
    function renderAudio() {
      const v = P.volumes();
      document.querySelectorAll('.vol-slider').forEach((sl) => {
        const bus = sl.dataset.bus || 'master';
        sl.value = Math.round((v[bus] != null ? v[bus] : 1) * 100);
        const out = document.querySelector(`[data-vol-out="${bus}"]`);
        if (out) out.textContent = `${sl.value}%`;
      });
    }

    // ------------------------------------------------------------- display
    function renderPalettes() {
      const box = $('palette-list');
      box.textContent = '';
      for (const p of EchoPalette.list()) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `palette${p.id === EchoPalette.id ? ' active' : ''}`;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', p.id === EchoPalette.id ? 'true' : 'false');
        const name = document.createElement('b');
        name.textContent = p.label;
        // a row of the palette's own colours, so the choice can be seen before it is made
        const strip = document.createElement('span');
        strip.className = 'swatches';
        for (const role of EchoPalette.RIPPLE_ROLES) {
          const dot = document.createElement('i');
          dot.style.background = `rgb(${EchoPalette.rgb(role, p.id)})`;
          dot.title = role;
          strip.appendChild(dot);
        }
        const note = document.createElement('small');
        note.textContent = p.note;
        b.append(name, strip, note);
        b.addEventListener('click', () => {
          env.setPalette(p.id);
          renderPalettes();
        });
        box.appendChild(b);
      }
    }

    // --------------------------------------------------------------- stats
    const hhmmss = (s) => {
      s = Math.max(0, Math.round(s));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
    };
    const metres = (px) => `${(px / 40).toFixed(0)} tiles`; // 40 px = one tile of the maze

    function statRow(parent, label, value) {
      const d = document.createElement('div');
      d.className = 'stat';
      const k = document.createElement('span');
      k.textContent = label;
      const v = document.createElement('b');
      v.textContent = value;
      d.append(k, v);
      parent.appendChild(d);
    }

    function renderStats() {
      const box = $('stats-body');
      box.textContent = '';
      const s = P.stats();

      const h1 = document.createElement('h3');
      h1.textContent = `Medals · ${env.modeLabel()}`;
      box.appendChild(h1);
      const sum = P.medalSummary(env.mode(), env.medalLevels()); // only the levels that take medals (1-12), not the whole campaign
      const mw = document.createElement('div');
      mw.className = 'medal-row';
      mw.append(
        medalChip('time', P.GOLD, `Gold ${sum.gold}`),
        medalChip('time', P.SILVER, `Silver ${sum.silver}`),
        medalChip('time', P.BRONZE, `Bronze ${sum.bronze}`),
        medalChip('flawless', 1, `Flawless ${sum.flawless}`)
      );
      box.appendChild(mw);
      statRow(box, 'Medals won on this mode', `${sum.won} of ${sum.total}`);

      const grid = document.createElement('div');
      grid.className = 'medal-grid';
      for (let n = 1; n <= env.medalLevels(); n++) {
        const rec = P.medalsFor(env.mode(), n);
        const cell = document.createElement('div');
        cell.className = `medal-cell${rec ? '' : ' none'}`;
        const num = document.createElement('b');
        num.textContent = n;
        const pips = document.createElement('span');
        pips.className = 'pips';
        pips.append(medalPip('time', rec ? rec.time : 0), medalPip('ripples', rec ? rec.ripples : 0), medalPip('flawless', rec && rec.flawless ? 1 : 0));
        cell.append(num, pips);
        if (rec) {
          const best = [];
          if (rec.bestTime != null) best.push(`best ${hhmmss(rec.bestTime)}`);
          if (rec.bestRipples != null) best.push(`${rec.bestRipples} ripples`);
          cell.title = `Level ${n}: ${best.join(', ')}`;
        } else {
          cell.title = `Level ${n}: not cleared on this mode`;
        }
        grid.appendChild(cell);
      }
      box.appendChild(grid);

      const h2 = document.createElement('h3');
      h2.textContent = 'Everything so far';
      box.appendChild(h2);
      statRow(box, 'Levels cleared', s.cleared);
      statRow(box, 'Deaths', s.deaths);
      statRow(box, 'Ripples sent', s.ripples);
      statRow(box, 'Times crouched', s.crouches);
      statRow(box, 'Sonar decoys used', s.decoys);
      statRow(box, 'Times marked by the Singer', s.marked);
      statRow(box, 'Near misses survived', s.nearMisses || 0);
      statRow(box, 'Time played', hhmmss(s.playTime));
      statRow(box, 'Distance walked', metres(s.distance));

      const h3 = document.createElement('h3');
      h3.textContent = 'What killed you';
      box.appendChild(h3);
      const names = { echo: 'Echo monster', scent: 'Scent monster', mimic: 'Mimic', stalker: 'Stalker', muffler: 'Muffler', singer: 'Singer', warden: 'Hunted down (levels 15, 16, 20, 24)', void: 'Fell into the void' }; // (the Warden is never named on screen)
      let any = false;
      for (const k of P.DEATH_KINDS) {
        if (!s.deathsBy[k]) continue;
        any = true;
        statRow(box, names[k] || k, s.deathsBy[k]);
      }
      if (!any) statRow(box, 'Nothing yet', '—');

      const h4 = document.createElement('h3');
      h4.textContent = 'By difficulty';
      box.appendChild(h4);
      for (const m of env.modeIds()) {
        const row = s.byMode[m] || { cleared: 0, deaths: 0 };
        statRow(box, env.modeLabel(m), `${row.cleared} cleared · ${row.deaths} deaths`);
      }
    }

    /** A medal pip: a small coloured dot, its shape telling the three kinds apart at a glance. */
    function medalPip(kind, tier) {
      const i = document.createElement('i');
      i.className = `pip pip-${kind} tier-${tier}`;
      const tname = kind === 'flawless' ? (tier ? 'won' : 'not won') : P.TIER_NAMES[tier] || 'none';
      i.title = `${kind === 'time' ? 'Time' : kind === 'ripples' ? 'Ripples' : 'Flawless'}: ${tname}`;
      i.setAttribute('aria-label', i.title);
      return i;
    }

    /** A medal pip with a label beside it. */
    function medalChip(kind, tier, text) {
      const s = document.createElement('span');
      s.className = 'medal-chip';
      s.append(medalPip(kind, tier));
      const t = document.createElement('span');
      t.textContent = text;
      s.appendChild(t);
      return s;
    }

    // ---------------------------------------------------------------- tabs
    function showTab(id) {
      tab = id;
      document.querySelectorAll('#settings .tab').forEach((b) => {
        const on = b.dataset.tab === id;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      document.querySelectorAll('#settings .tabpane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== id));
      if (id === 'stats') renderStats();
      if (id === 'controls') renderKeys();
      if (id === 'audio') renderAudio();
      if (id === 'display') renderPalettes();
      if (id === 'cosmetics') renderCosmetics();
      else stopPreview();
      if (id === 'savecode') renderSaveCode(); // (v22.0)
    }

    // ---------------------------------------------------------------- (v21.0) cosmetics
    /**
     * Three rows of tiles - your ripple's colour, its shape, your marker - each showing the look; the locked ones dimmed,
     * with what unlocks them (in plain words, never a spoiler: js/cosmetics.js condition). A tap or a click equips one.
     * A live preview above them: your marker, your ripple going out every couple of seconds. Opening the tab marks every
     * unlock as seen, so the "new" dot goes.
     */
    const COS_ROWS = [['color', 'cos-colors'], ['shape', 'cos-shapes'], ['marker', 'cos-markers']];
    let previewRaf = 0;
    let previewT0 = 0;
    function cosCanvas(cv, wCss, hCss) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(wCss * dpr);
      cv.height = Math.round(hCss * dpr);
      cv.style.width = `${wCss}px`;
      cv.style.height = `${hCss}px`;
      const c = cv.getContext('2d');
      return { c, dpr };
    }
    function drawTile(cv, kind, item, cur) {
      const C = EchoCosmetics;
      const { c, dpr } = cosCanvas(cv, 64, 44);
      const lk = C.look(Object.assign({}, cur, { [kind]: item }));
      c.scale(dpr, dpr);
      // (drawPreview resets the transform: draw at device pixels instead)
      c.setTransform(1, 0, 0, 1, 0, 0);
      const opts = { still: C.RIPPLE_EVERY * 0.6, paletteWall: env.paletteWall(), size: 4.5 * dpr * 1.1, calm: env.calm() };
      if (kind === 'marker') Object.assign(opts, { wave: false, walls: false, size: 5.2 * dpr });
      C.drawPreview(c, cv.width, cv.height, lk, opts);
    }
    function renderCosmetics() {
      const C = EchoCosmetics;
      const f = env.cosFacts();
      const fresh = new Set(C.fresh(f));
      const cur = C.current(f);
      for (const [kind, boxId] of COS_ROWS) {
        const box = $(boxId);
        if (!box) continue;
        box.textContent = '';
        for (const it of C.LISTS[kind]) {
          const open = C.isUnlocked(it, f);
          const on = cur[kind].id === it.id;
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `cos-tile${on ? ' on' : ''}${open ? '' : ' locked'}`;
          b.dataset.kind = kind;
          b.dataset.id = it.id;
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          const cond = open ? '' : C.condition(it, f);
          if (!open) b.setAttribute('aria-disabled', 'true');
          b.setAttribute('aria-label', `${it.name}${on ? ', equipped' : ''}${open ? '' : `, locked - ${cond}`}`);
          const cv = document.createElement('canvas');
          cv.className = 'cos-true';
          cv.setAttribute('aria-hidden', 'true');
          b.appendChild(cv);
          const name = document.createElement('span');
          name.className = 'cos-name';
          name.textContent = it.name;
          b.appendChild(name);
          if (fresh.has(`${kind}:${it.id}`)) {
            const tag = document.createElement('span');
            tag.className = 'cos-new';
            tag.textContent = 'New';
            b.appendChild(tag);
          }
          if (!open) {
            const why = document.createElement('small');
            why.className = 'cos-why';
            why.textContent = cond;
            b.appendChild(why);
          }
          b.addEventListener('click', () => {
            if (!open) return;
            env.click();
            if (C.equip(kind, it.id, env.cosFacts())) {
              env.cosmeticsChanged();
              renderCosmetics();
              const again = $(boxId).querySelector(`[data-id="${it.id}"]`);
              if (again) again.focus();
            }
          });
          box.appendChild(b);
          drawTile(cv, kind, it, cur);
        }
      }
      if (C.markSeen(f)) env.cosmeticsChanged(); // (seen now: the dot goes; the New tags stay until the tab is opened again)
      startPreview();
    }
    function startPreview() {
      stopPreview();
      const cv = $('cos-preview');
      if (!cv) return;
      previewT0 = performance.now();
      const frame = (now) => {
        previewRaf = 0;
        if (tab !== 'cosmetics' || !isOpen()) return;
        const C = EchoCosmetics;
        const cur = C.current(env.cosFacts());
        const wCss = cv.clientWidth || 240;
        const hCss = cv.clientHeight || 140;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (cv.width !== Math.round(wCss * dpr)) {
          cv.width = Math.round(wCss * dpr);
          cv.height = Math.round(hCss * dpr);
        }
        C.drawPreview(cv.getContext('2d'), cv.width, cv.height, C.look(cur), { t: (now - previewT0) / 1000, paletteWall: env.paletteWall(), size: 4.5 * dpr * 1.2, calm: env.calm() });
        previewRaf = requestAnimationFrame(frame);
      };
      previewRaf = requestAnimationFrame(frame);
      // one frame at once, so it is never blank (a backgrounded page runs no animation frames)
      frame(performance.now());
    }
    function stopPreview() {
      if (previewRaf) cancelAnimationFrame(previewRaf);
      previewRaf = 0;
    }
    const previewRunning = () => !!previewRaf;

    function refresh() {
      renderKeys();
      renderAudio();
      renderPalettes();
      if (tab === 'stats') renderStats();
      $('timer-toggle').checked = P.getShowTimer();
      // (v19.1) the daylight interface: not there at all until the outside has been reached
      const lu = !!(env.lightUnlocked && env.lightUnlocked());
      $('lightui-row').classList.toggle('hidden', !lu);
      $('lightui-toggle').disabled = !lu;
      $('lightui-toggle').checked = lu && env.lightUi();
    }

    function open(from) {
      openFrom = from;
      capturing = null;
      pending = null;
      confirmingReset = false;
      $('stats-confirm').classList.add('hidden');
      message('');
      scMsg(''); // (v22.0)
      refresh();
      showTab(tab);
      env.showOverlay('settings');
    }

    function close() {
      stopPreview(); // (v21.0)
      capturing = null;
      pending = null;
      env.closeSettings(openFrom);
      openFrom = null;
    }

    const isOpen = () => !$('settings').classList.contains('hidden');

    /**
     * The how-to blocks on the title and pause screens, built from the player's OWN keys so they always
     * match what the game is listening for.
     */
    function renderHowTo() {
      const caps = (action) => P.keysFor(action).map((c) => ({ text: P.keyLabel(c), wide: P.keyLabel(c).length > 2 }));
      const build = (el, rows) => {
        if (!el) return;
        el.textContent = '';
        for (const row of rows) {
          const d = document.createElement('div');
          for (const part of row) {
            if (typeof part === 'string') {
              const s = document.createElement('span');
              s.textContent = part;
              d.appendChild(s);
            } else {
              const k = document.createElement('kbd');
              if (part.wide) k.className = 'wide';
              k.textContent = part.text;
              d.appendChild(k);
            }
          }
          el.appendChild(d);
        }
      };
      const move = [].concat(caps('up'), caps('left'), caps('down'), caps('right'));
      build($('howto-title'), [
        [...move, 'move'],
        [...caps('ripple'), 'send a ripple'],
        [...caps('crouch'), 'hold to crouch: silent, but no ripples'],
        [...caps('mute'), 'mute', ...caps('pause'), 'pause', ...caps('calm'), 'calm', ...caps('cues'), 'visual cues'],
        [...caps('item'), 'use an item you have found'],
        ['New here? The Tutorial, on the title screen, walks you through it in the dark.'],
      ]);
      // (v15.5) the title's one line: the first key of each, to move, ripple and crouch (the rest is in How to play)
      const first = (action) => caps(action).slice(0, 1);
      const hint = $('title-hint');
      if (hint) {
        build(hint, [[...first('up'), ...first('left'), ...first('down'), ...first('right'), 'move', ...first('ripple'), 'send a ripple', ...first('crouch'), 'hold to crouch']]);
        // build() makes one <div> per row: the hint is a single line, so its parts go straight into the <p>
        const row = hint.firstElementChild;
        if (row) {
          while (row.firstChild) hint.appendChild(row.firstChild);
          row.remove();
        }
      }
      build($('howto-pause'), [
        [...move, 'move'],
        [...caps('ripple'), 'send a ripple'],
        [...caps('crouch'), 'hold to crouch: silent, but no ripples'],
        [...caps('item'), 'use an item', ...caps('pause'), 'resume'],
      ]);
    }

    // ---------------------------------------------------------------- (v22.0) save codes
    /**
     * Two halves. GET MY CODE: the save as a code (progress always; settings and levels only if ticked), made afresh
     * whenever the tab is shown or a box is ticked, with Copy code and Save as file. LOAD A CODE: paste one, or load
     * the file; a preview of what it holds in plain words (and a heads-up if it is further along than this device),
     * then Merge (the default) or Replace (asked twice); Undo last load until the next one. Loading only from the
     * title's Settings - never mid-level, where the game holds a run in memory.
     */
    let scToken = 0;
    let scCode = '';
    let scBusy = false;
    function scMsg(text, kind = '') {
      const el = $('sc-msg');
      el.textContent = text || '';
      el.className = `keybind-msg${kind ? ` ${kind}` : ''}${text ? '' : ' hidden'}`;
    }
    const canLoad = () => openFrom === 'title';
    function refreshSaveLoad() {
      const can = canLoad();
      for (const id of ['btn-sc-load', 'btn-sc-fromfile', 'sc-in']) $(id).disabled = !can || scBusy;
      $('btn-sc-undo').classList.toggle('hidden', !(can && EchoSave.canUndo()));
      if (!can) scMsg("A code can be loaded from the title screen's Settings - not during a level.");
    }
    async function renderSaveCode() {
      const my = ++scToken;
      if (env.flushSave) env.flushSave(); // (the stats are held back while playing: the code has them up to now)
      const info = $('sc-out-info');
      refreshSaveLoad();
      const s = EchoSave.gather(env.saveCtx(), { settings: $('sc-settings').checked, levels: $('sc-levels').checked });
      const res = await EchoSave.encode(s);
      if (my !== scToken) return; // (a newer one was asked for meanwhile)
      if (!res.ok) {
        scCode = '';
        $('sc-out').value = '';
        info.textContent = res.error;
        info.className = 'fine sc-info warn';
        return;
      }
      scCode = res.code;
      $('sc-out').value = res.code;
      const n = res.chars.toLocaleString('en-GB');
      info.textContent = res.long ? `${n} characters - a long code. Save as file is easier than copying it.` : `${n} characters.`;
      info.className = `fine sc-info${res.long ? ' warn' : ''}`;
    }
    async function copySaveCode() {
      if (!scCode) return false;
      const info = $('sc-out-info');
      let ok = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(scCode);
          ok = true;
        }
      } catch (e) {
        ok = false;
      }
      if (!ok) {
        const box = $('sc-out');
        box.focus();
        box.select();
        try {
          ok = document.execCommand('copy');
        } catch (e) {
          ok = false;
        }
      }
      info.textContent = ok ? 'Copied.' : 'Select the code in the box and copy it.';
      info.className = 'fine sc-info';
      return ok;
    }
    /** "Save as file": a small text file holding the code. */
    function saveCodeFile() {
      if (!scCode) return false;
      const info = $('sc-out-info');
      try {
        const url = URL.createObjectURL(new Blob([`${scCode}\n`], { type: 'text/plain' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'echo-maze-save.txt';
        a.className = 'hidden';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        info.textContent = 'Saved as echo-maze-save.txt (look in your downloads).';
        info.className = 'fine sc-info';
        return true;
      } catch (e) {
        info.textContent = 'This browser would not save the file. Copy the code instead.';
        info.className = 'fine sc-info warn';
        return false;
      }
    }
    /** Read a pasted code (or a file's text): preview, ask, load. -> { ok, how } | { ok: false, error | cancelled } */
    async function loadSaveText(text) {
      if (!canLoad() || scBusy) return { ok: false, error: 'not now' };
      scBusy = true;
      refreshSaveLoad();
      try {
        const ctx = env.saveCtx();
        scMsg('Reading the code...');
        const res = await EchoSave.decode(text, ctx);
        if (!res.ok) {
          scMsg(res.error, 'warn');
          return { ok: false, error: res.error, code: res.code };
        }
        if (env.flushSave) env.flushSave();
        const mine = EchoSave.gather(ctx, {});
        const pv = EchoSave.preview(res.save, mine, ctx);
        const fits = EchoSave.undoFits(res.save, ctx);
        let body = `This code holds:\n${pv.lines.join('\n')}`;
        if (pv.ahead) body += '\n\nHeads up: this code is further along than the save on this device. Loading it will unlock levels and scenes you may not have played here yet.';
        body += '\n\nMerge keeps the best of both: the furthest level in each difficulty, every scene and fragment either save has, the better medals and bests.';
        if (!fits) body += '\n\nThere is not enough room in storage to keep a copy for Undo, so this load cannot be undone.';
        const r = await EchoDialog.open({
          title: 'Load this save?',
          text: body,
          buttons: [
            { id: 'merge', label: 'Merge (recommended)', primary: true },
            { id: 'replace', label: 'Replace my save', danger: true },
            { id: 'cancel', label: 'Cancel' },
          ],
          cancel: 'cancel',
        });
        if (r.id !== 'merge' && r.id !== 'replace') {
          scMsg('Nothing was changed.');
          return { ok: false, cancelled: true };
        }
        if (r.id === 'replace') {
          const what = `Your progress on this device will be replaced by the code's${res.save.settings ? ', your settings by its settings' : ''}${res.save.levels ? ', and your levels and folders by its levels' : ''}.`;
          const sure = await EchoDialog.open({
            title: 'Replace your save?',
            text: `${what}${fits ? ' Undo last load can put it back.' : ' This cannot be undone.'}`,
            buttons: [
              { id: 'replace', label: 'Yes, replace it', primary: true, danger: true },
              { id: 'cancel', label: 'Cancel' },
            ],
            cancel: 'cancel',
          });
          if (sure.id !== 'replace') {
            scMsg('Nothing was changed.');
            return { ok: false, cancelled: true };
          }
        }
        const out = EchoSave.load(res.save, ctx, { replace: r.id === 'replace' });
        if (!out.ok) {
          scMsg(out.error, 'warn');
          return { ok: false, error: out.error };
        }
        env.afterSaveLoad();
        $('sc-in').value = '';
        scMsg(`${r.id === 'replace' ? 'Loaded: your save was replaced.' : 'Loaded: merged into your save.'}${out.undo ? ' Undo last load puts it back.' : ''}`, 'live');
        return { ok: true, how: r.id, undo: out.undo };
      } finally {
        scBusy = false;
        refreshSaveLoad();
        renderSaveCode();
      }
    }
    async function loadSaveFile(file) {
      if (!file) return { ok: false };
      if (file.size > EchoSave.LIMITS.fileBytes) {
        scMsg(EchoSave.ERR.tooBig, 'warn');
        return { ok: false, error: EchoSave.ERR.tooBig };
      }
      const text = await new Promise((resolve) => {
        try {
          const fr = new FileReader();
          fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : '');
          fr.onerror = () => resolve('');
          fr.readAsText(file);
        } catch (e) {
          resolve('');
        }
      });
      if (!text) {
        scMsg("That file couldn't be read. Nothing was changed.", 'warn');
        return { ok: false };
      }
      return loadSaveText(text);
    }
    async function undoSaveLoad() {
      if (!canLoad() || !EchoSave.canUndo()) return { ok: false };
      const r = await EchoDialog.open({
        title: 'Undo the last load?',
        text: 'Your save goes back to exactly how it was just before the last code was loaded.',
        buttons: [
          { id: 'undo', label: 'Undo it', primary: true },
          { id: 'cancel', label: 'Cancel' },
        ],
        cancel: 'cancel',
      });
      if (r.id !== 'undo') return { ok: false, cancelled: true };
      const out = EchoSave.undo();
      env.afterSaveLoad();
      scMsg(out.ok ? 'Done: your save is back to how it was before the last load.' : out.error, out.ok ? 'live' : 'warn');
      refreshSaveLoad();
      renderSaveCode();
      return out;
    }

    // ------------------------------------------------------------- wiring
    document.querySelectorAll('#settings .tab').forEach((b) => {
      b.addEventListener('click', () => {
        env.click();
        showTab(b.dataset.tab);
        b.blur();
      });
    });
    $('btn-settings-back').addEventListener('click', () => {
      env.click();
      close();
    });
    $('btn-keys-reset').addEventListener('click', () => {
      P.resetKeys();
      env.keysChanged();
      stopCapture();
      message('Every key is back to what it was.');
    });
    document.querySelectorAll('.vol-slider').forEach((sl) => {
      sl.addEventListener('input', () => {
        const bus = sl.dataset.bus || 'master';
        env.setVolume(bus, sl.value / 100);
        const out = document.querySelector(`[data-vol-out="${bus}"]`);
        if (out) out.textContent = `${sl.value}%`;
      });
    });
    // (v22.0) save codes
    $('sc-settings').addEventListener('change', () => renderSaveCode());
    $('sc-levels').addEventListener('change', () => renderSaveCode());
    $('btn-sc-copy').addEventListener('click', () => {
      env.click();
      copySaveCode();
    });
    $('btn-sc-file').addEventListener('click', () => {
      env.click();
      saveCodeFile();
    });
    $('btn-sc-load').addEventListener('click', () => {
      env.click();
      loadSaveText($('sc-in').value);
    });
    $('btn-sc-fromfile').addEventListener('click', () => {
      env.click();
      $('sc-file').value = '';
      $('sc-file').click();
    });
    $('sc-file').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) loadSaveFile(f);
    });
    $('btn-sc-undo').addEventListener('click', () => {
      env.click();
      undoSaveLoad();
    });
    $('lightui-toggle').addEventListener('change', (e) => {
      if (env.lightUnlocked && env.lightUnlocked()) env.setLightUi(e.target.checked);
      e.target.blur();
    });
    $('timer-toggle').addEventListener('change', (e) => {
      env.setShowTimer(e.target.checked);
      e.target.blur();
    });
    $('btn-stats-reset').addEventListener('click', () => {
      const note = $('stats-confirm');
      if (!confirmingReset) {
        confirmingReset = true;
        note.textContent = 'This clears every stat and every medal, on every difficulty. Press Reset stats again to be sure.';
        note.className = 'keybind-msg warn';
        $('btn-stats-reset').textContent = 'Yes, reset everything';
        return;
      }
      P.resetStats();
      P.resetMedals();
      confirmingReset = false;
      $('btn-stats-reset').textContent = 'Reset stats';
      note.textContent = 'Stats and medals cleared.';
      note.className = 'keybind-msg';
      renderStats();
      env.medalsChanged();
    });

    return { open, close, isOpen, refresh, showTab, captureKey, renderHowTo, renderStats, medalPip, medalChip, isCapturing: () => !!capturing, renderCosmetics, previewRunning, saveCode: { render: renderSaveCode, code: () => scCode, copy: copySaveCode, file: saveCodeFile, load: loadSaveText, loadFile: loadSaveFile, undo: undoSaveLoad, busy: () => scBusy } };
  }

  return { create };
})();
