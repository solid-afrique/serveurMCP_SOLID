import { z } from "zod";

export const DB_TYPES = ["postgresql", "mysql", "mssql", "mongodb", "redis"] as const;
export type DbType = (typeof DB_TYPES)[number];

export const DB_LABELS: Record<DbType, string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL / MariaDB",
  mssql: "SQL Server",
  mongodb: "MongoDB",
  redis: "Redis",
};

export const DEFAULT_PORTS: Record<DbType, number> = {
  postgresql: 5432,
  mysql: 3306,
  mssql: 1433,
  mongodb: 27017,
  redis: 6379,
};

export const connectionSchema = z
  .object({
    type: z.enum(DB_TYPES),
    name: z.string().trim().max(60).optional(),
    connectionString: z.string().trim().max(2000).optional(),
    host: z.string().trim().max(255).optional(),
    port: z.coerce.number().int().min(1).max(65535).optional(),
    user: z.string().max(255).optional(),
    password: z.string().max(1024).optional(),
    database: z.string().max(255).optional(),
    ssl: z.boolean().default(false),
    readOnly: z.boolean().default(true),
    maxRows: z.coerce.number().int().min(1).max(5000).default(200),
  })
  .refine((c) => Boolean(c.connectionString || c.host), {
    message: "Indiquez une chaîne de connexion ou un hôte.",
  });

export type ConnectionConfig = z.infer<typeof connectionSchema>;

/** Supprime les champs vides envoyés par le formulaire avant validation. */
export function parseConnection(input: unknown): ConnectionConfig {
  const raw = (input ?? {}) as Record<string, unknown>;
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== "" && v !== null && v !== undefined),
  );
  return connectionSchema.parse(cleaned);
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === "";

/**
 * Lors d'une modification, les secrets ne sont pas renvoyés au navigateur :
 * un mot de passe ou une chaîne de connexion laissés vides conservent la valeur enregistrée.
 */
export function withPreviousSecrets(input: unknown, previous: ConnectionConfig): Record<string, unknown> {
  const raw = { ...((input ?? {}) as Record<string, unknown>) };
  if (isEmpty(raw.connectionString) && isEmpty(raw.host) && previous.connectionString) {
    raw.connectionString = previous.connectionString;
  }
  if (isEmpty(raw.connectionString) && isEmpty(raw.password) && previous.password) {
    raw.password = previous.password;
  }
  return raw;
}

/** Configuration renvoyée à l'interface d'administration, sans aucun secret. */
export function publicConfig(cfg: ConnectionConfig) {
  const { password, connectionString, ...rest } = cfg;
  return { ...rest, hasPassword: Boolean(password), hasConnectionString: Boolean(connectionString) };
}

export function displayName(cfg: ConnectionConfig): string {
  return cfg.name || `${DB_LABELS[cfg.type]}${cfg.database ? ` (${cfg.database})` : ""}`;
}
