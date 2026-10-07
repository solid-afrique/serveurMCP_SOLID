#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Met à jour le serveur MCP : récupère la dernière version, recompile et redémarre le service.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\windows\update.ps1
#>
param(
  [int]$Port = 3100,
  [string]$ServiceId = "mcp-db-server"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }

Push-Location $Root
try {
  Step "Récupération de la dernière version (git pull)"
  & git pull --ff-only
  if ($LASTEXITCODE -ne 0) { throw "git pull a échoué (modifications locales ?)." }

  # Les fichiers de node_modules sont verrouillés tant que le service tourne.
  Step "Arrêt du service"
  Stop-Service -Name $ServiceId -Force

  Step "Installation des dépendances et compilation"
  & npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm ci a échoué. Le service reste arrêté." }
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw "La compilation a échoué. Le service reste arrêté." }
}
finally { Pop-Location }

Step "Redémarrage du service"
Start-Service -Name $ServiceId

$health = $null
for ($i = 0; $i -lt 30 -and -not $health; $i++) {
  Start-Sleep -Seconds 2
  try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 10 } catch { }
}
if (-not $health -or -not $health.ok) { throw "Le serveur ne répond pas correctement. Consultez deploy\windows\logs." }
Write-Host "`nMise à jour terminée (stockage : $($health.store))." -ForegroundColor Green
