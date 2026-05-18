// One-off: sync HyPE questions for OL Quran sura docs (doc_id 21089-21210)
// These are newly synced OL suras that have hyp_questions generated but not
// yet pushed to the hype_questions Meilisearch index (enhanced_synced=0).
// Normal HyPE sync queue has 257K items ahead of them; this bypasses the queue.

import Database from 'better-sqlite3';
import { MeiliSearch } from 'meilisearch';
import { createEmbeddings } from '../../api/lib/ai.js';

const DB_PATH = process.env.DB_PATH || '/home/chad/sifter/siftersearch/data/sifter.db';
const MEILI_HOST = process.env.MEILI_HOST || 'http://localhost:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || '797f54ee48797f54ee48797f54ee48';
const HYPE_INDEX = 'hype_questions';
const BATCH_SIZE = 50; // smaller batches to avoid embedding API timeouts
// OL Quran Pickthall individual sura docs (21089-21210) + OL Rodwell suras (21343-21407 approx)
const DOC_ID_RANGES = [[21089, 21210]];

const db = new Database(DB_PATH, { readonly: false });
const meili = new MeiliSearch({ host: MEILI_HOST, apiKey: MEILI_KEY });

function parseQuestions(raw) {
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try { return JSON.parse(raw).map(String).filter(Boolean); } catch {}
  }
  return raw.split('\n').map(s => s.trim()).filter(Boolean);
}

let totalProcessed = 0, totalIndexed = 0;

for (const [minId, maxId] of DOC_ID_RANGES) {
  console.log(`Processing doc_id range ${minId}-${maxId}...`);

  const rows = db.prepare(`
    SELECT c.id AS paragraph_id, c.doc_id, c.hyp_questions, c.hyp_thesis,
           d.religion, d.collection, d.encumbered, d.title, d.author
    FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE c.enhanced_synced = 0
      AND (c.hyp_questions IS NOT NULL OR c.hyp_thesis IS NOT NULL)
      AND c.deleted_at IS NULL
      AND c.is_duplicate = 0
      AND c.doc_id BETWEEN ? AND ?
    ORDER BY c.id
  `).all(minId, maxId);

  console.log(`  Found ${rows.length} paragraphs to sync`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const records = [];
    const questionTexts = [];
    const paragraphIds = [];

    for (const row of batch) {
      const questions = parseQuestions(row.hyp_questions);
      const thesis = (row.hyp_thesis || '').trim();
      if (questions.length === 0 && !thesis) continue;
      paragraphIds.push(row.paragraph_id);

      if (thesis) {
        records.push({
          id: `${row.paragraph_id}_t`, paragraph_id: row.paragraph_id, doc_id: row.doc_id,
          religion: row.religion || null, collection: row.collection || null,
          authority: 0, encumbered: row.encumbered ? 1 : 0, question_text: thesis, is_thesis: 1
        });
        questionTexts.push(thesis);
      }
      questions.forEach((q, qi) => {
        records.push({
          id: `${row.paragraph_id}_${qi}`, paragraph_id: row.paragraph_id, doc_id: row.doc_id,
          religion: row.religion || null, collection: row.collection || null,
          authority: 0, encumbered: row.encumbered ? 1 : 0, question_text: q, is_thesis: 0
        });
        questionTexts.push(q);
      });
    }

    if (records.length === 0) continue;

    // Generate embeddings
    let embeddings;
    try {
      const result = await createEmbeddings(questionTexts, { caller: 'hype-sync-ol-sura' });
      embeddings = result.embeddings;
    } catch (err) {
      console.error(`  Embedding failed for batch ${i}: ${err.message}`);
      continue;
    }

    if (!Array.isArray(embeddings) || embeddings.length !== records.length) {
      console.error(`  Embedding count mismatch: got ${embeddings?.length}, expected ${records.length}`);
      continue;
    }

    const meiliDocs = records.map((r, j) => ({ ...r, _vectors: { default: embeddings[j] } }));

    // Delete old entries for these paragraphs, add new
    try {
      await meili.index(HYPE_INDEX).deleteDocuments({ filter: `paragraph_id IN [${paragraphIds.join(',')}]` });
    } catch {}
    await meili.index(HYPE_INDEX).addDocuments(meiliDocs, { primaryKey: 'id' });

    // Mark synced
    const ph = paragraphIds.map(() => '?').join(',');
    db.prepare(`UPDATE content SET enhanced_synced = 1 WHERE id IN (${ph})`).run(...paragraphIds);

    totalProcessed += batch.length;
    totalIndexed += meiliDocs.length;
    process.stdout.write(`\r  Batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(rows.length/BATCH_SIZE)}: ${totalProcessed} paragraphs, ${totalIndexed} questions indexed`);
  }
  console.log('');
}

db.close();
console.log(`\nDone! Processed ${totalProcessed} paragraphs, indexed ${totalIndexed} HyPE questions`);
