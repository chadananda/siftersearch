// RIGHTS GUARD — the copyright preview applied to paragraph-shaped results (search hits, entity mentions, single
// paragraphs, quotes) so a copyrighted book cannot be paged out another way (Chad 10-23: "the first 40 paragraphs is all
// we do"). Within the preview a paragraph is served as is; past it, only an EXCERPT (≤ EXCERPT_WORDS words) with its link.
// Pure helpers + one repo probe. Deps: rights-repo, preview.
import { PREVIEW_PARAGRAPHS, canReadFull } from './preview.js';

export const EXCERPT_WORDS = 80;   // the longest quote of a copyrighted book anyone (or Anís) gets
export const SNIPPET_WORDS = 40;   // a mention's context (entity mentions / dossier)

/** First `words` words of a text (markup-free), with an ellipsis when cut. */
export function excerpt(text, words = EXCERPT_WORDS) {
  const s = String(text ?? '');
  const parts = s.trim().split(/\s+/);
  if (parts.length <= words) return s;
  return `${parts.slice(0, words).join(' ')} …`;
}
/** Same, keeping <mark> highlight tags balanced (a cut inside a mark closes it). */
function excerptMarked(html, words) {
  const cut = excerpt(html, words);
  const open = (cut.match(/<mark>/g) || []).length - (cut.match(/<\/mark>/g) || []).length;
  return open > 0 ? cut.replace(/ …$/, '</mark> …') : cut;
}

const docOf = (h) => Number(h?.doc_id ?? h?.document_id ?? h?.documentId ?? h?.docId ?? h?.doc?.id ?? NaN);
const idxOf = (h) => { const v = h?.paragraph_index ?? h?.paragraphIndex ?? h?.position ?? h?.index; return v == null ? null : Number(v); };
const TEXT_KEYS = ['text', 'translation', 'translation_text', 'original_text', 'context', 'content', 'snippet', 'passage', 'quote'];

/** One hit/row from an encumbered doc → its excerpt form (all text-bearing fields clipped, `excerpt: true`). */
export function clipHit(h, words = EXCERPT_WORDS) {
  const out = { ...h, encumbered: 1, excerpt: true };
  for (const k of TEXT_KEYS) if (typeof out[k] === 'string') out[k] = excerpt(out[k], words);
  if (out._formatted && typeof out._formatted === 'object') {
    out._formatted = { ...out._formatted };
    for (const k of TEXT_KEYS) if (typeof out._formatted[k] === 'string') out._formatted[k] = excerptMarked(out._formatted[k], words);
  }
  for (const k of ['highlight', 'highlightedText', 'formatted']) if (typeof out[k] === 'string') out[k] = excerptMarked(out[k], words);
  if (out.paragraph && typeof out.paragraph === 'object') out.paragraph = clipHit(out.paragraph, words);
  return out;
}

/**
 * Guard a list of paragraph-shaped rows. For each row from an encumbered doc (unless the user is staff):
 *   inside the preview (paragraph_index < 40) → unchanged; past it → excerpt; `dropPastPreview` → removed instead
 *   (a search scoped to ONE encumbered document must not walk it past the preview); `alwaysClip` → every row is an excerpt
 *   (an assistant's quote, wherever it sits in the book).
 * deps.encumbered: async (ids) → Set (default rights-repo.encumberedAmong).
 */
export async function guardRows(rows, { user = null, dropPastPreview = false, alwaysClip = false, words = EXCERPT_WORDS, encumbered } = {}) {
  if (!Array.isArray(rows) || !rows.length || canReadFull(user)) return rows;
  const lookup = encumbered || (await import('../repos/rights-repo.js')).encumberedAmong;
  const ids = rows.map(docOf).filter(Number.isFinite);
  if (!ids.length) return rows;
  const enc = await lookup(ids);
  if (!enc.size) return rows;
  const out = [];
  for (const h of rows) {
    if (!enc.has(docOf(h))) { out.push(h); continue; }
    const i = idxOf(h);
    if (!alwaysClip && i != null && i < PREVIEW_PARAGRAPHS) { out.push({ ...h, encumbered: 1 }); continue; }
    if (dropPastPreview) continue;
    out.push(clipHit(h, words));
  }
  return out;
}
