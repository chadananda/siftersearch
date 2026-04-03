#!/usr/bin/env node
/**
 * LightRAG Entity Extraction Runner
 *
 * Standalone background process that extracts entities from all paragraphs
 * using the local vLLM server (Qwen3-32B on boss). Stores results in:
 * - content_objects table (per-paragraph structured entities)
 * - graph.db (corpus-wide entity graph)
 *
 * Designed to run for hours/days without interruption. Resilient to
 * individual paragraph failures — logs and skips, never stops.
 *
 * Usage:
 *   node scripts/run-lightrag.js                    # process all unextracted
 *   node scripts/run-lightrag.js --doc-id 123       # single document
 *   node scripts/run-lightrag.js --religion Buddhist # filter by religion
 *   node scripts/run-lightrag.js --dry-run           # count only
 *
 * Progress is written to a state file for monitoring.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryOne, queryAll } from '../api/lib/db.js';
import { runMigrations } from '../api/lib/migrations.js';
import { buildObjectExtractionPrompt, parseObjectResponse } from '../api/lib/object-extraction.js';
import { logger } from '../api/lib/logger.js';

// ============================================================================
// Configuration
// ============================================================================

const VLLM_URL = process.env.VLLM_URL || 'http://boss:8000';
const VLLM_MODEL = 'Qwen/Qwen3-32B-AWQ';
const BATCH_SIZE = 10;           // Paragraphs per batch (sequential LLM calls)
const MAX_PARAGRAPH_CHARS = 4000; // Skip paragraphs longer than this
const STATE_FILE = join(PROJECT_ROOT, 'tmp', 'lightrag-state.json');
const STATS_INTERVAL = 60000;    // Log stats every minute

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const docIdIdx = args.indexOf('--doc-id');
const docIdFilter = docIdIdx >= 0 ? parseInt(args[docIdIdx + 1], 10) : null;
const religionIdx = args.indexOf('--religion');
const religionFilter = religionIdx >= 0 ? args[religionIdx + 1] : null;

// ============================================================================
// State tracking
// ============================================================================

let stats = {
  started: new Date().toISOString(),
  processed: 0,
  extracted: 0,
  skipped: 0,
  errors: 0,
  lastDocId: null,
  lastDocTitle: null,
  rate: 0 // paragraphs per minute
};

function saveState() {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(stats, null, 2));
  } catch { /* tmp might not exist */ }
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch { return null; }
}

// ============================================================================
// vLLM API call
// ============================================================================

async function callVLLM(systemPrompt, userPrompt) {
  const response = await fetch(`${VLLM_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: VLLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    throw new Error(`vLLM ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ============================================================================
// Main processing loop
// ============================================================================

async function main() {
  console.log('=== LightRAG Entity Extraction ===');
  console.log(`vLLM: ${VLLM_URL} (${VLLM_MODEL})`);
  if (docIdFilter) console.log(`Filter: doc_id = ${docIdFilter}`);
  if (religionFilter) console.log(`Filter: religion = ${religionFilter}`);
  if (dryRun) console.log('DRY RUN — no writes');
  console.log();

  await runMigrations();

  // Ensure content_objects table exists
  await query(`CREATE TABLE IF NOT EXISTS content_objects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_id INTEGER NOT NULL,
    doc_id INTEGER NOT NULL,
    objects_json TEXT,
    objects_rendered TEXT,
    extracted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    model TEXT,
    UNIQUE(content_id)
  )`);

  // Count what needs processing
  let whereClause = 'WHERE c.deleted_at IS NULL AND LENGTH(c.text) > 20 AND LENGTH(c.text) <= ?';
  const params = [MAX_PARAGRAPH_CHARS];

  if (docIdFilter) {
    whereClause += ' AND c.doc_id = ?';
    params.push(docIdFilter);
  }
  if (religionFilter) {
    whereClause += ' AND d.religion = ?';
    params.push(religionFilter);
  }

  // Exclude already-extracted paragraphs
  whereClause += ' AND c.id NOT IN (SELECT content_id FROM content_objects)';

  const countRow = await queryOne(`
    SELECT COUNT(*) as c FROM content c
    JOIN docs d ON c.doc_id = d.id
    ${whereClause}
  `, params);

  const totalNeeded = countRow?.c || 0;
  console.log(`Paragraphs to process: ${totalNeeded.toLocaleString()}`);

  if (dryRun || totalNeeded === 0) {
    console.log('Nothing to do.');
    return;
  }

  // Process document by document for prefix cache reuse
  const docsQuery = `
    SELECT DISTINCT d.id, d.title, d.author, d.religion, d.collection, d.year, d.language
    FROM docs d
    JOIN content c ON c.doc_id = d.id
    ${whereClause.replace('c.id NOT IN', 'c.id NOT IN')}
    ORDER BY d.id
  `;
  const docs = await queryAll(docsQuery, params);
  console.log(`Documents to process: ${docs.length.toLocaleString()}\n`);

  const startTime = Date.now();
  let lastStatsTime = startTime;

  for (const doc of docs) {
    // Get unextracted paragraphs for this document
    const paragraphs = await queryAll(`
      SELECT c.id, c.doc_id, c.paragraph_index, c.text
      FROM content c
      WHERE c.doc_id = ? AND c.deleted_at IS NULL
        AND LENGTH(c.text) > 20 AND LENGTH(c.text) <= ?
        AND c.id NOT IN (SELECT content_id FROM content_objects)
      ORDER BY c.paragraph_index
    `, [doc.id, MAX_PARAGRAPH_CHARS]);

    if (paragraphs.length === 0) continue;

    stats.lastDocId = doc.id;
    stats.lastDocTitle = doc.title;

    for (const para of paragraphs) {
      try {
        const { systemPrompt, userPrompt } = buildObjectExtractionPrompt(para, doc);
        const response = await callVLLM(systemPrompt, userPrompt);
        const objects = parseObjectResponse(response);

        if (objects) {
          const objectsJson = JSON.stringify(objects);
          const objectsRendered = [
            ...objects.people.map(e => e.name),
            ...objects.places.map(e => e.name),
            ...objects.concepts.map(e => e.name),
            ...objects.events.map(e => e.name),
            ...objects.documents.map(e => e.name)
          ].filter(Boolean).join(', ');

          await query(`
            INSERT OR REPLACE INTO content_objects (content_id, doc_id, objects_json, objects_rendered, model)
            VALUES (?, ?, ?, ?, ?)
          `, [para.id, doc.id, objectsJson, objectsRendered, VLLM_MODEL]);

          stats.extracted++;
        } else {
          stats.skipped++;
        }

        stats.processed++;
      } catch (err) {
        stats.errors++;
        stats.processed++;
        logger.warn({ err: err.message, paraId: para.id, docId: doc.id }, 'LightRAG extraction failed');
      }
    }

    // Log progress periodically
    const now = Date.now();
    if (now - lastStatsTime > STATS_INTERVAL) {
      const elapsed = (now - startTime) / 60000;
      stats.rate = Math.round(stats.processed / elapsed);
      const remaining = totalNeeded - stats.processed;
      const etaMin = stats.rate > 0 ? Math.round(remaining / stats.rate) : 0;
      console.log(`  ${stats.processed.toLocaleString()} / ${totalNeeded.toLocaleString()} (${stats.extracted} extracted, ${stats.errors} errors, ~${stats.rate}/min, ~${Math.floor(etaMin/60)}h${etaMin%60}m remaining) — ${doc.title}`);
      saveState();
      lastStatsTime = now;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log('\n=== Summary ===');
  console.log(`Processed:  ${stats.processed.toLocaleString()}`);
  console.log(`Extracted:  ${stats.extracted.toLocaleString()}`);
  console.log(`Skipped:    ${stats.skipped.toLocaleString()}`);
  console.log(`Errors:     ${stats.errors}`);
  console.log(`Time:       ${elapsed}s`);
  saveState();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
