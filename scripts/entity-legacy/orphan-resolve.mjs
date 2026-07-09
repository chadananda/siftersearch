// Orphan-resolution pass. Orphans = reader mentions whose surface is in NO entity's reconciler inventory
// (the ~4,000 dropped references). SAFE auto-bind only: a surface that is DISTINCTIVE (nisba / rank / "of X")
// and uniquely matches one existing seed entity (by exact-norm or name-core). Generic given names (the five
// "‘Alí Khán"s) and roles/collectives are NEVER auto-bound — they go to the held list for the namesake pass.
// Reversible (tag seqread-v1). DRY=1 previews.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, readdirSync } from 'fs';
const { queryAll, graphQueryAll, graphTransaction } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const DOC = 21308;
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const core = s => norm(s).replace(/^(the|that|this|an|a) /, '').replace(/-i-[a-z‘’'-]+$/, '').replace(/ of [a-z‘’'-]+$/, '').trim();
const ROLE_COLL = ['imam-jum', "mu'tamid", 'vazir', 'shah', 'governor', 'kad-khuda', 'mujtahid', 'martyr', 'prince', ' king', 'minister', 'ulama', 'divines', 'clergy', 'doctors', 'companions', 'disciples', 'people of', 'inhabitants', 'siyyids', 'mullas', 'believers', 'god', 'multitude', 'crowd', 'army', 'troops', 'guards', 'officials', 'notables', 'assailants', 'heirs', 'and ', 'colleague', 'wife of', 'son of', 'brother of', 'mother of', 'father of', 'daughter of'];
const distinctive = s => { const n = norm(s); return (n.includes('-i-') || / of [a-z]/.test(n) || /\b(khan|ḵhan|big|pasha|bagum|khanum|sultan|effendi)\b/.test(n)); };
const ok = s => distinctive(s) && !ROLE_COLL.some(t => norm(s).includes(t));

const persons = await queryAll("SELECT ge.id, er.canonical_name, er.aliases FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.entity_type='person' AND ge.religion='' WHERE er.entity_type='person'");
const nameById = new Map(persons.map(p => [p.id, p.canonical_name]));
const canon2id = new Map(persons.map(p => [norm(p.canonical_name), p.id]));
const geidSet = new Set(persons.map(p => p.id));
const nameIdx = new Map(); const coreIdx = new Map();
for (const p of persons) { const add = (idx, k) => { k = k.trim(); if (!k) return; if (!idx.has(k)) idx.set(k, new Set()); idx.get(k).add(p.id); }; const forms = [p.canonical_name]; try { forms.push(...JSON.parse(p.aliases || '[]')); } catch {} for (const f of forms) { add(nameIdx, norm(f)); add(coreIdx, core(f)); } }
const recToId = rec => (rec.canonical_name && canon2id.get(norm(rec.canonical_name))) || (geidSet.has(rec.entity_id) ? rec.entity_id : null);
const uniqMatch = s => { for (const idx of [nameIdx, coreIdx]) { const set = idx.get(norm(s)) || idx.get(core(s)); if (set && set.size === 1) return [...set][0]; } return null; };

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
const cmap = new Map((await queryAll(`SELECT paragraph_index, id FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL`)).map(r => [r.paragraph_index, String(r.id)]));
const mentions = JSON.parse(readFileSync(`${dir}/all-mentions.json`, 'utf8'));

const recovered = new Map(); const held = new Map(); const inserts = new Map();
for (const m of mentions) {
  if (!m.label || m.label === 'null') continue;
  const R = regionFor(m.para); if (!R) continue;
  if (R.surf.has(norm(m.label))) continue;            // not an orphan — already in inventory
  if (!ok(m.label)) continue;                          // generic/role/collective — skip (namesake pass handles)
  const id = uniqMatch(m.label);
  if (!id) { const k = m.label; held.set(k, (held.get(k) || 0) + 1); continue; }
  const cid = cmap.get(m.para); if (!cid) continue;
  inserts.set(id + '|' + cid, { id, cid });
  const key = `${m.label} -> ${id} ${nameById.get(id)}`; recovered.set(key, (recovered.get(key) || 0) + 1);
}
const existing = new Set((await graphQueryAll('SELECT entity_id, content_id FROM entity_mentions')).map(r => r.entity_id + '|' + r.content_id));
const toAdd = [...inserts.values()].filter(x => !existing.has(x.id + '|' + x.cid));
console.log(`SAFE orphan recoveries: ${recovered.size} distinct (surface->entity), ${toAdd.length} new links after dedup`);
for (const [k, n] of [...recovered.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ×${n}  ${k}`);
console.log(`\nHELD (distinctive but ambiguous — namesake pass): ${held.size} surfaces`);
for (const [k, n] of [...held.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ×${n}  ${k}`);
if (WRITE && toAdd.length) { for (let i = 0; i < toAdd.length; i += 2000) await graphTransaction(toAdd.slice(i, i + 2000).map(x => ({ sql: "INSERT INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','seqread-v1')", args: [x.id, x.cid, 'mention', 0.85] }))); console.log(`\nWROTE ${toAdd.length} links`); }
else console.log('\n[DRY] nothing written');
process.exit(0);
