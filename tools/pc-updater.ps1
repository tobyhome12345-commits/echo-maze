<#
  tools/pc-updater.ps1 - the owner's PC catches up with main by itself (CLAUDE.md, "The PC updater").

  Installed (copied) to  C:\Claude\echo game\Updater\pc-updater.ps1  by tools\install-pc-updater.ps1, which also
  makes the Windows scheduled task "Echo Maze updater" that runs it at log-on and every 10 minutes, hidden. To run it
  by hand:

    powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Claude\echo game\Updater\pc-updater.ps1"

  What it does, every run:
    1. Pulls main into ITS OWN clone, C:\Claude\echo game\Updater\repo - never the owner's working copy. Fast-forward
       only: if main on GitHub no longer contains what it pulled last time (history rewritten), it stops and changes
       nothing. If that clone has local edits, it stops and changes nothing.
    2. Reads VERSION.json ({ "version": "v16.1", "title": "jail cutscene" }) and the history of it on main.
    3. If a folder for that version already exists in C:\Claude\echo game\Echo Maze ("v16.1" or "v16.1 - ..."),
       it does nothing (and says so in the log once). The only exceptions, both of which touch no version folder:
         - main has just been UNDONE (VERSION.json went back to an older version, tools\undo-release.ps1): the
           "Play Echo Maze" shortcut is pointed back at that older folder and the test copy rebuilt from it, once;
         - the test copy failed to rebuild on an earlier run: it tries the test copy again.
    4. Otherwise it makes the new folder "vX.Y - title" (and the folder of any version it missed while the PC was off
       - every version that was released and not undone), exactly as every release before it: the commit's top-level
       game files, without the repo-only ones (CLAUDE.md, VERSION.json, tools, docs, .github, ...). It points
       "Play Echo Maze.lnk" at the newest one, rebuilds "Test - everything finished" with tools\update-test-copy.ps1
       (the same test save as always), checks it with tools\test-copy-check.js, and makes sure the test copy's
       shortcut points at it.
  It never overwrites, renames or deletes a version folder, never touches the game's saves (they live in the
  browser), never commits or pushes. A second copy of it cannot run at the same time (updater.lock).

  The log: C:\Claude\echo game\Updater\updater.log (what it did; quiet runs add nothing). last-run.txt holds the
  time and result of the last run. state.json is its memory between runs.

  -GameRoot / -UpdaterDir / -RepoUrl exist so it can be tried on a throwaway copy; the defaults are the real ones.
  ASCII only, so Windows PowerShell 5.1 reads it correctly.
#>
param(
  [string]$GameRoot = 'C:\Claude\echo game',
  [string]$UpdaterDir = '',
  [string]$RepoUrl = 'https://github.com/tobyhome12345-commits/echo-maze.git'
)
$ErrorActionPreference = 'Stop'
if (-not $UpdaterDir) { $UpdaterDir = Join-Path $GameRoot 'Updater' }
$repo = Join-Path $UpdaterDir 'repo'
$versionsDir = Join-Path $GameRoot 'Echo Maze'
$testDir = Join-Path $GameRoot 'Test - everything finished'
$playLnk = Join-Path $GameRoot 'Play Echo Maze.lnk'
$testLnk = Join-Path $GameRoot 'Play Echo Maze (test - finished).lnk'
$logFile = Join-Path $UpdaterDir 'updater.log'
$stateFile = Join-Path $UpdaterDir 'state.json'
$lastRunFile = Join-Path $UpdaterDir 'last-run.txt'
$stagingDir = Join-Path $UpdaterDir 'staging'
# the repo-only top-level entries: never part of a version folder (the same list as tools\local-release.ps1)
$repoOnly = @('CLAUDE.md', '.gitignore', '.gitattributes', 'tools', 'docs', '.github', '.claude', 'VERSION.json')
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Stamp { (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') }
function Log([string]$msg) {
  [IO.File]::AppendAllText($logFile, "$(Stamp)  $msg`r`n", $utf8)
  Write-Host $msg
}
function Trim-Log {
  # (keeps the log from growing for ever: past 1 MB, only its last 4000 lines are kept)
  if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt 1MB) {
    $keep = Get-Content $logFile -Tail 4000
    [IO.File]::WriteAllLines($logFile, [string[]]$keep, $utf8)
  }
}
function Load-State {
  if (Test-Path $stateFile) {
    try { return (Get-Content $stateFile -Raw | ConvertFrom-Json) } catch { }
  }
  return [pscustomobject]@{ lastNote = ''; handledUndo = ''; testCopyPending = '' }
}
function Save-State($s) { [IO.File]::WriteAllText($stateFile, ($s | ConvertTo-Json), $utf8) }
# a note that would repeat every 10 minutes ("nothing new", "offline") goes in the log only when it changes
function Note([string]$msg) {
  if ($script:state.lastNote -ne $msg) { Log $msg }
  $script:state.lastNote = $msg
}
# (after it has done something, the next quiet run has nothing new to say: its note is remembered as already said)
function Idle-Note([string]$head, [string]$version, [string]$folderName) { "nothing new: main ($head) is $version, and $folderName already exists - nothing changed" }

function Invoke-Git {
  # (git prints ordinary progress on stderr; Windows PowerShell would treat that as an error under 'Stop')
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = & git.exe -c core.autocrlf=false -C $repo @args 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0) { throw "git $($args -join ' ') failed: $($out -join ' ')" }
  return $out
}
function Try-Git {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = & git.exe -c core.autocrlf=false -C $repo @args 2>$null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0) { return $null }
  return $out
}
function Ver-Key([string]$v) { if ($v -match '^v(\d+)\.(\d+)$') { return [int]$Matches[1] * 100000 + [int]$Matches[2] } return -1 }
function Folder-For([string]$v) {
  return @(Get-ChildItem $versionsDir -Directory | Where-Object { $_.Name -eq $v -or $_.Name -like "$v - *" })
}

<#
  The releases on main, from the history of VERSION.json along main's own line (first parent): every commit that
  changed it, in order. A version that later goes DOWN again was undone (tools\undo-release.ps1) and is dropped.
  Returns { kept = @(@{Version; Title; Commit}...) oldest first; lastUndo = the commit of the last change if that
  change was an undo, else '' }. Commit = the last commit of main while that version was current.
#>
function Get-Releases {
  $changes = @(Invoke-Git log --first-parent --reverse --format=%H HEAD -- VERSION.json | Where-Object { $_ })
  $raw = @()
  for ($i = 0; $i -lt $changes.Count; $i++) {
    $text = Try-Git show "$($changes[$i]):VERSION.json"
    if (-not $text) { continue } # (deleted at that commit)
    try { $v = ($text -join "`n") | ConvertFrom-Json } catch { continue }
    if ((Ver-Key $v.version) -lt 0) { continue }
    $until = if ($i -lt $changes.Count - 1) { (Invoke-Git rev-parse "$($changes[$i + 1])^1") } else { (Invoke-Git rev-parse HEAD) }
    $raw += [pscustomobject]@{ Version = [string]$v.version; Title = [string]$v.title; Commit = "$until"; Changed = $changes[$i] }
  }
  $kept = New-Object System.Collections.ArrayList
  $lastUndo = ''
  foreach ($e in $raw) {
    $popped = $false
    while ($kept.Count -gt 0 -and (Ver-Key $kept[$kept.Count - 1].Version) -gt (Ver-Key $e.Version)) {
      $kept.RemoveAt($kept.Count - 1)
      $popped = $true
    }
    $lastUndo = if ($popped) { $e.Changed } else { '' }
    if ($kept.Count -gt 0 -and $kept[$kept.Count - 1].Version -eq $e.Version) {
      $kept[$kept.Count - 1].Commit = $e.Commit
      $kept[$kept.Count - 1].Title = $e.Title
    } else {
      [void]$kept.Add($e)
    }
  }
  return [pscustomobject]@{ kept = @($kept); lastUndo = $lastUndo }
}

function Set-Shortcut([string]$lnkPath, [string]$target) {
  $sh = New-Object -ComObject WScript.Shell
  $lnk = $sh.CreateShortcut($lnkPath)
  if ((Test-Path $lnkPath) -and $lnk.TargetPath -eq $target) { return $false }
  $before = if (Test-Path $lnkPath) { $lnk.TargetPath } else { '(none)' }
  $lnk.TargetPath = $target
  $lnk.WorkingDirectory = Split-Path $target -Parent
  $lnk.Save()
  Log "  shortcut $(Split-Path $lnkPath -Leaf): $before -> $target"
  return $true
}

function New-VersionFolder($r) {
  $title = $r.Title.Trim()
  if (-not $title -or $title -match '[\\/:*?"<>|]') { throw "VERSION.json for $($r.Version) has a title that cannot be a folder name: '$($r.Title)'" }
  $name = "$($r.Version) - $title"
  $dest = Join-Path $versionsDir $name
  if (Folder-For $r.Version) { throw "a folder for $($r.Version) appeared while running - not touching it" }
  New-Item -ItemType Directory -Force $stagingDir | Out-Null
  $entries = @(Invoke-Git ls-tree --name-only $r.Commit | Where-Object { $repoOnly -notcontains $_ })
  if ($entries -notcontains 'index.html') { throw "$($r.Commit) has no index.html at the top - not a release" }
  $zip = Join-Path $stagingDir 'export.zip'   # (one file, overwritten each time - nothing to clean up)
  Invoke-Git archive --format=zip -o $zip $r.Commit @entries | Out-Null
  $stage = Join-Path $stagingDir $name
  if (Test-Path $stage) { Rename-Item $stage "$name.leftover-$((Get-Date).ToString('yyyyMMdd-HHmmss'))" } # (a run that was cut off)
  Expand-Archive $zip $stage
  if (-not (Test-Path (Join-Path $stage 'index.html'))) { throw "the export of $($r.Version) has no index.html" }
  Move-Item $stage $dest   # (same drive: a rename, so the folder appears whole or not at all)
  $short = (Invoke-Git rev-parse --short $r.Commit)
  Log "  made $dest from $short ($((Get-ChildItem $dest | Select-Object -ExpandProperty Name) -join ', '))"
  return $dest
}

function Update-TestCopy([string]$source) {
  $script:state.testCopyPending = (Split-Path $source -Leaf)
  Save-State $script:state
  Log "  rebuilding the test copy from $(Split-Path $source -Leaf)"
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $repo 'tools\update-test-copy.ps1') -GameRoot $GameRoot -Source $source 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  foreach ($l in $out) { if ($l.Trim()) { Log "    $l" } }
  if ($code -ne 0) { throw "tools\update-test-copy.ps1 stopped (it will be tried again on the next run)" }
  if (Get-Command node -ErrorAction SilentlyContinue) {
    $ErrorActionPreference = 'Continue'
    $out = & node (Join-Path $repo 'tools\test-copy-check.js') $testDir 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    foreach ($l in $out) { if ($l.Trim()) { Log "    $l" } }
    if ($code -ne 0) { throw "the rebuilt test copy did not pass tools\test-copy-check.js (it will be tried again on the next run)" }
  } else {
    Log '  (node is not installed: the test copy was rebuilt but not checked in a browser)'
  }
  Set-Shortcut $testLnk (Join-Path $testDir 'index.html') | Out-Null
  $script:state.testCopyPending = ''
  Save-State $script:state
}

# ------------------------------------------------------------------------------------------------- the run
New-Item -ItemType Directory -Force $UpdaterDir | Out-Null
try {
  $lock = [IO.File]::Open((Join-Path $UpdaterDir 'updater.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
} catch {
  [IO.File]::WriteAllText($lastRunFile, "$(Stamp)  skipped: another run was still going`r`n", $utf8)
  exit 0
}
$state = Load-State
foreach ($k in 'lastNote', 'handledUndo', 'testCopyPending') { if (-not ($state.PSObject.Properties.Name -contains $k)) { $state | Add-Member -NotePropertyName $k -NotePropertyValue '' } }
$result = 'ok'
try {
  Trim-Log
  if (-not (Test-Path $versionsDir)) { throw "$versionsDir is not here - nothing to update" }
  if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { throw 'git is not installed (or not on PATH) - the updater needs it' }

  # 1. its own clone, fast-forward only
  if (-not (Test-Path (Join-Path $repo '.git'))) {
    Log "first run: cloning $RepoUrl into $repo"
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $out = & git.exe -c core.autocrlf=false clone --quiet --config core.autocrlf=false --branch main $RepoUrl $repo 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { throw "git clone failed: $($out -join ' ')" }
  }
  if (Invoke-Git status --porcelain) { throw "the updater's own clone ($repo) has local changes - it is not for editing. Nothing was changed; see CLAUDE.md, 'The PC updater'" }
  if ((Invoke-Git rev-parse --abbrev-ref HEAD) -ne 'main') { throw "the updater's own clone ($repo) is not on main - nothing was changed" }
  try { Invoke-Git fetch --quiet origin main | Out-Null } catch {
    Note "could not reach GitHub (offline?) - will try again next run"
    $result = 'offline'
    throw 'quiet'
  }
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & git.exe -c core.autocrlf=false -C $repo merge-base --is-ancestor HEAD origin/main 2>$null
  $ancestor = $LASTEXITCODE -eq 0
  $ErrorActionPreference = $prev
  if (-not $ancestor) { throw "main on GitHub no longer contains $(Invoke-Git rev-parse --short HEAD), which this PC pulled before - its history was rewritten. Not following it; nothing was changed. See CLAUDE.md, 'The PC updater'" }
  Invoke-Git merge --ff-only --quiet origin/main | Out-Null
  $head = Invoke-Git rev-parse --short HEAD

  # 2. what main says
  $hasVersion = Try-Git cat-file -t HEAD:VERSION.json   # ("blob", or nothing)
  if (-not $hasVersion) {
    Note "main ($head) has no VERSION.json yet - nothing to release"
    throw 'quiet'
  }
  $rel = Get-Releases
  if (-not $rel.kept.Count) { throw "VERSION.json on main ($head) could not be read" }
  $current = $rel.kept[$rel.kept.Count - 1]
  $have = Folder-For $current.Version

  if ($have) {
    # 3. already released - nothing to do, unless main was just undone, or the test copy still needs building
    $folder = $have[0].FullName
    if ($rel.lastUndo -and $state.handledUndo -ne $rel.lastUndo) {
      Log "main ($head) was UNDONE back to $($current.Version): following it"
      Set-Shortcut $playLnk (Join-Path $folder 'index.html') | Out-Null
      $state.handledUndo = $rel.lastUndo
      Save-State $state
      Update-TestCopy $folder
      Log "done: the PC is back on $($have[0].Name) (no folder was removed)"
      $state.lastNote = (Idle-Note $head $current.Version $have[0].Name)
    } elseif ($state.testCopyPending -and $state.testCopyPending -eq $have[0].Name) {
      Log "the test copy for $($have[0].Name) did not finish last time - trying again"
      Update-TestCopy $folder
      Log 'done: the test copy is rebuilt'
      $state.lastNote = (Idle-Note $head $current.Version $have[0].Name)
    } else {
      Note (Idle-Note $head $current.Version $have[0].Name)
    }
  } else {
    # 4. a new version (and any it missed): new folders, the shortcut, the test copy
    $missing = @($rel.kept | Where-Object { -not (Folder-For $_.Version) })
    Log "new on main ($head): $(($missing | ForEach-Object { "$($_.Version) - $($_.Title)" }) -join ', ')"
    foreach ($r in $missing) { New-VersionFolder $r | Out-Null }
    $currentFolder = (Folder-For $current.Version)[0].FullName
    Set-Shortcut $playLnk (Join-Path $currentFolder 'index.html') | Out-Null
    Update-TestCopy $currentFolder
    Log "done: $($current.Version) is in $currentFolder, Play Echo Maze points at it, and the test copy is rebuilt"
    $state.lastNote = (Idle-Note $head $current.Version (Split-Path $currentFolder -Leaf))
    if ($rel.lastUndo) { $state.handledUndo = $rel.lastUndo }
  }
} catch {
  if ("$_" -ne 'quiet') {
    $result = "ERROR: $_"
    Log $result
  }
} finally {
  Save-State $state
  [IO.File]::WriteAllText($lastRunFile, "$(Stamp)  $result`r`n", $utf8)
  $lock.Close()
}
if ($result -like 'ERROR*') { exit 1 }
exit 0
