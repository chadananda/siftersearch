#!/usr/bin/env node
// Apply reviewed library placement fixes (Chad's audit decisions, 10-10). Plan JSON, applied in this order:
//   reingest:   [id]                                   hollow rows (file complete, 0 paragraphs) → POST /server/ingest-file force
//   move:       [{ id, to: "<Religion>/<Collection>/<file>.md" }]   file moves inside the library; row relocated, re-synced
//   duplicates: [{ dup, keep, reason }]                markDuplicate (refuses a target without prose), then the dup's FILE
//                                                      goes to _retired-duplicates/placement-audit-20261010/<its path>
//   religion:   [{ id, religion }]                     tradition label fix (paragraphs re-sync)
//   title:      [{ id, title }]                        title repair ("Untitled" rows; paragraphs re-sync)
// Every step is logged to /tank/sifter/library-fixes.jsonl (reversible: files moved, never deleted). Runs ON tower with
// SIFTER_WRITER_URL. Dry run by default.   node scripts/library/library-fixes.mjs --plan <json> [--apply]
import { readFileSync, appendFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join, dirname, resolve, sep } from 'path';
import dotenv from 'dotenv';
import { config } from '../../api/lib/config.js';
import { listDocs, markDuplicate, setDocReligion, setDocTitle, relocateDoc } from '../../api/lib/docs-repo.js';

dotenv.config({ path: '.env-secrets', quiet: true });
const opt = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const APPLY = process.argv.includes('--apply');
if (APPLY && !process.env.SIFTER_WRITER_URL) throw new Error('SIFTER_WRITER_URL is required to write');
const base = config.library.basePath;
const RETIRED = '_retired-duplicates/placement-audit-20261010';
// only files INSIDE the library are ever moved: scrape rows point outside it (../../tank/site2rag/…) and stay put
const inLibrary = (p) => !!p && resolve(base, p).startsWith(resolve(base) + sep);
const plan = JSON.parse(readFileSync(opt('--plan'), 'utf8'));
const ids = [...(plan.reingest || []), ...(plan.move || []).map((m) => m.id), ...(plan.duplicates || []).flatMap((d) => [d.dup, d.keep]), ...(plan.religion || []).map((r) => r.id), ...(plan.title || []).map((t) => t.id)];
const docs = async () => new Map((await listDocs({ ids, fields: ['id', 'title', 'religion', 'collection', 'file_path', 'duplicate_of', 'paragraph_count'], limit: ids.length })).docs.map((d) => [d.id, d]));
const log = (x) => { console.log(JSON.stringify(x)); if (APPLY) appendFileSync('/tank/sifter/library-fixes.jsonl', JSON.stringify({ at: new Date().toISOString(), ...x }) + '\n'); };
let byId = await docs();

for (const id of plan.reingest || []) {
  const d = byId.get(id);
  log({ op: 'reingest', id, title: d?.title?.slice(0, 60), file: d?.file_path, refused: !d ? 'not live' : !existsSync(join(base, d.file_path)) ? 'file missing' : null });
  if (!APPLY || !d) continue;
  const r = await fetch('http://127.0.0.1:7839/api/admin/server/ingest-file', { method: 'POST', signal: AbortSignal.timeout(600000),
    headers: { 'Content-Type': 'application/json', 'X-Internal-Key': process.env.DEPLOY_SECRET },
    body: JSON.stringify({ filePath: join(base, d.file_path), forceReindex: true, localOnly: true }) }).then((x) => x.json());
  log({ op: 'reingested', id, status: r.status, paragraphs: r.paragraphCount, warning: r.warning || null, error: r.error || null });
}
for (const m of plan.move || []) {
  const d = byId.get(m.id); const src = d && join(base, d.file_path), dst = join(base, m.to);
  const refused = !d ? 'not live' : !inLibrary(d.file_path) || !inLibrary(m.to) ? 'outside the library' : !existsSync(src) ? 'source missing' : existsSync(dst) ? 'target exists' : !existsSync(dirname(dst)) ? 'target folder missing' : null;
  log({ op: 'move', ...m, from: d?.file_path, refused });
  if (!APPLY || refused) continue;
  renameSync(src, dst);
  await relocateDoc(m.id, { filePath: m.to, collection: m.to.split('/')[1] });
  await setDocReligion(m.id, m.to.split('/')[0]);
}
byId = await docs();
for (const x of plan.duplicates || []) {
  const dup = byId.get(x.dup), keep = byId.get(x.keep);
  const refused = !dup ? 'dup not live' : !keep ? 'keep not live' : dup.duplicate_of ? `already duplicate_of ${dup.duplicate_of}` : null;
  log({ op: 'duplicate', ...x, dup_where: dup?.file_path, keep_where: keep?.file_path, refused });
  if (!APPLY || refused) continue;
  try { await markDuplicate(x.dup, x.keep, { reason: x.reason }); } catch (e) { log({ op: 'duplicate-refused', ...x, error: e.message }); continue; }
  if (!inLibrary(dup.file_path)) { log({ op: 'file-kept', id: x.dup, why: 'outside the library (scrape row): row retired, file untouched' }); continue; }
  const src = join(base, dup.file_path), dst = join(base, RETIRED, dup.file_path);
  if (existsSync(src) && !existsSync(dst)) { mkdirSync(dirname(dst), { recursive: true }); renameSync(src, dst); log({ op: 'file-retired', id: x.dup, to: join(RETIRED, dup.file_path) }); }
}
for (const r of plan.religion || []) {
  const d = byId.get(r.id);
  log({ op: 'religion', ...r, title: d?.title?.slice(0, 60), from: d?.religion, refused: d ? null : 'not live' });
  if (APPLY && d && d.religion !== r.religion) await setDocReligion(r.id, r.religion);
}
for (const t of plan.title || []) {
  const d = byId.get(t.id);
  log({ op: 'title', ...t, from: d?.title, refused: d ? null : 'not live' });
  if (APPLY && d && d.title !== t.title) await setDocTitle(t.id, t.title);
}
process.exit(0);
