#!/usr/bin/env node
/**
 * Run AI segmentation on all unsegmented non-English documents.
 * Uses local vLLM (Qwen3-32B) for segmentation.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { queryAll } from '../api/lib/db.js';
import { readFile } from 'fs/promises';
import { ingestDocument } from '../api/services/ingester.js';

const BASE = process.env.LIBRARY_BASE_PATH ||
  `${process.env.HOME}/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library`;

const args = process.argv.slice(2);
const langFilter = args.find(a => a.startsWith('--lang='))?.split('=')[1];
const limitArg = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 0;

async function main() {
  let sql = `SELECT id, file_path, language FROM docs
    WHERE deleted_at IS NULL AND language != 'en'
    AND (auto_segmented IS NULL OR auto_segmented = 0)`;
  const params = [];

  if (langFilter) {
    sql += ` AND language = ?`;
    params.push(langFilter);
  }
  sql += ` ORDER BY id`;
  if (limitArg) {
    sql += ` LIMIT ?`;
    params.push(limitArg);
  }

  const docs = await queryAll(sql, params);
  const langs = [...new Set(docs.map(d => d.language))];
  console.log(`Segmenting ${docs.length} documents (${langs.join(', ')})`);

  let done = 0, failed = 0;
  for (const doc of docs) {
    try {
      const text = await readFile(join(BASE, doc.file_path), 'utf-8');
      await ingestDocument(text, {}, doc.file_path);
      done++;
      if (done % 5 === 0) {
        const name = doc.file_path.split('/').pop();
        console.log(`${done}/${docs.length} (${failed} failed) — [${doc.language}] ${name}`);
      }
    } catch (err) {
      failed++;
      const name = doc.file_path.split('/').pop();
      if (failed <= 20) console.log(`FAIL [${doc.language}]: ${name}: ${err.message.slice(0, 120)}`);
    }
  }
  console.log(`DONE: ${done} segmented, ${failed} failed`);
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
