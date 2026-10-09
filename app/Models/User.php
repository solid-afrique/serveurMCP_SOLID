<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Laravel\Passport\Contracts\OAuthenticatable;
use Laravel\Passport\HasApiTokens;

/**
 * @property string $role   admin | user
 * @property string $status invited | active | disabled
 */
class User extends Authenticatable implements OAuthenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public const ROLE_ADMIN = 'admin';

    public const ROLE_USER = 'user';

    protected $fillable = ['name', 'email', 'password', 'role', 'status', 'last_login_at'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function isAdmin(): bool
    {
        return $this->role === self::ROLE_ADMIN;
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /** Connexions privées créées par l'utilisateur. */
    public function ownedConnections(): HasMany
    {
        return $this->hasMany(DatabaseConnection::class, 'owner_id');
    }

    /** Connexions du pool commun que les administrateurs lui ont attribuées. */
    public function assignedConnections(): BelongsToMany
    {
        return $this->belongsToMany(DatabaseConnection::class, 'connection_user', 'user_id', 'connection_id');
    }

    public function invitation(): HasOne
    {
        return $this->hasOne(Invitation::class);
    }

    /**
     * Révoque les accès OAuth accordés aux assistants (tous, ou ceux d'une application).
     * Les jetons d'accès et de rafraîchissement deviennent immédiatement inutilisables.
     */
    public function revokeAssistantAccess(?string $clientId = null): int
    {
        $ids = $this->tokens()
            ->where('revoked', false)
            ->when($clientId, fn ($q) => $q->where('client_id', $clientId))
            ->pluck('id');
        if ($ids->isEmpty()) {
            return 0;
        }
        DB::table('oauth_refresh_tokens')->whereIn('access_token_id', $ids)->update(['revoked' => true]);

        return $this->tokens()->whereIn('id', $ids)->update(['revoked' => true]);
    }
}
