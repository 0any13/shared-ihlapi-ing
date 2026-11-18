<?php
declare(strict_types=1);

require_once __DIR__ . '/Env.php';

final class Db
{
    private static ?PDO $pdo = null;

    /** Connects to the same Postgres database the game uses (DATABASE_URL). */
    public static function pdo(): PDO
    {
        if (self::$pdo) return self::$pdo;
        $url = Env::get('DATABASE_URL');
        if (!$url) throw new RuntimeException('DATABASE_URL is not set');
        $p = parse_url($url);
        if ($p === false || !isset($p['host'])) throw new RuntimeException('DATABASE_URL is not a valid URL');

        $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s;sslmode=require',
            $p['host'], $p['port'] ?? 5432, ltrim($p['path'] ?? '', '/'));
        self::$pdo = new PDO($dsn, rawurldecode($p['user'] ?? ''), rawurldecode($p['pass'] ?? ''), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        return self::$pdo;
    }
}
