// Recompute entity_aliases.surface_norm (graph.db) with the updated normalizeSurface (now folds the
// ayn/hamza apostrophe class too). Rows that collapse to the same (entity_id, surface_norm, lang) are
// deduped — keeping the most-proper surface (most diacritics/curly glyphs). Respects the UNIQUE
// constraint by deleting collapsed duplicates BEFORE updating survivors. DRY=1 prints counts only.
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {graphQuery, graphQueryAll} = await import('../../../api/lib/db.js');
const {normalizeSurface} = await import('../../../api/lib/graph-db.js');
const DRY = process.env.DRY === '1';
const score = s => [...String(s||'')].filter(c => c.charCodeAt(0) > 127).length;
const rows = await graphQueryAll("SELECT id, entity_id, surface, surface_norm, lang FROM entity_aliases ORDER BY id");
const groups = new Map();
for (const r of rows) { const nn = normalizeSurface(r.surface); const k = r.entity_id+'|'+(r.lang||'')+'|'+nn; if (!groups.has(k)) groups.set(k, {nn, rows:[]}); groups.get(k).rows.push(r); }
let updated=0, deleted=0;
for (const {nn, rows:grp} of groups.values()) {
  // pick survivor = most-proper surface (then lowest id for stability)
  const keep = grp.slice().sort((a,b) => score(b.surface)-score(a.surface) || a.id-b.id)[0];
  for (const r of grp) if (r.id !== keep.id) { if (!DRY) await graphQuery("DELETE FROM entity_aliases WHERE id=?", [r.id]); deleted++; }
  if (keep.surface_norm !== nn) { if (!DRY) await graphQuery("UPDATE entity_aliases SET surface_norm=? WHERE id=?", [nn, keep.id]); updated++; }
}
console.log(`${DRY?'[DRY] ':''}renorm updated=${updated} deleted_dups=${deleted} total=${rows.length}`);
process.exit(0);
