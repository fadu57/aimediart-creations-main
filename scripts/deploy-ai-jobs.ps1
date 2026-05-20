#Requires -Version 5.1
<#
.SYNOPSIS
    Déploie les Edge Functions Supabase `ai-create-job` et `ai-worker`.

.PARAMETER ProjectRef
    Référence du projet (ou variable SUPABASE_PROJECT_REF).

.PARAMETER SkipGroqSecret
    Ne pas exécuter `supabase secrets set` pour GROQ_API_KEY.

.PARAMETER DryRun
    Affiche les commandes sans les exécuter.
#>

param(
    [string] $ProjectRef = $env:SUPABASE_PROJECT_REF,
    [switch] $SkipGroqSecret,
    [switch] $DryRun
)

$ErrorActionPreference = "Stop"
$Functions = @("ai-create-job", "ai-worker")
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Write-Step {
    param([string] $Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-SupabaseCli {
    if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
        Write-Host "La CLI Supabase est introuvable. Installez-la : npm install -g supabase" -ForegroundColor Red
        exit 1
    }
}

function Test-SupabaseLogin {
    $prevEa = $ErrorActionPreference
    try {
        $ErrorActionPreference = "SilentlyContinue"
        $null = & supabase projects list 2>&1
    } finally {
        $ErrorActionPreference = $prevEa
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Session Supabase absente. Lancez : supabase login" -ForegroundColor Red
        exit 1
    }
}

Set-Location $RepoRoot
Write-Step "Vérification CLI + session"
Test-SupabaseCli
if (-not $DryRun) { Test-SupabaseLogin }

if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
    Write-Host "Référence projet manquante (-ProjectRef ou SUPABASE_PROJECT_REF)." -ForegroundColor Red
    exit 1
}

$ProjectRefTrim = $ProjectRef.Trim()

if (-not $SkipGroqSecret -and -not [string]::IsNullOrWhiteSpace($env:GROQ_API_KEY)) {
    Write-Step "Secret GROQ_API_KEY"
    if ($DryRun) {
        Write-Host "[DryRun] supabase secrets set GROQ_API_KEY=*** --project-ref $ProjectRefTrim"
    } else {
        & supabase secrets set "GROQ_API_KEY=$($env:GROQ_API_KEY.Trim())" --project-ref $ProjectRefTrim
        if ($LASTEXITCODE -ne 0) { exit 1 }
    }
} elseif (-not $SkipGroqSecret) {
    Write-Host "Astuce : définir GROQ_API_KEY ou -SkipGroqSecret si déjà configuré." -ForegroundColor DarkGray
}

foreach ($fn in $Functions) {
    $path = Join-Path $RepoRoot "supabase\functions\$fn\index.ts"
    if (-not (Test-Path $path)) {
        Write-Host "Fichier manquant : $path" -ForegroundColor Red
        exit 1
    }
    Write-Step "Déploiement $fn"
    if ($DryRun) {
        Write-Host "[DryRun] supabase functions deploy $fn --project-ref $ProjectRefTrim"
    } else {
        & supabase functions deploy $fn --project-ref $ProjectRefTrim
        if ($LASTEXITCODE -ne 0) { exit 1 }
    }
}

Write-Host ""
Write-Host "Déploiement terminé (ai-create-job + ai-worker)." -ForegroundColor Green
Write-Host "Test CORS : OPTIONS https://$ProjectRefTrim.supabase.co/functions/v1/ai-create-job" -ForegroundColor Gray
