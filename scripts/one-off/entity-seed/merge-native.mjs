// Add native-script (Arabic/Persian) spelling + name-meaning to the seed. Input JSON array of
// {canonical_name, entity_type, native_script, name_meaning}.
// - native_script (e.g. صادق) -> added to entity_research.aliases + graph.db entity_aliases (source='native'),
//   so the entity is findable by its Arabic/Persian spelling (transliteration-invariant surface).
// - name_meaning (translation, e.g. "the Most Holy") -> name_meaning column on entity_research + graph_entities.
// Idempotently ensures the name_meaning column exists. Usage: node merge-native.mjs <native.json>
import { readFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryOne, queryAll, graphQuery} = await import('../../../api/lib/db.js');
const {normalizeSurface} = await import('../../../api/lib/graph-db.js');
const nk = s => String(s||'').replace(/[‘’'`]/g,"'").toLowerCase().replace(/\s+/g,' ').trim();
for (const t of ['entity_research','graph_entities']) { try { await query(`ALTER TABLE ${t} ADD COLUMN name_meaning TEXT`); } catch { /* exists */ } }
const all = JSON.parse(readFileSync(process.argv[2],'utf8'));
const ge = await queryAll("SELECT id, canonical_name, entity_type FROM graph_entities WHERE religion=''");
const geByKey = new Map(); for (const g of ge) geByKey.set(nk(g.canonical_name)+'|'+g.entity_type, g.id);
let nativeAdded=0, meaningSet=0, missing=0;
for (const o of all) {
  const etype = o.entity_type;
  const cur = await queryOne("SELECT aliases FROM entity_research WHERE canonical_name=? AND entity_type=?", [o.canonical_name, etype]);
  if (!cur) { missing++; continue; }
  const geId = geByKey.get(nk(o.canonical_name)+'|'+etype);
  const ns = (o.native_script||'').trim();
  let aset = new Set(); try { for (const a of JSON.parse(cur.aliases||'[]')) aset.add(a); } catch {}
  if (ns && !aset.has(ns)) {
    aset.add(ns); nativeAdded++;
    if (geId) await graphQuery("INSERT OR IGNORE INTO entity_aliases (entity_id,surface,surface_norm,lang,source,confidence) VALUES (?,?,?, 'fa','native',1.0)", [geId, ns, normalizeSurface(ns)]);
  }
  const meaning = (o.name_meaning||'').trim();
  await query("UPDATE entity_research SET aliases=?, name_meaning=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type=?", [JSON.stringify([...aset]), meaning||null, o.canonical_name, etype]);
  if (geId) await query("UPDATE graph_entities SET name_meaning=? WHERE id=?", [meaning||null, geId]);
  if (meaning) meaningSet++;
}
console.log(`FILE=${process.argv[2]} nativeAdded=${nativeAdded} meaningSet=${meaningSet} missing=${missing} total=${all.length}`);
process.exit(0);
