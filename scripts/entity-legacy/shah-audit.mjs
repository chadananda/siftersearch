// Audit region-0 (the intro, paras 1-213) "Sháh"/monarch references. The intro is a century-spanning survey
// referring to ALL the Qájár shahs, so a blanket bind to Náṣiri'd-Dín is wrong — each needs period context.
// Lists: Qájár-shah seed entities, region-0 shah-ish mentions (label->paras), current binds, and para text.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, readdirSync } from 'fs';
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const dir = 'tmp/entity-research/seqread';
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const persons = await queryAll("SELECT ge.id, er.canonical_name, er.aliases FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.entity_type='person' AND ge.religion='' WHERE er.entity_type='person'");
const nameById = new Map(persons.map(p => [p.id, p.canonical_name]));
console.log('=== Qájár-shah seed entities ===');
for (const p of persons) { const b = norm(p.canonical_name + ' ' + (() => { try { return JSON.parse(p.aliases || '[]').join(' '); } catch { return ''; } })()); if (/shah|fath-ali|aqa muhammad|qajar|muzaffar/.test(b) && /shah|khan|qajar/.test(b)) console.log(`  ${p.id} ${p.canonical_name}`); }

const mentions = JSON.parse(readFileSync(`${dir}/all-mentions.json`, 'utf8'));
const SH = ['shah', 'sovereign', 'monarch', 'king', 'qajar', 'fath-ali', 'crown'];
const groups = new Map();
for (const m of mentions) { if (m.para > 213) continue; const c = norm(m.label); if (!SH.some(t => c.includes(t))) continue; const k = m.label; if (!groups.has(k)) groups.set(k, new Set()); groups.get(k).add(m.para); }
console.log('\n=== region-0 shah-ish mentions (label -> paras) ===');
for (const [k, ps] of [...groups.entries()].sort()) console.log(`  "${k}"  [${[...ps].sort((a, b) => a - b).join(',')}]`);

const cmap = new Map((await queryAll('SELECT id,paragraph_index FROM content WHERE doc_id=21308 AND deleted_at IS NULL AND paragraph_index<=213')).map(r => [String(r.id), r.paragraph_index]));
console.log('\n=== current seqread-v1 shah binds in region 0 ===');
for (const id of [1247565, 1247566]) {
  const rows = await graphQueryAll("SELECT content_id FROM entity_mentions WHERE entity_id=? AND extractor_version='seqread-v1'", [id]);
  const paras = rows.map(r => cmap.get(String(r.content_id))).filter(p => p != null).sort((a, b) => a - b);
  console.log(`  ${id} ${nameById.get(id)}: [${paras.join(',')}]`);
}
const allParas = [...new Set([...groups.values()].flatMap(s => [...s]))].sort((a, b) => a - b);
const rows = await queryAll(`SELECT paragraph_index,text FROM content WHERE doc_id=21308 AND paragraph_index IN (${allParas.join(',')}) ORDER BY paragraph_index`);
console.log('\n=== region-0 shah-mention para text ===');
for (const r of rows) console.log(`\n[${r.paragraph_index}] ${r.text.replace(/\s+/g, ' ').slice(0, 300)}`);
process.exit(0);
