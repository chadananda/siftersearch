#!/usr/bin/env node
/**
 * Mark a test document as encumbered for testing
 * Run via deploy hook or directly on server
 */

import { query } from '../api/lib/db.js';

const TEST_DOC_ID = 'baha_i_baha_i_books_h_m_balyuzi_abdu_l_baha_the_centre_of_the_covenant_of_baha_u_llah';

async function main() {
  try {
    // Mark the H.M. Balyuzi book as encumbered for testing
    await query(
      'UPDATE docs SET encumbered = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [TEST_DOC_ID]
    );

    console.log(`✓ Marked document as encumbered: ${TEST_DOC_ID}`);

    // Verify
    const result = await query('SELECT id, title, encumbered FROM docs WHERE id = ?', [TEST_DOC_ID]);
    console.log('Document:', result);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
