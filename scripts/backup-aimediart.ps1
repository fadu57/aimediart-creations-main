#Requires -Version 5.1
<#
.SYNOPSIS
    Archive ZIP du projet AIMEDIArt vers X:\1-AIMEDIART\Sauvegarde AIMEDIART

.EXAMPLE
    npm run backup:aimediart
#>

param(
    [string] $DestinationDir = "X:\1-AIMEDIART\Sauvegarde AIMEDIART",
    [string] $Timestamp = "",
    [switch] $DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $Timestamp) {
    $Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
}
$zipName = "aimediart-backup_$Timestamp.zip"
$zipPath = Join-Path $DestinationDir $zipName
$stagingRoot = Join-Path $env:TEMP "aimediart-backup-staging-$Timestamp"
$stagingProject = Join-Path $stagingRoot "aimediart-creations-main"

function Write-Step {
    param([string] $Text)
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

if (-not (Test-Path -LiteralPath $DestinationDir)) {
    throw "Dossier de destination introuvable : $DestinationDir"
}

Write-Step "Projet : $RepoRoot"
Write-Step "Destination : $zipPath"

if ($DryRun) {
    Write-Host "Mode simulation — aucune archive créée." -ForegroundColor Yellow
    exit 0
}

if (Test-Path -LiteralPath $stagingRoot) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingProject -Force | Out-Null

Write-Step "Copie des fichiers (hors node_modules, dist, .git — .env exclu du ZIP, sauvegardé à part)"
$robocopyArgs = @(
    $RepoRoot,
    $stagingProject,
    "/E",
    "/XD", "node_modules", "dist", "dist-ssr", ".git", ".vercel", "supabase\.temp",
    "/XF", ".env", ".env.*",
    "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np"
)
& robocopy @robocopyArgs | Out-Null
$robocopyExit = $LASTEXITCODE
if ($robocopyExit -ge 8) {
    throw "Robocopy en échec (code $robocopyExit)"
}

Write-Step "Compression ZIP"
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $stagingProject "*") -DestinationPath $zipPath -CompressionLevel Optimal

Remove-Item -LiteralPath $stagingRoot -Recurse -Force

$sizeMb = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 2)
Write-Host ""
Write-Host "Sauvegarde code terminée." -ForegroundColor Green
Write-Host "Fichier : $zipPath" -ForegroundColor Green
Write-Host "Taille  : $sizeMb Mo" -ForegroundColor Green
