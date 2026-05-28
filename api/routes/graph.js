/**
 * Graph API Routes — Knowledge Graph visualization endpoints
 *
 * GET /api/graph/stats           — per-religion entity/relation counts
 * GET /api/graph/:religion       — nodes + edges for a religion
 * GET /api/graph/:religion/search?q=...  — search entities within a religion
 * GET /api/graph/entity/:id      — single entity detail
 */

import { queryAll, queryOne } from '../lib/db.js';
import { graphQueryAll, graphQueryOne } from '../lib/db.js';

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

  // GET /:religion/filters — available collections and authors for filtering
  server.get('/:religion/filters', async (request) => {
    const { religion: slug } = request.params;
    const slugLower = slug.toLowerCase();
    const allReligions = await queryAll('SELECT DISTINCT religion FROM docs');
    const religionRow = allReligions.find(r =>
      r.religion.toLowerCase().replace(/['']/g, '').replace(/\s+/g, '-') === slugLower
    );
    if (!religionRow) return { collections: [], authors: [] };

    const collections = await queryAll(`
      SELECT collection, COUNT(*) as docCount
      FROM docs WHERE religion = ? AND collection IS NOT NULL
      GROUP BY collection ORDER BY docCount DESC
    `, [religionRow.religion]);

    const authors = await queryAll(`
      SELECT author, COUNT(*) as docCount
      FROM docs WHERE religion = ? AND author IS NOT NULL AND author != ''
      GROUP BY author ORDER BY docCount DESC LIMIT 30
    `, [religionRow.religion]);

    return {
      collections: collections.map(r => ({ name: r.collection, docCount: r.docCount })),
      authors: authors.map(r => ({ name: r.author, docCount: r.docCount }))
    };
  });

  // GET /:religion — full graph data for a religion
  server.get('/:religion', async (request) => {
    const { religion: slug } = request.params;
    const { limit = 100, types, collection, author } = request.query;

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

  // GET /entity/search?q=&limit= — global entity name search across all religions
  server.get('/entity/search', async (request) => {
    const { q, limit = 20, religion } = request.query;
    if (!q) return [];
    const params = [`%${q}%`];
    let sql = `SELECT id, name, canonical_name, entity_type, religion, mention_count
               FROM graph_entities WHERE (name LIKE ? OR canonical_name LIKE ?)`;
    params.push(`%${q}%`);
    if (religion) { sql += ' AND religion = ?'; params.push(religion); }
    sql += ' ORDER BY mention_count DESC LIMIT ?';
    params.push(Number(limit));
    const rows = await queryAll(sql, params);
    return rows.map(r => ({
      id: Number(r.id), name: r.name, canonicalName: r.canonical_name,
      type: r.entity_type, religion: r.religion, mentionCount: Number(r.mention_count)
    }));
  });

  // GET /entity/:id/mentions?doc_id=&limit=&offset= — paragraphs mentioning this entity
  server.get('/entity/:id/mentions', async (request) => {
    const { id } = request.params;
    const { doc_id, limit = 50, offset = 0 } = request.query;

    const entity = await queryOne(
      'SELECT id, name, canonical_name, entity_type, religion FROM graph_entities WHERE id = ?', [id]
    );
    if (!entity) return server.httpErrors.notFound('Entity not found');

    // Fetch mention content_ids from graph.db
    let mentionSql = 'SELECT content_id, role FROM entity_mentions WHERE entity_id = ?';
    const mParams = [id];
    mentionSql += ' ORDER BY id LIMIT ? OFFSET ?';
    mParams.push(Number(limit), Number(offset));
    const mentions = await graphQueryAll(mentionSql, mParams);
    if (mentions.length === 0) return { entity: { id: Number(entity.id), name: entity.name }, paragraphs: [], total: 0 };

    // Fetch paragraph text + doc info from sifter.db
    const cids = mentions.map(m => m.content_id);
    const ph = cids.map(() => '?').join(',');
    let contentSql = `SELECT c.id, c.text, c.doc_id, c.position, d.title, d.author
                      FROM content c JOIN docs d ON d.id = c.doc_id
                      WHERE c.id IN (${ph})`;
    const cParams = [...cids];
    if (doc_id) { contentSql += ' AND c.doc_id = ?'; cParams.push(doc_id); }
    contentSql += ' ORDER BY c.doc_id, c.position';
    const contentRows = await queryAll(contentSql, cParams);
    const roleMap = new Map(mentions.map(m => [m.content_id, m.role]));

    const totalRow = await graphQueryOne(
      'SELECT COUNT(*) as n FROM entity_mentions WHERE entity_id = ?', [id]
    );

    return {
      entity: { id: Number(entity.id), name: entity.name, canonicalName: entity.canonical_name, type: entity.entity_type, religion: entity.religion },
      paragraphs: contentRows.map(r => ({
        contentId: r.id, docId: r.doc_id, title: r.title, author: r.author,
        position: r.position, text: r.text, role: roleMap.get(r.id) || null
      })),
      total: totalRow?.n ?? 0,
      limit: Number(limit),
      offset: Number(offset)
    };
  });
}
