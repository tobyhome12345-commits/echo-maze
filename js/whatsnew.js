'use strict';

/**
 * WHAT'S NEW (v16.3) - the notes a returning player sees once, on the title screen, after the game has updated.
 *
 * THE NOTES: one entry per version, NEWEST FIRST. Every release adds its entry here in the same update (or marks it
 * `silent: true` when nothing changed that a player would notice) - tools/check.js fails if VERSION.json's version
 * has no entry, or if any version in CLAUDE.md's table from v15.0 on is missing. Each entry:
 *   version  'v16.3'          title  a few words
 *   lines    1-4 short lines, for a player, in plain words. Each is a string, or { text, tag, minLevel }:
 *            tag       'Level editor' for a line about the editor (shown as a small label before it)
 *            minLevel  THE SPOILER RULE: a line about story content (levels 13 and up, new cutscenes, what is in
 *                      them) is shown only once the player has reached that level - the furthest level unlocked in
 *                      any mode (js/game.js furthestReached). Until then the line is left out, and the version shows
 *                      GENERIC once instead ("New story content to discover.") however many of its lines are hidden.
 *   silent   true: the version is listed nowhere and never shown (it still needs its entry)
 *
 * THE RECORD: the last version whose notes the player has seen, in its own key (echomaze.whatsnew), apart from every
 * other save. A brand-new player (no save of any kind when the page loaded) never sees the notes: the current
 * version is recorded for them silently. Storage that is off or throws: nothing is shown and nothing breaks; a
 * damaged record: the notes are shown (at most once per page load) and the record is written afresh.
 *
 * This file is loaded FIRST (before js/profile.js), so it can see whether the browser held a save of this game
 * before anything on this page wrote one. It has no DOM: the screen is js/game.js's (#whatsnew).
 * The version numbers in NOTES are the only place a version number is written in the game's files - on purpose,
 * since a player's game has to know which notes are new (CLAUDE.md, "Releasing: the version").
 */
const EchoWhatsNew = (() => {
  const KEY = 'echomaze.whatsnew';
  const PREFIX = 'echomaze.';
  const CAP = 5; // at most this many versions in the popup; the rest are behind "See all updates"
  const GENERIC = 'New story content to discover.';
  const EDITOR = 'Level editor';

  const NOTES = [
    {
      version: 'v18.2',
      title: 'The light',
      lines: [
        { text: 'One more level after 24: the end of this part of the story.', minLevel: 24 },
        { text: 'Already reached the end? Continue takes you on to level 25 - nothing you had is lost.', minLevel: 24 },
      ],
    },
    {
      version: 'v18.1',
      title: 'Visual cues fix',
      lines: ['With Visual cues on, the game no longer freezes when the floor cracks or the walls move.'],
    },
    {
      version: 'v18.0',
      title: 'The crumble',
      lines: [
        { text: 'The story goes on past level 20: four more levels where the void is taking the maze.', minLevel: 20 },
        { text: 'Already reached the end? Continue takes you on to level 21 - nothing you had is lost.', minLevel: 20 },
        { text: 'A new scene, before level 22.', minLevel: 21 },
      ],
    },
    {
      version: 'v17.1',
      title: 'Caught',
      lines: ['When something catches you, the Caught screen now tells you what it was, speaking to you.'],
    },
    {
      version: 'v17.0',
      title: 'The broken gaol',
      lines: [
        { text: 'The story goes on: four new levels after level 16, where the maze starts breaking its own rules.', minLevel: 16 },
        { text: 'Already reached the end? Continue now takes you on to level 17 - nothing you had is lost.', minLevel: 16 },
      ],
    },
    {
      version: 'v16.4',
      title: 'Who caught you',
      lines: ['When something catches you, the Caught screen now says what it was, in your own words.'],
    },
    {
      version: 'v16.3',
      title: "What's new",
      lines: ['This! When the game updates, a note like this tells you what changed since you last played.', 'Open it again any time from "What\'s new" in the corner of the title screen.'],
    },
    {
      version: 'v16.2',
      title: 'More to find',
      lines: [{ text: 'Four more fragments are waiting deeper in the story, one on each of the last levels.', minLevel: 13 }],
    },
    {
      version: 'v16.1',
      title: 'What each monster does',
      lines: [
        { tag: EDITOR, text: 'Point at a monster in the list, or pick one, to see what it does.' },
        { tag: EDITOR, text: "Pick a monster you've placed on the map and its description shows there too." },
      ],
    },
    {
      version: 'v16.0',
      title: 'A new scene',
      lines: [{ text: 'A new scene plays between levels 13 and 14.', minLevel: 14 }, 'Press P to pause any cutscene, and P again to carry on.'],
    },
    {
      version: 'v15.7',
      title: 'Two monsters to try',
      lines: [{ tag: EDITOR, text: "Two new monsters to try in your own levels. They aren't in the main game yet." }],
    },
    {
      version: 'v15.6',
      title: 'Play it as an app',
      lines: ["Install Echo Maze from your browser's menu and play it like an app on your phone or computer.", "It works offline too, and picks up each update the next time you're online."],
    },
    {
      version: 'v15.5',
      title: 'A tidier title screen',
      lines: ['A calmer, cleaner title screen, with Continue up front when you come back.', "How to play has its own page now, and only shows the things you've already met."],
    },
    {
      version: 'v15.4',
      title: 'A small fix',
      silent: true,
      lines: ["One of the tips after being caught on your own levels now fits the level you're on."],
    },
    {
      version: 'v15.3',
      title: 'Share your levels',
      lines: [
        { tag: EDITOR, text: 'Share a level, or a whole folder, as a code anyone can paste in. No account or internet needed.' },
        { tag: EDITOR, text: 'Add your name as the creator, if you like.' },
      ],
    },
    {
      version: 'v15.2',
      title: 'Bonus Levels',
      lines: [{ tag: EDITOR, text: 'Six ready-made Bonus Levels, from gentle to tough, next to My Levels. Play them in any order and tick them off.' }],
    },
    {
      version: 'v15.1',
      title: 'More to build with',
      lines: [
        { tag: EDITOR, text: 'Several exits, puddles, decoys, notes in your own words, and patches of light and red glow.' },
        { tag: EDITOR, text: 'Give each level its own title card, colours and difficulty, and keep them tidy in folders.' },
      ],
    },
    {
      version: 'v15.0',
      title: 'The Level Editor',
      lines: [
        { tag: EDITOR, text: 'Make your own levels: draw the walls, place the start, the exit and the monsters, then test-play them.' },
        { tag: EDITOR, text: 'Your levels are kept in My Levels, and nothing you do in them changes your progress.' },
      ],
    },
  ];

  const verKey = (v) => {
    const m = /^v(\d+)\.(\d+)$/.exec(String(v || ''));
    return m ? +m[1] * 100000 + +m[2] : -1;
  };
  const current = () => NOTES[0].version;
  const told = () => NOTES.filter((n) => !n.silent);

  // ------------------------------------------------------------ the record (every access in a try/catch)
  let storage = null;
  try {
    storage = window.localStorage;
  } catch (e) {
    storage = null;
  }
  let hadSave = false; // did this browser hold a save of this game when the page loaded (anything but this key)?
  let storageOk = true;
  let shownThisLoad = false; // the popup has been shown on this page load (never twice, whatever storage does)
  /** Look at the browser's storage as it is now - done once, as this file loads, before anything else writes. */
  function snapshot() {
    hadSave = false;
    storageOk = true;
    try {
      if (!storage) throw new Error('no storage');
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        // (another copy's keys - the finished test copy keeps its save as "echomaze.test.*" - are not this save)
        if (k && k.startsWith(PREFIX) && k !== KEY && !k.startsWith(PREFIX + 'test.')) {
          hadSave = true;
          break;
        }
      }
    } catch (e) {
      storageOk = false;
    }
  }
  snapshot();
  function read() {
    try {
      return storage ? storage.getItem(KEY) : null;
    } catch (e) {
      return null;
    }
  }
  function write(v) {
    try {
      storage.setItem(KEY, v);
      return true;
    } catch (e) {
      return false;
    }
  }
  /** The last version seen: 'vX.Y', null (none recorded), or 'damaged'. */
  function lastSeen() {
    const v = read();
    if (v === null || v === undefined) return null;
    return verKey(v) >= 0 ? v : 'damaged';
  }

  // ------------------------------------------------------------ what to show
  /** An entry's lines for a player who has reached level `reached`: the spoiler rule (see the top of this file). */
  function linesFor(entry, reached) {
    const out = [];
    let hidden = 0;
    for (const l of entry.lines) {
      const o = typeof l === 'string' ? { text: l } : l;
      if (o.minLevel && !(reached >= o.minLevel)) hidden++;
      else out.push({ text: o.text, tag: o.tag || null });
    }
    if (hidden) out.push({ text: GENERIC, tag: null, generic: true });
    return out;
  }
  /** Every version told about, newer than `since` ('vX.Y' or null = all), newest first. */
  const since = (v) => told().filter((n) => verKey(n.version) > verKey(v));
  /** The full history, for "See all updates" and the corner button. */
  const history = (reached) => told().map((n) => ({ version: n.version, title: n.title, lines: linesFor(n, reached) }));

  /**
   * Should the popup show on this page load, and with what? Called once, when the title is first up.
   *   { show, entries (newest first, at most CAP), more (versions left out by the cap), reason }
   * A brand-new player is recorded silently. Nothing is shown twice on one page load.
   */
  function decide(reached) {
    if (shownThisLoad) return { show: false, entries: [], more: 0, reason: 'already shown on this page load' };
    if (!storageOk || !storage) return { show: false, entries: [], more: 0, reason: 'storage unavailable' };
    const last = lastSeen();
    let pending;
    let reason;
    if (last === null && !hadSave) {
      write(current()); // a brand-new player: nothing to tell them - the whole game is new
      return { show: false, entries: [], more: 0, reason: 'new player: recorded silently' };
    }
    if (last === null) {
      pending = told(); // a player from before this screen existed: they have never seen any notes
      reason = 'returning player, never seen notes';
    } else if (last === 'damaged') {
      pending = told();
      reason = 'damaged record';
    } else {
      pending = since(last);
      reason = `last saw ${last}`;
    }
    if (!pending.length) {
      if (last !== current()) write(current()); // (only silent versions since: move the record on quietly)
      return { show: false, entries: [], more: 0, reason: `nothing new since ${last}` };
    }
    const shown = pending.slice(0, CAP).map((n) => ({ version: n.version, title: n.title, lines: linesFor(n, reached) }));
    return { show: true, entries: shown, more: pending.length - shown.length, reason };
  }
  /** The popup has been seen (Got it, Esc, a tap outside): never again for this version. */
  function markSeen() {
    shownThisLoad = true;
    return write(current());
  }
  const markShown = () => (shownThisLoad = true);
  /** Are there notes this player has not seen? (the corner button's dot) */
  function unseen() {
    if (!storageOk) return false;
    const last = lastSeen();
    if (last === null) return hadSave;
    if (last === 'damaged') return true;
    return since(last).length > 0;
  }

  return {
    KEY,
    CAP,
    GENERIC,
    EDITOR,
    NOTES,
    verKey,
    current,
    lastSeen,
    linesFor,
    history,
    decide,
    markSeen,
    markShown,
    unseen,
    // ?debug / tests: look at storage again as if the page had just loaded, or use a stand-in storage
    _reload(st) {
      if (st !== undefined) storage = st;
      shownThisLoad = false;
      snapshot();
      return { hadSave, storageOk };
    },
    _state: () => ({ hadSave, storageOk, shownThisLoad, last: lastSeen(), current: current() }),
  };
})();
