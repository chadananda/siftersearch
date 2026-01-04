#!/usr/bin/env node
import '../api/lib/config.js';
import { queryAll } from '../api/lib/db.js';

// Check paragraph sizes for doc_KZVISu80WOVG
const paragraphs = await queryAll(`
  SELECT paragraph_index, LENGTH(text) as chars,
         SUBSTR(text, 1, 100) as preview,
         (LENGTH(text) - LENGTH(REPLACE(text, '⁅s', ''))) / 2 as marker_count
  FROM content
  WHERE doc_id = 'doc_KZVISu80WOVG'
  ORDER BY paragraph_index
`);

console.log("=== Paragraph Sizes ===");
console.log("Total:", paragraphs.length);

const sizes = paragraphs.map(p => p.chars);
console.log("Max chars:", Math.max(...sizes));
console.log("Min chars:", Math.min(...sizes));
console.log("Avg chars:", Math.round(sizes.reduce((a,b) => a+b, 0) / sizes.length));

// Distribution
const buckets = { '<500': 0, '500-1000': 0, '1000-1500': 0, '1500-2000': 0, '>2000': 0 };
paragraphs.forEach(p => {
  if (p.chars < 500) buckets['<500']++;
  else if (p.chars < 1000) buckets['500-1000']++;
  else if (p.chars < 1500) buckets['1000-1500']++;
  else if (p.chars < 2000) buckets['1500-2000']++;
  else buckets['>2000']++;
});
console.log("\nDistribution:", buckets);

// Show paragraphs > 1500 chars with details
const oversized = paragraphs.filter(p => p.chars > 1500);
if (oversized.length > 0) {
  console.log("\n⚠️ Oversized paragraphs (>1500 chars):");
  for (const p of oversized) {
    console.log(`  [${p.paragraph_index}] ${p.chars} chars, ~${p.marker_count} markers`);
    console.log(`    Preview: ${p.preview.substring(0, 60)}...`);
  }
} else {
  console.log("\n✅ No oversized paragraphs");
}
