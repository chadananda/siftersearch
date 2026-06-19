// Apply deep-research notes to entities. Input JSON array of {canonical_name, entity_type, research_notes}.
// research_notes = concise web-sourced identifying facts (full name, dates, role, fate, key ties) kept
// SEPARATE from the GPB-verbatim description (GPB stays authoritative). Idempotently adds the column.
// Usage: node merge-notes.mjs <file.json>
import { readFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryOne} = await import('../../../api/lib/db.js');
for (const t of ['entity_research','graph_entities']) { try { await query(`ALTER TABLE ${t} ADD COLUMN research_notes TEXT`); } catch { /* exists */ } }
const all = JSON.parse(readFileSync(process.argv[2],'utf8'));
let set=0, missing=0;
for (const o of all) {
  const notes = (o.research_notes||'').trim();
  if (!notes) continue;
  const cur = await queryOne("SELECT 1 AS x FROM entity_research WHERE canonical_name=? AND entity_type=?", [o.canonical_name, o.entity_type]);
  if (!cur) { missing++; continue; }
  await query("UPDATE entity_research SET research_notes=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type=?", [notes, o.canonical_name, o.entity_type]);
  await query("UPDATE graph_entities SET research_notes=? WHERE canonical_name=? AND entity_type=? AND religion=''", [notes, o.canonical_name, o.entity_type]);
  set++;
}
console.log(`FILE=${process.argv[2]} notes_set=${set} missing=${missing} total=${all.length}`);
process.exit(0);
