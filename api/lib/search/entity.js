// Entity-mentions Meilisearch sidecar. The entity_mentions_idx holds one
// document per resolved entity mention, each pointing back to its paragraph.
// `searchByEntity` lets Jafar filter results to paragraphs featuring a
// resolved entity — a much sharper signal than surface-string keyword matching.
// `syncEntityMentionsBatch` pushes freshly resolved mentions to the index.
// Follows the hype.js sidecar pattern (deps injected; re-exported from search.js).

import { logger } from '../logger.js';
import { effectiveAuthor } from '../authorship/effective.js';

/**
 * Search the entity-mentions sidecar by resolved entity IDs.
 * Returns ranked paragraph_ids that feature at least one of the requested entities.
 *
 * @param {{ getMeili: Function, INDEXES: object }} deps
 * @param {number[]} entityIds - resolved entity IDs to filter on
 * @param {{ limit?: number, filters?: object }} options
 */
// The entity layer reads SQLite directly (Meilisearch retired 10-20, Chad): mentions by entity_id, each scored by its
// paragraph's effective author's authority (the same score the Meili sidecar stored), highest first.
export async function searchByEntity({ getAuthority = null, mentions = null } = {}, entityIds, options = {}) {
  if (!entityIds?.length) return { hits: [] };
  const { limit = 20, filters = {} } = options;
  try {
    const rows = await (mentions || (await import('../repos/entity-mentions-repo.js')).mentionsForEntities)(entityIds, {
      religion: filters.religion || null, role: filters.role || null, docId: filters.doc_id || null, notEncumbered: filters.encumbered === false });
    const auth = getAuthority || (await import('../authority.js')).getAuthority;
    const hits = rows.map((row) => {
      let authority = 0;
      try { authority = auth({ author: effectiveAuthor(row).author, title: row.title }) || 0; } catch { authority = 0; }
      return { id: row.mention_id, paragraph_id: row.paragraph_id, entity_id: row.entity_id, entity_canonical_name: row.entity_canonical_name,
        role: row.role || null, doc_id: row.doc_id, religion: row.religion || null, authority, encumbered: row.encumbered ? 1 : 0 };
    }).sort((a, b) => b.authority - a.authority).slice(0, limit);
    return { hits };
  } catch (err) {
    logger.warn({ err: err.message, entityIds }, 'Entity mention search failed');
    return { hits: [] };
  }
}

/**
 * Sync a batch of freshly resolved entity_mentions to the sidecar index.
 * Reads from entity_mentions JOIN graph_entities JOIN content WHERE em_synced=0.
 *
 * @param {{ getMeili: Function, INDEXES: object }} deps
 * @param {{ queryAll: Function, query: Function, getAuthority: Function, limit?: number }} opts
 */
export async function syncEntityMentionsBatch({ getMeili, INDEXES }, { queryAll, query, getAuthority, limit = 200 } = {}) {
  if (!queryAll || !query) throw new Error('syncEntityMentionsBatch requires queryAll and query');
  const meili = getMeili();
  if (!meili) return { processed: 0, indexed: 0, errors: 0, skipped: 'meili-unavailable' };

  const rows = await queryAll(`
    SELECT em.id AS mention_id, em.entity_id, em.content_id AS paragraph_id, em.role,
           ge.canonical_name AS entity_canonical_name, ge.entity_type,
           c.doc_id, d.religion, d.collection, d.encumbered, d.title, d.author,
           c.para_meta, c.authors
    FROM entity_mentions em
    JOIN graph_entities ge ON ge.id = em.entity_id
    JOIN content c ON c.id = em.content_id
    JOIN docs d ON d.id = c.doc_id
    WHERE em.em_synced = 0
      AND em.status = 'resolved'
      AND c.deleted_at IS NULL
      AND d.deleted_at IS NULL
    ORDER BY em.id
    LIMIT ?
  `, [limit]);

  if (rows.length === 0) return { processed: 0, indexed: 0, errors: 0 };

  const docs = rows.map(row => {
    const effectiveAuthorName = effectiveAuthor(row).author;
    let authority = 0;
    try { authority = getAuthority ? getAuthority({ author: effectiveAuthorName, title: row.title }) : 0; }
    catch { authority = 0; }

    return {
      id: row.mention_id,
      entity_id: row.entity_id,
      entity_canonical_name: row.entity_canonical_name,
      entity_type: row.entity_type || null,
      paragraph_id: row.paragraph_id,
      doc_id: row.doc_id,
      role: row.role || null,
      religion: row.religion || null,
      collection: row.collection || null,
      authority,
      encumbered: row.encumbered ? 1 : 0,
    };
  });

  try {
    await meili.index(INDEXES.ENTITY_MENTIONS).addDocuments(docs, { primaryKey: 'id' });
  } catch (err) {
    logger.error({ err: err.message, count: docs.length }, 'Entity mentions sync: addDocuments failed');
    return { processed: 0, indexed: 0, errors: rows.length };
  }

  const ids = rows.map(r => r.mention_id);
  const placeholders = ids.map(() => '?').join(',');
  await query(`UPDATE entity_mentions SET em_synced = 1 WHERE id IN (${placeholders})`, ids);

  logger.info({ indexed: docs.length }, 'Entity mentions sidecar sync batch complete');
  return { processed: rows.length, indexed: docs.length, errors: 0 };
}
