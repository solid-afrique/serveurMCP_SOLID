{{--
    Écran de consentement OAuth (Passport), affiché quand un assistant (Claude, ChatGPT, Copilot…)
    demande l'accès. La personne est déjà connectée : elle approuve ou refuse.
    Variables fournies par Passport : $client, $user, $scopes, $request, $authToken.
--}}
@php
    $resource = (string) $request->query('resource', '');
    $connectionId = preg_match('#/mcp/([A-Za-z0-9]+)/?$#', parse_url($resource, PHP_URL_PATH) ?? '', $m) ? $m[1] : null;
    $connection = $connectionId ? \App\Models\DatabaseConnection::find($connectionId) : null;
    $canUse = $connection && $connection->canBeUsedBy($user);
    $redirectHost = parse_url((string) $request->query('redirect_uri', ''), PHP_URL_HOST) ?: parse_url((string) $request->query('redirect_uri', ''), PHP_URL_SCHEME);
@endphp
@extends('layouts.guest')
@section('title', 'Autoriser l’accès')

@section('content')
    <h1>Autoriser l’accès</h1>
    <p>
        <strong class="client-name">{{ $client->name }}</strong> demande à accéder à vos bases de données
        @if ($connection)
            , en commençant par <strong>{{ $connection->name }}</strong> ({{ $connection->typeLabel() }}, {{ $connection->read_only ? 'lecture seule' : 'lecture et écriture' }}).
        @else
            .
        @endif
    </p>

    @if ($connection && ! $canUse)
        <p class="status error">Votre compte n’a pas accès à cette connexion : l’assistant sera autorisé mais ses requêtes seront refusées. Demandez l’accès à un administrateur.</p>
    @endif

    <p class="hint">
        Compte : <strong>{{ $user->email }}</strong>. L’assistant pourra utiliser les connexions auxquelles ce compte a accès, jusqu’à ce que vous le déconnectiez (Mon compte).
        @if ($redirectHost)
            Vous serez ensuite redirigé vers <code>{{ $redirectHost }}</code>.
        @endif
        N’autorisez que si vous venez vous-même d’ajouter ce connecteur.
    </p>

    <div class="actions">
        <form method="POST" action="{{ route('passport.authorizations.deny') }}">
            @csrf
            @method('DELETE')
            <input type="hidden" name="state" value="">
            <input type="hidden" name="client_id" value="{{ $client->getKey() }}">
            <input type="hidden" name="auth_token" value="{{ $authToken }}">
            <button class="btn secondary">Refuser</button>
        </form>
        <form method="POST" action="{{ route('passport.authorizations.approve') }}">
            @csrf
            <input type="hidden" name="state" value="">
            <input type="hidden" name="client_id" value="{{ $client->getKey() }}">
            <input type="hidden" name="auth_token" value="{{ $authToken }}">
            <button class="btn primary">Autoriser</button>
        </form>
    </div>
@endsection
