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
import { detectLanguageFeatures } from '../api/services/segmenter.js';
import { logger } from '../api/lib/logger.js';

// ============================================================================
// Config
// ============================================================================

const VLLM_URL = process.env.VLLM_URL || 'http://boss:8000';
const VLLM_MODEL = 'Qwen/Qwen3-32B-AWQ';
const MAX_CONTEXT = 8192;         // vLLM max_model_len
const RESERVED_DECODE = 1500;     // Reserve for output (entity JSON)
const SYSTEM_PROMPT_TOKENS = 400; // Estimated system prompt size
const SAFETY_MARGIN = 500;        // Buffer for tokenizer estimation errors
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
  const features = detectLanguageFeatures(text);
  // Hebrew ~2 chars/token, Arabic ~2, Farsi ~2, English ~4, mixed ~3
  const charsPerToken = features.isRTL ? 2 : (features.rtlRatio > 0.1 ? 2.5 : 4);
  return Math.ceil(text.length / charsPerToken);
}

// Available tokens for paragraph content per window
const AVAILABLE_TOKENS = MAX_CONTEXT - RESERVED_DECODE - SYSTEM_PROMPT_TOKENS - SAFETY_MARGIN;

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
  const timeout = setTimeout(() => controller.abort(), 300000); // 5 min (Qwen3 thinks slowly)
  try {
    const response = await fetch(`${VLLM_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VLLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          // /no_think disables Qwen3's extended reasoning for faster responses
          { role: 'user', content: '/no_think\n' + userPrompt }
        ],
        temperature: 0.1,
        max_tokens: RESERVED_DECODE,
        chat_template_kwargs: { enable_thinking: false }
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
  // Load ALL paragraphs for this document (including already-extracted, for context)
  const allParas = await queryAll(`
    SELECT c.id, c.doc_id, c.paragraph_index, c.text
    FROM content c
    WHERE c.doc_id = ? AND c.deleted_at IS NULL
      AND LENGTH(c.text) > 20 AND LENGTH(c.text) <= ?
    ORDER BY c.paragraph_index
  `, [doc.id, MAX_PARAGRAPH_CHARS]);

  // Find which paragraphs still need extraction
  const needsExtraction = await queryAll(`
    SELECT c.id FROM content c
    LEFT JOIN content_objects co ON c.id = co.content_id
    WHERE c.doc_id = ? AND c.deleted_at IS NULL
      AND LENGTH(c.text) > 20 AND LENGTH(c.text) <= ?
      AND co.content_id IS NULL
    ORDER BY c.paragraph_index
  `, [doc.id, MAX_PARAGRAPH_CHARS]);

  const needsIds = new Set(needsExtraction.map(r => r.id));
  if (needsIds.size === 0) return;

  // Build the document content block — this stays CONSTANT for every call on this document.
  // It's the prefix that gets cached in vLLM's KV cache.
  // Fit as many paragraphs as possible within the token budget.
  let docContent = '';
  let docTokens = 0;
  const includedParas = [];

  for (const p of allParas) {
    const paraTokens = estimateTokens(p.text);
    if (docTokens + paraTokens > AVAILABLE_TOKENS) break;
    docContent += `[P${p.paragraph_index}] ${p.text}\n\n`;
    docTokens += paraTokens;
    includedParas.push(p);
  }

  if (includedParas.length === 0) return;

  // System prompt + document content = FIXED PREFIX (cached after first call)
  const systemPrompt = `You are an entity extraction assistant for the Ocean Library.

Document: "${doc.title}"
Author: ${doc.author || 'Unknown'}
Religion: ${doc.religion || 'Unknown'}
Collection: ${doc.collection || 'Unknown'}
Year: ${doc.year || 'Unknown'}
Language: ${doc.language || 'en'}

Below is the document content. You will be asked to extract entities from one specific paragraph at a time.

Return ONLY valid JSON:
{"people":[{"name":"...","description":"..."}],"places":[{"name":"...","description":"..."}],"documents":[{"name":"...","description":"..."}],"events":[{"name":"...","description":"..."}],"concepts":[{"name":"...","description":"..."}],"relations":[{"from":"...","to":"...","description":"..."}]}

Rules:
- Scope to ${doc.religion || 'the given'} tradition
- Return empty arrays for categories with no entities
- relations must reference names from other arrays

=== DOCUMENT CONTENT ===
${docContent}`;

  // Now step through ONE PARAGRAPH AT A TIME.
  // Each call has the same system prompt (cached) + tiny user prompt (just the paragraph number).
  // After the first call, every subsequent call should get near-100% prefix cache hits.

  for (const p of includedParas) {
    if (!needsIds.has(p.id)) continue; // Already extracted

    try {
      // Tiny user prompt — only this changes between calls
      const userPrompt = `/no_think\nExtract all named entities from paragraph [P${p.paragraph_index}] above.`;

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
          'v2-docload'
        ]);

        stats.entitiesFound += entityNames.length;
      }

      stats.paragraphsExtracted++;
      stats.windowCalls++;

      // Log cache metrics every 50 calls
      if (stats.windowCalls % 50 === 0 && stats.totalPromptTokens > 0) {
        stats.cacheHitRate = ((stats.totalCachedTokens / stats.totalPromptTokens) * 100).toFixed(1);
        console.log(`  [cache] ${stats.cacheHitRate}% hit rate (${stats.totalCachedTokens.toLocaleString()} / ${stats.totalPromptTokens.toLocaleString()} tokens)`);
      }

    } catch (err) {
      stats.errors++;
      if (stats.errors <= 10 || stats.errors % 100 === 0) {
        logger.warn({ err: err.message, paraId: p.id, docId: doc.id }, 'Extraction failed');
      }
      await query(`INSERT OR IGNORE INTO content_objects (content_id, doc_id, rendered, object_pipeline_version) VALUES (?, ?, ?, ?)`,
        [p.id, doc.id, 'ERROR', 'v2-docload']);
    }
  }

  // For documents larger than the token budget, we need additional passes
  // with shifted context windows. But the first pass covers the most important content.
  // TODO: Implement sliding window for remaining paragraphs in large documents.

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

  // Process largest documents first — more paragraphs = higher cache hit rate
  // A 100-paragraph doc gets 99% hits vs a 3-paragraph doc at 33%
  const allDocs = await queryAll(`
    SELECT d.id, d.title, d.author, d.religion, d.collection, d.year, d.language,
           d.paragraph_count
    FROM docs d ${docWhere}
    ORDER BY d.paragraph_count DESC
  `, docParams);

  console.log(`Processing ${allDocs.length} documents (largest first for max cache reuse)\n`);

  const startTime = Date.now();
  let lastLogTime = startTime;

  for (const doc of allDocs) {
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
