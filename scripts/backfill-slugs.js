#!/usr/bin/env node
/**
 * Backfill Slugs Script
 *
 * Generates URL slugs for all documents in the database.
 * Handles duplicates by appending numbers (e.g., tablet-of-wisdom-2).
 *
 * Usage:
 *   node scripts/backfill-slugs.js           # Preview changes (dry run)
 *   node scripts/backfill-slugs.js --apply   # Apply changes to database
 *   node scripts/backfill-slugs.js --stats   # Show statistics only
 */

import '../api/lib/config.js';
import { query, queryAll } from '../api/lib/db.js';
import { generateSlug, generateUniqueSlug, slugifyPath } from '../api/lib/slug.js';
import { logger } from '../api/lib/logger.js';

const args = process.argv.slice(2);
const applyChanges = args.includes('--apply');
const statsOnly = args.includes('--stats');

async function backfillSlugs() {
  // Get all documents
  const docs = await queryAll(`
    SELECT id, title, religion, collection, slug
    FROM docs
    ORDER BY religion, collection, title
  `);

  console.log(`\n📚 Found ${docs.length} documents\n`);

  if (statsOnly) {
    const withSlugs = docs.filter(d => d.slug).length;
    const withoutSlugs = docs.filter(d => !d.slug).length;
    console.log(`  With slugs:    ${withSlugs}`);
    console.log(`  Without slugs: ${withoutSlugs}`);
    return;
  }

  // Track slugs per religion/collection to ensure uniqueness within each group
  const slugsByGroup = new Map(); // Map<"religion|collection", Set<slug>>

  const updates = [];
  const skipped = [];

  for (const doc of docs) {
    // Skip if already has a slug
    if (doc.slug) {
      // Track existing slug to avoid duplicates
      const groupKey = `${doc.religion}|${doc.collection}`;
      if (!slugsByGroup.has(groupKey)) {
        slugsByGroup.set(groupKey, new Set());
      }
      slugsByGroup.get(groupKey).add(doc.slug);
      skipped.push(doc);
      continue;
    }

    // Generate slug for title
    const groupKey = `${doc.religion}|${doc.collection}`;
    if (!slugsByGroup.has(groupKey)) {
      slugsByGroup.set(groupKey, new Set());
    }

    const existingSlugs = slugsByGroup.get(groupKey);
    const newSlug = generateUniqueSlug(doc.title, existingSlugs);

    // Track the new slug
    existingSlugs.add(newSlug);

    updates.push({
      id: doc.id,
      title: doc.title,
      religion: doc.religion,
      collection: doc.collection,
      slug: newSlug,
    });
  }

  console.log(`📊 Summary:`);
  console.log(`   Skipped (already have slugs): ${skipped.length}`);
  console.log(`   To update: ${updates.length}\n`);

  if (updates.length === 0) {
    console.log('✅ All documents already have slugs!');
    return;
  }

  // Show preview of updates
  console.log('📝 Preview of slug assignments:\n');

  // Group by religion/collection for cleaner output
  const grouped = {};
  for (const u of updates) {
    const key = `${u.religion} / ${u.collection}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(u);
  }

  let previewCount = 0;
  const maxPreview = 50;

  for (const [group, items] of Object.entries(grouped)) {
    if (previewCount >= maxPreview) {
      console.log(`   ... and ${updates.length - previewCount} more\n`);
      break;
    }

    console.log(`  ${group}:`);
    for (const item of items.slice(0, 10)) {
      console.log(`    "${item.title.substring(0, 40)}${item.title.length > 40 ? '...' : ''}"`);
      console.log(`      → ${item.slug}`);
      previewCount++;
      if (previewCount >= maxPreview) break;
    }
    if (items.length > 10) {
      console.log(`    ... and ${items.length - 10} more in this group`);
    }
    console.log();
  }

  // Show example URLs
  console.log('🔗 Example URLs:\n');
  const examples = updates.slice(0, 5);
  for (const ex of examples) {
    const religionSlug = slugifyPath(ex.religion);
    const collectionSlug = slugifyPath(ex.collection);
    console.log(`  /library/${religionSlug}/${collectionSlug}/${ex.slug}`);
  }
  console.log();

  if (!applyChanges) {
    console.log('⚠️  DRY RUN - No changes applied');
    console.log('   Run with --apply to update the database\n');
    return;
  }

  // Apply changes
  console.log('💾 Applying changes...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const u of updates) {
    try {
      await query('UPDATE docs SET slug = ? WHERE id = ?', [u.slug, u.id]);
      successCount++;
    } catch (err) {
      console.error(`  ❌ Error updating ${u.id}: ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Updated: ${successCount}`);
  if (errorCount > 0) {
    console.log(`   Errors: ${errorCount}`);
  }
}

// Run the backfill
backfillSlugs().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
