// Computes the entity-pipeline + Meili health snapshot and writes
// data/pipeline-status.json. Runs as its OWN short-lived process (PM2
// cron_restart every 5 min) so the heavy synchronous better-sqlite3 queries
// (entity_mentions join, full-table counts) never block the live API or the
// single-writer worker. The API's GET /api/admin/server/pipeline just reads
// the JSON file this writes. Deps: db.js (read-only here), config, Meili REST.
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { LANG_TOTALS_SQL, LANG_PENDING_EMBEDDING_SQL, LANG_PENDING_SYNC_SQL, mergeByLanguage, EMB_TOTAL_SQL, EMB_MISSING_SQL, EMB_DIRTY_SQL } from '../api/lib/pipeline/snapshot-queries.js';

// EVERY probe below falls back to an empty value so one broken query cannot take the whole snapshot down.
// That resilience quietly became a liability: a bare `.catch` returning [] makes a FAILED query indistinguishable from
// a query that legitimately found nothing, so a snapshot built on broken probes reports zeros and every
// consumer — the dashboard, the health check, the overnight watch — reads it as "nothing pending, all fine".
// Tonight's `no such column: extract_model` is exactly what this shape hides. Keep the fallback, record the
// failure: probeFail returns the same value as before AND remembers why, so a broken probe reads as broken
// rather than as good news (2026-08-14).
const probeErrors = [];
const probeFail = (fallback) => (err) => {
  probeErrors.push({ error: String(err?.message || err).slice(0, 300) });
  return fallback;
};


const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const { queryAll, queryOne } = await import('../api/lib/db.js');
const { config } = await import('../api/lib/config.js');
const { cleanTitle } = await import('../api/lib/text/clean-title.js');
const { buildHeldIndex } = await import('../api/lib/text/already-held.js');

async function meiliTaskTotal(status) {
  const r = await fetch(`${config.search.host}/tasks?statuses=${status}&limit=0`, {
    headers: { Authorization: `Bearer ${config.search.apiKey}` },
    signal: AbortSignal.timeout(8000),
  });
  return (await r.json()).total ?? null;
}

async function main() {
  const t0 = Date.now();

  // This process is the only one on the box that reliably runs CURRENT code (cron_restart every 5 min,
  // fresh process each time), so it is where newly-declared cron apps get registered. Without it, an app
  // added to ecosystem.config.cjs never starts: the updater applies deploys but never restarts itself, so
  // registration logic placed there can never execute. Allowlisted + KNOWN-only — see ensure-pm2-apps.
  let pm2Apps = null;
  try {
    const { ensurePm2Apps } = await import('./lib/ensure-pm2-apps.mjs');
    pm2Apps = await ensurePm2Apps(ROOT);
    pm2Apps.at = new Date().toISOString();
    if (pm2Apps.registered?.length) console.log(`registered new pm2 cron apps: ${pm2Apps.registered.join(', ')}`);
    else if (pm2Apps.error) console.log(`pm2 app check skipped: ${pm2Apps.error}`);
  } catch (err) {
    pm2Apps = { error: err.message, at: new Date().toISOString() };
    console.log(`pm2 app check failed (non-fatal): ${err.message}`);
  }

  // deleted_at filters are REQUIRED: orphan entity_mentions linger on content
  // whose doc was later soft-deleted as a duplicate (the forward sync in
  // api/lib/search/entity.js skips deleted content, but never removes mentions
  // already pushed before deletion). Without these filters the snapshot counts
  // those orphans as a "pending" book (e.g. a deduped Dawn-Breakers showing
  // 0/373) and inflates "fully synced" with deleted-content mentions.
  const rows = await queryAll(
    `SELECT d.title, d.doc_priority AS priority, COUNT(em.id) AS mentions,
            SUM(CASE WHEN em.em_synced=1 THEN 1 ELSE 0 END) AS synced
     FROM entity_mentions em
     JOIN content c ON c.id = CAST(em.content_id AS INTEGER)
     JOIN docs d ON d.id = c.doc_id
     WHERE d.doc_priority >= 600 AND c.deleted_at IS NULL AND d.deleted_at IS NULL
     GROUP BY d.id ORDER BY d.doc_priority DESC, synced DESC LIMIT 40`
  ).catch(probeFail([]));
  const books = rows.map(b => ({
    title: b.title, priority: b.priority, mentions: b.mentions, synced: b.synced,
    fully_synced: b.mentions > 0 && b.synced === b.mentions,
  }));

  // Both use partial/covering indexes (idx_content_unsynced_partial,
  // idx_content_graph_unsync on =0) — fast. Counting graph_enriched=1 instead
  // would full-scan 3.3M rows (~3 min), so we report what REMAINS to extract.
  const [backlog, remaining] = await Promise.all([
    queryOne(`SELECT COUNT(*) AS n FROM content WHERE synced=0 AND deleted_at IS NULL`).catch(probeFail({ n: null })),
    queryOne(`SELECT COUNT(*) AS n FROM content WHERE graph_enriched=0 AND deleted_at IS NULL`).catch(probeFail({ n: null })),
  ]);

  let meili = {};
  try {
    const [enqueued, processing, failed, pstats] = await Promise.all([
      meiliTaskTotal('enqueued'), meiliTaskTotal('processing'), meiliTaskTotal('failed'),
      fetch(`${config.search.host}/indexes/paragraphs/stats`, {
        headers: { Authorization: `Bearer ${config.search.apiKey}` }, signal: AbortSignal.timeout(8000),
      }).then(r => r.json()).catch(probeFail({})),
    ]);
    meili = {
      enqueued, processing, failed,
      paragraphs_docs: pstats.numberOfDocuments ?? null,
      embedded_docs: pstats.numberOfEmbeddings ?? null,
      indexing: pstats.isIndexing ?? null,
    };
  } catch (err) {
    meili = { error: err.message };
  }

  // Embedding coverage: embedding IS NULL uses idx_content_needs_embedding_v2 (fast).
  // This is the authoritative "are embeddings generated?" number — DB is source of truth.
  const embMissing = await queryOne(`SELECT COUNT(*) AS n FROM content WHERE embedding IS NULL AND deleted_at IS NULL`).catch(probeFail({ n: null }));

  // Entity-mention sidecar: em_synced=0 uses idx_em_unsynced partial index (fast).
  // mentions_unsynced = backlog waiting to reach entity_mentions_idx.
  const emUnsynced = await queryOne(`SELECT COUNT(*) AS n FROM entity_mentions WHERE em_synced=0`).catch(probeFail({ n: null }));
  let entityIdxDocs = null;
  try {
    const s = await fetch(`${config.search.host}/indexes/entity_mentions_idx/stats`, {
      headers: { Authorization: `Bearer ${config.search.apiKey}` }, signal: AbortSignal.timeout(8000),
    }).then(r => r.json());
    entityIdxDocs = s.numberOfDocuments ?? null;
  } catch { /* index may be absent */ }

  // Live PM2 worker states — the authoritative "what's running" map. Cheap.
  let workers = {};
  try {
    const list = JSON.parse(execSync('pm2 jlist', { encoding: 'utf8', timeout: 8000 }));
    for (const p of list) {
      if (!p.name?.startsWith('siftersearch-')) continue;
      workers[p.name.replace('siftersearch-', '')] = {
        status: p.pm2_env?.status ?? null,
        restarts: p.pm2_env?.restart_time ?? null,
      };
    }
  } catch (err) {
    workers = { error: err.message };
  }

  // ── Content-integrity tripwire ───────────────────────────────────────────
  // The single universal safety net against ANY content-gutting bug (no matter
  // which path causes it): track total live paragraphs against a running
  // high-water baseline. A sharp unexplained drop = something is deleting en
  // masse → raise an alert the monitor surfaces. deleted_at IS NULL uses the
  // partial index, so this is cheap. See project_canonical_gutted_by_dedupe_20260609.
  const liveParas = (await queryOne(`SELECT COUNT(*) AS n FROM content WHERE deleted_at IS NULL`).catch(probeFail({ n: null })))?.n ?? null;
  let prevSnapshot = {};
  try { prevSnapshot = JSON.parse(readFileSync(join(ROOT, 'data', 'pipeline-status.json'), 'utf8')) ?? {}; } catch { /* first run */ }
  const prev = prevSnapshot.integrity ?? {};
  // High-water baseline carries forward; only ratchets UP on healthy growth.
  const baseline = Math.max(prev.baseline_live_paras ?? 0, liveParas ?? 0);
  // Alert if live content fell >2% (or >5000 paras) below the baseline high.
  const dropThreshold = Math.max(5000, Math.floor(baseline * 0.02));
  const drop = (liveParas != null && baseline) ? baseline - liveParas : 0;
  const integrity = {
    live_paras: liveParas,
    baseline_live_paras: baseline,
    drop_from_baseline: drop,
    alert: drop > dropThreshold
      ? `CONTENT DROP: live paragraphs ${liveParas} is ${drop} below baseline ${baseline} (>${dropThreshold}) — possible gutting, investigate deletions`
      : null,
  };

  // ── Admin-page rollups ─────────────────────────────────────────────────────
  // /api/admin/library/{overview,bottlenecks} and /api/admin/ai-usage/{summary,filters}
  // read these from the snapshot instead of scanning content/ai_usage in the API
  // process — one admin page-load used to block the whole API for 60s+.

  // Full-corpus aggregates (two complete passes over ~4.6M content rows). MEASURED 2026-08-13 via
  // /api/admin/server/slow-queries: the byLanguage aggregate peaks at 152s and the embedding rollup at 49s,
  // and better-sqlite3 is SYNCHRONOUS, so each run freezes this process for that long. At a 30-min TTL that
  // was ~16 runs/day ≈ 40 min/day frozen for numbers that shift by fractions of a percent in an hour.
  // 6h keeps them fresh enough for a dashboard and costs 4 runs/day.
  const LIBRARY_TTL_MS = Number(process.env.SNAPSHOT_LIBRARY_TTL_MS || 6 * 60 * 60 * 1000);
  let library = prevSnapshot.library ?? null;
  const libAge = library?.generated_at ? Date.now() - Date.parse(library.generated_at) : Infinity;
  if (libAge > LIBRARY_TTL_MS) {
    const [byLanguage, embeddingStats] = await Promise.all([
      // This one HAS to read every paragraph — it is a whole-corpus tally by language — but it does not have
      // to do it the expensive way. Joining docs to content first produced 6.7M wide rows and then asked for
      // COUNT(DISTINCT d.id) across them, forcing a temp B-tree over the lot: 151.9s per run, the worst single
      // query in the system. Rolling content up per doc_id first (one indexed pass, ~158k output rows) and
      // then joining docs turns the DISTINCT into a plain COUNT over docs. Same numbers: docs with no
      // paragraphs still count, via the LEFT JOIN + COALESCE, exactly as the LEFT JOIN gave them before.
      // Three cheap queries instead of one 55-second scan: totals from docs (158k rows), backlog from the
      // partial indexes (~34k pending rows). Merged in JS so the published shape is unchanged.
      Promise.all([
        queryAll(LANG_TOTALS_SQL, [], 'snapshot:lang-totals').catch(probeFail([])),
        queryAll(LANG_PENDING_EMBEDDING_SQL, [], 'snapshot:lang-pending-embedding').catch(probeFail([])),
        queryAll(LANG_PENDING_SYNC_SQL, [], 'snapshot:lang-pending-sync').catch(probeFail([])),
      ]).then(([t, e, sy]) => mergeByLanguage(t, e, sy)).catch(probeFail([])),
      // Was ONE query with plan `SCAN content`: 49.8s worst, and better-sqlite3 is SYNCHRONOUS so that is a
      // ~50s freeze of the process, not just a slow read. The cost was `embedding IS NOT NULL` dereferencing a
      // 512-float BLOB on ~4M rows. Three partial indexes that already existed answer the same question
      // without touching a row; `total` is with+missing, which is the SAME population the old COUNT(*) had.
      // All three EXPLAINed against PRODUCTION before being trusted — the rule this query family earned after
      // four wrong assumptions. Plans: emb-total → COVERING INDEX idx_content_deleted_at, emb-missing →
      // COVERING INDEX idx_content_needs_embedding_v2, emb-dirty → COVERING INDEX idx_content_unsynced_partial.
      // Counting `embedding IS NOT NULL` directly was tried and REJECTED: production plans it as SCAN content
      // because idx_content_has_embedding was never built there (its migration is annotated as a 17GB scan to
      // run by hand). So with_embedding is DERIVED — total and missing partition the same population exactly.
      Promise.all([
        queryOne(EMB_TOTAL_SQL, [], 'snapshot:emb-total').catch(probeFail(null)),
        queryOne(EMB_MISSING_SQL, [], 'snapshot:emb-missing').catch(probeFail(null)),
        queryOne(EMB_DIRTY_SQL, [], 'snapshot:emb-dirty').catch(probeFail(null)),
      ]).then(([t, m, dty]) => (t == null ? null : {
        total: t?.n || 0,
        with_embedding: Math.max(0, (t?.n || 0) - (m?.n || 0)),
        missing_embeddings: m?.n || 0,
        dirty: dty?.n || 0,
      })).catch(probeFail(null)),
    ]);
    library = { generated_at: new Date().toISOString(), byLanguage, embeddingStats };
  }

  // Bottleneck lists. The original note said these "ride the selective partial indexes (cheap in the steady
  // state where backlogs ≈ 0)" and recomputed them EVERY run. That premise expired: with a real backlog the
  // unsynced-paragraph list measured 54s worst-case and ran 113 times in 24h — ~1.7 HOURS/day of frozen
  // process, the single largest blocking-query cost in the system. They are a diagnostic list, not a live
  // control signal, so they carry a TTL like every other full-corpus aggregate here.
  const BOTTLENECK_TTL_MS = Number(process.env.SNAPSHOT_BOTTLENECK_TTL_MS || 60 * 60 * 1000);
  let bottlenecks = prevSnapshot.bottlenecks ?? null;
  const bnAge = bottlenecks?.generated_at ? Date.now() - Date.parse(bottlenecks.generated_at) : Infinity;
  if (bnAge > BOTTLENECK_TTL_MS) {
  const [pendingEmbedding, pendingSync] = await Promise.all([
    // AGGREGATE FIRST, JOIN SECOND. Written as `FROM docs JOIN content ... GROUP BY d.id ... LIMIT 50`, the
    // LIMIT applies AFTER the grouping, so SQLite joined and grouped the WHOLE 6.7M-row content table to
    // return 50 rows: 64.3s a run, 56 runs a day — ~3,600s/day, the single most expensive query in the
    // system by total time, and a hard freeze each time because better-sqlite3 is synchronous. Grouping
    // content on its own first lets the PARTIAL indexes (idx_content_unsynced_partial on synced=0,
    // idx_content_needs_embedding on embedding IS NULL) drive the scan, touching only pending rows, after
    // which docs is hit 50 times by primary key (2026-08-14).
    // The doc-level `deleted_at IS NULL` filter moves after the limit, so a soft-deleted doc with pending
    // rows can shorten the list rather than being replaced. That is correct for a bottleneck display: such
    // a doc IS a real backlog entry, and hiding it while its rows sit unsynced is what we want to see.
    queryAll(`
      WITH pending AS (
        SELECT doc_id, COUNT(*) n FROM content
         WHERE embedding IS NULL AND deleted_at IS NULL
         GROUP BY doc_id ORDER BY n DESC LIMIT 50)
      SELECT d.id, d.title, d.author, d.language, d.file_path, pending.n AS pending_paragraphs
        FROM pending JOIN docs d ON d.id = pending.doc_id
       WHERE d.deleted_at IS NULL
       ORDER BY pending_paragraphs DESC`, [], 'snapshot:pending-embedding').catch(probeFail([])),
    queryAll(`
      WITH unsynced AS (
        SELECT doc_id, COUNT(*) n FROM content
         WHERE synced = 0 AND deleted_at IS NULL AND embedding IS NOT NULL
         GROUP BY doc_id ORDER BY n DESC LIMIT 50)
      SELECT d.id, d.title, d.author, d.language, unsynced.n AS unsynced_paragraphs
        FROM unsynced JOIN docs d ON d.id = unsynced.doc_id
       WHERE d.deleted_at IS NULL
       ORDER BY unsynced_paragraphs DESC`, [], 'snapshot:pending-sync').catch(probeFail([])),
  ]);
    bottlenecks = { generated_at: new Date().toISOString(), pendingEmbedding, pendingSync };
  }

  // ai_usage rollups (timestamp/caller/model indexed; a few seconds on the big table).
  const fmtTs = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(); monthStart.setDate(monthStart.getDate() - 30);
  const [aiCombined, aiByModel, aiByProvider, aiByCaller, aiByCallerToday, aiModels, aiCallers] = await Promise.all([
    queryOne(`
      SELECT
        SUM(CASE WHEN timestamp >= ? THEN 1 ELSE 0 END) as today_calls,
        COALESCE(SUM(CASE WHEN timestamp >= ? THEN total_tokens ELSE 0 END), 0) as today_tokens,
        COALESCE(SUM(CASE WHEN timestamp >= ? THEN estimated_cost_usd ELSE 0 END), 0) as today_cost,
        SUM(CASE WHEN timestamp >= ? THEN 1 ELSE 0 END) as week_calls,
        COALESCE(SUM(CASE WHEN timestamp >= ? THEN total_tokens ELSE 0 END), 0) as week_tokens,
        COALESCE(SUM(CASE WHEN timestamp >= ? THEN estimated_cost_usd ELSE 0 END), 0) as week_cost,
        COUNT(*) as month_calls,
        COALESCE(SUM(total_tokens), 0) as month_tokens,
        COALESCE(SUM(estimated_cost_usd), 0) as month_cost,
        SUM(CASE WHEN success = 0 AND timestamp >= ? THEN 1 ELSE 0 END) as failed_week
      FROM ai_usage WHERE timestamp >= ?`,
      [fmtTs(dayStart), fmtTs(dayStart), fmtTs(dayStart), fmtTs(weekStart), fmtTs(weekStart), fmtTs(weekStart), fmtTs(weekStart), fmtTs(monthStart)]).catch(probeFail(null)),
    queryAll(`SELECT model, COUNT(*) as calls, COALESCE(SUM(total_tokens),0) as tokens, COALESCE(SUM(estimated_cost_usd),0) as cost
      FROM ai_usage WHERE timestamp >= ? GROUP BY model ORDER BY cost DESC`, [fmtTs(monthStart)]).catch(probeFail([])),
    queryAll(`SELECT provider, COUNT(*) as calls, COALESCE(SUM(total_tokens),0) as tokens, COALESCE(SUM(estimated_cost_usd),0) as cost
      FROM ai_usage WHERE timestamp >= ? GROUP BY provider ORDER BY cost DESC`, [fmtTs(monthStart)]).catch(probeFail([])),
    queryAll(`SELECT COALESCE(caller,'unknown') as caller, COUNT(*) as calls, COALESCE(SUM(total_tokens),0) as tokens, COALESCE(SUM(estimated_cost_usd),0) as cost
      FROM ai_usage WHERE timestamp >= ? GROUP BY caller ORDER BY cost DESC`, [fmtTs(monthStart)]).catch(probeFail([])),
    queryAll(`SELECT COALESCE(caller,'unknown') as caller, COUNT(*) as calls, COALESCE(SUM(total_tokens),0) as tokens, COALESCE(SUM(estimated_cost_usd),0) as cost
      FROM ai_usage WHERE timestamp >= ? GROUP BY caller ORDER BY cost DESC`, [fmtTs(dayStart)]).catch(probeFail([])),
    queryAll(`SELECT DISTINCT model FROM ai_usage ORDER BY model`).catch(probeFail([])),
    queryAll(`SELECT DISTINCT caller FROM ai_usage WHERE caller IS NOT NULL ORDER BY caller`).catch(probeFail([])),
  ]);
  const aiUsage = {
    generated_at: new Date().toISOString(),
    combined: aiCombined,
    byModel: aiByModel, byProvider: aiByProvider, byCaller: aiByCaller, byCallerToday: aiByCallerToday,
    filters: { models: aiModels.map((r) => r.model), callers: aiCallers.map((r) => r.caller) },
  };

  // Entity-review model (data/entity-review-model.json, separate file — it's MBs):
  // the full build loads every entity_mention (~32s) so it must never run in the API.
  // 30-min refresh gate, same pattern as `library`.
  const ER_MODEL_PATH = join(ROOT, 'data', 'entity-review-model.json');
  const ER_TTL_MS = 30 * 60 * 1000;
  let erGeneratedAt = null;
  try { erGeneratedAt = JSON.parse(readFileSync(ER_MODEL_PATH, 'utf8'))?.generated_at ?? null; } catch { /* absent */ }
  const erAge = erGeneratedAt ? Date.now() - Date.parse(erGeneratedAt) : Infinity;
  if (erAge > ER_TTL_MS) {
    try {
      const { buildModel } = await import('../api/routes/entity-review.js');
      const ents = await buildModel();
      const wroteAt = new Date().toISOString();
      writeFileSync(ER_MODEL_PATH, JSON.stringify({
        generated_at: wroteAt,
        entities: ents.map((e) => ({ ...e, books: [...e.books] })),   // Set → array for JSON
      }));
      erGeneratedAt = wroteAt;   // only after a successful write — status must not report a model that isn't on disk
    } catch (err) {
      console.error('entity-review model build failed:', err.message);
    }
  }

  // ── Site activity (search_log) ──────────────────────────────────────────────
  // search_log is small (tens of thousands of rows, created_at-indexed), so a
  // 14-day windowed aggregate is cheap. search_type: 'api'/'api_quick'/'keyword'
  // are library searches; 'api_chat' is a Jafar chat turn. Powers the dashboard
  // "searches"/"chat" cards and the Analytics daily series.
  let activity = null;
  try {
    const day1 = fmtTs(new Date(Date.now() - 24 * 3600 * 1000));
    const day7 = fmtTs(weekStart);
    const totals = await queryOne(`
      SELECT
        SUM(CASE WHEN search_type != 'api_chat' AND created_at >= ? THEN 1 ELSE 0 END) AS searches_d1,
        SUM(CASE WHEN search_type != 'api_chat' AND created_at >= ? THEN 1 ELSE 0 END) AS searches_d7,
        SUM(CASE WHEN search_type = 'api_chat' AND created_at >= ? THEN 1 ELSE 0 END) AS chat_d1,
        SUM(CASE WHEN search_type = 'api_chat' AND created_at >= ? THEN 1 ELSE 0 END) AS chat_d7,
        AVG(CASE WHEN search_type != 'api_chat' AND created_at >= ? THEN duration_ms ELSE NULL END) AS avg_ms_d7,
        SUM(CASE WHEN result_count = 0 AND search_type != 'api_chat' AND created_at >= ? THEN 1 ELSE 0 END) AS zero_result_d7
      FROM search_log`, [day1, day7, day1, day7, day7, day7]).catch(probeFail(null));
    // 14-day daily series (searches vs chat) for the Analytics page sparkline/chart.
    const series = await queryAll(`
      SELECT substr(created_at, 1, 10) AS day,
             SUM(CASE WHEN search_type = 'api_chat' THEN 0 ELSE 1 END) AS searches,
             SUM(CASE WHEN search_type = 'api_chat' THEN 1 ELSE 0 END) AS chat
      FROM search_log
      WHERE created_at >= ?
      GROUP BY day ORDER BY day ASC`, [fmtTs(new Date(Date.now() - 14 * 24 * 3600 * 1000))]).catch(probeFail([]));
    // Top queries (7d) — what people actually ask. Chat prompts excluded (they're prose, not queries).
    const topQueries = await queryAll(`
      SELECT query, COUNT(*) AS n, AVG(result_count) AS avg_results
      FROM search_log
      WHERE created_at >= ? AND search_type != 'api_chat' AND length(trim(query)) > 0
      GROUP BY lower(trim(query)) ORDER BY n DESC LIMIT 25`, [day7]).catch(probeFail([]));
    // Chat users: search_log carries no identifier for chat turns, so distinct
    // chat *users* come from the companion exposure log (one row per served turn,
    // keyed by participant_id) — the forward-correct signal. Saved conversations
    // (published_conversations) are a concrete engagement count.
    const chatUsers = await queryOne(`
      SELECT COUNT(DISTINCT participant_id) AS d7,
             COUNT(DISTINCT CASE WHEN created_at >= ? THEN participant_id END) AS d1
      FROM companion_exposure WHERE created_at >= ?`, [day1, day7]).catch(probeFail(null));
    const chatUsersAll = (await queryOne(`SELECT COUNT(DISTINCT participant_id) AS n FROM companion_exposure`).catch(probeFail(null)))?.n ?? null;
    const savedConversations = (await queryOne(`SELECT COUNT(*) AS n FROM published_conversations`).catch(probeFail(null)))?.n ?? null;
    if (totals) {
      totals.chat_users_d7 = chatUsers?.d7 ?? null;
      totals.chat_users_d1 = chatUsers?.d1 ?? null;
      totals.chat_users_all = chatUsersAll;
      totals.saved_conversations = savedConversations;
    }
    activity = { generated_at: new Date().toISOString(), totals, series, topQueries };
  } catch (err) {
    activity = { error: err.message };
  }

  // ── Corpus summary (documents + traditions) ──────────────────────────────────
  // Sponsor-facing: library size and breadth. Uses the denormalized
  // docs.paragraph_count (no content join) — a cheap docs-table GROUP BY.
  let corpus = null;
  try {
    const tot = await queryOne(`SELECT COUNT(*) AS docs, COALESCE(SUM(paragraph_count),0) AS paras
      FROM docs WHERE deleted_at IS NULL AND duplicate_of IS NULL`).catch(probeFail(null));
    const byReligion = await queryAll(`SELECT COALESCE(NULLIF(religion,''),'General') AS religion,
        COUNT(*) AS docs, COALESCE(SUM(paragraph_count),0) AS paras
      FROM docs WHERE deleted_at IS NULL AND duplicate_of IS NULL
      GROUP BY COALESCE(NULLIF(religion,''),'General') ORDER BY docs DESC LIMIT 14`).catch(probeFail([]));
    corpus = {
      generated_at: new Date().toISOString(),
      docs: tot?.docs ?? null,
      paras: tot?.paras ?? null,
      traditions: byReligion.filter((r) => r.religion !== 'General').length,
      byReligion,
    };
  } catch (err) {
    corpus = { error: err.message };
  }

  // ── Current activity (what's running right now) ──────────────────────────────
  // The live signal is ai_usage in the last 15 min grouped by service_type — the
  // stage actively burning tokens (HyPE, claim extraction, reconcile/merge,
  // embedding, chat). Cheap: timestamp-indexed narrow window.
  let currentActivity = null;
  try {
    const since15 = fmtTs(new Date(Date.now() - 15 * 60 * 1000));
    const recent = await queryAll(`
      SELECT service_type, COUNT(*) AS calls, MAX(timestamp) AS last_at,
             COALESCE(SUM(estimated_cost_usd),0) AS cost
      FROM ai_usage WHERE timestamp >= ? GROUP BY service_type ORDER BY calls DESC`, [since15]).catch(probeFail([]));
    const LABELS = {
      'grounding:disambiguate': 'Disambiguation',
      'grounding:hype': 'HyPE question generation',
      'grounding:claims': 'Entity claim extraction',
      'grounding:mentions': 'Entity mention extraction',
      'grounding:reconcile': 'Concept reconciliation',
      'grounding:merge': 'Entity reconciliation',
      'grounding:project': 'Entity projection',
      'grounding:link': 'Concept linking',
      embedding: 'Embedding generation',
    };
    const activities = recent.map((r) => ({
      service: r.service_type,
      label: LABELS[r.service_type] || (r.service_type?.startsWith('grounding:')
        ? 'Grounding · ' + r.service_type.replace('grounding:', '') : (r.service_type || 'AI')),
      calls: r.calls, cost: r.cost, last_at: r.last_at,
      kind: r.service_type?.startsWith('grounding:') ? 'enrichment'
        : (r.service_type === 'embedding' ? 'indexing' : 'serving'),
    }));
    currentActivity = {
      generated_at: new Date().toISOString(),
      window_min: 15,
      activities,
      idle: activities.length === 0,
      meili_processing: meili.processing ?? null,
      meili_enqueued: meili.enqueued ?? null,
      watcher: workers['library-watcher']?.status ?? null,
    };
  } catch (err) {
    currentActivity = { error: err.message };
  }

  // ── Cloudflare traffic (visits / sources) ───────────────────────────────────
  // Free-plan zone analytics via the GraphQL API (httpRequests1dGroups). Needs a
  // token with Analytics:Read on the zone; if the token is deploy-only the query
  // errors and we store {error} — the dashboard then shows visits as unavailable.
  // 20-min TTL gate (external call); carried forward otherwise.
  const CF_TTL_MS = 20 * 60 * 1000;
  let cloudflare = prevSnapshot.cloudflare ?? null;
  const cfAge = cloudflare?.generated_at ? Date.now() - Date.parse(cloudflare.generated_at) : Infinity;
  if (cfAge > CF_TTL_MS && process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ZONE_ID) {
    try {
      const iso = (d) => d.toISOString().slice(0, 10);
      const since = iso(new Date(Date.now() - 13 * 24 * 3600 * 1000)); // 14 daily buckets
      const until = iso(new Date(Date.now() + 24 * 3600 * 1000));      // include today
      const gql = `query {
        viewer { zones(filter: { zoneTag: "${process.env.CLOUDFLARE_ZONE_ID}" }) {
          httpRequests1dGroups(limit: 14, orderBy: [date_ASC], filter: { date_geq: "${since}", date_lt: "${until}" }) {
            dimensions { date }
            sum { requests pageViews bytes threats
                  countryMap { clientCountryName requests }
                  contentTypeMap { edgeResponseContentTypeName requests } }
            uniq { uniques }
          } } } }`;
      const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gql }),
        signal: AbortSignal.timeout(12000),
      });
      const json = await res.json();
      if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
      const groups = json.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
      const daily = groups.map((g) => ({
        date: g.dimensions.date,
        requests: g.sum.requests ?? 0,
        pageViews: g.sum.pageViews ?? 0,
        uniques: g.uniq?.uniques ?? 0,
        bytes: g.sum.bytes ?? 0,
        threats: g.sum.threats ?? 0,
      }));
      // Aggregate top countries across the window.
      const countryTotals = {};
      for (const g of groups) for (const c of g.sum.countryMap ?? []) {
        countryTotals[c.clientCountryName] = (countryTotals[c.clientCountryName] ?? 0) + (c.requests ?? 0);
      }
      const topCountries = Object.entries(countryTotals).map(([country, requests]) => ({ country, requests }))
        .sort((a, b) => b.requests - a.requests).slice(0, 12);
      cloudflare = { generated_at: new Date().toISOString(), daily, topCountries };
    } catch (err) {
      cloudflare = { generated_at: new Date().toISOString(), error: err.message };
    }
  }

  // Answer-cache health: size, per-version composition (stale phase-out visible
  // as the old version's count shrinking), and 24h serve mix with latencies.
  let answerCache = null;
  try {
    const { cacheStats } = await import('../api/lib/answer-cache.js');
    answerCache = await cacheStats();
  } catch (err) { answerCache = { error: err.message }; }

  // ── Missing-books triage ───────────────────────────────────────────────────
  // Books the library LISTS but does not HOLD, split the only way that matters for the work
  // queue: do we have a fetchable source file (→ convert to MD + ingest, so that list drains)
  // or not (→ needs sourcing). Two underlying shapes feed both sides: STUBS (docs whose
  // "content" is a scraped bahai-library.com metadata page — logo/TAGS chrome, <36 paras) and
  // HUSKS (live doc rows with ZERO live content). The stub scan LIKEs across low-¶ docs'
  // content (~6s) → snapshot-only, 6h gate (the list changes only on ingest activity).
  //
  // Catalogue rows are NOT missing books and are excluded outright: bahai-library.com/inventory/*
  // is the Phelps Partial Inventory (one row per tablet code, AB/BB/BH — we already hold these)
  // and /bibliography/* is its bibliography index; both carry opaque codes as titles and would
  // otherwise crowd out real books (they were ~500 of the first 500 listed).
  const MISSING_TTL_MS = 6 * 60 * 60 * 1000;
  const NOT_CATALOGUE = `
        AND d.title NOT LIKE '%Partial Inventory%'
        AND COALESCE(d.source_url,'') NOT LIKE '%bahai-library.com/inventory/%'
        AND COALESCE(d.source_url,'') NOT LIKE '%bahai-library.com/bibliography/%'
        AND COALESCE(d.author,'') NOT LIKE 'inventory-%'
        AND COALESCE(d.author,'') NOT LIKE 'bibliography-%'`;
  // A source_url naming a document file is a source we can convert and ingest; a bare
  // bahai-library.com/<slug> metadata page is not.
  const SRC_EXTS = ['pdf', 'doc', 'docx', 'html', 'htm', 'txt', 'rtf', 'epub', 'md'];
  const SRC_FILE_RE = new RegExp(`\\.(?:${SRC_EXTS.join('|')})$`, 'i');
  const SHOW_CAP = 600;
  const MISSING_SHAPE = 4;   // bump to force ONE recompute when this section's shape/rules change
  let missingBooks = prevSnapshot.missingBooks ?? null;
  const mbAge = missingBooks?.generated_at ? Date.now() - Date.parse(missingBooks.generated_at) : Infinity;
  if (mbAge > MISSING_TTL_MS || missingBooks?.shape !== MISSING_SHAPE) {
    const stubs = await queryAll(`
      SELECT d.id, d.title, d.author, d.paragraph_count AS paras, d.religion, d.collection, d.source_url,
             SUM(CASE WHEN c.text LIKE '%logo_1850x358%' THEN 1 ELSE 0 END) AS logo,
             SUM(CASE WHEN c.text LIKE '%TAGS:%' THEN 1 ELSE 0 END) AS tags,
             SUM(CASE WHEN c.text LIKE '%bahai-library.com/docs/%' OR c.text LIKE '%.docx%' OR c.text LIKE '%.pdf%' THEN 1 ELSE 0 END) AS doclinks
      FROM docs d JOIN content c ON c.doc_id = d.id AND c.deleted_at IS NULL
      WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL AND d.language = 'en'
        AND d.paragraph_count BETWEEN 1 AND 35${NOT_CATALOGUE}
      GROUP BY d.id
      HAVING logo > 0 OR tags > 0
      ORDER BY d.title`).catch(probeFail([]));

    const HUSK = `FROM docs d WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL
        AND NOT EXISTS (SELECT 1 FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL)${NOT_CATALOGUE}`;
    const listHusks = async () => await queryAll(
      `SELECT d.id, d.title, d.author, d.religion, d.collection, d.source_url ${HUSK}
       ORDER BY d.title`).catch(probeFail([]));

    // Same work, two rows: an archival stub/husk next to the doc that actually holds the text
    // ("1898, May Maxwell — An Early Pilgrimage" vs "An Early Pilgrimage" / May Maxwell). Those are
    // NOT missing, and they dominated the list — so match candidates against every doc that holds
    // its text (>35 ¶ = past the stub ceiling) and drop the ones we already have.
    const heldDocs = await queryAll(`SELECT d.id, d.title, d.author, d.paragraph_count AS paras FROM docs d
      WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL AND d.paragraph_count > 35`).catch(probeFail([]));
    const { heldMatch } = buildHeldIndex(heldDocs);
    const notHeld = (r) => !heldMatch(r.title, r.author);

    const stubsWithSrc = stubs.filter((s) => s.doclinks > 0).filter(notHeld);
    const stubsNoSrc = stubs.filter((s) => s.doclinks === 0).filter(notHeld);
    const heldOut = stubs.filter((r) => !notHeld(r));   // kept as a sample so the filter is auditable

    // Direct source-file link per fetchable stub (the .pdf/.docx of the REAL book) — extracted
    // from the stub's own content so the admin list links straight to the ingestable file.
    const shownStubs = stubsWithSrc.slice(0, SHOW_CAP);
    for (const s of shownStubs) {
      const row = await queryOne(`SELECT text FROM content WHERE doc_id=? AND deleted_at IS NULL
        AND (text LIKE '%bahai-library.com/docs/%' OR text LIKE '%.docx%' OR text LIKE '%.pdf%') LIMIT 1`, [s.id]).catch(probeFail(null));
      const t = String(row?.text || '');
      const m = t.match(/https?:\/\/[^\s()[\]"']+\.(?:pdf|docx?)\b/i) || t.match(/https?:\/\/bahai-library\.com\/docs\/[^\s()[\]"']+/i);
      if (m) s.file_url = m[0].replace(/[),.;]+$/, '');
    }

    // Titles/authors are raw scraped metadata (<u>Kh</u> digraphs, %20 escapes) — clean for display.
    const toRow = (r, kind) => ({
      id: r.id, kind,
      title: cleanTitle(r.title) || `#${r.id}`,
      author: cleanTitle(r.author),
      paras: r.paras ?? 0,
      religion: r.religion, collection: r.collection,
      source_url: r.source_url,
      file_url: r.file_url || (SRC_FILE_RE.test(r.source_url || '') ? r.source_url : null),
    });
    // Husks are scanned in full (title+author only) so the totals are real, not a capped guess.
    const allHusks = await listHusks();
    const husksMissing = allHusks.filter(notHeld);
    const huskWithFile = husksMissing.filter((h) => SRC_FILE_RE.test(h.source_url || ''));
    const huskNoFile = husksMissing.filter((h) => !SRC_FILE_RE.test(h.source_url || ''));

    const haveSource = [...shownStubs.map((s) => toRow(s, 'stub')),
                        ...huskWithFile.slice(0, Math.max(0, SHOW_CAP - shownStubs.length)).map((h) => toRow(h, 'husk'))];
    const noSource = [...stubsNoSrc.slice(0, SHOW_CAP).map((s) => toRow(s, 'stub')),
                      ...huskNoFile.slice(0, Math.max(0, SHOW_CAP - Math.min(stubsNoSrc.length, SHOW_CAP))).map((h) => toRow(h, 'husk'))];

    missingBooks = {
      generated_at: new Date().toISOString(),
      shape: MISSING_SHAPE,
      haveSourceTotal: stubsWithSrc.length + huskWithFile.length,
      noSourceTotal: stubsNoSrc.length + huskNoFile.length,
      haveSource, noSource,
      stubTotal: stubs.length,
      huskTotal: allHusks.length,
      alreadyHeld: heldOut.length + (allHusks.length - husksMissing.length),
      // A dropped row is a claim ("we already hold this"), so the sample names the doc it matched —
      // an over-eager match is then visible in the data instead of silently hiding a real book.
      alreadyHeldSample: [...heldOut, ...allHusks.filter((h) => !notHeld(h))]
        .slice(0, 60).map((r) => {
          const m = heldMatch(r.title, r.author);
          return { id: r.id, title: cleanTitle(r.title), author: cleanTitle(r.author),
            matched: m ? { id: m.id, title: cleanTitle(m.title), paras: m.paras } : null };
        }),
    };
  }

  const snapshot = {
    generated_at: new Date().toISOString(),
    computed_in_ms: Date.now() - t0,
    integrity,
    library,
    missingBooks,
    bottlenecks,
    aiUsage,
    activity,
    corpus,
    current_activity: currentActivity,
    cloudflare,
    answer_cache: answerCache,
    entity_review_model_at: erGeneratedAt,
    priority_books: books,
    summary: {
      books_total: books.length,
      books_fully_synced: books.filter(b => b.fully_synced).length,
      books_pending: books.filter(b => !b.fully_synced).map(b => ({ title: b.title, mentions: b.mentions, synced: b.synced })),
    },
    embeddings: {
      db_missing: embMissing?.n ?? null,            // paragraphs with no embedding in the DB (≈0 = generation done)
      meili_embedded: meili.embedded_docs ?? null,  // paragraphs with vectors in Meili
      meili_docs: meili.paragraphs_docs ?? null,    // paragraphs in Meili (any)
    },
    entity_pipeline: {
      extraction_remaining: remaining?.n ?? null,   // content graph_enriched=0 (left to extract)
      mentions_unsynced: emUnsynced?.n ?? null,      // entity_mentions em_synced=0 (left to push to sidecar)
      sidecar_idx_docs: entityIdxDocs,               // docs in entity_mentions_idx
    },
    content_sync_backlog: backlog?.n ?? null,        // content synced=0 (left to push to paragraphs index)
    meili,
    workers,
    // What the cron-app registration check DECIDED this tick. Without this, "is the snapshot restarting the
    // converter every 5 minutes?" is unanswerable from off-box — and that question has a real answer that
    // changes whether ingestion can ever finish a batch.
    pm2_apps: pm2Apps,
    // How many probes FAILED building this snapshot, and why. Zero is the normal case and cheap to assert;
    // non-zero means some number in this file is a fallback rather than a measurement, and every consumer
    // should treat it that way instead of reading a zero as good news.
    probe_errors: probeErrors,
    probe_error_count: probeErrors.length,
  };

  const dataDir = join(ROOT, 'data');
  try { mkdirSync(dataDir, { recursive: true }); } catch { /* exists */ }
  writeFileSync(join(dataDir, 'pipeline-status.json'), JSON.stringify(snapshot, null, 2));
  console.log(`pipeline snapshot written in ${snapshot.computed_in_ms}ms (${books.length} books)`);
  if (probeErrors.length) {
    console.log(`  ${probeErrors.length} PROBE(S) FAILED — those figures are fallbacks, not measurements:`);
    for (const e of probeErrors.slice(0, 10)) console.log(`    ${e.error}`);
  }
}

main().then(() => process.exit(0)).catch(err => { console.error('Fatal:', err); process.exit(1); });
