#!/usr/bin/env node
/**
 * Fix Document ID Mismatch
 *
 * The database has short IDs (001_address_to_believers) while Meilisearch
 * has long IDs (baha_i_core_tablets_the_b_b_001_address_to_believers).
 *
 * This script finds all documents in Meilisearch, checks if they exist in
 * the database (possibly under a different ID), and either:
 * 1. Updates the database ID to match Meilisearch
 * 2. Re-syncs content from Meilisearch to database
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { MeiliSearch } from 'meilisearch';
import { createClient } from '@libsql/client';

const meili = new MeiliSearch({
  host: process.env.MEILI_HOST || 'http://localhost:7700',
  apiKey: process.env.MEILI_MASTER_KEY
});

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');

async function main() {
  console.log('🔧 Document ID Fixer');
  console.log('====================');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log('');

  // Get all documents from Meilisearch
  console.log('Fetching documents from Meilisearch...');
  const meiliDocs = await meili.index('documents').getDocuments({
    limit: 10000,
    fields: ['id', 'title', 'author', 'religion', 'collection', 'language', 'year']
  });
  console.log(`Found ${meiliDocs.results.length} documents in Meilisearch`);

  // Get all documents from database
  console.log('Fetching documents from database...');
  const dbDocs = await db.execute('SELECT id, title, author, religion, collection FROM docs');
  console.log(`Found ${dbDocs.rows.length} documents in database`);
  console.log('');

  // Create lookup maps
  const dbById = new Map(dbDocs.rows.map(d => [d.id, d]));
  const dbByTitle = new Map();
  for (const doc of dbDocs.rows) {
    const key = `${doc.title}|${doc.author}|${doc.religion}`;
    if (!dbByTitle.has(key)) dbByTitle.set(key, []);
    dbByTitle.get(key).push(doc);
  }

  // Find mismatches
  let matched = 0;
  let mismatched = 0;
  let missing = 0;
  let toFix = [];

  for (const meiliDoc of meiliDocs.results) {
    // Check if exact ID exists in DB
    if (dbById.has(meiliDoc.id)) {
      matched++;
      continue;
    }

    // Try to find by title/author/religion
    const key = `${meiliDoc.title}|${meiliDoc.author}|${meiliDoc.religion}`;
    const matches = dbByTitle.get(key);

    if (matches && matches.length > 0) {
      const dbDoc = matches[0];
      mismatched++;
      toFix.push({
        meiliId: meiliDoc.id,
        dbId: dbDoc.id,
        title: meiliDoc.title,
        author: meiliDoc.author
      });
      if (verbose) {
        console.log(`MISMATCH: "${meiliDoc.title}"`);
        console.log(`  Meili ID: ${meiliDoc.id}`);
        console.log(`  DB ID:    ${dbDoc.id}`);
      }
    } else {
      missing++;
      if (verbose) {
        console.log(`MISSING: "${meiliDoc.title}" by ${meiliDoc.author}`);
        console.log(`  Meili ID: ${meiliDoc.id}`);
      }
    }
  }

  console.log('Summary:');
  console.log(`  ✅ Matched: ${matched}`);
  console.log(`  ⚠️  Mismatched (different IDs): ${mismatched}`);
  console.log(`  ❌ Missing from DB: ${missing}`);
  console.log('');

  if (toFix.length === 0) {
    console.log('No fixes needed!');
    return;
  }

  console.log(`${dryRun ? 'Would fix' : 'Fixing'} ${toFix.length} mismatched documents...`);
  console.log('');

  // Fix mismatched IDs
  let fixed = 0;
  let errors = 0;

  for (const fix of toFix) {
    try {
      if (!dryRun) {
        // Update docs table
        await db.execute({
          sql: 'UPDATE docs SET id = ? WHERE id = ?',
          args: [fix.meiliId, fix.dbId]
        });
        // Update content table
        await db.execute({
          sql: 'UPDATE content SET doc_id = ? WHERE doc_id = ?',
          args: [fix.meiliId, fix.dbId]
        });
      }
      fixed++;
      if (verbose || !dryRun) {
        console.log(`${dryRun ? 'Would fix' : '✅ Fixed'}: ${fix.title}`);
        console.log(`   ${fix.dbId} → ${fix.meiliId}`);
      }
    } catch (err) {
      errors++;
      console.error(`❌ Error fixing ${fix.title}: ${err.message}`);
    }
  }

  console.log('');
  console.log('Results:');
  console.log(`  ✅ ${dryRun ? 'Would fix' : 'Fixed'}: ${fixed}`);
  console.log(`  ❌ Errors: ${errors}`);

  if (dryRun && toFix.length > 0) {
    console.log('');
    console.log('Run without --dry-run to apply changes.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
