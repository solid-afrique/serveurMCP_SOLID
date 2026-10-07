import mysql from "mysql2/promise";
import type { Store } from "./store";

/**
 * Stockage du serveur dans MySQL / MariaDB (utilisateurs, connexions chiffrées,
 * autorisations, jetons), pour un hébergement sur un serveur de l'entreprise.
 *
 * Deux tables, créées automatiquement :
 *   mcp_kv  (k, v, n, expires_at) : valeurs et compteurs, avec expiration (ms epoch) ;
 *   mcp_set (k, m)                : ensembles (attributions, autorisations…).
 * Les clés utilisent une collation binaire : identifiants et jetons sont sensibles à la casse.
 * L'expiration est vérifiée à chaque lecture ; les lignes expirées sont purgées régulièrement.
 */

const PURGE_INTERVAL_MS = 10 * 60_000;

interface KvRow {
  k?: string;
  v: string | null;
  n: number | string | null;
  expires_at: number | string | null;
}

const alive = (r: KvRow | undefined, now = Date.now()): r is KvRow =>
  Boolean(r) && (r!.expires_at === null || Number(r!.expires_at) > now);

const valueOf = (r: KvRow | undefined) =>
  !alive(r) ? null : (r.v ?? (r.n !== null ? String(Number(r.n)) : null));

const expiry = (ttl?: number) => (ttl ? Date.now() + ttl * 1000 : null);

function friendlyError(engine: string, e: Error): Error {
  const text = `${e.name} ${e.message} ${(e as { code?: string }).code ?? ""}`;
  const message = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ESOCKET|EHOSTUNREACH|getaddrinfo/i.test(text)
    ? `Stockage ${engine} injoignable : vérifiez l'hôte et le port de STORE_URL, et que le service est démarré.`
    : /access denied|login failed|ER_ACCESS_DENIED|ELOGIN/i.test(text)
      ? `Stockage ${engine} : identifiants refusés. Vérifiez l'utilisateur et le mot de passe de STORE_URL.`
      : /unknown database|ER_BAD_DB_ERROR|Cannot open database/i.test(text)
        ? `Stockage ${engine} : la base indiquée dans STORE_URL n'existe pas. Créez-la d'abord.`
        : `Stockage ${engine} indisponible : ${e.message}`;
  return new Error(message, { cause: e });
}

export class MysqlStore implements Store {
  private pool: mysql.Pool;
  private ready: Promise<void>;
  private lastPurge = 0;

  constructor(url: string, onFailure: () => void) {
    this.pool = mysql.createPool({ uri: url, connectionLimit: 5, supportBigNumbers: true, charset: "utf8mb4" });
    this.ready = this.init().catch((e: Error) => {
      onFailure();
      this.pool.end().catch(() => undefined);
      throw friendlyError("MySQL", e);
    });
    this.ready.catch((e: Error) => console.error("[store]", e.message));
  }

  private async init() {
    const key = "VARCHAR(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL";
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS mcp_kv (
         k ${key} PRIMARY KEY, v MEDIUMTEXT NULL, n BIGINT NULL, expires_at BIGINT NULL,
         KEY ix_mcp_kv_expires (expires_at)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS mcp_set (
         k VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
         m VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
         PRIMARY KEY (k, m)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
  }

  private async query<T = KvRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    await this.ready;
    const [rows] = await this.pool.query(sql, params);
    return rows as T[];
  }

  /** Exécute `fn` dans une transaction sur une connexion dédiée. */
  private async transaction<T>(fn: (c: mysql.PoolConnection) => Promise<T>): Promise<T> {
    await this.ready;
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback().catch(() => undefined);
      throw e;
    } finally {
      conn.release();
    }
  }

  private purge() {
    const now = Date.now();
    if (now - this.lastPurge < PURGE_INTERVAL_MS) return;
    this.lastPurge = now;
    this.pool.query("DELETE FROM mcp_kv WHERE expires_at IS NOT NULL AND expires_at <= ?", [now]).catch(() => undefined);
  }

  async get(k: string) {
    return valueOf((await this.query("SELECT v, n, expires_at FROM mcp_kv WHERE k = ?", [k]))[0]);
  }
  async mget(keys: string[]) {
    if (!keys.length) return [];
    const rows = await this.query("SELECT k, v, n, expires_at FROM mcp_kv WHERE k IN (?)", [keys]);
    const byKey = new Map(rows.map((r) => [r.k, r]));
    return keys.map((k) => valueOf(byKey.get(k)));
  }
  async set(k: string, v: string, ttl?: number) {
    await this.query(
      `INSERT INTO mcp_kv (k, v, n, expires_at) VALUES (?, ?, NULL, ?)
       ON DUPLICATE KEY UPDATE v = VALUES(v), n = NULL, expires_at = VALUES(expires_at)`,
      [k, v, expiry(ttl)],
    );
    this.purge();
  }
  async getdel(k: string) {
    // Verrou de ligne : un code d'autorisation ne peut être consommé qu'une fois.
    return this.transaction(async (c) => {
      const [rows] = await c.query("SELECT v, n, expires_at FROM mcp_kv WHERE k = ? FOR UPDATE", [k]);
      const row = (rows as KvRow[])[0];
      if (row) await c.query("DELETE FROM mcp_kv WHERE k = ?", [k]);
      return valueOf(row);
    });
  }
  async del(keys: string[]) {
    if (!keys.length) return;
    await this.query("DELETE FROM mcp_kv WHERE k IN (?)", [keys]);
    await this.query("DELETE FROM mcp_set WHERE k IN (?)", [keys]);
  }
  async incr(k: string, ttl: number) {
    const now = Date.now();
    return this.transaction(async (c) => {
      // Les affectations sont évaluées de gauche à droite : n est calculé avec l'ancienne expiration.
      await c.query(
        `INSERT INTO mcp_kv (k, v, n, expires_at) VALUES (?, NULL, 1, ?)
         ON DUPLICATE KEY UPDATE
           n = IF(expires_at IS NOT NULL AND expires_at <= ?, 1, COALESCE(n, 0) + 1),
           expires_at = IF(expires_at IS NOT NULL AND expires_at <= ?, VALUES(expires_at), expires_at)`,
        [k, now + ttl * 1000, now, now],
      );
      const [rows] = await c.query("SELECT n FROM mcp_kv WHERE k = ?", [k]);
      return Number((rows as KvRow[])[0].n);
    });
  }
  async sadd(k: string, m: string) {
    await this.query("INSERT IGNORE INTO mcp_set (k, m) VALUES (?, ?)", [k, m]);
  }
  async srem(k: string, m: string) {
    await this.query("DELETE FROM mcp_set WHERE k = ? AND m = ?", [k, m]);
  }
  async smembers(k: string) {
    return (await this.query<{ m: string }>("SELECT m FROM mcp_set WHERE k = ?", [k])).map((r) => r.m);
  }
  async sismember(k: string, m: string) {
    return (await this.query("SELECT 1 AS x FROM mcp_set WHERE k = ? AND m = ? LIMIT 1", [k, m])).length > 0;
  }
}
