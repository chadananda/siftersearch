// source-links-repo — quote → source links (content_source_links, migration 139) for the citation work
// (planning/citation-links-plan.md). Read: coverage per compilation. Deps: db.js.
import { queryAll } from '../db.js';

// the doctrinal writers whose words compilations quote (paragraph voices are in content.authors, JSON names)
export const WRITER_LIKE = { "Bahá'u'lláh": '%Bah%u%ll%h%', 'The Báb': '%The B%b%', "'Abdu'l-Bahá": '%Abdu%l-Bah%', 'Shoghi Effendi': '%Shoghi Effendi%' };

/** Per compilation: prose paragraphs, those voicing each writer, and how many of those have a source link. Paged by document. */
export async function sourceLinkCoverage({ collectionLike = ['%Compilation%'], religion = "Baha'i", docIds = null } = {}) {
  const docs = docIds?.length
    ? await queryAll(`SELECT id, title, collection FROM docs WHERE id IN (${docIds.map(() => '?').join(',')})`, docIds, 'source-links:docs')
    : await queryAll(`SELECT id, title, collection FROM docs WHERE religion = ? AND deleted_at IS NULL AND duplicate_of IS NULL
        AND (${collectionLike.map(() => 'collection LIKE ?').join(' OR ')})`, [religion, ...collectionLike], 'source-links:docs');
  const out = [];
  for (const d of docs) {
    const voices = Object.entries(WRITER_LIKE).map(([, like]) => `SUM(c.authors LIKE '${like.replace(/'/g, "''")}')`).join(', ');
    const linkedVoices = Object.entries(WRITER_LIKE).map(([, like]) => `SUM(c.authors LIKE '${like.replace(/'/g, "''")}' AND EXISTS (SELECT 1 FROM content_source_links l WHERE l.quote_id = c.id))`).join(', ');
    const [r] = await queryAll(`SELECT COUNT(*) AS paras, SUM(EXISTS (SELECT 1 FROM content_source_links l WHERE l.quote_id = c.id)) AS linked, ${voices}, ${linkedVoices}
      FROM content c WHERE c.doc_id = ? AND c.deleted_at IS NULL AND COALESCE(c.blocktype, 'paragraph') IN ('paragraph', 'quote')`, [d.id], 'source-links:coverage');
    const vals = Object.values(r);
    const names = Object.keys(WRITER_LIKE);
    out.push({ id: d.id, title: d.title, collection: d.collection, paras: r.paras, linked: r.linked || 0,
      writers: Object.fromEntries(names.map((n, i) => [n, { paras: vals[2 + i] || 0, linked: vals[2 + names.length + i] || 0 }])) });
    await new Promise((res) => setImmediate(res));
  }
  return out;
}
