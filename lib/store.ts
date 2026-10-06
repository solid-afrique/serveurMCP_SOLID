import Redis from "ioredis";

/**
 * Stockage clé-valeur du serveur (connexions, clients OAuth, jetons).
 * Production : Redis via REDIS_URL (ou KV_URL fourni par l'intégration Upstash de Vercel).
 * Développement sans Redis : stockage en mémoire, perdu au redémarrage.
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

const PREFIX = "mcpdb:";

export function storeUrl(): string | undefined {
  return process.env.REDIS_URL || process.env.KV_URL || undefined;
}

class RedisStore implements Store {
  constructor(private client: Redis) {}
  get = (k: string) => this.client.get(PREFIX + k);
  mget = async (keys: string[]) => (keys.length ? this.client.mget(keys.map((k) => PREFIX + k)) : []);
  async set(k: string, v: string, ttl?: number) {
    if (ttl) await this.client.set(PREFIX + k, v, "EX", ttl);
    else await this.client.set(PREFIX + k, v);
  }
  getdel = (k: string) => this.client.getdel(PREFIX + k);
  async del(keys: string[]) {
    if (keys.length) await this.client.del(...keys.map((k) => PREFIX + k));
  }
  async incr(k: string, ttl: number) {
    const n = await this.client.incr(PREFIX + k);
    if (n === 1) await this.client.expire(PREFIX + k, ttl);
    return n;
  }
  async sadd(k: string, m: string) {
    await this.client.sadd(PREFIX + k, m);
  }
  async srem(k: string, m: string) {
    await this.client.srem(PREFIX + k, m);
  }
  smembers = (k: string) => this.client.smembers(PREFIX + k);
  sismember = async (k: string, m: string) => (await this.client.sismember(PREFIX + k, m)) === 1;
}

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

// Réutilisé entre les invocations tant que la fonction serverless reste « chaude ».
const globalStore = globalThis as unknown as { __mcpStore?: Store };

export function getStore(): Store {
  if (globalStore.__mcpStore) return globalStore.__mcpStore;
  const url = storeUrl();
  if (url) {
    const client = new Redis(url, { maxRetriesPerRequest: 2, connectTimeout: 10_000 });
    client.on("error", (e) => console.error("[store] Redis :", e.message));
    globalStore.__mcpStore = new RedisStore(client);
  } else if (process.env.NODE_ENV !== "production") {
    console.warn("[store] REDIS_URL absente : stockage en mémoire (développement uniquement).");
    globalStore.__mcpStore = new MemoryStore();
  } else {
    throw new Error("La variable d'environnement REDIS_URL (ou KV_URL) est requise en production.");
  }
  return globalStore.__mcpStore;
}
