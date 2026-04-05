/**
 * Graph API Routes — Knowledge Graph visualization endpoints
 *
 * GET /api/graph/stats           — per-religion entity/relation counts
 * GET /api/graph/:religion       — nodes + edges for a religion
 * GET /api/graph/:religion/search?q=...  — search entities within a religion
 * GET /api/graph/entity/:id      — single entity detail
 */

import { queryAll, queryOne } from '../lib/db.js';

export default async function graphRoutes(server) {

  // GET /stats — overview of all religions in the graph
  server.get('/stats', async () => {
    const entityRows = await queryAll(`
      SELECT religion, COUNT(*) AS entityCount
      FROM graph_entities
      GROUP BY religion
      ORDER BY entityCount DESC
    `);
    const relationRows = await queryAll(`
      SELECT ge.religion, COUNT(*) AS relationCount
      FROM graph_relations gr
      JOIN graph_entities ge ON gr.source_entity_id = ge.id
      GROUP BY ge.religion
    `);
    const topRows = await queryAll(`
      SELECT religion, name, entity_type, mention_count
      FROM graph_entities
      ORDER BY religion, mention_count DESC
    `);

    const relationMap = new Map(relationRows.map(r => [r.religion, Number(r.relationCount)]));
    const topMap = new Map();
    for (const row of topRows) {
      if (!topMap.has(row.religion)) topMap.set(row.religion, []);
      const list = topMap.get(row.religion);
      if (list.length < 5) list.push({ name: row.name, type: row.entity_type, mentions: row.mention_count });
    }

    return {
      religions: entityRows.map(r => ({
        religion: r.religion,
        entityCount: Number(r.entityCount),
        relationCount: relationMap.get(r.religion) ?? 0,
        topEntities: topMap.get(r.religion) ?? []
      }))
    };
  });

  // GET /:religion — full graph data for a religion
  server.get('/:religion', async (request) => {
    const { religion: slug } = request.params;
    const { limit = 200, types } = request.query;

    // Convert slug back to religion name (e.g. "bahai" → "Baha'i")
    const slugLower = slug.toLowerCase();
    const allReligions = await queryAll('SELECT DISTINCT religion FROM graph_entities');
    const religionRow = allReligions.find(r => {
      const s = r.religion.toLowerCase().replace(/['']/g, '').replace(/\s+/g, '-');
      return s === slugLower;
    });

    if (!religionRow) {
      return { nodes: [], edges: [], stats: { totalEntities: 0, totalRelations: 0 } };
    }

    const religion = religionRow.religion;

    let entitySql = `
      SELECT id, name, entity_type, mention_count, religion
      FROM graph_entities
      WHERE religion = ?
    `;
    const params = [religion];

    if (types) {
      const typeList = types.split(',');
      entitySql += ` AND entity_type IN (${typeList.map(() => '?').join(', ')})`;
      params.push(...typeList);
    }

    entitySql += ` ORDER BY mention_count DESC LIMIT ?`;
    params.push(Number(limit));

    const entityRows = await queryAll(entitySql, params);
    const nodeIds = new Set(entityRows.map(r => Number(r.id)));

    const nodes = entityRows.map(r => ({
      id: Number(r.id),
      name: r.name,
      type: r.entity_type,
      mentionCount: Number(r.mention_count),
      religion: r.religion
    }));

    // Get relations between visible nodes
    if (nodeIds.size === 0) {
      return { nodes, edges: [], stats: { totalEntities: 0, totalRelations: 0 } };
    }

    const placeholders = [...nodeIds].map(() => '?').join(',');
    const relRows = await queryAll(`
      SELECT source_entity_id, target_entity_id, relation_type, weight
      FROM graph_relations
      WHERE source_entity_id IN (${placeholders})
        AND target_entity_id IN (${placeholders})
      ORDER BY weight DESC
      LIMIT 1000
    `, [...nodeIds, ...nodeIds]);

    const edges = relRows.map(r => ({
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
  });

  // GET /:religion/search?q=... — search entities within a religion
  server.get('/:religion/search', async (request) => {
    const { religion: slug } = request.params;
    const { q } = request.query;
    if (!q) return [];

    // Resolve religion from slug
    const allRels = await queryAll('SELECT DISTINCT religion FROM graph_entities');
    const relMatch = allRels.find(r => r.religion.toLowerCase().replace(/['']/g, '').replace(/\s+/g, '-') === slug.toLowerCase());
    if (!relMatch) return [];

    const rows = await queryAll(`
      SELECT id, name, canonical_name, entity_type, religion, mention_count
      FROM graph_entities
      WHERE name LIKE ?
        AND religion = ?
      ORDER BY mention_count DESC
      LIMIT 20
    `, [`%${q}%`, relMatch.religion]);

    return rows.map(r => ({
      id: Number(r.id),
      name: r.name,
      type: r.entity_type,
      religion: r.religion,
      mentionCount: Number(r.mention_count)
    }));
  });

  // GET /entity/:id — detailed entity with connections
  server.get('/entity/:id', async (request) => {
    const { id } = request.params;
    const e = await queryOne(
      `SELECT id, name, canonical_name, entity_type, religion, mention_count, doc_count, era, description
       FROM graph_entities WHERE id = ?`,
      [id]
    );
    if (!e) return null;

    const entity = {
      id: Number(e.id),
      name: e.name,
      canonicalName: e.canonical_name,
      type: e.entity_type,
      religion: e.religion,
      mentionCount: Number(e.mention_count),
      docCount: Number(e.doc_count || 0),
      era: e.era,
      description: e.description
    };

    const relRows = await queryAll(`
      SELECT gr.source_entity_id, gr.target_entity_id, gr.relation_type, gr.weight,
             ge.name AS other_name, ge.entity_type AS other_type, ge.mention_count AS other_mentions
      FROM graph_relations gr
      JOIN graph_entities ge ON ge.id = CASE
        WHEN gr.source_entity_id = ? THEN gr.target_entity_id
        ELSE gr.source_entity_id
      END
      WHERE gr.source_entity_id = ? OR gr.target_entity_id = ?
      ORDER BY gr.weight DESC
      LIMIT 50
    `, [id, id, id]);

    const connected = relRows.map(r => ({
      id: Number(r.source_entity_id == id ? r.target_entity_id : r.source_entity_id),
      name: r.other_name,
      type: r.other_type,
      mentionCount: Number(r.other_mentions),
      relationWeight: Number(r.weight)
    }));

    return { entity, connected };
  });
}
