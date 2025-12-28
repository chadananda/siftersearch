#!/usr/bin/env node
/**
 * Fix Arabic/Farsi Document Languages
 *
 * Scans all documents marked as 'en' in Meilisearch,
 * checks their content for Arabic/Farsi script, and updates the language field.
 *
 * Works with Meilisearch only (no SQLite dependency).
 */

import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Load env files (same as deploy-hooks.js)
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { getMeili, INDEXES } from '../api/lib/search.js';

// Arabic Unicode ranges
const ARABIC_PATTERN = /[\u0600-\u06FF]/;
const EXTENDED_ARABIC_PATTERN = /[\u0750-\u077F]|[\uFB50-\uFDFF]|[\uFE70-\uFEFF]/;
// Farsi-specific characters: پ چ ژ گ ی
const FARSI_PATTERN = /[\u067E\u0686\u0698\u06AF\u06CC]/;

function detectLanguage(text) {
  if (!text) return 'en';

  const hasArabic = ARABIC_PATTERN.test(text) || EXTENDED_ARABIC_PATTERN.test(text);
  const hasFarsi = FARSI_PATTERN.test(text);

  if (hasFarsi) return 'fa';
  if (hasArabic) return 'ar';
  return 'en';
}

async function fixDocumentLanguages() {
  console.log('🔍 Scanning Meilisearch documents for Arabic/Farsi content...\n');

  const meili = getMeili();
  const docsIndex = meili.index(INDEXES.DOCUMENTS);
  const parasIndex = meili.index(INDEXES.PARAGRAPHS);

  // Get all documents marked as 'en' from Meilisearch
  // Use search with filter to get documents with language='en'
  let allDocs = [];
  let offset = 0;
  const limit = 1000;

  console.log('Fetching documents marked as English...');

  while (true) {
    const result = await docsIndex.search('', {
      filter: 'language = "en"',
      limit,
      offset,
      attributesToRetrieve: ['id', 'title', 'author', 'language']
    });

    allDocs = allDocs.concat(result.hits);
    console.log(`  Fetched ${allDocs.length} documents so far...`);

    if (result.hits.length < limit) break;
    offset += limit;
  }

  console.log(`\nFound ${allDocs.length} documents marked as 'en'\n`);

  if (allDocs.length === 0) {
    console.log('✅ No documents marked as English found.');
    return;
  }

  let fixedCount = 0;
  const fixes = [];

  // Check each document's paragraphs for Arabic/Farsi content
  console.log('Checking content for Arabic/Farsi script...');

  for (let i = 0; i < allDocs.length; i++) {
    const doc = allDocs[i];

    // Get a sample of paragraphs for this document
    const parasResult = await parasIndex.search('', {
      filter: `document_id = "${doc.id}"`,
      limit: 10,
      attributesToRetrieve: ['text']
    });

    // Combine paragraph texts for language detection
    const sampleContent = parasResult.hits.map(p => p.text).join(' ');
    const detectedLang = detectLanguage(sampleContent);

    if (detectedLang !== 'en') {
      fixes.push({
        id: doc.id,
        title: doc.title,
        author: doc.author,
        oldLang: doc.language,
        newLang: detectedLang
      });
      fixedCount++;
    }

    // Progress indicator every 50 documents
    if ((i + 1) % 50 === 0) {
      console.log(`  Checked ${i + 1}/${allDocs.length} documents (${fixes.length} need fixing)`);
    }
  }

  console.log(`  Checked ${allDocs.length}/${allDocs.length} documents\n`);

  if (fixes.length === 0) {
    console.log('✅ No documents need fixing - all languages are correct.');
    return;
  }

  console.log(`Found ${fixedCount} documents that need language correction:\n`);

  // Show first 20 for preview
  for (const fix of fixes.slice(0, 20)) {
    console.log(`  - "${fix.title}" by ${fix.author}: ${fix.oldLang} → ${fix.newLang}`);
  }
  if (fixes.length > 20) {
    console.log(`  ... and ${fixes.length - 20} more\n`);
  }

  // Update Meilisearch
  console.log('\n🔄 Updating Meilisearch...');
  const meiliUpdates = fixes.map(fix => ({
    id: fix.id,
    language: fix.newLang
  }));

  // Batch update in Meilisearch
  const batchSize = 100;
  for (let i = 0; i < meiliUpdates.length; i += batchSize) {
    const batch = meiliUpdates.slice(i, i + batchSize);
    const task = await docsIndex.updateDocuments(batch, { primaryKey: 'id' });
    console.log(`  Batch ${Math.floor(i / batchSize) + 1}: Updated ${batch.length} documents (task ${task.taskUid})`);
  }

  console.log(`\n✅ Complete! Fixed ${fixes.length} documents.`);

  // Summary by language
  const byLang = fixes.reduce((acc, f) => {
    acc[f.newLang] = (acc[f.newLang] || 0) + 1;
    return acc;
  }, {});

  console.log('\nSummary:');
  for (const [lang, count] of Object.entries(byLang)) {
    console.log(`  ${lang}: ${count} documents`);
  }
}

// Run
fixDocumentLanguages()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
