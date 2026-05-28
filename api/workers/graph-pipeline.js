#!/usr/bin/env node
// Unified graph pipeline. Replaces graph-extractor/validator/resolver/promoter.
// PM2 process: siftersearch-graph-pipeline
// Single writer to graph.db — no contention. LLM calls are concurrent within
// per-provider semaphores; writes are batched into single transactions.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryAll, queryOne, transaction, graphQuery, graphQueryAll, graphQueryOne, graphTransaction } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { runMigrations, runGraphMigrations } from '../lib/migrations/runner.js';
import { chatCompletion, createEmbedding } from '../lib/ai.js';
import { trackCost, checkBudget } from '../lib/entity-cost-tracker.js';
import { findEntity, addAlias, normalizeSurface, createEntity } from '../lib/graph-db.js';
import { getMeili, INDEXES } from '../lib/search.js';
import { getAuthority } from '../lib/authority.js';

// ---------------------------------------------------------------------------
// Semaphore — counting semaphore for per-provider concurrency control
// ---------------------------------------------------------------------------
class Semaphore {
  constructor(max) { this.max = max; this.count = 0; this.queue = []; }
  async run(fn) {
    if (this.count >= this.max) await new Promise(r => this.queue.push(r));
    this.count++;
    try { return await fn(); }
    finally { this.count--; if (this.queue.length) this.queue.shift()(); }
  }
}
const deepseekSem = new Semaphore(Number(process.env.DEEPSEEK_CONCURRENCY ?? 16));
const haikuSem    = new Semaphore(8);
const sonnetSem   = new Semaphore(4);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PROMPT_VERSION = 'extract-v1';
const EXTRACT_BATCH  = parseInt(process.env.EXTRACTION_BATCH_SIZE || '16', 10);
const VALIDATE_BATCH = 20;
const RESOLVE_BATCH  = 50;
const PROMOTE_BATCH  = 10;
const IDLE_SLEEP_MS  = 10_000;
const MAX_FAILURES   = 3;
const MAX_PROMOTE_ATTEMPTS = 3;
const DOC_CONTEXT_PARA_COUNT = 12;
const CANDIDATE_LIMIT = 60;

// Tiered model selection for extraction
const TIER_HIGH_MIN = parseInt(process.env.EXTRACTION_TIER_HIGH || '70', 10);
const TIER_MID_MIN  = parseInt(process.env.EXTRACTION_TIER_MID  || '40', 10);
const MODEL_HIGH    = process.env.EXTRACTION_MODEL_HIGH || 'deepseek-v4-flash';
const MODEL_MID     = process.env.EXTRACTION_MODEL_MID  || 'deepseek-v4-flash';
const MODEL_LOW     = process.env.EXTRACTION_MODEL_LOW  || 'deepseek-v4-flash';
const EXTRACT_PROVIDER = 'deepseek';

// Validator / Promoter models
const VALIDATOR_MODEL  = process.env.VALIDATOR_MODEL         || 'claude-haiku-4-5-20251001';
const FAST_MODEL       = process.env.PROMOTER_FAST_MODEL     || 'deepseek-v4-flash';
const DETAIL_MODEL     = process.env.PROMOTER_DETAIL_MODEL   || 'claude-haiku-4-5-20251001';
const ARBITER_MODEL    = process.env.PROMOTER_ARBITER_MODEL  || 'deepseek-v4-pro';

const EXTRACTOR_VERSION = PROMPT_VERSION;

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------
let isShuttingDown = false;
process.on('SIGTERM', () => { isShuttingDown = true; });
process.on('SIGINT', () => {});

const delay = ms => new Promise(r => setTimeout(r, ms));

function parseJsonResponse(content) {
  const stripped = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return JSON.parse(stripped);
}

// ---------------------------------------------------------------------------
// Stage 1 — EXTRACT
// ---------------------------------------------------------------------------

// Load extract prompt template once
const _templateRaw   = readFileSync(join(PROJECT_ROOT, 'api/lib/llm-prompts/extract-v1.md'), 'utf8');
const _CAND_MARKER   = '\n### Candidate entity dictionary';
const _OUTPUT_MARKER = '\n## Output format';
const _candIdx       = _templateRaw.indexOf(_CAND_MARKER);
const _outputIdx     = _templateRaw.indexOf(_OUTPUT_MARKER);
const STATIC_SYSTEM_PROMPT = (
  _templateRaw.slice(0, _candIdx).trimEnd()
  + '\n\n'
  + _templateRaw.slice(_outputIdx)
).replace(/This passage comes from \*\{\{WORK_TITLE\}\}\* — /g, 'This passage comes from a primary source — ');

// Per-paragraph parse-failure counter
const _failCount = new Map();

// Alias cache — skip expensive join when no aliases exist
let _hasAliases = null;
async function hasAliases() {
  if (_hasAliases === null) {
    const row = await graphQueryOne(`SELECT COUNT(*) as n FROM entity_aliases WHERE confidence >= 0.8`);
    _hasAliases = (row?.n || 0) > 0;
  }
  return _hasAliases;
}
function invalidateAliasCache() { _hasAliases = null; }

async function buildCandidateDictionary(text) {
  if (!(await hasAliases())) return '(none pre-retrieved)';
  const textNorm = text.toLowerCase();
  const aliasRows = await graphQueryAll(`SELECT DISTINCT entity_id FROM entity_aliases WHERE confidence >= 0.8`);
  if (aliasRows.length === 0) return '(none pre-retrieved)';
  const entityIds = [...new Set(aliasRows.map(r => r.entity_id))];
  const ph = entityIds.map(() => '?').join(',');
  const rows = await queryAll(`SELECT id, canonical_name, entity_type AS type, religion FROM graph_entities WHERE id IN (${ph})`, entityIds);
  const matches = rows
    .filter(r => r.canonical_name.length >= 4 && textNorm.includes(r.canonical_name.toLowerCase()))
    .sort((a, b) => b.canonical_name.length - a.canonical_name.length)
    .slice(0, CANDIDATE_LIMIT);
  if (matches.length === 0) return '(none pre-retrieved)';
  return matches.map(r =>
    `  ${r.id}: "${r.canonical_name}" [${r.type || 'unknown'}${r.religion ? ', ' + r.religion : ''}]`
  ).join('\n');
}

async function getDocEnvelope(docId) {
  const doc = await queryOne(`SELECT title, author, religion FROM docs WHERE id = ?`, [docId]);
  if (!doc) return {};
  return { workTitle: doc.title || 'Unknown', author: doc.author || 'Unknown', religion: doc.religion || 'Unknown' };
}

async function buildContextBlock(row, docContext) {
  const envelope = await getDocEnvelope(row.doc_id);
  const candidates = await buildCandidateDictionary(row.text);
  const ctx = docContext || {};
  const settingStr = [ctx.lastSettingPlace, ctx.lastSettingTime].filter(Boolean).join(', ') || 'null';
  const precedingText = ctx.precedingText || '(start of document — no preceding paragraphs)';
  return `### Candidate entity dictionary\n\n${candidates}\n\n### Structural envelope\n\nWork: ${envelope.workTitle}\nAuthor: ${envelope.author}\nReligion: ${envelope.religion}\nCurrent speaker: ${ctx.lastSpeaker || 'null'}\nCurrent setting: ${settingStr}\n\n### Preceding paragraph summaries\n\n${precedingText}\n\n---`;
}

function modelForPriority(docPriority) {
  if ((docPriority ?? 0) >= TIER_HIGH_MIN) return MODEL_HIGH;
  if ((docPriority ?? 0) >= TIER_MID_MIN)  return MODEL_MID;
  return MODEL_LOW;
}

// Call LLM for one extraction — NO DB writes. Returns result data or sentinel.
async function callExtractLLM(row) {
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

  let contextBlock;
  try { contextBlock = await buildContextBlock(row, row._docContext); }
  catch (err) {
    logger.error({ contentId: row.id, err: err.message }, 'buildContextBlock failed');
    return null;
  }

  const activeModel    = modelForPriority(row.doc_priority);
  const activeProvider = EXTRACT_PROVIDER;

  let result;
  try {
    result = await chatCompletion(
      [
        { role: 'system', content: STATIC_SYSTEM_PROMPT },
        { role: 'user', content: contextBlock + '\n\n' + row.text },
      ],
      {
        model: activeModel,
        provider: activeProvider,
        temperature: 0,
        maxTokens: 16384,
        ...(activeProvider === 'anthropic'
          ? { usePromptCache: true }
          : { responseFormat: { type: 'json_object' } }),
      }
    );
  } catch (err) {
    logger.error({ contentId: row.id, model: activeModel, err: err.message }, 'Extraction API call failed');
    return null;
  }

  const usage         = result.usage || {};
  const inputTokens   = usage.promptTokens    || 0;
  const outputTokens  = usage.completionTokens || 0;
  const cachedTokens  = usage.cachedTokens     || 0;

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
    logger.warn({ contentId: row.id, finishReason: result.finishReason, failCount: fails, raw: result.content?.slice(0, 300) }, 'Failed to parse extraction JSON');
    if (fails >= MAX_FAILURES) {
      logger.warn({ contentId: row.id }, 'Marking paragraph unprocessable after repeated failures');
      return { row, activeModel, activeProvider, parsed: null, markFailed: true };
    }
    return null;
  }

  return { row, activeModel, activeProvider, parsed, inputTokens, outputTokens, cachedTokens, costUsd };
}

// Build write statements for one extraction result — returns [{sql, args}] arrays for both DBs
function buildExtractWrites(llmResult) {
  const { row, activeModel, parsed, inputTokens, outputTokens, cachedTokens, costUsd, markFailed } = llmResult;

  // Failure sentinel: mark unprocessable in sifter.db
  if (markFailed) {
    return {
      sifterWrites: [{ sql: `UPDATE content SET graph_enriched = -1, graph_enriched_at = datetime('now'), extractor_version = 'skip:parse-failures' WHERE id = ?`, args: [row.id] }],
      graphWrites: [],
      costPayload: null,
    };
  }

  const graphWrites = [{
    sql: `INSERT INTO paragraph_extractions (content_id, model, prompt_version, output_json, input_tokens, output_tokens, cached_tokens, cost_usd, resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    args: [row.id, activeModel, PROMPT_VERSION, JSON.stringify(parsed), inputTokens, outputTokens, cachedTokens, costUsd],
  }];

  const sifterWrites = [{
    sql: `UPDATE content SET graph_enriched = 1, graph_enriched_at = datetime('now'), extractor_version = ? WHERE id = ?`,
    args: [PROMPT_VERSION, row.id],
  }];

  if (parsed.prose_summary) {
    sifterWrites.push({ sql: `UPDATE content SET text_grounded = ?, grounding_confidence = 0.9, grounded_synced = 0 WHERE id = ?`, args: [parsed.prose_summary, row.id] });
  }

  const costPayload = { model: activeModel, taskType: 'extraction', paragraphId: row.id, inputTokens, outputTokens, cachedTokens, costUsd };
  return { sifterWrites, graphWrites, costPayload };
}

// Sync Meilisearch entity_mentions for a content row (non-fatal)
async function syncMentionsForContent(contentId) {
  try {
    const meili = getMeili();
    if (!meili) return;
    const mentionRows = await graphQueryAll(`SELECT id, entity_id, content_id AS paragraph_id, role FROM entity_mentions WHERE content_id = ?`, [contentId]);
    if (!mentionRows.length) return;
    const entityIds = [...new Set(mentionRows.map(r => r.entity_id))];
    const eph = entityIds.map(() => '?').join(',');
    const entityRows = await queryAll(`SELECT id, canonical_name, entity_type FROM graph_entities WHERE id IN (${eph})`, entityIds);
    const entityMap  = new Map(entityRows.map(r => [r.id, r]));
    const contentRow = await queryOne(`SELECT doc_id, para_meta FROM content WHERE id = ?`, [contentId]);
    const docRow     = contentRow ? await queryOne(`SELECT religion, collection, encumbered, title, author FROM docs WHERE id = ?`, [contentRow.doc_id]) : null;
    const rows = mentionRows.map(em => ({ ...em, ...entityMap.get(em.entity_id), doc_id: contentRow?.doc_id, para_meta: contentRow?.para_meta, ...docRow }));
    if (!rows.length) return;
    const docs = rows.map(row => {
      let paraMeta = null;
      try { paraMeta = JSON.parse(row.para_meta); } catch { /* ignore */ }
      let authority = 0;
      try { authority = getAuthority({ author: paraMeta?.author || row.author, title: row.title }); } catch { /* ignore */ }
      return {
        id: row.id, entity_id: row.entity_id, entity_canonical_name: row.canonical_name || null,
        entity_type: row.entity_type || null, paragraph_id: row.paragraph_id, doc_id: row.doc_id,
        role: row.role || null, religion: row.religion || null, collection: row.collection || null,
        authority, encumbered: row.encumbered ? 1 : 0,
      };
    });
    await meili.index(INDEXES.ENTITY_MENTIONS).addDocuments(docs, { primaryKey: 'id' });
  } catch (err) {
    logger.warn({ contentId, err: err.message }, 'Entity mentions Meili sync failed — will retry on next batch');
  }
}

// Doc-state for extraction: track current doc and rolling narrative context
let _currentDocId       = null;
let _currentDocPriority = 0;
let _currentDocReligion = null;
let _docContext = { lastSpeaker: null, lastNarrator: null, lastSettingPlace: null, lastSettingTime: null, recentSummaries: [] };

function resetDocContext() {
  _docContext = { lastSpeaker: null, lastNarrator: null, lastSettingPlace: null, lastSettingTime: null, recentSummaries: [] };
}

function updateDocContext(parsed) {
  const roles = parsed?.roles || {};
  if (roles.speaker)       _docContext.lastSpeaker      = roles.speaker;
  if (roles.narrator)      _docContext.lastNarrator     = roles.narrator;
  if (roles.setting_place) _docContext.lastSettingPlace = roles.setting_place;
  if (roles.setting_time)  _docContext.lastSettingTime  = roles.setting_time;
  const summary = parsed?.prose_summary;
  if (summary) {
    _docContext.recentSummaries.push(summary);
    if (_docContext.recentSummaries.length > DOC_CONTEXT_PARA_COUNT) _docContext.recentSummaries.shift();
  }
}

function buildPrecedingText() {
  if (_docContext.recentSummaries.length === 0) return '(start of document — no preceding paragraphs)';
  return _docContext.recentSummaries.map((s, i, arr) => `[${i + 1}/${arr.length}]: ${s}`).join('\n');
}

async function seedDocContextFromDB(docId) {
  try {
    const contentRows = await queryAll(`SELECT id, paragraph_index FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index DESC LIMIT ?`, [docId, DOC_CONTEXT_PARA_COUNT * 3]);
    if (contentRows.length === 0) return;
    const contentIds = contentRows.map(r => r.id);
    const cidPh = contentIds.map(() => '?').join(',');
    const cidMap = new Map(contentRows.map(r => [r.id, r.paragraph_index]));
    const peRows = await graphQueryAll(`
      SELECT content_id,
             json_extract(output_json, '$.prose_summary') AS summary,
             json_extract(output_json, '$.roles.speaker')       AS speaker,
             json_extract(output_json, '$.roles.narrator')      AS narrator,
             json_extract(output_json, '$.roles.setting_place') AS setting_place,
             json_extract(output_json, '$.roles.setting_time')  AS setting_time
      FROM paragraph_extractions WHERE content_id IN (${cidPh})
    `, contentIds);
    const rows = peRows
      .map(pe => ({ ...pe, paragraph_index: cidMap.get(pe.content_id) ?? 0 }))
      .sort((a, b) => b.paragraph_index - a.paragraph_index)
      .slice(0, DOC_CONTEXT_PARA_COUNT);
    if (rows.length === 0) return;
    const ordered = [...rows].reverse();
    for (const r of ordered) {
      if (r.summary)       _docContext.recentSummaries.push(r.summary);
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

async function pickNextDoc() {
  return queryOne(`
    SELECT d.id, d.doc_priority, d.religion
    FROM docs d INDEXED BY idx_docs_priority_active
    WHERE d.deleted_at IS NULL
      AND d.duplicate_of IS NULL
      AND EXISTS (
        SELECT 1 FROM content c
        WHERE c.doc_id = d.id
          AND c.graph_enriched = 0
          AND c.deleted_at IS NULL
          AND length(c.text) > 50
      )
    ORDER BY d.doc_priority DESC
    LIMIT 1
  `);
}

async function fetchExtractBatch() {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!_currentDocId) {
      const doc = await pickNextDoc();
      if (!doc) return [];
      _currentDocId       = doc.id;
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
    `, [_currentDocId, EXTRACT_BATCH]);
    if (rows.length === 0) { _currentDocId = null; continue; }
    return rows.map(r => ({ ...r, religion: _currentDocReligion, doc_priority: _currentDocPriority }));
  }
  return [];
}

// Tier-boundary gate: wait for resolver + promoter to clear higher tier before descending
async function isHigherTierFullyResolved(minPriority) {
  const highPriorityDocs = await queryAll(`SELECT id FROM docs WHERE doc_priority >= ? AND deleted_at IS NULL`, [minPriority]);
  const docIds = highPriorityDocs.map(r => r.id);
  let pending = 0;
  if (docIds.length > 0) {
    const contentRows = await queryAll(`SELECT id FROM content WHERE doc_id IN (${docIds.map(() => '?').join(',')})`, docIds);
    const cids = contentRows.map(r => r.id);
    if (cids.length > 0) {
      const peRow = await graphQueryOne(`SELECT COUNT(*) AS n FROM paragraph_extractions WHERE resolved = 0 AND content_id IN (${cids.map(() => '?').join(',')})`, cids);
      pending = peRow?.n || 0;
    }
  }
  const queueRow = await graphQueryOne(`SELECT COUNT(*) AS n FROM promotion_queue WHERE resolved = 0`);
  return pending === 0 && (queueRow?.n || 0) === 0;
}

let _lastBatchPriority = null;
const REEXTRACT_INTERVAL_MS = 5 * 60 * 1000;
let lastReextractReset = 0;

async function resetReextractQueue() {
  if (Date.now() - lastReextractReset < REEXTRACT_INTERVAL_MS) return;
  lastReextractReset = Date.now();
  try {
    const candidates = await graphQueryAll(`
      SELECT pe.content_id, COUNT(pe2.id) AS attempts
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
    const placeholders = ids.map(() => '?').join(',');
    await transaction([{ sql: `UPDATE content SET graph_enriched = 0 WHERE id IN (${placeholders})`, args: ids }], 'reextract-reset');
    _currentDocId = null;
    logger.info({ reset: ids.length }, 'Reextract queue: reset graph_enriched=0 for retry');
  } catch (err) {
    logger.warn({ err: err.message }, 'resetReextractQueue failed (non-fatal)');
  }
}

// Resolve inline entity mentions, roles, and quotes for an extraction result.
// Returns { graphWrites, sifterWrites, needsEmbedding } — all async reads done here,
// writes collected for batching. Embedding blob generation happens inline (async I/O)
// but is included in the returned sifterWrites.
async function collectResolveWrites(extraction, religion) {
  let parsed;
  try {
    parsed = typeof extraction.output_json === 'string'
      ? JSON.parse(extraction.output_json)
      : extraction.output_json;
  } catch {
    logger.warn({ extractionId: extraction.id }, 'Unparseable extraction JSON — skipping');
    return null;
  }

  const graphWrites  = [];
  const sifterWrites = [];

  // 1. entity_mentions + alias promotion_queue entries
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
      graphWrites.push({
        sql: `INSERT OR IGNORE INTO promotion_queue (surface_norm, type, context_snippet, resolved, attempts, priority) VALUES (?, ?, ?, 0, 0, 10)`,
        args: [normalizeSurface(mention.surface), mention.type || null, mention.surface.slice(0, 100)],
      });
      continue;
    }
    graphWrites.push({
      sql: `INSERT OR IGNORE INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?, ?, ?, 0.9, 'resolved', ?)`,
      args: [entityId, extraction.content_id, mention.local_role, EXTRACTOR_VERSION],
    });
    if (mention.surface) {
      const surfNorm = normalizeSurface(mention.surface);
      graphWrites.push({
        sql: `INSERT OR IGNORE INTO entity_aliases (entity_id, surface, surface_norm, lang, source, confidence) VALUES (?,?,?,?,?,?)`,
        args: [entityId, mention.surface, surfNorm, 'en', EXTRACTOR_VERSION, 0.7],
      });
    }
  }

  // 2. paragraph_roles
  const roles     = parsed.roles || {};
  const resolve   = s => s ? findEntity({ surface: s }).then(r => r?.entity_id || null).catch(() => null) : Promise.resolve(null);
  const [speakerEnt, narratorEnt, addresseeEnt, placeEnt] = await Promise.all([
    resolve(roles.speaker), resolve(roles.narrator), resolve(roles.addressee),
    roles.setting_place ? findEntity({ surface: roles.setting_place, type: 'place' }).then(r => r?.entity_id || null).catch(() => null) : null,
  ]);
  graphWrites.push({
    sql: `INSERT OR REPLACE INTO paragraph_roles (content_id, speaker_entity_id, narrator_entity_id, addressee_entity_id, setting_place_entity_id, setting_time, extractor_version) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [extraction.content_id, speakerEnt, narratorEnt, addresseeEnt, placeEnt, roles.setting_time || null, EXTRACTOR_VERSION],
  });

  // 3. quote_instances
  for (const q of parsed.quotations || []) {
    const speakerEnt2 = q.speaker_candidate ? (await findEntity({ surface: q.speaker_candidate }).catch(() => null))?.entity_id : null;
    graphWrites.push({
      sql: `INSERT INTO quote_instances (content_id, span_start, span_end, speaker_surface, speaker_entity_id, attribution_pattern, nesting_depth, extractor_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [extraction.content_id, q.span?.[0], q.span?.[1], q.speaker_surface || null, speakerEnt2, q.attribution_pattern || 'direct', q.nesting_depth || 0, EXTRACTOR_VERSION],
    });
  }

  // 4. Grounded text from referring_expressions span substitutions
  const refExprs = (parsed.referring_expressions || []).filter(
    re => re.span_start != null && re.span_end != null && re.resolved_entity_id != null
  );
  if (refExprs.length > 0) {
    const entityIds = [...new Set(refExprs.map(re => re.resolved_entity_id))];
    const ph = entityIds.map(() => '?').join(',');
    const entityRows = await queryAll(`SELECT id, canonical_name FROM graph_entities WHERE id IN (${ph})`, entityIds);
    const nameMap = new Map(entityRows.map(r => [r.id, r.canonical_name]));
    const subs = refExprs
      .map(re => ({ start: re.span_start, end: re.span_end, name: nameMap.get(re.resolved_entity_id) }))
      .filter(s => s.name)
      .sort((a, b) => b.start - a.start);

    let grounded = extraction.paragraph_text;
    for (const { start, end, name } of subs) {
      const before = grounded.slice(0, start);
      const after  = grounded.slice(end);
      const needsLeadingSpace  = before.length > 0 && !/\s$/.test(before)  && !/^\s/.test(name);
      const needsTrailingSpace = after.length > 0  && !/^\s/.test(after)   && !/\s$/.test(name);
      grounded = before + (needsLeadingSpace ? ' ' : '') + name + (needsTrailingSpace ? ' ' : '') + after;
    }

    if (grounded !== extraction.paragraph_text) {
      let embeddingBlob = null;
      try {
        const { embedding } = await createEmbedding(grounded, { caller: 'graph-pipeline-resolver' });
        if (embedding?.length) embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);
      } catch (err) {
        logger.warn({ contentId: extraction.content_id, err: err.message }, 'Failed to embed grounded text');
      }
      sifterWrites.push({
        sql: `UPDATE content SET text_grounded = ?, embedding_grounded = ?, grounded_synced = 0 WHERE id = ?`,
        args: [grounded, embeddingBlob, extraction.content_id],
      });
    }
  }

  // 5. Mark extraction resolved (graph.db)
  graphWrites.push({ sql: `UPDATE paragraph_extractions SET resolved = 1 WHERE id = ?`, args: [extraction.id] });

  return { graphWrites, sifterWrites };
}

// ---------------------------------------------------------------------------
// Stage 2 — VALIDATE
// ---------------------------------------------------------------------------
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

// Call Haiku for one validation — NO DB writes. Returns {extractionId, graphWrite} or null.
async function callValidateLLM(extraction) {
  // Auto-accept short paragraphs — not worth Haiku cost
  if (extraction.paragraph_text.length < 150) {
    return {
      extractionId: extraction.id,
      contentId: extraction.content_id,
      graphWrite: {
        sql: `INSERT INTO extraction_validations (extraction_id, validator_model, errors_json, confidence, recommended_action) VALUES (?, ?, ?, ?, ?)`,
        args: [extraction.id, 'auto-accept:short', '[]', 0.9, 'accept'],
      },
    };
  }

  const userMsg = `ORIGINAL TEXT:\n${extraction.paragraph_text}\n\nEXTRACTION JSON:\n${extraction.output_json}`;
  let result;
  try {
    result = await chatCompletion(
      [
        { role: 'system', content: VALIDATION_SYSTEM },
        { role: 'user', content: userMsg },
        { role: 'assistant', content: '{' },
      ],
      { model: VALIDATOR_MODEL, provider: 'anthropic', temperature: 0, maxTokens: 1024 }
    );
  } catch (err) {
    logger.error({ extractionId: extraction.id, err: err.message }, 'Haiku validation call failed');
    return null;
  }

  const usage        = result.usage || {};
  const inputTokens  = usage.promptTokens    || 0;
  const outputTokens = usage.completionTokens || 0;
  const costUsd      = inputTokens * 0.00025 / 1000 + outputTokens * 0.00125 / 1000;

  let parsed;
  try {
    const text      = '{' + result.content;
    const lastBrace = text.lastIndexOf('}');
    const raw       = lastBrace > 0 ? text.slice(0, lastBrace + 1) : text;
    parsed          = JSON.parse(raw);
  } catch {
    logger.warn({ extractionId: extraction.id, content: result.content?.slice(0, 200) }, 'Validator returned non-JSON — marking reextract');
    parsed = { errors: [{ field: 'root', issue: 'non-JSON response from validator' }], confidence: 0.3, recommended_action: 'reextract' };
  }

  // Safety net: span-precision errors only → accept anyway
  if (parsed.recommended_action === 'reextract' && (parsed.confidence ?? 0) >= 0.65) {
    const onlySpanErrors = (parsed.errors || []).every(e =>
      /span|offset|position|character|char/i.test(e.issue) && !/wrong|fabricat|missing|incorrect entity|wrong person|wrong gender/i.test(e.issue)
    );
    if (onlySpanErrors && (parsed.errors || []).length > 0) parsed.recommended_action = 'accept';
  }

  // Track cost async — non-blocking
  trackCost({ model: VALIDATOR_MODEL, taskType: 'validation', paragraphId: extraction.content_id, inputTokens, outputTokens, cachedTokens: 0, costUsd }).catch(() => {});

  return {
    extractionId: extraction.id,
    contentId: extraction.content_id,
    graphWrite: {
      sql: `INSERT INTO extraction_validations (extraction_id, validator_model, errors_json, confidence, recommended_action) VALUES (?, ?, ?, ?, ?)`,
      args: [extraction.id, VALIDATOR_MODEL, JSON.stringify(parsed.errors || []), parsed.confidence ?? 0.5, parsed.recommended_action ?? 'arbitrate'],
    },
  };
}

// ---------------------------------------------------------------------------
// Stage 4 — PROMOTE (candidates + adjudication)
// ---------------------------------------------------------------------------
const ADJUDICATION_SYSTEM = `You are an entity disambiguation expert for a multi-religion digital library.

Given a surface form and context, decide:
1. Does this surface refer to an existing entity in the candidate list?
2. If yes, which one (provide entity_id)?
3. If no, should a new entity be created?

Return ONLY valid JSON:
{
  "decision": "merge" | "create" | "reject",
  "entity_id": null or integer,
  "canonical_name": "proposed canonical name if creating",
  "entity_type": "person|place|organization|concept|work|event",
  "confidence": 0.0-1.0,
  "reasoning": "one sentence"
}

Rules:
- "merge" only when you are confident (>=0.8) this surface refers to the candidate entity
- "create" when this is clearly a real named entity not yet in the database
- "reject" when this is a generic term, pronoun, or too ambiguous to resolve
- Preserve all diacritical marks exactly in canonical_name`;

async function getPromoteCandidates(surfaceNorm, type) {
  const prefix   = surfaceNorm.slice(0, 8) + '%';
  const aliasRows = await graphQueryAll(`SELECT DISTINCT entity_id FROM entity_aliases WHERE surface_norm LIKE ? LIMIT 30`, [prefix]);
  if (aliasRows.length === 0) return [];
  const entityIds = aliasRows.map(r => r.entity_id);
  const ph = entityIds.map(() => '?').join(',');
  const typeFilter = type ? `AND entity_type = '${type}'` : '';
  return queryAll(`SELECT id, canonical_name, entity_type AS type, religion FROM graph_entities WHERE id IN (${ph}) ${typeFilter} LIMIT 10`, entityIds);
}

async function adjudicate(item, candidates) {
  const candidateList = candidates.length > 0
    ? candidates.map(c => `  ${c.id}: "${c.canonical_name}" [${c.type || 'unknown'}${c.religion ? ', ' + c.religion : ''}]`).join('\n')
    : '  (none found)';
  const userMsg = `SURFACE: "${item.surface_norm}"\nTYPE: ${item.type || 'unknown'}\nCONTEXT: "${item.context_snippet}"\n\nCANDIDATE ENTITIES:\n${candidateList}`;
  const sysMsg  = { role: 'system', content: ADJUDICATION_SYSTEM };

  // Fast + detail models vote concurrently (different providers — no semaphore conflict)
  const [fastResult, detailResult] = await Promise.allSettled([
    deepseekSem.run(async () => {
      const r = await chatCompletion(
        [sysMsg, { role: 'user', content: userMsg }],
        { model: FAST_MODEL, provider: 'deepseek', temperature: 0, maxTokens: 512, responseFormat: { type: 'json_object' } }
      );
      const usage = r.usage || {};
      trackCost({ model: FAST_MODEL, taskType: 'adjudication', inputTokens: usage.promptTokens || 0, outputTokens: usage.completionTokens || 0, cachedTokens: usage.cachedTokens || 0, costUsd: ((usage.promptTokens||0) * 0.00027 + (usage.completionTokens||0) * 0.0011) / 1000 }).catch(() => {});
      return parseJsonResponse(r.content);
    }),
    haikuSem.run(async () => {
      const r = await chatCompletion(
        [sysMsg, { role: 'user', content: userMsg }],
        { model: DETAIL_MODEL, provider: 'anthropic', temperature: 0, maxTokens: 512 }
      );
      const usage = r.usage || {};
      trackCost({ model: DETAIL_MODEL, taskType: 'adjudication', inputTokens: usage.promptTokens || 0, outputTokens: usage.completionTokens || 0, cachedTokens: 0, costUsd: ((usage.promptTokens||0) * 0.00025 + (usage.completionTokens||0) * 0.00125) / 1000 }).catch(() => {});
      return parseJsonResponse(r.content);
    }),
  ]);

  const fastVote   = fastResult.status   === 'fulfilled' ? fastResult.value   : null;
  const detailVote = detailResult.status === 'fulfilled' ? detailResult.value : null;
  if (!fastVote) logger.warn({ model: FAST_MODEL,   err: fastResult.reason?.message   }, 'Fast vote failed');
  if (!detailVote) logger.warn({ model: DETAIL_MODEL, err: detailResult.reason?.message }, 'Detail vote failed');

  const votes    = [fastVote, detailVote].filter(Boolean);
  if (votes.length === 0) return null;
  const decisions = votes.map(v => v.decision);
  const unanimous = decisions.every(d => d === decisions[0]);
  if (unanimous && votes[0].confidence >= 0.75) return votes[0];

  // Arbitrate
  try {
    const modelVotesSummary = votes.map((v, i) =>
      `Model ${i+1}: decision=${v.decision}, entity_id=${v.entity_id}, confidence=${v.confidence}`
    ).join('\n');
    const r = await sonnetSem.run(() => chatCompletion(
      [sysMsg, { role: 'user', content: `${userMsg}\n\nMODEL VOTES:\n${modelVotesSummary}\n\nResolve the disagreement.` }],
      { model: ARBITER_MODEL, provider: 'deepseek', temperature: 0, maxTokens: 512 }
    ));
    const usage = r.usage || {};
    trackCost({ model: ARBITER_MODEL, taskType: 'adjudication', inputTokens: usage.promptTokens || 0, outputTokens: usage.completionTokens || 0, cachedTokens: 0, costUsd: ((usage.promptTokens||0) * 0.00055 + (usage.completionTokens||0) * 0.0022) / 1000 }).catch(() => {});
    return parseJsonResponse(r.content);
  } catch (err) {
    logger.debug({ model: ARBITER_MODEL, err: err.message }, 'Arbiter vote failed — using first vote');
    return votes[0];
  }
}

// ---------------------------------------------------------------------------
// Main loop stages
// ---------------------------------------------------------------------------

async function runExtractStage() {
  const rows = await fetchExtractBatch();
  if (rows.length === 0) return 0;

  const batchPriority = rows[0].doc_priority ?? 0;

  // Tier boundary gate
  if (_lastBatchPriority !== null && batchPriority < _lastBatchPriority) {
    const ready = await isHigherTierFullyResolved(_lastBatchPriority);
    if (!ready) {
      logger.info({ from: _lastBatchPriority, to: batchPriority }, 'Tier boundary — waiting for resolver/promoter to catch up');
      return 0;
    }
    logger.info({ from: _lastBatchPriority, to: batchPriority }, 'Tier boundary cleared — compounding entities into next tier');
    invalidateAliasCache();
  }
  _lastBatchPriority = batchPriority;

  // Snapshot rolling context for all concurrent LLM calls in this batch
  const batchDocContext = {
    lastSpeaker:      _docContext.lastSpeaker,
    lastNarrator:     _docContext.lastNarrator,
    lastSettingPlace: _docContext.lastSettingPlace,
    lastSettingTime:  _docContext.lastSettingTime,
    precedingText:    buildPrecedingText(),
  };
  const rowsWithCtx = rows.map(r => ({ ...r, _docContext: batchDocContext }));

  // Phase 1: concurrent LLM calls — no DB writes
  const llmResults = await Promise.allSettled(rowsWithCtx.map(r => deepseekSem.run(() => callExtractLLM(r))));

  // Phase 2: collect write statements, then commit in two transactions
  const sifterWrites = [];
  const graphWrites  = [];
  const costPayloads = [];
  const successParsed = [];
  const failedRows   = [];

  for (let i = 0; i < llmResults.length; i++) {
    const r = llmResults[i];
    if (r.status === 'rejected' || r.value === null) { failedRows.push(rows[i]); continue; }
    const { sifterWrites: sw, graphWrites: gw, costPayload } = buildExtractWrites(r.value);
    sifterWrites.push(...sw);
    graphWrites.push(...gw);
    if (costPayload) costPayloads.push(costPayload);
    if (r.value.parsed && !r.value.markFailed) {
      successParsed.push({ parsed: r.value.parsed });
      // Clear failure counter on success
      _failCount.delete(r.value.row.id);
    } else if (r.value.markFailed) {
      _failCount.delete(r.value.row.id);
    }
  }

  // Single transactions for entire batch
  if (graphWrites.length > 0) await graphTransaction(graphWrites, 'extract-batch');
  if (sifterWrites.length > 0) await transaction(sifterWrites, 'extract-batch-sifter');

  // Track costs async — non-blocking
  for (const cp of costPayloads) trackCost(cp).catch(() => {});

  // Update rolling doc context (serial, paragraph_index order preserved by rows array order)
  for (const { parsed } of successParsed) updateDocContext(parsed);

  invalidateAliasCache();

  const succeeded = successParsed.length;
  if (failedRows.length > 0) logger.warn({ succeeded, failed: failedRows.length }, 'Extract batch partial failures');
  logger.debug({ extracted: succeeded, batchPriority }, 'Extract stage done');
  return succeeded;
}

async function runValidateStage() {
  // Fetch batch including paragraph text
  const peRows = await graphQueryAll(`
    SELECT pe.id, pe.content_id, pe.output_json
    FROM paragraph_extractions pe
    WHERE pe.resolved = 0
      AND NOT EXISTS (SELECT 1 FROM extraction_validations ev WHERE ev.extraction_id = pe.id)
    ORDER BY pe.id ASC
    LIMIT ?
  `, [VALIDATE_BATCH]);
  if (peRows.length === 0) return 0;

  const contentIds = [...new Set(peRows.map(r => r.content_id))];
  const cph = contentIds.map(() => '?').join(',');
  const textRows = await queryAll(`SELECT id, text FROM content WHERE id IN (${cph})`, contentIds);
  const textMap  = new Map(textRows.map(r => [r.id, r.text]));
  const rows     = peRows.map(pe => ({ ...pe, paragraph_text: textMap.get(pe.content_id) || '' }));

  // Phase 1: concurrent Haiku calls — no DB writes
  const results = await Promise.allSettled(rows.map(r => haikuSem.run(() => callValidateLLM(r))));

  // Phase 2: collect writes, single transaction
  const graphWrites = [];
  for (const r of results) {
    if (r.status === 'rejected' || r.value === null) continue;
    graphWrites.push(r.value.graphWrite);
  }

  if (graphWrites.length > 0) await graphTransaction(graphWrites, 'validate-batch');

  const validated = graphWrites.length;
  const autoAccepted = graphWrites.filter(w => w.args?.[1] === 'auto-accept:short').length;
  logger.debug({ validated, autoAccepted }, 'Validate stage done');
  return validated;
}

async function runResolveStage() {
  const peRows = await graphQueryAll(`
    SELECT pe.id, pe.content_id, pe.output_json
    FROM paragraph_extractions pe
    JOIN extraction_validations ev ON ev.extraction_id = pe.id
    WHERE pe.resolved = 0
      AND ev.recommended_action = 'accept'
    ORDER BY pe.id ASC
    LIMIT ?
  `, [RESOLVE_BATCH]);
  if (peRows.length === 0) return 0;

  const contentIds = [...new Set(peRows.map(r => r.content_id))];
  const cph        = contentIds.map(() => '?').join(',');
  const textRows   = await queryAll(`SELECT id, text, doc_id FROM content WHERE id IN (${cph})`, contentIds);
  const textMap    = new Map(textRows.map(r => [r.id, r]));

  // Fetch religions for all docs in one query
  const docIds   = [...new Set(textRows.map(r => r.doc_id))];
  const dph      = docIds.map(() => '?').join(',');
  const docRows  = docIds.length ? await queryAll(`SELECT id, religion FROM docs WHERE id IN (${dph})`, docIds) : [];
  const religionMap = new Map(docRows.map(r => [r.id, r.religion]));

  const rows = peRows.map(pe => ({
    ...pe,
    paragraph_text: textMap.get(pe.content_id)?.text || '',
    religion: religionMap.get(textMap.get(pe.content_id)?.doc_id) || null,
  }));

  // Phase 1: collect all async reads and resolve writes concurrently (no DB writes yet)
  // Embedding generation happens here (async I/O); writes collected only.
  const resolveResults = await Promise.allSettled(rows.map(r => collectResolveWrites(r, r.religion)));

  // Phase 2: batch all writes into single transactions
  const allGraphWrites  = [];
  const allSifterWrites = [];
  const resolvedContentIds = [];

  for (let i = 0; i < resolveResults.length; i++) {
    const r = resolveResults[i];
    if (r.status === 'rejected' || r.value === null) {
      logger.warn({ extractionId: rows[i].id, err: r.reason?.message }, 'Resolve collect failed — skipping');
      continue;
    }
    allGraphWrites.push(...r.value.graphWrites);
    allSifterWrites.push(...r.value.sifterWrites);
    resolvedContentIds.push(rows[i].content_id);
  }

  if (allGraphWrites.length > 0) await graphTransaction(allGraphWrites, 'resolve-batch');
  if (allSifterWrites.length > 0) await transaction(allSifterWrites, 'resolve-batch-sifter');

  // Sync Meilisearch entity_mentions (non-blocking, post-write)
  for (const contentId of resolvedContentIds) {
    syncMentionsForContent(contentId).catch(() => {});
  }

  logger.debug({ resolved: resolvedContentIds.length }, 'Resolve stage done');
  return resolvedContentIds.length;
}

async function runPromoteStage() {
  const rows = await graphQueryAll(`
    SELECT id, surface_norm, type, context_snippet, doc_id, content_id, attempts
    FROM promotion_queue
    WHERE resolved = 0 AND attempts < ?
    ORDER BY priority DESC, id ASC
    LIMIT ?
  `, [MAX_PROMOTE_ATTEMPTS, PROMOTE_BATCH]);
  if (rows.length === 0) return 0;

  // Phase 1: candidates + adjudication concurrently (no DB writes)
  const adjResults = await Promise.allSettled(rows.map(async item => {
    const candidates = await getPromoteCandidates(item.surface_norm, item.type);
    const decision   = await adjudicate(item, candidates);
    return { item, decision };
  }));

  // Phase 2: apply decisions — requires createEntity (writes sifter.db) + graphWrites + sifterWrites
  // createEntity uses mainQuery (sifter.db). Collect separately.
  const graphWrites  = [];
  const sifterWrites = [];

  for (const r of adjResults) {
    if (r.status === 'rejected' || !r.value?.decision) {
      if (r.status === 'rejected') {
        const failedItem = rows[adjResults.indexOf(r)];
        logger.error({ surfaceNorm: failedItem?.surface_norm, err: r.reason?.message }, 'Promotion adjudication error');
        if (failedItem) {
          graphWrites.push({ sql: `UPDATE promotion_queue SET attempts = attempts + 1 WHERE id = ?`, args: [failedItem.id] });
        }
      }
      continue;
    }

    const { item, decision } = r.value;
    const modelVotesJson = JSON.stringify({ decision: decision.decision, entity_id: decision.entity_id, confidence: decision.confidence });

    graphWrites.push({
      sql: `INSERT INTO er_audit_log (action, candidate, model_votes, run_id) VALUES (?, ?, ?, ?)`,
      args: [decision.decision, item.surface_norm, modelVotesJson, null],
    });

    if (decision.decision === 'merge' && decision.entity_id) {
      const surfNorm = item.surface_norm;
      const surface  = item.context_snippet?.slice(0, 200) || item.surface_norm;
      graphWrites.push({
        sql: `INSERT OR IGNORE INTO entity_aliases (entity_id, surface, surface_norm, lang, source, confidence) VALUES (?,?,?,?,?,?)`,
        args: [decision.entity_id, surface, surfNorm, 'en', 'promoter', decision.confidence],
      });
      graphWrites.push({ sql: `UPDATE promotion_queue SET resolved = 1 WHERE id = ?`, args: [item.id] });
      logger.info({ surface: item.surface_norm, entityId: decision.entity_id }, 'Merged alias');

    } else if (decision.decision === 'create' && decision.canonical_name) {
      // createEntity writes to sifter.db — must be done before the transaction
      // We do it now (still in collection phase) since it returns an entity_id needed for alias write
      try {
        const entityId = await createEntity({
          canonicalName: decision.canonical_name,
          type: decision.entity_type || item.type,
          aliases: [{
            surface: item.context_snippet?.slice(0, 200) || item.surface_norm,
            surfaceNorm: item.surface_norm,
            lang: 'en',
            source: 'promoter',
            confidence: decision.confidence,
          }],
        });
        graphWrites.push({ sql: `UPDATE promotion_queue SET resolved = 1 WHERE id = ?`, args: [item.id] });
        logger.info({ surface: item.surface_norm, entityId, canonical: decision.canonical_name }, 'Created entity');
      } catch (err) {
        logger.error({ surface: item.surface_norm, err: err.message }, 'createEntity failed during promote');
        graphWrites.push({ sql: `UPDATE promotion_queue SET attempts = attempts + 1 WHERE id = ?`, args: [item.id] });
      }

    } else {
      // reject or no canonical_name for create
      const newAttempts = item.attempts + 1;
      if (newAttempts >= MAX_PROMOTE_ATTEMPTS) {
        graphWrites.push({ sql: `UPDATE promotion_queue SET attempts = ?, resolved = 1 WHERE id = ?`, args: [newAttempts, item.id] });
        logger.debug({ surface: item.surface_norm }, 'Promotion rejected after max attempts');
      } else {
        graphWrites.push({ sql: `UPDATE promotion_queue SET attempts = ? WHERE id = ?`, args: [newAttempts, item.id] });
      }
    }
  }

  if (graphWrites.length > 0) await graphTransaction(graphWrites, 'promote-batch');

  logger.debug({ promoted: adjResults.filter(r => r.status === 'fulfilled').length }, 'Promote stage done');
  return rows.length;
}

// ---------------------------------------------------------------------------
// Worker loop
// ---------------------------------------------------------------------------
async function workerLoop() {
  logger.info({
    modelHigh: MODEL_HIGH, modelMid: MODEL_MID, modelLow: MODEL_LOW,
    tierHigh: TIER_HIGH_MIN, tierMid: TIER_MID_MIN,
    validatorModel: VALIDATOR_MODEL,
    fastModel: FAST_MODEL, detailModel: DETAIL_MODEL, arbiterModel: ARBITER_MODEL,
  }, 'Graph pipeline starting — unified extract/validate/resolve/promote');

  let totalExtracted = 0;
  let totalValidated = 0;
  let totalResolved  = 0;
  let totalPromoted  = 0;

  while (!isShuttingDown) {
    let anyWork = false;

    try {
      const extracted = await runExtractStage();
      if (extracted > 0) { anyWork = true; totalExtracted += extracted; }
    } catch (err) {
      logger.error({ err: err.message }, 'Extract stage error');
    }

    if (isShuttingDown) break;

    try {
      const validated = await runValidateStage();
      if (validated > 0) { anyWork = true; totalValidated += validated; }
    } catch (err) {
      logger.error({ err: err.message }, 'Validate stage error');
    }

    if (isShuttingDown) break;

    try {
      const resolved = await runResolveStage();
      if (resolved > 0) { anyWork = true; totalResolved += resolved; }
    } catch (err) {
      logger.error({ err: err.message }, 'Resolve stage error');
    }

    if (isShuttingDown) break;

    try {
      const promoted = await runPromoteStage();
      if (promoted > 0) { anyWork = true; totalPromoted += promoted; }
    } catch (err) {
      logger.error({ err: err.message }, 'Promote stage error');
    }

    if (!anyWork) {
      await resetReextractQueue();
      logger.info({ totalExtracted, totalValidated, totalResolved, totalPromoted }, 'No work — sleeping');
      await delay(IDLE_SLEEP_MS);
    } else if (totalExtracted % 100 === 0 && totalExtracted > 0) {
      const budget = await checkBudget().catch(() => ({}));
      logger.info({ totalExtracted, totalValidated, totalResolved, totalPromoted, spend: budget.spend?.toFixed(4) }, 'Pipeline progress');
    }
  }

  logger.info({ totalExtracted, totalValidated, totalResolved, totalPromoted }, 'Graph pipeline shutting down');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const scriptPath = fileURLToPath(import.meta.url);
const isMain = process.argv[1] === scriptPath || process.env.pm_exec_path === scriptPath;
if (isMain) {
  await runMigrations();
  await runGraphMigrations();
  await workerLoop();
}
