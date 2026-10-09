<#
.SYNOPSIS
  Construit le paquet de déploiement IIS (à lancer sur le poste de développement).

.DESCRIPTION
  Copie le projet sans les fichiers de développement, installe les dépendances de production
  (composer install --no-dev) et produit dist\mcp-server-<date>-<commit>.zip.
  Sur le serveur, seul PHP est nécessaire : ni Composer, ni Git, ni accès Internet.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\package.ps1
#>
param(
  [string]$Php = "php",
  [string]$OutDir = "dist"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }

# Passport exige l'extension sodium : on l'active pour Composer si elle ne l'est pas dans php.ini.
$phpArgs = @()
if ((& $Php -r "echo extension_loaded('sodium') ? 1 : 0;") -ne "1") { $phpArgs += "-d", "extension=sodium" }
$composer = (Get-Command composer.phar -ErrorAction SilentlyContinue).Source
if (-not $composer) { $composer = Join-Path (Split-Path (Get-Command composer).Source) "composer.phar" }
if (-not (Test-Path $composer)) { throw "composer.phar introuvable." }

$commit = (& git -C $Root rev-parse --short HEAD 2>$null)
$name = "mcp-server-$(Get-Date -Format 'yyyyMMdd-HHmm')$(if ($commit) { "-$commit" })"
$dist = Join-Path $Root $OutDir
$staging = Join-Path $dist $name

Step "Copie du projet (sans les fichiers de développement)"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path $staging | Out-Null
$excludeDirs = @("vendor", "node_modules", ".git", "dist", "tests", ".idea", ".vscode") | ForEach-Object { Join-Path $Root $_ }
$excludeDirs += @("storage\logs", "storage\framework\sessions", "storage\framework\views", "storage\framework\cache\data") | ForEach-Object { Join-Path $Root $_ }
& robocopy $Root $staging /E /NFL /NDL /NJH /NJS /NP /XD $excludeDirs /XF ".env" "*.key" "*.log" ".phpunit.result.cache" "packages.php" "services.php" "config.php" "routes-v7.php" | Out-Null
if ($LASTEXITCODE -ge 8) { throw "La copie a échoué (robocopy $LASTEXITCODE)." }
# Dossiers d'exécution attendus par Laravel (vides dans le paquet).
foreach ($dir in "storage\logs", "storage\framework\sessions", "storage\framework\views", "storage\framework\cache\data", "bootstrap\cache") {
  New-Item -ItemType Directory -Force -Path (Join-Path $staging $dir) | Out-Null
}

Step "Dépendances de production (composer install --no-dev)"
Push-Location $staging
try {
  $env:XDEBUG_MODE = "off"
  & $Php @phpArgs $composer install --no-dev --optimize-autoloader --classmap-authoritative --no-interaction --no-progress
  if ($LASTEXITCODE -ne 0) { throw "composer install a échoué." }
}
finally { Pop-Location }

Set-Content -Path (Join-Path $staging "VERSION.txt") -Encoding UTF8 -Value @(
  "Serveur MCP - Bases de donnees (Laravel)",
  "Construit le $(Get-Date -Format 'yyyy-MM-dd HH:mm') - commit $commit"
)

Step "Création de l'archive"
$zip = Join-Path $dist "$name.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
# Entrées avec « / » : sous Windows PowerShell 5.1, CreateFromDirectory écrirait des « \ ».
$archive = [IO.Compression.ZipFile]::Open($zip, [IO.Compression.ZipArchiveMode]::Create)
try {
  $prefix = $staging.TrimEnd("\").Length + 1
  foreach ($file in Get-ChildItem $staging -Recurse -File -Force) {
    $entry = $file.FullName.Substring($prefix).Replace("\", "/")
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entry, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
  # Dossiers vides (storage, bootstrap\cache) : entrées explicites.
  foreach ($dir in Get-ChildItem $staging -Recurse -Directory -Force | Where-Object { -not (Get-ChildItem $_.FullName -Force) }) {
    $archive.CreateEntry($dir.FullName.Substring($prefix).Replace("\", "/") + "/") | Out-Null
  }
}
finally { $archive.Dispose() }
Remove-Item $staging -Recurse -Force

$size = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "`nPaquet prêt : $zip ($size Mo)" -ForegroundColor Green
Write-Host "Suivez deploy\DEPLOIEMENT-IIS.md (inclus dans l'archive) pour l'installer sur le serveur."
