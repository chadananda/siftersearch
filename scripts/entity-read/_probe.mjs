import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
// GPB (21310) heading structure — how fine is it vs the Dawn-Breakers' scene headings?
const h = await queryAll(`SELECT heading, COUNT(*) n, MIN(paragraph_index) lo, MAX(paragraph_index) hi FROM content
  WHERE doc_id=21310 AND heading IS NOT NULL AND heading!='' GROUP BY heading ORDER BY lo`);
console.log(`GPB: ${h.length} distinct headings`);
for (const r of h.slice(0, 24)) console.log(`  ¶${r.lo}-${r.hi} (${r.n}p) — ${String(r.heading).slice(0, 70)}`);
// does GPB cover the Baghdad period with the surviving Letters? sample passages
console.log('\nBaghdad-period passages naming a Letter w/ Bahá'+"'"+'u'+"'"+'lláh:');
const b = await queryAll(`SELECT external_para_id pid, paragraph_index pix, substr(text,1,260) t FROM content
  WHERE doc_id=21310 AND text LIKE '%Bag_h%' AND (text LIKE '%Letters of the Living%' OR text LIKE '%surviv%') ORDER BY paragraph_index LIMIT 6`);
for (const r of b) console.log(`  [${r.pid} ¶${r.pix}] ${r.t.replace(/\s+/g, ' ')}`);
process.exit(0);
