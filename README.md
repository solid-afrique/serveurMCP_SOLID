# Serveur MCP — Bases de données

Serveur [MCP](https://modelcontextprotocol.io) qui connecte une base **relationnelle** (PostgreSQL, MySQL/MariaDB, SQL Server) ou **NoSQL** (MongoDB, Redis) à Claude, ChatGPT, GitHub Copilot, Cursor et tout client compatible MCP.

Une interface web permet d'enregistrer des connexions, de les tester et d'obtenir pour chacune une **URL MCP** à ajouter dans votre assistant. Elle distingue l'**administrateur**, qui gère tout, des **utilisateurs**, qui n'accèdent qu'à leurs connexions. Chaque assistant doit être **autorisé par OAuth** avec le compte de la personne qui l'utilise. Les accès sont révocables à tout moment.

## Fonctionnement

```
 Interface d'administration ──▶ Registre (Redis) : connexions chiffrées (AES-256-GCM)
                                         │
 URL MCP : https://…/api/mcp/<id>        │  (l'identifiant n'est pas un secret)
                                         ▼
 Assistant ──▶ /api/mcp/<id> ──401──▶ découverte OAuth ──▶ page d'autorisation (identifiant + mot de passe)
          ◀── jeton d'accès (1 h) + jeton de rafraîchissement (30 j) ◀──┘
          ──▶ /api/mcp/<id> + Bearer ──▶ ouvre la connexion, exécute l'outil, ferme ──▶ Votre base
```

- **L'URL MCP n'est pas un secret** : sans autorisation accordée par un compte ayant accès à la connexion, elle ne donne accès à rien.
- **Les identifiants des bases** sont chiffrés au repos avec `ENCRYPTION_KEY`. Ils ne sont jamais renvoyés au navigateur et n'apparaissent ni dans les URL ni dans les journaux.
- **Transport Streamable HTTP sans état** : adapté aux fonctions serverless de Vercel et Netlify.
- **Lecture seule par défaut** : les outils d'écriture n'apparaissent que si vous décochez « Lecture seule ».

## Administrateur et utilisateurs

| | Administrateur | Utilisateur |
|---|---|---|
| **Compte** | Défini par les variables d'environnement `ADMIN_EMAIL` (« admin » par défaut) et `ADMIN_PASSWORD` | Créé par l'administrateur et activé via un lien d'invitation |
| **Connexions visibles** | Toutes | Ses connexions privées et celles que l'administrateur lui attribue |
| **Créer une connexion** | Oui (attribuable à des utilisateurs) | Oui, privée : visible de lui seul et de l'administrateur |
| **Modifier / supprimer** | Toutes les connexions | Ses connexions privées uniquement |
| **Voir la configuration** (hôte, utilisateur…) | Toutes | Ses connexions privées uniquement. Les mots de passe ne sont jamais renvoyés au navigateur. |
| **Attribuer une connexion** | Oui, à un ou plusieurs utilisateurs (les connexions privées ne sont pas partageables) | Non |
| **Gérer les comptes** | Inviter, réinitialiser un mot de passe, désactiver, réactiver, supprimer | Changer son propre mot de passe |
| **Autoriser un assistant** | Sur n'importe quelle connexion | Sur les connexions auxquelles il a accès |

### Cycle de vie d'un compte

1. L'administrateur crée le compte (e-mail et nom) et obtient un **lien d'invitation** à usage unique, valable 7 jours. Il le transmet à l'utilisateur par un canal de confiance. Aucun e-mail n'est envoyé par le serveur.
2. L'utilisateur ouvre le lien, choisit son mot de passe (10 caractères minimum) et se retrouve connecté.
3. En cas d'oubli, l'administrateur génère un **lien de réinitialisation** sur le même principe.
4. **Désactiver** un compte ferme immédiatement ses sessions et coupe les accès de tous ses assistants. **Supprimer** un compte supprime aussi ses connexions privées.

## Gestion des accès

Depuis l'interface, chaque connexion affiche les assistants autorisés (et pour quel utilisateur) ainsi que sa dernière utilisation :

| Action | Qui | Effet | L'URL MCP change-t-elle ? |
|---|---|---|---|
| **Gérer l'accès** | Administrateur | Choisit les utilisateurs qui peuvent utiliser la connexion. Retirer quelqu'un coupe immédiatement ses assistants. | Non |
| **Modifier** | Admin ou propriétaire | Change les paramètres (nouveau mot de passe de base, hôte, lecture seule…). Un champ secret laissé vide est conservé. | Non. Les assistants continuent de fonctionner. |
| **Révoquer les accès** | Admin ou propriétaire | Invalide immédiatement les jetons de tous les assistants, qui devront se ré-autoriser. | Non |
| **Déconnecter mes assistants** | Utilisateur attribué | Révoque uniquement ses propres assistants. | Non |
| **Supprimer** | Admin ou propriétaire | Supprime la connexion et tous ses accès. | L'URL ne fonctionne plus. |

À chaque requête MCP, le serveur revérifie que la personne qui a autorisé l'assistant a un compte actif et a toujours accès à la connexion.

Les autorisations non utilisées pendant 30 jours expirent automatiquement. Une connexion peut aussi recevoir une date d'expiration à sa création.

## Outils exposés à l'IA

| Base | Lecture | Écriture (si lecture seule désactivée) |
|---|---|---|
| PostgreSQL, MySQL, SQL Server | `connection_info`, `list_tables`, `describe_table`, `run_query` | `execute_statement` |
| MongoDB | `connection_info`, `list_databases`, `list_collections`, `describe_collection` (schéma déduit + index), `find`, `count_documents`, `aggregate` | `insert_documents`, `update_documents`, `delete_documents` (`aggregate` accepte aussi `$out`/`$merge`) |
| Redis | `connection_info`, `scan_keys`, `get_key`, `server_info`, `run_command` (liste blanche de commandes de lecture) | `run_command` sans restriction (hors commandes dangereuses comme `SHUTDOWN` ou `MONITOR`) |

Les résultats sont limités à « Lignes max. par réponse » (200 par défaut, 5 000 au maximum).

### Protections en lecture seule

- **PostgreSQL / MySQL** : la requête est exécutée dans une transaction `READ ONLY` puis annulée. Un analyseur refuse en plus les instructions multiples et les mots-clés d'écriture (`INSERT`, `DELETE`, `INTO`, `pg_sleep`…).
- **SQL Server** : il n'existe pas de transaction en lecture seule. On applique le même analyseur et on exécute dans une transaction systématiquement annulée.
- **MongoDB** : seules les opérations de lecture sont exposées, et les étapes `$out`/`$merge` sont refusées.
- **Redis** : seules les commandes d'une liste blanche sont acceptées.

> Ces garde-fous ne remplacent pas les droits de la base. **Utilisez un utilisateur de base qui n'a que les droits de lecture** pour les connexions en lecture seule.

## Développement local

```bash
npm install
cp .env.example .env.local   # renseignez ENCRYPTION_KEY et ADMIN_PASSWORD (REDIS_URL facultatif en local)
npm run dev                   # http://localhost:3000, identifiant « admin »
```

Sans `REDIS_URL`, le stockage se fait en mémoire et se vide à chaque redémarrage. Pour un Redis local : `docker run -d -p 6379:6379 redis:7-alpine` puis `REDIS_URL=redis://localhost:6379`.

Pour générer une clé :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Pour tester sans assistant, lancez `npx @modelcontextprotocol/inspector` : transport « Streamable HTTP », URL MCP, puis bouton d'authentification OAuth.

## Déploiement

### Variables d'environnement

| Variable | Obligatoire | Rôle |
|---|---|---|
| `ENCRYPTION_KEY` | oui | Chiffrement des paramètres de connexion stockés (32 caractères aléatoires ou plus recommandés). **La changer rend illisibles les connexions enregistrées.** |
| `ADMIN_PASSWORD` | oui | Mot de passe du compte administrateur. Choisissez-le long. |
| `ADMIN_EMAIL` | non | Identifiant de connexion de l'administrateur (« admin » par défaut). |
| `REDIS_URL` (ou `KV_URL`) | oui en production | Redis de stockage : connexions, comptes utilisateurs, jetons OAuth. |
| `PUBLIC_BASE_URL` | non | URL publique, utile avec un domaine personnalisé ou derrière un proxy. |

### Redis de stockage (Upstash, offre gratuite)

- **Vercel** : **Storage → Create Database → Upstash for Redis**, puis liez-la au projet. `REDIS_URL` / `KV_URL` sont ajoutées automatiquement.
- **Netlify ou autre** : créez une base sur [console.upstash.com](https://console.upstash.com), copiez l'URL `rediss://…` (onglet *Connect*, protocole Redis/TCP), puis ajoutez-la en `REDIS_URL`.

N'importe quel Redis 6.2+ accessible depuis Internet convient (Redis Cloud, Aiven…).

### Vercel

1. Sur [vercel.com/new](https://vercel.com/new), importez le dépôt. Next.js est détecté automatiquement.
2. Ajoutez la base Upstash (voir ci-dessus), puis `ENCRYPTION_KEY` et `ADMIN_PASSWORD` dans **Settings → Environment Variables**.
3. Redéployez.

### Netlify

1. Sur [app.netlify.com](https://app.netlify.com), choisissez **Add new site → Import an existing project**. Le fichier `netlify.toml` et le runtime Next.js sont pris en charge.
2. Dans **Site configuration → Environment variables**, ajoutez `ENCRYPTION_KEY`, `ADMIN_PASSWORD` et `REDIS_URL`.
3. Redéployez.

> Netlify limite par défaut la durée des fonctions synchrones à environ 10 s, contre 60 s configurées ici pour Vercel. Les requêtes longues peuvent donc expirer sur Netlify.

### Accès réseau à la base

La base doit être **joignable depuis Internet**, car `localhost` désigne la fonction serverless et non votre machine. Les IP sortantes de Vercel et Netlify sont dynamiques. Si votre pare-feu filtre par IP, autorisez `0.0.0.0/0` en imposant SSL et un mot de passe fort, ou utilisez une offre d'IP fixe ou un tunnel.

## Ajouter le serveur à votre assistant

Après la création d'une connexion, l'interface affiche la procédure et la configuration à copier pour chaque client. Dans tous les cas, l'assistant ouvre la **page d'autorisation** de ce serveur. Chacun s'y connecte avec **son propre compte** : l'accès accordé est lié à cette personne.

| Client | Procédure |
|---|---|
| **Claude** (claude.ai, Desktop) | Paramètres → Connecteurs → Ajouter un connecteur personnalisé → URL → **Se connecter** |
| **ChatGPT** | Paramètres → Applications et connecteurs → Paramètres avancés → Mode développeur → Créer → URL, authentification **OAuth** |
| **GitHub Copilot (VS Code)** | `.vscode/mcp.json` : `{"servers": {"ma-base": {"type": "http", "url": "<URL>"}}}`. VS Code ouvre l'autorisation au démarrage. |
| **Copilot Studio** | Outils → Ajouter un outil → Model Context Protocol → URL, OAuth 2.0 avec enregistrement dynamique |
| **Claude Code** | `claude mcp add --transport http ma-base "<URL>"`, puis `/mcp` → Authenticate |
| **Cursor** | `~/.cursor/mcp.json` : `{"mcpServers": {"ma-base": {"url": "<URL>"}}}`, puis **Login** |
| Clients stdio uniquement | `npx -y mcp-remote "<URL>"` (gère l'autorisation via le navigateur) |

Les menus des clients évoluent souvent. Si un intitulé a changé, cherchez « connecteur personnalisé » ou « serveur MCP ».

## Sécurité

- **OAuth 2.1** : enregistrement dynamique des clients (RFC 7591), code d'autorisation avec PKCE S256 obligatoire, jetons liés à une connexion précise (RFC 8707), jetons d'accès d'une heure, jetons de rafraîchissement de 30 jours avec rotation. Les jetons ne sont stockés que sous forme d'empreinte SHA-256.
- **Consentement** : l'identifiant et le mot de passe sont exigés à chaque autorisation. Une page malveillante ne peut donc pas forcer un accord. La page ne peut pas être affichée dans une iframe.
- **Mots de passe des utilisateurs** : hachés avec scrypt (sel aléatoire). Les messages d'erreur ne révèlent pas si un compte existe. Les liens d'invitation ne sont stockés que sous forme d'empreinte.
- **Force brute** : blocage pendant 15 minutes après 10 échecs depuis une même IP, ou 100 échecs au total. Contrepartie : une attaque massive peut bloquer temporairement votre propre connexion.
- **Sessions** : cookie `HttpOnly` / `SameSite=Strict` de 12 heures. Les sessions d'un utilisateur sont fermées dès qu'il change de mot de passe ou que son compte est désactivé. Les requêtes d'une autre origine sont refusées.
- **En cas de doute** : « Révoquer les accès » sur la connexion concernée, ou désactivez le compte compromis. Si le mot de passe administrateur a fuité, changez `ADMIN_PASSWORD`, puis révoquez les accès de chaque connexion.
- **Utilisateurs et réseau** : un utilisateur peut créer des connexions privées, donc faire se connecter le serveur à n'importe quel hôte joignable. N'invitez que des personnes de confiance.
- **Option SSL** : le certificat de la base n'est pas vérifié (`rejectUnauthorized: false`), pour rester compatible avec les bases hébergées qui utilisent une autorité de certification privée. Le trafic reste chiffré.

## Structure

```
app/
  page.tsx                              Interface (connexion, onglets selon le rôle)
  _components/                          Connexions, utilisateurs, compte, formulaire, guide par assistant
  invitation/[token]/                   Choix du mot de passe (invitation / réinitialisation)
  oauth/authorize/                      Page de consentement OAuth
  api/mcp/[id]/route.ts                 Endpoint MCP (Streamable HTTP, protégé par jeton Bearer)
  api/auth/session/route.ts             Connexion / déconnexion
  api/account/…                         Invitation, changement de mot de passe
  api/connections/…                     Connexions (selon les droits), attribution, révocation, test
  api/admin/users/…                     Gestion des utilisateurs (administrateur)
  api/oauth/…                           Métadonnées, enregistrement, autorisation, jetons, révocation
lib/
  config.ts                             Schéma des paramètres de connexion
  connections.ts                        Registre des connexions, droits d'accès et autorisations
  oauth.ts                              Serveur d'autorisation OAuth
  auth.ts                               Authentification, sessions, protections
  users.ts                              Comptes utilisateurs, mots de passe, invitations
  store.ts                              Stockage Redis (ou mémoire en développement)
  crypto.ts                             Chiffrement, jetons, empreintes
  sql-guard.ts                          Garde-fou SQL pour la lecture seule
  mcp/server.ts                         Définition des outils MCP
  drivers/                              Pilotes SQL, MongoDB et Redis
```
