// Reads gaps.json and re-runs seq-read.mjs on each gap range at a small window size, with bounded
// concurrency, so dense windows don't overflow the output budget. Writes GAPFILL_DONE when finished.
// Usage: node fill-gaps.mjs [docId=21308] [windowSize=8] [concurrency=5]
import { readFileSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
const DOC = Number(process.argv[2] || 21308);
const WIN = Number(process.argv[3] || 8);
const CONC = Number(process.argv[4] || 5);
const gaps = JSON.parse(readFileSync('tmp/entity-research/seqread/gaps.json', 'utf8'));
console.log(`gap-fill: ${gaps.length} ranges, window ${WIN}, concurrency ${CONC}`);
let i = 0;
const runOne = (a, b) => new Promise(res => {
  const p = spawn('node', ['scripts/entity-read/seq-read.mjs', String(DOC), String(a), String(b), String(WIN)], { stdio: 'inherit' });
  p.on('exit', () => res());
});
async function worker() { while (i < gaps.length) { const [a, b] = gaps[i++]; await runOne(a, b); } }
await Promise.all(Array.from({ length: CONC }, () => worker()));
writeFileSync('tmp/entity-research/seqread/GAPFILL_DONE', 'done');
console.log('gapfill complete');
process.exit(0);
