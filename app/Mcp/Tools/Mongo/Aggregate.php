<?php

namespace App\Mcp\Tools\Mongo;

use App\Mcp\Tools\DatabaseTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class Aggregate extends DatabaseTool
{
    protected array $types = ['mongodb'];

    protected string $name = 'aggregate';

    protected string $title = 'Pipeline d\'agrégation';

    public function description(): string
    {
        $c = $this->current();

        return 'Exécute un pipeline d\'agrégation et renvoie au plus '.$c->maxRows().' documents.'
            .($c->readOnly() ? ' Les étapes $out et $merge sont interdites.' : '');
    }

    /** Hors lecture seule, $out et $merge permettent d'écrire. */
    protected function modifiesData(): bool
    {
        return ! $this->current()->readOnly();
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'collection' => $schema->string()->description('Nom de la collection')->required(),
            'pipeline' => $schema->array()->items($schema->object())->description('Étapes du pipeline (Extended JSON accepté)')->required(),
            'database' => $schema->string()->description('Base de données (par défaut : celle de la connexion)'),
        ];
    }

    public function handle(Request $request): Response
    {
        return $this->run(fn () => $this->mongo()->aggregate(
            $request->get('database'),
            (string) $request->get('collection'),
            (array) ($request->get('pipeline') ?? []),
            $this->current()->readOnly(),
            $this->current()->maxRows(),
        ));
    }
}
