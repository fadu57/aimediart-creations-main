#Requires -Version 5.1
<#
.SYNOPSIS
    Déploie l’Edge Function Supabase `analyze-artwork-image` (prod ou projet lié).

.DESCRIPTION
    Étapes automatisées :
      - vérifie la présence de la CLI Supabase ;
      - vérifie une session `supabase login` (liste des projets) ;
      - optionnel : enregistre le secret GEMINI_API_KEY depuis la variable d’environnement ;
      - exécute `supabase functions deploy analyze-artwork-image`.

    À faire une fois à la main si besoin : `supabase login` (navigateur / token).

.PARAMETER ProjectRef
    Référence du projet (Dashboard → Project Settings → General → Reference ID).
    Sinon variable d’environnement SUPABASE_PROJECT_REF.

.PARAMETER SkipGeminiSecret
    Ne pas exécuter `supabase secrets set` pour GEMINI_API_KEY.

.PARAMETER DryRun
    Affiche les commandes sans les exécuter (sauf vérifications légères).

.EXAMPLE
    $env:SUPABASE_PROJECT_REF = "abcd1234"
    $env:GEMINI_API_KEY = "votre_cle"
    .\scripts\deploy-analyze-artwork-image.ps1

.EXAMPLE
    .\scripts\deploy-analyze-artwork-image.ps1 -ProjectRef "abcd1234" -SkipGeminiSecret
#>

param(
    [string] $ProjectRef = $env:SUPABASE_PROJECT_REF,
    [switch] $SkipGeminiSecret,
    [switch] $DryRun
)

$ErrorActionPreference = "Stop"
$FunctionName = "analyze-artwork-image"
# Racine du dépôt (parent du dossier scripts)
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
    # Pas d’équivalent fiable cross-plateforme de `supabase whoami` partout ; on tente `projects list`.
    $null = & supabase projects list 2>&1
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

$DeployArgs = @(
    "functions", "deploy", $FunctionName,
    "--project-ref", $ProjectRef.Trim()
)

if (-not (Test-Path (Join-Path $RepoRoot "supabase\functions\$FunctionName\index.ts"))) {
    Write-Host "Fichier introuvable : supabase\functions\$FunctionName\index.ts" -ForegroundColor Red
    Write-Host "Ce script doit être exécuté depuis la racine du dépôt aimediart." -ForegroundColor Yellow
    exit 1
}

# Secret Gemini (optionnel) : ne jamais commiter la clé ; passer par l’env au moment du script.
if (-not $SkipGeminiSecret -and -not [string]::IsNullOrWhiteSpace($env:GEMINI_API_KEY)) {
    Write-Step "Envoi du secret GEMINI_API_KEY vers Supabase (projet $ProjectRef)"
    if ($DryRun) {
        Write-Host '[DryRun] supabase secrets set GEMINI_API_KEY=*** --project-ref' $ProjectRef.Trim()
    } else {
        $key = $env:GEMINI_API_KEY.Trim()
        & supabase secrets set "GEMINI_API_KEY=$key" --project-ref $ProjectRef.Trim()
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Échec de supabase secrets set. Vérifiez les droits du token." -ForegroundColor Red
            exit 1
        }
    }
} elseif (-not $SkipGeminiSecret) {
    Write-Host ""
    Write-Host "Astuce : pour définir GEMINI_API_KEY sur le projet en même temps :" -ForegroundColor DarkGray
    Write-Host '  $env:GEMINI_API_KEY = "votre_cle"' -ForegroundColor DarkGray
    Write-Host "  puis relancez ce script (ou utilisez -SkipGeminiSecret si le secret est déjà configuré)." -ForegroundColor DarkGray
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
Write-Host "  https://$($ProjectRef.Trim()).supabase.co/functions/v1/$FunctionName" -ForegroundColor Gray
Write-Host ""
Write-Host "Logs : Dashboard Supabase → Edge Functions → $FunctionName → Logs" -ForegroundColor Gray
