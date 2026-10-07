#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Arrête et supprime le service Windows du serveur MCP.
  La base MySQL de stockage, la configuration (.env.local) et les fichiers sont conservés.
#>
param([string]$ServiceId = "mcp-db-server")

$ErrorActionPreference = "Stop"
$exe = Join-Path $PSScriptRoot "service\$ServiceId.exe"

if (-not (Get-Service -Name $ServiceId -ErrorAction SilentlyContinue)) {
  Write-Host "Le service $ServiceId n'est pas installé."
  exit 0
}
Stop-Service -Name $ServiceId -Force -ErrorAction SilentlyContinue
& $exe uninstall
if ($LASTEXITCODE -ne 0) { throw "La suppression du service a échoué." }
Write-Host "Service $ServiceId supprimé. La base MySQL, .env.local et les fichiers sont conservés." -ForegroundColor Green
