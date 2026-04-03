/**
 * Pipeline Version Manager
 * Manages pipeline_versions and layer_sync_state tables.
 */

import { query, queryOne, queryAll } from './db.js';

// Insert or update a pipeline version row, return the version object
export async function registerVersion(pipeline, version, { promptHash, modelId, config } = {}) {
  const configJson = config ? JSON.stringify(config) : null;
  try {
    const result = await query(
      `INSERT INTO pipeline_versions (pipeline, version, prompt_hash, model_id, config) VALUES (?, ?, ?, ?, ?)`,
      [pipeline, version, promptHash ?? null, modelId ?? null, configJson]
    );
    return queryOne(`SELECT * FROM pipeline_versions WHERE id=?`, [Number(result.lastInsertRowid)]);
  } catch (err) {
    // UNIQUE constraint violation — update and return updated row
    if (err.message?.includes('UNIQUE') || err.message?.includes('unique')) {
      await query(
        `UPDATE pipeline_versions SET prompt_hash=?, model_id=?, config=? WHERE pipeline=? AND version=?`,
        [promptHash ?? null, modelId ?? null, configJson, pipeline, version]
      );
      return queryOne(`SELECT * FROM pipeline_versions WHERE pipeline=? AND version=?`, [pipeline, version]);
    }
    throw err;
  }
}

// Return the version row with active=1 for a pipeline, or null
export async function getActiveVersion(pipeline) {
  return queryOne(`SELECT * FROM pipeline_versions WHERE pipeline=? AND active=1 LIMIT 1`, [pipeline]);
}

// Set active=0 for a specific pipeline+version
export async function deactivateVersion(pipeline, version) {
  await query(`UPDATE pipeline_versions SET active=0 WHERE pipeline=? AND version=?`, [pipeline, version]);
}

// Mark all layers dirty for a content_id
export async function invalidateForTextChange(contentId) {
  await query(`UPDATE layer_sync_state SET dirty=1, updated_at=datetime('now') WHERE content_id=?`, [contentId]);
}

// Mark object + enrichment layers dirty for all content_ids belonging to a doc
export async function invalidateForMetadataChange(docId) {
  await query(
    `UPDATE layer_sync_state SET dirty=1, updated_at=datetime('now') WHERE doc_id=? AND layer IN ('object', 'enrichment')`,
    [docId]
  );
}

// Mark object + enrichment dirty for ALL content (version change affects everything)
export async function invalidateForObjectVersionChange(version) {
  await query(
    `UPDATE layer_sync_state SET dirty=1, updated_at=datetime('now') WHERE layer IN ('object', 'enrichment')`,
    []
  );
}

// Mark enrichment and context layers dirty for all content
export async function invalidateForContextPromptChange() {
  await query(
    `UPDATE layer_sync_state SET dirty=1, updated_at=datetime('now') WHERE layer IN ('enrichment', 'context')`,
    []
  );
}

// Mark enrichment and hype layers dirty for all content
export async function invalidateForHypePromptChange() {
  await query(
    `UPDATE layer_sync_state SET dirty=1, updated_at=datetime('now') WHERE layer IN ('enrichment', 'hype')`,
    []
  );
}
