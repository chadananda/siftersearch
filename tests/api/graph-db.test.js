/**
 * Graph DB Tests (TDD RED)
 *
 * Tests for api/lib/graph-db.js — a SEPARATE SQLite database at data/graph.db
 * that stores entity nodes and relations extracted from document content.
 *
 * TDD: All tests MUST be RED (failing) before any implementation exists.
 * The module api/lib/graph-db.js does not exist yet.
 *
 * Tables:
 *   graph_entities  — named entities with type/religion/canonical_name
 *   graph_relations — weighted directed edges between entities
 *
 * Merge rules (CRITICAL):
 *   - ONLY merge when: same canonical_name + same entity_type + same religion
 *   - Different religion = NEVER merge (religious traditions keep separate namespaces)
 *   - Different name = separate entity even if same type+religion
 *   - Different type = separate entity even if same name+religion
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// ─── Temp DB path (unique per test run) ────────────────────────────────────

let tmpDir;
let dbPath;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'graph-db-test-'));
  dbPath = join(tmpDir, 'graph.db');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── DB Lifecycle ───────────────────────────────────────────────────────────

describe('Graph DB - DB Lifecycle', () => {
  it('1. initGraphDb(path) creates the DB file and both tables', async () => {
    const { initGraphDb } = await import('../../api/lib/graph-db.js');

    const db = await initGraphDb(dbPath);

    expect(db).toBeTruthy();

    // Both tables must exist — query them without error
    const { query } = db;
    const entities = await query("SELECT name FROM sqlite_master WHERE type='table' AND name='graph_entities'");
    const relations = await query("SELECT name FROM sqlite_master WHERE type='table' AND name='graph_relations'");

    expect(entities.rows.length).toBe(1);
    expect(relations.rows.length).toBe(1);

    await db.close();
  });

  it('2. closeGraphDb() closes the connection without error', async () => {
    const { initGraphDb } = await import('../../api/lib/graph-db.js');

    const db = await initGraphDb(dbPath);
    await expect(db.close()).resolves.not.toThrow();
  });
});

// ─── Entity CRUD ────────────────────────────────────────────────────────────

describe('Graph DB - Entity CRUD', () => {
  let db;

  beforeEach(async () => {
    const { initGraphDb } = await import('../../api/lib/graph-db.js');
    db = await initGraphDb(dbPath);
  });

  afterEach(async () => {
    await db.close();
  });

  it('3. upsertEntity inserts a new entity and returns its id', async () => {
    const { upsertEntity } = db;

    const id = await upsertEntity({
      name: "Baha'u'llah",
      entityType: 'person',
      canonicalName: "Baha'u'llah",
      religion: "Baha'i",
      era: '19th century',
      description: 'Prophet-Founder of the Baha\'i Faith',
      sourceDocIds: [1, 2]
    });

    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('4. upsertEntity with same (canonical_name, entity_type, religion) increments mention_count', async () => {
    const { upsertEntity, getEntity } = db;

    const base = {
      name: 'The Bab',
      entityType: 'person',
      canonicalName: 'The Bab',
      religion: "Baha'i"
    };

    const id1 = await upsertEntity(base);
    const id2 = await upsertEntity({ ...base, sourceDocIds: [5] });

    // Same entity — same id
    expect(id1).toBe(id2);

    const entity = await getEntity(id1);
    expect(entity.mention_count).toBe(2);
  });

  it('5. getEntity(id) returns the full entity object', async () => {
    const { upsertEntity, getEntity } = db;

    const id = await upsertEntity({
      name: 'Abdu\'l-Baha',
      entityType: 'person',
      canonicalName: 'Abdu\'l-Baha',
      religion: "Baha'i",
      era: 'early 20th century',
      description: 'Son of Baha\'u\'llah and head of the Baha\'i Faith'
    });

    const entity = await getEntity(id);

    expect(entity).toBeTruthy();
    expect(entity.id).toBe(id);
    expect(entity.name).toBe('Abdu\'l-Baha');
    expect(entity.entity_type).toBe('person');
    expect(entity.religion).toBe("Baha'i");
    expect(entity.era).toBe('early 20th century');
    expect(entity.mention_count).toBeGreaterThanOrEqual(1);
    expect(entity.created_at).toBeTruthy();
  });

  it('6. getEntitiesByReligion(religion) returns only entities for that religion', async () => {
    const { upsertEntity, getEntitiesByReligion } = db;

    await upsertEntity({ name: 'Muhammad', entityType: 'person', canonicalName: 'Muhammad', religion: 'Islam' });
    await upsertEntity({ name: 'Ali', entityType: 'person', canonicalName: 'Ali', religion: 'Islam' });
    await upsertEntity({ name: "Baha'u'llah", entityType: 'person', canonicalName: "Baha'u'llah", religion: "Baha'i" });

    const islamEntities = await getEntitiesByReligion('Islam');

    expect(Array.isArray(islamEntities)).toBe(true);
    expect(islamEntities.length).toBe(2);
    islamEntities.forEach(e => expect(e.religion).toBe('Islam'));
  });

  it('7. getEntitiesByType(entityType, religion) filters by both type and religion', async () => {
    const { upsertEntity, getEntitiesByType } = db;

    await upsertEntity({ name: 'Mecca', entityType: 'place', canonicalName: 'Mecca', religion: 'Islam' });
    await upsertEntity({ name: 'Muhammad', entityType: 'person', canonicalName: 'Muhammad', religion: 'Islam' });
    await upsertEntity({ name: 'Akka', entityType: 'place', canonicalName: 'Akka', religion: "Baha'i" });

    const islamPlaces = await getEntitiesByType('place', 'Islam');

    expect(Array.isArray(islamPlaces)).toBe(true);
    expect(islamPlaces.length).toBe(1);
    expect(islamPlaces[0].name).toBe('Mecca');
    expect(islamPlaces[0].entity_type).toBe('place');
  });

  it('8. searchEntities(query) does fuzzy name search', async () => {
    const { upsertEntity, searchEntities } = db;

    await upsertEntity({ name: "Baha'u'llah", entityType: 'person', canonicalName: "Baha'u'llah", religion: "Baha'i" });
    await upsertEntity({ name: 'The Bab', entityType: 'person', canonicalName: 'The Bab', religion: "Baha'i" });
    await upsertEntity({ name: 'Muhammad', entityType: 'person', canonicalName: 'Muhammad', religion: 'Islam' });

    const results = await searchEntities('bah');

    expect(Array.isArray(results)).toBe(true);
    // Should match "Baha'u'llah" at minimum (case-insensitive prefix)
    expect(results.length).toBeGreaterThanOrEqual(1);
    const names = results.map(e => e.name.toLowerCase());
    expect(names.some(n => n.includes('bah'))).toBe(true);
  });
});

// ─── Relation CRUD ──────────────────────────────────────────────────────────

describe('Graph DB - Relation CRUD', () => {
  let db;
  let idA, idB, idC;

  beforeEach(async () => {
    const { initGraphDb } = await import('../../api/lib/graph-db.js');
    db = await initGraphDb(dbPath);

    const { upsertEntity } = db;
    idA = await upsertEntity({ name: "Baha'u'llah", entityType: 'person', canonicalName: "Baha'u'llah", religion: "Baha'i" });
    idB = await upsertEntity({ name: 'The Bab', entityType: 'person', canonicalName: 'The Bab', religion: "Baha'i" });
    idC = await upsertEntity({ name: 'Akka', entityType: 'place', canonicalName: 'Akka', religion: "Baha'i" });
  });

  afterEach(async () => {
    await db.close();
  });

  it('9. insertRelation creates a relation and returns its id', async () => {
    const { insertRelation } = db;

    const relId = await insertRelation(idA, idB, 'preceded_by', 101, 5001);

    expect(typeof relId).toBe('number');
    expect(relId).toBeGreaterThan(0);
  });

  it('10. getRelationsForEntity returns all relations in both directions', async () => {
    const { insertRelation, getRelationsForEntity } = db;

    await insertRelation(idA, idB, 'preceded_by', 101, 5001);
    await insertRelation(idC, idA, 'exiled_to', 102, 5002);
    // idB → idC not connected to idA
    await insertRelation(idB, idC, 'visited', 103, 5003);

    const relations = await getRelationsForEntity(idA);

    expect(Array.isArray(relations)).toBe(true);
    // Should include relations where idA is source OR target
    expect(relations.length).toBe(2);
    relations.forEach(r => {
      const involvedIds = [r.source_entity_id, r.target_entity_id];
      expect(involvedIds).toContain(idA);
    });
  });

  it('11. getRelationsBetween returns direct relations between two entities', async () => {
    const { insertRelation, getRelationsBetween } = db;

    await insertRelation(idA, idB, 'preceded_by', 101, 5001);
    await insertRelation(idA, idC, 'exiled_to', 102, 5002);

    const between = await getRelationsBetween(idA, idB);

    expect(Array.isArray(between)).toBe(true);
    expect(between.length).toBe(1);
    expect(between[0].relation_type).toBe('preceded_by');

    // Should not include the A→C relation
    const notBetween = await getRelationsBetween(idB, idC);
    expect(notBetween.length).toBe(0);
  });
});

// ─── Conservative Merge Rules (CRITICAL) ────────────────────────────────────

describe('Graph DB - Conservative Merge Rules', () => {
  let db;

  beforeEach(async () => {
    const { initGraphDb } = await import('../../api/lib/graph-db.js');
    db = await initGraphDb(dbPath);
  });

  afterEach(async () => {
    await db.close();
  });

  it('12. Same religion + same type + exact canonical_name → merges (increments mention_count)', async () => {
    const { upsertEntity, getEntity } = db;

    const shared = { name: 'Muhammad', entityType: 'person', canonicalName: 'Muhammad', religion: 'Islam' };
    const id1 = await upsertEntity(shared);
    const id2 = await upsertEntity(shared);

    expect(id1).toBe(id2);

    const entity = await getEntity(id1);
    expect(entity.mention_count).toBe(2);
  });

  it('13. Same religion + same type + different canonical_name → creates separate entity (no merge)', async () => {
    const { upsertEntity } = db;

    const id1 = await upsertEntity({ name: 'The Imam', entityType: 'person', canonicalName: 'The Imam', religion: 'Islam' });
    const id2 = await upsertEntity({ name: 'Ali', entityType: 'person', canonicalName: 'Ali', religion: 'Islam' });

    expect(id1).not.toBe(id2);
  });

  it('14. Different religion + same canonical_name + same type → NEVER merges', async () => {
    const { upsertEntity, getEntitiesByReligion } = db;

    // "Jesus" appears in both Christianity and Islam as distinct theological figures
    const id1 = await upsertEntity({ name: 'Jesus', entityType: 'person', canonicalName: 'Jesus', religion: 'Christianity' });
    const id2 = await upsertEntity({ name: 'Jesus', entityType: 'person', canonicalName: 'Jesus', religion: 'Islam' });

    expect(id1).not.toBe(id2);

    const christians = await getEntitiesByReligion('Christianity');
    const muslims = await getEntitiesByReligion('Islam');
    expect(christians.length).toBe(1);
    expect(muslims.length).toBe(1);
  });

  it('15. Different entity_type + same canonical_name + same religion → does NOT merge', async () => {
    const { upsertEntity } = db;

    // "Quran" as a concept vs as a document
    const id1 = await upsertEntity({ name: 'Quran', entityType: 'document', canonicalName: 'Quran', religion: 'Islam' });
    const id2 = await upsertEntity({ name: 'Quran', entityType: 'concept', canonicalName: 'Quran', religion: 'Islam' });

    expect(id1).not.toBe(id2);
  });
});

// ─── Graph Queries ───────────────────────────────────────────────────────────

describe('Graph DB - Graph Queries', () => {
  let db;

  beforeEach(async () => {
    const { initGraphDb } = await import('../../api/lib/graph-db.js');
    db = await initGraphDb(dbPath);

    const { upsertEntity, insertRelation } = db;

    // Baha'i entities
    const bA = await upsertEntity({ name: "Baha'u'llah", entityType: 'person', canonicalName: "Baha'u'llah", religion: "Baha'i" });
    const bB = await upsertEntity({ name: 'The Bab', entityType: 'person', canonicalName: 'The Bab', religion: "Baha'i" });
    const bC = await upsertEntity({ name: 'Akka', entityType: 'place', canonicalName: 'Akka', religion: "Baha'i" });
    await insertRelation(bA, bB, 'preceded_by', 1, 100);
    await insertRelation(bA, bC, 'exiled_to', 1, 101);

    // Islam entities
    const mA = await upsertEntity({ name: 'Muhammad', entityType: 'person', canonicalName: 'Muhammad', religion: 'Islam' });
    const mB = await upsertEntity({ name: 'Mecca', entityType: 'place', canonicalName: 'Mecca', religion: 'Islam' });
    await insertRelation(mA, mB, 'born_in', 2, 200);
  });

  afterEach(async () => {
    await db.close();
  });

  it("16. getGraphForReligion returns { nodes, edges } filtered by religion", async () => {
    const { getGraphForReligion } = db;

    const graph = await getGraphForReligion("Baha'i");

    expect(graph).toBeTruthy();
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);

    // Only Baha'i nodes
    graph.nodes.forEach(n => expect(n.religion).toBe("Baha'i"));
    expect(graph.nodes.length).toBe(3);
    expect(graph.edges.length).toBe(2);
  });

  it("16b. getGraphForReligion respects { limit, entityTypes } options", async () => {
    const { getGraphForReligion } = db;

    const graph = await getGraphForReligion("Baha'i", { limit: 2, entityTypes: ['person'] });

    expect(Array.isArray(graph.nodes)).toBe(true);
    // Only persons, limited to 2
    graph.nodes.forEach(n => expect(n.entity_type).toBe('person'));
    expect(graph.nodes.length).toBeLessThanOrEqual(2);
  });

  it('17. getGraphStats returns per-religion entity and relation counts', async () => {
    const { getGraphStats } = db;

    const stats = await getGraphStats();

    expect(Array.isArray(stats)).toBe(true);
    expect(stats.length).toBeGreaterThanOrEqual(2);

    const bahaiStat = stats.find(s => s.religion === "Baha'i");
    const islamStat = stats.find(s => s.religion === 'Islam');

    expect(bahaiStat).toBeTruthy();
    expect(bahaiStat.entity_count).toBe(3);
    expect(bahaiStat.relation_count).toBe(2);

    expect(islamStat).toBeTruthy();
    expect(islamStat.entity_count).toBe(2);
    expect(islamStat.relation_count).toBe(1);
  });

  it('18. getEntityWithRelations returns entity + connected entities + relations', async () => {
    const { upsertEntity, getEntityWithRelations } = db;

    // Get Baha'u'llah id — re-upsert returns same id
    const id = await upsertEntity({ name: "Baha'u'llah", entityType: 'person', canonicalName: "Baha'u'llah", religion: "Baha'i" });

    const result = await getEntityWithRelations(id);

    expect(result).toBeTruthy();
    expect(result.entity).toBeTruthy();
    expect(result.entity.name).toBe("Baha'u'llah");
    expect(Array.isArray(result.relations)).toBe(true);
    expect(Array.isArray(result.connectedEntities)).toBe(true);

    // Should have 2 outgoing relations (preceded_by Bab, exiled_to Akka)
    expect(result.relations.length).toBe(2);
    // Connected entities should include The Bab and Akka
    expect(result.connectedEntities.length).toBe(2);
  });
});
