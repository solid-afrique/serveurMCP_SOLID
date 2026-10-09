<?php

namespace App\Mcp\Tools\Redis;

use App\Mcp\Tools\DatabaseTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class GetKey extends DatabaseTool
{
    protected array $types = ['redis'];

    protected string $name = 'get_key';

    protected string $title = 'Lire une clé';

    protected string $description = 'Lit une clé quel que soit son type (string, hash, list, set, zset, stream, JSON) avec son TTL.';

    public function schema(JsonSchema $schema): array
    {
        return ['key' => $schema->string()->required()];
    }

    public function handle(Request $request): Response
    {
        return $this->run(fn () => $this->redis()->readKey((string) $request->get('key'), $this->current()->maxRows()));
    }
}
