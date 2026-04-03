#!/usr/bin/env node
/**
 * Re-segment Oversized Paragraphs
 *
 * Finds paragraphs exceeding a character threshold, detects language per-paragraph,
 * and splits them into properly-sized chunks. Stores detected language on each chunk.
 *
 * Usage:
 *   node scripts/resegment-oversized.js                    # process all oversized
 *   node scripts/resegment-oversized.js --dry-run           # report only
 *   node scripts/resegment-oversized.js --threshold 3000    # custom char threshold
 *   node scripts/resegment-oversized.js --doc-id 19954      # single document
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryOne, queryAll } from '../api/lib/db.js';
import { runMigrations } from '../api/lib/migrations.js';
import { detectLanguageFeatures } from '../api/services/segmenter.js';
import { hashContent } from '../api/services/ingester.js';
import { logger } from '../api/lib/logger.js';

const DEFAULT_THRESHOLD = 3000;
const MAX_CHUNK_SIZE = 1500;
const MIN_CHUNK_SIZE = 50;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const thresholdIdx = args.indexOf('--threshold');
const threshold = thresholdIdx >= 0 ? parseInt(args[thresholdIdx + 1], 10) : DEFAULT_THRESHOLD;
const docIdIdx = args.indexOf('--doc-id');
const docIdFilter = docIdIdx >= 0 ? parseInt(args[docIdIdx + 1], 10) : null;

// Hebrew: sof pasuq (׃), period, colon + space
const HEBREW_SENTENCE_DELIMITERS = /[.׃:]\s+/;
const LATIN_SENTENCE_DELIMITERS = /[.!?]\s+/;

function splitBySentences(text, language) {
  const delimiters = (language === 'he' || language === 'ar' || language === 'fa')
    ? HEBREW_SENTENCE_DELIMITERS
    : LATIN_SENTENCE_DELIMITERS;

  const parts = text.split(delimiters).filter(s => s.trim().length > 0);
  if (parts.length <= 1) {
    // No sentence boundaries — try newlines
    const lines = text.split(/\n+/).filter(s => s.trim().length > 0);
    if (lines.length > 1) return mergeIntoChunks(lines);
    // Last resort: split by word boundaries at MAX_CHUNK_SIZE
    return splitBySize(text);
  }
  return mergeIntoChunks(parts);
}

function mergeIntoChunks(parts) {
  const chunks = [];
  let current = '';
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (current.length + trimmed.length + 1 > MAX_CHUNK_SIZE && current.length >= MIN_CHUNK_SIZE) {
      chunks.push(current);
      current = trimmed;
    } else {
      current += (current ? ' ' : '') + trimmed;
    }
  }
  if (current.length >= MIN_CHUNK_SIZE) chunks.push(current);
  return chunks;
}

function splitBySize(text) {
  const chunks = [];
  const words = text.split(/\s+/);
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > MAX_CHUNK_SIZE && current.length >= MIN_CHUNK_SIZE) {
      chunks.push(current);
      current = word;
    } else {
      current += (current ? ' ' : '') + word;
    }
  }
  if (current.length >= MIN_CHUNK_SIZE) chunks.push(current);
  return chunks;
}

async function main() {
  console.log('=== Re-segment Oversized Paragraphs ===');
  console.log(`Threshold: ${threshold} chars${dryRun ? ' (DRY RUN)' : ''}`);
  if (docIdFilter) console.log(`Filtering to doc_id: ${docIdFilter}`);
  console.log();

  await runMigrations();

  const whereDoc = docIdFilter ? ' AND doc_id = ?' : '';
  const params = docIdFilter ? [threshold, docIdFilter] : [threshold];
  const oversized = await queryAll(`
    SELECT id, doc_id, paragraph_index, text, heading, blocktype,
           embedding_model, normalized_hash, language
    FROM content
    WHERE LENGTH(text) > ? AND deleted_at IS NULL${whereDoc}
    ORDER BY doc_id, paragraph_index
  `, params);

  console.log(`Found ${oversized.length} oversized paragraphs\n`);

  const langCounts = {};
  for (const p of oversized) {
    const features = detectLanguageFeatures(p.text);
    langCounts[features.language] = (langCounts[features.language] || 0) + 1;
  }
  console.log('By detected language:');
  for (const [lang, count] of Object.entries(langCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${lang}: ${count}`);
  }
  console.log();

  if (dryRun) {
    let totalNewChunks = 0;
    for (let i = 0; i < oversized.length; i++) {
      const p = oversized[i];
      const features = detectLanguageFeatures(p.text);
      const chunks = splitBySentences(p.text, features.language);
      totalNewChunks += chunks.length;
      if (i < 5) {
        console.log(`  id:${p.id} (${p.text.length} chars, ${features.language}) -> ${chunks.length} chunks (avg ${Math.round(p.text.length / chunks.length)} chars)`);
      }
    }
    console.log(`\nWould replace ${oversized.length} paragraphs with ~${totalNewChunks} chunks`);
    return;
  }

  let replaced = 0;
  let newChunks = 0;
  let errors = 0;

  for (const p of oversized) {
    try {
      const features = detectLanguageFeatures(p.text);
      const chunks = splitBySentences(p.text, features.language);

      if (chunks.length <= 1) {
        // Can't split further — just tag the language
        await query('UPDATE content SET language = ? WHERE id = ?', [features.language, p.id]);
        continue;
      }

      const ts = new Date().toISOString();
      // Soft-delete the oversized paragraph
      await query('UPDATE content SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, p.id]);

      // Insert replacement chunks with fractional paragraph_index
      const baseIndex = p.paragraph_index;
      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        const chunkHash = hashContent(chunkText);
        const normalizedHash = hashContent(chunkText.toLowerCase().trim());
        const chunkIndex = baseIndex + (i * 0.001);

        await query(`
          INSERT INTO content (doc_id, paragraph_index, text, content_hash, normalized_hash,
            heading, blocktype, language, synced, embedding, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
        `, [
          p.doc_id, chunkIndex, chunkText, chunkHash, normalizedHash,
          p.heading, p.blocktype || 'paragraph', features.language,
          ts, ts
        ]);
        newChunks++;
      }

      replaced++;
      if (replaced % 50 === 0) {
        process.stdout.write(`  Processed ${replaced}/${oversized.length}, created ${newChunks} chunks\r`);
      }
    } catch (err) {
      errors++;
      logger.error({ id: p.id, err: err.message }, 'Failed to re-segment paragraph');
    }
  }

  console.log();
  console.log('\n=== Summary ===');
  console.log(`Paragraphs replaced:  ${replaced}`);
  console.log(`New chunks created:   ${newChunks}`);
  console.log(`Errors:               ${errors}`);
  console.log(`Average chunks/para:  ${replaced > 0 ? (newChunks / replaced).toFixed(1) : 'N/A'}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
