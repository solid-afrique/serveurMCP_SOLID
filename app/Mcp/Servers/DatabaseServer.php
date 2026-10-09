<?php

namespace App\Mcp\Servers;

use App\Mcp\CurrentConnection;
use App\Mcp\Tools;
use Laravel\Mcp\Server;

/**
 * Serveur MCP d'une connexion (URL /mcp/{connection}). Les outils exposés dépendent
 * du type de base et du mode lecture seule (voir DatabaseTool::shouldRegister).
 */
class DatabaseServer extends Server
{
    protected string $name = 'Serveur MCP — Bases de données';

    protected string $version = '1.0.0';

    protected array $tools = [
        Tools\ConnectionInfo::class,
        Tools\Sql\ListTables::class,
        Tools\Sql\DescribeTable::class,
        Tools\Sql\RunQuery::class,
        Tools\Sql\ExecuteStatement::class,
        Tools\Mongo\ListDatabases::class,
        Tools\Mongo\ListCollections::class,
        Tools\Mongo\DescribeCollection::class,
        Tools\Mongo\Find::class,
        Tools\Mongo\CountDocuments::class,
        Tools\Mongo\Aggregate::class,
        Tools\Mongo\InsertDocuments::class,
        Tools\Mongo\UpdateDocuments::class,
        Tools\Mongo\DeleteDocuments::class,
        Tools\Redis\ScanKeys::class,
        Tools\Redis\GetKey::class,
        Tools\Redis\ServerInfo::class,
        Tools\Redis\RunCommand::class,
    ];

    protected function boot(): void
    {
        $current = CurrentConnection::resolve();
        if (! $current) {
            return;
        }
        $c = $current->connection;

        $this->name = "Base de données — {$c->name}";
        $this->instructions = implode("\n", [
            "Ce serveur MCP donne accès à la base « {$c->name} » ({$c->typeLabel()}).",
            $c->read_only
                ? 'La connexion est en LECTURE SEULE : toute tentative d\'écriture sera refusée.'
                : 'La connexion autorise les écritures : demandez confirmation à l\'utilisateur avant toute modification.',
            "Les résultats sont limités à {$c->max_rows} lignes/documents par appel.",
            'Commencez par explorer la structure (liste des tables/collections, description) avant d\'écrire des requêtes.',
        ]);
    }
}
