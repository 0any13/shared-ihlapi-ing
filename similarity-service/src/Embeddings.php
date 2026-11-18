<?php
declare(strict_types=1);

require_once __DIR__ . '/Cohere.php';

/**
 * One embedding vector per question, stored in Postgres with the pgvector extension.
 * Postgres computes the cosine similarity itself, so a check downloads one small number per question
 * instead of every stored vector.
 */
final class Embeddings
{
    public static function ensureTable(PDO $pdo): void
    {
        $pdo->exec('CREATE EXTENSION IF NOT EXISTS vector');
        $pdo->exec('CREATE TABLE IF NOT EXISTS question_embeddings (
            question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
            model TEXT NOT NULL,
            embedding vector NOT NULL
        )');
    }

    /** pgvector text format: [0.1,0.2,...] */
    public static function literal(array $vec): string
    {
        return '[' . implode(',', array_map(fn($x) => round((float) $x, 5), $vec)) . ']';
    }

    private static function store(PDO $pdo, int $id, array $vec): void
    {
        $pdo->prepare('INSERT INTO question_embeddings (question_id, model, embedding)
            VALUES (:id, :m, CAST(:e AS vector))
            ON CONFLICT (question_id) DO UPDATE SET model = EXCLUDED.model, embedding = EXCLUDED.embedding')
            ->execute(['id' => $id, 'm' => Cohere::model(), 'e' => self::literal($vec)]);
    }

    /**
     * Every question with its cosine similarity to $queryVec ("cos"), computed inside Postgres in ONE query.
     * Questions that have no vector yet (new ones) are embedded now, one small batch per call.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function scoredQuestions(PDO $pdo, array $queryVec): array
    {
        $stmt = $pdo->prepare(
            'SELECT q.id, q.text, q.level, q.is_original,
                    CASE WHEN e.question_id IS NULL THEN NULL
                         ELSE 1 - (e.embedding <=> CAST(:v AS vector)) END AS cos
             FROM questions q
             LEFT JOIN question_embeddings e ON e.question_id = q.id AND e.model = :m');
        $stmt->execute(['v' => self::literal($queryVec), 'm' => Cohere::model()]);
        $rows = $stmt->fetchAll();

        $missing = [];
        foreach ($rows as $i => $r) {
            if ($r['cos'] === null) $missing[$i] = $r;
        }
        $missing = array_slice($missing, 0, Cohere::BACKFILL_BATCH, true);
        if ($missing) {
            $vectors = Cohere::embed(array_map(fn($r) => (string) $r['text'], array_values($missing)));
            $n = 0;
            foreach ($missing as $i => $r) {
                $vec = $vectors[$n++];
                self::store($pdo, (int) $r['id'], $vec);
                $rows[$i]['cos'] = Similarity::cosine($queryVec, $vec);
            }
        }
        return $rows;
    }

    /** Embeds up to one batch of questions that have no vector yet. Returns how many are still missing. */
    public static function backfillBatch(PDO $pdo): int
    {
        $stmt = $pdo->prepare('SELECT q.id, q.text FROM questions q
            LEFT JOIN question_embeddings e ON e.question_id = q.id AND e.model = :m
            WHERE e.question_id IS NULL ORDER BY q.id LIMIT ' . Cohere::BACKFILL_BATCH);
        $stmt->execute(['m' => Cohere::model()]);
        $batch = $stmt->fetchAll();
        if ($batch) {
            $vectors = Cohere::embed(array_map(fn($r) => (string) $r['text'], $batch));
            foreach ($batch as $i => $r) self::store($pdo, (int) $r['id'], $vectors[$i]);
        }
        $left = $pdo->prepare('SELECT COUNT(*) FROM questions q
            LEFT JOIN question_embeddings e ON e.question_id = q.id AND e.model = :m WHERE e.question_id IS NULL');
        $left->execute(['m' => Cohere::model()]);
        return (int) $left->fetchColumn();
    }
}
