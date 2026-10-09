<?php

namespace App\Mcp\Tools\Redis;

use App\Mcp\Tools\DatabaseTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class ScanKeys extends DatabaseTool
{
    protected array $types = ['redis'];

    protected string $name = 'scan_keys';

    protected string $title = 'Parcourir les clés';

    public function description(): string
    {
        return 'Parcourt les clés avec SCAN (sans bloquer le serveur) et renvoie au plus '.$this->current()->maxRows().' clés.';
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'pattern' => $schema->string()->description('Motif glob, ex. user:* (défaut *)'),
            'type' => $schema->string()->enum(['string', 'hash', 'list', 'set', 'zset', 'stream'])->description('Filtrer par type'),
        ];
    }

    public function handle(Request $request): Response
    {
        return $this->run(fn () => $this->redis()->scanKeys($request->get('pattern'), $request->get('type'), $this->current()->maxRows()));
    }
}
