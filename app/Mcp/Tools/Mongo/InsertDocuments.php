<?php

namespace App\Mcp\Tools\Mongo;

use App\Mcp\Tools\DatabaseTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class InsertDocuments extends DatabaseTool
{
    protected array $types = ['mongodb'];

    protected bool $writes = true;

    protected string $name = 'insert_documents';

    protected string $title = 'Insérer des documents';

    protected string $description = 'Insère un ou plusieurs documents. Demandez confirmation à l\'utilisateur avant l\'appel.';

    public function schema(JsonSchema $schema): array
    {
        return [
            'collection' => $schema->string()->description('Nom de la collection')->required(),
            'documents' => $schema->array()->items($schema->object())->min(1)->description('Documents à insérer (Extended JSON accepté)')->required(),
            'database' => $schema->string()->description('Base de données (par défaut : celle de la connexion)'),
        ];
    }

    public function handle(Request $request): Response
    {
        return $this->run(fn () => $this->mongo()->insert(
            $request->get('database'),
            (string) $request->get('collection'),
            (array) ($request->get('documents') ?? []),
        ));
    }
}
