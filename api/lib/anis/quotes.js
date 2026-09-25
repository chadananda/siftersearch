// Quote fidelity for Anis: a quoted span of ≥5 words must appear verbatim (folded) in a retrieved passage.
// Invented words presented as scripture are removed with their sentence (which also carries the false attribution).
// Pure. Used by the live reply guard (respond.js) and the model race (scripts/wip/anis-model-race.mjs).

import { quoteSpans, containsQuote } from '../quote-text.js';

export { quoteSpans };

/** Spans whose words appear in no passage (containsQuote: ellipsis-joined pieces of ≥3 words each must match). */
export function unverifiedQuotes(text, passages) {
  const hay = (passages || []).map((p) => p.text || '').join(' | ');
  return quoteSpans(text).filter((q) => {
    const pieces = String(q).split(/\.\.\.|\u2026/).filter((p) => p.trim().split(/\s+/).length >= 3);
    return pieces.length > 0 && !containsQuote(hay, q);
  });
}

const NOTHING_LEFT = 'I couldn’t find a passage in the library that says this directly. Could you tell me a little more about what you’re looking for?';

/** Drop every sentence that carries an unverified quote. Returns the cleaned text and how many sentences went. */
export function dropUnverified(text, passages) {
  const bad = unverifiedQuotes(text, passages);
  if (!bad.length) return { text, removed: 0 };
  let removed = 0;
  const paragraphs = String(text).split(/\n{2,}/).map((para) => {
    const sentences = para.split(/(?<=[.!?])\s+(?=[A-Z“"\[*>(])/);
    const kept = sentences.filter((s) => {
      const hit = bad.some((q) => s.includes(q));
      if (hit) removed++;
      return !hit;
    });
    return kept.join(' ').trim();
  }).filter(Boolean);
  const out = paragraphs.join('\n\n').trim();
  return { text: out && quoteSpans(out).length + out.split(/\s+/).length > 12 ? out : NOTHING_LEFT, removed };
}

/**
 * Streaming gate: release text a SENTENCE at a time, and only sentences whose quotes are verified — so an invented
 * quote is never shown, even briefly. A "." inside an open quotation is not a sentence end. push() per token chunk;
 * flush() at the end releases the remainder (verified the same way).
 */
export function createSentenceGate(passages, emit) {
  let buf = '';
  const release = (s) => { if (s && !unverifiedQuotes(s, passages).length) emit(s); };
  const nextEnd = () => {
    let open = false;
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (c === '"') open = !open;
      else if (c === '“') open = true;
      else if (c === '”') open = false;
      else if (!open && buf.startsWith('\n\n', i)) return i + 2;
      else if (!open && /[.!?]/.test(c) && /\s/.test(buf[i + 1] || '')) return i + 2;
    }
    return -1;
  };
  return {
    push(t) {
      buf += t;
      for (let end = nextEnd(); end > 0; end = nextEnd()) { release(buf.slice(0, end)); buf = buf.slice(end); }
    },
    flush() { release(buf); buf = ''; },
  };
}
