// research-sets-repo — cached RESEARCH SETS (passage identities + roles per question, migration 201), never reply text.
// Embeddings are Float32 blobs. Writes route through the single writer via db.js. Server processes only. Deps: db.js
import { query, queryAll, queryOne } from '../db.js';

const toBuf = (emb) => Buffer.from(Float32Array.from(emb).buffer);
const fromBuf = (b) => (b ? Array.from(new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))) : null);
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const shape = (r) => r && ({ ...r, embedding: fromBuf(r.embedding), passages: parse(r.passages, []), gaps: parse(r.gaps, []) });

/** Every set that has an embedding (curated first), bounded: the lookup's cosine scan. */
export async function researchSetsForScan({ limit = 20000 } = {}) {
  return (await queryAll(`SELECT * FROM research_sets WHERE embedding IS NOT NULL AND status != 'stale'
    ORDER BY (status = 'curated') DESC, hits DESC LIMIT ?`, [Number(limit)], 'research-sets:scan')).map(shape);
}
/** One set by its normalised-question hash (null if none). */
export async function researchSetByHash(hash) {
  return shape(await queryOne('SELECT * FROM research_sets WHERE question_hash = ?', [hash], 'research-sets:by-hash'));
}
/** Insert a candidate, or refresh an existing CANDIDATE (curated/stale rows keep their passages; only hits grow). */
export async function upsertResearchCandidate({ question, hash, embedding = null, kind = 'question', passages = [], gaps = [] }) {
  await query(`INSERT INTO research_sets (question, question_hash, embedding, kind, passages, gaps, hits)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(question_hash) DO UPDATE SET hits = hits + 1, updated_at = CURRENT_TIMESTAMP,
      embedding = COALESCE(research_sets.embedding, excluded.embedding),
      passages = CASE WHEN research_sets.status = 'candidate' THEN excluded.passages ELSE research_sets.passages END,
      gaps = CASE WHEN research_sets.status = 'candidate' THEN excluded.gaps ELSE research_sets.gaps END,
      version = CASE WHEN research_sets.status = 'candidate' THEN research_sets.version + 1 ELSE research_sets.version END`,
  [question, hash, embedding ? toBuf(embedding) : null, kind, JSON.stringify(passages), JSON.stringify(gaps)], 'research-sets:upsert');
  return researchSetByHash(hash);
}
/** Count one serve of a set. */
export const bumpResearchHit = (id) => query('UPDATE research_sets SET hits = hits + 1 WHERE id = ?', [Number(id)], 'research-sets:hit');
/** Newest sets for the ops view (no embeddings): question, status, hits, passage count. */
export async function listResearchSets({ limit = 50, status = null } = {}) {
  return (await queryAll(`SELECT id, question, kind, status, hits, version, passages, updated_at FROM research_sets ${status ? 'WHERE status = ?' : ''}
    ORDER BY updated_at DESC LIMIT ?`, [...(status ? [status] : []), Number(limit)], 'research-sets:list'))
    .map((r) => ({ ...r, passages: parse(r.passages, []).length }));
}
