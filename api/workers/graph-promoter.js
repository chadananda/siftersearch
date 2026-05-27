#!/usr/bin/env node
// Entity promotion adjudicator. Processes promotion_queue — new surfaces that
// couldn't be matched to existing entities. Uses multi-model voting to decide:
// merge into existing entity, create new entity, or reject.
// PM2 process: siftersearch-graph-promoter

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryAll, queryOne } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { runMigrations } from '../lib/migrations.js';
import { chatCompletion } from '../lib/ai.js';
import { trackCost } from '../lib/entity-cost-tracker.js';
import { createEntity, addAlias, normalizeSurface } from '../lib/graph-db.js';

const BATCH_SIZE = 10;
const IDLE_SLEEP_MS = 60_000;
const MAX_ATTEMPTS = 3;

// Models used for voting — configurable via .env-public
const FAST_MODEL    = process.env.PROMOTER_FAST_MODEL    || 'deepseek-v4-flash';
const DETAIL_MODEL  = process.env.PROMOTER_DETAIL_MODEL  || 'claude-haiku-4-5-20251001';
const ARBITER_MODEL = process.env.PROMOTER_ARBITER_MODEL || 'deepseek-v4-pro';

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

async function getCandidates(surfaceNorm, type) {
  // Prefix LIKE (no leading %) so idx_alias_surface index is used
  const prefix = surfaceNorm.slice(0, 8) + '%';
  return queryAll(`
    SELECT ge.id, ge.canonical_name, ge.entity_type AS type, ge.religion
    FROM graph_entities ge
    JOIN entity_aliases ea ON ea.entity_id = ge.id
    WHERE ea.surface_norm LIKE ?
      ${type ? `AND ge.entity_type = '${type}'` : ''}
    LIMIT 10
  `, [prefix]);
}

async function adjudicate(item, candidates) {
  const candidateList = candidates.length > 0
    ? candidates.map(c => `  ${c.id}: "${c.canonical_name}" [${c.type || 'unknown'}${c.religion ? ', ' + c.religion : ''}]`).join('\n')
    : '  (none found)';

  const userMsg = `SURFACE: "${item.surface_norm}"
TYPE: ${item.type || 'unknown'}
CONTEXT: "${item.context_snippet}"

CANDIDATE ENTITIES:
${candidateList}`;

  const sysMsg = { role: 'system', content: ADJUDICATION_SYSTEM };

  // Fast model vote
  let fastVote = null;
  try {
    const r = await chatCompletion(
      [sysMsg, { role: 'user', content: userMsg }],
      { model: FAST_MODEL, provider: 'deepseek', temperature: 0, maxTokens: 512, responseFormat: { type: 'json_object' } }
    );
    const usage = r.usage || {};
    await trackCost({ model: FAST_MODEL, taskType: 'adjudication', inputTokens: usage.promptTokens || 0, outputTokens: usage.completionTokens || 0, cachedTokens: usage.cachedTokens || 0, costUsd: ((usage.promptTokens||0) * 0.00027 + (usage.completionTokens||0) * 0.0011) / 1000 });
    fastVote = parseJsonResponse(r.content);
  } catch (err) { logger.warn({ model: FAST_MODEL, err: err.message }, 'Fast vote failed'); }

  // Detail model vote
  let detailVote = null;
  try {
    const r = await chatCompletion(
      [sysMsg, { role: 'user', content: userMsg }],
      { model: DETAIL_MODEL, provider: 'anthropic', temperature: 0, maxTokens: 512 }
    );
    const usage = r.usage || {};
    await trackCost({ model: DETAIL_MODEL, taskType: 'adjudication', inputTokens: usage.promptTokens || 0, outputTokens: usage.completionTokens || 0, cachedTokens: 0, costUsd: ((usage.promptTokens||0) * 0.00025 + (usage.completionTokens||0) * 0.00125) / 1000 });
    detailVote = parseJsonResponse(r.content);
  } catch (err) { logger.warn({ model: DETAIL_MODEL, err: err.message }, 'Detail vote failed'); }

  // If both agree, use consensus. Otherwise arbitrate.
  const votes = [fastVote, detailVote].filter(Boolean);
  if (votes.length === 0) return null;

  const decisions = votes.map(v => v.decision);
  const unanimous = decisions.every(d => d === decisions[0]);

  if (unanimous && votes[0].confidence >= 0.75) {
    return votes[0];
  }

  // Arbitrate with deepseek-v4-pro
  try {
    const modelVotesSummary = votes.map((v, i) =>
      `Model ${i+1}: decision=${v.decision}, entity_id=${v.entity_id}, confidence=${v.confidence}`
    ).join('\n');
    const r = await chatCompletion(
      [sysMsg, { role: 'user', content: `${userMsg}\n\nMODEL VOTES:\n${modelVotesSummary}\n\nResolve the disagreement.` }],
      { model: ARBITER_MODEL, provider: 'deepseek', temperature: 0, maxTokens: 512 }
    );
    const usage = r.usage || {};
    // deepseek-v4-pro: $0.00055/K input, $0.0022/K output
    await trackCost({ model: ARBITER_MODEL, taskType: 'adjudication', inputTokens: usage.promptTokens || 0, outputTokens: usage.completionTokens || 0, cachedTokens: 0, costUsd: ((usage.promptTokens||0) * 0.00055 + (usage.completionTokens||0) * 0.0022) / 1000 });
    return parseJsonResponse(r.content);
  } catch (err) {
    logger.debug({ model: ARBITER_MODEL, err: err.message }, 'Arbiter vote failed');
    return votes[0]; // fallback to first vote
  }
}

async function applyDecision(item, decision) {
  const modelVotesJson = JSON.stringify({ decision: decision.decision, entity_id: decision.entity_id, confidence: decision.confidence });

  await queryWithRetry(`
    INSERT INTO er_audit_log (action, candidate, model_votes, run_id)
    VALUES (?, ?, ?, ?)
  `, [decision.decision, item.surface_norm, modelVotesJson, null]);

  if (decision.decision === 'merge' && decision.entity_id) {
    await addAlias(decision.entity_id, {
      surface: item.context_snippet?.slice(0, 200) || item.surface_norm,
      surfaceNorm: item.surface_norm,
      lang: 'en',
      source: 'promoter',
      confidence: decision.confidence,
    });
    await queryWithRetry(`UPDATE promotion_queue SET resolved = 1 WHERE id = ?`, [item.id]);
    logger.info({ surface: item.surface_norm, entityId: decision.entity_id }, 'Merged alias');

  } else if (decision.decision === 'create' && decision.canonical_name) {
    const entityId = await createEntity({
      canonicalName: decision.canonical_name,
      type: decision.entity_type || item.type,
      aliases: [{ surface: item.context_snippet?.slice(0, 200) || item.surface_norm, surfaceNorm: item.surface_norm, lang: 'en', source: 'promoter', confidence: decision.confidence }],
    });
    await queryWithRetry(`UPDATE promotion_queue SET resolved = 1 WHERE id = ?`, [item.id]);
    logger.info({ surface: item.surface_norm, entityId, canonical: decision.canonical_name }, 'Created entity');

  } else {
    // Reject or low confidence — bump attempts, resolve at MAX_ATTEMPTS
    const newAttempts = item.attempts + 1;
    if (newAttempts >= MAX_ATTEMPTS) {
      await queryWithRetry(`UPDATE promotion_queue SET attempts = ?, resolved = 1 WHERE id = ?`, [newAttempts, item.id]);
      logger.debug({ surface: item.surface_norm }, 'Promotion rejected after max attempts');
    } else {
      await queryWithRetry(`UPDATE promotion_queue SET attempts = ? WHERE id = ?`, [newAttempts, item.id]);
    }
  }
}

async function fetchBatch() {
  return queryAll(`
    SELECT id, surface_norm, type, context_snippet, doc_id, content_id, attempts
    FROM promotion_queue
    WHERE resolved = 0 AND attempts < ?
    ORDER BY priority DESC, id ASC
    LIMIT ?
  `, [MAX_ATTEMPTS, BATCH_SIZE]);
}

let isShuttingDown = false;
process.on('SIGTERM', () => { isShuttingDown = true; });
process.on('SIGINT', () => {});

const delay = ms => new Promise(r => setTimeout(r, ms));

// Strip markdown code fences (```json ... ```) that some models add around JSON output.
function parseJsonResponse(content) {
  const stripped = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return JSON.parse(stripped);
}

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

async function workerLoop() {
  logger.info('Graph promoter starting');

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

    for (const row of rows) {
      if (isShuttingDown) break;
      try {
        const candidates = await getCandidates(row.surface_norm, row.type);
        const decision = await adjudicate(row, candidates);
        if (decision) await applyDecision(row, decision);
      } catch (err) {
        logger.error({ surfaceNorm: row.surface_norm, err: err.message }, 'Promotion error');
        await queryWithRetry(`UPDATE promotion_queue SET attempts = attempts + 1 WHERE id = ?`, [row.id]).catch(() => {});
      }
    }
    logger.info({ promoted: rows.length }, 'Promotion batch done');
  }

  logger.info('Graph promoter shutting down');
}

const scriptPath = fileURLToPath(import.meta.url);
const isMain = process.argv[1] === scriptPath || process.env.pm_exec_path === scriptPath;
if (isMain) {
  await runMigrations();
  await workerLoop();
}
