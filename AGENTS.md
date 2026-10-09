# Serveur MCP — Bases de données (Laravel)

Serveur MCP (Model Context Protocol) qui expose des bases MySQL, SQL Server, PostgreSQL, MongoDB et Redis à Claude, ChatGPT, Copilot, protégé par OAuth 2.1. Déployé manuellement sur IIS (Windows Server). Langue du projet : français (interface, messages, commentaires, documentation).

## Pile

- Laravel 13, PHP 8.3+, MySQL (base de l'application).
- `laravel/mcp` : serveur MCP (`routes/ai.php`, `Mcp::web('/mcp/{connection}')`, `Mcp::oauthRoutes()`).
- `laravel/passport` : OAuth 2.1 (enregistrement dynamique, PKCE, jetons). Garde `api`.
- Interface en Blade + `public/css/app.css` + `public/js/app.js` (pas de Vite ni de npm en production).

## Repères

- `app/Mcp/Servers/DatabaseServer.php` : serveur MCP ; `app/Mcp/Tools/**` : outils (filtrés par type de base et lecture seule via `DatabaseTool::shouldRegister`).
- `app/Http/Middleware/AuthorizeMcpConnection.php` : à chaque requête MCP, vérifie compte actif + accès à la connexion.
- `app/Services/Databases/*` : accès PDO (mysql, sqlsrv, pgsql), MongoDB (extension), Redis (Predis) ; `SqlGuard` = garde-fou lecture seule.
- `app/Models/DatabaseConnection.php` : paramètres chiffrés (`encrypted:array`, clé = APP_KEY), règles `canBeManagedBy` / `canBeUsedBy`.
- `deploy/` : paquet (`package.ps1`), guide IIS, scripts SQL.

## Commandes (poste Windows de développement)

L'extension `sodium` (exigée par Passport) n'est pas activée dans le PHP WAMP : préfixer par `php -d extension=sodium`, et désactiver Xdebug (`XDEBUG_MODE=off`).

```sh
php -d extension=sodium artisan test          # tests PHPUnit
php -d extension=sodium artisan migrate
php -d extension=sodium artisan mcp:admin vous@exemple.com   # créer / réparer un administrateur
powershell -ExecutionPolicy Bypass -File deploy/package.ps1  # paquet .zip pour IIS
```

Serveur local : depuis `public/`, `php -d extension=sodium -S 127.0.0.1:8000 ../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php`.

## Historique

L'ancienne version Next.js est archivée (branche `archive/nextjs`, étiquette `nextjs-v1`).
