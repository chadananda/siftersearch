#!/usr/bin/env node
/**
 * Segmentation Status Scanner
 *
 * Scans a directory of documents and reports which ones need segmentation,
 * which are already segmented, and which don't need it.
 *
 * Usage:
 *   node scripts/segment-status.js [directory]  # Defaults to library base path
 *   node scripts/segment-status.js --needs       # Only show docs needing segmentation
 *   node scripts/segment-status.js --segmented   # Only show already-segmented docs
 *   node scripts/segment-status.js <file>        # Check a single file
 */

import { readFileSync, statSync, readdirSync } from 'fs';
import { resolve, join, extname, relative } from 'path';
import { getSegmentationStatus } from '../api/services/segmenter.js';

const args = process.argv.slice(2);
const showNeeds = args.includes('--needs');
const showSegmented = args.includes('--segmented');
const showAll = !showNeeds && !showSegmented;

const target = args.find(a => !a.startsWith('--'));

// Default to library base path from config
const defaultLibraryBase = `${process.env.HOME || '/home/chad'}/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library`;
const targetPath = resolve(target || process.env.LIBRARY_BASE_PATH || defaultLibraryBase);

/**
 * Strip YAML frontmatter from document text.
 */
function stripFrontmatter(raw) {
  const fmMatch = raw.match(/^---\n([\s\S]*?\n)---\n/);
  if (!fmMatch) return { body: raw, meta: {} };

  const body = raw.slice(fmMatch[0].length);
  // Extract language from frontmatter if present
  const langMatch = fmMatch[1].match(/^language:\s*(.+)$/m);
  const meta = {};
  if (langMatch) meta.language = langMatch[1].trim();
  return { body, meta };
}

/**
 * Recursively find all markdown files in a directory.
 */
function findMarkdownFiles(dirPath, results = []) {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      findMarkdownFiles(fullPath, results);
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Check a single file and return its status.
 */
function checkFile(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const { body, meta } = stripFrontmatter(raw);
  return getSegmentationStatus(body, meta);
}

// Single file mode
const stat = statSync(targetPath);
if (stat.isFile()) {
  const status = checkFile(targetPath);
  console.log(`${targetPath}`);
  console.log(`  Status: ${status.status}`);
  if (status.format) console.log(`  Format: ${status.format}`);
  if (status.language) console.log(`  Language: ${status.language}`);
  if (status.wordCount) console.log(`  Words: ${status.wordCount.toLocaleString()}`);
  console.log(`  Reason: ${status.reason}`);
  process.exit(0);
}

// Directory scan mode
console.log(`Scanning: ${targetPath}\n`);

const files = findMarkdownFiles(targetPath);
const results = { segmented: [], needs: [], skip: [] };
let totalWords = 0;

for (const filePath of files) {
  try {
    const status = checkFile(filePath);
    const rel = relative(targetPath, filePath);

    if (status.status === 'segmented') {
      results.segmented.push({ path: rel, ...status });
    } else if (status.status === 'needs-segmentation') {
      results.needs.push({ path: rel, ...status });
      totalWords += status.wordCount || 0;
    } else {
      results.skip.push({ path: rel, ...status });
    }
  } catch (err) {
    console.error(`  Error reading ${filePath}: ${err.message}`);
  }
}

// Output
if (showAll || showNeeds) {
  if (results.needs.length > 0) {
    console.log(`=== NEEDS SEGMENTATION (${results.needs.length} documents, ~${totalWords.toLocaleString()} words) ===\n`);
    // Sort by word count descending (largest first)
    results.needs.sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0));
    for (const r of results.needs) {
      console.log(`  ${r.wordCount?.toLocaleString().padStart(8)} words  ${r.language}  ${r.path}`);
    }
    console.log();
  } else {
    console.log('No documents need segmentation.\n');
  }
}

if (showAll || showSegmented) {
  if (results.segmented.length > 0) {
    console.log(`=== ALREADY SEGMENTED (${results.segmented.length} documents) ===\n`);
    for (const r of results.segmented) {
      console.log(`  [${r.format}]  ${r.path}`);
    }
    console.log();
  }
}

if (showAll) {
  console.log(`=== SUMMARY ===`);
  console.log(`  Total documents:        ${files.length}`);
  console.log(`  Needs segmentation:     ${results.needs.length} (~${totalWords.toLocaleString()} words)`);
  console.log(`  Already segmented:      ${results.segmented.length}`);
  console.log(`  No segmentation needed: ${results.skip.length}`);
}
