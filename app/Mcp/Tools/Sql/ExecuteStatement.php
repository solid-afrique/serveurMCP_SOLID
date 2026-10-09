<?php

namespace App\Mcp\Tools\Sql;

use App\Mcp\Tools\DatabaseTool;
use App\Models\DatabaseConnection;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class ExecuteStatement extends DatabaseTool
{
    protected array $types = DatabaseConnection::SQL_TYPES;

    protected bool $writes = true;

    protected string $name = 'execute_statement';

    protected string $title = 'Exécuter une instruction d\'écriture';

    protected string $description = 'Exécute une instruction SQL qui modifie la base (INSERT, UPDATE, DELETE, CREATE, ALTER…). Demandez toujours confirmation à l\'utilisateur avant de l\'appeler.';

    public function schema(JsonSchema $schema): array
    {
        return [
            'sql' => $schema->string()->description('Instruction SQL')->required(),
            'params' => $schema->array()->description('Valeurs des paramètres « ? » de l\'instruction, dans l\'ordre'),
        ];
    }

    public function handle(Request $request): Response
    {
        return $this->run(fn () => $this->sql()->query(
            (string) $request->get('sql'),
            (array) ($request->get('params') ?? []),
            readOnly: false,
            maxRows: $this->current()->maxRows(),
        ));
    }
}
