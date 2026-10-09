<?php

namespace Tests\Unit;

use App\Services\Databases\SqlGuard;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;

class SqlGuardTest extends TestCase
{
    #[DataProvider('reads')]
    public function test_les_lectures_sont_acceptees(string $dialect, string $sql): void
    {
        SqlGuard::assertReadOnly($sql, $dialect);
        $this->addToAssertionCount(1);
    }

    public static function reads(): array
    {
        return [
            'select mysql' => ['mysql', 'SELECT * FROM clients WHERE nom = ?'],
            'with sqlsrv' => ['sqlsrv', 'WITH x AS (SELECT 1 AS n) SELECT n FROM x'],
            'show mysql' => ['mysql', 'SHOW TABLES'],
            'mot-clé dans une chaîne' => ['pgsql', "SELECT 'delete from x; drop table y' AS texte"],
            'colonne entre crochets' => ['sqlsrv', 'SELECT [update], [delete] FROM dbo.Journal'],
            'colonne entre accents graves' => ['mysql', 'SELECT `insert` FROM t'],
            'point-virgule final' => ['pgsql', 'SELECT 1;'],
            'chaîne dollar postgres' => ['pgsql', 'SELECT $$; DROP TABLE x$$ AS s'],
        ];
    }

    #[DataProvider('writes')]
    public function test_les_ecritures_sont_refusees(string $dialect, string $sql): void
    {
        $this->expectException(RuntimeException::class);
        SqlGuard::assertReadOnly($sql, $dialect);
    }

    public static function writes(): array
    {
        return [
            'delete' => ['mysql', 'DELETE FROM clients'],
            'instructions multiples' => ['pgsql', 'SELECT 1; DROP TABLE clients'],
            'cte de modification' => ['pgsql', 'WITH d AS (DELETE FROM clients RETURNING *) SELECT * FROM d'],
            'select into' => ['sqlsrv', 'SELECT * INTO dbo.Copie FROM dbo.Clients'],
            'exec' => ['sqlsrv', 'EXEC sp_who'],
            'update via cte sql server' => ['sqlsrv', 'WITH x AS (SELECT * FROM t) UPDATE x SET a = 1'],
            'sommeil postgres' => ['pgsql', 'SELECT pg_sleep(10)'],
            'commentaire dièse mysql' => ['mysql', "SELECT 1 # commentaire\n; DROP TABLE t"],
            'vide' => ['mysql', '   '],
        ];
    }
}
