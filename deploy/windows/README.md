# Déploiement sur Windows Server

Ce guide installe le serveur MCP **sur un serveur Windows du réseau de l'entreprise**, pour que Claude, ChatGPT et Copilot puissent interroger vos bases **MySQL et SQL Server internes**, sans les exposer sur Internet.

```
 Claude / ChatGPT / Copilot
            │  HTTPS (https://mcp.votre-domaine.com)
            ▼
   Cloudflare (tunnel chiffré, sortant : aucun port entrant à ouvrir)
            │
 ┌──────────┼──────────────────── Windows Server ─────────────────────────┐
 │          ▼                                                             │
 │  cloudflared (service) ──▶ Serveur MCP (service « mcp-db-server »)     │
 │                            http://127.0.0.1:3100                       │
 │                              │                 │                       │
 │                              ▼                 ▼                       │
 │        Base MySQL « mcp_server »               Vos bases MySQL /       │
 │              (comptes, connexions chiffrées)   SQL Server (lecture)    │
 └────────────────────────────────────────────────────────────────────────┘
```

- Le serveur MCP n'écoute que sur `127.0.0.1`. Seul le tunnel le publie, protégé par OAuth (identifiant et mot de passe pour chaque assistant).
- Les bases restent fermées à Internet. Le serveur MCP les joint par le réseau interne (`localhost` ou IP interne).
- Les données du serveur (utilisateurs, connexions, autorisations) sont stockées dans **MySQL**, dans une base dédiée `mcp_server`. MongoDB n'est pas nécessaire. Les bases SQL Server, elles, restent connectables aux assistants.

## 1. Prérequis

| Élément | Détail |
|---|---|
| Windows Server | 2016 ou plus récent, compte administrateur |
| Node.js | **22 LTS** (installateur `.msi` sur [nodejs.org](https://nodejs.org)) |
| Git for Windows | [git-scm.com](https://git-scm.com/download/win), pour récupérer le code et les mises à jour |
| MySQL | 5.7+, 8.x ou MariaDB 10.5+, pour la base de stockage (le MySQL déjà présent convient) |
| HTTPS public | Un compte Cloudflare (gratuit) dont le DNS gère votre domaine, **ou** IIS avec un certificat (voir l'annexe) |

Après l'installation de Node.js et de Git, **rouvrez PowerShell** pour qu'ils soient reconnus.

## 2. Créer la base de stockage MySQL

Modifiez d'abord `CHANGEZ-MOI` dans `deploy\windows\sql\mysql-stockage.sql` : ce sera le mot de passe de `STORE_URL`. Exécutez ensuite le script avec un compte administrateur MySQL :

```powershell
mysql -u root -p < deploy\windows\sql\mysql-stockage.sql
```

Vous pouvez aussi l'ouvrir dans MySQL Workbench ou phpMyAdmin et l'exécuter.

Le serveur MCP crée lui-même ses deux tables (`mcp_kv`, `mcp_set`) au premier démarrage. Le compte `mcp_server` n'a de droits que sur cette base.

## 3. Récupérer le code

```powershell
git clone https://github.com/solid-afrique/serveurMCP_SOLID.git C:\mcp-server
cd C:\mcp-server
```

Si le dépôt est privé, Git demande de vous authentifier : connexion GitHub ou jeton d'accès personnel en lecture.

## 4. Installer le service

Dans **PowerShell lancé en administrateur** :

```powershell
cd C:\mcp-server
powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1
```

Au premier lancement, le script crée `C:\mcp-server\.env.local` et l'ouvre dans le Bloc-notes. Complétez-le :

| Variable | Valeur |
|---|---|
| `ENCRYPTION_KEY` | Générée avec `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. **Sauvegardez-la** dans votre gestionnaire de mots de passe : sans elle, les connexions enregistrées sont irrécupérables. |
| `ADMIN_PASSWORD` | Mot de passe long du compte administrateur (identifiant `admin`). |
| `STORE_URL` | `mysql://mcp_server:MOT_DE_PASSE@127.0.0.1:3306/mcp_server`. Encodez les caractères spéciaux du mot de passe (`@` → `%40`, `#` → `%23`…). |
| `PUBLIC_BASE_URL` | L'adresse HTTPS finale, par exemple `https://mcp.votre-domaine.com`. |
| `CLIENT_IP_HEADER` | `cf-connecting-ip` avec Cloudflare Tunnel. |

Enregistrez, puis **relancez le script**. Il installe les dépendances, compile l'application, crée le service `mcp-db-server` (démarrage automatique, redémarrage en cas d'arrêt) et vérifie le stockage. Il doit se terminer par :

```
Installation terminée.
  Local     : http://127.0.0.1:3100  (stockage : mysql)
```

Si le stockage est en erreur, le message indique la cause : service arrêté, identifiants refusés, base absente…

## 5. Publier en HTTPS avec Cloudflare Tunnel

1. Installez **cloudflared** : `winget install --id Cloudflare.cloudflared`, ou l'installateur `.msi` sur [github.com/cloudflare/cloudflared/releases](https://github.com/cloudflare/cloudflared/releases).
2. Dans le tableau de bord Cloudflare, ouvrez **Zero Trust → Networks → Tunnels → Create a tunnel**, choisissez **Cloudflared**, puis nommez le tunnel, par exemple `mcp-windows`.
3. À l'étape *Install connector*, choisissez **Windows**. Copiez la commande `cloudflared.exe service install <JETON>` et exécutez-la dans PowerShell administrateur. cloudflared devient un service Windows.
4. À l'étape **Public Hostname**, remplissez :
   - **Subdomain** : `mcp` ;
   - **Domain** : votre domaine ;
   - **Service** : `HTTP` ;
   - **URL** : `localhost:3100`.
5. Vérifiez depuis n'importe quel poste : `https://mcp.votre-domaine.com/api/health` doit répondre `{"ok":true,"store":"…"}`.

N'activez pas **Cloudflare Access** devant ce nom d'hôte. Claude et ChatGPT seraient bloqués, et l'authentification est déjà assurée par le serveur (OAuth).

## 6. Connecter vos bases

Ouvrez `https://mcp.votre-domaine.com`, connectez-vous avec `admin`, puis cliquez sur **+ Nouvelle connexion**.

**Compte recommandé** : créez sur chaque base un compte **en lecture seule** avec `deploy\windows\sql\sqlserver-lecteur.sql` ou `mysql-lecteur.sql`.

**Bases sur ce même serveur**

| Moteur | Hôte | Port |
|---|---|---|
| MySQL | `localhost` | `3306` |
| SQL Server (instance par défaut) | `localhost` | `1433` |

Décochez **SSL / TLS** pour une base locale.

**SQL Server : à vérifier**
- **TCP/IP doit être activé** dans *SQL Server Configuration Manager → Protocoles*, puis le service SQL Server redémarré.
- Le compte doit être une **connexion SQL Server**, pas un compte Windows.
- **Instance nommée** (ex. `SQLEXPRESS`) : utilisez l'onglet **Chaîne de connexion** avec `Server=localhost\SQLEXPRESS;Database=MaBase;User Id=mcp_lecteur;Password=…;Encrypt=false;TrustServerCertificate=true`. Le service **SQL Server Browser** doit alors être démarré. Vous pouvez aussi fixer le port TCP de l'instance et utiliser les champs séparés.

**Bases sur un autre serveur du réseau** : indiquez son IP ou son nom interne (ex. `10.0.0.25`, `srv-sql01`). Autorisez le serveur MCP dans le pare-feu de ce serveur (port 3306 ou 1433).

## 7. Créer les administrateurs et les utilisateurs

Le compte `admin` défini dans `.env.local` est un **compte de secours**. Dans l'onglet **Utilisateurs** :

1. Invitez chaque personne (e-mail) et transmettez-lui son lien d'invitation : elle y choisit son mot de passe.
2. Pour les responsables, cliquez sur **Nommer administrateur**. Ils gèrent alors connexions et utilisateurs avec leur propre compte.
3. Gardez le mot de passe du compte de secours en lieu sûr, pour la première connexion et les dépannages.

Tous ces comptes sont enregistrés dans la base MySQL `mcp_server`.

## 8. Ajouter le serveur aux assistants

L'URL MCP de chaque connexion est de la forme `https://mcp.votre-domaine.com/api/mcp/<identifiant>`. Elle est affichée dans l'interface avec la procédure pour Claude, ChatGPT et Copilot. Chaque utilisateur s'autorise avec **son propre compte**.

## Exploitation

| Action | Commande (PowerShell administrateur, dans `C:\mcp-server`) |
|---|---|
| Mettre à jour | `powershell -ExecutionPolicy Bypass -File deploy\windows\update.ps1` |
| État du service | `Get-Service mcp-db-server` |
| Redémarrer | `Restart-Service mcp-db-server` |
| Journaux | `deploy\windows\logs\` |
| Santé | `Invoke-RestMethod http://127.0.0.1:3100/api/health` |
| Désinstaller | `powershell -ExecutionPolicy Bypass -File deploy\windows\uninstall.ps1` (la base et `.env.local` sont conservées) |

Après toute modification de `.env.local`, redémarrez le service.

**Sauvegardes** : sauvegardez la base `mcp_server` avec vos sauvegardes habituelles, **et** gardez `ENCRYPTION_KEY` à part. L'une ne sert à rien sans l'autre.

## Annexe : IIS au lieu de Cloudflare Tunnel

Si le serveur a une IP publique et que le port 443 peut lui être ouvert :

1. Installez les modules IIS **URL Rewrite** et **Application Request Routing (ARR)**. Dans *ARR → Server Proxy Settings*, cochez **Enable proxy**.
2. Activez la préservation du nom d'hôte :
   `%windir%\system32\inetsrv\appcmd.exe set config -section:system.webServer/proxy /preserveHostHeader:"True" /commit:apphost`
3. Créez un site lié à `mcp.votre-domaine.com` et ajoutez une règle de réécriture inverse vers `http://127.0.0.1:3100/{R:1}`. Dans cette règle, ajoutez la variable serveur `HTTP_X_REAL_IP` = `{REMOTE_ADDR}`, à autoriser dans *Afficher les variables serveur*.
4. Obtenez un certificat Let's Encrypt avec [win-acme](https://www.win-acme.com/) et liez-le au site en HTTPS.
5. Dans `.env.local`, mettez `CLIENT_IP_HEADER=x-real-ip`, puis redémarrez le service.
