import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const r = await queryAll(`SELECT id, canonical_name cn, importance i FROM graph_entities WHERE entity_type='person'
  AND (canonical_name LIKE '%Abdu%Bahá%' OR canonical_name LIKE 'Shoghi%' OR canonical_name LIKE '%Jalíl-i-Ur%' OR canonical_name LIKE 'Martha%') ORDER BY i DESC`);
for (const x of r) console.log(x.id, x.i, x.cn);
process.exit(0);
