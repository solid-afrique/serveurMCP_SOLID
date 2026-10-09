<?php

namespace App\Services\Databases;

use MongoDB\BSON\Document;
use MongoDB\BSON\PackedArray;
use MongoDB\Driver\BulkWrite;
use MongoDB\Driver\Command;
use MongoDB\Driver\Manager;
use MongoDB\Driver\Query;
use RuntimeException;
use stdClass;

/**
 * Accès à MongoDB via l'extension PHP « mongodb » (aucune bibliothèque Composer requise).
 * Les filtres et pipelines acceptent l'Extended JSON : {"_id": {"$oid": "…"}}, {"$date": "…"}.
 */
class MongoDatabase
{
    private const MAX_TIME_MS = 30000;

    public function __construct(private readonly Manager $manager, private readonly ?string $defaultDb) {}

    public static function available(): bool
    {
        return extension_loaded('mongodb');
    }

    /** @param  array<string, mixed>  $config */
    public static function open(array $config): self
    {
        if (! self::available()) {
            throw new RuntimeException("L'extension PHP mongodb n'est pas installée sur ce serveur.");
        }
        if (! empty($config['connection_string'])) {
            $uri = $config['connection_string'];
        } else {
            if (empty($config['host'])) {
                throw new RuntimeException("L'hôte MongoDB est manquant.");
            }
            $auth = ! empty($config['user'])
                ? rawurlencode($config['user']).(isset($config['password']) ? ':'.rawurlencode($config['password']) : '').'@'
                : '';
            $uri = "mongodb://{$auth}{$config['host']}".(! empty($config['port']) ? ":{$config['port']}" : '').'/';
        }
        $options = ['serverSelectionTimeoutMS' => 10000, 'connectTimeoutMS' => 10000, 'appname' => 'mcp-db-server'];
        if (! empty($config['ssl'])) {
            $options += ['tls' => true, 'tlsAllowInvalidCertificates' => true];
        }
        $manager = new Manager($uri, $options);
        $manager->executeCommand('admin', new Command(['ping' => 1]));

        $fromUri = trim((string) parse_url((string) preg_replace('/^mongodb(\+srv)?:/', 'http:', $uri), PHP_URL_PATH), '/');

        return new self($manager, ($config['database'] ?? '') ?: ($fromUri ?: null));
    }

    private function db(?string $name): string
    {
        return $name ?: ($this->defaultDb ?: 'test');
    }

    /* ------------------------------ Conversions ------------------------------ */

    /** Objet JSON (arguments de l'outil) → document BSON, Extended JSON compris. */
    public static function fromJson(mixed $value): object
    {
        $json = empty($value) ? '{}' : json_encode($value, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);

        return Document::fromJSON($json)->toPHP();
    }

    /** Résultat BSON → structure JSON lisible (ObjectId → {"$oid"}, dates ISO…). */
    public static function toJson(mixed $value): mixed
    {
        if (is_array($value) && array_is_list($value)) {
            return json_decode(PackedArray::fromPHP($value)->toRelaxedExtendedJSON(), true);
        }

        return json_decode(Document::fromPHP($value)->toRelaxedExtendedJSON(), true);
    }

    /* -------------------------------- Lecture -------------------------------- */

    public function version(): string
    {
        return 'MongoDB '.$this->manager->executeCommand('admin', new Command(['buildInfo' => 1]))->toArray()[0]->version;
    }

    /** @return list<string> */
    public function listDatabases(): array
    {
        $res = $this->manager->executeCommand('admin', new Command(['listDatabases' => 1, 'nameOnly' => true]))->toArray()[0];

        return array_map(fn ($d) => $d->name, $res->databases);
    }

    /** @return array{database: string, collections: list<array{name: string, type: string}>} */
    public function listCollections(?string $db): array
    {
        $name = $this->db($db);
        $cursor = $this->manager->executeCommand($name, new Command(['listCollections' => 1, 'nameOnly' => true]));

        return ['database' => $name, 'collections' => array_map(fn ($c) => ['name' => $c->name, 'type' => $c->type ?? 'collection'], $cursor->toArray())];
    }

    /** @return array<string, mixed> */
    public function describeCollection(?string $db, string $collection, int $sampleSize): array
    {
        $name = $this->db($db);
        $docs = $this->aggregateRaw($name, $collection, [['$sample' => ['size' => $sampleSize]]]);
        $indexes = $this->manager->executeCommand($name, new Command(['listIndexes' => $collection]))->toArray();
        $count = $this->manager->executeCommand($name, new Command(['count' => $collection, 'maxTimeMS' => self::MAX_TIME_MS]))->toArray()[0]->n ?? 0;

        return [
            'collection' => $collection,
            'estimatedCount' => $count,
            'sampled' => count($docs),
            'fields' => self::inferSchema($docs),
            'indexes' => array_map(fn ($i) => ['name' => $i->name, 'key' => self::toJson($i->key), 'unique' => (bool) ($i->unique ?? false)], $indexes),
            'example' => $docs ? self::toJson($docs[0]) : null,
        ];
    }

    /** @return array{count: int, documents: list<mixed>} */
    public function find(?string $db, string $collection, mixed $filter, mixed $projection, mixed $sort, int $limit, int $skip): array
    {
        $options = ['limit' => $limit, 'skip' => $skip, 'maxTimeMS' => self::MAX_TIME_MS];
        if (! empty($projection)) {
            $options['projection'] = self::fromJson($projection);
        }
        if (! empty($sort)) {
            $options['sort'] = self::fromJson($sort);
        }
        $docs = $this->manager->executeQuery($this->db($db).'.'.$collection, new Query(self::fromJson($filter), $options))->toArray();

        return ['count' => count($docs), 'documents' => $docs ? self::toJson($docs) : []];
    }

    public function count(?string $db, string $collection, mixed $filter): int
    {
        $res = $this->aggregateRaw($this->db($db), $collection, [['$match' => self::fromJson($filter)], ['$count' => 'n']]);

        return $res ? (int) $res[0]->n : 0;
    }

    /**
     * @param  list<array<string, mixed>>  $pipeline
     * @return array{count: int, documents: list<mixed>}
     */
    public function aggregate(?string $db, string $collection, array $pipeline, bool $readOnly, int $maxRows): array
    {
        $stages = array_map(self::fromJson(...), $pipeline);
        $writes = false;
        foreach ($stages as $stage) {
            $op = array_key_first((array) $stage);
            if (in_array($op, ['$out', '$merge'], true)) {
                if ($readOnly) {
                    throw new RuntimeException("L'étape {$op} est interdite en lecture seule.");
                }
                $writes = true;
            }
        }
        if (! $writes) {
            $stages[] = (object) ['$limit' => $maxRows];
        }
        $docs = $this->aggregateRaw($this->db($db), $collection, $stages);

        return ['count' => count($docs), 'documents' => $docs ? self::toJson($docs) : []];
    }

    /** @return list<object> */
    private function aggregateRaw(string $db, string $collection, array $pipeline): array
    {
        return $this->manager->executeCommand($db, new Command([
            'aggregate' => $collection, 'pipeline' => $pipeline, 'cursor' => new stdClass, 'maxTimeMS' => self::MAX_TIME_MS,
        ]))->toArray();
    }

    /* -------------------------------- Écriture -------------------------------- */

    /** @param  list<array<string, mixed>>  $documents */
    public function insert(?string $db, string $collection, array $documents): array
    {
        $bulk = new BulkWrite;
        $ids = [];
        foreach ($documents as $doc) {
            $ids[] = $bulk->insert(self::fromJson($doc));
        }
        $res = $this->manager->executeBulkWrite($this->db($db).'.'.$collection, $bulk);
        $ids = array_values(array_filter($ids));

        return ['insertedCount' => $res->getInsertedCount(), 'insertedIds' => $ids ? self::toJson($ids) : []];
    }

    public function update(?string $db, string $collection, mixed $filter, mixed $update, bool $many, bool $upsert): array
    {
        $bulk = new BulkWrite;
        $bulk->update(self::fromJson($filter), self::fromJson($update), ['multi' => $many, 'upsert' => $upsert]);
        $res = $this->manager->executeBulkWrite($this->db($db).'.'.$collection, $bulk);

        return ['matched' => $res->getMatchedCount(), 'modified' => $res->getModifiedCount(), 'upserted' => $res->getUpsertedCount()];
    }

    public function delete(?string $db, string $collection, mixed $filter, bool $many): array
    {
        if (empty($filter)) {
            throw new RuntimeException('Un filtre vide supprimerait toute la collection.');
        }
        $bulk = new BulkWrite;
        $bulk->delete(self::fromJson($filter), ['limit' => $many ? 0 : 1]);
        $res = $this->manager->executeBulkWrite($this->db($db).'.'.$collection, $bulk);

        return ['deleted' => $res->getDeletedCount()];
    }

    /* ------------------------------ Schéma déduit ------------------------------ */

    /** @param  list<object>  $docs */
    private static function inferSchema(array $docs): array
    {
        $stats = [];
        foreach ($docs as $doc) {
            self::walk($doc, '', $stats, 0);
        }

        return array_map(fn ($field, $s) => [
            'field' => (string) $field,
            'types' => array_keys($s['types']),
            'presence' => ($docs ? round($s['count'] / count($docs) * 100) : 0).'%',
        ], array_keys($stats), $stats);
    }

    private static function walk(object|array $doc, string $prefix, array &$stats, int $depth): void
    {
        foreach ((array) $doc as $key => $value) {
            $path = $prefix === '' ? (string) $key : "{$prefix}.{$key}";
            $type = self::typeOf($value);
            $stats[$path] ??= ['types' => [], 'count' => 0];
            $stats[$path]['types'][$type] = true;
            $stats[$path]['count']++;
            if ($type === 'object' && $depth < 4) {
                self::walk($value, $path, $stats, $depth + 1);
            }
            if ($type === 'array' && $depth < 4) {
                foreach ((array) $value as $item) {
                    if (self::typeOf($item) === 'object') {
                        self::walk($item, "{$path}[]", $stats, $depth + 1);
                        break;
                    }
                }
            }
        }
    }

    private static function typeOf(mixed $value): string
    {
        return match (true) {
            $value === null => 'null',
            is_array($value) => 'array',
            $value instanceof \MongoDB\BSON\Type => (new \ReflectionClass($value))->getShortName(),
            $value instanceof stdClass => 'object',
            is_int($value), is_float($value) => 'number',
            default => gettype($value),
        };
    }
}
