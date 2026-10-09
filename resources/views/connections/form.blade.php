@extends('layouts.app')
@section('title', $connection ? 'Modifier une connexion' : 'Nouvelle connexion')

@section('content')
    @php
        $editing = (bool) $connection;
        $type = old('type', $config['type'] ?? array_key_first($types));
        $mode = old('mode', ! empty($config['has_connection_string']) ? 'uri' : 'fields');
        $keep = $editing ? ' (inchangé si vide)' : '';
    @endphp
    <form class="card" method="POST" data-connection-form data-test-url="{{ route('connections.test') }}"
          action="{{ $editing ? route('connections.update', $connection) : route('connections.store') }}">
        @csrf
        @if ($editing)
            @method('PUT')
            <input type="hidden" name="id" value="{{ $connection->id }}">
        @endif
        <input type="hidden" name="type" value="{{ $type }}">
        <input type="hidden" name="mode" value="{{ $mode }}">

        <h2>{{ $editing ? 'Modifier « '.$connection->name.' »' : 'Nouvelle connexion' }}</h2>
        @if ($editing)
            <p class="hint">L’URL MCP et les autorisations des assistants sont conservées.</p>
        @endif

        <div class="types" role="radiogroup" aria-label="Type de base de données">
            @foreach ($types as $key => $label)
                <button type="button" class="type" data-type="{{ $key }}">
                    <span class="type-name">{{ $label }}</span>
                    <span class="type-kind">{{ in_array($key, ['mongodb', 'redis'], true) ? 'NoSQL' : 'SQL' }}</span>
                </button>
            @endforeach
        </div>
        @error('type') <p class="field-error">{{ $message }}</p> @enderror

        <label class="field">
            <span>Nom de la connexion</span>
            <input name="name" value="{{ old('name', $connection?->name) }}" maxlength="100" placeholder="ex. Comptabilité (production)">
        </label>

        <div data-tabs>
            <div class="tabs small" role="tablist">
                <button type="button" class="tab {{ $mode === 'fields' ? 'active' : '' }}" data-tab="fields">Champs séparés</button>
                <button type="button" class="tab {{ $mode === 'uri' ? 'active' : '' }}" data-tab="uri">Chaîne de connexion</button>
            </div>

            <div data-panel="fields" @if ($mode !== 'fields') hidden @endif>
                <div class="grid">
                    <label class="field span2">
                        <span>Hôte</span>
                        <input name="host" value="{{ old('host', $config['host'] ?? '') }}" placeholder="localhost, srv-sql01, 10.0.0.25…">
                        <small>Nom ou IP du serveur de base, vu depuis ce serveur MCP. Instance nommée SQL Server : <code>srv-sql01\SQLEXPRESS</code>.</small>
                        @error('host') <span class="field-error">{{ $message }}</span> @enderror
                    </label>
                    <label class="field">
                        <span>Port</span>
                        <input name="port" inputmode="numeric" value="{{ old('port', $config['port'] ?? '') }}">
                        @error('port') <span class="field-error">{{ $message }}</span> @enderror
                    </label>
                    <label class="field">
                        <span data-database-label>Base de données</span>
                        <input name="database" value="{{ old('database', $config['database'] ?? '') }}">
                    </label>
                    <label class="field">
                        <span>Utilisateur</span>
                        <input name="user" autocomplete="off" value="{{ old('user', $config['user'] ?? '') }}">
                    </label>
                    <label class="field">
                        <span>Mot de passe{{ $keep }}</span>
                        <input type="password" name="password" autocomplete="new-password" placeholder="{{ $editing && ! empty($config['has_password']) ? '••••••••' : '' }}">
                    </label>
                </div>
            </div>

            <div data-panel="uri" @if ($mode !== 'uri') hidden @endif>
                <label class="field">
                    <span>Chaîne de connexion{{ $keep }}</span>
                    <input type="password" name="connection_string" autocomplete="off" placeholder="{{ $editing && ! empty($config['has_connection_string']) ? '••••••••' : '' }}">
                    <small class="mono" data-uri-example></small>
                    @error('connection_string') <span class="field-error">{{ $message }}</span> @enderror
                </label>
                <p class="hint">Le champ « Base de données » de l’onglet « Champs séparés », s’il est rempli, remplace la base indiquée dans la chaîne.</p>
            </div>
        </div>

        <h3>Options</h3>
        <div class="options">
            <label class="check">
                <input type="hidden" name="read_only" value="0">
                <input type="checkbox" name="read_only" value="1" @checked(old('read_only', $connection?->read_only ?? true))>
                <span><strong>Lecture seule</strong><small>Recommandé. Les outils d’écriture ne sont pas exposés à l’IA.</small></span>
            </label>
            <label class="check">
                <input type="hidden" name="ssl" value="0">
                <input type="checkbox" name="ssl" value="1" @checked(old('ssl', $config['ssl'] ?? false))>
                <span><strong>SSL / TLS</strong><small>Requis par les bases hébergées (Azure, AWS, Atlas…). Souvent inutile en réseau interne.</small></span>
            </label>
            <label class="field">
                <span>Lignes max. par réponse</span>
                <input name="max_rows" inputmode="numeric" value="{{ old('max_rows', $connection?->max_rows ?? 200) }}">
                @error('max_rows') <span class="field-error">{{ $message }}</span> @enderror
            </label>
            @unless ($editing)
                <label class="field">
                    <span>Expiration de la connexion</span>
                    <select name="expires_in_days">
                        <option value="">Jamais</option>
                        @foreach (['1' => '1 jour', '7' => '7 jours', '30' => '30 jours', '90' => '90 jours', '365' => '1 an'] as $days => $label)
                            <option value="{{ $days }}" @selected(old('expires_in_days') === $days)>{{ $label }}</option>
                        @endforeach
                    </select>
                </label>
            @endunless
        </div>

        <div class="actions">
            <a href="{{ route('connections.index') }}" class="btn ghost-lg">Annuler</a>
            <span class="spacer"></span>
            <button type="button" class="btn secondary" data-test>Tester la connexion</button>
            <button class="btn primary">{{ $editing ? 'Enregistrer' : 'Créer la connexion' }}</button>
        </div>
        <p class="status" data-test-status hidden></p>
    </form>
@endsection
