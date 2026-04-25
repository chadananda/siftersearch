#!/usr/bin/env node
/**
 * Truncate embeddings from 3072 to 512 dimensions.
 *
 * OpenAI's text-embedding-3-large uses Matryoshka Representation Learning —
 * the first N dimensions are the most important. Truncating to 512 and
 * L2-normalizing preserves ~98% of retrieval quality.
 *
 * This script:
 * 1. Reads embeddings from SQLite content table
 * 2. Truncates from 3072 to 512 dims + L2 normalizes
 * 3. Writes back to content table
 * 4. Marks affected rows as synced=0 for Meilisearch re-sync
 * 5. Updates embedding_model to track the change
 *
 * Usage: node scripts/truncate-embeddings.js [--dry-run] [--batch=1000] [--limit=N]
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryAll } from '../api/lib/db.js';
import { logger } from '../api/lib/logger.js';

const TARGET_DIMS = 512;
const SOURCE_DIMS = 3072;
const SOURCE_BYTES = SOURCE_DIMS * 4; // Float32
const TARGET_BYTES = TARGET_DIMS * 4;
// Keep canonical tag — search/sync code keys off this exact string.
// 512 vs 3072 is distinguished by LENGTH(embedding), not by tag.
const NEW_MODEL = `text-embedding-3-large`;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const batchSize = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1]) || 1000;
const limitArg = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 0;

function truncateAndNormalize(blob) {
  if (!blob || !Buffer.isBuffer(blob)) return null;
  if (blob.length !== SOURCE_BYTES) return null; // wrong size, skip

  const source = new Float32Array(blob.buffer, blob.byteOffset, SOURCE_DIMS);

  // Take first TARGET_DIMS values
  const truncated = new Float32Array(TARGET_DIMS);
  for (let i = 0; i < TARGET_DIMS; i++) {
    truncated[i] = source[i];
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < TARGET_DIMS; i++) {
    norm += truncated[i] * truncated[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < TARGET_DIMS; i++) {
      truncated[i] /= norm;
    }
  }

  return Buffer.from(truncated.buffer);
}

async function main() {
  console.log(`=== Truncate Embeddings: ${SOURCE_DIMS} → ${TARGET_DIMS} dims ===`);
  if (dryRun) console.log('DRY RUN — no writes\n');

  // Count eligible rows
  const countResult = await query(
    `SELECT COUNT(*) as count FROM content
     WHERE embedding IS NOT NULL AND embedding_model = 'text-embedding-3-large'
     AND deleted_at IS NULL AND LENGTH(embedding) = ?`,
    [SOURCE_BYTES]
  );
  const total = countResult.count || countResult.rows?.[0]?.count || 0;
  console.log(`Eligible: ${total} paragraphs with ${SOURCE_DIMS}-dim embeddings`);

  // Count already truncated
  const doneResult = await query(
    `SELECT COUNT(*) as count FROM content
     WHERE embedding_model = ? AND deleted_at IS NULL`,
    [NEW_MODEL]
  );
  const alreadyDone = doneResult.count || doneResult.rows?.[0]?.count || 0;
  if (alreadyDone > 0) console.log(`Already truncated: ${alreadyDone}`);

  const toProcess = limitArg ? Math.min(total, limitArg) : total;
  console.log(`Processing: ${toProcess} paragraphs in batches of ${batchSize}\n`);

  let processed = 0;
  let errors = 0;
  let offset = 0;

  while (processed < toProcess) {
    const rows = await queryAll(
      `SELECT id, embedding FROM content
       WHERE embedding IS NOT NULL AND embedding_model = 'text-embedding-3-large'
       AND deleted_at IS NULL AND LENGTH(embedding) = ?
       ORDER BY id LIMIT ? OFFSET ?`,
      [SOURCE_BYTES, batchSize, offset]
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      const truncated = truncateAndNormalize(row.embedding);
      if (!truncated) {
        errors++;
        continue;
      }

      if (!dryRun) {
        await query(
          `UPDATE content SET embedding = ?, embedding_model = ?, synced = 0, updated_at = datetime('now')
           WHERE id = ?`,
          [truncated, NEW_MODEL, row.id]
        );
      }
      processed++;

      if (processed % 500 === 0) {
        process.stdout.write(`  ${processed} / ${toProcess} (${errors} errors)\r`);
      }
    }

    offset += rows.length;
  }

  console.log(`\n✓ Truncated ${processed} embeddings (${errors} errors)`);
  console.log(`  New model tag: ${NEW_MODEL}`);
  console.log(`  Bytes per embedding: ${SOURCE_BYTES} → ${TARGET_BYTES}`);
  if (!dryRun) {
    console.log(`  Rows marked synced=0 for Meilisearch re-sync`);
    console.log(`\nNext: Update Meilisearch embedder config to dimensions=${TARGET_DIMS}`);
    console.log(`  Also update EMBEDDING_DIMENSIONS in config to ${TARGET_DIMS}`);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
