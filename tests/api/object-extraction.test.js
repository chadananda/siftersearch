/**
 * Object Extraction and Entity Resolution Tests
 *
 * TDD: Written FIRST. Must ALL be RED (failing) before implementation.
 * Tests cover: object extraction prompts/parsers, entity resolution with
 * conservative cross-religion merge rules, and in-memory graph DB operations.
 *
 * Modules under test (DO NOT EXIST YET):
 *   api/lib/object-extraction.js
 *   api/lib/entity-resolution.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';

// ==========================================================================
// Object Extraction Prompts and Parsers
// ==========================================================================

describe('Object Extraction Prompts', () => {
  const doc = {
    title: 'Kitáb-i-Íqán',
    author: "Bahá'u'lláh",
    religion: "Baha'i",
    collection: 'Core Publications',
    year: 1861,
    language: 'en'
  };
  const paragraph = {
    id: 1,
    text: 'The Báb declared His mission in Shiraz...',
    paragraph_index: 5
  };

  it('should export buildObjectExtractionPrompt function', async () => {
    const { buildObjectExtractionPrompt } = await import('../../api/lib/object-extraction.js');
    expect(typeof buildObjectExtractionPrompt).toBe('function');
  });

  it('buildObjectExtractionPrompt returns object with systemPrompt and userPrompt', async () => {
    const { buildObjectExtractionPrompt } = await import('../../api/lib/object-extraction.js');
    const result = buildObjectExtractionPrompt(paragraph, doc);
    expect(result).toBeTruthy();
    expect(typeof result.systemPrompt).toBe('string');
    expect(typeof result.userPrompt).toBe('string');
  });

  it('systemPrompt contains document metadata for tradition scoping', async () => {
    const { buildObjectExtractionPrompt } = await import('../../api/lib/object-extraction.js');
    const { systemPrompt } = buildObjectExtractionPrompt(paragraph, doc);
    expect(systemPrompt).toContain("Baha'i");
    expect(systemPrompt).toContain("Bahá'u'lláh");
    expect(systemPrompt).toContain('1861');
  });

  it('systemPrompt instructs JSON output with all 6 required arrays', async () => {
    const { buildObjectExtractionPrompt } = await import('../../api/lib/object-extraction.js');
    const { systemPrompt } = buildObjectExtractionPrompt(paragraph, doc);
    expect(systemPrompt).toMatch(/people/i);
    expect(systemPrompt).toMatch(/places/i);
    expect(systemPrompt).toMatch(/documents/i);
    expect(systemPrompt).toMatch(/events/i);
    expect(systemPrompt).toMatch(/concepts/i);
    expect(systemPrompt).toMatch(/relations/i);
  });

  it('userPrompt contains the paragraph text', async () => {
    const { buildObjectExtractionPrompt } = await import('../../api/lib/object-extraction.js');
    const { userPrompt } = buildObjectExtractionPrompt(paragraph, doc);
    expect(userPrompt).toContain(paragraph.text);
  });

  it('parseObjectResponse returns structured object with all 6 arrays for valid JSON', async () => {
    const { parseObjectResponse } = await import('../../api/lib/object-extraction.js');
    const validJSON = JSON.stringify({
      people: [{ name: 'The Báb', description: 'Herald of the Baha\'i Faith' }],
      places: [{ name: 'Shiraz', description: 'City in Persia' }],
      documents: [],
      events: [{ name: 'Declaration of the Báb', description: 'Mission declaration in 1844' }],
      concepts: [{ name: 'Progressive Revelation', description: 'Core Baha\'i principle' }],
      relations: [{ from: 'The Báb', to: 'Shiraz', description: 'declared mission in' }]
    });
    const result = parseObjectResponse(validJSON);
    expect(result).toBeTruthy();
    expect(Array.isArray(result.people)).toBe(true);
    expect(Array.isArray(result.places)).toBe(true);
    expect(Array.isArray(result.documents)).toBe(true);
    expect(Array.isArray(result.events)).toBe(true);
    expect(Array.isArray(result.concepts)).toBe(true);
    expect(Array.isArray(result.relations)).toBe(true);
    expect(result.people.length).toBe(1);
    expect(result.relations.length).toBe(1);
  });

  it('parseObjectResponse handles markdown code fences', async () => {
    const { parseObjectResponse } = await import('../../api/lib/object-extraction.js');
    const fenced = '```json\n{"people":[{"name":"The Báb","description":"Herald"}],"places":[],"documents":[],"events":[],"concepts":[],"relations":[]}\n```';
    const result = parseObjectResponse(fenced);
    expect(result).toBeTruthy();
    expect(result.people[0].name).toBe('The Báb');
  });

  it('parseObjectResponse returns null for empty input', async () => {
    const { parseObjectResponse } = await import('../../api/lib/object-extraction.js');
    expect(parseObjectResponse('')).toBeNull();
    expect(parseObjectResponse(null)).toBeNull();
    expect(parseObjectResponse(undefined)).toBeNull();
  });

  it('parseObjectResponse returns null for invalid JSON', async () => {
    const { parseObjectResponse } = await import('../../api/lib/object-extraction.js');
    expect(parseObjectResponse('not json at all')).toBeNull();
    expect(parseObjectResponse('{broken')).toBeNull();
  });

  it('parseObjectResponse normalizes missing arrays to empty arrays', async () => {
    const { parseObjectResponse } = await import('../../api/lib/object-extraction.js');
    // Only people present — all others must default to []
    const partial = JSON.stringify({ people: [{ name: 'The Báb', description: 'Herald' }] });
    const result = parseObjectResponse(partial);
    expect(result).toBeTruthy();
    expect(Array.isArray(result.places)).toBe(true);
    expect(result.places).toEqual([]);
    expect(Array.isArray(result.documents)).toBe(true);
    expect(result.documents).toEqual([]);
    expect(Array.isArray(result.events)).toBe(true);
    expect(result.events).toEqual([]);
    expect(Array.isArray(result.concepts)).toBe(true);
    expect(result.concepts).toEqual([]);
    expect(Array.isArray(result.relations)).toBe(true);
    expect(result.relations).toEqual([]);
  });

  it('renderObjectsForPrompt returns deterministic text (same input → same output)', async () => {
    const { renderObjectsForPrompt } = await import('../../api/lib/object-extraction.js');
    const objects = {
      people: [{ name: 'The Báb', description: 'Herald' }],
      places: [{ name: 'Shiraz', description: 'City' }],
      documents: [],
      events: [],
      concepts: [],
      relations: [{ from: 'The Báb', to: 'Shiraz', description: 'declared in' }]
    };
    const first = renderObjectsForPrompt(objects);
    const second = renderObjectsForPrompt(objects);
    expect(first).toBe(second);
    expect(typeof first).toBe('string');
    expect(first.length).toBeGreaterThan(0);
  });

  it('renderObjectsForPrompt includes entity names, types, and relation descriptions', async () => {
    const { renderObjectsForPrompt } = await import('../../api/lib/object-extraction.js');
    const objects = {
      people: [{ name: 'The Báb', description: 'Herald of the Baha\'i Faith' }],
      places: [{ name: 'Shiraz', description: 'City in Persia' }],
      documents: [],
      events: [],
      concepts: [],
      relations: [{ from: 'The Báb', to: 'Shiraz', description: 'declared mission in' }]
    };
    const rendered = renderObjectsForPrompt(objects);
    expect(rendered).toContain('The Báb');
    expect(rendered).toContain('Shiraz');
    expect(rendered).toContain('declared mission in');
  });

  it('renderObjectsForPrompt uses sorted keys for deterministic serialization', async () => {
    const { renderObjectsForPrompt } = await import('../../api/lib/object-extraction.js');
    // Objects with keys in different insertion orders must produce identical output
    const objectsA = { people: [{ name: 'A', description: 'desc' }], places: [], documents: [], events: [], concepts: [], relations: [] };
    const objectsB = { relations: [], concepts: [], events: [], documents: [], places: [], people: [{ name: 'A', description: 'desc' }] };
    expect(renderObjectsForPrompt(objectsA)).toBe(renderObjectsForPrompt(objectsB));
  });

  it('renderObjectsForMeili returns flattened searchable strings', async () => {
    const { renderObjectsForMeili } = await import('../../api/lib/object-extraction.js');
    const objects = {
      people: [{ name: 'The Báb', description: 'Herald' }],
      places: [{ name: 'Shiraz', description: 'City' }],
      documents: [],
      events: [],
      concepts: [{ name: 'Progressive Revelation', description: 'Core principle' }],
      relations: [{ from: 'The Báb', to: 'Shiraz', description: 'declared mission in' }]
    };
    const result = renderObjectsForMeili(objects);
    expect(typeof result).toBe('string');
    expect(result).toContain('The Báb');
    expect(result).toContain('Shiraz');
    expect(result).toContain('Progressive Revelation');
    expect(result).toContain('declared mission in');
  });

  it('renderObjectsForMeili returns space-separated text (no JSON structure)', async () => {
    const { renderObjectsForMeili } = await import('../../api/lib/object-extraction.js');
    const objects = {
      people: [{ name: 'The Báb', description: 'Herald' }],
      places: [],
      documents: [],
      events: [],
      concepts: [],
      relations: []
    };
    const result = renderObjectsForMeili(objects);
    // Should be plain text, not JSON
    expect(result).not.toContain('{');
    expect(result).not.toContain('[');
  });
});

// ==========================================================================
// Entity Resolution (conservative merge — interfaith library)
// ==========================================================================

// Create an isolated in-memory libsql client for each test
async function createGraphDb() {
  // libsql supports ":memory:" for an in-memory database
  const db = createClient({ url: ':memory:' });
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      canonical_name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      religion TEXT NOT NULL,
      mention_count INTEGER DEFAULT 1,
      source_doc_ids TEXT DEFAULT '[]',
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS entity_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_entity_id INTEGER NOT NULL,
      to_entity_id INTEGER NOT NULL,
      relation TEXT NOT NULL,
      doc_id INTEGER,
      paragraph_id INTEGER,
      FOREIGN KEY (from_entity_id) REFERENCES entities(id),
      FOREIGN KEY (to_entity_id) REFERENCES entities(id)
    );
  `);
  return db;
}

describe('Entity Resolution', () => {
  let graphDb;

  beforeEach(async () => {
    graphDb = await createGraphDb();
  });

  it('resolveEntity with no existing match creates new entity and returns { id, isNew: true }', async () => {
    const { resolveEntity } = await import('../../api/lib/entity-resolution.js');
    const result = await resolveEntity(
      { name: "Bahá'u'lláh", entityType: 'person', religion: "Baha'i" },
      graphDb
    );
    expect(result).toBeTruthy();
    expect(typeof result.id).toBe('number');
    expect(result.isNew).toBe(true);
  });

  it('resolveEntity with exact match returns existing entity and { id, isNew: false, merged: true }', async () => {
    const { resolveEntity } = await import('../../api/lib/entity-resolution.js');
    const entity = { name: "Bahá'u'lláh", entityType: 'person', religion: "Baha'i" };
    // First call creates
    const first = await resolveEntity(entity, graphDb);
    // Second call must find it
    const second = await resolveEntity(entity, graphDb);
    expect(second.id).toBe(first.id);
    expect(second.isNew).toBe(false);
    expect(second.merged).toBe(true);
  });

  it('same name + different religion creates TWO separate entities (never merge across religions)', async () => {
    const { resolveEntity } = await import('../../api/lib/entity-resolution.js');
    const christian = await resolveEntity(
      { name: 'Jesus', entityType: 'person', religion: 'Christian' },
      graphDb
    );
    const islamic = await resolveEntity(
      { name: 'Jesus', entityType: 'person', religion: 'Islam' },
      graphDb
    );
    expect(christian.id).not.toBe(islamic.id);
    expect(christian.isNew).toBe(true);
    expect(islamic.isNew).toBe(true);
  });

  it('same name + same religion + different entityType creates TWO separate entities', async () => {
    const { resolveEntity } = await import('../../api/lib/entity-resolution.js');
    const asPerson = await resolveEntity(
      { name: "Bahá'u'lláh", entityType: 'person', religion: "Baha'i" },
      graphDb
    );
    const asConcept = await resolveEntity(
      { name: "Bahá'u'lláh", entityType: 'concept', religion: "Baha'i" },
      graphDb
    );
    expect(asPerson.id).not.toBe(asConcept.id);
    expect(asPerson.isNew).toBe(true);
    expect(asConcept.isNew).toBe(true);
  });

  it('resolveEntity increments mention_count on merge', async () => {
    const { resolveEntity } = await import('../../api/lib/entity-resolution.js');
    const entity = { name: "Bahá'u'lláh", entityType: 'person', religion: "Baha'i" };
    const first = await resolveEntity(entity, graphDb);
    await resolveEntity(entity, graphDb);
    await resolveEntity(entity, graphDb);
    const row = await graphDb.execute({
      sql: 'SELECT mention_count FROM entities WHERE id = ?',
      args: [first.id]
    });
    expect(row.rows[0].mention_count).toBe(3);
  });

  it('resolveEntity appends doc_id to source_doc_ids array on merge', async () => {
    const { resolveEntity } = await import('../../api/lib/entity-resolution.js');
    const entity = { name: "Bahá'u'lláh", entityType: 'person', religion: "Baha'i" };
    await resolveEntity({ ...entity, docId: 101 }, graphDb);
    await resolveEntity({ ...entity, docId: 202 }, graphDb);
    // Calling again with same doc_id should not duplicate it
    const third = await resolveEntity({ ...entity, docId: 101 }, graphDb);
    const row = await graphDb.execute({
      sql: 'SELECT source_doc_ids FROM entities WHERE id = ?',
      args: [third.id]
    });
    const ids = JSON.parse(row.rows[0].source_doc_ids);
    expect(Array.isArray(ids)).toBe(true);
    expect(ids).toContain(101);
    expect(ids).toContain(202);
  });

  it('buildCanonicalName normalizes diacriticals for matching', async () => {
    const { buildCanonicalName } = await import('../../api/lib/entity-resolution.js');
    // Diacritical variants should produce the same canonical string
    const withDiacriticals = buildCanonicalName("Bahá'u'lláh");
    const withoutDiacriticals = buildCanonicalName("Baha'u'llah");
    expect(typeof withDiacriticals).toBe('string');
    expect(typeof withoutDiacriticals).toBe('string');
    expect(withDiacriticals).toBe(withoutDiacriticals);
  });

  it('buildCanonicalName is case-insensitive', async () => {
    const { buildCanonicalName } = await import('../../api/lib/entity-resolution.js');
    expect(buildCanonicalName('Shiraz')).toBe(buildCanonicalName('shiraz'));
    expect(buildCanonicalName('SHIRAZ')).toBe(buildCanonicalName('shiraz'));
  });

  it('buildCanonicalName trims whitespace', async () => {
    const { buildCanonicalName } = await import('../../api/lib/entity-resolution.js');
    expect(buildCanonicalName('  Shiraz  ')).toBe(buildCanonicalName('Shiraz'));
    expect(buildCanonicalName('\tThe Báb\n')).toBe(buildCanonicalName('The Bab'));
  });

  it('resolveEntitiesForParagraph processes all entity types and returns resolved IDs + relations', async () => {
    const { resolveEntitiesForParagraph } = await import('../../api/lib/entity-resolution.js');
    const extractedObjects = {
      people: [{ name: 'The Báb', description: "Herald of the Baha'i Faith" }],
      places: [{ name: 'Shiraz', description: 'City in Persia' }],
      documents: [],
      events: [{ name: 'Declaration of the Báb', description: 'Mission declaration' }],
      concepts: [{ name: 'Progressive Revelation', description: 'Core principle' }],
      relations: [{ from: 'The Báb', to: 'Shiraz', description: 'declared mission in' }]
    };
    const doc = { id: 1, religion: "Baha'i" };
    const result = await resolveEntitiesForParagraph(extractedObjects, doc, graphDb);
    expect(result).toBeTruthy();
    expect(Array.isArray(result.entityIds)).toBe(true);
    // Should have resolved people, places, events, concepts (4 entities minimum)
    expect(result.entityIds.length).toBeGreaterThanOrEqual(4);
    expect(Array.isArray(result.relations)).toBe(true);
  });

  it('resolveEntitiesForParagraph creates relation records in graph DB', async () => {
    const { resolveEntitiesForParagraph } = await import('../../api/lib/entity-resolution.js');
    const extractedObjects = {
      people: [{ name: 'The Báb', description: 'Herald' }],
      places: [{ name: 'Shiraz', description: 'City' }],
      documents: [],
      events: [],
      concepts: [],
      relations: [{ from: 'The Báb', to: 'Shiraz', description: 'declared mission in' }]
    };
    const doc = { id: 1, religion: "Baha'i" };
    await resolveEntitiesForParagraph(extractedObjects, doc, graphDb);
    const rows = await graphDb.execute('SELECT * FROM entity_relations');
    expect(rows.rows.length).toBeGreaterThan(0);
    expect(rows.rows[0].relation).toBe('declared mission in');
  });
});
