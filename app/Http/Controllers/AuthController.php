<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\View\View;

class AuthController extends Controller
{
    private const LOCK_SECONDS = 15 * 60;

    private const MAX_PER_ACCOUNT = 10;

    /** Plafond global : protège même si les essais viennent d'IP multiples. */
    private const MAX_GLOBAL = 100;

    /** Empreinte factice : même temps de réponse que le compte existe ou non. */
    private const DUMMY_HASH = '$2y$12$OgrGajR1D9IwrO6AfRnPfOmjlWYp1X509elJXjstIJQ3z1PaNpDya';

    public function showLogin(): View
    {
        return view('auth.login');
    }

    public function login(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'max:254'],
            'password' => ['required', 'string', 'max:200'],
        ]);
        $email = strtolower(trim($data['email']));
        $key = 'login:'.$request->ip().'|'.$email;

        if (RateLimiter::tooManyAttempts($key, self::MAX_PER_ACCOUNT) || RateLimiter::tooManyAttempts('login:global', self::MAX_GLOBAL)) {
            return back()->withErrors(['email' => 'Trop de tentatives échouées. Réessayez dans 15 minutes.'])->onlyInput('email');
        }

        $user = User::where('email', $email)->first();
        $valid = Hash::check($data['password'], $user?->password ?? self::DUMMY_HASH) && $user?->password;

        if (! $valid) {
            RateLimiter::hit($key, self::LOCK_SECONDS);
            RateLimiter::hit('login:global', self::LOCK_SECONDS);

            return back()->withErrors(['email' => 'Identifiant ou mot de passe incorrect.'])->onlyInput('email');
        }
        if (! $user->isActive()) {
            return back()->withErrors(['email' => 'Ce compte est désactivé.'])->onlyInput('email');
        }

        RateLimiter::clear($key);
        Auth::login($user);
        $request->session()->regenerate();
        $user->forceFill(['last_login_at' => now()])->save();

        // Retour à la page demandée, par exemple l'écran d'autorisation OAuth d'un assistant.
        return redirect()->intended(route('connections.index'));
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    }
}
