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

import { query, queryAll } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { runMigrations } from '../lib/migrations.js';
import { chatCompletion } from '../lib/ai.js';
import { trackCost } from '../lib/entity-cost-tracker.js';

const MODEL = 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 20;
const IDLE_SLEEP_MS = 15_000;

const VALIDATION_SYSTEM = `You are a quality-assurance reviewer for entity extraction results.

Given the original paragraph text and its extraction JSON, check for:
1. Mentions with incorrect span offsets (surface text not at that char position)
2. Referring expressions resolved to wrong entities (wrong gender, wrong era, implausible)
3. Relations with reversed subject/object or wrong modality
4. text_grounded that changes meaning or drops entities

Return ONLY valid JSON:
{
  "errors": [{ "field": "mentions[0].span", "issue": "span does not match surface text" }],
  "confidence": 0.0-1.0,
  "recommended_action": "accept" | "reextract" | "arbitrate"
}

If no errors found, return { "errors": [], "confidence": 0.95, "recommended_action": "accept" }.`;

async function validateOne(extraction) {
  const userMsg = `ORIGINAL TEXT:\n${extraction.paragraph_text}\n\nEXTRACTION JSON:\n${extraction.output_json}`;

  let result;
  try {
    result = await chatCompletion(
      [{ role: 'user', content: userMsg }],
      {
        model: MODEL,
        provider: 'anthropic',
        temperature: 0,
        maxTokens: 1024,
        systemPrompt: VALIDATION_SYSTEM,
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
    parsed = JSON.parse(result.content);
  } catch {
    parsed = { errors: [{ field: 'root', issue: 'non-JSON response from validator' }], confidence: 0.3, recommended_action: 'reextract' };
  }

  await query(`
    INSERT INTO extraction_validations
      (extraction_id, validator_model, errors_json, confidence, recommended_action)
    VALUES (?, ?, ?, ?, ?)
  `, [extraction.id, MODEL, JSON.stringify(parsed.errors || []),
      parsed.confidence ?? 0.5, parsed.recommended_action ?? 'arbitrate']);

  await trackCost({ model: MODEL, taskType: 'validation', paragraphId: extraction.content_id, inputTokens, outputTokens, cachedTokens: 0, costUsd });

  logger.debug(
    { extractionId: extraction.id, action: parsed.recommended_action, confidence: parsed.confidence },
    'Validation written'
  );
}

async function fetchBatch() {
  // Extractions not yet validated (no row in extraction_validations)
  return queryAll(`
    SELECT pe.id, pe.content_id, pe.output_json,
           c.text AS paragraph_text
    FROM paragraph_extractions pe
    JOIN content c ON c.id = pe.content_id
    LEFT JOIN extraction_validations ev ON ev.extraction_id = pe.id
    WHERE ev.id IS NULL
      AND pe.resolved = 0
    ORDER BY pe.id ASC
    LIMIT ?
  `, [BATCH_SIZE]);
}

let isShuttingDown = false;
process.on('SIGTERM', () => { isShuttingDown = true; });

const delay = ms => new Promise(r => setTimeout(r, ms));

async function workerLoop() {
  logger.info({ model: MODEL }, 'Graph validator starting');

  while (!isShuttingDown) {
    const rows = await fetchBatch();
    if (rows.length === 0) {
      await delay(IDLE_SLEEP_MS);
      continue;
    }

    // Sequential to avoid hammering Anthropic rate limits
    for (const row of rows) {
      if (isShuttingDown) break;
      await validateOne(row);
    }
    logger.info({ validated: rows.length }, 'Validation batch done');
  }

  logger.info('Graph validator shutting down');
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  await runMigrations();
  await workerLoop();
}
