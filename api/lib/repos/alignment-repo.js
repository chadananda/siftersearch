// alignment-repo — translation ↔ original paragraph links (content_alignment, migration 128) and the audit questions
// about them. Read-only here. Callers: ops reports (ctai-audit). Deps: db.js.
import { queryAll, queryOne } from '../db.js';

/** For one translation doc: its live paragraphs, how many carry pn, and its active alignment rows' health. */
export async function translationAudit(transDoc) {
  const paras = await queryOne(`SELECT COUNT(*) AS live, SUM(json_extract(block_attrs, '$.pn') IS NOT NULL) AS with_pn
    FROM content WHERE doc_id = ? AND deleted_at IS NULL AND COALESCE(blocktype, '') NOT LIKE 'heading%'`, [transDoc]);
  const links = await queryOne(`SELECT COUNT(*) AS rows, COUNT(DISTINCT a.trans_id) AS trans_aligned, COUNT(DISTINCT a.orig_id) AS orig_aligned,
      SUM(t.id IS NULL OR t.deleted_at IS NOT NULL) AS stale_trans, SUM(o.id IS NULL OR o.deleted_at IS NOT NULL) AS stale_orig
    FROM content_alignment a LEFT JOIN content t ON t.id = a.trans_id LEFT JOIN content o ON o.id = a.orig_id
    WHERE a.trans_doc = ? AND a.retired_at IS NULL`, [transDoc]);
  const origDocs = await queryAll(`SELECT a.orig_doc AS doc_id, COUNT(*) AS links FROM content_alignment a
    WHERE a.trans_doc = ? AND a.retired_at IS NULL GROUP BY a.orig_doc ORDER BY links DESC`, [transDoc]);
  return { paras, links, origDocs };
}

/** For one original doc linked from `transDoc`: live paragraphs, how many are aligned, and pn agreement with the English. */
export async function originalAudit(origDoc, transDoc) {
  const live = await queryOne(`SELECT COUNT(*) AS live FROM content WHERE doc_id = ? AND deleted_at IS NULL AND COALESCE(blocktype, '') NOT LIKE 'heading%'`, [origDoc]);
  const al = await queryOne(`SELECT COUNT(DISTINCT a.orig_id) AS aligned,
      SUM(json_extract(o.block_attrs, '$.pn') IS NOT NULL) AS orig_with_pn,
      SUM(json_extract(o.block_attrs, '$.pn') = json_extract(t.block_attrs, '$.pn')) AS pn_match
    FROM content_alignment a JOIN content o ON o.id = a.orig_id AND o.deleted_at IS NULL JOIN content t ON t.id = a.trans_id AND t.deleted_at IS NULL
    WHERE a.orig_doc = ? AND a.trans_doc = ? AND a.retired_at IS NULL`, [origDoc, transDoc]);
  const many = await queryOne(`SELECT COUNT(*) AS n FROM (SELECT a.orig_id FROM content_alignment a WHERE a.orig_doc = ? AND a.trans_doc = ? AND a.retired_at IS NULL
    GROUP BY a.orig_id HAVING COUNT(DISTINCT a.trans_id) > 1)`, [origDoc, transDoc]);
  return { live: live.live, aligned: al.aligned, orig_with_pn: al.orig_with_pn, pn_match: al.pn_match, one_orig_many_trans: many.n };
}
