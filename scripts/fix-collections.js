#!/usr/bin/env node

/**
 * Fix documents with collection='General' by extracting collection from file_path
 * Example: "Baha'i/Core Tablets/..." should have collection="Core Tablets"
 */

import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

const db = createClient({
  url: 'file:./data/sifter.db'
});

async function query(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return { rows: result.rows, changes: result.rowsAffected };
}

async function fixCollections() {
  console.log('Finding documents with collection="General" that have path-based collections...\n');

  // Find documents where collection is General but path suggests otherwise
  const docs = await query(`
    SELECT id, file_path, collection, religion
    FROM docs
    WHERE collection = 'General'
      AND file_path LIKE '%/%/%'
    ORDER BY file_path
  `);

  console.log(`Found ${docs.rows.length} documents with collection="General" and nested paths\n`);

  let updated = 0;
  let skipped = 0;

  for (const doc of docs.rows) {
    const parts = doc.file_path.split('/');
    if (parts.length < 2) {
      skipped++;
      continue;
    }

    const pathReligion = parts[0];
    const pathCollection = parts[1];

    // Skip if the path collection is generic (like author name folder directly)
    // We want actual collection names like "Core Tablets", "Essays", etc.
    if (!pathCollection || pathCollection === pathReligion) {
      skipped++;
      continue;
    }

    console.log(`${doc.file_path}`);
    console.log(`  Current: religion="${doc.religion}", collection="${doc.collection}"`);
    console.log(`  Fixed:   religion="${pathReligion}", collection="${pathCollection}"`);

    // Update the document
    await query(`
      UPDATE docs SET
        religion = ?,
        collection = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [pathReligion, pathCollection, doc.id]);

    // Mark paragraphs as unsynced so changes propagate to search
    await query(`UPDATE content SET synced = 0 WHERE doc_id = ?`, [doc.id]);

    updated++;
  }

  console.log(`\n✓ Updated ${updated} documents, skipped ${skipped}`);

  // Show collection summary after fix
  console.log('\n--- Collection Summary After Fix ---\n');
  const collections = await query(`
    SELECT collection, COUNT(*) as count
    FROM docs
    GROUP BY collection
    ORDER BY count DESC
    LIMIT 30
  `);

  for (const row of collections.rows) {
    console.log(`${row.count.toString().padStart(5)} ${row.collection}`);
  }
}

fixCollections().catch(console.error).finally(() => process.exit(0));
