<?php

namespace App\Providers;

use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Laravel\Passport\Passport;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Derrière IIS en HTTPS : toutes les URL générées (OAuth, MCP) doivent être en https.
        if (str_starts_with((string) config('app.url'), 'https://')) {
            URL::forceScheme('https');
        }

        // Derrière un proxy inverse (ARR, répartiteur) : IP de confiance (TRUSTED_PROXIES).
        // Inutile quand PHP tourne directement dans IIS (FastCGI) : l'IP du visiteur est alors connue.
        if ($proxies = config('app.trusted_proxies')) {
            TrustProxies::at($proxies === '*' ? '*' : array_map('trim', explode(',', $proxies)));
        }

        // OAuth 2.1 pour les assistants : écran de consentement et durée de vie des jetons.
        Passport::authorizationView(fn (array $parameters) => view('mcp.authorize', $parameters));
        Passport::tokensExpireIn(now()->addHour());
        Passport::refreshTokensExpireIn(now()->addDays(30));
    }
}
