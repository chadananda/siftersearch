// Apply alias/relationship/era research to the entity seed. Input JSON array of
// {canonical_name, entity_type, aliases:[...], relationships:[{type,target}], era}.
// - aliases: union into entity_research.aliases (JSON) + graph.db entity_aliases (source='research')
// - era: set on graph_entities.era
// - relationships: insert into graph_relations (source->target by resolved name), dedup by existence
// Research must never CONTRADICT GPB; it only adds recognition surfaces / kinship / timeframe.
// Usage: node merge-research.mjs <research.json>
import { readFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryOne, queryAll, graphQuery} = await import('../../../api/lib/db.js');
const {normalizeSurface} = await import('../../../api/lib/graph-db.js');
const nk = s => String(s).replace(/[‘’'`]/g,"'").toLowerCase().replace(/\s+/g,' ').trim();
const all = JSON.parse(readFileSync(process.argv[2],'utf8'));
const ge = await queryAll("SELECT id, canonical_name, entity_type FROM graph_entities WHERE religion=''");
const geByKey = new Map(); const geByName = new Map();
for (const g of ge) { geByKey.set(nk(g.canonical_name)+'|'+g.entity_type, g.id); if (!geByName.has(nk(g.canonical_name))) geByName.set(nk(g.canonical_name), g.id); }
let aliasAdded=0, relAdded=0, relUnresolved=0, eraSet=0, missing=0;
for (const o of all) {
  const etype = o.entity_type;
  const cur = await queryOne("SELECT aliases FROM entity_research WHERE canonical_name=? AND entity_type=?", [o.canonical_name, etype]);
  if (!cur) { missing++; continue; }
  const geId = geByKey.get(nk(o.canonical_name)+'|'+etype);
  let aset = new Set(); try { for (const a of JSON.parse(cur.aliases||'[]')) aset.add(a); } catch {}
  for (const a of (o.aliases||[])) {
    if (a && !aset.has(a)) { aset.add(a); aliasAdded++; if (geId) await graphQuery("INSERT OR IGNORE INTO entity_aliases (entity_id,surface,surface_norm,lang,source,confidence) VALUES (?,?,?, 'en','research',0.9)", [geId, a, normalizeSurface(a)]); }
  }
  await query("UPDATE entity_research SET aliases=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type=?", [JSON.stringify([...aset]), o.canonical_name, etype]);
  if (o.era && geId) { await query("UPDATE graph_entities SET era=? WHERE id=?", [String(o.era), geId]); eraSet++; }
  if (geId) for (const r of (o.relationships||[])) {
    const tId = r && r.target ? geByName.get(nk(r.target)) : null;
    if (!tId || tId===geId) { relUnresolved++; continue; }
    const exists = await queryOne("SELECT 1 FROM graph_relations WHERE source_entity_id=? AND target_entity_id=? AND relation_type=?", [geId, tId, r.type||'related']);
    if (!exists) { await query("INSERT INTO graph_relations (source_entity_id,target_entity_id,relation_type,weight,source_doc_id) VALUES (?,?,?,1,21310)", [geId, tId, r.type||'related']); relAdded++; }
  }
}
console.log(`FILE=${process.argv[2]} aliasAdded=${aliasAdded} relAdded=${relAdded} relUnresolved=${relUnresolved} eraSet=${eraSet} missing=${missing} total=${all.length}`);
process.exit(0);
