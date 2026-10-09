<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Bases de données mises à disposition des assistants (une URL MCP par connexion).
        Schema::create('database_connections', function (Blueprint $table) {
            // Identifiant aléatoire utilisé dans l'URL MCP (non secret).
            $table->string('id', 32)->primary();
            $table->string('name', 100);
            $table->string('type', 10);
            $table->boolean('read_only')->default(true);
            $table->unsignedInteger('max_rows')->default(200);
            // Paramètres de connexion (hôte, compte, mot de passe…), chiffrés avec APP_KEY.
            $table->text('config');
            // Propriétaire d'une connexion privée ; null = pool commun géré par les administrateurs.
            $table->foreignId('owner_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
        });

        // Utilisateurs à qui un administrateur a attribué une connexion du pool commun.
        Schema::create('connection_user', function (Blueprint $table) {
            $table->string('connection_id', 32);
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->primary(['connection_id', 'user_id']);
            $table->foreign('connection_id')->references('id')->on('database_connections')->cascadeOnDelete();
        });

        // Liens d'invitation / de réinitialisation du mot de passe (empreinte du jeton uniquement).
        Schema::create('invitations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('token_hash', 64)->unique();
            $table->timestamp('expires_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invitations');
        Schema::dropIfExists('connection_user');
        Schema::dropIfExists('database_connections');
    }
};
