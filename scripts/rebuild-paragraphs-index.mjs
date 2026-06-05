// Side-rebuild of the Meilisearch `paragraphs` index, then atomic swap.
//
// Why: ~2M paragraphs have embeddings in content.embedding (the DB is the
// source of truth) but Meili only holds ~1.26M vectors — they're stuck behind
// a poisoned task queue (27K one-doc deletions, ~12 min each on ZFS). Rather
// than nuke the live index (blocks search) or wait months for the queue to
// drain, we build a fresh index ON THE SIDE with all embeddings via large
// bulk additions (no deletions = no ZFS amplification), then swap it in
// atomically. The live index keeps serving search the whole time.
//
// Staged (run each explicitly):
//   --cancel-deletions  cancel enqueued documentDeletion tasks (moot for fresh index) to unclog Meili
//   --create            create REBUILD index + replicate paragraphs settings
//   --load [--from ID] [--limit N] [--batch N]   bulk-load from DB (keyset paginated)
//   --status            show rebuild vs live doc/embedding counts
//   --swap              atomically swap REBUILD <-> paragraphs (verify first!)
//
// Reads only from sifter.db; writes only to Meili. Safe to re-run --load (upserts by id).
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const { queryAll } = await import('../api/lib/db.js');
const { config } = await import('../api/lib/config.js');
const { getAuthority } = await import('../api/lib/authority.js');
const { content } = await import('../api/lib/content.js');

const LIVE = 'paragraphs';
const REBUILD = 'paragraphs_rebuild';
const HOST = config.search.host || 'http://localhost:7700';
const KEY = config.search.apiKey;
const DIMS = content.EXPECTED_EMBEDDING_DIMS || 512;
const H = { 'Content-Type': 'application/json', ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}) };

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const val = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

async function mfetch(path, opts = {}) {
  const r = await fetch(`${HOST}${path}`, { headers: H, ...opts });
  const text = await r.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!r.ok) throw new Error(`${opts.method || 'GET'} ${path} -> ${r.status}: ${text.slice(0, 200)}`);
  return json;
}
async function waitTask(uid) {
  for (;;) {
    const t = await mfetch(`/tasks/${uid}`);
    if (t.status === 'succeeded') return t;
    if (t.status === 'failed' || t.status === 'canceled') throw new Error(`task ${uid} ${t.status}: ${t.error?.message || ''}`);
    await new Promise(r => setTimeout(r, 2000));
  }
}
function blobToFloatArray(blob) {
  if (!blob) return null;
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const arr = Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4));
  if (arr.length !== DIMS || arr.some(v => !Number.isFinite(v))) return null;
  return arr;
}

async function cancelDeletions() {
  // Cancel enqueued+processing documentDeletion tasks: the fresh index won't
  // contain the duplicates they target, so they're moot. Unclogs the queue.
  const res = await mfetch(`/tasks/cancel?types=documentDeletion&statuses=enqueued,processing`, { method: 'POST' });
  console.log('cancel task submitted:', res.taskUid ?? JSON.stringify(res).slice(0, 120));
  if (res.taskUid != null) { await waitTask(res.taskUid); console.log('deletions canceled.'); }
}

async function createIndex() {
  const c = await mfetch('/indexes', { method: 'POST', body: JSON.stringify({ uid: REBUILD, primaryKey: 'id' }) });
  if (c.taskUid != null) await waitTask(c.taskUid).catch(() => {});
  const settings = {
    searchableAttributes: ['text', 'text_grounded', 'context', 'heading', 'title', 'author'],
    filterableAttributes: ['doc_id', 'religion', 'collection', 'language', 'year', 'paragraph_index', 'blocktype', 'author', 'title', 'authority', 'encumbered', 'topic_tags', 'question_types', 'source_site', 'source_url'],
    sortableAttributes: ['year', 'created_at', 'paragraph_index', 'authority'],
    pagination: { maxTotalHits: 50000 },
    embedders: { default: { source: 'userProvided', dimensions: DIMS } },
  };
  const s = await mfetch(`/indexes/${REBUILD}/settings`, { method: 'PATCH', body: JSON.stringify(settings) });
  await waitTask(s.taskUid);
  console.log(`created ${REBUILD} with settings (dims=${DIMS}).`);
}

async function load() {
  const BATCH = parseInt(val('batch', '10000'), 10);
  const limit = flag('limit') ? parseInt(val('limit', '0'), 10) : Infinity;
  let fromId = parseInt(val('from', '0'), 10);
  let loaded = 0, withVec = 0, submitted = 0;
  const pending = [];
  for (;;) {
    if (loaded >= limit) break;
    const take = Math.min(BATCH, limit - loaded);
    // Rows that belong to the primary `paragraphs` index: source_site IS NULL
    // (primary corpus) or oceanlibrary.com (shares the primary index). Exclude
    // duplicates and deleted. Keyset pagination by id for constant memory.
    const rows = await queryAll(
      `SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.context, c.translation, c.translation_segments,
              c.heading, c.blocktype, c.embedding, c.source_site, c.source_url, c.external_para_id, c.pdf_page,
              c.encumbered AS c_enc, d.title, d.author, d.filename, d.religion, d.collection, d.language, d.year,
              d.encumbered AS d_enc
       FROM content c JOIN docs d ON d.id = c.doc_id
       WHERE c.id > ? AND c.deleted_at IS NULL AND (c.is_duplicate IS NULL OR c.is_duplicate = 0)
         AND (c.source_site IS NULL OR c.source_site = 'oceanlibrary.com')
         AND c.text IS NOT NULL AND c.text != ''
       ORDER BY c.id LIMIT ?`, [fromId, take]);
    if (rows.length === 0) break;
    fromId = rows[rows.length - 1].id;
    const docs = rows.map(p => {
      const emb = blobToFloatArray(p.embedding);
      if (emb) withVec++;
      return {
        id: p.id, doc_id: p.doc_id, paragraph_index: p.paragraph_index, text: p.text,
        context: p.context || null, translation: p.translation || null, translation_segments: p.translation_segments || null,
        title: p.title, author: p.author, filename: p.filename, religion: p.religion, collection: p.collection,
        language: p.language, year: p.year ? parseInt(p.year, 10) : null,
        authority: getAuthority(p), encumbered: (p.c_enc || p.d_enc) ? 1 : 0,
        heading: p.heading || '', blocktype: p.blocktype || 'paragraph',
        source_site: p.source_site || null, source_url: p.source_url || null,
        external_para_id: p.external_para_id || null,
        pdf_page: typeof p.pdf_page === 'number' ? p.pdf_page : null,
        created_at: new Date().toISOString(),
        ...(emb ? { _vectors: { default: emb } } : {}),
      };
    });
    const t = await mfetch(`/indexes/${REBUILD}/documents`, { method: 'PUT', body: JSON.stringify(docs) });
    pending.push(t.taskUid);
    loaded += rows.length;
    // Throttle: keep at most ~5 batches in flight so we don't pile up tasks.
    if (pending.length >= 5) { await waitTask(pending.shift()); }
    if (loaded % 50000 === 0 || rows.length < take) console.log(`loaded ${loaded} (vectors ${withVec}) lastId ${fromId}`);
  }
  for (const uid of pending) await waitTask(uid).catch(e => console.error('batch task failed:', e.message));
  console.log(`DONE load: ${loaded} docs submitted, ${withVec} with vectors.`);
}

async function status() {
  const [liveS, rebS] = await Promise.all([
    mfetch(`/indexes/${LIVE}/stats`).catch(() => ({})),
    mfetch(`/indexes/${REBUILD}/stats`).catch(() => ({ error: 'no rebuild index' })),
  ]);
  console.log('LIVE   ', LIVE, JSON.stringify({ docs: liveS.numberOfDocuments, emb: liveS.numberOfEmbeddings, indexing: liveS.isIndexing }));
  console.log('REBUILD', REBUILD, JSON.stringify({ docs: rebS.numberOfDocuments, emb: rebS.numberOfEmbeddings, indexing: rebS.isIndexing, error: rebS.error }));
}

async function swap() {
  const t = await mfetch('/swap-indexes', { method: 'POST', body: JSON.stringify([{ indexes: [LIVE, REBUILD] }]) });
  await waitTask(t.taskUid);
  console.log(`SWAPPED: '${LIVE}' now holds the rebuilt data; old data is under '${REBUILD}'. Verify search, then delete ${REBUILD}.`);
}

if (flag('cancel-deletions')) await cancelDeletions();
else if (flag('create')) await createIndex();
else if (flag('load')) await load();
else if (flag('status')) await status();
else if (flag('swap')) await swap();
else console.log('Specify one of: --cancel-deletions | --create | --load [--from ID --limit N --batch N] | --status | --swap');
process.exit(0);
