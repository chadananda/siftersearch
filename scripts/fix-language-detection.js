#!/usr/bin/env node
/**
 * Fix Language Detection
 *
 * Re-detects language for documents based on actual content (majority script)
 * instead of just presence of Arabic characters.
 */

import '../api/lib/config.js';
import { query, queryAll } from '../api/lib/db.js';
import { detectLanguageFeatures } from '../api/services/segmenter.js';

async function main() {
  console.log('\n=== Language Detection Fix ===\n');

  // Get all documents with their content
  const docs = await queryAll(`
    SELECT d.id, d.title, d.language, d.author,
           (SELECT GROUP_CONCAT(text, ' ') FROM content c WHERE c.doc_id = d.id LIMIT 5) as sample_content
    FROM docs d
    WHERE d.language IN ('ar', 'fa')
    ORDER BY d.id
  `);

  console.log(`Found ${docs.length} Arabic/Farsi documents to check\n`);

  let fixedCount = 0;
  const fixes = [];

  for (const doc of docs) {
    if (!doc.sample_content) continue;

    const features = detectLanguageFeatures(doc.sample_content);

    // If majority is actually English, this was misclassified
    if (features.language === 'en' && doc.language !== 'en') {
      fixes.push({
        id: doc.id,
        title: doc.title?.substring(0, 50),
        oldLang: doc.language,
        newLang: 'en',
        arabicRatio: (features.arabicRatio * 100).toFixed(1) + '%'
      });
    }
    // Check if Farsi was misclassified as Arabic or vice versa
    else if (features.language !== doc.language && features.language !== 'en') {
      fixes.push({
        id: doc.id,
        title: doc.title?.substring(0, 50),
        oldLang: doc.language,
        newLang: features.language,
        arabicRatio: (features.arabicRatio * 100).toFixed(1) + '%'
      });
    }
  }

  console.log(`Found ${fixes.length} documents with wrong language:\n`);

  for (const fix of fixes) {
    console.log(`  [${fix.id}] "${fix.title}..."`);
    console.log(`    ${fix.oldLang} → ${fix.newLang} (Arabic: ${fix.arabicRatio})`);
  }

  if (fixes.length === 0) {
    console.log('No fixes needed!');
    return;
  }

  // Apply fixes
  console.log('\n--- Applying fixes ---\n');

  for (const fix of fixes) {
    await query('UPDATE docs SET language = ? WHERE id = ?', [fix.newLang, fix.id]);
    fixedCount++;
  }

  console.log(`\n✅ Fixed ${fixedCount} documents`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
