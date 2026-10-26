// Bounded, read-only biography identity inspection. Used only by server reports.
import { queryAll } from '../db.js';
import { LIVE_SQL } from '../entity-live.js';
export async function biographyNameAudit(terms = []) {
  const names = [...new Set(terms.map(s=>String(s).trim()).filter(s=>s.length>=3))].slice(0,10);
  if (!names.length) return [];
  const where = names.map(()=>'(ge.canonical_name LIKE ? OR ge.name LIKE ? OR er.aliases LIKE ?)').join(' OR ');
  const args = names.flatMap(n=>Array(3).fill(`%${n.replace(/[%_]/g,'')}%`));
  const rows = await queryAll(`SELECT ge.id, ge.canonical_name AS name, ge.slug, ge.religion, ge.importance, er.aliases, er.summary,
    (SELECT COUNT(*) FROM entity_claims c WHERE c.entity_id=ge.id AND (c.status IS NULL OR c.status='supported')) AS claims,
    (SELECT COUNT(*) FROM entity_mentions_v2 m WHERE m.entity_id=ge.id AND m.status='active') AS mentions
    FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name AND er.entity_type='person'
    WHERE ge.entity_type='person' AND ${LIVE_SQL('ge.')} AND (${where})
    ORDER BY claims DESC, mentions DESC, ge.id LIMIT 200`, args, 'media:biography-name-audit');
  for (const row of rows) row.evidence = await queryAll(`SELECT relation, statement, proof_verbatim AS proof, doc_id
    FROM entity_claims WHERE entity_id=? AND (status IS NULL OR status='supported')
    ORDER BY CASE WHEN lower(statement) LIKE '%hand of the cause%' THEN 0 ELSE 1 END, doc_id LIMIT 3`, [row.id], 'media:biography-name-evidence');
  return rows;
}

/** Link candidates across all books/religions, including NULL religion. Evidence
 * is required; ungrounded extraction artifacts and merged records stay out. */
export async function listMediaBiographyPersons(){
 const rows=await queryAll(`SELECT ge.id, ge.canonical_name AS name, ge.slug, er.aliases
  FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name AND er.entity_type='person'
  WHERE ge.entity_type='person' AND ${LIVE_SQL('ge.')} AND (
   EXISTS (SELECT 1 FROM entity_claims c WHERE c.entity_id=ge.id AND (c.status IS NULL OR c.status='supported')) OR
   EXISTS (SELECT 1 FROM entity_mentions_v2 m WHERE m.entity_id=ge.id AND m.status='active'))
  ORDER BY ge.id LIMIT 100001`,[],'media:biography-link-candidates');
 if(rows.length>100000)throw Error('Biography link candidate bound exceeded');
 return rows;
}
