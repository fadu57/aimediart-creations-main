#Requires -Version 5.1
<#
.SYNOPSIS
    Point d'entrée pour la tâche planifiée Windows (sauvegarde + journal).
#>

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
$destinationDir = "X:\1-AIMEDIART\Sauvegarde AIMEDIART"
$logDir = Join-Path $destinationDir "logs"
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = Join-Path $logDir "backup_$timestamp.log"

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Write-Log {
    param([string] $Message)
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
    Write-Host $Message
}

try {
    Write-Log "Début sauvegarde planifiée AIMEDIArt"
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "backup-all.ps1") -RetentionDays 7 2>&1 |
        ForEach-Object { Write-Log $_.ToString() }
    if ($LASTEXITCODE -ne 0) { throw "backup-all a échoué (code $LASTEXITCODE)" }
    Write-Log "Sauvegarde planifiée terminée avec succès."
    exit 0
} catch {
    Write-Log "ERREUR : $($_.Exception.Message)"
    exit 1
}
