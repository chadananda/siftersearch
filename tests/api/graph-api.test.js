/**
 * Graph API + Fused Search Tests (TDD RED)
 *
 * Tests for:
 *   api/routes/graph.js  — route handler functions (pure, not HTTP)
 *   api/lib/search.js    — mergeSearchResults addition
 *
 * TDD: All tests MUST be RED (failing) before any implementation exists.
 * Do NOT create implementation files.
 *
 * Graph route handlers are tested as pure functions that accept a db handle
 * so they can be tested without a running HTTP server.
 *
 * In-memory better-sqlite3 is used for graph DB fixtures.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';

// ─── better-sqlite3 in-memory wrapper (libsql-compatible API) ────────────────

function createInMemoryDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  return {
    _db: db,
    execute(sqlOrObj, argsArr) {
      const sql = typeof sqlOrObj === 'string' ? sqlOrObj : sqlOrObj.sql;
      const args = typeof sqlOrObj === 'string' ? (argsArr || []) : (sqlOrObj.args || []);
      const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA)\b/i.test(sql);
      if (isWrite) {
        const info = db.prepare(sql).run(...args);
        return Promise.resolve({ rows: [], lastInsertRowid: info.lastInsertRowid, changes: info.changes });
      }
      const rows = db.prepare(sql).all(...args);
      return Promise.resolve({ rows, lastInsertRowid: null });
    },
    executeMultiple(sql) {
      db.exec(sql);
      return Promise.resolve();
    },
    batch(stmts) {
      const txn = db.transaction((s) => s.map(({ sql, args = [] }) => db.prepare(sql).run(...args)));
      return Promise.resolve(txn(stmts));
    },
    close() {
      db.close();
      return Promise.resolve();
    }
  };
}

// ─── In-memory graph DB fixture ──────────────────────────────────────────────

let graphDb;
let idBahullah, idBab, idAbdul, idAkka, idMuhammad, idMecca;

beforeAll(async () => {
  graphDb = createInMemoryDb();

  await graphDb.executeMultiple(`
    CREATE TABLE IF NOT EXISTS graph_entities (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      canonical_name TEXT NOT NULL,
      entity_type   TEXT NOT NULL,
      religion      TEXT NOT NULL,
      mention_count INTEGER NOT NULL DEFAULT 1,
      era           TEXT,
      description   TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_merge
      ON graph_entities (canonical_name, entity_type, religion);
    CREATE TABLE IF NOT EXISTS graph_relations (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      source_entity_id INTEGER NOT NULL REFERENCES graph_entities(id),
      target_entity_id INTEGER NOT NULL REFERENCES graph_entities(id),
      relation_type    TEXT NOT NULL,
      weight           REAL NOT NULL DEFAULT 1.0,
      paragraph_id     INTEGER,
      doc_id           INTEGER,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  async function insertEntity(name, canonicalName, entityType, religion, mentionCount, description) {
    const r = await graphDb.execute({
      sql: `INSERT INTO graph_entities (name, canonical_name, entity_type, religion, mention_count, description)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [name, canonicalName, entityType, religion, mentionCount, description]
    });
    return Number(r.lastInsertRowid);
  }

  async function insertRelation(sourceId, targetId, relType, weight, paragraphId, docId) {
    const r = await graphDb.execute({
      sql: `INSERT INTO graph_relations (source_entity_id, target_entity_id, relation_type, weight, paragraph_id, doc_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [sourceId, targetId, relType, weight, paragraphId, docId]
    });
    return Number(r.lastInsertRowid);
  }

  idBahullah = await insertEntity("Baha'u'llah", "Baha'u'llah", 'person', "Baha'i", 10, "Prophet-Founder of the Baha'i Faith");
  idBab      = await insertEntity('The Bab',     'The Bab',     'person', "Baha'i",  8, "Herald of the Baha'i Faith");
  idAbdul    = await insertEntity("Abdu'l-Baha", "Abdu'l-Baha", 'person', "Baha'i",  6, "Son of Baha'u'llah");
  idAkka     = await insertEntity('Akka',         'Akka',        'place',  "Baha'i",  4, 'Prison city in Ottoman Palestine');

  idMuhammad = await insertEntity('Muhammad', 'Muhammad', 'person', 'Islam', 15, 'Prophet of Islam');
  idMecca    = await insertEntity('Mecca',    'Mecca',    'place',  'Islam', 12, 'Holy city of Islam');

  await insertRelation(idBahullah, idBab,   'preceded_by', 5.0, 1001, 1);
  await insertRelation(idBahullah, idAkka,  'exiled_to',   4.0, 1002, 1);
  await insertRelation(idBab,      idAbdul, 'announced',   3.0, 1003, 2);
  await insertRelation(idMuhammad, idMecca, 'born_in',     8.0, 2001, 3);
});

afterAll(async () => {
  graphDb?.close();
});

// =============================================================================
// Graph API — route handler functions from api/routes/graph.js
// =============================================================================

describe('Graph API', () => {
  it('1. getGraphStats() returns object with per-religion counts', async () => {
    const { getGraphStats } = await import('../../api/routes/graph.js');

    const result = await getGraphStats(graphDb);

    expect(result).toBeTruthy();
    expect(result).toHaveProperty('religions');
    expect(Array.isArray(result.religions)).toBe(true);

    const bahai = result.religions.find(r => r.religion === "Baha'i");
    const islam = result.religions.find(r => r.religion === 'Islam');

    expect(bahai).toBeTruthy();
    expect(typeof bahai.entityCount).toBe('number');
    expect(bahai.entityCount).toBe(4);
    expect(typeof bahai.relationCount).toBe('number');
    expect(bahai.relationCount).toBe(3);
    expect(Array.isArray(bahai.topEntities)).toBe(true);

    expect(islam).toBeTruthy();
    expect(islam.entityCount).toBe(2);
    expect(islam.relationCount).toBe(1);
  });

  it("2. getGraphForReligion('Baha\\'i', { limit: 50 }) returns { nodes, edges, stats }", async () => {
    const { getGraphForReligion } = await import('../../api/routes/graph.js');

    const result = await getGraphForReligion(graphDb, "Baha'i", { limit: 50 });

    expect(result).toBeTruthy();
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(Array.isArray(result.edges)).toBe(true);
    expect(result).toHaveProperty('stats');
    expect(result.nodes.length).toBe(4);
    expect(result.edges.length).toBe(3);
  });

  it('3. nodes have required fields: id, name, type, mentionCount, religion', async () => {
    const { getGraphForReligion } = await import('../../api/routes/graph.js');

    const { nodes } = await getGraphForReligion(graphDb, "Baha'i", { limit: 50 });

    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('name');
      expect(node).toHaveProperty('type');
      expect(node).toHaveProperty('mentionCount');
      expect(node).toHaveProperty('religion');
      expect(typeof node.id).toBe('number');
      expect(typeof node.name).toBe('string');
      expect(typeof node.type).toBe('string');
      expect(typeof node.mentionCount).toBe('number');
      expect(node.religion).toBe("Baha'i");
    }
  });

  it('4. edges have required fields: source, target, type, weight', async () => {
    const { getGraphForReligion } = await import('../../api/routes/graph.js');

    const { edges } = await getGraphForReligion(graphDb, "Baha'i", { limit: 50 });

    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(edge).toHaveProperty('source');
      expect(edge).toHaveProperty('target');
      expect(edge).toHaveProperty('type');
      expect(edge).toHaveProperty('weight');
      expect(typeof edge.source).toBe('number');
      expect(typeof edge.target).toBe('number');
      expect(typeof edge.type).toBe('string');
      expect(typeof edge.weight).toBe('number');
    }
  });

  it('5. getGraphForReligion with entityTypes filter returns only matching types', async () => {
    const { getGraphForReligion } = await import('../../api/routes/graph.js');

    const { nodes } = await getGraphForReligion(graphDb, "Baha'i", { limit: 50, entityTypes: ['person'] });

    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) expect(node.type).toBe('person');
    expect(nodes.length).toBe(3);
  });

  it("6. searchGraphEntities('Bah', { religion: \"Baha'i\" }) returns matching entities", async () => {
    const { searchGraphEntities } = await import('../../api/routes/graph.js');

    const results = await searchGraphEntities(graphDb, 'Bah', { religion: "Baha'i" });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    for (const entity of results) expect(entity.religion).toBe("Baha'i");
    const names = results.map(e => e.name);
    expect(names.some(n => n.toLowerCase().includes('bah'))).toBe(true);
  });

  it('7. searchGraphEntities without religion filter searches across all religions', async () => {
    const { searchGraphEntities } = await import('../../api/routes/graph.js');

    const results = await searchGraphEntities(graphDb, 'a', {});

    expect(Array.isArray(results)).toBe(true);
    const religions = new Set(results.map(e => e.religion));
    expect(religions.size).toBeGreaterThan(1);
  });

  it('8. getEntityDetail(entityId) returns entity + connected entities + all relations + source documents', async () => {
    const { getEntityDetail } = await import('../../api/routes/graph.js');

    const result = await getEntityDetail(graphDb, idBahullah);

    expect(result).toBeTruthy();
    expect(result).toHaveProperty('entity');
    expect(result.entity.id).toBe(idBahullah);
    expect(result.entity.name).toBe("Baha'u'llah");

    expect(result).toHaveProperty('connectedEntities');
    expect(Array.isArray(result.connectedEntities)).toBe(true);
    expect(result.connectedEntities.length).toBe(2);

    expect(result).toHaveProperty('relations');
    expect(Array.isArray(result.relations)).toBe(true);
    expect(result.relations.length).toBe(2);

    expect(result).toHaveProperty('sourceDocuments');
    expect(Array.isArray(result.sourceDocuments)).toBe(true);
  });
});

// =============================================================================
// Fused Search — mergeSearchResults from api/lib/search.js
// =============================================================================

describe('Fused Search', () => {
  const baseHits = [
    { id: 'p1', text: 'First paragraph text.',  heading: 'Chapter 1', blocktype: 'text', title: 'Kitab-i-Iqan', author: "Baha'u'llah", religion: "Baha'i" },
    { id: 'p2', text: 'Second paragraph text.', heading: 'Chapter 1', blocktype: 'text', title: 'Kitab-i-Iqan', author: "Baha'u'llah", religion: "Baha'i" },
    { id: 'p3', text: 'Third paragraph text.',  heading: 'Chapter 2', blocktype: 'text', title: 'Kitab-i-Iqan', author: "Baha'u'llah", religion: "Baha'i" },
  ];

  const enhancedHits = [
    { id: 'p1', objects_rendered: 'Rendered object for p1.', context: 'Contextual disambiguation for p1.', hyp_questions: ['What is unity?', "Who is Baha'u'llah?"], people: ["Baha'u'llah"], concepts: ['unity', 'revelation'] },
    { id: 'p2', objects_rendered: 'Rendered object for p2.', context: 'Context for p2.', hyp_questions: ['What is justice?'], people: [], concepts: ['justice'] },
    { id: 'p4', objects_rendered: 'Rendered object for p4.', context: 'Context for p4.', hyp_questions: [], people: ["Abdu'l-Baha"], concepts: ['service'] }
  ];

  it('1. mergeSearchResults(baseHits, enhancedHits) merges by paragraph id', async () => {
    const { mergeSearchResults } = await import('../../api/lib/search.js');
    const merged = mergeSearchResults(baseHits, enhancedHits);
    expect(Array.isArray(merged)).toBe(true);
    expect(merged.length).toBe(4);
    const ids = merged.map(h => h.id);
    expect(ids).toContain('p1');
    expect(ids).toContain('p2');
    expect(ids).toContain('p3');
    expect(ids).toContain('p4');
  });

  it('2. base hit fields preserved: text, heading, blocktype, title, author, religion', async () => {
    const { mergeSearchResults } = await import('../../api/lib/search.js');
    const merged = mergeSearchResults(baseHits, enhancedHits);
    const p1 = merged.find(h => h.id === 'p1');
    expect(p1).toBeTruthy();
    expect(p1.text).toBe('First paragraph text.');
    expect(p1.heading).toBe('Chapter 1');
    expect(p1.blocktype).toBe('text');
    expect(p1.title).toBe('Kitab-i-Iqan');
    expect(p1.author).toBe("Baha'u'llah");
    expect(p1.religion).toBe("Baha'i");
  });

  it('3. enhanced hit fields added: objects_rendered, context, hyp_questions, people, concepts', async () => {
    const { mergeSearchResults } = await import('../../api/lib/search.js');
    const merged = mergeSearchResults(baseHits, enhancedHits);
    const p1 = merged.find(h => h.id === 'p1');
    expect(p1.objects_rendered).toBe('Rendered object for p1.');
    expect(p1.context).toBe('Contextual disambiguation for p1.');
    expect(Array.isArray(p1.hyp_questions)).toBe(true);
    expect(p1.hyp_questions).toContain('What is unity?');
    expect(Array.isArray(p1.people)).toBe(true);
    expect(p1.people).toContain("Baha'u'llah");
    expect(Array.isArray(p1.concepts)).toBe(true);
    expect(p1.concepts).toContain('unity');
  });

  it('4. paragraphs only in base results included without enhanced fields', async () => {
    const { mergeSearchResults } = await import('../../api/lib/search.js');
    const merged = mergeSearchResults(baseHits, enhancedHits);
    const p3 = merged.find(h => h.id === 'p3');
    expect(p3).toBeTruthy();
    expect(p3.text).toBe('Third paragraph text.');
    expect(p3.objects_rendered).toBeUndefined();
    expect(p3.context).toBeUndefined();
    expect(p3.hyp_questions).toBeUndefined();
  });

  it('5. paragraphs only in enhanced results included with enhanced fields', async () => {
    const { mergeSearchResults } = await import('../../api/lib/search.js');
    const merged = mergeSearchResults(baseHits, enhancedHits);
    const p4 = merged.find(h => h.id === 'p4');
    expect(p4).toBeTruthy();
    expect(p4.objects_rendered).toBe('Rendered object for p4.');
    expect(p4.context).toBe('Context for p4.');
    expect(p4.people).toContain("Abdu'l-Baha");
    expect(p4.text).toBeUndefined();
  });

  it('6. paragraphs in both merged, no duplicate', async () => {
    const { mergeSearchResults } = await import('../../api/lib/search.js');
    const merged = mergeSearchResults(baseHits, enhancedHits);
    const p1Hits = merged.filter(h => h.id === 'p1');
    expect(p1Hits.length).toBe(1);
  });

  it('7. mergeSearchResults preserves ranking order from base results', async () => {
    const { mergeSearchResults } = await import('../../api/lib/search.js');
    const merged = mergeSearchResults(baseHits, enhancedHits);
    const baseIds = ['p1', 'p2', 'p3'];
    const mergedBaseIds = merged.filter(h => baseIds.includes(h.id)).map(h => h.id);
    expect(mergedBaseIds).toEqual(baseIds);
  });

  it('8. empty enhanced results returns base results unchanged', async () => {
    const { mergeSearchResults } = await import('../../api/lib/search.js');
    const merged = mergeSearchResults(baseHits, []);
    expect(merged.length).toBe(baseHits.length);
    for (let i = 0; i < baseHits.length; i++) {
      expect(merged[i].id).toBe(baseHits[i].id);
      expect(merged[i].text).toBe(baseHits[i].text);
    }
  });

  it('9. both empty returns empty array', async () => {
    const { mergeSearchResults } = await import('../../api/lib/search.js');
    const merged = mergeSearchResults([], []);
    expect(Array.isArray(merged)).toBe(true);
    expect(merged.length).toBe(0);
  });
});
