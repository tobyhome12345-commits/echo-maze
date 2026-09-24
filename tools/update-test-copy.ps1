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
    * test-save.js       - generated: marks every level of every mode cleared and every cutscene seen
    * READ ME - test copy.txt - generated
  Everything else (style.css, README.md, the game code) is copied unchanged. The script checks all of this
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
$known = @('index.html', 'style.css', 'README.md', 'js')
$unknown = Get-ChildItem $Source | Where-Object { $known -notcontains $_.Name } | ForEach-Object { $_.Name }
if ($unknown) { Fail "$leaf has files this script does not know how to copy: $($unknown -join ', ') - teach the script (and the test copy) about them first" }

New-Item -ItemType Directory -Force (Join-Path $target 'js') | Out-Null

# ---- plain copies
foreach ($f in 'style.css', 'README.md') { Copy-Item (Join-Path $Source $f) (Join-Path $target $f) -Force }

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
foreach ($k in 'progress', 'seen') {
  if ($newGame -notmatch "'echomaze\.test\.$k'") { Fail "game.js no longer has the '$k' save key that test-save.js fills in" }
}

# ---- what "finished" means for THIS version of the game
if ($gameJs -notmatch 'const CAMPAIGN_LEVELS = (\d+);') { Fail 'could not read CAMPAIGN_LEVELS from game.js' }
$campaign = [int]$Matches[1]
$finished = $campaign + 1     # progress above the last level means "cleared the whole game"

if ($gameJs -notmatch 'const SCENE_LEADS_TO = \{([^}]*)\}') { Fail 'could not read SCENE_LEADS_TO from game.js' }
$scenes = @([regex]::Matches($Matches[1], '(\w+)\s*:') | ForEach-Object { $_.Groups[1].Value })
$block = [regex]::Match($gameJs, 'const SCENES = \[(.*?)\n  \];', 'Singleline')
if (-not $block.Success) { Fail 'could not read the SCENES list from game.js' }
$scenes += @([regex]::Matches($block.Groups[1].Value, "kind: '(\w+)'") | ForEach-Object { $_.Groups[1].Value })
$scenes = @($scenes | Select-Object -Unique)
if ($scenes.Count -lt 4) { Fail "only found $($scenes.Count) cutscenes ($($scenes -join ', ')); expected at least the four that exist" }
$seenJs = '{ ' + (($scenes | ForEach-Object { "$_`: 1" }) -join ', ') + ' }'

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
 *
 * This copy uses its OWN save slot (keys start with "echomaze.test."), so it never
 * touches the save of your real game. It only ever raises progress, never lowers it,
 * and it runs every time the page loads.
 * (Generated by tools/update-test-copy.ps1 from the game's own level and cutscene tables.)
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
  * so on the title screen every mode says "Finished", and the
    "Levels & cutscenes" button lets you play any level (Easy, Normal
    and Hard) or rewatch any cutscene, without playing through anything first

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
foreach ($f in 'style.css', 'README.md') {
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
  Where-Object { @('index.html', 'style.css', 'README.md', 'test-save.js', 'READ ME - test copy.txt') -notcontains $_ -and $_ -notmatch '^js\\' }
if ($extra) { Write-Warning "files in the test copy that are not part of it (left alone): $($extra -join ', ')" }
$stale = Get-ChildItem (Join-Path $target 'js') -File | Where-Object { $jsNames -notcontains $_.Name } | ForEach-Object { $_.Name }
if ($stale) { Write-Warning "js files in the test copy that the source no longer has (left alone, but nothing loads them unless index.html does): $($stale -join ', ')" }
if ($problems) { Fail ($problems -join '; ') }

"Test copy rebuilt from '$leaf'"
"  levels: $campaign (progress set to $finished in every mode)"
"  cutscenes marked seen: $($scenes -join ', ')"
"  save-slot names changed: $slotCount"
"  checks passed. Still open the copy once and look at it (see CLAUDE.md)."
