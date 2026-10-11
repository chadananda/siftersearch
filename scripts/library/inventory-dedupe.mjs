#!/usr/bin/env node
// Retire Partial Inventory tablets that duplicate an oceanoflights tablet (Chad 10-10: "We do not want duplicates … keep
// the metadata merged into our oceanoflights tablet"). Per pair: link the inventory PIN to the oceanoflights doc
// (inventory_links, basis 'inventory-dedupe' → the doc_meta rebuild gives it Phelps' row), then mark the inventory doc
// duplicate_of the oceanoflights doc (search drops it; file untouched → reversible). Pairs come from a reviewed JSON list
// [{inv, ool, pin, coverage}] (letter-12-gram matching; containment and recensions excluded by reading). Runs ON tower
// with SIFTER_WRITER_URL. Dry run by default.   node scripts/library/inventory-dedupe.mjs --pairs <json> [--apply]
import { readFileSync, appendFileSync } from 'fs';
import { listDocs, markDuplicate } from '../../api/lib/docs-repo.js';
import { query } from '../../api/lib/db.js';

const opt = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const APPLY = process.argv.includes('--apply');
if (APPLY && !process.env.SIFTER_WRITER_URL) throw new Error('SIFTER_WRITER_URL is required to write');
const pairs = JSON.parse(readFileSync(opt('--pairs'), 'utf8'));
const ids = pairs.flatMap((p) => [p.inv, p.ool]);
const { docs } = await listDocs({ ids, fields: ['id', 'title', 'file_path', 'duplicate_of'], limit: ids.length });
const byId = new Map(docs.map((d) => [d.id, d]));
for (const p of pairs) {
  const inv = byId.get(p.inv), ool = byId.get(p.ool);
  const bad = !inv ? 'inventory doc not live' : !ool ? 'oceanoflights doc not live' : !inv.file_path.includes('Partial Inventory/') ? 'not an inventory doc'
    : ool.file_path.includes('Partial Inventory/') ? 'target is an inventory doc' : inv.duplicate_of ? `already duplicate_of ${inv.duplicate_of}` : null;
  console.log(JSON.stringify({ ...p, inv_title: inv?.title?.slice(0, 50), ool_title: ool?.title?.slice(0, 50), refused: bad }));
  if (!APPLY || bad) continue;
  await query(`INSERT INTO inventory_links (pin, doc_id, ool_id, coverage, basis) VALUES (?,?,?,?, 'inventory-dedupe')
    ON CONFLICT (pin, doc_id) DO UPDATE SET coverage = excluded.coverage, basis = excluded.basis`,
  [p.pin, p.ool, ool.file_path.split('/').pop().replace(/\.md$/, ''), p.coverage], 'inventory-dedupe:link');
  await markDuplicate(p.inv, p.ool, { reason: `Partial Inventory ${p.pin} duplicates oceanoflights doc (12-gram coverage ${p.coverage})` });
  appendFileSync('/tank/sifter/inventory-dedupe.jsonl', JSON.stringify({ at: new Date().toISOString(), ...p }) + '\n');
}
process.exit(0);
