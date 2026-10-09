<?php

namespace App\Mcp\Tools\Sql;

use App\Mcp\Tools\DatabaseTool;
use App\Models\DatabaseConnection;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class RunQuery extends DatabaseTool
{
    protected array $types = DatabaseConnection::SQL_TYPES;

    protected string $name = 'run_query';

    protected string $title = 'Exécuter une requête de lecture';

    public function description(): string
    {
        $c = $this->current();

        return 'Exécute UNE requête SQL de lecture (SELECT, WITH, SHOW, EXPLAIN…) sur '.$c->connection->typeLabel()
            .' et renvoie au plus '.$c->maxRows().' lignes. Utilisez des paramètres « ? » plutôt que de concaténer des valeurs.';
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'sql' => $schema->string()->description('Requête SQL')->required(),
            'params' => $schema->array()->description('Valeurs des paramètres « ? » de la requête, dans l\'ordre'),
        ];
    }

    public function handle(Request $request): Response
    {
        return $this->run(fn () => $this->sql()->query(
            (string) $request->get('sql'),
            (array) ($request->get('params') ?? []),
            readOnly: true,
            maxRows: $this->current()->maxRows(),
        ));
    }
}
