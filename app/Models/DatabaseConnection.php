<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Str;

/**
 * Base de données mise à disposition des assistants. Chaque connexion a sa propre URL MCP.
 * Les paramètres (hôte, compte, mot de passe…) sont chiffrés avec APP_KEY.
 *
 * @property string $id
 * @property string $type      mysql | sqlsrv | pgsql | mongodb | redis
 * @property array $config
 * @property ?int $owner_id    null = pool commun (administrateurs), sinon connexion privée
 */
class DatabaseConnection extends Model
{
    public const TYPES = [
        'mysql' => 'MySQL / MariaDB',
        'sqlsrv' => 'SQL Server',
        'pgsql' => 'PostgreSQL',
        'mongodb' => 'MongoDB',
        'redis' => 'Redis',
    ];

    public const SQL_TYPES = ['mysql', 'sqlsrv', 'pgsql'];

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['name', 'type', 'read_only', 'max_rows', 'config', 'owner_id', 'expires_at'];

    protected $hidden = ['config'];

    protected function casts(): array
    {
        return [
            'config' => 'encrypted:array',
            'read_only' => 'boolean',
            'max_rows' => 'integer',
            'expires_at' => 'datetime',
            'last_used_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $connection) {
            $connection->id ??= Str::random(16);
        });
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'connection_user', 'connection_id', 'user_id');
    }

    public function typeLabel(): string
    {
        return self::TYPES[$this->type] ?? $this->type;
    }

    public function isSql(): bool
    {
        return in_array($this->type, self::SQL_TYPES, true);
    }

    public function isPrivate(): bool
    {
        return $this->owner_id !== null;
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    public function mcpUrl(): string
    {
        return url('/mcp/'.$this->id);
    }

    /** Modifier, supprimer, voir la configuration : administrateur ou propriétaire. */
    public function canBeManagedBy(User $user): bool
    {
        return $user->isAdmin() || $this->owner_id === $user->id;
    }

    /** Utiliser la connexion via un assistant : gestionnaire ou utilisateur attribué, compte actif. */
    public function canBeUsedBy(User $user): bool
    {
        return $user->isActive()
            && ($this->canBeManagedBy($user) || $this->users()->whereKey($user->id)->exists());
    }

    /** Connexions visibles : toutes pour un administrateur, les siennes et celles attribuées sinon. */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        if ($user->isAdmin()) {
            return $query;
        }

        return $query->where(fn ($q) => $q
            ->where('owner_id', $user->id)
            ->orWhereHas('users', fn ($u) => $u->whereKey($user->id)));
    }

    /** Configuration renvoyée au formulaire de modification : jamais de secret. */
    public function publicConfig(): array
    {
        $config = $this->config;

        return [
            ...array_diff_key($config, array_flip(['password', 'connection_string'])),
            'has_password' => ! empty($config['password']),
            'has_connection_string' => ! empty($config['connection_string']),
        ];
    }
}
