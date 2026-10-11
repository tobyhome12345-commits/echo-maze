# Echo Maze custom level format (schema version 1)

Custom levels (v15.0, the level editor) are stored as plain JSON. This file is the reference for that format;
`js/levelformat.js` is the code that reads and writes it, and the two must agree. Nothing in the format depends on
the editor: any source (the editor today; sharing or importing later) can supply a level in this shape.

## A level

```json
{
  "format": "echo-maze-level",
  "schemaVersion": 1,
  "id": "lv-mg7z1q0a-3k9x2b7c1d",
  "title": "Crowded Dark",
  "authorName": "",
  "createdAt": "2026-10-11T12:00:00.000Z",
  "updatedAt": "2026-10-11T12:00:00.000Z",
  "size": { "w": 29, "h": 25 },
  "walls": ["#############################", "#...........................#", "..."],
  "start": { "x": 1, "y": 3 },
  "exit": { "x": 27, "y": 23 },
  "enemies": [
    { "kind": "warden", "variant": "regular", "x": 27, "y": 1 },
    { "kind": "echo", "x": 16, "y": 3 }
  ]
}
```

| Field | Type | Rules |
| --- | --- | --- |
| `format` | string | Always `"echo-maze-level"`. A value that is present and different means "not a level": it is refused. Missing is accepted. |
| `schemaVersion` | integer | `1`. Missing or below 1 is read as 1. Higher than this version knows: read with what is understood, and the level is *foreign* (see below). |
| `id` | string | 1-64 characters of `A-Z a-z 0-9 _ -`. Unique within a source. Not valid: a new id is made. In local storage the key it is filed under is its id. |
| `title` | string | 1-48 characters after tidying (control characters become spaces, runs of spaces become one, trimmed). Empty: `"Untitled level"`. |
| `authorName` | string | 0-32 characters, same tidying. Always `""` in this version (levels are private); kept for sharing later. |
| `createdAt`, `updatedAt` | string | ISO 8601 dates (numbers in milliseconds are accepted when reading). Invalid: the time it was read. A save stamps `updatedAt`. |
| `size` | `{ w, h }` | Tiles of 40 px. `w` 5-61, `h` 5-45; out of range is clamped. Missing: worked out from `walls`. |
| `walls` | string[] | Exactly `h` rows of exactly `w` characters: `#` is a wall, `.` is floor. Anything else, a missing row or a short row is read as floor. Outside the grid counts as wall in the game. |
| `start`, `exit` | `{ x, y }` or `null` | A tile inside the grid, or `null` while not placed. Outside the grid: removed (`null`). |
| `enemies` | array | At most 40, at most one per tile, each `{ kind, x, y }` on a tile inside the grid, plus `variant` for a kind that has variants. Extras beyond 40, a second one on a tile and ones outside the grid are dropped. |

### Monster kinds

The kinds are the game's own list, `MONSTER_TYPES` in `js/level.js` - the editor, the loader and `makeEnemy` all read
it, so a monster added to the game is accepted here by being added there. Today: `echo`, `scent`, `mimic`, `stalker`,
`muffler`, `singer`, and `warden` with `variant` `regular` (the editor calls it "Level 15 monster") or `upgraded`
("Level 16 monster") - the variants are `js/warden.js` `VARIANTS`. A `warden` with no `variant` is read as the first
variant. Positions are tiles; a monster stands at the tile's centre.

## Playable or unfinished

Not stored: it is worked out every time, by `js/levelcheck.js`, so a level can never claim to be playable. A level
is **playable** when it has a start and an exit, both on floor, on different tiles; the exit can be walked to from
the start (four-way steps over floor, the game's own pathfinding); no monster is inside a wall; and no monster is on
the start. A monster on the exit is only a warning. Anything else is **unfinished**: it can be saved and edited, not
played. The engine's loader (`buildCustomLevel` in `js/level.js`) refuses anything that is not playable.

## Untrusted data

Every reader treats a level as untrusted, whatever its source. `EchoLevelFormat.normalise(anything)` never throws:
it accepts a string or an object, clamps every number, drops what it cannot use (and lists what it repaired in
`notes`), refuses what is not a level at all (`{ doc: null, error }`), and never copies `__proto__`, `constructor` or
`prototype`. A stored text longer than 400,000 characters is refused unread.

## Foreign levels, and adding to the format

Fields this version does not know, and monsters of a kind or variant it does not know, are **kept aside, not lost**:
the read level carries them in `extra` and `extraEnemies` (two in-memory names that are never stored themselves),
and saving folds them back in exactly as they were. Such a level is **foreign**: it can be played with what is
understood and renamed (both keep everything), but the editor will not open it, because editing it here would lose
what this version cannot show.

- **New content type** (objects, lights, effects...): add a new top-level field, read it in `normalise` with a
  default for when it is missing (every level saved before it simply has none), and add it to `KNOWN` in
  `js/levelformat.js`. Old levels keep working unchanged; older versions keep the new field aside.
- **New monster**: add it to `MONSTER_TYPES`; nothing here changes.
- **Changing what an existing field means**: bump `SCHEMA_VERSION` and add a step to `MIGRATIONS` that turns the
  old version into the new one, so levels saved before it are upgraded as they are read.

## Where levels live

`js/levelstore.js` is the only thing that saves or loads them. Its interface is `list()`, `get(id)`, `save(doc)` and
`delete(id)`; today's one source, `local`, keeps each level in this browser's localStorage under
`echomaze.level.<id>` (the test copy's are `echomaze.test.level.<id>`), as the JSON above. A later source (online,
imported) implements the same four calls and is added with `EchoLevelStore.register(source)`.

## How a custom level plays

On the difficulty picked on the title screen, tuned like level 12 of the ordinary curve (`CUSTOM_CURVE_LEVEL` in
`js/level.js`: the ripple's range and recharge, every monster's speed and hearing), through exactly the same engine
as the hand-drawn levels 13-16. Wardens hunt from the moment the level starts, at their variant's speed. Nothing
about playing one is ever saved - no progress, medals, stats or fragments - and on Hardcore it still offers Try again.
