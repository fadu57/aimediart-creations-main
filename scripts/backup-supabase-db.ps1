#Requires -Version 5.1
<#
.SYNOPSIS
    Dump SQL complet de la base Supabase (pg_dump, sans Docker).

.DESCRIPTION
    Requiert SUPABASE_DB_PASSWORD dans .env (mot de passe base Supabase,
    Dashboard → Database → Reset password — distinct du login GitHub).

.EXAMPLE
    npm run backup:supabase
#>

param(
    [string] $DestinationDir = "X:\1-AIMEDIART\Sauvegarde AIMEDIART",
    [string] $Timestamp = "",
    [switch] $DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$EnvFile = Join-Path $RepoRoot ".env"
$ProjectRefFile = Join-Path $RepoRoot "supabase\.temp\project-ref"
if (-not $Timestamp) {
    $Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
}
$sqlName = "aimediart-db-backup_$Timestamp.sql"
$sqlPath = Join-Path $DestinationDir $sqlName

function Write-Step {
    param([string] $Text)
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Read-DotEnvValue {
    param([string] $Key)
    if (-not (Test-Path -LiteralPath $EnvFile)) { return $null }
    foreach ($line in Get-Content -LiteralPath $EnvFile -Encoding UTF8) {
        $trimmed = $line.Trim()
        if ($trimmed -match "^#\s*" -or $trimmed -eq "") { continue }
        if ($trimmed -match "^$([regex]::Escape($Key))=(.*)$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

function Get-ProjectRef {
    if (Test-Path -LiteralPath $ProjectRefFile) {
        $ref = (Get-Content -LiteralPath $ProjectRefFile -Raw).Trim()
        if ($ref) { return $ref }
    }
    $viteUrl = Read-DotEnvValue "VITE_SUPABASE_URL"
    if ($viteUrl -match "https://([a-z0-9]+)\.supabase\.co") {
        return $Matches[1]
    }
    return $null
}

function Get-SupabaseDbUrl {
    $direct = Read-DotEnvValue "SUPABASE_DB_URL"
    if ($direct) { return $direct }

    $password = Read-DotEnvValue "SUPABASE_DB_PASSWORD"
    if (-not $password) { return $null }

    $ref = Get-ProjectRef
    if (-not $ref) { return $null }

    $encoded = [uri]::EscapeDataString($password)
    $poolerHost = Read-DotEnvValue "SUPABASE_DB_POOLER_HOST"
    if (-not $poolerHost) {
        $poolerHost = "aws-1-eu-west-3.pooler.supabase.com"
    }
    return "postgresql://postgres.${ref}:${encoded}@${poolerHost}:5432/postgres"
}

function Find-PgDump {
    $cmd = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe"
    )
    foreach ($path in $candidates) {
        if (Test-Path -LiteralPath $path) { return $path }
    }
    return $null
}

if (-not (Test-Path -LiteralPath $DestinationDir)) {
    throw "Dossier de destination introuvable : $DestinationDir"
}

Write-Step "Destination : $sqlPath"

if ($DryRun) {
    Write-Host "Mode simulation — aucun dump créé." -ForegroundColor Yellow
    exit 0
}

$dbUrl = Get-SupabaseDbUrl
if (-not $dbUrl) {
    throw @"
SUPABASE_DB_PASSWORD introuvable dans .env

1. Dashboard Supabase → Database → Reset database password
2. Ajoutez dans .env : SUPABASE_DB_PASSWORD=<mot_de_passe_base>
3. npm run backup
"@
}

$pgDump = Find-PgDump
if (-not $pgDump) {
    throw "pg_dump introuvable. Installez PostgreSQL client tools."
}

Write-Step "Export via pg_dump (schéma public + données, sans Docker)…"
Write-Step "Outil : $pgDump"

$pgArgs = @(
    "--dbname=$dbUrl",
    "--schema=public",
    "--no-owner",
    "--no-acl",
    "--format=plain",
    "--encoding=UTF8",
    "--file=$sqlPath",
    "--verbose"
)

& $pgDump @pgArgs
if ($LASTEXITCODE -ne 0) {
    throw "pg_dump en échec (code $LASTEXITCODE). Vérifiez SUPABASE_DB_PASSWORD dans .env."
}

$sizeMb = [math]::Round((Get-Item -LiteralPath $sqlPath).Length / 1MB, 2)
Write-Host ""
Write-Host "Dump SQL terminé." -ForegroundColor Green
Write-Host "Fichier : $sqlPath" -ForegroundColor Green
Write-Host "Taille  : $sizeMb Mo" -ForegroundColor Green
