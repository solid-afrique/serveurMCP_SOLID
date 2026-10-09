<?php

namespace App\Http\Controllers;

use App\Models\DatabaseConnection;
use App\Models\User;
use App\Services\Databases\Databases;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;
use Throwable;

class ConnectionController extends Controller
{
    public function index(Request $request): View
    {
        $user = $request->user();

        return view('connections.index', [
            'connections' => DatabaseConnection::visibleTo($user)->with(['owner', 'users'])->orderByDesc('created_at')->get(),
            'users' => $user->isAdmin() ? User::where('role', User::ROLE_USER)->orderBy('email')->get() : collect(),
        ]);
    }

    public function create(): View
    {
        return view('connections.form', ['connection' => null, 'config' => ['ssl' => true], 'types' => Databases::availableTypes()]);
    }

    public function store(Request $request): RedirectResponse
    {
        $user = $request->user();
        $data = $this->validated($request, creating: true);
        $connection = DatabaseConnection::create([
            ...$this->attributes($data),
            // Connexion d'un administrateur : pool commun, attribuable. Sinon : connexion privée.
            'owner_id' => $user->isAdmin() ? null : $user->id,
            'expires_at' => ! empty($data['expires_in_days']) ? now()->addDays((int) $data['expires_in_days']) : null,
        ]);

        return redirect()->route('connections.show', $connection)->with('created', true);
    }

    public function show(Request $request, DatabaseConnection $connection): View
    {
        abort_unless($connection->canBeUsedBy($request->user()), 404);

        return view('connections.show', ['connection' => $connection]);
    }

    public function edit(Request $request, DatabaseConnection $connection): View
    {
        abort_unless($connection->canBeManagedBy($request->user()), 403);

        return view('connections.form', [
            'connection' => $connection,
            'config' => $connection->publicConfig(),
            'types' => Databases::availableTypes(),
        ]);
    }

    /** L'URL MCP et les autorisations des assistants sont conservées. */
    public function update(Request $request, DatabaseConnection $connection): RedirectResponse
    {
        abort_unless($connection->canBeManagedBy($request->user()), 403);
        $data = $this->validated($request, creating: false);
        $connection->update($this->attributes($this->withPreviousSecrets($data, $connection->config)));

        return redirect()->route('connections.index')->with('status', "Connexion « {$connection->name} » mise à jour.");
    }

    public function destroy(Request $request, DatabaseConnection $connection): RedirectResponse
    {
        abort_unless($connection->canBeManagedBy($request->user()), 403);
        $connection->delete();

        return redirect()->route('connections.index')->with('status', "Connexion « {$connection->name} » supprimée : son URL MCP ne fonctionne plus.");
    }

    /** Bouton « Tester la connexion » : réponse JSON, sans rien enregistrer. */
    public function test(Request $request): JsonResponse
    {
        $data = $this->validated($request, creating: ! $request->filled('id'));
        if ($request->filled('id')) {
            $existing = DatabaseConnection::findOrFail($request->input('id'));
            abort_unless($existing->canBeManagedBy($request->user()), 403);
            $data = $this->withPreviousSecrets($data, $existing->config);
        }

        try {
            return response()->json(['ok' => true, 'version' => Databases::version($this->config($data))]);
        } catch (Throwable $e) {
            return response()->json(['ok' => false, 'error' => $e->getMessage()]);
        }
    }

    /** Administrateurs : utilisateurs ayant accès à une connexion du pool commun. */
    public function assign(Request $request, DatabaseConnection $connection): RedirectResponse
    {
        abort_if($connection->isPrivate(), 422, 'Une connexion privée ne peut pas être partagée.');
        $ids = $request->validate(['users' => ['array'], 'users.*' => ['integer', Rule::exists('users', 'id')]])['users'] ?? [];
        // Les accès retirés prennent effet immédiatement : chaque requête MCP revérifie l'attribution.
        $connection->users()->sync($ids);

        return redirect()->route('connections.index')->with('status', "Accès à « {$connection->name} » mis à jour.");
    }

    /* ------------------------------------------------------------------------- */

    private function validated(Request $request, bool $creating): array
    {
        return $request->validate([
            'type' => ['required', Rule::in(array_keys(Databases::availableTypes()))],
            'name' => ['nullable', 'string', 'max:100'],
            'mode' => ['required', Rule::in(['fields', 'uri'])],
            'connection_string' => [$creating ? 'required_if:mode,uri' : 'nullable', 'nullable', 'string', 'max:2000'],
            'host' => ['required_if:mode,fields', 'nullable', 'string', 'max:255'],
            'port' => ['nullable', 'integer', 'between:1,65535'],
            'user' => ['nullable', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'max:1024'],
            'database' => ['nullable', 'string', 'max:255'],
            'ssl' => ['boolean'],
            'read_only' => ['boolean'],
            'max_rows' => ['required', 'integer', 'between:1,5000'],
            'expires_in_days' => ['nullable', Rule::in(['1', '7', '30', '90', '365'])],
        ], [
            'connection_string.required_if' => 'Indiquez la chaîne de connexion.',
            'host.required_if' => 'Indiquez l\'hôte de la base de données.',
        ]);
    }

    /** Paramètres chiffrés de la connexion (selon le mode : champs séparés ou chaîne). */
    private function config(array $data): array
    {
        $common = ['type' => $data['type'], 'ssl' => (bool) ($data['ssl'] ?? false), 'database' => $data['database'] ?? null];

        return $data['mode'] === 'uri'
            ? [...$common, 'connection_string' => $data['connection_string'] ?? null]
            : [...$common, 'host' => $data['host'] ?? null, 'port' => $data['port'] ?? null, 'user' => $data['user'] ?? null, 'password' => $data['password'] ?? null];
    }

    private function attributes(array $data): array
    {
        $label = DatabaseConnection::TYPES[$data['type']];

        return [
            'name' => $data['name'] ?: $label.(! empty($data['database']) ? " ({$data['database']})" : ''),
            'type' => $data['type'],
            'read_only' => (bool) ($data['read_only'] ?? false),
            'max_rows' => (int) $data['max_rows'],
            'config' => $this->config($data),
        ];
    }

    /** Un mot de passe ou une chaîne de connexion laissés vides conservent la valeur enregistrée. */
    private function withPreviousSecrets(array $data, array $previous): array
    {
        if ($data['mode'] === 'uri' && empty($data['connection_string'])) {
            $data['connection_string'] = $previous['connection_string'] ?? null;
        }
        if ($data['mode'] === 'fields' && empty($data['password'])) {
            $data['password'] = $previous['password'] ?? null;
        }
        if ($data['mode'] === 'uri' && empty($data['connection_string'])) {
            throw ValidationException::withMessages(['connection_string' => 'Indiquez la chaîne de connexion.']);
        }

        return $data;
    }
}
