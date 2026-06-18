// Merge duplicate entities per a dedup-plan.json (array of {entity_type,keeper,merged:[...],reason}).
// Folds merged rows into keeper: concatenates+dedups descriptions, unions aliases, repoints
// entity_mentions/entity_aliases (graph.db) and graph_relations (sifter.db) from merged->keeper,
// then deletes merged rows. DRY=1 prints without writing. Usage: [DRY=1] node merge-dedup.mjs <plan.json>
import { readFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryOne, queryAll, graphQuery, graphQueryAll} = await import('../../../api/lib/db.js');
const {normalizeSurface} = await import('../../../api/lib/graph-db.js');
const DRY = process.env.DRY === '1';
function nk(s){ return String(s).replace(/[‘’'`]/g,"'").toLowerCase().replace(/\s+/g,' ').trim(); }
const dedupFrags = d => { const seen=new Set(), out=[]; for (const p of String(d||'').split(' … ')) { const k=p.trim(); if (k && !seen.has(k)) { seen.add(k); out.push(p); } } return out.join(' … '); };
const plan = JSON.parse(readFileSync(process.argv[2],'utf8')).filter(c => c && c.keeper && Array.isArray(c.merged) && c.merged.length);
let clusters=0, foldedRows=0, repointedMentions=0, repointedAliases=0, repointedRels=0;
for (const c of plan) {
  const etype = c.entity_type;
  const keeperER = await queryOne("SELECT canonical_name, entity_type, description, aliases FROM entity_research WHERE canonical_name=? AND entity_type=?", [c.keeper, etype]);
  if (!keeperER) { console.log(`!! KEEPER NOT FOUND: ${etype} :: ${c.keeper} — skipping cluster`); continue; }
  const geKrows = await queryAll("SELECT id FROM graph_entities WHERE canonical_name=? AND entity_type=? AND religion=''", [c.keeper, etype]);
  const geK = geKrows[0]?.id;
  let desc = keeperER.description || '';
  let aliasSet = new Set(); try { for (const a of JSON.parse(keeperER.aliases||'[]')) aliasSet.add(a); } catch {}
  aliasSet.add(c.keeper);
  for (const M of c.merged) {
    if (nk(M)===nk(c.keeper)) continue;
    const mER = await queryOne("SELECT canonical_name, description, aliases FROM entity_research WHERE canonical_name=? AND entity_type=?", [M, etype]);
    if (!mER) { console.log(`   . merged not found (already gone?): ${etype} :: ${M}`); continue; }
    if (mER.description && mER.description.trim()) desc = desc ? desc + ' … ' + mER.description : mER.description;
    try { for (const a of JSON.parse(mER.aliases||'[]')) aliasSet.add(a); } catch {}
    aliasSet.add(M);
    const geMrows = await queryAll("SELECT id FROM graph_entities WHERE canonical_name=? AND entity_type=? AND religion=''", [M, etype]);
    for (const row of geMrows) {
      const geM = row.id;
      if (geK && geM!==geK) {
        const mc = await graphQueryAll("SELECT COUNT(*) AS n FROM entity_mentions WHERE entity_id=?", [geM]);
        const ac = await graphQueryAll("SELECT COUNT(*) AS n FROM entity_aliases WHERE entity_id=?", [geM]);
        const rc = await queryAll("SELECT COUNT(*) AS n FROM graph_relations WHERE source_entity_id=? OR target_entity_id=?", [geM, geM]);
        repointedMentions += (mc[0]?.n||0); repointedAliases += (ac[0]?.n||0); repointedRels += (rc[0]?.n||0);
        if (!DRY) {
          await graphQuery("UPDATE OR IGNORE entity_mentions SET entity_id=? WHERE entity_id=?", [geK, geM]);
          await graphQuery("DELETE FROM entity_mentions WHERE entity_id=?", [geM]);
          await graphQuery("UPDATE OR IGNORE entity_aliases SET entity_id=? WHERE entity_id=?", [geK, geM]);
          await graphQuery("DELETE FROM entity_aliases WHERE entity_id=?", [geM]);
          await query("UPDATE OR IGNORE graph_relations SET source_entity_id=? WHERE source_entity_id=?", [geK, geM]);
          await query("UPDATE OR IGNORE graph_relations SET target_entity_id=? WHERE target_entity_id=?", [geK, geM]);
          await query("DELETE FROM graph_relations WHERE source_entity_id=? OR target_entity_id=?", [geM, geM]);
          await query("DELETE FROM graph_relations WHERE source_entity_id=target_entity_id");
        }
      }
      if (!DRY) await query("DELETE FROM graph_entities WHERE id=?", [geM]);
    }
    if (!DRY) await query("DELETE FROM entity_research WHERE canonical_name=? AND entity_type=?", [M, etype]);
    foldedRows++;
  }
  desc = dedupFrags(desc);
  const aliasesJson = JSON.stringify([...aliasSet]);
  if (!DRY) {
    await query("UPDATE entity_research SET description=?, aliases=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type=?", [desc, aliasesJson, c.keeper, etype]);
    await query("UPDATE graph_entities SET description=? WHERE canonical_name=? AND entity_type=? AND religion=''", [desc, c.keeper, etype]);
    if (geK) for (const a of aliasSet) await graphQuery("INSERT OR IGNORE INTO entity_aliases (entity_id,surface,surface_norm,lang,source,confidence) VALUES (?,?,?, 'en','dedup',1.0)", [geK, a, normalizeSurface(a)]);
  }
  clusters++;
  console.log(`${DRY?'[dry] ':''}MERGED ${etype} :: ${c.keeper} <- [${c.merged.join(', ')}]  desc=${desc.length}`);
}
console.log(`${DRY?'[DRY RUN] ':''}clusters=${clusters} foldedRows=${foldedRows} repointedMentions=${repointedMentions} repointedAliases=${repointedAliases} repointedRels=${repointedRels}`);
console.log('ER total now: '+(await queryAll("SELECT COUNT(*) AS n FROM entity_research"))[0].n);
process.exit(0);
