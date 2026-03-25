#!/usr/bin/env node
/**
 * Re-segment Oversized Paragraphs
 *
 * Finds paragraphs exceeding the embedding character limit (6000 chars) and
 * uses AI to split them at natural conceptual boundaries. Only touches
 * paragraphs that are too large — everything else is untouched.
 *
 * Usage:
 *   node scripts/resegment-oversized.js                       # List all oversized
 *   node scripts/resegment-oversized.js --doc <id>            # Re-segment one document
 *   node scripts/resegment-oversized.js --doc <id> --dry-run  # Preview without writing
 *   node scripts/resegment-oversized.js --all                 # Re-segment all oversized docs
 */

import { resegmentOversized } from '../api/services/segmenter.js';
import { queryAll } from '../api/lib/db.js';

const args = process.argv.slice(2);
const docId = args.includes('--doc') ? parseInt(args[args.indexOf('--doc') + 1]) : null;
const dryRun = args.includes('--dry-run');
const doAll = args.includes('--all');

const MAX_CHARS = 6000;

async function listOversized() {
  const rows = await queryAll(`
    SELECT c.doc_id, d.title, d.language, COUNT(*) as oversized_count,
           MAX(LENGTH(c.text)) as max_chars, SUM(LENGTH(c.text)) as total_chars
    FROM content c
    JOIN docs d ON d.id = c.doc_id
    WHERE c.deleted_at IS NULL AND LENGTH(c.text) > ?
    GROUP BY c.doc_id
    ORDER BY oversized_count DESC
  `, [MAX_CHARS]);

  if (rows.length === 0) {
    console.log('No oversized paragraphs found.');
    return;
  }

  console.log(`\nOversized paragraphs (>${MAX_CHARS.toLocaleString()} chars):\n`);
  console.log('  Doc ID  | Oversized | Max Chars | Total Chars | Language | Title');
  console.log('  --------|-----------|-----------|-------------|----------|------');
  for (const r of rows) {
    console.log(`  ${String(r.doc_id).padStart(7)} | ${String(r.oversized_count).padStart(9)} | ${String(r.max_chars).padStart(9)} | ${String(r.total_chars).padStart(11)} | ${(r.language || '??').padStart(8)} | ${r.title}`);
  }
  console.log(`\nTotal: ${rows.reduce((s, r) => s + r.oversized_count, 0)} oversized paragraphs across ${rows.length} documents`);
  console.log('\nTo re-segment: node scripts/resegment-oversized.js --doc <id> [--dry-run]');
}

async function resegmentDoc(id) {
  console.log(`\nRe-segmenting doc ${id}${dryRun ? ' (DRY RUN)' : ''}...`);

  const result = await resegmentOversized(id, { maxChars: MAX_CHARS, dryRun });

  console.log(`\nResult:`);
  console.log(`  Oversized paragraphs found: ${result.oversized}`);
  console.log(`  Paragraphs removed: ${result.removed}`);
  console.log(`  New paragraphs created: ${result.newParagraphs}`);

  if (result.errors.length > 0) {
    console.log(`  Errors:`);
    result.errors.forEach(e => console.log(`    - ${e}`));
  }

  if (dryRun && result.preview) {
    console.log(`\n  Preview of splits:`);
    for (const p of result.preview) {
      console.log(`\n  Replacing paragraph at index ${p.replacesIndex} -> ${p.pieces.length} pieces:`);
      for (const piece of p.pieces) {
        console.log(`    ${piece.chars} chars: "${piece.preview}..."`);
      }
    }
  }

  return result;
}

async function main() {
  if (docId) {
    await resegmentDoc(docId);
  } else if (doAll) {
    const rows = await queryAll(`
      SELECT DISTINCT c.doc_id FROM content c
      WHERE c.deleted_at IS NULL AND LENGTH(c.text) > ?
    `, [MAX_CHARS]);

    console.log(`Re-segmenting ${rows.length} documents with oversized paragraphs...\n`);
    for (const r of rows) {
      await resegmentDoc(r.doc_id);
    }
  } else {
    await listOversized();
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
