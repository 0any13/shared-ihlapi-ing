<?php
declare(strict_types=1);

/** Reads real environment variables first, then a .env file (this folder, then the project root). */
final class Env
{
    private static ?array $file = null;

    public static function get(string $key, ?string $default = null): ?string
    {
        $v = getenv($key);
        if ($v !== false && $v !== '') return $v;
        self::$file ??= self::load();
        return self::$file[$key] ?? $default;
    }

    private static function load(): array
    {
        $vars = [];
        foreach ([__DIR__ . '/../.env', __DIR__ . '/../../.env'] as $path) {
            if (!is_readable($path)) continue;
            foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) continue;
                [$k, $val] = explode('=', $line, 2);
                $k = trim($k);
                if (!isset($vars[$k])) $vars[$k] = trim(trim($val), "\"'");
            }
        }
        return $vars;
    }
}
