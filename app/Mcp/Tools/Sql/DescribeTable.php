<?php

namespace App\Mcp\Tools\Sql;

use App\Mcp\Tools\DatabaseTool;
use App\Models\DatabaseConnection;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class DescribeTable extends DatabaseTool
{
    protected array $types = DatabaseConnection::SQL_TYPES;

    protected string $name = 'describe_table';

    protected string $title = 'Décrire une table';

    protected string $description = 'Renvoie les colonnes (type, nullabilité, défaut) et les clés primaires/étrangères/uniques d\'une table.';

    public function schema(JsonSchema $schema): array
    {
        return [
            'table' => $schema->string()->description('Nom de la table')->required(),
            'schema' => $schema->string()->description('Schéma de la table (optionnel)'),
        ];
    }

    public function handle(Request $request): Response
    {
        return $this->run(fn () => $this->sql()->describeTable((string) $request->get('table'), $request->get('schema') ?: null));
    }
}
