<?php

namespace App\Services\Databases;

use RuntimeException;

/**
 * Garde-fou applicatif pour le mode lecture seule SQL.
 * Il complète (sans remplacer) les transactions READ ONLY côté MySQL / PostgreSQL.
 * Pour une sécurité réelle, utilisez un compte de base n'ayant que des droits de lecture.
 */
class SqlGuard
{
    private const READ_START = '/^(select|with|show|explain|describe|desc|values|table)\b/i';

    private const FORBIDDEN = '/\b(insert|update|delete|merge|upsert|drop|alter|create|truncate|rename|grant|revoke|exec|execute|call|copy|into|lock|vacuum|reindex|cluster|comment|set|commit|rollback|savepoint|openrowset|opendatasource|openquery|xp_\w+|sp_\w+|pg_terminate_backend|pg_cancel_backend|pg_read_file|pg_read_binary_file|pg_ls_dir|lo_import|lo_export|dblink\w*|load_file|sleep|benchmark|pg_sleep|waitfor)\b/i';

    /** @throws RuntimeException si la requête n'est pas une lecture simple. */
    public static function assertReadOnly(string $sql, string $dialect): void
    {
        $body = trim(preg_replace('/;\s*$/', '', trim(self::stripLiterals($sql, $dialect))));

        if ($body === '') {
            throw new RuntimeException('Requête vide.');
        }
        if (str_contains($body, ';')) {
            throw new RuntimeException('Une seule instruction par appel est autorisée en lecture seule.');
        }
        if (! preg_match(self::READ_START, $body)) {
            throw new RuntimeException('Seules les requêtes de lecture (SELECT, WITH, SHOW, EXPLAIN, DESCRIBE) sont autorisées sur cette connexion.');
        }
        if (preg_match(self::FORBIDDEN, $body, $hit)) {
            throw new RuntimeException('Mot-clé « '.strtoupper($hit[1]).' » interdit en lecture seule.');
        }
    }

    /** Retire commentaires, chaînes et identifiants entre guillemets pour analyser la structure. */
    private static function stripLiterals(string $sql, string $dialect): string
    {
        $s = preg_replace(['~/\*.*?\*/~s', '/--[^\n]*/'], ' ', $sql);

        if ($dialect === 'pgsql') {
            $s = preg_replace('/\$(\w*)\$.*?\$\1\$/s', "''", $s);
        }
        if ($dialect === 'mysql') {
            $s = preg_replace(
                ['/#[^\n]*/', "/'(?:[^'\\\\]|\\\\.|'')*'/s", '/"(?:[^"\\\\]|\\\\.|"")*"/s', '/`[^`]*`/'],
                [' ', "''", "''", '``'],
                $s,
            );
        } else {
            $s = preg_replace(["/'(?:[^']|'')*'/s", '/"(?:[^"]|"")*"/s'], ["''", '""'], $s);
        }
        if ($dialect === 'sqlsrv') {
            $s = preg_replace('/\[[^\]]*\]/', '[]', $s);
        }

        return $s;
    }
}
