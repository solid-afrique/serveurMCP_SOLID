<?php

namespace App\Http\Controllers;

use App\Models\Invitation;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rules\Password;
use Illuminate\View\View;

/** Choix du mot de passe depuis un lien d'invitation (ou de réinitialisation). */
class InvitationController extends Controller
{
    public function show(string $token): View
    {
        return view('invitation.show', ['invitation' => Invitation::findValid($token), 'token' => $token]);
    }

    public function accept(Request $request, string $token): RedirectResponse
    {
        $invitation = Invitation::findValid($token);
        if (! $invitation) {
            return redirect()->route('invitation.show', $token);
        }
        $data = $request->validate(['password' => ['required', 'confirmed', Password::min(10)]]);

        $user = $invitation->user;
        $user->forceFill(['password' => $data['password'], 'status' => 'active', 'last_login_at' => now()])->save();
        $invitation->delete();

        // Le nouveau mot de passe ferme les sessions ouvertes avec l'ancien.
        DB::table('sessions')->where('user_id', $user->id)->delete();
        Auth::login($user);
        $request->session()->regenerate();

        return redirect()->route('connections.index')->with('status', 'Mot de passe enregistré : bienvenue !');
    }
}
