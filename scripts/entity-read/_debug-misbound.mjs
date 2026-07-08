// throwaway debug: read the actual source paragraph behind a mis-filed fact to confirm the subject is a different person.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
for (const pid of ['para_369']) {
  const rows = await queryAll(`SELECT external_para_id pid, text FROM content WHERE doc_id=21308 AND external_para_id=? AND deleted_at IS NULL`, [pid]);
  for (const r of rows) console.log(`\n=== ${r.pid} ===\n${String(r.text).replace(/\s+/g, ' ').trim().slice(0, 700)}`);
  if (!rows.length) console.log(`(${pid} not found by external_para_id — trying LIKE)`);
}
// also surface any paragraph naming Muṣṭafá the dervish converted by Bahá'u'lláh
const alt = await queryAll(`SELECT external_para_id pid, substr(text,1,240) t FROM content WHERE doc_id=21308 AND deleted_at IS NULL AND text LIKE '%Muṣṭafá%' LIMIT 6`);
console.log('\n=== paragraphs mentioning Muṣṭafá ===');
for (const r of alt) console.log(`  ${r.pid}: ${String(r.t).replace(/\s+/g, ' ')}`);
process.exit(0);
