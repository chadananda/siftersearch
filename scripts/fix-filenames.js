#!/usr/bin/env node
/**
 * Fix filename column for all documents
 * Extracts filename from file_path: "Baha'i/Core/Author - Title.md" -> "Author - Title"
 */

import { query, queryAll } from '../api/lib/db.js';

async function fixFilenames() {
  // Get all docs with file_path but missing or wrong filename
  const docs = await queryAll(`
    SELECT id, file_path, filename
    FROM docs
    WHERE file_path IS NOT NULL
  `);

  console.log(`Found ${docs.length} documents to check`);

  let fixed = 0;
  for (const doc of docs) {
    // Extract filename from path: "Baha'i/Core/Author - Title.md" -> "Author - Title"
    const filename = doc.file_path
      .split('/')
      .pop()
      ?.replace(/\.md$/i, '') || null;

    if (filename && filename !== doc.filename) {
      await query(`UPDATE docs SET filename = ? WHERE id = ?`, [filename, doc.id]);
      fixed++;
      if (fixed % 100 === 0) {
        console.log(`Fixed ${fixed} documents...`);
      }
    }
  }

  console.log(`\nDone! Fixed ${fixed} documents`);
  process.exit(0);
}

fixFilenames().catch(err => {
  console.error(err);
  process.exit(1);
});
