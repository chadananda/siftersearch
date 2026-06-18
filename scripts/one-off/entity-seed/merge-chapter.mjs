// Merge a GPB gather chunk into the entity seed. Resolves each entity against the
// current roster by normalized canonical_name (cross-chunk dups auto-resolve), appends
// verbatim gpb_statements to BOTH entity_research.description AND graph_entities.description
// (the review page reads graph_entities), and records entity_mentions. Usage: node merge-chapter.mjs <gather.json>
import { readFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryOne, queryAll, graphQuery} = await import('../../../api/lib/db.js');
const {normalizeSurface} = await import('../../../api/lib/graph-db.js');
const nk = s => String(s).replace(/[‘’'`]/g,"'").toLowerCase().replace(/\s+/g,' ').trim();
const file = process.argv[2];
const all = JSON.parse(readFileSync(file,'utf8'));
const er = await queryAll("SELECT canonical_name, entity_type, description FROM entity_research");
const erByKey = new Map(er.map(r=>[nk(r.canonical_name), r]));
let enriched=0, created=0, mentions=0;
for (const o of all) {
  const k = nk(o.canonical_name);
  let row = erByKey.get(k); let canonical, etype;
  const add = (o.gpb_statements||[]).filter(Boolean).join(' … ');
  if (row) {
    canonical = row.canonical_name; etype = row.entity_type;
    if (add) {
      const nd = (row.description && row.description.trim()) ? row.description + ' … ' + add : add;
      await query("UPDATE entity_research SET description=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type=?", [nd, canonical, etype]);
      await query("UPDATE graph_entities SET description=? WHERE canonical_name=? AND entity_type=? AND religion=''", [nd, canonical, etype]);
      row.description = nd; enriched++;
    }
  } else {
    canonical = o.canonical_name; etype = o.entity_type || 'person';
    await query("INSERT INTO entity_research (canonical_name,entity_type,side,aliases,description,sources,confidence,status) VALUES (?,?,?,?,?, ?, 0.85, 'proposed') ON CONFLICT(canonical_name,entity_type) DO UPDATE SET description=CASE WHEN entity_research.description IS NULL OR entity_research.description='' THEN excluded.description ELSE entity_research.description||' … '||excluded.description END, updated_at=datetime('now')", [canonical, etype, o.side||'', JSON.stringify([canonical]), add, 'GPB '+file.replace(/.*gather-|\.json/g,'')+' (gather)']);
    await query("INSERT OR IGNORE INTO graph_entities (canonical_name,name,entity_type,religion,description) VALUES (?,?,?, '', ?)", [canonical, canonical, etype, add]);
    erByKey.set(k, {canonical_name:canonical, entity_type:etype, description:add}); created++;
  }
  const ge = await queryOne("SELECT id FROM graph_entities WHERE canonical_name=? AND religion='' ORDER BY id LIMIT 1", [canonical]);
  if (ge) {
    if (!row) await graphQuery("INSERT OR IGNORE INTO entity_aliases (entity_id,surface,surface_norm,lang,source,confidence) VALUES (?,?,?, 'en','gather',1.0)", [ge.id, canonical, normalizeSurface(canonical)]);
    for (const m of (o.mention_idxs||[])) { const c = await queryOne("SELECT id FROM content WHERE doc_id=21310 AND paragraph_index=? AND deleted_at IS NULL", [m]); if (c) { await graphQuery("INSERT OR IGNORE INTO entity_mentions (entity_id,content_id) VALUES (?,?)", [ge.id, String(c.id)]); mentions++; } }
  }
}
console.log(`FILE=${file} enriched=${enriched} created=${created} mentions=${mentions} total=${all.length}`);
process.exit(0);
