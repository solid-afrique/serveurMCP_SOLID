@extends('layouts.app')
@section('title', 'Mon compte')

@section('content')
    <section class="card">
        <h2>Assistants autorisés</h2>
        @if ($assistants->isEmpty())
            <p class="hint">Aucun assistant n’est autorisé avec votre compte pour l’instant.</p>
        @else
            <p class="hint">Ces applications peuvent interroger, en votre nom, les connexions auxquelles vous avez accès.</p>
            <ul class="assistants">
                @foreach ($assistants as $a)
                    <li>
                        <span>
                            <span class="client-name">{{ $a->name }}</span><br>
                            <span class="hint-inline">Dernière autorisation : {{ \Illuminate\Support\Carbon::parse($a->authorized_at)->format('d/m/Y H:i') }}</span>
                        </span>
                        <form method="POST" action="{{ route('account.assistants.revoke', $a->client_id) }}"
                              data-confirm="Déconnecter {{ $a->name }} ? Il devra être autorisé de nouveau.">
                            @csrf
                            @method('DELETE')
                            <button class="btn secondary">Déconnecter</button>
                        </form>
                    </li>
                @endforeach
            </ul>
        @endif
    </section>

    <form class="card narrow" method="POST" action="{{ route('account.password') }}">
        @csrf
        @method('PUT')
        <h2>Changer mon mot de passe</h2>
        <input type="email" name="email" value="{{ auth()->user()->email }}" autocomplete="username" hidden readonly>
        <label class="field">
            <span>Mot de passe actuel</span>
            <input type="password" name="current_password" autocomplete="current-password" required>
            @error('current_password') <span class="field-error">{{ $message }}</span> @enderror
        </label>
        <label class="field">
            <span>Nouveau mot de passe (10 caractères minimum)</span>
            <input type="password" name="password" minlength="10" autocomplete="new-password" required>
            @error('password') <span class="field-error">{{ $message }}</span> @enderror
        </label>
        <label class="field">
            <span>Confirmation</span>
            <input type="password" name="password_confirmation" minlength="10" autocomplete="new-password" required>
        </label>
        <div class="actions"><button class="btn primary">Changer le mot de passe</button></div>
    </form>
@endsection
