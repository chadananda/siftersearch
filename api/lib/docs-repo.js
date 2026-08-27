// docs-repo — THE ONE INTERFACE for reading and changing documents. Every tool, route, script and worker
// that needs to know "which documents count" goes through here instead of writing its own SQL.
//
// ── WHY THIS EXISTS (Chad, 2026-08-25) ───────────────────────────────────────────────────────────────────
// "Why do we keep having this trouble of not being able to exclude duplicates until eventually we
// accidentally delete the canonical? We're relying on you remembering all the rules every time."
//
// He is describing a measured fact, not an impression. Counted the day he said it:
//   • `deleted_at IS NULL` appears 530 times across 171 files
//   • `FROM docs` appears 378 times
//   • `duplicate_of` appears 82 times across 27 files
//   • `source_site` appears 169 times
// Every one of those is a place a person had to remember the rules, and the incident record is what
// forgetting looks like: a dedupe pass soft-deleted 155 canonical documents (2026-06-09); reconcileDeletes
// emptied 20 more, 14,588 paragraphs, unnoticed for two months (06-12); four canonicals were suppressed
// behind a `duplicate_of` pointing at an EMPTY shell; a listing with no `deleted_at` filter showed a
// tombstone beside a live record and read as a dedupe failure (08-25).
//
// ── THE SECOND REASON: ONE PLACE TO MEASURE ──────────────────────────────────────────────────────────────
// Chad: "this way we can know for sure when a particular query is slow and needs optimized, since it will
// be used across the system." Every operation here passes a stable tag to the db layer, which feeds the
// existing slow-query detection (`slow_query_log`). Two hundred hand-written variants cannot be attributed;
// one named operation can — and an unbounded aggregate on a fixed cadence is the failure mode that froze
// the single writer for 61 seconds and cost a night of grounding.
//
// ── WHEN THIS ISN'T ENOUGH ───────────────────────────────────────────────────────────────────────────────
// Chad: "whenever this is not sufficient and you need to go to SQL, ask yourself if this is a truly unique
// case, or a suggestion that the API interface needs extending." Default to extending this file.
// Deps: db (query/queryAll/queryOne), content (safeSoftDeleteDocs), logger.

import { query, queryAll, queryOne } from './db.js';
import { logger } from './logger.js';

/**
 * Named visibility policies. A scope is a POLICY, not a pile of booleans, because booleans are what callers
 * get wrong: `includeDeleted:false, includeDuplicates:true` is a combination nobody means to ask for but
 * many produce by omission.
 *
 *   live      — the default. Not deleted, not a duplicate of something else. What "the documents" means.
 *   canonical — live AND oceanlibrary.com or the main library (source_site NULL). The corpus holds ~147,000
 *               scraped documents against oceanlibrary's ~565, so an unscoped title search surfaces a
 *               scrape first roughly 128:1.
 *   withProse — live AND actually holding undeleted paragraphs. The husk filter: a document that exists but
 *               has no text is exactly what the gutted-canonical incident produced, and it satisfies every
 *               other predicate.
 *   all       — everything, tombstones included. Must be named EXPLICITLY; it is never a default.
 */
export const SCOPES = Object.freeze(['live', 'canonical', 'withProse', 'canonicalWithProse', 'all']);

const HAS_PROSE = `EXISTS (SELECT 1 FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL)`;
const IS_CANONICAL = `(d.source_site = 'oceanlibrary.com' OR d.source_site IS NULL)`;

/** SQL predicates for a scope. Exported so a genuinely novel query can reuse the POLICY without re-deriving it. */
export function scopeSql(scope = 'live') {
  if (!SCOPES.includes(scope)) {
    throw new Error(`docs-repo: unknown scope '${scope}'. Known: ${SCOPES.join(', ')}. ` +
      `If you need a new visibility policy, add it here rather than hand-writing predicates at the call site.`);
  }
  if (scope === 'all') return [];
  const base = ['d.deleted_at IS NULL', 'd.duplicate_of IS NULL'];
  if (scope === 'canonical') return [...base, IS_CANONICAL];
  if (scope === 'withProse') return [...base, HAS_PROSE];
  if (scope === 'canonicalWithProse') return [...base, IS_CANONICAL, HAS_PROSE];
  return base;
}

const FIELDS = Object.freeze(['id', 'title', 'author', 'religion', 'collection', 'language', 'year',
  'description', 'file_path', 'file_hash', 'paragraph_count', 'source_site', 'duplicate_of', 'deleted_at',
  'slug', 'created_at', 'updated_at']);

function selectList(fields) {
  const asked = (Array.isArray(fields) ? fields : String(fields || '').split(','))
    .map((f) => String(f).trim()).filter((f) => FIELDS.includes(f));
  return (asked.length ? asked : ['id', 'title', 'author', 'source_site']).map((f) => `d.${f}`).join(', ');
}

/**
 * List documents under a visibility policy.
 *
 * `title` matches loosely (LIKE) because callers looking up a work by name are doing RECALL — but the scope
 * still applies, so recall never returns tombstones or husks unless asked for by name.
 */
export async function listDocs({
  scope = 'live', author, religion, collection, language, sourceSite, title, ids,
  fields, limit = 100, offset = 0,
} = {}) {
  const where = scopeSql(scope);
  const params = [];
  if (author) { where.push('d.author = ?'); params.push(author); }
  if (religion) { where.push('d.religion = ?'); params.push(religion); }
  if (collection) { where.push('d.collection = ?'); params.push(collection); }
  if (language) { where.push('d.language = ?'); params.push(language); }
  if (sourceSite === 'canonical') where.push(IS_CANONICAL);
  else if (sourceSite) { where.push('d.source_site = ?'); params.push(sourceSite); }
  if (title) { where.push('d.title LIKE ?'); params.push(`%${title}%`); }
  if (ids?.length) { where.push(`d.id IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await queryAll(
    `SELECT ${selectList(fields)} FROM docs d ${clause} ORDER BY d.id LIMIT ? OFFSET ?`,
    [...params, Math.min(1000, limit), offset], 'docs-repo:list');
  const total = await queryOne(`SELECT COUNT(*) n FROM docs d ${clause}`, params, 'docs-repo:list-count');
  return { docs: rows, total: total?.n ?? 0, scope, limit, offset };
}

/**
 * Follow `duplicate_of` to the document that actually holds the work.
 *
 * REFUSES TO LAND ON A HUSK. Four canonicals were invisible because their `duplicate_of` pointed at a
 * document with zero live content — the only real copy suppressed in favour of nothing. So a hop is only
 * taken when the target genuinely holds prose; otherwise the original stands, with `brokenPointer` set.
 *
 * Cycle-guarded: A→B→A exists in this data (it had to be repaired in the entity graph for the same reason).
 */
export async function resolveCanonical(docId, { maxHops = 5 } = {}) {
  let id = Number(docId);
  const path = [id];
  for (let hop = 0; hop < maxHops; hop++) {
    const row = await queryOne(
      `SELECT d.id, d.duplicate_of, d.deleted_at, ${HAS_PROSE} has_prose FROM docs d WHERE d.id = ?`,
      [id], 'docs-repo:resolve-canonical');
    if (!row) return { docId: Number(docId), resolved: null, path, reason: 'not found' };
    if (!row.duplicate_of) return { docId: Number(docId), resolved: row.id, path, hops: hop };

    const target = await queryOne(
      `SELECT d.id, ${HAS_PROSE} has_prose FROM docs d WHERE d.id = ? AND d.deleted_at IS NULL`,
      [row.duplicate_of], 'docs-repo:resolve-canonical');
    // A pointer at a deleted or empty target is BROKEN. Following it loses the work entirely; the honest
    // answer is the document we started from, plus a flag naming the defect.
    if (!target || !target.has_prose) {
      return { docId: Number(docId), resolved: row.id, path, hops: hop,
        brokenPointer: { duplicateOf: row.duplicate_of, reason: target ? 'target holds no prose' : 'target deleted or missing' } };
    }
    if (path.includes(target.id)) {
      return { docId: Number(docId), resolved: row.id, path, cycle: true };
    }
    id = target.id;
    path.push(id);
  }
  return { docId: Number(docId), resolved: id, path, truncated: true };
}

/** One document under a policy. Follows `duplicate_of` to the copy that holds the text unless told not to. */
export async function getDoc(docId, { scope = 'live', follow = true, fields } = {}) {
  let id = Number(docId);
  let resolution = null;
  if (follow) {
    resolution = await resolveCanonical(id);
    if (resolution.resolved) id = resolution.resolved;
  }
  const where = scopeSql(scope);
  const clause = ['d.id = ?', ...where].join(' AND ');
  const doc = await queryOne(`SELECT ${selectList(fields)} FROM docs d WHERE ${clause}`, [id], 'docs-repo:get');
  return doc ? { ...doc, ...(resolution?.brokenPointer ? { brokenPointer: resolution.brokenPointer } : {}),
    ...(id !== Number(docId) ? { resolvedFrom: Number(docId) } : {}) } : null;
}

/** Live paragraphs of a document, in order. Prose only by default — footnotes are not the text of the work. */
export async function getParagraphs(docId, { proseOnly = true, limit = 100000, offset = 0 } = {}) {
  const kinds = proseOnly ? `AND COALESCE(c.blocktype,'paragraph') IN ('paragraph','quote')` : '';
  return queryAll(
    // align_ref included: it records WHERE an original came from (source, stem, verse, score). Leaving it
    // out made the provenance unreadable — an audit of what had been written could see the Arabic but not
    // which page it came from, and reported "no stems" when every row had one (2026-08-26).
    // hyp_questions/context included: judging HyPE quality means READING the questions, and until this was
    // here the only way to see them was to pay for a dry run — which reads the model, not the database.
    `SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.heading, c.blocktype, c.language,
            c.original_text, c.original_lang, c.translation_text, c.translation_authority, c.align_ref,
            c.hyp_questions, c.hyp_model, c.context, c.context_model
       FROM content c WHERE c.doc_id = ? AND c.deleted_at IS NULL ${kinds}
      ORDER BY c.paragraph_index LIMIT ? OFFSET ?`,
    [Number(docId), limit, offset], 'docs-repo:paragraphs');
}

/**
 * Enrichment coverage for one document: how many paragraphs carry a disambiguation note, HyPE, and an
 * aligned original — broken down by the VERSION that stamped them.
 *
 * Exists because there was no way to ask. `/grounding/books/:id` reported `disambig=pending` for books that
 * were ~100% disambiguated, because that row tracks the ENTITY pipeline and the conceptual track writes the
 * same column under a different version. The stage's own `todo` count is capped by whatever `limit` the
 * caller passed, so it cannot answer either. Counting the artifact directly is the only honest measure
 * (2026-08-26).
 */
export async function enrichmentCoverage(docId) {
  const id = (await resolveCanonical(docId)).resolved ?? Number(docId);
  const doc = await queryOne(`SELECT file_path, title FROM docs WHERE id = ?`, [id], 'docs-repo:enrichment-doc');
  const row = await queryOne(
    `SELECT COUNT(*) total,
            SUM(context IS NOT NULL AND context != '') noted,
            SUM(hyp_questions IS NOT NULL) hyped,
            SUM(original_text IS NOT NULL) aligned
       FROM content
      WHERE doc_id = ? AND deleted_at IS NULL AND COALESCE(blocktype,'paragraph') IN ('paragraph','quote')`,
    [id], 'docs-repo:enrichment-coverage');
  const byVersion = await queryAll(
    `SELECT COALESCE(context_model,'(none)') version, COUNT(*) n
       FROM content
      WHERE doc_id = ? AND deleted_at IS NULL AND COALESCE(blocktype,'paragraph') IN ('paragraph','quote')
        AND context IS NOT NULL AND context != ''
      GROUP BY version ORDER BY n DESC`, [id], 'docs-repo:enrichment-by-version');
  return {
    // Path first: an id says nothing about which copy of a work this is; the path says both.
    path: doc?.file_path ?? null, title: doc?.title ?? null,
    docId: id, ...(id !== Number(docId) ? { resolvedFrom: Number(docId) } : {}),
    total: row?.total ?? 0, noted: row?.noted ?? 0, hyped: row?.hyped ?? 0, aligned: row?.aligned ?? 0,
    notedPct: row?.total ? Math.round((100 * (row.noted ?? 0)) / row.total) : 0,
    byVersion,
  };
}

/**
 * Mark one document a duplicate of another.
 *
 * GUARDED, because the ungated version is what made four canonicals invisible: it will not point a document
 * at a target that holds no live prose. Suppressing a real copy in favour of an empty shell removes the work
 * from the corpus while leaving both rows looking healthy.
 */
export async function markDuplicate(dupId, canonicalId, { reason = 'unspecified' } = {}) {
  const dup = Number(dupId), canon = Number(canonicalId);
  if (dup === canon) throw new Error('docs-repo: a document cannot be a duplicate of itself');
  const target = await queryOne(
    `SELECT d.id, d.deleted_at, d.duplicate_of, ${HAS_PROSE} has_prose FROM docs d WHERE d.id = ?`,
    [canon], 'docs-repo:mark-duplicate');
  if (!target) throw new Error(`docs-repo: canonical ${canon} does not exist`);
  if (target.deleted_at) throw new Error(`docs-repo: REFUSED — canonical ${canon} is deleted`);
  if (!target.has_prose) {
    throw new Error(`docs-repo: REFUSED to point ${dup} at ${canon} — the target holds NO live prose. ` +
      `This is how four canonicals were suppressed behind empty shells; restore the target first.`);
  }
  if (target.duplicate_of) throw new Error(`docs-repo: REFUSED — ${canon} is itself a duplicate of ${target.duplicate_of}`);
  await query(`UPDATE docs SET duplicate_of = ?, updated_at = ? WHERE id = ?`,
    [canon, new Date().toISOString(), dup], 'docs-repo:mark-duplicate-write');
  logger.warn({ dup, canon, reason }, 'docs-repo: marked duplicate (AUDIT)');
  return { dup, canon, reason };
}

/**
 * The facts a caller needs before an IRREVERSIBLE purge: is this canonical, does it hold live prose, and
 * does anything else depend on it.
 *
 * Exists because the admin hard-delete endpoint was about to grow its own copy of these predicates — and a
 * new hand-rolled `FROM docs` is the exact thing the ratchet test forbids. Extending the interface is the
 * answer to "I need SQL it can't express" (Chad, 2026-08-25).
 */
export async function purgeSafety(docId) {
  const row = await queryOne(
    `SELECT d.id, d.title, d.source_site, d.duplicate_of, ${HAS_PROSE} has_prose,
            (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL) live,
            (SELECT COUNT(*) FROM docs o WHERE o.duplicate_of = d.id AND o.deleted_at IS NULL) dependants
       FROM docs d WHERE d.id = ?`, [Number(docId)], 'docs-repo:purge-safety');
  if (!row) return { exists: false };
  const canonical = row.source_site === 'oceanlibrary.com' || row.source_site === null;
  return {
    exists: true, docId: row.id, title: row.title, canonical,
    live: row.live ?? 0, dependants: row.dependants ?? 0,
    // A purge is safe only when it destroys no live canonical text and orphans nobody.
    safe: !(canonical && (row.live ?? 0) > 0) && (row.dependants ?? 0) === 0,
  };
}

/**
 * Soft-delete documents, refusing when it would remove the last copy of a work.
 *
 * Delegates the existing protections (OceanLibrary never auto-deleted, batch circuit breaker, audit trail)
 * to content.safeSoftDeleteDocs, and adds the one it lacked: a document nothing else duplicates, holding
 * prose, is the ONLY copy — deleting it removes the work from the corpus. That is the 155-canonical
 * incident, and no caller should have to remember it.
 */
export async function softDeleteDocs(docIds, { reason = 'unspecified', runId = null, allowLastCopy = false } = {}) {
  const ids = [...new Set((docIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return { deleted: 0, refused: [] };

  const refused = [];
  const proceed = [];
  for (const id of ids) {
    const row = await queryOne(
      `SELECT d.id, d.title, ${HAS_PROSE} has_prose,
              (SELECT COUNT(*) FROM docs o WHERE o.duplicate_of = d.id AND o.deleted_at IS NULL) dependants
         FROM docs d WHERE d.id = ? AND d.deleted_at IS NULL`, [id], 'docs-repo:soft-delete-check');
    if (!row) continue;                                    // already gone; deleting twice is not an error
    if (row.has_prose && !allowLastCopy) {
      // Is there any OTHER live copy of this title holding prose? If not, this is the last one.
      const others = await queryOne(
        `SELECT COUNT(*) n FROM docs d WHERE d.id <> ? AND d.deleted_at IS NULL AND d.duplicate_of IS NULL
                AND LOWER(TRIM(d.title)) = (SELECT LOWER(TRIM(title)) FROM docs WHERE id = ?) AND ${HAS_PROSE}`,
        [id, id], 'docs-repo:soft-delete-lastcopy');
      if ((others?.n ?? 0) === 0) {
        refused.push({ id, title: row.title, why: 'last live copy holding prose — deleting removes the work from the corpus' });
        continue;
      }
    }
    if (row.dependants > 0) {
      refused.push({ id, title: row.title, why: `${row.dependants} live doc(s) point at this as their canonical` });
      continue;
    }
    proceed.push(id);
  }

  if (refused.length) logger.warn({ reason, runId, refused }, 'docs-repo: REFUSED unsafe soft-delete(s)');
  if (!proceed.length) return { deleted: 0, refused };

  const { content } = await import('./content.js');
  const res = await content.safeSoftDeleteDocs(proceed, { reason, runId });
  return { ...res, refused };
}
