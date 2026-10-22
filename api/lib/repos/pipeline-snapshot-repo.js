// pipeline-snapshot-repo — the reads behind data/pipeline-status.json (admin dashboard, analytics, missing books, health).
// Called ONLY by api/lib/ops/pipeline-snapshot-job.js inside siftersearch-reports. Each function names its cost; the
// job gives the costly ones a TTL. ai_usage is read INCREMENTALLY by rowid range (usageDelta), never month-wide.
// Deps: db.js, pipeline/snapshot-queries.js.
import { queryAll, queryOne } from '../db.js';
import { LANG_TOTALS_SQL, LANG_PENDING_EMBEDDING_SQL, LANG_PENDING_SYNC_V2_SQL, mergeByLanguage,
  EMB_TOTAL_SQL, EMB_MISSING_SQL, EMB_DIRTY_SQL } from '../pipeline/snapshot-queries.js';

// ── cheap (partial indexes / tiny tables): every run ─────────────────────────────────────────────────────────────────
/** Priority books' entity-mention sync (deleted content excluded — orphan mentions linger on deduped docs). ~20 ms. */
export const priorityBooks = () => queryAll(
  `SELECT d.title, d.doc_priority AS priority, COUNT(em.id) AS mentions,
          SUM(CASE WHEN em.em_synced=1 THEN 1 ELSE 0 END) AS synced
     FROM entity_mentions em
     JOIN content c ON c.id = CAST(em.content_id AS INTEGER)
     JOIN docs d ON d.id = c.doc_id
    WHERE d.doc_priority >= 600 AND c.deleted_at IS NULL AND d.deleted_at IS NULL
    GROUP BY d.id ORDER BY d.doc_priority DESC, synced DESC LIMIT 40`, [], 'snapshot:priority-books');
/** Paragraphs waiting to sync (partial index idx_content_unsynced_partial). */
export const syncBacklog = async () => (await queryOne(EMB_DIRTY_SQL, [], 'snapshot:emb-dirty'))?.n ?? null;
/** Paragraphs with no embedding (partial index idx_content_needs_embedding_v2). */
export const embeddingMissing = async () => (await queryOne(EMB_MISSING_SQL, [], 'snapshot:emb-missing'))?.n ?? null;
/** Entity mentions not yet pushed to the sidecar index (partial index idx_em_unsynced). */
export const mentionsUnsynced = async () =>
  (await queryOne('SELECT COUNT(*) AS n FROM entity_mentions WHERE em_synced=0', [], 'snapshot:em-unsynced'))?.n ?? null;

// ── costly: TTL-gated by the job ─────────────────────────────────────────────────────────────────────────────────────
/** Live paragraphs — a covering-index count over every content row (~10 s cold, ~70 MB of index). The content-integrity
 *  tripwire and the embedding total share it. */
export const liveParagraphs = async () => (await queryOne(EMB_TOTAL_SQL, [], 'snapshot:live-paras'))?.n ?? null;
/** Per-language totals from docs + pending backlogs from the partial indexes. */
export async function byLanguage() {
  const [t, e, s] = await Promise.all([
    queryAll(LANG_TOTALS_SQL, [], 'snapshot:lang-totals'),
    queryAll(LANG_PENDING_EMBEDDING_SQL, [], 'snapshot:lang-pending-embedding'),
    queryAll(LANG_PENDING_SYNC_V2_SQL, [], 'snapshot:lang-pending-sync'),
  ]);
  return mergeByLanguage(t, e, s);
}
/** The 50 docs with the most paragraphs waiting for an embedding / a sync (aggregate first on the partial index). */
export const pendingEmbeddingByDoc = () => queryAll(`
  WITH pending AS (
    SELECT doc_id, COUNT(*) n FROM content WHERE embedding IS NULL AND deleted_at IS NULL
     GROUP BY doc_id ORDER BY n DESC LIMIT 50)
  SELECT d.id, d.title, d.author, d.language, d.file_path, pending.n AS pending_paragraphs
    FROM pending JOIN docs d ON d.id = pending.doc_id WHERE d.deleted_at IS NULL
   ORDER BY pending_paragraphs DESC`, [], 'snapshot:pending-embedding');
export const pendingSyncByDoc = () => queryAll(`
  WITH unsynced AS (
    SELECT doc_id, COUNT(*) n FROM content WHERE synced = 0 AND deleted_at IS NULL AND embedding IS NOT NULL
     GROUP BY doc_id ORDER BY n DESC LIMIT 50)
  SELECT d.id, d.title, d.author, d.language, unsynced.n AS unsynced_paragraphs
    FROM unsynced JOIN docs d ON d.id = unsynced.doc_id WHERE d.deleted_at IS NULL
   ORDER BY unsynced_paragraphs DESC`, [], 'snapshot:pending-sync');

// ── ai_usage, incrementally ──────────────────────────────────────────────────────────────────────────────────────────
// ai_usage is append-only, so the rollup carries forward by rowid: each run reads only rows added since the last one,
// as a rowid RANGE (SEARCH … USING INTEGER PRIMARY KEY). The month-wide GROUP BYs this replaces scanned the WHOLE table
// through the model/provider/caller indexes — ~45 s and GBs of reads every hour (10-22).
export const usageTop = async () => Number((await queryOne('SELECT MAX(rowid) AS m FROM ai_usage', [], 'snapshot:usage-top'))?.m) || 0;
/** First rowid at or after `ts` — through the timestamp index (MIN(rowid) … WHERE timestamp walks the table). */
export const usageFirstSince = async (ts) => Number((await queryOne(
  `SELECT rowid AS m FROM ai_usage INDEXED BY idx_ai_usage_timestamp WHERE timestamp >= ? ORDER BY timestamp LIMIT 1`,
  [ts], 'snapshot:usage-first'))?.m) || null;
export const USAGE_DELTA_SQL = `SELECT substr(replace(timestamp, 'T', ' '), 1, 13) AS hour, model, provider, caller,
    COUNT(*) AS n, COALESCE(SUM(total_tokens), 0) AS tokens, COALESCE(SUM(estimated_cost_usd), 0) AS cost,
    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed
  FROM ai_usage WHERE rowid > ? AND rowid <= ? GROUP BY 1, 2, 3, 4`;
/** Rows (lo, hi] grouped by UTC hour × model × provider × caller. */
export const usageDelta = (lo, hi) => queryAll(USAGE_DELTA_SQL, [lo, hi], 'snapshot:usage-delta');
/** All-time model / caller names — the ai-usage page's filter lists. Seeded ONCE (covering-index scans, ~2.5 s each);
 *  afterwards the job adds names it sees in deltas. */
export async function usageNames() {
  const [m, c] = await Promise.all([
    queryAll('SELECT DISTINCT model FROM ai_usage ORDER BY model', [], 'snapshot:usage-models'),
    queryAll('SELECT DISTINCT caller FROM ai_usage WHERE caller IS NOT NULL ORDER BY caller', [], 'snapshot:usage-callers'),
  ]);
  return { models: m.map((r) => r.model), callers: c.map((r) => r.caller) };
}
/** AI calls in the last minutes by service_type — what is running right now (timestamp index, narrow window). */
export const usageByServiceSince = (ts) => queryAll(`
  SELECT service_type, COUNT(*) AS calls, MAX(timestamp) AS last_at, COALESCE(SUM(estimated_cost_usd),0) AS cost
    FROM ai_usage WHERE timestamp >= ? GROUP BY service_type ORDER BY calls DESC`, [ts], 'snapshot:usage-now');

// ── site activity (search_log, companion_exposure — small tables) ────────────────────────────────────────────────────
const NOT_LOOKUP = `search_type NOT LIKE 'api_source_hunt%' AND search_type NOT LIKE 'api_original%'`;
export async function searchActivity({ day1, day7, day14 }) {
  const totals = await queryOne(`
    SELECT
      SUM(CASE WHEN search_type != 'api_chat' AND ${NOT_LOOKUP} AND created_at >= ? THEN 1 ELSE 0 END) AS searches_d1,
      SUM(CASE WHEN search_type != 'api_chat' AND ${NOT_LOOKUP} AND created_at >= ? THEN 1 ELSE 0 END) AS searches_d7,
      SUM(CASE WHEN (search_type LIKE 'api_source_hunt%' OR search_type LIKE 'api_original%') AND created_at >= ? THEN 1 ELSE 0 END) AS lookups_d7,
      SUM(CASE WHEN search_type = 'api_chat' AND created_at >= ? THEN 1 ELSE 0 END) AS chat_d1,
      SUM(CASE WHEN search_type = 'api_chat' AND created_at >= ? THEN 1 ELSE 0 END) AS chat_d7,
      AVG(CASE WHEN search_type != 'api_chat' AND created_at >= ? THEN duration_ms ELSE NULL END) AS avg_ms_d7,
      SUM(CASE WHEN result_count = 0 AND search_type != 'api_chat' AND created_at >= ? THEN 1 ELSE 0 END) AS zero_result_d7
    FROM search_log WHERE created_at >= ? AND COALESCE(is_test, 0) = 0`,
  [day1, day7, day7, day1, day7, day7, day7, day7], 'snapshot:search-totals');
  const series = await queryAll(`
    SELECT substr(created_at, 1, 10) AS day,
           SUM(CASE WHEN search_type = 'api_chat' THEN 0 ELSE 1 END) AS searches,
           SUM(CASE WHEN search_type = 'api_chat' THEN 1 ELSE 0 END) AS chat
      FROM search_log WHERE created_at >= ? AND COALESCE(is_test, 0) = 0
     GROUP BY day ORDER BY day ASC`, [day14], 'snapshot:search-series');
  const topQueries = await queryAll(`
    SELECT query, COUNT(*) AS n, AVG(result_count) AS avg_results, MAX(strategy) AS strategy
      FROM search_log
     WHERE created_at >= ? AND search_type != 'api_chat' AND ${NOT_LOOKUP}
       AND length(trim(query)) > 0 AND COALESCE(is_test, 0) = 0
     GROUP BY lower(trim(query)) ORDER BY n DESC LIMIT 25`, [day7], 'snapshot:search-top');
  const chatUsers = await queryOne(`
    SELECT COUNT(DISTINCT participant_id) AS d7, COUNT(DISTINCT CASE WHEN created_at >= ? THEN participant_id END) AS d1
      FROM companion_exposure WHERE created_at >= ?`, [day1, day7], 'snapshot:chat-users');
  const chatUsersAll = (await queryOne('SELECT COUNT(DISTINCT participant_id) AS n FROM companion_exposure', [], 'snapshot:chat-users-all'))?.n ?? null;
  const saved = (await queryOne('SELECT COUNT(*) AS n FROM published_conversations', [], 'snapshot:saved-conversations'))?.n ?? null;
  const strategies = await queryAll(`
    SELECT COALESCE(strategy, '(not planned)') AS strategy, COUNT(*) AS n FROM search_log
     WHERE created_at >= ? AND search_type != 'api_chat' AND ${NOT_LOOKUP} AND COALESCE(is_test, 0) = 0
     GROUP BY 1 ORDER BY n DESC`, [day7], 'snapshot:search-strategies');
  if (totals) Object.assign(totals, { chat_users_d7: chatUsers?.d7 ?? null, chat_users_d1: chatUsers?.d1 ?? null,
    chat_users_all: chatUsersAll, saved_conversations: saved });
  return { totals, series, topQueries, strategies };
}

/** Library size and breadth from the denormalised docs.paragraph_count (a docs-table pass, ~1 s cold). */
export async function corpusSummary() {
  const tot = await queryOne(`SELECT COUNT(*) AS docs, COALESCE(SUM(paragraph_count),0) AS paras
    FROM docs WHERE deleted_at IS NULL AND duplicate_of IS NULL`, [], 'snapshot:corpus-total');
  const byReligion = await queryAll(`SELECT COALESCE(NULLIF(religion,''),'General') AS religion,
      COUNT(*) AS docs, COALESCE(SUM(paragraph_count),0) AS paras
    FROM docs WHERE deleted_at IS NULL AND duplicate_of IS NULL
    GROUP BY COALESCE(NULLIF(religion,''),'General') ORDER BY docs DESC LIMIT 14`, [], 'snapshot:corpus-religion');
  return { docs: tot?.docs ?? null, paras: tot?.paras ?? null, byReligion };
}

// ── missing books (6 h): stubs LIKE-scan low-¶ docs' content (~6 s) ─────────────────────────────────────────────────
// Catalogue rows (Phelps inventory / bibliography) are not missing books.
const NOT_CATALOGUE = `
      AND d.title NOT LIKE '%Partial Inventory%'
      AND COALESCE(d.source_url,'') NOT LIKE '%bahai-library.com/inventory/%'
      AND COALESCE(d.source_url,'') NOT LIKE '%bahai-library.com/bibliography/%'
      AND COALESCE(d.author,'') NOT LIKE 'inventory-%'
      AND COALESCE(d.author,'') NOT LIKE 'bibliography-%'`;
/** Scraped metadata-page stubs (logo/TAGS chrome, <36 ¶), with whether they link a source file. */
export const stubDocs = () => queryAll(`
  SELECT d.id, d.title, d.author, d.paragraph_count AS paras, d.religion, d.collection, d.source_url,
         SUM(CASE WHEN c.text LIKE '%logo_1850x358%' THEN 1 ELSE 0 END) AS logo,
         SUM(CASE WHEN c.text LIKE '%TAGS:%' THEN 1 ELSE 0 END) AS tags,
         SUM(CASE WHEN c.text LIKE '%bahai-library.com/docs/%' OR c.text LIKE '%.docx%' OR c.text LIKE '%.pdf%' THEN 1 ELSE 0 END) AS doclinks
    FROM docs d JOIN content c ON c.doc_id = d.id AND c.deleted_at IS NULL
   WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL AND d.language = 'en'
     AND d.paragraph_count BETWEEN 1 AND 35${NOT_CATALOGUE}
   GROUP BY d.id HAVING logo > 0 OR tags > 0 ORDER BY d.title`, [], 'snapshot:missing-stubs');
/** Live doc rows with zero live content. */
export const huskDocs = () => queryAll(`
  SELECT d.id, d.title, d.author, d.religion, d.collection, d.source_url
    FROM docs d WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL
     AND NOT EXISTS (SELECT 1 FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL)${NOT_CATALOGUE}
   ORDER BY d.title`, [], 'snapshot:missing-husks');
/** Docs that hold a work's text (> 35 ¶) — to drop candidates we already have. */
export const heldDocs = () => queryAll(`SELECT d.id, d.title, d.author, d.paragraph_count AS paras FROM docs d
  WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL AND d.paragraph_count > 35`, [], 'snapshot:missing-held');
/** One stub's paragraph that links its source file. */
export const stubLinkText = async (docId) => (await queryOne(`SELECT text FROM content WHERE doc_id=? AND deleted_at IS NULL
  AND (text LIKE '%bahai-library.com/docs/%' OR text LIKE '%.docx%' OR text LIKE '%.pdf%') LIMIT 1`, [docId], 'snapshot:stub-link'))?.text ?? '';
