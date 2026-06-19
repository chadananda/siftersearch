// Apply AI alias-consolidation. Input JSON array of {canonical_name, entity_type, full_name, aliases_keep}.
// - full_name: the single fullest proper form (all titles + nisba). If it differs from canonical and does
//   NOT collide with another entity, rename the canonical (entity_research + graph_entities) and keep the
//   OLD name as a resolution surface in graph.db (so it still matches). Collision → skip rename, log.
// - aliases_keep: the curated DISPLAY aliases (genuinely distinct names/titles only). Replaces
//   entity_research.aliases. Native-script (Arabic/Persian) aliases present before are preserved even if
//   the AI omitted them. Partials/transliteration variants are intentionally dropped from display
//   (they remain in graph.db entity_aliases for resolution). Usage: node merge-aliashy.mjs <file.json>
import { readFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryOne, graphQuery} = await import('../../../api/lib/db.js');
const {normalizeSurface} = await import('../../../api/lib/graph-db.js');
const ARABIC = /[؀-ۿ]/;
const all = JSON.parse(readFileSync(process.argv[2],'utf8'));
let pruned=0, renamed=0, renameSkipped=0, missing=0;
for (const o of all) {
  const etype = o.entity_type;
  const cur = await queryOne("SELECT canonical_name, aliases FROM entity_research WHERE canonical_name=? AND entity_type=?", [o.canonical_name, etype]);
  if (!cur) { missing++; continue; }
  let keep = [...new Set((o.aliases_keep||[]).filter(Boolean))];
  // preserve native-script aliases the AI may have dropped
  try { for (const a of JSON.parse(cur.aliases||'[]')) if (ARABIC.test(a) && !keep.includes(a)) keep.push(a); } catch {}
  let canon = o.canonical_name;
  const full = (o.full_name||'').trim();
  if (full && full !== canon) {
    const clash = await queryOne("SELECT 1 AS x FROM entity_research WHERE canonical_name=? AND entity_type=?", [full, etype]);
    if (clash) { renameSkipped++; }
    else {
      await query("UPDATE entity_research SET canonical_name=? WHERE canonical_name=? AND entity_type=?", [full, canon, etype]);
      await query("UPDATE graph_entities SET canonical_name=?, name=? WHERE canonical_name=? AND entity_type=? AND religion=''", [full, full, canon, etype]);
      const ge = await queryOne("SELECT id FROM graph_entities WHERE canonical_name=? AND entity_type=? AND religion=''", [full, etype]);
      if (ge) await graphQuery("INSERT OR IGNORE INTO entity_aliases (entity_id,surface,surface_norm,lang,source,confidence) VALUES (?,?,?, 'en','oldcanon',1.0)", [ge.id, canon, normalizeSurface(canon)]);
      canon = full; renamed++;
    }
  }
  keep = keep.filter(a => a !== canon);
  await query("UPDATE entity_research SET aliases=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type=?", [JSON.stringify(keep), canon, etype]);
  pruned++;
}
console.log(`FILE=${process.argv[2]} pruned=${pruned} renamed=${renamed} renameSkipped=${renameSkipped} missing=${missing} total=${all.length}`);
process.exit(0);
