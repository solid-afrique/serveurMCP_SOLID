<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * Lien d'invitation ou de réinitialisation du mot de passe, à usage unique.
 * Seule l'empreinte SHA-256 du jeton est enregistrée.
 */
class Invitation extends Model
{
    public const LIFETIME_DAYS = 7;

    protected $fillable = ['user_id', 'token_hash', 'expires_at'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Crée un nouveau lien pour l'utilisateur (le précédent devient invalide) et renvoie l'URL. */
    public static function issueFor(User $user): string
    {
        $token = Str::random(48);
        self::updateOrCreate(
            ['user_id' => $user->id],
            ['token_hash' => hash('sha256', $token), 'expires_at' => now()->addDays(self::LIFETIME_DAYS)],
        );

        return route('invitation.show', $token);
    }

    public static function findValid(string $token): ?self
    {
        $invitation = self::with('user')->where('token_hash', hash('sha256', $token))->first();

        return $invitation && $invitation->expires_at->isFuture() && $invitation->user->status !== 'disabled'
            ? $invitation
            : null;
    }
}
