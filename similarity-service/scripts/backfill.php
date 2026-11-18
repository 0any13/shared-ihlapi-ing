<?php
// Embeds every question that has no stored vector yet (safe to re-run):   php scripts/backfill.php
declare(strict_types=1);
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cohere.php';
require __DIR__ . '/../src/Similarity.php';
require __DIR__ . '/../src/Embeddings.php';

if (!Cohere::enabled()) { fwrite(STDERR, "COHERE_API_KEY is not set (put it in the project .env)\n"); exit(1); }
$pdo = Db::pdo();
Embeddings::ensureTable($pdo);

for ($round = 1; $round <= 100; $round++) {
    $left = Embeddings::backfillBatch($pdo);
    echo "round $round: $left questions still without a vector\n";
    if ($left === 0) break;
}
echo "done\n";
