import { BSON, MongoClient, type Db, type Document } from "mongodb";
import type { ConnectionConfig } from "../config";

const { EJSON } = BSON;
const MAX_TIME_MS = 30_000;

function buildUri(cfg: ConnectionConfig): string {
  if (cfg.connectionString) return cfg.connectionString;
  const auth = cfg.user
    ? `${encodeURIComponent(cfg.user)}${cfg.password ? `:${encodeURIComponent(cfg.password)}` : ""}@`
    : "";
  return `mongodb://${auth}${cfg.host}${cfg.port ? `:${cfg.port}` : ""}/`;
}

export async function withMongo<T>(
  cfg: ConnectionConfig,
  fn: (client: MongoClient, db: (name?: string) => Db) => Promise<T>,
): Promise<T> {
  const client = new MongoClient(buildUri(cfg), {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    maxPoolSize: 1,
    appName: "mcp-db-server",
    ...(cfg.ssl ? { tls: true } : {}),
  });
  await client.connect();
  try {
    return await fn(client, (name) => client.db(name || cfg.database || undefined));
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** Convertit l'entrée JSON (Extended JSON accepté : {"$oid": …}, {"$date": …}) en BSON. */
export function fromEjson<T = Document>(value: unknown): T {
  return EJSON.deserialize((value ?? {}) as Document, { relaxed: true }) as T;
}

/** Convertit un résultat BSON en JSON lisible (ObjectId → {"$oid"}, dates ISO…). */
export function toEjson(value: unknown): unknown {
  return EJSON.serialize(value as Document, { relaxed: true });
}

export const maxTimeMS = MAX_TIME_MS;

const WRITE_STAGES = new Set(["$out", "$merge"]);

export function assertReadOnlyPipeline(pipeline: Document[]): void {
  for (const stage of pipeline) {
    const op = Object.keys(stage)[0];
    if (WRITE_STAGES.has(op)) throw new Error(`L'étape ${op} est interdite en lecture seule.`);
  }
}

type FieldStats = { types: Set<string>; count: number };

function bsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (typeof value === "object") {
    const bsontype = (value as { _bsontype?: string })._bsontype;
    return bsontype ? bsontype : "object";
  }
  return typeof value;
}

function walk(doc: Document, prefix: string, stats: Map<string, FieldStats>, depth: number) {
  for (const [key, value] of Object.entries(doc)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const type = bsonType(value);
    const entry = stats.get(path) ?? { types: new Set<string>(), count: 0 };
    entry.types.add(type);
    entry.count += 1;
    stats.set(path, entry);
    if (type === "object" && depth < 4) walk(value as Document, path, stats, depth + 1);
    if (type === "array" && depth < 4) {
      const first = (value as unknown[]).find((v) => bsonType(v) === "object");
      if (first) walk(first as Document, `${path}[]`, stats, depth + 1);
    }
  }
}

/** Déduit un schéma approximatif à partir d'un échantillon de documents. */
export function inferSchema(docs: Document[]) {
  const stats = new Map<string, FieldStats>();
  for (const doc of docs) walk(doc, "", stats, 0);
  return [...stats.entries()].map(([field, s]) => ({
    field,
    types: [...s.types],
    presence: docs.length ? `${Math.round((s.count / docs.length) * 100)}%` : "0%",
  }));
}
