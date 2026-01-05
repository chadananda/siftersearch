#!/usr/bin/env node
import { segmentUnpunctuatedDocument, validateSegmentationStrict } from '../api/services/segmenter.js';
import { readFile } from 'fs/promises';

// Read the file
const filePath = process.env.HOME + "/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library/Baha'i/Core Tablets/The Báb/001-Address-to-Believers.md";
const content = await readFile(filePath, 'utf-8');

// Extract just the body (after YAML front matter)
const yamlEnd = content.indexOf('---', 4);
const body = content.slice(yamlEnd + 3).trim();

console.log('Body length:', body.length);
console.log('First 200 chars:', body.substring(0, 200));

// Segment the document - this will test our fix
console.log('\n🔧 Testing segmentation with v0.1.479 fix...');
const result = await segmentUnpunctuatedDocument(body, {
  language: 'ar',
  aiAssisted: true
});

console.log('\n✅ Segmentation result:');
console.log('Paragraphs:', result.paragraphs?.length || 0);

// Run strict validation
if (result.paragraphs?.length > 0) {
  console.log('\n🔍 Running strict validation...');
  const validation = validateSegmentationStrict(body, result.paragraphs);
  console.log('Valid:', validation.valid);
  if (!validation.valid) {
    console.log('Issues:', JSON.stringify(validation.issues.slice(0, 5), null, 2));
  } else {
    console.log('\n✅ VALIDATION PASSED! No word duplications or deletions.');

    // Show stats
    const totalSentences = result.paragraphs.reduce((sum, p) => sum + (p.sentenceCount || 0), 0);
    console.log('Stats:');
    console.log('  Paragraphs:', result.paragraphs.length);
    console.log('  Total sentences:', totalSentences);

    // Show first paragraph with markers
    console.log('\nFirst paragraph (with markers):');
    console.log(result.paragraphs[0].text.substring(0, 500) + '...');
  }
}
