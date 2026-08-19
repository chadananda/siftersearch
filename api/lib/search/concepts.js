// concepts/index sync — push concept_entities into Meili so a concept is searchable in its own right.
//
// The payoff this exists for (conceptual-track §6): a reader asks about "the Covenant", "grace", or "the
// Word" and reaches the corresponding concept in EACH tradition, in that tradition's own terms. That needs
// concepts as first-class searchable records, not only as claims hanging off paragraphs.
//
// Identity is the ROOT, not the English label. One English word collapses distinct concepts — insáf (انصاف,
// personal equity) and ‘adl (عدل, societal justice) both gloss "justice" — so the root is indexed and
// searchable alongside the canonical, exactly as a person's identity is the Arabic-script name rather than
// the romanization.
import { getMeili, INDEXES } from '../search.js';
import { queryAll } from '../db.js';

export const CONCEPT_SELECT = `
  SELECT id, canonical, root, renderings, concept_type, tradition, importance, summary
    FROM concept_entities`;

/** DB row → the neutral index document. Pure, so the shape is testable without Meili or a DB. */
export function conceptDoc(row) {
  let renderings = row?.renderings;
  if (typeof renderings === 'string') {
    try { renderings = JSON.parse(renderings); } catch { renderings = [renderings]; }
  }
  return {
    id: row.id,
    canonical: row.canonical || '',
    root: row.root || null,
    // Flattened to a string: Meili searches strings, and the spectrum of renderings is exactly what makes a
    // concept findable by whichever word the reader happens to know.
    renderings: Array.isArray(renderings) ? renderings.filter(Boolean).join(' · ') : (renderings || null),
    concept_type: row.concept_type || 'concept',
    tradition: row.tradition || null,
    importance: typeof row.importance === 'number' ? row.importance : null,
    summary: row.summary || null,
  };
}

/**
 * Push every concept entity into the index. Small table (concepts are entities, not paragraphs), so this is a
 * full refresh rather than a dirty-flag cycle — and a full refresh cannot develop the drift that left
 * `context` unsynced for a month when its flag lost its consumer.
 * @returns {Promise<{indexed:number, taskUid?:number, skipped?:string}>}
 */
export async function syncConcepts({ limit = 20000 } = {}) {
  const rows = await queryAll(`${CONCEPT_SELECT} LIMIT ?`, [limit], 'concepts:sync-read');
  // Ensure the index EXISTS even with nothing to write. Meili creates an index lazily on first document
  // write, so an empty concepts table left the index absent — a query for it 404s rather than returning
  // "no results", and the settings registered in search.js had nothing to attach to. Verified: the API had
  // restarted after those settings shipped and the index still did not exist. Don't depend on startup-loop
  // timing for something a caller can guarantee directly.
  try {
    await getMeili().createIndex(INDEXES.CONCEPTS, { primaryKey: 'id' });
  } catch (err) {
    if (!/already exists|index_already_exists/i.test(err?.message || '')) throw err;
  }
  if (!rows.length) return { indexed: 0, skipped: 'no concept entities yet', indexReady: true };
  const docs = rows.map(conceptDoc);
  const task = await getMeili().index(INDEXES.CONCEPTS).addDocuments(docs, { primaryKey: 'id' });
  return { indexed: docs.length, taskUid: task?.taskUid };
}
