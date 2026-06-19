// Apply per-person enrichment records produced by the enrichment fleet. Record shape:
// { name, common_name?, aliases?[], native_script?[], summary?, importance?, importance_reason?, characterizations?[] }
//  - common_name: the most-USED name -> becomes canonical (collision-guarded); old canonical kept as alias.
//  - aliases/native_script: merged into entity_research.aliases (display) + graph.db entity_aliases (resolution).
//  - summary / importance(1-100) / importance_reason: written to entity_research + graph_entities.
//  - characterizations: verbatim, source-tagged excerpts to APPEND to description (only what GPB didn't supply).
// DRY=1 prints. Usage: [DRY=1] node merge-enrich.mjs <records.json>
import { readFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryOne, queryAll, graphQuery} = await import('../../../api/lib/db.js');
const {normalizeSurface} = await import('../../../api/lib/graph-db.js');
const DRY = process.env.DRY==='1';
const nk = s=>String(s).replace(/[‘’'`]/g,"'").toLowerCase().replace(/\s+/g,' ').trim();
// Normalized match (strip diacritics + transliteration macron-below artifacts e.g. S̱h→Sh, ḵh→kh; normalize apostrophes)
const normName = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[‘’'`]/g,"'").toLowerCase().replace(/\s+/g,' ').trim();
let _normMap=null;
async function findCur(name){
  let c = await queryOne("SELECT canonical_name, aliases, description, summary FROM entity_research WHERE canonical_name=? AND entity_type='person'", [name]);
  if (c) return c;
  if (!_normMap){ _normMap=new Map(); for(const row of await queryAll("SELECT canonical_name FROM entity_research WHERE entity_type='person'")){ const k=normName(row.canonical_name); if(!_normMap.has(k)) _normMap.set(k,[]); _normMap.get(k).push(row.canonical_name); } }
  const hits=_normMap.get(normName(name))||[];   // unique normalized match only — never guess on ambiguity
  if (hits.length===1) return await queryOne("SELECT canonical_name, aliases, description, summary FROM entity_research WHERE canonical_name=? AND entity_type='person'", [hits[0]]);
  return null;
}
const recs = JSON.parse(readFileSync(process.argv[2],'utf8'));
const clampImp = v => (v==null?null:Math.max(1,Math.min(100,Math.round(Number(v)))));
const dedupFrags = d => { const seen=new Set(),out=[]; for(const p of String(d||'').split(' … ')){const k=p.trim();if(k&&!seen.has(k)){seen.add(k);out.push(p);}} return out.join(' … '); };
let renamed=0,renameSkip=0,aliasAdds=0,summarized=0,scored=0,charAdds=0,missing=0;
for (const r of recs){
  const cur = await findCur(r.name);
  if (!cur){ missing++; continue; }
  const dbName = cur.canonical_name;            // authoritative current name in DB (may carry transliteration artifacts)
  let canonical = dbName;
  const ge0 = await queryOne("SELECT id FROM graph_entities WHERE canonical_name=? AND entity_type='person' AND religion='' ORDER BY id LIMIT 1", [dbName]);
  const geid = ge0?.id;
  // 1) most-common-name rename (collision-guarded; old name preserved as alias). Also cleans artifact names: dbName→clean.
  const wantName = r.common_name || r.name;     // desired most-used display name (clean form)
  if (wantName && nk(wantName)!==nk(dbName)){
    const clash = await queryOne("SELECT canonical_name FROM entity_research WHERE canonical_name=? AND entity_type='person'", [wantName]);
    if (clash){ renameSkip++; }
    else {
      if(!DRY){
        if(geid) await graphQuery("INSERT OR IGNORE INTO entity_aliases (entity_id,surface,surface_norm,lang,source,confidence) VALUES (?,?,?, 'en','enrich-rename',1.0)", [geid, dbName, normalizeSurface(dbName)]);
        await query("UPDATE entity_research SET canonical_name=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'", [wantName, dbName]);
        await query("UPDATE graph_entities SET canonical_name=?, name=? WHERE canonical_name=? AND entity_type='person' AND religion=''", [wantName, wantName, dbName]);
      }
      canonical = wantName; renamed++;
    }
  }
  // 2) aliases + native script (keep both the DB form and the record's name as aliases)
  let aliasSet=new Set(); try{ for(const a of JSON.parse(cur.aliases||'[]')) aliasSet.add(a); }catch{}
  aliasSet.add(dbName); aliasSet.add(r.name);
  const asArr = v => Array.isArray(v) ? v : (v==null||v==='' ? [] : [v]);  // never spread a STRING (would split into chars)
  for(const a of [...asArr(r.aliases), ...asArr(r.native_script)]) if(a && String(a).trim()) aliasSet.add(a);
  for(const a of [...aliasSet]) if(String(a).trim().length<=1) aliasSet.delete(a);  // strip single-char/whitespace pollution
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
