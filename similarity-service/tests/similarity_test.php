<?php
// Run with:  php tests/similarity_test.php      (no PHPUnit needed)
declare(strict_types=1);
require __DIR__ . '/../src/Similarity.php';

$fail = 0;
function check(string $name, bool $ok): void
{
    global $fail;
    echo ($ok ? 'PASS' : 'FAIL') . "  $name\n";
    if (!$ok) $fail++;
}

$bank = [
    ['text' => 'What do you crave more of?', 'level' => 2, 'is_original' => true],
    ['text' => 'Describe your perfect day!', 'level' => 2, 'is_original' => true],
    ['text' => 'What do you think my weakness is?', 'level' => 3, 'is_original' => 't'],
];

check('exact copy is a duplicate', Similarity::check('What do you crave more of?', $bank)['verdict'] === 'duplicate');
check('casing/punctuation changes still duplicate', Similarity::check('what do you CRAVE more of', $bank)['verdict'] === 'duplicate');
check('small rewording is a duplicate', Similarity::check('What do you crave more of in life?', $bank)['verdict'] === 'duplicate');
check('near-typo is a duplicate', Similarity::check('Describe your perfect date!', $bank)['verdict'] === 'duplicate');
check('unrelated question is ok', Similarity::check('What smell brings back your childhood?', $bank)['verdict'] === 'ok');
check('author is never returned', !array_key_exists('author', Similarity::check('anything', $bank)['top'][0] ?? []));
check('t/f booleans map to source', Similarity::check('What do you think my weakness is?', $bank)['top'][0]['source'] === 'original');
check('empty text scores 0', Similarity::score('', 'hello') === 0.0);

// --- embedding signal (fake vectors, no API needed) ---
check('cosine of identical vectors is 1', abs(Similarity::cosine([1.0, 2.0, 3.0], [1.0, 2.0, 3.0]) - 1.0) < 1e-9);
check('cosine of orthogonal vectors is 0', abs(Similarity::cosine([1.0, 0.0], [0.0, 1.0])) < 1e-9);

$vbank = [
    ['text' => 'What about me intrigues you?', 'level' => 1, 'is_original' => true, 'embedding' => [1.0, 0.0, 0.0]],
    ['text' => 'What do you think my weakness is?', 'level' => 3, 'is_original' => true, 'embedding' => [0.0, 1.0, 0.0]],
];
$r = Similarity::check('Does anything intrigue you about me?', $vbank, 3, [0.99, 0.05, 0.0]);
check('similar meaning is a duplicate through embeddings', $r['verdict'] === 'duplicate' && $r['method'] === 'embedding' && $r['embedding_used'] === true);
$r = Similarity::check('Does anything intrigue you about me?', $vbank, 3, null);
check('without embeddings the same text is not caught by words', $r['verdict'] === 'ok' && $r['embedding_used'] === false);

// rows scored by Postgres arrive with a precomputed "cos"
$crows = [['text' => 'What about me intrigues you?', 'level' => 1, 'is_original' => true, 'cos' => '0.962']];
$r = Similarity::check('Does anything intrigue you about me?', $crows, 3, [0.1, 0.2]);
check('precomputed cos from Postgres is used', $r['verdict'] === 'duplicate' && $r['method'] === 'embedding');

exit($fail ? 1 : 0);
