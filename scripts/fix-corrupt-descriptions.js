#!/usr/bin/env node

/**
 * Fix Corrupt Description Values in Source Files
 *
 * Finds documents where description is a YAML artifact like ">-", ">", "|"
 * and replaces with a description derived from document content.
 */

import { query, queryAll } from '../api/lib/db.js';
import { config } from '../api/lib/config.js';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');
const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0');

// Patterns that indicate corrupt description values
const CORRUPT_PATTERNS = [
  /^>-?$/,           // >- or > alone
  /^[|>]$/,          // | or > alone
  /^">-?"$/,         // ">-" as literal string
  /^">"$/,           // ">" as literal string
  /^"\|"$/,          // "|" as literal string
  /^From\s+/i,       // "From path/to/file"
];

function isCorruptDescription(desc) {
  if (!desc || typeof desc !== 'string') return true;
  const trimmed = desc.trim();
  if (trimmed.length < 10) return true; // Too short to be useful
  return CORRUPT_PATTERNS.some(pattern => pattern.test(trimmed));
}

function extractDescriptionFromContent(content, maxLength = 300) {
  // Remove frontmatter
  const bodyMatch = content.match(/^---[\s\S]*?---\s*([\s\S]*)/);
  const body = bodyMatch ? bodyMatch[1] : content;

  // Remove markdown formatting
  let text = body
    .replace(/^#+\s+.*$/gm, '')           // Remove headings
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) -> text
    .replace(/!\[.*?\]\(.*?\)/g, '')      // Remove images
    .replace(/```[\s\S]*?```/g, '')       // Remove code blocks
    .replace(/`[^`]+`/g, '')              // Remove inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1')    // **bold** -> bold
    .replace(/\*([^*]+)\*/g, '$1')        // *italic* -> italic
    .replace(/^[-*+]\s+/gm, '')           // Remove list markers
    .replace(/^\d+\.\s+/gm, '')           // Remove numbered list markers
    .replace(/^>\s+/gm, '')               // Remove blockquotes
    .replace(/\n{2,}/g, '\n\n')           // Normalize newlines
    .trim();

  // Get first meaningful paragraph
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 30);
  if (paragraphs.length === 0) return null;

  let description = paragraphs[0].replace(/\s+/g, ' ').trim();

  // Truncate to maxLength at word boundary
  if (description.length > maxLength) {
    description = description.substring(0, maxLength);
    const lastSpace = description.lastIndexOf(' ');
    if (lastSpace > maxLength - 50) {
      description = description.substring(0, lastSpace);
    }
    description += '...';
  }

  return description;
}

async function main() {
  console.log('Fix Corrupt Descriptions in Source Files');
  console.log('========================================');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  // Find documents with potentially corrupt descriptions
  const docs = await queryAll(`
    SELECT id, file_path, title, description
    FROM docs
    WHERE deleted_at IS NULL
      AND (
        description IS NULL
        OR description = ''
        OR description = '>-'
        OR description = '>'
        OR description = '|'
        OR description LIKE '">-%'
        OR description LIKE 'From %'
        OR LENGTH(description) < 10
      )
    ORDER BY id
    ${limit > 0 ? `LIMIT ${limit}` : ''}
  `);

  console.log(`Found ${docs.length} documents with potentially corrupt descriptions`);
  console.log('');

  const libraryBase = config.library.basePath;
  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of docs) {
    try {
      const filePath = path.join(libraryBase, doc.file_path);

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        if (verbose) console.log(`⚠️  File not found: ${doc.file_path}`);
        skipped++;
        continue;
      }

      // Read file content
      const content = await fs.readFile(filePath, 'utf-8');
      const { data: frontmatter } = matter(content);

      // Check if frontmatter description is corrupt
      if (!isCorruptDescription(frontmatter.description)) {
        // Frontmatter is OK, just update database
        if (frontmatter.description !== doc.description) {
          if (!dryRun) {
            await query(
              'UPDATE docs SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [frontmatter.description, doc.id]
            );
          }
          fixed++;
          if (verbose) {
            console.log(`✅ DB only: ${doc.file_path.substring(0, 50)}`);
            console.log(`   Desc: ${frontmatter.description.substring(0, 60)}...`);
          }
        } else {
          skipped++;
        }
        continue;
      }

      // Generate description from content
      const newDescription = extractDescriptionFromContent(content);
      if (!newDescription) {
        if (verbose) console.log(`⚠️  Could not extract description: ${doc.file_path}`);
        skipped++;
        continue;
      }

      // Update source file
      frontmatter.description = newDescription;
      const newContent = matter.stringify(content.replace(/^---[\s\S]*?---\s*/, ''), frontmatter);

      if (!dryRun) {
        await fs.writeFile(filePath, newContent, 'utf-8');

        // Update database
        await query(
          'UPDATE docs SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newDescription, doc.id]
        );
      }

      fixed++;
      if (verbose || fixed % 50 === 0) {
        console.log(`✅ [${fixed}] ${doc.file_path.substring(0, 50)}`);
        if (verbose) {
          console.log(`   Old: ${doc.description || '(empty)'}`);
          console.log(`   New: ${newDescription.substring(0, 60)}...`);
        }
      }
    } catch (err) {
      console.error(`❌ Error processing doc ${doc.id}: ${err.message}`);
      errors++;
    }
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Fixed: ${fixed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);

  if (dryRun) {
    console.log('');
    console.log('(Dry run - no changes made. Remove --dry-run to apply changes.)');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
