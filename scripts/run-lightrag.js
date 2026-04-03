#!/usr/bin/env node
/**
 * LightRAG Entity Extraction — Leapfrog Window Strategy
 *
 * Processes documents through vLLM using a leapfrog window pattern that
 * maximizes prefix cache (KV cache) reuse:
 *
 * 1. System prompt (book metadata) is constant per document → always cached
 * 2. Window covers 2N paragraphs: front half (context) + back half (extraction targets)
 * 3. Extract entities from back half only
 * 4. Leapfrog: old back half becomes new front half (already in KV cache)
 * 5. Window size is token-budget-based, not fixed paragraph count
 *
 * Self-tuning: every 50 calls, reads cache metrics and adjusts if needed.
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
import { parseObjectResponse } from '../api/lib/object-extraction.js';
import { logger } from '../api/lib/logger.js';

// ============================================================================
// Config
// ============================================================================

const VLLM_URL = process.env.VLLM_URL || 'http://boss:8000';
const VLLM_MODEL = 'Qwen/Qwen3-32B-AWQ';
const MAX_CONTEXT = 8192;         // vLLM max_model_len
const RESERVED_DECODE = 2000;     // Reserve for output
const SYSTEM_PROMPT_TOKENS = 300; // Estimated system prompt size
const CHARS_PER_TOKEN = 3;        // Conservative for mixed-language
const MAX_PARAGRAPH_CHARS = 4000;
const STATE_FILE = join(PROJECT_ROOT, 'tmp', 'lightrag-state.json');
const CONCURRENCY = parseInt(process.env.LIGHTRAG_CONCURRENCY || '1', 10); // Sequential per doc for prefix reuse

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const docIdIdx = args.indexOf('--doc-id');
const docIdFilter = docIdIdx >= 0 ? parseInt(args[docIdIdx + 1], 10) : null;
const religionIdx = args.indexOf('--religion');
const religionFilter = religionIdx >= 0 ? args[religionIdx + 1] : null;

// ============================================================================
// Metrics
// ============================================================================

const stats = {
  started: new Date().toISOString(),
  docsProcessed: 0,
  windowCalls: 0,
  paragraphsExtracted: 0,
  entitiesFound: 0,
  errors: 0,
  totalPromptTokens: 0,
  totalCachedTokens: 0,
  cacheHitRate: 0,
  rate: 0
};

function saveState() {
  try { writeFileSync(STATE_FILE, JSON.stringify(stats, null, 2)); } catch { /* */ }
}

// ============================================================================
// Token estimation
// ============================================================================

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// Available tokens for paragraph content per window
const AVAILABLE_TOKENS = MAX_CONTEXT - RESERVED_DECODE - SYSTEM_PROMPT_TOKENS;

// ============================================================================
// Build windows from paragraphs using token budget
// ============================================================================

function buildLeapfrogWindows(paragraphs) {
  const windows = [];
  let i = 0;

  while (i < paragraphs.length) {
    // Build context half (front) — already in KV cache from previous call
    const contextParas = [];
    let contextTokens = 0;
    const halfBudget = Math.floor(AVAILABLE_TOKENS / 2);

    // If this isn't the first window, the context half is the previous extraction half
    // (already computed). For the first window, we build context from the start.
    let j = i;
    while (j < paragraphs.length && contextTokens < halfBudget) {
      const t = estimateTokens(paragraphs[j].text);
      if (contextTokens + t > halfBudget && contextParas.length > 0) break;
      contextParas.push(paragraphs[j]);
      contextTokens += t;
      j++;
    }

    // Build extraction half (back) — these are the new paragraphs to extract from
    const extractParas = [];
    let extractTokens = 0;
    while (j < paragraphs.length && extractTokens < halfBudget) {
      const t = estimateTokens(paragraphs[j].text);
      if (extractTokens + t > halfBudget && extractParas.length > 0) break;
      extractParas.push(paragraphs[j]);
      extractTokens += t;
      j++;
    }

    if (extractParas.length === 0 && contextParas.length > 0) {
      // Last chunk — extract from context if no more paragraphs
      windows.push({
        contextParas: [],
        extractParas: contextParas,
        totalTokens: contextTokens
      });
    } else if (extractParas.length > 0) {
      windows.push({
        contextParas,
        extractParas,
        totalTokens: contextTokens + extractTokens
      });
    }

    // Leapfrog: next window starts where extraction half started
    // (extraction half becomes next window's context half — already in KV cache)
    if (extractParas.length > 0) {
      i = contextParas.length > 0 ? i + contextParas.length : j;
    } else {
      break;
    }
  }

  return windows;
}

// ============================================================================
// vLLM call
// ============================================================================

async function callVLLM(systemPrompt, userPrompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
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
        max_tokens: RESERVED_DECODE
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`vLLM ${response.status}: ${(await response.text()).substring(0, 200)}`);
    const data = await response.json();

    // Track cache metrics
    const usage = data.usage || {};
    stats.totalPromptTokens += usage.prompt_tokens || 0;
    // vLLM reports cached tokens in prompt_tokens_details or as a separate field
    const cached = usage.prompt_tokens_details?.cached_tokens || 0;
    stats.totalCachedTokens += cached;

    let content = data.choices?.[0]?.message?.content || '';
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return { content, usage };
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// Process one document
// ============================================================================

async function processDocument(doc) {
  // Load all paragraphs for this document
  const paragraphs = await queryAll(`
    SELECT c.id, c.doc_id, c.paragraph_index, c.text
    FROM content c
    LEFT JOIN content_objects co ON c.id = co.content_id
    WHERE c.doc_id = ? AND c.deleted_at IS NULL
      AND LENGTH(c.text) > 20 AND LENGTH(c.text) <= ?
      AND co.content_id IS NULL
    ORDER BY c.paragraph_index
  `, [doc.id, MAX_PARAGRAPH_CHARS]);

  if (paragraphs.length === 0) return;

  // System prompt — constant per document, maximizes prefix cache reuse
  const systemPrompt = `You are an entity extraction assistant for the Ocean Library.

Document: "${doc.title}"
Author: ${doc.author || 'Unknown'}
Religion: ${doc.religion || 'Unknown'}
Collection: ${doc.collection || 'Unknown'}
Year: ${doc.year || 'Unknown'}
Language: ${doc.language || 'en'}

Extract named entities from the EXTRACTION TARGET paragraphs below. Context paragraphs are provided for understanding but should NOT be extracted from.

Return ONLY valid JSON:
{"people":[{"name":"...","description":"..."}],"places":[{"name":"...","description":"..."}],"documents":[{"name":"...","description":"..."}],"events":[{"name":"...","description":"..."}],"concepts":[{"name":"...","description":"..."}],"relations":[{"from":"...","to":"...","description":"..."}]}

Rules:
- Scope to ${doc.religion || 'the given'} tradition
- Return empty arrays for categories with no entities
- relations must reference names from other arrays`;

  // Build leapfrog windows
  const windows = buildLeapfrogWindows(paragraphs);

  for (const window of windows) {
    try {
      // Build user prompt with context and extraction targets
      let userPrompt = '';

      if (window.contextParas.length > 0) {
        userPrompt += '=== CONTEXT (for understanding only) ===\n';
        for (const p of window.contextParas) {
          userPrompt += `[P${p.paragraph_index}] ${p.text}\n\n`;
        }
      }

      userPrompt += '=== EXTRACTION TARGETS (extract entities from these) ===\n';
      for (const p of window.extractParas) {
        userPrompt += `[P${p.paragraph_index}] ${p.text}\n\n`;
      }

      const { content } = await callVLLM(systemPrompt, userPrompt);
      const objects = parseObjectResponse(content);

      if (objects) {
        const entityNames = [
          ...objects.people.map(e => e.name),
          ...objects.places.map(e => e.name),
          ...objects.concepts.map(e => e.name),
          ...objects.events.map(e => e.name),
          ...objects.documents.map(e => e.name)
        ].filter(Boolean);

        // Store for each extraction target paragraph
        for (const p of window.extractParas) {
          await query(`
            INSERT OR REPLACE INTO content_objects
              (content_id, doc_id, people_json, places_json, documents_json, events_json, concepts_json, relations_json, rendered, object_pipeline_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            p.id, doc.id,
            JSON.stringify(objects.people),
            JSON.stringify(objects.places),
            JSON.stringify(objects.documents),
            JSON.stringify(objects.events),
            JSON.stringify(objects.concepts),
            JSON.stringify(objects.relations),
            entityNames.join(', '),
            'v1-leapfrog'
          ]);
        }

        stats.entitiesFound += entityNames.length;
      }

      stats.paragraphsExtracted += window.extractParas.length;
      stats.windowCalls++;

      // Self-tune every 50 calls
      if (stats.windowCalls % 50 === 0 && stats.totalPromptTokens > 0) {
        stats.cacheHitRate = ((stats.totalCachedTokens / stats.totalPromptTokens) * 100).toFixed(1);
        console.log(`  [cache] ${stats.cacheHitRate}% hit rate (${stats.totalCachedTokens.toLocaleString()} cached / ${stats.totalPromptTokens.toLocaleString()} prompt tokens)`);
      }

    } catch (err) {
      stats.errors++;
      if (stats.errors <= 10 || stats.errors % 100 === 0) {
        logger.warn({ err: err.message, docId: doc.id }, 'Window extraction failed');
      }
      // Mark extraction targets as processed to avoid infinite retry
      for (const p of window.extractParas) {
        await query(`INSERT OR IGNORE INTO content_objects (content_id, doc_id, rendered, object_pipeline_version) VALUES (?, ?, ?, ?)`,
          [p.id, doc.id, 'ERROR', 'v1-leapfrog']);
      }
    }
  }

  stats.docsProcessed++;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('=== LightRAG Entity Extraction (Leapfrog Windows) ===');
  console.log(`vLLM: ${VLLM_URL} (${VLLM_MODEL})`);
  console.log(`Max context: ${MAX_CONTEXT}, reserved decode: ${RESERVED_DECODE}`);
  console.log(`Available for content: ~${AVAILABLE_TOKENS} tokens per window`);
  if (docIdFilter) console.log(`Filter: doc_id = ${docIdFilter}`);
  if (religionFilter) console.log(`Filter: religion = ${religionFilter}`);
  if (dryRun) console.log('DRY RUN');
  console.log();

  await runMigrations();

  // content_objects table created by migration 44 with per-entity columns

  // Count docs
  let docWhere = 'WHERE d.deleted_at IS NULL';
  const docParams = [];
  if (docIdFilter) { docWhere += ' AND d.id = ?'; docParams.push(docIdFilter); }
  if (religionFilter) { docWhere += ' AND d.religion = ?'; docParams.push(religionFilter); }

  const docCount = await queryOne(`SELECT COUNT(*) as c FROM docs d ${docWhere}`, docParams);
  console.log(`Documents: ${docCount?.c || 0}`);
  if (dryRun) return;

  const startTime = Date.now();
  let lastLogTime = startTime;
  let lastDocId = 0;

  while (true) {
    const docs = await queryAll(`
      SELECT d.id, d.title, d.author, d.religion, d.collection, d.year, d.language
      FROM docs d ${docWhere} AND d.id > ?
      ORDER BY d.id LIMIT 50
    `, [...docParams, lastDocId]);

    if (docs.length === 0) break;

    for (const doc of docs) {
      lastDocId = doc.id;
      await processDocument(doc);

      const now = Date.now();
      if (now - lastLogTime > 60000) {
        const elapsed = (now - startTime) / 60000;
        stats.rate = Math.round(stats.paragraphsExtracted / elapsed);
        const cacheRate = stats.totalPromptTokens > 0 ? ((stats.totalCachedTokens / stats.totalPromptTokens) * 100).toFixed(1) : '0';
        console.log(`  ${stats.docsProcessed} docs, ${stats.paragraphsExtracted.toLocaleString()} paras, ${stats.entitiesFound.toLocaleString()} entities, ${stats.errors} errors, ~${stats.rate}/min, cache: ${cacheRate}% — ${doc.title}`);
        saveState();
        lastLogTime = now;
      }
    }
  }

  stats.cacheHitRate = stats.totalPromptTokens > 0 ? ((stats.totalCachedTokens / stats.totalPromptTokens) * 100).toFixed(1) : '0';
  console.log('\n=== Summary ===');
  console.log(`Documents:   ${stats.docsProcessed}`);
  console.log(`Paragraphs:  ${stats.paragraphsExtracted.toLocaleString()}`);
  console.log(`Entities:    ${stats.entitiesFound.toLocaleString()}`);
  console.log(`Windows:     ${stats.windowCalls}`);
  console.log(`Errors:      ${stats.errors}`);
  console.log(`Cache rate:  ${stats.cacheHitRate}%`);
  console.log(`Time:        ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
  saveState();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
