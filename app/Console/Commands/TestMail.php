<?php

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;
use Throwable;

/** Vérifie la configuration SMTP (MAIL_* dans .env) en envoyant un e-mail de test. */
#[Signature('mcp:mail-test {email : Destinataire du message de test}')]
#[Description('Envoie un e-mail de test pour vérifier la configuration SMTP')]
class TestMail extends Command
{
    public function handle(): int
    {
        $mailer = config('mail.default');
        if ($mailer === 'log') {
            $this->error('MAIL_MAILER=log : l\'envoi d\'e-mails est désactivé. Renseignez MAIL_* dans .env, puis « php artisan config:cache ».');

            return self::FAILURE;
        }

        $this->line("Envoi via « {$mailer} » ({$this->server()}) depuis ".config('mail.from.address').'…');
        try {
            Mail::raw(
                'Ce message confirme que le '.config('app.name').' peut envoyer les liens d\'invitation par e-mail.',
                fn ($message) => $message->to($this->argument('email'))->subject('Test d\'envoi – '.config('app.name')),
            );
        } catch (Throwable $e) {
            $this->error('Échec : '.$e->getMessage());

            return self::FAILURE;
        }

        $this->info('E-mail envoyé à '.$this->argument('email').'. Vérifiez aussi le dossier des indésirables.');

        return self::SUCCESS;
    }

    private function server(): string
    {
        $smtp = config('mail.mailers.smtp');
        if (config('mail.default') !== 'smtp') {
            return 'hors SMTP';
        }

        return $smtp['host'].':'.$smtp['port'].($smtp['username'] ? ', compte '.$smtp['username'] : ', sans authentification');
    }
}
