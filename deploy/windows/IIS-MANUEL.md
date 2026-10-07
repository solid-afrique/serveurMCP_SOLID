# Déploiement manuel dans IIS

Le serveur MCP est déployé **comme une application IIS** : on copie un dossier, on crée un pool d'applications et un site dans le Gestionnaire IIS. **IIS démarre et surveille lui-même Node.js** (module ASP.NET Core V2) : il le relance s'il s'arrête et le recycle avec le pool. Il n'y a pas de service Windows à installer.

```
 Claude / ChatGPT / Copilot ──HTTPS──▶ IIS (site « mcp-server », votre certificat)
                                         │  ASP.NET Core Module V2 : lance node.exe et lui transmet les requêtes
                                         ▼
                                       Node.js (launcher.cjs → app\server.js), 127.0.0.1, port choisi par IIS
                                         │
                                         ├──▶ MySQL « mcp_server » (utilisateurs, administrateurs, connexions)
                                         └──▶ Vos bases MySQL / SQL Server
```

Dans le paquet, seuls `app\`, `launcher.cjs`, `web.config`, `env.windows.example` et `sql\` servent pour cette méthode. Les scripts `install.ps1`, `update.ps1`, `iis-setup.ps1` et le dossier `service\` concernent l'autre méthode (service Windows, voir `README.md`) : vous pouvez les ignorer.

## 1. Prérequis sur le serveur

| Élément | Vérification / installation |
|---|---|
| **Node.js 22 LTS** | Installateur `.msi` de [nodejs.org](https://nodejs.org), avec le chemin par défaut `C:\Program Files\nodejs\`. Ailleurs, adaptez `processPath` dans `web.config`. |
| **ASP.NET Core Module V2** | Gestionnaire IIS → nom du serveur → **Modules** : `AspNetCoreModuleV2` doit figurer dans la liste. Sinon, installez le **.NET Hosting Bundle** (« ASP.NET Core Runtime → Windows → Hosting Bundle », n'importe quelle version récente, sur [dotnet.microsoft.com/download/dotnet](https://dotnet.microsoft.com/download/dotnet)), puis lancez `iisreset` en administrateur. Le serveur MCP n'utilise pas .NET : seul ce module est utile. |
| **MySQL** | 5.7+, 8.x ou MariaDB 10.5+, pour la base de stockage |
| **Nom d'hôte et certificat** | Par exemple `mcp.votre-domaine.com`, un enregistrement DNS vers le serveur et le certificat dans *Ordinateur local → Personnel*, comme pour vos autres sites. Le site doit être accessible **depuis Internet**, car Claude et ChatGPT s'y connectent depuis leurs serveurs. |

## 2. Construire le paquet (poste de développement)

```powershell
cd C:\projets\serveurMCP
npm run package:windows
```

Copiez le fichier `dist\mcp-server-<version>-<date>.zip` sur le serveur.

## 3. Créer la base de stockage MySQL

Dans le paquet, ouvrez `sql\mysql-stockage.sql` et remplacez `CHANGEZ-MOI` par un mot de passe long. Exécutez ensuite le script avec un compte administrateur MySQL, depuis MySQL Workbench, phpMyAdmin ou en ligne de commande : `mysql -u root -p < mysql-stockage.sql`.

## 4. Copier les fichiers

1. Clic droit sur le `.zip`, **Propriétés**, cochez **Débloquer**, puis **OK**.
2. Clic droit, **Extraire tout…**, destination **`C:\inetpub\mcp-server`**. Vous devez obtenir `C:\inetpub\mcp-server\web.config`, `C:\inetpub\mcp-server\app\`, etc.
3. Créez le dossier **`C:\inetpub\mcp-server\logs`**.

## 5. Configurer (`.env.local`)

Copiez `env.windows.example` en **`.env.local`**, dans le même dossier, puis complétez-le dans le Bloc-notes :

| Variable | Valeur |
|---|---|
| `ENCRYPTION_KEY` | Générée avec `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. **Sauvegardez-la** à part : sans elle, les connexions enregistrées sont irrécupérables. |
| `ADMIN_PASSWORD` | Mot de passe long du **compte de secours** (identifiant `admin`). |
| `STORE_URL` | `mysql://mcp_server:MOT_DE_PASSE@127.0.0.1:3306/mcp_server`. Encodez les caractères spéciaux du mot de passe : `@` → `%40`, `#` → `%23`, `:` → `%3A`, `/` → `%2F`, `%` → `%25`. |
| `PUBLIC_BASE_URL` | `https://mcp.votre-domaine.com` (sans `/` final). |
| `CLIENT_IP_HEADER` | `x-forwarded-for` (valeur du modèle) : le module IIS y transmet l'IP du visiteur. |

`.env.local`, `app\` et `logs\` ne sont jamais servis par IIS : le `web.config` les bloque.

## 6. Créer le pool d'applications

Gestionnaire IIS → **Pools d'applications** → **Ajouter un pool d'applications…**
- **Nom** : `mcp-server`
- **Version du CLR .NET** : **Aucun code managé**
- **Mode pipeline** : Intégré

Puis sélectionnez le pool, ouvrez **Paramètres avancés…** et réglez :
- **Mode de démarrage** : `AlwaysRunning`
- **Délai d'inactivité (minutes)** : `0`, pour que Node ne soit pas arrêté après 20 minutes sans requête

## 7. Donner les droits au pool

Dans PowerShell administrateur, ou par *Propriétés → Sécurité* du dossier :

```powershell
icacls C:\inetpub\mcp-server /grant "IIS AppPool\mcp-server:(OI)(CI)RX"
icacls C:\inetpub\mcp-server\logs /grant "IIS AppPool\mcp-server:(OI)(CI)M"
```

Le pool doit pouvoir lire l'application et `.env.local`, et écrire dans `logs\`.

## 8. Créer le site

Gestionnaire IIS → **Sites** → **Ajouter un site web…**
- **Nom du site** : `mcp-server`, avec le **pool** `mcp-server`
- **Chemin d'accès physique** : `C:\inetpub\mcp-server`
- **Liaison** : type `https`, port `443`, **Nom d'hôte** `mcp.votre-domaine.com`, cochez **Exiger l'indication du nom du serveur (SNI)**, puis choisissez le **certificat SSL**

## 9. Vérifier

Depuis votre poste, ouvrez **`https://mcp.votre-domaine.com/api/health`**. La première requête démarre Node : comptez quelques secondes. La réponse attendue est :

```json
{"ok":true,"store":"mysql","ip":"<votre adresse IP>"}
```

- **`ip`** doit être votre adresse, pas `127.0.0.1` ni `inconnue`. Sinon, voir le dépannage.
- Ouvrez ensuite **`https://mcp.votre-domaine.com`** et connectez-vous avec `admin` et `ADMIN_PASSWORD`.
- Dans l'onglet **Utilisateurs**, invitez vos collègues et **nommez les administrateurs**.
- Créez enfin les connexions à vos bases : voir la section 6 de `README.md`, avec ses comptes en lecture seule, ses particularités SQL Server et les procédures pour Claude, ChatGPT et Copilot.

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| **HTTP 500.19** à l'ouverture du site | Module ASP.NET Core V2 absent | Installez le .NET Hosting Bundle, puis lancez `iisreset` |
| **HTTP 500.30 / 502.5** (échec de démarrage du processus) | `node.exe` introuvable, ou erreur au démarrage | Vérifiez `processPath` dans `web.config`, puis lisez le dernier `logs\stdout_*.log` |
| Aucun fichier dans `logs\` | Droits d'écriture manquants | Relancez la 2ᵉ commande `icacls` de l'étape 7 |
| `/api/health` → `"ok":false` | Stockage MySQL injoignable ou identifiants refusés | Le message `error` indique la cause. Corrigez `STORE_URL`, puis recyclez le pool |
| « Origine refusée » à la connexion | `PUBLIC_BASE_URL` différente de l'adresse utilisée | Corrigez `PUBLIC_BASE_URL`, puis recyclez le pool |
| « Enregistrer » ou « Supprimer » échouent (405) | WebDAV actif | Le `web.config` le retire. Vérifiez qu'il n'a pas été remplacé |
| `ip` vaut `127.0.0.1` ou `inconnue` | En-tête d'IP différent | Mettez `CLIENT_IP_HEADER=x-forwarded-for` dans `.env.local`, puis recyclez le pool |

Après **toute modification de `.env.local`**, recyclez le pool : Gestionnaire IIS → Pools d'applications → `mcp-server` → **Recycler**.

## Mettre à jour

1. Construisez le nouveau paquet sur le poste de développement : `npm run package:windows`.
2. Sur le serveur, extrayez-le dans un dossier temporaire, par exemple `C:\Temp\mcp-nouveau`.
3. **Mettez le site hors ligne** : copiez un fichier nommé **`app_offline.htm`** dans `C:\inetpub\mcp-server`. Il peut contenir le texte « Maintenance en cours ». IIS arrête alors Node et affiche ce fichier.
4. **Renommez** `C:\inetpub\mcp-server\app` en `app.ancien`, puis copiez le nouveau dossier `app` et le nouveau `launcher.cjs` à la place.
   - Ne remplacez `web.config` que si les notes de version l'indiquent, pour garder vos éventuelles adaptations.
   - **Ne touchez pas** à `.env.local` ni à `logs\`.
5. **Supprimez `app_offline.htm`** : IIS redémarre Node avec la nouvelle version.
6. Vérifiez `/api/health`. En cas de problème, remettez `app.ancien` à sa place, avec la même procédure. Sinon, supprimez-le.

**Sauvegardes** : sauvegardez la base MySQL `mcp_server` avec vos sauvegardes habituelles, **et** gardez `ENCRYPTION_KEY` à part. L'une ne sert à rien sans l'autre.
