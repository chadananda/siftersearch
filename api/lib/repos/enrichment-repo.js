// enrichment-repo — what derived work hangs off given paragraph rows (so a re-ingest that would replace them can be
// weighed first): HyPE questions, translations, CTAI originals, alignment links, entity mentions (v2 + graph).
// Read-only. Callers: ops report reingest-impact. Deps: db.js.
import { queryOne, queryAll, graphQueryOne } from '../db.js';

/** Counts over the given content ids (any size; chunked). */
export async function enrichmentOnRows(ids) {
  const tot = { rows: ids.length, hype: 0, translation: 0, original_text: 0, alignment_links: 0, mentions_v2: 0, graph_mentions: 0 };
  for (let i = 0; i < ids.length; i += 500) {
    const ch = ids.slice(i, i + 500), ph = ch.map(() => '?').join(',');
    const c = await queryOne(`SELECT SUM(LENGTH(COALESCE(hyp_questions, '')) > 2) AS hype, SUM(LENGTH(COALESCE(translation, '')) > 0) AS translation,
      SUM(LENGTH(COALESCE(original_text, '')) > 0) AS original_text FROM content WHERE id IN (${ph})`, ch);
    const a = await queryOne(`SELECT COUNT(*) AS n FROM content_alignment WHERE retired_at IS NULL AND (trans_id IN (${ph}) OR orig_id IN (${ph}))`, [...ch, ...ch]);
    const m = await queryOne(`SELECT COUNT(*) AS n FROM entity_mentions_v2 WHERE para_id IN (${ph})`, ch.map(String));
    const g = await graphQueryOne(`SELECT COUNT(*) AS n FROM entity_mentions WHERE content_id IN (${ph})`, ch).catch(() => ({ n: 0 }));
    tot.hype += c.hype || 0; tot.translation += c.translation || 0; tot.original_text += c.original_text || 0;
    tot.alignment_links += a.n || 0; tot.mentions_v2 += m.n || 0; tot.graph_mentions += g?.n || 0;
  }
  return tot;
}

/** HyPE coverage of one tradition (ops report hype-coverage, Chad 10-16: "what needs to be done to get the hype
 *  generation on all Baha'i material?"): live, non-duplicate paragraphs by scope × language × state (none / older
 *  version / current), with documents and characters (for a cost estimate). Paged by doc id — never one long read. */
export async function hypeCoverage({ religion = "Baha'i", current }) {
  const out = new Map();
  for (let after = 0; ;) {
    const docs = await queryAll(`SELECT id FROM docs WHERE religion = ? AND deleted_at IS NULL AND duplicate_of IS NULL AND id > ? ORDER BY id LIMIT 500`, [religion, after]);
    if (!docs.length) break;
    after = docs[docs.length - 1].id;
    const rows = await queryAll(`SELECT d.scope AS scope, d.language AS lang,
        CASE WHEN LENGTH(COALESCE(c.hyp_questions, '')) <= 2 THEN 'none' WHEN c.hyp_model = ? THEN 'current' ELSE 'older' END AS state,
        COUNT(*) AS paragraphs, COUNT(DISTINCT c.doc_id) AS docs, SUM(LENGTH(c.text)) AS chars
      FROM content c JOIN docs d ON d.id = c.doc_id
      WHERE c.doc_id IN (${docs.map(() => '?').join(',')}) AND c.deleted_at IS NULL AND COALESCE(c.is_duplicate, 0) = 0
      GROUP BY 1, 2, 3`, [current, ...docs.map((d) => d.id)], 'enrichment:hype-coverage');
    for (const r of rows) {
      const k = `${r.scope || '?'}|${String(r.lang || '?').toLowerCase()}|${r.state}`;
      const e = out.get(k) || { scope: r.scope || '?', lang: String(r.lang || '?').toLowerCase(), state: r.state, paragraphs: 0, docs: 0, chars: 0 };
      e.paragraphs += r.paragraphs; e.docs += r.docs; e.chars += r.chars || 0;
      out.set(k, e);
    }
  }
  return [...out.values()].sort((a, b) => b.paragraphs - a.paragraphs);
}
