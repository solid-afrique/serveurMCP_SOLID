#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Met à jour le serveur MCP à partir d'un nouveau paquet .zip.

.DESCRIPTION
  Remplace l'application et les scripts ; conserve .env.local, les journaux et le service.
  En cas d'échec au redémarrage, la version précédente est restaurée automatiquement.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\mcp-server\update.ps1 -Package C:\Temp\mcp-server-1.0.0-20261007-1500.zip
#>
param(
  [Parameter(Mandatory = $true)][string]$Package,
  [int]$Port = 3100,
  [string]$ServiceId = "mcp-db-server"
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$App = Join-Path $Root "app"
$Previous = Join-Path $Root "app.previous"

function Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }

function Wait-Health {
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 10
      if ($health.ok) { return $health }
    }
    catch { }
  }
  return $null
}

if (-not (Test-Path $Package)) { throw "Paquet introuvable : $Package" }

Step "Extraction du paquet"
Unblock-File $Package
$temp = Join-Path $env:TEMP "mcp-update-$(Get-Date -Format 'yyyyMMddHHmmss')"
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::ExtractToDirectory((Resolve-Path $Package).Path, $temp)
if (-not (Test-Path (Join-Path $temp "app\server.js"))) { throw "Ce fichier n'est pas un paquet du serveur MCP." }
Write-Host (Get-Content (Join-Path $temp "VERSION.txt") -TotalCount 1)

Step "Arrêt du service"
Stop-Service -Name $ServiceId -Force

Step "Remplacement de l'application (l'ancienne est conservée dans app.previous)"
if (Test-Path $Previous) { Remove-Item $Previous -Recurse -Force }
Move-Item $App $Previous
Move-Item (Join-Path $temp "app") $App
foreach ($file in "launcher.cjs", "install.ps1", "update.ps1", "uninstall.ps1", "iis-setup.ps1", "env.windows.example", "README.md", "VERSION.txt") {
  Copy-Item (Join-Path $temp $file) (Join-Path $Root $file) -Force
}
Copy-Item (Join-Path $temp "sql\*") (Join-Path $Root "sql") -Recurse -Force
New-Item -ItemType Directory -Force -Path (Join-Path $Root "iis") | Out-Null
Copy-Item (Join-Path $temp "iis\*") (Join-Path $Root "iis") -Recurse -Force
Copy-Item (Join-Path $temp "service\WinSW-x64.exe") (Join-Path $Root "service\WinSW-x64.exe") -Force
Get-ChildItem $Root -Recurse -File | Unblock-File
Remove-Item $temp -Recurse -Force

Step "Redémarrage"
Start-Service -Name $ServiceId
$health = Wait-Health
if (-not $health) {
  Write-Host "La nouvelle version ne démarre pas : restauration de la précédente." -ForegroundColor Yellow
  Stop-Service -Name $ServiceId -Force
  Remove-Item $App -Recurse -Force
  Move-Item $Previous $App
  Start-Service -Name $ServiceId
  throw "Mise à jour annulée, version précédente restaurée. Consultez les journaux : $(Join-Path $Root 'logs')"
}
Write-Host "`nMise à jour terminée (stockage : $($health.store))." -ForegroundColor Green
Write-Host "Une fois la nouvelle version validée, vous pouvez supprimer $Previous."
