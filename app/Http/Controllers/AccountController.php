<?php

namespace App\Http\Controllers;

use App\Services\AssistantAccess;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Illuminate\View\View;

/** « Mon compte » : mot de passe et assistants autorisés. */
class AccountController extends Controller
{
    public function show(Request $request): View
    {
        return view('account.show', ['assistants' => AssistantAccess::forUser($request->user())]);
    }

    public function updatePassword(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', Password::min(10)],
        ]);
        $user = $request->user();
        if (! Hash::check($data['current_password'], $user->password)) {
            return back()->withErrors(['current_password' => 'Mot de passe actuel incorrect.']);
        }

        $user->forceFill(['password' => $data['password']])->save();
        // Ferme les autres sessions ouvertes avec l'ancien mot de passe.
        DB::table('sessions')->where('user_id', $user->id)->where('id', '!=', $request->session()->getId())->delete();

        return back()->with('status', 'Mot de passe modifié. Vos autres sessions ont été fermées.');
    }

    /** Déconnecte un assistant : il devra être autorisé de nouveau. */
    public function revokeAssistant(Request $request, string $client): RedirectResponse
    {
        $request->user()->revokeAssistantAccess($client);

        return back()->with('status', 'Assistant déconnecté : il devra être autorisé de nouveau.');
    }
}
