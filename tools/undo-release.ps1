<#
  tools/undo-release.ps1 - take a bad release back off GitHub (and so off the website), safely (CLAUDE.md, "Undoing
  a release").

    powershell -NoProfile -ExecutionPolicy Bypass -File tools\undo-release.ps1 -DryRun     (look first: changes nothing)
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\undo-release.ps1             (asks you to type UNDO)

  It works in its own clone (C:\Claude\echo game\Updater\undo-repo - never your working copy, never the updater's),
  finds the version main is on now and the release before it (from the history of VERSION.json, skipping any that
  were already undone), and adds ONE NEW COMMIT to main, "Undo release v16.1 (back to v16.0)", whose files are
  exactly main as it was at the end of the previous release. Nothing is deleted and no history is rewritten: the bad
  release stays in the history (and can be looked at or redone later), and it is a plain fast-forward push - never a
  force-push.
    - If GitHub refuses the push (main protected, or main moved on meanwhile), it pushes a branch "undo-v16.1" instead
      and opens a pull request (with gh) for you to merge.
    - Once main has the undo commit, GitHub Pages republishes the old version within a minute or two, and the PC
      updater follows it by itself on its next run (within 10 minutes): "Play Echo Maze" goes back to the older
      version folder and the test copy is rebuilt from it. The bad version's folder is left where it is.
    - The next release must use a NEW version number (the bad one's folder still exists, and the updater never
      overwrites a folder): after undoing v16.1, the fixed release is v16.2.
  Run it again to undo one more release.
  ASCII only, so Windows PowerShell 5.1 reads it correctly.
#>
param(
  [string]$RepoUrl = 'https://github.com/tobyhome12345-commits/echo-maze.git',
  [string]$WorkDir = 'C:\Claude\echo game\Updater\undo-repo',
  [switch]$DryRun,
  [switch]$Yes
)
$ErrorActionPreference = 'Stop'
$repo = $WorkDir
function Fail($msg) {
  Write-Host "STOPPED: $msg" -ForegroundColor Red
  exit 1
}
function Invoke-Git {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = & git.exe -C $repo @args 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0) { Fail "git $($args -join ' ') failed: $out" }
  return $out
}
function Try-Git {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = & git.exe -C $repo @args 2>$null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0) { return $null }
  return $out
}
function Ver-Key([string]$v) { if ($v -match '^v(\d+)\.(\d+)$') { return [int]$Matches[1] * 100000 + [int]$Matches[2] } return -1 }

# (the same reading of VERSION.json's history as tools\pc-updater.ps1 - keep the two in step)
function Get-Releases {
  $changes = @(Invoke-Git log --first-parent --reverse --format=%H HEAD -- VERSION.json | Where-Object { $_ })
  $raw = @()
  for ($i = 0; $i -lt $changes.Count; $i++) {
    $text = Try-Git show "$($changes[$i]):VERSION.json"
    if (-not $text) { continue }
    try { $v = ($text -join "`n") | ConvertFrom-Json } catch { continue }
    if ((Ver-Key $v.version) -lt 0) { continue }
    $until = if ($i -lt $changes.Count - 1) { (Invoke-Git rev-parse "$($changes[$i + 1])^1") } else { (Invoke-Git rev-parse HEAD) }
    $raw += [pscustomobject]@{ Version = [string]$v.version; Title = [string]$v.title; Commit = "$until"; Changed = $changes[$i] }
  }
  $kept = New-Object System.Collections.ArrayList
  foreach ($e in $raw) {
    while ($kept.Count -gt 0 -and (Ver-Key $kept[$kept.Count - 1].Version) -gt (Ver-Key $e.Version)) { $kept.RemoveAt($kept.Count - 1) }
    if ($kept.Count -gt 0 -and $kept[$kept.Count - 1].Version -eq $e.Version) {
      $kept[$kept.Count - 1].Commit = $e.Commit
      $kept[$kept.Count - 1].Title = $e.Title
    } else { [void]$kept.Add($e) }
  }
  return @($kept)
}

if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { Fail 'git is not installed (or not on PATH)' }
if (-not (Test-Path (Join-Path $repo '.git'))) {
  Write-Host "cloning $RepoUrl into $repo"
  New-Item -ItemType Directory -Force (Split-Path $repo -Parent) | Out-Null
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & git.exe clone --quiet $RepoUrl $repo 2>&1 | Out-Null
  $ErrorActionPreference = $prev
  if ($LASTEXITCODE -ne 0) { Fail "could not clone $RepoUrl" }
}
if (Invoke-Git status --porcelain) { Fail "$repo has local changes - it is this script's own clone and not for editing" }
Invoke-Git fetch --quiet origin | Out-Null
Invoke-Git checkout --quiet --detach origin/main | Out-Null
$head = Invoke-Git rev-parse --short HEAD

$kept = @(Get-Releases)
if ($kept.Count -lt 2) { Fail "main ($head) has no earlier release in VERSION.json's history to go back to (releases found: $(($kept | ForEach-Object { $_.Version }) -join ', '))" }
$bad = $kept[$kept.Count - 1]
$good = $kept[$kept.Count - 2]
$goodShort = Invoke-Git rev-parse --short $good.Commit
$since = @(Invoke-Git log --first-parent --format='%h %s' "$($good.Commit)..HEAD" | Where-Object { $_ })

Write-Host ''
Write-Host "Undo $($bad.Version) - $($bad.Title)   (main is at $head)"
Write-Host "  back to $($good.Version) - $($good.Title)   (main as it was at $goodShort)"
Write-Host "  commits on main since then that this takes back ($($since.Count)):"
$since | ForEach-Object { Write-Host "    $_" }
Write-Host '  it adds one new commit; nothing is deleted, no history is rewritten, no force-push'
if ($DryRun) {
  Write-Host ''
  Write-Host 'Dry run: nothing was changed.' -ForegroundColor Yellow
  exit 0
}
if (-not $Yes) {
  $answer = Read-Host "Type UNDO to take $($bad.Version) off main and the website"
  if ($answer -ne 'UNDO') { Write-Host 'Nothing was changed.'; exit 0 }
}
if (-not (Try-Git config user.email)) { Fail 'git has no user.email set - run: git config --global user.email "you@example.com" (and user.name) first' }

# the new commit: main's files exactly as they were at the end of the good release
Invoke-Git read-tree -u --reset $good.Commit | Out-Null
$msgFile = Join-Path (Split-Path $repo -Parent) 'undo-message.txt'
$msg = @"
Undo release $($bad.Version) (back to $($good.Version))

$($bad.Version) - $($bad.Title) is taken back: every file is as it was on main at
$goodShort, the end of $($good.Version) - $($good.Title). Nothing was deleted
and no history was rewritten; the undone commits are still in the history:
$(($since | ForEach-Object { "  $_" }) -join "`n")

The PC updater follows this by itself: Play Echo Maze goes back to the
$($good.Version) folder and the test copy is rebuilt from it. The next release
needs a new version number (the $($bad.Version) folder stays on the PC).
"@
[IO.File]::WriteAllText($msgFile, ($msg -replace "`r`n", "`n"), (New-Object System.Text.UTF8Encoding($false)))
Invoke-Git commit --quiet -F $msgFile | Out-Null
$undo = Invoke-Git rev-parse --short HEAD
Write-Host "made $undo  Undo release $($bad.Version) (back to $($good.Version))"

$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$push = & git.exe -C $repo push origin HEAD:refs/heads/main 2>&1 | ForEach-Object { "$_" }
$code = $LASTEXITCODE
$ErrorActionPreference = $prev
if ($code -eq 0) {
  Write-Host ''
  Write-Host "Done: main is back on $($good.Version). The website follows in a minute or two; your PC at the updater's next run" -ForegroundColor Green
  Write-Host '(within 10 minutes), or now: powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Claude\echo game\Updater\pc-updater.ps1"'
  exit 0
}
Write-Host "GitHub refused the push to main: $($push -join ' ')" -ForegroundColor Yellow
$branch = "undo-$($bad.Version)-$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
Invoke-Git push --quiet origin "HEAD:refs/heads/$branch" | Out-Null
Write-Host "pushed the undo to the branch $branch instead"
if (Get-Command gh -ErrorAction SilentlyContinue) {
  $slug = ($RepoUrl -replace '^https://github.com/', '') -replace '\.git$', ''
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $pr = & gh pr create --repo $slug --base main --head $branch --title "Undo release $($bad.Version) (back to $($good.Version))" --body-file $msgFile 2>&1 | ForEach-Object { "$_" }
  $ErrorActionPreference = $prev
  Write-Host "pull request: $pr"
  Write-Host 'Merge it on GitHub and the website and your PC follow as above.' -ForegroundColor Green
} else {
  Write-Host "Open a pull request from $branch into main on GitHub and merge it; the website and your PC follow as above." -ForegroundColor Green
}
