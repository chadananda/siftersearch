// For the recurring shared role-titles, print (a) the Dawn-Breakers passages and (b) candidate existing
// seed entities (normalized substring match) so each title can be bound to the RIGHT person by context.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const persons = await queryAll("SELECT ge.id, er.canonical_name, er.aliases FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.entity_type='person' AND ge.religion='' WHERE er.entity_type='person'");
const idx = persons.map(p => { let al = []; try { al = JSON.parse(p.aliases || '[]'); } catch {} return { id: p.id, canon: p.canonical_name, blob: norm(p.canonical_name + ' ' + al.join(' ')) }; });
const queries = ['manuchihr', 'mutamid', "mu'tamid", 'nasiri', "nasiri'd-din", 'muhammad shah', 'aqa khan', 'aqasi', 'taqi khan', 'amir-nizam', 'amir nizam', 'mahd-i', "mahd-i-'ulya", 'sultanu', 'imam-jum', 'governor of amul', 'amul', 'qazvin', 'kirman', "sa'idu"];
console.log('=== candidate seed entities ===');
for (const q of queries) {
  const hits = idx.filter(p => p.blob.includes(q)).slice(0, 6);
  console.log(`"${q}": ${hits.length ? hits.map(h => `${h.id} ${h.canon}`).join(' | ') : '(none)'}`);
}
console.log('\n=== passages for recurring role-titles ===');
const roles = JSON.parse(readFileSync('tmp/entity-research/seqread/bucketB-roles.json', 'utf8'));
const targets = ['grand vazir', "mu'tamid", 'shah', 'imam-jum', 'kad-khuda', 'mother of the shah', 'governor of amul', 'governor', 'governor of kirman'];
for (const r of roles) {
  const nl = norm(r.label);
  if (!targets.includes(nl)) continue;
  console.log(`\n--- r${r.region} [${r.range[0]}-${r.range[1]}] "${r.label}" x${r.count} ${r.desc ? '— ' + r.desc.slice(0, 90) : ''}`);
  for (const pp of r.paras.slice(0, 6)) console.log(`  [${pp.p}] ${pp.text.slice(0, 280)}`);
}
process.exit(0);
