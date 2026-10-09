@extends('layouts.app')
@section('title', 'Utilisateurs')

@section('content')
    @php($statuses = ['invited' => ['Invitation en attente', 'warn'], 'active' => ['Actif', 'ok'], 'disabled' => ['Désactivé', 'error']])

    <form class="card" method="POST" action="{{ route('users.store') }}">
        @csrf
        <h2>Inviter un utilisateur</h2>
        <div class="grid">
            <label class="field span2">
                <span>E-mail</span>
                <input type="email" name="email" value="{{ old('email') }}" placeholder="prenom.nom@exemple.com" required>
                @error('email') <span class="field-error">{{ $message }}</span> @enderror
            </label>
            <label class="field">
                <span>Nom (optionnel)</span>
                <input name="name" value="{{ old('name') }}" maxlength="80">
            </label>
        </div>
        <div class="actions">
            <button class="btn primary">Créer et obtenir le lien d’invitation</button>
        </div>

        @if ($invite = session('invite'))
            <div class="access-box">
                <strong>{{ $invite['reset'] ? 'Lien de réinitialisation' : 'Lien d’invitation' }} pour {{ $invite['email'] }}</strong>
                <div class="url-box">
                    <code>{{ $invite['url'] }}</code>
                    <button type="button" class="btn primary" data-copy="{{ $invite['url'] }}">Copier</button>
                </div>
                <p class="hint">
                    Transmettez ce lien à l’utilisateur par un canal de confiance : il permet de choisir le mot de passe du compte.
                    Il est valable 7 jours et ne sert qu’une fois{{ $invite['reset'] ? ' ; le mot de passe actuel reste valable jusqu’à son utilisation' : '' }}.
                </p>
            </div>
        @endif
    </form>

    <section class="card">
        <h2>Utilisateurs</h2>
        <ul class="conn-list">
            @foreach ($users as $u)
                @php([$label, $badge] = $statuses[$u->status] ?? [$u->status, 'muted'])
                @php($self = $u->is(auth()->user()))
                <li class="conn">
                    <div class="conn-head">
                        <strong>{{ $u->name }}</strong>
                        <span class="hint">{{ $u->email }}</span>
                        <span class="badge {{ $badge }}">{{ $label }}</span>
                        @if ($u->isAdmin()) <span class="badge">Administrateur</span> @endif
                        @if ($self) <span class="badge muted">Vous</span> @endif
                    </div>
                    <dl class="meta">
                        <div><dt>Créé</dt><dd>{{ $u->created_at->format('d/m/Y H:i') }}</dd></div>
                        <div><dt>Dernière connexion</dt><dd>{{ $u->last_login_at?->format('d/m/Y H:i') ?? 'jamais' }}</dd></div>
                        <div><dt>Connexions attribuées</dt><dd>{{ $u->assigned_connections_count }}</dd></div>
                        <div><dt>Connexions privées</dt><dd>{{ $u->owned_connections_count }}</dd></div>
                        <div><dt>Assistants autorisés</dt><dd>{{ $assistants[$u->id] ?? 0 }}</dd></div>
                    </dl>

                    @unless ($self)
                        <div class="actions compact">
                            @if ($u->status !== 'disabled')
                                <form method="POST" action="{{ route('users.invite', $u) }}" class="inline"
                                      @if ($u->status === 'active') data-confirm="Générer un lien de réinitialisation du mot de passe pour {{ $u->email }} ?" @endif>
                                    @csrf
                                    <button class="btn secondary">{{ $u->status === 'invited' ? 'Nouveau lien d’invitation' : 'Réinitialiser le mot de passe' }}</button>
                                </form>
                            @endif

                            <form method="POST" action="{{ route('users.update', $u) }}" class="inline"
                                  data-confirm="{{ $u->isAdmin() ? 'Retirer le rôle administrateur à '.$u->email.' ?' : 'Nommer '.$u->email.' administrateur ? Il pourra gérer toutes les connexions et tous les utilisateurs.' }}">
                                @csrf
                                @method('PATCH')
                                <input type="hidden" name="role" value="{{ $u->isAdmin() ? 'user' : 'admin' }}">
                                <button class="btn secondary">{{ $u->isAdmin() ? 'Retirer le rôle admin' : 'Nommer administrateur' }}</button>
                            </form>

                            @if ($u->status === 'active')
                                <form method="POST" action="{{ route('users.update', $u) }}" class="inline"
                                      data-confirm="Désactiver {{ $u->email }} ? Ses sessions et ses assistants sont coupés immédiatement.">
                                    @csrf
                                    @method('PATCH')
                                    <input type="hidden" name="status" value="disabled">
                                    <button class="btn secondary">Désactiver</button>
                                </form>
                            @elseif ($u->status === 'disabled')
                                <form method="POST" action="{{ route('users.update', $u) }}" class="inline">
                                    @csrf
                                    @method('PATCH')
                                    <input type="hidden" name="status" value="active">
                                    <button class="btn secondary">Réactiver</button>
                                </form>
                            @endif

                            @if (($assistants[$u->id] ?? 0) > 0)
                                <form method="POST" action="{{ route('users.assistants.revoke', $u) }}" class="inline"
                                      data-confirm="Déconnecter tous les assistants de {{ $u->email }} ? Ils devront être autorisés de nouveau.">
                                    @csrf
                                    @method('DELETE')
                                    <button class="btn secondary">Déconnecter ses assistants</button>
                                </form>
                            @endif

                            <form method="POST" action="{{ route('users.destroy', $u) }}" class="inline"
                                  data-confirm="Supprimer définitivement {{ $u->email }} ? Ses {{ $u->owned_connections_count }} connexion(s) privée(s) et tous ses accès seront supprimés.">
                                @csrf
                                @method('DELETE')
                                <button class="btn danger">Supprimer</button>
                            </form>
                        </div>
                    @endunless
                </li>
            @endforeach
        </ul>
    </section>
@endsection
