'use strict';

/**
 * WHAT KILLED YOU, IN ONE LINE.
 *
 * A table of tips for the Caught screen, and a way of picking one. It is pure data and arithmetic: it reads
 * nothing, it writes nothing, and the game never asks it a question whose answer could change what happens.
 *
 * The monster tags itself with a `why` at the moment it notices you (js/game.js: `alertEnemy`, `hearFootstep`,
 * `stalkersListen`, `mufflersListen`, `updateScent`, `checkTrailTouch`), and `onCaught` reads it back. `why` is
 * written by the AI but never read by it - the tip is told what really happened rather than guessing.
 *
 * NO Math.random. The game's random numbers belong to the simulation, and drawing one here would shift every
 * seed after it. The variant is chosen by hashing the level, the cause, the reason and the moment of death, so
 * two identical runs give identical tips and repeated deaths still feel different.
 */
const EchoFeedback = (() => {
  /**
   * cause -> why -> the things it might say. `blind` is a monster that had never noticed you at all: you walked
   * into it in the dark. A cause with no matching `why` falls back to its own `blind` line.
   */
  const TIPS = {
    echo: {
      footsteps: [
        'It heard your footsteps after your ripple found it.',
        'Your ripple woke it; your footsteps told it where you were.',
        'It was listening where your ripple sent it, and you were still moving.',
      ],
      ripple: [
        'It was already coming to the spot you rippled from.',
        'Your ripple touched it, and it walked to where the ripple began.',
        'It went to where you sent that ripple. You were still there.',
      ],
      blind: ['You walked straight into it.', 'It never knew you were there. Neither did you.', 'Blind, still, and right in front of you.'],
    },
    scent: {
      smell: [
        'It followed your smell.',
        'You were still smelly. It can follow that a long way.',
        'It smelled you. Smell only wears off while you walk.',
      ],
      trail: [
        'It followed your trail.',
        'It picked up the trail you left and walked down it.',
        'Your own trail led it to you.',
      ],
      blind: ['You walked straight into it.', 'It had not smelled a thing. You found it instead.'],
    },
    mimic: {
      any: [
        'That exit was a mimic.',
        'That was not the way out. It was waiting to be touched.',
        'The green glow was a mimic, and you reached it.',
      ],
    },
    stalker: {
      moving: [
        'It heard you moving.',
        'Your footsteps carried. It hears them from farther than you think.',
        'It heard you walking. Crouching would have made no sound.',
      ],
      standing: [
        'It heard you standing nearby.',
        'You were close enough to hear even standing still.',
        'It heard you simply being there. Only a crouch is silent.',
      ],
      blind: ['You walked straight into it.', 'It had heard nothing at all. You found it in the dark.'],
    },
    muffler: {
      moving: [
        'It heard you.',
        'It heard you moving. It listens harder than the stalker does.',
        'It heard your steps - a crouch is quieter, but not silent.',
      ],
      standing: [
        'It heard you.',
        'It heard you standing there. It does not need you to move.',
        'You were near enough for it to hear you at all.',
      ],
      blind: ['You walked straight into it.', 'It never heard you. You walked into the hole in your own echo.'],
    },
    singer: {
      any: [
        'Its ripple marked you, and it leapt to where you were.',
        'The song found you, and it jumped to the spot it found you at.',
        'You were marked. It landed where the wave had touched you.',
      ],
      blind: ['You walked straight into it.', 'You touched the singer itself, not its song.'],
    },
  };

  /** A small, stable hash of a string - not the game's random numbers, and nothing to do with them. */
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  /**
   * One line for this death. `why` is the tag the monster left on itself, `level` and `atMs` only pick which
   * phrasing of it to use, so the same death in the same run always reads the same.
   */
  function tipFor(cause, why, level = 1, atMs = 0) {
    const byCause = TIPS[cause] || TIPS.echo;
    const list = byCause[why] || byCause.any || byCause.blind || [];
    if (!list.length) return '';
    return list[hash(`${cause}|${why}|${level}|${atMs}`) % list.length];
  }

  return { TIPS, tipFor, hash };
})();
