import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const rows = await queryAll(`SELECT c.external_para_id pid, c.text FROM content c
  WHERE c.doc_id=21308 AND c.text LIKE '%Mírzá Janí%' OR (c.doc_id=21308 AND c.text LIKE '%Mírzá Jání%') ORDER BY c.id`);
console.log('=== passages mentioning Ḥájí Mírzá Jání in Dawn-Breakers (21308) ===');
for (const r of rows) console.log(`\n[${r.pid}] ${r.text.replace(/\s+/g,' ').slice(0,600)}`);
console.log(`\n${rows.length} passages`);
process.exit(0);
