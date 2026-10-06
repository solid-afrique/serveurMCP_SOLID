import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DB_LABELS, displayName, type ConnectionConfig } from "../config";
import { safely } from "../format";
import {
  PLACEHOLDER_HINT,
  describeTable,
  listTables,
  runQuery,
  serverVersion,
  withSql,
} from "../drivers/sql";
import {
  assertReadOnlyPipeline,
  fromEjson,
  inferSchema,
  maxTimeMS,
  toEjson,
  withMongo,
} from "../drivers/mongo";
import { BLOCKED_COMMANDS, READ_COMMANDS, readKey, withRedis } from "../drivers/redis";
import type { SqlDialect } from "../sql-guard";

const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

const jsonObject = z.record(z.string(), z.unknown());

function instructions(cfg: ConnectionConfig): string {
  return [
    `Ce serveur MCP donne accès à la base « ${displayName(cfg)} » (${DB_LABELS[cfg.type]}).`,
    cfg.readOnly
      ? "La connexion est en LECTURE SEULE : toute tentative d'écriture sera refusée."
      : "La connexion autorise les écritures : demandez confirmation à l'utilisateur avant toute modification.",
    `Les résultats sont limités à ${cfg.maxRows} lignes/documents par appel.`,
    "Commencez par explorer la structure (liste des tables/collections, description) avant d'écrire des requêtes.",
  ].join("\n");
}

export function buildServer(cfg: ConnectionConfig): McpServer {
  const server = new McpServer(
    { name: "mcp-db-server", title: `Base de données — ${displayName(cfg)}`, version: "1.0.0" },
    { instructions: instructions(cfg) },
  );

  server.registerTool(
    "connection_info",
    {
      title: "Informations de connexion",
      description: "Renvoie le type de base, le nom de la connexion, le mode (lecture seule ou non) et la version du serveur.",
      inputSchema: {},
      annotations: READ,
    },
    () =>
      safely(async () => ({
        name: displayName(cfg),
        type: DB_LABELS[cfg.type],
        database: cfg.database ?? null,
        readOnly: cfg.readOnly,
        maxRows: cfg.maxRows,
        serverVersion: await pingVersion(cfg),
      })),
  );

  if (cfg.type === "mongodb") registerMongoTools(server, cfg);
  else if (cfg.type === "redis") registerRedisTools(server, cfg);
  else registerSqlTools(server, cfg, cfg.type);

  return server;
}

/** Vérifie la connexion et renvoie la version du serveur. */
export async function pingVersion(cfg: ConnectionConfig): Promise<string> {
  switch (cfg.type) {
    case "mongodb":
      return withMongo(cfg, async (client) => {
        const info = await client.db("admin").command({ buildInfo: 1 });
        return `MongoDB ${info.version}`;
      });
    case "redis":
      return withRedis(cfg, async (client) => {
        const info = await client.info("server");
        return `Redis ${info.match(/redis_version:(\S+)/)?.[1] ?? "?"}`;
      });
    default:
      return withSql(cfg, serverVersion);
  }
}

/* --------------------------------- SQL --------------------------------- */

function registerSqlTools(server: McpServer, cfg: ConnectionConfig, dialect: SqlDialect) {
  const params = z
    .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional()
    .describe(`Valeurs des paramètres de la requête. ${PLACEHOLDER_HINT[dialect]}`);

  server.registerTool(
    "list_tables",
    {
      title: "Lister les tables",
      description: "Liste les tables et vues de la base (schéma, nom, type).",
      inputSchema: { schema: z.string().optional().describe("Filtrer sur un schéma précis") },
      annotations: READ,
    },
    ({ schema }) => safely(() => withSql(cfg, (s) => listTables(s, schema))),
  );

  server.registerTool(
    "describe_table",
    {
      title: "Décrire une table",
      description: "Renvoie les colonnes (type, nullabilité, défaut) et les clés primaires/étrangères/uniques d'une table.",
      inputSchema: {
        table: z.string().describe("Nom de la table"),
        schema: z.string().optional().describe("Schéma de la table (optionnel)"),
      },
      annotations: READ,
    },
    ({ table, schema }) => safely(() => withSql(cfg, (s) => describeTable(s, table, schema))),
  );

  server.registerTool(
    "run_query",
    {
      title: "Exécuter une requête de lecture",
      description:
        `Exécute UNE requête SQL de lecture (SELECT, WITH, SHOW, EXPLAIN…) sur ${DB_LABELS[dialect]} ` +
        `et renvoie au plus ${cfg.maxRows} lignes. Utilisez des paramètres plutôt que de concaténer des valeurs.`,
      inputSchema: { sql: z.string().describe("Requête SQL"), params },
      annotations: READ,
    },
    ({ sql, params: values }) =>
      safely(() => withSql(cfg, (s) => runQuery(s, sql, values ?? [], { readOnly: true, maxRows: cfg.maxRows }))),
  );

  if (!cfg.readOnly) {
    server.registerTool(
      "execute_statement",
      {
        title: "Exécuter une instruction d'écriture",
        description:
          "Exécute une instruction SQL qui modifie la base (INSERT, UPDATE, DELETE, CREATE, ALTER…). " +
          "Demandez toujours confirmation à l'utilisateur avant de l'appeler.",
        inputSchema: { sql: z.string().describe("Instruction SQL"), params },
        annotations: WRITE,
      },
      ({ sql, params: values }) =>
        safely(() => withSql(cfg, (s) => runQuery(s, sql, values ?? [], { readOnly: false, maxRows: cfg.maxRows }))),
    );
  }
}

/* ------------------------------- MongoDB ------------------------------- */

function registerMongoTools(server: McpServer, cfg: ConnectionConfig) {
  const database = z.string().optional().describe("Base de données (par défaut : celle de la connexion)");
  const collection = z.string().describe("Nom de la collection");
  const filter = jsonObject.optional().describe('Filtre MongoDB (Extended JSON accepté, ex. {"_id": {"$oid": "…"}})');

  server.registerTool(
    "list_databases",
    {
      title: "Lister les bases",
      description: "Liste les bases de données accessibles sur le serveur MongoDB.",
      inputSchema: {},
      annotations: READ,
    },
    () =>
      safely(() =>
        withMongo(cfg, async (client) => {
          const res = await client.db("admin").admin().listDatabases({ nameOnly: true });
          return res.databases.map((d) => d.name);
        }),
      ),
  );

  server.registerTool(
    "list_collections",
    {
      title: "Lister les collections",
      description: "Liste les collections (et vues) d'une base MongoDB.",
      inputSchema: { database },
      annotations: READ,
    },
    ({ database: dbName }) =>
      safely(() =>
        withMongo(cfg, async (_c, db) => {
          const d = db(dbName);
          const cols = await d.listCollections({}, { nameOnly: false }).toArray();
          return { database: d.databaseName, collections: cols.map((c) => ({ name: c.name, type: c.type })) };
        }),
      ),
  );

  server.registerTool(
    "describe_collection",
    {
      title: "Décrire une collection",
      description:
        "Déduit le schéma d'une collection à partir d'un échantillon de documents, et renvoie ses index et le nombre estimé de documents.",
      inputSchema: {
        collection,
        database,
        sampleSize: z.number().int().min(1).max(500).optional().describe("Taille de l'échantillon (défaut 50)"),
      },
      annotations: READ,
    },
    ({ collection: name, database: dbName, sampleSize }) =>
      safely(() =>
        withMongo(cfg, async (_c, db) => {
          const coll = db(dbName).collection(name);
          const [docs, indexes, count] = await Promise.all([
            coll.aggregate([{ $sample: { size: sampleSize ?? 50 } }], { maxTimeMS }).toArray(),
            coll.indexes(),
            coll.estimatedDocumentCount({ maxTimeMS }),
          ]);
          return {
            collection: name,
            estimatedCount: count,
            sampled: docs.length,
            fields: inferSchema(docs),
            indexes: indexes.map((i) => ({ name: i.name, key: i.key, unique: i.unique ?? false })),
            example: docs[0] ? toEjson(docs[0]) : null,
          };
        }),
      ),
  );

  server.registerTool(
    "find",
    {
      title: "Rechercher des documents",
      description: `Recherche des documents dans une collection (au plus ${cfg.maxRows}).`,
      inputSchema: {
        collection,
        filter,
        projection: jsonObject.optional().describe('Projection, ex. {"name": 1, "_id": 0}'),
        sort: jsonObject.optional().describe('Tri, ex. {"createdAt": -1}'),
        limit: z.number().int().min(1).optional(),
        skip: z.number().int().min(0).optional(),
        database,
      },
      annotations: READ,
    },
    (args) =>
      safely(() =>
        withMongo(cfg, async (_c, db) => {
          const limit = Math.min(args.limit ?? cfg.maxRows, cfg.maxRows);
          const docs = await db(args.database)
            .collection(args.collection)
            .find(fromEjson(args.filter), {
              projection: args.projection,
              sort: args.sort as Record<string, 1 | -1>,
              skip: args.skip,
              limit,
              maxTimeMS,
            })
            .toArray();
          return { count: docs.length, documents: toEjson(docs) };
        }),
      ),
  );

  server.registerTool(
    "count_documents",
    {
      title: "Compter des documents",
      description: "Compte les documents correspondant à un filtre.",
      inputSchema: { collection, filter, database },
      annotations: READ,
    },
    (args) =>
      safely(() =>
        withMongo(cfg, async (_c, db) => ({
          count: await db(args.database).collection(args.collection).countDocuments(fromEjson(args.filter), { maxTimeMS }),
        })),
      ),
  );

  server.registerTool(
    "aggregate",
    {
      title: "Pipeline d'agrégation",
      description:
        `Exécute un pipeline d'agrégation et renvoie au plus ${cfg.maxRows} documents.` +
        (cfg.readOnly ? " Les étapes $out et $merge sont interdites." : ""),
      inputSchema: {
        collection,
        pipeline: z.array(jsonObject).describe("Étapes du pipeline (Extended JSON accepté)"),
        database,
      },
      annotations: cfg.readOnly ? READ : WRITE,
    },
    (args) =>
      safely(() =>
        withMongo(cfg, async (_c, db) => {
          const pipeline = args.pipeline.map((stage) => fromEjson(stage));
          if (cfg.readOnly) assertReadOnlyPipeline(pipeline);
          const writes = pipeline.some((s) => "$out" in s || "$merge" in s);
          const docs = await db(args.database)
            .collection(args.collection)
            .aggregate(writes ? pipeline : [...pipeline, { $limit: cfg.maxRows }], { maxTimeMS })
            .toArray();
          return { count: docs.length, documents: toEjson(docs) };
        }),
      ),
  );

  if (cfg.readOnly) return;

  server.registerTool(
    "insert_documents",
    {
      title: "Insérer des documents",
      description: "Insère un ou plusieurs documents. Demandez confirmation à l'utilisateur avant l'appel.",
      inputSchema: { collection, documents: z.array(jsonObject).min(1), database },
      annotations: WRITE,
    },
    (args) =>
      safely(() =>
        withMongo(cfg, async (_c, db) => {
          const res = await db(args.database)
            .collection(args.collection)
            .insertMany(args.documents.map((d) => fromEjson(d)));
          return { insertedCount: res.insertedCount, insertedIds: toEjson(Object.values(res.insertedIds)) };
        }),
      ),
  );

  server.registerTool(
    "update_documents",
    {
      title: "Modifier des documents",
      description:
        "Met à jour les documents correspondant au filtre (opérateurs $set, $inc…). Demandez confirmation avant l'appel.",
      inputSchema: {
        collection,
        filter: jsonObject.describe("Filtre (obligatoire)"),
        update: jsonObject.describe('Mise à jour, ex. {"$set": {"status": "done"}}'),
        many: z.boolean().optional().describe("true pour modifier tous les documents correspondants"),
        upsert: z.boolean().optional(),
        database,
      },
      annotations: WRITE,
    },
    (args) =>
      safely(() =>
        withMongo(cfg, async (_c, db) => {
          const coll = db(args.database).collection(args.collection);
          const opts = { upsert: args.upsert ?? false };
          const res = args.many
            ? await coll.updateMany(fromEjson(args.filter), fromEjson(args.update), opts)
            : await coll.updateOne(fromEjson(args.filter), fromEjson(args.update), opts);
          return { matched: res.matchedCount, modified: res.modifiedCount, upserted: res.upsertedCount };
        }),
      ),
  );

  server.registerTool(
    "delete_documents",
    {
      title: "Supprimer des documents",
      description: "Supprime les documents correspondant au filtre. Demandez confirmation avant l'appel.",
      inputSchema: {
        collection,
        filter: jsonObject.describe("Filtre (obligatoire, {} interdit)"),
        many: z.boolean().optional().describe("true pour supprimer tous les documents correspondants"),
        database,
      },
      annotations: WRITE,
    },
    (args) =>
      safely(() =>
        withMongo(cfg, async (_c, db) => {
          if (Object.keys(args.filter).length === 0) throw new Error("Un filtre vide supprimerait toute la collection.");
          const coll = db(args.database).collection(args.collection);
          const res = args.many
            ? await coll.deleteMany(fromEjson(args.filter))
            : await coll.deleteOne(fromEjson(args.filter));
          return { deleted: res.deletedCount };
        }),
      ),
  );
}

/* -------------------------------- Redis -------------------------------- */

function registerRedisTools(server: McpServer, cfg: ConnectionConfig) {
  server.registerTool(
    "scan_keys",
    {
      title: "Parcourir les clés",
      description: `Parcourt les clés avec SCAN (sans bloquer le serveur) et renvoie au plus ${cfg.maxRows} clés.`,
      inputSchema: {
        pattern: z.string().optional().describe("Motif glob, ex. user:* (défaut *)"),
        type: z.enum(["string", "hash", "list", "set", "zset", "stream"]).optional().describe("Filtrer par type"),
      },
      annotations: READ,
    },
    ({ pattern, type }) =>
      safely(() =>
        withRedis(cfg, async (client) => {
          const keys = new Set<string>();
          let cursor = "0";
          let rounds = 0;
          do {
            const args: (string | number)[] = [cursor, "MATCH", pattern ?? "*", "COUNT", 500];
            if (type) args.push("TYPE", type);
            const [next, batch] = (await client.call("SCAN", ...args)) as [string, string[]];
            batch.forEach((k) => keys.add(k));
            cursor = next;
            rounds += 1;
          } while (cursor !== "0" && keys.size < cfg.maxRows && rounds < 200);
          const list = [...keys].slice(0, cfg.maxRows);
          return { count: list.length, complete: cursor === "0" && keys.size <= cfg.maxRows, keys: list };
        }),
      ),
  );

  server.registerTool(
    "get_key",
    {
      title: "Lire une clé",
      description: "Lit une clé quel que soit son type (string, hash, list, set, zset, stream, JSON) avec son TTL.",
      inputSchema: { key: z.string() },
      annotations: READ,
    },
    ({ key }) => safely(() => withRedis(cfg, (client) => readKey(client, key, cfg.maxRows))),
  );

  server.registerTool(
    "server_info",
    {
      title: "Informations serveur",
      description: "Renvoie la sortie de INFO (section optionnelle) et le nombre de clés de la base.",
      inputSchema: { section: z.string().optional().describe("Ex. server, memory, keyspace, stats") },
      annotations: READ,
    },
    ({ section }) =>
      safely(() =>
        withRedis(cfg, async (client) => {
          const info = section ? await client.info(section) : await client.info();
          return `dbsize: ${await client.dbsize()}\n\n${info}`;
        }),
      ),
  );

  server.registerTool(
    "run_command",
    {
      title: "Exécuter une commande Redis",
      description: cfg.readOnly
        ? "Exécute une commande Redis de lecture (GET, HGETALL, ZRANGE, XRANGE, JSON.GET, FT.SEARCH…)."
        : "Exécute une commande Redis arbitraire. Demandez confirmation à l'utilisateur avant toute commande d'écriture.",
      inputSchema: {
        command: z.string().describe("Nom de la commande, ex. HGETALL"),
        args: z.array(z.union([z.string(), z.number()])).optional().describe("Arguments de la commande"),
      },
      annotations: cfg.readOnly ? READ : WRITE,
    },
    ({ command, args }) =>
      safely(() =>
        withRedis(cfg, async (client) => {
          const name = command.trim().toUpperCase();
          if (BLOCKED_COMMANDS.has(name)) throw new Error(`La commande ${name} est bloquée sur ce serveur.`);
          if (cfg.readOnly && !READ_COMMANDS.has(name)) {
            throw new Error(`La commande ${name} n'est pas autorisée en lecture seule.`);
          }
          return client.call(name, ...(args ?? []).map(String));
        }),
      ),
  );
}
