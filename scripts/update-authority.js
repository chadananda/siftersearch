#!/usr/bin/env node
/**
 * Update authority values in Meilisearch from library meta.yaml files
 *
 * Usage: node scripts/update-authority.js [--collection "Collection Name"] [--religion "Religion"]
 */

import { getMeili, INDEXES } from '../api/lib/search.js';
import { getAuthority, reloadConfig } from '../api/lib/authority.js';

const args = process.argv.slice(2);
let filterCollection = null;
let filterReligion = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--collection' && args[i + 1]) {
    filterCollection = args[i + 1];
    i++;
  } else if (args[i] === '--religion' && args[i + 1]) {
    filterReligion = args[i + 1];
    i++;
  }
}

async function updateAuthority() {
  console.log('🔄 Updating authority values in Meilisearch...\n');

  // Reload authority config from meta.yaml files
  reloadConfig();

  const meili = getMeili();
  const documentsIndex = meili.index(INDEXES.DOCUMENTS);
  const paragraphsIndex = meili.index(INDEXES.PARAGRAPHS);

  // Build filter
  const filters = [];
  if (filterReligion) filters.push(`religion = "${filterReligion}"`);
  if (filterCollection) filters.push(`collection = "${filterCollection}"`);
  const filter = filters.length > 0 ? filters.join(' AND ') : undefined;

  console.log(filter ? `Filter: ${filter}` : 'No filter - updating all documents');

  // Get all documents
  let offset = 0;
  const limit = 1000;
  let totalUpdated = 0;
  let totalParagraphsUpdated = 0;

  while (true) {
    const result = await documentsIndex.search('', {
      filter,
      limit,
      offset,
      attributesToRetrieve: ['id', 'author', 'religion', 'collection', 'authority', 'title']
    });

    if (result.hits.length === 0) break;

    const updates = [];
    const paragraphUpdates = [];

    for (const doc of result.hits) {
      // Calculate new authority
      const newAuthority = getAuthority({
        author: doc.author,
        religion: doc.religion,
        collection: doc.collection,
        authority: null // Don't use existing value
      });

      // Only update if different
      if (doc.authority !== newAuthority) {
        updates.push({ id: doc.id, authority: newAuthority });
        console.log(`  ${doc.title?.slice(0, 50) || doc.id}: ${doc.authority} → ${newAuthority} (${doc.collection})`);
      }
    }

    if (updates.length > 0) {
      // Update documents
      await documentsIndex.updateDocuments(updates);
      totalUpdated += updates.length;

      // Update paragraphs for each updated document
      for (const update of updates) {
        const parasResult = await paragraphsIndex.search('', {
          filter: `doc_id = ${update.id}`,
          limit: 10000,
          attributesToRetrieve: ['id']
        });

        if (parasResult.hits.length > 0) {
          const paraUpdates = parasResult.hits.map(p => ({
            id: p.id,
            authority: update.authority
          }));
          paragraphUpdates.push(...paraUpdates);
        }
      }

      // Batch update paragraphs in chunks
      const CHUNK_SIZE = 1000;
      for (let i = 0; i < paragraphUpdates.length; i += CHUNK_SIZE) {
        const chunk = paragraphUpdates.slice(i, i + CHUNK_SIZE);
        await paragraphsIndex.updateDocuments(chunk);
      }
      totalParagraphsUpdated += paragraphUpdates.length;
    }

    offset += limit;

    if (result.hits.length < limit) break;
  }

  console.log(`\n✅ Updated ${totalUpdated} documents and ${totalParagraphsUpdated} paragraphs`);
}

updateAuthority().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
