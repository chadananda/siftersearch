// Recovery preview for the seqread apply. Splits unbound/unmatched references into:
//   BUCKET A (safe): distinctive-name variants whose stripped core UNIQUELY matches one existing seed
//     entity (e.g. "the Sa‘ídu'l-‘Ulamá' of Bárfurúsh" -> Sa‘ídu'l-‘Ulamá' 1247606). Auto-bindable.
//   BUCKET B (context-required): SHARED role/title/epithet labels ("the Imám-Jum‘ih", "the martyr",
//     "the Sháh", "the Grand Vazír", "Mu‘tamid", "governor"…) that name DIFFERENT people by period/
//     place/scene. NEVER bound by string — emitted as a per-occurrence worklist (region range + paras)
//     for evidence-first reading. Splits where one label spans several people.
// DRY preview only — writes recover-preview.json, inserts nothing.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, readdirSync, writeFileSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const dir = 'tmp/entity-research/seqread';
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
// strip leading articles + trailing " of <place>" qualifier to expose the distinctive name core
const core = s => norm(s).replace(/^(the|that|this|an|a) /, '').replace(/ of [a-z‘’'-]+$/, '').trim();
// shared role/title tokens — labels containing these refer to MANY people; resolve by context, never by string
const ROLE = ['imam-jum', "mu'tamid", 'mutamid', 'vazir', 'grand vaz', 'shah', 'governor', 'kad-khuda',
  'mujtahid', 'martyr', 'prince', ' king', 'minister', 'mayor', 'ulama', 'divines', 'clergy', 'doctors',
  'companions', 'disciples', 'people of', 'inhabitants', 'siyyids', 'mullas', 'believers'];
const isRole = label => { const c = norm(label); return ROLE.some(t => c.includes(t)); };

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
  const castDesc = new Map((meta.cast || []).map(c => [norm(c.label), c.description]));
  regions.push({ idx: meta.idx, range: meta.range, lm, map, castLabels: (meta.cast || []).map(c => c.label), castDesc });
}
const regionFor = para => regions.find(R => para >= R.range[0] && para <= R.range[1]);
const boundName = new Map();
for (const R of regions) for (const rec of R.map) { if (rec.new) continue; const id = recToId(rec); if (!id) continue; for (const n of [rec.canonical_name, rec.label, ...(rec.surfaces || [])]) if (n) boundName.set(norm(n), id); }

const mentions = JSON.parse(readFileSync(`${dir}/all-mentions.json`, 'utf8'));
// group unmatched (label not a key in its region map) mentions by region+label, with paras
const unmatchedGroups = new Map();
for (const m of mentions) {
  const R = regionFor(m.para); if (!R) continue;
  if (R.lm.has(norm(m.label))) continue;
  if (!m.label || m.label === 'null') continue;
  const k = R.idx + '||' + m.label;
  if (!unmatchedGroups.has(k)) unmatchedGroups.set(k, { region: R.idx, range: R.range, label: m.label, paras: new Set(), desc: R.castDesc.get(norm(m.label)) || null });
  unmatchedGroups.get(k).paras.add(m.para);
}

const A = [], B = [];
for (const g of unmatchedGroups.values()) {
  const entry = { region: g.region, range: g.range, label: g.label, count: g.paras.size, paras: [...g.paras].sort((x, y) => x - y).slice(0, 30), desc: g.desc };
  if (isRole(g.label)) { B.push(entry); continue; }
  const id = uniqMatch(g.label) || boundName.get(norm(g.label)) || boundName.get(core(g.label));
  if (id) A.push({ ...entry, bindTo: id });
  else B.push({ ...entry, note: 'no-unique-name-match → read context or genuine-new' });
}
// also: region recs marked new that are really existing distinctive names (Sa‘ídu'l-‘Ulamá' case)
const newRecs = [];
for (const R of regions) for (const rec of R.map) {
  if (!rec.new) continue;
  const name = rec.canonical_name || rec.label;
  if (isRole(name)) { newRecs.push({ region: R.idx, name, kind: 'role-marked-new → context', surfaces: rec.surfaces }); continue; }
  const id = uniqMatch(name) || boundName.get(norm(name)) || boundName.get(core(name));
  newRecs.push({ region: R.idx, name, surfaces: rec.surfaces, recover: id || null });
}
A.sort((a, b) => b.count - a.count); B.sort((a, b) => b.count - a.count);
const idName = new Map(persons.map(p => [p.id, p.canonical_name]));
console.log(`BUCKET A — safe name-core binds (${A.length} labels, ${A.reduce((s, x) => s + x.count, 0)} mentions):`);
for (const x of A.slice(0, 25)) console.log(`  r${x.region} x${x.count}  "${x.label}"  ->  ${x.bindTo} ${idName.get(x.bindTo) || '?'}`);
console.log(`\nBUCKET B — role/title labels needing CONTEXT resolution (${B.length} labels, ${B.reduce((s, x) => s + x.count, 0)} mentions):`);
for (const x of B.slice(0, 30)) console.log(`  r${x.region} [${x.range[0]}-${x.range[1]}] x${x.count}  "${x.label}"${x.desc ? '  — ' + x.desc.slice(0, 70) : ''}`);
const recoverable = newRecs.filter(r => r.recover);
console.log(`\nNEW-marked recs that recover to existing distinctive names (${recoverable.length}):`);
for (const r of recoverable.slice(0, 20)) console.log(`  r${r.region}  "${r.name}"  ->  ${r.recover} ${idName.get(r.recover) || '?'}`);
writeFileSync(`${dir}/recover-preview.json`, JSON.stringify({ bucketA: A, bucketB: B, newRecs }, null, 1));
console.log(`\nwrote recover-preview.json`);
process.exit(0);
