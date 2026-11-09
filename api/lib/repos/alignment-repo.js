// alignment-repo — translation ↔ original paragraph links (content_alignment, migration 128) and the audit questions
// about them. Read-only here. Callers: ops reports (ctai-audit). Deps: db.js.
import { queryAll, queryOne, transaction } from '../db.js';

/** For one translation doc: its live paragraphs, how many carry pn, and its active alignment rows' health. */
export async function translationAudit(transDoc) {
  const paras = await queryOne(`SELECT COUNT(*) AS live, SUM(json_extract(block_attrs, '$.pn') IS NOT NULL) AS with_pn,
      SUM(LENGTH(COALESCE(original_text, '')) > 0) AS with_original, SUM(external_para_id IS NOT NULL) AS with_site_id
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

/** A CTAI host doc's English rows that carry their CTAI original, in reading order, with the anchors a file can cite. */
export const ctaiPairs = (transDoc) => queryAll(`SELECT id, paragraph_index, external_para_id, block_attrs, original_text, original_lang
  FROM content WHERE doc_id = ? AND deleted_at IS NULL AND LENGTH(COALESCE(original_text, '')) > 0 ORDER BY paragraph_index`, [transDoc]);

/** Rows of a doc with their block attrs + site id — to resolve `align` anchors to content ids. */
export const anchorsForDoc = (docId) => queryAll(`SELECT id, external_para_id, block_attrs FROM content WHERE doc_id = ? AND deleted_at IS NULL`, [docId]);

/** Insert 1:1 links (basis, score 1) unless present. links: [{ transId, origId, transDoc, origDoc }] */
export async function insertLinks(links, basis, method) {
  for (let i = 0; i < links.length; i += 500) {
    await transaction(links.slice(i, i + 500).map((l) => ({
      sql: `INSERT OR IGNORE INTO content_alignment (trans_id, orig_id, trans_doc, orig_doc, basis, score, method) VALUES (?, ?, ?, ?, ?, 1, ?)`,
      args: [l.transId, l.origId, l.transDoc, l.origDoc, basis, method] })), 'ops:ctai-link');
  }
}

// ── work family (Anís original / term / quote_trace, 11-09): the other-language editions of ONE work, for any tradition ──────
const FAM_COLS = 'd.id, d.title, d.author, d.language, d.religion, d.collection';
/** One doc's work family: other editions/translations of the same work, each with the BASIS that ties it —
 *  `original_doc_id` (recorded: this doc's original, or its siblings/translations), `alignment` (content_alignment doc pairs),
 *  `author` (same author + tradition, another language: a CANDIDATE only — the caller aligns or rejects it). Best basis first. */
export async function workFamily(docId, { limit = 12 } = {}) {
  const id = Number(docId), n = Math.max(1, Math.min(Number(limit) || 12, 50));
  const self = await queryOne(`SELECT id, title, author, language, religion, collection, original_doc_id FROM docs WHERE id = ? AND deleted_at IS NULL`, [id], 'alignment-repo:family-self');
  if (!self) return { self: null, members: [] };
  const root = Number(self.original_doc_id) || id;
  const recorded = await queryAll(`SELECT ${FAM_COLS}, 'original_doc_id' AS basis FROM docs d WHERE d.deleted_at IS NULL AND d.id != ? AND (d.id = ? OR d.original_doc_id = ?) LIMIT ?`,
    [id, root, root, n], 'alignment-repo:family-recorded');
  const aligned = await queryAll(`SELECT ${FAM_COLS}, 'alignment' AS basis, x.links FROM (
      SELECT orig_doc AS doc, COUNT(*) AS links FROM content_alignment WHERE trans_doc = ? AND retired_at IS NULL GROUP BY orig_doc
      UNION ALL SELECT trans_doc, COUNT(*) FROM content_alignment WHERE orig_doc = ? AND retired_at IS NULL GROUP BY trans_doc) x
    JOIN docs d ON d.id = x.doc AND d.deleted_at IS NULL ORDER BY x.links DESC LIMIT ?`, [id, id, n], 'alignment-repo:family-aligned');
  const byAuthor = self.author ? await queryAll(`SELECT ${FAM_COLS}, 'author' AS basis FROM docs d WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL
      AND d.author = ? AND COALESCE(d.religion, '') = COALESCE(?, '') AND d.id != ? AND LOWER(COALESCE(d.language, '')) != LOWER(COALESCE(?, '')) LIMIT ?`,
    [self.author, self.religion, id, self.language, n], 'alignment-repo:family-author') : [];
  const seen = new Set(), members = [];
  for (const m of [...recorded, ...aligned, ...byAuthor]) if (!seen.has(m.id)) { seen.add(m.id); members.push(m); }
  return { self, members: members.slice(0, n) };
}

/** What links editions today, per tradition (the work-families ops report): recorded original_doc_id, aligned doc pairs,
 *  authors held in more than one language, and the tradition × language doc counts. Whole-table: a REPORT, never a request path. */
export async function workFamilyCoverage() {
  const recorded = await queryAll(`SELECT COALESCE(religion, '?') AS religion, COUNT(*) AS docs FROM docs WHERE deleted_at IS NULL AND original_doc_id IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`, [], 'alignment-repo:fam-recorded');
  const aligned = await queryAll(`SELECT COALESCE(d.religion, '?') AS religion, COUNT(*) AS pairs FROM (SELECT DISTINCT trans_doc, orig_doc FROM content_alignment WHERE retired_at IS NULL) p
    JOIN docs d ON d.id = p.trans_doc GROUP BY 1 ORDER BY 2 DESC`, [], 'alignment-repo:fam-aligned');
  const authors = await queryAll(`SELECT religion, COUNT(*) AS authors FROM (SELECT COALESCE(religion, '?') AS religion, author FROM docs
      WHERE deleted_at IS NULL AND author IS NOT NULL AND author != '' GROUP BY 1, 2 HAVING COUNT(DISTINCT LOWER(COALESCE(language, ''))) > 1) GROUP BY 1 ORDER BY 2 DESC`, [], 'alignment-repo:fam-authors');
  const languages = await queryAll(`SELECT COALESCE(religion, '?') AS religion, LOWER(COALESCE(language, '?')) AS language, COUNT(*) AS docs FROM docs
    WHERE deleted_at IS NULL GROUP BY 1, 2 ORDER BY 1, 3 DESC`, [], 'alignment-repo:fam-languages');
  return { recorded, aligned, authors, languages };
}
