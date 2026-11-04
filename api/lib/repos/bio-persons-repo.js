// The biography person list's reads (bio.js listBioPersons): book grounding per entity, the live person rows, minted
// slugs. Run on a read-pool thread (search/read-pool.js 'bio:persons'): together ~340 ms of synchronous SQLite on prod
// (standalone repro 11-04), once per process per 5 min, inside a people search. Deps: db.js, entity-live, bio-slug-repo.
import { queryAll } from '../db.js';
import { LIVE_SQL } from '../entity-live.js';
import { slugsFor } from './bio-slug-repo.js';

/** books: [{ key, docs:[doc ids] }] → { bookOf: { entity_id: [book keys] }, rows: [person rows], slugs: [[id, slug]] } */
export async function bioPersonRows(books = []) {
  const bookOf = {};
  for (const b of books) {
    const ph = b.docs.map(() => '?').join(',');
    const ents = await queryAll(
      `SELECT DISTINCT entity_id FROM entity_mentions_v2 WHERE doc_id IN (${ph}) AND entity_id IS NOT NULL
       UNION SELECT DISTINCT entity_id FROM entity_claims WHERE doc_id IN (${ph}) AND entity_id IS NOT NULL`,
      [...b.docs, ...b.docs], 'bio:book-entities');
    for (const e of ents) (bookOf[e.entity_id] ||= []).push(b.key);
  }
  const rows = await queryAll(`SELECT ge.id, ge.canonical_name AS name, ge.importance,
      er.side, er.summary, er.aliases, er.kinship, er.research_notes
    FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name
    WHERE ge.entity_type = 'person' AND ge.religion = ''
      AND ${LIVE_SQL('ge.')}
    ORDER BY (ge.importance IS NULL), ge.importance DESC, ge.canonical_name`, [], 'bio:persons');
  const slugs = [...(await slugsFor(rows.map((r) => r.id)).catch(() => new Map()))];   // minted slugs only
  return { bookOf, rows, slugs };
}
