#!/usr/bin/env node
/**
 * Link Source Files to Database Records
 *
 * Scans the Ocean Library source folder and matches documents
 * to database records, then updates file_path for each match.
 *
 * This is critical for:
 * - Detecting source file changes
 * - Re-ingesting when sources are updated
 * - Maintaining document integrity
 *
 * Usage:
 *   node scripts/link-source-files.js --dry-run  # Preview matches
 *   node scripts/link-source-files.js            # Apply matches
 */

import '../api/lib/config.js';
import { query, queryAll, queryOne } from '../api/lib/db.js';
import { readdir, readFile, stat } from 'fs/promises';
import { join, basename } from 'path';
import matter from 'gray-matter';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// Source library path
const LIBRARY_ROOT = '/Users/chad/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library';

/**
 * Recursively find all markdown files in a directory
 */
async function findMarkdownFiles(dir) {
  const files = [];

  async function scan(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  await scan(dir);
  return files;
}

/**
 * Extract document ID from filename
 * Examples:
 *   001-Address-to-Believers.md -> 001_address_to_believers
 *   Tablet-of-Wisdom.md -> tablet_of_wisdom
 */
function filenameToId(filename) {
  return basename(filename, '.md')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Parse frontmatter and get document metadata
 */
async function parseSourceFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = matter(content);

    return {
      path: filePath,
      filename: basename(filePath),
      filenameId: filenameToId(basename(filePath)),
      title: parsed.data.title || null,
      author: parsed.data.author || null,
      language: parsed.data.language || 'en',
      contentLength: parsed.content.length
    };
  } catch (err) {
    console.error(`Error parsing ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Try to find a matching database record for a source file
 */
async function findMatch(sourceFile, allDocs) {
  // Strategy 1: Exact ID match
  const exactMatch = allDocs.find(d => d.id === sourceFile.filenameId);
  if (exactMatch) {
    return { doc: exactMatch, matchType: 'exact_id' };
  }

  // Strategy 2: ID contains filename ID
  const containsMatch = allDocs.find(d =>
    d.id.includes(sourceFile.filenameId) ||
    sourceFile.filenameId.includes(d.id)
  );
  if (containsMatch) {
    return { doc: containsMatch, matchType: 'partial_id' };
  }

  // Strategy 3: Title match (normalize both)
  const normalizeTitle = (t) => t?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
  const sourceTitle = normalizeTitle(sourceFile.title);

  if (sourceTitle) {
    const titleMatch = allDocs.find(d =>
      normalizeTitle(d.title) === sourceTitle
    );
    if (titleMatch) {
      return { doc: titleMatch, matchType: 'title' };
    }
  }

  return null;
}

async function main() {
  console.log('\n=== Link Source Files to Database ===');
  console.log('Library root:', LIBRARY_ROOT);
  console.log('Mode:', dryRun ? 'DRY RUN (no changes)' : 'APPLY CHANGES');

  // Find all markdown files
  console.log('\nScanning for source files...');
  const sourceFiles = await findMarkdownFiles(LIBRARY_ROOT);
  console.log(`Found ${sourceFiles.length} markdown files`);

  // Get all database documents
  const allDocs = await queryAll(`
    SELECT id, title, author, language, file_path
    FROM docs
  `);
  console.log(`Found ${allDocs.length} documents in database`);

  // Track unmatched docs for reporting
  const unmatchedDocs = new Set(allDocs.map(d => d.id));

  // Parse source files and find matches
  const matches = [];
  const unmatched = [];

  console.log('\nMatching source files to database records...\n');

  for (const filePath of sourceFiles) {
    const sourceFile = await parseSourceFile(filePath);
    if (!sourceFile) continue;

    const match = await findMatch(sourceFile, allDocs);

    if (match) {
      matches.push({
        docId: match.doc.id,
        docTitle: match.doc.title,
        filePath: sourceFile.path,
        matchType: match.matchType
      });
      unmatchedDocs.delete(match.doc.id);
    } else {
      unmatched.push(sourceFile);
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Matched: ${matches.length}`);
  console.log(`Unmatched source files: ${unmatched.length}`);
  console.log(`Unmatched database docs: ${unmatchedDocs.size}`);

  // Show sample matches
  console.log('\n=== Sample Matches (first 10) ===');
  matches.slice(0, 10).forEach(m => {
    console.log(`  ${m.docId}`);
    console.log(`    → ${m.filePath.replace(LIBRARY_ROOT, '.')}`);
    console.log(`    (${m.matchType})`);
  });

  // Show unmatched source files
  if (unmatched.length > 0) {
    console.log(`\n=== Unmatched Source Files (first 10) ===`);
    unmatched.slice(0, 10).forEach(f => {
      console.log(`  ${f.path.replace(LIBRARY_ROOT, '.')}`);
      console.log(`    Title: ${f.title}`);
      console.log(`    Filename ID: ${f.filenameId}`);
    });
  }

  // Apply changes
  if (!dryRun && matches.length > 0) {
    console.log('\n=== Applying Changes ===');

    let updated = 0;
    for (const match of matches) {
      await query(
        'UPDATE docs SET file_path = ? WHERE id = ?',
        [match.filePath, match.docId]
      );
      updated++;
    }

    console.log(`Updated ${updated} documents with file paths`);
  }

  if (dryRun) {
    console.log('\n--- DRY RUN: No changes made ---');
    console.log('Run without --dry-run to apply changes');
  }
}

main().catch(console.error);
