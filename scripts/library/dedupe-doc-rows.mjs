#!/usr/bin/env node
// Soft-delete EXACT duplicate content rows inside ONE doc: same paragraph_index AND same text as a lower-id live row
// (doc 2095 held 1,506 — every paragraph stored up to 4×). Rows sharing an index with DIFFERENT text are real paragraphs
// and are kept. Reversible: ids backed up first; Meili deletions queued (meili_pending_deletes), not sent one by one.
// Dry run by default.   node scripts/library/dedupe-doc-rows.mjs <docId> [--apply]
import { writeFileSync } from 'fs';
import { queryAll, transaction } from '../../api/lib/db.js';

const docId = Number(process.argv[2]);
const APPLY = process.argv.includes('--apply');
if (!docId) throw new Error('usage: dedupe-doc-rows.mjs <docId> [--apply]');

const dups = await queryAll(`SELECT c.id, c.paragraph_index FROM content c
  WHERE c.doc_id = ? AND c.deleted_at IS NULL AND EXISTS (SELECT 1 FROM content o WHERE o.doc_id = c.doc_id
    AND o.deleted_at IS NULL AND o.paragraph_index = c.paragraph_index AND o.text = c.text AND o.id < c.id)`, [docId]);
const live = await queryAll('SELECT COUNT(*) n FROM content WHERE doc_id = ? AND deleted_at IS NULL', [docId]);
console.log(JSON.stringify({ docId, live: live[0].n, duplicates: dups.length, keep: live[0].n - dups.length, apply: APPLY }));
if (!APPLY || !dups.length) process.exit(0);

const ids = dups.map((r) => r.id);
const backup = `/tank/sifter/backups/dedupe-doc-${docId}-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(backup, JSON.stringify({ docId, at: new Date().toISOString(), ids }));
const now = new Date().toISOString();
for (let i = 0; i < ids.length; i += 500) {
  await transaction(ids.slice(i, i + 500).map((id) => ({
    sql: 'UPDATE content SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', args: [now, now, id] })), 'dedupe-doc-rows');
}
// the soft-delete enqueued their removal from every search index (index outbox, by trigger — migration 143)
console.log(JSON.stringify({ softDeleted: ids.length, backup }));
process.exit(0);
