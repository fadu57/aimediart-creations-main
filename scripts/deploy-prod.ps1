#Requires -Version 5.1
<#
.SYNOPSIS
    Build, commit (si besoin), rebase et push sur main → déploiement Vercel automatique.

.EXAMPLE
    npm run deploy:prod
    npm run deploy:prod -- -Message "feat(statistiques): export PDF"

.PARAMETER Message
    Message de commit si des fichiers sont à versionner.

.PARAMETER SkipBuild
    Ne pas exécuter npm run build.

.PARAMETER SkipCommit
    Ne pas committer (push uniquement des commits déjà présents).

.PARAMETER DryRun
    Affiche les actions sans les exécuter.
#>

param(
    [string] $Message = "",
    [switch] $SkipBuild,
    [switch] $SkipCommit,
    [switch] $DryRun
)

$ErrorActionPreference = "Stop"
$Branch = "main"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Write-Step {
    param([string] $Text)
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Invoke-DeployCommand {
    param([string] $Command)
    Write-Host "    $Command" -ForegroundColor DarkGray
    if ($DryRun) { return }
    Push-Location $RepoRoot
    try {
        Invoke-Expression $Command
        if ($LASTEXITCODE -ne 0) {
            throw "Commande en échec (code $LASTEXITCODE): $Command"
        }
    } finally {
        Pop-Location
    }
}

Push-Location $RepoRoot
try {
    Write-Step "Dépôt : $RepoRoot"
    Invoke-DeployCommand "git branch --show-current"
    Invoke-DeployCommand "git status -sb"

    $currentBranch = (git branch --show-current).Trim()
    if ($currentBranch -ne $Branch) {
        Write-Host "Branche actuelle : $currentBranch (attendu : $Branch)." -ForegroundColor Yellow
        if (-not $DryRun) {
            $confirm = Read-Host "Continuer quand même ? (o/N)"
            if ($confirm -notmatch '^[oOyY]') { exit 1 }
        }
    }

    if (-not $SkipBuild) {
        Write-Step "Build production (vite)"
        Invoke-DeployCommand "npm run build"
    }

    Write-Step "État Git"
    $statusPorcelain = git status --porcelain
    $hasChanges = [bool]($statusPorcelain | Where-Object { $_ -match '\S' })

    if ($hasChanges) {
        if (git status --porcelain | Select-String -Pattern '(^|\s)\.env($|\s)') {
            Write-Host ".env est modifié : ne sera pas commité." -ForegroundColor Yellow
            if (-not $DryRun) {
                Invoke-DeployCommand "git reset HEAD .env 2>`$null"
            }
        }

        if (-not $SkipCommit) {
            if (-not $Message.Trim()) {
                $Message = Read-Host "Message de commit"
            }
            if (-not $Message.Trim()) {
                Write-Host "Commit annulé : message vide." -ForegroundColor Red
                exit 1
            }
            Write-Step "Commit"
            Invoke-DeployCommand "git add -A"
            Invoke-DeployCommand "git reset HEAD .env 2>`$null"
            $escaped = $Message.Replace("'", "''")
            Invoke-DeployCommand "git commit -m '$escaped'"
        } else {
            Write-Host "Modifications locales non commitées (SkipCommit)." -ForegroundColor Yellow
        }
    } else {
        Write-Host "Rien à committer." -ForegroundColor Green
    }

    Write-Step "Synchronisation origin/$Branch"
    Invoke-DeployCommand "git fetch origin"
    Invoke-DeployCommand "git pull --rebase origin $Branch"

    Write-Step "Push → production (Vercel redéploie après push sur $Branch)"
    Invoke-DeployCommand "git push origin $Branch"

    Write-Host ""
    Write-Host "Terminé. Vérifiez le déploiement sur Vercel (Deployments → Ready)." -ForegroundColor Green
} finally {
    Pop-Location
}
