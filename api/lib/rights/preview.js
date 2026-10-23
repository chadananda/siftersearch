// THE PREVIEW RULE — an encumbered (copyrighted) document is read only in its first PREVIEW_PARAGRAPHS paragraphs (Chad 10-23:
// "the first 40 paragraphs is all we do"). Every endpoint that serves paragraphs clamps its window here; staff (admin, editor)
// keep the full text. Pure. planning/rights-classification-plan.md
export const PREVIEW_PARAGRAPHS = 40;
export const PREVIEW_MESSAGE = 'Preview ends here — this book is under copyright, so only its opening pages are shown.';

/** Staff who may read an encumbered book in full (the reader's existing override). */
export const canReadFull = (user) => ['admin', 'editor'].includes(user?.role || user?.tier || '');

/**
 * The paragraph window a request may receive. → { offset, limit, capped, previewLimit }
 * capped = the request reached past the preview (the caller says so; never serves past it).
 */
export function previewWindow({ encumbered, user, offset = 0, limit = 50 }) {
  const off = Math.max(0, Number(offset) || 0), lim = Math.max(0, Number(limit) || 0);
  if (!encumbered || canReadFull(user)) return { offset: off, limit: lim, capped: false, previewLimit: null };
  const allowed = Math.max(0, Math.min(lim, PREVIEW_PARAGRAPHS - off));
  return { offset: off, limit: allowed, capped: off + lim > PREVIEW_PARAGRAPHS, previewLimit: PREVIEW_PARAGRAPHS };
}

/** Cache-Control for a paragraph response: a full encumbered text (staff) is never stored by any shared cache. */
export const cacheControlFor = ({ encumbered, full }) => (encumbered && full ? 'private, no-store' : null);
