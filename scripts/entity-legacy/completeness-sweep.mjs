// Full-cast completeness sweep for doc 21308 (read-only). Reports, for the whole book:
//   1. reader paragraph-coverage (did the reader read every paragraph?)  -> reader recall
//   2. reader mentions resolved vs ORPHAN (surface not in any entity's inventory) -> the recall gap bucket
//   3. per-entity BINDING leak (reader resolved it to an entity but it isn't bound)
//   4. ORPHAN person-like surfaces (real references bound to no one) -> missing bindings / missing people
//   5. NAMESAKE clusters (a given name shared by >=2 bound entities; flags paras bound to >1 member) -> the
//      precision/disambiguation worklist
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, readdirSync } from 'fs';
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const DOC = 21308;
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const HON = /^(the |that |this |an |a |mulla |mirza |siyyid |haji |aqa |shaykh |s?h?ayh |mawlana |prince |imam |mir )+/;
const core = s => { let n = norm(s).replace(/\s*\([^)]*\)\s*$/, ''); let prev; do { prev = n; n = n.replace(HON, ''); } while (n !== prev); return n.replace(/-i-[a-z‘’'-]+$/, '').replace(/ of [a-z‘’'-]+$/, '').trim(); };
const ROLE_COLL = ['imam-jum', "mu'tamid", 'vazir', 'shah', 'governor', 'kad-khuda', 'mujtahid', 'martyr', 'prince', ' king', 'minister', 'ulama', 'divines', 'clergy', 'doctors', 'companions', 'disciples', 'people of', 'inhabitants', 'siyyids', 'mullas', 'believers', 'god', 'multitude', 'crowd', 'army', 'troops', 'guards', 'officials', 'notables', 'assailants', 'heirs', 'the youth', 'his son', 'my son', 'his brother', 'the child', 'he', 'him', 'his', 'they', 'them', 'the friend', 'the lowly', 'the matter', 'the truth', 'the bible'];
const personLike = l => { const n = norm(l); if (ROLE_COLL.some(t => n.includes(t))) return false; return /\b(khan|ḵhan|big|pasha|bagum|khanum|sultan|effendi|mulla|mirza|siyyid|haji|aqa|shaykh)\b/.test(n) || n.includes('-i-'); };

const persons = await queryAll("SELECT ge.id, er.canonical_name, er.aliases FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.entity_type='person' AND ge.religion='' WHERE er.entity_type='person'");
const nameById = new Map(persons.map(p => [p.id, p.canonical_name]));
const canon2id = new Map(persons.map(p => [norm(p.canonical_name), p.id]));
const geidSet = new Set(persons.map(p => p.id));
const recToId = rec => (rec.canonical_name && canon2id.get(norm(rec.canonical_name))) || (geidSet.has(rec.entity_id) ? rec.entity_id : null);

const dir = 'tmp/entity-research/seqread';
const regions = [];
for (const f of readdirSync(dir).filter(f => /^region-\d+\.json$/.test(f)).sort()) {
  const meta = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  let map = []; try { map = JSON.parse(readFileSync(`${dir}/${f.replace('.json', '-map.json')}`, 'utf8')); } catch {}
  const surf = new Map();
  for (const rec of map) { if (rec.new) continue; const id = recToId(rec); if (!id) continue; for (const s of [rec.label, rec.canonical_name, ...(rec.surfaces || [])]) if (s) surf.set(norm(s), id); }
  regions.push({ range: meta.range, surf });
}
const regionFor = p => regions.find(R => p >= R.range[0] && p <= R.range[1]);
const cmap = new Map((await queryAll(`SELECT id,paragraph_index FROM content WHERE doc_id=${DOC}`)).map(r => [String(r.id), r.paragraph_index]));
const totalParas = cmap.size;

// reader mentions
const mentions = JSON.parse(readFileSync(`${dir}/all-mentions.json`, 'utf8'));
const readerByEntity = new Map(); const orphan = new Map(); const parasRead = new Set(); let resolved = 0;
for (const m of mentions) {
  if (!m.label || m.label === 'null') continue; parasRead.add(m.para);
  const R = regionFor(m.para); const id = R && R.surf.get(norm(m.label));
  if (id) { resolved++; if (!readerByEntity.has(id)) readerByEntity.set(id, new Set()); readerByEntity.get(id).add(m.para); }
  else { const k = m.label; orphan.set(k, (orphan.get(k) || 0) + 1); }
}
// bindings in this doc
const boundByEntity = new Map(); const entityByPara = new Map();
for (const r of await graphQueryAll('SELECT entity_id, content_id FROM entity_mentions')) {
  const p = cmap.get(String(r.content_id)); if (p == null) continue;
  if (!boundByEntity.has(r.entity_id)) boundByEntity.set(r.entity_id, new Set()); boundByEntity.get(r.entity_id).add(p);
  if (!entityByPara.has(p)) entityByPara.set(p, new Set()); entityByPara.get(p).add(r.entity_id);
}

console.log(`=== Completeness sweep — The Dawn-Breakers (${DOC}) ===`);
console.log(`paragraphs: ${totalParas} | with >=1 reader mention: ${parasRead.size} (${(100 * parasRead.size / totalParas).toFixed(1)}%)  [reader paragraph-coverage]`);
console.log(`reader mentions: ${mentions.length} | resolved to an entity: ${resolved} | ORPHAN (no entity): ${[...orphan.values()].reduce((a, b) => a + b, 0)} across ${orphan.size} distinct surfaces`);
console.log(`person entities with >=1 binding: ${boundByEntity.size}`);

// per-entity binding leak
const leaks = [];
for (const [id, reader] of readerByEntity) { const b = boundByEntity.get(id) || new Set(); const miss = [...reader].filter(p => !b.has(p)); if (miss.length) leaks.push({ id, name: nameById.get(id) || id, miss: miss.sort((a, b) => a - b) }); }
leaks.sort((a, b) => b.miss.length - a.miss.length);
console.log(`\n--- BINDING leaks (reader resolved to entity, not bound): ${leaks.length} entities ---`);
for (const x of leaks.slice(0, 20)) console.log(`  ${x.id} ${x.name}: ${x.miss.length} paras [${x.miss.slice(0, 12).join(',')}]`);

// orphan person-like surfaces
const orphanPersons = [...orphan.entries()].filter(([l]) => personLike(l)).sort((a, b) => b[1] - a[1]);
console.log(`\n--- ORPHAN person-like surfaces (real refs bound to no entity): ${orphanPersons.length} distinct ---`);
for (const [l, n] of orphanPersons.slice(0, 30)) console.log(`  ×${n}  ${l}`);

// namesake clusters
const byCore = new Map();
for (const id of boundByEntity.keys()) { const nm = nameById.get(id); if (!nm) continue; const c = core(nm); if (!c || c.length < 3) continue; if (!byCore.has(c)) byCore.set(c, []); byCore.get(c).push(id); }
const clusters = [...byCore.entries()].filter(([, ids]) => ids.length >= 2);
// flag overlap paras (a para bound to >1 member of the same cluster)
const flagged = clusters.map(([c, ids]) => {
  const idset = new Set(ids); let overlap = 0;
  for (const [p, es] of entityByPara) { const inCluster = [...es].filter(e => idset.has(e)); if (inCluster.length >= 2) overlap++; }
  return { core: c, n: ids.length, overlap, ids };
}).sort((a, b) => b.n - a.n || b.overlap - a.overlap);
console.log(`\n--- NAMESAKE clusters (a given name shared by >=2 bound entities): ${clusters.length} ---`);
for (const c of flagged.slice(0, 25)) console.log(`  "${c.core}": ${c.n} entities${c.overlap ? `, ${c.overlap} paras bound to >1 of them (cross-contamination!)` : ''}  [${c.ids.slice(0, 6).join(',')}]`);
process.exit(0);
