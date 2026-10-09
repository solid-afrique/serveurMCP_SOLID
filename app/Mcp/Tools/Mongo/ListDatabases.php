<?php

namespace App\Mcp\Tools\Mongo;

use App\Mcp\Tools\DatabaseTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class ListDatabases extends DatabaseTool
{
    protected array $types = ['mongodb'];

    protected string $name = 'list_databases';

    protected string $title = 'Lister les bases';

    protected string $description = 'Liste les bases de données accessibles sur le serveur MongoDB.';

    public function schema(JsonSchema $schema): array
    {
        return [];
    }

    public function handle(Request $request): Response
    {
        return $this->run(fn () => $this->mongo()->listDatabases());
    }
}
