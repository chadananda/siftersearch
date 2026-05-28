#!/usr/bin/env node
// Entity extraction QA validator. Reads unresolved paragraph_extractions,
// submits to Haiku for quality check, writes to extraction_validations.
// PM2 process: siftersearch-graph-validator

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryAll, graphQuery, graphQueryAll } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { runMigrations, runGraphMigrations } from '../lib/migrations/runner.js';
import { chatCompletion } from '../lib/ai.js';
import { trackCost } from '../lib/entity-cost-tracker.js';

const MODEL = process.env.VALIDATOR_MODEL || 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 20;
const IDLE_SLEEP_MS = 15_000;

const VALIDATION_SYSTEM = `You are a quality-assurance reviewer for entity extraction results.

Given the original paragraph text and its extraction JSON, check for CRITICAL errors only:
1. Wrong entity identity — pronoun or referring expression resolved to the wrong person/place/thing (wrong gender, wrong era, implausible given context)
2. Fabricated mentions — entities claimed to appear in the text that are not there at all
3. Reversed relations — subject and object swapped in a relation

Do NOT flag as errors:
- Span off-by-one differences (±1-2 characters) — these are trivial formatting issues
- Minor modality disagreements (asserted vs conditional) when the entity mention itself is correct
- Nested or overlapping mentions — these are acceptable

Return ONLY valid JSON:
{
  "errors": [{ "field": "mentions[0]", "issue": "entity resolved to wrong person" }],
  "confidence": 0.0-1.0,
  "recommended_action": "accept" | "reextract" | "arbitrate"
}

Use "reextract" ONLY when entities are fabricated or fundamentally misidentified.
Use "arbitrate" when you are uncertain.
Use "accept" for all other cases, including span imprecision.
If no critical errors found, return { "errors": [], "confidence": 0.95, "recommended_action": "accept" }.`;

async function validateOne(extraction) {
  const userMsg = `ORIGINAL TEXT:\n${extraction.paragraph_text}\n\nEXTRACTION JSON:\n${extraction.output_json}`;

  let result;
  try {
    // Pass system message in messages array — chatCompletion ignores the systemPrompt option.
    // Prefill assistant response with '{' to force JSON output from Haiku.
    result = await chatCompletion(
      [
        { role: 'system', content: VALIDATION_SYSTEM },
        { role: 'user', content: userMsg },
        { role: 'assistant', content: '{' },
      ],
      {
        model: MODEL,
        provider: 'anthropic',
        temperature: 0,
        maxTokens: 1024,
      }
    );
  } catch (err) {
    logger.error({ extractionId: extraction.id, err: err.message }, 'Haiku validation call failed');
    return;
  }

  const usage = result.usage || {};
  const inputTokens  = usage.promptTokens    || 0;
  const outputTokens = usage.completionTokens || 0;
  const costUsd = inputTokens * 0.00025 / 1000 + outputTokens * 0.00125 / 1000;

  let parsed;
  try {
    // Prepend the '{' prefill omitted from the API response, then extract just
    // the JSON object (Haiku often appends prose after the closing brace).
    const text = '{' + result.content;
    const lastBrace = text.lastIndexOf('}');
    const raw = lastBrace > 0 ? text.slice(0, lastBrace + 1) : text;
    parsed = JSON.parse(raw);
  } catch {
    logger.warn({ extractionId: extraction.id, content: result.content?.slice(0, 200) }, 'Validator returned non-JSON — marking reextract');
    parsed = { errors: [{ field: 'root', issue: 'non-JSON response from validator' }], confidence: 0.3, recommended_action: 'reextract' };
  }

  // Safety net: if all errors are span-precision issues and confidence >= 0.65, accept anyway.
  // Span off-by-one errors are cosmetic — entity identity is still correct.
  if (parsed.recommended_action === 'reextract' && (parsed.confidence ?? 0) >= 0.65) {
    const onlySpanErrors = (parsed.errors || []).every(e =>
      /span|offset|position|character|char/i.test(e.issue) && !/wrong|fabricat|missing|incorrect entity|wrong person|wrong gender/i.test(e.issue)
    );
    if (onlySpanErrors && (parsed.errors || []).length > 0) {
      parsed.recommended_action = 'accept';
    }
  }

  try {
    await graphQueryWithRetry(`
      INSERT INTO extraction_validations
        (extraction_id, validator_model, errors_json, confidence, recommended_action)
      VALUES (?, ?, ?, ?, ?)
    `, [extraction.id, MODEL, JSON.stringify(parsed.errors || []),
        parsed.confidence ?? 0.5, parsed.recommended_action ?? 'arbitrate']);
  } catch (err) {
    logger.error({ extractionId: extraction.id, err: err.message }, 'Failed to write validation');
    return;
  }

  await trackCost({ model: MODEL, taskType: 'validation', paragraphId: extraction.content_id, inputTokens, outputTokens, cachedTokens: 0, costUsd }).catch(() => {});

  logger.debug(
    { extractionId: extraction.id, action: parsed.recommended_action, confidence: parsed.confidence },
    'Validation written'
  );
}

async function fetchBatch() {
  const ids = await graphQueryAll(`
    SELECT pe.id, pe.content_id, pe.output_json
    FROM paragraph_extractions pe
    WHERE pe.resolved = 0
      AND NOT EXISTS (
        SELECT 1 FROM extraction_validations ev WHERE ev.extraction_id = pe.id
      )
    ORDER BY pe.id ASC
    LIMIT ?
  `, [BATCH_SIZE]);
  if (ids.length === 0) return [];
  const contentIds = [...new Set(ids.map(r => r.content_id))];
  const cph = contentIds.map(() => '?').join(',');
  const textRows = await queryAll(`SELECT id, text FROM content WHERE id IN (${cph})`, contentIds);
  const textMap = new Map(textRows.map(r => [r.id, r.text]));
  return ids.map(pe => ({ ...pe, paragraph_text: textMap.get(pe.content_id) || '' }));
}

let isShuttingDown = false;
process.on('SIGTERM', () => { isShuttingDown = true; });
process.on('SIGINT', () => {});

const delay = ms => new Promise(r => setTimeout(r, ms));

async function queryWithRetry(sql, params, maxAttempts = 5) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await query(sql, params);
    } catch (err) {
      if (err.code !== 'SQLITE_BUSY' || i === maxAttempts - 1) throw err;
      const wait = 1000 * Math.pow(2, i);
      logger.warn({ attempt: i + 1, wait }, 'SQLITE_BUSY on write — retrying');
      await delay(wait);
    }
  }
}

async function graphQueryWithRetry(sql, params, maxAttempts = 5) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await graphQuery(sql, params);
    } catch (err) {
      if (err.code !== 'SQLITE_BUSY' || i === maxAttempts - 1) throw err;
      const wait = 1000 * Math.pow(2, i);
      logger.warn({ attempt: i + 1, wait }, 'SQLITE_BUSY on graph write — retrying');
      await delay(wait);
    }
  }
}

async function workerLoop() {
  logger.info({ model: MODEL, modelEnvVar: 'VALIDATOR_MODEL' }, 'Graph validator starting — verify model matches .env-public');

  while (!isShuttingDown) {
    let rows;
    try {
      rows = await fetchBatch();
    } catch (err) {
      logger.error({ err: err.message }, 'fetchBatch failed — sleeping before retry');
      await delay(IDLE_SLEEP_MS);
      continue;
    }

    if (rows.length === 0) {
      await delay(IDLE_SLEEP_MS);
      continue;
    }

    // Sequential to avoid hammering Anthropic rate limits
    let skipped = 0;
    for (const row of rows) {
      if (isShuttingDown) break;
      // Auto-accept trivial paragraphs (<150 chars) — not worth Haiku QA cost.
      // Span errors and entity confusion are rare in short text.
      if (row.paragraph_text.length < 150) {
        await graphQueryWithRetry(`
          INSERT INTO extraction_validations
            (extraction_id, validator_model, errors_json, confidence, recommended_action)
          VALUES (?, ?, ?, ?, ?)
        `, [row.id, 'auto-accept:short', '[]', 0.9, 'accept']).catch(() => {});
        skipped++;
        continue;
      }
      try {
        await validateOne(row);
      } catch (err) {
        logger.error({ extractionId: row.id, err: err.message }, 'validateOne threw — skipping row');
      }
    }
    logger.info({ validated: rows.length - skipped, autoAccepted: skipped }, 'Validation batch done');
  }

  logger.info('Graph validator shutting down');
}

const scriptPath = fileURLToPath(import.meta.url);
const isMain = process.argv[1] === scriptPath || process.env.pm_exec_path === scriptPath;
if (isMain) {
  await runMigrations();
  await runGraphMigrations();
  await workerLoop();
}
