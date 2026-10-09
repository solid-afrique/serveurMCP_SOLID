<?php

namespace App\Mcp\Tools\Redis;

use App\Mcp\Tools\DatabaseTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class RunCommand extends DatabaseTool
{
    protected array $types = ['redis'];

    protected string $name = 'run_command';

    protected string $title = 'Exécuter une commande Redis';

    public function description(): string
    {
        return $this->current()->readOnly()
            ? 'Exécute une commande Redis de lecture (GET, HGETALL, ZRANGE, XRANGE, JSON.GET, FT.SEARCH…).'
            : 'Exécute une commande Redis arbitraire. Demandez confirmation à l\'utilisateur avant toute commande d\'écriture.';
    }

    protected function modifiesData(): bool
    {
        return ! $this->current()->readOnly();
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'command' => $schema->string()->description('Nom de la commande, ex. HGETALL')->required(),
            'args' => $schema->array()->description('Arguments de la commande'),
        ];
    }

    public function handle(Request $request): Response
    {
        return $this->run(fn () => $this->redis()->command(
            (string) $request->get('command'),
            (array) ($request->get('args') ?? []),
            $this->current()->readOnly(),
        ));
    }
}
