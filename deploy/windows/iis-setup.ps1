#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Publie le serveur MCP via IIS (proxy inverse vers le service mcp-db-server).

.DESCRIPTION
  1. Vérifie IIS et les modules URL Rewrite et Application Request Routing (ARR) ;
  2. active le proxy ARR (niveau serveur) et autorise les variables transmises au serveur MCP ;
  3. crée le dossier du site avec son web.config ;
  4. si -HostName est fourni : crée le pool d'applications et le site IIS,
     avec une liaison HTTPS si -CertThumbprint est fourni.
  Sans -HostName, créez le site vous-même dans le Gestionnaire IIS (dossier : -SitePath).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\mcp-server\iis-setup.ps1 -HostName mcp.solid-afrique.com -CertThumbprint 3A1B…

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\mcp-server\iis-setup.ps1
#>
param(
  [string]$HostName,
  [string]$CertThumbprint,
  [string]$SiteName = "mcp-server",
  [string]$SitePath = "C:\inetpub\mcp-server",
  [int]$Port = 3100
)

$ErrorActionPreference = "Stop"
$appcmd = Join-Path $env:windir "system32\inetsrv\appcmd.exe"

function Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }

Step "Vérification d'IIS et des modules"
if (-not (Get-Service -Name W3SVC -ErrorAction SilentlyContinue)) { throw "IIS n'est pas installé sur ce serveur." }
if (-not (Test-Path (Join-Path $env:windir "system32\inetsrv\rewrite.dll"))) {
  throw "Module URL Rewrite absent : installez-le (https://www.iis.net/downloads/microsoft/url-rewrite), puis relancez."
}
& $appcmd list config -section:system.webServer/proxy | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Module Application Request Routing (ARR) absent : installez-le (https://www.iis.net/downloads/microsoft/application-request-routing), puis relancez."
}
Write-Host "IIS, URL Rewrite et ARR sont présents."

Step "Activation du proxy ARR (niveau serveur)"
# preserveHostHeader : le serveur MCP reçoit le nom d'hôte public ; délai de 2 min pour les requêtes longues.
& $appcmd set config -section:system.webServer/proxy /enabled:"True" /preserveHostHeader:"True" /timeout:"00:02:00" /commit:apphost | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Impossible d'activer le proxy ARR." }

Step "Autorisation des variables transmises au serveur MCP"
$allowed = (& $appcmd list config -section:system.webServer/rewrite/allowedServerVariables) -join "`n"
foreach ($variable in "HTTP_X_REAL_IP", "HTTP_X_FORWARDED_HOST") {
  if ($allowed -notmatch "name=`"$variable`"") {
    & $appcmd set config -section:system.webServer/rewrite/allowedServerVariables /+"[name='$variable']" /commit:apphost | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Impossible d'autoriser la variable $variable." }
  }
  Write-Host "  $variable autorisée"
}

Step "Dossier du site ($SitePath)"
New-Item -ItemType Directory -Force -Path $SitePath | Out-Null
$config = (Get-Content (Join-Path $PSScriptRoot "iis\web.config") -Raw) -replace "127\.0\.0\.1:3100", "127.0.0.1:$Port"
Set-Content -Path (Join-Path $SitePath "web.config") -Value $config -Encoding UTF8
Write-Host "web.config écrit (proxy vers http://127.0.0.1:$Port)."

if (-not $HostName) {
  Write-Host "`nIIS est prêt." -ForegroundColor Green
  Write-Host "Créez maintenant le site dans le Gestionnaire IIS :"
  Write-Host "  - Chemin physique : $SitePath"
  Write-Host "  - Liaison HTTPS   : votre nom d'hôte (ex. mcp.votre-domaine.com) et son certificat"
  Write-Host "  - Pool d'applications : « Aucun code managé »"
  exit 0
}

Step "Création du site IIS « $SiteName » ($HostName)"
Import-Module WebAdministration
if (-not (Test-Path "IIS:\AppPools\$SiteName")) {
  New-WebAppPool -Name $SiteName | Out-Null
  Set-ItemProperty "IIS:\AppPools\$SiteName" -Name managedRuntimeVersion -Value ""
}
if (Get-Website -Name $SiteName) {
  Write-Host "Le site existe déjà : seule sa configuration (web.config) a été mise à jour."
}
elseif ($CertThumbprint) {
  $thumb = $CertThumbprint -replace "\s", ""
  if (-not (Test-Path "Cert:\LocalMachine\My\$thumb")) { throw "Certificat $thumb introuvable dans Ordinateur local > Personnel." }
  New-Website -Name $SiteName -PhysicalPath $SitePath -ApplicationPool $SiteName -HostHeader $HostName -Port 443 -Ssl -SslFlags 1 | Out-Null
  (Get-WebBinding -Name $SiteName -Protocol https).AddSslCertificate($thumb, "My")
  Write-Host "Site créé avec la liaison https://$HostName (SNI)."
}
else {
  New-Website -Name $SiteName -PhysicalPath $SitePath -ApplicationPool $SiteName -HostHeader $HostName -Port 80 | Out-Null
  Write-Host "Site créé en HTTP sur $HostName." -ForegroundColor Yellow
  Write-Host "Ajoutez une liaison HTTPS avec un certificat : Claude et ChatGPT exigent https://." -ForegroundColor Yellow
}

Write-Host "`nPublication IIS terminée." -ForegroundColor Green
Write-Host "Vérifiez depuis un autre poste : https://$HostName/api/health"
Write-Host "Dans C:\mcp-server\.env.local : PUBLIC_BASE_URL=https://$HostName et CLIENT_IP_HEADER=x-real-ip, puis Restart-Service mcp-db-server."
