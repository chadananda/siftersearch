// Apply pronoun/relational bracketing to entity descriptions. Input JSON array of
// {canonical_name, entity_type, bracketed}. GUARD: the bracketed text must be ADDITIVE only —
// identical to the current description once all "[...]" insertions are stripped, and not shorter.
// This guarantees agents only inserted resolver brackets, never reworded the verbatim GPB text.
// Syncs both entity_research and graph_entities. Usage: node merge-bracket.mjs <brackets.json>
import { readFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryOne} = await import('../../../api/lib/db.js');
const strip = s => String(s||'').replace(/\s*\[[^\]]*\]/g,'').replace(/\s+/g,' ').trim();
const all = JSON.parse(readFileSync(process.argv[2],'utf8'));
let applied=0, skippedGuard=0, missing=0, noop=0;
for (const o of all) {
  const cur = await queryOne("SELECT description FROM entity_research WHERE canonical_name=? AND entity_type=?", [o.canonical_name, o.entity_type]);
  if (!cur) { missing++; continue; }
  const b = (o.bracketed||'').trim();
  if (!b || b === cur.description) { noop++; continue; }
  if (strip(b) === strip(cur.description) && b.length >= cur.description.length) {
    await query("UPDATE entity_research SET description=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type=?", [b, o.canonical_name, o.entity_type]);
    await query("UPDATE graph_entities SET description=? WHERE canonical_name=? AND entity_type=? AND religion=''", [b, o.canonical_name, o.entity_type]);
    applied++;
  } else skippedGuard++;
}
console.log(`FILE=${process.argv[2]} bracket_applied=${applied} skipped_guard=${skippedGuard} missing=${missing} noop=${noop} total=${all.length}`);
process.exit(0);
