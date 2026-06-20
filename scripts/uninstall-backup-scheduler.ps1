#Requires -Version 5.1
<#
.SYNOPSIS
    Désinstalle la sauvegarde planifiée AIMEDIArt.

.EXAMPLE
    npm run backup:uninstall-scheduler
#>

param(
    [string] $TaskName = "AIMEDIArt-Sauvegarde-Quotidienne"
)

$ErrorActionPreference = "Stop"
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $existing) {
    Write-Host "Aucune tâche nommée « $TaskName »." -ForegroundColor Yellow
    exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Tâche « $TaskName » supprimée." -ForegroundColor Green
