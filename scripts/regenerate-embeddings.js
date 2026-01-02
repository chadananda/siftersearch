#!/usr/bin/env node
/**
 * Regenerate Embeddings with Correct Model
 *
 * This script regenerates embeddings for paragraphs that were created with
 * the wrong embedding model (text-embedding-3-small instead of text-embedding-3-large).
 *
 * It processes in batches to avoid rate limits and updates the database
 * with new 3072-dimension embeddings for cross-lingual semantic search.
 *
 * Usage:
 *   node scripts/regenerate-embeddings.js [--dry-run] [--batch-size=50] [--limit=1000] [--language=ar]
 *
 * Options:
 *   --dry-run      Show what would be done without making changes
 *   --batch-size   Number of texts to embed in one API call (default: 50)
 *   --limit        Maximum paragraphs to process (default: all)
 *   --language     Only process specific language (e.g., ar, fa)
 *   --force        Regenerate even if model matches (for dimension fix)
 *   --include-missing  Also generate embeddings for paragraphs without any
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Load environment
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryAll, queryOne } from '../api/lib/db.js';
import { createEmbeddings } from '../api/lib/ai.js';
import { config } from '../api/lib/config.js';

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const includeMissing = args.includes('--include-missing');

function getArgValue(name, defaultValue) {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : defaultValue;
}

const batchSize = parseInt(getArgValue('batch-size', '50'), 10);
const limit = getArgValue('limit', null);
const language = getArgValue('language', null);

const TARGET_MODEL = config.ai.embeddings.model; // text-embedding-3-large
const TARGET_DIMENSIONS = config.ai.embeddings.dimensions; // 3072

async function main() {
  console.log('='.repeat(60));
  console.log('Embedding Regeneration: Upgrade to text-embedding-3-large');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`Target model: ${TARGET_MODEL}`);
  console.log(`Target dimensions: ${TARGET_DIMENSIONS}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Limit: ${limit || 'all'}`);
  console.log(`Language filter: ${language || 'all'}`);
  console.log(`Force regenerate: ${force}`);
  console.log(`Include missing: ${includeMissing}`);
  console.log('');

  // Count paragraphs needing regeneration (existing but wrong model)
  let countWrongQuery = `
    SELECT COUNT(*) as count
    FROM content
    WHERE embedding IS NOT NULL
  `;
  if (!force) {
    countWrongQuery += ` AND (embedding_model != ? OR embedding_model IS NULL)`;
  }
  if (language) {
    countWrongQuery += ` AND doc_id IN (SELECT id FROM docs WHERE language = ?)`;
  }
  const countWrongParams = [];
  if (!force) countWrongParams.push(TARGET_MODEL);
  if (language) countWrongParams.push(language);
  const { count: needsRegeneration } = await queryOne(countWrongQuery, countWrongParams);

  // Count paragraphs without any embedding
  let countMissingQuery = `SELECT COUNT(*) as count FROM content WHERE embedding IS NULL`;
  if (language) {
    countMissingQuery += ` AND doc_id IN (SELECT id FROM docs WHERE language = ?)`;
  }
  const countMissingParams = language ? [language] : [];
  const { count: noEmbedding } = await queryOne(countMissingQuery, countMissingParams);

  // Count paragraphs with correct model
  const { count: alreadyCorrect } = await queryOne(`
    SELECT COUNT(*) as count
    FROM content
    WHERE embedding IS NOT NULL
      AND embedding_model = ?
  `, [TARGET_MODEL]);

  // Total to process
  const totalToProcess = needsRegeneration + (includeMissing ? noEmbedding : 0);

  console.log('Current embedding status:');
  console.log(`  Already using ${TARGET_MODEL}: ${alreadyCorrect.toLocaleString()}`);
  console.log(`  Needs regeneration (wrong model): ${needsRegeneration.toLocaleString()}`);
  console.log(`  No embedding: ${noEmbedding.toLocaleString()}`);
  if (includeMissing) {
    console.log(`  Will process: ${totalToProcess.toLocaleString()} (regen + missing)`);
  } else {
    console.log(`  Will process: ${needsRegeneration.toLocaleString()} (use --include-missing for ${noEmbedding.toLocaleString()} more)`);
  }
  console.log('');

  if (totalToProcess === 0) {
    console.log('All embeddings are already using the correct model!');
    process.exit(0);
  }

  // Estimate cost (OpenAI text-embedding-3-large: $0.00013 per 1K tokens)
  // Average paragraph ~100 tokens
  const estimatedTokens = totalToProcess * 100;
  const estimatedCost = (estimatedTokens / 1000) * 0.00013;
  console.log(`Estimated cost: ~$${estimatedCost.toFixed(2)} (${(estimatedTokens / 1000).toFixed(0)}K tokens)`);
  console.log('');

  if (dryRun) {
    console.log('DRY RUN - no changes will be made');
    console.log('Run without --dry-run to perform actual regeneration');
    process.exit(0);
  }

  // Process in batches
  let processed = 0;
  let errors = 0;
  let totalTokens = 0;
  const startTime = Date.now();
  const maxToProcess = limit ? parseInt(limit, 10) : totalToProcess;

  console.log(`Processing up to ${maxToProcess.toLocaleString()} paragraphs...`);
  console.log('');

  while (processed < maxToProcess) {
    // Fetch batch of paragraphs needing regeneration or missing embeddings
    // Build query based on flags
    let fetchQuery = `
      SELECT c.id, c.text, c.doc_id, d.language
      FROM content c
      JOIN docs d ON d.id = c.doc_id
      WHERE (
    `;

    const conditions = [];
    const fetchParams = [];

    // Condition 1: Wrong or missing embedding model
    if (force) {
      conditions.push('c.embedding IS NOT NULL');
    } else {
      conditions.push('(c.embedding IS NOT NULL AND (c.embedding_model != ? OR c.embedding_model IS NULL))');
      fetchParams.push(TARGET_MODEL);
    }

    // Condition 2: Include paragraphs with no embedding at all
    if (includeMissing) {
      conditions.push('c.embedding IS NULL');
    }

    fetchQuery += conditions.join(' OR ');
    fetchQuery += ')';

    if (language) {
      fetchQuery += ` AND d.language = ?`;
      fetchParams.push(language);
    }

    fetchQuery += ` LIMIT ?`;
    fetchParams.push(batchSize);

    const paragraphs = await queryAll(fetchQuery, fetchParams);

    if (paragraphs.length === 0) {
      break;
    }

    try {
      // Generate new embeddings
      const texts = paragraphs.map(p => p.text);
      const { embeddings, usage } = await createEmbeddings(texts);

      if (usage?.totalTokens) {
        totalTokens += usage.totalTokens;
      }

      // Update each paragraph with new embedding
      for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i];
        const embedding = embeddings[i];

        // Convert Float64Array to Buffer for storage
        const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

        await query(`
          UPDATE content
          SET embedding = ?,
              embedding_model = ?,
              synced = 0,
              updated_at = datetime('now')
          WHERE id = ?
        `, [embeddingBuffer, TARGET_MODEL, para.id]);
      }

      processed += paragraphs.length;

      // Progress update
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = (maxToProcess - processed) / rate;
      const cost = (totalTokens / 1000) * 0.00013;

      console.log(
        `[${elapsed.toFixed(0)}s] Processed: ${processed.toLocaleString()}/${maxToProcess.toLocaleString()} ` +
        `(${(processed / maxToProcess * 100).toFixed(1)}%) | ` +
        `Tokens: ${(totalTokens / 1000).toFixed(1)}K ($${cost.toFixed(3)}) | ` +
        `ETA: ${remaining.toFixed(0)}s`
      );

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (err) {
      console.error(`Error processing batch: ${err.message}`);
      errors++;

      // If it's a rate limit, wait longer
      if (err.message.includes('rate') || err.message.includes('429')) {
        console.log('Rate limited, waiting 60 seconds...');
        await new Promise(resolve => setTimeout(resolve, 60000));
      } else {
        // Skip this batch on other errors
        break;
      }
    }
  }

  const totalTime = (Date.now() - startTime) / 1000;
  const finalCost = (totalTokens / 1000) * 0.00013;

  console.log('');
  console.log('='.repeat(60));
  console.log('Regeneration Complete');
  console.log('='.repeat(60));
  console.log(`Duration: ${totalTime.toFixed(1)}s`);
  console.log(`Paragraphs processed: ${processed.toLocaleString()}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total tokens: ${totalTokens.toLocaleString()}`);
  console.log(`Actual cost: $${finalCost.toFixed(4)}`);
  console.log('');
  console.log('Paragraphs are now marked synced=0 and will be pushed to Meilisearch');
  console.log('by the sync worker automatically.');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
