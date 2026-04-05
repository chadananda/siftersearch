#!/usr/bin/env node
/* global AbortController */
/**
 * LightRAG Entity Extraction v3
 *
 * Three optimizations over v2:
 * 1. BATCH small documents together to maximize prefix cache reuse
 * 2. TERSE output format — compact JSON, no descriptions (saves ~60% output tokens)
 * 3. CONCURRENT document streams — 2 parallel processing pipelines
 *
 * The core strategy: load document(s) as a fixed prefix, step through
 * paragraphs one at a time. Only the tiny "extract P[N]" suffix changes.
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
import { logger } from '../api/lib/logger.js';
import { detectLanguageFeatures } from '../api/services/segmenter.js';

const VLLM_URL = process.env.VLLM_URL || 'http://boss:8000';
const VLLM_MODEL = 'Qwen/Qwen3-32B-AWQ';
const MAX_CONTEXT = 8192;
const RESERVED_DECODE = 800;      // Terse output needs fewer tokens
const USER_PROMPT_TOKENS = 30;    // "Extract entities from [docId:P123]."
const OVERHEAD_PER_PARA = 15;     // [docId:Pindex] marker + newlines per paragraph
const INSTRUCTION_TOKENS = 200;   // Fixed instruction text in system prompt
const SAFETY_MARGIN = 300;        // Buffer for tokenizer estimation errors
const AVAILABLE_TOKENS = MAX_CONTEXT - RESERVED_DECODE - USER_PROMPT_TOKENS - INSTRUCTION_TOKENS - SAFETY_MARGIN;
const MAX_PARAGRAPH_CHARS = 4000;
const CONCURRENCY = 2;            // Two parallel document streams
const SMALL_DOC_THRESHOLD = 10;   // Docs with <= 10 paragraphs are "small" and get batched
const STATE_FILE = join(PROJECT_ROOT, 'tmp', 'lightrag-state.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const docIdIdx = args.indexOf('--doc-id');
const docIdFilter = docIdIdx >= 0 ? parseInt(args[docIdIdx + 1], 10) : null;
const religionIdx = args.indexOf('--religion');
const religionFilter = religionIdx >= 0 ? args[religionIdx + 1] : null;

const stats = {
  started: new Date().toISOString(),
  docsProcessed: 0, windowCalls: 0, paragraphsExtracted: 0,
  entitiesFound: 0, errors: 0, totalPromptTokens: 0,
  totalCachedTokens: 0, cacheHitRate: 0, rate: 0
};

async function fetchVLLMCacheRate() {
  try {
    const res = await fetch(`${VLLM_URL.replace(':8000', ':8004')}/metrics`);
    const text = await res.text();
    const queries = text.match(/prefix_cache_queries_total\{[^}]*\}\s+([\d.e+]+)/);
    const hits = text.match(/prefix_cache_hits_total\{[^}]*\}\s+([\d.e+]+)/);
    if (queries && hits) {
      const q = parseFloat(queries[1]);
      const h = parseFloat(hits[1]);
      return q > 0 ? parseFloat(((h / q) * 100).toFixed(1)) : 0;
    }
  } catch { /* metrics endpoint may not be available */ }
  return null;
}

function saveState() {
  try { writeFileSync(STATE_FILE, JSON.stringify(stats, null, 2)); } catch { /* non-critical */ }
}

function estimateTokens(text) {
  if (!text) return 0;
  const features = detectLanguageFeatures(text);
  const cpt = features.isRTL ? 2 : (features.rtlRatio > 0.1 ? 2.5 : 4);
  return Math.ceil(text.length / cpt);
}

// TERSE output format — names only, no descriptions. Saves ~60% output tokens.
const TERSE_SCHEMA = '{"p":["person names"],"pl":["place names"],"d":["document/book names"],"e":["event names"],"c":["concept names"],"r":[["from","to","relation"]]}';

function parseTerseResponse(text) {
  if (!text) return null;
  let clean = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (!clean) return null;
  try {
    const parsed = JSON.parse(clean);
    return {
      people: (parsed.p || []).map(n => typeof n === 'string' ? { name: n } : n),
      places: (parsed.pl || []).map(n => typeof n === 'string' ? { name: n } : n),
      documents: (parsed.d || []).map(n => typeof n === 'string' ? { name: n } : n),
      events: (parsed.e || []).map(n => typeof n === 'string' ? { name: n } : n),
      concepts: (parsed.c || []).map(n => typeof n === 'string' ? { name: n } : n),
      relations: (parsed.r || []).map(r => Array.isArray(r) ? { from: r[0], to: r[1], description: r[2] } : r)
    };
  } catch { return null; }
}

async function callVLLM(systemPrompt, userPrompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000);
  try {
    const response = await fetch(`${VLLM_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VLLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '/no_think\n' + userPrompt }
        ],
        temperature: 0.1,
        max_tokens: RESERVED_DECODE,
        chat_template_kwargs: { enable_thinking: false }
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const errBody = (await response.text()).substring(0, 200);
      const err = new Error(`vLLM ${response.status}: ${errBody}`);
      err.status = response.status;
      throw err;
    }
    const data = await response.json();
    const usage = data.usage || {};
    stats.totalPromptTokens += usage.prompt_tokens || 0;
    stats.totalCachedTokens += usage.prompt_tokens_details?.cached_tokens || 0;
    let content = data.choices?.[0]?.message?.content || '';
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return content;
  } finally { clearTimeout(timeout); }
}

function buildSystemPrompt(docs, paragraphsByDoc) {
  let prompt = `Extract named entities from paragraphs. Return ONLY compact JSON per this schema:
${TERSE_SCHEMA}
p=people, pl=places, d=documents/books, e=events, c=concepts, r=relations [from,to,type].
Empty arrays for missing categories. Names only, no descriptions.\n\n`;

  for (const doc of docs) {
    prompt += `--- "${doc.title}" by ${doc.author || 'Unknown'} (${doc.religion || '?'}, ${doc.collection || '?'}) ---\n`;
    for (const p of paragraphsByDoc.get(doc.id)) {
      prompt += `[${doc.id}:P${p.paragraph_index}] ${p.text}\n\n`;
    }
  }
  return prompt;
}

async function storeResult(paraId, docId, objects) {
  if (!objects) return;
  const names = [
    ...objects.people.map(e => e.name),
    ...objects.places.map(e => e.name),
    ...objects.concepts.map(e => e.name),
    ...objects.events.map(e => e.name),
    ...objects.documents.map(e => e.name)
  ].filter(Boolean);
  stats.entitiesFound += names.length;

  await query(`INSERT OR REPLACE INTO content_objects
    (content_id, doc_id, people_json, places_json, documents_json, events_json, concepts_json, relations_json, rendered, object_pipeline_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [paraId, docId,
     JSON.stringify(objects.people), JSON.stringify(objects.places),
     JSON.stringify(objects.documents), JSON.stringify(objects.events),
     JSON.stringify(objects.concepts), JSON.stringify(objects.relations),
     names.join(', '), 'v3-batch']);
}

async function storeError(paraId, docId) {
  await query(`INSERT OR IGNORE INTO content_objects (content_id, doc_id, rendered, object_pipeline_version) VALUES (?, ?, ?, ?)`,
    [paraId, docId, 'ERROR', 'v3-batch']);
}

// Process a batch of documents (1 large doc or multiple small docs packed together)
async function processBatch(docs) {
  const paragraphsByDoc = new Map();
  const needsIdsByDoc = new Map();
  let totalTokens = 0;

  for (const doc of docs) {
    const allParas = await queryAll(`
      SELECT c.id, c.doc_id, c.paragraph_index, c.text FROM content c
      WHERE c.doc_id = ? AND c.deleted_at IS NULL AND LENGTH(c.text) > 20 AND LENGTH(c.text) <= ?
      ORDER BY c.paragraph_index`, [doc.id, MAX_PARAGRAPH_CHARS]);

    const needs = await queryAll(`
      SELECT c.id FROM content c LEFT JOIN content_objects co ON c.id = co.content_id
      WHERE c.doc_id = ? AND c.deleted_at IS NULL AND LENGTH(c.text) > 20 AND LENGTH(c.text) <= ? AND co.content_id IS NULL`,
      [doc.id, MAX_PARAGRAPH_CHARS]);

    const needsIds = new Set(needs.map(r => r.id));
    if (needsIds.size === 0) continue;

    // Fit as many paragraphs as the budget allows (include per-paragraph overhead)
    const included = [];
    for (const p of allParas) {
      const t = estimateTokens(p.text) + OVERHEAD_PER_PARA;
      if (totalTokens + t > AVAILABLE_TOKENS) break;
      included.push(p);
      totalTokens += t;
    }
    if (included.length === 0) continue;

    paragraphsByDoc.set(doc.id, included);
    needsIdsByDoc.set(doc.id, needsIds);
  }

  if (paragraphsByDoc.size === 0) return;

  const systemPrompt = buildSystemPrompt(
    docs.filter(d => paragraphsByDoc.has(d.id)),
    paragraphsByDoc
  );

  // Step through each paragraph that needs extraction
  for (const [docId, paras] of paragraphsByDoc) {
    const needsIds = needsIdsByDoc.get(docId);
    for (const p of paras) {
      if (!needsIds.has(p.id)) continue;
      try {
        const content = await callVLLM(systemPrompt, `Extract entities from [${docId}:P${p.paragraph_index}].`);
        const objects = parseTerseResponse(content);
        await storeResult(p.id, docId, objects);
        stats.paragraphsExtracted++;
        stats.windowCalls++;

        if (stats.windowCalls % 50 === 0 && stats.totalPromptTokens > 0) {
          stats.cacheHitRate = ((stats.totalCachedTokens / stats.totalPromptTokens) * 100).toFixed(1);
          console.log(`  [cache] ${stats.cacheHitRate}% (${stats.totalCachedTokens.toLocaleString()} / ${stats.totalPromptTokens.toLocaleString()})`);
        }
      } catch (err) {
        stats.errors++;
        if (err.status === 400) {
          // Prompt too long — skip remaining paragraphs in this batch,
          // they'll be retried with a smaller window on the next run
          logger.warn({ docId, paraCount: paras.length }, 'Prompt too long (400) — skipping rest of batch for retry');
          break;
        }
        if (stats.errors <= 10 || stats.errors % 100 === 0)
          logger.warn({ err: err.message, paraId: p.id, docId }, 'Extraction failed');
        await storeError(p.id, docId);
      }
    }
  }

  stats.docsProcessed += paragraphsByDoc.size;
}

async function main() {
  console.log('=== LightRAG v3: Batch + Terse + Concurrent ===');
  console.log(`vLLM: ${VLLM_URL}, Available: ~${AVAILABLE_TOKENS} tokens/window`);
  console.log(`Concurrency: ${CONCURRENCY}, Small doc threshold: ${SMALL_DOC_THRESHOLD} paras`);
  if (dryRun) console.log('DRY RUN');
  console.log();

  await runMigrations();

  let docWhere = 'WHERE d.deleted_at IS NULL';
  const docParams = [];
  if (docIdFilter) { docWhere += ' AND d.id = ?'; docParams.push(docIdFilter); }
  if (religionFilter) { docWhere += ' AND d.religion = ?'; docParams.push(religionFilter); }

  // Split into large and small documents
  const largeDocs = await queryAll(`
    SELECT d.id, d.title, d.author, d.religion, d.collection, d.year, d.language, d.paragraph_count
    FROM docs d ${docWhere} AND d.paragraph_count > ?
    ORDER BY d.paragraph_count DESC`, [...docParams, SMALL_DOC_THRESHOLD]);

  const smallDocs = await queryAll(`
    SELECT d.id, d.title, d.author, d.religion, d.collection, d.year, d.language, d.paragraph_count
    FROM docs d ${docWhere} AND d.paragraph_count <= ? AND d.paragraph_count > 0
    ORDER BY d.religion, d.collection, d.id`, [...docParams, SMALL_DOC_THRESHOLD]);

  console.log(`Large docs (>${SMALL_DOC_THRESHOLD} paras): ${largeDocs.length}`);
  console.log(`Small docs (≤${SMALL_DOC_THRESHOLD} paras): ${smallDocs.length}`);
  console.log();
  if (dryRun) return;

  // Build batches of small documents that fit together in one window
  const smallBatches = [];
  let currentBatch = [];
  let currentBatchTokens = 0;

  for (const doc of smallDocs) {
    const estTokens = (doc.paragraph_count || 1) * (100 + OVERHEAD_PER_PARA); // text + markers
    if (currentBatch.length > 0 && currentBatchTokens + estTokens > AVAILABLE_TOKENS * 0.7) {
      smallBatches.push(currentBatch);
      currentBatch = [];
      currentBatchTokens = 0;
    }
    currentBatch.push(doc);
    currentBatchTokens += estTokens;
  }
  if (currentBatch.length > 0) smallBatches.push(currentBatch);

  console.log(`Small doc batches: ${smallBatches.length} (avg ${smallBatches.length > 0 ? Math.round(smallDocs.length / smallBatches.length) : 0} docs/batch)`);

  // Build unified work queue: large docs as single-doc batches, small docs as multi-doc batches
  const workQueue = [
    ...largeDocs.map(d => [d]),       // Each large doc is its own batch
    ...smallBatches                    // Small docs are batched together
  ];

  console.log(`Total work items: ${workQueue.length}\n`);

  const startTime = Date.now();
  let lastLogTime = startTime;
  let queueIdx = 0;

  // Process with concurrency
  async function worker() {
    while (queueIdx < workQueue.length) {
      const idx = queueIdx++;
      const batch = workQueue[idx];
      await processBatch(batch);

      const now = Date.now();
      if (now - lastLogTime > 60000) {
        const elapsed = (now - startTime) / 60000;
        stats.rate = Math.round(stats.paragraphsExtracted / elapsed);
        // Fetch live cache rate from vLLM Prometheus metrics
        const liveRate = await fetchVLLMCacheRate();
        if (liveRate !== null) stats.cacheHitRate = liveRate;
        console.log(`  ${stats.docsProcessed} docs, ${stats.paragraphsExtracted.toLocaleString()} paras, ${stats.entitiesFound.toLocaleString()} entities, ${stats.errors} errors, ~${stats.rate}/min, cache: ${stats.cacheHitRate}% [${idx+1}/${workQueue.length}]`);
        saveState();
        lastLogTime = now;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  stats.cacheHitRate = stats.totalPromptTokens > 0 ? ((stats.totalCachedTokens / stats.totalPromptTokens) * 100).toFixed(1) : '0';
  console.log('\n=== Summary ===');
  console.log(`Documents:   ${stats.docsProcessed}`);
  console.log(`Paragraphs:  ${stats.paragraphsExtracted.toLocaleString()}`);
  console.log(`Entities:    ${stats.entitiesFound.toLocaleString()}`);
  console.log(`Calls:       ${stats.windowCalls}`);
  console.log(`Errors:      ${stats.errors}`);
  console.log(`Cache rate:  ${stats.cacheHitRate}%`);
  console.log(`Time:        ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
  saveState();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
