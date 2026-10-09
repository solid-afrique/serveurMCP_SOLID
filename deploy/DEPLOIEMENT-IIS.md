# Déploiement manuel sur IIS (Windows Server)

Ce guide installe le serveur MCP (application **Laravel**) comme un site IIS classique, avec **PHP en FastCGI** et **MySQL** pour les données de l'application. Claude, ChatGPT et Copilot peuvent ensuite interroger vos bases MySQL et SQL Server internes, sans que celles-ci soient exposées sur Internet.

```
 Claude / ChatGPT / Copilot ──HTTPS──▶ IIS (site « mcp-server », votre certificat)
                                         │  PHP (FastCGI) → Laravel, dossier public\
                                         ├──▶ MySQL « mcp_server » : utilisateurs, administrateurs,
                                         │     connexions (paramètres chiffrés), jetons OAuth
                                         └──▶ Vos bases MySQL / SQL Server (comptes en lecture seule)
```

Le déploiement est **manuel** : un fichier `.zip`, préparé sur un poste de développement, est copié sur le serveur. Ni Git, ni Composer, ni npm ne sont nécessaires sur le serveur.

## 1. Prérequis sur le serveur

| Élément | Détail |
|---|---|
| **IIS** | Rôle « Serveur Web (IIS) » avec la fonctionnalité **CGI** (*Gestionnaire de serveur → Ajouter des rôles → Développement d'applications → CGI*) |
| **URL Rewrite** | Module IIS [URL Rewrite 2.1](https://www.iis.net/downloads/microsoft/url-rewrite) |
| **PHP 8.3 ou 8.4** | Version **NTS x64** (*Non Thread Safe*) depuis [windows.php.net/download](https://windows.php.net/download/), décompressée par exemple dans `C:\PHP`. Le **Visual C++ Redistributable** x64 est requis. |
| **MySQL** | 5.7+, 8.x ou MariaDB 10.5+, pour la base de l'application (le MySQL déjà présent convient) |
| **Nom d'hôte et certificat** | Par exemple `mcp.votre-domaine.com`, un enregistrement DNS et un certificat dans *Ordinateur local → Personnel*, comme pour vos autres sites. Le site doit être **accessible depuis Internet** : Claude et ChatGPT s'y connectent depuis leurs serveurs. |

### Extensions PHP (`C:\PHP\php.ini`)

Copiez `php.ini-production` en `php.ini`, puis :

```ini
extension_dir = "C:\PHP\ext"
extension=curl
extension=fileinfo
extension=mbstring
extension=openssl
extension=pdo_mysql
extension=sodium        ; requis par l'OAuth (Passport)
zend_extension=opcache  ; recommandé (performances)
opcache.enable=1

; Bases SQL Server (pilote Microsoft, voir ci-dessous)
extension=pdo_sqlsrv
; Optionnel : PostgreSQL et MongoDB
;extension=pdo_pgsql
;extension=mongodb

cgi.fix_pathinfo=0
fastcgi.impersonate=1
date.timezone = "Africa/Ouagadougou"
memory_limit = 256M
```

**Pilote SQL Server** (pour connecter vos bases SQL Server) :
1. Installez le **Microsoft ODBC Driver 18 for SQL Server** (x64).
2. Téléchargez les **Microsoft Drivers for PHP for SQL Server** (version compatible avec votre PHP) et copiez `php_pdo_sqlsrv_8x_nts_x64.dll` dans `C:\PHP\ext`, renommé en `php_pdo_sqlsrv.dll` (ou indiquez son nom exact dans `extension=`).

**MongoDB** (optionnel) : copiez `php_mongodb.dll` (PECL, version NTS x64 correspondant à PHP) dans `C:\PHP\ext`. Sans cette extension, le type « MongoDB » n'est simplement pas proposé.

Vérifiez dans PowerShell : `C:\PHP\php.exe -m`. La liste doit contenir `pdo_mysql`, `sodium`, `openssl` et `mbstring` (et `pdo_sqlsrv` pour SQL Server).

### PHP dans IIS

Gestionnaire IIS → nom du serveur → **Mappages de gestionnaires** → **Ajouter un mappage de module** :
- Chemin des requêtes : `*.php` ; Module : `FastCgiModule` ; Exécutable : `C:\PHP\php-cgi.exe` ; Nom : `PHP_via_FastCGI`.

Puis **Paramètres FastCGI** → `C:\PHP\php-cgi.exe` → **Modifier** : *Délai d'activité* et *Délai de la requête* à `120`, *Nombre maximal d'instances* `0` (automatique), et la variable d'environnement `PHP_FCGI_MAX_REQUESTS` = `10000`.

## 2. Construire le paquet (poste de développement)

```powershell
cd C:\projets\serveurMCP
powershell -ExecutionPolicy Bypass -File deploy\package.ps1
```

Le paquet est créé dans `dist\`, par exemple `dist\mcp-server-20261009-1500-abc1234.zip` (environ 10 Mo, dépendances incluses). Copiez-le sur le serveur.

## 3. Créer la base MySQL de l'application

Dans le paquet, ouvrez `deploy\sql\mysql-application.sql` et remplacez `CHANGEZ-MOI` par un mot de passe long. Exécutez-le ensuite avec un compte administrateur MySQL (MySQL Workbench, phpMyAdmin, ou `mysql -u root -p < mysql-application.sql`).

## 4. Installer les fichiers

1. Clic droit sur le `.zip` → **Propriétés** → cochez **Débloquer** → **OK**.
2. **Extraire tout…** vers **`C:\inetpub\mcp-server`**. Vous devez obtenir `C:\inetpub\mcp-server\artisan`, `C:\inetpub\mcp-server\public\`, etc.
3. Copiez `.env.example` en **`.env`** et complétez-le dans le Bloc-notes :

| Variable | Valeur |
|---|---|
| `APP_URL` | `https://mcp.votre-domaine.com` (sans `/` final) |
| `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` | `mcp_server` / `mcp_server` / le mot de passe de l'étape 3 |
| `APP_DEBUG` | **`false`**. Ne passez jamais à `true` en production : les erreurs détaillées seraient envoyées aux assistants. |

4. Dans **PowerShell en administrateur** :

```powershell
cd C:\inetpub\mcp-server
$php = "C:\PHP\php.exe"
& $php artisan key:generate --force          # clé APP_KEY (chiffre aussi les paramètres des connexions)
& $php artisan migrate --force               # crée les tables dans MySQL
& $php artisan passport:keys                 # clés de signature OAuth (storage\oauth-*.key)
& $php artisan mcp:admin vous@votre-domaine.com --name="Votre nom"   # premier administrateur (mot de passe demandé)
& $php artisan config:cache
& $php artisan route:cache
& $php artisan view:cache
```

**Sauvegardez `APP_KEY`** (dans `.env`) dans votre gestionnaire de mots de passe. Sans elle, les paramètres des connexions enregistrées sont irrécupérables.

## 5. Créer le site IIS

1. **Pools d'applications → Ajouter** : nom `mcp-server`, **Version du CLR .NET : Aucun code managé**, mode intégré. Dans *Paramètres avancés* : **Mode de démarrage `AlwaysRunning`**, **Délai d'inactivité `0`**.
2. **Droits** (PowerShell administrateur) :

   ```powershell
   icacls C:\inetpub\mcp-server /grant "IIS AppPool\mcp-server:(OI)(CI)RX"
   icacls C:\inetpub\mcp-server\storage /grant "IIS AppPool\mcp-server:(OI)(CI)M"
   icacls C:\inetpub\mcp-server\bootstrap\cache /grant "IIS AppPool\mcp-server:(OI)(CI)M"
   ```

3. **Sites → Ajouter un site web** :
   - Nom : `mcp-server`, pool : `mcp-server` ;
   - **Chemin d'accès physique : `C:\inetpub\mcp-server\public`** (le dossier `public`, pas la racine) ;
   - Liaison **https**, port 443, nom d'hôte `mcp.votre-domaine.com`, SNI, votre certificat.
4. Sélectionnez le site → **Authentification** → *Authentification anonyme* → **Modifier** → **Identité du pool d'applications**. Les droits de l'étape 2 s'appliquent alors.

Le fichier `public\web.config` fourni configure la réécriture vers Laravel, laisse passer les réponses d'erreur JSON (nécessaires à l'OAuth), retire WebDAV et accepte les longues URL OAuth.

## 6. Vérifier

Depuis un autre poste :
- `https://mcp.votre-domaine.com/up` → page « Application up » ;
- `https://mcp.votre-domaine.com/.well-known/oauth-authorization-server` → document JSON (découverte OAuth) ;
- `https://mcp.votre-domaine.com` → page de connexion. Connectez-vous avec l'administrateur créé à l'étape 4.

Ensuite :
1. **Utilisateurs** : invitez vos collègues (lien d'invitation à leur transmettre) et nommez les administrateurs.
2. **Connexions** : créez les connexions à vos bases. Utilisez de préférence des comptes en lecture seule, créés avec `deploy\sql\sqlserver-lecteur.sql` ou `deploy\sql\mysql-lecteur.sql`. Une base sur ce serveur s'indique avec l'hôte `localhost` ; une instance nommée SQL Server avec `localhost\SQLEXPRESS` (service *SQL Server Browser* démarré), ou bien par son port TCP fixe.
3. **Assistants** : chaque connexion affiche son URL MCP et la procédure pour Claude, ChatGPT, Copilot, Claude Code et Cursor.

## Mettre à jour

1. Construisez le nouveau paquet sur le poste de développement (`deploy\package.ps1`).
2. Sur le serveur, extrayez-le dans un dossier temporaire, par exemple `C:\Temp\mcp-nouveau`.
3. Dans PowerShell administrateur :

```powershell
cd C:\inetpub\mcp-server
$php = "C:\PHP\php.exe"
& $php artisan down                                   # page de maintenance
robocopy C:\Temp\mcp-nouveau C:\inetpub\mcp-server /E /XF .env /XD storage
& $php artisan migrate --force
& $php artisan config:cache; & $php artisan route:cache; & $php artisan view:cache
& $php artisan up
```

`.env`, `storage\` (journaux, clés OAuth) et la base MySQL sont conservés.

## Exploitation

| Action | Commande / emplacement |
|---|---|
| Journaux de l'application | `C:\inetpub\mcp-server\storage\logs\laravel-AAAA-MM-JJ.log` |
| Après modification de `.env` | `php artisan config:cache`, puis recyclez le pool `mcp-server` |
| Administrateur bloqué ou mot de passe perdu | `php artisan mcp:admin email@domaine.com` (réinitialise le compte et le rend administrateur) |
| Nettoyer les jetons expirés (facultatif, tâche planifiée hebdomadaire) | `php artisan passport:purge` |
| Mode maintenance | `php artisan down` / `php artisan up` |

**Sauvegardes** : la base MySQL `mcp_server` **et** le fichier `.env` (pour `APP_KEY`), ainsi que `storage\oauth-private.key` et `storage\oauth-public.key`. Sans ces clés, les assistants devront simplement être ré-autorisés.

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Erreur 500.19 sur la configuration | Module URL Rewrite absent | Installez URL Rewrite 2.1 |
| Page 404 IIS sur `/login` | Réécriture inactive ou site pointant sur la racine | Le chemin physique doit être `…\public` ; vérifiez URL Rewrite |
| Erreur 500 de Laravel | Voir `storage\logs` | Le plus souvent : droits sur `storage`, `.env` incomplet, extension manquante |
| « The stream or file … could not be opened » | Droits d'écriture manquants | Relancez les commandes `icacls` (étape 5) |
| `could not find driver` en testant une connexion SQL Server | `pdo_sqlsrv` ou ODBC Driver 18 absent | Voir *Pilote SQL Server* (étape 1) |
| L'assistant n'arrive pas à se connecter (OAuth) | `APP_URL` différent de l'adresse publique, ou site non accessible depuis Internet | Corrigez `APP_URL`, `php artisan config:cache`, vérifiez `/.well-known/oauth-authorization-server` depuis l'extérieur |
| « redirect_uris … is not a permitted redirect domain » | Domaine de retour de l'assistant non autorisé | Ajoutez-le à `MCP_REDIRECT_DOMAINS` dans `.env`, puis `php artisan config:cache` |
