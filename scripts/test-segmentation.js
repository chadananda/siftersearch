#!/usr/bin/env node
/**
 * Test Translation Segmentation
 *
 * Tests the new concept-based segmentation on a sample document/paragraph.
 * Shows the segments for review before batch translation.
 *
 * Usage:
 *   node scripts/test-segmentation.js <document-id>
 *   node scripts/test-segmentation.js <document-id> --paragraph=N
 *   node scripts/test-segmentation.js --list  # List available Bab tablets
 */

import '../api/lib/config.js';
import { query, queryOne, queryAll } from '../api/lib/db.js';
import { translateTextWithSegments } from '../api/services/translation.js';

const args = process.argv.slice(2);

async function listDocuments() {
  const docs = await queryAll(`
    SELECT d.id, d.title, d.language, d.paragraph_count,
           (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id) as content_count
    FROM docs d
    WHERE d.author = 'The Báb'
      AND d.language IN ('ar', 'fa')
    ORDER BY d.paragraph_count DESC
    LIMIT 20
  `);

  console.log('\n=== Báb Tablets (largest first) ===\n');
  docs.forEach(d => {
    console.log(`  ${d.id}`);
    console.log(`    ${d.title}`);
    console.log(`    [${d.language.toUpperCase()}] ${d.content_count} paragraphs\n`);
  });
  console.log('Run: node scripts/test-segmentation.js <document-id>');
}

async function testDocument(docId, paragraphNum = 1) {
  // Get document
  const doc = await queryOne('SELECT id, title, language FROM docs WHERE id = ?', [docId]);
  if (!doc) {
    console.error(`Document not found: ${docId}`);
    process.exit(1);
  }

  console.log(`\n=== Testing Segmentation ===`);
  console.log(`Document: ${doc.title}`);
  console.log(`Language: ${doc.language}`);
  console.log(`Paragraph: ${paragraphNum}\n`);

  // Get paragraph content
  const para = await queryOne(`
    SELECT id, text, translation, translation_segments
    FROM content
    WHERE doc_id = ?
    ORDER BY paragraph_index
    LIMIT 1 OFFSET ?
  `, [docId, paragraphNum - 1]);

  if (!para) {
    console.error(`Paragraph ${paragraphNum} not found`);
    process.exit(1);
  }

  console.log('=== Original Text ===');
  console.log(para.text);
  console.log();

  // Check existing translation
  if (para.translation) {
    console.log('=== Existing Translation ===');
    console.log(para.translation);
    if (para.translation_segments) {
      console.log('\n=== Existing Segments ===');
      const segments = JSON.parse(para.translation_segments);
      segments.forEach((s, i) => {
        console.log(`\n[${i + 1}] Original: ${s.original}`);
        console.log(`    Translation: ${s.translation}`);
      });
    }
    console.log();
  }

  // Translate with new segmentation
  console.log('=== Translating with NEW segmentation... ===\n');

  try {
    const result = await translateTextWithSegments(
      para.text,
      doc.language,
      'en',
      'scripture'
    );

    console.log('=== NEW Translation ===');
    console.log(result.translation);

    if (result.segments) {
      console.log('\n=== NEW Segments ===');
      result.segments.forEach((s, i) => {
        console.log(`\n[${i + 1}] Original: ${s.original}`);
        console.log(`    Translation: ${s.translation}`);
      });
      console.log(`\nTotal segments: ${result.segments.length}`);
    }

    // Prompt to save
    console.log('\n---');
    console.log('To save this translation, run with --save flag');
    console.log(`  node scripts/test-segmentation.js ${docId} --paragraph=${paragraphNum} --save`);

    // If --save flag is present
    if (args.includes('--save')) {
      const segmentsJson = result.segments ? JSON.stringify(result.segments) : null;
      await query(
        'UPDATE content SET translation = ?, translation_segments = ?, synced = 0, updated_at = ? WHERE id = ?',
        [result.translation, segmentsJson, new Date().toISOString(), para.id]
      );
      console.log('\n✅ Translation saved!');
    }

  } catch (err) {
    console.error('Translation error:', err.message);
    process.exit(1);
  }
}

async function main() {
  if (args.includes('--list') || args.length === 0) {
    await listDocuments();
    return;
  }

  const docId = args[0];
  const paraArg = args.find(a => a.startsWith('--paragraph='));
  const paragraphNum = paraArg ? parseInt(paraArg.split('=')[1]) : 1;

  await testDocument(docId, paragraphNum);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
