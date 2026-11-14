// Edge research cache + question log + conversations. Pure; env injected: ANIS_DB (D1), ANIS_VEC (Vectorize), AI (Workers AI).
// Mirrors api/lib/assistant/research-cache.js + question-log.js, but sets hold a passage SNAPSHOT (text included): a hit needs no tower call.
import { imagesForPassages, toolImages } from '../../api/lib/illustrations.js';
import { researchVersion } from './tool-shape.js';
export const EMBED_MODEL = '@cf/baai/bge-m3';   // 1024-d, multilingual, cosine
// bge-m3: calibrate (brief D2) — values carried over from the tower embedding model
export const SAME_QUESTION = 0.88;
export const RELATED = 0.62;   // bge-m3 question↔question (11-13 calibration, 36 seeds × 3 paraphrases): paraphrases 0.26–0.94, related up to 0.87, unrelated ≤ 0.68 — no line separates same from related, so the agent judges anything ≥ this
export const MAX_PASSAGES = 24;
// held research is versioned (11-14 Taherzadeh: sets saved before the volume-aware search kept serving vol. 3 only): each passage a set
// holds is stamped with the version it was found under; a set not of the current version is not served, and a new capture replaces it.
// Curated sets are a person's decision and are served whatever their version.
export const RESEARCH_VERSION = researchVersion();
export const currentSet = (set, version = RESEARCH_VERSION) => set?.status === 'curated' || (!!set?.passages?.length && set.passages.every((p) => p?.v === version));

export const normalizeQuestion = (q) => String(q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʻ]/g, "'").replace(/\s+/g, ' ').trim();
// same value as tower questionHash (sha256 hex, first 32)
export const questionHash = async (q) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeQuestion(q))))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
export const outcomeOf = (s) => (s >= SAME_QUESTION ? 'hit' : s >= RELATED ? 'related' : 'miss');

export async function embed(env, text) {
  const r = await env.AI.run(EMBED_MODEL, { text: [String(text)] });
  return r?.data?.[0] || null;
}
// a set carries the pictures its passages have (0–2, illustrations.js; derived on read, so a set held before the index has them too)
const withImages = (set) => ({ ...set, images: toolImages(imagesForPassages(set.passages)) });
const parse = (row) => (row ? withImages({ ...row, passages: JSON.parse(row.passages || '[]') }) : null);
const byHash = async (env, h) => parse(await env.ANIS_DB.prepare('SELECT * FROM anis_research_sets WHERE qhash = ?').bind(h).first());
const bump = (env, id) => env.ANIS_DB.prepare('UPDATE anis_research_sets SET hits = hits + 1 WHERE id = ?').bind(id).run();

/** Exact (non-stale) qhash hit = similarity 1, else nearest vector ≥ threshold (curated beats candidate on ties) → { set, similarity } | null. */
export async function lookup(env, question, { threshold = RELATED, version = RESEARCH_VERSION } = {}) {
  if (!normalizeQuestion(question)) return null;
  const exact = await byHash(env, await questionHash(question));
  if (exact && exact.status !== 'stale' && currentSet(exact, version)) { await bump(env, exact.id); return { set: exact, similarity: 1 }; }
  const vec = await embed(env, question);
  if (!vec) return null;
  const matches = ((await env.ANIS_VEC.query(vec, { topK: 5, returnMetadata: 'none' }))?.matches || []).filter((m) => m.score >= threshold);
  if (!matches.length) return null;
  const { results } = await env.ANIS_DB.prepare(`SELECT * FROM anis_research_sets WHERE status != 'stale' AND id IN (${matches.map(() => '?').join(',')})`).bind(...matches.map((m) => Number(m.id))).all();
  const rows = new Map(results.map((r) => [String(r.id), r]));
  let best = null;
  for (const m of matches) {
    const row = rows.get(String(m.id));
    if (!row) continue;
    const set = parse(row);
    if (!currentSet(set, version)) continue;
    if (!best || m.score > best.similarity + 1e-9 || (Math.abs(m.score - best.similarity) <= 1e-9 && row.status === 'curated' && best.set.status !== 'curated')) best = { set, similarity: m.score };
  }
  if (best) await bump(env, best.set.id);
  return best;
}

const snap = (p, v) => ({ id: p.id, document_id: p.document_id ?? p.doc_id ?? null, paragraph_index: p.paragraph_index ?? null, text: p.text ?? null,
  title: p.title ?? null, author: p.author ?? null, source_url: p.source_url || p.url || null, religion: p.religion ?? null, cover_url: p.cover_url ?? null, year: p.year ?? null,
  ...(p.role ? { role: p.role } : {}), ...(p.note ? { note: p.note } : {}),
  // the standing fields source-tier reads (11-14: sets held no collection, so a translator's study filed under Bahá'u'lláh counted as a Writing)
  ...Object.fromEntries(['collection', 'book_author', 'translator', 'translation', 'language'].filter((k) => p[k] != null).map((k) => [k, p[k]])), v });

/** Record passages as a candidate set (curated sets never overwritten, only hits grow). `question` may be a matched set's question to grow it. */
export async function capture(env, question, passages, { version = RESEARCH_VERSION } = {}) {
  if (!normalizeQuestion(question)) return null;
  const seen = new Set();
  const fresh = (passages || []).map((p) => snap(p, version)).filter((p) => p.id != null && !seen.has(p.id) && seen.add(p.id));
  if (!fresh.length) return null;
  const hash = await questionHash(question), existing = await byHash(env, hash), now = Date.now();
  if (existing?.status === 'curated') { await bump(env, existing.id); return existing; }
  if (existing?.status === 'candidate' && currentSet(existing, version)) for (const p of existing.passages) if (p.id != null && !seen.has(p.id) && seen.add(p.id)) fresh.push(p);
  fresh.splice(MAX_PASSAGES);
  const row = await env.ANIS_DB.prepare(`INSERT INTO anis_research_sets (question, qhash, status, passages, hits, created_at, updated_at) VALUES (?,?,'candidate',?,0,?,?)
    ON CONFLICT(qhash) DO UPDATE SET status='candidate', passages=excluded.passages, updated_at=excluded.updated_at RETURNING *`)
    .bind(String(question).slice(0, 500), hash, JSON.stringify(fresh), now, now).first();
  // vector only when new or revived from stale (a growing candidate keeps its question vector)
  if (!existing || existing.status === 'stale') {
    const vec = await embed(env, question).catch(() => null);
    if (vec) await env.ANIS_VEC.upsert([{ id: String(row.id), values: vec, metadata: { status: 'candidate' } }]);
  }
  return parse(row);
}

/** A set that led a reply wrong (a reader's correction) stops being served: stale sets are skipped by lookup and a new capture of the
 *  question starts afresh. Curated sets are a person's decision, never staled here. → true when a set changed. */
export async function markStale(env, id) {
  const r = await env.ANIS_DB.prepare("UPDATE anis_research_sets SET status = 'stale', updated_at = ? WHERE id = ? AND status = 'candidate'").bind(Date.now(), Number(id)).run();
  return (r?.meta?.changes ?? r?.changes ?? 0) > 0;
}

/** Record one researched question; never throws. */
export async function logQuestion(env, { question, similarity = null, setId = null, site = null, channel = null, ms = null, format = null } = {}) {
  try {
    const q = String(question || '').trim();
    if (!q) return null;
    await env.ANIS_DB.prepare('INSERT INTO anis_question_log (at, question, qhash, outcome, similarity, set_id, site, channel, ms, format) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(Date.now(), q.slice(0, 500), await questionHash(q), similarity == null ? 'miss' : outcomeOf(similarity), similarity, setId, site, channel, ms, format).run();
    return true;
  } catch (err) { console.warn(`[anis] question log failed: ${err?.message}`); return null; }
}

/** Upsert the conversation row and one turn (conversation_id, round, role). */
export async function saveTurn(env, { conversationId, round, role, content, meta = null, site = null, channel = null, reader = null }) {
  const now = Date.now();
  await env.ANIS_DB.prepare(`INSERT INTO anis_conversations (id, site, channel, reader, created_at, updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, reader=COALESCE(excluded.reader, reader)`).bind(conversationId, site, channel, reader, now, now).run();
  await env.ANIS_DB.prepare('INSERT OR REPLACE INTO anis_turns (conversation_id, round, role, content, meta, at) VALUES (?,?,?,?,?,?)')
    .bind(conversationId, round, role, String(content ?? ''), meta == null ? null : JSON.stringify(meta), now).run();
}

/** → { conversation, turns: [{round, role, content, meta, at}] } | null */
export async function loadConversation(env, conversationId) {
  const conversation = await env.ANIS_DB.prepare('SELECT * FROM anis_conversations WHERE id = ?').bind(conversationId).first();
  if (!conversation) return null;
  const { results } = await env.ANIS_DB.prepare("SELECT round, role, content, meta, at FROM anis_turns WHERE conversation_id = ? ORDER BY round, CASE role WHEN 'user' THEN 0 ELSE 1 END, at").bind(conversationId).all();
  return { conversation, turns: results.map((t) => ({ ...t, meta: t.meta ? JSON.parse(t.meta) : null })) };
}
