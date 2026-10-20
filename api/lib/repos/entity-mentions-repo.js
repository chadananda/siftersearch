// Entity mentions for search (the entity layer) — read from SQLite by entity_id (idx_em_entity), replacing the Meilisearch
// entity_mentions sidecar (Meilisearch retired 10-20, Chad). Bounded: at most `cap` rows per call. Deps: db.js.
import { queryAll } from '../db.js';

/** → [{ mention_id, entity_id, paragraph_id, role, entity_canonical_name, doc_id, religion, collection, encumbered, title, author, para_meta, authors }] */
export async function mentionsForEntities(entityIds, { religion = null, role = null, docId = null, notEncumbered = false, cap = 2000 } = {}) {
  const ids = [...new Set((entityIds || []).map(Number).filter(Number.isInteger))].slice(0, 50);
  if (!ids.length) return [];
  const where = [`em.entity_id IN (${ids.map(() => '?').join(',')})`, "em.status = 'resolved'", 'c.deleted_at IS NULL', 'd.deleted_at IS NULL'];
  const args = [...ids];
  if (religion) { where.push('d.religion = ?'); args.push(religion); }
  if (role) { where.push('em.role = ?'); args.push(role); }
  if (docId) { where.push('c.doc_id = ?'); args.push(Number(docId)); }
  if (notEncumbered) where.push('COALESCE(d.encumbered, 0) = 0');
  return queryAll(`
    SELECT em.id AS mention_id, em.entity_id, em.content_id AS paragraph_id, em.role, ge.canonical_name AS entity_canonical_name,
           c.doc_id, d.religion, d.collection, d.encumbered, d.title, d.author, c.para_meta, c.authors
      FROM entity_mentions em JOIN graph_entities ge ON ge.id = em.entity_id
      JOIN content c ON c.id = em.content_id JOIN docs d ON d.id = c.doc_id
     WHERE ${where.join(' AND ')}
     LIMIT ?`, [...args, Number(cap)], 'entity-mentions:for-entities');
}
