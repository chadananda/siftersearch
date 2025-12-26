#!/usr/bin/env node

/**
 * Sync Library Nodes
 *
 * Populates the library_nodes table from existing Meilisearch data.
 * Creates religion and collection nodes based on document facets.
 *
 * Usage:
 *   node scripts/sync-library-nodes.js [--dry-run] [--force]
 *
 * Options:
 *   --dry-run  Show what would be done without making changes
 *   --force    Clear existing data and re-sync (updates authority values)
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

import { query, queryOne, queryAll } from '../api/lib/db.js';
import { getMeili, INDEXES } from '../api/lib/search.js';
import { logger } from '../api/lib/logger.js';

const dryRun = process.argv.includes('--dry-run');
const forceSync = process.argv.includes('--force');

/**
 * Convert a string to a URL-safe slug
 */
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[''`]/g, '')           // Remove apostrophes
    .replace(/á/g, 'a')              // Handle accented chars
    .replace(/í/g, 'i')
    .replace(/é/g, 'e')
    .replace(/ú/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')     // Replace non-alphanumeric with dash
    .replace(/^-+|-+$/g, '')         // Trim leading/trailing dashes
    .replace(/-+/g, '-');            // Collapse multiple dashes
}

/**
 * Get authority default for a religion/collection from authority config
 */
function getDefaultAuthority(religion, collection = null) {
  // Normalize religion name to handle accent/apostrophe variations
  const normalizeReligion = (r) => r.replace(/á/g, 'a').replace(/í/g, 'i').replace(/'/g, '');
  const normalized = normalizeReligion(religion);

  // These match the authority-config.yml values
  const religionAuthority = {
    "Bahai": 6,
    "Islam": 6,
    "Buddhism": 5,
    "Christianity": 5,
    "Judaism": 5,
    "Hinduism": 5,
    "General": 3
  };

  const collectionAuthority = {
    "Bahai": {
      "Core Tablets": 10,
      "Core Talks": 9,
      "Administrative": 8,
      "Compilations": 7,
      "Core Publications": 7,
      "Bahai Books": 5,
      "Historical": 4,
      "Studies Papers": 3,
      "Pilgrim Notes": 1
    },
    "Islam": {
      "Quran": 10,
      "Hadith": 8,
      "Tafsir": 6
    }
  };

  if (collection && collectionAuthority[normalized]?.[collection]) {
    return collectionAuthority[normalized][collection];
  }
  return religionAuthority[normalized] || 5;
}

async function syncLibraryNodes() {
  console.log('📚 Syncing Library Nodes from Meilisearch');
  console.log('=========================================');

  if (dryRun) {
    console.log('🔍 DRY RUN - No changes will be made\n');
  }

  if (forceSync && !dryRun) {
    console.log('🔄 FORCE SYNC - Clearing existing data...\n');
    await query('DELETE FROM library_nodes');
  }

  const meili = getMeili();

  // Get all documents grouped by religion and collection
  console.log('Fetching document facets from Meilisearch...');

  const searchResult = await meili.index(INDEXES.DOCUMENTS).search('', {
    limit: 0,
    facets: ['religion', 'collection']
  });

  const facets = searchResult.facetDistribution || {};
  const religions = Object.keys(facets.religion || {});
  const collections = Object.keys(facets.collection || {});

  console.log(`Found ${religions.length} religions and ${collections.length} collections\n`);

  // Get detailed breakdown by querying documents
  // We need to know which collections belong to which religions
  const docsResult = await meili.index(INDEXES.DOCUMENTS).search('', {
    limit: 10000,
    attributesToRetrieve: ['religion', 'collection']
  });

  // Build religion -> collections mapping with counts
  const religionCollections = {};
  for (const doc of docsResult.hits) {
    const religion = doc.religion || 'Uncategorized';
    const collection = doc.collection || 'General';

    if (!religionCollections[religion]) {
      religionCollections[religion] = {};
    }
    if (!religionCollections[religion][collection]) {
      religionCollections[religion][collection] = 0;
    }
    religionCollections[religion][collection]++;
  }

  // Check existing nodes
  let existingNodes = [];
  try {
    existingNodes = await queryAll('SELECT name, node_type FROM library_nodes');
  } catch (e) {
    // Table might not exist yet
    console.log('Note: library_nodes table does not exist yet. Run migrations first.\n');
    return;
  }

  const existingNames = new Set(existingNodes.map(n => `${n.node_type}:${n.name}`));

  // Create religion nodes
  console.log('Creating religion nodes...');
  const religionIds = {};
  let displayOrder = 0;

  for (const religion of Object.keys(religionCollections).sort()) {
    const key = `religion:${religion}`;
    if (existingNames.has(key)) {
      console.log(`  ⏭️  Skipping existing: ${religion}`);
      // Get the existing ID
      const existing = await queryOne('SELECT id FROM library_nodes WHERE node_type = ? AND name = ?', ['religion', religion]);
      if (existing) religionIds[religion] = existing.id;
      continue;
    }

    const slug = slugify(religion);
    const authority = getDefaultAuthority(religion);
    const docCount = Object.values(religionCollections[religion]).reduce((a, b) => a + b, 0);

    console.log(`  ➕ ${religion} (${slug}) - ${docCount} docs, authority: ${authority}`);

    if (!dryRun) {
      await query(
        `INSERT INTO library_nodes (parent_id, node_type, name, slug, authority_default, display_order)
         VALUES (NULL, 'religion', ?, ?, ?, ?)`,
        [religion, slug, authority, displayOrder]
      );
      // Get the inserted ID
      const inserted = await queryOne('SELECT id FROM library_nodes WHERE node_type = ? AND name = ?', ['religion', religion]);
      religionIds[religion] = inserted?.id;
    }
    displayOrder++;
  }

  // Create collection nodes under each religion
  console.log('\nCreating collection nodes...');

  for (const religion of Object.keys(religionCollections).sort()) {
    const religionId = religionIds[religion];
    if (!religionId) {
      if (dryRun) {
        // In dry-run, just show what would be created
        console.log(`  [dry-run] Would create collections under ${religion}`);
      } else {
        console.log(`  ⚠️  No religion ID for ${religion}, skipping collections`);
        continue;  // Skip this religion's collections
      }
    }

    let collectionOrder = 0;
    for (const collection of Object.keys(religionCollections[religion]).sort()) {
      const key = `collection:${collection}`;

      // Skip DB check in dry-run if we don't have a religionId
      let existingCollection = null;
      if (religionId) {
        existingCollection = await queryOne(
          'SELECT id FROM library_nodes WHERE node_type = ? AND name = ? AND parent_id = ?',
          ['collection', collection, religionId]
        );
      }

      if (existingCollection) {
        console.log(`  ⏭️  Skipping existing: ${religion} > ${collection}`);
        continue;
      }

      const slug = slugify(collection);
      const authority = getDefaultAuthority(religion, collection);
      const docCount = religionCollections[religion][collection];

      console.log(`  ➕ ${religion} > ${collection} (${slug}) - ${docCount} docs, authority: ${authority}`);

      if (!dryRun) {
        await query(
          `INSERT INTO library_nodes (parent_id, node_type, name, slug, authority_default, display_order)
           VALUES (?, 'collection', ?, ?, ?, ?)`,
          [religionId, collection, slug, authority, collectionOrder]
        );
      }
      collectionOrder++;
    }
  }

  console.log('\n✅ Sync complete!');

  if (!dryRun) {
    // Show summary
    const nodeCount = await queryOne('SELECT COUNT(*) as count FROM library_nodes');
    const religionCount = await queryOne("SELECT COUNT(*) as count FROM library_nodes WHERE node_type = 'religion'");
    const collectionCount = await queryOne("SELECT COUNT(*) as count FROM library_nodes WHERE node_type = 'collection'");

    console.log(`\nSummary:`);
    console.log(`  Total nodes: ${nodeCount.count}`);
    console.log(`  Religions: ${religionCount.count}`);
    console.log(`  Collections: ${collectionCount.count}`);
  }
}

syncLibraryNodes().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
