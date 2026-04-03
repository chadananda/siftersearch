/**
 * Graph API — pure route handler functions
 *
 * Each function accepts an optional db handle for test injection.
 * When db is omitted, uses module-level queryAll/queryOne from db.js.
 */

import { queryAll as _queryAll, queryOne as _queryOne } from '../lib/db.js';

// ─── DB helpers (support injected db for tests or module-level for production) ──

function qa(db, sql, params = []) {
  if (db?.queryAll) return db.queryAll(sql, params);
  return _queryAll(sql, params);
}
function qo(db, sql, params = []) {
  if (db?.queryOne) return db.queryOne(sql, params);
  return _queryOne(sql, params);
}

// ─── getGraphStats ────────────────────────────────────────────────────────────

export async function getGraphStats(db) {
  const entityRows = await qa(db, `
    SELECT religion, COUNT(*) AS entityCount
    FROM graph_entities
    GROUP BY religion
  `);
  const relationRows = await qa(db, `
    SELECT ge.religion, COUNT(*) AS relationCount
    FROM graph_relations gr
    JOIN graph_entities ge ON gr.source_entity_id = ge.id
    GROUP BY ge.religion
  `);
  const topRows = await qa(db, `
    SELECT religion, name, mention_count
    FROM graph_entities
    ORDER BY religion, mention_count DESC
  `);
  const relationMap = new Map(relationRows.map(r => [r.religion, Number(r.relationCount)]));
  const topMap = new Map();
  for (const row of topRows) {
    if (!topMap.has(row.religion)) topMap.set(row.religion, []);
    topMap.get(row.religion).push(row.name);
  }
  const religions = entityRows.map(r => ({
    religion: r.religion,
    entityCount: Number(r.entityCount),
    relationCount: relationMap.get(r.religion) ?? 0,
    topEntities: (topMap.get(r.religion) ?? []).slice(0, 5)
  }));
  return { religions };
}

// ─── getGraphForReligion ──────────────────────────────────────────────────────

export async function getGraphForReligion(db, religion, options = {}) {
  const { limit = 100, entityTypes } = options;
  let entitySql = `SELECT id, name, entity_type, mention_count, religion FROM graph_entities WHERE religion = ?`;
  const entityParams = [religion];
  if (entityTypes?.length) {
    entitySql += ` AND entity_type IN (${entityTypes.map(() => '?').join(', ')})`;
    entityParams.push(...entityTypes);
  }
  entitySql += ` LIMIT ?`;
  entityParams.push(limit);
  const entityRows = await qa(db, entitySql, entityParams);
  const nodeIds = new Set(entityRows.map(r => Number(r.id)));
  const nodes = entityRows.map(r => ({
    id: Number(r.id),
    name: r.name,
    type: r.entity_type,
    mentionCount: Number(r.mention_count),
    religion: r.religion
  }));
  const relRows = await qa(db,
    `SELECT source_entity_id, target_entity_id, relation_type, weight
     FROM graph_relations
     WHERE source_entity_id IN (SELECT id FROM graph_entities WHERE religion = ?)
       AND target_entity_id IN (SELECT id FROM graph_entities WHERE religion = ?)`,
    [religion, religion]
  );
  const edges = relRows
    .filter(r => nodeIds.has(Number(r.source_entity_id)) && nodeIds.has(Number(r.target_entity_id)))
    .map(r => ({
      source: Number(r.source_entity_id),
      target: Number(r.target_entity_id),
      type: r.relation_type,
      weight: Number(r.weight)
    }));
  return {
    nodes,
    edges,
    stats: { totalEntities: nodes.length, totalRelations: edges.length }
  };
}

// ─── searchGraphEntities ──────────────────────────────────────────────────────

export async function searchGraphEntities(db, query, options = {}) {
  const { religion } = options;
  let sql = `SELECT id, name, canonical_name, entity_type, religion, mention_count, description
             FROM graph_entities
             WHERE name LIKE ?`;
  const params = [`%${query}%`];
  if (religion) { sql += ` AND religion = ?`; params.push(religion); }
  sql += ` ORDER BY mention_count DESC LIMIT 50`;
  const rows = await qa(db, sql, params);
  return rows.map(r => ({
    id: Number(r.id),
    name: r.name,
    canonicalName: r.canonical_name,
    type: r.entity_type,
    religion: r.religion,
    mentionCount: Number(r.mention_count),
    description: r.description
  }));
}

// ─── getEntityDetail ──────────────────────────────────────────────────────────

export async function getEntityDetail(db, entityId) {
  const e = await qo(db,
    `SELECT id, name, canonical_name, entity_type, religion, mention_count, era, description
     FROM graph_entities WHERE id = ?`,
    [entityId]
  );
  if (!e) return null;
  const entity = {
    id: Number(e.id),
    name: e.name,
    canonicalName: e.canonical_name,
    type: e.entity_type,
    religion: e.religion,
    mentionCount: Number(e.mention_count),
    era: e.era,
    description: e.description
  };
  const relRows = await qa(db,
    `SELECT source_entity_id, target_entity_id, relation_type, weight, paragraph_id, doc_id
     FROM graph_relations
     WHERE source_entity_id = ? OR target_entity_id = ?`,
    [entityId, entityId]
  );
  const relations = relRows.map(r => ({
    source: Number(r.source_entity_id),
    target: Number(r.target_entity_id),
    type: r.relation_type,
    weight: Number(r.weight),
    paragraphId: r.paragraph_id ? Number(r.paragraph_id) : null,
    docId: r.doc_id ? Number(r.doc_id) : null
  }));
  const connectedIds = new Set(
    relations.flatMap(r => [r.source, r.target]).filter(id => id !== Number(entityId))
  );
  let connectedEntities = [];
  if (connectedIds.size) {
    const placeholders = [...connectedIds].map(() => '?').join(', ');
    const connRows = await qa(db,
      `SELECT id, name, entity_type, religion, mention_count FROM graph_entities WHERE id IN (${placeholders})`,
      [...connectedIds]
    );
    connectedEntities = connRows.map(r => ({
      id: Number(r.id),
      name: r.name,
      type: r.entity_type,
      religion: r.religion,
      mentionCount: Number(r.mention_count)
    }));
  }
  const docIds = [...new Set(relations.map(r => r.docId).filter(Boolean))];
  const sourceDocuments = docIds.map(id => ({ docId: id }));
  return { entity, connectedEntities, relations, sourceDocuments };
}
