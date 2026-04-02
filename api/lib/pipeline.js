/**
 * Pipeline Version Manager
 * Manages pipeline_versions and layer_sync_state tables.
 * All functions accept db as first argument (injected by caller).
 */

// Insert or update a pipeline version row, return the version object
export async function registerVersion(db, pipeline, version, { promptHash, modelId, config } = {}) {
  const configJson = config ? JSON.stringify(config) : null;
  // Try insert first; on conflict update and return
  let result;
  try {
    result = await db.execute({
      sql: `INSERT INTO pipeline_versions (pipeline, version, prompt_hash, model_id, config)
            VALUES (?, ?, ?, ?, ?)`,
      args: [pipeline, version, promptHash ?? null, modelId ?? null, configJson]
    });
  } catch (err) {
    // UNIQUE constraint violation — update and return updated row
    if (err.message?.includes('UNIQUE') || err.message?.includes('unique')) {
      await db.execute({
        sql: `UPDATE pipeline_versions SET prompt_hash=?, model_id=?, config=? WHERE pipeline=? AND version=?`,
        args: [promptHash ?? null, modelId ?? null, configJson, pipeline, version]
      });
      const updated = await db.execute({
        sql: `SELECT * FROM pipeline_versions WHERE pipeline=? AND version=?`,
        args: [pipeline, version]
      });
      return rowToObj(updated.rows[0]);
    }
    throw err;
  }
  const row = await db.execute({
    sql: `SELECT * FROM pipeline_versions WHERE id=?`,
    args: [Number(result.lastInsertRowid)]
  });
  return rowToObj(row.rows[0]);
}

// Return the version row with active=1 for a pipeline, or null
export async function getActiveVersion(db, pipeline) {
  const result = await db.execute({
    sql: `SELECT * FROM pipeline_versions WHERE pipeline=? AND active=1 LIMIT 1`,
    args: [pipeline]
  });
  return result.rows.length ? rowToObj(result.rows[0]) : null;
}

// Set active=0 for a specific pipeline+version
export async function deactivateVersion(db, pipeline, version) {
  await db.execute({
    sql: `UPDATE pipeline_versions SET active=0 WHERE pipeline=? AND version=?`,
    args: [pipeline, version]
  });
}

// Mark all layers dirty for a content_id
export async function invalidateForTextChange(db, contentId) {
  await db.execute({
    sql: `UPDATE layer_sync_state SET dirty=1, updated_at=datetime('now') WHERE content_id=?`,
    args: [contentId]
  });
}

// Mark object + enrichment layers dirty for all content_ids belonging to a doc
export async function invalidateForMetadataChange(db, docId) {
  await db.execute({
    sql: `UPDATE layer_sync_state SET dirty=1, updated_at=datetime('now')
          WHERE doc_id=? AND layer IN ('object', 'enrichment')`,
    args: [docId]
  });
}

// Mark object + enrichment dirty for ALL content (version change affects everything)
export async function invalidateForObjectVersionChange(db, version) {
  await db.execute({
    sql: `UPDATE layer_sync_state SET dirty=1, updated_at=datetime('now')
          WHERE layer IN ('object', 'enrichment')`,
    args: []
  });
}

// Mark enrichment and context layers dirty for all content
export async function invalidateForContextPromptChange(db) {
  await db.execute({
    sql: `UPDATE layer_sync_state SET dirty=1, updated_at=datetime('now')
          WHERE layer IN ('enrichment', 'context')`,
    args: []
  });
}

// Mark enrichment and hype layers dirty for all content
export async function invalidateForHypePromptChange(db) {
  await db.execute({
    sql: `UPDATE layer_sync_state SET dirty=1, updated_at=datetime('now')
          WHERE layer IN ('enrichment', 'hype')`,
    args: []
  });
}

// Convert a raw row (array or object) to a plain object
function rowToObj(row) {
  if (!row) return null;
  if (typeof row === 'object' && !Array.isArray(row)) return { ...row };
  return row;
}
