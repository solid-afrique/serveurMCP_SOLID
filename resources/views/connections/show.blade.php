@extends('layouts.app')
@section('title', $connection->name)

@section('content')
    @php($url = $connection->mcpUrl())
    @php($slug = \Illuminate\Support\Str::slug($connection->name) ?: 'base-de-donnees')
    <section class="card">
        <h2>{{ session('created') ? 'Connexion créée : ' : '' }}{{ $connection->name }}</h2>
        <div class="url-box">
            <code>{{ $url }}</code>
            <button type="button" class="btn primary" data-copy="{{ $url }}">Copier</button>
        </div>
        <p class="hint">
            Cette URL n’est pas secrète : elle ne donne accès à rien sans l’autorisation que chaque utilisateur accorde avec son compte.
            @if (auth()->user()->isAdmin() && ! $connection->isPrivate())
                Pensez à l’attribuer aux utilisateurs concernés (« Gérer l’accès » dans la liste des connexions).
            @endif
        </p>

        <h3>Ajouter à votre assistant</h3>
        <div data-tabs>
            <div class="tabs" role="tablist">
                @foreach (['copilot' => 'Microsoft Copilot', 'claude' => 'Claude', 'chatgpt' => 'ChatGPT', 'claude-code' => 'Claude Code', 'cursor' => 'Cursor', 'stdio' => 'Autres (stdio)'] as $key => $label)
                    <button type="button" class="tab {{ $loop->first ? 'active' : '' }}" data-tab="{{ $key }}">{{ $label }}</button>
                @endforeach
            </div>

            <div data-panel="copilot">
                <p class="hint">Microsoft 365 Copilot (et Teams) passe par un <b>agent Copilot Studio</b>. Si votre entreprise a déjà publié un agent pour cette base, ouvrez-le simplement dans Copilot et cliquez sur <b>Autoriser</b> à la première question.</p>
                <ol class="steps">
                    <li>Ouvrez <b>copilotstudio.microsoft.com</b> (et non « Créer un agent » dans Copilot : ce générateur simplifié ne gère pas le MCP), puis ouvrez ou créez votre agent.</li>
                    <li><b>Outils → Ajouter un outil → Nouvel outil → Model Context Protocol</b>.</li>
                    <li>Collez l’URL MCP, choisissez <b>OAuth 2.0 → Découverte dynamique</b>, puis <b>Créer</b>.</li>
                    <li><b>Créer une connexion</b> : connectez-vous sur la page qui s’ouvre, cliquez sur <b>Autoriser</b>, puis <b>Ajouter à l’agent</b>.</li>
                    <li><b>Publiez</b> l’agent sur le canal <b>Microsoft 365 Copilot et Teams</b> : il apparaît dans Copilot, rubrique <b>Agents</b>.</li>
                </ol>
                <p class="hint">Agent partagé : réglez l’authentification de l’outil sur <b>l’utilisateur final</b>, pour que chaque collaborateur interroge la base avec ses propres droits.</p>
            </div>
            <div data-panel="claude" hidden>
                <ol class="steps">
                    <li>Sur claude.ai ou Claude Desktop, ouvrez <b>Paramètres → Connecteurs</b>.</li>
                    <li>Cliquez sur <b>Ajouter un connecteur personnalisé</b>, donnez-lui un nom et collez l’URL MCP.</li>
                    <li>Cliquez sur <b>Se connecter</b> : la page de connexion de ce serveur s’ouvre. Connectez-vous avec votre compte, puis cliquez sur <b>Autoriser</b>.</li>
                    <li>Dans une conversation, activez le connecteur depuis le menu <b>Outils</b>.</li>
                </ol>
            </div>
            <div data-panel="chatgpt" hidden>
                <ol class="steps">
                    <li>Ouvrez <b>Paramètres → Applications et connecteurs → Paramètres avancés</b> et activez le <b>Mode développeur</b>.</li>
                    <li>Revenez à <b>Applications et connecteurs</b> puis cliquez sur <b>Créer</b>.</li>
                    <li>Collez l’URL MCP, choisissez <b>Authentification : OAuth</b> et validez.</li>
                    <li>Connectez-vous avec votre compte sur la page qui s’ouvre, puis cliquez sur <b>Autoriser</b>.</li>
                </ol>
            </div>
            <div data-panel="claude-code" hidden>
                @include('connections.partials.snippet', ['text' => "claude mcp add --transport http {$slug} \"{$url}\""])
                <p class="hint">Puis lancez <code>/mcp</code> dans Claude Code et choisissez <b>Authenticate</b>.</p>
            </div>
            <div data-panel="cursor" hidden>
                <p class="hint">Ajoutez ceci à <code>~/.cursor/mcp.json</code>, puis cliquez sur <b>Login</b> à côté du serveur dans les réglages MCP :</p>
                @include('connections.partials.snippet', ['text' => json_encode(['mcpServers' => [$slug => ['url' => $url]]], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)])
            </div>
            <div data-panel="stdio" hidden>
                <p class="hint">Pour les clients qui ne gèrent que le transport stdio, le pont <code>mcp-remote</code> s’occupe aussi de l’autorisation :</p>
                @include('connections.partials.snippet', ['text' => json_encode(['mcpServers' => [$slug => ['command' => 'npx', 'args' => ['-y', 'mcp-remote', $url]]]], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)])
            </div>
        </div>

        <div class="actions">
            <a href="{{ route('connections.index') }}" class="btn secondary">Retour aux connexions</a>
        </div>
    </section>
@endsection
