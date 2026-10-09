<?php

namespace App\Services\Databases;

use PDO;
use PDOStatement;
use RuntimeException;

/**
 * Accès aux bases relationnelles (MySQL / MariaDB, PostgreSQL, SQL Server) via PDO.
 * Paramètres de requête : marqueurs positionnels « ? » pour tous les moteurs.
 */
class SqlDatabase
{
    private const CONNECT_TIMEOUT = 10;

    private const QUERY_TIMEOUT = 30;

    public function __construct(private readonly PDO $pdo, public readonly string $dialect) {}

    /** @param  array<string, mixed>  $config  paramètres déchiffrés de la connexion */
    public static function open(array $config): self
    {
        $c = ConnectionParameters::resolve($config);
        $dialect = $config['type'];
        $options = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];

        switch ($dialect) {
            case 'mysql':
                self::requireDriver('mysql', 'pdo_mysql');
                $dsn = "mysql:host={$c['host']};port={$c['port']};charset=utf8mb4".($c['database'] ? ";dbname={$c['database']}" : '');
                $options += [
                    PDO::ATTR_TIMEOUT => self::CONNECT_TIMEOUT,
                    PDO::ATTR_EMULATE_PREPARES => false,
                    PDO::MYSQL_ATTR_MULTI_STATEMENTS => false,
                ];
                if ($c['ssl']) {
                    // Chiffrement sans vérification du certificat (autorités privées des bases hébergées).
                    $options[PDO::MYSQL_ATTR_SSL_CA] = '';
                    $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = false;
                }
                $pdo = new PDO($dsn, $c['user'], $c['password'], $options);
                // Délai maximal des lectures (MySQL puis MariaDB), ignoré si non pris en charge.
                foreach (['SET SESSION MAX_EXECUTION_TIME = '.(self::QUERY_TIMEOUT * 1000), 'SET SESSION max_statement_time = '.self::QUERY_TIMEOUT] as $sql) {
                    try {
                        $pdo->exec($sql);
                    } catch (\PDOException) {
                    }
                }
                break;

            case 'pgsql':
                self::requireDriver('pgsql', 'pdo_pgsql');
                $dsn = "pgsql:host={$c['host']};port={$c['port']};connect_timeout=".self::CONNECT_TIMEOUT
                    .($c['database'] ? ";dbname={$c['database']}" : '').';sslmode='.($c['ssl'] ? 'require' : 'prefer');
                $options[PDO::ATTR_EMULATE_PREPARES] = false;
                $pdo = new PDO($dsn, $c['user'], $c['password'], $options);
                $pdo->exec('SET statement_timeout = '.(self::QUERY_TIMEOUT * 1000));
                $pdo->exec("SET application_name = 'mcp-db-server'");
                break;

            case 'sqlsrv':
                self::requireDriver('sqlsrv', 'pdo_sqlsrv');
                $server = $c['instance'] ? "{$c['host']}\\{$c['instance']}" : "{$c['host']},{$c['port']}";
                $dsn = "sqlsrv:Server={$server};LoginTimeout=".self::CONNECT_TIMEOUT
                    .($c['database'] ? ";Database={$c['database']}" : '')
                    .';Encrypt='.($c['ssl'] ? 'yes' : 'no').';TrustServerCertificate=yes;APP=mcp-db-server';
                $options[PDO::SQLSRV_ATTR_QUERY_TIMEOUT] = self::QUERY_TIMEOUT;
                $pdo = new PDO($dsn, $c['user'], $c['password'], $options);
                break;

            default:
                throw new RuntimeException("Type SQL non pris en charge : {$dialect}");
        }

        return new self($pdo, $dialect);
    }

    private static function requireDriver(string $driver, string $extension): void
    {
        if (! in_array($driver, PDO::getAvailableDrivers(), true)) {
            throw new RuntimeException("L'extension PHP {$extension} n'est pas installée sur ce serveur.");
        }
    }

    /* --------------------------------- Requêtes -------------------------------- */

    /**
     * Exécute une requête et renvoie au plus $maxRows lignes.
     *
     * @param  list<mixed>  $params
     * @return array{columns: list<string>, rows: list<array<string, mixed>>, rowCount: int, truncated: bool, affectedRows?: int}
     */
    public function query(string $sql, array $params, bool $readOnly, int $maxRows): array
    {
        if ($readOnly) {
            SqlGuard::assertReadOnly($sql, $this->dialect);
            $this->beginReadOnly();
        }

        try {
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute(array_values($params));

            return $this->collect($stmt, $maxRows);
        } finally {
            if ($readOnly) {
                $this->rollBack();
            }
        }
    }

    /** Lecture seule : transaction READ ONLY (MySQL, PostgreSQL) ou annulée à la fin (SQL Server). */
    private function beginReadOnly(): void
    {
        match ($this->dialect) {
            'mysql' => $this->pdo->exec('START TRANSACTION READ ONLY'),
            'pgsql' => $this->pdo->exec('BEGIN TRANSACTION READ ONLY'),
            'sqlsrv' => $this->pdo->beginTransaction(),
        };
    }

    private function rollBack(): void
    {
        try {
            $this->dialect === 'sqlsrv' ? $this->pdo->rollBack() : $this->pdo->exec('ROLLBACK');
        } catch (\Throwable) {
        }
    }

    /** @return array{columns: list<string>, rows: list<array<string, mixed>>, rowCount: int, truncated: bool, affectedRows?: int} */
    private function collect(PDOStatement $stmt, int $maxRows): array
    {
        if ($stmt->columnCount() === 0) {
            return ['columns' => [], 'rows' => [], 'rowCount' => 0, 'truncated' => false, 'affectedRows' => $stmt->rowCount()];
        }

        $columns = [];
        for ($i = 0; $i < $stmt->columnCount(); $i++) {
            $columns[] = (string) ($stmt->getColumnMeta($i)['name'] ?? "col{$i}");
        }

        $rows = [];
        $truncated = false;
        while (($row = $stmt->fetch()) !== false) {
            if (count($rows) === $maxRows) {
                $truncated = true;
                break;
            }
            $rows[] = array_map(self::normalize(...), $row);
        }
        $stmt->closeCursor();

        return ['columns' => $columns, 'rows' => $rows, 'rowCount' => count($rows), 'truncated' => $truncated];
    }

    private static function normalize(mixed $value): mixed
    {
        if (is_resource($value)) {
            $value = stream_get_contents($value);
        }
        if (is_string($value) && ! mb_check_encoding($value, 'UTF-8')) {
            return '<binaire '.strlen($value).' octets>';
        }

        return $value;
    }

    /* --------------------------------- Catalogue -------------------------------- */

    public function version(): string
    {
        $sql = match ($this->dialect) {
            'mysql' => 'SELECT VERSION() AS version',
            'pgsql' => 'SELECT version() AS version',
            'sqlsrv' => 'SELECT @@VERSION AS version',
        };

        return trim(strtok((string) $this->pdo->query($sql)->fetchColumn(), "\n"));
    }

    /** @return list<array<string, mixed>> */
    public function listTables(?string $schema): array
    {
        $params = $schema !== null ? [$schema] : [];
        $sql = match ($this->dialect) {
            'mysql' => 'SELECT table_schema AS `schema`, table_name AS name, table_type AS type FROM information_schema.tables WHERE '
                .($schema !== null ? 'table_schema = ?' : "table_schema = COALESCE(DATABASE(), table_schema) AND table_schema NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')")
                .' ORDER BY 1, 2',
            'pgsql' => "SELECT table_schema AS schema, table_name AS name, table_type AS type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')"
                .($schema !== null ? ' AND table_schema = ?' : '').' ORDER BY 1, 2',
            'sqlsrv' => 'SELECT TABLE_SCHEMA AS [schema], TABLE_NAME AS name, TABLE_TYPE AS type FROM INFORMATION_SCHEMA.TABLES'
                .($schema !== null ? ' WHERE TABLE_SCHEMA = ?' : '').' ORDER BY 1, 2',
        };

        return $this->all($sql, $params);
    }

    /** @return array{table: string, columns: list<array<string, mixed>>, keys: list<array<string, mixed>>} */
    public function describeTable(string $table, ?string $schema): array
    {
        $params = $schema !== null ? [$table, $schema] : [$table];

        switch ($this->dialect) {
            case 'mysql':
                $where = 'table_name = ? AND table_schema = '.($schema !== null ? '?' : 'DATABASE()');
                $columns = $this->all("SELECT column_name AS name, column_type AS type, is_nullable = 'YES' AS nullable, column_default AS `default`, column_key AS `key`, extra AS extra FROM information_schema.columns WHERE {$where} ORDER BY ordinal_position", $params);
                $keys = $this->all("SELECT constraint_name AS name, column_name AS `column`, referenced_table_name AS ref_table, referenced_column_name AS ref_column FROM information_schema.key_column_usage WHERE {$where}", $params);
                break;

            case 'pgsql':
                $s = $schema !== null ? ' AND table_schema = ?' : '';
                $columns = $this->all("SELECT table_schema AS schema, column_name AS name, data_type AS type, is_nullable = 'YES' AS nullable, column_default AS \"default\" FROM information_schema.columns WHERE table_name = ?{$s} ORDER BY table_schema, ordinal_position", $params);
                $ts = $schema !== null ? ' AND tc.table_schema = ?' : '';
                $keys = $this->all("SELECT tc.constraint_type AS kind, kcu.column_name AS column, ccu.table_schema AS ref_schema, ccu.table_name AS ref_table, ccu.column_name AS ref_column
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                    LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_type = 'FOREIGN KEY' AND ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.table_schema
                    WHERE tc.table_name = ?{$ts} AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')", $params);
                break;

            case 'sqlsrv':
                $s = $schema !== null ? ' AND TABLE_SCHEMA = ?' : '';
                $columns = $this->all("SELECT TABLE_SCHEMA AS [schema], COLUMN_NAME AS name, DATA_TYPE AS type, CHARACTER_MAXIMUM_LENGTH AS max_length, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS [default] FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ?{$s} ORDER BY TABLE_SCHEMA, ORDINAL_POSITION", $params);
                $ts = $schema !== null ? ' AND tc.TABLE_SCHEMA = ?' : '';
                $keys = $this->all("SELECT tc.CONSTRAINT_TYPE AS kind, kcu.COLUMN_NAME AS [column], ccu.TABLE_SCHEMA AS ref_schema, ccu.TABLE_NAME AS ref_table, ccu.COLUMN_NAME AS ref_column
                    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
                    LEFT JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc ON tc.CONSTRAINT_TYPE = 'FOREIGN KEY' AND rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                    LEFT JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu ON ccu.CONSTRAINT_NAME = rc.UNIQUE_CONSTRAINT_NAME
                    WHERE tc.TABLE_NAME = ?{$ts} AND tc.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')", $params);
                break;

            default:
                throw new RuntimeException('Dialecte inconnu.');
        }

        return ['table' => $table, 'columns' => $columns, 'keys' => $keys];
    }

    /** @return list<array<string, mixed>> */
    private function all(string $sql, array $params): array
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        return array_map(fn ($row) => array_map(self::normalize(...), $row), $stmt->fetchAll());
    }
}
