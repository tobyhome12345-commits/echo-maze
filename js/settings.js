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
      const other = P.actionFor(e.code);
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
      const sum = P.medalSummary(env.mode(), env.campaignLevels());
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
      for (let n = 1; n <= env.campaignLevels(); n++) {
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
      statRow(box, 'Time played', hhmmss(s.playTime));
      statRow(box, 'Distance walked', metres(s.distance));

      const h3 = document.createElement('h3');
      h3.textContent = 'What killed you';
      box.appendChild(h3);
      const names = { echo: 'Echo monster', scent: 'Scent monster', mimic: 'Mimic', stalker: 'Stalker', muffler: 'Muffler', singer: 'Singer' };
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
    }

    function refresh() {
      renderKeys();
      renderAudio();
      renderPalettes();
      if (tab === 'stats') renderStats();
      $('timer-toggle').checked = P.getShowTimer();
    }

    function open(from) {
      openFrom = from;
      capturing = null;
      pending = null;
      confirmingReset = false;
      $('stats-confirm').classList.add('hidden');
      message('');
      refresh();
      showTab(tab);
      env.showOverlay('settings');
    }

    function close() {
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
      ]);
      build($('howto-pause'), [
        [...move, 'move'],
        [...caps('ripple'), 'send a ripple'],
        [...caps('crouch'), 'hold to crouch: silent, but no ripples'],
        [...caps('item'), 'use an item', ...caps('pause'), 'resume'],
      ]);
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

    return { open, close, isOpen, refresh, showTab, captureKey, renderHowTo, renderStats, medalPip, medalChip, isCapturing: () => !!capturing };
  }

  return { create };
})();
