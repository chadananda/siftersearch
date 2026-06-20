// Recovery apply — closes the gaps the first apply left, WITHOUT re-touching seqread-v1 links.
// Resolves three populations the mechanical apply missed:
//   (1) new-marked recs that are really existing distinctive names (Sa‘ídu'l-‘Ulamá', the Imáms, Malcolm…)
//   (2) unmatched distinctive-name labels (Bucket A) via unique name-core match
//   (3) unmatched SHARED role-titles via an explicit, context-resolved table (period/place verified by reading
//       + library) — the two Sháhs, two Grand Vazírs, the Iṣfahán Imám-Jum‘ih, etc., each to the RIGHT person.
// Collectives/deities/non-persons are NEVER bound. New rows tagged extractor_version='seqread-recover-v1'
// (reverse: DELETE FROM entity_mentions WHERE extractor_version='seqread-recover-v1'). DRY=1 previews.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, readdirSync } from 'fs';
const { queryAll, graphQueryAll, graphTransaction } = await import('../../api/lib/db.js');
const DRY = process.env.DRY === '1';
const dir = 'tmp/entity-research/seqread';
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const core = s => norm(s).replace(/^(the|that|this|an|a) /, '').replace(/ of [a-z‘’'-]+$/, '').trim();
const ROLE = ['imam-jum', "mu'tamid", 'vazir', 'grand vaz', 'shah', 'governor', 'kad-khuda', 'mujtahid', 'martyr',
  'prince', ' king', 'minister', 'mayor', 'ulama', 'divines', 'clergy', 'doctors', 'companions', 'disciples',
  'people of', 'inhabitants', 'siyyids', 'mullas', 'believers'];
const isRole = label => { const c = norm(label); return ROLE.some(t => c.includes(t)); };

// (3) context-resolved shared role-titles, keyed region||normLabel -> {id, conf}. Verified by reading passages.
const ROLE_BINDS = new Map(Object.entries({
  "9||grand vazir": { id: 1247946, conf: 'certain' },        // Mírzá Áqá Khán-i-Núrí (named para 1378, 1852)
  "4||grand vazir": { id: 1247567, conf: 'certain' },        // Ḥájí Mírzá Áqásí (named para 528, ~1847)
  "9||shah": { id: 1247566, conf: 'certain' },               // Náṣiri'd-Dín Sháh (wounded, 1852)
  "2||shah": { id: 1247565, conf: 'certain' },               // Muḥammad Sháh (Ḥusayn Khán dismissal, pre-1848)
  "2||mu'tamid": { id: 1247583, conf: 'certain' },           // Manúchihr Khán Mu‘tamidu'd-Dawlih (Iṣfahán)
  "2||imam-jum'ih": { id: 1247582, conf: 'certain' },        // Sulṭánu'l-‘Ulamá' (Imám-Jum‘ih of Iṣfahán)
  "9||mother of the shah": { id: 1247636, conf: 'probable' },// Mahd-i-‘Ulyá
  "4||governor of amul": { id: 1249896, conf: 'probable' },  // Mírzá Taqí, the governor of Ámul
}));

const persons = await queryAll("SELECT ge.id, er.canonical_name, er.aliases FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.entity_type='person' AND ge.religion='' WHERE er.entity_type='person'");
const geidSet = new Set(persons.map(p => p.id));
const canon2id = new Map(); const nameIdx = new Map();
for (const p of persons) {
  canon2id.set(norm(p.canonical_name), p.id);
  const add = n => { const k = norm(n); if (!k) return; if (!nameIdx.has(k)) nameIdx.set(k, new Set()); nameIdx.get(k).add(p.id); };
  add(p.canonical_name); try { for (const a of JSON.parse(p.aliases || '[]')) add(a); } catch {}
}
const uniqMatch = name => { const s = nameIdx.get(core(name)) || nameIdx.get(norm(name)); return s && s.size === 1 ? [...s][0] : null; };
const recToId = rec => (rec.canonical_name && canon2id.get(norm(rec.canonical_name))) || (geidSet.has(rec.entity_id) ? rec.entity_id : null);

const regions = [];
for (const f of readdirSync(dir).filter(f => /^region-\d+\.json$/.test(f)).sort()) {
  const meta = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  let map = []; try { map = JSON.parse(readFileSync(`${dir}/${f.replace('.json', '-map.json')}`, 'utf8')); } catch {}
  const lm = new Map();
  for (const rec of map) { lm.set(norm(rec.label), rec); for (const s of rec.surfaces || []) lm.set(norm(s), rec); }
  regions.push({ idx: meta.idx, range: meta.range, lm, map });
}
const regionFor = para => regions.find(R => para >= R.range[0] && para <= R.range[1]);
const boundName = new Map();
for (const R of regions) for (const rec of R.map) { if (rec.new) continue; const id = recToId(rec); if (!id) continue; for (const n of [rec.canonical_name, rec.label, ...(rec.surfaces || [])]) if (n) boundName.set(norm(n), id); }
const nameById = new Map(persons.map(p => [p.id, p.canonical_name]));
const nameCoreRecover = name => isRole(name) ? null : (uniqMatch(name) || boundName.get(norm(name)) || boundName.get(core(name)) || null);

const paraCid = new Map((await queryAll("SELECT paragraph_index, id FROM content WHERE doc_id=21308 AND deleted_at IS NULL")).map(r => [r.paragraph_index, String(r.id)]));
const mentions = JSON.parse(readFileSync(`${dir}/all-mentions.json`, 'utf8'));
const inserts = new Map(); const tally = { newrec: 0, bucketA: 0, role: 0, skip: 0 };
const roleHits = new Map();
for (const m of mentions) {
  const R = regionFor(m.para); if (!R) continue;
  if (!m.label || m.label === 'null') continue;
  const rec = R.lm.get(norm(m.label));
  let id = null, src = null;
  if (rec && rec.new) { id = nameCoreRecover(rec.canonical_name || m.label); if (id) src = 'newrec'; }
  else if (!rec) {
    const rb = ROLE_BINDS.get(`${R.idx}||${norm(m.label)}`);
    if (rb) { id = rb.id; src = 'role'; }
    else { id = nameCoreRecover(m.label); if (id) src = 'bucketA'; }
  }
  if (!id) { tally.skip++; continue; }
  tally[src]++;
  if (src === 'role') roleHits.set(`r${R.idx} "${m.label}" -> ${id} ${nameById.get(id) || ''}`, (roleHits.get(`r${R.idx} "${m.label}" -> ${id} ${nameById.get(id) || ''}`) || 0) + 1);
  const cid = paraCid.get(m.para); if (cid == null) continue;
  const key = id + '|' + cid;
  if (!inserts.has(key)) inserts.set(key, { entity_id: id, content_id: cid, role: m.type || null, conf: src === 'role' ? 0.9 : 0.85 });
}
const existing = new Set((await graphQueryAll("SELECT entity_id, content_id FROM entity_mentions")).map(r => r.entity_id + '|' + r.content_id));
const toAdd = [...inserts.values()].filter(x => !existing.has(x.entity_id + '|' + x.content_id));
console.log(`resolved mentions: newrec=${tally.newrec} bucketA=${tally.bucketA} role=${tally.role} skipped=${tally.skip}`);
console.log('role-title binds (mention counts):');
for (const [k, n] of [...roleHits.entries()].sort((a, b) => b[1] - a[1])) console.log(`  x${n}  ${k}`);
console.log(`unique (entity,para) recovered: ${inserts.size}; NEW rows after dedup vs ${existing.size} existing: ${toAdd.length}`);
if (!DRY && toAdd.length) {
  for (let i = 0; i < toAdd.length; i += 2000) {
    await graphTransaction(toAdd.slice(i, i + 2000).map(x => ({ sql: "INSERT INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','seqread-recover-v1')", args: [x.entity_id, x.content_id, x.role, x.conf] })));
    console.log(`  inserted ${Math.min(i + 2000, toAdd.length)}/${toAdd.length}`);
  }
}
console.log(`${DRY ? '[DRY] nothing written' : 'DONE — reverse with: DELETE FROM entity_mentions WHERE extractor_version=\'seqread-recover-v1\''}`);
process.exit(0);
