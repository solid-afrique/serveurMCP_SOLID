<x-mail::message>
# Bonjour {{ $user->name }},

@if ($reset)
{{ $sender?->name ?? 'Un administrateur' }} vous envoie un lien pour choisir un nouveau mot de passe sur le **{{ config('app.name') }}**.

<x-mail::button :url="$url">
Choisir un nouveau mot de passe
</x-mail::button>

Votre mot de passe actuel reste valable tant que ce lien n’a pas été utilisé.
@else
{{ $sender?->name ?? 'Un administrateur' }} vous invite à utiliser le **{{ config('app.name') }}**, qui permet d’interroger les bases de données de l’entreprise depuis Claude, ChatGPT ou GitHub Copilot.

<x-mail::button :url="$url">
Activer mon compte
</x-mail::button>

Ce lien vous permet de choisir votre mot de passe. Connectez-vous ensuite sur [{{ $appUrl }}]({{ $appUrl }}) : la page **Connexions** affiche l’URL MCP de chaque base qui vous est attribuée et la procédure pour l’ajouter à votre assistant.
@endif

Ce lien est personnel, ne sert qu’une fois et expire dans {{ $days }} jours. Ne le transférez pas.
Si vous n’attendiez pas ce message, ignorez-le.

<x-mail::subcopy>
Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur : <span class="break-all">[{{ $url }}]({{ $url }})</span>
</x-mail::subcopy>
</x-mail::message>
