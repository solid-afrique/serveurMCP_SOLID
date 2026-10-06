import pg from "pg";
import mysql from "mysql2/promise";
import mssql from "mssql";
import type { ConnectionConfig } from "../config";
import { assertReadOnlySql, type SqlDialect } from "../sql-guard";

const CONNECT_TIMEOUT_MS = 10_000;
const QUERY_TIMEOUT_MS = 30_000;

type Row = Record<string, unknown>;

interface RawResult {
  rows: Row[];
  columns: string[];
  affectedRows?: number;
}

export interface SqlSession {
  dialect: SqlDialect;
  run(sql: string, params: unknown[], readOnly: boolean): Promise<RawResult>;
  close(): Promise<void>;
}

/* ----------------------------- PostgreSQL ----------------------------- */

async function openPostgres(cfg: ConnectionConfig): Promise<SqlSession> {
  const ssl = cfg.ssl ? { rejectUnauthorized: false } : undefined;
  const client = new pg.Client({
    ...(cfg.connectionString
      ? { connectionString: cfg.connectionString }
      : { host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database }),
    ...(ssl ? { ssl } : {}),
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
    application_name: "mcp-db-server",
  });
  await client.connect();

  return {
    dialect: "postgresql",
    async run(sql, params, readOnly) {
      if (readOnly) await client.query("BEGIN TRANSACTION READ ONLY");
      try {
        // Le protocole « extended » interdit les instructions multiples dans un même appel.
        const res = await client.query({ text: sql, values: params, queryMode: "extended" } as pg.QueryConfig);
        return {
          rows: res.rows ?? [],
          columns: (res.fields ?? []).map((f) => f.name),
          affectedRows: res.command === "SELECT" ? undefined : (res.rowCount ?? undefined),
        };
      } finally {
        if (readOnly) await client.query("ROLLBACK").catch(() => undefined);
      }
    },
    close: () => client.end(),
  };
}

/* ------------------------------- MySQL -------------------------------- */

async function openMysql(cfg: ConnectionConfig): Promise<SqlSession> {
  const common = {
    connectTimeout: CONNECT_TIMEOUT_MS,
    multipleStatements: false,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    ...(cfg.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
  const conn = await mysql.createConnection(
    cfg.connectionString
      ? { uri: cfg.connectionString, ...common }
      : { host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database, ...common },
  );

  return {
    dialect: "mysql",
    async run(sql, params, readOnly) {
      if (readOnly) await conn.query("START TRANSACTION READ ONLY");
      try {
        const [result, fields] = await conn.query({ sql, values: params, timeout: QUERY_TIMEOUT_MS });
        if (Array.isArray(result)) {
          return {
            rows: result as Row[],
            columns: (fields ?? []).map((f) => f.name),
          };
        }
        return { rows: [], columns: [], affectedRows: (result as mysql.ResultSetHeader).affectedRows };
      } finally {
        if (readOnly) await conn.query("ROLLBACK").catch(() => undefined);
      }
    },
    close: () => conn.end(),
  };
}

/* ----------------------------- SQL Server ----------------------------- */

async function openMssql(cfg: ConnectionConfig): Promise<SqlSession> {
  const pool = cfg.connectionString
    ? new mssql.ConnectionPool(cfg.connectionString)
    : new mssql.ConnectionPool({
        server: cfg.host ?? "localhost",
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database,
        connectionTimeout: CONNECT_TIMEOUT_MS,
        requestTimeout: QUERY_TIMEOUT_MS,
        pool: { max: 1, min: 0 },
        options: { encrypt: cfg.ssl, trustServerCertificate: true },
      });
  await pool.connect();

  const execute = async (request: mssql.Request, sql: string, params: unknown[]): Promise<RawResult> => {
    params.forEach((value, i) => request.input(`p${i + 1}`, value));
    const res = await request.query(sql);
    const recordset = res.recordset as (mssql.IRecordSet<Row> | undefined);
    return {
      rows: recordset ? [...recordset] : [],
      columns: recordset?.columns ? Object.keys(recordset.columns) : [],
      affectedRows: recordset ? undefined : res.rowsAffected.reduce((a, b) => a + b, 0),
    };
  };

  return {
    dialect: "mssql",
    async run(sql, params, readOnly) {
      if (!readOnly) return execute(pool.request(), sql, params);
      // SQL Server n'a pas de transaction READ ONLY : on exécute puis on annule systématiquement.
      const tx = new mssql.Transaction(pool);
      await tx.begin();
      try {
        return await execute(new mssql.Request(tx), sql, params);
      } finally {
        await tx.rollback().catch(() => undefined);
      }
    },
    close: () => pool.close(),
  };
}

/* ------------------------------ Commun -------------------------------- */

export async function openSql(cfg: ConnectionConfig): Promise<SqlSession> {
  switch (cfg.type) {
    case "postgresql":
      return openPostgres(cfg);
    case "mysql":
      return openMysql(cfg);
    case "mssql":
      return openMssql(cfg);
    default:
      throw new Error(`Type SQL non pris en charge : ${cfg.type}`);
  }
}

export async function withSql<T>(cfg: ConnectionConfig, fn: (s: SqlSession) => Promise<T>): Promise<T> {
  const session = await openSql(cfg);
  try {
    return await fn(session);
  } finally {
    await session.close().catch(() => undefined);
  }
}

export interface QueryOutput {
  columns: string[];
  rows: Row[];
  rowCount: number;
  truncated: boolean;
  affectedRows?: number;
}

export async function runQuery(
  session: SqlSession,
  sql: string,
  params: unknown[],
  opts: { readOnly: boolean; maxRows: number },
): Promise<QueryOutput> {
  if (opts.readOnly) assertReadOnlySql(sql, session.dialect);
  const res = await session.run(sql, params, opts.readOnly);
  const truncated = res.rows.length > opts.maxRows;
  return {
    columns: res.columns,
    rows: truncated ? res.rows.slice(0, opts.maxRows) : res.rows,
    rowCount: res.rows.length,
    truncated,
    ...(res.affectedRows !== undefined ? { affectedRows: res.affectedRows } : {}),
  };
}

/* ------------------------- Requêtes de catalogue ---------------------- */

export const PLACEHOLDER_HINT: Record<SqlDialect, string> = {
  postgresql: "Paramètres positionnels : $1, $2, …",
  mysql: "Paramètres positionnels : ?",
  mssql: "Paramètres nommés : @p1, @p2, …",
};

export async function serverVersion(session: SqlSession): Promise<string> {
  const sql = {
    postgresql: "SELECT version() AS version",
    mysql: "SELECT VERSION() AS version",
    mssql: "SELECT @@VERSION AS version",
  }[session.dialect];
  const res = await session.run(sql, [], true);
  return String(res.rows[0]?.version ?? "inconnue").split("\n")[0];
}

export async function listTables(session: SqlSession, schema?: string): Promise<Row[]> {
  const s = schema ?? null;
  switch (session.dialect) {
    case "postgresql":
      return (
        await session.run(
          `SELECT table_schema AS schema, table_name AS name, table_type AS type
             FROM information_schema.tables
            WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
              AND ($1::text IS NULL OR table_schema = $1::text)
            ORDER BY 1, 2`,
          [s],
          true,
        )
      ).rows;
    case "mysql":
      return (
        await session.run(
          `SELECT table_schema AS \`schema\`, table_name AS name, table_type AS type
             FROM information_schema.tables
            WHERE table_schema = COALESCE(?, DATABASE())
               OR (? IS NULL AND DATABASE() IS NULL
                   AND table_schema NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys'))
            ORDER BY 1, 2`,
          [s, s],
          true,
        )
      ).rows;
    case "mssql":
      return (
        await session.run(
          `SELECT TABLE_SCHEMA AS [schema], TABLE_NAME AS name, TABLE_TYPE AS type
             FROM INFORMATION_SCHEMA.TABLES
            WHERE (@p1 IS NULL OR TABLE_SCHEMA = @p1)
            ORDER BY 1, 2`,
          [s],
          true,
        )
      ).rows;
  }
}

export async function describeTable(session: SqlSession, table: string, schema?: string) {
  const s = schema ?? null;
  switch (session.dialect) {
    case "postgresql": {
      const columns = await session.run(
        `SELECT table_schema AS schema, column_name AS name, data_type AS type,
                is_nullable = 'YES' AS nullable, column_default AS "default"
           FROM information_schema.columns
          WHERE table_name = $1::text AND ($2::text IS NULL OR table_schema = $2::text)
          ORDER BY table_schema, ordinal_position`,
        [table, s],
        true,
      );
      const keys = await session.run(
        `SELECT tc.constraint_type AS kind, kcu.column_name AS column,
                ccu.table_schema AS ref_schema, ccu.table_name AS ref_table, ccu.column_name AS ref_column
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
           LEFT JOIN information_schema.constraint_column_usage ccu
             ON tc.constraint_type = 'FOREIGN KEY'
            AND ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.table_schema
          WHERE tc.table_name = $1::text AND ($2::text IS NULL OR tc.table_schema = $2::text)
            AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')`,
        [table, s],
        true,
      );
      return { table, columns: columns.rows, keys: keys.rows };
    }
    case "mysql": {
      const columns = await session.run(
        `SELECT column_name AS name, column_type AS type, is_nullable = 'YES' AS nullable,
                column_default AS \`default\`, column_key AS \`key\`, extra AS extra
           FROM information_schema.columns
          WHERE table_name = ? AND table_schema = COALESCE(?, DATABASE())
          ORDER BY ordinal_position`,
        [table, s],
        true,
      );
      const keys = await session.run(
        `SELECT constraint_name AS name, column_name AS \`column\`,
                referenced_table_name AS ref_table, referenced_column_name AS ref_column
           FROM information_schema.key_column_usage
          WHERE table_name = ? AND table_schema = COALESCE(?, DATABASE())`,
        [table, s],
        true,
      );
      return { table, columns: columns.rows, keys: keys.rows };
    }
    case "mssql": {
      const columns = await session.run(
        `SELECT TABLE_SCHEMA AS [schema], COLUMN_NAME AS name, DATA_TYPE AS type,
                CHARACTER_MAXIMUM_LENGTH AS max_length, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS [default]
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = @p1 AND (@p2 IS NULL OR TABLE_SCHEMA = @p2)
          ORDER BY TABLE_SCHEMA, ORDINAL_POSITION`,
        [table, s],
        true,
      );
      const keys = await session.run(
        `SELECT tc.CONSTRAINT_TYPE AS kind, kcu.COLUMN_NAME AS [column],
                ccu.TABLE_SCHEMA AS ref_schema, ccu.TABLE_NAME AS ref_table, ccu.COLUMN_NAME AS ref_column
           FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
           JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
             ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
           LEFT JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
             ON tc.CONSTRAINT_TYPE = 'FOREIGN KEY' AND rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
           LEFT JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
             ON ccu.CONSTRAINT_NAME = rc.UNIQUE_CONSTRAINT_NAME
          WHERE tc.TABLE_NAME = @p1 AND (@p2 IS NULL OR tc.TABLE_SCHEMA = @p2)
            AND tc.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')`,
        [table, s],
        true,
      );
      return { table, columns: columns.rows, keys: keys.rows };
    }
  }
}
