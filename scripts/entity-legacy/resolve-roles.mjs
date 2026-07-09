// Reads recover-preview.json Bucket B, separates true COLLECTIVES/non-persons (no bind) from singular
// shared-role titles ("the Sháh", "Grand Vazír", "Mu‘tamid", "Imám-Jum‘ih", "governor", "the martyr"…),
// and pulls the Dawn-Breakers paragraph TEXT for each singular-role occurrence so identity can be resolved
// per-occurrence by reading + library search (the same title names DIFFERENT people by period/place/scene).
// Writes bucketB-roles.json. Binds nothing.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, writeFileSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const dir = 'tmp/entity-research/seqread';
const B = JSON.parse(readFileSync(`${dir}/recover-preview.json`, 'utf8')).bucketB;
const low = s => String(s || '').toLowerCase();
// collective / group / deity / non-person markers → NOT a single bindable person
const COLLECTIVE = ['god', 'disciples', 'companions', 'people of', 'inhabitants', 'believers', 'officials',
  'notables', 'assailants', 'mullas', 'mullás', 'siyyids', 'doctors', 'clergy', 'ulamá', 'ulama', 'ulamás',
  'the learned', 'attendants', 'colleague', ' and ', 'holy martyrs', 'both ', 'leading ', 'recognised ',
  'audience', 'masses', 'crowd', 'army', 'troops', 'guards', 'villagers', 'townspeople', 'adversaries'];
const NONPERSON = ['masjid', 'martyrdom', 'mosque', 'fortress', 'fort'];
const isCollective = l => COLLECTIVE.some(t => low(l).includes(t)) || NONPERSON.some(t => low(l).includes(t));

const collectives = [], roles = [];
for (const x of B) (isCollective(x.label) ? collectives : roles).push(x);

// fetch text for every paragraph referenced by a singular-role occurrence
const allParas = [...new Set(roles.flatMap(r => r.paras))];
const rows = allParas.length ? await queryAll(`SELECT paragraph_index, text FROM content WHERE doc_id=21308 AND deleted_at IS NULL AND paragraph_index IN (${allParas.map(() => '?').join(',')})`, allParas) : [];
const txt = new Map(rows.map(r => [r.paragraph_index, r.text]));
const out = roles.map(r => ({ region: r.region, range: r.range, label: r.label, count: r.count, desc: r.desc,
  paras: r.paras.map(p => ({ p, text: (txt.get(p) || '').replace(/\s+/g, ' ').trim() })) }));
out.sort((a, b) => b.count - a.count);
writeFileSync(`${dir}/bucketB-roles.json`, JSON.stringify(out, null, 1));
console.log(`COLLECTIVES/non-person (no bind): ${collectives.length} labels, ${collectives.reduce((s, x) => s + x.count, 0)} mentions`);
console.log(`SINGULAR role-titles needing context resolution: ${out.length} labels, ${out.reduce((s, x) => s + x.count, 0)} mentions\n`);
for (const r of out) {
  console.log(`r${r.region} [${r.range[0]}-${r.range[1]}] x${r.count}  "${r.label}"${r.desc ? '  — ' + r.desc.slice(0, 80) : ''}`);
}
process.exit(0);
