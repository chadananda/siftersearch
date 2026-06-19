// Ensure every excerpt in a description is tagged with its source book. Descriptions are verbatim
// excerpts joined by " … "; the gather tagged some with "GPB:" and some not. This prepends "GPB: " to
// any fragment not already starting with a known book tag (GPB:/DB:). As later books are merged they
// should tag their own excerpts (DB: …) so provenance stays per-excerpt. DRY=1 prints counts.
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryAll} = await import('../../../api/lib/db.js');
const DRY = process.env.DRY === '1';
const FRAG = ' … ';
const TAGGED = /^\s*(GPB|DB)\s*:/i;
const rows = await queryAll("SELECT canonical_name, entity_type, description FROM entity_research WHERE description IS NOT NULL AND description<>''");
let changed=0, frags=0;
for (const r of rows) {
  let mod = false;
  const out = r.description.split(FRAG).map(p => {
    if (TAGGED.test(p)) return p;
    mod = true; frags++;
    return 'GPB: ' + p.replace(/^\s+/, '');
  });
  if (!mod) continue;
  const nd = out.join(FRAG);
  if (!DRY) {
    await query("UPDATE entity_research SET description=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type=?", [nd, r.canonical_name, r.entity_type]);
    await query("UPDATE graph_entities SET description=? WHERE canonical_name=? AND entity_type=? AND religion=''", [nd, r.canonical_name, r.entity_type]);
  }
  changed++;
}
console.log(`${DRY?'[DRY] ':''}descriptions_changed=${changed} fragments_tagged=${frags} total=${rows.length}`);
process.exit(0);
