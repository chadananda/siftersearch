// Evidence-gather for the ‘Abdu'l-Vahháb question (common name → verify, never assume).
// Shows: every seqread rec whose name mentions Vahháb (region, label, canonical, new, paras), the seed
// entities named ‘Abdu'l-Vahháb, and the Dawn-Breakers text where the "(son of Ḥájí ‘Abdu'l-Majíd)" rec speaks.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, readdirSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const dir = 'tmp/entity-research/seqread';
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const has = s => norm(s).includes('vahhab') || norm(s).includes('vahvab') || norm(s).includes('majid');

console.log('=== seed entities named ‘Abdu’l-Vahháb / Ḥájí ‘Abdu’l-Majíd ===');
for (const p of await queryAll("SELECT ge.id, er.canonical_name, er.aliases, er.summary FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.religion='' WHERE er.entity_type='person'"))
  if (has(p.canonical_name) || has(p.aliases || '')) console.log(`  ${p.id} ${p.canonical_name}  | aliases:${p.aliases || '[]'}\n     summary: ${(p.summary || '').slice(0, 160)}`);

console.log('\n=== seqread recs mentioning Vahháb/Majíd (region · label · canonical · new · entity_id) ===');
const regions = [];
const labelParas = new Map();
for (const f of readdirSync(dir).filter(f => /^region-\d+\.json$/.test(f)).sort()) {
  const meta = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  let map = []; try { map = JSON.parse(readFileSync(`${dir}/${f.replace('.json', '-map.json')}`, 'utf8')); } catch {}
  for (const rec of map) if (has(rec.canonical_name) || has(rec.label) || (rec.surfaces || []).some(has)) {
    console.log(`  r${meta.idx} · "${rec.label}" · canon="${rec.canonical_name}" · new=${rec.new} · id=${rec.entity_id} · surfaces=${JSON.stringify(rec.surfaces || [])}`);
    for (const n of [rec.label, ...(rec.surfaces || [])]) labelParas.set(norm(n), rec.label);
  }
}
const mentions = JSON.parse(readFileSync(`${dir}/all-mentions.json`, 'utf8'));
const paras = [...new Set(mentions.filter(m => has(m.label)).map(m => m.para))].sort((a, b) => a - b);
console.log(`\n=== paras where a Vahháb/Majíd label is used: [${paras.join(',')}] ===`);
if (paras.length) {
  const rows = await queryAll(`SELECT paragraph_index,text FROM content WHERE doc_id=21308 AND paragraph_index IN (${paras.join(',')}) ORDER BY paragraph_index`);
  for (const r of rows) console.log(`\n[${r.paragraph_index}] ${r.text.replace(/\s+/g, ' ').slice(0, 340)}`);
}
process.exit(0);
