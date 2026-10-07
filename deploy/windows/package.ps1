<#
.SYNOPSIS
  Construit le paquet de déploiement Windows (à lancer sur le poste de développement).

.DESCRIPTION
  Compile l'application en mode autonome et produit dist\mcp-server-<version>-<date>.zip,
  qui contient tout le nécessaire : application, dépendances, WinSW, scripts et guide.
  Sur le serveur, seul Node.js 20+ est requis (ni Git, ni npm, ni Internet).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\windows\package.ps1
#>
param([string]$OutDir = "dist")

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$WinSWUrl = "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe"

function Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }

$version = (Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json).version
$name = "mcp-server-$version-$(Get-Date -Format 'yyyyMMdd-HHmm')"
$dist = Join-Path $Root $OutDir
$staging = Join-Path $dist $name

Step "Compilation en mode autonome"
Push-Location $Root
try {
  if (Test-Path ".next") { Remove-Item ".next" -Recurse -Force }
  $env:BUILD_STANDALONE = "1"
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw "La compilation a échoué." }
}
finally {
  Remove-Item Env:BUILD_STANDALONE -ErrorAction SilentlyContinue
  Pop-Location
}

Step "Assemblage du paquet"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path $staging, (Join-Path $staging "service") | Out-Null
Copy-Item (Join-Path $Root ".next\standalone") (Join-Path $staging "app") -Recurse
Copy-Item (Join-Path $Root ".next\static") (Join-Path $staging "app\.next\static") -Recurse

# Bibliothèque d'images native, inutile ici et compilée pour le processeur de ce poste.
foreach ($dir in "node_modules\@img", "node_modules\sharp") {
  $path = Join-Path $staging "app\$dir"
  if (Test-Path $path) { Remove-Item $path -Recurse -Force }
}
$native = Get-ChildItem (Join-Path $staging "app") -Recurse -Filter *.node
if ($native) { throw "Modules natifs inattendus (dépendants du processeur) : $($native.FullName -join ', ')" }

foreach ($file in "launcher.cjs", "install.ps1", "update.ps1", "uninstall.ps1", "env.windows.example", "README.md") {
  Copy-Item (Join-Path $PSScriptRoot $file) (Join-Path $staging $file)
}
Copy-Item (Join-Path $PSScriptRoot "sql") (Join-Path $staging "sql") -Recurse

# WinSW est inclus pour que le serveur n'ait pas besoin d'Internet (mis en cache entre deux paquets).
$cache = Join-Path $dist "cache\WinSW-x64.exe"
if (-not (Test-Path $cache)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $cache) | Out-Null
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $WinSWUrl -OutFile $cache -UseBasicParsing
}
Copy-Item $cache (Join-Path $staging "service\WinSW-x64.exe")

$commit = (& git -C $Root rev-parse --short HEAD 2>$null)
Set-Content -Path (Join-Path $staging "VERSION.txt") -Encoding UTF8 -Value @(
  "Serveur MCP - Bases de donnees $version",
  "Construit le $(Get-Date -Format 'yyyy-MM-dd HH:mm') - commit $commit"
)

Step "Création de l'archive"
$zip = Join-Path $dist "$name.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($staging, $zip, [IO.Compression.CompressionLevel]::Optimal, $false)
Remove-Item $staging -Recurse -Force

$size = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "`nPaquet prêt : $zip ($size Mo)" -ForegroundColor Green
Write-Host "Copiez-le sur le serveur et suivez README.md (dans l'archive)."
