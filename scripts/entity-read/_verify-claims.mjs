// throwaway: confirm the GPB claims landed in entity_claims.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const g = await queryAll(`SELECT import_batch b, COUNT(*) n, COUNT(DISTINCT entity_id) e, SUM(proof_ok) v FROM entity_claims GROUP BY import_batch`);
for (const r of g) console.log(`batch=${r.b}  claims=${r.n}  entities=${r.e}  verbatim=${r.v}`);
const top = await queryAll(`SELECT relation, COUNT(*) n FROM entity_claims GROUP BY relation ORDER BY n DESC LIMIT 6`);
console.log('top relations:', top.map((t) => `${t.relation}(${t.n})`).join(', '));
const q = await queryAll(`SELECT ec.relation, ec.para_id, substr(ec.statement,1,58) s FROM entity_claims ec JOIN graph_entities ge ON ge.id=ec.entity_id WHERE ge.canonical_name LIKE 'Quddús' LIMIT 4`);
console.log('\nQuddús pivot (WHERE entity_id + relation → index seek):');
for (const r of q) console.log(`  (${r.relation}) ${r.para_id}  ${r.s}`);
process.exit(0);
