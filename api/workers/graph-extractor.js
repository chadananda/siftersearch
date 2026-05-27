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
import { getMeili, INDEXES } from '../lib/search.js';
import { getAuthority } from '../lib/authority.js';

const PROMPT_VERSION = 'extract-v1';
const MODEL = process.env.EXTRACTION_MODEL || 'deepseek-v4-pro';
const MODEL_PROVIDER = process.env.EXTRACTION_PROVIDER || 'deepseek';
const BATCH_SIZE = parseInt(process.env.EXTRACTION_BATCH_SIZE || '16', 10);
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

// Build the full system prompt for a paragraph.
// docContext is a snapshot of _docContext taken at batch-start time so all
// paragraphs in the batch share the same pre-batch context (correct: they run
// concurrently and none can see what the others found in this batch).
async function buildPrompt(row, docContext) {
  const envelope = await getEnvelope(row.doc_id);
  const candidates = await buildCandidateDictionary(row.text);
  const ctx = docContext || {};

  const settingStr = [ctx.lastSettingPlace, ctx.lastSettingTime].filter(Boolean).join(', ') || 'null';
  const precedingText = ctx.precedingText || '(start of document — no preceding paragraphs)';

  return SYSTEM_PROMPT_TEMPLATE
    .replace('{{CANDIDATE_DICTIONARY}}', candidates)
    .replace('{{WORK_TITLE}}', envelope.workTitle)
    .replace('{{AUTHOR}}', envelope.author)
    .replace('{{PERIOD_NAME}}', envelope.periodName)
    .replace('{{PERIOD_DATE_RANGE}}', envelope.periodDateRange)
    .replace('{{EPISODE_NAME}}', '')
    .replace('{{PRECEDING_SPEAKER}}', ctx.lastSpeaker || 'null')
    .replace('{{PRECEDING_SETTING}}', settingStr)
    .replace('{{PRECEDING_TEXT}}', precedingText);
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
      await queryWithRetry(`INSERT OR IGNORE INTO promotion_queue (surface_norm, type, context_snippet, resolved, attempts, priority) VALUES (?, ?, ?, 0, 0, 10)`,
        [normalizeSurface(mention.surface), mention.type || null, mention.surface.slice(0, 100)]);
      continue;
    }
    await queryWithRetry(`INSERT OR IGNORE INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?, ?, ?, 0.9, 'resolved', ?)`,
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
  await queryWithRetry(`INSERT OR REPLACE INTO paragraph_roles (content_id, speaker_entity_id, narrator_entity_id, addressee_entity_id, setting_place_entity_id, setting_time, extractor_version) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [contentId, speakerEnt, narratorEnt, addresseeEnt, placeEnt, roles.setting_time || null, PROMPT_VERSION]);

  for (const q of parsed.quotations || []) {
    const speakerEnt2 = q.speaker_candidate ? (await findEntity({ surface: q.speaker_candidate }).catch(() => null))?.entity_id : null;
    await queryWithRetry(`INSERT INTO quote_instances (content_id, span_start, span_end, speaker_surface, speaker_entity_id, attribution_pattern, nesting_depth, extractor_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [contentId, q.span?.[0], q.span?.[1], q.speaker_surface || null, speakerEnt2, q.attribution_pattern || 'direct', q.nesting_depth || 0, PROMPT_VERSION]);
  }

  if (parsed.prose_summary) {
    await queryWithRetry(`UPDATE content SET text_grounded = ?, grounding_confidence = 0.9, grounded_synced = 0 WHERE id = ?`,
      [parsed.prose_summary, contentId]);
  }

  await queryWithRetry(`UPDATE paragraph_extractions SET resolved = 1 WHERE id = ?`, [extractionId]);

  // Push new entity_mentions for this paragraph directly to Meili — immediately searchable.
  await syncMentionsForContent(contentId);
}

// Push entity_mentions for a single content row to the Meili entity_mentions_idx.
async function syncMentionsForContent(contentId) {
  try {
    const meili = getMeili();
    if (!meili) return;
    const rows = await queryAll(`
      SELECT em.id, em.entity_id, em.content_id AS paragraph_id, em.role,
             ge.canonical_name AS entity_canonical_name, ge.entity_type,
             c.doc_id, d.religion, d.collection, d.encumbered, d.title, d.author, c.para_meta
      FROM entity_mentions em
      JOIN graph_entities ge ON ge.id = em.entity_id
      JOIN content c ON c.id = em.content_id
      JOIN docs d ON d.id = c.doc_id
      WHERE em.content_id = ?
    `, [contentId]);
    if (!rows.length) return;
    const docs = rows.map(row => {
      let paraMeta = null;
      try { paraMeta = JSON.parse(row.para_meta); } catch { /* ignore */ }
      let authority = 0;
      try { authority = getAuthority({ author: paraMeta?.author || row.author, title: row.title }); } catch { /* ignore */ }
      return {
        id: row.id,
        entity_id: row.entity_id,
        entity_canonical_name: row.entity_canonical_name,
        entity_type: row.entity_type || null,
        paragraph_id: row.paragraph_id,
        doc_id: row.doc_id,
        role: row.role || null,
        religion: row.religion || null,
        collection: row.collection || null,
        authority,
        encumbered: row.encumbered ? 1 : 0,
      };
    });
    await meili.index(INDEXES.ENTITY_MENTIONS).addDocuments(docs, { primaryKey: 'id' });
  } catch (err) {
    // Non-fatal — entity still in SQLite, Meili sync can catch up later
    logger.warn({ contentId, err: err.message }, 'Entity mentions Meili sync failed — will retry on next batch');
  }
}

// Call LLM for one paragraph — NO DB writes. Returns result data or null.
// Run concurrently; write phase is separate and serial.
async function callLLM(row) {
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
    systemPrompt = await buildPrompt(row, row._docContext);
  } catch (err) {
    logger.error({ contentId: row.id, err: err.message }, 'buildPrompt failed');
    return null;
  }

  const activeModel = MODEL;
  const activeProvider = MODEL_PROVIDER;

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
        // deepseek-v4-pro: json_object required for reliable structured output.
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

  const costUsd = activeProvider === 'anthropic'
    ? (inputTokens - cachedTokens) * 3 / 1_000_000
      + cachedTokens * 0.30 / 1_000_000
      + outputTokens * 15 / 1_000_000
    : activeProvider === 'local'
    ? 0
    : (inputTokens - cachedTokens) * 0.00027 / 1000
      + cachedTokens * 0.000014 / 1000
      + outputTokens * 0.0011 / 1000;

  let parsed;
  try {
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
      // Failure mark happens in the write phase below — return sentinel
      return { row, activeModel, activeProvider, parsed: null, markFailed: true };
    }
    return null;
  }

  return { row, activeModel, activeProvider, parsed, inputTokens, outputTokens, cachedTokens, costUsd };
}

// Write one LLM result to DB — called serially to avoid SQLITE_BUSY contention.
async function writeResult(llmResult) {
  const { row, activeModel, activeProvider, parsed, inputTokens, outputTokens, cachedTokens, costUsd, markFailed } = llmResult;

  if (markFailed) {
    await queryWithRetry(`UPDATE content SET graph_enriched = -1, graph_enriched_at = datetime('now'),
      extractor_version = 'skip:parse-failures' WHERE id = ?`, [row.id]);
    _failCount.delete(row.id);
    return null;
  }

  const { lastInsertRowid } = await queryWithRetry(`
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

  await queryWithRetry(`
    UPDATE content SET graph_enriched = 1, graph_enriched_at = datetime('now'),
      extractor_version = ? WHERE id = ?
  `, [PROMPT_VERSION, row.id]);

  logger.debug(
    { contentId: row.id, extractionId: lastInsertRowid, costUsd: costUsd.toFixed(6) },
    'Paragraph extracted'
  );

  try {
    await resolveExtraction(lastInsertRowid, row.id, parsed, row.religion);
  } catch (err) {
    logger.warn({ contentId: row.id, err: err.message }, 'Inline resolution failed — extraction saved, resolution skipped');
  }

  return lastInsertRowid;
}

// Doc-by-doc state: pick highest-priority unprocessed doc once, exhaust it,
// then pick again. Avoids sorting 4.45M content rows per fetch (was 98s).
// Uses idx_content_doc_graph (doc_id, graph_enriched WHERE graph_enriched=0).
let _currentDocId = null;
let _currentDocPriority = 0;
let _currentDocReligion = null;

// Rolling narrative context per doc. Stores prose_summary from each extraction
// (not raw text) — summaries are ~67 chars avg, fully resolved (no pronouns),
// so 12 fit in ~800 chars. Also carries forward last resolved speaker/setting.
// Reset + seeded from DB whenever we switch docs, so restarts don't lose context.
const DOC_CONTEXT_PARA_COUNT = 12;

let _docContext = {
  lastSpeaker: null,
  lastNarrator: null,
  lastSettingPlace: null,
  lastSettingTime: null,
  recentSummaries: [], // prose_summary strings, oldest first
};

function resetDocContext() {
  _docContext = {
    lastSpeaker: null,
    lastNarrator: null,
    lastSettingPlace: null,
    lastSettingTime: null,
    recentSummaries: [],
  };
}

// On doc switch, seed context from already-processed paragraphs so a restart
// mid-doc doesn't start blind. Queries the last N prose_summaries by paragraph_index.
async function seedDocContextFromDB(docId) {
  try {
    const rows = await queryAll(`
      SELECT c.paragraph_index,
             json_extract(pe.output_json, '$.prose_summary') AS summary,
             json_extract(pe.output_json, '$.roles.speaker')       AS speaker,
             json_extract(pe.output_json, '$.roles.narrator')      AS narrator,
             json_extract(pe.output_json, '$.roles.setting_place') AS setting_place,
             json_extract(pe.output_json, '$.roles.setting_time')  AS setting_time
      FROM paragraph_extractions pe
      JOIN content c ON c.id = pe.content_id
      WHERE c.doc_id = ? AND pe.model = ? AND c.deleted_at IS NULL
      ORDER BY c.paragraph_index DESC
      LIMIT ?
    `, [docId, MODEL, DOC_CONTEXT_PARA_COUNT]);

    if (rows.length === 0) return;

    // Rows are DESC — reverse to chronological order
    const ordered = [...rows].reverse();
    for (const r of ordered) {
      if (r.summary) _docContext.recentSummaries.push(r.summary);
      if (r.speaker)       _docContext.lastSpeaker      = r.speaker;
      if (r.narrator)      _docContext.lastNarrator     = r.narrator;
      if (r.setting_place) _docContext.lastSettingPlace = r.setting_place;
      if (r.setting_time)  _docContext.lastSettingTime  = r.setting_time;
    }
    if (_docContext.recentSummaries.length > DOC_CONTEXT_PARA_COUNT)
      _docContext.recentSummaries = _docContext.recentSummaries.slice(-DOC_CONTEXT_PARA_COUNT);

    logger.debug({ docId, seeded: rows.length }, 'Doc context seeded from prior extractions');
  } catch (err) {
    logger.warn({ docId, err: err.message }, 'seedDocContextFromDB failed — starting fresh');
  }
}

// Called after each successful write (serial, paragraph_index order within a batch).
function updateDocContext(parsed) {
  const roles = parsed?.roles || {};
  if (roles.speaker)       _docContext.lastSpeaker      = roles.speaker;
  if (roles.narrator)      _docContext.lastNarrator     = roles.narrator;
  if (roles.setting_place) _docContext.lastSettingPlace = roles.setting_place;
  if (roles.setting_time)  _docContext.lastSettingTime  = roles.setting_time;
  const summary = parsed?.prose_summary;
  if (summary) {
    _docContext.recentSummaries.push(summary);
    if (_docContext.recentSummaries.length > DOC_CONTEXT_PARA_COUNT)
      _docContext.recentSummaries.shift();
  }
}

function buildPrecedingText() {
  if (_docContext.recentSummaries.length === 0) return '(start of document — no preceding paragraphs)';
  return _docContext.recentSummaries
    .map((s, i, arr) => `[${i + 1}/${arr.length}]: ${s}`)
    .join('\n');
}

async function pickNextDoc() {
  const row = await queryOne(`
    SELECT c.doc_id AS id, d.doc_priority, d.religion
    FROM content c
    JOIN docs d ON d.id = c.doc_id
    WHERE c.graph_enriched = 0
      AND c.deleted_at IS NULL
      AND d.deleted_at IS NULL
      AND d.duplicate_of IS NULL
      AND length(c.text) > 50
    ORDER BY d.doc_priority DESC
    LIMIT 1
  `);
  return row || null;
}

async function fetchBatch() {
  // Loop allows immediate pick-next when current doc is exhausted.
  // At most 2 iterations: current doc attempt → pick next → its first batch.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!_currentDocId) {
      const doc = await pickNextDoc();
      if (!doc) return []; // no unprocessed docs left
      _currentDocId = doc.id;
      _currentDocPriority = doc.doc_priority ?? 0;
      _currentDocReligion = doc.religion || null;
      resetDocContext();
      await seedDocContextFromDB(_currentDocId);
      logger.debug({ docId: _currentDocId, priority: _currentDocPriority }, 'Switched to next doc');
    }

    const rows = await queryAll(`
      SELECT c.id, c.text, c.doc_id
      FROM content c
      WHERE c.doc_id = ?
        AND c.graph_enriched = 0
        AND c.deleted_at IS NULL
        AND length(c.text) > 50
      ORDER BY c.paragraph_index ASC
      LIMIT ?
    `, [_currentDocId, BATCH_SIZE]);

    if (rows.length === 0) {
      _currentDocId = null; // doc exhausted — try next on second iteration
      continue;
    }

    return rows.map(r => ({ ...r, religion: _currentDocReligion, doc_priority: _currentDocPriority }));
  }
  return [];
}

// Reset up to 200 reextract-flagged paragraphs back to graph_enriched=0 per call.
// Runs periodically — not on every fetch — so it doesn't block the main loop.
// Extractor owns graph_enriched: validator writes only to extraction_validations.
const REEXTRACT_INTERVAL_MS = 5 * 60 * 1000; // 5 min
let lastReextractReset = 0;

async function resetReextractQueue() {
  if (Date.now() - lastReextractReset < REEXTRACT_INTERVAL_MS) return;
  lastReextractReset = Date.now();
  try {
    // Find content where latest extraction was rejected by validator (reextract)
    // and attempt count < 3. Reset to graph_enriched=0 so fetchBatch picks them up.
    // Uses a bounded IN list to avoid a full table scan.
    const candidates = await queryAll(`
      SELECT pe.content_id,
             COUNT(pe2.id) AS attempts
      FROM paragraph_extractions pe
      JOIN extraction_validations ev ON ev.extraction_id = pe.id
      JOIN paragraph_extractions pe2 ON pe2.content_id = pe.content_id
      WHERE ev.recommended_action = 'reextract'
        AND pe.id = (SELECT MAX(id) FROM paragraph_extractions WHERE content_id = pe.content_id)
      GROUP BY pe.content_id
      HAVING attempts < 3
      LIMIT 200
    `);
    if (candidates.length === 0) return;
    const ids = candidates.map(r => r.content_id);
    // Batch the UPDATE in one statement using IN clause
    const placeholders = ids.map(() => '?').join(',');
    await queryWithRetry(
      `UPDATE content SET graph_enriched = 0 WHERE id IN (${placeholders})`,
      ids
    );
    _currentDocId = null; // force re-evaluation of next doc after resets
    logger.info({ reset: ids.length }, 'Reextract queue: reset graph_enriched=0 for retry');
  } catch (err) {
    logger.warn({ err: err.message }, 'resetReextractQueue failed (non-fatal)');
  }
}

// Check if all extractions from docs at priority >= minPriority are resolved.
// Used to gate tier transitions: don't start a new tier until the previous
// tier's entities are fully in entity_aliases (resolver + promoter must catch up).
async function isHigherTierFullyResolved(minPriority) {
  const row = await queryOne(`
    SELECT COUNT(*) AS n
    FROM paragraph_extractions pe
    JOIN content c ON c.id = pe.content_id
    JOIN docs d ON d.id = c.doc_id
    WHERE pe.resolved = 0 AND d.doc_priority >= ?
  `, [minPriority]);
  const pending = row?.n || 0;
  const queueRow = await queryOne(`
    SELECT COUNT(*) AS n FROM promotion_queue WHERE resolved = 0
  `);
  const queuePending = queueRow?.n || 0;
  return pending === 0 && queuePending === 0;
}

let _lastBatchPriority = null;

async function processOnce() {
  const rows = await fetchBatch();
  if (rows.length === 0) return 0;

  const batchPriority = rows[0].doc_priority ?? 0;

  // Tier boundary: if priority dropped since last batch, wait for resolver +
  // promoter to fully process the higher tier before continuing. This ensures
  // entity aliases from the previous tier are available to the current tier's
  // candidate dictionary — the compounding effect.
  if (_lastBatchPriority !== null && batchPriority < _lastBatchPriority) {
    const ready = await isHigherTierFullyResolved(_lastBatchPriority);
    if (!ready) {
      logger.info(
        { from: _lastBatchPriority, to: batchPriority },
        'Tier boundary — waiting for resolver/promoter to catch up before continuing'
      );
      return 0;  // caller will sleep and retry
    }
    logger.info({ from: _lastBatchPriority, to: batchPriority }, 'Tier boundary cleared — compounding entities into next tier');
    invalidateAliasCache();  // force fresh alias load for new tier
  }
  _lastBatchPriority = batchPriority;

  // Snapshot rolling context at batch-start so all concurrent LLM calls share
  // the same pre-batch context (they can't see each other's results mid-flight).
  const batchDocContext = {
    lastSpeaker:      _docContext.lastSpeaker,
    lastNarrator:     _docContext.lastNarrator,
    lastSettingPlace: _docContext.lastSettingPlace,
    lastSettingTime:  _docContext.lastSettingTime,
    precedingText:    buildPrecedingText(),
  };
  const rowsWithContext = rows.map(r => ({ ...r, _docContext: batchDocContext }));

  // Phase 1: LLM calls concurrently — no DB writes
  const llmResults = await Promise.allSettled(rowsWithContext.map(r => callLLM(r)));

  // Phase 2: DB writes serially — eliminates concurrent SQLite write contention
  // that causes SQLITE_BUSY in the validator and other graph workers.
  // Also updates rolling doc context in paragraph_index order for next batch.
  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < llmResults.length; i++) {
    const r = llmResults[i];
    if (r.status === 'rejected' || r.value === null) { failed++; continue; }
    try {
      const id = await writeResult(r.value);
      if (id !== null) {
        succeeded++;
        // Update rolling context so next batch sees resolved speaker/setting
        updateDocContext(r.value.parsed);
      } else {
        failed++;
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'writeResult failed');
      failed++;
    }
    await delay(50); // yield between writes to reduce write-lock starvation for other workers
  }

  if (failed > 0) logger.warn({ succeeded, failed }, 'Batch partial failures');
  invalidateAliasCache();
  return succeeded;
}

async function workerLoop() {
  const localUrl = process.env.LOCAL_LLM || 'http://localhost:8080/v1';
  logger.info(
    { model: MODEL, provider: MODEL_PROVIDER, batchSize: BATCH_SIZE,
      ...(MODEL_PROVIDER === 'local' ? { localEndpoint: localUrl } : {}) },
    'Graph extractor starting'
  );
  let totalExtracted = 0;

  while (!isShuttingDown) {
    const count = await processOnce();
    if (count === 0) {
      await resetReextractQueue(); // re-queue reextract candidates before sleeping
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
