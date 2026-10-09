@extends('layouts.guest')
@section('title', 'Connexion')

@section('content')
    <h1>Serveur MCP</h1>
    <p class="hint">Connectez-vous avec votre compte.</p>

    <form method="POST" action="{{ url('/login') }}">
        @csrf
        <label class="field">
            <span>Identifiant (e-mail)</span>
            <input type="email" name="email" value="{{ old('email') }}" autocomplete="username" required autofocus>
        </label>
        <label class="field">
            <span>Mot de passe</span>
            <input type="password" name="password" autocomplete="current-password" required>
        </label>

        @error('email')
            <p class="status error">{{ $message }}</p>
        @enderror

        <div class="actions">
            <button class="btn primary">Se connecter</button>
        </div>
        <p class="hint">Mot de passe oublié ? Demandez un lien de réinitialisation à un administrateur.</p>
    </form>
@endsection
