#!/usr/bin/env node
/**
 * Queue Translation Jobs for Tablets of the Báb
 *
 * This script queues all Arabic/Farsi tablets by The Báb for translation.
 * Jobs are processed by the job-processor worker in priority order.
 *
 * Usage: node scripts/queue-bab-translations.js [--limit N] [--dry-run]
 */

// Load config first to populate env vars
import '../api/lib/config.js';
import { query, queryOne, queryAll } from '../api/lib/db.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;

async function main() {
  console.log('=== Queue Báb Tablets for Translation ===\n');

  if (dryRun) {
    console.log('DRY RUN - No jobs will be created\n');
  }

  // Get all Báb documents in Arabic/Farsi that haven't been fully translated
  // Note: Local DB uses 'doc_id', production uses 'document_id' - use doc_id for compatibility
  const documents = await queryAll(`
    SELECT
      d.id,
      d.title,
      d.language,
      d.collection,
      d.paragraph_count,
      (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id) as content_count,
      (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id AND c.translation IS NOT NULL) as translated_count
    FROM docs d
    WHERE d.author = 'The Báb'
      AND d.language IN ('ar', 'fa')
    ORDER BY d.paragraph_count ASC
    ${limit ? `LIMIT ${limit}` : ''}
  `);

  console.log(`Found ${documents.length} Arabic/Farsi documents by The Báb\n`);

  // Filter to only those needing translation
  const needsTranslation = documents.filter(d => d.translated_count < d.content_count);
  console.log(`${needsTranslation.length} documents need translation\n`);

  // Check for existing pending/processing jobs
  const existingJobs = await queryAll(`
    SELECT document_id FROM jobs
    WHERE type = 'translation' AND status IN ('pending', 'processing')
  `);
  const existingJobDocs = new Set(existingJobs.map(j => j.document_id));

  let queued = 0;
  let skippedExisting = 0;
  let skippedFullyTranslated = 0;

  for (const doc of needsTranslation) {
    // Skip if already queued
    if (existingJobDocs.has(doc.id)) {
      skippedExisting++;
      continue;
    }

    // Skip if fully translated
    if (doc.translated_count >= doc.content_count) {
      skippedFullyTranslated++;
      continue;
    }

    const remaining = doc.content_count - doc.translated_count;
    console.log(`[${doc.language.toUpperCase()}] ${doc.title} - ${remaining}/${doc.content_count} paragraphs need translation`);

    if (!dryRun) {
      // Get priority from collection
      let priority = 10; // Default high priority for core tablets
      if (doc.collection === 'Core Tablets') {
        priority = 10;
      } else if (doc.collection === 'Core Tablet Translations') {
        priority = 8;
      }

      const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const now = new Date().toISOString();

      await query(`
        INSERT INTO jobs (id, type, status, user_id, document_id, params, priority, progress, total_items, created_at)
        VALUES (?, 'translation', 'pending', ?, ?, ?, ?, ?, ?, ?)
      `, [
        jobId,
        'system', // System-initiated
        doc.id,
        JSON.stringify({ targetLanguage: 'en', sourceLanguage: doc.language }),
        priority,
        doc.translated_count,
        doc.content_count,
        now
      ]);

      queued++;
    } else {
      queued++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Queued: ${queued}`);
  console.log(`Skipped (already queued): ${skippedExisting}`);
  console.log(`Skipped (fully translated): ${skippedFullyTranslated}`);

  if (!dryRun && queued > 0) {
    console.log('\nJobs queued! The job processor will pick them up shortly.');
    console.log('Monitor progress: pm2 logs siftersearch-jobs');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
