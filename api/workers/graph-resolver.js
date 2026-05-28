#!/usr/bin/env node
// Entity resolution worker. Takes validated paragraph_extractions (resolved=0,
// action=accept) and writes to entity_mentions, paragraph_roles, quote_instances.
// Sets resolved=1 and grounded_synced=0 on content after writing.
// PM2 process: siftersearch-graph-resolver

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryAll, queryOne, graphQuery, graphQueryAll, graphQueryOne } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { runMigrations, runGraphMigrations } from '../lib/migrations/runner.js';
import { createEmbedding } from '../lib/ai.js';
import { findEntity, createEntity, addAlias, normalizeSurface } from '../lib/graph-db.js';

const BATCH_SIZE = 50;
const IDLE_SLEEP_MS = 10_000;
const EXTRACTOR_VERSION = 'extract-v1';

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

// Resolve a mention's proposed_entity_id or find/create by canonical name.
// Returns entity_id or null if unresolvable.
async function resolveMention(mention, religion) {
  // Use proposed_entity_id if model gave us one and it exists
  if (mention.proposed_entity_id != null) {
    const exists = await queryOne(`SELECT id FROM graph_entities WHERE id = ?`, [mention.proposed_entity_id]);
    if (exists) return mention.proposed_entity_id;
  }

  // Try finding by surface via aliases
  const found = await findEntity({ surface: mention.surface, type: mention.type, religion });
  if (found?.entity_id) return found.entity_id;

  const surfaceNorm = normalizeSurface(mention.surface);
  await graphQueryWithRetry(`
    INSERT OR IGNORE INTO promotion_queue
      (surface_norm, type, context_snippet, resolved, attempts, priority)
    VALUES (?, ?, ?, 0, 0, 10)
  `, [surfaceNorm, mention.type || null, mention.surface.slice(0, 100)]);

  return null;
}

async function resolveOne(extraction) {
  let parsed;
  try {
    parsed = typeof extraction.output_json === 'string'
      ? JSON.parse(extraction.output_json)
      : extraction.output_json;
  } catch {
    logger.warn({ extractionId: extraction.id }, 'Unparseable extraction JSON — skipping');
    return;
  }

  const doc = await queryOne(`SELECT religion FROM docs WHERE id = (SELECT doc_id FROM content WHERE id = ?)`, [extraction.content_id]);
  const religion = doc?.religion;

  // 1. Write entity_mentions
  for (const mention of parsed.mentions || []) {
    const entityId = await resolveMention(mention, religion);
    if (!entityId) continue;

    await graphQueryWithRetry(`
      INSERT OR IGNORE INTO entity_mentions
        (entity_id, content_id, role, resolution_confidence, status, extractor_version)
      VALUES (?, ?, ?, ?, 'resolved', ?)
    `, [entityId, extraction.content_id, mention.local_role, 0.9, EXTRACTOR_VERSION]);

    // Register surface as alias (low confidence until promoted)
    if (mention.surface) {
      const surfaceNorm = normalizeSurface(mention.surface);
      await addAlias(entityId, {
        surface: mention.surface,
        surfaceNorm,
        lang: 'en',
        source: EXTRACTOR_VERSION,
        confidence: 0.7,
      });
    }
  }

  // 2. Write paragraph_roles
  const roles = parsed.roles || {};
  const speakerEntity  = roles.speaker  ? (await findEntity({ surface: roles.speaker }))?.entity_id  : null;
  const narratorEntity = roles.narrator ? (await findEntity({ surface: roles.narrator }))?.entity_id : null;
  const addresseeEnt   = roles.addressee? (await findEntity({ surface: roles.addressee}))?.entity_id : null;
  const placeEntity    = roles.setting_place ? (await findEntity({ surface: roles.setting_place, type: 'place' }))?.entity_id : null;

  await graphQueryWithRetry(`
    INSERT OR REPLACE INTO paragraph_roles
      (content_id, speaker_entity_id, narrator_entity_id, addressee_entity_id,
       setting_place_entity_id, setting_time, extractor_version)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [extraction.content_id, speakerEntity, narratorEntity, addresseeEnt,
      placeEntity, roles.setting_time || null, EXTRACTOR_VERSION]);

  // 3. Write quote_instances
  for (const q of parsed.quotations || []) {
    const speakerEnt = q.speaker_candidate
      ? (await findEntity({ surface: q.speaker_candidate }))?.entity_id
      : null;
    await graphQueryWithRetry(`
      INSERT INTO quote_instances
        (content_id, span_start, span_end, speaker_surface, speaker_entity_id,
         attribution_pattern, nesting_depth, extractor_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [extraction.content_id, q.span?.[0], q.span?.[1],
        q.speaker_surface || null, speakerEnt,
        q.attribution_pattern || 'direct', q.nesting_depth || 0, EXTRACTOR_VERSION]);
  }

  // 4. Build grounded text algorithmically from span substitutions — no LLM call needed.
  // Apply referring_expressions resolutions (end→start so earlier offsets stay valid).
  const refExprs = (parsed.referring_expressions || []).filter(
    re => re.span_start != null && re.span_end != null && re.resolved_entity_id != null
  );
  if (refExprs.length > 0) {
    // Fetch canonical names for all resolved entity IDs in one query
    const entityIds = [...new Set(refExprs.map(re => re.resolved_entity_id))];
    const ph = entityIds.map(() => '?').join(',');
    const entityRows = await queryAll(`SELECT id, canonical_name FROM graph_entities WHERE id IN (${ph})`, entityIds);
    const nameMap = new Map(entityRows.map(r => [r.id, r.canonical_name]));

    const originalText = extraction.paragraph_text;
    const subs = refExprs
      .map(re => ({ start: re.span_start, end: re.span_end, name: nameMap.get(re.resolved_entity_id) }))
      .filter(s => s.name)
      .sort((a, b) => b.start - a.start);

    let grounded = originalText;
    for (const { start, end, name } of subs) {
      // Ensure boundary spaces so substitution doesn't concatenate adjacent words
      const before = grounded.slice(0, start);
      const after = grounded.slice(end);
      const needsLeadingSpace  = before.length > 0 && !/\s$/.test(before) && !/^\s/.test(name);
      const needsTrailingSpace = after.length > 0  && !/^\s/.test(after)  && !/\s$/.test(name);
      grounded = before + (needsLeadingSpace ? ' ' : '') + name + (needsTrailingSpace ? ' ' : '') + after;
    }

    // Only store if text actually changed
    if (grounded !== originalText) {
      let embeddingBlob = null;
      try {
        const { embedding } = await createEmbedding(grounded, { caller: 'graph-resolver' });
        if (embedding?.length) {
          embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);
        }
      } catch (err) {
        logger.warn({ contentId: extraction.content_id, err: err.message }, 'Failed to embed grounded text');
      }
      await queryWithRetry(`
        UPDATE content SET
          text_grounded = ?, embedding_grounded = ?, grounded_synced = 0
        WHERE id = ?
      `, [grounded, embeddingBlob, extraction.content_id]);
    }
  }

  await graphQueryWithRetry(`UPDATE paragraph_extractions SET resolved = 1 WHERE id = ?`, [extraction.id]);

  logger.debug({ extractionId: extraction.id, contentId: extraction.content_id }, 'Resolution complete');
}

async function fetchBatch() {
  const peRows = await graphQueryAll(`
    SELECT pe.id, pe.content_id, pe.output_json
    FROM paragraph_extractions pe
    JOIN extraction_validations ev ON ev.extraction_id = pe.id
    WHERE pe.resolved = 0
      AND ev.recommended_action = 'accept'
    ORDER BY pe.id ASC
    LIMIT ?
  `, [BATCH_SIZE]);
  if (peRows.length === 0) return [];
  const contentIds = [...new Set(peRows.map(r => r.content_id))];
  const cph = contentIds.map(() => '?').join(',');
  const textRows = await queryAll(`SELECT id, text FROM content WHERE id IN (${cph})`, contentIds);
  const textMap = new Map(textRows.map(r => [r.id, r.text]));
  return peRows.map(pe => ({ ...pe, paragraph_text: textMap.get(pe.content_id) || '' }));
}

async function workerLoop() {
  logger.info({ graphDb: './data/graph.db' }, 'Graph resolver starting — writing entity_mentions/paragraph_roles/quote_instances to graph.db');

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
        await resolveOne(row);
      } catch (err) {
        logger.error({ extractionId: row.id, err: err.message }, 'Resolution error — skipping row');
      }
    }
    logger.info({ resolved: rows.length }, 'Resolution batch done');
  }

  logger.info('Graph resolver shutting down');
}

const scriptPath = fileURLToPath(import.meta.url);
const isMain = process.argv[1] === scriptPath || process.env.pm_exec_path === scriptPath;
if (isMain) {
  await runMigrations();
  await runGraphMigrations();
  await workerLoop();
}
