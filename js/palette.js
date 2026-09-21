'use strict';

/**
 * Colour palettes (Settings -> Display).
 *
 * A palette changes COLOURS ONLY. Every shape, texture and glyph stays exactly as it was (js/art.js and
 * js/cues.js draw the same paths whatever is picked), and nothing here can touch the simulation: the game
 * never reads a colour back. Colour has not been the only clue since v9.1 - each thing also has its own
 * silhouette - so a palette is a comfort, not a crutch.
 *
 * Where the colours go:
 *   - the ripple's hit colours and the art (js/game.js COLORS, js/art.js RGB/CORE - both are filled in from
 *     here whenever the palette changes, so every reference to them keeps working)
 *   - the Visual sound cue glyphs (js/cues.js RGB) and the shapes in the title legend
 *   - the HUD and menu accents and the smell-trail glow (the CSS variables set below)
 *
 * `rgb` is the colour of a thing; `core` is the pale line drawn down the middle of it. Where a palette does
 * not name a core, it is worked out by lightening the colour towards white (which is how the originals were
 * chosen); the Default palette names both, so it is pixel-for-pixel the game as it was before palettes existed.
 *
 * Every palette was checked with tools/palette-check.js, which simulates protanopia, deuteranopia and
 * tritanopia and measures every pair of colours with CIEDE2000. See README / CLAUDE.md for the numbers.
 */
const EchoPalette = (() => {
  /** Everything a colour is needed for. The first nine are what a ripple can light up. */
  const RIPPLE_ROLES = ['wall', 'obstacle', 'echo', 'exit', 'scent', 'puddle', 'decoy', 'stalker', 'singer'];
  const CUE_ROLES = ['echo', 'scent', 'stalker', 'exit', 'decoy', 'muffler', 'singer', 'heart'];
  const ROLES = RIPPLE_ROLES.concat(['muffler', 'heart']);

  const PALETTES = {
    default: {
      label: 'Default',
      note: 'The colours the game has always used.',
      rgb: {
        wall: '95,212,255',
        obstacle: '255,179,71',
        echo: '255,59,92',
        exit: '93,255,160',
        scent: '176,124,255',
        puddle: '190,240,70',
        decoy: '255,122,217',
        stalker: '255,116,16',
        singer: '236,64,236',
        muffler: '205,220,238',
        heart: '255,132,150',
      },
      // named so the default look is exactly what it was (elsewhere these are derived - see coreOf)
      core: {
        wall: '170,230,255',
        obstacle: '255,214,140',
        echo: '255,130,150',
        exit: '170,255,205',
        scent: '208,176,255',
        puddle: '222,255,130',
        decoy: '255,182,236',
        stalker: '255,186,116',
        singer: '255,176,255',
      },
    },
    // Worst pair, CIEDE2000: 16.9 (checked under normal vision, protanopia AND deuteranopia at once).
    // Nothing here is told apart by red against green: the difference is carried by the blue-yellow axis,
    // which both kinds of red-green blindness keep, and by how bright each thing is.
    protan: {
      label: 'Colour-blind friendly (red-green)',
      note: 'For protanopia and deuteranopia. Nothing is told apart by red against green: blue, yellow and brightness carry the difference. The exit is the brightest thing in the maze.',
      rgb: {
        wall: '6,171,245',
        obstacle: '150,118,8',
        echo: '237,173,17',
        exit: '255,255,251',
        scent: '65,101,253',
        puddle: '209,237,170',
        decoy: '85,233,255',
        stalker: '189,168,175',
        singer: '154,106,146',
        muffler: '168,153,118',
        heart: '242,198,88',
      },
    },
    // Worst pair: 13.6 (under normal vision and tritanopia). Terrain is cool and green, monsters are warm -
    // red against cyan is the axis tritanopia keeps. The echo monster is a MUTED red and the stalker a pale
    // gold on purpose: a vivid red and a vivid orange sit only 5 apart for a tritanope, which is far too close.
    tritan: {
      label: 'Colour-blind friendly (blue-yellow)',
      note: 'For tritanopia. Nothing is told apart by blue against yellow: red, green and brightness carry the difference. Monsters are warm, the maze itself is cool.',
      rgb: {
        wall: '86,134,178',
        obstacle: '108,199,206',
        echo: '205,146,127',
        exit: '231,248,148',
        scent: '176,67,210',
        puddle: '141,255,93',
        decoy: '156,164,164',
        stalker: '255,209,54',
        singer: '202,186,198',
        muffler: '201,208,187',
        heart: '220,179,165',
      },
    },
    // Worst pair: 17.0 under normal vision, where the Default palette manages 11.9 - the same colour language
    // (blue walls, a red echo monster, a green exit), every colour pushed brighter and further apart.
    // It is NOT a colour-blind palette: pick one of those above for that.
    contrast: {
      label: 'High contrast',
      note: 'The same colours as Default, pushed as bright and as far apart as they go, for a dim screen or tired eyes. Not a colour-blind palette.',
      rgb: {
        wall: '120,228,255',
        obstacle: '255,203,82',
        echo: '255,72,96',
        exit: '86,255,150',
        scent: '150,122,255',
        puddle: '206,255,70',
        decoy: '255,126,186',
        stalker: '255,118,8',
        singer: '250,58,255',
        muffler: '226,241,255',
        heart: '255,127,144',
      },
    },
  };

  const CORE_LIGHTEN = 0.45; // how far a core line is pushed towards white when a palette does not name one

  const parse = (s) => String(s).split(',').map((v) => +v);
  function lighten(rgb, f) {
    return parse(rgb)
      .map((v) => Math.round(v + (255 - v) * f))
      .join(',');
  }

  let current = 'default';
  const listeners = [];

  const has = (id) => Object.prototype.hasOwnProperty.call(PALETTES, id);
  const palette = (id) => PALETTES[has(id) ? id : 'default'];

  const rgbOf = (role, id = current) => palette(id).rgb[role] || PALETTES.default.rgb[role] || '255,255,255';
  const coreOf = (role, id = current) => {
    const p = palette(id);
    return (p.core && p.core[role]) || lighten(rgbOf(role, id), CORE_LIGHTEN);
  };
  /** The whole map, for the checker and for anything that wants to copy it in one go. */
  function colorsOf(id = current) {
    const out = {};
    for (const r of ROLES) out[r] = rgbOf(r, id);
    return out;
  }
  function coresOf(id = current) {
    const out = {};
    for (const r of ROLES) out[r] = coreOf(r, id);
    return out;
  }

  /**
   * The CSS side: the menus, the HUD and the key caps pick their accents up from these, so a palette reaches
   * the interface as well as the maze. (The page's own dark background and text colours never change.)
   */
  function applyCss() {
    const root = document.documentElement;
    if (!root || !root.style) return;
    root.style.setProperty('--ui-rgb', rgbOf('wall'));
    root.style.setProperty('--danger-rgb', rgbOf('echo'));
    root.style.setProperty('--exit-rgb', rgbOf('exit'));
    root.style.setProperty('--decoy-rgb', rgbOf('decoy'));
    root.style.setProperty('--puddle-rgb', rgbOf('puddle'));
    root.style.setProperty('--singer-rgb', rgbOf('singer'));
    root.style.setProperty('--muffler-rgb', rgbOf('muffler'));
    // the cue shapes in the title legend are inline SVG: each one carries the role it stands for
    const svgs = document.querySelectorAll('[data-cue]');
    for (let i = 0; i < svgs.length; i++) {
      const role = svgs[i].getAttribute('data-cue');
      if (role) svgs[i].style.setProperty('--c', `rgb(${rgbOf(role)})`);
    }
  }

  /** Everything that holds its own copy of the colours registers here and refills it. */
  function onChange(fn) {
    listeners.push(fn);
    fn(colorsOf(), coresOf(), current);
  }

  function set(id) {
    current = has(id) ? id : 'default';
    applyCss();
    const rgb = colorsOf();
    const core = coresOf();
    for (const fn of listeners) fn(rgb, core, current);
    return current;
  }

  const list = () => Object.keys(PALETTES).map((id) => ({ id, label: PALETTES[id].label, note: PALETTES[id].note }));

  // start on whatever was saved (js/profile.js keeps it; every storage read of its own is in a try/catch)
  current = typeof EchoProfile !== 'undefined' && has(EchoProfile.getPalette()) ? EchoProfile.getPalette() : 'default';

  return {
    ROLES,
    RIPPLE_ROLES,
    CUE_ROLES,
    list,
    colorsOf,
    coresOf,
    rgb: rgbOf,
    core: coreOf,
    lighten,
    onChange,
    set,
    applyCss,
    get id() {
      return current;
    },
    label: (id = current) => palette(id).label,
    note: (id = current) => palette(id).note,
  };
})();
