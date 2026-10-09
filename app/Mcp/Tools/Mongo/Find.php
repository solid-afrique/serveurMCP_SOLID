<?php

namespace App\Mcp\Tools\Mongo;

use App\Mcp\Tools\DatabaseTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class Find extends DatabaseTool
{
    protected array $types = ['mongodb'];

    protected string $name = 'find';

    protected string $title = 'Rechercher des documents';

    public function description(): string
    {
        return 'Recherche des documents dans une collection (au plus '.$this->current()->maxRows().').';
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'collection' => $schema->string()->description('Nom de la collection')->required(),
            'filter' => $schema->object()->description('Filtre MongoDB (Extended JSON accepté, ex. {"_id": {"$oid": "…"}})'),
            'projection' => $schema->object()->description('Projection, ex. {"name": 1, "_id": 0}'),
            'sort' => $schema->object()->description('Tri, ex. {"createdAt": -1}'),
            'limit' => $schema->integer(),
            'skip' => $schema->integer(),
            'database' => $schema->string()->description('Base de données (par défaut : celle de la connexion)'),
        ];
    }

    public function handle(Request $request): Response
    {
        return $this->run(function () use ($request) {
            $max = $this->current()->maxRows();

            return $this->mongo()->find(
                $request->get('database'),
                (string) $request->get('collection'),
                $request->get('filter'),
                $request->get('projection'),
                $request->get('sort'),
                min((int) ($request->get('limit') ?? $max) ?: $max, $max),
                max(0, (int) ($request->get('skip') ?? 0)),
            );
        });
    }
}
