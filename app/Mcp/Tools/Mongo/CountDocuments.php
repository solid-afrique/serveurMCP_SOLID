<?php

namespace App\Mcp\Tools\Mongo;

use App\Mcp\Tools\DatabaseTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class CountDocuments extends DatabaseTool
{
    protected array $types = ['mongodb'];

    protected string $name = 'count_documents';

    protected string $title = 'Compter des documents';

    protected string $description = 'Compte les documents correspondant à un filtre.';

    public function schema(JsonSchema $schema): array
    {
        return [
            'collection' => $schema->string()->description('Nom de la collection')->required(),
            'filter' => $schema->object()->description('Filtre MongoDB (Extended JSON accepté)'),
            'database' => $schema->string()->description('Base de données (par défaut : celle de la connexion)'),
        ];
    }

    public function handle(Request $request): Response
    {
        return $this->run(fn () => ['count' => $this->mongo()->count(
            $request->get('database'),
            (string) $request->get('collection'),
            $request->get('filter'),
        )]);
    }
}
