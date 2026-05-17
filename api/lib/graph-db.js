/**
 * Graph DB — entity graph access layer.
 *
 * Two tiers:
 *   1. Top-level exports (findEntity, resolveAlias, addAlias, mergeEntities, etc.)
 *      operate against the main sifter.db via api/lib/db.js query helpers.
 *      Tables are created by migration 72.
 *   2. initGraphDb (legacy) — opens a separate SQLite file for the older
 *      standalone graph. Left for backward compatibility; callers should migrate
 *      to the main-DB functions above.
 *
 * Merge rule: ONLY merge when same (canonical_name, entity_type, religion).
 * Different religion or type → always separate entity.
 */

import Database from 'better-sqlite3';
import { instrumentDb, query as mainQuery, queryOne as mainQueryOne, queryAll as mainQueryAll } from './db.js';

function upsertEntity(db, { name, entityType, canonicalName, religion = '', language, era, description, sourceDocIds = [] }) {
  const canon = canonicalName || name;
  const sourceJson = JSON.stringify(sourceDocIds);
  db.prepare(`
    INSERT INTO graph_entities (name, canonical_name, entity_type, religion, language, era, description, source_doc_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(canonical_name, entity_type, religion) DO UPDATE SET
      mention_count = mention_count + 1,
      source_doc_ids = (
        SELECT json_group_array(DISTINCT val)
        FROM (
          SELECT json_each.value AS val FROM json_each(graph_entities.source_doc_ids)
          UNION
          SELECT json_each.value AS val FROM json_each(?)
        )
      )
  `).run(name, canon, entityType, religion, language ?? null, era ?? null, description ?? null, sourceJson, sourceJson);
  const row = db.prepare('SELECT id FROM graph_entities WHERE canonical_name = ? AND entity_type = ? AND religion = ?').get(canon, entityType, religion);
  return Number(row.id);
}

function getEntity(db, id) {
  return db.prepare('SELECT * FROM graph_entities WHERE id = ?').get(id) || null;
}

function getEntitiesByReligion(db, religion) {
  return db.prepare('SELECT * FROM graph_entities WHERE religion = ?').all(religion);
}

function getEntitiesByType(db, entityType, religion) {
  return db.prepare('SELECT * FROM graph_entities WHERE entity_type = ? AND religion = ?').all(entityType, religion);
}

function searchEntities(db, q) {
  return db.prepare("SELECT * FROM graph_entities WHERE name LIKE ? OR canonical_name LIKE ?").all(`%${q}%`, `%${q}%`);
}

function insertRelation(db, sourceEntityId, targetEntityId, relationType, sourceDocId, sourceContentId) {
  const info = db.prepare('INSERT INTO graph_relations (source_entity_id, target_entity_id, relation_type, source_doc_id, source_content_id) VALUES (?, ?, ?, ?, ?)').run(sourceEntityId, targetEntityId, relationType, sourceDocId ?? null, sourceContentId ?? null);
  return Number(info.lastInsertRowid);
}

function getRelationsForEntity(db, entityId) {
  return db.prepare('SELECT * FROM graph_relations WHERE source_entity_id = ? OR target_entity_id = ?').all(entityId, entityId);
}

function getRelationsBetween(db, entityId1, entityId2) {
  return db.prepare('SELECT * FROM graph_relations WHERE (source_entity_id = ? AND target_entity_id = ?) OR (source_entity_id = ? AND target_entity_id = ?)').all(entityId1, entityId2, entityId2, entityId1);
}

function getGraphForReligion(db, religion, { limit, entityTypes } = {}) {
  let sql = 'SELECT * FROM graph_entities WHERE religion = ?';
  const args = [religion];
  if (entityTypes && entityTypes.length > 0) {
    sql += ` AND entity_type IN (${entityTypes.map(() => '?').join(',')})`;
    args.push(...entityTypes);
  }
  if (limit) { sql += ' LIMIT ?'; args.push(limit); }
  const nodes = db.prepare(sql).all(...args);
  const nodeIds = new Set(nodes.map(n => Number(n.id)));
  let edges = [];
  if (nodes.length > 0) {
    const allRels = db.prepare(`
      SELECT r.* FROM graph_relations r
      JOIN graph_entities s ON s.id = r.source_entity_id AND s.religion = ?
      JOIN graph_entities t ON t.id = r.target_entity_id AND t.religion = ?
    `).all(religion, religion);
    edges = allRels.filter(r => nodeIds.has(Number(r.source_entity_id)) && nodeIds.has(Number(r.target_entity_id)));
  }
  return { nodes, edges };
}

function getGraphStats(db) {
  const religionRows = db.prepare('SELECT DISTINCT religion FROM graph_entities').all();
  return religionRows.map(rel => {
    const { religion } = rel;
    const { cnt: entity_count } = db.prepare('SELECT COUNT(*) AS cnt FROM graph_entities WHERE religion = ?').get(religion);
    const { cnt: relation_count } = db.prepare(`
      SELECT COUNT(DISTINCT r.id) AS cnt
      FROM graph_relations r
      WHERE r.source_entity_id IN (SELECT id FROM graph_entities WHERE religion = ?)
         OR r.target_entity_id IN (SELECT id FROM graph_entities WHERE religion = ?)
    `).get(religion, religion);
    return { religion, entity_count: Number(entity_count), relation_count: Number(relation_count) };
  });
}

function getEntityWithRelations(db, entityId) {
  const entity = getEntity(db, entityId);
  if (!entity) return null;
  const relations = getRelationsForEntity(db, entityId);
  const connectedIds = new Set();
  for (const r of relations) {
    const otherId = Number(r.source_entity_id) === entityId ? Number(r.target_entity_id) : Number(r.source_entity_id);
    connectedIds.add(otherId);
  }
  const connectedEntities = [...connectedIds].map(id => getEntity(db, id)).filter(Boolean);
  return { entity, relations, connectedEntities };
}

// ---------------------------------------------------------------------------
// Main-DB entity layer (migration 72 tables in sifter.db)
// ---------------------------------------------------------------------------

/** Normalize a surface form for fuzzy matching: NFD + strip combining marks + lowercase. */
export function normalizeSurface(text) {
  if (!text) return '';
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/**
 * Find the best matching entity for a surface string.
 * Returns { entity_id, confidence, method } or null.
 */
export async function findEntity({ surface, type, religion, lang } = {}) {
  if (!surface) return null;
  const norm = normalizeSurface(surface);

  // 1. Exact alias match
  let sql = `SELECT entity_id, confidence FROM entity_aliases WHERE surface_norm = ?`;
  const args = [norm];
  if (lang) { sql += ` AND lang = ?`; args.push(lang); }
  sql += ` ORDER BY confidence DESC LIMIT 1`;
  const aliasRow = await mainQueryOne(sql, args);
  if (aliasRow) return { entity_id: aliasRow.entity_id, confidence: aliasRow.confidence, method: 'alias' };

  // 2. Exact canonical name match on graph_entities
  let entSql = `SELECT id FROM graph_entities WHERE lower(canonical_name) = ?`;
  const entArgs = [surface.toLowerCase()];
  if (type) { entSql += ` AND entity_type = ?`; entArgs.push(type); }
  if (religion) { entSql += ` AND religion = ?`; entArgs.push(religion); }
  entSql += ` LIMIT 1`;
  const entRow = await mainQueryOne(entSql, entArgs);
  if (entRow) return { entity_id: entRow.id, confidence: 0.9, method: 'canonical' };

  return null;
}

/** Resolve an alias surface_norm to an entity_id, or null. */
export async function resolveAlias(surfaceNorm, lang) {
  let sql = `SELECT entity_id FROM entity_aliases WHERE surface_norm = ?`;
  const args = [surfaceNorm];
  if (lang) { sql += ` AND lang = ?`; args.push(lang); }
  sql += ` ORDER BY confidence DESC LIMIT 1`;
  const row = await mainQueryOne(sql, args);
  return row?.entity_id ?? null;
}

/** Create a new entity with optional aliases. Returns entity_id. */
export async function createEntity({ canonicalName, type, religion = '', aliases = [] }) {
  await mainQuery(
    `INSERT OR IGNORE INTO graph_entities (canonical_name, name, entity_type, religion) VALUES (?,?,?,?)`,
    [canonicalName, canonicalName, type, religion]
  );
  const row = await mainQueryOne(
    `SELECT id FROM graph_entities WHERE canonical_name = ? AND entity_type = ? AND religion = ?`,
    [canonicalName, type, religion]
  );
  const entityId = row.id;
  for (const alias of aliases) {
    await addAlias(entityId, alias);
  }
  return entityId;
}

/** Add an alias for an entity. */
export async function addAlias(entityId, { surface, surfaceNorm, lang = 'en', source, confidence = 1.0 }) {
  const norm = surfaceNorm ?? normalizeSurface(surface);
  await mainQuery(
    `INSERT OR IGNORE INTO entity_aliases (entity_id, surface, surface_norm, lang, source, confidence) VALUES (?,?,?,?,?,?)`,
    [entityId, surface, norm, lang, source ?? null, confidence]
  );
}

/**
 * Merge multiple entities into a keeper entity.
 * Reassigns aliases and mentions; writes audit row. Returns audit_id.
 */
export async function mergeEntities(keeperId, mergedIds, { reason, evidence } = {}) {
  for (const id of mergedIds) {
    await mainQuery(`UPDATE entity_aliases SET entity_id = ? WHERE entity_id = ?`, [keeperId, id]);
    await mainQuery(`UPDATE entity_mentions SET entity_id = ? WHERE entity_id = ?`, [keeperId, id]);
    await mainQuery(`UPDATE graph_relations SET source_entity_id = ? WHERE source_entity_id = ?`, [keeperId, id]);
    await mainQuery(`UPDATE graph_relations SET target_entity_id = ? WHERE target_entity_id = ?`, [keeperId, id]);
    await mainQuery(`UPDATE graph_entities SET mention_count = mention_count + (SELECT COALESCE(mention_count,0) FROM graph_entities WHERE id = ?) WHERE id = ?`, [id, keeperId]);
    await mainQuery(`DELETE FROM graph_entities WHERE id = ?`, [id]);
  }
  const result = await mainQuery(
    `INSERT INTO er_audit_log (action, candidate, model_votes, evidence_paragraphs) VALUES ('merge', ?, ?, ?)`,
    [JSON.stringify({ keeperId, mergedIds }), reason ?? null, evidence ?? null]
  );
  return result?.lastInsertRowid;
}

/**
 * Split an entity into multiple new entities.
 * Each split: { aliases: [], mentions: [] }. Returns array of new entity IDs.
 */
export async function splitEntity(entityId, splits, { reason, evidence } = {}) {
  const original = await mainQueryOne(`SELECT * FROM graph_entities WHERE id = ?`, [entityId]);
  if (!original) throw new Error(`Entity ${entityId} not found`);
  const newIds = [];
  for (const split of splits) {
    const newId = await createEntity({ canonicalName: split.canonicalName ?? original.canonical_name, type: original.entity_type, religion: original.religion, aliases: split.aliases ?? [] });
    if (split.mentions?.length) {
      const placeholders = split.mentions.map(() => '?').join(',');
      await mainQuery(`UPDATE entity_mentions SET entity_id = ? WHERE id IN (${placeholders})`, [newId, ...split.mentions]);
    }
    newIds.push(newId);
  }
  await mainQuery(`DELETE FROM graph_entities WHERE id = ?`, [entityId]);
  await mainQuery(
    `INSERT INTO er_audit_log (action, candidate, model_votes, evidence_paragraphs) VALUES ('split', ?, ?, ?)`,
    [JSON.stringify({ originalId: entityId, newIds }), reason ?? null, evidence ?? null]
  );
  return newIds;
}

/** Get all mentions for an entity. */
export async function getMentions(entityId, { limit = 100 } = {}) {
  return mainQueryAll(
    `SELECT em.*, c.text, d.title FROM entity_mentions em
     JOIN content c ON c.id = em.content_id
     JOIN docs d ON d.id = c.doc_id
     WHERE em.entity_id = ? AND c.deleted_at IS NULL
     ORDER BY em.created_at DESC LIMIT ?`,
    [entityId, limit]
  );
}

/** Get relations for an entity (in, out, or both). */
export async function getRelations(entityId, direction = 'both') {
  if (direction === 'out') return mainQueryAll(`SELECT * FROM graph_relations WHERE source_entity_id = ?`, [entityId]);
  if (direction === 'in') return mainQueryAll(`SELECT * FROM graph_relations WHERE target_entity_id = ?`, [entityId]);
  return mainQueryAll(`SELECT * FROM graph_relations WHERE source_entity_id = ? OR target_entity_id = ?`, [entityId, entityId]);
}

/** Record an extraction run. Returns the inserted id. */
export async function recordExtraction({ contentId, model, promptVersion, outputJson, inputTokens, outputTokens, cachedTokens, costUsd, extractorVersion }) {
  const result = await mainQuery(
    `INSERT INTO paragraph_extractions (content_id, model, prompt_version, output_json, input_tokens, output_tokens, cached_tokens, cost_usd, extractor_version) VALUES (?,?,?,?,?,?,?,?,?)`,
    [contentId, model, promptVersion, outputJson ? JSON.stringify(outputJson) : null, inputTokens ?? 0, outputTokens ?? 0, cachedTokens ?? 0, costUsd ?? 0, extractorVersion ?? 'v1']
  );
  return result?.lastInsertRowid;
}

// ---------------------------------------------------------------------------
// Legacy: separate graph SQLite file (backward-compatible; prefer main-DB above)
// ---------------------------------------------------------------------------

// Schema used by initGraphDb to bootstrap a standalone graph SQLite file.
// The main sifter.db tables are created by migration 72 instead.
const LEGACY_SCHEMA = `
  CREATE TABLE IF NOT EXISTS graph_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    religion TEXT NOT NULL DEFAULT '',
    language TEXT,
    era TEXT,
    description TEXT,
    mention_count INTEGER DEFAULT 1,
    source_doc_ids TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(canonical_name, entity_type, religion)
  );
  CREATE TABLE IF NOT EXISTS graph_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_entity_id INTEGER NOT NULL,
    target_entity_id INTEGER NOT NULL,
    relation_type TEXT NOT NULL,
    source_doc_id INTEGER,
    source_content_id INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (source_entity_id) REFERENCES graph_entities(id),
    FOREIGN KEY (target_entity_id) REFERENCES graph_entities(id)
  );
`;

export async function initGraphDb(dbPath) {
  const path = dbPath.startsWith('file:') ? dbPath.slice(5) : dbPath;
  const client = instrumentDb(new Database(path), 'graph');
  client.pragma('journal_mode = WAL');
  client.pragma('busy_timeout = 30000');
  client.exec(LEGACY_SCHEMA);
  const handle = {
    query: (sql, args = []) => Promise.resolve({ rows: client.prepare(sql).all(...args), lastInsertRowid: null }),
    close: () => Promise.resolve(client.close()),
    upsertEntity: (opts) => Promise.resolve(upsertEntity(client, opts)),
    getEntity: (id) => Promise.resolve(getEntity(client, id)),
    getEntitiesByReligion: (religion) => Promise.resolve(getEntitiesByReligion(client, religion)),
    getEntitiesByType: (entityType, religion) => Promise.resolve(getEntitiesByType(client, entityType, religion)),
    searchEntities: (q) => Promise.resolve(searchEntities(client, q)),
    insertRelation: (src, tgt, type, docId, contentId) => Promise.resolve(insertRelation(client, src, tgt, type, docId, contentId)),
    getRelationsForEntity: (entityId) => Promise.resolve(getRelationsForEntity(client, entityId)),
    getRelationsBetween: (id1, id2) => Promise.resolve(getRelationsBetween(client, id1, id2)),
    getGraphForReligion: (religion, opts) => Promise.resolve(getGraphForReligion(client, religion, opts)),
    getGraphStats: () => Promise.resolve(getGraphStats(client)),
    getEntityWithRelations: (entityId) => Promise.resolve(getEntityWithRelations(client, entityId))
  };
  return handle;
}

export async function closeGraphDb(db) {
  return db.close();
}
