<?php

namespace App\Http\Middleware;

use App\Mcp\CurrentConnection;
use App\Models\DatabaseConnection;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Après l'authentification OAuth (auth:api) : vérifie, à chaque requête MCP, que la connexion
 * existe, n'a pas expiré et que le titulaire du jeton (compte actif) y a toujours accès.
 * Retirer un utilisateur d'une connexion ou désactiver son compte prend donc effet immédiatement.
 */
class AuthorizeMcpConnection
{
    public function handle(Request $request, Closure $next): Response
    {
        $connection = DatabaseConnection::find($request->route('connection'));
        if (! $connection) {
            return $this->error(404, 'Cette connexion n\'existe pas ou a été supprimée.');
        }

        $user = $request->user();
        if (! $user || ! $connection->canBeUsedBy($user)) {
            return $this->error(403, 'Vous n\'avez pas (ou plus) accès à cette connexion.');
        }
        if ($connection->isExpired()) {
            return $this->error(403, 'Cette connexion a expiré.');
        }

        app()->instance(CurrentConnection::class, new CurrentConnection($connection));

        // Date de dernière utilisation, mise à jour au plus une fois par minute.
        if (! $connection->last_used_at || $connection->last_used_at->lt(now()->subMinute())) {
            $connection->forceFill(['last_used_at' => now()])->saveQuietly();
        }

        return $next($request);
    }

    private function error(int $status, string $message): JsonResponse
    {
        return response()->json(['jsonrpc' => '2.0', 'error' => ['code' => -32001, 'message' => $message], 'id' => null], $status);
    }
}
