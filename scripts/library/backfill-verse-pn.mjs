#!/usr/bin/env node
// Backfill block_attrs.pn (the chapter:verse a block starts at, lib/library/verse-pn.js) for verse-marked scripture,
// computed from the STORED rows — the file backfill (sites/backfill-block-attrs.mjs) cannot reach rows with no para_N.
// An existing pn (ILM's, or the adapter's) is never overwritten. Runs ON tower; dry run unless --apply.
//   node scripts/library/backfill-verse-pn.mjs [--apply] [--docs 21228,21229]
import dotenv from 'dotenv';
import { queryAll, transaction } from '../../api/lib/db.js';
import { versePn } from '../../api/lib/library/verse-pn.js';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
const APPLY = process.argv.includes('--apply');
const ONLY = process.argv.includes('--docs') ? process.argv[process.argv.indexOf('--docs') + 1].split(',').map(Number) : null;
if (APPLY && !process.env.SIFTER_WRITER_URL) throw new Error('SIFTER_WRITER_URL is required to write');
const docs = ONLY || (await queryAll(`SELECT DISTINCT doc_id FROM content WHERE deleted_at IS NULL AND text LIKE '%<sup>%:%</sup>%'`)).map((r) => r.doc_id);
const stats = { docs: docs.length, rows: 0, numbered: 0, set: 0, kept: 0, issues: 0 };
for (const id of docs) {
  const rows = await queryAll(`SELECT id, text, heading, block_attrs FROM content WHERE doc_id = ? AND deleted_at IS NULL AND COALESCE(blocktype, '') != 'footnote' ORDER BY paragraph_index`, [id]);
  if (!rows.some((r) => /<sup>\s*\d+:\d+\s*<\/sup>/.test(r.text))) continue;
  const { pn, issues } = versePn(rows);
  stats.issues += issues.length;
  const writes = [];
  rows.forEach((r, i) => {
    stats.rows++;
    if (!pn[i]) return;
    stats.numbered++;
    const cur = r.block_attrs ? JSON.parse(r.block_attrs) : {};
    if (cur.pn) { stats.kept++; return; }
    writes.push({ sql: 'UPDATE content SET block_attrs = ? WHERE id = ?', args: [JSON.stringify({ ...cur, pn: pn[i] }), r.id] });
  });
  stats.set += writes.length;
  for (let i = 0; APPLY && i < writes.length; i += 500) await transaction(writes.slice(i, i + 500), 'backfill:verse-pn');
}
console.log(JSON.stringify({ apply: APPLY, ...stats }));
process.exit(0);
