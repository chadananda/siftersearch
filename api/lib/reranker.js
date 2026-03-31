/**
 * Reranker — cross-encoder reranking with Voyage/mock provider support.
 * Gracefully falls back to original ordering on any error or timeout.
 */

// Tier weighting multipliers
const TIER_WEIGHTS = { primary: 1.2, secondary: 1.0, background: 0.8 };
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Simple heuristic rerank score for mock provider.
 * Measures word overlap between query and candidate text.
 */
function mockScore(query, text) {
  const qWords = new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
  const tWords = text.toLowerCase().split(/\W+/).filter(Boolean);
  if (!qWords.size || !tWords.length) return 0;
  const overlap = tWords.filter(w => qWords.has(w)).length;
  return overlap / Math.max(qWords.size, tWords.length);
}

/**
 * Rerank candidates using the specified provider.
 * Options:
 *   enabled   — if false, return candidates unchanged
 *   provider  — 'mock' | 'voyage' (default: falls back gracefully)
 *   apiKey    — required for voyage provider
 *   timeout   — ms before falling back (default 5000)
 *
 * Always returns an array. Each item gets a rerank_score property.
 * On any error or timeout, returns original candidates unchanged.
 */
export async function rerank(query, candidates, options = {}) {
  const { enabled = true, provider, apiKey, timeout = DEFAULT_TIMEOUT_MS } = options;
  if (!enabled) return candidates;
  if (!candidates || candidates.length === 0) return candidates;
  try {
    const result = await Promise.race([
      _rerank(query, candidates, provider, apiKey),
      new Promise((_, reject) => setTimeout(() => reject(new Error('rerank timeout')), timeout))
    ]);
    return result;
  } catch {
    // Graceful fallback: return originals without rerank_score
    return candidates;
  }
}

async function _rerank(query, candidates, provider, apiKey) {
  if (provider === 'mock') {
    // Score by word overlap heuristic, sort descending
    const scored = candidates.map(c => ({ ...c, rerank_score: mockScore(query, c.text || '') }));
    return scored.sort((a, b) => b.rerank_score - a.rerank_score);
  }
  if (provider === 'voyage') {
    // Call Voyage rerank API
    const response = await fetch('https://api.voyageai.com/v1/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'rerank-2',
        query,
        documents: candidates.map(c => c.text || ''),
        top_k: candidates.length
      })
    });
    if (!response.ok) throw new Error(`Voyage API error: ${response.status}`);
    const data = await response.json();
    // Map scores back to candidates
    return data.data.map(item => ({
      ...candidates[item.index],
      rerank_score: item.relevance_score
    }));
  }
  // Unknown provider — score by original ranking score
  return candidates.map((c, i) => ({ ...c, rerank_score: c._rankingScore ?? (1 - i * 0.01) }));
}

/**
 * Apply document tier weighting to results.
 * Multiplies _rankingScore by tier multiplier, then sorts descending.
 */
export function applyTierWeighting(results) {
  const weighted = results.map(r => {
    const multiplier = TIER_WEIGHTS[r.tier] ?? 1.0;
    return { ...r, _weightedScore: (r._rankingScore ?? 0) * multiplier };
  });
  return weighted.sort((a, b) => b._weightedScore - a._weightedScore);
}
