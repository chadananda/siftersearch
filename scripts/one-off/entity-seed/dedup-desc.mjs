// Idempotent fixup: within each entity description, dedup repeated " … "-separated fragments
// (keeps first occurrence, preserves order). Syncs both entity_research and graph_entities.
// Fixes accidental double-appends (e.g. a chunk merged twice). Usage: node dedup-desc.mjs
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryAll} = await import('../../../api/lib/db.js');
const rows = await queryAll("SELECT canonical_name, entity_type, description FROM entity_research WHERE description LIKE '% … %'");
let fixed=0;
for (const r of rows) {
  const parts = r.description.split(' … ');
  const seen=new Set(); const out=[];
  for (const p of parts) { const k=p.trim(); if (k && !seen.has(k)) { seen.add(k); out.push(p); } }
  const nd = out.join(' … ');
  if (nd !== r.description) {
    await query("UPDATE entity_research SET description=? WHERE canonical_name=? AND entity_type=?", [nd, r.canonical_name, r.entity_type]);
    await query("UPDATE graph_entities SET description=? WHERE canonical_name=? AND entity_type=? AND religion=''", [nd, r.canonical_name, r.entity_type]);
    fixed++;
  }
}
console.log('deduped_descriptions='+fixed);
process.exit(0);
