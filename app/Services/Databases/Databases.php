<?php

namespace App\Services\Databases;

use App\Models\DatabaseConnection;

/** Ouvre la bonne base selon le type de connexion. */
class Databases
{
    /** @param  array<string, mixed>  $config */
    public static function open(array $config): SqlDatabase|MongoDatabase|RedisDatabase
    {
        return match ($config['type'] ?? null) {
            'mongodb' => MongoDatabase::open($config),
            'redis' => RedisDatabase::open($config),
            default => SqlDatabase::open($config),
        };
    }

    /** Vérifie la connexion et renvoie la version du serveur (bouton « Tester la connexion »). */
    public static function version(array $config): string
    {
        return self::open($config)->version();
    }

    /** Types proposés dans le formulaire : MongoDB seulement si l'extension PHP est installée. */
    public static function availableTypes(): array
    {
        return array_filter(
            DatabaseConnection::TYPES,
            fn ($type) => $type !== 'mongodb' || MongoDatabase::available(),
            ARRAY_FILTER_USE_KEY,
        );
    }
}
