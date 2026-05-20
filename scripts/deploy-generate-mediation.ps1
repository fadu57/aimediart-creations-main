#Requires -Version 5.1
<#
.SYNOPSIS
    Déploie l’Edge Function Supabase `generate-mediation` (prod ou projet lié).

.DESCRIPTION
    Étapes automatisées :
      - vérifie la présence de la CLI Supabase ;
      - vérifie une session `supabase login` (liste des projets) ;
      - optionnel : enregistre GEMINI_API_KEY et/ou GROQ_API_KEY depuis les variables d’environnement ;
      - exécute `supabase functions deploy generate-mediation`.

    Les secrets peuvent déjà être configurés dans le dashboard ; utilisez -SkipGeminiSecret / -SkipGroqSecret
    pour ne pas les écraser.

    À faire une fois à la main si besoin : `supabase login` (navigateur / token).

.PARAMETER ProjectRef
    Référence du projet (Dashboard → Project Settings → General → Reference ID).
    Sinon variable d’environnement SUPABASE_PROJECT_REF.

.PARAMETER SkipGeminiSecret
    Ne pas exécuter `supabase secrets set` pour GEMINI_API_KEY.

.PARAMETER SkipGroqSecret
    Ne pas exécuter `supabase secrets set` pour GROQ_API_KEY.

.PARAMETER DryRun
    Affiche les commandes sans les exécuter (sauf vérifications légères).

.EXAMPLE
    $env:SUPABASE_PROJECT_REF = "abcd1234"
    $env:GEMINI_API_KEY = "..."
    $env:GROQ_API_KEY = "..."
    .\scripts\deploy-generate-mediation.ps1

.EXAMPLE
    .\scripts\deploy-generate-mediation.ps1 -ProjectRef "abcd1234" -SkipGeminiSecret -SkipGroqSecret
#>

param(
    [string] $ProjectRef = $env:SUPABASE_PROJECT_REF,
    [switch] $SkipGeminiSecret,
    [switch] $SkipGroqSecret,
    [switch] $DryRun
)

$ErrorActionPreference = "Stop"
$FunctionName = "generate-mediation"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Write-Step {
    param([string] $Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-SupabaseCli {
    if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
        Write-Host "La CLI Supabase est introuvable." -ForegroundColor Red
        Write-Host "Installez-la : npm install -g supabase" -ForegroundColor Yellow
        Write-Host "Puis rouvrez le terminal et relancez ce script." -ForegroundColor Yellow
        exit 1
    }
}

function Test-SupabaseLogin {
    # La CLI écrit souvent « A new version… » sur stderr ; avec Stop, PowerShell l’interprète comme une erreur fatale.
    $prevEa = $ErrorActionPreference
    try {
        $ErrorActionPreference = "SilentlyContinue"
        $null = & supabase projects list 2>&1
    } finally {
        $ErrorActionPreference = $prevEa
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "La CLI Supabase ne semble pas authentifiée." -ForegroundColor Red
        Write-Host "Lancez une fois : supabase login" -ForegroundColor Yellow
        exit 1
    }
}

Set-Location $RepoRoot

Write-Step "Vérification de la CLI Supabase"
Test-SupabaseCli

Write-Step "Vérification de la session (supabase projects list)"
if (-not $DryRun) {
    Test-SupabaseLogin
} else {
    Write-Host "[DryRun] skip Test-SupabaseLogin" -ForegroundColor DarkGray
}

if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
    Write-Host "Référence projet manquante." -ForegroundColor Red
    Write-Host "Utilisation : -ProjectRef 'votre_ref' ou variable d'environnement SUPABASE_PROJECT_REF" -ForegroundColor Yellow
    Write-Host "(Dashboard Supabase → Project Settings → General → Reference ID)" -ForegroundColor Yellow
    exit 1
}

$ProjectRefTrim = $ProjectRef.Trim()

$DeployArgs = @(
    "functions", "deploy", $FunctionName,
    "--project-ref", $ProjectRefTrim
)

if (-not (Test-Path (Join-Path $RepoRoot "supabase\functions\$FunctionName\index.ts"))) {
    Write-Host "Fichier introuvable : supabase\functions\$FunctionName\index.ts" -ForegroundColor Red
    Write-Host "Ce script doit être exécuté depuis la racine du dépôt." -ForegroundColor Yellow
    exit 1
}

if (-not $SkipGeminiSecret -and -not [string]::IsNullOrWhiteSpace($env:GEMINI_API_KEY)) {
    Write-Step "Envoi du secret GEMINI_API_KEY vers Supabase (projet $ProjectRefTrim)"
    if ($DryRun) {
        Write-Host '[DryRun] supabase secrets set GEMINI_API_KEY=*** --project-ref' $ProjectRefTrim
    } else {
        $key = $env:GEMINI_API_KEY.Trim()
        & supabase secrets set "GEMINI_API_KEY=$key" --project-ref $ProjectRefTrim
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Échec de supabase secrets set (GEMINI_API_KEY). Vérifiez les droits du token." -ForegroundColor Red
            exit 1
        }
    }
} elseif (-not $SkipGeminiSecret) {
    Write-Host ""
    Write-Host "Astuce : pour pousser GEMINI_API_KEY depuis cet ordinateur :" -ForegroundColor DarkGray
    Write-Host '  $env:GEMINI_API_KEY = "votre_cle"' -ForegroundColor DarkGray
    Write-Host "  ou utilisez -SkipGeminiSecret si le secret est déjà sur Supabase." -ForegroundColor DarkGray
}

if (-not $SkipGroqSecret -and -not [string]::IsNullOrWhiteSpace($env:GROQ_API_KEY)) {
    Write-Step "Envoi du secret GROQ_API_KEY vers Supabase (projet $ProjectRefTrim)"
    if ($DryRun) {
        Write-Host '[DryRun] supabase secrets set GROQ_API_KEY=*** --project-ref' $ProjectRefTrim
    } else {
        $key = $env:GROQ_API_KEY.Trim()
        & supabase secrets set "GROQ_API_KEY=$key" --project-ref $ProjectRefTrim
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Échec de supabase secrets set (GROQ_API_KEY). Vérifiez les droits du token." -ForegroundColor Red
            exit 1
        }
    }
} elseif (-not $SkipGroqSecret) {
    Write-Host ""
    Write-Host "Astuce : pour pousser GROQ_API_KEY depuis cet ordinateur :" -ForegroundColor DarkGray
    Write-Host '  $env:GROQ_API_KEY = "votre_cle"' -ForegroundColor DarkGray
    Write-Host "  ou utilisez -SkipGroqSecret si le secret est déjà sur Supabase." -ForegroundColor DarkGray
}

Write-Step "Déploiement : supabase functions deploy $FunctionName"
if ($DryRun) {
    Write-Host "[DryRun] supabase $($DeployArgs -join ' ')"
    Write-Host ""
    Write-Host "DryRun terminé." -ForegroundColor Green
    exit 0
}

& supabase @DeployArgs
if ($LASTEXITCODE -ne 0) {
    Write-Host "Échec du déploiement." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Déploiement réussi. URL typique :" -ForegroundColor Green
Write-Host "  https://$ProjectRefTrim.supabase.co/functions/v1/$FunctionName" -ForegroundColor Gray
Write-Host ""
Write-Host "Logs : Dashboard Supabase → Edge Functions → $FunctionName → Logs" -ForegroundColor Gray
