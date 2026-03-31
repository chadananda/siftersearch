/**
 * Query Intent Classification
 * Classifies queries to determine semantic vs keyword search ratio.
 * Uses heuristic mock mode or vLLM for production.
 */

// Known factual query words that lean toward keyword search
const FACTUAL_WORDS = /\b(who|what|when|where|wrote|authored|year|date|born|died|published)\b/i;
// Conceptual query markers that lean toward semantic search
const CONCEPTUAL_WORDS = /\b(view|concept|meaning|principle|understand|explain|describe|nature|relationship|significance|importance)\b/i;

/**
 * Classify query intent to determine semanticRatio (0 = pure keyword, 1 = pure semantic).
 * Options:
 *   mock            — use heuristic classification
 *   forceUnavailable — simulate service down, return default
 *
 * Returns { semanticRatio: number, suggestedFilters: object }
 */
export async function classifyIntent(query, options = {}) {
  const { mock = false, forceUnavailable = false } = options;
  if (forceUnavailable) return { semanticRatio: 0.5, suggestedFilters: {} };
  if (mock) return _heuristicClassify(query);
  // Default for when no provider configured
  return _heuristicClassify(query);
}

function _heuristicClassify(query) {
  const lower = query.toLowerCase();
  const isFact = FACTUAL_WORDS.test(lower);
  const isConcept = CONCEPTUAL_WORDS.test(lower);
  let semanticRatio = 0.5;
  if (isFact && !isConcept) semanticRatio = 0.35;
  else if (isConcept && !isFact) semanticRatio = 0.7;
  else if (isConcept && isFact) semanticRatio = 0.55;
  const suggestedFilters = {};
  return { semanticRatio, suggestedFilters };
}
