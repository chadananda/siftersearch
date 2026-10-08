#!/usr/bin/env node
// Backfill content.block_attrs for OceanLibrary paragraphs ingested before the adapter kept them (runs ON tower): the
// site block id (ilm_id — with docs.external_id it forms data-ilmid, the anchor of a range link, api/lib/ocean-range.js)
// and the heading PATH (chapter › episode, section label › numbered extract; `heading` keeps only the innermost). The
// book's -sites markdown is parsed by the adapter itself, so the values are exactly what a fresh ingest stores; rows are
// matched by para_N. Other block_attrs keys are kept; only rows whose values differ are written; synced is NOT reset.
// Dry run unless --apply (needs SIFTER_WRITER_URL).
//   node scripts/sites/backfill-block-attrs.mjs [--apply] [--docs 945899,21308]
import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { listDocs } from '../../api/lib/docs-repo.js';
import { queryAll, transaction } from '../../api/lib/db.js';
import { parseDoc } from '../../api/services/site-adapters/oceanlibrary.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(ROOT, f), quiet: true });
const LIB = '/home/chad/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library';
const APPLY = process.argv.includes('--apply');
const ONLY = process.argv.includes('--docs') ? process.argv[process.argv.indexOf('--docs') + 1].split(',').map(Number) : null;
if (APPLY && !process.env.SIFTER_WRITER_URL) throw new Error('SIFTER_WRITER_URL is required to write (tower scripts go through the single writer)');

const docs = [];
for (let offset = 0; ; offset += 1000) {
  const page = await listDocs({ sourceSite: 'oceanlibrary.com', ids: ONLY, fields: ['id', 'file_path'], limit: 1000, offset });
  docs.push(...page.docs);
  if (page.docs.length < 1000) break;
}
const stats = { docs: docs.length, no_file: 0, rows: 0, set: 0, same: 0, unmatched: 0, with_path: 0 };
let pending = [];
const flush = async () => { if (APPLY && pending.length) await transaction(pending, 'backfill:block-attrs'); pending = []; };
for (const d of docs) {
  const path = join(LIB, d.file_path);
  if (!existsSync(path)) { stats.no_file++; continue; }
  const { paragraphs } = await parseDoc(d.file_path, readFileSync(path, 'utf-8'), {});
  const want = new Map(paragraphs.filter((p) => p.external_para_id && p.block_attrs).map((p) => [p.external_para_id, p.block_attrs]));
  const rows = await queryAll('SELECT id, external_para_id pid, block_attrs FROM content WHERE doc_id = ? AND deleted_at IS NULL', [d.id]);
  for (const r of rows) {
    stats.rows++;
    const w = want.get(r.pid);
    if (!w) { stats.unmatched++; continue; }   // footnotes (fn_N), attr-less prose, top-level paragraphs with no path
    if (w.path) stats.with_path++;
    const cur = r.block_attrs ? JSON.parse(r.block_attrs) : {};
    const next = { ...cur, ...w };
    if (JSON.stringify(next) === JSON.stringify(cur)) { stats.same++; continue; }
    stats.set++;
    pending.push({ sql: 'UPDATE content SET block_attrs = ? WHERE id = ?', args: [JSON.stringify(next), r.id] });
    if (pending.length >= 500) await flush();
  }
}
await flush();
console.log(JSON.stringify({ apply: APPLY, ...stats }));
process.exit(0);
