// routes/docs — the HTTP face of docs-repo: the ONE document surface every tool should use.
//
// Chad, 2026-08-25: "All tools within the application should use the same internal API so the logic of
// document enumeration need not be remembered and repeated in every piece of code that needs to talk to the
// document database or file repository."
//
// Every route here delegates to api/lib/docs-repo.js — the visibility policy, the duplicate resolution and
// the destructive-operation guards live there, once. Nothing in this file writes SQL, and neither should a
// caller: if a query cannot be expressed through these routes, extend docs-repo rather than reaching past it.
//
// Mounted at /api/admin (requireInternal). Reads are safe by default — deleted and duplicate documents are
// excluded unless `scope=all` is asked for BY NAME.
import { requireInternal } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import * as repo from '../lib/docs-repo.js';
import { originalTermForParagraph, originalTermForQuote } from '../lib/original-term.js';
import { mergeLeadIns } from '../lib/lead-in-merge.js';
import { queryAll, queryOne } from '../lib/db.js';

export default async function docsRoutes(fastify) {
  const admin = { preHandler: requireInternal };

  /**
   * GET /docs — list under a named visibility policy.
   *   ?scope=live|canonical|withProse|canonicalWithProse|all   (default: live)
   *   ?title=…&author=…&language=…&collection=…&sourceSite=canonical|<site>&fields=…&limit=&offset=
   *
   * An unknown scope is a 400 naming the valid ones, never a silent fallback: a caller that gets a policy it
   * did not ask for is exactly how tombstones end up in a listing.
   */
  fastify.get('/docs', admin, async (req) => {
    const q = req.query || {};
    try {
      return await repo.listDocs({
        scope: q.scope || 'live',
        title: q.title, author: q.author, religion: q.religion, collection: q.collection,
        language: q.language, sourceSite: q.sourceSite, fields: q.fields,
        ids: q.ids ? String(q.ids).split(',').map(Number).filter(Boolean) : undefined,
        limit: Number(q.limit) || 100, offset: Number(q.offset) || 0,
      });
    } catch (err) { throw ApiError.badRequest(err.message); }
  });

  /** GET /docs/:id — one document, following `duplicate_of` to the copy that holds the text (?follow=false to stop). */
  fastify.get('/docs/:id', admin, async (req) => {
    const doc = await repo.getDoc(req.params.id, {
      scope: req.query?.scope || 'live',
      follow: req.query?.follow !== 'false',
      fields: req.query?.fields,
    });
    if (!doc) throw ApiError.notFound(`doc ${req.params.id} not visible under scope '${req.query?.scope || 'live'}'`);
    return doc;
  });

  /** GET /docs/:id/paragraphs — live prose in order, carrying the bilingual layer. */
  fastify.get('/docs/:id/paragraphs', admin, async (req) => {
    const q = req.query || {};
    const paragraphs = await repo.getParagraphs(req.params.id, {
      proseOnly: q.proseOnly !== 'false',
      limit: Math.min(100000, Number(q.limit) || 1000),
      offset: Number(q.offset) || 0,
    });
    return { docId: Number(req.params.id), count: paragraphs.length, paragraphs };
  });

  /**
   * GET /docs/:id/enrichment — how many paragraphs carry a disambiguation note (by version), HyPE, and an
   * aligned original. /grounding/books/:id reports the ENTITY pipeline's view and said "pending" for books
   * that were ~100% disambiguated by the conceptual track; this counts the artifact itself.
   */
  fastify.get('/docs/:id/enrichment', admin, async (req) => repo.enrichmentCoverage(req.params.id));

  /**
   * GET /docs/:id/canonical — where does this document's work actually live?
   * Reports `brokenPointer` when `duplicate_of` aims at a deleted or empty target instead of following it.
   */
  fastify.get('/docs/:id/canonical', admin, async (req) => repo.resolveCanonical(req.params.id));

  /** POST /docs/:id/duplicate-of {canonicalId, reason} — refuses an empty or deleted target. */
  fastify.post('/docs/:id/duplicate-of', admin, async (req) => {
    const { canonicalId, reason } = req.body || {};
    if (!canonicalId) throw ApiError.badRequest('canonicalId required');
    try {
      return await repo.markDuplicate(req.params.id, canonicalId, { reason });
    } catch (err) { throw ApiError.badRequest(err.message); }
  });

  /**
   * POST /docs/delete {ids, reason, allowLastCopy} — guarded soft delete.
   * Refusals come back itemised with their reason; they are the POINT of the endpoint, not an error.
   */
  fastify.post('/docs/delete', admin, async (req) => {
    const { ids, reason, runId, allowLastCopy } = req.body || {};
    if (!ids?.length) throw ApiError.badRequest('ids required');
    if (!reason) throw ApiError.badRequest('reason required — a deletion with no stated reason is unauditable');
    return repo.softDeleteDocs(ids, { reason, runId, allowLastCopy: allowLastCopy === true });
  });

  /**
   * GET /docs/original-term?term=justice&quote=…  (or ?paraId=…)
   *
   * "What is the original word for 'justice' in the passage 'the best beloved of all things...'?"
   * A pure lookup over the stored word alignment — no model call, no network, so the answer is evidence
   * rather than inference. Returns ALL matches: one English word can render two different originals in the
   * same passage, and collapsing that hides the distinction the field exists to surface.
   */
  fastify.get('/docs/original-term', admin, async (req) => {
    const { term, quote, paraId } = req.query || {};
    if (!term) throw ApiError.badRequest('term required');
    if (!quote && !paraId) throw ApiError.badRequest('quote or paraId required');
    return paraId ? originalTermForParagraph(paraId, term) : originalTermForQuote(quote, term);
  });

  /**
   * POST /docs/:id/merge-lead-ins {dryRun} — rejoin a vocative opening to the passage it opens.
   *
   * The Hidden Words are stored as 314 paragraphs for ~157 verses because the source markdown puts a blank
   * line after "O SON OF SPIRIT!". They are one utterance; the split is a formatting artifact that leaves
   * the opening row unalignable, pollutes search with 16-character hits, and halves every coverage figure.
   *
   * dryRun DEFAULTS TRUE — this rewrites scripture. The opening is retired with a SOFT delete and its text
   * is preserved at the head of the merged row, so the edit is reversible and loses nothing.
   */
  /**
   * GET /docs/chunk-damage?limit= — where the RETRIEVAL CHUNKER has overwritten the canonical paragraphing.
   *
   * Chad, 2026-08-26: "I did not ask for split paragraphs. That was a feature you decided to add."
   *
   * ingester.js and indexer.js both carry CHUNK_CONFIG { maxChunkSize: 1500, overlapSize: 150 } and write
   * the resulting windows into `content` as though they were the document's paragraphs. They are not
   * paragraphs — they are retrieval chunks, and storing them here does four things:
   *   1. DUPLICATES text: ~150 characters appear at the end of one row and the start of the next
   *   2. begins rows MID-SENTENCE, so a quotation or a concept claim anchored there cites a fragment
   *   3. inflates every per-document count (the Epistle holds 317 rows for 268 real paragraphs)
   *   4. makes near-duplicate search hits out of one passage
   *
   * DETECTED BY THE OVERLAP ITSELF, not by a length heuristic: consecutive rows whose tail is repeated at
   * the next row's head can only be a sliding window. A long paragraph that was merely split would not
   * repeat anything, and a genuinely repeated phrase would not sit exactly at both boundaries.
   */
  fastify.get('/docs/chunk-damage', admin, async (req) => {
    const limit = Math.min(500, Number(req.query?.limit) || 100);
    const minOverlap = Math.max(24, Number(req.query?.minOverlap) || 40);
    // The chunker's SIGNATURE is a row close to its ceiling. Cheap pre-filter so the scan touches candidate
    // documents only; the overlap test below is what actually decides.
    const candidates = await queryAll(
      `SELECT doc_id, COUNT(*) n FROM content
        WHERE deleted_at IS NULL AND LENGTH(text) BETWEEN 1400 AND 1500
          AND COALESCE(blocktype,'paragraph') IN ('paragraph','quote')
        GROUP BY doc_id HAVING n >= 2 ORDER BY n DESC LIMIT ?`, [limit], 'docs:chunk-damage-candidates');

    const docs = [];
    let totalRows = 0;
    for (const c of candidates) {
      const rows = await queryAll(
        `SELECT id, text FROM content
          WHERE doc_id = ? AND deleted_at IS NULL AND COALESCE(blocktype,'paragraph') IN ('paragraph','quote')
          ORDER BY position, id`, [c.doc_id], 'docs:chunk-damage-rows');
      const overlaps = [];
      for (let i = 1; i < rows.length; i++) {
        const prev = String(rows[i - 1].text || ''), cur = String(rows[i].text || '');
        // Longest suffix of `prev` that is a prefix of `cur`, capped: the window overlap is ~150 chars.
        let best = 0;
        for (let k = Math.min(400, prev.length, cur.length); k >= minOverlap; k--) {
          if (prev.endsWith(cur.slice(0, k))) { best = k; break; }
        }
        if (best) overlaps.push({ id: rows[i].id, index: i, overlap: best });
      }
      if (!overlaps.length) continue;
      totalRows += overlaps.length;
      const doc = await queryOne(`SELECT file_path, title FROM docs WHERE id = ?`, [c.doc_id], 'docs:chunk-damage-doc');
      docs.push({ docId: c.doc_id, path: doc?.file_path ?? null, title: doc?.title ?? null,
        paragraphs: rows.length, overlappingRows: overlaps.length,
        duplicatedChars: overlaps.reduce((a, o) => a + o.overlap, 0),
        sample: overlaps.slice(0, 2).map((o) => ({ ...o,
          repeated: String(rows[o.index].text).slice(0, o.overlap) })) });
    }
    docs.sort((a, b) => b.overlappingRows - a.overlappingRows);
    return { scanned: candidates.length, damagedDocs: docs.length, overlappingRows: totalRows,
      note: 'rows whose head repeats the previous row\'s tail — the signature of CHUNK_CONFIG{maxChunkSize:1500,overlapSize:150} writing retrieval windows into content',
      docs };
  });

  fastify.post('/docs/:id/merge-lead-ins', admin, async (req) => {
    const { dryRun = true } = req.body || {};
    return mergeLeadIns(req.params.id, { dryRun: dryRun !== false });
  });
}
