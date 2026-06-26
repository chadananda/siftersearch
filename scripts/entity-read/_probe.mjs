import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const rows = await queryAll(`SELECT external_para_id pid, paragraph_index pix, text FROM content
  WHERE doc_id=21310 AND external_para_id IN ('para_77','para_78','para_79') ORDER BY paragraph_index`);
for (const r of rows) console.log(`\n[${r.pid} / ¶${r.pix}] ${r.text.replace(/\s+/g, ' ')}`);
process.exit(0);
