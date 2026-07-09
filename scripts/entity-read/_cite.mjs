import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
// GPB chapter markers + any field that could encode chapter.paragraph
console.log('=== GPB chapter-marker headings ===');
for (const r of await queryAll(`SELECT paragraph_index pix, external_para_id pid, heading FROM content WHERE doc_id=21310 AND heading LIKE '%Chapter%' ORDER BY paragraph_index LIMIT 8`)) console.log(`¶${r.pix} ${r.pid} — ${r.heading}`);
console.log('\n=== all columns + a sample with every field (look for chapter/section/number fields) ===');
const cols = (await queryAll(`PRAGMA table_info(content)`)).map(c=>c.name);
console.log('cols:', cols.join(', '));
const s = (await queryAll(`SELECT * FROM content WHERE doc_id=21310 ORDER BY paragraph_index LIMIT 1 OFFSET 300`))[0];
console.log('sample:', JSON.stringify(Object.fromEntries(Object.entries(s).map(([k,v])=>[k, typeof v==='string'?v.slice(0,40):v]))));
