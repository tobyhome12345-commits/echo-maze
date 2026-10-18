<#
  Rebuilds the owner's "completely finished" TEST COPY of the game from a saved version folder.

  Run it after every new version folder is exported (see CLAUDE.md, "The test copy"):

      powershell -NoProfile -ExecutionPolicy Bypass -File tools\update-test-copy.ps1

  Source : the newest "vX.Y - ..." folder in  C:\Claude\echo game\Echo Maze   (or pass -Source <folder>)
  Target : C:\Claude\echo game\Test - everything finished   (files are overwritten in place, nothing is deleted)

  What it does to the copy (and nothing else):
    * index.html  - title, a small "TEST COPY" notice, one extra <script src="test-save.js">
    * js\*.js     - every save-slot name "echomaze." becomes "echomaze.test." so the copy never touches the
                    real game's save (a browser shares localStorage between all local copies of the game)
    * test-save.js       - generated: marks every level of every mode cleared, every cutscene seen and every lore
                           fragment found (the ids are read from js\lore.js), unlocks the level editor and adds the
                           sample levels in tools\sample-levels.json to My Levels, and the folders in
                           tools\sample-folders.json (once); and (v15.2) ticks the first two bonus levels as done
                           (once), so the Bonus Levels tab shows what a tick looks like
    * READ ME - test copy.txt - generated; (v15.3) with the sample share codes from tools\sample-codes.txt to paste
                           into My Levels > Enter code (nothing else of sharing goes into the test save)
    * READ ME - test copy.txt - generated
  Everything else (style.css, README.md, social.jpg, the game code) is copied unchanged. The script checks all of this
  when it is done and stops with an error if anything did not come out as expected.

  It never edits the version folders, only reads them. ASCII only, so PowerShell 5.1 reads it correctly.
#>
param(
  [string]$GameRoot = 'C:\Claude\echo game',
  [string]$Source = ''
)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)   # the game's files are UTF-8 without BOM, LF line endings
function Get-Text([string]$p) { [IO.File]::ReadAllText($p, $utf8) }
function Set-Text([string]$p, [string]$s) { [IO.File]::WriteAllText($p, $s, $utf8) }
function Fail([string]$m) { throw "update-test-copy: $m" }

$versions = Join-Path $GameRoot 'Echo Maze'
$target = Join-Path $GameRoot 'Test - everything finished'

# ---- which version to copy
if (-not $Source) {
  $newest = Get-ChildItem $versions -Directory |
    ForEach-Object { if ($_.Name -match '^v(\d+)\.(\d+)\b') { [pscustomobject]@{ Major = [int]$Matches[1]; Minor = [int]$Matches[2]; Path = $_.FullName } } } |
    Sort-Object Major, Minor | Select-Object -Last 1
  if (-not $newest) { Fail "no vX.Y folder found in $versions" }
  $Source = $newest.Path
}
if (-not (Test-Path (Join-Path $Source 'index.html'))) { Fail "$Source has no index.html" }
$leaf = Split-Path $Source -Leaf
$label = if ($leaf -match '^(v\d+\.\d+)') { $Matches[1] } else { $leaf }

# ---- the version folder must hold only what this script knows how to copy
$known = @('index.html', 'style.css', 'README.md', 'social.jpg', 'manifest.webmanifest', 'sw.js', 'icons', 'js')
$unknown = Get-ChildItem $Source | Where-Object { $known -notcontains $_.Name } | ForEach-Object { $_.Name }
if ($unknown) { Fail "$leaf has files this script does not know how to copy: $($unknown -join ', ') - teach the script (and the test copy) about them first" }

New-Item -ItemType Directory -Force (Join-Path $target 'js') | Out-Null

# ---- plain copies
foreach ($f in 'style.css', 'README.md', 'social.jpg', 'manifest.webmanifest', 'sw.js') { Copy-Item (Join-Path $Source $f) (Join-Path $target $f) -Force }
Copy-Item (Join-Path $Source 'icons') $target -Recurse -Force

# ---- js: same code, but its own save slot
$jsNames = Get-ChildItem (Join-Path $Source 'js') -File | ForEach-Object { $_.Name }
$slotCount = 0
foreach ($n in $jsNames) {
  $src = Get-Text (Join-Path $Source "js\$n")
  if ($src -match 'echomaze\.test\.') { Fail "js\$n already uses echomaze.test. - the source is not a plain version" }
  $slotCount += ([regex]::Matches($src, 'echomaze\.')).Count
  Set-Text (Join-Path $target "js\$n") ($src -replace 'echomaze\.', 'echomaze.test.')
}
$gameJs = Get-Text (Join-Path $Source 'js\game.js')
if ($slotCount -lt 5) { Fail "expected the five echomaze.* save keys, found $slotCount" }
$newGame = Get-Text (Join-Path $target 'js\game.js')
foreach ($k in 'progress', 'seen', 'editor') {
  if ($newGame -notmatch "'echomaze\.test\.$k'") { Fail "game.js no longer has the '$k' save key that test-save.js fills in" }
}

# v15.0: the level editor - already unlocked, with the sample levels from tools\sample-levels.json in My Levels
# (js\levelstore.js keeps one level per key: LEVEL_PREFIX + its id)
$storeJs = Join-Path $target 'js\levelstore.js'
if (-not (Test-Path $storeJs) -or (Get-Text $storeJs) -notmatch "const LEVEL_PREFIX = 'echomaze\.test\.level\.';") { Fail "js\levelstore.js no longer keeps levels under 'echomaze.level.<id>' - update test-save.js's sample levels" }
$samplesPath = Join-Path $PSScriptRoot 'sample-levels.json'
if (-not (Test-Path $samplesPath)) { Fail "tools\sample-levels.json is missing" }
$samplesText = (Get-Text $samplesPath).Trim()
# (not `$samplesText | ConvertFrom-Json` inside @(): PowerShell 5.1 hands a JSON array down the pipe as ONE object)
try { $parsed = ConvertFrom-Json -InputObject $samplesText } catch { Fail "tools\sample-levels.json is not valid JSON: $_" }
$samples = @($parsed)
if ($samples.Count -lt 2) { Fail "tools\sample-levels.json should hold at least two sample levels" }
foreach ($s in $samples) { if ($s.format -ne 'echo-maze-level' -or $s.id -notmatch '^[A-Za-z0-9_-]{1,64}$') { Fail "a sample level in tools\sample-levels.json is not in the level format (format / id)" } }
$sampleTitles = ($samples | ForEach-Object { $_.title }) -join ', '
$samplesJs = ($samplesText -replace "`r`n", "`n") -replace "`n", "`n      "
# v15.1: folders for some of them. Which folder a level is in is kept apart from the levels (js\levelstore.js FOLDERS_KEY)
if ((Get-Text $storeJs) -notmatch "const FOLDERS_KEY = 'echomaze\.test\.folders';") { Fail "js\levelstore.js no longer keeps folders under 'echomaze.folders' - update test-save.js's sample folders" }
$foldersPath = Join-Path $PSScriptRoot 'sample-folders.json'
if (-not (Test-Path $foldersPath)) { Fail "tools\sample-folders.json is missing" }
$foldersText = (Get-Text $foldersPath).Trim()
try { $folderData = ConvertFrom-Json -InputObject $foldersText } catch { Fail "tools\sample-folders.json is not valid JSON: $_" }
$sampleIds = @($samples | ForEach-Object { $_.id })
foreach ($p in $folderData.levels.PSObject.Properties) {
  if ($sampleIds -notcontains $p.Name) { Fail "tools\sample-folders.json files '$($p.Name)', which is not a sample level" }
  if (@($folderData.folders | Where-Object { $_.id -eq $p.Value }).Count -ne 1) { Fail "tools\sample-folders.json files '$($p.Name)' in '$($p.Value)', which is not one of its folders" }
}
$folderNames = (@($folderData.folders) | ForEach-Object { $_.name }) -join ', '
$foldersJs = ($foldersText -replace "`r`n", "`n") -replace "`n", "`n        "
$oldFormat = @($samples | Where-Object { $_.schemaVersion -eq 1 }).Count

# v15.2: the bonus levels (js\bonus-levels.js, data only) - the first two already ticked as done, in their own key
# (js\levelstore.js BONUS_KEY), apart from every campaign save and from My Levels
if ((Get-Text $storeJs) -notmatch "const BONUS_KEY = 'echomaze\.test\.bonus';") { Fail "js\levelstore.js no longer keeps the bonus levels' ticks under 'echomaze.bonus' - update test-save.js's ticks" }
$bonusJs = Join-Path $Source 'js\bonus-levels.js'
if (-not (Test-Path $bonusJs)) { Fail "$leaf has no js\bonus-levels.js - the Bonus Levels need it" }
$bonusIds = @([regex]::Matches((Get-Text $bonusJs), '"id": "([A-Za-z0-9_-]{1,64})"') | ForEach-Object { $_.Groups[1].Value })
$bonusTitles = @([regex]::Matches((Get-Text $bonusJs), '"title": "([^"]*)"') | ForEach-Object { $_.Groups[1].Value })
if ($bonusIds.Count -lt 2 -or $bonusIds.Count -ne $bonusTitles.Count) { Fail "could not read the bonus levels' ids and titles from js\bonus-levels.js (found $($bonusIds.Count) ids, $($bonusTitles.Count) titles)" }
$doneIds = $bonusIds[0..1]
$doneTitles = ($bonusTitles[0..1]) -join ' and '
$doneJs = '{ ' + (($doneIds | ForEach-Object { "'$_': now" }) -join ', ') + ' }'

# v15.3: sample share codes for the READ ME (pasted by hand: they are NOT put into the test save)
$codesPath = Join-Path $PSScriptRoot 'sample-codes.txt'
if (-not (Test-Path $codesPath)) { Fail "tools\sample-codes.txt is missing" }
$codeLines = @((Get-Text $codesPath) -split "`n" | ForEach-Object { $_.TrimEnd() } | Where-Object { $_ -and -not $_.StartsWith('#') })
if ($codeLines.Count -lt 2) { Fail "tools\sample-codes.txt should hold at least two sample codes" }
$codesText = ''
foreach ($l in $codeLines) {
  $parts = $l -split ' \| ', 2
  if ($parts.Count -ne 2 -or $parts[1] -notmatch '^ECHO1[LF][0-9A-Za-z]+$') { Fail "a line in tools\sample-codes.txt is not 'what it is | ECHO1...': $l" }
  $codesText += "    $($parts[0])`n`n$($parts[1])`n`n"
}
if (-not (Test-Path (Join-Path $Source 'js\sharecode.js'))) { Fail "$leaf has no js\sharecode.js - the sample codes need a version with sharing" }

# ---- what "finished" means for THIS version of the game
# (up to v13.0 CAMPAIGN_LEVELS was a number in game.js; from v14.0 it is STORY_LAST, the last of the hand-drawn
#  levels 14-16, which lives in js/level.js)
if ($gameJs -match 'const CAMPAIGN_LEVELS = (\d+);') { $campaign = [int]$Matches[1] }
elseif ($gameJs -match 'const CAMPAIGN_LEVELS = STORY_LAST;') {
  $levelJs = Get-Text (Join-Path $Source 'js\level.js')
  if ($levelJs -notmatch 'const STORY_LAST = (\d+);') { Fail 'game.js says CAMPAIGN_LEVELS = STORY_LAST, but js\level.js has no STORY_LAST' }
  $campaign = [int]$Matches[1]
}
else { Fail 'could not read CAMPAIGN_LEVELS from game.js' }
$finished = $campaign + 1     # progress above the last level means "cleared the whole game"

if ($gameJs -notmatch 'const SCENE_LEADS_TO = \{([^}]*)\}') { Fail 'could not read SCENE_LEADS_TO from game.js' }
$scenes = @([regex]::Matches($Matches[1], '(\w+)\s*:') | ForEach-Object { $_.Groups[1].Value })
$block = [regex]::Match($gameJs, 'const SCENES = \[(.*?)\n  \];', 'Singleline')
if (-not $block.Success) { Fail 'could not read the SCENES list from game.js' }
$scenes += @([regex]::Matches($block.Groups[1].Value, "kind: '(\w+)'") | ForEach-Object { $_.Groups[1].Value })
$scenes = @($scenes | Select-Object -Unique)
if ($scenes.Count -lt 4) { Fail "only found $($scenes.Count) cutscenes ($($scenes -join ', ')); expected at least the four that exist" }
$seenJs = '{ ' + (($scenes | ForEach-Object { "$_`: 1" }) -join ', ') + ' }'

# v13.0: the lore fragments (js/lore.js) - every one found. Only the level ones (level 1 and up): the bonus is not
# stored, it simply appears once all of those are.
$loreJs = Join-Path $Source 'js\lore.js'
$fragments = @()
if (Test-Path $loreJs) {
  $fragments = @([regex]::Matches((Get-Text $loreJs), "\{ id: '(f\d+)', level: ([1-9]\d*),") | ForEach-Object { $_.Groups[1].Value })
  if ($fragments.Count -lt 12) { Fail "only found $($fragments.Count) lore fragments in js\lore.js; expected at least the twelve that exist" }
}
$loreJson = '[' + (($fragments | ForEach-Object { "'$_'" }) -join ', ') + ']'

# ---- index.html
$html = Get-Text (Join-Path $Source 'index.html')
$notice = 'TEST COPY &mdash; every level and cutscene is already finished and unlocked here. It has its own save slot, so your real game''s progress is not touched.'
$n1 = ([regex]::Matches($html, '<title>Echo Maze</title>')).Count
$n2 = ([regex]::Matches($html, '(?m)^[ \t]*<p class="tagline">.*</p>$')).Count
$n3 = ([regex]::Matches($html, '(?m)^[ \t]*<script src="js/game\.js"></script>$')).Count
if ($n1 -ne 1 -or $n2 -ne 1 -or $n3 -ne 1) { Fail "index.html changed shape (title/tagline/game.js script found $n1/$n2/$n3 times, expected 1 each) - update this script" }
$out = $html.Replace('<title>Echo Maze</title>', '<title>Echo Maze - TEST COPY (everything finished)</title>')
$out = [regex]::Replace($out, '(?m)^([ \t]*)(<p class="tagline">.*</p>)$', { param($m) $m.Groups[1].Value + $m.Groups[2].Value + "`n" + $m.Groups[1].Value + '<p class="notice">' + $notice + '</p>' })
$out = [regex]::Replace($out, '(?m)^([ \t]*)(<script src="js/game\.js"></script>)$', { param($m) $m.Groups[1].Value + '<script src="test-save.js"></script>' + "`n" + $m.Groups[1].Value + $m.Groups[2].Value })
Set-Text (Join-Path $target 'index.html') $out

# ---- test-save.js
$save = @"
'use strict';

/*
 * TEST COPY ONLY. Makes this copy of the game a "completely finished" save:
 *   - every level cleared in every difficulty (so Continue is replaced by "Finished",
 *     the Levels & cutscenes screen lets you pick any level, and Hardcore shows a finished high score)
 *   - every story cutscene already seen (so all of them can be replayed)
 *   - every lore fragment already found (so the Fragments screen is full, the bonus one included)
 *   - the Level Editor already unlocked (no spoiler warning), with sample levels in My Levels (v15.0) and
 *     sample folders holding some of them (v15.1) - added once only, so a sample or folder you delete or
 *     change stays that way until the copy's storage is cleared. Some samples are kept in the older v15.0
 *     format on purpose, so the copy also shows them being read by this version.
 *   - (v15.2) the first two Bonus Levels ticked as done ($doneTitles), once - in the ticks' own key,
 *     never in the campaign's saves
 *
 * This copy uses its OWN save slot (keys start with "echomaze.test."), so it never
 * touches the save of your real game. It only ever raises progress, never lowers it,
 * and it runs every time the page loads.
 * (Generated by tools/update-test-copy.ps1 from the game's own level and cutscene tables,
 *  and from tools/sample-levels.json.)
 */
(() => {
  try {
    const P = 'echomaze.test.';
    const FINISHED = $finished; // "cleared level $campaign, the last level"
    let progress = {};
    try {
      progress = JSON.parse(localStorage.getItem(P + 'progress')) || {};
    } catch (e) {
      progress = {};
    }
    for (const m of ['easy', 'normal', 'hard', 'hardcore']) progress[m] = Math.max(parseInt(progress[m], 10) || 0, FINISHED);
    localStorage.setItem(P + 'progress', JSON.stringify(progress));
    localStorage.setItem(P + 'seen', JSON.stringify($seenJs));
    // (v16.0) to watch a scene as a FIRST-TIME viewer (the keeper scene cannot be skipped then): put its name in
    // 'unseen' (comma-separated) and it is left unseen on every load, until that key is removed - see the READ ME
    try {
      const unseen = (localStorage.getItem(P + 'unseen') || '').split(',').map((k) => k.trim()).filter(Boolean);
      if (unseen.length) {
        const s = JSON.parse(localStorage.getItem(P + 'seen')) || {};
        for (const k of unseen) delete s[k];
        localStorage.setItem(P + 'seen', JSON.stringify(s));
      }
    } catch (e) {
      /* a damaged value: everything stays seen */
    }
    localStorage.setItem(P + 'lore', JSON.stringify($loreJson)); // every lore fragment found (v13.0)
    localStorage.setItem(P + 'editor', '1'); // the Level Editor's warning already accepted (v15.0)
    const SAMPLES = $samplesJs;
    // (v15.1: 'samples2' - a copy that already had v15.0's samples gets the new ones and the folders, once)
    if (!localStorage.getItem(P + 'samples2')) {
      for (const lv of SAMPLES) if (!localStorage.getItem(P + 'level.' + lv.id)) localStorage.setItem(P + 'level.' + lv.id, JSON.stringify(lv));
      if (!localStorage.getItem(P + 'folders')) {
        const FOLDERS = $foldersJs;
        const now = new Date().toISOString();
        localStorage.setItem(P + 'folders', JSON.stringify({ schemaVersion: 1, folders: FOLDERS.folders.map((f) => ({ id: f.id, name: f.name, createdAt: now, updatedAt: now })), levels: FOLDERS.levels }));
      }
      localStorage.setItem(P + 'samples', '1');
      localStorage.setItem(P + 'samples2', '1');
    }
    // (v15.7: 'samples3' - a copy that already had those gets the three with the unreleased monsters in them, once)
    if (!localStorage.getItem(P + 'samples3')) {
      for (const lv of SAMPLES) if (!localStorage.getItem(P + 'level.' + lv.id)) localStorage.setItem(P + 'level.' + lv.id, JSON.stringify(lv));
      localStorage.setItem(P + 'samples3', '1');
    }
    // (v15.2) two bonus levels already done, so the Bonus Levels tab shows its ticks - once ('bonus2'), and only
    // ever added to: a tick the tester earns or clears stays as it is
    if (!localStorage.getItem(P + 'bonus2')) {
      const now = new Date().toISOString();
      let ticks = {};
      try {
        ticks = JSON.parse(localStorage.getItem(P + 'bonus')) || {};
      } catch (e) {
        ticks = {};
      }
      const done = Object.assign({}, ticks && typeof ticks.done === 'object' ? ticks.done : {}, $doneJs);
      localStorage.setItem(P + 'bonus', JSON.stringify({ schemaVersion: 1, done }));
      localStorage.setItem(P + 'bonus2', '1');
    }
  } catch (e) {
    /* storage is blocked: this copy then just behaves like a fresh game */
  }
})();
"@
Set-Text (Join-Path $target 'test-save.js') (($save -replace "`r`n", "`n") + "`n")

# ---- READ ME
$today = Get-Date -Format 'yyyy-MM-dd'
$readme = @"
ECHO MAZE - TEST COPY (everything finished)
============================================

This is a test copy of the game that is already "completely finished". It is kept in
step with the real game: every time a new version is saved in the "Echo Maze" folder,
this copy is rebuilt from it. Right now it is the same game as version $($label.TrimStart('v')).
(last rebuilt $today)

  * every level ($campaign so far) is cleared in every difficulty (Easy, Normal, Hard, Hardcore)
  * every story cutscene ($($scenes.Count) so far) has been seen
  * every lore fragment ($($fragments.Count) so far) has been found, so the "Fragments" screen is full
  * so on the title screen every mode says "Finished", and the
    "Levels & cutscenes" button lets you play any level (Easy, Normal
    and Hard) or rewatch any cutscene, without playing through anything first
  * the Level Editor is already unlocked (no spoiler warning), and My Levels
    starts with $($samples.Count) sample levels: $sampleTitles
    ("Half Built" is unfinished on purpose, to show how a draft looks; $oldFormat of
    them are saved in the older v15.0 format on purpose, to show they still load),
    and the folders $folderNames holding some of them.
    They are added only once: delete or change one and it stays that way.
  * the scene between level 13 and level 14 (v16.0, "Somewhere Deeper" in Levels & cutscenes) is
    marked seen here like every scene, so it can be skipped. To watch it as a FIRST-TIME viewer (when
    it cannot be skipped by any key, click or tap - only paused, with P): press F12, open the Console,
    and type   localStorage.setItem('echomaze.test.unseen', 'keeper')   then reload the page. It now
    counts as unseen every time the copy loads: play it from Levels & cutscenes, or play level 13 from
    the level list and walk into the great room. To go back to normal, type
    localStorage.removeItem('echomaze.test.unseen')   and reload.
  * the unreleased monsters (the Alarm and the Screecho): the Level Editor shows its
    unreleased-content warning every time you open it - that is on purpose - and the samples
    "Alarm in a Dead End", "Screecho" and "Chorus" use them (Chorus mixes both with other
    monsters and a Level 15 monster), so you can try them straight away from My Levels.
  * the Bonus Levels tab (beside My Levels) has $($bonusIds.Count) levels that come with the game,
    and $doneTitles are already ticked as done (once only, like the samples)
  * level sharing: to try it, open the Level Editor, press "Enter code" in My Levels
    and paste one of these codes (each is one long line - copy all of it):

$codesText

To play it: double-click index.html (or the shortcut "Play Echo Maze (test - finished)"
next to this folder).

It does NOT touch your real game. This copy keeps its progress in its own save
slot ("echomaze.test.*"), separate from the real game's.
Its progress only ever goes up; to reset the test copy, clear the browser's site
data for it (it will be marked finished again the next time it opens).

What differs from the real version folder:
  * js/*.js      - only the save-slot names (echomaze.  ->  echomaze.test.)
  * index.html   - a title, a small "TEST COPY" notice, and one extra <script>
  * test-save.js - new: marks everything finished (see the comments inside)

Hardcore has no level select (by design: one life, no resuming), but its high
score shows "finished the game" and you can start a run from level 1.

Because the whole copy is rebuilt each time, do not edit files in this folder by hand:
the next rebuild overwrites them.
"@
Set-Text (Join-Path $target 'READ ME - test copy.txt') (($readme -replace "`r`n", "`n") + "`n")

# ---- check the result against the source
$problems = @()
foreach ($f in 'style.css', 'README.md', 'social.jpg', 'manifest.webmanifest', 'sw.js') {
  if ((Get-FileHash (Join-Path $Source $f)).Hash -ne (Get-FileHash (Join-Path $target $f)).Hash) { $problems += "$f is not identical to the source" }
}
foreach ($n in $jsNames) {
  $back = (Get-Text (Join-Path $target "js\$n")) -replace 'echomaze\.test\.', 'echomaze.'
  if ($back -ne (Get-Text (Join-Path $Source "js\$n"))) { $problems += "js\$n differs from the source by more than the save-slot names" }
}
$srcLines = (Get-Text (Join-Path $Source 'index.html')).Split("`n").Count
$dstLines = (Get-Text (Join-Path $target 'index.html')).Split("`n").Count
if ($dstLines -ne $srcLines + 2) { $problems += "index.html should have exactly 2 extra lines (has $($dstLines - $srcLines))" }
$extra = Get-ChildItem $target -Recurse -File | ForEach-Object { $_.FullName.Substring($target.Length + 1) } |
  Where-Object { @('index.html', 'style.css', 'README.md', 'social.jpg', 'manifest.webmanifest', 'sw.js', 'test-save.js', 'READ ME - test copy.txt') -notcontains $_ -and $_ -notmatch '^(js|icons)\\' }
if ($extra) { Write-Warning "files in the test copy that are not part of it (left alone): $($extra -join ', ')" }
$stale = Get-ChildItem (Join-Path $target 'js') -File | Where-Object { $jsNames -notcontains $_.Name } | ForEach-Object { $_.Name }
if ($stale) { Write-Warning "js files in the test copy that the source no longer has (left alone, but nothing loads them unless index.html does): $($stale -join ', ')" }
if ($problems) { Fail ($problems -join '; ') }

"Test copy rebuilt from '$leaf'"
"  levels: $campaign (progress set to $finished in every mode)"
"  cutscenes marked seen: $($scenes -join ', ')"
"  lore fragments marked found: $($fragments.Count)"
"  level editor unlocked, sample levels: $sampleTitles"
"  sample folders: $folderNames"
"  bonus levels: $($bonusTitles -join ', ') - ticked as done: $doneTitles"
"  sample share codes in the READ ME: $($codeLines.Count)"
"  save-slot names changed: $slotCount"
"  checks passed. Still open the copy once and look at it (see CLAUDE.md)."
