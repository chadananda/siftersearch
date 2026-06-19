// Recompute entity_aliases.surface_norm (graph.db) with the updated normalizeSurface (now folds the
// ayn/hamza apostrophe class too), and delete rows that collapse to a duplicate (entity_id, surface_norm).
// Keeps resolution surfaces consistent with the new fold so e.g. a mention with ‘ matches an alias with '.
// DRY=1 prints counts only. Usage: [DRY=1] node renorm-aliases.mjs
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {graphQuery, graphQueryAll} = await import('../../../api/lib/db.js');
const {normalizeSurface} = await import('../../../api/lib/graph-db.js');
const DRY = process.env.DRY === '1';
const rows = await graphQueryAll("SELECT id, entity_id, surface, surface_norm FROM entity_aliases ORDER BY id");
const seen = new Set(); let updated=0, deleted=0;
for (const r of rows) {
  const nn = normalizeSurface(r.surface);
  const key = r.entity_id + '|' + nn;
  if (seen.has(key)) { if (!DRY) await graphQuery("DELETE FROM entity_aliases WHERE id=?", [r.id]); deleted++; continue; }
  seen.add(key);
  if (nn !== r.surface_norm) { if (!DRY) await graphQuery("UPDATE entity_aliases SET surface_norm=? WHERE id=?", [nn, r.id]); updated++; }
}
console.log(`${DRY?'[DRY] ':''}renorm updated=${updated} deleted_dups=${deleted} total=${rows.length}`);
process.exit(0);
