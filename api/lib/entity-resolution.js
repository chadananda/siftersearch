/**
 * Entity Resolution — conservative merge for interfaith entity graph.
 *
 * Merge rules (CRITICAL):
 *   - Same (canonical_name, entity_type, religion) → merge (increment mention_count)
 *   - Different religion → NEVER merge
 *   - Different entity_type → NEVER merge
 *
 * Works with a libsql client exposing `execute` and `executeMultiple`.
 * The DB schema is caller-supplied (tests use `entities` / `entity_relations`).
 */

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
 * @param {object} db   - libsql client (or compatible) with .execute()
 * @returns {Promise<{ id: number, isNew: boolean, merged: boolean }>}
 */
export async function resolveEntity({ name, entityType, religion = '', language, era, description, docId }, db) {
  const canonical = buildCanonicalName(name);
  // Look for existing entity with same (canonical_name, entity_type, religion)
  const existing = await db.execute({
    sql: 'SELECT id, source_doc_ids FROM entities WHERE canonical_name = ? AND entity_type = ? AND religion = ?',
    args: [canonical, entityType, religion]
  });
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    const id = Number(row.id);
    // Merge: increment mention_count, append docId if provided
    let docIds = [];
    try { docIds = JSON.parse(row.source_doc_ids || '[]'); } catch { docIds = []; }
    if (docId != null && !docIds.includes(docId)) docIds.push(docId);
    await db.execute({
      sql: 'UPDATE entities SET mention_count = mention_count + 1, source_doc_ids = ? WHERE id = ?',
      args: [JSON.stringify(docIds), id]
    });
    return { id, isNew: false, merged: true };
  }
  // Insert new entity
  const initialDocIds = docId != null ? JSON.stringify([docId]) : '[]';
  const result = await db.execute({
    sql: `INSERT INTO entities (name, canonical_name, entity_type, religion, source_doc_ids)
          VALUES (?, ?, ?, ?, ?)`,
    args: [name, canonical, entityType, religion, initialDocIds]
  });
  return { id: Number(result.lastInsertRowid), isNew: true, merged: false };
}

// ─── Paragraph-level Resolution ──────────────────────────────────────────────

/**
 * Resolve all entities from an extracted objects payload and insert relations.
 *
 * @param {object} extractedObjects - { people, places, documents, events, concepts, relations }
 * @param {object} doc              - { id, religion }
 * @param {object} db               - libsql client
 * @returns {Promise<{ entityIds: number[], relations: object[] }>}
 */
export async function resolveEntitiesForParagraph(extractedObjects, doc, db) {
  const religion = doc.religion || '';
  const docId = doc.id ?? null;
  const nameToId = new Map();
  const entityIds = [];
  // Entity type mappings: arrays to entity_type strings
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
      // Map by normalized name for relation lookup
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
    await db.execute({
      sql: 'INSERT INTO entity_relations (from_entity_id, to_entity_id, relation, doc_id) VALUES (?, ?, ?, ?)',
      args: [fromId, toId, rel.description || rel.relation || '', docId]
    });
    relations.push({ from: rel.from, to: rel.to, description: rel.description, fromId, toId });
  }
  return { entityIds, relations };
}
