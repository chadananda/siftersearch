// Purge HyPE entries for Bismillah paragraphs from hype_questions index.
// Problem: Every Quran sura opens with "In the Name of God, the Compassionate,
// the Merciful" — its HyPE question scores 0.9291 for "mercy compassion" queries,
// flooding all Islam HyPE result slots before Sura LV's actual mercy content (0.4394).
// Fix: delete these from hype_questions so Sura LV content rises to the top.
// SQLite enhanced_synced stays 1 to prevent re-sync.

import Database from 'better-sqlite3';
import { MeiliSearch } from 'meilisearch';

const DB_PATH = process.env.DB_PATH || '/home/chad/sifter/siftersearch/data/sifter.db';
const MEILI_HOST = process.env.MEILI_HOST || 'http://localhost:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || '797f54ee48797f54ee48797f54ee48';
const HYPE_INDEX = 'hype_questions';

const BISMILLAH_RE = /^In the Name of (?:God|Allah).{0,10}the Compassionate.{0,10}the Merciful[.!]?\s*$/i;

const db = new Database(DB_PATH, { readonly: true });
const meili = new MeiliSearch({ host: MEILI_HOST, apiKey: MEILI_KEY });

// Find all Bismillah paragraph_ids
const rows = db.prepare(`
  SELECT id FROM content
  WHERE deleted_at IS NULL AND is_duplicate = 0
    AND (text LIKE '%In the Name of God%' OR text LIKE '%In the Name of Allah%')
`).all();

const bismillahIds = rows.filter(r => {
  const id = r.id;
  // We need the text — let's re-query with text
  return true;
}).map(r => r.id);

// Re-query with text to filter properly
const rowsWithText = db.prepare(`
  SELECT id, text FROM content
  WHERE deleted_at IS NULL AND is_duplicate = 0
    AND (text LIKE '%In the Name of God%' OR text LIKE '%In the Name of Allah%')
`).all();

const ids = rowsWithText
  .filter(r => BISMILLAH_RE.test((r.text || '').trim()))
  .map(r => r.id);

db.close();
console.log(`Found ${ids.length} Bismillah paragraphs to purge from hype_questions`);

if (ids.length === 0) {
  console.log('Nothing to do.');
  process.exit(0);
}

// Delete in batches of 1000 (Meili filter size limit)
const BATCH = 1000;
let deleted = 0;
for (let i = 0; i < ids.length; i += BATCH) {
  const batch = ids.slice(i, i + BATCH);
  const filter = `paragraph_id IN [${batch.join(',')}]`;
  try {
    const task = await meili.index(HYPE_INDEX).deleteDocuments({ filter });
    console.log(`  Batch ${Math.floor(i/BATCH)+1}: queued delete for ${batch.length} paragraph_ids (taskUid=${task.taskUid})`);
    deleted += batch.length;
  } catch (err) {
    console.error(`  Batch ${Math.floor(i/BATCH)+1} failed: ${err.message}`);
  }
}

console.log(`\nDone. Queued deletion of HyPE entries for ${deleted} Bismillah paragraph_ids.`);
console.log('Meilisearch will process these asynchronously. enhanced_synced remains 1 in SQLite.');
