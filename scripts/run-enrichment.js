#!/usr/bin/env node
/**
 * Enrichment Pipeline — Disambiguation + HyPE with prefix-cached sliding windows
 *
 * Processes documents through local vLLM (boss server) using overlapping windows
 * that maximize KV cache reuse. For each window of 2N paragraphs:
 * - System prompt (metadata + entities + window text) is byte-identical = CACHED
 * - N disambiguation calls + N HyPE calls share the same cached prefix
 *
 * Usage:
 *   node scripts/run-enrichment.js                        # all docs, priority order
 *   node scripts/run-enrichment.js --religion "Baha'i"    # one religion
 *   node scripts/run-enrichment.js --doc-id 123           # single document
 *   node scripts/run-enrichment.js --max-docs 50          # limit documents
 *   node scripts/run-enrichment.js --dry-run              # estimate work
 *   node scripts/run-enrichment.js --resume               # skip docs already fully done
 *   node scripts/run-enrichment.js --content-ids 1,2,3    # regenerate specific paragraphs
 *
 * Recovery model: every run scans each doc's windows from the start. The per-
 * window target filter only calls the LLM for paragraphs where context or
 * hyp_questions is still NULL, so completed work is fast-skipped and any gaps
 * (from a prior outage or a --content-ids force) are filled in automatically.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, readFileSync } from 'fs';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { callLocalLLM, localLLMHealthCheck, parseDisambiguationResponse, parseHyPEResponse } from '../api/lib/enhancement-ai.js';
import { detectLanguageFeatures } from '../api/services/segmenter.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const DB_PATH = join(PROJECT_ROOT, 'data', 'sifter.db');
const STATE_FILE = join(PROJECT_ROOT, 'tmp', 'enrichment-state.json');
const PIPELINE_VERSION = 'v3-batched';
const MAX_CONTEXT = 32768; // Qwen3-30B-A3B MoE with expanded context
const RESERVED_DECODE = 2000; // larger output for batched responses
const USER_PROMPT_TOKENS = 100;
const SAFETY_MARGIN = 500;
const MAX_WINDOW_CHARS = 50000; // hard limit for system prompt chars
const DEFAULT_N = 20;

// ─── CLI ─────────────────────────────────────────────────────────────────────

import { parseArgs } from 'util';
const { values: cliArgs } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    'resume': { type: 'boolean', default: false },
    'doc-id': { type: 'string' },
    'religion': { type: 'string' },
    'max-docs': { type: 'string', default: '999999' },
    'content-ids': { type: 'string' },
  },
  strict: false,
});
const dryRun = cliArgs['dry-run'];
const resume = cliArgs['resume'];
const docIdArg = cliArgs['doc-id'];
const religionArg = cliArgs['religion'];
const maxDocsArg = parseInt(cliArgs['max-docs']);
const contentIdsArg = cliArgs['content-ids']
  ? cliArgs['content-ids'].split(',').map(s => parseInt(s.trim())).filter(Number.isFinite)
  : null;

// ─── State ───────────────────────────────────────────────────────────────────

const stats = {
  started: '',
  currentDocId: null,
  currentDocTitle: '',
  currentWindowStart: 0,
  docsCompleted: 0,
  docsTotal: 0,
  paragraphsProcessed: 0,
  paragraphsTotal: 0,
  disambigDone: 0,
  hypeDone: 0,
  errors: 0,
  avgCallMs: 0,
  cacheHitRate: 0,
  rate: 0,
  _callTimes: [],
  _cachedTokens: 0,
  _totalPromptTokens: 0,
};

function saveState() {
  try {
    const out = { ...stats };
    delete out._callTimes;
    delete out._cachedTokens;
    delete out._totalPromptTokens;
    writeFileSync(STATE_FILE, JSON.stringify(out, null, 2));
  } catch { /* non-critical */ }
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// ─── Token estimation ────────────────────────────────────────────────────────

function estimateTokens(text) {
  if (!text) return 0;
  const features = detectLanguageFeatures(text);
  const cpt = features.isRTL ? 2 : (features.rtlRatio > 0.1 ? 2.5 : 4);
  return Math.ceil(text.length / cpt);
}

function computeN(paragraphs) {
  if (paragraphs.length === 0) return DEFAULT_N;
  // Sample first 20 paragraphs for avg token estimate
  const sample = paragraphs.slice(0, 20);
  const avgTokens = sample.reduce((s, p) => s + estimateTokens(p.text), 0) / sample.length;
  const entityOverhead = 30; // ~30 tokens per paragraph for entity names
  const tokensPerPara = avgTokens + entityOverhead;
  const available = MAX_CONTEXT - RESERVED_DECODE - USER_PROMPT_TOKENS - SAFETY_MARGIN;
  const metaTokens = 80; // book metadata block
  const twoN = Math.floor((available - metaTokens) / tokensPerPara);
  const N = Math.max(3, Math.floor(twoN / 2));
  return Math.min(N, 50); // cap at 50 — 100-paragraph windows with 32K context
}

// ─── System prompt builder ───────────────────────────────────────────────────

function buildSystemPrompt(doc, windowParagraphs, contentObjectsMap) {
  // Book metadata
  const metaLines = [`"${doc.title}" by ${doc.author}`, `${doc.religion} / ${doc.collection}`];
  if (doc.year) metaLines.push(`Year: ${doc.year}`);
  if (doc.language && doc.language !== 'en') metaLines.push(`Language: ${doc.language}`);
  if (doc.description) metaLines.push(`About: ${doc.description.slice(0, 300)}`);

  // Window paragraphs with inline entities per paragraph
  let windowText = '';
  for (let i = 0; i < windowParagraphs.length; i++) {
    const p = windowParagraphs[i];
    let line = `[P${i + 1}] ${p.text}\n`;

    // Inline entity annotations from content_objects
    const co = contentObjectsMap.get(p.id);
    if (co?.rendered && co.rendered.length > 2) {
      line += `  ↳ ${co.rendered.slice(0, 200)}\n`;
    }

    if (windowText.length + line.length > MAX_WINDOW_CHARS && i > 0) break;
    windowText += line;
  }

  return `${metaLines.join('\n')}\n\n<window>\n${windowText}</window>`;
}

// ─── User prompts ────────────────────────────────────────────────────────────

// Batched prompts: process ALL target paragraphs in one call
function buildBatchDisambigPrompt(targetIndices) {
  const pList = targetIndices.map(i => `[P${i}]`).join(', ');
  return `/no_think\nDisambiguate each of these paragraphs: ${pList}

For EACH paragraph, output one line:
[P#] ambiguous_ref = specific_identity | ambiguous_ref = specific_identity
If nothing ambiguous: [P#] CLEAR

RULES:
- Read the paragraph AS IF IT STANDS ALONE with no surrounding context
- If a reference would be unclear to someone reading ONLY that paragraph, disambiguate it
- This includes pronouns (He, She, They), titles (the Guardian, the Master), descriptions (the city, the holy book, the teacher), and any vague reference
- Resolve each to its SPECIFIC name using the surrounding paragraphs as context
- NEVER echo a name back to itself — "Bahá'u'lláh = Bahá'u'lláh" is WRONG, skip it
- NEVER repeat the same disambiguation twice in one paragraph
- If the paragraph already names the person/place/thing explicitly, do NOT disambiguate it
- Use ONLY information from the document text, never general knowledge`;
}

function buildBatchHyPEPrompt(targetIndices, religion) {
  const pList = targetIndices.map(i => `[P${i}]`).join(', ');
  return `/no_think\nGenerate search queries for each paragraph: ${pList}

For EACH paragraph, output:
[P#]
- 3-5 natural search queries someone would type to find this specific passage
- Each query should be a real question or search phrase (max 15 words)
- Include the specific names, concepts, and topics from the paragraph
- Make queries specific enough that THIS paragraph would be the best result

${religion ? `Domain: ${religion}.` : ''}`;
}

// Parse batched disambiguation response — one line per paragraph
function parseBatchDisambig(response, targetIndices) {
  if (!response) return new Map();
  let text = response.trim().replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*/g, '').trim();

  const results = new Map();
  for (const idx of targetIndices) {
    // Find the line for this paragraph
    const pattern = new RegExp(`\\[P${idx}\\]\\s*(.+?)(?=\\n\\[P\\d|$)`, 's');
    const match = text.match(pattern);
    if (match) {
      const content = match[1].trim();
      results.set(idx, content.match(/^CLEAR$/i) ? '' : content.slice(0, 500));
    }
  }
  return results;
}

// Parse batched HyPE response — questions grouped by [P#]
function parseBatchHyPE(response, targetIndices) {
  if (!response) return new Map();
  let text = response.trim().replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*/g, '').trim();

  const results = new Map();
  for (let i = 0; i < targetIndices.length; i++) {
    const idx = targetIndices[i];
    const nextIdx = targetIndices[i + 1];
    // Extract section between [P#] markers
    const startPattern = new RegExp(`\\[P${idx}\\]`);
    const startMatch = text.match(startPattern);
    if (!startMatch) continue;

    const startPos = startMatch.index + startMatch[0].length;
    let endPos = text.length;
    if (nextIdx) {
      const endPattern = new RegExp(`\\[P${nextIdx}\\]`);
      const endMatch = text.slice(startPos).match(endPattern);
      if (endMatch) endPos = startPos + endMatch.index;
    }

    const section = text.slice(startPos, endPos).trim();
    const questions = section
      .split('\n')
      .map(l => l.replace(/^[\d]+\.\s*/, '').replace(/^[-•*]\s*/, '').trim())
      .filter(l => l.length > 5 && !l.startsWith('[P'));

    if (questions.length > 0) {
      results.set(idx, questions);
    }
  }
  return results;
}

// ─── Database ────────────────────────────────────────────────────────────────

// Skip catalog/index documents that don't benefit from enrichment
const SKIP_TITLES = new Set([
  'a partial inventory of the works of the central figures',
]);

function getDocumentsInOrder(db, religion, docId, maxDocs) {
  let sql = `
    SELECT d.id, d.title, d.author, d.religion, d.collection,
           d.year, d.language, d.description, d.paragraph_count
    FROM docs d
    WHERE d.deleted_at IS NULL AND d.paragraph_count > 0
      AND d.paragraph_count < 10000
  `;
  const params = [];

  if (docId) {
    sql += ' AND d.id = ?';
    params.push(parseInt(docId));
  } else if (religion) {
    sql += ' AND d.religion = ?';
    params.push(religion);
  }

  // Priority: core collections first, then by paragraph count (larger = more cache reuse)
  sql += ` ORDER BY
    CASE d.collection
      WHEN 'Core Tablets' THEN 1
      WHEN 'Core Publications' THEN 2
      WHEN 'Core Talks' THEN 3
      WHEN 'Baha''i Books' THEN 4
      WHEN 'Tablet Translations' THEN 5
      WHEN 'Compilations' THEN 6
      WHEN 'Pilgrim Notes' THEN 7
      WHEN 'Papers' THEN 8
      ELSE 9
    END, d.paragraph_count DESC`;

  if (maxDocs < 999999) {
    sql += ' LIMIT ?';
    params.push(maxDocs);
  }

  const docs = db.prepare(sql).all(...params);
  return docs.filter(d => !SKIP_TITLES.has(d.title?.toLowerCase()?.trim()));
}

function getDocParagraphs(db, docId) {
  return db.prepare(`
    SELECT id, paragraph_index, text, context, hyp_questions
    FROM content
    WHERE doc_id = ? AND deleted_at IS NULL AND LENGTH(text) > 50
    ORDER BY paragraph_index
  `).all(docId);
}

function getContentObjects(db, docId) {
  const rows = db.prepare(`
    SELECT content_id, rendered, people_json, places_json, concepts_json, events_json, documents_json
    FROM content_objects WHERE doc_id = ?
  `).all(docId);
  const map = new Map();
  for (const r of rows) map.set(r.content_id, r);
  return map;
}

function updateContext(db, contentId, context, model) {
  db.prepare(`UPDATE content SET context = ?, context_model = ?, enhanced_synced = 0 WHERE id = ?`)
    .run(context, model, contentId);
}

function updateHypQuestions(db, contentId, questions) {
  db.prepare(`UPDATE content SET hyp_questions = ?, enhanced_synced = 0 WHERE id = ?`)
    .run(questions, contentId);
}

// ─── LLM call with retry + health poll ──────────────────────────────────────

// Wraps a single LLM call so transient errors (network, 5xx, timeouts) don't
// silently advance the sliding window. On error, waits for the endpoint to
// become healthy again via localLLMHealthCheck, then retries. Throws after
// MAX_ATTEMPTS or if the endpoint stays unhealthy longer than HEALTH_TIMEOUT.
const RETRY_MAX_ATTEMPTS = 8;
const RETRY_BASE_DELAY_MS = 2000;
const RETRY_MAX_DELAY_MS = 30000;
const HEALTH_POLL_INTERVAL_MS = 10000;
const HEALTH_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

async function callLLMWithRetry(label, fn) {
  let delay = RETRY_BASE_DELAY_MS;
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.error(`    ${label} attempt ${attempt}/${RETRY_MAX_ATTEMPTS} failed: ${err.message}`);
      if (attempt === RETRY_MAX_ATTEMPTS) break;

      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * 2, RETRY_MAX_DELAY_MS);

      // Poll health until LLM is back (bounded).
      const healthStart = Date.now();
      let waited = false;
      while (!(await localLLMHealthCheck())) {
        if (!waited) {
          console.error(`    Waiting for local LLM to become healthy...`);
          waited = true;
        }
        if (Date.now() - healthStart > HEALTH_TIMEOUT_MS) {
          throw new Error(`Local LLM unhealthy for >${HEALTH_TIMEOUT_MS / 60000}min, giving up`);
        }
        await new Promise(r => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
      }
      if (waited) console.log(`    Local LLM healthy again after ${Math.round((Date.now() - healthStart) / 1000)}s, retrying`);
    }
  }
  throw lastErr;
}

// ─── Process a single window ─────────────────────────────────────────────────

async function processWindow(db, doc, systemPrompt, windowParas, N, model) {
  // Targets are the back half of the window
  const targets = windowParas.slice(N);
  let windowDisambig = 0;
  let windowHype = 0;

  // Batched: 2 calls per window instead of 2N calls
  // Collect targets that need work
  const disambigTargets = [];
  const hypeTargets = [];
  for (let i = 0; i < targets.length; i++) {
    const pIndex = N + i + 1;
    if (targets[i].context === null) disambigTargets.push({ para: targets[i], pIndex });
    if (targets[i].hyp_questions === null) hypeTargets.push({ para: targets[i], pIndex });
  }

  // Call 1: Batch disambiguation for all targets
  let disambigOk = true;
  if (disambigTargets.length > 0) {
    const indices = disambigTargets.map(t => t.pIndex);
    const maxTokens = Math.min(2000, disambigTargets.length * 60);
    try {
      const result = await callLLMWithRetry('Batch disambig', () =>
        callLocalLLM(systemPrompt, buildBatchDisambigPrompt(indices), {
          maxTokens, temperature: 0.2, returnUsage: true, timeout: 120000, throwOnError: true
        })
      );
      const response = result?.content ?? result;
      if (result?.usage) {
        stats._callTimes.push(result.usage.callMs || 0);
        stats._cachedTokens += result.usage.cachedTokens || 0;
        stats._totalPromptTokens += result.usage.promptTokens || 0;
      }
      const parsed = parseBatchDisambig(response, indices);
      for (const { para, pIndex } of disambigTargets) {
        const ctx = parsed.get(pIndex);
        if (ctx !== undefined) {
          updateContext(db, para.id, ctx, model);
          windowDisambig++;
        }
      }
    } catch (err) {
      disambigOk = false;
      stats.errors++;
      console.error(`    Batch disambig FAILED after retries: ${err.message}`);
    }
  }

  // Call 2: Batch HyPE for all targets
  let hypeOk = true;
  if (hypeTargets.length > 0) {
    const indices = hypeTargets.map(t => t.pIndex);
    const maxTokens = Math.min(3000, hypeTargets.length * 120);
    try {
      const result = await callLLMWithRetry('Batch HyPE', () =>
        callLocalLLM(systemPrompt, buildBatchHyPEPrompt(indices, doc.religion), {
          maxTokens, temperature: 0.5, returnUsage: true, timeout: 120000, throwOnError: true
        })
      );
      const response = result?.content ?? result;
      if (result?.usage) {
        stats._callTimes.push(result.usage.callMs || 0);
        stats._cachedTokens += result.usage.cachedTokens || 0;
        stats._totalPromptTokens += result.usage.promptTokens || 0;
      }
      const parsed = parseBatchHyPE(response, indices);
      for (const { para, pIndex } of hypeTargets) {
        const questions = parsed.get(pIndex);
        if (questions?.length) {
          updateHypQuestions(db, para.id, questions.join('\n'));
          windowHype++;
        }
      }
    } catch (err) {
      hypeOk = false;
      stats.errors++;
      console.error(`    Batch HyPE FAILED after retries: ${err.message}`);
    }
  }

  stats.disambigDone += windowDisambig;
  stats.hypeDone += windowHype;
  // Only count paragraphs as "processed" when the window's calls succeeded.
  // Targets that stayed NULL will be picked up naturally on the next run.
  if (disambigOk && hypeOk) {
    stats.paragraphsProcessed += targets.length;
  } else {
    stats.paragraphsProcessed += Math.max(windowDisambig, windowHype);
  }

  return { disambig: windowDisambig, hype: windowHype, ok: disambigOk && hypeOk };
}

// ─── Process a document ──────────────────────────────────────────────────────

async function processDocument(db, doc) {
  const paragraphs = getDocParagraphs(db, doc.id);
  if (paragraphs.length === 0) return;

  const contentObjectsMap = getContentObjects(db, doc.id);
  const N = computeN(paragraphs);

  // Count remaining work
  const needsDisambig = paragraphs.filter(p => p.context === null).length;
  const needsHype = paragraphs.filter(p => p.hyp_questions === null).length;

  if (needsDisambig === 0 && needsHype === 0) {
    console.log(`  ✓ Already complete (${paragraphs.length} paragraphs)`);
    return;
  }

  console.log(`  Paragraphs: ${paragraphs.length}, N=${N}, needs: ${needsDisambig} disambig, ${needsHype} HyPE`);

  // Always walk from the start. Windows whose targets are all already-done
  // fast-skip (no LLM calls). Any NULL gaps get picked up in their original
  // window, so nothing is ever orphaned by a mid-run outage or a force-null.
  let windowStart = 0;
  let windowCount = 0;

  while (windowStart < paragraphs.length) {
    const windowEnd = Math.min(windowStart + 2 * N, paragraphs.length);
    const windowParas = paragraphs.slice(windowStart, windowEnd);

    if (windowParas.length === 0) break;

    // Build system prompt (CACHED across all calls in this window)
    const systemPrompt = buildSystemPrompt(doc, windowParas, contentObjectsMap);

    stats.currentWindowStart = windowStart;
    saveState();

    const model = 'local-qwen3';
    const result = await processWindow(db, doc, systemPrompt, windowParas, Math.min(N, Math.floor(windowParas.length / 2) || 1), model);

    windowCount++;

    // Progress
    const elapsed = (Date.now() - new Date(stats.started).getTime()) / 60000;
    stats.rate = elapsed > 0 ? Math.round(stats.paragraphsProcessed / elapsed) : 0;
    stats.cacheHitRate = stats._totalPromptTokens > 0
      ? parseFloat(((stats._cachedTokens / stats._totalPromptTokens) * 100).toFixed(1))
      : 0;
    stats.avgCallMs = stats._callTimes.length > 0
      ? Math.round(stats._callTimes.reduce((a, b) => a + b, 0) / stats._callTimes.length)
      : 0;

    if (windowCount % 5 === 0 || windowStart + N >= paragraphs.length) {
      console.log(`    Window ${windowCount}: ${stats.paragraphsProcessed}/${stats.paragraphsTotal} paragraphs, ${stats.rate}/min, cache:${stats.cacheHitRate}%, avg:${stats.avgCallMs}ms`);
    }

    // Slide by N (or less if at end)
    if (windowEnd >= paragraphs.length) break;
    windowStart += N;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Enrichment Pipeline (Disambiguation + HyPE) ===');
  console.log(`Version: ${PIPELINE_VERSION}`);
  if (religionArg) console.log(`Religion: ${religionArg}`);
  if (docIdArg) console.log(`Document: ${docIdArg}`);
  console.log();

  // Health check
  const healthy = await localLLMHealthCheck();
  if (!healthy) {
    console.error('ERROR: Local LLM not available. Check LOCAL_LLM in .env-secrets');
    process.exit(1);
  }
  console.log('✓ Local LLM connected\n');

  const db = new Database(DB_PATH, { readonly: false });
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // --content-ids: null out the specified paragraphs, then process only their
  // parent docs. This is the "regenerate any portion of a book" path.
  // Bypasses the paragraph_count filter in getDocumentsInOrder since we know
  // exactly which docs we want.
  let docs;
  if (contentIdsArg?.length) {
    const placeholders = contentIdsArg.map(() => '?').join(',');
    const cleared = db.prepare(
      `UPDATE content SET context = NULL, hyp_questions = NULL, enhanced_synced = 0 WHERE id IN (${placeholders})`
    ).run(...contentIdsArg);
    const forcedDocIds = db.prepare(
      `SELECT DISTINCT doc_id FROM content WHERE id IN (${placeholders})`
    ).all(...contentIdsArg).map(r => r.doc_id);
    console.log(`Force-regenerate: cleared ${cleared.changes} paragraphs across ${forcedDocIds.length} doc(s)`);
    const docPlaceholders = forcedDocIds.map(() => '?').join(',');
    docs = db.prepare(
      `SELECT id, title, author, religion, collection, year, language, description, paragraph_count
       FROM docs WHERE id IN (${docPlaceholders}) AND deleted_at IS NULL`
    ).all(...forcedDocIds);
  } else {
    docs = getDocumentsInOrder(db, religionArg, docIdArg, maxDocsArg);
  }
  console.log(`Documents to process: ${docs.length}`);

  // Count total paragraphs
  let totalParas = 0;
  for (const doc of docs) totalParas += doc.paragraph_count || 0;
  console.log(`Total paragraphs: ${totalParas.toLocaleString()}\n`);

  if (dryRun) {
    const estMinutes = Math.ceil(totalParas / 150);
    const estHours = (estMinutes / 60).toFixed(1);
    console.log(`Estimated time: ~${estHours} hours (at ~150 paragraphs/min)`);
    console.log(`\nTop 10 documents:`);
    for (const doc of docs.slice(0, 10)) {
      console.log(`  ${doc.title} (${doc.paragraph_count} paragraphs)`);
    }
    db.close();
    return;
  }

  // Initialize stats
  stats.started = new Date().toISOString();
  stats.docsTotal = docs.length;
  stats.paragraphsTotal = totalParas;

  // Resume: skip docs that are already fully enriched. We walk each remaining
  // doc from windowStart=0 and let the per-window NULL filter skip completed
  // paragraphs. This is fast (no LLM calls for done work) and guarantees any
  // gaps from a prior outage get filled — no trust in a stale checkpoint.
  let startDocIndex = 0;
  if (resume) {
    const saved = loadState();
    if (saved) {
      stats.docsCompleted = saved.docsCompleted || 0;
      stats.paragraphsProcessed = saved.paragraphsProcessed || 0;
      stats.disambigDone = saved.disambigDone || 0;
      stats.hypeDone = saved.hypeDone || 0;
      stats.errors = saved.errors || 0;
      console.log(`Resuming with prior stats; scanning all docs for NULL paragraphs`);
    }
  }

  saveState();

  // Process documents
  for (let i = startDocIndex; i < docs.length; i++) {
    const doc = docs[i];
    stats.currentDocId = doc.id;
    stats.currentDocTitle = doc.title;

    console.log(`\n[${i + 1}/${docs.length}] ${doc.title} by ${doc.author} (${doc.paragraph_count} paragraphs)`);

    await processDocument(db, doc);

    stats.docsCompleted++;
    saveState();
  }

  // Summary
  const elapsed = (Date.now() - new Date(stats.started).getTime()) / 60000;
  console.log('\n=== Summary ===');
  console.log(`Documents: ${stats.docsCompleted}/${stats.docsTotal}`);
  console.log(`Paragraphs: ${stats.paragraphsProcessed.toLocaleString()}`);
  console.log(`Disambiguation: ${stats.disambigDone.toLocaleString()}`);
  console.log(`HyPE questions: ${stats.hypeDone.toLocaleString()}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Cache hit rate: ${stats.cacheHitRate}%`);
  console.log(`Avg call: ${stats.avgCallMs}ms`);
  console.log(`Rate: ${stats.rate} paragraphs/min`);
  console.log(`Time: ${elapsed.toFixed(1)} min`);

  db.close();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
