#!/usr/bin/env node
// Classify library pages as the WORK itself vs METADATA about a work vs site NAVIGATION, with Clef (System-1 task
// 'page-role', api/lib/library/page-role.js). Reads each page's own FILE (the page as scraped — hollow docs have no rows)
// via docs-repo file_path. Runs ON tower. Writes JSONL {doc_id, classes, role, confidence, jev?}; resumable (skips done ids).
//   node scripts/library/classify-page-role.mjs --ids <tsv with doc_id[,classes]> --out <jsonl>
//        [--per-class N] [--compare-jev] [--concurrency 8] [--limit N]
// --per-class N: stratified sample, N docs per distinct 'classes' value (agreement study before a full run).
// --compare-jev: also ask Jev explicitly (Clef forced → no background shadow) to measure Clef↔Jev agreement.
import { readFileSync, existsSync, appendFileSync } from 'fs';
import { resolve } from 'path';
import { listDocs } from '../../api/lib/docs-repo.js';
import { countParagraphs } from '../../api/lib/paragraphs-repo.js';
import { config } from '../../api/lib/config.js';
import { ask } from '../../api/lib/systemone.js';
import { TASK, QUESTIONS, pageRoleState, parseRole } from '../../api/lib/library/page-role.js';

const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const FILE = opt('--ids'), OUT = opt('--out');
const PER = Number(opt('--per-class', 0)), CONC = Number(opt('--concurrency', 8)), LIMIT = Number(opt('--limit', 0));
const JEV = process.argv.includes('--compare-jev');
if (!FILE || !OUT) throw new Error('--ids and --out are required');

const lines = readFileSync(FILE, 'utf8').split('\n').filter(Boolean);
const head = lines[0].split('\t'), ci = head.indexOf('doc_id'), cc = head.indexOf('classes');
let rows = lines.slice(1).map((l) => l.split('\t')).map((c) => ({ id: Number(c[ci]), classes: cc >= 0 ? c[cc] || '5_keep' : '' }))
  .filter((r) => Number.isInteger(r.id));
if (PER) {                                                       // deterministic stratified sample: every k-th doc of each class
  const by = Map.groupBy(rows, (r) => r.classes);
  rows = [...by.values()].flatMap((g) => g.filter((_, i) => i % Math.max(1, Math.floor(g.length / PER)) === 0).slice(0, PER));
}
const done = new Set(existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).doc_id) : []);
rows = rows.filter((r) => !done.has(r.id));
if (LIMIT) rows = rows.slice(0, LIMIT);
console.log(JSON.stringify({ todo: rows.length, done: done.size, compareJev: JEV }));

const fileText = (fp) => { try { return readFileSync(resolve(config.library.basePath, fp), 'utf8'); } catch { return null; } };
let n = 0, failed = 0;
async function one(r) {
  const [doc] = (await listDocs({ ids: [r.id], fields: ['id', 'title', 'file_path', 'source_site'], limit: 1 })).docs;
  if (!doc) return;                                              // retired since the list was made
  const text = fileText(doc.file_path);
  const state = pageRoleState({ title: doc.title, file: doc.file_path?.split('/').pop(), site: doc.source_site,
    paragraphs: await countParagraphs(r.id) }, text ?? '');
  const rec = { doc_id: r.id, classes: r.classes, file_missing: text == null };
  try {
    const a = await ask(TASK, state, QUESTIONS, { backend: 'clef', ref: r.id, timeoutMs: 30000 });
    Object.assign(rec, parseRole(a.answers) ?? { role: null });
    if (JEV) Object.assign(rec, { jev: parseRole((await ask(TASK, state, QUESTIONS, { backend: 'jev', ref: r.id, log: false })).answers)?.role ?? null });
  } catch (e) { failed++; rec.error = String(e.message || e).slice(0, 200); }
  appendFileSync(OUT, JSON.stringify(rec) + '\n');
  if (++n % 200 === 0) console.log(JSON.stringify({ n, failed }));
}
const queue = [...rows];
await Promise.all(Array.from({ length: CONC }, async () => { while (queue.length) await one(queue.shift()); }));
console.log(JSON.stringify({ finished: true, n, failed }));
process.exit(0);
