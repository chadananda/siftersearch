// Research cache: semantic lookup/capture of RESEARCH SETS (passage identities + roles), never finished replies. Curated beats
// candidate at equal similarity. All deps injectable. Deps: answer-cache (normalize/hash), research-sets-repo, paragraphs-repo, ai (embed)
import { normalizeQuestion, questionHash } from '../answer-cache.js';

// Measured 11-12 (config embeddings): the same question reworded 0.91; a narrower/broader question on the topic 0.73–0.81; another topic < 0.5.
export const SAME_QUESTION = 0.88;
export const RESEARCH_THRESHOLD = 0.75;   // a related question's research is still a start (it is passages, not a reply); "How do Baha'is pray?" vs a longer form = 0.80
const defaultRepo = async () => import('../repos/research-sets-repo.js');
// Question embedding: createEmbedding (api/lib/ai.js, config.ai.embeddings.model) — the same call answer-cache's prep path uses.
const defaultEmbed = async (q) => (await (await import('../ai.js')).createEmbedding(q)).embedding;

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a?.length || 0, b?.length || 0);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Closest set to the question at/above `threshold` → { set, similarity } | null. An exact normalised-question hit counts as 1. */
export async function lookupResearch(question, { embed = defaultEmbed, repo = null, threshold = RESEARCH_THRESHOLD } = {}) {
  if (!normalizeQuestion(question)) return null;
  repo ||= await defaultRepo();
  const exact = await repo.researchSetByHash(questionHash(question));
  if (exact && exact.status !== 'stale') return { set: exact, similarity: 1 };
  const emb = await embed(question);
  if (!emb) return null;
  let best = null;
  for (const set of await repo.researchSetsForScan()) {
    const similarity = cosine(emb, set.embedding);
    if (similarity < threshold) continue;
    if (!best || similarity > best.similarity + 1e-9 || (Math.abs(similarity - best.similarity) <= 1e-9 && set.status === 'curated' && best.set.status !== 'curated')) best = { set, similarity };
  }
  if (best) await repo.bumpResearchHit?.(best.set.id);
  return best;
}

/** Record the passages an answer used as a candidate set (an existing curated set is never overwritten; its hits grow). */
export async function captureResearch(question, passagesUsed, { kind = 'question', embed = defaultEmbed, repo = null, gaps = [] } = {}) {
  if (!normalizeQuestion(question)) return null;
  repo ||= await defaultRepo();
  const seen = new Set();
  const passages = (passagesUsed || []).map((p) => ({ id: p.id, document_id: p.document_id ?? p.doc_id ?? null, paragraph_index: p.paragraph_index ?? null,
    ...(p.role ? { role: p.role } : {}), ...(p.note ? { note: p.note } : {}), ...(p.title ? { title: p.title } : {}), ...(p.author ? { author: p.author } : {}), ...((p.source_url || p.url) ? { url: p.source_url || p.url } : {}) }))
    .filter((p) => p.id != null && !seen.has(p.id) && seen.add(p.id));
  if (!passages.length) return null;
  const existing = await repo.researchSetByHash(questionHash(question));
  const embedding = existing?.embedding ? null : await embed(question);
  return repo.upsertResearchCandidate({ question, hash: questionHash(question), embedding, kind, passages, gaps });
}

/** Set → agent-ready passages (text re-read from the library); a paragraph that no longer exists is dropped. Set order kept. */
export async function hydrate(set, { paragraphsByIds = null } = {}) {
  const read = paragraphsByIds || (await import('../paragraphs-repo.js')).paragraphsByIds;
  const rows = await read((set?.passages || []).map((p) => p.id));
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  return (set?.passages || []).flatMap((p) => {
    const r = byId.get(Number(p.id));
    if (!r) return [];
    return [{ ...r, id: r.id, document_id: r.document_id ?? r.doc_id ?? p.document_id, source_url: r.source_url || p.url || null,
      title: r.title || p.title || r.d_title, author: r.author || p.author || r.d_author, religion: r.religion || r.d_religion, ...(p.role ? { role: p.role } : {}), ...(p.note ? { note: p.note } : {}) }];
  });
}
