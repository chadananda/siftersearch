// Quote fidelity for Anis: a quoted span of ≥5 words must appear verbatim (folded) in a retrieved passage.
// Invented words presented as scripture are removed with their sentence (which also carries the false attribution).
// Pure. Used by the live reply guard (respond.js) and the model race (scripts/wip/anis-model-race.mjs).

import { quoteSpans, containsQuote } from '../quote-text.js';
import { foldVerbatim } from '../search/verbatim.js';

export { quoteSpans };

/** Spans whose words appear in no ONE passage (containsQuote: ellipsis-joined pieces of ≥3 words each must match).
 *  One quotation, one passage: the pieces of a quotation must all come from the same passage — r9 found quotations stitched
 *  from two passages (often by different authors) and presented as one, which a check against all passages joined let pass. */
export function unverifiedQuotes(text, passages) {
  const hays = (passages || []).map((p) => p.text || '').filter(Boolean);
  return quoteSpans(text).filter((q) => {
    const pieces = String(q).split(/\.\.\.|\u2026/).filter((p) => p.trim().split(/\s+/).length >= 3);
    return pieces.length > 0 && !hays.some((h) => containsQuote(h, q));
  });
}

/** A reply cut by the token cap ends at its last whole sentence, never mid-word or mid-link (r9: "…[Some Answered Qu").
 *  An unclosed quotation or link at the end goes with the cut sentence. Pure. */
export function trimCutReply(text) {
  let t = String(text || '').trimEnd();
  const lastEnd = (s) => {
    const m = [...s.matchAll(/[.!?…][”"’)*]*(?=\s|$)|\)(?=\s|$)/g)].at(-1);
    return m ? m.index + m[0].length : -1;
  };
  const balanced = (s) => (s.match(/“/g) || []).length <= (s.match(/”/g) || []).length && ((s.match(/"/g) || []).length % 2 === 0)
    && (s.match(/\[/g) || []).length === (s.match(/\]/g) || []).length && (s.match(/\(/g) || []).length === (s.match(/\)/g) || []).length;
  for (let guard = 0; guard < 50 && t; guard++) {
    const end = lastEnd(t);
    if (end < 0) return '';
    const cut = t.slice(0, end).trimEnd();
    if (balanced(cut)) return cut;
    t = t.slice(0, end - 1);
  }
  return t;
}

const NOTHING_LEFT = 'I didn’t find a passage that says this directly in this search. Could you tell me a little more about what you’re looking for?';   // r9: never a claim about the whole library

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
const QUOTE_INTRO = /\b(writes?|wrote|written|says?|said|states?|stated|describes?|described|recounts?|recounted|records?|recorded|reads?|passages?|words|quotes?|quotations?|statements?|lines|verses?|puts it|as follows|following|here is|here's|here are)\b/i;
const BARE_FRAME = /^(?:here(?: is| are|'s|’s)|this is|these are|below is|below are|the following (?:is|are)|in (?:his|her|its|their) (?:own )?words)\b[^.!?]{0,160}:\s*$/i;
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

/**
 * Every quotation carries its own link (r6-base: 16 of 108 defects were a verbatim quotation of a retrieved passage with no
 * link). A quoted span of ≥5 words, or a blockquote, that a passage holds verbatim and whose sentence (or blockquote) does not
 * already link that passage gets the passage's citation link: inline right after the closing quote mark, a blockquote on its
 * own "— [title](url)" line. Words found in no passage are left alone (dropUnverified owns those). Pure.
 */
export function linkQuotes(text, passages) {
  const pool = (passages || []).filter((p) => p.citation_url && p.text);
  const src = String(text || '');
  if (!pool.length || !src) return { text: src, linked: 0 };
  let linked = 0;
  const holder = (words, near) => {
    const hits = pool.filter((p) => containsQuote(p.text, words));
    return hits.length && !hits.some((p) => near.includes(p.citation_url)) ? hits[0] : null;
  };
  const link = (p) => `[${p.source_title || 'source'}](${p.citation_url})`;
  // blockquotes: consecutive "> " lines; the line after the block may carry the attribution
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*>/.test(lines[i])) { out.push(lines[i]); continue; }
    let j = i;
    while (j < lines.length && /^\s*>/.test(lines[j])) j++;
    const block = lines.slice(i, j);
    const body = block.map((l) => l.replace(/^\s*>\s?/, '')).join(' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_]/g, '');
    const p = body.split(/\s+/).length >= 5 ? holder(body.replace(/^["“]|["”]$/g, ''), `${block.join('\n')}\n${lines[j] || ''}`) : null;
    out.push(...block);
    if (p) { out.push(`> — ${link(p)}`); linked++; }
    i = j - 1;
  }
  // inline quotations, outside blockquotes; the window is the quotation's sentence (back to the last sentence end, on to the next)
  const res = out.map((line) => { const done = new Set(); return /^\s*>/.test(line) ? line : line.replace(/["“]([^"”\n]+)["”]/g, (m, words, off, all) => {
    if (words.trim().split(/\s+/).length < 5) return m;
    const before = all.slice(0, off), after = all.slice(off + m.length);
    const start = Math.max(before.search(/[.!?]\s[^.!?]*$/), 0);
    const end = after.search(/[.!?](\s|$)/);
    const p = holder(words, before.slice(start) + (end < 0 ? after : after.slice(0, end + 1)));
    if (!p || done.has(p.citation_url)) return m;   // one link per passage per paragraph
    done.add(p.citation_url);
    linked++;
    return `${m} (${link(p)})`;
  }); });
  return { text: res.join('\n'), linked };
}

// ── WHO SAID IT ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// r6-base class B (14 of 108 defects): a quotation credited to a figure other than the writer of the passage that holds it
// (an on-behalf letter credited to Shoghi Effendi, or to Bahá'u'lláh; the Guardian's words framed as Bahá'u'lláh's).
const AP = '[’\'`ʼ‘]?';
const FIGURES = [
  ['bahaullah', new RegExp(`Bah[áa]${AP}u${AP}ll[áa]h`, 'u')],
  ['abdulbaha', new RegExp(`${AP}Abdu${AP}l[- ]Bah[áa]`, 'u')],
  ['bab', /\b[Tt]he B[áa]b\b/u],
  ['shoghieffendi', /Shoghi Effendi|\b[Tt]he Guardian\b/u],
  ['uhj', /\b[Tt]he Universal House of Justice\b/u],
];
const figureOf = (name) => FIGURES.find(([, re]) => re.test(String(name || '')))?.[0] || null;
// A Guardian letter that speaks of him in the third person was written by his secretary on his behalf.
const ON_BEHALF = /\b(?:the (?:beloved )?Guardian|Shoghi Effendi)\b|\b(?:asked|instructed|wishes|directed) (?:me|us) to\b|\bon (?:his|the Guardian['’]s) behalf\b/i;

/** The credit a passage's words carry: its writer, or "a letter written on behalf of Shoghi Effendi". Pure. */
export function creditOf(p) {
  const who = p?.source_author || '';
  return figureOf(who) === 'shoghieffendi' && ON_BEHALF.test(p?.text || '') ? 'a letter written on behalf of Shoghi Effendi' : who;
}

const SPEECH = '(?:states?|stated|writes?|wrote|says?|said|explains?|explained|notes?|noted|affirms?|affirmed|declares?|declared|teaches|taught|urges?|urged|warns?|warned|counsels?|counselled|reminds?|reminded|adds?|added|observes?|observed|stresses|stressed|emphasi[sz]es|emphasi[sz]ed|describes?|described|calls?|called|puts? it|assures?|assured|asserts?|asserted|reveals?|revealed|proclaims?|proclaimed)';

/**
 * A quotation whose sentence names a Central Figure / the Guardian / the House as its speaker, held by a passage whose writer
 * is a different one of them (or an on-behalf letter), is re-credited to the passage's writer. Words the passage itself
 * quotes or reports (it names the speaker) are left alone, and so is a passage by anyone else (a scholar may lay out a quoted
 * Writing without quotation marks). Pure.
 */
export function fixQuoteSpeakers(text, passages) {
  const pool = (passages || []).filter((p) => p.text && figureOf(p.source_author));
  const src = String(text || '');
  if (!pool.length) return { text: src, fixed: 0 };
  const names = FIGURES.map(([, re]) => re.source).join('|');
  const speakerRe = new RegExp(`(${names})(?![’']s)(?:,[^,]{0,40},)?\\s+(?:\\w+ly\\s+|also\\s+|himself\\s+)?${SPEECH}\\b|(${names})(?![’']s)\\s*[:,]\\s*$`, 'gu');
  let fixed = 0;
  const lines = src.split('\n').map((line) => {
    const edits = [];
    for (const m of line.matchAll(/["“]([^"”\n]+)["”]/g)) {
      const words = m[1];
      if (words.trim().split(/\s+/).length < 5) continue;
      const before = line.slice(0, m.index);
      const start = Math.max(before.search(/[.!?]\s[^.!?]*$/) + 1, 0);
      const sentence = before.slice(start);
      const hit = [...sentence.matchAll(speakerRe)].at(-1);
      if (!hit) continue;
      // the credit must introduce THIS quotation — "Bahá'u'lláh wrote it in answer to …, and in it He describes \"…\"" names the book's author, not the quote's
      if (sentence.length - hit.index - hit[0].length > 40) continue;
      const named = hit[1] || hit[2], said = figureOf(named);
      const holders = pool.filter((p) => containsQuote(p.text, words));
      if (!holders.length || holders.some((p) => figureOf(p.source_author) === said && creditOf(p) === p.source_author)) continue;
      const p = holders.find((h) => {
        const inner = [...h.text.matchAll(/["“]([^"”]+)["”]/g)].map((x) => x[1]).join(' | ');
        if (inner && containsQuote(inner, words)) return false;                      // the passage quotes these words
        if (figureOf(h.source_author) !== said && FIGURES.find(([k]) => k === said)[1].test(h.text)) return false;   // …or reports them
        return true;
      });
      if (!p) continue;
      const at = start + hit.index + hit[0].indexOf(named);
      const credit = creditOf(p);
      const sentStart = line.slice(start, at).replace(/^[\s>*_-]+/, '') === '';   // a credit opening its sentence is capitalised
      edits.push([at, named.length, sentStart ? credit[0].toUpperCase() + credit.slice(1) : credit]);
    }
    let out = line;
    for (const [at, len, s] of edits.sort((a, b) => b[0] - a[0])) { out = out.slice(0, at) + s + out.slice(at + len); fixed++; }
    return out;
  });
  return { text: lines.join('\n'), fixed };
}

// ── SAID EARLIER / EXACT LINKS ───────────────────────────────────────────────────────────────────────────────────────────
// r6: four conversations called wording "not in the library" that Anís himself had quoted and linked a turn or two before
// (the Íqán, SAQ, a privation passage). A hunt for words the thread already sourced is never a miss.
/** True when an earlier ASSISTANT turn contains the phrase (folded, or ≥ 70 % of its distinct words together). Pure. */
export function saidEarlier(messages, phrase) {
  const want = foldVerbatim(String(phrase || '')); if (!want) return false;
  const ws = [...new Set(want.split(' ').filter(Boolean))];
  const prior = (messages || []).slice(0, -1).filter((m) => m.role === 'assistant').map((m) => foldVerbatim(String(m.content || '')));
  return prior.some((f) => f.includes(want) || ws.filter((w) => ` ${f} `.includes(` ${w} `)).length >= Math.ceil(ws.length * 0.7));
}

/** The earlier assistant turn's link nearest the phrase, so the reply can point back to it. Pure. */
export function earlierLinkFor(messages, phrase) {
  const want = foldVerbatim(String(phrase || ''));
  const ws = [...new Set(want.split(' ').filter(Boolean))].slice(0, 6);
  for (const m of (messages || []).slice(0, -1).reverse()) {
    if (m.role !== 'assistant') continue;
    const text = String(m.content || '');
    const links = [...text.matchAll(/\[([^\]]{1,300})\]\(((?:https?:)?\/\/[^)\s]{1,600}|https?:[^)\s]{1,600})\)/g)];
    if (!links.length) continue;
    const near = links.find((l) => { const f = foldVerbatim(l[1]); return f.includes(want) || ws.filter((w) => ` ${f} `.includes(` ${w} `)).length >= Math.ceil(ws.length * 0.7); });
    return (near || links[0])[2];
  }
  return null;
}

/** A citation link must reach the paragraph (r6: SAQ, Wesley, Cole were linked at book level while the paragraph was
 *  known). An external link that is paragraph-level stays; a book-level one gives way to the paragraph page. Pure. */
const PARAGRAPH_LEVEL = /paraId=|selectionString=|#p\d+|[?&]p=\d+|#\(|~q=/;
export const paragraphLevelUrl = (url) => PARAGRAPH_LEVEL.test(String(url || ''));
export function exactLink(p) {
  const url = p?.source_url || p?.citation_url || null, reader = p?.reader_url || null;
  if (!url) return reader;
  if (p?.paragraph_index == null || paragraphLevelUrl(url) || !reader) return url;
  return paragraphLevelUrl(reader) ? reader : url;
}

/** Figures whose words a passage REPORTS (named beside a speech verb, with quoted speech present), other than the writer:
 *  a narrator's paragraph that quotes a figure. Feeds the passage header so the writer credits the words to the speaker
 *  and names the narrator as the one who records them. Pure over the passage text. */
export function reportedVoices(text, author = '') {
  const t = String(text || '');
  if (!/["“”«»]/.test(t)) return [];
  const own = figureOf(author);
  const out = [];
  for (const [key, re] of FIGURES) {
    if (key === own) continue;
    const name = new RegExp(`(${re.source})(?![’']s)(?:,[^,]{0,40},)?\\s+(?:\\w+ly\\s+|then\\s+|also\\s+|himself\\s+)?${SPEECH}\\b`, 'u');
    const m = t.match(name);
    if (m) out.push(m[1]);
  }
  return out;
}
