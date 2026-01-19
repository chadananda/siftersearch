#!/usr/bin/env node
/**
 * Verify if file hashes actually differ from DB
 * Uses the exact same hash function as the ingester
 */

import { hashContent } from '../api/services/ingester.js';
import { queryAll } from '../api/lib/db.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

import os from 'os';
const homeDir = os.homedir();
const LIBRARY_ROOT = process.env.LIBRARY_BASE_PATH || `${homeDir}/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library`;

async function verifyHashes() {
  // Get a sample of documents with hashes
  const docs = await queryAll(`
    SELECT id, file_path, file_hash, title
    FROM docs
    WHERE file_path IS NOT NULL
      AND file_hash IS NOT NULL
    LIMIT 50
  `);

  console.log(`Checking ${docs.length} documents...\n`);

  let matches = 0;
  let mismatches = 0;
  let notFound = 0;
  const mismatchDetails = [];

  for (const doc of docs) {
    const filePath = path.join(LIBRARY_ROOT, doc.file_path);

    if (!existsSync(filePath)) {
      notFound++;
      continue;
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      const currentHash = hashContent(content);

      if (currentHash === doc.file_hash) {
        matches++;
      } else {
        mismatches++;
        mismatchDetails.push({
          path: doc.file_path,
          dbHash: doc.file_hash?.substring(0, 16),
          currentHash: currentHash.substring(0, 16),
          contentLength: content.length
        });
      }
    } catch (err) {
      console.error(`Error reading ${doc.file_path}: ${err.message}`);
    }
  }

  console.log(`Results:`);
  console.log(`  Matches: ${matches}`);
  console.log(`  Mismatches: ${mismatches}`);
  console.log(`  Not found: ${notFound}`);

  if (mismatchDetails.length > 0) {
    console.log(`\nFirst 10 mismatches:`);
    mismatchDetails.slice(0, 10).forEach(m => {
      console.log(`  ${m.path}`);
      console.log(`    DB:      ${m.dbHash}...`);
      console.log(`    Current: ${m.currentHash}...`);
    });
  }

  process.exit(0);
}

verifyHashes().catch(err => {
  console.error(err);
  process.exit(1);
});
