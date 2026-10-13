// copies-repo — identical copies of a paragraph across the library (same normalized_hash), for citation links that must
// point at the best PUBLISHER of the text, not whichever copy search found (Chad 10-12: OceanLibrary → Ocean of Lights →
// Phelps → bahai-library → siftersearch, "a universal requirement for all citation links"). Uses idx_content_normalized_hash
// (partial: embedded rows — nearly every live paragraph). Deps: db.js.
import { queryAll } from '../db.js';

/** paragraph ids → their live identical copies in other documents, with what a link needs. Bounded: ≤ 40 copies per text. */
export async function identicalCopies(paragraphIds) {
  const ids = [...new Set((paragraphIds || []).map(Number).filter(Boolean))].slice(0, 500);
  if (!ids.length) return new Map();
  const own = await queryAll(`SELECT id, normalized_hash h FROM content WHERE id IN (${ids.map(() => '?').join(',')}) AND normalized_hash IS NOT NULL AND LENGTH(text) >= 40`,
    ids, 'copies:hashes');
  const hashes = [...new Set(own.map((r) => r.h))];
  if (!hashes.length) return new Map();
  const rows = await queryAll(`SELECT c.id, c.normalized_hash h, c.doc_id, c.paragraph_index, c.text, c.external_para_id, c.block_attrs,
      d.title, d.source_url, d.metadata, d.external_id, d.religion, d.collection, d.slug, d.filename, d.source_site
    FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE c.normalized_hash IN (${hashes.map(() => '?').join(',')}) AND c.embedding IS NOT NULL
      AND c.deleted_at IS NULL AND d.deleted_at IS NULL LIMIT ${Math.min(40 * hashes.length, 4000)}`, hashes, 'copies:identical');
  const byHash = new Map();
  for (const r of rows) { const list = byHash.get(r.h) || []; if (list.length < 40) list.push(r); byHash.set(r.h, list); }
  return new Map(own.map((o) => [o.id, (byHash.get(o.h) || []).filter((c) => c.id !== o.id)]));
}
