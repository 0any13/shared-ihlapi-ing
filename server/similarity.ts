// Client for the PHP similarity service. If the service is not configured, asleep or broken,
// we return null and the caller simply saves the question (a missed duplicate check must never lose someone's question).
export interface SimilarMatch { text: string; score: number; embedding: number | null; method: string; level: number; source: 'original' | 'community' }
export interface SimilarityResult { verdict: 'ok' | 'similar' | 'duplicate'; method: string; embedding_used: boolean; top: SimilarMatch[] }

export async function checkSimilar(text: string): Promise<SimilarityResult | null> {
  const base = process.env.SIMILARITY_URL;
  if (!base) return null;
  const started = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/check-similar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': process.env.SERVICE_KEY ?? '' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(Number(process.env.SIMILARITY_TIMEOUT_MS) || 6000), // a slow or sleeping service: skip the check instead of making the user wait
    });
    if (!res.ok) { console.warn(`similarity service answered ${res.status}`); return null; }
    const result = (await res.json()) as SimilarityResult;
    // visible in the server terminal, so you can see which path decided
    console.log(`[similarity] ${result.verdict} (decided by: ${result.method}, embeddings ${result.embedding_used ? 'ON' : 'OFF'}, ${Date.now() - started} ms)`);
    return result;
  } catch (e) {
    console.warn('similarity service unavailable:', e instanceof Error ? e.message : e);
    return null;
  }
}