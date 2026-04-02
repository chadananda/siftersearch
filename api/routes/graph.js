/**
 * Graph API — pure route handler functions
 *
 * Each function accepts a libsql db client as first argument so they can be
 * tested without a running HTTP server.
 */

// ─── getGraphStats ────────────────────────────────────────────────────────────

export async function getGraphStats(db) {
  const entityRows = await db.execute(`
    SELECT religion, COUNT(*) AS entityCount
    FROM graph_entities
    GROUP BY religion
  `);
  const relationRows = await db.execute(`
    SELECT ge.religion, COUNT(*) AS relationCount
    FROM graph_relations gr
    JOIN graph_entities ge ON gr.source_entity_id = ge.id
    GROUP BY ge.religion
  `);
  const topRows = await db.execute(`
    SELECT religion, name, mention_count
    FROM graph_entities
    ORDER BY religion, mention_count DESC
  `);
  const relationMap = new Map(relationRows.rows.map(r => [r.religion, Number(r.relationCount)]));
  const topMap = new Map();
  for (const row of topRows.rows) {
    if (!topMap.has(row.religion)) topMap.set(row.religion, []);
    topMap.get(row.religion).push(row.name);
  }
  const religions = entityRows.rows.map(r => ({
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
  const entityArgs = [religion];
  if (entityTypes?.length) {
    entitySql += ` AND entity_type IN (${entityTypes.map(() => '?').join(', ')})`;
    entityArgs.push(...entityTypes);
  }
  entitySql += ` LIMIT ?`;
  entityArgs.push(limit);
  const entityRows = await db.execute({ sql: entitySql, args: entityArgs });
  const nodeIds = new Set(entityRows.rows.map(r => Number(r.id)));
  const nodes = entityRows.rows.map(r => ({
    id: Number(r.id),
    name: r.name,
    type: r.entity_type,
    mentionCount: Number(r.mention_count),
    religion: r.religion
  }));
  const relRows = await db.execute({
    sql: `SELECT source_entity_id, target_entity_id, relation_type, weight
          FROM graph_relations
          WHERE source_entity_id IN (SELECT id FROM graph_entities WHERE religion = ?)
            AND target_entity_id IN (SELECT id FROM graph_entities WHERE religion = ?)`,
    args: [religion, religion]
  });
  const edges = relRows.rows
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
  const args = [`%${query}%`];
  if (religion) { sql += ` AND religion = ?`; args.push(religion); }
  sql += ` ORDER BY mention_count DESC LIMIT 50`;
  const rows = await db.execute({ sql, args });
  return rows.rows.map(r => ({
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
  const entityRow = await db.execute({
    sql: `SELECT id, name, canonical_name, entity_type, religion, mention_count, era, description
          FROM graph_entities WHERE id = ?`,
    args: [entityId]
  });
  if (!entityRow.rows.length) return null;
  const e = entityRow.rows[0];
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
  const relRows = await db.execute({
    sql: `SELECT source_entity_id, target_entity_id, relation_type, weight, paragraph_id, doc_id
          FROM graph_relations
          WHERE source_entity_id = ? OR target_entity_id = ?`,
    args: [entityId, entityId]
  });
  const relations = relRows.rows.map(r => ({
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
    const connRows = await db.execute({
      sql: `SELECT id, name, entity_type, religion, mention_count
            FROM graph_entities WHERE id IN (${placeholders})`,
      args: [...connectedIds]
    });
    connectedEntities = connRows.rows.map(r => ({
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
