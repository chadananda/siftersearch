#!/usr/bin/env node
/**
 * Fix Arabic/Farsi Document Languages
 *
 * Scans all documents marked as 'en' in SQLite and Meilisearch,
 * checks their content for Arabic/Farsi script, and updates the language field.
 */

import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Load env files (same as deploy-hooks.js)
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryAll } from '../api/lib/db.js';
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
  console.log('🔍 Scanning documents for Arabic/Farsi content...\n');

  const meili = getMeili();
  const index = meili.index(INDEXES.DOCUMENTS);

  // Get all documents marked as 'en' from SQLite
  const docs = await queryAll(`
    SELECT d.id, d.title, d.language, d.author,
           (SELECT GROUP_CONCAT(text, ' ') FROM indexed_paragraphs WHERE document_id = d.id LIMIT 5) as sample_content
    FROM indexed_documents d
    WHERE d.language = 'en'
  `);

  console.log(`Found ${docs.length} documents marked as 'en'\n`);

  let fixedCount = 0;
  const fixes = [];

  for (const doc of docs) {
    const detectedLang = detectLanguage(doc.sample_content);

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
  }

  if (fixes.length === 0) {
    console.log('✅ No documents need fixing - all languages are correct.');
    return;
  }

  console.log(`Found ${fixedCount} documents that need language correction:\n`);

  // Show first 10 for preview
  for (const fix of fixes.slice(0, 10)) {
    console.log(`  - "${fix.title}" by ${fix.author}: ${fix.oldLang} → ${fix.newLang}`);
  }
  if (fixes.length > 10) {
    console.log(`  ... and ${fixes.length - 10} more\n`);
  }

  // Update SQLite
  console.log('\n📝 Updating SQLite...');
  for (const fix of fixes) {
    await query(
      'UPDATE indexed_documents SET language = ? WHERE id = ?',
      [fix.newLang, fix.id]
    );
  }
  console.log(`✅ Updated ${fixes.length} documents in SQLite`);

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
    const task = await index.updateDocuments(batch, { primaryKey: 'id' });
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
