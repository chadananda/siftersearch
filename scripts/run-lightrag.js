#!/usr/bin/env node
/**
 * LightRAG Entity Extraction Runner
 *
 * Standalone process: extracts entities via vLLM, stores in content_objects + graph.db.
 * Runs with configurable concurrency for maximum throughput.
 *
 * Usage:
 *   node scripts/run-lightrag.js                    # process all
 *   node scripts/run-lightrag.js --concurrency 8    # 8 parallel vLLM calls
 *   node scripts/run-lightrag.js --doc-id 123       # single document
 *   node scripts/run-lightrag.js --religion Buddhist # filter
 *   node scripts/run-lightrag.js --dry-run           # count only
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryOne, queryAll } from '../api/lib/db.js';
import { runMigrations } from '../api/lib/migrations.js';
import { buildObjectExtractionPrompt, parseObjectResponse } from '../api/lib/object-extraction.js';
import { logger } from '../api/lib/logger.js';

const VLLM_URL = process.env.VLLM_URL || 'http://boss:8000';
const VLLM_MODEL = 'Qwen/Qwen3-32B-AWQ';
const MAX_PARAGRAPH_CHARS = 4000;
const STATE_FILE = join(PROJECT_ROOT, 'tmp', 'lightrag-state.json');
const DOC_BATCH_SIZE = 50; // Fetch 50 docs at a time

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const concurrencyIdx = args.indexOf('--concurrency');
const CONCURRENCY = concurrencyIdx >= 0 ? parseInt(args[concurrencyIdx + 1], 10) : 4;
const docIdIdx = args.indexOf('--doc-id');
const docIdFilter = docIdIdx >= 0 ? parseInt(args[docIdIdx + 1], 10) : null;
const religionIdx = args.indexOf('--religion');
const religionFilter = religionIdx >= 0 ? args[religionIdx + 1] : null;

let stats = {
  started: new Date().toISOString(),
  processed: 0,
  extracted: 0,
  skipped: 0,
  errors: 0,
  lastDocId: null,
  lastDocTitle: null,
  rate: 0,
  concurrency: CONCURRENCY
};

function saveState() {
  try { writeFileSync(STATE_FILE, JSON.stringify(stats, null, 2)); } catch { /* */ }
}

async function callVLLM(systemPrompt, userPrompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
  try {
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
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`vLLM ${response.status}`);
    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';
    // Strip Qwen3 <think> tags
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

async function processParagraph(para, doc) {
  const { systemPrompt, userPrompt } = buildObjectExtractionPrompt(para, doc);
  const response = await callVLLM(systemPrompt, userPrompt);
  const objects = parseObjectResponse(response);

  if (objects) {
    const objectsJson = JSON.stringify(objects);
    const entityNames = [
      ...objects.people.map(e => e.name),
      ...objects.places.map(e => e.name),
      ...objects.concepts.map(e => e.name),
      ...objects.events.map(e => e.name),
      ...objects.documents.map(e => e.name)
    ].filter(Boolean);

    await query(`
      INSERT OR REPLACE INTO content_objects (content_id, doc_id, objects_json, objects_rendered, model)
      VALUES (?, ?, ?, ?, ?)
    `, [para.id, doc.id, objectsJson, entityNames.join(', '), VLLM_MODEL]);

    return true;
  }
  return false;
}

// Process N items concurrently
async function processPool(items, fn, concurrency) {
  let idx = 0;
  const results = [];
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main() {
  console.log('=== LightRAG Entity Extraction ===');
  console.log(`vLLM: ${VLLM_URL} (${VLLM_MODEL})`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  if (docIdFilter) console.log(`Filter: doc_id = ${docIdFilter}`);
  if (religionFilter) console.log(`Filter: religion = ${religionFilter}`);
  if (dryRun) console.log('DRY RUN');
  console.log();

  await runMigrations();

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

  // Build doc filter
  let docWhere = 'WHERE d.deleted_at IS NULL';
  const docParams = [];
  if (docIdFilter) { docWhere += ' AND d.id = ?'; docParams.push(docIdFilter); }
  if (religionFilter) { docWhere += ' AND d.religion = ?'; docParams.push(religionFilter); }

  // Get doc count
  const docCount = await queryOne(`SELECT COUNT(*) as c FROM docs d ${docWhere}`, docParams);
  console.log(`Total documents: ${docCount?.c || 0}`);

  if (dryRun) return;

  const startTime = Date.now();
  let lastLogTime = startTime;
  let lastDocId = 0;

  // Process documents in batches (cursor-based, not OFFSET)
  while (true) {
    const docs = await queryAll(`
      SELECT d.id, d.title, d.author, d.religion, d.collection, d.year, d.language
      FROM docs d ${docWhere} AND d.id > ?
      ORDER BY d.id LIMIT ?
    `, [...docParams, lastDocId, DOC_BATCH_SIZE]);

    if (docs.length === 0) break;

    for (const doc of docs) {
      lastDocId = doc.id;

      // Get unextracted paragraphs for this doc (LEFT JOIN is fast)
      const paragraphs = await queryAll(`
        SELECT c.id, c.doc_id, c.paragraph_index, c.text
        FROM content c
        LEFT JOIN content_objects co ON c.id = co.content_id
        WHERE c.doc_id = ? AND c.deleted_at IS NULL
          AND LENGTH(c.text) > 20 AND LENGTH(c.text) <= ?
          AND co.content_id IS NULL
        ORDER BY c.paragraph_index
      `, [doc.id, MAX_PARAGRAPH_CHARS]);

      if (paragraphs.length === 0) continue;

      stats.lastDocId = doc.id;
      stats.lastDocTitle = doc.title;

      // Process paragraphs with concurrency pool
      await processPool(paragraphs, async (para) => {
        try {
          const extracted = await processParagraph(para, doc);
          if (extracted) stats.extracted++;
          else stats.skipped++;
          stats.processed++;
        } catch (err) {
          stats.errors++;
          stats.processed++;
          if (stats.errors <= 10 || stats.errors % 100 === 0) {
            logger.warn({ err: err.message, paraId: para.id, docId: doc.id }, 'Extraction failed');
          }
        }
      }, CONCURRENCY);

      // Log every 60s
      const now = Date.now();
      if (now - lastLogTime > 60000) {
        const elapsed = (now - startTime) / 60000;
        stats.rate = Math.round(stats.processed / elapsed);
        const etaMin = stats.rate > 0 ? Math.round((docCount.c * 100 - stats.processed) / stats.rate) : 0;
        console.log(`  ${stats.processed.toLocaleString()} processed (${stats.extracted} entities, ${stats.errors} errors, ~${stats.rate}/min) — ${doc.title}`);
        saveState();
        lastLogTime = now;
      }
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
