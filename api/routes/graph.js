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
import { chatCompletion } from '../lib/ai.js';
import fs from 'fs';
import path from 'path';

const BIO_ROOT = path.join(process.env.HOME || '/home/chad', 'sifter', 'bio-assets');
const readBioManifest = () => { try { return JSON.parse(fs.readFileSync(path.join(BIO_ROOT, 'manifest.json'), 'utf8')); } catch { return {}; } };

export default async function graphRoutes(server) {

  // GET /bio/persons — the biography browser dataset: every seed person with name, aliases, kinship,
  // importance, side, summary, and whether a portrait was gathered (Wikipedia / bahai.media).
  server.get('/bio/persons', async () => {
    const man = readBioManifest();
    const rows = await queryAll(`SELECT ge.id, ge.canonical_name AS name, ge.importance,
        er.side, er.summary, er.aliases, er.kinship, er.research_notes
      FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name
      WHERE ge.entity_type = 'person' AND ge.religion = ''
      ORDER BY (ge.importance IS NULL), ge.importance DESC, ge.canonical_name`);
    const persons = rows.map(r => {
      let aliases = [], kinship = []; try { aliases = JSON.parse(r.aliases || '[]'); } catch {} try { kinship = JSON.parse(r.kinship || '[]'); } catch {}
      const m = man[r.id]; const hasPortrait = !!(m && m.cdn);   // m.cdn = "biography/<id>.<ext>" in R2/ImageKit
      return { id: r.id, name: r.name, importance: r.importance || 0, side: r.side || null,
        summary: r.summary || null, aliases, kinship, hasPortrait,
        portrait: m?.cdn || null,
        wiki: m?.title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(String(m.title).replace(/ /g, '_'))}` : null };
    });
    const sides = [...new Set(persons.map(p => p.side).filter(Boolean))].sort();
    return { count: persons.length, withPortraits: persons.filter(p => p.hasPortrait).length, sides, persons };
  });

  // GET /bio/search?q= — intelligent search (DeepSeek) over the meaningful cast, for descriptive / reasoning
  // queries the token filter can't ("letters of the living who recognized Bahá'u'lláh", "seven martyrs of
  // Ṭihrán", "martyred at Ṭabarsí"). Returns matching entity ids, most relevant first.
  server.get('/bio/search', async (request) => {
    const q = String(request.query?.q || '').trim().slice(0, 200);
    if (!q) return { ids: [], q };
    const rows = await queryAll(`SELECT ge.id, ge.canonical_name AS name, er.summary
      FROM graph_entities ge JOIN entity_research er ON er.canonical_name = ge.canonical_name
      WHERE ge.entity_type='person' AND ge.religion='' AND er.summary IS NOT NULL AND length(er.summary) > 20
      ORDER BY (ge.importance IS NULL), ge.importance DESC LIMIT 480`);
    const catalog = rows.map(r => `${r.id}|${r.name}: ${String(r.summary).replace(/\s+/g, ' ').slice(0, 170)}`).join('\n');
    const SYS = `You filter a biographical dictionary of early Bábí/Bahá'í history. Given a QUERY and a CATALOG (one person per line "id|name: summary"), return the ids whose record matches the query's MEANING — role, group (Letters of the Living, Seven Martyrs of Ṭihrán…), place, fate (martyred at Ṭabarsí…), period, or relationship/condition ("who recognized Bahá'u'lláh"). Judge from the summaries. Return ONLY JSON {"ids":[numbers]} — clear matches only, most relevant first.`;
    try {
      const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: `QUERY: ${q}\n\nCATALOG:\n${catalog}` }],
        { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 900, responseFormat: { type: 'json_object' } });
      const m = (res.content || '').match(/\{[\s\S]*\}/);
      const ids = m ? (JSON.parse(m[0]).ids || []).map(Number).filter(Boolean) : [];
      return { ids, q };
    } catch (e) { return { ids: [], q, error: String(e).slice(0, 80) }; }
  });

  // GET /bio/person/:id — full dossier for the detail drawer (DB record + gathered bio.json + cross-corpus reach)
  server.get('/bio/person/:id', async (request, reply) => {
    const id = String(request.params.id).replace(/[^0-9]/g, '');
    const row = await queryOne(`SELECT ge.id, ge.canonical_name AS name, ge.importance, er.side, er.summary,
        er.aliases, er.kinship, er.relations, er.research_notes, er.dates
      FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name WHERE ge.id = ?`, [id]);
    if (!row) { reply.code(404); return { error: 'not found' }; }
    const arr = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
    const obj = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
    let wiki = null, portrait = null, portraitFull = null, bahai = null;
    portrait = readBioManifest()[id]?.cdn || null;   // "biography/<id>.<ext>" → ImageKit on the client
    try {
      const d = fs.readdirSync(BIO_ROOT).find(x => x.startsWith(id + '-'));
      if (d) { const bj = JSON.parse(fs.readFileSync(path.join(BIO_ROOT, d, 'bio.json'), 'utf8'));
        wiki = bj.wikipedia || null; bahai = bj.bahai_media || null;
        portraitFull = bj.portrait_fullres || bj.wikipedia?.image_url || bahai?.full || null; }
    } catch { /* no bio.json */ }
    // cross-corpus reach: distinct books this person appears in
    let mentionCount = 0, books = [];
    try {
      const ms = await graphQueryAll('SELECT content_id FROM entity_mentions WHERE entity_id = ?', [id]);
      mentionCount = ms.length;
      const cids = [...new Set(ms.map(m => String(m.content_id)))].slice(0, 4000);
      if (cids.length) books = (await queryAll(`SELECT DISTINCT d.title FROM content c JOIN docs d ON d.id = c.doc_id WHERE c.id IN (${cids.map(() => '?').join(',')}) AND d.title IS NOT NULL`, cids)).map(b => b.title);
    } catch { /* graph optional */ }
    const notes = obj(row.research_notes);
    return { id: row.id, name: row.name, importance: row.importance || 0, side: row.side || null,
      summary: row.summary || null, aliases: arr(row.aliases), kinship: arr(row.kinship), relations: arr(row.relations),
      dates: arr(row.dates), facts: notes.facts || [], firewall: notes.firewall || [], contested: notes.contested || [],
      possible_ids: notes.possible_ids || [], wiki, portrait, portraitFull, bahai, mentionCount, books };
  });

  // GET /bio/portrait/:id — serve a gathered portrait image file
  server.get('/bio/portrait/:id', async (request, reply) => {
    const id = String(request.params.id).replace(/[^0-9]/g, '');
    try {
      for (const d of fs.readdirSync(BIO_ROOT).filter(x => x.startsWith(id + '-'))) {
        const files = fs.readdirSync(path.join(BIO_ROOT, d)).filter(f => /^portrait\./.test(f));
        if (files.length) {
          const ext = files[0].split('.').pop().toLowerCase();
          const ct = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
          reply.header('Content-Type', ct).header('Cache-Control', 'public, max-age=86400');
          return reply.send(fs.readFileSync(path.join(BIO_ROOT, d, files[0])));
        }
      }
    } catch { /* fall through */ }
    reply.code(404); return { error: 'not found' };
  });

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

    // When filtering by doc, pre-fetch the content_ids for that doc so we can
    // push the filter into graph.db (cross-DB join not possible directly).
    let docContentIds = null;
    if (doc_id) {
      const rows = await queryAll('SELECT id FROM content WHERE doc_id = ?', [doc_id]);
      docContentIds = rows.map(r => r.id);
      if (docContentIds.length === 0) return { entity: { id: Number(entity.id), name: entity.name }, paragraphs: [], total: 0 };
    }

    // Fetch mention content_ids from graph.db, optionally restricted to doc
    let mentionSql = 'SELECT content_id, role FROM entity_mentions WHERE entity_id = ?';
    const mParams = [id];
    if (docContentIds) {
      mentionSql += ` AND content_id IN (${docContentIds.map(() => '?').join(',')})`;
      mParams.push(...docContentIds);
    }
    const totalRow = await graphQueryOne(
      mentionSql.replace('SELECT content_id, role', 'SELECT COUNT(*) as n'), mParams
    );
    mentionSql += ' ORDER BY id LIMIT ? OFFSET ?';
    mParams.push(Number(limit), Number(offset));
    const mentions = await graphQueryAll(mentionSql, mParams);
    if (mentions.length === 0) return { entity: { id: Number(entity.id), name: entity.name }, paragraphs: [], total: totalRow?.n ?? 0 };

    // Fetch paragraph text + doc info from sifter.db
    const cids = mentions.map(m => m.content_id);
    const ph = cids.map(() => '?').join(',');
    const contentRows = await queryAll(
      `SELECT c.id, c.text, c.doc_id, c.paragraph_index, d.title, d.author
       FROM content c JOIN docs d ON d.id = c.doc_id
       WHERE c.id IN (${ph}) ORDER BY c.paragraph_index`,
      cids
    );
    const roleMap = new Map(mentions.map(m => [m.content_id, m.role]));

    return {
      entity: { id: Number(entity.id), name: entity.name, canonicalName: entity.canonical_name, type: entity.entity_type, religion: entity.religion },
      paragraphs: contentRows.map(r => ({
        contentId: r.id, docId: r.doc_id, title: r.title, author: r.author,
        position: r.paragraph_index, text: r.text, role: roleMap.get(r.id) || null
      })),
      total: totalRow?.n ?? 0,
      limit: Number(limit),
      offset: Number(offset)
    };
  });

  // GET /entity/:id/dossier — everything about one entity in a single call:
  // canonical record + description, aliases, relations, and every alias-resolved
  // mention in narrative order (doc -> paragraph) with citation. This is the unit
  // that answers "who was X and what happened to them" with no text search — the
  // primary entity-research call for Jafar (API-only).
  server.get('/entity/:id/dossier', async (request) => {
    const { id } = request.params;
    const entity = await queryOne(
      `SELECT id, name, canonical_name, entity_type, religion, era, description, mention_count
       FROM graph_entities WHERE id = ?`, [id]
    );
    if (!entity) return server.httpErrors.notFound('Entity not found');
    // Aliases live in the sidecar (graph.db)
    const aliases = await graphQueryAll(
      `SELECT surface, lang, confidence FROM entity_aliases WHERE entity_id = ? ORDER BY confidence DESC`, [id]
    );
    // Relations live in sifter.db — resolve the OTHER end's name/type
    const relations = await queryAll(`
      SELECT gr.relation_type, gr.weight,
             ge.id AS other_id, ge.canonical_name AS other_name, ge.entity_type AS other_type
      FROM graph_relations gr
      JOIN graph_entities ge ON ge.id = CASE WHEN gr.source_entity_id = ? THEN gr.target_entity_id ELSE gr.source_entity_id END
      WHERE gr.source_entity_id = ? OR gr.target_entity_id = ?
      ORDER BY gr.weight DESC LIMIT 100
    `, [id, id, id]);
    // Mentions live in the sidecar (graph.db); join content+docs from sifter.db, narrative order
    const mentionRows = await graphQueryAll(`SELECT content_id, role FROM entity_mentions WHERE entity_id = ?`, [id]);
    let mentions = [];
    if (mentionRows.length) {
      const cids = [...new Set(mentionRows.map(m => m.content_id))];
      const ph = cids.map(() => '?').join(',');
      const contentRows = await queryAll(
        `SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.external_para_id, d.title, d.author, d.source_url
         FROM content c JOIN docs d ON d.id = c.doc_id
         WHERE c.id IN (${ph}) AND c.deleted_at IS NULL
         ORDER BY d.title, c.paragraph_index`, cids
      );
      const roleMap = new Map(mentionRows.map(m => [m.content_id, m.role]));
      mentions = contentRows.map(r => ({
        contentId: r.id, docId: r.doc_id, title: r.title, author: r.author,
        position: r.paragraph_index, role: roleMap.get(r.id) || null,
        citation: r.source_url ? `${r.source_url}?paraId=${r.external_para_id}` : null,
        text: r.text
      }));
    }
    return {
      entity: {
        id: Number(entity.id), name: entity.name, canonicalName: entity.canonical_name,
        type: entity.entity_type, religion: entity.religion, era: entity.era,
        description: entity.description, mentionCount: Number(entity.mention_count)
      },
      aliases, relations, mentions, mentionTotal: mentions.length
    };
  });
}
