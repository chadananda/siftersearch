#!/usr/bin/env node
// Undo ONE retirement run for a list of docs (content.restoreRetiredDocs: clears only the stamp that run set). Runs ON
// tower (SIFTER_WRITER_URL). Dry run by default.
//   node scripts/library/restore-docs.mjs --ids <file: one doc id per line, or TSV with doc_id> --since <ISO> --reason "<why>" --run-id <id> [--apply]
import { readFileSync } from 'fs';
import { content } from '../../api/lib/content.js';

const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const FILE = opt('--ids'), SINCE = opt('--since'), REASON = opt('--reason'), RUN = opt('--run-id');
if (!FILE || !SINCE || !REASON || !RUN) throw new Error('--ids, --since, --reason and --run-id are required');
if (process.argv.includes('--apply') && !process.env.SIFTER_WRITER_URL) throw new Error('SIFTER_WRITER_URL is required to write');
const ids = readFileSync(FILE, 'utf8').split('\n').map((l) => Number(l.split('\t')[0])).filter(Number.isInteger).filter(Boolean);
console.log(JSON.stringify({ ids: ids.length, since: SINCE, apply: process.argv.includes('--apply') }));
if (!process.argv.includes('--apply')) process.exit(0);
let restored = 0;
for (let i = 0; i < ids.length; i += 50) restored += (await content.restoreRetiredDocs(ids.slice(i, i + 50), { since: SINCE, reason: REASON, runId: RUN })).restored;
console.log(JSON.stringify({ finished: true, restored }));
process.exit(0);
