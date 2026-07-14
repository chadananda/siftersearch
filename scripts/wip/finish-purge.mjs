// Finish the purge: delete out-of-scope graph_relations (FK blocker) then graph_entities.
// Piped to the remote node via stdin (cwd = repo). Reads the MANIFEST id-list.
// SMALL relation chunks (50) so each writer DELETE returns fast (avoids the headers-timeout
// the 500-chunk run hit on the 3M-row graph_relations table). Idempotent — safe to re-run.
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
const { query } = await import('./api/lib/db.js');

const dir = execSync('ls -d /tank/backups/siftersearch/entity-purge-*/ | tail -1').toString().trim();
const ids = JSON.parse(readFileSync(dir + 'MANIFEST.json', 'utf8')).deleteEntityIds;
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

// 1. graph_relations FIRST (FK to graph_entities). Small chunks; tolerate a slow chunk.
let relDel = 0, relErr = 0, done = 0;
for (const c of chunk(ids, 50)) {
  try {
    const ph = c.map(() => '?').join(',');
    const r = await query(`DELETE FROM graph_relations WHERE source_entity_id IN (${ph}) OR target_entity_id IN (${ph})`, [...c, ...c]);
    relDel += (r?.rows?.[0]?.changes ?? r?.changes ?? 0);
  } catch (e) { relErr++; }
  done += c.length;
  if (done % 1000 < 50) console.log(`  relations: ${done}/${ids.length} ids processed (${relDel} deleted, ${relErr} chunk-errs)`);
}
console.log(`graph_relations deleted: ${relDel} (${relErr} chunk errors)`);

// 2. graph_entities (now unblocked).
let entDel = 0;
for (const c of chunk(ids, 500)) {
  const r = await query(`DELETE FROM graph_entities WHERE id IN (${c.map(() => '?').join(',')})`, c);
  entDel += (r?.rows?.[0]?.changes ?? r?.changes ?? 0);
}
console.log(`graph_entities deleted: ${entDel} of ${ids.length}`);
process.exit(relErr ? 1 : 0);
