<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/Env.php';
require_once __DIR__ . '/../src/Db.php';
require_once __DIR__ . '/../src/Cohere.php';
require_once __DIR__ . '/../src/Embeddings.php';
require_once __DIR__ . '/../src/Similarity.php';

header('Content-Type: application/json');

function respond(int $status, array $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($path === '/health') respond(200, ['ok' => true, 'embeddings_configured' => Cohere::enabled()]);

if ($path === '/check-similar' && $method === 'POST') {
    // Only the game server may call this: it must send the shared secret.
    $expected = Env::get('SERVICE_KEY');
    $given = $_SERVER['HTTP_X_SERVICE_KEY'] ?? '';
    if (!$expected) respond(500, ['error' => 'SERVICE_KEY is not configured']);
    if (!hash_equals($expected, $given)) respond(401, ['error' => 'Unauthorized']);

    $data = json_decode(file_get_contents('php://input') ?: '', true);
    $text = is_array($data) ? ($data['text'] ?? null) : null;
    if (!is_string($text) || trim($text) === '' || mb_strlen($text) > 300) respond(400, ['error' => 'text (1-300 chars) required']);

    $timings = [];
    $t0 = hrtime(true);
    $lap = function (string $name) use (&$t0, &$timings): void {
        $now = hrtime(true);
        $timings[$name] = (int) round(($now - $t0) / 1e6); // milliseconds
        $t0 = $now;
    };

    try {
        $pdo = Db::pdo();
    } catch (Throwable $e) {
        error_log('check-similar db error: ' . $e->getMessage());
        respond(503, ['error' => 'Database unavailable']);
    }
    $lap('db_connect');

    // Embedding step: optional. If anything goes wrong we fall back to the word score alone.
    $rows = null;
    $queryVec = null;
    if (Cohere::enabled()) {
        try {
            $queryVec = Cohere::embed([$text])[0];
            $lap('cohere_embed_query');
            $rows = Embeddings::scoredQuestions($pdo, $queryVec); // Postgres computes the cosine scores
            $lap('db_similarity_query');
        } catch (Throwable $e) {
            error_log('embedding step failed, using words only: ' . $e->getMessage());
            $queryVec = null;
            $rows = null;
        }
    }
    if ($rows === null) {
        try {
            $rows = $pdo->query('SELECT id, text, level, is_original FROM questions')->fetchAll();
        } catch (Throwable $e) {
            error_log('check-similar db error: ' . $e->getMessage());
            respond(503, ['error' => 'Database unavailable']);
        }
        $lap('db_questions');
    }
    $result = Similarity::check($text, $rows, 3, $queryVec);
    $lap('compare');
    $result['timings_ms'] = $timings + ['total' => array_sum($timings)];
    respond(200, $result);
}

respond(404, ['error' => 'Not found']);
