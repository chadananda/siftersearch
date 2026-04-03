/**
 * Entity Resolution — conservative merge for interfaith entity graph.
 *
 * Merge rules (CRITICAL):
 *   - Same (canonical_name, entity_type, religion) → merge (increment mention_count)
 *   - Different religion → NEVER merge
 *   - Different entity_type → NEVER merge
 *
 * Functions accept an optional db handle for test injection.
 * When db is omitted, uses module-level query/queryOne from db.js.
 */

import { query as _query, queryOne as _queryOne } from './db.js';

// ─── DB helpers ───────────────────────────────────────────────────────────────

function qo(db, sql, params = []) {
  if (db?.queryOne) return db.queryOne(sql, params);
  return _queryOne(sql, params);
}
function q(db, sql, params = []) {
  if (db?.query) return db.query(sql, params);
  return _query(sql, params);
}

// ─── Canonical Name ───────────────────────────────────────────────────────────

/**
 * Normalize a name for entity matching.
 * Strips diacriticals via NFD decomposition, lowercases, trims whitespace.
 */
export function buildCanonicalName(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .trim();
}

// ─── Core Resolution ──────────────────────────────────────────────────────────

/**
 * Resolve an entity against the graph DB.
 * Creates new entity if no match; merges (increments mention_count) on match.
 *
 * @param {object} opts - { name, entityType, religion, language, era, description, docId }
 * @param {object} [db] - optional db handle for test injection
 * @returns {Promise<{ id: number, isNew: boolean, merged: boolean }>}
 */
export async function resolveEntity({ name, entityType, religion = '', language, era, description, docId }, db) {
  const canonical = buildCanonicalName(name);
  const existing = await qo(db,
    'SELECT id, source_doc_ids FROM entities WHERE canonical_name = ? AND entity_type = ? AND religion = ?',
    [canonical, entityType, religion]
  );
  if (existing) {
    const id = Number(existing.id);
    let docIds = [];
    try { docIds = JSON.parse(existing.source_doc_ids || '[]'); } catch { docIds = []; }
    if (docId != null && !docIds.includes(docId)) docIds.push(docId);
    await q(db,
      'UPDATE entities SET mention_count = mention_count + 1, source_doc_ids = ? WHERE id = ?',
      [JSON.stringify(docIds), id]
    );
    return { id, isNew: false, merged: true };
  }
  // Insert new entity
  const initialDocIds = docId != null ? JSON.stringify([docId]) : '[]';
  const result = await q(db,
    `INSERT INTO entities (name, canonical_name, entity_type, religion, source_doc_ids) VALUES (?, ?, ?, ?, ?)`,
    [name, canonical, entityType, religion, initialDocIds]
  );
  return { id: Number(result.lastInsertRowid), isNew: true, merged: false };
}

// ─── Paragraph-level Resolution ──────────────────────────────────────────────

/**
 * Resolve all entities from an extracted objects payload and insert relations.
 *
 * @param {object} extractedObjects - { people, places, documents, events, concepts, relations }
 * @param {object} doc              - { id, religion }
 * @param {object} [db]             - optional db handle for test injection
 * @returns {Promise<{ entityIds: number[], relations: object[] }>}
 */
export async function resolveEntitiesForParagraph(extractedObjects, doc, db) {
  const religion = doc.religion || '';
  const docId = doc.id ?? null;
  const nameToId = new Map();
  const entityIds = [];
  const typeMappings = [
    ['people', 'person'],
    ['places', 'place'],
    ['documents', 'document'],
    ['events', 'event'],
    ['concepts', 'concept']
  ];
  for (const [key, entityType] of typeMappings) {
    const items = extractedObjects[key] ?? [];
    for (const item of items) {
      const { id } = await resolveEntity({ name: item.name, entityType, religion, description: item.description, docId }, db);
      entityIds.push(id);
      nameToId.set(buildCanonicalName(item.name), id);
    }
  }
  // Insert relations
  const relations = [];
  const rawRelations = extractedObjects.relations ?? [];
  for (const rel of rawRelations) {
    const fromId = nameToId.get(buildCanonicalName(rel.from));
    const toId = nameToId.get(buildCanonicalName(rel.to));
    if (fromId == null || toId == null) continue;
    await q(db,
      'INSERT INTO entity_relations (from_entity_id, to_entity_id, relation, doc_id) VALUES (?, ?, ?, ?)',
      [fromId, toId, rel.description || rel.relation || '', docId]
    );
    relations.push({ from: rel.from, to: rel.to, description: rel.description, fromId, toId });
  }
  return { entityIds, relations };
}
