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

  const rows = await queryAll(
    `SELECT d.title, d.doc_priority AS priority, COUNT(em.id) AS mentions,
            SUM(CASE WHEN em.em_synced=1 THEN 1 ELSE 0 END) AS synced
     FROM entity_mentions em
     JOIN content c ON c.id = CAST(em.content_id AS INTEGER)
     JOIN docs d ON d.id = c.doc_id
     WHERE d.doc_priority >= 600
     GROUP BY d.id ORDER BY d.doc_priority DESC, synced DESC LIMIT 40`
  ).catch(() => []);
  const books = rows.map(b => ({
    title: b.title, priority: b.priority, mentions: b.mentions, synced: b.synced,
    fully_synced: b.mentions > 0 && b.synced === b.mentions,
  }));

  const [backlog, enriched] = await Promise.all([
    queryOne(`SELECT COUNT(*) AS n FROM content WHERE synced=0 AND deleted_at IS NULL`).catch(() => ({ n: null })),
    queryOne(`SELECT COUNT(*) AS n FROM content WHERE graph_enriched=1 AND deleted_at IS NULL`).catch(() => ({ n: null })),
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

  const snapshot = {
    generated_at: new Date().toISOString(),
    computed_in_ms: Date.now() - t0,
    priority_books: books,
    summary: {
      books_total: books.length,
      books_fully_synced: books.filter(b => b.fully_synced).length,
      books_pending: books.filter(b => !b.fully_synced).map(b => ({ title: b.title, mentions: b.mentions, synced: b.synced })),
      sync_backlog: backlog?.n ?? null,
      graph_enriched_done: enriched?.n ?? null,
    },
    meili,
  };

  const dataDir = join(ROOT, 'data');
  try { mkdirSync(dataDir, { recursive: true }); } catch { /* exists */ }
  writeFileSync(join(dataDir, 'pipeline-status.json'), JSON.stringify(snapshot, null, 2));
  console.log(`pipeline snapshot written in ${snapshot.computed_in_ms}ms (${books.length} books)`);
}

main().then(() => process.exit(0)).catch(err => { console.error('Fatal:', err); process.exit(1); });
