// Audit the three Grand Vazírs against period. Lists every vizier-ish mention by region, and each vizier's
// current seqread-v1 binding paras, so misperiod binds (e.g. the Báb's-martyrdom Grand Vazír must be Amír
// Kabir 1848-51, NOT Áqá Khán-i-Núrí 1851+) are caught.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, readdirSync } from 'fs';
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const dir = 'tmp/entity-research/seqread';
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const regions = readdirSync(dir).filter(f => /^region-\d+\.json$/.test(f)).sort().map(f => { const m = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')); return { idx: m.idx, range: m.range }; });
const regionFor = p => regions.find(R => p >= R.range[0] && p <= R.range[1]);
const cmap = new Map((await queryAll('SELECT id,paragraph_index FROM content WHERE doc_id=21308')).map(r => [String(r.id), r.paragraph_index]));

const mentions = JSON.parse(readFileSync(`${dir}/all-mentions.json`, 'utf8'));
const VIZ = ['vazir', 'amir-niz', 'amir niz', 'amir kabir', 'taqi khan', 'sadr-i-azam', "sadr-i-a'zam", 'i'timadu'];
const groups = new Map();
for (const m of mentions) {
  const c = norm(m.label); if (!VIZ.some(t => c.includes(t))) continue;
  const R = regionFor(m.para); const k = `r${R ? R.idx : '?'}||${m.label}`;
  if (!groups.has(k)) groups.set(k, new Set()); groups.get(k).add(m.para);
}
console.log('=== vizier-ish mentions by region (label -> paras) ===');
for (const [k, ps] of [...groups.entries()].sort()) console.log(`  ${k}  [${[...ps].sort((a, b) => a - b).join(',')}]`);

const viz = { 1247567: 'Áqásí (to 1848)', 1247568: 'Amír Kabir/Amír-Niẓám (1848-51)', 1247946: 'Áqá Khán-i-Núrí (1851+)' };
console.log('\n=== each vizier: seqread-v1 binding paras (with region) ===');
for (const [id, nm] of Object.entries(viz)) {
  const rows = await graphQueryAll("SELECT content_id FROM entity_mentions WHERE entity_id=? AND extractor_version='seqread-v1'", [id]);
  const paras = rows.map(r => cmap.get(String(r.content_id))).filter(p => p != null).sort((a, b) => a - b);
  const withR = paras.map(p => { const R = regionFor(p); return `${p}(r${R ? R.idx : '?'})`; });
  console.log(`  ${id} ${nm}: ${withR.join(' ') || '(none)'}`);
}
// dump suspicious late Áqá Khán-i-Núrí paras for reading
const dump = [1034, 1129, 1982, 1986, 2030, 2034];
const rows = await queryAll(`SELECT paragraph_index,text FROM content WHERE doc_id=21308 AND paragraph_index IN (${dump.join(',')}) ORDER BY paragraph_index`);
console.log('\n=== suspicious paras text ===');
for (const r of rows) console.log(`  [${r.paragraph_index}] ${r.text.replace(/\s+/g, ' ').slice(0, 240)}`);
process.exit(0);
