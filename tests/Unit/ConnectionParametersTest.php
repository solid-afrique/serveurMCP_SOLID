<?php

namespace Tests\Unit;

use App\Services\Databases\ConnectionParameters;
use PHPUnit\Framework\TestCase;

class ConnectionParametersTest extends TestCase
{
    public function test_champs_separes_avec_port_par_defaut(): void
    {
        $c = ConnectionParameters::resolve(['type' => 'sqlsrv', 'host' => 'srv-sql01', 'user' => 'lecteur', 'password' => 'x']);

        $this->assertSame('srv-sql01', $c['host']);
        $this->assertSame(1433, $c['port']);
        $this->assertNull($c['instance']);
    }

    public function test_instance_nommee_sql_server(): void
    {
        $c = ConnectionParameters::resolve(['type' => 'sqlsrv', 'host' => 'localhost\\SQLEXPRESS']);

        $this->assertSame('localhost', $c['host']);
        $this->assertSame('SQLEXPRESS', $c['instance']);
    }

    public function test_chaine_ado_sql_server(): void
    {
        $c = ConnectionParameters::resolve([
            'type' => 'sqlsrv',
            'connection_string' => 'Server=tcp:srv-sql01,1450;Initial Catalog=Compta;User Id=lecteur;Password=p@ss;w0rd;Encrypt=True',
        ]);

        $this->assertSame(['srv-sql01', 1450, 'Compta', 'lecteur', true], [$c['host'], $c['port'], $c['database'], $c['user'], $c['ssl']]);
    }

    public function test_url_mysql_avec_mot_de_passe_encode(): void
    {
        $c = ConnectionParameters::resolve(['type' => 'mysql', 'connection_string' => 'mysql://lecteur:p%40ss%23@db.local:3307/boutique']);

        $this->assertSame(['db.local', 3307, 'lecteur', 'p@ss#', 'boutique'], [$c['host'], $c['port'], $c['user'], $c['password'], $c['database']]);
    }

    public function test_la_base_du_formulaire_prime_sur_la_chaine(): void
    {
        $c = ConnectionParameters::resolve(['type' => 'pgsql', 'connection_string' => 'postgresql://u:p@h/base1?sslmode=require', 'database' => 'base2']);

        $this->assertSame('base2', $c['database']);
        $this->assertTrue($c['ssl']);
    }
}
