import Redis from "ioredis";
import type { ConnectionConfig } from "../config";

export async function withRedis<T>(cfg: ConnectionConfig, fn: (client: Redis) => Promise<T>): Promise<T> {
  const options = {
    lazyConnect: true,
    connectTimeout: 10_000,
    commandTimeout: 30_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  };
  const client = cfg.connectionString
    ? new Redis(cfg.connectionString, options)
    : new Redis({
        host: cfg.host,
        port: cfg.port,
        username: cfg.user,
        password: cfg.password,
        db: cfg.database ? Number(cfg.database) || 0 : 0,
        ...(cfg.ssl ? { tls: {} } : {}),
        ...options,
      });
  client.on("error", () => undefined);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    client.disconnect();
  }
}

/** Commandes autorisées en lecture seule. */
export const READ_COMMANDS = new Set(
  [
    "GET", "MGET", "STRLEN", "GETRANGE", "EXISTS", "TYPE", "TTL", "PTTL", "EXPIRETIME", "SCAN", "KEYS",
    "RANDOMKEY", "DBSIZE", "INFO", "PING", "TIME", "OBJECT", "MEMORY",
    "HGET", "HMGET", "HGETALL", "HKEYS", "HVALS", "HLEN", "HEXISTS", "HSTRLEN", "HSCAN", "HRANDFIELD",
    "LRANGE", "LLEN", "LINDEX", "LPOS",
    "SMEMBERS", "SCARD", "SISMEMBER", "SMISMEMBER", "SSCAN", "SRANDMEMBER", "SINTER", "SUNION", "SDIFF",
    "ZRANGE", "ZRANGEBYSCORE", "ZRANGEBYLEX", "ZREVRANGE", "ZREVRANGEBYSCORE", "ZCARD", "ZSCORE",
    "ZMSCORE", "ZRANK", "ZREVRANK", "ZCOUNT", "ZLEXCOUNT", "ZSCAN", "ZRANDMEMBER",
    "XRANGE", "XREVRANGE", "XLEN", "XINFO", "XPENDING",
    "PFCOUNT", "GETBIT", "BITCOUNT", "BITPOS",
    "GEOPOS", "GEODIST", "GEOHASH", "GEOSEARCH", "GEORADIUS_RO", "GEORADIUSBYMEMBER_RO",
    "JSON.GET", "JSON.MGET", "JSON.TYPE", "JSON.OBJKEYS", "JSON.OBJLEN", "JSON.ARRLEN", "JSON.STRLEN",
    "FT.SEARCH", "FT.AGGREGATE", "FT.INFO", "FT._LIST",
    "TS.GET", "TS.MGET", "TS.RANGE", "TS.REVRANGE", "TS.MRANGE", "TS.INFO",
  ],
);

/** Commandes toujours bloquées (bloquantes ou dangereuses pour le serveur). */
export const BLOCKED_COMMANDS = new Set([
  "SHUTDOWN", "DEBUG", "MONITOR", "SUBSCRIBE", "PSUBSCRIBE", "SSUBSCRIBE", "SYNC", "PSYNC",
  "REPLICAOF", "SLAVEOF", "FAILOVER", "CLUSTER", "MODULE", "ACL", "BLPOP", "BRPOP", "BLMOVE",
  "BZPOPMIN", "BZPOPMAX", "XREAD", "XREADGROUP", "WAIT",
]);

export async function readKey(client: Redis, key: string, limit: number) {
  const type = await client.type(key);
  const ttl = await client.ttl(key);
  const end = limit - 1;
  let value: unknown;
  switch (type) {
    case "none":
      return { key, exists: false };
    case "string":
      value = await client.get(key);
      break;
    case "hash": {
      const [, fields] = await client.hscan(key, 0, "COUNT", limit);
      value = Object.fromEntries(
        Array.from({ length: fields.length / 2 }, (_, i) => [fields[2 * i], fields[2 * i + 1]]),
      );
      break;
    }
    case "list":
      value = await client.lrange(key, 0, end);
      break;
    case "set":
      value = (await client.sscan(key, 0, "COUNT", limit))[1];
      break;
    case "zset": {
      const flat = await client.zrange(key, 0, String(end), "WITHSCORES");
      value = Array.from({ length: flat.length / 2 }, (_, i) => ({ member: flat[2 * i], score: Number(flat[2 * i + 1]) }));
      break;
    }
    case "stream":
      value = await client.xrange(key, "-", "+", "COUNT", limit);
      break;
    case "ReJSON-RL":
      value = JSON.parse(String(await client.call("JSON.GET", key)));
      break;
    default:
      value = `<type ${type} non pris en charge par get_key — utilisez run_command>`;
  }
  return { key, type, ttl, value };
}
