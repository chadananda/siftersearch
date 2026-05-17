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
const BATCH_SIZE = 16;
const IDLE_SLEEP_MS = 30_000;

const SYSTEM_PROMPT_TEMPLATE = readFileSync(
  join(PROJECT_ROOT, 'api/lib/llm-prompts/extract-v1.md'), 'utf8'
);
const OUTPUT_SCHEMA = JSON.parse(
  readFileSync(join(PROJECT_ROOT, 'api/lib/llm-prompts/extract-v1.schema.json'), 'utf8')
);

let isShuttingDown = false;

process.on('SIGTERM', () => { isShuttingDown = true; });
process.on('SIGINT',  () => { isShuttingDown = true; });

const delay = ms => new Promise(r => setTimeout(r, ms));

// Build candidate dictionary for a paragraph — entities already known in the DB
// whose canonical names appear (case-insensitive) in the text.
async function buildCandidateDictionary(text) {
  // Simple approach: scan for known entity names in text using alias surface_norm
  const textNorm = text.toLowerCase();
  const rows = await queryAll(`
    SELECT DISTINCT ge.id, ge.canonical_name, ge.type, ge.religion
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
    SELECT d.title, d.author, d.religion, d.period_id,
           p.name AS period_name, p.date_start, p.date_end
    FROM docs d
    LEFT JOIN periods p ON p.id = d.period_id
    WHERE d.id = ?
  `, [docId]);
  if (!doc) return {};
  return {
    workTitle: doc.title || 'Unknown',
    author: doc.author || 'Unknown',
    periodName: doc.period_name || 'Unknown',
    periodDateRange: doc.date_start ? `${doc.date_start}–${doc.date_end || '?'}` : 'Unknown',
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

  const systemPrompt = await buildPrompt(row);

  let result;
  try {
    result = await chatCompletion(
      [{ role: 'user', content: row.text }],
      {
        model: MODEL,
        provider: 'deepseek',
        temperature: 0,
        maxTokens: 4096,
        responseFormat: { type: 'json_schema', json_schema: OUTPUT_SCHEMA },
        systemPrompt,
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
    parsed = JSON.parse(result.content);
  } catch {
    logger.warn({ contentId: row.id }, 'Failed to parse extraction JSON');
    return null;
  }

  // Write to paragraph_extractions
  const { lastInsertRowid } = await query(`
    INSERT INTO paragraph_extractions
      (content_id, model, prompt_version, output_json,
       input_tokens, output_tokens, cached_tokens, cost_usd, resolved)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `, [row.id, MODEL, PROMPT_VERSION, JSON.stringify(parsed),
      inputTokens, outputTokens, cachedTokens, costUsd]);

  await trackCost({
    model: MODEL,
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

// Fetch next batch using the partial index on graph_enriched=0.
// No ORDER BY — avoid sorting 4.7M rows. Priority ordering is best-effort;
// add idx_content_doc_graph composite index (migration 74) for priority.
async function fetchBatch() {
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

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.on('uncaughtException', (err) => {
    process.stderr.write(`UNCAUGHT: ${err.stack}\n`);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    process.stderr.write(`UNHANDLED: ${reason?.stack || reason}\n`);
    process.exit(1);
  });
  process.stderr.write(`graph-extractor starting pid=${process.pid}\n`);
  await runMigrations();
  process.stderr.write('migrations done\n');
  await workerLoop();
}
