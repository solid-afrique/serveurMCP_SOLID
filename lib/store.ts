import { MongoClient, type Collection } from "mongodb";

/**
 * Stockage clé-valeur du serveur (connexions, comptes, clients OAuth, jetons).
 * - production : MongoDB via MONGODB_URI (par ex. un cluster MongoDB Atlas) ;
 * - développement sans configuration : mémoire, perdue au redémarrage.
 */
export interface Store {
  get(key: string): Promise<string | null>;
  mget(keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  getdel(key: string): Promise<string | null>;
  del(keys: string[]): Promise<void>;
  incr(key: string, ttlSeconds: number): Promise<number>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  sismember(key: string, member: string): Promise<boolean>;
}

export type StoreKind = "mongodb" | "memory" | "missing";

export function storeKind(): StoreKind {
  if (process.env.MONGODB_URI) return "mongodb";
  return process.env.NODE_ENV === "production" ? "missing" : "memory";
}

/* -------------------------------- MongoDB -------------------------------- */

interface KvDoc {
  _id: string;
  value?: string;
  count?: number;
  members?: string[];
  expiresAt?: Date;
}

const expired = (d: KvDoc) => Boolean(d.expiresAt && d.expiresAt.getTime() <= Date.now());
const valueOf = (d: KvDoc | null) => (!d || expired(d) ? null : (d.value ?? (d.count !== undefined ? String(d.count) : null)));
const expiry = (ttl?: number) => (ttl ? { expiresAt: new Date(Date.now() + ttl * 1000) } : {});

/**
 * Une seule collection « kv » : { _id: clé, value | count | members, expiresAt }.
 * L'index TTL purge les documents expirés (environ toutes les 60 s) ; l'expiration
 * est donc aussi vérifiée à chaque lecture.
 */
class MongoStore implements Store {
  private collection: Promise<Collection<KvDoc>>;

  constructor(uri: string, dbName: string, onFailure: () => void) {
    const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 10_000, appName: "mcp-db-server" });
    this.collection = (async () => {
      await client.connect();
      const col = client.db(dbName).collection<KvDoc>("kv");
      await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      return col;
    })();
    // En cas d'échec de connexion, la requête suivante retentera avec un nouveau client.
    this.collection.catch((e) => {
      console.error("[store] MongoDB :", e.message);
      onFailure();
      client.close().catch(() => undefined);
    });
  }

  async get(k: string) {
    return valueOf(await (await this.collection).findOne({ _id: k }));
  }
  async mget(keys: string[]) {
    if (!keys.length) return [];
    const docs = await (await this.collection).find({ _id: { $in: keys } }).toArray();
    const byId = new Map(docs.map((d) => [d._id, d]));
    return keys.map((k) => valueOf(byId.get(k) ?? null));
  }
  async set(k: string, v: string, ttl?: number) {
    await (await this.collection).replaceOne({ _id: k }, { value: v, ...expiry(ttl) }, { upsert: true });
  }
  async getdel(k: string) {
    // Atomique : un code d'autorisation ou un jeton de rafraîchissement ne sert qu'une fois.
    return valueOf(await (await this.collection).findOneAndDelete({ _id: k }));
  }
  async del(keys: string[]) {
    if (keys.length) await (await this.collection).deleteMany({ _id: { $in: keys } });
  }
  async incr(k: string, ttl: number) {
    const col = await this.collection;
    await col.deleteOne({ _id: k, expiresAt: { $lte: new Date() } });
    const doc = await col.findOneAndUpdate(
      { _id: k },
      { $inc: { count: 1 }, $setOnInsert: expiry(ttl) },
      { upsert: true, returnDocument: "after" },
    );
    return doc?.count ?? 1;
  }
  async sadd(k: string, m: string) {
    await (await this.collection).updateOne({ _id: k }, { $addToSet: { members: m } }, { upsert: true });
  }
  async srem(k: string, m: string) {
    await (await this.collection).updateOne({ _id: k }, { $pull: { members: m } });
  }
  async smembers(k: string) {
    return (await (await this.collection).findOne({ _id: k }))?.members ?? [];
  }
  async sismember(k: string, m: string) {
    return (await (await this.collection).countDocuments({ _id: k, members: m }, { limit: 1 })) > 0;
  }
}

/* -------------------------------- Mémoire -------------------------------- */

class MemoryStore implements Store {
  private data = new Map<string, { value: string | Set<string>; exp?: number }>();
  private read(k: string) {
    const e = this.data.get(k);
    if (e?.exp && e.exp < Date.now()) {
      this.data.delete(k);
      return undefined;
    }
    return e;
  }
  async get(k: string) {
    const v = this.read(k)?.value;
    return typeof v === "string" ? v : null;
  }
  async mget(keys: string[]) {
    return Promise.all(keys.map((k) => this.get(k)));
  }
  async set(k: string, v: string, ttl?: number) {
    this.data.set(k, { value: v, exp: ttl ? Date.now() + ttl * 1000 : undefined });
  }
  async getdel(k: string) {
    const v = await this.get(k);
    this.data.delete(k);
    return v;
  }
  async del(keys: string[]) {
    keys.forEach((k) => this.data.delete(k));
  }
  async incr(k: string, ttl: number) {
    const e = this.read(k);
    const n = Number(e?.value ?? 0) + 1;
    this.data.set(k, { value: String(n), exp: e?.exp ?? Date.now() + ttl * 1000 });
    return n;
  }
  private set_(k: string) {
    const e = this.read(k);
    if (e?.value instanceof Set) return e.value;
    const s = new Set<string>();
    this.data.set(k, { value: s });
    return s;
  }
  async sadd(k: string, m: string) {
    this.set_(k).add(m);
  }
  async srem(k: string, m: string) {
    this.set_(k).delete(m);
  }
  async smembers(k: string) {
    return [...this.set_(k)];
  }
  async sismember(k: string, m: string) {
    return this.set_(k).has(m);
  }
}

/* --------------------------------- Choix --------------------------------- */

// Réutilisé entre les invocations tant que la fonction serverless reste « chaude ».
const globalStore = globalThis as unknown as { __mcpStore?: Store };

export function getStore(): Store {
  if (globalStore.__mcpStore) return globalStore.__mcpStore;
  switch (storeKind()) {
    case "mongodb":
      globalStore.__mcpStore = new MongoStore(
        process.env.MONGODB_URI!,
        process.env.MONGODB_DB || "mcp_server",
        () => (globalStore.__mcpStore = undefined),
      );
      break;
    case "memory":
      console.warn("[store] MONGODB_URI absente : stockage en mémoire (développement uniquement).");
      globalStore.__mcpStore = new MemoryStore();
      break;
    case "missing":
      throw new Error("La variable d'environnement MONGODB_URI est requise en production.");
  }
  return globalStore.__mcpStore!;
}
