// Computes the entity-pipeline + Meili health snapshot and writes
// data/pipeline-status.json. Runs as its OWN short-lived process (PM2
// cron_restart every 5 min) so the heavy synchronous better-sqlite3 queries
// (entity_mentions join, full-table counts) never block the live API or the
// single-writer worker. The API's GET /api/admin/server/pipeline just reads
// the JSON file this writes. Deps: db.js (read-only here), config, Meili REST.
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';
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

  const snapshot = {
    generated_at: new Date().toISOString(),
    computed_in_ms: Date.now() - t0,
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
