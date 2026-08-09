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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const { queryAll, queryOne } = await import('../api/lib/db.js');
const { config } = await import('../api/lib/config.js');

async function meiliTaskTotal(status) {
  const r = await fetch(`${config.search.host}/tasks?statuses=${status}&limit=0`, {
    headers: { Authorization: `Bearer ${config.search.apiKey}` },
    signal: AbortSignal.timeout(8000),
  });
  return (await r.json()).total ?? null;
}

async function main() {
  const t0 = Date.now();

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
  ).catch(() => []);
  const books = rows.map(b => ({
    title: b.title, priority: b.priority, mentions: b.mentions, synced: b.synced,
    fully_synced: b.mentions > 0 && b.synced === b.mentions,
  }));

  // Both use partial/covering indexes (idx_content_unsynced_partial,
  // idx_content_graph_unsync on =0) — fast. Counting graph_enriched=1 instead
  // would full-scan 3.3M rows (~3 min), so we report what REMAINS to extract.
  const [backlog, remaining] = await Promise.all([
    queryOne(`SELECT COUNT(*) AS n FROM content WHERE synced=0 AND deleted_at IS NULL`).catch(() => ({ n: null })),
    queryOne(`SELECT COUNT(*) AS n FROM content WHERE graph_enriched=0 AND deleted_at IS NULL`).catch(() => ({ n: null })),
  ]);

  let meili = {};
  try {
    const [enqueued, processing, failed, pstats] = await Promise.all([
      meiliTaskTotal('enqueued'), meiliTaskTotal('processing'), meiliTaskTotal('failed'),
      fetch(`${config.search.host}/indexes/paragraphs/stats`, {
        headers: { Authorization: `Bearer ${config.search.apiKey}` }, signal: AbortSignal.timeout(8000),
      }).then(r => r.json()).catch(() => ({})),
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
  const embMissing = await queryOne(`SELECT COUNT(*) AS n FROM content WHERE embedding IS NULL AND deleted_at IS NULL`).catch(() => ({ n: null }));

  // Entity-mention sidecar: em_synced=0 uses idx_em_unsynced partial index (fast).
  // mentions_unsynced = backlog waiting to reach entity_mentions_idx.
  const emUnsynced = await queryOne(`SELECT COUNT(*) AS n FROM entity_mentions WHERE em_synced=0`).catch(() => ({ n: null }));
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
  const liveParas = (await queryOne(`SELECT COUNT(*) AS n FROM content WHERE deleted_at IS NULL`).catch(() => ({ n: null })))?.n ?? null;
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

  // Full-corpus aggregates (two complete passes over ~4.6M content rows): only
  // recompute when the carried-forward copy is older than 30 min.
  const LIBRARY_TTL_MS = 30 * 60 * 1000;
  let library = prevSnapshot.library ?? null;
  const libAge = library?.generated_at ? Date.now() - Date.parse(library.generated_at) : Infinity;
  if (libAge > LIBRARY_TTL_MS) {
    const [byLanguage, embeddingStats] = await Promise.all([
      queryAll(`
        SELECT d.language,
          COUNT(DISTINCT d.id) as doc_count,
          COUNT(c.id) as paragraph_count,
          SUM(CASE WHEN c.embedding IS NULL THEN 1 ELSE 0 END) as pending_embedding,
          SUM(CASE WHEN c.synced = 0 AND c.embedding IS NOT NULL THEN 1 ELSE 0 END) as pending_sync,
          SUM(CASE WHEN c.synced = 1 THEN 1 ELSE 0 END) as synced
        FROM docs d
        LEFT JOIN content c ON c.doc_id = d.id AND c.deleted_at IS NULL
        WHERE d.deleted_at IS NULL
        GROUP BY d.language
        ORDER BY paragraph_count DESC`).catch(() => []),
      queryOne(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) as with_embedding,
          SUM(CASE WHEN embedding IS NULL THEN 1 ELSE 0 END) as missing_embeddings,
          SUM(CASE WHEN synced = 0 THEN 1 ELSE 0 END) as dirty
        FROM content
        WHERE deleted_at IS NULL`).catch(() => null),
    ]);
    library = { generated_at: new Date().toISOString(), byLanguage, embeddingStats };
  }

  // Bottleneck lists ride the selective partial indexes (cheap in the steady
  // state where backlogs ≈ 0); recomputed every run for freshness.
  const [pendingEmbedding, pendingSync] = await Promise.all([
    queryAll(`
      SELECT d.id, d.title, d.author, d.language, d.file_path, COUNT(c.id) as pending_paragraphs
      FROM docs d
      JOIN content c ON c.doc_id = d.id AND c.deleted_at IS NULL AND c.embedding IS NULL
      WHERE d.deleted_at IS NULL
      GROUP BY d.id ORDER BY pending_paragraphs DESC LIMIT 50`).catch(() => []),
    queryAll(`
      SELECT d.id, d.title, d.author, d.language, COUNT(c.id) as unsynced_paragraphs
      FROM docs d
      JOIN content c ON c.doc_id = d.id AND c.deleted_at IS NULL AND c.synced = 0 AND c.embedding IS NOT NULL
      WHERE d.deleted_at IS NULL
      GROUP BY d.id ORDER BY unsynced_paragraphs DESC LIMIT 50`).catch(() => []),
  ]);
  const bottlenecks = { generated_at: new Date().toISOString(), pendingEmbedding, pendingSync };

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
      [fmtTs(dayStart), fmtTs(dayStart), fmtTs(dayStart), fmtTs(weekStart), fmtTs(weekStart), fmtTs(weekStart), fmtTs(weekStart), fmtTs(monthStart)]).catch(() => null),
    queryAll(`SELECT model, COUNT(*) as calls, COALESCE(SUM(total_tokens),0) as tokens, COALESCE(SUM(estimated_cost_usd),0) as cost
      FROM ai_usage WHERE timestamp >= ? GROUP BY model ORDER BY cost DESC`, [fmtTs(monthStart)]).catch(() => []),
    queryAll(`SELECT provider, COUNT(*) as calls, COALESCE(SUM(total_tokens),0) as tokens, COALESCE(SUM(estimated_cost_usd),0) as cost
      FROM ai_usage WHERE timestamp >= ? GROUP BY provider ORDER BY cost DESC`, [fmtTs(monthStart)]).catch(() => []),
    queryAll(`SELECT COALESCE(caller,'unknown') as caller, COUNT(*) as calls, COALESCE(SUM(total_tokens),0) as tokens, COALESCE(SUM(estimated_cost_usd),0) as cost
      FROM ai_usage WHERE timestamp >= ? GROUP BY caller ORDER BY cost DESC`, [fmtTs(monthStart)]).catch(() => []),
    queryAll(`SELECT COALESCE(caller,'unknown') as caller, COUNT(*) as calls, COALESCE(SUM(total_tokens),0) as tokens, COALESCE(SUM(estimated_cost_usd),0) as cost
      FROM ai_usage WHERE timestamp >= ? GROUP BY caller ORDER BY cost DESC`, [fmtTs(dayStart)]).catch(() => []),
    queryAll(`SELECT DISTINCT model FROM ai_usage ORDER BY model`).catch(() => []),
    queryAll(`SELECT DISTINCT caller FROM ai_usage WHERE caller IS NOT NULL ORDER BY caller`).catch(() => []),
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
      erGeneratedAt = new Date().toISOString();
      writeFileSync(ER_MODEL_PATH, JSON.stringify({
        generated_at: erGeneratedAt,
        entities: ents.map((e) => ({ ...e, books: [...e.books] })),   // Set → array for JSON
      }));
    } catch (err) {
      console.error('entity-review model build failed:', err.message);
    }
  }

  const snapshot = {
    generated_at: new Date().toISOString(),
    computed_in_ms: Date.now() - t0,
    integrity,
    library,
    bottlenecks,
    aiUsage,
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
  };

  const dataDir = join(ROOT, 'data');
  try { mkdirSync(dataDir, { recursive: true }); } catch { /* exists */ }
  writeFileSync(join(dataDir, 'pipeline-status.json'), JSON.stringify(snapshot, null, 2));
  console.log(`pipeline snapshot written in ${snapshot.computed_in_ms}ms (${books.length} books)`);
}

main().then(() => process.exit(0)).catch(err => { console.error('Fatal:', err); process.exit(1); });
