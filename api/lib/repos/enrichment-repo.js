// enrichment-repo — what derived work hangs off given paragraph rows (so a re-ingest that would replace them can be
// weighed first): HyPE questions, translations, CTAI originals, alignment links, entity mentions (v2 + graph).
// Read-only. Callers: ops report reingest-impact. Deps: db.js.
import { queryOne, graphQueryOne } from '../db.js';

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
