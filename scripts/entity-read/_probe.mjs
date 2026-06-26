import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
// what columns exist on content?
const cols = await queryAll(`PRAGMA table_info(content)`);
console.log('content cols:', cols.map((c) => c.name).join(', '));
// sample heading + para_meta for Dawn-Breakers
const s = await queryAll(`SELECT external_para_id pid, paragraph_index pix, heading, substr(para_meta,1,120) pm FROM content WHERE doc_id=21308 ORDER BY paragraph_index LIMIT 8`);
for (const r of s) console.log(`¶${r.pix} [${r.pid}] heading=${JSON.stringify(r.heading)} meta=${r.pm || ''}`);
// distinct headings + paragraph counts (the book's own episode/scene structure)
const h = await queryAll(`SELECT heading, COUNT(*) n, MIN(paragraph_index) lo, MAX(paragraph_index) hi FROM content WHERE doc_id=21308 AND heading IS NOT NULL AND heading!='' GROUP BY heading ORDER BY lo`);
console.log(`\n${h.length} distinct headings in Dawn-Breakers. First 30:`);
for (const r of h.slice(0, 30)) console.log(`  ¶${r.lo}-${r.hi} (${r.n}p) — ${r.heading}`);
process.exit(0);
