#!/usr/bin/env node
// Retire (soft-delete) an APPROVED, curated list of documents through the audited interface (content.safeSoftDeleteDocs:
// refuses OceanLibrary canonicals, one audit row per doc with reason + run id). Removal from the search indexes follows by
// itself: the index outbox triggers (migration 143) enqueue every paragraph and the sync worker drains it. Runs ON tower
// (needs SIFTER_WRITER_URL). Dry run by default; batches with a pause so the writer and the drain keep up.
//   node scripts/library/retire-docs.mjs --ids planning/<list>.tsv --reason "<why + who approved>" --run-id <id>
//        [--batch 200] [--pause-ms 2000] [--limit N] [--apply]
// The list is a TSV with a doc_id column (other columns ignored), e.g. planning/bahai-library-cleanup/retire-ids-20261009.tsv.
import { readFileSync } from 'fs';
import { content } from '../../api/lib/content.js';
import { listDocs } from '../../api/lib/docs-repo.js';

const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const FILE = opt('--ids'), REASON = opt('--reason'), RUN = opt('--run-id');
const BATCH = Number(opt('--batch', 200)), PAUSE = Number(opt('--pause-ms', 2000)), LIMIT = Number(opt('--limit', 0));
const APPLY = process.argv.includes('--apply');
if (!FILE || !REASON || !RUN) throw new Error('--ids, --reason and --run-id are required (the audit trail names why and who approved)');
if (APPLY && !process.env.SIFTER_WRITER_URL) throw new Error('SIFTER_WRITER_URL is required to write (tower scripts go through the single writer)');

const lines = readFileSync(FILE, 'utf8').split('\n').filter(Boolean);
const col = lines[0].split('\t').indexOf('doc_id');
if (col < 0) throw new Error(`${FILE}: no doc_id column`);
let ids = [...new Set(lines.slice(1).map((l) => Number(l.split('\t')[col])).filter(Number.isInteger))];
if (LIMIT) ids = ids.slice(0, LIMIT);

// what is still live (a re-run skips what an earlier run retired)
const live = [];
for (let i = 0; i < ids.length; i += 1000) {
  const page = await listDocs({ ids: ids.slice(i, i + 1000), fields: ['id', 'source_site'], limit: 1000 });
  live.push(...page.docs);
}
const bySite = live.reduce((m, d) => ((m[d.source_site || 'library'] = (m[d.source_site || 'library'] || 0) + 1), m), {});
console.log(JSON.stringify({ listed: ids.length, live: live.length, bySite, apply: APPLY, runId: RUN }));
if (!APPLY) process.exit(0);

let deleted = 0, protectedOl = 0;
for (let i = 0; i < live.length; i += BATCH) {
  const r = await content.safeSoftDeleteDocs(live.slice(i, i + BATCH).map((d) => d.id), { reason: REASON, runId: RUN, maxDelete: BATCH });
  if (r.aborted) throw new Error(`batch at ${i} aborted by the guard: ${JSON.stringify(r)}`);
  deleted += r.deleted; protectedOl += r.protected_ol || 0;
  if ((i / BATCH) % 10 === 0) console.log(JSON.stringify({ done: Math.min(i + BATCH, live.length), of: live.length, deleted }));
  await new Promise((res) => setTimeout(res, PAUSE));
}
console.log(JSON.stringify({ finished: true, deleted, protectedOl }));
process.exit(0);
