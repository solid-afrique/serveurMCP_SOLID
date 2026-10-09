<?php

namespace App\Mcp\Tools\Mongo;

use App\Mcp\Tools\DatabaseTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class UpdateDocuments extends DatabaseTool
{
    protected array $types = ['mongodb'];

    protected bool $writes = true;

    protected string $name = 'update_documents';

    protected string $title = 'Modifier des documents';

    protected string $description = 'Met à jour les documents correspondant au filtre (opérateurs $set, $inc…). Demandez confirmation avant l\'appel.';

    public function schema(JsonSchema $schema): array
    {
        return [
            'collection' => $schema->string()->description('Nom de la collection')->required(),
            'filter' => $schema->object()->description('Filtre (obligatoire)')->required(),
            'update' => $schema->object()->description('Mise à jour, ex. {"$set": {"status": "done"}}')->required(),
            'many' => $schema->boolean()->description('true pour modifier tous les documents correspondants'),
            'upsert' => $schema->boolean(),
            'database' => $schema->string()->description('Base de données (par défaut : celle de la connexion)'),
        ];
    }

    public function handle(Request $request): Response
    {
        return $this->run(fn () => $this->mongo()->update(
            $request->get('database'),
            (string) $request->get('collection'),
            $request->get('filter'),
            $request->get('update'),
            (bool) $request->get('many', false),
            (bool) $request->get('upsert', false),
        ));
    }
}
