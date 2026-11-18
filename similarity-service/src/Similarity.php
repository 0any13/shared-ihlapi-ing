<?php
declare(strict_types=1);

require_once __DIR__ . '/Env.php';

/**
 * Duplicate detection with two signals:
 *  - words:     cheap character/word-overlap score (always available)
 *  - embedding: cosine similarity of Cohere vectors (catches rephrasings), used when available
 */
final class Similarity
{
    public const DUPLICATE = 0.82; // word score at/above which a question counts as a duplicate
    public const SIMILAR = 0.65;   // word score at/above which it counts as "similar"

    private const STOPWORDS = [
        'a','an','the','is','are','was','were','be','been','am','do','does','did','you','your','yours','i','me','my','we','us','our',
        'of','in','on','at','to','for','and','or','with','what','whats','how','why','when','where','who','which','that','this',
        'it','its','if','have','has','had','can','would','will','about','than','then','so','as','by','from','up','im','ive',
    ];

    /** lowercase, strip accents (Romanian too), drop punctuation, collapse spaces */
    public static function normalize(string $text): string
    {
        $t = mb_strtolower($text, 'UTF-8');
        $t = strtr($t, [
            'ă' => 'a', 'â' => 'a', 'î' => 'i', 'ș' => 's', 'ş' => 's', 'ț' => 't', 'ţ' => 't',
            'é' => 'e', 'è' => 'e', 'á' => 'a', 'à' => 'a', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ö' => 'o', 'ä' => 'a',
        ]);
        $t = str_replace("'", '', $t);
        $t = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $t) ?? $t;
        return trim(preg_replace('/\s+/u', ' ', $t) ?? $t);
    }

    public static function tokens(string $normalized): array
    {
        if ($normalized === '') return [];
        $words = array_filter(explode(' ', $normalized), fn($w) => $w !== '' && !in_array($w, self::STOPWORDS, true));
        return array_values(array_unique($words));
    }

    /** word/character similarity, 0..1 */
    public static function score(string $a, string $b): float
    {
        $na = self::normalize($a);
        $nb = self::normalize($b);
        if ($na === '' || $nb === '') return 0.0;
        if ($na === $nb) return 1.0;

        $ca = substr($na, 0, 250);
        $cb = substr($nb, 0, 250);
        $charSim = 1 - levenshtein($ca, $cb) / max(strlen($ca), strlen($cb));

        $ta = self::tokens($na);
        $tb = self::tokens($nb);
        $wordSim = 0.0;
        if ($ta && $tb) {
            $inter = count(array_intersect($ta, $tb));
            $union = count(array_unique(array_merge($ta, $tb)));
            $wordSim = (($inter / $union) + ($inter / min(count($ta), count($tb)))) / 2;
        }
        return round(max($charSim, $wordSim), 3);
    }

    /** cosine similarity of two vectors, -1..1 */
    public static function cosine(array $a, array $b): float
    {
        $n = min(count($a), count($b));
        $dot = 0.0; $na = 0.0; $nb = 0.0;
        for ($i = 0; $i < $n; $i++) {
            $x = (float) $a[$i]; $y = (float) $b[$i];
            $dot += $x * $y; $na += $x * $x; $nb += $y * $y;
        }
        return ($na == 0.0 || $nb == 0.0) ? 0.0 : $dot / (sqrt($na) * sqrt($nb));
    }

    /**
     * @param array<int, array<string, mixed>> $questions rows with text, level, is_original and optionally "cos" or "embedding"
     * @param float[]|null $queryVec embedding of $text, or null when embeddings are unavailable
     * @return array{verdict:string, method:string, embedding_used:bool, top:array<int, array<string, mixed>>}
     */
    public static function check(string $text, array $questions, int $limit = 3, ?array $queryVec = null): array
    {
        // Embedding thresholds depend on the model. Tune them with scripts/calibrate.php.
        $dupE = (float) Env::get('EMBED_DUPLICATE', '0.88');
        $simE = (float) Env::get('EMBED_SIMILAR', '0.80');

        $scored = [];
        foreach ($questions as $q) {
            $word = self::score($text, (string) $q['text']);
            // "cos" is computed by Postgres (pgvector); otherwise compute it here from a given "embedding" vector
            if (isset($q['cos'])) $cos = round((float) $q['cos'], 3);
            elseif ($queryVec !== null && !empty($q['embedding'])) $cos = round(self::cosine($queryVec, $q['embedding']), 3);
            else $cos = null;

            $wordDup = $word >= self::DUPLICATE;
            $embDup = $cos !== null && $cos >= $dupE;
            $wordSim = $word >= self::SIMILAR;
            $embSim = $cos !== null && $cos >= $simE;

            $level = ($wordDup || $embDup) ? 2 : (($wordSim || $embSim) ? 1 : 0);
            $hitWord = $level === 2 ? $wordDup : $wordSim;
            $hitEmb = $level === 2 ? $embDup : $embSim;
            $method = $level === 0 ? 'none' : (($hitWord && $hitEmb) ? 'words+embedding' : ($hitEmb ? 'embedding' : 'words'));

            // rank candidates by how far past their threshold they are
            $ratio = max($word / self::DUPLICATE, $cos !== null ? $cos / $dupE : 0.0);
            if ($ratio <= 0.0) continue;

            $scored[] = [
                'text' => $q['text'],
                'level' => (int) $q['level'],
                // Postgres booleans can come back as bool or 't'/'f' depending on the driver
                'source' => in_array($q['is_original'], [true, 't', 'true', '1', 1], true) ? 'original' : 'community',
                'score' => $word,
                'embedding' => $cos,
                'method' => $method,
                '_level' => $level,
                '_ratio' => $ratio,
                // the author is deliberately never included
            ];
        }
        usort($scored, fn($x, $y) => [$y['_level'], $y['_ratio']] <=> [$x['_level'], $x['_ratio']]);
        $top = array_slice($scored, 0, $limit);
        $best = $top[0]['_level'] ?? 0;
        $method = $best > 0 ? $top[0]['method'] : 'none';
        foreach ($top as &$t) unset($t['_level'], $t['_ratio']);
        unset($t);

        return [
            'verdict' => $best === 2 ? 'duplicate' : ($best === 1 ? 'similar' : 'ok'),
            'method' => $method,
            'embedding_used' => $queryVec !== null,
            'top' => $top,
        ];
    }
}
