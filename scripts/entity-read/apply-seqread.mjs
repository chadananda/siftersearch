// Apply seqread reconciliation (evidence-first maps). Resolves every mention through the per-region maps to a
// graph_entities id, attaches entity_mentions (tagged extractor_version='seqread-v1' — fully reversible).
//
// Resolution order, per mention (the hardening that closes the gaps the first pass left):
//   - rec bound (not new)          -> recToId, with canonical/alias recovery fallback.
//   - rec marked NEW               -> nameCoreRecover: a distinctive name whose core (minus leading article +
//                                     trailing "of <place>") uniquely matches an existing seed entity is
//                                     RECOVERED, not re-created (kills the ~100 false "new person" candidates,
//                                     e.g. "the Sa‘ídu'l-‘Ulamá' of Bárfurúsh" -> Sa‘ídu'l-‘Ulamá').
//   - unmatched label (not in map):
//       * SHARED role-title (isRole: "the Sháh", "Grand Vazír", "Imám-Jum‘ih", "the martyr"…) -> resolve ONLY
//         via role-binds-<doc>.json (context-resolved per region/period; the two Sháhs and two Grand Vazírs
//         stay distinct). NEVER string-bound. No entry -> role-queue.json for context resolution. Collectives
//         ("the disciples", "God", "the ‘ulamás") -> non-entity, never bound.
//       * distinctive name -> nameCoreRecover (Bucket A).
// Never creates entities or merges — genuinely-new + ambiguous go to review-queue.json. DRY=1 previews.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, readdirSync, writeFileSync } from 'fs';
const { queryAll, graphQueryAll, graphTransaction } = await import('../../api/lib/db.js');
const DRY = process.env.DRY === '1';
const DOC = 21308;
const dir = 'tmp/entity-research/seqread';
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const core = s => norm(s).replace(/^(the|that|this|an|a) /, '').replace(/ of [a-z‘’'-]+$/, '').trim();
// SHARED role/title/epithet tokens — labels containing these name MANY people; resolve only by context.
const ROLE = ['imam-jum', "mu'tamid", 'vazir', 'grand vaz', 'shah', 'governor', 'kad-khuda', 'mujtahid', 'martyr',
  'prince', ' king', 'minister', 'mayor', 'ulama', 'divines', 'clergy', 'doctors', 'companions', 'disciples',
  'people of', 'inhabitants', 'siyyids', 'mullas', 'believers'];
const isRole = label => { const c = norm(label); return ROLE.some(t => c.includes(t)); };
const COLLECTIVE = ['god', 'disciples', 'companions', 'people of', 'inhabitants', 'believers', 'officials',
  'notables', 'assailants', 'mullas', 'siyyids', 'doctors', 'clergy', 'ulama', 'the learned', 'attendants',
  ' and ', 'holy martyrs', 'both ', 'leading ', 'recognised ', 'audience', 'masses', 'crowd', 'army', 'troops',
  'guards', 'villagers', 'townspeople', 'adversaries', 'masjid', 'mosque', 'forces', 'the truth', 'the bible'];
const isCollective = label => COLLECTIVE.some(t => norm(label).includes(t));

// context-resolved role-title binds for this doc: "regionIdx||normLabel" -> entity_id
let ROLE_BINDS = new Map();
try { ROLE_BINDS = new Map(Object.entries(JSON.parse(readFileSync(`scripts/entity-read/role-binds-${DOC}.json`, 'utf8'))).filter(([k]) => !k.startsWith('_'))); } catch {}

// DB: canonical_name -> ge.id (authoritative), name/alias -> ids (for unique-match recovery), and valid ge.id set
const persons = await queryAll("SELECT ge.id, er.canonical_name, er.aliases FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.entity_type='person' AND ge.religion='' WHERE er.entity_type='person'");
const geidSet = new Set(persons.map(p => p.id));
const canon2id = new Map(); const nameIdx = new Map();
for (const p of persons) {
  canon2id.set(norm(p.canonical_name), p.id);
  const add = n => { const k = norm(n); if (!k) return; if (!nameIdx.has(k)) nameIdx.set(k, new Set()); nameIdx.get(k).add(p.id); };
  add(p.canonical_name); try { for (const a of JSON.parse(p.aliases || '[]')) add(a); } catch {}
}
const uniqId = name => { const s = nameIdx.get(norm(name)); return s && s.size === 1 ? [...s][0] : null; };
const uniqCore = name => { const s = nameIdx.get(core(name)) || nameIdx.get(norm(name)); return s && s.size === 1 ? [...s][0] : null; };
const recToId = rec => (rec.canonical_name && canon2id.get(norm(rec.canonical_name))) || (geidSet.has(rec.entity_id) ? rec.entity_id : null);

// regions + maps
const regions = [];
for (const f of readdirSync(dir).filter(f => /^region-\d+\.json$/.test(f)).sort()) {
  const meta = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  let map = []; try { map = JSON.parse(readFileSync(`${dir}/${f.replace('.json', '-map.json')}`, 'utf8')); } catch {}
  const lm = new Map();
  for (const rec of map) { lm.set(norm(rec.label), rec); for (const s of rec.surfaces || []) lm.set(norm(s), rec); }
  regions.push({ idx: meta.idx, range: meta.range, lm, map });
}
const regionFor = para => regions.find(R => para >= R.range[0] && para <= R.range[1]);

// cross-region bound-name map: a name bound (non-new) in ANY region -> ge.id
const boundName = new Map();
const nonEntityName = new Set();   // a label marked non-entity in ANY region (collectives/roles) -> propagate
for (const R of regions) for (const rec of R.map) {
  if (rec.confidence === 'non-entity') for (const n of [rec.canonical_name, rec.label, ...(rec.surfaces || [])]) if (n) nonEntityName.add(norm(n));
  if (rec.new) continue;
  const id = recToId(rec); if (!id) continue;
  for (const n of [rec.canonical_name, rec.label, ...(rec.surfaces || [])]) if (n) boundName.set(norm(n), id);
}
// recover a distinctive name (NEVER a shared role-title) to an existing entity by unique name-core match
const nameCoreRecover = name => isRole(name) ? null : (uniqCore(name) || boundName.get(norm(name)) || boundName.get(core(name)) || null);

const paraCid = new Map((await queryAll(`SELECT paragraph_index, id FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL`)).map(r => [r.paragraph_index, String(r.id)]));
const mentions = JSON.parse(readFileSync(`${dir}/all-mentions.json`, 'utf8'));
const conf = { certain: 1.0, probable: 0.7 };
const inserts = new Map(); const newq = new Map(); const roleQueue = new Map();
let amb = 0, non = 0, unmatched = 0, recovered = 0, roleBound = 0, nocid = 0;
for (const m of mentions) {
  const R = regionFor(m.para); if (!R) { unmatched++; continue; }
  if (!m.label || m.label === 'null') { unmatched++; continue; }
  const rec = R.lm.get(norm(m.label));
  let id = null, c = rec ? (conf[rec.confidence] ?? 0.8) : 0.8;
  if (rec && !rec.new) {
    id = recToId(rec) || boundName.get(norm(rec.canonical_name || m.label)) || uniqId(rec.canonical_name || m.label) || uniqId(m.label);
    if (id && id !== recToId(rec)) recovered++;
  } else if (rec && rec.new) {
    id = nameCoreRecover(rec.canonical_name || m.label); if (id) recovered++;
  } else { // unmatched: label is not a key in the region map
    if (isRole(m.label)) {
      id = ROLE_BINDS.get(`${R.idx}||${norm(m.label)}`) || null;
      if (id) { roleBound++; c = 0.9; }
      else {
        if (isCollective(m.label) || nonEntityName.has(norm(m.label))) { non++; continue; }
        const k = `${R.idx}||${m.label}`; roleQueue.set(k, (roleQueue.get(k) || 0) + 1); unmatched++; continue;  // needs context resolution
      }
    } else {
      id = nameCoreRecover(m.label); if (id) recovered++;
    }
  }
  if (id) {
    const cid = paraCid.get(m.para); if (cid == null) { nocid++; continue; }
    const key = id + '|' + cid;
    if (!inserts.has(key)) inserts.set(key, { entity_id: id, content_id: cid, role: m.type || null, conf: c });
    continue;
  }
  // unresolved → classify
  if (rec && (rec.confidence === 'non-entity') || isCollective(m.label) || nonEntityName.has(norm(m.label)) || nonEntityName.has(norm((rec && rec.canonical_name) || ''))) { non++; continue; }
  if (rec && rec.confidence === 'ambiguous') { amb++; continue; }
  const nm = (rec && rec.canonical_name) || m.label; const k = norm(nm);
  if (!newq.has(k)) newq.set(k, { name: nm, count: 0 }); newq.get(k).count++;
}
const existing = new Set((await graphQueryAll("SELECT entity_id, content_id FROM entity_mentions")).map(r => r.entity_id + '|' + r.content_id));
const toAdd = [...inserts.values()].filter(x => !existing.has(x.entity_id + '|' + x.content_id));
console.log(`mentions=${mentions.length} resolved-unique=${inserts.size} recovered=${recovered} role-bound=${roleBound} new-persons=${newq.size} ambiguous=${amb} non-entity=${non} unmatched=${unmatched} nocid=${nocid}`);
console.log(`NEW entity_mention rows to add (after dedup vs ${existing.size} existing): ${toAdd.length}`);
if (!DRY && toAdd.length) {
  for (let i = 0; i < toAdd.length; i += 2000) {
    await graphTransaction(toAdd.slice(i, i + 2000).map(x => ({ sql: "INSERT INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','seqread-v1')", args: [x.entity_id, x.content_id, x.role, x.conf] })));
    console.log(`  inserted ${Math.min(i + 2000, toAdd.length)}/${toAdd.length}`);
  }
}
const newList = [...newq.values()].sort((a, b) => b.count - a.count);
const roleList = [...roleQueue.entries()].map(([k, n]) => ({ key: k, count: n })).sort((a, b) => b.count - a.count);
writeFileSync(`${dir}/review-queue.json`, JSON.stringify({ newPersons: newList, ambiguousMentions: amb }, null, 1));
writeFileSync(`${dir}/role-queue.json`, JSON.stringify(roleList, null, 1));
console.log(`${DRY ? '[DRY] ' : ''}genuine-new persons: ${newList.length}; top: ${newList.slice(0, 12).map(x => `${x.name}×${x.count}`).join(' | ')}`);
console.log(`role-titles still needing context resolution (role-queue.json): ${roleList.length}; top: ${roleList.slice(0, 8).map(x => `${x.key}×${x.count}`).join(' | ')}`);
process.exit(0);
