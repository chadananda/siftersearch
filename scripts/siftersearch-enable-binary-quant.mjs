// One-time: enable Meili binaryQuantized on the vector embedders (paragraphs + hype) for fast ANN.
// The API's startup verify-block is guarded against PATCHing while Meili has tasks processing (hype-sync keeps the
// queue busy), so it never applies on its own — hence this deliberate trigger. binaryQuantized is IRREVERSIBLE and
// enabling it re-quantizes existing vectors (a one-time background rebuild; search is degraded until it finishes).
// Run on tower-nas: node scripts/siftersearch-enable-binary-quant.mjs
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });
const HOST = process.env.MEILI_HOST || 'http://localhost:7700';
const KEY = process.env.MEILISEARCH_KEY || process.env.MEILI_MASTER_KEY;
const DIMS = parseInt(process.env.EMBEDDING_DIMENSIONS || '512', 10);
const H = { 'Content-Type': 'application/json', ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}) };
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

for (const index of ['paragraphs', 'hype_questions']) {
  const cur = await fetch(`${HOST}/indexes/${index}/settings/embedders`, { headers: H }).then(j).catch((e) => ({ error: e.message }));
  const bq = cur?.default?.binaryQuantized;
  console.log(`\n[${index}] current embedder:`, JSON.stringify(cur?.default || cur));
  if (bq === true) { console.log(`  already binaryQuantized — skipping`); continue; }
  const res = await fetch(`${HOST}/indexes/${index}/settings`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({ embedders: { default: { source: 'userProvided', dimensions: DIMS, binaryQuantized: true } } }),
  }).then(j);
  console.log(`  PATCH enqueued task:`, JSON.stringify(res));
  const taskUid = res.taskUid;
  if (taskUid != null) {
    // poll a few times to report how the re-quantization progresses
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const t = await fetch(`${HOST}/tasks/${taskUid}`, { headers: H }).then(j);
      console.log(`  [+${(i + 1) * 5}s] task ${taskUid}: status=${t.status} duration=${t.duration || '-'}`);
      if (t.status === 'succeeded' || t.status === 'failed') break;
    }
  }
}
console.log('\nDone issuing. Re-quantization continues in Meili background; monitor /search/meili-diag isIndexing.');
