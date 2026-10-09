<?php

namespace App\Mcp\Tools\Mongo;

use App\Mcp\Tools\DatabaseTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class DeleteDocuments extends DatabaseTool
{
    protected array $types = ['mongodb'];

    protected bool $writes = true;

    protected string $name = 'delete_documents';

    protected string $title = 'Supprimer des documents';

    protected string $description = 'Supprime les documents correspondant au filtre. Demandez confirmation avant l\'appel.';

    public function schema(JsonSchema $schema): array
    {
        return [
            'collection' => $schema->string()->description('Nom de la collection')->required(),
            'filter' => $schema->object()->description('Filtre (obligatoire, {} interdit)')->required(),
            'many' => $schema->boolean()->description('true pour supprimer tous les documents correspondants'),
            'database' => $schema->string()->description('Base de données (par défaut : celle de la connexion)'),
        ];
    }

    public function handle(Request $request): Response
    {
        return $this->run(fn () => $this->mongo()->delete(
            $request->get('database'),
            (string) $request->get('collection'),
            $request->get('filter'),
            (bool) $request->get('many', false),
        ));
    }
}
