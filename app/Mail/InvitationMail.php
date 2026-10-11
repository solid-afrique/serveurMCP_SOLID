<?php

namespace App\Mail;

use App\Models\Invitation;
use App\Models\User;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** Lien d'invitation (ou de réinitialisation du mot de passe) envoyé à l'utilisateur. */
class InvitationMail extends Mailable
{
    public function __construct(
        public User $user,
        public string $url,
        public bool $reset,
        public ?User $sender = null,
    ) {}

    public function envelope(): Envelope
    {
        $app = config('app.name');

        return new Envelope(
            subject: $this->reset ? "Réinitialisation de votre mot de passe – {$app}" : "Votre invitation au {$app}",
            replyTo: $this->sender ? [$this->sender->email] : [],
        );
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.invitation', with: [
            'days' => Invitation::LIFETIME_DAYS,
            'appUrl' => rtrim(config('app.url'), '/'),
        ]);
    }
}
