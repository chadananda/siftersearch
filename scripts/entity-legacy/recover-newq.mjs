// Step 1 of new-queue work: recover entries that are ALREADY existing entities (phrasing variants the apply's
// recovery missed) and bind their mentions — additive, reversible, NO new entities, NO merges of distinct people.
// Conservative: a queue mention recovers only if its canonical (or the name inside its parentheses, or the part
// before them) EXACTLY matches (normalized) the canonical/alias of exactly ONE seed entity. Fuzzy/transliteration
// variants (e.g. "Imam 'Ali ibn Abi Talib") are deliberately NOT matched here — they go to the Step-2 create-list
// review where dedup is judged explicitly. DRY by default; WRITE=1 applies (tag seqread-v1).
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, readdirSync } from 'fs';
const { queryAll, graphQueryAll, graphTransaction } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const dir = 'tmp/entity-research/seqread';
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const core = s => norm(s).replace(/^(the|that|this|an|a) /, '').replace(/ of [a-z‘’'-]+$/, '').trim();
const ROLE = ['imam-jum', "mu'tamid", 'vazir', 'grand vaz', 'shah', 'governor', 'kad-khuda', 'mujtahid', 'martyr', 'prince', ' king', 'minister', 'mayor', 'ulama', 'companions', 'disciples', 'people of', 'siyyids', 'mullas', 'believers'];
const isRole = l => { const c = norm(l); return ROLE.some(t => c.includes(t)); };

const persons = await queryAll("SELECT ge.id, er.canonical_name, er.aliases FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.entity_type='person' AND ge.religion='' WHERE er.entity_type='person'");
const geidSet = new Set(persons.map(p => p.id));
const canon2id = new Map(); const nameIdx = new Map();
for (const p of persons) { canon2id.set(norm(p.canonical_name), p.id); const add = n => { const k = norm(n); if (!k) return; if (!nameIdx.has(k)) nameIdx.set(k, new Set()); nameIdx.get(k).add(p.id); }; add(p.canonical_name); try { for (const a of JSON.parse(p.aliases || '[]')) add(a); } catch {} }
const nameById = new Map(persons.map(p => [p.id, p.canonical_name]));
const recToId = rec => (rec.canonical_name && canon2id.get(norm(rec.canonical_name))) || (geidSet.has(rec.entity_id) ? rec.entity_id : null);
const uniqExact = s => { const x = nameIdx.get(norm(s)); return x && x.size === 1 ? [...x][0] : null; };
// EXACT match only (full / pre-paren / inside-paren); never a role-title; returns a unique existing id or null
function existingMatch(name) {
  const cands = [name];
  const m = String(name).match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) { cands.push(m[1], m[2]); }
  for (const c of cands) { if (!c || isRole(c)) continue; const id = uniqExact(c); if (id) return id; }
  return null;
}

const regions = [];
for (const f of readdirSync(dir).filter(f => /^region-\d+\.json$/.test(f)).sort()) {
  const meta = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  let map = []; try { map = JSON.parse(readFileSync(`${dir}/${f.replace('.json', '-map.json')}`, 'utf8')); } catch {}
  const lm = new Map(); for (const rec of map) { lm.set(norm(rec.label), rec); for (const s of rec.surfaces || []) lm.set(norm(s), rec); }
  regions.push({ range: meta.range, lm });
}
const regionFor = para => regions.find(R => para >= R.range[0] && para <= R.range[1]);
const boundName = new Map();
for (const R of regions) for (const rec of R.lm.values()) { if (rec.new) continue; const id = recToId(rec); if (!id) continue; for (const n of [rec.canonical_name, rec.label, ...(rec.surfaces || [])]) if (n) boundName.set(norm(n), id); }
const nameCoreRecover = name => isRole(name) ? null : (((nameIdx.get(core(name)) || nameIdx.get(norm(name)))?.size === 1) ? [...(nameIdx.get(core(name)) || nameIdx.get(norm(name)))][0] : (boundName.get(norm(name)) || boundName.get(core(name)) || null));

// Only DISTINCTIVE, hand-verified targets are auto-bound; common-given-name matches are HELD for per-entity
// verification (they false-merge: "Mullá Ḥusayn slain 1852" ≠ THE Mullá Ḥusayn; two "Mírzá ‘Alí" ≠ one man).
const SAFE = new Set([1247657, 1247712, 1247636, 1247616, 1249272, 1248214, 1247586, 1249846, 1250114, 1247643,
  1247569, 1247602, 1247640, 1247579, 1247637]);   // +5 library/knowledge-verified this round
const DENY = n => norm(n).includes('held quddus');  // "the Farrás̱h-Bás̱hí who held Quddús" ≠ Ḥájibu'd-Dawlih (1247640)
const paraCid = new Map((await queryAll("SELECT paragraph_index, id FROM content WHERE doc_id=21308 AND deleted_at IS NULL")).map(r => [r.paragraph_index, String(r.id)]));
const mentions = JSON.parse(readFileSync(`${dir}/all-mentions.json`, 'utf8'));
const inserts = new Map(); const recovered = new Map(); const held = new Map();
for (const m of mentions) {
  const R = regionFor(m.para); if (!R || !m.label || m.label === 'null') continue;
  const rec = R.lm.get(norm(m.label)); if (!rec || !rec.new) continue;          // only NEW-bucket mentions
  const nm = rec.canonical_name || m.label;
  if (nameCoreRecover(nm)) continue;                                            // already handled by apply
  const id = existingMatch(nm); if (!id) continue;                              // unique exact existing match
  if (!SAFE.has(id)) { held.set(nm, { id, name: nameById.get(id), n: (held.get(nm)?.n || 0) + 1 }); continue; }
  const cid = paraCid.get(m.para); if (cid == null) continue;
  inserts.set(id + '|' + cid, { entity_id: id, content_id: cid, role: m.type || null });
  recovered.set(nm, { id, name: nameById.get(id), n: (recovered.get(nm)?.n || 0) + 1 });
}
const existing = new Set((await graphQueryAll("SELECT entity_id, content_id FROM entity_mentions")).map(r => r.entity_id + '|' + r.content_id));
const toAdd = [...inserts.values()].filter(x => !existing.has(x.entity_id + '|' + x.content_id));
console.log(`SAFE recoveries (distinctive, verified): ${recovered.size}`);
for (const [qn, r] of [...recovered.entries()].sort((a, b) => b[1].n - a[1].n)) console.log(`  "${qn}"  ->  ${r.id} ${r.name}  (${r.n} mentions)`);
console.log(`\nHELD for verification (common-name matches — NOT bound): ${held.size}`);
for (const [qn, r] of [...held.entries()].sort((a, b) => b[1].n - a[1].n)) console.log(`  "${qn}"  -?-> ${r.id} ${r.name}  (${r.n})`);
console.log(`\nNEW rows to add (after dedup vs ${existing.size}): ${toAdd.length}`);
if (WRITE && toAdd.length) {
  for (let i = 0; i < toAdd.length; i += 2000) await graphTransaction(toAdd.slice(i, i + 2000).map(x => ({ sql: "INSERT INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','seqread-v1')", args: [x.entity_id, x.content_id, x.role, 0.9] })));
  console.log(`WROTE ${toAdd.length} rows`);
} else console.log('[DRY] nothing written');
process.exit(0);
