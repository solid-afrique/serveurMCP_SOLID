<?php

namespace Tests\Feature;

use App\Models\DatabaseConnection;
use App\Models\Invitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccessTest extends TestCase
{
    use RefreshDatabase;

    private function user(array $attributes = []): User
    {
        return User::create([
            'name' => 'Test', 'email' => uniqid().'@exemple.bf', 'password' => 'mot-de-passe-1',
            'role' => User::ROLE_USER, 'status' => 'active', ...$attributes,
        ]);
    }

    private function connection(?User $owner = null, string $name = 'Boutique'): DatabaseConnection
    {
        return DatabaseConnection::create([
            'name' => $name, 'type' => 'mysql', 'read_only' => true, 'max_rows' => 200,
            'config' => ['type' => 'mysql', 'host' => 'localhost', 'password' => 'secret'], 'owner_id' => $owner?->id,
        ]);
    }

    public function test_un_visiteur_est_redirige_vers_la_connexion(): void
    {
        $this->get('/')->assertRedirect('/login');
        $this->get('/connections')->assertRedirect('/login');
    }

    public function test_connexion_et_mauvais_mot_de_passe(): void
    {
        $user = $this->user();

        $this->post('/login', ['email' => $user->email, 'password' => 'faux'])->assertSessionHasErrors('email');
        $this->post('/login', ['email' => $user->email, 'password' => 'mot-de-passe-1'])->assertRedirect(route('connections.index'));
    }

    public function test_un_compte_desactive_ne_peut_pas_se_connecter(): void
    {
        $user = $this->user(['status' => 'disabled']);

        $this->post('/login', ['email' => $user->email, 'password' => 'mot-de-passe-1'])->assertSessionHasErrors('email');
        $this->assertGuest();
    }

    public function test_les_parametres_sont_chiffres_en_base(): void
    {
        $connection = $this->connection();
        $raw = \DB::table('database_connections')->where('id', $connection->id)->value('config');

        $this->assertStringNotContainsString('secret', $raw);
        $this->assertSame('secret', $connection->fresh()->config['password']);
    }

    public function test_cloisonnement_des_connexions(): void
    {
        $admin = $this->user(['role' => User::ROLE_ADMIN]);
        $awa = $this->user();
        $bakary = $this->user();
        $shared = $this->connection(null, 'Commune');
        $private = $this->connection($awa, 'Privée Awa');

        $this->actingAs($admin)->get('/connections')->assertSee('Commune')->assertSee('Privée Awa');
        $this->actingAs($awa)->get('/connections')->assertSee('Privée Awa')->assertDontSee('Commune');
        $this->actingAs($bakary)->get('/connections')->assertDontSee('Privée Awa');

        $this->actingAs($bakary)->get("/connections/{$private->id}/edit")->assertForbidden();
        $this->assertFalse($shared->canBeUsedBy($awa));

        $shared->users()->attach($awa);
        $this->assertTrue($shared->canBeUsedBy($awa));
        $this->actingAs($awa)->get("/connections/{$shared->id}/edit")->assertForbidden();
    }

    public function test_seul_un_administrateur_gere_les_utilisateurs(): void
    {
        $this->actingAs($this->user())->get('/users')->assertForbidden();
        $this->actingAs($this->user(['role' => User::ROLE_ADMIN]))->get('/users')->assertOk();
    }

    public function test_une_connexion_privee_ne_peut_pas_etre_partagee(): void
    {
        $admin = $this->user(['role' => User::ROLE_ADMIN]);
        $private = $this->connection($this->user());

        $this->actingAs($admin)->put("/connections/{$private->id}/users", ['users' => [$admin->id]])->assertStatus(422);
    }

    public function test_invitation_a_usage_unique(): void
    {
        $user = User::create(['name' => 'Awa', 'email' => 'awa@exemple.bf', 'status' => 'invited']);
        $token = basename(Invitation::issueFor($user));

        $this->post("/invitation/{$token}", ['password' => 'nouveau-mdp-1', 'password_confirmation' => 'nouveau-mdp-1'])
            ->assertRedirect(route('connections.index'));
        $this->assertSame('active', $user->fresh()->status);
        $this->assertAuthenticatedAs($user);

        $this->get("/invitation/{$token}")->assertSee('Lien invalide');
    }

    public function test_endpoint_mcp_protege_par_oauth(): void
    {
        $connection = $this->connection();

        $this->postJson("/mcp/{$connection->id}", ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'initialize'], ['Accept' => 'application/json, text/event-stream'])
            ->assertUnauthorized()
            ->assertHeader('WWW-Authenticate');
        $this->get("/mcp/{$connection->id}")->assertStatus(405);
        $this->getJson('/.well-known/oauth-authorization-server')->assertOk()->assertJsonPath('code_challenge_methods_supported', ['S256']);
    }
}
