<?php

namespace App\Mcp\Tools\Mongo;

use App\Mcp\Tools\DatabaseTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class DescribeCollection extends DatabaseTool
{
    protected array $types = ['mongodb'];

    protected string $name = 'describe_collection';

    protected string $title = 'Décrire une collection';

    protected string $description = 'Déduit le schéma d\'une collection à partir d\'un échantillon de documents, et renvoie ses index et le nombre estimé de documents.';

    public function schema(JsonSchema $schema): array
    {
        return [
            'collection' => $schema->string()->description('Nom de la collection')->required(),
            'database' => $schema->string()->description('Base de données (par défaut : celle de la connexion)'),
            'sampleSize' => $schema->integer()->description('Taille de l\'échantillon (défaut 50, maximum 500)'),
        ];
    }

    public function handle(Request $request): Response
    {
        return $this->run(fn () => $this->mongo()->describeCollection(
            $request->get('database'),
            (string) $request->get('collection'),
            max(1, min(500, (int) ($request->get('sampleSize') ?? 50))),
        ));
    }
}
