#!/usr/bin/env node

/**
 * Rescue Embeddings Migration
 *
 * 1. Extract embeddings from old Meilisearch records (slug-based IDs)
 * 2. Match to LibSQL content by content_hash (SHA-256 of text)
 * 3. Store embeddings in LibSQL content table
 * 4. Delete orphan (slug-based) records from Meilisearch
 * 5. Reset sync flags to trigger reindex with stored embeddings
 */

import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Load env
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryOne, queryAll } from '../api/lib/db.js';
import { getMeili, INDEXES } from '../api/lib/search.js';

const BATCH_SIZE = 500; // Smaller batches since we need text field

// Hash text the same way LibSQL does
function hashContent(text) {
  return crypto.createHash('sha256').update(text || '').digest('hex');
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('🔍 Rescue Embeddings Migration');
  if (isDryRun) console.log('   (DRY RUN - no changes will be made)');
  console.log('');

  const meili = await getMeili();
  if (!meili) {
    console.error('❌ Meilisearch not available');
    process.exit(1);
  }

  const paragraphsIndex = meili.index(INDEXES.PARAGRAPHS);

  // Step 1: Get stats
  const stats = await paragraphsIndex.getStats();
  console.log(`📊 Meilisearch stats:`);
  console.log(`   Total paragraphs: ${stats.numberOfDocuments.toLocaleString()}`);
  console.log(`   With embeddings: ${stats.numberOfEmbeddings.toLocaleString()}\n`);

  if (stats.numberOfEmbeddings === 0) {
    console.log('ℹ️  No embeddings to rescue');
    return;
  }

  // Step 2: Find all slug-based records (IDs that start with a letter)
  // We need text field to compute hash for matching
  console.log('🔎 Scanning for records with embeddings...');

  let offset = 0;
  let embeddingsRescued = 0;
  let embeddingsNotMatched = 0;
  let embeddingsAlreadyHave = 0;
  let orphansToDelete = [];
  let slugBasedCount = 0;

  while (true) {
    const batch = await paragraphsIndex.getDocuments({
      limit: BATCH_SIZE,
      offset,
      fields: ['id', 'text', '_vectors'],
      retrieveVectors: true
    });

    if (!batch.results || batch.results.length === 0) break;

    for (const doc of batch.results) {
      const isSlugBased = /^[a-zA-Z]/.test(doc.id);

      if (isSlugBased) {
        slugBasedCount++;
        orphansToDelete.push(doc.id);

        // Check if this record has embeddings
        if (doc._vectors?.default && doc.text) {
          // Compute content hash from text
          const contentHash = hashContent(doc.text);
          const embedding = doc._vectors.default;

          // Find content record by hash
          const existing = await queryOne(
            'SELECT id, embedding FROM content WHERE content_hash = ?',
            [contentHash]
          );

          if (existing && !existing.embedding) {
            // Can rescue this embedding
            if (!isDryRun) {
              const buffer = Buffer.from(new Float32Array(embedding).buffer);
              await query(
                'UPDATE content SET embedding = ?, embedding_model = ? WHERE id = ?',
                [buffer, 'rescued-from-meili', existing.id]
              );
            }
            embeddingsRescued++;

            if (embeddingsRescued % 100 === 0) {
              console.log(`   ${isDryRun ? 'Would rescue' : 'Rescued'} ${embeddingsRescued} embeddings...`);
            }
          } else if (existing && existing.embedding) {
            embeddingsAlreadyHave++;
          } else if (!existing) {
            embeddingsNotMatched++;
          }
        }
      }
    }

    offset += batch.results.length;

    if (offset % 10000 === 0) {
      console.log(`   Scanned ${offset.toLocaleString()} records...`);
    }

    // Safety check
    if (offset > 1000000) {
      console.log('⚠️  Safety limit reached');
      break;
    }
  }

  console.log(`\n✅ Scan complete:`);
  console.log(`   Scanned: ${offset.toLocaleString()} records`);
  console.log(`   Slug-based (orphans): ${slugBasedCount.toLocaleString()}`);
  console.log(`   Embeddings to rescue: ${embeddingsRescued.toLocaleString()}`);
  console.log(`   Already have embedding: ${embeddingsAlreadyHave.toLocaleString()}`);
  console.log(`   Not matched (content changed): ${embeddingsNotMatched.toLocaleString()}`);

  if (isDryRun) {
    console.log('\n🔍 DRY RUN complete - no changes made');
    console.log('   Run without --dry-run to apply changes');
    return;
  }

  // Step 3: Delete orphan records from Meilisearch
  if (orphansToDelete.length > 0) {
    console.log(`\n🗑️  Deleting ${orphansToDelete.length.toLocaleString()} orphan records from Meilisearch...`);

    // Delete in batches
    for (let i = 0; i < orphansToDelete.length; i += BATCH_SIZE) {
      const batch = orphansToDelete.slice(i, i + BATCH_SIZE);
      await paragraphsIndex.deleteDocuments(batch);

      if ((i + BATCH_SIZE) % 10000 === 0) {
        console.log(`   Deleted ${Math.min(i + BATCH_SIZE, orphansToDelete.length).toLocaleString()}...`);
      }
    }

    console.log(`   ✅ Orphans deleted`);
  }

  // Step 4: Verify LibSQL embedding count
  const embeddingCount = await queryOne(
    'SELECT COUNT(*) as count FROM content WHERE embedding IS NOT NULL'
  );
  console.log(`\n📊 LibSQL now has ${embeddingCount?.count || 0} embeddings stored`);

  // Step 5: Reset sync flags to trigger reindex
  console.log('\n🔄 Resetting sync flags to trigger reindex...');
  await query('UPDATE content SET synced = 0');

  const unsyncedCount = await queryOne('SELECT COUNT(*) as count FROM content WHERE synced = 0');
  console.log(`   ${unsyncedCount?.count || 0} paragraphs will be reindexed`);

  console.log('\n✅ Migration complete!');
  console.log('   The sync-worker will now reindex all content using stored embeddings.');
  console.log('   Monitor with: pm2 logs siftersearch-api');
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
