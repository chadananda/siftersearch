#!/usr/bin/env node
// Entity extraction worker. Reads content WHERE graph_enriched=0, calls LLM
// with extract-v1 prompt, writes paragraph_extractions, then immediately
// resolves entity_mentions/paragraph_roles/quote_instances inline.
// LLM calls run concurrently; DB resolution writes run serially after each batch.
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
import { findEntity, addAlias, normalizeSurface } from '../lib/graph-db.js';

const PROMPT_VERSION = 'extract-v1';
const MODEL = process.env.EXTRACTION_MODEL || 'deepseek-chat';
const MODEL_PROVIDER = process.env.EXTRACTION_PROVIDER || 'deepseek';
// GPB is the canonical entity seed — use Sonnet for highest quality extraction.
// Sonnet handles Bahá'í transliteration, pronoun resolution, and doctrinal nuance
// far better than deepseek-chat. Cost is secondary for the seed document.
const GPB_MODEL = process.env.GPB_EXTRACTION_MODEL || 'claude-sonnet-4-6';
const GPB_MODEL_PROVIDER = process.env.GPB_EXTRACTION_PROVIDER || 'anthropic';
const BATCH_SIZE = 16;
const GPB_BATCH_SIZE = 4;  // smaller batch — Sonnet calls are slower
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

// Per-paragraph failure counter. After MAX_FAILURES consecutive parse failures,
// mark graph_enriched=-1 so the worker stops retrying the same paragraph.
const MAX_FAILURES = 3;
const _failCount = new Map();

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

// Resolve a parsed extraction into entity_mentions, paragraph_roles, quote_instances.
// Called serially after the concurrent LLM batch — safe for SQLite single-writer.
async function resolveExtraction(extractionId, contentId, parsed, religion) {
  for (const mention of parsed.mentions || []) {
    let entityId = null;
    if (mention.proposed_entity_id != null) {
      const exists = await queryOne(`SELECT id FROM graph_entities WHERE id = ?`, [mention.proposed_entity_id]);
      if (exists) entityId = mention.proposed_entity_id;
    }
    if (!entityId) {
      const found = await findEntity({ surface: mention.surface, type: mention.type, religion });
      entityId = found?.entity_id || null;
    }
    if (!entityId) {
      await query(`INSERT OR IGNORE INTO promotion_queue (surface_norm, type, context_snippet, resolved, attempts, priority) VALUES (?, ?, ?, 0, 0, 10)`,
        [normalizeSurface(mention.surface), mention.type || null, mention.surface.slice(0, 100)]);
      continue;
    }
    await query(`INSERT OR IGNORE INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?, ?, ?, 0.9, 'resolved', ?)`,
      [entityId, contentId, mention.local_role, PROMPT_VERSION]);
    if (mention.surface) {
      await addAlias(entityId, { surface: mention.surface, surfaceNorm: normalizeSurface(mention.surface), lang: 'en', source: PROMPT_VERSION, confidence: 0.7 });
    }
  }

  const roles = parsed.roles || {};
  const resolve = s => s ? findEntity({ surface: s }).then(r => r?.entity_id || null).catch(() => null) : Promise.resolve(null);
  const [speakerEnt, narratorEnt, addresseeEnt, placeEnt] = await Promise.all([
    resolve(roles.speaker), resolve(roles.narrator), resolve(roles.addressee),
    roles.setting_place ? findEntity({ surface: roles.setting_place, type: 'place' }).then(r => r?.entity_id || null).catch(() => null) : null,
  ]);
  await query(`INSERT OR REPLACE INTO paragraph_roles (content_id, speaker_entity_id, narrator_entity_id, addressee_entity_id, setting_place_entity_id, setting_time, extractor_version) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [contentId, speakerEnt, narratorEnt, addresseeEnt, placeEnt, roles.setting_time || null, PROMPT_VERSION]);

  for (const q of parsed.quotations || []) {
    const speakerEnt2 = q.speaker_candidate ? (await findEntity({ surface: q.speaker_candidate }).catch(() => null))?.entity_id : null;
    await query(`INSERT INTO quote_instances (content_id, span_start, span_end, speaker_surface, speaker_entity_id, attribution_pattern, nesting_depth, extractor_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [contentId, q.span?.[0], q.span?.[1], q.speaker_surface || null, speakerEnt2, q.attribution_pattern || 'direct', q.nesting_depth || 0, PROMPT_VERSION]);
  }

  if (parsed.prose_summary) {
    await query(`UPDATE content SET text_grounded = ?, grounding_confidence = 0.9, grounded_synced = 0 WHERE id = ?`,
      [parsed.prose_summary, contentId]);
  }

  await query(`UPDATE paragraph_extractions SET resolved = 1 WHERE id = ?`, [extractionId]);
}

// Extract one paragraph — returns { extractionId, contentId, parsed } or null
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
  const activeProvider = isGpb ? GPB_MODEL_PROVIDER : MODEL_PROVIDER;

  let result;
  try {
    result = await chatCompletion(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: row.text }],
      {
        model: activeModel,
        provider: activeProvider,
        temperature: 0,
        maxTokens: 8192,
        // Anthropic: system prompt instructs JSON; enable caching for the large extraction prompt.
        // deepseek-chat: json_object required for reliable structured output.
        ...(activeProvider === 'anthropic'
          ? { usePromptCache: true }
          : { responseFormat: { type: 'json_object' } }),
      }
    );
  } catch (err) {
    logger.error({ contentId: row.id, model: activeModel, err: err.message }, 'Extraction API call failed');
    return null;
  }

  const usage = result.usage || {};
  const inputTokens  = usage.promptTokens    || 0;
  const outputTokens = usage.completionTokens || 0;
  const cachedTokens = usage.cachedTokens     || 0;

  // Cost varies by provider/model
  const costUsd = activeProvider === 'anthropic'
    // Sonnet 4.6: $3/1M input, $15/1M output, $0.30/1M cache read
    ? (inputTokens - cachedTokens) * 3 / 1_000_000
      + cachedTokens * 0.30 / 1_000_000
      + outputTokens * 15 / 1_000_000
    // deepseek-chat: $0.27/1M input, $0.014/1M cache, $1.10/1M output
    : (inputTokens - cachedTokens) * 0.00027 / 1000
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
    const fails = (_failCount.get(row.id) || 0) + 1;
    _failCount.set(row.id, fails);
    logger.warn({
      contentId: row.id,
      finishReason: result.finishReason,
      contentLen: result.content?.length,
      failCount: fails,
      raw: result.content?.slice(0, 300)
    }, 'Failed to parse extraction JSON');
    if (fails >= MAX_FAILURES) {
      logger.warn({ contentId: row.id }, 'Marking paragraph unprocessable after repeated failures');
      await query(`UPDATE content SET graph_enriched = -1, graph_enriched_at = datetime('now'),
        extractor_version = 'skip:parse-failures' WHERE id = ?`, [row.id]);
      _failCount.delete(row.id);
    }
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

  // Resolve immediately — LLM response is here, DB work is cheap.
  // Other paragraphs' LLM calls are still in-flight concurrently while we write.
  try {
    await resolveExtraction(lastInsertRowid, row.id, parsed, row.religion);
  } catch (err) {
    logger.warn({ contentId: row.id, err: err.message }, 'Inline resolution failed — extraction saved, resolution skipped');
  }

  return lastInsertRowid;
}

// GPB doc ID — the CANONICAL copy (doc 21310, no duplicate_of) is what Meilisearch indexes.
// Doc 8635 is a duplicate of 21310 and is excluded from search — do not extract it.
const GPB_DOC_ID = 21310;

// Fetch next batch — GPB paragraphs first, then everything else.
// INVARIANT: never extract duplicate docs (duplicate_of IS NOT NULL) — they are
// excluded from Meilisearch search and extracting them wastes budget.
async function fetchBatch() {
  // Phase 1: drain GPB completely (smaller batch — Sonnet model)
  const gpbRows = await queryAll(`
    SELECT c.id, c.text, c.doc_id, d.religion
    FROM content c
    JOIN docs d ON d.id = c.doc_id
    WHERE c.doc_id = ? AND c.graph_enriched = 0
      AND c.deleted_at IS NULL AND d.deleted_at IS NULL
      AND d.duplicate_of IS NULL
      AND length(c.text) > 50
    ORDER BY c.paragraph_index ASC
    LIMIT ?
  `, [GPB_DOC_ID, GPB_BATCH_SIZE]);
  if (gpbRows.length > 0) return gpbRows;

  // Phase 2: all other non-duplicate docs
  return queryAll(`
    SELECT c.id, c.text, c.doc_id, d.religion
    FROM content c
    JOIN docs d ON d.id = c.doc_id
    WHERE c.graph_enriched = 0
      AND c.deleted_at IS NULL
      AND d.deleted_at IS NULL
      AND d.duplicate_of IS NULL
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
