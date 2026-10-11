'use strict';

/**
 * A SMALL QUESTION IN THE MIDDLE OF THE SCREEN (v15.0): "are you sure?", "what should it be called?". The level
 * editor and My Levels use it instead of the browser's own confirm()/prompt(), so it looks like the rest of the
 * game and never blocks the page. One at a time; Enter presses the main button and Esc the cancelling one.
 *   open({ title, text, input: { value, max, label }, buttons: [{ id, label, primary, danger }], cancel })
 *     -> a Promise of { id, value }  (id: the button pressed - or `cancel` for Esc; value: the input's text)
 *   isOpen()
 */
const EchoDialog = (() => {
  let el = null;
  let current = null; // { resolve, buttons, cancel, input }
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
        if (main) finish(main.id);
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
    const value = c.input ? $('dialog-input').value : undefined;
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

  function open(opts) {
    if (!el) init();
    if (current) finish(current.cancel); // a new question replaces one left open (never two at once)
    const buttons = opts.buttons && opts.buttons.length ? opts.buttons : [{ id: 'ok', label: 'OK', primary: true }];
    return new Promise((resolve) => {
      current = { resolve, buttons, cancel: opts.cancel || buttons[buttons.length - 1].id, input: !!opts.input };
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
          finish(b.id);
        });
        row.appendChild(btn);
      }
      el.classList.remove('hidden');
      void el.offsetWidth; // laid out first, so it fades in (the overlays do the same)
      el.classList.add('in');
      const focusOn = opts.input ? input : row.querySelector('button.primary') || row.querySelector('button');
      if (focusOn) {
        focusOn.focus({ preventScroll: true });
        if (opts.input) input.select();
      }
    });
  }

  return { init, open, isOpen: () => !!current };
})();
