<?php

use App\Http\Middleware\AuthorizeMcpConnection;
use App\Mcp\Servers\DatabaseServer;
use Laravel\Mcp\Facades\Mcp;

/*
| Serveur MCP : une URL par connexion, protégée par OAuth 2.1 (Passport).
| Mcp::oauthRoutes() publie la découverte (/.well-known/…) et l'enregistrement
| dynamique des clients (/oauth/register) attendus par Claude, ChatGPT et Copilot.
*/

Mcp::oauthRoutes();

Mcp::web('/mcp/{connection}', DatabaseServer::class)
    ->middleware(['auth:api', AuthorizeMcpConnection::class]);
