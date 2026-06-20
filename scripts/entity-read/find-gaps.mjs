// Find paragraph_index coverage gaps between the seqread window files and the full document's text paragraphs.
// Writes gap ranges to tmp/entity-research/seqread/gaps.json. Usage: node find-gaps.mjs [docId]
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readdirSync, writeFileSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const DOC = Number(process.argv[2] || 21308);
const dir = 'tmp/entity-research/seqread';
const re = new RegExp(`^${DOC}-(\\d+)-(\\d+)\\.json$`);
const covered = new Set();
for (const f of readdirSync(dir)) { const m = f.match(re); if (m) for (let i = +m[1]; i <= +m[2]; i++) covered.add(i); }
const paras = await queryAll("SELECT paragraph_index FROM content WHERE doc_id=? AND deleted_at IS NULL AND text NOT LIKE '![%' AND length(trim(text))>0 ORDER BY paragraph_index", [DOC]);
const idxs = paras.map(p => p.paragraph_index);
const missing = idxs.filter(i => !covered.has(i));
const ranges = []; let s = null, prev = null;
for (const i of missing) { if (s === null) { s = prev = i; } else if (i <= prev + 3) { prev = i; } else { ranges.push([s, prev]); s = prev = i; } }
if (s !== null) ranges.push([s, prev]);
console.log(`text paras: ${idxs.length} | covered: ${idxs.length - missing.length} | missing: ${missing.length} | gap ranges: ${ranges.length}`);
for (const [a, b] of ranges) console.log(`  gap ${a}-${b} (${b - a + 1} paras)`);
writeFileSync(`${dir}/gaps.json`, JSON.stringify(ranges));
process.exit(0);
