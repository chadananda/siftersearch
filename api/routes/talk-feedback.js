// /api/media/:slug/feedback — listeners' score, comment and best-start suggestion for one talk (Chad 11-03). GET is public (the
// aggregate + every entry; `mine` when signed in) but personal, so never edge-cached (not in worker/edge-cache.js API_ROUTES; no-store).
// PUT saves the signed-in user's own row (upsert). Deps: talk-feedback-repo (user DB), media-repo (the talk + its duration), auth.
import { getMediaBySlug } from '../lib/repos/media-repo.js';
import { feedbackFor, saveFeedback } from '../lib/repos/talk-feedback-repo.js';
import { authenticate, optionalAuthenticate } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';

export const COMMENT_MAX = 4000;

/** Body → { score, comment, startS } or throws a 400. score 1–5 integer | null; comment trimmed, ≤ COMMENT_MAX | null;
 *  start ≥ 0 and ≤ the talk's duration (when known) | null; at least one of the three. Pure. */
export function validateFeedback(body, { duration = null } = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const blank = (v) => v == null || v === '';
  let score = null, comment = null, startS = null;
  if (!blank(b.score)) {
    score = Number(b.score);
    if (!Number.isInteger(score) || score < 1 || score > 5) throw ApiError.badRequest('score must be a whole number from 1 to 5');
  }
  if (!blank(b.comment)) {
    if (typeof b.comment !== 'string') throw ApiError.badRequest('comment must be text');
    comment = b.comment.replace(/\r\n?/g, '\n').trim() || null;
    if (comment && comment.length > COMMENT_MAX) throw ApiError.badRequest(`comment is limited to ${COMMENT_MAX} characters`);
  }
  if (!blank(b.suggested_start_s)) {
    startS = Number(b.suggested_start_s);
    if (!Number.isFinite(startS) || startS < 0) throw ApiError.badRequest('suggested_start_s must be a number of seconds ≥ 0');
    if (Number(duration) > 0 && startS > Number(duration)) throw ApiError.badRequest('suggested_start_s is past the end of the talk');
    startS = Math.round(startS * 10) / 10;
  }
  if (score == null && comment == null && startS == null) throw ApiError.badRequest('add a score, a comment or a start point');
  return { score, comment, startS };
}

/** The signed-in person's numeric users.id, or null (system/internal callers have none). */
const userIdOf = (req) => { const n = Number(req.user?.sub); return Number.isInteger(n) && n > 0 ? n : null; };

/** A published talk (the same public test as GET /api/media/:slug), else 404. */
async function publishedTalk(slug) {
  const it = await getMediaBySlug(slug);
  if (!it || it.state !== 'done' || it.restored !== 1) throw ApiError.notFound('No published talk at this address');
  return it;
}

export default async function talkFeedbackRoutes(fastify) {
  fastify.get('/:slug/feedback', { preHandler: optionalAuthenticate }, async (req, reply) => {
    const it = await publishedTalk(req.params.slug);
    reply.header('Cache-Control', 'private, no-store');
    return { slug: it.slug, ...(await feedbackFor(it.id, { userId: userIdOf(req) })) };
  });

  fastify.put('/:slug/feedback', { preHandler: authenticate }, async (req, reply) => {
    const userId = userIdOf(req);
    if (!userId) throw ApiError.forbidden('Sign in with a user account to leave feedback');
    const it = await publishedTalk(req.params.slug);
    const v = validateFeedback(req.body, { duration: it.duration_s });
    await saveFeedback({ mediaId: it.id, userId, ...v });
    reply.header('Cache-Control', 'private, no-store');
    return { slug: it.slug, saved: true, ...(await feedbackFor(it.id, { userId })) };
  });
}
