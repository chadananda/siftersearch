import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
// Letters of the Living group id was 1247655. List its recorded members.
const g = 1247655;
const ge = await queryAll(`SELECT canonical_name cn, entity_type FROM graph_entities WHERE id=?`, [g]);
console.log('group', g, '=', ge[0]?.cn, ge[0]?.entity_type);
const mem = await queryAll(`SELECT gr.source_entity_id id, ge.canonical_name cn, ge.importance imp, gr.relation_type rt
  FROM graph_relations gr JOIN graph_entities ge ON ge.id=gr.source_entity_id WHERE gr.target_entity_id=? AND ge.entity_type='person'
  ORDER BY (ge.importance IS NULL), ge.importance DESC`, [g]);
console.log(`${mem.length} member relations:`);
for (const m of mem) console.log(`  ${m.id} imp=${m.imp || 0} [${m.rt}] ${m.cn}`);
// find Mírzá Hádí entities
const h = await queryAll(`SELECT id, canonical_name cn, importance imp FROM graph_entities WHERE entity_type='person' AND canonical_name LIKE 'Mírzá Hádí%'`);
console.log('\nMírzá Hádí entities:', h.map((x) => `${x.id}(imp ${x.imp || 0}) ${x.cn}`).join(' | '));
process.exit(0);
