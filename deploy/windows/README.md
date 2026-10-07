# Déploiement sur Windows Server (paquet .zip)

Ce guide installe le serveur MCP **sur un serveur Windows du réseau de l'entreprise**, pour que Claude, ChatGPT et Copilot puissent interroger vos bases **MySQL et SQL Server internes**, sans les exposer sur Internet.

Le déploiement est **manuel** : l'application est compilée sur un poste de développement, puis copiée sous forme d'un fichier `.zip`. Sur le serveur, **seul Node.js est nécessaire** : ni Git, ni npm, ni accès Internet pendant l'installation.

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
 │        (utilisateurs, administrateurs,         SQL Server (lecture)    │
 │         connexions chiffrées)                                          │
 └────────────────────────────────────────────────────────────────────────┘
```

- Le serveur MCP n'écoute que sur `127.0.0.1`. Seul le tunnel le publie, protégé par OAuth (chaque assistant est autorisé avec un identifiant et un mot de passe).
- Les bases restent fermées à Internet. Le serveur MCP les joint par le réseau interne (`localhost` ou IP interne).
- Les comptes (utilisateurs, administrateurs) et les connexions sont stockés dans **MySQL**, dans une base dédiée `mcp_server`.

## 1. Construire le paquet (sur le poste de développement)

Sur le poste qui contient le code source (avec Node.js et les dépendances installées) :

```powershell
cd C:\projets\serveurMCP
npm run package:windows
```

Le paquet est créé dans `dist\`, par exemple `dist\mcp-server-1.0.0-20261007-1500.zip`. Il contient l'application compilée et ses dépendances (100 % JavaScript, compatible avec tout processeur), l'outil de service WinSW, les scripts, les scripts SQL et ce guide.

Copiez ce fichier sur le serveur, par partage réseau, clé USB ou Bureau à distance.

## 2. Prérequis sur le serveur

| Élément | Détail |
|---|---|
| Windows Server | 2016 ou plus récent, compte administrateur |
| Node.js | **22 LTS**, installateur `.msi` sur [nodejs.org](https://nodejs.org). S'il n'y a pas d'Internet sur le serveur, téléchargez-le ailleurs et copiez-le. |
| MySQL | 5.7+, 8.x ou MariaDB 10.5+, pour la base de stockage (le MySQL déjà présent convient) |
| HTTPS public | Un compte Cloudflare (gratuit) dont le DNS gère votre domaine, **ou** IIS avec un certificat (voir l'annexe) |

Après l'installation de Node.js, **rouvrez PowerShell** pour que la commande `node` soit reconnue.

## 3. Créer la base de stockage MySQL

Dans le paquet, ouvrez `sql\mysql-stockage.sql` et remplacez `CHANGEZ-MOI` par un mot de passe long : ce sera celui de `STORE_URL`. Exécutez ensuite le script avec un compte administrateur MySQL :

```powershell
mysql -u root -p < C:\mcp-server\sql\mysql-stockage.sql
```

Vous pouvez aussi l'exécuter depuis MySQL Workbench ou phpMyAdmin. Le serveur MCP crée lui-même ses deux tables au premier démarrage.

## 4. Installer

1. **Débloquez le fichier** : clic droit sur le `.zip`, *Propriétés*, cochez **Débloquer**, puis *OK*.
2. **Extrayez** le contenu dans `C:\mcp-server` : clic droit, *Extraire tout…*, destination `C:\mcp-server`. Vous devez obtenir `C:\mcp-server\app\`, `C:\mcp-server\install.ps1`, etc.
3. Dans **PowerShell lancé en administrateur**, exécutez :

   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\mcp-server\install.ps1
   ```

   Au premier lancement, le script crée `C:\mcp-server\.env.local` et l'ouvre dans le Bloc-notes. Complétez-le :

   | Variable | Valeur |
   |---|---|
   | `ENCRYPTION_KEY` | Générée avec `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. **Sauvegardez-la** dans votre gestionnaire de mots de passe : sans elle, les connexions enregistrées sont irrécupérables. |
   | `ADMIN_PASSWORD` | Mot de passe long du **compte de secours** (identifiant `admin`). |
   | `STORE_URL` | `mysql://mcp_server:MOT_DE_PASSE@127.0.0.1:3306/mcp_server`. Encodez les caractères spéciaux du mot de passe : `@` → `%40`, `#` → `%23`, `:` → `%3A`, `/` → `%2F`, `%` → `%25`. |
   | `PUBLIC_BASE_URL` | L'adresse HTTPS finale, par exemple `https://mcp.votre-domaine.com`. |
   | `CLIENT_IP_HEADER` | `cf-connecting-ip` avec Cloudflare Tunnel. |

4. Enregistrez, puis **relancez la même commande**. Le script crée le service `mcp-db-server` (démarrage automatique, redémarrage en cas d'arrêt) et vérifie le stockage. Il doit se terminer par :

   ```
   Installation terminée.
     Local     : http://127.0.0.1:3100  (stockage : mysql)
   ```

   En cas d'erreur, le message indique la cause : MySQL arrêté, identifiants refusés, base absente…

## 5. Publier en HTTPS avec Cloudflare Tunnel

1. Installez **cloudflared** : l'installateur `cloudflared-windows-amd64.msi` est sur [github.com/cloudflare/cloudflared/releases](https://github.com/cloudflare/cloudflared/releases). Vous pouvez le copier comme le paquet.
2. Dans le tableau de bord Cloudflare, ouvrez **Zero Trust → Networks → Tunnels → Create a tunnel**, choisissez **Cloudflared**, puis nommez le tunnel, par exemple `mcp-windows`.
3. À l'étape *Install connector*, choisissez **Windows**. Copiez la commande `cloudflared.exe service install <JETON>` et exécutez-la dans PowerShell administrateur.
4. À l'étape **Public Hostname**, remplissez :
   - **Subdomain** : `mcp` ;
   - **Domain** : votre domaine ;
   - **Service** : `HTTP` ;
   - **URL** : `localhost:3100`.
5. Vérifiez depuis n'importe quel poste : `https://mcp.votre-domaine.com/api/health` doit répondre `{"ok":true,"store":"mysql"}`.

N'activez pas **Cloudflare Access** devant ce nom d'hôte. Claude et ChatGPT seraient bloqués, et l'authentification est déjà assurée par le serveur (OAuth).

## 6. Connecter vos bases

Ouvrez `https://mcp.votre-domaine.com`, connectez-vous avec `admin`, puis cliquez sur **+ Nouvelle connexion**.

**Compte recommandé** : créez sur chaque base un compte **en lecture seule** avec `sql\sqlserver-lecteur.sql` ou `sql\mysql-lecteur.sql`.

**Bases sur ce même serveur**

| Moteur | Hôte | Port |
|---|---|---|
| MySQL | `localhost` | `3306` |
| SQL Server (instance par défaut) | `localhost` | `1433` |

Décochez **SSL / TLS** pour une base locale.

**SQL Server : à vérifier**
- **TCP/IP doit être activé** dans *SQL Server Configuration Manager → Protocoles*, puis le service SQL Server redémarré.
- Le compte doit être une **connexion SQL Server**, pas un compte Windows. L'instance doit donc accepter l'authentification SQL Server (mode mixte).
- **Instance nommée** (ex. `SQLEXPRESS`) : utilisez l'onglet **Chaîne de connexion** avec `Server=localhost\SQLEXPRESS;Database=MaBase;User Id=mcp_lecteur;Password=…;Encrypt=false;TrustServerCertificate=true`. Le service **SQL Server Browser** doit alors être démarré. Vous pouvez aussi fixer le port TCP de l'instance et utiliser les champs séparés.

**Bases sur un autre serveur du réseau** : indiquez son IP ou son nom interne (ex. `10.0.0.25`, `srv-sql01`). Autorisez le serveur MCP dans le pare-feu de ce serveur (port 3306 ou 1433).

## 7. Créer les administrateurs et les utilisateurs

Le compte `admin` de `.env.local` est un **compte de secours**. Dans l'onglet **Utilisateurs** :

1. Invitez chaque personne (e-mail) et transmettez-lui son lien d'invitation : elle y choisit son mot de passe.
2. Pour les responsables, cliquez sur **Nommer administrateur**. Ils gèrent alors connexions et utilisateurs avec leur propre compte.
3. Gardez le mot de passe du compte de secours en lieu sûr.

Tous ces comptes sont enregistrés dans la base MySQL `mcp_server`.

## 8. Ajouter le serveur aux assistants

L'URL MCP de chaque connexion est de la forme `https://mcp.votre-domaine.com/api/mcp/<identifiant>`. Elle est affichée dans l'interface avec la procédure pour Claude, ChatGPT et Copilot. Chaque utilisateur s'autorise avec **son propre compte**.

## Mettre à jour

1. Sur le poste de développement, récupérez la dernière version du code puis lancez `npm run package:windows`.
2. Copiez le nouveau `.zip` sur le serveur, par exemple dans `C:\Temp\`, sans l'extraire.
3. Dans PowerShell administrateur :

   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\mcp-server\update.ps1 -Package C:\Temp\mcp-server-1.0.0-20261020-0900.zip
   ```

Le script arrête le service, remplace l'application et redémarre. `.env.local`, les journaux et la base MySQL sont conservés. **Si la nouvelle version ne démarre pas, l'ancienne est restaurée automatiquement.**

## Exploitation

| Action | Commande (PowerShell administrateur) |
|---|---|
| État du service | `Get-Service mcp-db-server` |
| Redémarrer (après modification de `.env.local`) | `Restart-Service mcp-db-server` |
| Journaux | `C:\mcp-server\logs\` |
| Santé | `Invoke-RestMethod http://127.0.0.1:3100/api/health` |
| Version installée | `Get-Content C:\mcp-server\VERSION.txt` |
| Désinstaller | `powershell -ExecutionPolicy Bypass -File C:\mcp-server\uninstall.ps1` (la base MySQL et `.env.local` sont conservées) |

**Sauvegardes** : sauvegardez la base MySQL `mcp_server` avec vos sauvegardes habituelles, **et** gardez `ENCRYPTION_KEY` à part. L'une ne sert à rien sans l'autre.

## Annexe : IIS au lieu de Cloudflare Tunnel

Si le serveur a une IP publique et que le port 443 peut lui être ouvert :

1. Installez les modules IIS **URL Rewrite** et **Application Request Routing (ARR)**. Dans *ARR → Server Proxy Settings*, cochez **Enable proxy**.
2. Activez la préservation du nom d'hôte :
   `%windir%\system32\inetsrv\appcmd.exe set config -section:system.webServer/proxy /preserveHostHeader:"True" /commit:apphost`
3. Créez un site lié à `mcp.votre-domaine.com` et ajoutez une règle de réécriture inverse vers `http://127.0.0.1:3100/{R:1}`. Dans cette règle, ajoutez la variable serveur `HTTP_X_REAL_IP` = `{REMOTE_ADDR}`, à autoriser dans *Afficher les variables serveur*.
4. Obtenez un certificat Let's Encrypt avec [win-acme](https://www.win-acme.com/) et liez-le au site en HTTPS.
5. Dans `.env.local`, mettez `CLIENT_IP_HEADER=x-real-ip`, puis redémarrez le service.
