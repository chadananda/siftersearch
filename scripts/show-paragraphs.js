#!/usr/bin/env node
/**
 * Show paragraphs for a document
 */
import '../api/lib/config.js';
import { queryAll, queryOne } from '../api/lib/db.js';

const docId = process.argv[2] || '001_address_to_believers';

const doc = await queryOne('SELECT * FROM docs WHERE id = ?', [docId]);
if (!doc) {
  console.error('Document not found:', docId);
  process.exit(1);
}

console.log('\n=== Document:', doc.title, '===');
console.log('Language:', doc.language);
console.log('Paragraph count:', doc.paragraph_count);

const paragraphs = await queryAll(`
  SELECT paragraph_index, LENGTH(text) as chars, text
  FROM content
  WHERE doc_id = ?
  ORDER BY paragraph_index
`, [docId]);

console.log('\nParagraphs:');
paragraphs.forEach(p => {
  const preview = p.text.substring(0, 100).replace(/\n/g, ' ');
  console.log(`\n[${p.paragraph_index + 1}] (${p.chars} chars)`);
  console.log(`  ${preview}...`);
});

// Stats
const avgChars = Math.round(paragraphs.reduce((sum, p) => sum + p.chars, 0) / paragraphs.length);
console.log('\n--- Stats ---');
console.log('Total paragraphs:', paragraphs.length);
console.log('Avg chars:', avgChars);
console.log('Min:', Math.min(...paragraphs.map(p => p.chars)));
console.log('Max:', Math.max(...paragraphs.map(p => p.chars)));
