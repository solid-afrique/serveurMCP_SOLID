<?php

namespace App\Services\Databases;

use Predis\Client;
use RuntimeException;

/** Accès à une base Redis (bibliothèque Predis, sans extension PHP). */
class RedisDatabase
{
    /** Commandes autorisées en lecture seule. */
    public const READ_COMMANDS = [
        'GET', 'MGET', 'STRLEN', 'GETRANGE', 'EXISTS', 'TYPE', 'TTL', 'PTTL', 'EXPIRETIME', 'SCAN', 'KEYS',
        'RANDOMKEY', 'DBSIZE', 'INFO', 'PING', 'TIME', 'OBJECT', 'MEMORY',
        'HGET', 'HMGET', 'HGETALL', 'HKEYS', 'HVALS', 'HLEN', 'HEXISTS', 'HSTRLEN', 'HSCAN', 'HRANDFIELD',
        'LRANGE', 'LLEN', 'LINDEX', 'LPOS',
        'SMEMBERS', 'SCARD', 'SISMEMBER', 'SMISMEMBER', 'SSCAN', 'SRANDMEMBER', 'SINTER', 'SUNION', 'SDIFF',
        'ZRANGE', 'ZRANGEBYSCORE', 'ZRANGEBYLEX', 'ZREVRANGE', 'ZREVRANGEBYSCORE', 'ZCARD', 'ZSCORE',
        'ZMSCORE', 'ZRANK', 'ZREVRANK', 'ZCOUNT', 'ZLEXCOUNT', 'ZSCAN', 'ZRANDMEMBER',
        'XRANGE', 'XREVRANGE', 'XLEN', 'XINFO', 'XPENDING',
        'PFCOUNT', 'GETBIT', 'BITCOUNT', 'BITPOS',
        'GEOPOS', 'GEODIST', 'GEOHASH', 'GEOSEARCH', 'GEORADIUS_RO', 'GEORADIUSBYMEMBER_RO',
        'JSON.GET', 'JSON.MGET', 'JSON.TYPE', 'JSON.OBJKEYS', 'JSON.OBJLEN', 'JSON.ARRLEN', 'JSON.STRLEN',
        'FT.SEARCH', 'FT.AGGREGATE', 'FT.INFO', 'FT._LIST',
        'TS.GET', 'TS.MGET', 'TS.RANGE', 'TS.REVRANGE', 'TS.MRANGE', 'TS.INFO',
    ];

    /** Commandes toujours bloquées (bloquantes ou dangereuses pour le serveur). */
    public const BLOCKED_COMMANDS = [
        'SHUTDOWN', 'DEBUG', 'MONITOR', 'SUBSCRIBE', 'PSUBSCRIBE', 'SSUBSCRIBE', 'SYNC', 'PSYNC',
        'REPLICAOF', 'SLAVEOF', 'FAILOVER', 'CLUSTER', 'MODULE', 'ACL', 'BLPOP', 'BRPOP', 'BLMOVE',
        'BZPOPMIN', 'BZPOPMAX', 'XREAD', 'XREADGROUP', 'WAIT',
    ];

    public function __construct(private readonly Client $client) {}

    /** @param  array<string, mixed>  $config */
    public static function open(array $config): self
    {
        if (! empty($config['connection_string'])) {
            $parameters = $config['connection_string'];
        } else {
            if (empty($config['host'])) {
                throw new RuntimeException("L'hôte Redis est manquant.");
            }
            $parameters = array_filter([
                'scheme' => ! empty($config['ssl']) ? 'tls' : 'tcp',
                'host' => $config['host'],
                'port' => (int) ($config['port'] ?? 0) ?: 6379,
                'username' => $config['user'] ?? null,
                'password' => $config['password'] ?? null,
                'database' => isset($config['database']) && $config['database'] !== '' ? (int) $config['database'] : null,
                'timeout' => 10,
                'read_write_timeout' => 30,
            ], fn ($v) => $v !== null && $v !== '');
            if (! empty($config['ssl'])) {
                $parameters['ssl'] = ['verify_peer' => false, 'verify_peer_name' => false];
            }
        }
        $client = new Client($parameters, ['exceptions' => true]);
        $client->connect();

        return new self($client);
    }

    public function version(): string
    {
        preg_match('/redis_version:(\S+)/', (string) $this->client->executeRaw(['INFO', 'server']), $m);

        return 'Redis '.($m[1] ?? '?');
    }

    /** @return array{count: int, complete: bool, keys: list<string>} */
    public function scanKeys(?string $pattern, ?string $type, int $max): array
    {
        $keys = [];
        $cursor = '0';
        $rounds = 0;
        do {
            $args = ['SCAN', $cursor, 'MATCH', $pattern ?: '*', 'COUNT', '500'];
            if ($type) {
                array_push($args, 'TYPE', $type);
            }
            [$cursor, $batch] = $this->client->executeRaw($args);
            foreach ($batch as $key) {
                $keys[(string) $key] = true;
            }
            $rounds++;
        } while ((string) $cursor !== '0' && count($keys) < $max && $rounds < 200);
        $list = array_map('strval', array_slice(array_keys($keys), 0, $max));

        return ['count' => count($list), 'complete' => (string) $cursor === '0' && count($keys) <= $max, 'keys' => $list];
    }

    /** @return array<string, mixed> */
    public function readKey(string $key, int $limit): array
    {
        $type = (string) $this->client->executeRaw(['TYPE', $key]);
        if ($type === 'none') {
            return ['key' => $key, 'exists' => false];
        }
        $ttl = (int) $this->client->executeRaw(['TTL', $key]);
        $end = (string) ($limit - 1);
        $value = match ($type) {
            'string' => $this->client->executeRaw(['GET', $key]),
            'hash' => self::pairs($this->client->executeRaw(['HSCAN', $key, '0', 'COUNT', (string) $limit])[1]),
            'list' => $this->client->executeRaw(['LRANGE', $key, '0', $end]),
            'set' => $this->client->executeRaw(['SSCAN', $key, '0', 'COUNT', (string) $limit])[1],
            'zset' => array_map(
                fn ($pair) => ['member' => $pair[0], 'score' => (float) $pair[1]],
                array_chunk($this->client->executeRaw(['ZRANGE', $key, '0', $end, 'WITHSCORES']), 2),
            ),
            'stream' => $this->client->executeRaw(['XRANGE', $key, '-', '+', 'COUNT', (string) $limit]),
            'ReJSON-RL' => json_decode((string) $this->client->executeRaw(['JSON.GET', $key]), true),
            default => "<type {$type} non pris en charge par get_key — utilisez run_command>",
        };

        return ['key' => $key, 'type' => $type, 'ttl' => $ttl, 'value' => $value];
    }

    public function info(?string $section): string
    {
        $info = (string) $this->client->executeRaw($section ? ['INFO', $section] : ['INFO']);

        return 'dbsize: '.$this->client->executeRaw(['DBSIZE'])."\n\n".$info;
    }

    /** @param  list<string|int|float>  $args */
    public function command(string $command, array $args, bool $readOnly): mixed
    {
        $name = strtoupper(trim($command));
        if (in_array($name, self::BLOCKED_COMMANDS, true)) {
            throw new RuntimeException("La commande {$name} est bloquée sur ce serveur.");
        }
        if ($readOnly && ! in_array($name, self::READ_COMMANDS, true)) {
            throw new RuntimeException("La commande {$name} n'est pas autorisée en lecture seule.");
        }
        $result = $this->client->executeRaw([$name, ...array_map('strval', $args)], $error);
        if ($error) {
            throw new RuntimeException((string) $result);
        }

        return $result;
    }

    /** @param  list<string>  $flat */
    private static function pairs(array $flat): array
    {
        $out = [];
        for ($i = 0; $i + 1 < count($flat); $i += 2) {
            $out[$flat[$i]] = $flat[$i + 1];
        }

        return $out;
    }
}
