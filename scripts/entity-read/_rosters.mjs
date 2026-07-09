import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
// find roster / martyr-list / upheaval headings across DB + GPB
const h = await queryAll(`SELECT doc_id, heading, COUNT(*) n, MIN(paragraph_index) lo, MAX(paragraph_index) hi FROM content
  WHERE doc_id IN (21308,21310) AND heading IS NOT NULL AND (
    heading LIKE '%martyr%' OR heading LIKE '%List%' OR heading LIKE '%Upheaval%' OR heading LIKE '%Nayr%' OR heading LIKE '%Zanj%' OR heading LIKE '%Seven%' OR heading LIKE '%Tihrán%' OR heading LIKE '%roll%')
  GROUP BY doc_id, heading ORDER BY doc_id, lo`);
for (const r of h) console.log(`[${r.doc_id}] ¶${r.lo}-${r.hi} (${r.n}p) — ${r.heading}`);
