#Requires -Version 5.1
<#
.SYNOPSIS
    Supprime les sauvegardes AIMEDIArt de plus de N jours.

.EXAMPLE
    powershell -File ./scripts/backup-cleanup.ps1 -RetentionDays 7
#>

param(
    [string] $DestinationDir = "X:\1-AIMEDIART\Sauvegarde AIMEDIART",
    [int] $RetentionDays = 7,
    [switch] $DryRun
)

$ErrorActionPreference = "Stop"
$cutoff = (Get-Date).AddDays(-$RetentionDays)

if (-not (Test-Path -LiteralPath $DestinationDir)) {
    Write-Host "Dossier introuvable : $DestinationDir" -ForegroundColor Yellow
    exit 0
}

$patterns = @(
    "aimediart-backup_*.zip",
    "aimediart-db-backup_*.sql",
    "aimediart-env_*.env"
)

$removed = 0
$freedBytes = 0L

foreach ($pattern in $patterns) {
    $files = Get-ChildItem -LiteralPath $DestinationDir -Filter $pattern -File -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        if ($file.LastWriteTime -ge $cutoff) { continue }

        $freedBytes += $file.Length
        if ($DryRun) {
            Write-Host "[simulation] Supprimer : $($file.Name) ($([math]::Round($file.Length/1MB,2)) Mo, $($file.LastWriteTime.ToString('yyyy-MM-dd')))" -ForegroundColor DarkYellow
        } else {
            Remove-Item -LiteralPath $file.FullName -Force
            Write-Host "Supprimé : $($file.Name)" -ForegroundColor DarkGray
        }
        $removed++
    }
}

# Journaux de sauvegarde planifiée (> 30 jours)
$logDir = Join-Path $DestinationDir "logs"
if (Test-Path -LiteralPath $logDir) {
    $logCutoff = (Get-Date).AddDays(-30)
    Get-ChildItem -LiteralPath $logDir -Filter "backup_*.log" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -lt $logCutoff } |
        ForEach-Object {
            $freedBytes += $_.Length
            if ($DryRun) {
                Write-Host "[simulation] Supprimer log : $($_.Name)" -ForegroundColor DarkYellow
            } else {
                Remove-Item -LiteralPath $_.FullName -Force
            }
            $removed++
        }
}

if ($removed -eq 0) {
    Write-Host "Aucune sauvegarde de plus de $RetentionDays jours à supprimer." -ForegroundColor Green
} else {
    $freedMb = [math]::Round($freedBytes / 1MB, 2)
    $verb = if ($DryRun) { "À supprimer" } else { "Supprimé" }
    Write-Host "$verb : $removed fichier(s), ~$freedMb Mo libérés (rétention : $RetentionDays jours)." -ForegroundColor Green
}
