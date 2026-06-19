// Apply per-person enrichment records produced by the enrichment fleet. Record shape:
// { name, common_name?, aliases?[], native_script?[], summary?, importance?, importance_reason?, characterizations?[] }
//  - common_name: the most-USED name -> becomes canonical (collision-guarded); old canonical kept as alias.
//  - aliases/native_script: merged into entity_research.aliases (display) + graph.db entity_aliases (resolution).
//  - summary / importance(1-100) / importance_reason: written to entity_research + graph_entities.
//  - characterizations: verbatim, source-tagged excerpts to APPEND to description (only what GPB didn't supply).
// DRY=1 prints. Usage: [DRY=1] node merge-enrich.mjs <records.json>
import { readFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryOne, graphQuery} = await import('../../../api/lib/db.js');
const {normalizeSurface} = await import('../../../api/lib/graph-db.js');
const DRY = process.env.DRY==='1';
const nk = s=>String(s).replace(/[‘’'`]/g,"'").toLowerCase().replace(/\s+/g,' ').trim();
const recs = JSON.parse(readFileSync(process.argv[2],'utf8'));
const clampImp = v => (v==null?null:Math.max(1,Math.min(100,Math.round(Number(v)))));
const dedupFrags = d => { const seen=new Set(),out=[]; for(const p of String(d||'').split(' … ')){const k=p.trim();if(k&&!seen.has(k)){seen.add(k);out.push(p);}} return out.join(' … '); };
let renamed=0,renameSkip=0,aliasAdds=0,summarized=0,scored=0,charAdds=0,missing=0;
for (const r of recs){
  const cur = await queryOne("SELECT canonical_name, aliases, description, summary FROM entity_research WHERE canonical_name=? AND entity_type='person'", [r.name]);
  if (!cur){ missing++; continue; }
  let canonical = r.name;
  const ge0 = await queryOne("SELECT id FROM graph_entities WHERE canonical_name=? AND entity_type='person' AND religion='' ORDER BY id LIMIT 1", [r.name]);
  const geid = ge0?.id;
  // 1) most-common-name rename (collision-guarded; old name preserved as alias)
  if (r.common_name && nk(r.common_name)!==nk(r.name)){
    const clash = await queryOne("SELECT canonical_name FROM entity_research WHERE canonical_name=? AND entity_type='person'", [r.common_name]);
    if (clash){ renameSkip++; }
    else {
      if(!DRY){
        if(geid) await graphQuery("INSERT OR IGNORE INTO entity_aliases (entity_id,surface,surface_norm,lang,source,confidence) VALUES (?,?,?, 'en','enrich-rename',1.0)", [geid, r.name, normalizeSurface(r.name)]);
        await query("UPDATE entity_research SET canonical_name=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'", [r.common_name, r.name]);
        await query("UPDATE graph_entities SET canonical_name=?, name=? WHERE canonical_name=? AND entity_type='person' AND religion=''", [r.common_name, r.common_name, r.name]);
      }
      canonical = r.common_name; renamed++;
    }
  }
  // 2) aliases + native script (always keep the old/full name as an alias)
  let aliasSet=new Set(); try{ for(const a of JSON.parse(cur.aliases||'[]')) aliasSet.add(a); }catch{}
  aliasSet.add(r.name);
  for(const a of [...(r.aliases||[]), ...(r.native_script||[])]) if(a) aliasSet.add(a);
  aliasSet.delete(canonical);
  const aliasesJson = JSON.stringify([...aliasSet]);
  // 3) characterizations appended to description (only new fragments)
  let desc = cur.description||'';
  if (Array.isArray(r.characterizations) && r.characterizations.length){
    desc = dedupFrags((desc?desc+' … ':'') + r.characterizations.filter(Boolean).join(' … '));
    charAdds++;
  }
  const imp = clampImp(r.importance);
  if(!DRY){
    await query("UPDATE entity_research SET aliases=?, description=?, summary=COALESCE(?,summary), importance=COALESCE(?,importance), importance_reason=COALESCE(?,importance_reason), updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'",
      [aliasesJson, desc, r.summary??null, imp, r.importance_reason??null, canonical]);
    await query("UPDATE graph_entities SET description=?, summary=COALESCE(?,summary), importance=COALESCE(?,importance) WHERE canonical_name=? AND entity_type='person' AND religion=''",
      [desc, r.summary??null, imp, canonical]);
    if(geid) for(const a of aliasSet) await graphQuery("INSERT OR IGNORE INTO entity_aliases (entity_id,surface,surface_norm,lang,source,confidence) VALUES (?,?,?, 'en','enrich',1.0)", [geid, a, normalizeSurface(a)]);
  }
  if(r.summary) summarized++; if(imp!=null) scored++; aliasAdds++;
}
console.log(`${DRY?'[DRY] ':''}recs=${recs.length} renamed=${renamed} renameSkip(collision)=${renameSkip} aliasUpdated=${aliasAdds} summarized=${summarized} scored=${scored} charAdds=${charAdds} missing=${missing}`);
process.exit(0);
