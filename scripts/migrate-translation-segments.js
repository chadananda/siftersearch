#!/usr/bin/env node
/**
 * One-time migration: Move translation_segments data into translation JSON
 *
 * This fixes documents where segments were stored in translation_segments column
 * instead of being embedded in the translation JSON field.
 *
 * Usage: node scripts/migrate-translation-segments.js [--dry-run]
 */

import { query, queryAll, queryOne } from '../api/lib/db.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function migrate() {
  console.log('Migration: Move translation_segments into translation JSON');
  console.log('Mode:', DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE');
  console.log('');

  // Find paragraphs that have translation_segments but:
  // 1. translation is NULL/empty, OR
  // 2. translation is a plain string (not JSON with segments)
  const paragraphs = await queryAll(`
    SELECT id, doc_id, paragraph_index, translation, translation_segments
    FROM content
    WHERE translation_segments IS NOT NULL
      AND translation_segments != ''
      AND translation_segments != 'null'
      AND length(translation_segments) > 4
  `);

  console.log(`Found ${paragraphs.length} paragraphs with translation_segments data`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const para of paragraphs) {
    try {
      // Parse existing translation (if any)
      let existingTranslation = null;
      let hasProperJson = false;

      if (para.translation && para.translation.length > 4) {
        try {
          existingTranslation = JSON.parse(para.translation);
          // Check if it's proper JSON format with reading/study/segments
          if (typeof existingTranslation === 'object' && existingTranslation !== null) {
            // Already has segments embedded?
            if (existingTranslation.segments && Array.isArray(existingTranslation.segments) && existingTranslation.segments.length > 0) {
              // Already has segments, skip
              skipped++;
              continue;
            }
            hasProperJson = true;
          }
        } catch {
          // Not JSON, treat as plain string translation
          existingTranslation = para.translation;
        }
      }

      // Parse translation_segments
      let segments = null;
      try {
        segments = JSON.parse(para.translation_segments);
        if (!Array.isArray(segments) && typeof segments === 'object') {
          // Might be object format {s1: {...}, s2: {...}}
          // Convert to array
          const keys = Object.keys(segments).filter(k => k.startsWith('s')).sort((a, b) => {
            const numA = parseInt(a.slice(1), 10);
            const numB = parseInt(b.slice(1), 10);
            return numA - numB;
          });
          segments = keys.map((key, idx) => ({
            id: idx,
            original: segments[key].original || '',
            translation: segments[key].translation || segments[key].text || ''
          }));
        }
      } catch {
        console.error(`  [ERROR] Failed to parse translation_segments for ${para.id}`);
        errors++;
        continue;
      }

      if (!segments || segments.length === 0) {
        skipped++;
        continue;
      }

      // Build new translation JSON
      let newTranslation;
      if (hasProperJson && typeof existingTranslation === 'object') {
        // Merge segments into existing JSON
        newTranslation = {
          ...existingTranslation,
          segments: segments
        };
      } else if (typeof existingTranslation === 'string' && existingTranslation.length > 0) {
        // Plain string translation - wrap in JSON with segments
        newTranslation = {
          reading: existingTranslation,
          study: null,
          segments: segments,
          notes: null
        };
      } else {
        // No existing translation - create from segments
        // Use joined segment translations as reading
        const readingText = segments.map(s => s.translation).join(' ');
        newTranslation = {
          reading: readingText || null,
          study: null,
          segments: segments,
          notes: null
        };
      }

      const newTranslationJson = JSON.stringify(newTranslation);

      if (DRY_RUN) {
        console.log(`  [DRY] Would update ${para.id}: ${newTranslationJson.slice(0, 100)}...`);
      } else {
        await query(
          'UPDATE content SET translation = ?, synced = 0 WHERE id = ?',
          [newTranslationJson, para.id]
        );
      }

      migrated++;
    } catch (err) {
      console.error(`  [ERROR] ${para.id}: ${err.message}`);
      errors++;
    }
  }

  console.log('');
  console.log('Migration complete:');
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped (already has segments): ${skipped}`);
  console.log(`  Errors: ${errors}`);

  if (DRY_RUN) {
    console.log('');
    console.log('This was a dry run. Run without --dry-run to apply changes.');
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
