// Mark the persistently-failing paragraphs (document artifacts: image links,
// CSS/JS code, section dividers) with a placeholder hyp_thesis so the
// enrichment loop stops re-enqueuing them. They aren't real doctrinal
// content; the corpus parser shouldn't have left them in.

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const PLACEHOLDER = '(non-doctrinal artifact — markdown image, code fragment, section divider, or empty paragraph; auto-marked after Sonnet repeatedly refused to generate.)';

const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: false });

// Find every content_id currently tied to enrichment_pending
const pending = db.prepare('SELECT content_id FROM enrichment_pending').all();
console.log(`Found ${pending.length} content_ids in enrichment_pending`);

if (pending.length > 0) {
  const update = db.prepare('UPDATE content SET hyp_thesis = ? WHERE id = ?');
  const tx = db.transaction(rows => {
    for (const r of rows) update.run(PLACEHOLDER, r.content_id);
  });
  tx(pending);
  console.log(`Marked ${pending.length} paragraphs with placeholder hyp_thesis`);

  // Clear the pending queue
  const cleared = db.prepare('DELETE FROM enrichment_pending').run();
  console.log(`Cleared ${cleared.changes} rows from enrichment_pending`);
}

const summary = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM content WHERE hyp_thesis IS NOT NULL AND hyp_thesis != ? AND deleted_at IS NULL) AS real_thesis,
    (SELECT COUNT(*) FROM content WHERE hyp_thesis = ? AND deleted_at IS NULL) AS placeholder_thesis,
    (SELECT COUNT(*) FROM enrichment_pending) AS still_pending
`).get(PLACEHOLDER, PLACEHOLDER);
console.log('\nFinal state:');
console.log(`  real hyp_thesis:        ${summary.real_thesis}`);
console.log(`  placeholder hyp_thesis: ${summary.placeholder_thesis}`);
console.log(`  still pending:          ${summary.still_pending}`);

db.close();
