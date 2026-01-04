#!/usr/bin/env node
import '../api/lib/config.js';
import { queryAll, query } from '../api/lib/db.js';

// Check paragraph sizes for doc_KZVISu80WOVG
const paragraphs = await queryAll(`
  SELECT paragraph_index, LENGTH(text) as chars
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

// Show paragraphs > 1500 chars
const oversized = paragraphs.filter(p => p.chars > 1500);
if (oversized.length > 0) {
  console.log("\n⚠️ Oversized paragraphs (>1500 chars):", oversized);
} else {
  console.log("\n✅ No oversized paragraphs");
}

// Delete the wrong document
console.log("\n=== Deleting wrong document doc_MRwA0k7vo6No ===");
await query('DELETE FROM content WHERE doc_id = ?', ['doc_MRwA0k7vo6No']);
await query('DELETE FROM docs WHERE id = ?', ['doc_MRwA0k7vo6No']);
console.log("✅ Deleted");
