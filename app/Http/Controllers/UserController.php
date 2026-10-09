<?php

namespace App\Http\Controllers;

use App\Models\Invitation;
use App\Models\User;
use App\Services\AssistantAccess;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\View\View;

/** Gestion des comptes (administrateurs uniquement). */
class UserController extends Controller
{
    public function index(): View
    {
        return view('users.index', [
            'users' => User::withCount(['ownedConnections', 'assignedConnections'])->orderBy('email')->get(),
            'assistants' => AssistantAccess::countsByUser(),
        ]);
    }

    /** Crée le compte et affiche le lien d'invitation à transmettre (aucun e-mail n'est envoyé). */
    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:254', Rule::unique('users', 'email')],
            'name' => ['nullable', 'string', 'max:80'],
        ], ['email.unique' => 'Un utilisateur existe déjà avec cette adresse.']);

        $email = strtolower(trim($data['email']));
        $user = User::create([
            'email' => $email,
            'name' => trim($data['name'] ?? '') ?: strstr($email, '@', true),
            'role' => User::ROLE_USER,
            'status' => 'invited',
        ]);

        return back()->with('invite', ['email' => $user->email, 'url' => Invitation::issueFor($user), 'reset' => false]);
    }

    /** Nom, rôle (administrateur / utilisateur) ou statut (actif / désactivé). */
    public function update(Request $request, User $user): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:80'],
            'role' => ['sometimes', Rule::in([User::ROLE_ADMIN, User::ROLE_USER])],
            'status' => ['sometimes', Rule::in(['active', 'disabled'])],
        ]);
        if ($user->is($request->user()) && (isset($data['role']) || isset($data['status']))) {
            return back()->withErrors(['user' => 'Vous ne pouvez pas modifier votre propre rôle ni désactiver votre propre compte.']);
        }
        if (($data['status'] ?? null) === 'active' && ! $user->password) {
            return back()->withErrors(['user' => 'Ce compte n\'a pas encore accepté son invitation.']);
        }

        $user->update($data);

        if (($data['status'] ?? null) === 'disabled') {
            // Coupe immédiatement les sessions et les assistants du compte.
            DB::table('sessions')->where('user_id', $user->id)->delete();
            $user->revokeAssistantAccess();
        }

        $message = match (true) {
            isset($data['role']) => $user->isAdmin() ? "{$user->email} est maintenant administrateur." : "{$user->email} n'est plus administrateur.",
            isset($data['status']) => $user->isActive() ? "{$user->email} est réactivé." : "{$user->email} est désactivé : ses sessions et ses assistants sont coupés.",
            default => 'Utilisateur mis à jour.',
        };

        return back()->with('status', $message);
    }

    /** Nouveau lien d'invitation, ou de réinitialisation du mot de passe pour un compte actif. */
    public function invite(User $user): RedirectResponse
    {
        if ($user->status === 'disabled') {
            return back()->withErrors(['user' => 'Réactivez d\'abord ce compte.']);
        }

        return back()->with('invite', ['email' => $user->email, 'url' => Invitation::issueFor($user), 'reset' => $user->status === 'active']);
    }

    public function revokeAssistants(User $user): RedirectResponse
    {
        $count = $user->revokeAssistantAccess();

        return back()->with('status', "Assistants de {$user->email} déconnectés ({$count} jeton(s) révoqué(s)).");
    }

    /** Supprime le compte, ses connexions privées et ses accès. */
    public function destroy(Request $request, User $user): RedirectResponse
    {
        if ($user->is($request->user())) {
            return back()->withErrors(['user' => 'Vous ne pouvez pas supprimer votre propre compte.']);
        }
        $user->revokeAssistantAccess();
        DB::table('sessions')->where('user_id', $user->id)->delete();
        $user->delete();

        return back()->with('status', "{$user->email} a été supprimé, ainsi que ses connexions privées.");
    }
}
