// corpus research: find the Dawn-Breakers / GPB passage(s) that enumerate the Letters of the Living who perished
// at Fort Shaykh Ṭabarsí, to ground a death-place enrichment for the thin Letters (Jalíl, Aḥmad-i-Ibdál).
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const rows = await queryAll(`SELECT doc_id, external_para_id pid, paragraph_index pix, heading, substr(text,1,520) t FROM content
  WHERE doc_id IN (21308,21310) AND (
     (text LIKE '%Urúmí%') OR (text LIKE '%Ibdál%') OR
     (heading LIKE '%martyr%' AND text LIKE '%Ṭabarsí%') )
  ORDER BY doc_id, paragraph_index LIMIT 12`);
for (const r of rows) console.log(`\n[${r.doc_id} ${r.pid} ¶${r.pix}] (${r.heading||''})\n  ${r.t.replace(/\s+/g,' ')}`);
process.exit(0);
