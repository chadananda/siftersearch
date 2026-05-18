#!/usr/bin/env node
// One-off: approve + resolve all God Passes By extractions, then sync entity_mentions to Meili.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryAll, queryOne } from '../../api/lib/db.js';
import { logger } from '../../api/lib/logger.js';
import { findEntity, addAlias, normalizeSurface } from '../../api/lib/graph-db.js';
import { getMeili, INDEXES } from '../../api/lib/search.js';
import { getAuthority } from '../../api/lib/authority.js';
import { createEmbedding } from '../../api/lib/ai.js';

const BOOK_TITLE = 'God Passes By';

// ── Step 1: Auto-approve all unresolved GPB extractions ───────────────────────
async function autoApprove() {
  const rows = await queryAll(`
    SELECT pe.id
    FROM paragraph_extractions pe
    JOIN content c ON c.id = pe.content_id
    JOIN docs d ON d.id = c.doc_id
    LEFT JOIN extraction_validations ev ON ev.extraction_id = pe.id
    WHERE d.title = ? AND pe.resolved = 0 AND ev.id IS NULL
  `, [BOOK_TITLE]);

  console.log(`Approving ${rows.length} extractions…`);
  let approved = 0;
  for (const row of rows) {
    await query(`
      INSERT OR IGNORE INTO extraction_validations
        (extraction_id, validator_model, errors_json, confidence, recommended_action)
      VALUES (?, 'auto-approve-v1', NULL, 1.0, 'accept')
    `, [row.id]);
    approved++;
  }
  console.log(`✓ Approved ${approved}`);
  return approved;
}

// ── Step 2: Resolve extractions → entity_mentions, paragraph_roles, quote_instances ──
async function resolveMention(mention, religion) {
  if (mention.proposed_entity_id != null) {
    const exists = await queryOne(`SELECT id FROM graph_entities WHERE id = ?`, [mention.proposed_entity_id]);
    if (exists) return mention.proposed_entity_id;
  }
  const found = await findEntity({ surface: mention.surface, type: mention.type, religion });
  if (found?.entity_id) return found.entity_id;

  const surfaceNorm = normalizeSurface(mention.surface);
  await query(`
    INSERT OR IGNORE INTO promotion_queue (surface_norm, type, context_snippet, resolved, attempts, priority)
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
    console.warn(`  Unparseable JSON for extraction ${extraction.id}`);
    return;
  }

  const doc = await queryOne(`SELECT religion FROM docs WHERE id = (SELECT doc_id FROM content WHERE id = ?)`, [extraction.content_id]);
  const religion = doc?.religion;

  for (const mention of parsed.mentions || []) {
    const entityId = await resolveMention(mention, religion);
    if (!entityId) continue;
    await query(`
      INSERT OR IGNORE INTO entity_mentions
        (entity_id, content_id, role, resolution_confidence, status, extractor_version)
      VALUES (?, ?, ?, ?, 'resolved', 'extract-v1')
    `, [entityId, extraction.content_id, mention.local_role, 0.9]);
    if (mention.surface) {
      await addAlias(entityId, { surface: mention.surface, surfaceNorm: normalizeSurface(mention.surface), lang: 'en', source: 'extract-v1', confidence: 0.7 });
    }
  }

  const roles = parsed.roles || {};
  const speakerEntity  = roles.speaker       ? (await findEntity({ surface: roles.speaker }))?.entity_id  : null;
  const narratorEntity = roles.narrator      ? (await findEntity({ surface: roles.narrator }))?.entity_id : null;
  const addresseeEnt   = roles.addressee     ? (await findEntity({ surface: roles.addressee }))?.entity_id : null;
  const placeEntity    = roles.setting_place ? (await findEntity({ surface: roles.setting_place, type: 'place' }))?.entity_id : null;

  await query(`
    INSERT OR REPLACE INTO paragraph_roles
      (content_id, speaker_entity_id, narrator_entity_id, addressee_entity_id,
       setting_place_entity_id, setting_time, extractor_version)
    VALUES (?, ?, ?, ?, ?, ?, 'extract-v1')
  `, [extraction.content_id, speakerEntity, narratorEntity, addresseeEnt, placeEntity, roles.setting_time || null]);

  for (const q of parsed.quotations || []) {
    const speakerEnt = q.speaker_candidate ? (await findEntity({ surface: q.speaker_candidate }))?.entity_id : null;
    await query(`
      INSERT INTO quote_instances
        (content_id, span_start, span_end, speaker_surface, speaker_entity_id,
         attribution_pattern, nesting_depth, extractor_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'extract-v1')
    `, [extraction.content_id, q.span?.[0], q.span?.[1],
        q.speaker_surface || null, speakerEnt,
        q.attribution_pattern || 'direct', q.nesting_depth || 0]);
  }

  if (parsed.prose_summary) {
    let embeddingBlob = null;
    try {
      const { embedding } = await createEmbedding(parsed.prose_summary, { caller: 'resolve-gpb' });
      if (embedding?.length) embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);
    } catch { /* non-fatal */ }
    await query(`
      UPDATE content SET text_grounded = ?, grounding_confidence = ?,
        embedding_grounded = ?, grounded_synced = 0
      WHERE id = ?
    `, [parsed.prose_summary, 0.9, embeddingBlob, extraction.content_id]);
  }

  await query(`UPDATE paragraph_extractions SET resolved = 1 WHERE id = ?`, [extraction.id]);
}

async function resolveAll() {
  const rows = await queryAll(`
    SELECT pe.id, pe.content_id, pe.output_json
    FROM paragraph_extractions pe
    JOIN extraction_validations ev ON ev.extraction_id = pe.id
    JOIN content c ON c.id = pe.content_id
    JOIN docs d ON d.id = c.doc_id
    WHERE pe.resolved = 0 AND ev.recommended_action = 'accept' AND d.title = ?
    ORDER BY pe.id
  `, [BOOK_TITLE]);

  console.log(`Resolving ${rows.length} extractions…`);
  let done = 0, errors = 0;
  for (const row of rows) {
    try {
      await resolveOne(row);
      done++;
      if (done % 50 === 0) console.log(`  ${done}/${rows.length}…`);
    } catch (err) {
      console.error(`  Error on extraction ${row.id}: ${err.message}`);
      errors++;
    }
  }
  console.log(`✓ Resolved ${done}, errors: ${errors}`);
}

// ── Step 3: Sync entity_mentions → Meili entity_mentions_idx ──────────────────
async function syncToMeili() {
  const meili = getMeili();
  if (!meili) { console.warn('Meili unavailable — skipping sync'); return; }

  // Ensure index exists with correct settings
  try {
    await meili.createIndex(INDEXES.ENTITY_MENTIONS, { primaryKey: 'id' });
  } catch { /* already exists */ }
  await meili.index(INDEXES.ENTITY_MENTIONS).updateSettings({
    searchableAttributes: ['entity_canonical_name'],
    filterableAttributes: ['entity_id', 'paragraph_id', 'religion', 'authority', 'role', 'doc_id', 'encumbered'],
    sortableAttributes: ['authority'],
  });

  const rows = await queryAll(`
    SELECT em.id AS mention_id, em.entity_id, em.content_id AS paragraph_id, em.role,
           ge.canonical_name AS entity_canonical_name, ge.entity_type,
           c.doc_id, d.religion, d.collection, d.encumbered, d.title, d.author,
           c.para_meta
    FROM entity_mentions em
    JOIN graph_entities ge ON ge.id = em.entity_id
    JOIN content c ON c.id = em.content_id
    JOIN docs d ON d.id = c.doc_id
    WHERE d.title = ?
  `, [BOOK_TITLE]);

  if (rows.length === 0) { console.log('No entity mentions to sync'); return; }

  const docs = rows.map(row => {
    let paraMeta = null;
    try { paraMeta = JSON.parse(row.para_meta); } catch { /* ignore */ }
    const effectiveAuthor = paraMeta?.author || row.author;
    let authority = 0;
    try { authority = getAuthority({ author: effectiveAuthor, title: row.title }); } catch { authority = 0; }
    return {
      id: row.mention_id,
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

  console.log(`Syncing ${docs.length} entity mentions to Meili…`);
  const task = await meili.index(INDEXES.ENTITY_MENTIONS).addDocuments(docs, { primaryKey: 'id' });
  console.log(`✓ Meili task ${task.taskUid} queued`);
}

// ── Main ───────────────────────────────────────────────────────────────────────
const t0 = Date.now();
console.log(`\n=== Resolve GPB entity pipeline ===\n`);

await autoApprove();
await resolveAll();

const emCount = await queryOne(`SELECT COUNT(*) as n FROM entity_mentions`);
const rolesCount = await queryOne(`SELECT COUNT(*) as n FROM paragraph_roles`);
const quotesCount = await queryOne(`SELECT COUNT(*) as n FROM quote_instances`);
console.log(`\nDB state: entity_mentions=${emCount.n}, paragraph_roles=${rolesCount.n}, quote_instances=${quotesCount.n}`);

await syncToMeili();

console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(0);
