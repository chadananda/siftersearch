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

import Database from 'better-sqlite3';

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

export async function initGraphDb(dbPath) {
  const path = dbPath.startsWith('file:') ? dbPath.slice(5) : dbPath;
  const client = new Database(path);
  client.pragma('journal_mode = WAL');
  client.pragma('busy_timeout = 30000');
  client.exec(SCHEMA);
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
