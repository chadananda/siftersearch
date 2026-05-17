#!/usr/bin/env node
// Entity extraction worker. Reads content WHERE graph_enriched=0, calls DeepSeek
// with extraction prompt v1, writes to paragraph_extractions.
// PM2 process: siftersearch-graph-extractor

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryAll, queryOne } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { runMigrations } from '../lib/migrations.js';
import { chatCompletion } from '../lib/ai.js';
import { trackCost, checkBudget } from '../lib/entity-cost-tracker.js';
import { findEntity } from '../lib/graph-db.js';

const PROMPT_VERSION = 'extract-v1';
const MODEL = process.env.EXTRACTION_MODEL || 'deepseek-chat';
// GPB gets deepseek-reasoner for higher-quality seed extraction — it's worth the cost
// deepseek-reasoner burns its token budget on reasoning, leaving nothing for JSON output.
// Use deepseek-chat for all extractions — the GPB prompt thoroughness is what matters.
const GPB_MODEL = process.env.GPB_EXTRACTION_MODEL || 'deepseek-chat';
const BATCH_SIZE = 16;
const GPB_BATCH_SIZE = 8;  // smaller batch for the heavier reasoner model
const IDLE_SLEEP_MS = 30_000;

const SYSTEM_PROMPT_TEMPLATE = readFileSync(
  join(PROJECT_ROOT, 'api/lib/llm-prompts/extract-v1.md'), 'utf8'
);
const OUTPUT_SCHEMA = JSON.parse(
  readFileSync(join(PROJECT_ROOT, 'api/lib/llm-prompts/extract-v1.schema.json'), 'utf8')
);

let isShuttingDown = false;

process.on('SIGTERM', () => { isShuttingDown = true; });
process.on('SIGINT', () => {});

const delay = ms => new Promise(r => setTimeout(r, ms));

// Cache alias count — skip the expensive join when no aliases exist yet
let _hasAliases = null;
async function hasAliases() {
  if (_hasAliases === null) {
    const row = await queryOne(`SELECT COUNT(*) as n FROM entity_aliases WHERE confidence >= 0.8`);
    _hasAliases = (row?.n || 0) > 0;
  }
  return _hasAliases;
}
// Invalidate after each batch so new aliases are picked up progressively
function invalidateAliasCache() { _hasAliases = null; }

// Build candidate dictionary for a paragraph — entities already known in the DB
// whose canonical names appear (case-insensitive) in the text.
async function buildCandidateDictionary(text) {
  if (!(await hasAliases())) return '(none pre-retrieved)';
  const textNorm = text.toLowerCase();
  const rows = await queryAll(`
    SELECT DISTINCT ge.id, ge.canonical_name, ge.entity_type AS type, ge.religion
    FROM entity_aliases ea
    JOIN graph_entities ge ON ge.id = ea.entity_id
    WHERE ea.confidence >= 0.8
    ORDER BY ge.canonical_name
  `);
  const matches = rows.filter(r => textNorm.includes(r.canonical_name.toLowerCase()));
  if (matches.length === 0) return '(none pre-retrieved)';
  return matches.map(r =>
    `  ${r.id}: "${r.canonical_name}" [${r.type || 'unknown'}${r.religion ? ', ' + r.religion : ''}]`
  ).join('\n');
}

// Resolve structural envelope for a paragraph's doc
async function getEnvelope(docId) {
  const doc = await queryOne(`
    SELECT title, author, religion
    FROM docs WHERE id = ?
  `, [docId]);
  if (!doc) return {};
  return {
    workTitle: doc.title || 'Unknown',
    author: doc.author || 'Unknown',
    periodName: 'Unknown',
    periodDateRange: 'Unknown',
    religion: doc.religion || 'Unknown',
  };
}

// Build the full system prompt for a paragraph
async function buildPrompt(row) {
  const envelope = await getEnvelope(row.doc_id);
  const candidates = await buildCandidateDictionary(row.text);

  return SYSTEM_PROMPT_TEMPLATE
    .replace('{{CANDIDATE_DICTIONARY}}', candidates)
    .replace('{{WORK_TITLE}}', envelope.workTitle)
    .replace('{{AUTHOR}}', envelope.author)
    .replace('{{PERIOD_NAME}}', envelope.periodName)
    .replace('{{PERIOD_DATE_RANGE}}', envelope.periodDateRange)
    .replace('{{EPISODE_NAME}}', '')
    .replace('{{PRECEDING_SPEAKER}}', 'null')
    .replace('{{PRECEDING_SETTING}}', 'null');
}

// Extract one paragraph — returns null if budget exhausted or parse fails
async function extractParagraph(row) {
  const budget = await checkBudget();
  if (budget.action === 'halt') {
    logger.warn({ spend: budget.spend, budget: budget.budget }, 'Extraction budget exhausted — halting');
    isShuttingDown = true;
    return null;
  }
  if (budget.action === 'local') {
    logger.warn('Budget near limit — skipping non-priority extraction');
    return null;
  }

  let systemPrompt;
  try {
    systemPrompt = await buildPrompt(row);
  } catch (err) {
    logger.error({ contentId: row.id, err: err.message }, 'buildPrompt failed');
    return null;
  }

  const isGpb = row.doc_id === GPB_DOC_ID;
  const activeModel = isGpb ? GPB_MODEL : MODEL;

  let result;
  try {
    // deepseek-reasoner does NOT support response_format (json_object or json_schema).
    // Rely on the system prompt "Return ONLY valid JSON" instruction for reasoner.
    // deepseek-chat supports json_object and must use it for reliable JSON output.
    result = await chatCompletion(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: row.text }],
      {
        model: activeModel,
        provider: 'deepseek',
        temperature: 0,
        maxTokens: isGpb ? 16384 : 4096,
        responseFormat: { type: 'json_object' },
      }
    );
  } catch (err) {
    logger.error({ contentId: row.id, err: err.message }, 'DeepSeek call failed');
    return null;
  }

  const usage = result.usage || {};
  const inputTokens  = usage.promptTokens    || 0;
  const outputTokens = usage.completionTokens || 0;
  const cachedTokens = usage.cachedTokens     || 0;

  // Approximate cost (deepseek-chat rates)
  const costUsd = (inputTokens - cachedTokens) * 0.00027 / 1000
    + cachedTokens * 0.000014 / 1000
    + outputTokens * 0.0011 / 1000;

  let parsed;
  try {
    // deepseek-reasoner may wrap output in <think>...</think> or markdown fences
    let raw = result.content;
    raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    parsed = JSON.parse(raw);
  } catch {
    logger.warn({
      contentId: row.id,
      finishReason: result.finishReason,
      contentLen: result.content?.length,
      raw: result.content?.slice(0, 300)
    }, 'Failed to parse extraction JSON');
    return null;
  }

  // Write to paragraph_extractions
  const { lastInsertRowid } = await query(`
    INSERT INTO paragraph_extractions
      (content_id, model, prompt_version, output_json,
       input_tokens, output_tokens, cached_tokens, cost_usd, resolved)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `, [row.id, activeModel, PROMPT_VERSION, JSON.stringify(parsed),
      inputTokens, outputTokens, cachedTokens, costUsd]);

  await trackCost({
    model: activeModel,
    taskType: 'extraction',
    paragraphId: row.id,
    inputTokens, outputTokens, cachedTokens, costUsd,
  });

  // Mark paragraph as extracted
  await query(`
    UPDATE content SET graph_enriched = 1, graph_enriched_at = datetime('now'),
      extractor_version = ? WHERE id = ?
  `, [PROMPT_VERSION, row.id]);

  logger.debug(
    { contentId: row.id, extractionId: lastInsertRowid, costUsd: costUsd.toFixed(6) },
    'Paragraph extracted'
  );

  return lastInsertRowid;
}

// GPB doc ID — compare as number (SQLite returns integers for numeric columns)
const GPB_DOC_ID = 8635;

// Fetch next batch — GPB paragraphs first, then everything else.
async function fetchBatch() {
  // Phase 1: drain GPB completely (smaller batch — heavier reasoner model)
  const gpbRows = await queryAll(`
    SELECT c.id, c.text, c.doc_id
    FROM content c
    WHERE c.doc_id = ? AND c.graph_enriched = 0
      AND c.deleted_at IS NULL AND length(c.text) > 50
    ORDER BY c.paragraph_index ASC
    LIMIT ?
  `, [GPB_DOC_ID, GPB_BATCH_SIZE]);
  if (gpbRows.length > 0) return gpbRows;

  // Phase 2: all other docs — no ORDER BY to avoid scanning 4.7M rows
  return queryAll(`
    SELECT c.id, c.text, c.doc_id
    FROM content c
    JOIN docs d ON d.id = c.doc_id
    WHERE c.graph_enriched = 0
      AND c.deleted_at IS NULL
      AND d.deleted_at IS NULL
      AND length(c.text) > 50
    LIMIT ?
  `, [BATCH_SIZE]);
}

async function processOnce() {
  const rows = await fetchBatch();
  if (rows.length === 0) return 0;

  // Process concurrently
  const results = await Promise.allSettled(rows.map(r => extractParagraph(r)));
  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
  const failed    = results.filter(r => r.status === 'rejected' || r.value === null).length;

  if (failed > 0) logger.warn({ succeeded, failed }, 'Batch partial failures');
  invalidateAliasCache();
  return succeeded;
}

async function workerLoop() {
  logger.info({ model: MODEL, batchSize: BATCH_SIZE }, 'Graph extractor starting');
  let totalExtracted = 0;

  while (!isShuttingDown) {
    const count = await processOnce();
    if (count === 0) {
      logger.info({ totalExtracted }, 'No work — sleeping');
      await delay(IDLE_SLEEP_MS);
    } else {
      totalExtracted += count;
      if (totalExtracted % 100 === 0) {
        const budget = await checkBudget();
        logger.info(
          { totalExtracted, spend: budget.spend?.toFixed(4), budgetFraction: budget.fraction?.toFixed(3) },
          'Extraction progress'
        );
      }
    }
  }

  logger.info({ totalExtracted }, 'Graph extractor shutting down');
}

const scriptPath = fileURLToPath(import.meta.url);
// PM2 uses ProcessContainerFork.js as argv[1]; use pm_exec_path as fallback
const isMain = process.argv[1] === scriptPath || process.env.pm_exec_path === scriptPath;
if (isMain) {
  await runMigrations();
  await workerLoop();
}
