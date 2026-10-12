#!/usr/bin/env node
// Write stable paragraph ids + display numbers (`{id="para_N" pn="M"}`) into library SOURCE files (api/lib/library/block-ids.js).
// Files only — never the database; re-ingest picks the attrs up into content.block_attrs. Main library only (-sites keep
// their exporters' ids). Dry run unless --apply; --apply backs each file up under --backup (default /tank/sifter/block-id-backups).
//   node scripts/library/assign-block-ids.mjs --root "<library dir>" [--only Baha'i/Tablets | --files 'a.md|b.md'] [--limit 100] [--apply]
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import { assignBlockIds } from '../../api/lib/library/block-ids.js';

const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const ROOT = opt('--root'); if (!ROOT) { console.error('--root <library dir> required'); process.exit(2); }
const ONLY = opt('--only', ''), LIMIT = Number(opt('--limit', 0)), APPLY = process.argv.includes('--apply');
const BACKUP = opt('--backup', '/tank/sifter/block-id-backups');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name.startsWith('.') || e.name === '-sites' || e.name.startsWith('_retired') ? []
  : e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.md') ? [join(d, e.name)] : []));
const FILES = opt('--files', '');
const files = FILES ? FILES.split('|').map((f) => join(ROOT, f)) : walk(join(ROOT, ONLY)).slice(0, LIMIT || undefined);
const tot = { files: 0, changed: 0, assigned: 0, kept: 0, skipped: 0, files_with_skips: 0 };
const worst = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const r = assignBlockIds(src);
  tot.files++; tot.assigned += r.assigned; tot.kept += r.kept; tot.skipped += r.skipped;
  if (r.skipped) { tot.files_with_skips++; worst.push([r.skipped, relative(ROOT, f)]); }
  if (r.text !== src) {
    tot.changed++;
    if (APPLY) { const bk = join(BACKUP, relative(ROOT, f)); mkdirSync(dirname(bk), { recursive: true }); copyFileSync(f, bk); writeFileSync(f, r.text); }
  }
}
console.log(JSON.stringify({ apply: APPLY, ...tot, worst_skips: worst.sort((a, b) => b[0] - a[0]).slice(0, 8) }));
