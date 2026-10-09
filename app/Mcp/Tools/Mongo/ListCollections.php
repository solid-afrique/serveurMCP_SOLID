<?php

namespace App\Mcp\Tools\Mongo;

use App\Mcp\Tools\DatabaseTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class ListCollections extends DatabaseTool
{
    protected array $types = ['mongodb'];

    protected string $name = 'list_collections';

    protected string $title = 'Lister les collections';

    protected string $description = 'Liste les collections (et vues) d\'une base MongoDB.';

    public function schema(JsonSchema $schema): array
    {
        return ['database' => $schema->string()->description('Base de données (par défaut : celle de la connexion)')];
    }

    public function handle(Request $request): Response
    {
        return $this->run(fn () => $this->mongo()->listCollections($request->get('database')));
    }
}
