#!/usr/bin/env node

/**
 * Fix Long Slugs Script
 *
 * Regenerates document slugs that exceed the 100 character limit.
 * Run with --dry-run to preview changes without applying them.
 */

import { createClient } from '@libsql/client';
import { generateDocSlug } from '../api/lib/slug.js';
import dotenv from 'dotenv';

dotenv.config();

const db = createClient({
  url: process.env.LIBSQL_URL || `file:${process.env.DB_PATH || './data/sifter.db'}`,
  authToken: process.env.LIBSQL_AUTH_TOKEN
});

const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');

async function main() {
  console.log(`\n🔧 Fixing long document slugs${dryRun ? ' (DRY RUN)' : ''}\n`);

  // Find documents with slugs > 100 chars
  const result = await db.execute(`
    SELECT id, slug, title, author, language, length(slug) as slug_length
    FROM docs
    WHERE length(slug) > 100
    ORDER BY slug_length DESC
  `);

  const docs = result.rows;

  if (docs.length === 0) {
    console.log('✅ No slugs exceed 100 characters. Nothing to fix.');
    return;
  }

  console.log(`Found ${docs.length} documents with slugs > 100 chars:\n`);

  let fixed = 0;
  let errors = 0;

  for (const doc of docs) {
    const oldSlug = doc.slug;
    const newSlug = generateDocSlug({
      author: doc.author,
      title: doc.title,
      language: doc.language
    });

    if (verbose || dryRun) {
      console.log(`📄 Doc ${doc.id}: "${doc.title?.slice(0, 40)}..."`);
      console.log(`   Old (${oldSlug.length} chars): ${oldSlug}`);
      console.log(`   New (${newSlug.length} chars): ${newSlug}`);
      console.log('');
    }

    if (!dryRun) {
      try {
        await db.execute({
          sql: 'UPDATE docs SET slug = ? WHERE id = ?',
          args: [newSlug, doc.id]
        });
        fixed++;
      } catch (err) {
        console.error(`❌ Error updating doc ${doc.id}: ${err.message}`);
        errors++;
      }
    } else {
      fixed++;
    }
  }

  console.log(`\n${dryRun ? 'Would fix' : 'Fixed'}: ${fixed} documents`);
  if (errors > 0) {
    console.log(`Errors: ${errors}`);
  }

  if (!dryRun) {
    console.log('\n✅ Done! Slugs have been updated.');
    console.log('   Note: Old URLs will continue to work via redirect lookup.');
  } else {
    console.log('\nRun without --dry-run to apply changes.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
