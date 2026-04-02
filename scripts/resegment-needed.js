#!/usr/bin/env node
/**
 * Re-segment documents that have oversized paragraphs (bad chunking).
 * Identifies docs where avg paragraph > 800 chars OR max paragraph > 2000 chars
 * among non-English, non-auto-segmented documents. Forces AI segmentation.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { queryAll, query } from '../api/lib/db.js';
import { readFile } from 'fs/promises';
import { ingestDocument } from '../api/services/ingester.js';

const BASE = process.env.LIBRARY_BASE_PATH ||
  `${process.env.HOME}/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library`;

async function main() {
  // Find docs with oversized paragraphs (needs real segmentation)
  const docs = await queryAll(`
    SELECT d.id, d.file_path, d.language, d.title,
      AVG(LENGTH(c.text)) as avg_len,
      MAX(LENGTH(c.text)) as max_len,
      COUNT(c.id) as para_count
    FROM docs d JOIN content c ON c.doc_id = d.id
    WHERE d.deleted_at IS NULL AND d.language != 'en'
      AND (d.auto_segmented IS NULL OR d.auto_segmented = 0)
      AND c.deleted_at IS NULL
    GROUP BY d.id
    HAVING avg_len >= 800 OR max_len >= 2000
    ORDER BY max_len DESC
  `);

  console.log(`Re-segmenting ${docs.length} documents with oversized paragraphs`);
  const langs = [...new Set(docs.map(d => d.language))];
  console.log(`Languages: ${langs.join(', ')}`);
  console.log('');

  let done = 0, failed = 0;
  for (const doc of docs) {
    const name = doc.file_path.split('/').pop();
    try {
      // Delete existing content for this doc so ingester re-creates it
      await query('DELETE FROM content WHERE doc_id = ?', [doc.id]);
      // Also delete the doc record so ingester creates fresh
      await query('DELETE FROM docs WHERE id = ?', [doc.id]);

      const text = await readFile(join(BASE, doc.file_path), 'utf-8');
      await ingestDocument(text, {}, doc.file_path);
      done++;
      console.log(`${done}/${docs.length} [${doc.language}] ${name} (was avg:${Math.round(doc.avg_len)} max:${Math.round(doc.max_len)})`);
    } catch (err) {
      failed++;
      console.log(`FAIL [${doc.language}] ${name}: ${err.message.slice(0, 120)}`);
    }
  }
  console.log(`\nDONE: ${done} re-segmented, ${failed} failed`);
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
