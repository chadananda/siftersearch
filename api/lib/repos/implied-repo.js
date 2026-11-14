// implied-repo — the IMPLICATION BROWSER's data (Chad 11-12). premise_claims = one row per implied item (the browsable list);
// content.hyp_questions stays what is INDEXED (stated items, then the LIVE implied ones). Every write goes through writeRows(): ONE transaction that
// rewrites the paragraph's implied part of hyp_questions, replaces its premise_claims rows (ids kept) and logs implied_edits.
// Rejected/proposed rows live only in premise_claims. Callers: rag-adapter/store.js (HyPE), implied/service.js, routes/implied-admin.js.
import { queryAll, queryOne, transaction } from '../db.js';

export const STATUSES = ['unreviewed', 'approved', 'edited', 'rejected', 'proposed'];
export const LIVE = new Set(['unreviewed', 'approved', 'edited']);   // in hyp_questions (and so in the index)
export const IMPLIED_K0 = 900, MAX_LIVE = 98;   // same k scheme as search/hype.js (kept here so the repo needs no search imports)
const ph = (a) => a.map(() => '?').join(',');
const now = () => new Date().toISOString();
const fold = (q) => String(q ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
const str = (v) => (v == null ? '' : String(v).trim());
const toStored = (r) => ({ q: r.question, implied: true, premise: r.premise, implies: r.implies, proof: r.proof, ...(r.concept ? { concept: r.concept } : {}) });
const rowOut = (r) => (r ? { id: r.id, paraId: r.para_id, docId: r.doc_id, question: r.question, premise: r.premise, implies: r.implies || '', proof: r.proof || '', concept: r.concept || null,
  status: r.status, source: r.source, model: r.model, k: r.k, updatedAt: r.updated_at || r.created_at, note: r.note || null, editor: r.editor || null } : null);
const COLS = ['id', 'doc_id', 'para_id', 'external_para_id', 'premise', 'implies', 'questions_json', 'proof', 'concept', 'question', 'status', 'source', 'model', 'k', 'created_at', 'updated_at', 'editor', 'note'];

/** The raw hyp_questions → { stated: [original elements, verbatim], implied: [objects] } (JSON array, or legacy newline text). */
export function splitHyp(raw) {
  let arr = null;
  if (typeof raw === 'string' && raw.startsWith('[')) { try { const v = JSON.parse(raw); if (Array.isArray(v)) arr = v; } catch { /* legacy text */ } }
  if (!arr) arr = String(raw || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const isImp = (x) => x && typeof x === 'object' && x.implied;
  return { stated: arr.filter((x) => !isImp(x)), implied: arr.filter(isImp) };
}

async function load(paraId) {
  const c = await queryOne('SELECT id, doc_id, external_para_id, hyp_questions, hyp_thesis, hyp_model FROM content WHERE id = ? AND deleted_at IS NULL', [Number(paraId)], 'implied:para');
  if (!c) return null;
  const rows = await queryAll(`SELECT ${COLS.join(',')} FROM premise_claims WHERE para_id = ? ORDER BY id`, [Number(paraId)], 'implied:rows');
  return { c, rows };
}

/** Next rows (objects; id kept when present) → the statements of the one transaction. Live rows get k = 900 + position. */
function plan(c, prev, next, edits, { editor = null, at = now() } = {}) {
  const live = next.filter((r) => LIVE.has(r.status)).slice(0, MAX_LIVE);
  live.forEach((r, i) => { r.k = IMPLIED_K0 + i; });
  for (const r of next) if (!LIVE.has(r.status)) r.k = null;
  const { stated } = splitHyp(c.hyp_questions);
  const hyp = JSON.stringify([...stated, ...live.map(toStored)]);
  const stmts = [];
  if (hyp !== c.hyp_questions) stmts.push({ sql: 'UPDATE content SET hyp_questions = ?, enhanced_synced = 0, updated_at = ? WHERE id = ?', args: [hyp, at, c.id] });
  stmts.push({ sql: 'DELETE FROM premise_claims WHERE para_id = ?', args: [c.id] });
  for (const r of next) {
    const cols = COLS.filter((k) => k !== 'id' || r.id != null);
    const val = { ...r, doc_id: c.doc_id, para_id: c.id, external_para_id: c.external_para_id ?? r.external_para_id ?? null, questions_json: JSON.stringify([r.question]), updated_at: r.updated_at || at, created_at: r.created_at || at };
    stmts.push({ sql: `INSERT INTO premise_claims (${cols.join(',')}) VALUES (${ph(cols)})`, args: cols.map((k) => val[k] ?? null) });
  }
  for (const e of edits) stmts.push({ sql: `INSERT INTO implied_edits (claim_id, para_id, action, before_json, after_json, note, editor, at)
      VALUES (${e.id != null ? '?' : '(SELECT MAX(id) FROM premise_claims WHERE para_id = ? AND question = ?)'}, ?, ?, ?, ?, ?, ?, ?)`,
  args: [...(e.id != null ? [e.id] : [c.id, e.question]), c.id, e.action, e.before ? JSON.stringify(e.before) : null, e.after ? JSON.stringify(e.after) : null, e.note || null, editor, at] });
  return { stmts, reindex: hyp !== c.hyp_questions, live: live.length };
}

/** Run `fn(rows, c)` → { rows: next, edits } for one paragraph and write it atomically. → { reindex, docId, rows } or null when the ¶ is gone. */
async function writeRows(paraId, fn, opts = {}) {
  const l = await load(paraId);
  if (!l) return null;
  const { rows: next, edits = [] } = await fn(l.rows.map((r) => ({ ...r })), l.c);
  const p = plan(l.c, l.rows, next, edits, opts);
  await transaction(p.stmts, 'implied:write');
  return { reindex: p.reindex, docId: l.c.doc_id, paraId: l.c.id };
}

const snap = (r) => ({ question: r.question, premise: r.premise, implies: r.implies, proof: r.proof, concept: r.concept, status: r.status });

/** HyPE / import output: the paragraph's LIVE implied items replaced by `items` [{ q, premise, implies, proof, concept?, status?, note? }]; rejected/proposed rows kept.
 *  A question already held (same folded text) keeps its id, status and note. opts: { source, model, editor }. → { reindex, docId } */
export async function saveImplied(paraId, items, { source = 'hype', model = null, editor = null, status = 'unreviewed' } = {}) {
  const at = now();
  return writeRows(paraId, (rows) => {
    const held = new Map(rows.filter((r) => LIVE.has(r.status)).map((r) => [fold(r.question), r])), keep = rows.filter((r) => !LIVE.has(r.status)), out = [...keep];
    for (const it of items || []) {
      const question = str(it.q ?? it.question), k = fold(question);
      if (!question || out.some((r) => LIVE.has(r.status) && fold(r.question) === k)) continue;
      const h = held.get(k);
      out.push({ id: h?.id, question, premise: str(it.premise), implies: str(it.implies), proof: str(it.proof), concept: str(it.concept) || h?.concept || null,
        status: h && ['approved', 'edited'].includes(h.status) ? h.status : (it.status || status), source: h?.source || source, model: model || h?.model || null, note: it.note ?? h?.note ?? null, editor: h?.editor || editor, created_at: h?.created_at, updated_at: at });
    }
    return { rows: out };
  }, { editor, at });
}

/** A new manual item (status approved). → { item, reindex } */
export async function createImplied(paraId, { question, premise, implies, proof, concept, status = 'approved', source = 'manual', model = null, note = null }, { editor = null } = {}) {
  const q = str(question), at = now();
  let created = null;
  const r = await writeRows(paraId, (rows) => {
    if (rows.some((x) => LIVE.has(x.status) && fold(x.question) === fold(q))) throw Object.assign(new Error('this paragraph already has that question'), { statusCode: 409 });
    const row = { question: q, premise: str(premise), implies: str(implies), proof: str(proof), concept: str(concept) || null, status, source, model, note, editor, updated_at: at, created_at: at };
    created = row;
    return { rows: [...rows, row], edits: [{ action: 'create', question: q, after: snap(row), note }] };
  }, { editor, at });
  if (!r) return null;
  const saved = await queryOne('SELECT * FROM premise_claims WHERE para_id = ? AND question = ? ORDER BY id DESC LIMIT 1', [Number(paraId), created.question], 'implied:created');
  return { item: rowOut(saved), reindex: r.reindex, docId: r.docId };
}

export async function getRow(id) { return rowOut(await queryOne('SELECT * FROM premise_claims WHERE id = ?', [Number(id)], 'implied:get')); }
export async function getRows(ids) { return (ids.length ? await queryAll(`SELECT * FROM premise_claims WHERE id IN (${ph(ids)})`, ids.map(Number), 'implied:get-many') : []).map(rowOut); }

/** Edit fields of one row. status → approved/rejected/...; editing text on an approved/unreviewed row marks it 'edited'. → { item, reindex, docId } | null */
export async function patchImplied(id, patch, { editor = null } = {}) {
  const cur = await queryOne('SELECT para_id FROM premise_claims WHERE id = ?', [Number(id)], 'implied:patch-find');
  if (!cur) return null;
  const at = now();
  const r = await writeRows(cur.para_id, (rows) => {
    const row = rows.find((x) => x.id === Number(id)), before = snap(row);
    for (const f of ['question', 'premise', 'implies', 'proof', 'concept', 'note']) if (patch[f] !== undefined) row[f] = f === 'concept' ? (str(patch[f]) || null) : f === 'note' ? (patch[f] ?? null) : str(patch[f]);
    const textual = ['question', 'premise', 'implies', 'proof', 'concept'].some((f) => patch[f] !== undefined && str(patch[f]) !== str(before[f]));
    row.status = patch.status || (textual && ['unreviewed', 'approved', 'proposed'].includes(row.status) ? 'edited' : row.status);
    if (patch.status === 'approved' && textual) row.status = 'edited';
    row.updated_at = at; row.editor = editor;
    const action = patch.status && patch.status !== before.status ? `status:${patch.status}` : 'edit';
    return { rows, edits: [{ id: row.id, action, before, after: snap(row), note: patch.note }] };
  }, { editor, at });
  return r ? { item: await getRow(id), reindex: r.reindex, docId: r.docId } : null;
}

/** Hard delete (the row and its place in hyp_questions). → { reindex, docId } | null. Soft delete = patchImplied(id, { status: 'rejected' }). */
export async function deleteImplied(id, { editor = null } = {}) {
  const cur = await queryOne('SELECT para_id FROM premise_claims WHERE id = ?', [Number(id)], 'implied:del-find');
  if (!cur) return null;
  return writeRows(cur.para_id, (rows) => { const row = rows.find((x) => x.id === Number(id)); return { rows: rows.filter((x) => x !== row), edits: [{ id: row.id, action: 'delete', before: snap(row) }] }; }, { editor });
}

/** One status for many ids (grouped per paragraph). → { updated, docIds[] } */
export async function bulkStatus(ids, status, { editor = null } = {}) {
  if (!STATUSES.includes(status)) throw Object.assign(new Error(`status must be one of ${STATUSES.join(', ')}`), { statusCode: 400 });
  const rows = ids.length ? await queryAll(`SELECT id, para_id FROM premise_claims WHERE id IN (${ph(ids)})`, ids.map(Number), 'implied:bulk-find') : [];
  const by = new Map();
  for (const r of rows) (by.get(r.para_id) || by.set(r.para_id, []).get(r.para_id)).push(r.id);
  const at = now(), docIds = new Set(); let updated = 0;
  for (const [paraId, rid] of by) {
    const w = await writeRows(paraId, (rs) => {
      const edits = [];
      for (const row of rs) if (rid.includes(row.id) && row.status !== status) { const before = snap(row); row.status = status; row.updated_at = at; row.editor = editor; updated++; edits.push({ id: row.id, action: `status:${status}`, before, after: snap(row) }); }
      return { rows: rs, edits };
    }, { editor, at });
    if (w?.reindex) docIds.add(w.docId);
  }
  return { updated, docIds: [...docIds] };
}

// ── reads ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const DOC_COLS = 'd.title AS d_title, d.author AS d_author, d.religion AS d_religion, d.collection AS d_collection, d.slug AS d_slug';
const withDoc = (r) => ({ ...rowOut(r), doc: { id: r.doc_id, title: r.d_title, author: r.d_author, religion: r.d_religion, collection: r.d_collection, slug: r.d_slug }, paragraphIndex: r.paragraph_index });

/** Filtered page of items with their doc. sort: new|doc|concept. cursor = offset. → { rows, next } */
export async function listImplied({ status, concept, religion, docId, author, text, sort = 'new', limit = 50, cursor = 0 } = {}) {
  const where = ['1=1'], args = [];
  if (status) { const s = String(status).split(',').filter(Boolean); where.push(`p.status IN (${ph(s)})`); args.push(...s); }
  if (concept) { where.push('p.concept = ?'); args.push(concept); }
  if (religion) { where.push('d.religion = ?'); args.push(religion); }
  if (docId) { where.push('p.doc_id = ?'); args.push(Number(docId)); }
  if (author) { where.push('d.author LIKE ?'); args.push(`%${author}%`); }
  if (text) { where.push('(p.question LIKE ? OR p.premise LIKE ? OR p.implies LIKE ?)'); args.push(...Array(3).fill(`%${text}%`)); }
  const order = sort === 'doc' ? 'p.doc_id, p.para_id, p.id' : sort === 'concept' ? 'p.concept, p.id DESC' : 'COALESCE(p.updated_at, p.created_at) DESC, p.id DESC';
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200), off = Math.max(Number(cursor) || 0, 0);
  const rows = await queryAll(`SELECT p.*, ${DOC_COLS}, c.paragraph_index FROM premise_claims p LEFT JOIN docs d ON d.id = p.doc_id LEFT JOIN content c ON c.id = p.para_id
    WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, [...args, lim + 1, off], 'implied:list');
  return { rows: rows.slice(0, lim).map(withDoc), next: rows.length > lim ? String(off + lim) : null };
}

/** Rows by id with doc + paragraph index (search / similar / featured hydration), in the order asked. */
export async function itemsByIds(ids) {
  if (!ids.length) return [];
  const rows = await queryAll(`SELECT p.*, ${DOC_COLS}, c.paragraph_index FROM premise_claims p LEFT JOIN docs d ON d.id = p.doc_id LEFT JOIN content c ON c.id = p.para_id WHERE p.id IN (${ph(ids)})`, ids.map(Number), 'implied:by-ids');
  const m = new Map(rows.map((r) => [r.id, withDoc(r)]));
  return ids.map((i) => m.get(Number(i))).filter(Boolean);
}

/** The implied rows for search hits [{ paraId, k }] (a hit's k is the row's k). → Map('paraId:k' → item) */
export async function itemsAtHits(hits) {
  const ids = [...new Set(hits.map((h) => Number(h.paraId)))];
  if (!ids.length) return new Map();
  const rows = await queryAll(`SELECT p.*, ${DOC_COLS}, c.paragraph_index FROM premise_claims p LEFT JOIN docs d ON d.id = p.doc_id LEFT JOIN content c ON c.id = p.para_id WHERE p.para_id IN (${ph(ids)}) AND p.k IS NOT NULL`, ids, 'implied:at-hits');
  return new Map(rows.map((r) => [`${r.para_id}:${r.k}`, withDoc(r)]));
}

/** One paragraph for the editor: text (+ prev/next), doc, stored HyPE (stated/implied/thesis), its premise_claims rows. */
export async function paragraphView(paraId) {
  const c = await queryOne(`SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.original_text, c.hyp_questions, c.hyp_thesis, c.hyp_model, ${DOC_COLS}
    FROM content c LEFT JOIN docs d ON d.id = c.doc_id WHERE c.id = ? AND c.deleted_at IS NULL`, [Number(paraId)], 'implied:para-view');
  if (!c) return null;
  const near = await queryAll(`SELECT paragraph_index, text FROM content WHERE doc_id = ? AND paragraph_index IN (?, ?) AND deleted_at IS NULL`, [c.doc_id, c.paragraph_index - 1, c.paragraph_index + 1], 'implied:para-near');
  const rows = await queryAll('SELECT * FROM premise_claims WHERE para_id = ? ORDER BY id', [Number(paraId)], 'implied:para-rows');
  return { id: c.id, docId: c.doc_id, index: c.paragraph_index, text: c.text, original: c.original_text || null, hypQuestions: c.hyp_questions, thesis: c.hyp_thesis || '', hypeVersion: c.hyp_model || null,
    prev: near.find((n) => n.paragraph_index === c.paragraph_index - 1)?.text || null, next: near.find((n) => n.paragraph_index === c.paragraph_index + 1)?.text || null,
    doc: { id: c.doc_id, title: c.d_title, author: c.d_author, religion: c.d_religion, collection: c.d_collection, slug: c.d_slug }, rows: rows.map(rowOut) };
}

/** Texts a proof must be found in. */
export async function proofTexts(paraId) {
  const c = await queryOne('SELECT text, original_text FROM content WHERE id = ? AND deleted_at IS NULL', [Number(paraId)], 'implied:proof-texts');
  return c ? [c.text, c.original_text].filter(Boolean) : null;
}

/** Save the STATED HyPE of a paragraph (and thesis); implied items untouched. stated: [{ q, a?, deep?, seeker? }]. → { reindex, docId } | null */
export async function saveStated(paraId, { stated, thesis }, { editor = null } = {}) {
  const l = await load(paraId);
  if (!l) return null;
  const at = now(), { implied } = splitHyp(l.c.hyp_questions);
  const list = Array.isArray(stated) ? stated.map((x) => (typeof x === 'string' ? { q: x.trim() } : { q: str(x.q), a: str(x.a), ...(x.deep ? { deep: true } : {}), ...(x.seeker ? { seeker: true } : {}) })).filter((x) => x.q) : splitHyp(l.c.hyp_questions).stated;
  const hyp = JSON.stringify([...list, ...implied]), th = thesis === undefined ? l.c.hyp_thesis : str(thesis);
  const stmts = [{ sql: 'UPDATE content SET hyp_questions = ?, hyp_thesis = ?, enhanced_synced = 0, updated_at = ? WHERE id = ?', args: [hyp, th || null, at, l.c.id] },
    { sql: 'INSERT INTO implied_edits (claim_id, para_id, action, before_json, after_json, editor, at) VALUES (NULL, ?, ?, ?, ?, ?, ?)', args: [l.c.id, 'stated', JSON.stringify({ stated: splitHyp(l.c.hyp_questions).stated, thesis: l.c.hyp_thesis }), JSON.stringify({ stated: list, thesis: th }), editor, at] }];
  await transaction(stmts, 'implied:stated');
  return { reindex: true, docId: l.c.doc_id };
}

/** Compare-and-set rewrite of stated slots (hype-selfref-purge): updates [{ id, from, to }] (raw hyp_questions) → one transaction; a paragraph edited meanwhile
 *  (hyp_questions no longer `from`) is skipped and the next run finds it. Marks enhanced_synced = 0 so the follow indexer drops the points. */
export async function replaceHypIf(updates, { at = now() } = {}) {
  if (!updates.length) return 0;
  await transaction(updates.map((u) => ({ sql: 'UPDATE content SET hyp_questions = ?, enhanced_synced = 0, updated_at = ? WHERE id = ? AND hyp_questions = ?', args: [u.to, at, u.id, u.from] })), 'implied:hyp-replace');
  return updates.length;
}

export const recentEdits = async (limit = 50) => (await queryAll(`SELECT e.*, p.question FROM implied_edits e LEFT JOIN premise_claims p ON p.id = e.claim_id ORDER BY e.id DESC LIMIT ?`, [Math.min(Number(limit) || 50, 200)], 'implied:edits'))
  .map((e) => ({ id: e.id, claimId: e.claim_id, paraId: e.para_id, action: e.action, before: e.before_json ? JSON.parse(e.before_json) : null, after: e.after_json ? JSON.parse(e.after_json) : null, note: e.note, editor: e.editor, at: e.at, question: e.question }));
export const editsOf = async (claimId, limit = 50) => (await queryAll('SELECT * FROM implied_edits WHERE claim_id = ? ORDER BY id DESC LIMIT ?', [Number(claimId), limit], 'implied:edits-of'))
  .map((e) => ({ id: e.id, action: e.action, before: e.before_json ? JSON.parse(e.before_json) : null, after: e.after_json ? JSON.parse(e.after_json) : null, note: e.note, editor: e.editor, at: e.at }));

/** Rows for the first-principles graph (bounded by `limit`): approved first. root → that row's concept siblings included. */
export async function graphRows({ concept, religion, rootId, limit = 150 } = {}) {
  const where = [`p.status <> 'rejected'`, `p.question IS NOT NULL`], args = [];
  if (concept) { where.push('p.concept = ?'); args.push(concept); }
  if (religion) { where.push('d.religion = ?'); args.push(religion); }
  const lim = Math.min(Math.max(Number(limit) || 150, 1), 400);
  const rows = await queryAll(`SELECT p.*, ${DOC_COLS}, c.paragraph_index FROM premise_claims p LEFT JOIN docs d ON d.id = p.doc_id LEFT JOIN content c ON c.id = p.para_id
    WHERE ${where.join(' AND ')} ORDER BY CASE p.status WHEN 'approved' THEN 0 WHEN 'edited' THEN 0 ELSE 1 END, p.id DESC LIMIT ?`, [...args, lim], 'implied:graph');
  const out = rows.map(withDoc);
  if (rootId && !out.some((r) => r.id === Number(rootId))) { const [r] = await itemsByIds([rootId]); if (r) out.push(r); }
  return out;
}

// ── aggregates for the overview REPORT (never per request) ───────────────────────────────────────────────────────────────
export async function impliedTotals() {
  const byStatus = await queryAll('SELECT status, COUNT(*) n FROM premise_claims GROUP BY status', [], 'implied:totals-status');
  const bySource = await queryAll(`SELECT COALESCE(source, 'pilot') source, COUNT(*) n FROM premise_claims GROUP BY 1`, [], 'implied:totals-source');
  const t = await queryOne('SELECT COUNT(*) items, COUNT(DISTINCT para_id) paragraphs FROM premise_claims', [], 'implied:totals');
  const byConcept = await queryAll(`SELECT concept, COUNT(*) n FROM premise_claims WHERE status <> 'rejected' AND COALESCE(concept, '') <> '' GROUP BY concept ORDER BY n DESC`, [], 'implied:totals-concept');
  const byReligion = await queryAll(`SELECT COALESCE(d.religion, 'Other') religion, COUNT(*) items, COUNT(DISTINCT p.para_id) paragraphs FROM premise_claims p LEFT JOIN docs d ON d.id = p.doc_id WHERE p.status <> 'rejected' GROUP BY 1 ORDER BY items DESC`, [], 'implied:totals-religion');
  const byDay = await queryAll(`SELECT substr(created_at, 1, 10) day, COUNT(*) implied FROM premise_claims WHERE COALESCE(source, 'hype') = 'hype' AND created_at IS NOT NULL GROUP BY 1 ORDER BY 1`, [], 'implied:totals-day');
  return { items: t?.items || 0, paragraphs: t?.paragraphs || 0, byStatus: Object.fromEntries(byStatus.map((r) => [r.status || 'unreviewed', r.n])), bySource: Object.fromEntries(bySource.map((r) => [r.source, r.n])), byConcept, byReligion, impliedByDay: byDay };
}

/** Strong items for the hero: approved/edited first, then unreviewed with a concept. */
export async function featuredRows(limit = 12) {
  const rows = await queryAll(`SELECT p.id FROM premise_claims p WHERE p.status IN ('approved', 'edited', 'unreviewed') AND LENGTH(COALESCE(p.implies, '')) > 20 AND LENGTH(COALESCE(p.proof, '')) > 10
    ORDER BY CASE p.status WHEN 'approved' THEN 0 WHEN 'edited' THEN 0 ELSE 1 END, CASE WHEN COALESCE(p.concept, '') = '' THEN 1 ELSE 0 END, p.id DESC LIMIT ?`, [Number(limit) || 12], 'implied:featured');
  return itemsByIds(rows.map((r) => r.id));
}

/** Paragraph text for hydrating items (featured / search): id → { text, index }. */
export async function paragraphTexts(ids) {
  if (!ids.length) return new Map();
  const rows = await queryAll(`SELECT id, paragraph_index, text FROM content WHERE id IN (${ph(ids)})`, ids.map(Number), 'implied:texts');
  return new Map(rows.map((r) => [r.id, { text: r.text, index: r.paragraph_index }]));
}

/** Stored hyp_questions of paragraphs (stated search hits): id → raw. */
export async function hypRaw(ids) {
  if (!ids.length) return new Map();
  const rows = await queryAll(`SELECT c.id, c.doc_id, c.paragraph_index, c.hyp_questions, ${DOC_COLS} FROM content c LEFT JOIN docs d ON d.id = c.doc_id WHERE c.id IN (${ph(ids)})`, ids.map(Number), 'implied:hyp-raw');
  return new Map(rows.map((r) => [r.id, r]));
}

/** HyPE counts per document in one content-id window → [{ doc_id, paragraphs, questions }] (the report walks windows; each read is short). */
export const hypeCountsWindow = (fromId, toId) => queryAll(`SELECT doc_id, COUNT(*) paragraphs, SUM(CASE WHEN json_valid(hyp_questions) THEN json_array_length(hyp_questions) ELSE 0 END) questions
  FROM content WHERE id > ? AND id <= ? AND deleted_at IS NULL AND hyp_questions IS NOT NULL AND LENGTH(hyp_questions) > 2 GROUP BY doc_id`, [fromId, toId], 'implied:hype-counts');

/** Stored hyp_questions in one content-id window → [{ id, doc_id, hyp_questions }] (the question-fault REPORT walks windows). */
export const hypWindow = (fromId, toId) => queryAll(`SELECT id, doc_id, hyp_questions FROM content WHERE id > ? AND id <= ? AND deleted_at IS NULL AND hyp_questions IS NOT NULL AND LENGTH(hyp_questions) > 2`, [fromId, toId], 'implied:hyp-window');

/** Up to `limit` paragraphs WITH stored questions starting at content id `fromId` (primary-key range read, no scan) + their doc — the score-sample sampler picks random fromIds. */
export const hypSampleWindow = (fromId, limit = 40) => queryAll(`SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.hyp_questions, d.title d_title, d.author d_author, d.religion d_religion, d.collection d_collection, d.slug d_slug
  FROM content c LEFT JOIN docs d ON d.id = c.doc_id WHERE c.id >= ? AND c.deleted_at IS NULL AND c.hyp_questions IS NOT NULL AND LENGTH(c.hyp_questions) > 2 ORDER BY c.id LIMIT ?`, [Number(fromId), Number(limit)], 'implied:hyp-sample');

/** doc id → title for these docs. */
export async function titleOfDocs(ids) {
  const m = new Map();
  for (let i = 0; i < ids.length; i += 500) for (const r of await queryAll(`SELECT id, title FROM docs WHERE id IN (${ph(ids.slice(i, i + 500))})`, ids.slice(i, i + 500), 'implied:titles')) m.set(r.id, r.title);
  return m;
}

/** doc id → religion for these docs. */
export async function religionOfDocs(ids) {
  const m = new Map();
  for (let i = 0; i < ids.length; i += 500) for (const r of await queryAll(`SELECT id, COALESCE(religion, 'Other') religion FROM docs WHERE id IN (${ph(ids.slice(i, i + 500))})`, ids.slice(i, i + 500), 'implied:religions')) m.set(r.id, r.religion);
  return m;
}
