<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', 'Serveur MCP') — Bases de données</title>
    <link rel="stylesheet" href="{{ asset('css/app.css') }}">
    <script src="{{ asset('js/app.js') }}" defer></script>
</head>
<body>
<main class="page">
    <header class="hero">
        <div>
            <h1>Serveur MCP — Bases de données</h1>
            <p>Connectez vos bases MySQL, SQL Server, PostgreSQL, MongoDB ou Redis à Claude, ChatGPT, Copilot et à tout client compatible MCP. Chaque assistant est autorisé avec le compte de son utilisateur (OAuth).</p>
        </div>
        <div class="whoami">
            <span>
                <strong>{{ auth()->user()->name }}</strong>
                <span class="badge {{ auth()->user()->isAdmin() ? '' : 'muted' }}">{{ auth()->user()->isAdmin() ? 'Administrateur' : 'Utilisateur' }}</span>
            </span>
            <form method="POST" action="{{ route('logout') }}">
                @csrf
                <button class="btn ghost-lg">Déconnexion</button>
            </form>
        </div>
    </header>

    <nav class="tabs" role="tablist">
        <a href="{{ route('connections.index') }}" class="tab {{ request()->routeIs('connections.*') ? 'active' : '' }}">{{ auth()->user()->isAdmin() ? 'Connexions' : 'Mes connexions' }}</a>
        @if (auth()->user()->isAdmin())
            <a href="{{ route('users.index') }}" class="tab {{ request()->routeIs('users.*') ? 'active' : '' }}">Utilisateurs</a>
        @endif
        <a href="{{ route('account') }}" class="tab {{ request()->routeIs('account*') ? 'active' : '' }}">Mon compte</a>
    </nav>

    @if (session('status'))
        <div class="banner ok" role="status">{{ session('status') }}</div>
    @endif
    @if ($errors->has('user'))
        <div class="banner error">{{ $errors->first('user') }}</div>
    @endif

    @yield('content')

    <footer class="footer">Transport MCP : Streamable HTTP · OAuth 2.1 · MySQL · SQL Server · PostgreSQL · MongoDB · Redis</footer>
</main>
</body>
</html>
