#!/usr/bin/env node
/**
 * Fix Meilisearch vector opt-out fields.
 *
 * When the embedder config is accidentally cleared and re-applied, Meilisearch
 * requires ALL documents to have _vectors.default (either a real vector or null).
 * This script batch-updates all documents to add _vectors.default: null,
 * then re-applies the embedder config.
 *
 * This does NOT re-generate embeddings — it just adds the opt-out field.
 * The sync worker will then incrementally push real vectors for docs that have them.
 *
 * Usage: MEILI_MASTER_KEY=xxx node scripts/fix-meili-vectors.js
 */

const MEILI_URL = process.env.MEILI_HOST || 'http://localhost:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY;
const INDEX = 'paragraphs';
const BATCH_SIZE = 1000;
const DIMENSIONS = 3072;

if (!MEILI_KEY) {
  console.error('Set MEILI_MASTER_KEY env var');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${MEILI_KEY}`
};

async function meili(path, opts = {}) {
  const res = await fetch(`${MEILI_URL}${path}`, { headers, ...opts });
  return res.json();
}

async function waitForTask(taskUid) {
  while (true) {
    const task = await meili(`/tasks/${taskUid}`);
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') {
      console.error(`Task ${taskUid} failed:`, task.error?.message?.slice(0, 200));
      return task;
    }
    await new Promise(r => setTimeout(r, 5000));
  }
}

async function main() {
  console.log('=== Meilisearch Vector Opt-Out Fix ===\n');

  // Check current state
  const stats = await meili(`/indexes/${INDEX}/stats`);
  console.log(`Index: ${stats.numberOfDocuments} documents, ${stats.numberOfEmbeddings} embeddings`);

  const embedders = await meili(`/indexes/${INDEX}/settings/embedders`);
  console.log(`Embedder config: ${embedders?.default ? 'present' : 'MISSING'}\n`);

  // Step 1: Batch-update all documents to add _vectors.default: null
  console.log('Step 1: Adding _vectors.default: null to all documents...');

  let offset = 0;
  let totalProcessed = 0;
  let taskUids = [];

  while (true) {
    // Fetch batch of document IDs
    const docs = await meili(`/indexes/${INDEX}/documents?limit=${BATCH_SIZE}&offset=${offset}&fields=id`);
    const results = docs.results || [];
    if (results.length === 0) break;

    // Build update batch with null vectors
    const updates = results.map(doc => ({
      id: doc.id,
      _vectors: { default: null }
    }));

    // Submit update (don't wait for each one)
    const task = await meili(`/indexes/${INDEX}/documents`, {
      method: 'POST',
      body: JSON.stringify(updates)
    });
    taskUids.push(task.taskUid);
    totalProcessed += results.length;

    process.stdout.write(`  ${totalProcessed} / ${stats.numberOfDocuments} documents updated (task ${task.taskUid})\r`);

    offset += BATCH_SIZE;

    // Every 10 batches, wait for the oldest task to avoid overwhelming Meilisearch
    if (taskUids.length >= 10) {
      await waitForTask(taskUids.shift());
    }
  }

  console.log(`\n  Waiting for remaining ${taskUids.length} tasks...`);
  for (const uid of taskUids) {
    const result = await waitForTask(uid);
    if (result.status === 'failed') {
      console.error('  FAILED — aborting. Fix the error and re-run.');
      process.exit(1);
    }
  }
  console.log(`  ✓ All ${totalProcessed} documents updated with _vectors opt-out\n`);

  // Step 2: Apply embedder config
  console.log('Step 2: Applying embedder config...');
  const settingsTask = await meili(`/indexes/${INDEX}/settings`, {
    method: 'PATCH',
    body: JSON.stringify({
      embedders: {
        default: { source: 'userProvided', dimensions: DIMENSIONS }
      }
    })
  });
  console.log(`  Settings task: ${settingsTask.taskUid}`);
  const settingsResult = await waitForTask(settingsTask.taskUid);
  if (settingsResult.status === 'succeeded') {
    console.log(`  ✓ Embedder config applied (${settingsResult.duration})\n`);
  } else {
    console.error('  ✗ Embedder config FAILED');
    process.exit(1);
  }

  // Step 3: Verify
  const finalEmbedders = await meili(`/indexes/${INDEX}/settings/embedders`);
  console.log('Verification:');
  console.log(`  Embedder: ${finalEmbedders?.default ? 'present' : 'MISSING'}`);
  console.log(`  Dimensions: ${finalEmbedders?.default?.dimensions}`);
  console.log(`  Source: ${finalEmbedders?.default?.source}`);

  console.log('\n=== Done. The sync worker will now incrementally push real vectors. ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
