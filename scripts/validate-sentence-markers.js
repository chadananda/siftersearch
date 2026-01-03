#!/usr/bin/env node
/**
 * Validation Script: Verify Sentence Markers
 *
 * Checks all paragraphs with sentence markers to ensure:
 * 1. Markers are properly balanced (open/close pairs)
 * 2. Stripping markers produces valid text (no corruption)
 * 3. Original text can be reconstructed (if stored separately)
 *
 * Usage:
 *   node scripts/validate-sentence-markers.js [--doc-id=ID] [--fix]
 *
 * Options:
 *   --doc-id=ID  Validate only paragraphs for specific document
 *   --fix        Remove markers from corrupted paragraphs
 */

import { query, queryAll } from '../api/lib/db.js';
import { stripMarkers, validateMarkers, hasMarkers } from '../api/lib/markers.js';

// Parse CLI arguments
const args = process.argv.slice(2);
const fix = args.includes('--fix');
const docIdArg = args.find(a => a.startsWith('--doc-id='));
const docId = docIdArg ? docIdArg.split('=')[1] : null;

async function main() {
  console.log('='.repeat(60));
  console.log('Sentence Marker Validation');
  console.log('='.repeat(60));
  console.log(`Options: fix=${fix}, doc-id=${docId || 'all'}`);
  console.log();

  // Build query for paragraphs with markers
  let sql = `
    SELECT c.id, c.doc_id, c.paragraph_index, c.text
    FROM content c
    WHERE c.text LIKE '%⁅%'
  `;
  const params = [];

  if (docId) {
    sql += ` AND c.doc_id = ?`;
    params.push(docId);
  }

  sql += ` ORDER BY c.doc_id, c.paragraph_index`;

  const paragraphs = await queryAll(sql, params);
  console.log(`Found ${paragraphs.length} paragraphs with markers`);

  if (paragraphs.length === 0) {
    console.log('No marked paragraphs to validate.');
    return;
  }

  let valid = 0;
  let invalid = 0;
  let fixed = 0;
  const issues = [];

  for (const para of paragraphs) {
    const checks = [];

    // Check 1: Marker balance
    const markerValidation = validateMarkers(para.text);
    if (!markerValidation.valid) {
      checks.push(`Unbalanced markers: ${markerValidation.errors.join(', ')}`);
    }

    // Check 2: Strip produces valid text
    try {
      const stripped = stripMarkers(para.text);
      if (!stripped || stripped.length === 0) {
        checks.push('Stripping markers produces empty text');
      }
      // Check for any remaining marker characters
      if (stripped.includes('⁅') || stripped.includes('⁆')) {
        checks.push('Marker characters remain after stripping');
      }
    } catch (err) {
      checks.push(`Strip error: ${err.message}`);
    }

    // Check 3: No obvious corruption patterns
    if (para.text.includes('⁅⁅') || para.text.includes('⁆⁆')) {
      checks.push('Double marker brackets detected');
    }
    if (para.text.includes('⁅/⁅') || para.text.includes('⁆/⁆')) {
      checks.push('Malformed marker tags detected');
    }

    if (checks.length > 0) {
      invalid++;
      issues.push({
        id: para.id,
        docId: para.doc_id,
        paragraphIndex: para.paragraph_index,
        issues: checks,
        textPreview: para.text.substring(0, 100) + '...'
      });

      if (fix) {
        // Remove markers from corrupted paragraph
        const cleaned = stripMarkers(para.text);
        await query(
          `UPDATE content SET text = ?, synced = 0, updated_at = ? WHERE id = ?`,
          [cleaned, new Date().toISOString(), para.id]
        );
        fixed++;
        console.log(`  Fixed ${para.id}: Removed markers`);
      }
    } else {
      valid++;
    }
  }

  console.log();
  console.log('='.repeat(60));
  console.log('Summary:');
  console.log(`  Valid:   ${valid}`);
  console.log(`  Invalid: ${invalid}`);
  if (fix) {
    console.log(`  Fixed:   ${fixed}`);
  }
  console.log('='.repeat(60));

  if (issues.length > 0 && !fix) {
    console.log();
    console.log('Issues found (run with --fix to remove markers):');
    for (const issue of issues.slice(0, 10)) {
      console.log();
      console.log(`  ${issue.id} (doc: ${issue.docId}, p${issue.paragraphIndex}):`);
      for (const check of issue.issues) {
        console.log(`    - ${check}`);
      }
      console.log(`    Preview: ${issue.textPreview}`);
    }
    if (issues.length > 10) {
      console.log();
      console.log(`  ... and ${issues.length - 10} more issues`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
