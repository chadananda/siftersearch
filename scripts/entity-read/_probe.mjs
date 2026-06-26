import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
// passages naming Mírzá Hádí (esp. son of ‘Abdu'l-Vahháb) + the Badasht apostasy context
const rows = await queryAll(`SELECT doc_id, external_para_id pid, paragraph_index pix, substr(text,1,500) t FROM content
  WHERE doc_id IN (21308,21310) AND (text LIKE '%Mírzá Hádí%' OR text LIKE '%Mirza Hadi%') ORDER BY doc_id, paragraph_index LIMIT 14`);
for (const r of rows) console.log(`\n[${r.doc_id} ${r.pid} ¶${r.pix}] ${r.t.replace(/\s+/g, ' ')}`);
console.log(`\n${rows.length} passages naming Mírzá Hádí`);
process.exit(0);
