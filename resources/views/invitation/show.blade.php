@extends('layouts.guest')
@section('title', 'Choisir un mot de passe')

@section('content')
    @if (! $invitation)
        <h1>Lien invalide</h1>
        <p class="status error">Ce lien est invalide, expiré ou a déjà été utilisé. Demandez un nouveau lien à un administrateur.</p>
    @else
        @php($reset = $invitation->user->status === 'active')
        <h1>{{ $reset ? 'Nouveau mot de passe' : 'Bienvenue '.$invitation->user->name }}</h1>
        <p class="hint">
            Compte : <strong>{{ $invitation->user->email }}</strong>.
            {{ $reset ? 'Choisissez un nouveau mot de passe.' : 'Choisissez votre mot de passe pour activer votre compte.' }}
        </p>

        <form method="POST" action="{{ route('invitation.accept', $token) }}">
            @csrf
            <input type="email" name="email" value="{{ $invitation->user->email }}" autocomplete="username" hidden readonly>
            <label class="field">
                <span>Mot de passe (10 caractères minimum)</span>
                <input type="password" name="password" minlength="10" autocomplete="new-password" required autofocus>
            </label>
            <label class="field">
                <span>Confirmation</span>
                <input type="password" name="password_confirmation" minlength="10" autocomplete="new-password" required>
            </label>
            @error('password')
                <p class="status error">{{ $message }}</p>
            @enderror
            <div class="actions">
                <button class="btn primary">{{ $reset ? 'Changer le mot de passe' : 'Activer mon compte' }}</button>
            </div>
        </form>
    @endif
@endsection
