// Answer cache (perf Layer 1): embedding-matched question cache with VERSIONED
// metrics and STALE-WHILE-REVALIDATE.
//
// Rules of the cache:
//  - Opening turns only — follow-ups depend on conversation context and never touch it.
//  - Two tiers on read: same-version match streams the crafted answer instantly
//    (hit-fresh); version-mismatched match streams the OLD answer instantly
//    (hit-stale) AND queues a background revalidation that re-runs the full
//    pipeline at the current version and replaces the row — search improvements
//    phase out the outdated cache systematically without losing the latency win.
//  - Every serve writes one answer_cache_serves row (status × versions × latency ×
//    similarity) — the measurement substrate for per-version dashboards.
//  - SEARCH_VERSION below is bumped INTENTIONALLY when retrieval/crafting logic
//    changes quality (not on every deploy). Bumping never drops the cache; it
//    marks it stale.
// Writes ride query() (single-writer routed). Reads are local.
import { createHash } from 'crypto';
import { query, queryOne, queryAll } from './db.js';
import { logger } from './logger.js';

// ── The search-quality version. Bump when retrieval or crafting changes answers. ──
export const SEARCH_VERSION = '2026-08-09.1';

const SIM_THRESHOLD = 0.93;       // "same question"
const MAX_CANDIDATES = 20000;     // cosine scan cap (matches deep_research pattern; ANN index later)
const REVALIDATE_CONCURRENCY = 2;

export const normalizeQuestion = (q) => String(q || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[‘’ʻ]/g, "'").replace(/\s+/g, ' ').trim();

export const questionHash = (q) => createHash('sha256').update(normalizeQuestion(q)).digest('hex').slice(0, 32);

const toBuf = (emb) => Buffer.from(Float32Array.from(emb).buffer);
const fromBuf = (buf) => Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Record a serve-metrics row (fire-and-forget — metrics never block chat). */
export function recordServe({ question_hash, cache_status, served_version = null, similarity = null, latency_ms = null }) {
  query(
    `INSERT INTO answer_cache_serves (question_hash, cache_status, served_version, current_version, similarity, latency_ms)
     VALUES (?,?,?,?,?,?)`,
    [question_hash || null, cache_status, served_version, SEARCH_VERSION, similarity, latency_ms]
  ).catch((e) => logger.warn({ err: e.message }, 'answer-cache metrics write failed'));
}

/** Ensure the current version is logged (idempotent; called lazily). */
let _versionLogged = false;
async function ensureVersionRow() {
  if (_versionLogged) return;
  _versionLogged = true;
  await query(`INSERT OR IGNORE INTO search_versions (version) VALUES (?)`, [SEARCH_VERSION]).catch(() => {});
}

/**
 * Look up a cached answer for an opening-turn question.
 * Returns { entry, similarity, stale } or null. Exact-hash first, then cosine scan.
 */
export async function checkAnswerCache(question, { persona = 'Jafar', embedding = null } = {}) {
  try {
    await ensureVersionRow();
    const hash = questionHash(question);
    const exact = await queryOne(
      `SELECT * FROM answer_cache WHERE question_hash = ? AND persona = ?`, [hash, persona]
    );
    if (exact?.answer_md) {
      return { entry: exact, similarity: 1, stale: exact.search_version !== SEARCH_VERSION };
    }
    if (!embedding) return null;   // similarity pass requires the caller's embedding
    const rows = await queryAll(
      `SELECT id, question_hash, question_embedding, answer_md, research_json, citations_json,
              search_version, persona FROM answer_cache
       WHERE persona = ? AND question_embedding IS NOT NULL AND answer_md IS NOT NULL
       ORDER BY last_served_at DESC LIMIT ?`, [persona, MAX_CANDIDATES]
    );
    let best = null, bestScore = 0;
    for (const r of rows) {
      const s = cosine(embedding, fromBuf(r.question_embedding));
      if (s > bestScore) { bestScore = s; best = r; }
    }
    if (best && bestScore >= SIM_THRESHOLD) {
      return { entry: best, similarity: bestScore, stale: best.search_version !== SEARCH_VERSION };
    }
    return null;
  } catch (err) {
    logger.warn({ err: err.message }, 'answer-cache lookup failed (non-fatal)');
    return null;
  }
}

/** Write-through after a successful full-pipeline answer (opening turns only). */
export async function storeAnswer(question, { persona = 'Jafar', embedding = null, tradition = null, research = null, answer = '', citations = null, retrieved_count = 0, web_fallback = false }) {
  try {
    if (!answer || answer.length < 40) return;   // don't cache empty/refusal stubs
    const hash = questionHash(question);
    await query(
      `INSERT INTO answer_cache (question_norm, question_hash, question_embedding, tradition, persona,
         research_json, answer_md, citations_json, search_version, retrieved_count, web_fallback, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,unixepoch())
       ON CONFLICT(question_hash, persona) DO UPDATE SET
         question_embedding=excluded.question_embedding, tradition=excluded.tradition,
         research_json=excluded.research_json, answer_md=excluded.answer_md,
         citations_json=excluded.citations_json, search_version=excluded.search_version,
         retrieved_count=excluded.retrieved_count, web_fallback=excluded.web_fallback,
         updated_at=unixepoch()`,
      [normalizeQuestion(question), hash, embedding ? toBuf(embedding) : null, tradition, persona,
        research ? JSON.stringify(research).slice(0, 400000) : null, answer,
        citations ? JSON.stringify(citations).slice(0, 100000) : null,
        SEARCH_VERSION, retrieved_count, web_fallback ? 1 : 0]
    );
    recordServe({ question_hash: hash, cache_status: 'store' });
  } catch (err) {
    logger.warn({ err: err.message }, 'answer-cache store failed (non-fatal)');
  }
}

/** Bump hit counters on a served entry (fire-and-forget). */
export function touchEntry(id) {
  query(`UPDATE answer_cache SET hit_count = hit_count + 1, last_served_at = unixepoch() WHERE id = ?`, [id])
    .catch(() => {});
}

// ── Stale-while-revalidate ───────────────────────────────────────────────────
// A stale hit is served immediately; revalidation re-runs the pipeline at the
// CURRENT version in the background and overwrites the row. Bounded concurrency
// + per-entry dedupe so a popular stale question can't stampede the pipeline.
const _inFlight = new Set();

export function queueRevalidation(entry, runFresh) {
  if (_inFlight.has(entry.id) || _inFlight.size >= REVALIDATE_CONCURRENCY) return;
  _inFlight.add(entry.id);
  setImmediate(async () => {
    try {
      logger.info({ id: entry.id, from: entry.search_version, to: SEARCH_VERSION }, 'answer-cache revalidating stale entry');
      await runFresh();   // the caller re-runs the pipeline + storeAnswer (same hash → row replaced)
      recordServe({ question_hash: entry.question_hash, cache_status: 'revalidated', served_version: SEARCH_VERSION });
    } catch (err) {
      logger.warn({ err: err.message, id: entry.id }, 'answer-cache revalidation failed');
    } finally {
      _inFlight.delete(entry.id);
    }
  });
}

/** Cheap aggregate stats for the pipeline snapshot / admin dashboards. */
export async function cacheStats() {
  const [size, byVersion, last24] = await Promise.all([
    queryOne(`SELECT COUNT(*) n FROM answer_cache`),
    queryAll(`SELECT search_version, COUNT(*) n FROM answer_cache GROUP BY search_version ORDER BY n DESC LIMIT 5`),
    queryAll(`SELECT cache_status, COUNT(*) n, ROUND(AVG(latency_ms)) avg_ms FROM answer_cache_serves
              WHERE ts >= unixepoch() - 86400 GROUP BY cache_status`),
  ]);
  return { current_version: SEARCH_VERSION, entries: size?.n || 0, by_version: byVersion, serves_24h: last24 };
}
