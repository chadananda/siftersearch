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
}
