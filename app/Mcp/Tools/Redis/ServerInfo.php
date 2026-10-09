<?php

namespace App\Mcp\Tools\Redis;

use App\Mcp\Tools\DatabaseTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class ServerInfo extends DatabaseTool
{
    protected array $types = ['redis'];

    protected string $name = 'server_info';

    protected string $title = 'Informations serveur';

    protected string $description = 'Renvoie la sortie de INFO (section optionnelle) et le nombre de clés de la base.';

    public function schema(JsonSchema $schema): array
    {
        return ['section' => $schema->string()->description('Ex. server, memory, keyspace, stats')];
    }

    public function handle(Request $request): Response
    {
        return $this->run(fn () => $this->redis()->info($request->get('section')));
    }
}
