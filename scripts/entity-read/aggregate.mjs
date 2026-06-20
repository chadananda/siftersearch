// Aggregate seqread window files into: (a) all-mentions.json (every mention with its window range),
// and (b) region-NN.json files grouping contiguous windows, each with the distinct per-window labels
// merged (label + description + aliases) — the unit a region-reconciler agent triangulates + binds to DB.
// Usage: node aggregate.mjs [docId=21308] [regionWindows=12]
import { readdirSync, readFileSync, writeFileSync } from 'fs';
const DOC = Number(process.argv[2] || 21308);
const REGION_WINDOWS = Number(process.argv[3] || 12);
const dir = 'tmp/entity-research/seqread';
const re = new RegExp(`^${DOC}-(\\d+)-(\\d+)\\.json$`);
const files = readdirSync(dir).filter(f => re.test(f)).sort((a, b) => (+a.match(re)[1]) - (+b.match(re)[1]));
const allMentions = [], windows = [];
for (const f of files) {
  let j; try { j = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')); } catch { continue; }
  const [a, b] = j.range;
  windows.push({ a, b, cast: j.windowCast || [] });
  for (const m of j.mentions || []) allMentions.push({ ...m, win: [a, b] });
}
writeFileSync(`${dir}/all-mentions.json`, JSON.stringify(allMentions));
const regions = [];
for (let i = 0; i < windows.length; i += REGION_WINDOWS) {
  const grp = windows.slice(i, i + REGION_WINDOWS);
  const byLabel = new Map();
  for (const w of grp) for (const c of w.cast) {
    const e = byLabel.get(c.label);
    if (e) { e.description ||= c.description; e.aliases = [...new Set([...(e.aliases || []), ...(c.aliases || [])])]; }
    else byLabel.set(c.label, { ...c });
  }
  const region = { idx: regions.length, range: [grp[0].a, grp[grp.length - 1].b], cast: [...byLabel.values()] };
  regions.push(region);
  writeFileSync(`${dir}/region-${String(region.idx).padStart(2, '0')}.json`, JSON.stringify(region, null, 1));
}
console.log(`windows: ${windows.length} | mentions: ${allMentions.length} | regions: ${regions.length}`);
for (const r of regions) console.log(`  region ${r.idx} paras ${r.range[0]}-${r.range[1]}: ${r.cast.length} distinct labels`);
process.exit(0);
