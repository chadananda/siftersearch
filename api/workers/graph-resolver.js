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

import { query, queryAll, queryOne } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { runMigrations } from '../lib/migrations.js';
import { findEntity, createEntity, addAlias, normalizeSurface } from '../lib/graph-db.js';

const BATCH_SIZE = 50;
const IDLE_SLEEP_MS = 10_000;
const EXTRACTOR_VERSION = 'extract-v1';

let isShuttingDown = false;
process.on('SIGTERM', () => { isShuttingDown = true; });
process.on('SIGINT',  () => { isShuttingDown = true; });

const delay = ms => new Promise(r => setTimeout(r, ms));

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

  // Don't auto-create — send unresolved to promotion_queue
  const surfaceNorm = normalizeSurface(mention.surface);
  await query(`
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

    await query(`
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

  await query(`
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
    await query(`
      INSERT INTO quote_instances
        (content_id, span_start, span_end, speaker_surface, speaker_entity_id,
         attribution_pattern, nesting_depth, extractor_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [extraction.content_id, q.span?.[0], q.span?.[1],
        q.speaker_surface || null, speakerEnt,
        q.attribution_pattern || 'direct', q.nesting_depth || 0, EXTRACTOR_VERSION]);
  }

  // 4. Store grounded text on content row
  if (parsed.text_grounded) {
    await query(`
      UPDATE content SET
        text_grounded = ?, grounding_confidence = ?, grounding_notes = ?,
        grounded_synced = 0
      WHERE id = ?
    `, [parsed.text_grounded, parsed.grounding_confidence, parsed.grounding_notes, extraction.content_id]);
  }

  // 5. Mark extraction resolved
  await query(`UPDATE paragraph_extractions SET resolved = 1 WHERE id = ?`, [extraction.id]);

  logger.debug({ extractionId: extraction.id, contentId: extraction.content_id }, 'Resolution complete');
}

async function fetchBatch() {
  // Accepted extractions not yet resolved
  return queryAll(`
    SELECT pe.id, pe.content_id, pe.output_json
    FROM paragraph_extractions pe
    JOIN extraction_validations ev ON ev.extraction_id = pe.id
    WHERE pe.resolved = 0
      AND ev.recommended_action = 'accept'
    ORDER BY pe.id ASC
    LIMIT ?
  `, [BATCH_SIZE]);
}

async function workerLoop() {
  logger.info('Graph resolver starting');

  while (!isShuttingDown) {
    const rows = await fetchBatch();
    if (rows.length === 0) {
      await delay(IDLE_SLEEP_MS);
      continue;
    }

    for (const row of rows) {
      if (isShuttingDown) break;
      try {
        await resolveOne(row);
      } catch (err) {
        logger.error({ extractionId: row.id, err: err.message }, 'Resolution error');
      }
    }
    logger.info({ resolved: rows.length }, 'Resolution batch done');
  }

  logger.info('Graph resolver shutting down');
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  await runMigrations();
  await workerLoop();
}
