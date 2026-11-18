<?php
declare(strict_types=1);

require_once __DIR__ . '/Env.php';

/** Minimal client for Cohere's v2 embed endpoint. */
final class Cohere
{
    public const MAX_BATCH = 96;      // Cohere accepts at most 96 texts per request
    public const BACKFILL_BATCH = 24; // smaller batches keep each response (~200 KB) quick on slow connections

    public static function enabled(): bool
    {
        return (bool) Env::get('COHERE_API_KEY');
    }

    public static function model(): string
    {
        return Env::get('COHERE_MODEL', 'embed-multilingual-v3.0');
    }

    /**
     * @param string[] $texts
     * @return float[][] one vector per text, same order
     */
    public static function embed(array $texts, string $inputType = 'search_document'): array
    {
        $key = Env::get('COHERE_API_KEY');
        if (!$key) throw new RuntimeException('COHERE_API_KEY is not set');
        if (count($texts) === 0) return [];
        if (count($texts) > self::MAX_BATCH) throw new InvalidArgumentException('Too many texts for one request');

        $payload = json_encode([
            'model' => self::model(),
            'texts' => array_values($texts),
            'input_type' => $inputType,
            'embedding_types' => ['float'],
        ]);

        // Retry once if the connection itself fails (slow DNS / IPv6 stalls are common on home networks).
        $body = false;
        $err = '';
        for ($attempt = 1; $attempt <= 2; $attempt++) {
            $ch = curl_init('https://api.cohere.com/v2/embed');
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
                CURLOPT_ENCODING => '', // accept gzip: much smaller download
                CURLOPT_CONNECTTIMEOUT => 15,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_HTTPHEADER => [
                    'Authorization: bearer ' . $key,
                    'Content-Type: application/json',
                    'Accept: application/json',
                ],
                CURLOPT_POSTFIELDS => $payload,
            ]);
            $body = curl_exec($ch);
            if ($body !== false) break;
            $err = curl_error($ch);
        }
        if ($body === false) throw new RuntimeException('Cohere request failed: ' . $err);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);

        $data = json_decode((string) $body, true);
        if ($status !== 200 || !isset($data['embeddings']['float'])) {
            $msg = is_array($data) ? ($data['message'] ?? '') : '';
            throw new RuntimeException("Cohere answered HTTP $status " . substr((string) $msg, 0, 200));
        }
        return $data['embeddings']['float'];
    }
}
