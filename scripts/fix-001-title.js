#!/usr/bin/env node
/**
 * Fix 001 Document Title
 *
 * Updates the title of doc_KZVISu80WOVG to include the numbered prefix
 * so it appears correctly in alphabetically sorted lists.
 *
 * Usage: node scripts/fix-001-title.js
 */

import { query, queryOne } from '../api/lib/db.js';
import { getMeili, INDEXES } from '../api/lib/search.js';

const DOC_ID = 'doc_KZVISu80WOVG';
const NEW_TITLE = '001-Address-to-Believers';

async function fix() {
  console.log('Fixing 001 document title...');

  // Check current state
  const doc = await queryOne('SELECT id, title, filename FROM docs WHERE id = ?', [DOC_ID]);

  if (!doc) {
    console.log('Document not found:', DOC_ID);
    process.exit(1);
  }

  console.log('Current title:', doc.title);
  console.log('New title:', NEW_TITLE);

  // Update SQLite
  await query(
    'UPDATE docs SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [NEW_TITLE, DOC_ID]
  );
  console.log('Updated SQLite');

  // Update Meilisearch
  try {
    const meili = getMeili();
    await meili.index(INDEXES.DOCUMENTS).updateDocuments([
      { id: DOC_ID, title: NEW_TITLE }
    ]);
    console.log('Updated Meilisearch documents index');

    // Also update paragraph titles
    await meili.index(INDEXES.PARAGRAPHS).updateDocuments([
      { document_id: DOC_ID, title: NEW_TITLE }
    ], { primaryKey: 'document_id' });
    console.log('Note: Paragraphs may need individual updates if they store title');
  } catch (err) {
    console.error('Meilisearch update failed:', err.message);
  }

  // Verify
  const updated = await queryOne('SELECT id, title FROM docs WHERE id = ?', [DOC_ID]);
  console.log('Verified new title:', updated?.title);

  console.log('Done!');
}

fix().catch(err => {
  console.error('Fix failed:', err);
  process.exit(1);
});
