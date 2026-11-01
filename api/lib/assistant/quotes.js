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
    const sentences = para.split(/(?<=[.!?])\s+(?=[A-Z“"[*>(])/);
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

// ── An introduced quotation is never left missing (r5, 11-01) ────────────────────────────────────────────────────────
// The gate drops a sentence quoting unverified words; when that sentence was the quotation a lead-in announced, the reply
// read "…writes in God Passes By:" and then nothing. Code places the verified passage the lead-in names, or rewrites it.
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const FOLLOWED = /^\s*(>|[-*•+]\s|\d+[.)]\s|\||["“«]|\*["“])/;
const QUOTE_INTRO = /\b(writes?|wrote|written|says?|said|states?|stated|describes?|described|recounts?|recounted|records?|recorded|reads?|passage|words|quote|quotation|puts it|as follows|here is|here's)\b/i;
const BARE_FRAME = /^(?:here(?: is|'s|’s)|this is|below is|the following is|in (?:his|her|its|their) (?:own )?words)\b[^.!?]{0,160}:\s*$/i;
const sentencesOf = (p) => p.split(/(?<=[.!?])\s+(?=[A-Z“"[*>(])/);

function namedPassage(lead, passages) {
  const f = ` ${fold(lead)} `;
  const usable = (passages || []).filter((q) => String(q.text || '').trim().split(/\s+/).length >= 8);
  return usable.find((q) => q.citation_url && lead.includes(q.citation_url))
    || usable.find((q) => q.source_title && f.includes(` ${fold(q.source_title.replace(/\s*\(.*\)\s*$/, ''))} `))
    || usable.find((q) => q.source_author && fold(q.source_author).length > 3 && f.includes(` ${fold(q.source_author)} `)) || null;
}

/** Whole sentences of the passage (≤ ~110 words), verbatim; an unfinished last sentence ends in an ellipsis. */
export function passageExcerpt(text, maxWords = 110) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const out = [];
  let n = 0;
  for (const s of sentencesOf(t)) {
    const w = s.split(' ').length;
    if (out.length && n + w > maxWords) break;
    out.push(s); n += w;
  }
  let x = out.join(' ');
  if (n > maxWords) x = `${x.split(' ').slice(0, maxWords).join(' ')} …`;
  else if (!/[.!?”"’)]$/.test(x)) x = `${x} …`;
  return x;
}

export function completeIntroducedQuotes(text, passages) {
  const paras = String(text || '').split(/\n{2,}/);
  const out = [];
  let completed = 0, rewritten = 0;
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i], next = paras[i + 1];
    const last = i === paras.length - 1;
    const missing = /:\s*$/.test(p) && !(next && FOLLOWED.test(next)) && (last || QUOTE_INTRO.test(sentencesOf(p).at(-1)));
    if (!missing) { out.push(p); continue; }
    const q = namedPassage(p, passages);
    if (q) {
      const link = q.citation_url && !p.includes(q.citation_url) ? ` ([${q.source_title || 'source'}](${q.citation_url}))` : '';
      out.push(p.trimEnd(), `> ${passageExcerpt(q.text)}${link}`);
      completed++;
      continue;
    }
    const sents = sentencesOf(p.trimEnd());
    if (BARE_FRAME.test(sents.at(-1))) sents.pop(); else sents[sents.length - 1] = sents.at(-1).replace(/\s*:\s*$/, '.');
    rewritten++;
    if (sents.length) out.push(sents.join(' '));
  }
  return { text: out.join('\n\n').trim(), completed, rewritten };
}
