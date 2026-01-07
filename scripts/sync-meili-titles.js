#!/usr/bin/env node

/**
 * Sync Meilisearch paragraph titles with corrected SQLite titles
 *
 * This script:
 * 1. Gets all docs from SQLite with their corrected titles
 * 2. Updates Meilisearch paragraphs to use the correct titles
 */

import { MeiliSearch } from 'meilisearch';
import { queryAll } from '../api/lib/db.js';

const MEILI_HOST = process.env.MEILISEARCH_HOST || 'http://localhost:7700';
const MEILI_KEY = process.env.MEILISEARCH_KEY || '';
const BATCH_SIZE = 1000;
const DRY_RUN = process.argv.includes('--dry-run');

const meili = new MeiliSearch({ host: MEILI_HOST, apiKey: MEILI_KEY });

async function syncTitles() {
  console.log('Sync Meilisearch Paragraph Titles');
  console.log('==================================');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`Meilisearch: ${MEILI_HOST}\n`);

  const paragraphsIndex = meili.index('paragraphs');

  // Get all docs with their titles from SQLite
  const docs = await queryAll(`SELECT id, title FROM docs`);
  const titleMap = new Map(docs.map(d => [d.id, d.title]));
  console.log(`Loaded ${docs.length} document titles from SQLite\n`);

  // Process Meilisearch paragraphs in batches
  let offset = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalMissing = 0;

  console.log('Scanning Meilisearch paragraphs...');

  while (true) {
    const result = await paragraphsIndex.getDocuments({
      limit: BATCH_SIZE,
      offset,
      fields: ['id', 'doc_id', 'title']
    });

    if (result.results.length === 0) break;

    const updates = [];

    for (const para of result.results) {
      const correctTitle = titleMap.get(para.doc_id);

      if (!correctTitle) {
        totalMissing++;
        continue;
      }

      if (para.title !== correctTitle) {
        updates.push({
          id: para.id,
          title: correctTitle
        });
      } else {
        totalSkipped++;
      }
    }

    if (updates.length > 0 && !DRY_RUN) {
      await paragraphsIndex.updateDocuments(updates);
      totalUpdated += updates.length;
      console.log(`  Updated ${totalUpdated} paragraphs...`);
    } else if (updates.length > 0) {
      totalUpdated += updates.length;
    }

    offset += BATCH_SIZE;

    if (offset % 10000 === 0) {
      console.log(`  Processed ${offset} paragraphs...`);
    }
  }

  console.log('\n==================================');
  console.log('Summary:');
  console.log(`  Updated: ${totalUpdated}`);
  console.log(`  Already correct: ${totalSkipped}`);
  console.log(`  Missing doc_id in SQLite: ${totalMissing}`);

  if (DRY_RUN) {
    console.log('\nThis was a dry run. Run without --dry-run to apply changes.');
  }
}

syncTitles().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
