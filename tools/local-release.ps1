<#
  tools/local-release.ps1 - the release steps that only exist on the owner's PC, for a version that has been
  merged into main (normally from a cloud session's pull request). Run it from anywhere:

    powershell -NoProfile -ExecutionPolicy Bypass -File tools\local-release.ps1 -Version v16.0 -Description "jail cutscene"
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\local-release.ps1 -Version v16.0 -Description "jail cutscene" -DryRun

  What it does, in order, stopping at the first thing that is not right:
    1. checks the repo has no uncommitted changes, switches to main and pulls it (fast-forward only)
    2. picks the commit to release: main as it is now, or -Commit <sha> (which must be on main)
    3. refuses if a folder for that version already exists - nothing is ever overwritten, renamed or deleted
    4. exports the commit as the NEW folder  C:\Claude\echo game\Echo Maze\<Version> - <Description>
       (every top-level file of the game - everything at that commit except the repo-only CLAUDE.md, .gitignore,
       tools, docs and .github - which is the same list CLAUDE.md's git archive line names)
    5. re-points C:\Claude\echo game\Play Echo Maze.lnk at the new folder's index.html
    6. rebuilds the finished test copy (tools\update-test-copy.ps1) and checks it (node tools\test-copy-check.js)
  -DryRun prints what it would do and changes nothing. -SkipTestCopy leaves the test copy alone.
  It never commits or pushes anything.
#>
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$Description,
  [string]$Commit = '',
  [switch]$DryRun,
  [switch]$SkipTestCopy
)
$ErrorActionPreference = 'Stop'
function Fail($msg) {
  Write-Host "STOPPED: $msg" -ForegroundColor Red
  exit 1
}
function Invoke-Git {
  # (git prints ordinary progress on stderr; Windows PowerShell would treat that as an error under 'Stop')
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = & git.exe @args 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0) { Fail "git $($args -join ' ') failed: $out" }
  return $out
}

$repo = Split-Path $PSScriptRoot -Parent
$gameRoot = 'C:\Claude\echo game'
$versionsDir = Join-Path $gameRoot 'Echo Maze'
$shortcut = Join-Path $gameRoot 'Play Echo Maze.lnk'
# the repo-only top-level entries: never part of a version folder
$repoOnly = @('CLAUDE.md', '.gitignore', '.gitattributes', 'tools', 'docs', '.github', '.claude', 'VERSION.json')

if ($Version -notmatch '^v\d+\.\d+$') { Fail "-Version must look like v16.0 (got '$Version')" }
if ($Description -match '[\\/:*?"<>|]' -or -not $Description.Trim()) { Fail "-Description must be a few plain words for the folder name (no \ / : * ? `" < > |)" }
if (-not (Test-Path $versionsDir)) { Fail "$versionsDir is not here - this script is for the owner's PC only" }

Set-Location $repo
if (Invoke-Git status --porcelain) { Fail "the repo at $repo has uncommitted changes - commit or stash them first" }
if ((Invoke-Git rev-parse --abbrev-ref HEAD) -ne 'main') {
  Write-Host 'switching to main'
  Invoke-Git checkout main | Out-Null
}
Invoke-Git fetch origin | Out-Null
Invoke-Git pull --ff-only origin main | Out-Null
$sha = if ($Commit) { Invoke-Git rev-parse --verify "$Commit^{commit}" } else { Invoke-Git rev-parse HEAD }
& git merge-base --is-ancestor $sha HEAD
if ($LASTEXITCODE -ne 0) { Fail "commit $Commit is not on main" }
$short = Invoke-Git rev-parse --short $sha
$subject = Invoke-Git log -1 --format=%s $sha

# the version table should already have the row (the pull request adds it)
$claude = (Invoke-Git show "$($sha):CLAUDE.md") -join "`n"
$row = ($claude -split "`n") | Where-Object { $_ -match "^\| $([regex]::Escape($Version)) \|" } | Select-Object -First 1
if (-not $row) { Write-Warning "CLAUDE.md at $short has no row for $Version in the version table - is this the right version number?" }

$existing = Get-ChildItem $versionsDir -Directory | Where-Object { $_.Name -eq $Version -or $_.Name -like "$Version - *" }
if ($existing) { Fail "a folder for $Version already exists: $($existing.Name -join ', ') - nothing was changed" }
$name = "$Version - $($Description.Trim())"
$dest = Join-Path $versionsDir $name
$entries = Invoke-Git ls-tree --name-only $sha | Where-Object { $repoOnly -notcontains $_ }

Write-Host ''
Write-Host "Release $Version from $short ($subject)"
Write-Host "  new folder : $dest"
Write-Host "  files      : $($entries -join ' ')"
Write-Host "  shortcut   : $shortcut -> $(Join-Path $dest 'index.html')"
Write-Host "  test copy  : $(if ($SkipTestCopy) { 'left alone (-SkipTestCopy)' } else { 'rebuilt and checked' })"
if ($row -and $row -match '\| PENDING \|') { Write-Host "  note       : the $Version row's commit says PENDING - the merged commit is $short (the next pull request fills it in)" }
if ($DryRun) {
  Write-Host ''
  Write-Host 'Dry run: nothing was changed.' -ForegroundColor Yellow
  exit 0
}

# the folder
$zip = Join-Path $env:TEMP "echo-maze-$Version-$short.zip"
Invoke-Git -c core.autocrlf=false archive --format=zip -o $zip $sha @entries | Out-Null   # (LF, as the game files are - whatever this PC's git does with line endings)
Expand-Archive $zip $dest
Write-Host "made $dest ($((Get-ChildItem $dest | Select-Object -ExpandProperty Name) -join ', '))"

# the shortcut
$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut($shortcut)
$before = $lnk.TargetPath
$lnk.TargetPath = Join-Path $dest 'index.html'
$lnk.WorkingDirectory = $dest
$lnk.Save()
Write-Host "shortcut: $before -> $($sh.CreateShortcut($shortcut).TargetPath)"

# the finished test copy
if (-not $SkipTestCopy) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'update-test-copy.ps1')
  if ($LASTEXITCODE -ne 0) { Fail 'tools\update-test-copy.ps1 stopped - fix the script (not the copy) and run it again' }
  if (Get-Command node -ErrorAction SilentlyContinue) {
    & node (Join-Path $PSScriptRoot 'test-copy-check.js')
    if ($LASTEXITCODE -ne 0) { Fail 'the rebuilt test copy did not pass tools\test-copy-check.js' }
  } else {
    Write-Warning 'node is not installed: open the test copy once by hand and check it (CLAUDE.md, "The test copy")'
  }
}
Write-Host ''
Write-Host "Done: $Version is in $dest, the shortcut points at it$(if (-not $SkipTestCopy) { ', and the test copy is rebuilt' })." -ForegroundColor Green
