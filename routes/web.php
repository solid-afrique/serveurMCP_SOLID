<?php

use App\Http\Controllers\AccountController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ConnectionController;
use App\Http\Controllers\InvitationController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

/*
| Interface d'administration. Le serveur MCP lui-même est déclaré dans routes/ai.php.
*/

Route::middleware('guest')->group(function () {
    Route::get('/login', [AuthController::class, 'showLogin'])->name('login');
    Route::post('/login', [AuthController::class, 'login']);
});

// Lien d'invitation ou de réinitialisation : choix du mot de passe.
Route::get('/invitation/{token}', [InvitationController::class, 'show'])->name('invitation.show');
Route::post('/invitation/{token}', [InvitationController::class, 'accept'])->name('invitation.accept');

Route::middleware(['auth', 'active'])->group(function () {
    Route::redirect('/', '/connections');
    Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

    Route::post('/connections/test', [ConnectionController::class, 'test'])->name('connections.test');
    Route::resource('connections', ConnectionController::class);
    Route::put('/connections/{connection}/users', [ConnectionController::class, 'assign'])->middleware('admin')->name('connections.assign');

    Route::get('/account', [AccountController::class, 'show'])->name('account');
    Route::put('/account/password', [AccountController::class, 'updatePassword'])->name('account.password');
    Route::delete('/account/assistants/{client}', [AccountController::class, 'revokeAssistant'])->name('account.assistants.revoke');

    Route::middleware('admin')->prefix('users')->name('users.')->group(function () {
        Route::get('/', [UserController::class, 'index'])->name('index');
        Route::post('/', [UserController::class, 'store'])->name('store');
        Route::patch('/{user}', [UserController::class, 'update'])->name('update');
        Route::delete('/{user}', [UserController::class, 'destroy'])->name('destroy');
        Route::post('/{user}/invitation', [UserController::class, 'invite'])->name('invite');
        Route::delete('/{user}/assistants', [UserController::class, 'revokeAssistants'])->name('assistants.revoke');
    });
});
