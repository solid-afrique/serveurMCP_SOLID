<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Assistants (clients OAuth : Claude, ChatGPT, VS Code…) autorisés par un utilisateur.
 * Un assistant reste autorisé tant qu'il détient un jeton d'accès ou de rafraîchissement valide.
 */
class AssistantAccess
{
    /** @return Collection<int, object{client_id: string, name: string, authorized_at: string}> */
    public static function forUser(User $user): Collection
    {
        $now = now();

        return DB::table('oauth_access_tokens as t')
            ->join('oauth_clients as c', 'c.id', '=', 't.client_id')
            ->leftJoin('oauth_refresh_tokens as r', 'r.access_token_id', '=', 't.id')
            ->where('t.user_id', $user->getKey())
            ->where('t.revoked', false)
            ->where(fn ($q) => $q
                ->where('t.expires_at', '>', $now)
                ->orWhere(fn ($r) => $r->where('r.revoked', false)->where('r.expires_at', '>', $now)))
            ->groupBy('t.client_id', 'c.name')
            ->orderBy('c.name')
            ->get(['t.client_id', 'c.name', DB::raw('MAX(t.created_at) as authorized_at')]);
    }

    /** Nombre d'assistants autorisés, par utilisateur (page d'administration). */
    public static function countsByUser(): Collection
    {
        $now = now();

        return DB::table('oauth_access_tokens as t')
            ->leftJoin('oauth_refresh_tokens as r', 'r.access_token_id', '=', 't.id')
            ->where('t.revoked', false)
            ->where(fn ($q) => $q
                ->where('t.expires_at', '>', $now)
                ->orWhere(fn ($r) => $r->where('r.revoked', false)->where('r.expires_at', '>', $now)))
            ->groupBy('t.user_id')
            ->selectRaw('t.user_id AS user_id, COUNT(DISTINCT t.client_id) AS assistants')
            ->pluck('assistants', 'user_id');
    }
}
