<?php

namespace App\Mcp\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;

class ConnectionInfo extends DatabaseTool
{
    protected string $name = 'connection_info';

    protected string $title = 'Informations de connexion';

    protected string $description = 'Renvoie le type de base, le nom de la connexion, le mode (lecture seule ou non) et la version du serveur.';

    public function schema(JsonSchema $schema): array
    {
        return [];
    }

    public function handle(Request $request): Response
    {
        return $this->run(function () {
            $c = $this->current()->connection;

            return [
                'name' => $c->name,
                'type' => $c->typeLabel(),
                'database' => $c->config['database'] ?? null,
                'readOnly' => $c->read_only,
                'maxRows' => $c->max_rows,
                'serverVersion' => $this->current()->database()->version(),
            ];
        });
    }
}
