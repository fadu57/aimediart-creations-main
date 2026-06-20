#Requires -Version 5.1
<#
.SYNOPSIS
    Installe la sauvegarde quotidienne automatique (Planificateur de tâches Windows).

.EXAMPLE
    npm run backup:install-scheduler
#>

param(
    [string] $Time = "22:00",
    [string] $TaskName = "AIMEDIArt-Sauvegarde-Quotidienne"
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$scheduledScript = Join-Path $PSScriptRoot "backup-scheduled.ps1"

if (-not (Test-Path -LiteralPath $scheduledScript)) {
    throw "Script introuvable : $scheduledScript"
}

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scheduledScript`"" `
    -WorkingDirectory $RepoRoot

$trigger = New-ScheduledTaskTrigger -Daily -At $Time

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Sauvegarde quotidienne AIMEDIArt (code ZIP + base SQL + .env). Rétention 7 jours. Destination X:\1-AIMEDIART\Sauvegarde AIMEDIART" `
    -Force | Out-Null

Write-Host ""
Write-Host "Tâche planifiée installée." -ForegroundColor Green
Write-Host "  Nom       : $TaskName" -ForegroundColor Green
Write-Host "  Fréquence : tous les jours à $Time" -ForegroundColor Green
Write-Host "  Rétention : 7 jours" -ForegroundColor Green
Write-Host "  Journaux  : X:\1-AIMEDIART\Sauvegarde AIMEDIART\logs\" -ForegroundColor Green
Write-Host ""
Write-Host "La tâche s'exécute uniquement si vous êtes connecté (lecteur X: requis)." -ForegroundColor Yellow
Write-Host "Vérifier : Planificateur de tâches → Bibliothèque → $TaskName" -ForegroundColor DarkGray
Write-Host "Désinstaller : npm run backup:uninstall-scheduler" -ForegroundColor DarkGray
