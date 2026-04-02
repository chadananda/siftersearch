/**
 * Graph DB — Separate SQLite database for entity graph storage.
 *
 * Tables:
 *   graph_entities  — named entities with type/religion/canonical_name
 *   graph_relations — weighted directed edges between entities
 *
 * Merge rule: ONLY merge when same (canonical_name, entity_type, religion).
 * Different religion or type → always separate entity.
 */

import { createClient } from '@libsql/client';

// ─── Schema ─────────────────────────────────────────────────────────────────

const SCHEMA = `
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toRow(row) {
  if (!row) return null;
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v]));
}

function rowsToObjects(rows) {
  return rows.map(toRow);
}

// ─── Entity Operations ───────────────────────────────────────────────────────

async function upsertEntity(client, { name, entityType, canonicalName, religion = '', language, era, description, sourceDocIds = [] }) {
  const canon = canonicalName || name;
  // Try insert — if conflict, increment mention_count
  await client.execute({
    sql: `INSERT INTO graph_entities (name, canonical_name, entity_type, religion, language, era, description, source_doc_ids)
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
            )`,
    args: [name, canon, entityType, religion, language ?? null, era ?? null, description ?? null, JSON.stringify(sourceDocIds), JSON.stringify(sourceDocIds)]
  });
  const row = await client.execute({
    sql: 'SELECT id FROM graph_entities WHERE canonical_name = ? AND entity_type = ? AND religion = ?',
    args: [canon, entityType, religion]
  });
  return Number(row.rows[0].id);
}

async function getEntity(client, id) {
  const result = await client.execute({ sql: 'SELECT * FROM graph_entities WHERE id = ?', args: [id] });
  return toRow(result.rows[0]) || null;
}

async function getEntitiesByReligion(client, religion) {
  const result = await client.execute({ sql: 'SELECT * FROM graph_entities WHERE religion = ?', args: [religion] });
  return rowsToObjects(result.rows);
}

async function getEntitiesByType(client, entityType, religion) {
  const result = await client.execute({
    sql: 'SELECT * FROM graph_entities WHERE entity_type = ? AND religion = ?',
    args: [entityType, religion]
  });
  return rowsToObjects(result.rows);
}

async function searchEntities(client, query) {
  const result = await client.execute({
    sql: "SELECT * FROM graph_entities WHERE name LIKE ? OR canonical_name LIKE ?",
    args: [`%${query}%`, `%${query}%`]
  });
  return rowsToObjects(result.rows);
}

// ─── Relation Operations ─────────────────────────────────────────────────────

async function insertRelation(client, sourceEntityId, targetEntityId, relationType, sourceDocId, sourceContentId) {
  const result = await client.execute({
    sql: 'INSERT INTO graph_relations (source_entity_id, target_entity_id, relation_type, source_doc_id, source_content_id) VALUES (?, ?, ?, ?, ?)',
    args: [sourceEntityId, targetEntityId, relationType, sourceDocId ?? null, sourceContentId ?? null]
  });
  return Number(result.lastInsertRowid);
}

async function getRelationsForEntity(client, entityId) {
  const result = await client.execute({
    sql: 'SELECT * FROM graph_relations WHERE source_entity_id = ? OR target_entity_id = ?',
    args: [entityId, entityId]
  });
  return rowsToObjects(result.rows);
}

async function getRelationsBetween(client, entityId1, entityId2) {
  const result = await client.execute({
    sql: 'SELECT * FROM graph_relations WHERE (source_entity_id = ? AND target_entity_id = ?) OR (source_entity_id = ? AND target_entity_id = ?)',
    args: [entityId1, entityId2, entityId2, entityId1]
  });
  return rowsToObjects(result.rows);
}

// ─── Graph Queries ───────────────────────────────────────────────────────────

async function getGraphForReligion(client, religion, { limit, entityTypes } = {}) {
  let sql = 'SELECT * FROM graph_entities WHERE religion = ?';
  const args = [religion];
  if (entityTypes && entityTypes.length > 0) {
    sql += ` AND entity_type IN (${entityTypes.map(() => '?').join(',')})`;
    args.push(...entityTypes);
  }
  if (limit) { sql += ' LIMIT ?'; args.push(limit); }
  const entityResult = await client.execute({ sql, args });
  const nodes = rowsToObjects(entityResult.rows);
  const nodeIds = new Set(nodes.map(n => Number(n.id)));
  // Only return edges where BOTH endpoints are in the filtered node set
  let edges = [];
  if (nodes.length > 0) {
    const allRels = await client.execute({
      sql: `SELECT r.* FROM graph_relations r
            JOIN graph_entities s ON s.id = r.source_entity_id AND s.religion = ?
            JOIN graph_entities t ON t.id = r.target_entity_id AND t.religion = ?`,
      args: [religion, religion]
    });
    edges = rowsToObjects(allRels.rows).filter(r => nodeIds.has(Number(r.source_entity_id)) && nodeIds.has(Number(r.target_entity_id)));
  }
  return { nodes, edges };
}

async function getGraphStats(client) {
  const result = await client.execute(`
    SELECT
      e.religion,
      COUNT(DISTINCT e.id) AS entity_count,
      COUNT(DISTINCT r.id) AS relation_count
    FROM graph_entities e
    LEFT JOIN graph_relations r
      ON r.source_entity_id = e.id OR r.target_entity_id = e.id
    GROUP BY e.religion
  `);
  // relation_count must be distinct relations touching this religion's entities
  // The above may double-count if both endpoints are same religion; use a subquery approach
  const stats = [];
  const religionResult = await client.execute('SELECT DISTINCT religion FROM graph_entities');
  for (const rel of religionResult.rows) {
    const religion = rel.religion;
    const entityCount = await client.execute({
      sql: 'SELECT COUNT(*) AS cnt FROM graph_entities WHERE religion = ?',
      args: [religion]
    });
    // Count relations where at least one endpoint belongs to this religion
    // But to avoid double-counting, count DISTINCT relation IDs
    const relCount = await client.execute({
      sql: `SELECT COUNT(DISTINCT r.id) AS cnt
            FROM graph_relations r
            WHERE r.source_entity_id IN (SELECT id FROM graph_entities WHERE religion = ?)
               OR r.target_entity_id IN (SELECT id FROM graph_entities WHERE religion = ?)`,
      args: [religion, religion]
    });
    stats.push({ religion, entity_count: Number(entityCount.rows[0].cnt), relation_count: Number(relCount.rows[0].cnt) });
  }
  return stats;
}

async function getEntityWithRelations(client, entityId) {
  const entity = await getEntity(client, entityId);
  if (!entity) return null;
  const relations = await getRelationsForEntity(client, entityId);
  // Collect connected entity IDs
  const connectedIds = new Set();
  for (const r of relations) {
    const otherId = Number(r.source_entity_id) === entityId ? Number(r.target_entity_id) : Number(r.source_entity_id);
    connectedIds.add(otherId);
  }
  const connectedEntities = await Promise.all([...connectedIds].map(id => getEntity(client, id)));
  return { entity, relations, connectedEntities: connectedEntities.filter(Boolean) };
}

// ─── Init / Close ────────────────────────────────────────────────────────────

export async function initGraphDb(dbPath) {
  const url = dbPath.startsWith('file:') ? dbPath : `file:${dbPath}`;
  const client = createClient({ url });
  await client.executeMultiple(SCHEMA);
  // Return a db handle with all operations bound
  const db = {
    // Expose raw query for tests
    query: (sql, args = []) => client.execute({ sql, args }),
    close: () => Promise.resolve(client.close()),
    upsertEntity: (opts) => upsertEntity(client, opts),
    getEntity: (id) => getEntity(client, id),
    getEntitiesByReligion: (religion) => getEntitiesByReligion(client, religion),
    getEntitiesByType: (entityType, religion) => getEntitiesByType(client, entityType, religion),
    searchEntities: (query) => searchEntities(client, query),
    insertRelation: (src, tgt, type, docId, contentId) => insertRelation(client, src, tgt, type, docId, contentId),
    getRelationsForEntity: (entityId) => getRelationsForEntity(client, entityId),
    getRelationsBetween: (id1, id2) => getRelationsBetween(client, id1, id2),
    getGraphForReligion: (religion, opts) => getGraphForReligion(client, religion, opts),
    getGraphStats: () => getGraphStats(client),
    getEntityWithRelations: (entityId) => getEntityWithRelations(client, entityId)
  };
  return db;
}

export async function closeGraphDb(db) {
  return db.close();
}
