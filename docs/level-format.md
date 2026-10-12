# Echo Maze custom level format (schema version 2)

Custom levels (v15.0 and v15.1, the level editor) are stored as plain JSON. This file is the reference for that
format; `js/levelformat.js` is the code that reads and writes it, and the two must agree. Nothing in the format
depends on the editor: any source (the editor today; sharing or importing later) can supply a level in this shape.
**Folders are not part of a level** (see "Where levels live"): a level is one self-contained piece of data.

## A level

```json
{
  "format": "echo-maze-level",
  "schemaVersion": 2,
  "id": "lv-mg7z1q0a-3k9x2b7c1d",
  "title": "All of It",
  "authorName": "",
  "createdAt": "2026-10-12T12:00:00.000Z",
  "updatedAt": "2026-10-12T12:00:00.000Z",
  "size": { "w": 29, "h": 23 },
  "walls": ["#############################", "#.......#.....#.............#", "..."],
  "start": { "x": 1, "y": 1 },
  "exit": { "x": 27, "y": 21 },
  "exits": [
    { "x": 27, "y": 21, "locked": false },
    { "x": 13, "y": 9, "locked": true }
  ],
  "enemies": [
    { "kind": "warden", "variant": "regular", "x": 27, "y": 1 },
    { "kind": "echo", "x": 26, "y": 12 }
  ],
  "objects": [
    { "kind": "key", "x": 11, "y": 19 },
    { "kind": "puddle", "x": 26, "y": 19 },
    { "kind": "note", "x": 3, "y": 11, "text": "Two ways out. One of them wants a key.", "style": "note" }
  ],
  "effects": [
    { "kind": "light", "shape": "circle", "x": 0, "y": 0, "w": 8, "h": 6, "colour": "warm", "intensity": "medium" },
    { "kind": "glow", "shape": "rect", "x": 22, "y": 9, "w": 7, "h": 7, "colour": "red", "intensity": "bright" }
  ],
  "titleCard": "Two ways out. One of them needs a key.",
  "palette": "contrast",
  "difficulty": { "rating": "hard", "monsterSpeed": 1, "rippleRange": 1, "hearing": 1 }
}
```

| Field | Type | Rules |
| --- | --- | --- |
| `format` | string | Always `"echo-maze-level"`. A value that is present and different means "not a level": it is refused. Missing is accepted. |
| `schemaVersion` | integer | `2`. Missing or below 1 is read as 1. A version 1 level is upgraded as it is read (see "Versions"). Higher than this version knows: read with what is understood, and the level is *foreign* (see below). |
| `id` | string | 1-64 characters of `A-Z a-z 0-9 _ -`. Unique within a source. Not valid: a new id is made. In local storage the key it is filed under is its id. |
| `title` | string | 1-48 characters after tidying (control characters become spaces, runs of spaces become one, trimmed). Empty: `"Untitled level"`. |
| `authorName` | string | 0-32 characters, same tidying. Always `""` in this version (levels are private); kept for sharing later. |
| `createdAt`, `updatedAt` | string | ISO 8601 dates (numbers in milliseconds are accepted when reading). Invalid: the time it was read. A save stamps `updatedAt`. |
| `size` | `{ w, h }` | Tiles of 40 px. `w` 5-61, `h` 5-45; out of range is clamped. Missing: worked out from `walls`. |
| `walls` | string[] | Exactly `h` rows of exactly `w` characters: `#` is a wall, `.` is floor. Anything else, a missing row or a short row is read as floor. Outside the grid counts as wall in the game. |
| `start` | `{ x, y }` or `null` | A tile inside the grid, or `null` while not placed. Outside the grid: removed (`null`). |
| `exits` | array | **The ways out** (v15.1): 0-8 of `{ x, y, locked }`, one per tile, each a tile inside the grid. Reaching ANY of them finishes the level. `locked` (`true` only if it is exactly `true`) means it is a shut door until the player holds the key. Extras beyond 8, a second one on a tile and ones outside the grid are dropped. |
| `exit` | `{ x, y }` or `null` | **Written for older versions only**: the first open way out (or the first of any). Version 15.0 of the game knew only this field, so it is kept up to date for it. **Never read when `exits` is there.** |
| `enemies` | array | At most 40, at most one per tile, each `{ kind, x, y }` on a tile inside the grid, plus `variant` for a kind that has variants. Extras beyond 40, a second one on a tile and ones outside the grid are dropped. |
| `objects` | array | **Floor objects** (v15.1), each `{ kind, x, y }` on a tile inside the grid, one per tile, at most 60 in all: `"puddle"` (at most 40), `"decoy"` (at most 1), `"key"` (at most 1), `"note"` (at most 8, with `text` and `style`). Beyond a kind's limit, a second one on a tile and ones outside the grid are dropped. |
| `objects[].text` | string | A note's words: 1-140 characters, cleaned before anything else sees them - control characters become spaces, the invisible direction-override and zero-width characters and `<` `>` are removed, runs of spaces become one. A note left with nothing in it is dropped. |
| `objects[].style` | string | `"note"` (shown on screen, like a lore fragment) or `"recording"` (spoken in the game's voice as it is typed out). Anything else: `"note"`. |
| `effects` | array | **Special-effect zones** (v15.1), at most 12, each `{ kind, shape, x, y, w, h, colour, intensity }`: `kind` `"light"` or `"glow"`; `shape` `"rect"` or `"circle"` (the ellipse inside the rect); `x`, `y` its top-left tile inside the grid; `w`, `h` at least 1 and clamped to stay inside the grid; `colour` from the kind's list - light: `"warm"`, `"cold"`, `"pale"`; glow: `"red"`, `"crimson"`, `"ember"` (anything else: the first); `intensity` `"dim"`, `"medium"` or `"bright"` (anything else: `"medium"`). |
| `titleCard` | string | 0-80 characters, cleaned like a note's words: a line shown on the card at the start of the level. `""`: no line (the card still shows the title and the difficulty). |
| `palette` | string | `""` (the player's own colours) or one of the game's palette ids (`"default"`, `"protan"`, `"tritan"`, `"contrast"`). Anything else: `""`. The game uses it only for a player whose own palette is Default. |
| `difficulty` | object | `{ rating, monsterSpeed, rippleRange, hearing }`. `rating` is `"easy"`, `"normal"`, `"hard"`, `"hardcore"` or `"custom"` (anything else: `"normal"`). The three scales are numbers to two decimal places, clamped: `monsterSpeed` 0.5-1.5, `rippleRange` 0.6-1.5, `hearing` 0.5-1.5 - and they are all `1` unless the rating is `"custom"`. Missing: Normal. |

### Monster kinds

The kinds are the game's own list, `MONSTER_TYPES` in `js/level.js` - the editor, the loader and `makeEnemy` all read
it, so a monster added to the game is accepted here by being added there. Today: `echo`, `scent`, `mimic`, `stalker`,
`muffler`, `singer`, and `warden` with `variant` `regular` (the editor calls it "Level 15 monster") or `upgraded`
("Level 16 monster") - the variants are `js/warden.js` `VARIANTS`. A `warden` with no `variant` is read as the first
variant. Positions are tiles; a monster stands at the tile's centre.

## Playable or unfinished

Not stored: it is worked out every time, by `js/levelcheck.js`, so a level can never claim to be playable. A level
is **playable** when:

- it has a start, on floor, and at least one way out; every way out is on floor and none is on the start;
- at least one way out can be walked to from the start (four-way steps over floor, the game's own pathfinding),
  where a **locked** way out is a shut door until the key has been picked up;
- if any way out is locked, there is a key, and it can be reached from the start without going through a shut door;
- nothing (monster or object) is inside a wall, and no monster is on the start;
- no Level 15 / 16 monster (they always know where the player is, and hunt from the start in a custom level) could
  reach some tile of the shortest way out before even a perfect run gets there - at its speed in this level's
  difficulty, against the player's 170 px/s.

Warnings never stop a level being played: a way out that cannot be reached when another can (named: "Exit 2 ..."),
a monster on a way out, an object sharing a tile, and a Level 15 / 16 monster that arrives less than a second behind
a perfect run. Anything else is **unfinished**: it can be saved and edited, not played. The engine's loader
(`buildCustomLevel` in `js/level.js`) refuses anything that is not playable.

## How a custom level plays

- **Its own difficulty.** A rating that is a game mode plays exactly as that mode tunes level 12 of the ordinary
  curve (`CUSTOM_CURVE_LEVEL`): the ripple's range and recharge, every monster's speed and hearing, the mimic's tell
  - for every player, whatever mode they have picked on the title screen. `"custom"` is Normal with the three scales
  applied: every monster's speed (and never past 169 px/s, below the player's 170 - the game's own rule), the
  ripple's range, and every monster's hearing and smelling distances. A Level 15 / 16 monster keeps its own rule (a
  fraction of the player's speed) times the same monster-speed scale, and never more than 1.25 times the player's
  speed. Calm mode, Visual cues and the rest of the player's own settings apply as everywhere.
- **The ways out** chime, glimmer and show in a ripple like the game's exit, every one of them. A locked one is drawn
  as level 14's door and is solid until the player, holding the key, walks into it: the key turns, and a second
  later it is a way out like the rest. One key opens every locked way out.
- **Objects** are the game's own: a puddle makes you smelly (scent monsters follow it); the sonar decoy is picked up
  and dropped as on level 9 onwards; the key is found and picked up as on level 14; a note is found by a ripple and
  read as a lore fragment is - and nothing about it is kept.
- **Effects** are drawn only: a zone shows its floor and the stone in it, never a monster, object or way out, only
  where the player could really see it from where they stand, and always under the ripples.
- **The title card** shows the title, the `titleCard` line and the difficulty when the level starts (not on Try
  again); the level waits under it until a key, a click or a few seconds.
- Wardens hunt from the moment the level starts. Nothing about playing one is ever saved - no progress, medals, stats
  or fragments - and on Hardcore it still offers Try again.

## Untrusted data

Every reader treats a level as untrusted, whatever its source. `EchoLevelFormat.normalise(anything)` never throws:
it accepts a string or an object, clamps every number, drops what it cannot use (and lists what it repaired in
`notes`), refuses what is not a level at all (`{ doc: null, error }`), and never copies `__proto__`, `constructor` or
`prototype`. A stored text longer than 400,000 characters is refused unread. Text a player typed and the game shows
(titles, notes, the title card) is cleaned as described above and is only ever put on screen as plain text.

## Foreign levels, and adding to the format

Fields this version does not know, and monsters, objects or effects of a kind (or a variant) it does not know, are
**kept aside, not lost**: the read level carries them in `extra`, `extraEnemies`, `extraObjects` and `extraEffects`
(in-memory names that are never stored themselves), and saving folds them back in exactly as they were. Such a level
is **foreign**: it can be played with what is understood and renamed (both keep everything), but the editor will not
open it, because editing it here would lose what this version cannot show.

- **New content type**: add a new top-level field, read it in `normalise` with a default for when it is missing
  (every level saved before it simply has none), and add it to `KNOWN` in `js/levelformat.js`. Old levels keep
  working unchanged; older versions keep the new field aside.
- **New monster**: add it to `MONSTER_TYPES`; nothing here changes. **New object or effect kind**: add it to `OBJECTS`
  or `EFFECTS` in `js/levelformat.js` (and teach the engine and the editor what it is).
- **Changing what an existing field means**: bump `SCHEMA_VERSION` and add a step to `MIGRATIONS` that turns the
  old version into the new one, so levels saved before it are upgraded as they are read.

## Versions

- **1** (v15.0): one way out, `exit`. No objects, effects, title card, palette or difficulty.
- **2** (v15.1): `exits` (a list, with `locked`), `objects`, `effects`, `titleCard`, `palette`, `difficulty`.
  `MIGRATIONS[1]` turns a version 1 level's `exit` into a one-item `exits` list (or an empty one); everything else
  new starts empty, and the difficulty is Normal. Nothing else about a version 1 level changes: its walls, start,
  monsters, title and size read exactly as before, with no repair notes. A level that has `exit` and no `exits`,
  whatever version it says it is, is read the same way.
- **Older versions of the game reading version 2**: v15.0 sees a newer version, so the level is foreign there - it
  plays with the walls, start, monsters and the `exit` it is written for it (the first open way out), renames
  keeping everything, and is not editable.

## Where levels live

`js/levelstore.js` is the only thing that saves or loads them. Its interface is `list()`, `get(id)`, `save(doc)`,
`delete(id)` and (v15.1) `duplicate(id)`; today's one source, `local`, keeps each level in this browser's localStorage
under `echomaze.level.<id>` (the test copy's are `echomaze.test.level.<id>`), as the JSON above. A later source
(online, imported) implements the same calls and is added with `EchoLevelStore.register(source)`.

**Folders** (v15.1) are kept in their own list, one key, `echomaze.folders` (`echomaze.test.folders` in the test copy):

```json
{
  "schemaVersion": 1,
  "folders": [{ "id": "fd-mg7z1q0a-1x2y3z", "name": "Showcase", "createdAt": "...", "updatedAt": "..." }],
  "levels": { "lv-mg7z1q0a-3k9x2b7c1d": "fd-mg7z1q0a-1x2y3z" }
}
```

Flat: a folder holds levels, never folders; a level is in one folder, or in none (Unsorted). Names are 1-32
characters, tidied like a title; at most 50 folders. It is read as untrusted too: a bad entry is dropped, a level
filed in a folder that is not there is Unsorted, and a level that is not there is forgotten on the next write. The
store's calls: `listFolders()`, `createFolder(name)`, `renameFolder(id, name)`, `deleteFolder(id, { withLevels })` (by
default its levels go back to Unsorted), `moveLevel(levelId, folderId | null)`, `folderOf(levelId)`.
