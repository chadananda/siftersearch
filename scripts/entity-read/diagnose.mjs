// Diagnostic: why are mentions unmatched / why does a known entity land in "new"?
// Replicates the apply's mention->map-label lookup and reports the gaps.
import { readFileSync, readdirSync } from 'fs';
const dir = 'tmp/entity-research/seqread';
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const regions = [];
for (const f of readdirSync(dir).filter(f => /^region-\d+\.json$/.test(f)).sort()) {
  const meta = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  let map = []; try { map = JSON.parse(readFileSync(`${dir}/${f.replace('.json', '-map.json')}`, 'utf8')); } catch {}
  const lm = new Map();
  for (const rec of map) { lm.set(norm(rec.label), rec); for (const s of rec.surfaces || []) lm.set(norm(s), rec); }
  regions.push({ idx: meta.idx, range: meta.range, lm, map, castLabels: (meta.cast || []).map(c => c.label) });
}
const regionFor = para => regions.find(R => para >= R.range[0] && para <= R.range[1]);
const mentions = JSON.parse(readFileSync(`${dir}/all-mentions.json`, 'utf8'));
const unmatched = new Map();
for (const m of mentions) {
  const R = regionFor(m.para);
  if (!R || !R.lm.has(norm(m.label))) {
    const k = (R ? R.idx : 'noregion') + '||' + m.label;
    if (!unmatched.has(k)) unmatched.set(k, { region: R ? R.idx : 'none', label: m.label, count: 0, inCast: R ? R.castLabels.includes(m.label) : false });
    unmatched.get(k).count++;
  }
}
const list = [...unmatched.values()].sort((a, b) => b.count - a.count);
const total = list.reduce((s, x) => s + x.count, 0);
// bucket every unmatched occurrence: null-label | reconciler-dropped-cast-label (inCast) | reader-only label
let bNull = 0, bDropped = 0, bReaderOnly = 0;
for (const x of list) {
  if (!x.label || x.label === 'null') bNull += x.count;
  else if (x.inCast) bDropped += x.count;      // reader carried it in the region cast; reconciler omitted it from its map
  else bReaderOnly += x.count;                 // label the reconciler never carried as a cast entry (collectives/epithets/out-of-scope)
}
console.log(`BUCKETS of ${total}: null-label=${bNull} | reconciler-dropped-cast-label=${bDropped} | reader-only-label=${bReaderOnly}`);
console.log(`unmatched mention-occurrences: ${total} across ${list.length} distinct (region||label). inCast=label-was-in-region-cast-but-not-in-map`);
console.log('TOP 20 unmatched labels:');
for (const x of list.slice(0, 20)) console.log(`  r${x.region} x${x.count} inCast=${x.inCast}  "${x.label}"`);
console.log('\n=== Saʿidu_l-Ulama trace (map entries whose label/canonical mentions Saʻid or Ulam) ===');
for (const R of regions) for (const rec of R.map) {
  const blob = norm((rec.label || '') + ' ' + (rec.canonical_name || '') + ' ' + (rec.surfaces || []).join(' '));
  if (blob.includes('said') || blob.includes('ulama') || blob.includes('barfur')) {
    console.log(`  r${R.idx}: label="${rec.label}" canon="${rec.canonical_name}" id=${rec.entity_id} new=${rec.new} conf=${rec.confidence} surfaces=${JSON.stringify(rec.surfaces || [])}`);
  }
}
process.exit(0);
