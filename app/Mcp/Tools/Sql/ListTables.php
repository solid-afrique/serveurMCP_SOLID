<?php

namespace App\Mcp\Tools\Sql;

use App\Mcp\Tools\DatabaseTool;
use App\Models\DatabaseConnection;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class ListTables extends DatabaseTool
{
    protected array $types = DatabaseConnection::SQL_TYPES;

    protected string $name = 'list_tables';

    protected string $title = 'Lister les tables';

    protected string $description = 'Liste les tables et vues de la base (schéma, nom, type).';

    public function schema(JsonSchema $schema): array
    {
        return ['schema' => $schema->string()->description('Filtrer sur un schéma précis')];
    }

    public function handle(Request $request): Response
    {
        return $this->run(fn () => $this->sql()->listTables($request->get('schema') ?: null));
    }
}
