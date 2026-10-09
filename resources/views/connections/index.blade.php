@extends('layouts.app')
@section('title', 'Connexions')

@section('content')
    @php($me = auth()->user())
    <section class="card">
        <div class="section-head">
            <h2>{{ $me->isAdmin() ? 'Toutes les connexions' : 'Mes connexions' }}</h2>
            <a href="{{ route('connections.create') }}" class="btn primary">+ Nouvelle connexion</a>
        </div>

        @if ($connections->isEmpty())
            <p class="hint">
                {{ $me->isAdmin()
                    ? 'Aucune connexion pour l’instant. Créez-en une pour obtenir une URL MCP.'
                    : 'Aucune connexion. Créez une connexion privée ou demandez à un administrateur de vous en attribuer une.' }}
            </p>
        @endif

        <ul class="conn-list">
            @foreach ($connections as $c)
                @php($manage = $c->canBeManagedBy($me))
                <li class="conn">
                    <div class="conn-head">
                        <strong>{{ $c->name }}</strong>
                        <span class="badge">{{ $c->typeLabel() }}</span>
                        <span class="badge {{ $c->read_only ? 'ok' : 'warn' }}">{{ $c->read_only ? 'Lecture seule' : 'Écriture' }}</span>
                        @if ($c->isPrivate())
                            <span class="badge muted">{{ $me->isAdmin() ? 'Privée · '.$c->owner?->email : 'Privée' }}</span>
                        @elseif (! $me->isAdmin())
                            <span class="badge muted">Attribuée par un administrateur</span>
                        @endif
                        @if ($c->isExpired())
                            <span class="badge error">Expirée</span>
                        @endif
                    </div>

                    <div class="url-box compact">
                        <code>{{ $c->mcpUrl() }}</code>
                        <button type="button" class="btn ghost" data-copy="{{ $c->mcpUrl() }}">Copier</button>
                    </div>

                    <dl class="meta">
                        <div><dt>Créée</dt><dd>{{ $c->created_at->format('d/m/Y H:i') }}</dd></div>
                        <div><dt>Dernière utilisation</dt><dd>{{ $c->last_used_at?->format('d/m/Y H:i') ?? 'jamais' }}</dd></div>
                        @if ($c->expires_at)
                            <div><dt>Expire</dt><dd>{{ $c->expires_at->format('d/m/Y') }}</dd></div>
                        @endif
                        @if ($me->isAdmin() && ! $c->isPrivate())
                            <div><dt>Utilisateurs ayant accès</dt><dd>{{ $c->users->pluck('email')->join(', ') ?: 'aucun (administrateurs seulement)' }}</dd></div>
                        @endif
                    </dl>

                    @if ($me->isAdmin() && ! $c->isPrivate())
                        <details class="access-box">
                            <summary><strong>Gérer l’accès</strong></summary>
                            @if ($users->isEmpty())
                                <p class="hint">Aucun utilisateur. Créez-en dans l’onglet « Utilisateurs ».</p>
                            @else
                                <form method="POST" action="{{ route('connections.assign', $c) }}">
                                    @csrf
                                    @method('PUT')
                                    <ul class="checklist">
                                        @foreach ($users as $u)
                                            <li>
                                                <label class="check">
                                                    <input type="checkbox" name="users[]" value="{{ $u->id }}" @checked($c->users->contains($u))>
                                                    <span>
                                                        <strong>{{ $u->name }}</strong>
                                                        <small>{{ $u->email }}{{ $u->status !== 'active' ? ' · '.($u->status === 'invited' ? 'invitation en attente' : 'désactivé') : '' }}</small>
                                                    </span>
                                                </label>
                                            </li>
                                        @endforeach
                                    </ul>
                                    <p class="hint">Retirer un utilisateur coupe immédiatement l’accès de ses assistants à cette connexion.</p>
                                    <div class="actions compact"><button class="btn primary">Enregistrer</button></div>
                                </form>
                            @endif
                        </details>
                    @endif

                    <div class="actions compact">
                        <a href="{{ route('connections.show', $c) }}" class="btn secondary">Ajouter à un assistant</a>
                        @if ($manage)
                            <a href="{{ route('connections.edit', $c) }}" class="btn secondary">Modifier</a>
                            <form method="POST" action="{{ route('connections.destroy', $c) }}" class="inline"
                                  data-confirm="Supprimer définitivement « {{ $c->name }} » ? L’URL MCP cessera de fonctionner pour tous les assistants.">
                                @csrf
                                @method('DELETE')
                                <button class="btn danger">Supprimer</button>
                            </form>
                        @endif
                    </div>
                </li>
            @endforeach
        </ul>
    </section>
@endsection
