<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

/**
 * Crée (ou répare) un compte administrateur depuis le serveur.
 * Sert à créer le premier administrateur, et de secours si plus personne ne peut se connecter.
 */
#[Signature('mcp:admin {email : Adresse e-mail (identifiant de connexion)} {--name= : Nom affiché} {--password= : Mot de passe (demandé si absent)}')]
#[Description('Crée ou réinitialise un compte administrateur du serveur MCP')]
class CreateAdmin extends Command
{
    public function handle(): int
    {
        $email = strtolower(trim($this->argument('email')));
        $password = $this->option('password') ?? $this->secret('Mot de passe (10 caractères minimum)');

        $validator = Validator::make(
            ['email' => $email, 'password' => $password],
            ['email' => ['required', 'email', 'max:254'], 'password' => ['required', Password::min(10)]],
        );
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $user = User::firstOrNew(['email' => $email]);
        $created = ! $user->exists;
        $user->forceFill([
            'name' => $this->option('name') ?: ($user->name ?: strstr($email, '@', true)),
            'password' => $password,
            'role' => User::ROLE_ADMIN,
            'status' => 'active',
        ])->save();

        $this->info($created
            ? "Administrateur {$email} créé. Connectez-vous à l'interface avec cette adresse."
            : "Compte {$email} : rôle administrateur, compte actif, mot de passe réinitialisé.");

        return self::SUCCESS;
    }
}
