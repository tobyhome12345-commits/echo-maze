<#
  tools/install-pc-updater.ps1 - put the PC updater in place and make it run by itself (CLAUDE.md, "The PC updater").

    powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-pc-updater.ps1            (install, or update it)
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-pc-updater.ps1 -RunNow    (...and run it once now)

  1. Copies tools\pc-updater.ps1 to C:\Claude\echo game\Updater\pc-updater.ps1 (its own copy: what is pushed to main
     never changes the updater itself until this is run again).
  2. Registers the Windows scheduled task "Echo Maze updater" for you (no administrator rights needed):
       - at log-on, and every 10 minutes after the time it was installed, for as long as the PC is on;
       - "run as soon as possible after a scheduled start is missed" - so a run missed while the PC was off or asleep
         happens when it is back;
       - hidden: conhost --headless runs PowerShell with no window at all;
       - one at a time (a run still going makes the next start skip), at most 30 minutes, on battery too.
  Running it again replaces the task and the copy (that is how to update them). Nothing else is changed.

  To see it, run it by hand, or turn it off - see CLAUDE.md, "The PC updater", or:
    Get-Content "C:\Claude\echo game\Updater\updater.log" -Tail 30
    Start-ScheduledTask -TaskName "Echo Maze updater"
    Disable-ScheduledTask -TaskName "Echo Maze updater"     (Enable-ScheduledTask to turn it back on)
  ASCII only, so Windows PowerShell 5.1 reads it correctly.
#>
param(
  [string]$GameRoot = 'C:\Claude\echo game',
  [string]$TaskName = 'Echo Maze updater',
  [switch]$RunNow
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path (Join-Path $GameRoot 'Echo Maze'))) { throw "$GameRoot\Echo Maze is not here - this is for the owner's PC only" }
$updaterDir = Join-Path $GameRoot 'Updater'
New-Item -ItemType Directory -Force $updaterDir | Out-Null
$script = Join-Path $updaterDir 'pc-updater.ps1'
Copy-Item (Join-Path $PSScriptRoot 'pc-updater.ps1') $script -Force
Write-Host "copied the updater to $script"

$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
$user = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute $conhost -Argument "--headless `"$ps`" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`"" -WorkingDirectory $updaterDir
$atLogOn = New-ScheduledTaskTrigger -AtLogOn -User $user
$every10 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$task = Register-ScheduledTask -TaskName $TaskName -TaskPath '\' -Action $action -Trigger @($atLogOn, $every10) -Settings $settings -Principal $principal -Description 'Echo Maze: makes the new version folder, re-points the shortcuts and rebuilds the test copy when a new version reaches main on GitHub (C:\Claude\echo game\Updater\updater.log).' -Force
$t = Get-ScheduledTask -TaskName $TaskName
Write-Host "registered the scheduled task '$TaskName' ($($t.State)): at log-on, and every $($t.Triggers[1].Repetition.Interval -replace 'PT', '' -replace 'M', ' minutes') $(if ($t.Triggers[1].Repetition.Duration) { 'for ' + $t.Triggers[1].Repetition.Duration } else { 'indefinitely' }); catches up missed runs: $($t.Settings.StartWhenAvailable)"
if ($RunNow) {
  Start-ScheduledTask -TaskName $TaskName
  Write-Host 'started it once now - see the log in a minute:'
  Write-Host "  Get-Content `"$updaterDir\updater.log`" -Tail 30"
}
