import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const cols = await queryAll(`PRAGMA table_info(content)`);
console.log('content columns:', cols.map((c) => c.name).join(', '));
// full sample row (Dawn-Breakers + GPB) to see any chapter/section/numbering field
for (const doc of [21308, 21310]) {
  const r = (await queryAll(`SELECT * FROM content WHERE doc_id=? AND text IS NOT NULL ORDER BY paragraph_index LIMIT 1 OFFSET 120`, [doc]))[0];
  console.log(`\ndoc ${doc} sample:`, JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 60) : v]))));
}
process.exit(0);
