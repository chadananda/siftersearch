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
 *   node scripts/run-enrichment.js --resume               # continue from checkpoint
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
const PIPELINE_VERSION = 'v2-sliding';
const MAX_CONTEXT = 16384; // Qwen3-30B-A3B MoE context window
const RESERVED_DECODE = 250;
const USER_PROMPT_TOKENS = 60;
const SAFETY_MARGIN = 500;
const MAX_WINDOW_CHARS = 24000; // hard limit for system prompt chars
const DEFAULT_N = 15;

// ─── CLI ─────────────────────────────────────────────────────────────────────

import { parseArgs } from 'util';
const { values: cliArgs } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    'resume': { type: 'boolean', default: false },
    'doc-id': { type: 'string' },
    'religion': { type: 'string' },
    'max-docs': { type: 'string', default: '999999' },
  },
  strict: false,
});
const dryRun = cliArgs['dry-run'];
const resume = cliArgs['resume'];
const docIdArg = cliArgs['doc-id'];
const religionArg = cliArgs['religion'];
const maxDocsArg = parseInt(cliArgs['max-docs']);

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
  return Math.min(N, 30); // cap at 30 — 60-paragraph windows with 16K context
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

function buildDisambigUserPrompt(pIndex) {
  return `/no_think\n[P${pIndex}] Identify every ambiguous reference. For each, give the full resolved name or meaning.\nOutput: short_ref = full_name | short_ref = full_name\nResolve: "He/She/They" = who exactly, "it/this/that" = what exactly, abbreviations = full form, partial names = complete names with dates/roles if known.\nIf nothing is ambiguous, output: CLEAR`;
}

function buildHyPEUserPrompt(pIndex, religion) {
  return `/no_think\n[P${pIndex}] Generate 7 diverse search queries someone might use to find this passage. One per line. No numbering.\n3 factual (who/what/when), 2 conceptual (themes/ideas explored), 2 exploratory (why/how/implications).\nMax 15 words each. Write as natural search queries, not formal questions.${religion ? ` Domain: ${religion}.` : ''}`;
}

// ─── Database ────────────────────────────────────────────────────────────────

function getDocumentsInOrder(db, religion, docId, maxDocs) {
  let sql = `
    SELECT d.id, d.title, d.author, d.religion, d.collection,
           d.year, d.language, d.description, d.paragraph_count
    FROM docs d
    WHERE d.deleted_at IS NULL AND d.paragraph_count > 0
  `;
  const params = [];

  if (docId) {
    sql += ' AND d.id = ?';
    params.push(parseInt(docId));
  } else if (religion) {
    sql += ' AND d.religion = ?';
    params.push(religion);
  }

  sql += ' ORDER BY d.paragraph_count DESC';

  if (maxDocs < 999999) {
    sql += ' LIMIT ?';
    params.push(maxDocs);
  }

  return db.prepare(sql).all(...params);
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

// ─── Process a single window ─────────────────────────────────────────────────

async function processWindow(db, doc, systemPrompt, windowParas, N, model) {
  // Targets are the back half of the window
  const targets = windowParas.slice(N);
  let windowDisambig = 0;
  let windowHype = 0;

  // Phase A: Disambiguation
  for (let i = 0; i < targets.length; i++) {
    const para = targets[i];
    if (para.context !== null) continue; // already done

    const pIndex = N + i + 1; // 1-based position in window
    const userPrompt = buildDisambigUserPrompt(pIndex);

    try {
      const result = await callLocalLLM(systemPrompt, userPrompt, {
        maxTokens: 80, temperature: 0.2, returnUsage: true, timeout: 30000
      });

      const response = result?.content ?? result;
      const usage = result?.usage;

      if (usage) {
        stats._callTimes.push(usage.callMs || 0);
        stats._cachedTokens += usage.cachedTokens || 0;
        stats._totalPromptTokens += usage.promptTokens || 0;
      }

      const parsed = parseDisambiguationResponse(response);
      if (parsed) {
        updateContext(db, para.id, parsed, model);
        windowDisambig++;
      } else {
        // NONE or empty = nothing to disambiguate
        updateContext(db, para.id, '', model);
        windowDisambig++;
      }
    } catch (err) {
      stats.errors++;
      if (stats.errors <= 10) console.error(`    Disambig error P${para.id}: ${err.message}`);
    }
  }

  // Phase B: HyPE questions
  for (let i = 0; i < targets.length; i++) {
    const para = targets[i];
    if (para.hyp_questions !== null) continue; // already done

    const pIndex = N + i + 1;
    const userPrompt = buildHyPEUserPrompt(pIndex, doc.religion);

    try {
      const result = await callLocalLLM(systemPrompt, userPrompt, {
        maxTokens: 200, temperature: 0.5, returnUsage: true, timeout: 30000
      });

      const response = result?.content ?? result;
      const usage = result?.usage;

      if (usage) {
        stats._callTimes.push(usage.callMs || 0);
        stats._cachedTokens += usage.cachedTokens || 0;
        stats._totalPromptTokens += usage.promptTokens || 0;
      }

      const questions = parseHyPEResponse(response);
      if (questions && questions.length > 0) {
        updateHypQuestions(db, para.id, questions.join('\n'));
        windowHype++;
      } else {
        stats.errors++;
      }
    } catch (err) {
      stats.errors++;
      if (stats.errors <= 10) console.error(`    HyPE error P${para.id}: ${err.message}`);
    }
  }

  stats.disambigDone += windowDisambig;
  stats.hypeDone += windowHype;
  stats.paragraphsProcessed += targets.length;

  return { disambig: windowDisambig, hype: windowHype };
}

// ─── Process a document ──────────────────────────────────────────────────────

async function processDocument(db, doc, resumeOffset = 0) {
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

  // Build sliding windows
  let windowStart = resumeOffset;
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

  // Get documents in priority order
  const docs = getDocumentsInOrder(db, religionArg, docIdArg, maxDocsArg);
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

  // Resume from checkpoint
  let startDocIndex = 0;
  let resumeWindowOffset = 0;
  if (resume) {
    const saved = loadState();
    if (saved?.currentDocId) {
      const idx = docs.findIndex(d => d.id === saved.currentDocId);
      if (idx >= 0) {
        startDocIndex = idx;
        resumeWindowOffset = saved.currentWindowStart || 0;
        stats.docsCompleted = saved.docsCompleted || 0;
        stats.paragraphsProcessed = saved.paragraphsProcessed || 0;
        stats.disambigDone = saved.disambigDone || 0;
        stats.hypeDone = saved.hypeDone || 0;
        stats.errors = saved.errors || 0;
        console.log(`Resuming from doc ${saved.currentDocId} (${saved.currentDocTitle}), window offset ${resumeWindowOffset}`);
      }
    }
  }

  saveState();

  // Process documents
  for (let i = startDocIndex; i < docs.length; i++) {
    const doc = docs[i];
    stats.currentDocId = doc.id;
    stats.currentDocTitle = doc.title;

    console.log(`\n[${i + 1}/${docs.length}] ${doc.title} by ${doc.author} (${doc.paragraph_count} paragraphs)`);

    const offset = (i === startDocIndex) ? resumeWindowOffset : 0;
    await processDocument(db, doc, offset);

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
