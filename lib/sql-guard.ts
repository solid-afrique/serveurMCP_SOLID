/**
 * Garde-fou applicatif pour le mode lecture seule SQL.
 * Il complète (sans remplacer) les transactions READ ONLY côté PostgreSQL/MySQL.
 * Pour une sécurité réelle, utilisez un utilisateur de base n'ayant que des droits de lecture.
 */

export type SqlDialect = "postgresql" | "mysql" | "mssql";

const READ_START = /^(select|with|show|explain|describe|desc|values|table)\b/i;

const FORBIDDEN =
  /\b(insert|update|delete|merge|upsert|drop|alter|create|truncate|rename|grant|revoke|exec|execute|call|copy|into|lock|vacuum|reindex|cluster|comment|set|commit|rollback|savepoint|openrowset|opendatasource|openquery|xp_\w+|sp_\w+|pg_terminate_backend|pg_cancel_backend|pg_read_file|pg_read_binary_file|pg_ls_dir|lo_import|lo_export|dblink\w*|load_file|sleep|benchmark|pg_sleep|waitfor)\b/i;

/** Retire commentaires, chaînes et identifiants entre guillemets pour analyser la structure. */
function stripLiterals(sql: string, dialect: SqlDialect): string {
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  if (dialect === "postgresql") s = s.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "''");
  if (dialect === "mysql") {
    s = s
      .replace(/#[^\n]*/g, " ")
      .replace(/'(?:[^'\\]|\\.|'')*'/g, "''")
      .replace(/"(?:[^"\\]|\\.|"")*"/g, "''")
      .replace(/`[^`]*`/g, "``");
  } else {
    s = s.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
  }
  if (dialect === "mssql") s = s.replace(/\[[^\]]*\]/g, "[]");
  return s;
}

export function assertReadOnlySql(sql: string, dialect: SqlDialect): void {
  const body = stripLiterals(sql, dialect).trim().replace(/;\s*$/, "").trim();
  if (!body) throw new Error("Requête vide.");
  if (body.includes(";")) {
    throw new Error("Une seule instruction par appel est autorisée en lecture seule.");
  }
  if (!READ_START.test(body)) {
    throw new Error(
      "Seules les requêtes de lecture (SELECT, WITH, SHOW, EXPLAIN, DESCRIBE) sont autorisées sur cette connexion.",
    );
  }
  const hit = body.match(FORBIDDEN);
  if (hit) {
    throw new Error(`Mot-clé « ${hit[1].toUpperCase()} » interdit en lecture seule.`);
  }
}
