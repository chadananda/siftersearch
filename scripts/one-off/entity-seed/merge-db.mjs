// Merge a Dawn-Breakers (doc 21308) gather chunk into the seed, RESOLVING each entity against
// the existing GPB seed first (so DB mentions attach to known entities instead of creating
// transliteration duplicates). Resolution order: exact canonical (nk) -> alias index
// (normalizeSurface, transliteration-folded, graph.db entity_aliases) -> else create new.
//
// LIGHTER than the GPB gather (user: "do not capture as many characterizations/references this
// time unless none exist from GPB"): an entity already carrying a description gets the DB mention
// recorded (so [DB +N] count + badge populate) but NO excerpt pile-on. Only entities with an empty
// description (genuinely new DB-only, or a GPB stub) get DB-tagged excerpts appended.
// Skips files with a .merged sibling. DRY=1 prints what it would do. Usage: node merge-db.mjs <gather.json>
import { readFileSync, existsSync, writeFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryOne, queryAll, graphQuery, graphQueryOne} = await import('../../../api/lib/db.js');
const {normalizeSurface} = await import('../../../api/lib/graph-db.js');
const DRY = process.env.DRY === '1';
const DB_DOC = 21308;
const nk = s => String(s).replace(/[‘’'`]/g,"'").toLowerCase().replace(/\s+/g,' ').trim();
const file = process.argv[2];
if (existsSync(file + '.merged')) { console.log(`SKIP (already merged): ${file}`); process.exit(0); }
const all = JSON.parse(readFileSync(file,'utf8'));
const er = await queryAll("SELECT canonical_name, entity_type, description FROM entity_research");
const erByKey = new Map(er.map(r=>[nk(r.canonical_name), r]));

async function resolve(o) {
  // 1) exact canonical (transliteration-insensitive at the nk level)
  let row = erByKey.get(nk(o.canonical_name));
  if (row) return { row, method:'canonical' };
  // 2) alias index — normalizeSurface folds diacritics + ayn/hamza class
  const ns = normalizeSurface(o.canonical_name);
  const a = await graphQueryOne("SELECT entity_id FROM entity_aliases WHERE surface_norm=? LIMIT 1", [ns]);
  if (a) {
    const ge = await queryOne("SELECT canonical_name, entity_type FROM graph_entities WHERE id=? LIMIT 1", [a.entity_id]);
    if (ge) { const r2 = erByKey.get(nk(ge.canonical_name)); if (r2) return { row:r2, method:'alias' }; }
  }
  return { row:null, method:'new' };
}

let resolved=0, created=0, mentions=0, excerpts=0;
const newNames=[];
for (const o of all) {
  const stmts = (o.db_statements || o.gpb_statements || []).filter(Boolean)
    .map(s => /^\s*DB\s*:/i.test(s) ? s : 'DB: ' + s.replace(/^\s+/,''));
  const add = stmts.join(' … ');
  const { row, method } = await resolve(o);
  let canonical, etype;
  if (row) {
    canonical = row.canonical_name; etype = row.entity_type; resolved++;
    // append DB excerpts ONLY when the entity currently has nothing (keep DB light otherwise)
    if (add && !(row.description && row.description.trim())) {
      if (!DRY) {
        await query("UPDATE entity_research SET description=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type=?", [add, canonical, etype]);
        await query("UPDATE graph_entities SET description=? WHERE canonical_name=? AND entity_type=? AND religion=''", [add, canonical, etype]);
      }
      row.description = add; excerpts++;
    }
  } else {
    canonical = o.canonical_name; etype = o.entity_type || 'person'; created++; newNames.push(`${etype}:${canonical}`);
    if (!DRY) {
      await query("INSERT INTO entity_research (canonical_name,entity_type,side,aliases,description,sources,confidence,status) VALUES (?,?,?,?,?, 'Dawn-Breakers (gather)', 0.85, 'proposed') ON CONFLICT(canonical_name,entity_type) DO UPDATE SET description=CASE WHEN entity_research.description IS NULL OR entity_research.description='' THEN excluded.description ELSE entity_research.description END, updated_at=datetime('now')", [canonical, etype, o.side||'', JSON.stringify([canonical]), add]);
      await query("INSERT OR IGNORE INTO graph_entities (canonical_name,name,entity_type,religion,description) VALUES (?,?,?, '', ?)", [canonical, canonical, etype, add]);
    }
    erByKey.set(nk(canonical), {canonical_name:canonical, entity_type:etype, description:add});
    if (add) excerpts++;
  }
  // record DB mentions (always — this is what drives the [DB +N] count + badge)
  const ge = await queryOne("SELECT id FROM graph_entities WHERE canonical_name=? AND religion='' ORDER BY id LIMIT 1", [canonical]);
  if (ge) {
    if (method === 'new' && !DRY) await graphQuery("INSERT OR IGNORE INTO entity_aliases (entity_id,surface,surface_norm,lang,source,confidence) VALUES (?,?,?, 'en','db-gather',1.0)", [ge.id, canonical, normalizeSurface(canonical)]);
    for (const m of (o.mention_idxs||[])) {
      const c = await queryOne("SELECT id FROM content WHERE doc_id=? AND paragraph_index=? AND deleted_at IS NULL", [DB_DOC, m]);
      if (c) { if (!DRY) await graphQuery("INSERT OR IGNORE INTO entity_mentions (entity_id,content_id) VALUES (?,?)", [ge.id, String(c.id)]); mentions++; }
    }
  }
}
if (!DRY) writeFileSync(file + '.merged', new Date().toISOString());
console.log(`${DRY?'[DRY] ':''}FILE=${file} resolved=${resolved} created=${created} db_excerpts=${excerpts} mentions=${mentions} total=${all.length}`);
if (newNames.length) console.log(`  NEW: ${newNames.slice(0,40).join(', ')}${newNames.length>40?` …(+${newNames.length-40})`:''}`);
process.exit(0);
