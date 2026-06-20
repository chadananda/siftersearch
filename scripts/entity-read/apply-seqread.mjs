// Apply seqread reconciliation. Resolves every mention (all-mentions.json) through the per-region maps to
// a DB entity id, then ATTACHES entity_mentions for certain/probable binds to EXISTING entities — tagged
// extractor_version='seqread-v1' so the whole pass is reversible (DELETE ... WHERE extractor_version='seqread-v1').
// Recovers query-miss bindings (a "new" label whose name uniquely matches an existing entity). Does NOT create
// entities or merge — genuinely-new persons + ambiguous cases go to review-queue.json. DRY=1 previews.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, readdirSync, writeFileSync } from 'fs';
const { queryAll, graphQueryAll, graphTransaction } = await import('../../api/lib/db.js');
const DRY = process.env.DRY === '1';
const dir = 'tmp/entity-research/seqread';
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();

const regions = [];
for (const f of readdirSync(dir).filter(f => /^region-\d+\.json$/.test(f)).sort()) {
  const meta = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  let map = []; try { map = JSON.parse(readFileSync(`${dir}/${f.replace('.json', '-map.json')}`, 'utf8')); } catch {}
  const lm = new Map();
  for (const rec of map) { lm.set(norm(rec.label), rec); for (const s of rec.surfaces || []) lm.set(norm(s), rec); }
  regions.push({ range: meta.range, lm });
}
const regionFor = para => regions.find(R => para >= R.range[0] && para <= R.range[1]);

const persons = await queryAll("SELECT ge.id, er.canonical_name, er.aliases FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.entity_type='person' AND ge.religion='' WHERE er.entity_type='person'");
const nameIdx = new Map();
for (const p of persons) {
  const add = n => { const k = norm(n); if (!k) return; if (!nameIdx.has(k)) nameIdx.set(k, new Set()); nameIdx.get(k).add(p.id); };
  add(p.canonical_name); try { for (const a of JSON.parse(p.aliases || '[]')) add(a); } catch {}
}
const uniqId = name => { const s = nameIdx.get(norm(name)); return s && s.size === 1 ? [...s][0] : null; };

const paraCid = new Map((await queryAll("SELECT paragraph_index, id FROM content WHERE doc_id=21308 AND deleted_at IS NULL")).map(r => [r.paragraph_index, String(r.id)]));
const mentions = JSON.parse(readFileSync(`${dir}/all-mentions.json`, 'utf8'));
const conf = { certain: 1.0, probable: 0.7 };
const inserts = new Map(); const newq = new Map();
let amb = 0, non = 0, unmatched = 0, recovered = 0, nocid = 0;
for (const m of mentions) {
  const R = regionFor(m.para); if (!R) { unmatched++; continue; }
  const rec = R.lm.get(norm(m.label)); if (!rec) { unmatched++; continue; }
  if (rec.confidence === 'non-entity') { non++; continue; }
  if (rec.confidence === 'ambiguous') { amb++; continue; }
  let eid = rec.entity_id;
  if (!eid) { const rid = uniqId(rec.canonical_name || rec.label); if (rid) { eid = rid; recovered++; } }
  if (!eid) { const k = norm(rec.canonical_name || rec.label); if (!newq.has(k)) newq.set(k, { name: rec.canonical_name || rec.label, count: 0, triangulation: rec.triangulation }); newq.get(k).count++; continue; }
  const cid = paraCid.get(m.para); if (cid == null) { nocid++; continue; }
  const key = eid + '|' + cid;
  if (!inserts.has(key)) inserts.set(key, { entity_id: eid, content_id: cid, role: m.type || null, conf: conf[rec.confidence] ?? 0.8 });
}
const existing = new Set((await graphQueryAll("SELECT entity_id, content_id FROM entity_mentions")).map(r => r.entity_id + '|' + r.content_id));
const toAdd = [...inserts.values()].filter(x => !existing.has(x.entity_id + '|' + x.content_id));
console.log(`mentions=${mentions.length} resolved-to-existing=${inserts.size} recovered=${recovered} new-persons=${newq.size} ambiguous=${amb} non-entity=${non} unmatched=${unmatched} nocid=${nocid}`);
console.log(`NEW entity_mention rows to add (after dedup vs ${existing.size} existing): ${toAdd.length}`);
if (!DRY && toAdd.length) {
  for (let i = 0; i < toAdd.length; i += 2000) {
    const batch = toAdd.slice(i, i + 2000);
    await graphTransaction(batch.map(x => ({ sql: "INSERT INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','seqread-v1')", args: [x.entity_id, x.content_id, x.role, x.conf] })));
    console.log(`  inserted ${Math.min(i + 2000, toAdd.length)}/${toAdd.length}`);
  }
}
const newList = [...newq.values()].sort((a, b) => b.count - a.count);
writeFileSync(`${dir}/review-queue.json`, JSON.stringify({ newPersons: newList, ambiguousMentions: amb }, null, 1));
console.log(`${DRY ? '[DRY] ' : ''}review queue: ${newList.length} new persons; top: ${newList.slice(0, 10).map(x => `${x.name}×${x.count}`).join(' | ')}`);
process.exit(0);
