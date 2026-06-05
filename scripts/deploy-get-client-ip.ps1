#Requires -Version 5.1
<#
.SYNOPSIS
    Déploie l'Edge Function get-client-ip (CORS + verify_jwt désactivé).
#>

param(
    [string] $ProjectRef = $env:SUPABASE_PROJECT_REF,
    [switch] $DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Host "CLI Supabase introuvable. Installez-la : npm install -g supabase" -ForegroundColor Red
    exit 1
}

Push-Location $RepoRoot
try {
    $cmd = "supabase functions deploy get-client-ip --no-verify-jwt"
    if ($ProjectRef) {
        $cmd += " --project-ref $ProjectRef"
    }
    Write-Host "==> $cmd" -ForegroundColor Cyan
    if ($DryRun) { exit 0 }
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host ""
    Write-Host "get-client-ip déployée. Rechargez l'app (localhost ou prod)." -ForegroundColor Green
} finally {
    Pop-Location
}
