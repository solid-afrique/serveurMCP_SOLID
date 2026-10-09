<?php

namespace App\Services\Databases;

use RuntimeException;

/**
 * Normalise les paramètres d'une connexion : champs séparés ou chaîne de connexion.
 *   MySQL      : mysql://utilisateur:motdepasse@hote:3306/base
 *   PostgreSQL : postgresql://utilisateur:motdepasse@hote:5432/base?sslmode=require
 *   SQL Server : Server=hote,1433;Database=base;User Id=utilisateur;Password=…;Encrypt=true
 *                Server=hote\SQLEXPRESS;… (instance nommée)  ou  sqlserver://utilisateur:motdepasse@hote:1433/base
 */
class ConnectionParameters
{
    public const DEFAULT_PORTS = ['mysql' => 3306, 'pgsql' => 5432, 'sqlsrv' => 1433, 'mongodb' => 27017, 'redis' => 6379];

    /**
     * @param  array<string, mixed>  $config
     * @return array{host: string, port: int, user: ?string, password: ?string, database: ?string, ssl: bool, instance: ?string}
     */
    public static function resolve(array $config): array
    {
        $type = $config['type'];
        $values = [
            'host' => $config['host'] ?? null,
            'port' => isset($config['port']) && $config['port'] !== '' ? (int) $config['port'] : null,
            'user' => $config['user'] ?? null,
            'password' => $config['password'] ?? null,
            'database' => $config['database'] ?? null,
            'ssl' => (bool) ($config['ssl'] ?? false),
            'instance' => null,
        ];

        if (! empty($config['connection_string'])) {
            $parsed = $type === 'sqlsrv' && ! str_contains($config['connection_string'], '://')
                ? self::parseAdo($config['connection_string'])
                : self::parseUrl($config['connection_string']);
            $values = array_merge($values, array_filter($parsed, fn ($v) => $v !== null));
            // La base choisie dans le formulaire prime sur celle de la chaîne.
            if (! empty($config['database'])) {
                $values['database'] = $config['database'];
            }
        }

        if (empty($values['host'])) {
            throw new RuntimeException("L'hôte de la base de données est manquant.");
        }
        if (str_contains((string) $values['host'], '\\')) {
            [$values['host'], $values['instance']] = explode('\\', $values['host'], 2);
        }
        $values['port'] ??= self::DEFAULT_PORTS[$type] ?? null;

        return $values;
    }

    /** @return array<string, mixed> */
    private static function parseUrl(string $url): array
    {
        $u = parse_url($url);
        if ($u === false || empty($u['host'])) {
            throw new RuntimeException('Chaîne de connexion invalide.');
        }
        parse_str($u['query'] ?? '', $query);
        $flag = fn (string $key) => isset($query[$key]) ? filter_var($query[$key], FILTER_VALIDATE_BOOL) : null;
        $ssl = isset($query['sslmode'])
            ? in_array($query['sslmode'], ['require', 'verify-ca', 'verify-full'], true)
            : ($flag('ssl') ?? $flag('encrypt'));

        return [
            'host' => $u['host'],
            'port' => $u['port'] ?? null,
            'user' => isset($u['user']) ? urldecode($u['user']) : null,
            'password' => isset($u['pass']) ? urldecode($u['pass']) : null,
            'database' => isset($u['path']) && trim($u['path'], '/') !== '' ? urldecode(trim($u['path'], '/')) : null,
            'ssl' => $ssl,
            'instance' => $query['instance'] ?? null,
        ];
    }

    /** Chaîne ADO.NET de SQL Server : « Clé=Valeur; … ». */
    private static function parseAdo(string $value): array
    {
        $pairs = [];
        foreach (explode(';', $value) as $part) {
            if (! str_contains($part, '=')) {
                continue;
            }
            [$k, $v] = explode('=', $part, 2);
            $pairs[strtolower(trim($k))] = trim($v);
        }
        $pick = function (string ...$keys) use ($pairs): ?string {
            foreach ($keys as $key) {
                if (isset($pairs[$key]) && $pairs[$key] !== '') {
                    return $pairs[$key];
                }
            }

            return null;
        };

        $server = preg_replace('/^tcp:/i', '', (string) $pick('server', 'data source', 'address', 'addr'));
        $port = null;
        if (preg_match('/^(.*),(\d+)$/', $server, $m)) {
            [$server, $port] = [$m[1], (int) $m[2]];
        }
        $encrypt = $pick('encrypt');

        return [
            'host' => $server ?: null,
            'port' => $port,
            'user' => $pick('user id', 'uid', 'user', 'username'),
            'password' => $pick('password', 'pwd'),
            'database' => $pick('database', 'initial catalog'),
            'ssl' => $encrypt === null ? null : in_array(strtolower($encrypt), ['true', 'yes', '1', 'mandatory', 'strict'], true),
        ];
    }
}
