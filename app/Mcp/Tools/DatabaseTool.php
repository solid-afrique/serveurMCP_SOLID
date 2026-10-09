<?php

namespace App\Mcp\Tools;

use App\Mcp\CurrentConnection;
use App\Services\Databases\MongoDatabase;
use App\Services\Databases\RedisDatabase;
use App\Services\Databases\SqlDatabase;
use Closure;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Tool;
use Throwable;

/**
 * Base des outils : chaque outil ne s'applique qu'à certains types de bases,
 * et les outils d'écriture n'existent que si la connexion n'est pas en lecture seule.
 */
abstract class DatabaseTool extends Tool
{
    private const MAX_CHARS = 100_000;

    /** Types de bases concernés (vide = tous). */
    protected array $types = [];

    /** L'outil modifie-t-il la base ? */
    protected bool $writes = false;

    public function shouldRegister(): bool
    {
        $current = CurrentConnection::resolve();
        if (! $current) {
            return false;
        }

        return ($this->types === [] || in_array($current->connection->type, $this->types, true))
            && (! $this->writes || ! $current->readOnly());
    }

    public function annotations(): array
    {
        $writes = $this->modifiesData();

        return ['readOnlyHint' => ! $writes, 'destructiveHint' => $writes, 'openWorldHint' => false];
    }

    /** Par défaut, $writes ; un outil peut en dépendre selon la connexion (ex. aggregate). */
    protected function modifiesData(): bool
    {
        return $this->writes;
    }

    protected function current(): CurrentConnection
    {
        return CurrentConnection::resolve();
    }

    protected function sql(): SqlDatabase
    {
        return $this->current()->database();
    }

    protected function mongo(): MongoDatabase
    {
        return $this->current()->database();
    }

    protected function redis(): RedisDatabase
    {
        return $this->current()->database();
    }

    /** Exécute l'outil : résultat JSON lisible, ou message d'erreur MCP (isError). */
    protected function run(Closure $callback): Response
    {
        try {
            $result = $callback();
            $text = is_string($result) ? $result : json_encode(
                $result,
                JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PRESERVE_ZERO_FRACTION,
            );
            if (mb_strlen($text) > self::MAX_CHARS) {
                $text = mb_substr($text, 0, self::MAX_CHARS)."\n… [résultat tronqué à ".self::MAX_CHARS.' caractères — affinez la requête]';
            }

            return Response::text($text);
        } catch (Throwable $e) {
            return Response::error('Erreur : '.$e->getMessage());
        }
    }
}
