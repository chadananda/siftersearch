// Completeness gate (read-only measurement). For each entity it separates the two recall failures:
//   BOUND            = paragraphs currently in the entity index
//   reader-but-unbound = the reader emitted a mention for this entity (via its surface inventory) at a paragraph
//                        that is NOT bound  -> BINDING leak (the string re-join dropped it)
//   text-but-unread  = a DISTINCTIVE name form of the entity appears in a paragraph the reader emitted NO mention
//                        for  -> READER recall miss (extraction never saw it)
// This tells us whether to fix the join or the read. No writes.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, readdirSync } from 'fs';
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const DOC = 21308;
const ENTITIES = (process.argv[2] || '1249227,1250146,1249228,1249845,1247571').split(',').map(Number);
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const distinctive = f => { const n = norm(f); return n.includes('-i-') || /\b(khan|ḵhan|big|pasha|bagum|khanum|sultan|mirza .+ .+)\b/.test(n) || n.split(' ').length >= 3 || n.length >= 14; };

// seed: id -> {canonical, aliases[]}
const persons = await queryAll("SELECT ge.id, er.canonical_name, er.aliases FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.entity_type='person' AND ge.religion='' WHERE er.entity_type='person'");
const seed = new Map(persons.map(p => { let a = []; try { a = JSON.parse(p.aliases || '[]'); } catch {} return [p.id, { canon: p.canonical_name, forms: [p.canonical_name, ...a] }]; }));
const canon2id = new Map(persons.map(p => [norm(p.canonical_name), p.id]));
const geidSet = new Set(persons.map(p => p.id));
const recToId = rec => (rec.canonical_name && canon2id.get(norm(rec.canonical_name))) || (geidSet.has(rec.entity_id) ? rec.entity_id : null);

// regions: build (region, normSurface) -> entityId  from the reconciler maps (the surface inventory)
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
const mentions = JSON.parse(readFileSync(`${dir}/all-mentions.json`, 'utf8'));
// reader mention -> entity (via surface inventory, region-scoped); also paras that have ANY reader mention
const readerByEntity = new Map(); const parasWithAnyMention = new Set();
for (const m of mentions) { if (!m.label || m.label === 'null') continue; parasWithAnyMention.add(m.para); const R = regionFor(m.para); if (!R) continue; const id = R.surf.get(norm(m.label)); if (!id) continue; if (!readerByEntity.has(id)) readerByEntity.set(id, new Set()); readerByEntity.get(id).add(m.para); }

const texts = (await queryAll(`SELECT paragraph_index, text FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL`)).map(r => ({ p: r.paragraph_index, t: norm(r.text) }));
const cmap = new Map((await queryAll(`SELECT id,paragraph_index FROM content WHERE doc_id=${DOC}`)).map(r => [String(r.id), r.paragraph_index]));

for (const id of ENTITIES) {
  const info = seed.get(id); if (!info) { console.log(`\n${id}: NOT a person entity`); continue; }
  const bound = new Set((await graphQueryAll('SELECT content_id FROM entity_mentions WHERE entity_id=?', [id])).map(r => cmap.get(String(r.content_id))).filter(x => x != null));
  const reader = readerByEntity.get(id) || new Set();
  const distForms = [...new Set(info.forms.filter(distinctive).map(norm))];
  const textHits = new Set(); for (const para of texts) for (const f of distForms) if (f && para.t.includes(f)) { textHits.add(para.p); break; }
  const bindingLeak = [...reader].filter(p => !bound.has(p)).sort((a, b) => a - b);
  const readerMiss = [...textHits].filter(p => !bound.has(p) && !reader.has(p) && !parasWithAnyMention.has(p)).sort((a, b) => a - b);
  const textUnboundButRead = [...textHits].filter(p => !bound.has(p) && parasWithAnyMention.has(p)).sort((a, b) => a - b);
  console.log(`\n=== ${id} ${info.canon} ===`);
  console.log(`  BOUND (${bound.size}): [${[...bound].sort((a, b) => a - b).join(',')}]`);
  console.log(`  distinctive forms: ${distForms.join(' | ') || '(none — only generic name; text-recall skipped)'}`);
  console.log(`  BINDING leak — reader saw it, not bound (${bindingLeak.length}): [${bindingLeak.join(',')}]`);
  console.log(`  text names it, a mention exists elsewhere in para, not bound (${textUnboundButRead.length}): [${textUnboundButRead.join(',')}]`);
  console.log(`  READER miss — distinctive name in text, no mention at all (${readerMiss.length}): [${readerMiss.join(',')}]`);
}
process.exit(0);
