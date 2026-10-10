#!/usr/bin/env node
// Feed the PRE-trigger backlog (rows that left the corpus before migration 143) into the index outbox, one content-id
// window at a time; the sync worker drains it to Meili + Qdrant. Paced: waits while the queue is deep or tower is loaded.
// Runs ON tower (needs SIFTER_WRITER_URL). Resumable with --after (the log prints nextAfterId).
//   node scripts/library/drain-index-backlog.mjs [--after 0] [--span 50000] [--max-queue 40000] [--max-load 16]
// Before running: Qdrant optimizers throttled (max_optimization_threads 1) on phrases, paragraphs_kw, hype.
import { loadavg } from 'os';
import { enqueueBacklogWindow, outboxDepth } from '../../api/lib/index-outbox.js';

const opt = (k, d) => (process.argv.includes(k) ? Number(process.argv[process.argv.indexOf(k) + 1]) : d);
let after = opt('--after', 0);
const SPAN = opt('--span', 50000), MAXQ = opt('--max-queue', 40000), MAXLOAD = opt('--max-load', 16);
if (!process.env.SIFTER_WRITER_URL) throw new Error('SIFTER_WRITER_URL is required (tower scripts write through the single writer)');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let total = 0;
for (;;) {
  while ((await outboxDepth()) > MAXQ || loadavg()[0] > MAXLOAD) await sleep(15000);
  const r = await enqueueBacklogWindow(after, SPAN);
  total += r.enqueued; after = r.nextAfterId;
  console.log(JSON.stringify({ at: new Date().toISOString(), ...r, total, load: +loadavg()[0].toFixed(1) }));
  if (r.done) break;
}
while ((await outboxDepth()) > 0) await sleep(15000);
console.log(JSON.stringify({ finished: true, total }));
process.exit(0);
