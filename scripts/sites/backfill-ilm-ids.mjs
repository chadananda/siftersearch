#!/usr/bin/env node
// Backfill content.block_attrs.ilm_id for OceanLibrary paragraphs ingested before the adapter kept it (runs ON tower).
// ilm_id comes from the book's -sites markdown (`{… id="para_N" ilm_id="bl30" …}`), matched to our rows by para_N.
// With docs.external_id (bookid) it forms the site's data-ilmid, the anchor of a range link (api/lib/ocean-range.js).
// Only rows whose block_attrs has no ilm_id are touched; existing block_attrs keys are kept; synced is NOT reset (the
// search index does not carry it). Dry run unless --apply (needs SIFTER_WRITER_URL).
//   node scripts/sites/backfill-ilm-ids.mjs [--apply] [--docs 945899,21308]
import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { listDocs } from '../../api/lib/docs-repo.js';
import { queryAll, transaction } from '../../api/lib/db.js';

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
const stats = { docs: docs.length, no_file: 0, no_ilm: 0, rows: 0, set: 0, already: 0, unmatched: 0 };
let pending = [];
const flush = async () => { if (APPLY && pending.length) await transaction(pending, 'backfill:ilm-ids'); pending = []; };
for (const d of docs) {
  const path = join(LIB, d.file_path);
  if (!existsSync(path)) { stats.no_file++; continue; }
  const ids = new Map([...readFileSync(path, 'utf-8').matchAll(/\bid="(para_\d+)" ilm_id="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  if (!ids.size) { stats.no_ilm++; continue; }
  const rows = await queryAll('SELECT id, external_para_id pid, block_attrs FROM content WHERE doc_id = ? AND deleted_at IS NULL', [d.id]);
  for (const r of rows) {
    stats.rows++;
    const attrs = r.block_attrs ? JSON.parse(r.block_attrs) : {};
    if (attrs.ilm_id) { stats.already++; continue; }
    const ilm = ids.get(r.pid);
    if (!ilm) { stats.unmatched++; continue; }   // footnotes (fn_N) and attr-less prose have no site block
    stats.set++;
    pending.push({ sql: 'UPDATE content SET block_attrs = ? WHERE id = ?', args: [JSON.stringify({ ...attrs, ilm_id: ilm }), r.id] });
    if (pending.length >= 500) await flush();
  }
}
await flush();
console.log(JSON.stringify({ apply: APPLY, ...stats }));
process.exit(0);
