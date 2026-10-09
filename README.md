# Serveur MCP — Bases de données (Laravel)

Serveur [MCP](https://modelcontextprotocol.io) qui permet à **Claude, ChatGPT, GitHub Copilot, Cursor** et à tout client compatible MCP d'interroger les bases de l'entreprise : **MySQL / MariaDB, SQL Server, PostgreSQL**, ainsi que **MongoDB** et **Redis**.

- **Interface web** : connexions aux bases, utilisateurs et administrateurs, attribution des accès.
- **OAuth 2.1** : chaque assistant est autorisé avec le compte de son utilisateur.
- **Données de l'application dans MySQL**, avec les paramètres de connexion chiffrés.
- **Déploiement manuel sur IIS** (Windows Server, PHP en FastCGI) : voir **[deploy/DEPLOIEMENT-IIS.md](deploy/DEPLOIEMENT-IIS.md)**.

> L'ancienne version Next.js est archivée dans la branche `archive/nextjs` (étiquette `nextjs-v1`).

## Fonctionnement

```
 Assistant ──POST /mcp/{connexion}──▶ 401 + découverte OAuth (/.well-known/…)
           ──/oauth/register──────────▶ enregistrement dynamique du client
           ──/oauth/authorize─────────▶ connexion de l'utilisateur + « Autoriser »
           ◀──jeton d'accès (1 h) + jeton de rafraîchissement (30 j)
           ──POST /mcp/{connexion} + Bearer──▶ outils (list_tables, run_query…) ──▶ base de données
```

- **Une URL MCP par connexion** (`https://serveur/mcp/<identifiant>`). Elle n'est pas secrète : sans autorisation, elle ne donne accès à rien.
- **Contrôle à chaque requête** : l'utilisateur derrière le jeton doit avoir un compte actif et avoir toujours accès à la connexion. Retirer un accès, désactiver un compte ou retirer un rôle prend effet immédiatement.
- **Paramètres des connexions** (hôte, compte, mot de passe) **chiffrés** avec `APP_KEY`. Ils ne sont jamais renvoyés au navigateur.

## Administrateurs et utilisateurs

| | Administrateur | Utilisateur |
|---|---|---|
| Connexions visibles | Toutes | Ses connexions privées et celles qu'on lui attribue |
| Créer une connexion | Oui (pool commun, attribuable) | Oui, privée (visible de lui et des administrateurs) |
| Modifier / supprimer | Toutes | Ses connexions privées |
| Attribuer une connexion | Oui | Non |
| Comptes | Inviter, réinitialiser un mot de passe, nommer administrateur, désactiver, supprimer, déconnecter les assistants | Changer son mot de passe, déconnecter ses assistants |

- **Création des comptes** : l'administrateur génère un **lien d'invitation** à usage unique (7 jours), que l'utilisateur ouvre pour choisir son mot de passe. Aucun e-mail n'est envoyé.
- **Premier administrateur et dépannage** : `php artisan mcp:admin email@domaine.com`.

## Outils exposés aux assistants

| Base | Lecture | Écriture (si la connexion n'est pas en lecture seule) |
|---|---|---|
| MySQL, SQL Server, PostgreSQL | `connection_info`, `list_tables`, `describe_table`, `run_query` (paramètres `?`) | `execute_statement` |
| MongoDB | `list_databases`, `list_collections`, `describe_collection`, `find`, `count_documents`, `aggregate` | `insert_documents`, `update_documents`, `delete_documents` |
| Redis | `scan_keys`, `get_key`, `server_info`, `run_command` (liste blanche) | `run_command` (hors commandes dangereuses) |

**Lecture seule**, à deux niveaux :
- **Transaction** : `READ ONLY` sous MySQL et PostgreSQL ; transaction systématiquement annulée sous SQL Server.
- **Garde-fou SQL** (`app/Services/Databases/SqlGuard.php`) : une seule instruction par appel, et refus des mots-clés d'écriture (`INSERT`, `DELETE`, `INTO`, `EXEC`…).

Ces protections ne remplacent pas les droits de la base : utilisez des **comptes en lecture seule** (`deploy/sql/*-lecteur.sql`).

## Développement local

Prérequis : PHP 8.3+ (extensions `pdo_mysql`, `sodium`, `mbstring`, `openssl` ; `pdo_sqlsrv`, `pdo_pgsql`, `mongodb` selon les bases à tester), Composer, MySQL.

```powershell
composer install
copy .env.example .env      # puis APP_ENV=local, APP_DEBUG=true, APP_URL=http://127.0.0.1:8000, SESSION_SECURE_COOKIE=false, DB_*
php artisan key:generate
php artisan migrate
php artisan passport:keys
php artisan mcp:admin vous@exemple.com
cd public; php -S 127.0.0.1:8000 ..\vendor\laravel\framework\src\Illuminate\Foundation\resources\server.php
```

Tests : `php artisan test`.

Sur un PHP où `sodium` n'est pas activée (WAMP), préfixez les commandes : `php -d extension=sodium artisan …`.

## Structure

```
app/Mcp/Servers/DatabaseServer.php     Serveur MCP (outils selon le type de base)
app/Mcp/Tools/                         Outils SQL, MongoDB, Redis
app/Http/Middleware/AuthorizeMcpConnection.php   Contrôle d'accès à chaque requête MCP
app/Services/Databases/                Accès aux bases (PDO, MongoDB, Predis), garde-fou SQL
app/Models/                            User, DatabaseConnection (paramètres chiffrés), Invitation
app/Http/Controllers/                  Interface : connexions, utilisateurs, compte, invitations
resources/views/                       Pages Blade (dont mcp/authorize : consentement OAuth)
routes/ai.php                          Routes MCP et OAuth ; routes/web.php : interface
deploy/                                Paquet IIS, guide de déploiement, scripts SQL
```
