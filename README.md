# Serveur MCP — Bases de données

Serveur [MCP](https://modelcontextprotocol.io) qui connecte une base **relationnelle** (PostgreSQL, MySQL/MariaDB, SQL Server) ou **NoSQL** (MongoDB, Redis) à Claude, ChatGPT, GitHub Copilot, Cursor et tout client compatible MCP.

Une interface web permet de saisir les paramètres de connexion, de tester la connexion et de générer une **URL MCP** à coller dans votre assistant.

## Fonctionnement

```
Interface web ──(paramètres)──▶ /api/connections/token ──▶ URL MCP : https://…/api/mcp/<jeton chiffré>
                                                                          │
Claude / ChatGPT / Copilot ──(Streamable HTTP)──────────────────────────▶ /api/mcp/<jeton>
                                                                          │ déchiffre le jeton,
                                                                          ▼ ouvre la connexion, exécute l'outil, ferme
                                                                     Votre base de données
```

- **Aucun stockage côté serveur** : les paramètres sont chiffrés (AES-256-GCM) dans le jeton de l'URL avec la clé `ENCRYPTION_KEY`. Il n'y a donc pas de base de données à gérer pour le serveur lui-même.
- **Transport Streamable HTTP sans état** : chaque requête est indépendante, ce qui convient aux fonctions serverless de Vercel et Netlify.
- **Lecture seule par défaut** : seuls les outils de lecture sont exposés. Les outils d'écriture n'apparaissent que si vous décochez « Lecture seule ».

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
cp .env.example .env.local   # puis renseignez ENCRYPTION_KEY et ADMIN_PASSWORD
npm run dev                   # http://localhost:3000
```

Pour générer une clé :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Pour tester l'endpoint MCP sans assistant : `npx @modelcontextprotocol/inspector`, transport « Streamable HTTP », en collant l'URL générée.

## Déploiement

### Variables d'environnement

| Variable | Obligatoire | Rôle |
|---|---|---|
| `ENCRYPTION_KEY` | oui | Clé de chiffrement des jetons (16 caractères minimum, 32+ aléatoires recommandés). **La changer invalide toutes les URL émises.** |
| `ADMIN_PASSWORD` | fortement recommandé | Exigé par l'interface pour tester une connexion ou générer une URL. Sans lui, n'importe qui peut utiliser votre déploiement pour se connecter à des bases arbitraires. |
| `PUBLIC_BASE_URL` | non | Domaine utilisé dans les URL générées (sinon déduit de la requête). |

### Vercel

1. Poussez le projet sur GitHub, GitLab ou Bitbucket.
2. Sur [vercel.com/new](https://vercel.com/new), importez le dépôt. Next.js est détecté automatiquement.
3. Dans **Settings → Environment Variables**, ajoutez `ENCRYPTION_KEY` et `ADMIN_PASSWORD`, puis redéployez.

En ligne de commande : `npx vercel` puis `npx vercel env add ENCRYPTION_KEY` et `npx vercel --prod`.

### Netlify

1. Sur [app.netlify.com](https://app.netlify.com), choisissez **Add new site → Import an existing project** et sélectionnez le dépôt. Le fichier `netlify.toml` et le runtime Next.js sont pris en charge automatiquement.
2. Dans **Site configuration → Environment variables**, ajoutez `ENCRYPTION_KEY` et `ADMIN_PASSWORD`, puis redéployez.

> Netlify limite par défaut la durée des fonctions synchrones à environ 10 s, contre 60 s configurées ici pour Vercel. Les requêtes longues peuvent donc expirer sur Netlify.

### Accès réseau à la base

La base doit être **joignable depuis Internet**, car `localhost` désigne la fonction serverless et non votre machine. Les IP sortantes de Vercel et Netlify sont dynamiques. Si votre pare-feu filtre par IP, autorisez `0.0.0.0/0` en imposant SSL et un mot de passe fort, ou utilisez une offre d'IP fixe ou un tunnel.

## Ajouter le serveur à votre assistant

Après avoir généré l'URL dans l'interface, l'onglet de chaque client affiche la procédure et l'extrait de configuration prêt à copier.

| Client | Procédure |
|---|---|
| **Claude** (claude.ai, Desktop) | Paramètres → Connecteurs → Ajouter un connecteur personnalisé → coller l'URL |
| **ChatGPT** | Paramètres → Applications et connecteurs → Paramètres avancés → Mode développeur → Créer → URL, authentification « Aucune » |
| **GitHub Copilot (VS Code)** | `.vscode/mcp.json` : `{"servers": {"ma-base": {"type": "http", "url": "<URL>"}}}`, puis Copilot Chat en mode Agent |
| **Copilot Studio** | Outils → Ajouter un outil → Model Context Protocol → coller l'URL |
| **Claude Code** | `claude mcp add --transport http ma-base "<URL>"` |
| **Cursor** | `~/.cursor/mcp.json` : `{"mcpServers": {"ma-base": {"url": "<URL>"}}}` |
| Clients stdio uniquement | `npx -y mcp-remote "<URL>"` |

Les menus des clients évoluent souvent. Si un intitulé a changé, cherchez « connecteur personnalisé » ou « serveur MCP ».

## Sécurité

- **L'URL MCP est un secret** : quiconque la possède peut interroger la base avec les droits configurés. Ne la partagez pas et préférez une expiration (option « Expiration de l'URL »).
- Pour **révoquer** une URL, changez le mot de passe de l'utilisateur de base concerné. Pour toutes les révoquer d'un coup, changez `ENCRYPTION_KEY`.
- Le chemin de l'URL, qui contient le jeton chiffré, peut apparaître dans les journaux d'accès de l'hébergeur. Le jeton est chiffré, mais il reste utilisable tel quel.
- Option SSL : le certificat du serveur n'est pas vérifié (`rejectUnauthorized: false`), pour rester compatible avec les bases hébergées qui utilisent une autorité de certification privée. Le trafic reste chiffré.

## Structure

```
app/
  page.tsx                       Interface de configuration
  api/mcp/[token]/route.ts       Endpoint MCP (Streamable HTTP, sans état)
  api/connections/test/route.ts  Test de connexion
  api/connections/token/route.ts Génération de l'URL MCP
  api/status/route.ts            État de la configuration du serveur
lib/
  config.ts                      Schéma des paramètres de connexion
  crypto.ts                      Chiffrement/déchiffrement des jetons
  sql-guard.ts                   Garde-fou SQL pour la lecture seule
  mcp/server.ts                  Définition des outils MCP
  drivers/                       Pilotes SQL, MongoDB et Redis
```
"# serveurMCP_SOLID" 
