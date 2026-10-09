<?php

namespace App\Mcp;

use App\Models\DatabaseConnection;
use App\Services\Databases\Databases;
use App\Services\Databases\MongoDatabase;
use App\Services\Databases\RedisDatabase;
use App\Services\Databases\SqlDatabase;

/**
 * Connexion visée par la requête MCP en cours (celle de l'URL /mcp/{connection}).
 * Enregistrée dans le conteneur par le middleware AuthorizeMcpConnection.
 */
class CurrentConnection
{
    private SqlDatabase|MongoDatabase|RedisDatabase|null $database = null;

    public function __construct(public readonly DatabaseConnection $connection) {}

    /** Ouvre la base à la première utilisation (une requête MCP = un appel d'outil). */
    public function database(): SqlDatabase|MongoDatabase|RedisDatabase
    {
        return $this->database ??= Databases::open($this->connection->config);
    }

    public function readOnly(): bool
    {
        return $this->connection->read_only;
    }

    public function maxRows(): int
    {
        return $this->connection->max_rows;
    }

    public static function resolve(): ?self
    {
        return app()->bound(self::class) ? app(self::class) : null;
    }
}
