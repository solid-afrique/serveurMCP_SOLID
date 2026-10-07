#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Installe (ou réinstalle) le serveur MCP comme service Windows, à partir du paquet extrait.

.DESCRIPTION
  À lancer depuis le dossier où le paquet a été extrait (ex. C:\mcp-server) :
  1. vérifie Node.js et la configuration (.env.local) ;
  2. crée le service Windows « mcp-db-server » (WinSW) : démarrage automatique,
     redémarrage en cas d'arrêt, écoute uniquement sur 127.0.0.1 ;
  3. vérifie que le serveur répond et que le stockage MySQL est joignable.
  Aucun accès Internet, Git ou npm n'est nécessaire.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\mcp-server\install.ps1
#>
param(
  [int]$Port = 3100,
  [string]$ServiceId = "mcp-db-server"
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$ServiceDir = Join-Path $Root "service"
$LogDir = Join-Path $Root "logs"
$exe = Join-Path $ServiceDir "$ServiceId.exe"

function Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }

if (-not (Test-Path (Join-Path $Root "app\server.js"))) {
  throw "Application introuvable dans $Root\app : lancez ce script depuis le dossier du paquet extrait."
}

Step "Déblocage des fichiers extraits (marque « provenant d'Internet »)"
Get-ChildItem $Root -Recurse -File | Unblock-File

Step "Vérification de Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw "Node.js est introuvable. Installez Node.js 22 LTS (fichier .msi de nodejs.org), rouvrez PowerShell et relancez." }
$version = (& node -v).Trim()
if ([int]$version.TrimStart("v").Split(".")[0] -lt 20) { throw "Node.js $version est trop ancien : la version 20 ou plus est requise." }
Write-Host "Node.js $version ($($node.Source))"

Step "Vérification de la configuration (.env.local)"
$envFile = Join-Path $Root ".env.local"
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $Root "env.windows.example") $envFile
  Write-Host "Le fichier $envFile a été créé à partir du modèle." -ForegroundColor Yellow
  Write-Host "Complétez-le (il s'ouvre dans le Bloc-notes), enregistrez, puis relancez ce script." -ForegroundColor Yellow
  Start-Process notepad.exe $envFile
  exit 1
}
$envText = Get-Content $envFile -Raw
$missing = @("ENCRYPTION_KEY", "ADMIN_PASSWORD", "STORE_URL", "PUBLIC_BASE_URL") |
  Where-Object { $envText -notmatch "(?m)^\s*$_\s*=\s*\S+" }
if ($missing) { throw "Valeur(s) manquante(s) dans .env.local : $($missing -join ', ')" }
if ($envText -match "MOT_DE_PASSE") { throw "Remplacez MOT_DE_PASSE dans STORE_URL (.env.local) par le mot de passe du compte mcp_server." }

Step "Préparation du service Windows ($ServiceId)"
$existing = Get-Service -Name $ServiceId -ErrorAction SilentlyContinue
if ($existing -and $existing.Status -ne "Stopped") {
  Stop-Service -Name $ServiceId -Force
  Write-Host "Service existant arrêté."
}
New-Item -ItemType Directory -Force -Path $ServiceDir, $LogDir | Out-Null
if (-not (Test-Path $exe)) { Copy-Item (Join-Path $ServiceDir "WinSW-x64.exe") $exe }

$xml = @"
<service>
  <id>$ServiceId</id>
  <name>Serveur MCP - Bases de donnees</name>
  <description>Serveur MCP (Claude, ChatGPT, Copilot) pour les bases MySQL et SQL Server de l'entreprise.</description>
  <executable>$($node.Source)</executable>
  <arguments>"$Root\launcher.cjs"</arguments>
  <workingdirectory>$Root</workingdirectory>
  <env name="MCP_PORT" value="$Port" />
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="30 sec" />
  <onfailure action="restart" delay="60 sec" />
  <resetfailure>1 hour</resetfailure>
  <stoptimeout>15 sec</stoptimeout>
  <logpath>$LogDir</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
</service>
"@
Set-Content -Path (Join-Path $ServiceDir "$ServiceId.xml") -Value $xml -Encoding UTF8

if (-not $existing) {
  & $exe install
  if ($LASTEXITCODE -ne 0) { throw "L'installation du service a échoué." }
}
Start-Service -Name $ServiceId
Write-Host "Service démarré."

Step "Vérification"
$health = $null
for ($i = 0; $i -lt 30 -and -not $health; $i++) {
  Start-Sleep -Seconds 2
  try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 10 }
  catch {
    $body = $_.ErrorDetails.Message
    if ($body -and $body -match '"error"') { $health = $body | ConvertFrom-Json }
  }
}
if (-not $health) { throw "Le serveur ne répond pas sur le port $Port. Consultez les journaux : $LogDir" }
if (-not $health.ok) { throw "Le serveur répond, mais le stockage est en erreur : $($health.error)" }

Write-Host "`nInstallation terminée." -ForegroundColor Green
Write-Host "  Version   : $((Get-Content (Join-Path $Root 'VERSION.txt') -TotalCount 1))"
Write-Host "  Service   : $ServiceId (démarrage automatique)"
Write-Host "  Local     : http://127.0.0.1:$Port  (stockage : $($health.store))"
Write-Host "  Journaux  : $LogDir"
Write-Host "Étape suivante : publier le serveur en HTTPS (voir README.md, section 5)."
