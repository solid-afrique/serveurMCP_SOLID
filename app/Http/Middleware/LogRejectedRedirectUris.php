<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Journalise les adresses de retour refusées lors de l'enregistrement dynamique d'un assistant
 * (POST /oauth/register) : la réponse renvoyée à l'assistant ne les cite pas, alors qu'il faut
 * connaître le domaine exact pour l'ajouter à MCP_REDIRECT_DOMAINS.
 */
class LogRejectedRedirectUris
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if ($request->is('oauth/register') && $response->getStatusCode() === 400
            && str_contains((string) $response->getContent(), 'invalid_redirect_uri')) {
            Log::warning('Enregistrement OAuth refusé : domaine de retour non autorisé. Ajoutez-le à MCP_REDIRECT_DOMAINS.', [
                'client_name' => $request->input('client_name'),
                'redirect_uris' => (array) $request->input('redirect_uris'),
            ]);
        }

        return $response;
    }
}
