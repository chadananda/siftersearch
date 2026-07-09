// Link a set of person entities to a group entity via reversible graph_relations (so the biography
// meaning-search can resolve "<group name>" deterministically + completely). Reversible: DELETE by relation_type.
// Run ON tower-nas with SIFTER_WRITER_URL set.  Env: GROUP=<id> IDS=<csv> REL=<relation_type> WRITE=1
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { query, queryAll } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const GROUP = Number(process.env.GROUP);
const IDS = String(process.env.IDS || '').split(',').map(Number).filter(Boolean);
const REL = process.env.REL || 'group-member';
if (!GROUP || !IDS.length) { console.error('need GROUP=<id> IDS=<csv>'); process.exit(1); }

const grp = await queryAll(`SELECT id, canonical_name FROM graph_entities WHERE id = ${GROUP} AND entity_type='group'`);
if (!grp.length) { console.error('group not found / not a group:', GROUP); process.exit(1); }
const rows = await queryAll(`SELECT id, canonical_name FROM graph_entities WHERE id IN (${IDS.join(',')}) AND entity_type='person'`);
const found = new Set(rows.map((r) => r.id));
const missing = IDS.filter((id) => !found.has(id));
console.log(`group ${GROUP} = ${grp[0].canonical_name}`);
for (const r of rows) console.log(`  + ${r.id} ${r.canonical_name}`);
if (missing.length) console.log(`  MISSING (not a person / not found): ${missing.join(', ')}`);

let added = 0;
if (WRITE) {
  for (const id of [...found]) {
    await query(`INSERT OR IGNORE INTO graph_relations (source_entity_id, target_entity_id, relation_type, weight) VALUES (?,?,?,?)`, [id, GROUP, REL, 100]);
    added++;
  }
}
console.log(WRITE ? `\nAPPLIED — ${added} '${REL}' relations → group ${GROUP}` : `\nDRY RUN (set WRITE=1 to apply)`);
process.exit(0);
