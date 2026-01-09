#!/usr/bin/env node
/**
 * Remove duplicate frontmatter blocks from source markdown files
 *
 * Some files have TWO frontmatter blocks:
 * 1. Modern structured metadata (keep this)
 * 2. Legacy metadata from PDF extraction (remove this)
 *
 * The legacy blocks are identifiable by:
 * - author: "Various"
 * - ocnmd_version: "2"
 * - processing_method: "pdf-extraction"
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';

const LIBRARY_PATH = '/home/chad/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library';

// Regex to find duplicate frontmatter: first block, then second block starting with ---
const DUPLICATE_FM_REGEX = /^(---\n[\s\S]*?\n---)\n(---\n[\s\S]*?\n---)\n/;

async function processFile(filePath, dryRun = true) {
  const content = await readFile(filePath, 'utf-8');

  const match = content.match(DUPLICATE_FM_REGEX);
  if (!match) {
    return { status: 'clean', file: filePath };
  }

  const [fullMatch, firstBlock, secondBlock] = match;

  // Check if second block has legacy markers
  const isLegacy = secondBlock.includes('author: "Various"') ||
                   secondBlock.includes('ocnmd_version:') ||
                   secondBlock.includes('processing_method:');

  if (!isLegacy) {
    return { status: 'unknown_duplicate', file: filePath, secondBlock: secondBlock.substring(0, 200) };
  }

  // Remove the second (legacy) frontmatter block
  const fixedContent = content.replace(DUPLICATE_FM_REGEX, '$1\n');

  if (dryRun) {
    return { status: 'would_fix', file: filePath };
  }

  await writeFile(filePath, fixedContent);
  return { status: 'fixed', file: filePath };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--fix');
  const verbose = args.includes('--verbose');

  console.log(`Scanning ${LIBRARY_PATH}...`);
  if (dryRun) {
    console.log('DRY RUN - use --fix to actually modify files\n');
  }

  const files = await glob('**/*.md', { cwd: LIBRARY_PATH });
  console.log(`Found ${files.length} markdown files\n`);

  const stats = { clean: 0, would_fix: 0, fixed: 0, unknown: 0, errors: 0 };

  for (const file of files) {
    const fullPath = join(LIBRARY_PATH, file);
    try {
      const result = await processFile(fullPath, dryRun);

      if (result.status === 'would_fix' || result.status === 'fixed') {
        console.log(`${result.status === 'fixed' ? '✅' : '🔍'} ${file}`);
        stats[result.status === 'fixed' ? 'fixed' : 'would_fix']++;
      } else if (result.status === 'unknown_duplicate') {
        if (verbose) {
          console.log(`⚠️  Unknown duplicate: ${file}`);
          console.log(`   Preview: ${result.secondBlock.substring(0, 100)}...`);
        }
        stats.unknown++;
      } else {
        stats.clean++;
      }
    } catch (err) {
      console.log(`❌ Error processing ${file}: ${err.message}`);
      stats.errors++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Clean files: ${stats.clean}`);
  console.log(`${dryRun ? 'Would fix' : 'Fixed'}: ${dryRun ? stats.would_fix : stats.fixed}`);
  console.log(`Unknown duplicates: ${stats.unknown}`);
  console.log(`Errors: ${stats.errors}`);
}

main().catch(console.error);
