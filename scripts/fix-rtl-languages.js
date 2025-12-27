#!/usr/bin/env node

/**
 * Fix RTL Language Detection
 *
 * Scans documents marked as 'en' and re-detects language from content.
 * Updates documents that are actually Arabic or Farsi.
 *
 * Usage:
 *   node scripts/fix-rtl-languages.js [--dry-run]
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

import { query, queryAll } from '../api/lib/db.js';
import { getMeili, INDEXES } from '../api/lib/search.js';
import { detectLanguageFeatures } from '../api/services/segmenter.js';

const dryRun = process.argv.includes('--dry-run');

async function fixRtlLanguages() {
  console.log('🔍 Scanning for incorrectly labeled RTL documents');
  console.log('================================================');

  if (dryRun) {
    console.log('DRY RUN - No changes will be made\n');
  }

  const meili = getMeili();

  // Check if indexed_paragraphs table exists
  try {
    await queryAll('SELECT 1 FROM indexed_paragraphs LIMIT 1');
  } catch (err) {
    if (err.message?.includes('no such table')) {
      console.log('⚠️  indexed_paragraphs table not found (development environment)');
      console.log('   This script needs to run against the production database.');
      return;
    }
    throw err;
  }

  // Get all documents marked as English
  const result = await meili.index(INDEXES.DOCUMENTS).search('', {
    limit: 10000,
    filter: "language = 'en'",
    attributesToRetrieve: ['id', 'title', 'author', 'language']
  });

  console.log(`Found ${result.hits.length} documents marked as 'en'\n`);

  // Get paragraphs for each document and check language
  let fixedCount = 0;
  const fixes = [];

  for (const doc of result.hits) {
    // Get first few paragraphs to detect language
    const paragraphs = await queryAll(
      'SELECT text FROM indexed_paragraphs WHERE document_id = ? LIMIT 5',
      [doc.id]
    );

    if (paragraphs.length === 0) continue;

    const sampleText = paragraphs.map(p => p.text).join('\n');
    const detected = detectLanguageFeatures(sampleText);

    if (detected.language !== 'en') {
      fixes.push({
        id: doc.id,
        title: doc.title,
        author: doc.author,
        oldLang: 'en',
        newLang: detected.language,
        isRTL: detected.isRTL
      });
    }
  }

  console.log(`Found ${fixes.length} documents with incorrect language:\n`);

  for (const fix of fixes) {
    console.log(`  ${fix.newLang.toUpperCase()} | ${fix.author} | ${fix.title?.substring(0, 50)}`);

    if (!dryRun) {
      // Update SQLite
      await query(
        'UPDATE indexed_documents SET language = ? WHERE id = ?',
        [fix.newLang, fix.id]
      );

      // Update Meilisearch
      await meili.index(INDEXES.DOCUMENTS).updateDocuments([{
        id: fix.id,
        language: fix.newLang
      }]);

      fixedCount++;
    }
  }

  if (!dryRun && fixedCount > 0) {
    console.log(`\n✅ Fixed ${fixedCount} documents`);
  } else if (dryRun && fixes.length > 0) {
    console.log(`\n📝 Would fix ${fixes.length} documents (dry-run)`);
  } else {
    console.log('\n✅ No fixes needed');
  }
}

fixRtlLanguages().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
