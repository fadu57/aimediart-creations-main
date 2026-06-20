#Requires -Version 5.1
<#
.SYNOPSIS
    Sauvegarde complète AIMEDIArt : code + base Supabase + fichier .env

.DESCRIPTION
    Produit 3 fichiers horodatés dans X:\1-AIMEDIART\Sauvegarde AIMEDIART :
      - aimediart-backup_YYYY-MM-DD_HH-mm-ss.zip   (code source)
      - aimediart-db-backup_YYYY-MM-DD_HH-mm-ss.sql (base PostgreSQL)
      - aimediart-env_YYYY-MM-DD_HH-mm-ss.env       (secrets locaux)

    Aucun Docker requis. Nécessite SUPABASE_DB_PASSWORD dans .env.

.EXAMPLE
    npm run backup
#>

param(
    [string] $DestinationDir = "X:\1-AIMEDIART\Sauvegarde AIMEDIART",
    [int] $RetentionDays = 7,
    [switch] $DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$EnvFile = Join-Path $RepoRoot ".env"
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$scriptDir = $PSScriptRoot

function Write-Step {
    param([string] $Text)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor DarkGray
    Write-Host " $Text" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor DarkGray
}

if (-not (Test-Path -LiteralPath $DestinationDir)) {
    throw "Dossier de destination introuvable : $DestinationDir"
}

Write-Step "Sauvegarde complète AIMEDIArt — $timestamp"
Write-Host "Destination : $DestinationDir" -ForegroundColor DarkGray

if ($DryRun) {
    Write-Host "Mode simulation." -ForegroundColor Yellow
    exit 0
}

# 1. Copie sécurisée du .env (hors ZIP Git-safe)
Write-Step "1/4 — Fichier .env (secrets)"
if (Test-Path -LiteralPath $EnvFile) {
    $envBackupPath = Join-Path $DestinationDir "aimediart-env_$timestamp.env"
    Copy-Item -LiteralPath $EnvFile -Destination $envBackupPath -Force
    Write-Host "Copié : $envBackupPath" -ForegroundColor Green
    Write-Host "⚠ Fichier sensible — ne pas partager ni committer." -ForegroundColor Yellow
} else {
    Write-Host "Aucun .env trouvé — étape ignorée." -ForegroundColor Yellow
}

# 2. Archive code
Write-Step "2/4 — Code source (ZIP)"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "backup-aimediart.ps1") `
    -DestinationDir $DestinationDir -Timestamp $timestamp
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 3. Dump base
Write-Step "3/4 — Base Supabase (SQL)"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "backup-supabase-db.ps1") `
    -DestinationDir $DestinationDir -Timestamp $timestamp
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 4. Rétention — supprimer les sauvegardes > N jours
Write-Step "4/4 — Rétention ($RetentionDays jours)"
$cleanupArgs = @(
    "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $scriptDir "backup-cleanup.ps1"),
    "-DestinationDir", $DestinationDir,
    "-RetentionDays", $RetentionDays
)
if ($DryRun) { $cleanupArgs += "-DryRun" }
& powershell @cleanupArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " Sauvegarde complète terminée." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Fichiers créés ($timestamp) :" -ForegroundColor Green
Write-Host "  • aimediart-backup_$timestamp.zip"
Write-Host "  • aimediart-db-backup_$timestamp.sql"
if (Test-Path -LiteralPath $EnvFile) {
    Write-Host "  • aimediart-env_$timestamp.env"
}
