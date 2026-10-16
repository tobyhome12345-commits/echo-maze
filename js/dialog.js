'use strict';

/**
 * A SMALL QUESTION IN THE MIDDLE OF THE SCREEN (v15.0): "are you sure?", "what should it be called?". The level
 * editor and My Levels use it instead of the browser's own confirm()/prompt(), so it looks like the rest of the
 * game and never blocks the page. One at a time; Enter presses the main button and Esc the cancelling one.
 *   open({ title, text, input: { value, max, label }, select: { options: [{ value, label }], value, label },
 *          area: { value, readonly, label, placeholder, max },
 *          buttons: [{ id, label, primary, danger, stay, act }], cancel })
 *     -> a Promise of { id, value }  (id: the button pressed - or `cancel` for Esc; value: the input's text, or the
 *        option picked in the list (v15.1) when there is a list instead, or the text in the box (v15.3))
 *   isOpen()
 * (v15.3) `area`: a box for a long piece of text - a share code to copy (readonly) or one to paste. A button with
 * `stay: true` does not answer the question: it calls `act(api)` and the dialog stays open - api.status(text) puts
 * a line under the text (Copy says "Copied"), api.box is the text box. `text` keeps its line breaks.
 */
const EchoDialog = (() => {
  let el = null;
  let current = null; // { resolve, buttons, cancel, input, select, area }
  let lastFocus = null;
  let click = () => {};

  const $ = (id) => document.getElementById(id);

  function init(opts) {
    el = $('dialog');
    if (opts && typeof opts.click === 'function') click = opts.click;
    el.addEventListener('keydown', (e) => {
      if (!current) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(current.cancel);
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        // Enter in the text box, or anywhere but on another button, presses the main one
        const onButton = document.activeElement && document.activeElement.tagName === 'BUTTON';
        if (onButton) return;
        e.preventDefault();
        e.stopPropagation();
        const main = current.buttons.find((b) => b.primary) || current.buttons[0];
        if (main) press(main);
      }
    });
    // a click on the dim backdrop is not an answer
    el.addEventListener('mousedown', (e) => {
      if (e.target === el) e.preventDefault();
    });
  }

  function finish(id) {
    if (!current) return;
    const c = current;
    current = null;
    const value = c.input ? $('dialog-input').value : c.select ? $('dialog-select').value : c.area ? $('dialog-area').value : undefined;
    el.classList.remove('in');
    el.classList.add('hidden');
    if (lastFocus && lastFocus.focus && document.body.contains(lastFocus)) {
      try {
        lastFocus.focus({ preventScroll: true });
      } catch (e) {
        /* nothing to give the focus back to */
      }
    }
    c.resolve({ id, value });
  }

  /** A button: answer the question with it - or, for one that stays (v15.3), do its job and stay open. */
  function press(b) {
    if (!b.stay) return finish(b.id);
    if (typeof b.act === 'function') {
      try {
        b.act(api);
      } catch (e) {
        /* the button's job failed: the dialog stays as it was */
      }
    }
  }
  const api = {
    status(t) {
      const s = $('dialog-status');
      s.textContent = t || '';
      s.classList.toggle('hidden', !t);
    },
    get box() {
      return $('dialog-area');
    },
  };

  function open(opts) {
    if (!el) init();
    if (current) finish(current.cancel); // a new question replaces one left open (never two at once)
    const buttons = opts.buttons && opts.buttons.length ? opts.buttons : [{ id: 'ok', label: 'OK', primary: true }];
    return new Promise((resolve) => {
      current = { resolve, buttons, cancel: opts.cancel || buttons[buttons.length - 1].id, input: !!opts.input, select: !opts.input && !!opts.select, area: !opts.input && !opts.select && !!opts.area };
      lastFocus = document.activeElement;
      $('dialog-title').textContent = opts.title || '';
      $('dialog-text').textContent = opts.text || '';
      $('dialog-text').classList.toggle('hidden', !opts.text);
      const input = $('dialog-input');
      input.classList.toggle('hidden', !opts.input);
      if (opts.input) {
        input.value = opts.input.value || '';
        input.maxLength = opts.input.max || 48;
        input.setAttribute('aria-label', opts.input.label || opts.title || 'Text');
      }
      // (v15.1) a list to pick one from - which folder to move a level to
      const sel = $('dialog-select');
      sel.classList.toggle('hidden', !current.select);
      sel.textContent = '';
      if (current.select) {
        for (const o of opts.select.options || []) {
          const op = document.createElement('option');
          op.value = o.value;
          op.textContent = o.label;
          sel.appendChild(op);
        }
        if (opts.select.value !== undefined) sel.value = opts.select.value;
        sel.setAttribute('aria-label', opts.select.label || opts.title || 'Choose');
      }
      // (v15.3) a box for a long text: a code to copy, or one to paste
      const area = $('dialog-area');
      area.classList.toggle('hidden', !current.area);
      if (current.area) {
        area.value = opts.area.value || '';
        area.readOnly = !!opts.area.readonly;
        area.placeholder = opts.area.placeholder || '';
        area.maxLength = opts.area.max || 100000;
        area.setAttribute('aria-label', opts.area.label || opts.title || 'Text');
      }
      api.status('');
      const row = $('dialog-buttons');
      row.textContent = '';
      for (const b of buttons) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = b.label;
        if (b.primary) btn.className = 'primary';
        if (b.danger) btn.classList.add('danger');
        btn.dataset.id = b.id;
        btn.addEventListener('click', () => {
          click();
          press(b);
        });
        row.appendChild(btn);
      }
      el.classList.remove('hidden');
      void el.offsetWidth; // laid out first, so it fades in (the overlays do the same)
      el.classList.add('in');
      const focusOn = opts.input ? input : current.select ? sel : current.area ? area : row.querySelector('button.primary') || row.querySelector('button');
      if (focusOn) {
        focusOn.focus({ preventScroll: true });
        if (opts.input || (current.area && area.value)) focusOn.select();
      }
    });
  }

  return { init, open, isOpen: () => !!current, status: (t) => api.status(t) };
})();
