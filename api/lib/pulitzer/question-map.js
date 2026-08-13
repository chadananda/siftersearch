// Stage 1, the curiosity and intent map (PRD §9 Stage 1, §7.1). Purpose: ground the piece in what readers
// actually ask instead of assumed keywords — and then REFUSE to proceed on a map that only contains the easy
// questions. The gate is the point: a map with no skeptical and no source-verification questions produces a
// confident, unchallenged article, which is the failure mode this engine exists to avoid.
// Pure: CuriosityGraph clusters are passed in. Deps: none.

// PRD Stage 1 gate: "map contains primary, supporting, skeptical, practical, and source-verification questions".
export const REQUIRED_KINDS = ['primary', 'supporting', 'skeptical', 'practical', 'source_verification'];

// PRD §7.1 intents, kept separate from KIND: intent is what the reader wants to DO, kind is the role the
// question plays in the article.
export const INTENTS = ['learn', 'compare', 'resolve', 'apply', 'verify', 'navigate'];

const SKEPTICAL = /\b(really|actually|true|myth|debunk|contradict|problem|criticism|objection|wrong|disprove|controvers|why not|isn'?t it)\b/i;
const VERIFY = /\b(source|cite|citation|evidence|where does .* say|which text|authentic|attributed|original|translation|manuscript|primary source|who said)\b/i;
const PRACTICAL = /\b(how (do|to|can)|steps?|guide|practice|apply|use|start|find|visit|join|read(ing)? list|what should)\b/i;
const COMPARE = /\b(vs\.?|versus|compare|difference|different from|similar|like .* but|contrast)\b/i;

/**
 * Classify the ROLE a question plays. Order matters: a question can be both skeptical and comparative, and
 * the skeptical reading is the one the article must not skip.
 */
export function classifyKind(text, { isSeed = false } = {}) {
  const t = String(text || '');
  if (VERIFY.test(t)) return 'source_verification';
  if (SKEPTICAL.test(t)) return 'skeptical';
  if (PRACTICAL.test(t)) return 'practical';
  if (COMPARE.test(t)) return 'comparative';
  return isSeed ? 'primary' : 'supporting';
}

export function classifyIntent(text, kind) {
  if (kind === 'source_verification') return 'verify';
  if (kind === 'comparative') return 'compare';
  if (kind === 'practical') return 'apply';
  if (kind === 'skeptical') return 'resolve';
  return 'learn';
}

/**
 * Build the question map from CuriosityGraph clusters (the real shape: {id, canonical, intent,
 * monthly_volume, confidence, variants, tags, paa_count}).
 * @param {Array} clusters
 * @param {object} opts {seedQuestion, topic}
 */
export function buildQuestionMap(clusters = [], opts = {}) {
  const seed = (opts.seedQuestion || '').trim().toLowerCase();
  const questions = [];
  let n = 0;

  for (const c of clusters) {
    const text = (c.canonical || '').trim();
    if (!text) continue;
    const isSeed = !!seed && text.toLowerCase() === seed;
    const kind = classifyKind(text, { isSeed });
    // demand_signal is normalised per-map rather than absolute: a niche religious topic will never reach
    // the volumes of a consumer query, and scoring it against those would rank every question at zero.
    questions.push({
      question_id: `q_${String(++n).padStart(4, '0')}`,
      text,
      parent_id: null,
      kind,
      intent: c.intent && INTENTS.includes(c.intent) ? c.intent : classifyIntent(text, kind),
      audience: opts.audience ?? null,
      demand_signal: Number(c.monthly_volume || 0),
      importance: 0,
      answerability: 0,
      controversy: kind === 'skeptical' ? 0.7 : 0.2,
      freshness_need: 0,
      source_queries: [text, ...(Array.isArray(c.variants) ? c.variants.slice(0, 4) : [])],
      cluster_id: c.id ?? null,
      tags: Array.isArray(c.tags) ? c.tags : [],
      status: 'open',
    });
  }

  const maxDemand = Math.max(1, ...questions.map((q) => q.demand_signal));
  for (const q of questions) q.demand_signal = +(q.demand_signal / maxDemand).toFixed(3);

  return { topic: opts.topic ?? null, generated_at: new Date().toISOString(), questions };
}

/**
 * The Stage 1 gate. Returns what is missing, so the orchestrator can go get it rather than proceeding with
 * a lopsided map. `article` vs `companion`: questions that do not serve the bounded promise are not
 * discarded — they are routed to companion content (PRD Stage 1 "Do").
 */
export function auditQuestionMap(map, { minPerKind = 1 } = {}) {
  const byKind = {};
  for (const q of map.questions || []) byKind[q.kind] = (byKind[q.kind] || 0) + 1;
  const missing = REQUIRED_KINDS.filter((k) => (byKind[k] || 0) < minPerKind);
  return {
    ok: missing.length === 0,
    missing,
    counts: byKind,
    // A map that is all "learn" is a topic dump waiting to happen.
    warnings: (map.questions || []).length < 5 ? ['question map is very thin (<5 questions)'] : [],
  };
}

/** Split into the questions this article answers vs the ones that belong in companion content. */
export function partitionForArticle(map, { limit = 12 } = {}) {
  const qs = [...(map.questions || [])].sort((a, b) => {
    // Skeptical and verification questions are pulled UP: they are the ones a weak article silently drops.
    const w = (q) => (q.kind === 'primary' ? 3 : q.kind === 'skeptical' || q.kind === 'source_verification' ? 2 : 1);
    return (w(b) - w(a)) || (b.demand_signal - a.demand_signal);
  });
  return { article: qs.slice(0, limit), companion: qs.slice(limit) };
}
