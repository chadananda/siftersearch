#!/usr/bin/env node
/**
 * Populate Content from Meilisearch
 *
 * Finds documents in the docs table that are missing content entries
 * and populates them from Meilisearch paragraphs.
 *
 * Run this on the production server to fix missing content.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryOne, queryAll } from '../api/lib/db.js';
import { getMeili, INDEXES } from '../api/lib/search.js';
import { nanoid } from 'nanoid';

const dryRun = process.argv.includes('--dry-run');
const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '100');

async function main() {
  console.log('📚 Populate Content from Meilisearch');
  console.log('=====================================');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Limit: ${limit} documents`);
  console.log('');

  const meili = getMeili();

  // Find documents with no content
  console.log('Finding documents with missing content...');
  const orphanedDocs = await queryAll(`
    SELECT d.id, d.title, d.paragraph_count, d.language
    FROM docs d
    LEFT JOIN content c ON c.doc_id = d.id
    WHERE d.paragraph_count > 0
    GROUP BY d.id
    HAVING COUNT(c.id) = 0
    LIMIT ?
  `, [limit]);

  console.log(`Found ${orphanedDocs.length} documents with missing content`);
  console.log('');

  if (orphanedDocs.length === 0) {
    console.log('✅ All documents have content!');
    return;
  }

  let fixed = 0;
  let errors = 0;

  for (const doc of orphanedDocs) {
    console.log(`📄 ${doc.title} (${doc.id})`);

    try {
      // Fetch paragraphs from Meilisearch
      const parasResult = await meili.index(INDEXES.PARAGRAPHS).search('', {
        filter: `document_id = "${doc.id}"`,
        limit: 10000,
        sort: ['paragraph_index:asc'],
        attributesToRetrieve: ['id', 'text', 'paragraph_index', 'heading', 'blocktype', '_vectors']
      });

      if (parasResult.hits.length === 0) {
        console.log(`   ⚠️  No paragraphs in Meilisearch`);
        errors++;
        continue;
      }

      console.log(`   Found ${parasResult.hits.length} paragraphs in Meilisearch`);

      if (!dryRun) {
        const now = new Date().toISOString();

        // Insert paragraphs
        for (const para of parasResult.hits) {
          const contentId = para.id || `${doc.id}_p${para.paragraph_index}_${nanoid(6)}`;
          const embedding = para._vectors?.default;
          const embeddingBlob = embedding ? Buffer.from(new Float32Array(embedding).buffer) : null;

          await query(`
            INSERT OR REPLACE INTO content
            (id, doc_id, paragraph_index, text, heading, blocktype, embedding, synced, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          `, [
            contentId,
            doc.id,
            para.paragraph_index || 0,
            para.text || '',
            para.heading || '',
            para.blocktype || 'paragraph',
            embeddingBlob,
            now,
            now
          ]);
        }

        console.log(`   ✅ Inserted ${parasResult.hits.length} paragraphs`);
      } else {
        console.log(`   Would insert ${parasResult.hits.length} paragraphs`);
      }

      fixed++;

    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
      errors++;
    }
  }

  console.log('');
  console.log('Summary:');
  console.log(`  ✅ ${dryRun ? 'Would fix' : 'Fixed'}: ${fixed}`);
  console.log(`  ❌ Errors: ${errors}`);

  if (dryRun) {
    console.log('');
    console.log('Run without --dry-run to apply changes.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
