// Quote fidelity for Anis: a quoted span of ≥5 words must appear verbatim (folded) in a retrieved passage.
// Invented words presented as scripture are removed with their sentence (which also carries the false attribution).
// Pure. Used by the live reply guard (respond.js) and the model race (scripts/wip/anis-model-race.mjs).

import { quoteSpans, containsQuote, foldText } from '../quote-text.js';
import { citeLabel } from '../refs/place.js';
import { foldVerbatim } from '../search/verbatim.js';
import { encodeMarker } from '../ool-range.js';

export { quoteSpans };

/** Spans whose words appear in no ONE passage (containsQuote: ellipsis-joined pieces of ≥3 words each must match).
 *  One quotation, one passage: the pieces of a quotation must all come from the same passage — r9 found quotations stitched
 *  from two passages (often by different authors) and presented as one, which a check against all passages joined let pass.
 *  Not a quotation of a text: the READER's own words given back ("the verse about \u201cthe right to work but not the fruits\u201d"), and
 *  a passage's book title (`asked` = the reader's question / turns). 11-04 prod (w3:ref-gita, w8:goth-08): the writer's
 *  first sentence quoted the reader, the gate dropped it, and the reply opened "What they do hold\u2026" with nothing for "they". */
export function unverifiedQuotes(text, passages, { asked = [] } = {}) {
  const hays = [...(passages || []).map((p) => p.text || ''), ...joinedRuns(passages), ...(passages || []).map((p) => p.source_title || p.title || '')].filter(Boolean);
  const reader = [asked].flat().filter(Boolean);
  // a quotation LINKED as a source's words must be in a passage, even when the reader typed it (a misquote asked about)
  const linked = (q) => new RegExp(`\\[[*_]*["\u201c]\\s*${escapeRe(q)}\\s*["\u201d][*_]*\\]\\(`).test(text);
  // a template's strings ({{scene "Title" "line" P4}}) are the writer's labels, never quotations (11-13: every scene line was dropped)
  return quoteSpans(String(text).replace(/\{\{[^{}\n]*\}\}/g, '')).filter((q) => {
    const pieces = String(q).split(/\.\.\.|\u2026/).filter((p) => p.trim().split(/\s+/).length >= 3);
    return pieces.length > 0 && !hays.some((h) => containsQuote(h, q)) && !(reader.some((h) => containsQuote(h, q)) && !linked(q));
  });
}
// 11-12: a prayer quoted whole spans consecutive paragraphs (Short Obligatory Prayer = two) — verify against the joined run too.
function joinedRuns(passages) {
  const byDoc = new Map();
  for (const p of passages || []) {
    if (p?.document_id == null || !Number.isFinite(Number(p.paragraph_index))) continue;
    if (!byDoc.has(p.document_id)) byDoc.set(p.document_id, new Map());
    byDoc.get(p.document_id).set(Number(p.paragraph_index), p.text || '');
  }
  const out = [];
  for (const paras of byDoc.values()) {
    const idx = [...paras.keys()].sort((a, b) => a - b);
    let run = [];
    for (const i of idx) {
      if (run.length && i !== run[run.length - 1] + 1) { if (run.length > 1) out.push(run.map((j) => paras.get(j)).join(' ')); run = []; }
      run.push(i);
    }
    if (run.length > 1) out.push(run.map((j) => paras.get(j)).join(' '));
  }
  return out;
}
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Sentences and sections (11-04) ─────────────────────────────────────────────────────────────────────────────────
// A sentence ends at . ! ? … with any closing quote, bracket or bold/italic mark after it, before a capital in ANY script
// (Á, Ḥ, ʻ…), an opening quote or bracket, a mark, a digit or a list/heading marker; a line break always ends one. A break
// inside an open quotation or link text is not an end. 11-04 prod: the old split (/(?<=[.!?])\s+(?=[A-Z“"[*>(])/) never
// split after `.”`, `.**` or before `Ḥ`/`‘`, so a whole paragraph read as ONE sentence — one unverified quote in it took the
// run-in heading **Bahá'í.** and every sentence of the Bahá'í side with it (cmp-fasting-islam-bahai: 3.8k → 1.9k characters).
const BREAK = /[ \t]*\n\s*|(?<=[.!?…][”"’'»)\]*_]*)\s+(?=[\p{Lu}“"‘'«[*_>(\d#ʻʿ-])/gu;
const isOpen = (s) => (s.match(/“/g) || []).length > (s.match(/”/g) || []).length || (s.match(/"/g) || []).length % 2 === 1
  || (s.match(/\[/g) || []).length > (s.match(/\]/g) || []).length;
/** A paragraph → its sentences, each with the whitespace before it ({ text, sep }). Pure. */
export function sentencePieces(para) {
  const s = String(para || ''), out = [];
  let start = 0, sep = '';
  for (const m of s.matchAll(BREAK)) {
    if (m.index === start) { start += m[0].length; if (out.length) sep = m[0]; continue; }
    const text = s.slice(start, m.index);
    if (!m[0].includes('\n') && isOpen(text)) continue;
    out.push({ text, sep });
    sep = m[0]; start = m.index + m[0].length;
  }
  if (start < s.length) out.push({ text: s.slice(start), sep });
  return out.filter((p) => p.text.trim());
}
export const splitSentences = (para) => sentencePieces(para).map((p) => p.text);
/** A heading: a markdown `#` line or a line that is all bold/italic (a run-in "**Bahá'í.**" counts). Pure. */
export const isHeading = (t) => { const x = String(t || '').trim(); return /^#{1,6}\s+\S/.test(x) || /^(\*\*|__)[^*_\n]+(\*\*|__)[:.]?(\s*\([^()\n]{1,60}\))?[:.]?$/.test(x); };
const bareMarker = (t) => /^\s*(?:[-*•+]|\d+[.)])\s*$/.test(t);
// rejoin kept sentences: a line break between them (from any dropped run) is kept, else a space
const rejoin = (pieces) => pieces.reduce((acc, p) => (acc ? acc + (/\n/.test(p.gap ?? p.sep) ? (p.gap ?? p.sep).replace(/^[ \t]+/, '') : ' ') : '') + p.text, '').trim();

/** A reply cut by the token cap ends at its last whole sentence, never mid-word or mid-link (r9: "…[Some Answered Qu").
 *  An unclosed quotation or link at the end goes with the cut sentence; a heading or a bare list marker left last goes too
 *  (11-04 gd-supersede: the reply ended on "**Where the House speaks about change.**" — its body cut by the cap). Pure. */
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
    if (balanced(cut)) return dropDanglingTail(cut);
    t = t.slice(0, end - 1);
  }
  return t;
}

/** The end of a reply never a heading without its body, or a bare list marker. Pure. */
export function dropDanglingTail(text) {
  let t = String(text || '').trimEnd();
  for (let guard = 0; guard < 20 && t; guard++) {
    const cut = t.search(/\n[^\n]*$/), line = cut < 0 ? t : t.slice(cut + 1);
    const pieces = sentencePieces(line), last = pieces.at(-1)?.text ?? '';
    if (!last || !(isHeading(last) || bareMarker(last))) break;
    const at = (cut < 0 ? 0 : cut + 1) + line.lastIndexOf(last);
    t = t.slice(0, at).trimEnd();
  }
  return t;
}

const NOTHING_LEFT = 'I didn’t find a passage that says this directly in this search. Could you tell me a little more about what you’re looking for?';   // r9: never a claim about the whole library

// ── What a dropped sentence leaves behind (11-04 prod10) ───────────────────────────────────────────────────────────────
// A sentence that LEANS BACK on the one before it: a pronoun or demonstrative as its first or second word ("What they do
// hold…", "That is the closest…", "In this sense…"), or a connective first ("But…", "So…"). Read on the writer's text only.
// Not "it": too often a dummy subject ("It is written: …").
const strip = (t) => String(t || '').replace(/^[\s>*_#\-–—•\d.)]+/, '').replace(/[[\]*_]/g, '');
const BACK_ANY = /^(?:they|them|their|he|she|him|his|her|this|that|these|those|such|both|neither)$/i;
const BACK_FIRST = /^(?:but|yet|so|instead|however|rather|still|thus|hence|therefore)$/i;
export function leansBack(t) {
  const w = strip(t).split(/\s+/).slice(0, 2).map((x) => x.replace(/[^\p{L}']/gu, ''));
  return BACK_FIRST.test(w[0] || '') || w.some((x) => BACK_ANY.test(x));
}
const isQuoteLine = (t) => /^\s*>/.test(t);
const PARAPHRASE_WORDS = 20;
const GLOSS_SCRIPT = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Greek}]/u, GLOSS_WORDS = 8;
const bareQuoteMark = (t) => /^[\s>]*$/.test(t);
// a source line under a quotation: "— [*The Gospel of Luke*](…) (KJV)", "> — Bahá'u'lláh, *Gleanings*"
const isAttribution = (t) => /^[\s>*_]*(?:[—–―]|--)\s*\S/.test(t) && !quoteSpans(t).length && String(t).length < 400;
/** The quotation's words kept as the writer's own: quote marks and the source link go, so it reads as a paraphrase. Pure. */
export function unquote(t, bad) {
  let s = String(t);
  for (const q of bad) {
    const e = escapeRe(q);
    s = s.replace(new RegExp(`\\[[*_]*["“]\\s*${e}\\s*["”][*_]*\\]\\([^)]*\\)`, 'g'), q).replace(new RegExp(`["“]\\s*${e}\\s*["”]`, 'g'), q);
  }
  return s;
}

/** Drop every sentence that carries an unverified quote — that sentence only (sentencePieces), never its neighbours — and a
 *  heading whose whole section went with it. Nothing it leaves refers to what went (11-04 prod10): a sentence leaning back on
 *  a dropped one goes too — unless the dropped one OPENED the reply, which then stays with its quotation unquoted (a
 *  paraphrase) so the reply does not open "What they do hold…"; a source line ("— [Luke](…)") whose quotation went goes with
 *  it, and an emptied blockquote leaves no bare ">". `asked` = the reader's words (see unverifiedQuotes). Returns the cleaned
 *  text, how many sentences went, and how many quotations were kept as paraphrase. */
export function dropUnverified(text, passages, { asked = [] } = {}) {
  const bad = unverifiedQuotes(text, passages, { asked });
  if (!bad.length) return { text, removed: 0 };
  let removed = 0;
  // a short GLOSS beside the original script ("- **لمن أراد** (*liman aráda*): \"for whoever wishes\"": the writer's own English of a word,
  // 11-12 Arabic student — dropping it left "The English has…" orphans) loses its marks, never its sentence
  let unquoted = 0;
  const glossed = new Set();
  const paras = String(text).split(/\n{2,}/).map((para) => sentencePieces(para).map((p) => {
    const mine = bad.filter((q) => p.text.includes(q));
    if (mine.length && GLOSS_SCRIPT.test(p.text) && mine.every((q) => q.split(/\s+/).length <= GLOSS_WORDS)) { unquoted++; mine.forEach((q) => glossed.add(q)); return { ...p, text: unquote(p.text, mine), drop: false, heading: isHeading(p.text) }; }
    if (mine.length) removed++;
    return { ...p, drop: mine.length > 0, heading: isHeading(p.text) };
  }));
  // a quotation the split still cut in two (its words span pieces): drop every piece it touches, as before
  for (const q of bad) for (const ps of paras) {
    if (glossed.has(q)) continue;
    if (ps.some((p) => p.drop && p.text.includes(q))) continue;
    const joined = ps.map((p) => p.text).join(' ');
    const at = joined.indexOf(q);
    if (at < 0) continue;
    let pos = 0;
    for (const p of ps) { const end = pos + p.text.length; if (end > at && pos < at + q.length && !p.drop) { p.drop = true; removed++; } pos = end + 1; }
  }
  const flat = paras.flat();
  // a sentence leaning back on a dropped one: the dropped one stays as paraphrase (its quotation unquoted) when it OPENED the
  // reply, or when the follower quotes a passage (its own evidence, not to be lost); otherwise the follower goes with it
  const firstText = flat.findIndex((p) => !p.heading);
  for (let i = 0; i < flat.length; i++) {
    const d = flat[i];
    if (!d.drop || d.heading) continue;
    const next = flat.find((p, k) => k > i && !p.drop && !bareQuoteMark(p.text));
    if (!next || next.heading || isQuoteLine(next.text) || isAttribution(next.text) || !leansBack(next.text)) continue;
    // never a long one: words the gate keeps out (an invented passage, or a copyrighted book past its clipped excerpt —
    // encumbered-leaks) must not come back unquoted
    const mine = bad.filter((q) => d.text.includes(q));
    const paraphrase = !isQuoteLine(d.text) && mine.length > 0 && mine.every((q) => q.split(/\s+/).length <= PARAPHRASE_WORDS);
    if (paraphrase && (i === firstText || quoteSpans(next.text).length)) { d.text = unquote(d.text, bad); d.drop = false; removed--; unquoted++; }
    else if (!quoteSpans(next.text).length) { next.drop = true; removed++; }
  }
  // a source line whose quotation went: in a blockquote, when every line of its quotation went; else when the line before went
  flat.forEach((p, i) => {
    if (p.drop || !isAttribution(p.text)) return;
    const before = [];
    for (let k = i - 1; k >= 0; k--) {
      if (bareQuoteMark(flat[k].text)) continue;
      if (isQuoteLine(p.text) && isQuoteLine(flat[k].text)) { before.push(flat[k]); continue; }
      if (!before.length) before.push(flat[k]);
      break;
    }
    if (!before.length || before.every((b) => b.drop)) p.drop = true;
  });
  // a heading whose section (every sentence up to the next heading) was dropped goes too
  flat.forEach((p, i) => {
    if (!p.heading || p.drop) return;
    const body = [];
    for (let j = i + 1; j < flat.length && !flat[j].heading; j++) body.push(flat[j]);
    if (body.length && body.every((b) => b.drop)) p.drop = true;
  });
  const out = paras.map((ps) => {
    let gap = null;
    const kept = [];
    for (const p of ps) {
      if (p.drop) { if (/\n/.test(p.sep)) gap = p.sep; continue; }
      kept.push({ ...p, gap: kept.length && gap && !/\n/.test(p.sep) ? gap : p.sep }); gap = null;
    }
    return noBareQuoteMarks(rejoin(kept));
  }).filter(Boolean).join('\n\n').trim();
  return { text: out && quoteSpans(out).length + out.split(/\s+/).length > 12 ? out : NOTHING_LEFT, removed, ...(unquoted ? { unquoted } : {}) };
}
// a ">" line with no quoted line on both sides of it (the blockquote's words went) goes; a paragraph of only ">" is empty
const noBareQuoteMarks = (para) => {
  const lines = para.split('\n'), content = (l) => l !== undefined && isQuoteLine(l) && !bareQuoteMark(l);
  return lines.filter((l, i) => !bareQuoteMark(l) || !isQuoteLine(l) || (lines.slice(0, i).some(content) && lines.slice(i + 1).some(content)))
    .join('\n').trim();
};

/**
 * Streaming gate: release text a SENTENCE at a time, and only sentences whose quotes are verified — so an invented
 * quote is never shown, even briefly. A "." inside an open quotation is not a sentence end. push() per token chunk;
 * flush() at the end releases the remainder (verified the same way).
 */
export function createSentenceGate(passages, emit, { asked = [] } = {}) {
  let buf = '';
  const release = (s) => { if (s && !unverifiedQuotes(s, passages, { asked }).length) emit(s); };
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
const sentencesOf = (p) => splitSentences(p);

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
      const link = q.citation_url && !p.includes(q.citation_url) ? ` ([${citeLabel(q.source_title || 'source', q.place)}](${q.citation_url}))` : '';
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
  const link = (p) => `[${citeLabel(p.source_title || 'source', p.place)}](${p.citation_url})`;
  // blockquotes: consecutive "> " lines; the line after the block may carry the attribution
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*>/.test(lines[i])) { out.push(lines[i]); continue; }
    let j = i;
    while (j < lines.length && /^\s*>/.test(lines[j])) j++;
    const block = lines.slice(i, j);
    const body = block.map((l) => l.replace(/^\s*>\s?/, '')).join(' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_]/g, '');
    // the writer's own source line may sit after a blank line ("> …\n\n— [*Lights of Guidance*](…)"): a linked one already cites it
    let k = j; while (k < lines.length && !lines[k].trim()) k++;
    const cited = k < lines.length && isAttribution(lines[k]) && /\]\(https?:\/\//.test(lines[k]);
    const p = !cited && body.split(/\s+/).length >= 5 ? holder(body.replace(/^["“]|["”]$/g, ''), `${block.join('\n')}\n${lines[j] || ''}`) : null;
    out.push(...block);
    if (p) { out.push(`> — ${link(p)}`); linked++; }
    i = j - 1;
  }
  // inline quotations, outside blockquotes; the window is the quotation's sentence (back to the last sentence end, on to the next)
  const res = out.map((line) => { const done = new Set(); return /^\s*>/.test(line) ? line : line.replace(/["“]([^"”\n]+)["”]/g, (m, words, off, all) => {
    if (words.trim().split(/\s+/).length < 5) return m;
    const before = all.slice(0, off), after = all.slice(off + m.length);
    if (/^[*_]*\]\(/.test(after)) return m;   // already link text ([*"…"*](url)): a link inside it would nest and break both
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

// ── QUOTATION STYLE (Chad 11-04: "quotes are hard to distinguish from text") ─────────────────────────────────────────────
/** A quotation longer than this many words leaves its sentence for a block of its own. Measured 11-04 over 739 inline
 *  quotations (≥5 words) in 288 battery replies (11-01 r8, 11-03 writer A/B): median 11 words, p90 23, p95 30 — so only the
 *  longest ~4%, the ones running past two lines of a chat bubble, become blocks. */
export const LONG_QUOTE_WORDS = 30;
const RTL_LETTER = /[֐-׿؀-ۿݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/gu;
const LATIN_LETTER = /\p{Script=Latin}/gu;
const letters = (s, re) => (String(s).replace(/\]\([^)]*\)/g, ']').match(re) || []).length;
const wordCount = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
const LINKED_Q = /(?:(?<![*_])([*_])|)\[([*_]?)(["“])([^"”\n\]]+)(["”])([*_]?)\]\(([^)\s]+)\)(?:([*_])(?![*_])|)/g;
const BARE_Q = /(?:(?<![*_\w])([*_])|)(["“])([^"”\n]+?)(["”])(?:([*_])(?![*_\w])|)/g;
const CITES = /^(?:\s*(?:\(\s*\[[^\]\n]*\]\([^)\s]*\)\s*\)|[—–]\s*(?:\[[^\]\n]*\]\([^)\s]*\)|\*[^*\n]+\*)))+/;
const PLAIN_LINE = (line) => !/^\s*(?:>|[-*+•]\s|\d+[.)]\s|#|\|)/.test(line);

/**
 * Mark the quotations in a reply so every surface renders them the same way (quote-style.js does the rendering):
 * - a quotation a retrieved passage holds (≥5 words: containsQuote; 2–4 words: the folded phrase in a passage) is italic —
 *   `*“…”*`, or `[*“…”*](url)` when the quotation is the link;
 * - italics around a quotation NO passage holds (the reader's own words, a paraphrase) are removed — never styled as a source;
 * - a held quotation of more than `longWords` words that ends its sentence becomes a blockquote with its citation under it
 *   ("> — [Title](url)"); its lead-in stays a paragraph, ending in a colon;
 * - in a reply written in Latin script, a line wholly in Arabic/Persian/Hebrew script (an original) is wrapped `*…*` — the
 *   renderer keeps it upright and right-to-left, in the quotation colour.
 * Blockquote lines, code fences and one-word quotations are left as they are. Pure.
 */
export function markQuotes(text, passages, { longWords = LONG_QUOTE_WORDS } = {}) {
  const src = String(text || '');
  if (!src) return { text: src, marked: 0, blocks: 0 };
  const hays = (passages || []).map((p) => p.text || '').filter(Boolean);
  const folded = hays.map((h) => ` ${foldText(h)} `);
  const held = (words) => {
    const w = String(words).replace(/[*_]/g, '').trim(), n = wordCount(w);
    if (n >= 5) return hays.some((h) => containsQuote(h, w));
    if (n < 2) return false;
    const f = foldText(w);
    return !!f && folded.some((h) => h.includes(` ${f} `));
  };
  // a Latin-script reply: more of its lines are mostly Latin than mostly RTL (by lines, so a long original can't flip it)
  const lean = src.split('\n').map((l) => Math.sign(letters(l, LATIN_LETTER) - letters(l, RTL_LETTER)));
  const latinReply = lean.some((v) => v > 0) && lean.filter((v) => v > 0).length >= lean.filter((v) => v < 0).length;
  let marked = 0, blocks = 0, fence = false;
  const out = [];
  for (const line of src.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; out.push(line); continue; }
    if (fence || /^\s*>/.test(line) || !line.trim()) { out.push(line); continue; }
    // an original in right-to-left script on its own line (list marker allowed)
    const lead = line.match(/^\s*(?:[-*+•]\s+|\d+[.)]\s+)?/)[0], body = line.slice(lead.length);
    if (latinReply && letters(body, RTL_LETTER) && !letters(body, LATIN_LETTER) && !/[*_]/.test(body)) { out.push(`${lead}*${body.trim()}*`); marked++; continue; }
    // quotations → tokens (linked first, so a bare pass never sees the quote marks inside link text)
    const toks = [];
    const tok = (o) => { toks.push(o); return `\u0001${toks.length - 1}\u0001`; };
    let s = line.replace(LINKED_Q, (m, o1, i1, q1, words, q2, i2, url, o2) => {
      const n = wordCount(words);
      if (n < 2) return m;
      const pair = o1 && o2 && o1 === o2;
      const keepOuter = (t) => (pair ? t : `${o1 || ''}${t}${o2 || ''}`);
      if (!held(words)) return tok({ md: keepOuter(`[${q1}${words}${q2}](${url})`) });
      marked++;
      const outer = !pair && !!(o1 || o2);
      return tok({ md: `${outer ? o1 || '' : ''}[*${q1}${words}${q2}*](${url})${outer ? o2 || '' : ''}`, block: `[${q1}${words}${q2}](${url})`, long: n > longWords && !outer, stops: /[.!?…]$/.test(words.trim()) });
    });
    s = s.replace(BARE_Q, (m, o1, q1, words, q2, o2) => {
      const n = wordCount(words);
      if (n < 2) return m;
      const pair = o1 && o2 && o1 === o2;
      if (!held(words)) return pair ? `${q1}${words}${q2}` : m;
      marked++;
      return tok({ md: `${pair ? '' : o1 || ''}*${q1}${words}${q2}*${pair ? '' : o2 || ''}`, block: `${q1}${words}${q2}`, long: n > longWords && !(o1 || o2), stops: /[.!?…]$/.test(words.trim()) });
    });
    // long quotations that end their sentence → their own block (plain paragraph lines only)
    const parts = s.split(/\u0001(\d+)\u0001/);
    const canBlock = PLAIN_LINE(line);
    const paras = [];
    let buf = '';
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) { buf += parts[i]; continue; }
      const t = toks[Number(parts[i])];
      const next = parts[i + 1] ?? '';
      const cites = (next.match(CITES) || [''])[0];
      const rest = next.slice(cites.length);
      // the sentence ends with the quotation: nothing follows, a full stop follows, or the quotation's own words end the
      // sentence and a new one (capital letter) starts
      const endsSentence = /^\s*$|^\s*[.!?…]+["”’)]*(?:\s|$)/.test(rest) || (t.stops && /^\s+\p{Lu}/u.test(rest));
      if (!(canBlock && t.long && endsSentence)) { buf += t.md; continue; }
      const intro = buf.trimEnd();
      if (intro) paras.push(/[:.!?…]["”’)]*$/.test(intro) ? intro : `${intro.replace(/[,;—–-]+$/, '').trimEnd()}:`);
      const cite = cites.replace(/\(\s*(\[[^\]\n]*\]\([^)\s]*\))\s*\)/g, '$1').replace(/^\s*[—–]\s*/, '').replace(/\s+/g, ' ').trim();
      paras.push(`> ${t.block}${cite ? `  \n> — ${cite}` : ''}`);   // two spaces: a hard break, the citation on its own line
      blocks++;
      parts[i + 1] = rest.replace(/^\s*[.!?…]*["”’)]*\s*/, '');
      buf = '';
    }
    if (buf.trim() || !paras.length) paras.push(buf);
    out.push(paras.join('\n\n').replace(/\u0001(\d+)\u0001/g, (m, k) => toks[Number(k)].md));
  }
  return { text: out.join('\n'), marked, blocks };
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
// A Guardian letter that names him ("Shoghi Effendi"), or has "the Guardian" AS ITS SUBJECT ("wishes / feels / was pleased"), was
// written by his secretary on his behalf. A bare "the Guardian" is not enough: his own books speak of the Guardianship (11-12: God Passes
// By's "unique in the annals" credited to "a letter written on behalf of Shoghi Effendi"), and his own books are never on-behalf.
const ON_BEHALF = /\bShoghi Effendi\b|\bthe (?:beloved )?Guardian\s+(?:(?:has|had|is|was|would|does|did|very much|very|most|greatly|deeply|also|therefore|certainly|fully)\s+){0,2}(?:wish|feel|felt|ask|instruct|direct|desire|hope|pleased|appreciat|urg|want|request|assur|trust|pray|grateful|regret|advis|sorry|delighted|happy|glad|thank|values?|considers?|believes?|does not)|\b(?:asked|instructed|wishes|directed) (?:me|us) to\b|\bon (?:his|the Guardian['’]s) behalf\b|\bdirected by (?:Shoghi Effendi|the (?:beloved )?Guardian)\b/i;
const SE_OWN_BOOK = /\b(?:God Passes By|World Order of Bah|Advent of Divine Justice|Promised Day Is Come|Dispensation of Bah|Call to the Nations)/i;

/** The credit a passage's words carry: its writer, or "a letter written on behalf of Shoghi Effendi". Pure. */
export function creditOf(p) {
  const who = p?.source_author || '';
  return figureOf(who) === 'shoghieffendi' && !SE_OWN_BOOK.test(p?.source_title || p?.title || '') && ON_BEHALF.test(p?.text || '') ? 'a letter written on behalf of Shoghi Effendi' : who;
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
      const start = Math.max(before.search(/[.!?][*_”"’)]*\s[^.!?]*$/) + 1, 0);   // a sentence after a bold heading ("…personal.** He")
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
      const sentStart = line.slice(start, at).replace(/^[*_”"’)]*[\s>*_-]+/, '') === '';   // a credit opening its sentence is capitalised
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

// ── Blockquotes hold only book text (Chad 11-04) ─────────────────────────────────────────────────────────────────────
// "Anis block-quotes himself instead of the book." A `>` line must be words from a passage given (or the reader's own); the
// writer's words in a blockquote leave it as plain paragraphs, and a block left with no book text loses its source line.
const PAGE_MARK = /\[pg\s*\d+\]\s*/gi;
const bqClean = (l) => String(l).replace(/^\s*>\s?/, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_]/g, '')
  .replace(PAGE_MARK, '').replace(/^\s*\(?\d{1,4}[.):]?\s+(?=\S)/, '').replace(/^[\s"“‘'«]+|[\s"”’'»]+$/g, '').trim();
const tight = (s) => s.replace(/ /g, '');
/** A blockquote line's kind against the hays: 'held' (every sentence of ≥3 words is in one of them), 'own', 'attr', 'neutral'. */
function bqKind(line, hays) {
  if (isAttribution(line)) return 'attr';
  const pieces = sentencePieces(bqClean(line)).flatMap((p) => p.text.split(/\.\.\.|…|\[[^\]]*\]/))
    .map(foldVerbatim).filter((f) => f.split(' ').filter(Boolean).length >= 3);
  if (!pieces.length) return 'neutral';
  return pieces.every((f) => hays.some((h) => h.loose.includes(f) || h.tight.includes(tight(f)))) ? 'held' : 'own';
}
/** Every blockquote line that is not book text (passages[].text) or the reader's words (`asked`) leaves the blockquote. Pure.
 *  → { text, unquoted } (unquoted = lines moved out). */
export function bookOnlyBlockquotes(text, passages, { asked = [] } = {}) {
  const src = String(text || '');
  if (!/^\s*>/m.test(src)) return { text: src, unquoted: 0 };
  const hays = [...(passages || []).map((p) => p.text), ...[asked].flat()].filter(Boolean)
    .map((t) => { const loose = foldVerbatim(String(t).replace(PAGE_MARK, '')); return { loose, tight: tight(loose) }; });
  const lines = src.split('\n'), out = [];
  let unquoted = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*>/.test(lines[i])) { out.push(lines[i]); continue; }
    let j = i;
    while (j < lines.length && /^\s*>/.test(lines[j])) j++;
    const block = lines.slice(i, j).map((l) => ({ l, kind: bqKind(l, hays) }));
    i = j - 1;
    if (!block.some((b) => b.kind === 'own')) { out.push(...block.map((b) => b.l)); continue; }
    const book = block.some((b) => b.kind === 'held');
    // regroup: runs of book lines stay quoted; own lines become paragraphs (blank lines around them, so markdown's lazy
    // continuation does not pull them back into the quote)
    const parts = [];
    for (const b of block) {
      if (b.kind === 'attr' && !book) continue;
      const quoted = b.kind !== 'own', body = b.l.replace(/^\s*>\s?/, '');
      if (!quoted) unquoted++;
      const last = parts[parts.length - 1];
      if (last && last.quoted === quoted) last.lines.push(quoted ? b.l : body);
      else parts.push({ quoted, lines: [quoted ? b.l : body] });
    }
    const groups = parts.map((p) => (p.quoted ? p.lines.filter((l, k, a) => !(/^\s*>\s*$/.test(l) && (k === 0 || k === a.length - 1))) : p.lines.filter((l) => l.trim())))
      .filter((g) => g.some((l) => !/^\s*>\s*$/.test(l)));
    if (out.length && out[out.length - 1].trim()) out.push('');
    groups.forEach((g, k) => { if (k) out.push(''); out.push(...g); });
    if (!book && j < lines.length && isAttribution(lines[j])) i = j;   // its source line goes with it
    if (i + 1 < lines.length && lines[i + 1].trim()) out.push('');
  }
  return { text: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), unquoted };
}

// ── Elided quotations made whole (11-04 digest #161, #138) ────────────────────────────────────────────────────────────
// A quotation with an ellipsis INSIDE it that bridges words its passage has ("the entire human race. … It is not for him",
// "a struggle… Progress is attained" where the copy reads "a struggle Progress") is a stitched, clipped Writing. Code puts
// back the passage's own words, verbatim (its typos kept — never repaired with an ellipsis), and ends the quotation at the
// sentence end. A bridged stretch longer than ELIDED_GAP_WORDS is not filled: the quotation starts instead at the sentence
// that opens the part the reader asked about (else the last part) — trimmed only at a sentence boundary, never with "…".
export const ELIDED_GAP_WORDS = 80;
const ELLIPSIS = /\s*(?:\.\.\.|…)\s*/;
const QUOTE_MARK = /[‘’ʼ`'"“”]/;
/** raw → { s: foldText(raw), at: [raw index of each folded char] } — foldText with a map back to the raw text. */
function foldMapped(raw) {
  let s = '';
  const at = [];
  for (let i = 0; i < raw.length; i++) {
    for (const ch of raw[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()) {
      if (QUOTE_MARK.test(ch)) continue;
      if (/[a-z0-9]/.test(ch)) { s += ch; at.push(i); } else if (s && s[s.length - 1] !== ' ') { s += ' '; at.push(i); }
    }
  }
  if (s.endsWith(' ')) { s = s.slice(0, -1); at.pop(); }
  return { s, at };
}
/** The folded piece's first whole-word occurrence in s at or after `from` → index, or -1. */
function findWords(s, piece, from) {
  for (let i = s.indexOf(piece, from); i >= 0; i = s.indexOf(piece, i + 1)) {
    if ((i === 0 || s[i - 1] === ' ') && (i + piece.length === s.length || s[i + piece.length] === ' ')) return i;
  }
  return -1;
}
const SENT_END = /^[^.!?\n]*?[.!?]+["”’'»)\]]*(?=\s|$)/;
/** Where the sentence holding raw[i] begins (just after the previous . ! ? and its closing marks, or the passage start). */
function sentenceStart(raw, i) {
  const m = [...raw.slice(0, i).matchAll(/[.!?]+["”’'»)\]]*\s+/g)].pop();
  return m ? m.index + m[0].length : 0;
}
const wordsIn = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
/** One quoted span's inner text → the passage's contiguous words, or null (nothing to change, or no ONE passage holds every
 *  part in order — that is the unverified-quote gate's business). `asked` = the reader's words. Pure. */
export function wholeQuote(inner, passages, { asked = [] } = {}) {
  const parts = String(inner).split(ELLIPSIS);
  const lead = !parts[0].trim(), trail = parts.length > 1 && !parts[parts.length - 1].trim();
  const pieces = parts.map((p) => p.trim()).filter(Boolean);
  if (!(pieces.length >= 2 || (trail && pieces.length === 1))) return null;
  const folded = pieces.map(foldText);
  if (folded.some((f) => !f)) return null;
  const readers = [asked].flat().filter(Boolean).map(foldText);
  for (const p of passages || []) {
    const raw = String(p?.text || '');
    if (!raw) continue;
    const { s, at } = foldMapped(raw);
    const spans = [];
    let from = 0;
    for (const f of folded) {
      const i = findWords(s, f, from);
      if (i < 0) break;
      spans.push([at[i], at[i + f.length - 1] + 1]);
      from = i + f.length;
    }
    if (spans.length !== folded.length) continue;
    // runs of parts joined by bridges short enough to fill; a longer bridge starts a new run
    const runs = [[0]];
    for (let k = 1; k < spans.length; k++) {
      if (wordsIn(raw.slice(spans[k - 1][1], spans[k][0])) > ELIDED_GAP_WORDS) runs.push([k]); else runs[runs.length - 1].push(k);
    }
    const asks = (k) => folded[k].split(' ').length >= 3 && readers.some((r) => r.includes(folded[k]));
    const run = runs.find((r) => r.some(asks)) || runs[runs.length - 1];
    let start = spans[run[0]][0], end = spans[run[run.length - 1]][1];
    if (run[0] > 0) start = sentenceStart(raw, start);   // a part left out: begin at its sentence, never mid-passage
    const tail = raw.slice(end).match(SENT_END);
    if (tail && wordsIn(tail[0]) <= ELIDED_GAP_WORDS) end += tail[0].length;
    const words = raw.slice(start, end).replace(PAGE_MARK, '').replace(/\s+/g, ' ').trim()
      .replace(/^["“‘'«]+|["”’'»]+$/g, '').replace(/“/g, '‘').replace(/”/g, '’').replace(/"/g, '\'');
    const midSentence = lead && run[0] === 0 && start > sentenceStart(raw, start);
    const out = `${midSentence ? '… ' : ''}${words}`;
    return out !== String(inner).trim() ? out : null;
  }
  return null;
}
/** Every quoted span with an ellipsis inside it (or a trailing one) → its passage's own contiguous words (wholeQuote). Spans
 *  across lines or holding a link are left alone. → { text, restored }. Pure. */
export function restoreElisions(text, passages, { asked = [] } = {}) {
  let restored = 0;
  const out = String(text || '').replace(/(["“])([^"”\n]+)(["”])/g, (m, open, inner, close) => {
    if (!ELLIPSIS.test(inner) || /\]\(/.test(inner) || wordsIn(inner) < 5) return m;
    const whole = wholeQuote(inner, passages, { asked });
    if (!whole) return m;
    restored++;
    return `${open}${whole}${close}`;
  });
  return { text: out, restored };
}

// ── PHRASE LINKS (Chad 11-10: "the link should highlight the phrase being linked, not the entire paragraph") ──────────────
const OL_LINK = /\[((?:[^\[\]]|\[[^\]]*\])+)\]\((https:\/\/(?:www\.)?oceanlibrary\.com\/[^)\s]+)\)/g;
const quotedIn = (s) => { const m = String(s).replace(/[*_]/g, '').match(/["“]([^"”\n]+)["”]/); return m ? m[1] : null; };
// an elided quotation highlights its longest unbroken piece (OceanLibrary selects one contiguous span)
const longestPiece = (q) => q.split(/\s*(?:…|\.\.\.)\s*/).map((x) => x.trim()).sort((a, b) => b.length - a.length)[0] || '';
/** An OceanLibrary paragraph link → the same paragraph with the "#~q=" marker, so the output pass (ocean-links.js) selects
 *  just those words; words not in the paragraph fall back there to the whole paragraph. Pure. */
export function narrowOceanLink(url, quote) {
  const words = longestPiece(String(quote || ''));
  if (!/paraId=/.test(url) || words.split(/\s+/).length < 2) return url;
  return `${url.replace(/#.*$/, '').replace(/&selectionString=[^&#]*/, '')}#~q=${encodeMarker(words)}`;
}
/** Every OceanLibrary link that carries a quotation — in its own text ([*"…"*](url)) or right before it ("…" ([cite](url)),
 *  "…" — [cite](url)) — highlights that quotation, not the paragraph. Pure. */
export function narrowQuoteLinks(text) {
  return String(text || '').replace(OL_LINK, (m, label, url, off, all) => {
    const before = all.slice(Math.max(0, off - 400), off);
    const prior = before.match(/["“]([^"”\n]+)["”][*_]*\s*(?:\(|[—–-]\s*)?$/);
    const q = quotedIn(label) ?? prior?.[1] ?? null;
    return q ? `[${label}](${narrowOceanLink(url, q)})` : m;
  });
}
