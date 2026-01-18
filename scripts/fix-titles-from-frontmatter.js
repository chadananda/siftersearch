#!/usr/bin/env node
/**
 * Fix document titles by reading frontmatter from source files
 * Only fixes docs where title == author (the known data quality issue)
 */

import { query, queryAll } from '../api/lib/db.js';
import { parseMarkdownFrontmatter } from '../api/services/ingester.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const LIBRARY_ROOT = process.env.LIBRARY_ROOT || '/home/chad/sifter/library';

async function fixTitles() {
  // Get docs where title appears to equal author (normalized comparison)
  const docs = await queryAll(`
    SELECT id, file_path, title, author
    FROM docs
    WHERE file_path IS NOT NULL
      AND title IS NOT NULL
      AND author IS NOT NULL
  `);

  console.log(`Checking ${docs.length} documents...`);

  let fixed = 0;
  let skipped = 0;
  let notFound = 0;

  for (const doc of docs) {
    // Normalize for comparison
    const normTitle = doc.title?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`']/g, "'");
    const normAuthor = doc.author?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''`']/g, "'");

    // Only fix if title == author
    if (normTitle !== normAuthor) {
      skipped++;
      continue;
    }

    // Read the source file
    const filePath = path.join(LIBRARY_ROOT, doc.file_path);
    if (!existsSync(filePath)) {
      notFound++;
      continue;
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      const { metadata } = parseMarkdownFrontmatter(content);

      if (metadata.title && metadata.title !== doc.title) {
        await query(`UPDATE docs SET title = ? WHERE id = ?`, [metadata.title, doc.id]);
        console.log(`  ${doc.id}: "${doc.title}" → "${metadata.title}"`);
        fixed++;
      }
    } catch (err) {
      console.error(`Error processing ${doc.file_path}: ${err.message}`);
    }
  }

  console.log(`\nDone!`);
  console.log(`  Fixed: ${fixed}`);
  console.log(`  Skipped (title != author): ${skipped}`);
  console.log(`  File not found: ${notFound}`);

  process.exit(0);
}

fixTitles().catch(err => {
  console.error(err);
  process.exit(1);
});
