# Déploiement sur Windows Server (paquet .zip)

> **Vous déployez vos applications avec IIS ?** Suivez plutôt **[IIS-MANUEL.md](IIS-MANUEL.md)** : déploiement manuel où IIS héberge directement le serveur MCP (copie du dossier, pool et site créés dans le Gestionnaire IIS), sans service Windows ni script. Le présent guide décrit l'autre méthode, avec un service Windows et des scripts d'installation.

Ce guide installe le serveur MCP **sur un serveur Windows du réseau de l'entreprise**, pour que Claude, ChatGPT et Copilot puissent interroger vos bases **MySQL et SQL Server internes**, sans les exposer sur Internet.

Le déploiement est **manuel** : l'application est compilée sur un poste de développement, puis copiée sous forme d'un fichier `.zip`. Sur le serveur, **seul Node.js est nécessaire** : ni Git, ni npm, ni accès Internet pendant l'installation.

```
 Claude / ChatGPT / Copilot
            │  HTTPS (https://mcp.votre-domaine.com)
            ▼
 ┌──────────┼──────────────────── Windows Server ─────────────────────────┐
 │          ▼                                                             │
 │  IIS (site « mcp-server », certificat HTTPS, proxy inverse ARR)        │
 │          │                                                             │
 │          ▼                                                             │
 │  Serveur MCP (service Windows « mcp-db-server »)                       │
 │  http://127.0.0.1:3100                                                 │
 │          │                         │                                   │
 │          ▼                         ▼                                   │
 │  Base MySQL « mcp_server »         Vos bases MySQL /                   │
 │  (utilisateurs, administrateurs,   SQL Server (lecture)                │
 │   connexions chiffrées)                                                │
 └────────────────────────────────────────────────────────────────────────┘
```

- Le serveur MCP est un service Windows qui n'écoute que sur `127.0.0.1`. **IIS le publie** en HTTPS, comme vos autres applications, avec vos certificats. L'accès est protégé par OAuth : chaque assistant est autorisé avec un identifiant et un mot de passe.
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
| IIS | Avec les modules **URL Rewrite** ([télécharger](https://www.iis.net/downloads/microsoft/url-rewrite)) et **Application Request Routing 3.0** ([télécharger](https://www.iis.net/downloads/microsoft/application-request-routing)). Installateurs `.msi` copiables comme le paquet. |
| Nom d'hôte et certificat | Par exemple `mcp.votre-domaine.com`, avec un enregistrement DNS vers le serveur et un certificat dans *Ordinateur local → Personnel* (celui de votre domaine ou un certificat Let's Encrypt obtenu avec [win-acme](https://www.win-acme.com/)) |

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
   | `CLIENT_IP_HEADER` | `x-real-ip` avec cette méthode (site IIS créé par `iis-setup.ps1`). |

4. Enregistrez, puis **relancez la même commande**. Le script crée le service `mcp-db-server` (démarrage automatique, redémarrage en cas d'arrêt) et vérifie le stockage. Il doit se terminer par :

   ```
   Installation terminée.
     Local     : http://127.0.0.1:3100  (stockage : mysql)
   ```

   En cas d'erreur, le message indique la cause : MySQL arrêté, identifiants refusés, base absente…

## 5. Publier en HTTPS avec IIS

IIS sert de porte d'entrée HTTPS et transmet les requêtes au service `mcp-db-server` (proxy inverse ARR). Dans PowerShell administrateur :

```powershell
powershell -ExecutionPolicy Bypass -File C:\mcp-server\iis-setup.ps1 -HostName mcp.votre-domaine.com -CertThumbprint <EMPREINTE>
```

L'empreinte du certificat s'obtient avec `Get-ChildItem Cert:\LocalMachine\My | Format-List Subject, Thumbprint`.

Le script :
1. vérifie qu'IIS, URL Rewrite et ARR sont installés ;
2. active le proxy ARR au niveau du serveur, avec la conservation du nom d'hôte et un délai de 2 minutes ;
3. autorise les variables `HTTP_X_REAL_IP` et `HTTP_X_FORWARDED_HOST`, qui transmettent au serveur MCP la vraie IP du visiteur et le nom d'hôte public ;
4. crée `C:\inetpub\mcp-server\web.config` (règle de proxy vers `http://127.0.0.1:3100`, WebDAV désactivé) ;
5. crée le pool d'applications « Aucun code managé » et le site `mcp-server`, avec la liaison `https://mcp.votre-domaine.com` (SNI).

**Vous préférez créer le site vous-même ?** Lancez le script **sans paramètre** : il fait les étapes 1 à 4. Créez ensuite le site dans le Gestionnaire IIS, avec le chemin physique `C:\inetpub\mcp-server`, votre liaison HTTPS habituelle et un pool « Aucun code managé ».

Vérifiez ensuite :
- `.env.local` contient `PUBLIC_BASE_URL=https://mcp.votre-domaine.com` et `CLIENT_IP_HEADER=x-real-ip`. Si vous les changez, lancez `Restart-Service mcp-db-server`.
- Depuis un autre poste, `https://mcp.votre-domaine.com/api/health` répond `{"ok":true,"store":"mysql"}`.
- Claude et ChatGPT doivent pouvoir joindre ce nom d'hôte **depuis Internet**. Si le site n'est accessible qu'en interne, voir l'annexe Cloudflare Tunnel.

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

## Annexe : Cloudflare Tunnel si le serveur n'est pas accessible depuis Internet

Claude et ChatGPT se connectent depuis Internet. Si le serveur n'a ni IP publique ni port 443 ouvert, un tunnel Cloudflare publie le service **sans port entrant** (le domaine doit être géré par Cloudflare) :

1. Installez **cloudflared** (`cloudflared-windows-amd64.msi`, [github.com/cloudflare/cloudflared/releases](https://github.com/cloudflare/cloudflared/releases)).
2. Dans Cloudflare, ouvrez **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared → Windows**, puis exécutez la commande `cloudflared.exe service install <JETON>` proposée.
3. Dans **Public Hostname**, mettez `mcp` + votre domaine, avec le service `HTTP` et l'URL `localhost:3100`. IIS n'est alors pas nécessaire.
4. Dans `.env.local`, mettez `CLIENT_IP_HEADER=cf-connecting-ip`, puis lancez `Restart-Service mcp-db-server`.

N'activez pas Cloudflare Access sur ce nom d'hôte : les assistants seraient bloqués.
