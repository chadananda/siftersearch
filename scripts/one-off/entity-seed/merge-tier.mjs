// Apply a significance tier to entities. Input JSON array of {canonical_name, entity_type, significance}
// where significance is 'significant' | 'incidental'. Sets the name_meaning-style `significance` column on
// entity_research + graph_entities. Idempotently ensures the column exists. Usage: node merge-tier.mjs <file.json>
import { readFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryOne} = await import('../../../api/lib/db.js');
for (const t of ['entity_research','graph_entities']) { try { await query(`ALTER TABLE ${t} ADD COLUMN significance TEXT`); } catch { /* exists */ } }
const all = JSON.parse(readFileSync(process.argv[2],'utf8'));
let set=0, missing=0;
for (const o of all) {
  const sig = (o.significance||'').trim();
  if (!sig) continue;
  const cur = await queryOne("SELECT 1 AS x FROM entity_research WHERE canonical_name=? AND entity_type=?", [o.canonical_name, o.entity_type]);
  if (!cur) { missing++; continue; }
  await query("UPDATE entity_research SET significance=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type=?", [sig, o.canonical_name, o.entity_type]);
  await query("UPDATE graph_entities SET significance=? WHERE canonical_name=? AND entity_type=? AND religion=''", [sig, o.canonical_name, o.entity_type]);
  set++;
}
console.log(`FILE=${process.argv[2]} significance_set=${set} missing=${missing} total=${all.length}`);
process.exit(0);
