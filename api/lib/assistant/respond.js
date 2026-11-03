// Anis chat layer — the seeker/student companion embedded on many sites (web component) and reachable by email.
// Conversation + Jev-planned RAW search (no LLM in retrieval) → ONE fast streamed answer, in the site's persona,
// shaped by the Seeker Companion's relationship plan. Transport-neutral: the widget streams onEvent('text'),
// email uses the returned text. Model: ONE global, switchable setting ANIS_LLM="provider:model[:reasoning_effort]".
// Deps (lazy, injectable for tests): routes/chat.js executeSearch, jafar-pipeline craftAnswerStream, companion/.

import { extractPhrases, fixedPhrases, hintsOf } from './phrases.js';
import { religionsReply } from './library-facts.js';
import { findWork, workReply, workLead, workOffer, workAboutQuery, aboutWork, WORK_HOW, linkTitles, dropPreamble } from './work-request.js';
import { readerUrl } from '../source-links.js';
import { speakerTradition, followUpAsks } from '../search-plan.js';
import { questionSubject } from '../planned-search.js';
import { timed } from './timeline.js';
import { textRequest } from './text-request.js';
import { modelFor } from '../model-roles.js';
import { calculateCost } from '../model-registry.js';
import { dropUnverified, createSentenceGate, completeIntroducedQuotes, linkQuotes, fixQuoteSpeakers } from './quotes.js';
import { guardRows } from '../rights/guard.js';
import { termQuestion, resolveTerm, ctaiTerm, termEvidence, termFormatHow, placeRenderings } from './ctai-term.js';
import { toFindings, dataProfile, describeProfile } from './findings.js';
import { chooseFormat } from './formats.js';
import { channelFor } from './channels.js';
import { detectQuotation, stripMarkup } from '../quote-detect.js';
import { foldVerbatim } from '../search/verbatim.js';
import { unmachine, dropQuibbles } from './lint.js';
import { looksLikeLanguageQuestion, LANGUAGE_HOW } from './language.js';
import { research as runResearch, libraryTools, RESEARCH_HOW, isExactQuote, asksForOriginal } from './researcher.js';
import { looksLikePositionQuestion, positionResearch, POSITION_HOW } from './position.js';

// Default measured 2026-09-25 (scripts/wip/anis-model-race.mjs, lean prompt, 4 questions): Gemini 3.5 Flash-Lite
// 0.53s first token / 1.5s total (gpt-4o-mini 0.61s / 2.3s; Haiku 0.72s / 4.3s; DeepSeek 0.77s / 2.4s). Every model
// sometimes quotes words not in its passages — the sentence gate (quotes.js) is the protection, not the model.
// Groq gpt-oss is faster still but its paid tier is unavailable (free = 8k TPM). Switch with ANIS_LLM.
const DEFAULT_LLM = modelFor('assistant-answer');   // the role table (lib/model-roles.js); ANIS_LLM still overrides
const PROVIDERS = new Set(['groq', 'openai', 'deepseek', 'gemini', 'anthropic']);

/** "groq:openai/gpt-oss-120b:low" → { provider, model, reasoning_effort? }; nonsense → the default. */
export function parseLlm(spec) {
  const [provider, ...rest] = String(spec || '').split(':');
  if (!PROVIDERS.has(provider) || !rest.length) return { ...DEFAULT_LLM };
  const effort = ['none', 'low', 'medium', 'high'].includes(rest.at(-1)) && rest.length > 1 ? rest.pop() : null;
  const model = rest.join(':');
  return model ? { provider, model, ...(effort ? { reasoning_effort: effort } : {}) } : { ...DEFAULT_LLM };
}

// The perception line shown while the model starts (Claude-Code-style): specific, because the sources are known.
export function statusLine(citations, plan) {
  if (plan?.widened && plan?.relaxed?.includes('religion')) {
    return `Little in the ${plan.filters?.religion || 'narrower'} texts on this — widening to the whole library…`;
  }
  const titles = [...new Set(citations.map((c) => c.title).filter(Boolean))].slice(0, 2);
  if (!titles.length) return 'Searching more widely…';
  return titles.length === 1 ? `Reading ${titles[0]}…` : `Reading ${titles[0]} and ${titles[1]}…`;
}

/**
 * 【n】 / [n] citation markers → links to OUR passage n (gpt-oss cites this way instead of linking). Only numbers that
 * exist; a passage with no URL becomes its italic title. Real markdown links "[n](…)" are left alone.
 */
export function linkMarkers(text, quotes) {
  return String(text || '').replace(/\s?(?:【(\d+)】|\[(\d+)\](?!\())/g, (m, a, b) => {
    const q = quotes[Number(a || b) - 1];
    if (!q) return m;
    return q.citation_url ? ` ([${q.source_title || 'source'}](${q.citation_url}))` : ` (*${q.source_title || 'source'}*)`;
  });
}

// Words that only mean something with the previous turn ("he", "that book", "there").
const ANAPHOR = /\b(he|him|his|she|her|hers|they|them|their|it|its|this|that|these|those|there|then|he's|she's|they're)\b/i;

/**
 * What to SEARCH for. A follow-up that leans on the conversation (a pronoun, or a short fragment like "and
 * compassion?") is searched together with the question it refers to; a self-contained question is left alone.
 * The model still answers the actual turn — only retrieval is widened.
 */
export function searchQueryFor(messages) {
  const users = (messages || []).filter((m) => m.role === 'user').map((m) => stripMarkup(m.content));
  const said = (messages || []).slice(0, -1).filter((m) => m.role === 'assistant').map((m) => String(m.content || ''));
  const current = users.at(-1) || '';
  // wording to find stands alone: its own "it"/"this" is part of the quotation, not a reference to the last question
  // (over the limit it is distilled, never cut: r6-after 004 T5 lost its second ask, Rāmānuja's words, at character 400)
  if (detectQuotation(current, { said })) return current.length <= QUERY_MAX ? current : distilQuery(current);
  const previous = users.at(-2);
  if (!previous) return distilQuery(current);
  const words = current.split(/\s+/).filter(Boolean).length;
  // a long follow-up that names its own subjects (works, people, terms) stands alone: its "that passage" points into the
  // last REPLY, and the previous question's names only steer retrieval off it (r6, 11-01: 11 of 108 defects —
  // "Muhammad Hira Moses Síyáh-Chál You said … the Maid of Heaven …" missed the Haykal passage)
  if (words > 14 && namesOf(current).length >= 2) return distilQuery(current);
  // the follow-up carries the REFERENCE it leans on (the previous question if short, else its names), never raw history
  return (ANAPHOR.test(current) || words <= 5) ? clipQuery(`${referenceOf(previous)} ${current}`.trim(), QUERY_MAX) : distilQuery(current);
}

// A greeting or address opening the message ("Hello Anís.", "Dear Anís,") is no search term: r6-after soul T1 searched
// "Hello Anís. My grandmother passed away…" whole and surfaced a farm story and a séance, then told a grieving reader the
// texts "do not touch on the afterlife".
const GREETING = /^(?:(?:hello|hi|hey|dear|greetings|good (?:morning|afternoon|evening)|all[aá]h[- ]?u[- ]?abh[aá])\b[^.!?\n]{0,30}?[.!,\n]\s*)+/i;
// a sentence that asks: a question, or a request ("Give me…", "Then do the same for…")
const ASKS_SENTENCE = /\?\s*$|^(?:then |and |also |now |please |so )*(?:give|show|tell|find|quote|list|explain|cite|send|do|say|compare|point)\b/i;
/** The search string for a standalone message: the greeting dropped and, when it is longer than the query limit, the
 *  asking sentences kept first — the ask usually comes last, past the cut (r6-after 004 T5: the Rāmānuja request was
 *  cut off at 400 characters and the reply said his words were not in the library). Pure. */
export function distilQuery(text) {
  const t = String(text || '').replace(GREETING, '').trim() || String(text || '').trim();
  if (t.length <= QUERY_MAX) return t;
  const sents = t.match(/[^.!?\n]+(?:[.!?]+["”’']?|$)/g)?.map((x) => x.trim()).filter(Boolean) || [t];
  let asking = sents.filter((x) => ASKS_SENTENCE.test(x));
  if (!asking.length) asking = [sents.at(-1)];   // no sentence asks: the ask is usually the last one
  // the asking sentences that fit, then (from everything else) the quoted wording and the names (works, people, terms),
  // so every ask and every named object reaches the search; a cut is the last resort
  const fit = [];
  let len = 0;
  for (const x of asking) if (len + x.length + 1 <= QUERY_MAX) { fit.push(x); len += x.length + 1; }
  const kept = fit.join(' ');
  const left = sents.filter((x) => !fit.includes(x)).join(' ');
  const quotes = [...left.matchAll(/["“«]([^"”»]{8,160})["”»]/g)].map((m) => m[1].trim()).filter((q) => !kept.includes(q));
  const names = namesOf(left, 12).filter((n) => !kept.includes(n) && !quotes.some((q) => q.includes(n)));
  return clipQuery([kept, ...quotes, ...names].filter(Boolean).join(' ').replace(/\s+/g, ' '), QUERY_MAX);
}

const QUERY_MAX = 400;
const ASK_WORDS = { translator: 'who translated or recorded it', location: 'the exact location (chapter, volume, page, paragraph, Váḥid/Gate)',
  recipient: 'the recipient and date', next: 'what comes next in the text', original: 'the original Arabic/Persian word',
  authenticity: 'whether the wording is the author\'s own or a paraphrase, commentary or a secretary\'s letter', full: 'the full passage',
  usage: 'where else the word or idea appears', several: 'each separate question' };
const ASKS_HOW = (asks) => `The seeker asks several things: ${asks.map((a) => ASK_WORDS[a] || a).join('; ')}. Answer each one in turn from the passages; for any the passages do not settle, say so in one plain sentence — never drop it.`;
export const NO_ORIGINAL_HOW = 'The seeker also asks for the original Arabic/Persian wording. None of the passages gives the original text: say so in one sentence, and still quote and cite the English passage that answers. Never say the passage itself was not found when it is among the passages.';
export const PUSHBACK_HOW = 'The seeker challenges something about an earlier reply. First check CONVERSATION SO FAR: if you never said, quoted or linked what they describe, say so plainly in one sentence and answer the question underneath it — do not apologise or concede. If you did say it, re-read the passages: where a passage supports it, hold to it and quote the words that show it; where a passage contradicts it or none supports it, say so plainly and give the corrected statement with its passage.';
const clipQuery = (s, n) => (s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, ''));
// Capitalised words that open sentences or address the assistant — never the subject a follow-up refers to.
const NOT_A_NAME = /^(I|I['’]\p{L}+|Ok|Okay|Also|And|But|So|Then|Now|Yes|No|Thanks|Thank|Please|Hello|Hi|Dear|Does|Do|Did|Is|Are|Was|Were|Can|Could|Would|Should|Will|What|Which|Who|Whom|Whose|When|Where|Why|How|The|A|An|In|On|Of|For|If|It|This|That|These|Those|There|He|She|They|You|Your|We|My|Anís|Anis)$/iu;
/** Capitalised names and terms a text carries (≤ max), sentence openers and contractions ("I'd") left out. */
export function namesOf(text, max = 8) {
  const names = [];
  for (const w of stripMarkup(text).match(/[\p{Lu}][\p{L}'’‘ʻ-]+/gu) || []) {
    const t = w.replace(/['’]s$/, '');
    if (!NOT_A_NAME.test(t) && !names.includes(t)) names.push(t);
    if (names.length >= max) break;
  }
  return names;
}
/** The previous question when it is short; otherwise the names and terms it carried (≤ 8), so the query stays a query. */
export function referenceOf(previous) {
  const p = stripMarkup(previous);
  if (p.split(/\s+/).length <= 14) return p;
  return namesOf(p).join(' ');
}

/** The passages a reply was written from, compact, for the exchange log (the strategy auditor reads them). */
export const evidenceOf = (retrieved) => (retrieved || []).slice(0, 10).map((q) => ({ title: q.source_title || null,
  author: q.source_author || null, url: q.citation_url || null, religion: q.religion || null, text: String(q.text || '').slice(0, 1200) }));   // for the auditor (300 read as 'truncated')

const lastUser = (messages) => [...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '';

/** The quotation in a source question: the longest quoted span (≥ 4 words), else the message without a leading request
 *  ("Where is this from:") — what a library's copy appends (reference line, link) is stripped by SourceHunt itself. */
export function quotationIn(text) {
  const t = String(text || '').trim();
  const quoted = [...t.matchAll(/[“"«]([^”"»]{20,})[”"»]/g)].map((m) => m[1].trim()).filter((q) => q.split(/\s+/).length >= 4);   // r5-x: "no compulsion in religion" (4 words) was skipped → the whole request was hunted
  if (quoted.length) return quoted.sort((a, b) => b.length - a.length)[0];
  const m = /^[^\n:]{0,80}?(?:from|source|origin|written|said|quote|find)[^\n:]{0,60}[:?\n]\s*([\s\S]{20,})$/i.exec(t);
  if (m) return trimTalk(m[1].trim());
  // "where can I read the verse that starts with <words>" → the words
  const framed = /\b(?:that|which|it)\s+(?:starts?|begins?|says|reads|goes)(?:\s+(?:with|like))?\s+["“]?(.{15,})$/i.exec(t.split('?')[0]);
  if (framed && trimTalk(framed[1]).split(/\s+/).length >= 4) return trimTalk(framed[1]);
  // "where does it say <words>? i want to read the full passage" → the words (planned-search questionSubject's frame; the
  // rest after the question is talk) — the whole question as the quotation diluted a Qur'án verse below verbatim (11-01)
  const first = t.split('?')[0];
  const subject = questionSubject(`${first}?`);
  return subject !== `${first}?` && subject.split(/\s+/).length >= 4 ? subject : trimTalk(t);
}

// The request that follows a pasted quotation is talk, not the quotation ("…in religion. Which book and which verse number?
// Thank you." diluted Sura II below verbatim and the Arabic Bayán won — r5-x, 11-01): cut at the first question sentence or
// request clause after at least four words of quotation.
const TALK = new RegExp(String.raw`(?:[.!;,?]\s+(?=(?:wh?at|which|where|who|can|could|please|pls|thank|thanks|thx|i)\b)|\s+(?=(?:(?:wh?at|which) (?:book|writing|chapter|verse|source)|where (?:is|does) (?:this|that|it) (?:from|come)|can (?:you|u)|could you|pls|please|thank|thanks|thx|i (?:can['’]?t|cant))\b))`, 'i');
function trimTalk(s) {
  let q = String(s || '').trim();
  if (q.includes('\n')) return q;   // a pasted passage with its reference line / P.S. is SourceHunt's to strip
  const cut = q.search(TALK);
  if (cut > 0 && q.slice(0, cut).split(/\s+/).length >= 4) q = q.slice(0, cut);
  return q.replace(/["”\s]+$/, '').replace(/[,;:]$/, '').trim();
}

/** A link the model wrote to a page we gave it, copied imperfectly (a long text-fragment URL with one character changed), is
 *  replaced by the exact URL we gave — same page (base before ? and #) → our URL. Unknown pages are left to the link filter. */
export function exactLinks(text, urls) {
  const byBase = new Map();
  for (const u of urls || []) { const b = String(u).split('#')[0].split('?')[0]; if (!byBase.has(b)) byBase.set(b, u); }
  return String(text || '').replace(/\]\((https?:\/\/[^\s)]+)\)/g, (m, u) => {
    if ((urls || []).includes(u)) return m;
    const exact = byBase.get(u.split('#')[0].split('?')[0]);
    return exact ? `](${exact})` : m;
  });
}

const clip = (text = '', ranges = [], before = 240, after = 320) => {
  if (!ranges?.length || text.length <= 700) return text;
  const a = Math.max(0, ranges[0][0] - before), b = Math.min(text.length, ranges[ranges.length - 1][1] + after);
  return `${a > 0 ? '… ' : ''}${text.slice(a, b).trim()}${b < text.length ? ' …' : ''}`;
};

/** Every citation is a link (11-01 wording battery: 23 replies named the right source with no link). A reply that names a retrieved
 *  source's title, or quotes 6+ words of a retrieved passage, but links none of them: link the title where it stands, else append the source. */
export function ensureLinks(reply, retrieved) {
  const text = String(reply || ''), pool = (retrieved || []).filter((q) => q.citation_url && q.source_title);
  if (!text.trim() || !pool.length || pool.some((q) => text.includes(q.citation_url))) return text;
  const f = (x) => String(x || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  for (const q of pool) {
    const i = text.indexOf(q.source_title);
    if (i >= 0 && text[i - 1] !== '[' && text[i - 1] !== '*') return `${text.slice(0, i)}[${q.source_title}](${q.citation_url})${text.slice(i + q.source_title.length)}`;
  }
  const ft = f(text);
  for (const q of pool) {
    const w = f(q.text).split(' ');
    for (let i = 0; i + 6 <= w.length; i += 3) if (ft.includes(w.slice(i, i + 6).join(' '))) return `${text}\n\nSource: [${q.source_title}](${q.citation_url})`;
  }
  return text;
}

/** A question about where a quotation comes from, recognised without the triage model (it can time out): a quotation of
 *  8+ words together with source wording ("where is this from", "who wrote", "the source of", "which tablet"). */
export function looksLikeSourceQuestion(text) {
  const t = String(text || '');
  const asks = /\b(where (is|does|did|was) (this|it|that|the)\b[^?]{0,40}\b(from|come|found|written)|what('s| is) the (source|origin)|source of (this|the)|(who|which \w+) (said|wrote|revealed)|which (book|tablet|work|text)|where can i find)/i.test(t);
  const q = quotationIn(t);
  return asks && q !== t.trim() && q.split(/\s+/).length >= 8;   // a quotation SEPARATE from the question (quoted, or after it)
}

// ── ORIGINAL WORDING ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Lal asked four times (10-08…10-13) for the Persian of the "three most holy words" in Persian Hidden Word #19 and got
// secondary works and "I cannot find the Persian" — while the canonical paragraph carries its aligned Persian original.
// Chad: "Anís should have 1) linked original 2) sourceHunt tools and 3) access to CTAI API. There is no world in which Anís
// should not have been able to answer this question." So a question about original-language wording is answered from the
// ORIGINAL: a numbered reference resolves to the canonical paragraph, a quotation goes to SourceHunt, and otherwise the
// ordinary search's hits are given their aligned originals.

/** Asks for the ORIGINAL-language wording ("in Persian", "in the original", "what is the Arabic for …"). Pure. */
export function looksLikeOriginalQuestion(text) {
  return /\b(in (the )?(original|persian|farsi|arabic)\b|(persian|arabic|farsi|original)[- ](word|words|phrase|term|terms|text|wording|version|language|original)\b|what (is|are|was|were) the (persian|arabic|original)\b|original[- ]language)/i.test(String(text || ''));
}

/** "Persian Hidden Word #19", "Arabic Hidden Words no. 5", "PHW 19", "AHW 5" → { part, n }. Pure. */
export function hiddenWordRef(text) {
  const t = String(text || '');
  const m = t.match(/\b(persian|arabic)\s+hidden\s+words?\s*(?:#|no\.?|number)?\s*(\d{1,3})\b/i) || t.match(/\b([pa])\.?\s?h\.?\s?w\.?\s*#?\s*(\d{1,3})\b/i);
  return m ? { part: /^p/i.test(m[1]) ? 'Persian' : 'Arabic', n: Number(m[2]) } : null;
}

const EASTERN_DIGITS = (n) => String(n).replace(/\d/g, (c) => '٠١٢٣٤٥٦٧٨٩'[Number(c)]);
/** The Hidden Word numbered n in its part — the aligned original begins «(n)». Pure over the document's paragraphs. */
export function findHiddenWord(paras, { part, n }) {
  return (paras || []).find((p) => (p.heading || '').includes(part)
    && new RegExp(`^\\s*\\((${n}|${EASTERN_DIGITS(n)})\\)`).test(p.original_text || '')) || null;
}

const HIDDEN_WORDS_DOC = 20809;   // the OceanLibrary canonical (concepts/ctai.js CTAI_DOC_BY_WORK['the-hidden-words'])
const ORIGINAL_HOW = 'The seeker asks for the ORIGINAL-language wording. Answer from the original text given below: quote the exact original words that answer the question (in their own script), give a transliteration and the English rendering beside each, and name where it is — the work it actually appears in; if the seeker named a different work, say gently where the passage is found. Do not interpret, explain the meaning, or add background unless asked — no closing remarks about authority, scholarship or doctrine. If the original given does not contain what was asked, say so in one sentence.';

/** The passage(s) a seeker quoted, to look up: text in quotation marks, else each paragraph long enough to be a
 *  quotation (a question's own words, an attribution line or a P.S. are not). Markdown emphasis and ellipses out. Pure.
 *  10-19: Lal's "Whoso reciteth, in the privacy of his *chamber*, the verses revealed by God, ……  Kitab'i-Aqdas  P.S. I am
 *  NOT asking for translation" was looked up as ONE text — no passage holds that, and Anís said he could not find it. */
export function quotedPassages(text) {
  const clean = (x) => String(x).replace(/[*_]+/g, '').replace(/\.{3,}|…+/g, ' ').replace(/\s+/g, ' ').trim();
  const q = quotationIn(text);
  const marked = q !== String(text || '').trim() ? [clean(q)] : [];
  const paras = String(text || '').split(/\n\s*\n|\n(?=P\.?S\.?)/i).map(clean)
    .filter((x) => x.split(/\s+/).length >= 8 && !/^(?:p\.?s\.?|what|which|where|how|why|is|are|can|could|please|i am|i'm)\b/i.test(x) && !/\?$/.test(x));
  return [...new Set([...marked, ...paras])].slice(0, 3);
}

/** → { retrieved, how, plan } or null: the canonical English paragraph(s) with their aligned originals as evidence. */
async function originalWording(d, question, messages) {
  const ref = hiddenWordRef(question) || hiddenWordRef(messages.map((m) => m.content).join('\n'));
  if (!ref) return quotedOriginal(d, question);
  if (ref) {
    const { getParagraphs } = await import('../docs-repo.js');
    const p = findHiddenWord(await (d.getParagraphs || getParagraphs)(HIDDEN_WORDS_DOC), ref);
    if (p?.original_text) {
      const lang = p.original_lang === 'ar' || ref.part === 'Arabic' ? 'Arabic' : 'Persian';
      // the paragraph's own link (OceanLibrary range) by the universal citation rule — without it the reply cited a bare title
      let url = null;
      try { const { withLinks } = await import('../hit-links.js'); url = (await withLinks([{ id: p.id, doc_id: HIDDEN_WORDS_DOC, paragraph_index: p.paragraph_index, text: p.text, title: 'The Hidden Words' }]))[0]?.url || null; } catch { /* no link */ }
      return { plan: { shape: 'original', ref }, how: ORIGINAL_HOW, retrieved: [
        { text: p.text, source_title: `The Hidden Words, ${ref.part} no. ${ref.n}`, source_author: 'Bahá’u’lláh', citation_url: url,
          doc_id: HIDDEN_WORDS_DOC, paragraph_index: p.paragraph_index, religion: "Baha'i", collection: null, source_lang: 'en', via: 'original' },
        { text: p.original_text, source_title: `The Hidden Words, ${ref.part} no. ${ref.n} (original, ${lang})`, source_author: 'Bahá’u’lláh',
          citation_url: url, doc_id: HIDDEN_WORDS_DOC, paragraph_index: p.paragraph_index, religion: "Baha'i", collection: null,
          source_lang: lang === 'Arabic' ? 'ar' : 'fa', via: 'original' }] };
    }
  }
  return null;
}

/** A work the seeker NAMED as the passage's source: a short line of its own that is not the question ("Kitab'i-Aqdas",
 *  "— Gleanings, p. 295"). Pure. */
export function attributionIn(text) {
  const lines = String(text || '').split('\n').map((l) => l.replace(/^[\s—–-]+|[*_]+/g, '').trim()).filter(Boolean);
  const l = lines.find((x) => { const w = x.split(/\s+/).length; return w >= 1 && w <= 7 && /^\p{Lu}/u.test(x) && !/[?]$/.test(x) && !/^(p\.?s\.?|what|which|where|how|why|i |dear|hello|thanks?|warmly|regards)/i.test(x) && /[\p{L}]{4,}/u.test(x); });
  return l ? l.replace(/,?\s*p+\.\s*\d.*$/i, '').trim() : null;
}

/** ANY QUOTED PASSAGE → its original (Chad 10-19: "fix Anis"): the library's English→original lookup (passage-links.js
 *  findOriginals — the passages holding the quotation verbatim, then the originals linked to them) on each passage the
 *  seeker quoted. → { retrieved: [the English passage, its original], how, plan } or null. */
async function quotedOriginal(d, question) {
  const find = d.findOriginals || (async (t) => (await import('../passage-links.js')).findOriginals(t, { limit: 10, search: (await import('../search.js')).hybridSearch }));   // 10: compilations quoting it crowd the top
  const authorityOf = d.authorityOf || (async (doc) => { try { return (await import('../authority.js')).getAuthority(doc || {}); } catch { return 0; } });
  for (const q of quotedPassages(question)) {
    const r = await find(q).catch(() => null);
    const o = r?.originals?.[0];
    if (!o?.text) continue;
    // the English from the work ITSELF, not a book quoting it (10-19: the reply named Doris McKay's "Fires in Many Hearts"
    // for Gleanings CXXXVI): verbatim matches ranked by the library's authority, then overlap
    // (10-19, second try: "Divine Virtues and Spiritual Qualities: A Compilation" won) — the original's OWN author's work first
    // (Bahá'u'lláh's Gleanings for his Arabic), then authority, then overlap
    const fa = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f'’‘`ʼ]/g, '').toLowerCase();
    const sameAuthor = (doc) => !!o.document?.author && fa(doc?.author).includes(fa(o.document.author).split(/[,;(]/)[0].trim()) && !/compilation/i.test(doc?.title || '');
    const ranked = await Promise.all((r.matches || []).filter((x) => x.passage && (x.overlap ?? 1) >= 0.8).map(async (x) => ({ x, own: sameAuthor(x.passage.document) ? 1 : 0, a: Number(await authorityOf({ ...x.passage.document })) || 0 })));
    // best of all: the ORIGINAL's own linked translations (10-19: dozens of compilations quote this passage and pushed
    // Gleanings out of the phrase search; the Arabic paragraph is linked to Gleanings ¶606 directly)
    const linked = await (d.translationsOf || (async (id) => ((await (await import('../passage-links.js')).resolveLinks([id], { quotedBy: false })).get(id)?.translations) || []))(o.id).catch(() => []);
    const tr = await Promise.all((linked || []).filter((t) => t?.text).map(async (t) => ({ x: { passage: t, overlap: 1 }, own: sameAuthor(t.document) ? 1 : 0, a: Number(await authorityOf({ ...t.document })) || 0 })));
    const en = ([...tr.sort((a, b) => b.own - a.own || b.a - a.a)][0]?.x || ranked.sort((a, b) => b.own - a.own || b.a - a.a || (b.x.overlap ?? 0) - (a.x.overlap ?? 0))[0]?.x || r.matches?.[0])?.passage;
    const lang = o.language === 'ar' ? 'Arabic' : o.language === 'fa' ? 'Persian' : (o.language || 'original');
    const enTitle = [en?.document?.title, en?.heading].filter(Boolean).join(', ');
    // the seeker NAMED a work ("Kitab'i-Aqdas") the passage is not in → one gentle sentence saying where it is
    const said = attributionIn(question), fold = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f'’‘`ʼ-]/g, '').toLowerCase();
    const wrong = said && ![enTitle, o.document?.title].some((t) => fold(t).includes(fold(said)) || fold(said).includes(fold(t).split(',')[0]));
    const how = wrong ? `${ORIGINAL_HOW} The seeker attributed this passage to "${said}"; it is found in ${enTitle || o.document?.title} — say so in one gentle sentence.` : ORIGINAL_HOW;
    return { plan: { shape: 'original', via: 'quote', found: { english: en?.id || null, original: o.id }, attributed: said || null }, how, retrieved: [
      ...(en ? [{ text: en.text, source_title: enTitle || 'the English passage', source_author: en.document?.author || '', citation_url: en.readerUrl || en.url || null,
        doc_id: en.documentId, paragraph_index: en.paragraphIndex, religion: en.document?.religion || null, collection: en.document?.collection || null, source_lang: en.language || 'en', via: 'original' }] : []),
      { text: o.text, source_title: `${o.document?.title || 'the original'} (original, ${lang})`, source_author: o.document?.author || '', citation_url: o.readerUrl || o.url || null,
        doc_id: o.documentId, paragraph_index: o.paragraphIndex, religion: o.document?.religion || null, collection: o.document?.collection || null, source_lang: o.language || null, via: 'original' },
    ] };
  }
  return null;
}

// A tradition's scripture by title or author (the hunt's origin), for "is this where the founder said it?". Pure.
const SCRIPTURE = {
  Christian: /\b(bible|gospels?|new testament|epistles?|psalms?|proverbs)\b/i,
  Judaism: /\b(bible|torah|tanakh|genesis|exodus|leviticus|numbers|deuteronomy|psalms?|proverbs|isaiah|prophets)\b/i,
  Islam: /\b(qur'?an|koran|hadith|ḥadíth|bukhari|bukhárí|sahih|nawawi|nawawí)\b/i,
  Buddhist: /\b(dhammapada|sutta|sutra|nikaya)\b/i,
  Hindu: /\b(gita|upanishad|veda|mahabharata|ramayan)/i,
  Tao: /\b(tao te ching|lao[- ]?tzu|laozi|chuang|zhuangzi)\b/i,
  Confucian: /\b(analects|confucius|mencius|doctrine of the mean|great learning)\b/i,
  Zoroastrian: /\b(avesta|gathas?|zoroaster|zarathustra)\b/i,
  Sikh: /\b(granth|guru)\b/i,
};
// Whose words another tradition's scripture is: never the Bahá'í writer who quotes it (r5: Sura II's "no compulsion in
// religion" came back as "the words of The Báb" — the hunt's quote-author vote counted His writings that quote the verse).
const BAHAI_FIGURE = /bah[aá]['’ʼ‘]?u['’ʼ‘]?ll[aá]h|\bb[aá]b\b|abdu['’ʼ‘]?l|shoghi|universal house/i;
export const scriptureVoice = (o) => (o?.religion === 'Islam' && /\b(s[uú]ra|qur['’]?[aá]n|koran)\b/i.test(o?.title || '') ? 'the Qur’án'
  : o?.author && !BAHAI_FIGURE.test(o.author) ? o.author : null);
export const scriptureOf = (religion, o) => !SCRIPTURE[religion] || SCRIPTURE[religion].test(`${o?.title || ''} ${o?.author || ''}`);

/** SourceHunt as Anís's tool for "where is this from?": the published source and the original tablet become the
 *  passages the reply is written from (so the sentence gate still holds). The model never sees a URL — it writes tags
 *  ({book}, {tablet}, …) that become exact links; it once copied a 400-char text-fragment URL into a repeating loop. */
async function huntSource(d, question) {
  const hunt = d.sourceHunt || (await import('../source-hunt.js')).sourceHunt;
  // a tradition the seeker NAMED ("the Buddha said …", "which sura …") is searched too, and an origin outside it is not
  // the answer (a Bahá'í book quoting the Dhammapada is not where the Buddha said it) → the ordinary search answers
  // ("Jesus said …", "which gospel" — the founder or scripture named as the speaker counts: search-plan speakerTradition)
  const religion = speakerTradition(question) || null;
  const r = await hunt(quotationIn(question), undefined, religion ? { religion } : undefined).catch(() => null);
  // a search layer failed twice (Qdrant under load): the source may be missing from the pool, and the hunt's template would
  // name the next best as THE source (11-01: Gleanings and the Epistle dropped out, the Mánikchí tablet was named) → the
  // ordinary search answers instead
  if (!r?.origin || r.degraded?.length) return null;
  const family = (x) => (['Judaism', 'Christian'].includes(x) ? 'Bible' : x);
  if (religion && family(r.origin.religion) !== family(religion)) return null;
  // Chad 11-02: going to the original tablet can disconcert a reader who did not ask — an INEXACT ask (keywords, a paraphrase) gets the main
  // source plus 1–2 similar passages, no original-language text or Phelps Inventory; an exact quotation or an ask for the original gets them
  const inexact = !asksForOriginal(question) && !isExactQuote(question);
  const o = r.origin, t = r.tablet?.certain && !inexact ? r.tablet : null;
  const sims = inexact && d.search ? [...new Map((((await d.search({ query: quotationIn(question), mode: 'passages', limit: 8, plan: { messages: [{ role: 'user', content: quotationIn(question) }], defaults: {} } }).catch(() => null))?.passages) || [])
    .filter((p) => p.document_id !== o.documentId && p.title !== o.title && String(p.text || '').length <= 8000).map((p) => [p.title, p])).values()].slice(0, 2) : [];
  const tTitle = t ? (t.meta?.title || t.title) : null, lang = t && /[پچژگ]/.test(t.text || '') ? 'Persian' : 'Arabic';
  const ool = t?.meta?.links?.oceanoflights || null, phelps = t?.meta?.links?.inventory || null, pin = t?.meta?.pin || null;
  // only a citation shown to HOLD the wording (its range link marks it) is named as quoting it — a link-graph edge alone once
  // produced "It is also quoted in The Kitáb-i-Aqdas" for a Hidden Word (r5, 11-01)
  // r5 rerun: the Aqdas still came back with a rangeUrl that was only the book's front page — the link must point INTO the book
  const atParagraph = (u) => /[?&](?:paraId|selectionString)=|#p\d+|#:~:text=/.test(String(u || ''));
  // a scraped page with no real title ("abdul-baha-bkw21_en", "Page 14") is not named to a reader
  const slugTitle = (x) => /^page \d+$/i.test(String(x || '').trim()) || (!/\s/.test(String(x || '').trim()) && /[-_]/.test(String(x || '')));
  const others = (r.citedBy || []).filter((c) => atParagraph(c.rangeUrl) && !slugTitle(c.title)).slice(0, 3);
  const tags = { book: { title: o.title, url: o.rangeUrl || o.url } };
  sims.forEach((p, i) => { tags[`sim${i + 1}`] = { title: p.title, url: p.source_url || p.readerUrl || p.url }; });
  if (t) tags.tablet = { title: tTitle, url: t.meta?.links?.oceanoflightsRange || ool || t.rangeUrl || t.url };
  if (t && phelps) tags.inventory = { title: `Phelps Inventory${pin ? ` ${pin}` : ''}`, url: phelps, plain: true };
  others.forEach((c, i) => { tags[`cited${i + 1}`] = { title: c.title, url: c.rangeUrl || c.url }; });
  const retrieved = [{ text: clip(o.text, o.highlight), source_title: o.title, source_author: o.author || '', citation_url: tags.book.url,
    doc_id: o.documentId, paragraph_index: null, religion: "Baha'i", collection: null, source_lang: 'en', via: 'sourcehunt' }];
  if (t) retrieved.push({ text: clip(t.text, t.highlight), source_title: `${tTitle} (original, ${lang})`, source_author: o.author || '',
    citation_url: tags.tablet.url, doc_id: t.documentId, paragraph_index: null, religion: "Baha'i",
    collection: null, source_lang: lang === 'Persian' ? 'fa' : 'ar', via: 'sourcehunt' });
  // another tradition's scripture speaks in its own voice; a Bahá'í origin is credited to the quote's writer (paragraph authorship)
  const scripture = o.religion && !/ba?h[aá]['’ʼ‘]?[ií]/i.test(o.religion);
  const author = scripture ? scriptureVoice(o) : (r.quoteAuthor || o.author || null);
  // the original's own words for this quotation (the highlighted clauses), so the reply quotes the right ones
  const origWords = t ? (t.highlight || []).map(([a, b]) => t.text.slice(a, b)).join(' … ').split(/\s+/).slice(0, 14).join(' ').replace(/[\s.،؛:!?*]+$/u, '') : '';
  const how = [
    'Never write a URL, a markdown link or a title in brackets. Write each source as its tag exactly — {book}, {tablet}, {inventory}, {cited1}… — the tag is replaced by the linked title, so do not also write the title.',
    `At most four sentences. Say the quotation comes from {book} and whose words they are (${author || 'the author'}).`,
    t ? `Say the original is ${lang}, in {tablet}${origWords ? `, where it reads «${origWords}» — quote exactly those words` : ''}.${tags.inventory ? ' Mention {inventory}.' : ''}`
      : asksForOriginal(question) ? 'The original tablet could not be confirmed: say so plainly in one sentence, without guessing.' : '',
    sims.length ? `In one sentence, say similar passages are in ${sims.map((c, i) => `{sim${i + 1}}`).join(' and ')}.` : '',
    others.length ? `In one sentence, say it is also quoted in ${others.map((c, i) => `{cited${i + 1}}`).join(', ')}.` : '',
    'Do not describe what kind of text it is or its authority (no "authorized interpretation", "scripture" or similar). Do not interpret the passage unless the seeker asks.',
  ].filter(Boolean).join(' ');
  retrieved.push(...sims.map((p) => ({ text: clip(p.text), source_title: p.title, source_author: p.author || '', citation_url: p.source_url || p.readerUrl || p.url, doc_id: p.document_id, paragraph_index: p.paragraph_index ?? null,
    religion: p.religion || "Baha'i", collection: null, source_lang: 'en', via: 'sourcehunt' })));
  const extraUrls = Object.values(tags).map((x) => x.url).filter(Boolean);
  // The reply itself, from the hunt alone — no model: every fact (writer, book, tablet, the original's words, Inventory
  // entry, other publications) is the hunt's, so nothing can be invented, leaked from instructions, or rambled (10-06 demo prep).
  const shown = (o.highlight?.length ? o.highlight.map(([a, b]) => o.text.slice(a, b)).join(' … ') : '').split(/\s+/).filter(Boolean).slice(0, 40).join(' ').replace(/[\s.,;:]+$/, '');
  // a saying the seeker credits to a founder ("Jesus said …") whose only holding passage is outside that tradition's
  // scripture is a misattribution the hunt has just shown: say so first (11-01 wording battery: "God helps those who help
  // themselves" came back as "These are the words of St. Teresa", reading as a confirmation)
  const notScripture = religion && !scriptureOf(religion, o);
  const reply = [
    notScripture ? `This does not appear in the ${religion} scripture in the library; the passage that holds these words is by ${author || 'a later writer'}.` : '',
    author === 'the Qur’án' ? 'These words are from the Qur’án, {book}.' : `${author ? `These are the words of ${author}, from {book}.` : 'This is from {book}.'}`,
    // the wording itself, and who quotes whom: scripture is the origin, a Bahá'í text quoting it comes after (11-01 wording battery)
    shown ? `The passage reads: «${shown}».` : '',
    scripture && others.length ? 'This is scripture itself; the Bahá’í texts below quote it rather than originate it.' : '',
    t ? `The original is in ${lang}, in {tablet}${origWords ? `, where it reads «${origWords}»` : ''}.${tags.inventory ? ' Its entry in the Phelps Inventory is {inventory}.' : ''}`
      : asksForOriginal(question) ? 'I could not confirm the original tablet for this passage.' : '',   // unasked, it only puzzles (Chad 11-02)
    sims.length ? `Similar passages are in ${sims.map((c, i) => `{sim${i + 1}}`).join(' and ')}.` : '',
    others.length ? `It is also quoted in ${others.map((c, i) => `{cited${i + 1}}`).join(others.length > 2 ? ', ' : ' and ').replace(/, (\{cited\d\})$/, ' and $1')}.` : '',
  ].filter(Boolean).join(' ');
  return { retrieved, tags, how, reply, extraUrls, hunt: { quoteAuthor: r.quoteAuthor, origin: o.title, tablet: tTitle, ms: r.ms } };
}

/** {book} / {tablet} / {inventory} / {citedN} → links to the exact URLs (titles italic, the Inventory plain). A tag the model
 *  wrapped in brackets or asterisks is still found; an unknown tag is dropped. */
const TAG_ALIAS = { 1: 'book', 2: 'tablet' };   // the model sometimes numbers the passages instead
export function fillTags(text, tags) {
  return String(text || '').replace(/\*{0,2}\[?\{(book|tablet|inventory|cited\d|sim\d|\d)\}\]?\*{0,2}(\s*\(([^()]{2,160})\))?/g, (m, k, paren, inner) => {
    const x = tags?.[TAG_ALIAS[k] || k];
    if (!x) return '';
    const link = x.url ? `[${x.plain ? x.title : `*${x.title}*`}](${x.url})` : (x.plain ? x.title : `*${x.title}*`);
    // "(Title)" repeated right after the tag is dropped; any other parenthesis stays
    const same = (a, b) => a.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '') === b.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    return paren && !same(inner, x.title) ? `${link}${paren}` : link;
  });
}

// Prior turns only (the current question is sent separately), trimmed — context, not a transcript to re-answer.
export function conversationSummary(messages, persona) {
  // a link's URL is noise here; that it WAS linked is what a follow-up checks ("you didn't link Gleanings")
  const prior = (messages || []).slice(0, -1).slice(-8).map((m) => ({ ...m, content: stripMarkup(m.content).replace(/\[([^\]]{1,300})\]\((?:https?:)?[^)\s]{1,600}\)/g, '$1 [linked]') }));
  // the reply the seeker is answering is kept nearly whole (its claims and links are what a follow-up refers to — r5: the
  // "also quoted in the Aqdas" line at the end of T1 was cut at 400 chars, and T5 asked about it); earlier replies keep
  // enough to CHECK a claim about them (r9: at 400 chars Anís could not see what he had said, so he conceded errors he never
  // made — 11 capitulation defects in the r8 replay)
  const lastAt = prior.map((m) => m.role).lastIndexOf('assistant');
  return prior.map((m, i) => `${m.role === 'user' ? 'Seeker' : persona}: ${m.content.slice(0, i === lastAt ? 1800 : m.role === 'assistant' ? 1000 : 500)}`).join('\n');
}

async function defaultDeps() {
  const [{ executeSearch }, { craftAnswerStream, stripUngroundedLinks }, companion, { anisCraft }, { planSearch }] = await Promise.all([
    import('../../routes/chat.js'), import('../chat-pipeline.js'), import('../companion/index.js'), import('./craft.js'),
    import('../search-plan.js'),
  ]);
  return {
    // Planned once here; executeSearch's plannedSearch then hits the plan cache (same conversation state).
    plan: (messages) => planSearch(messages),
    prewarm: async (messages) => (await import('../planned-search.js')).prewarmSearch(searchQueryFor(messages)),
    search: executeSearch,
    // Lean Anis prompt by default; ANIS_PROMPT=jafar uses the 12k-token Jafar crafter (comparison / rollback).
    craft: process.env.ANIS_PROMPT === 'jafar' ? craftAnswerStream : anisCraft,
    stripLinks: stripUngroundedLinks,
    // OceanLibrary paragraph links → range links (lib/ocean-links.js); injected so tests need no database
    upgradeLinks: async (s) => (await import('../ocean-links.js')).upgradeOceanLinks(s),
    companion: async (ctx) => {
      const store = companion.companionStore;
      const [globalDials, rel, turnsSoFar, connectOfferedRecently] = await Promise.all([
        store.getGlobalDials().catch(() => ({})),
        ctx.participantId ? store.getRelationship(ctx.participantId).catch(() => null) : null,
        ctx.participantId ? store.exposureCount(ctx.participantId).catch(() => 0) : 0,
        ctx.participantId ? store.connectOfferedRecently(ctx.participantId).catch(() => true) : true,
      ]);
      const built = companion.buildCompanionPlan({ ...ctx, relationship: rel, globalDials, turnsSoFar, connectOfferedRecently });
      return {
        append: `\n\nCOMPANION HARD RULES (never violate): ${companion.FORBIDDEN.join(' ')}${built.systemAppend}`,
        plan: built.plan,
        offer: !!built.plan?.connect_offer,
        log: (p) => ctx.participantId && store.logExposure({
          participant_id: ctx.participantId, mode: p.mode, intervention: p.intervention, challenge_level: p.challenge_level,
          authority_classes: (p.authority_classes || []).map((a) => a.class), plan: p, policy_version: p.policy_version,
        }).catch(() => {}),
      };
    },
  };
}

const QUOTE_MISS_HOW = 'The person asked to find a quotation and no passage in the library contains those words. Say so plainly in one or two sentences, quoting their wording back. Do NOT offer related passages, people, events or other topics, and do not guess a source. Suggest checking the exact wording or giving the author, work or a few more words.';
// In a thread, a miss may be wording the conversation already sourced (r5): point back to that source instead of absence.
const QUOTE_MISS_THREAD = ' If the conversation above already quoted these words from a linked source, say they come from that source (with its link) rather than calling them absent; if they were your own paraphrase, say so plainly.';

/** ANIS_RESEARCH="email" | "chat,email" | "all": the channels the researcher answers on. Off by default. */
/** The agent answers this turn: the caller's engine choice, else the channel is listed in ANIS_AGENT. Pure. */
export function agentOn(direction = {}, env = process.env.ANIS_AGENT) {
  if (direction.engine) return direction.engine === 'agent';
  return researchEnabled(direction.channel, env);
}

async function agentRespond({ messages, onEvent, d, t0 }) {
  const { agentAnswer, agentTools } = await import('./agent.js');
  onEvent({ type: 'stage', stage: 'search' });
  const A = await agentAnswer({ messages, onEvent,
    create: d.agentCreate || (async (params) => (await import('../role-client.js')).roleCreate('anis-agent', params)),
    tools: d.agentTools || agentTools({ search: d.search, fastSearch: d.fastSearch }) });   // search_library = the fast direct path; d.search only serves trace_source
  if (!A.reply) return null;
  onEvent({ type: 'sources', sources: A.citations, plan: { shape: 'agent' }, ms: Date.now() - t0 });
  onEvent({ type: 'stage', stage: 'craft' });
  onEvent({ type: 'text', content: A.reply });
  return { reply: A.reply, quotes_removed: A.quotes_removed, quotes_recredited: A.quotes_recredited, quotes_linked: A.quotes_linked,
    citations: A.citations, retrieved: A.retrieved, evidence: evidenceOf(A.retrieved),
    plan: { shape: 'agent', steps: A.steps, usage: A.usage }, search_query: A.steps.find((s) => s.tool === 'search_library')?.args?.query ?? null,
    select: null, format: { id: 'agent', by: 'agent' }, profile: null,
    timings: { search_ms: A.timings.first_tool_ms ?? 0, first_token_ms: Date.now() - t0, total_ms: Date.now() - t0 } };
}

export function researchEnabled(channel, env = process.env.ANIS_RESEARCH) {
  const on = String(env || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
  const id = String(channel?.id || channel?.name || channel || '').toLowerCase();
  return on.includes('all') || (!!id && on.some((c) => id.includes(c)));
}

// Fallback link filter when none is injected: keep only markdown links whose URL was retrieved.
const keepRetrievedLinks = (text, quotes) => {
  const ok = new Set(quotes.map((q) => q.citation_url).filter(Boolean));
  return String(text || '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => (ok.has(url) ? m : label));
};

/**
 * @param {object} a
 * @param {Array}  a.messages     the thread (last = the seeker's question)
 * @param {object} [a.profile]    { persona_name, default_tradition, mission, scope_config } — per site
 * @param {object} [a.participant]{ id, authed } — the Seeker Companion relationship key
 * @param {object} [a.llm]        override; default = ANIS_LLM env → DEFAULT_LLM
 * @param {Function} [a.onEvent]  receives { type: 'stage'|'sources'|'text'|'companion_offer', … }
 * @param {object} [a.direction]  { stance, guarded, channel } from the triage gate (turn.js) → the formatter's DIRECTION
 * @param {Array}  [a.variants]   internal A/B only (/draft): [{ id, format: 'auto'|'none', writer }] → the writing step once per variant
 * @returns {{ reply, citations, retrieved, plan, timings }}
 */
export async function anisRespond({ messages, profile = {}, participant = {}, llm, onEvent = () => {}, direction = {}, variants = null, deps }) {
  const d = { ...(deps ? {} : await defaultDeps()), ...(deps || {}) };
  const persona = profile.persona_name || 'Anís';
  // a pasted <br> run is never part of the question (r5); line breaks stay (a pasted passage's attribution line is read by line)
  const question = lastUser(messages).replace(/<[^>]{0,200}>/g, ' ').replace(/[ \t]+(?=\n)/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const t0 = Date.now();

  // THE AGENT (agent.js; Chad 11-01: "start with using haiku + tools to answer everything"): one loop with the library tools
  // answers the whole turn — on a channel listed in ANIS_AGENT ("site-chat", "email", "all") or when the caller asks
  // (direction.engine: 'agent' | 'pipeline'). A failure falls through to the routed pipeline below.
  if (agentOn(direction) && !(deps && !d.agentCreate)) {
    const A = await agentRespond({ messages, onEvent, d, t0 }).catch((err) => { console.warn('anis agent failed', err?.message); return null; });
    if (A) return A;
  }
  // Conversation (greetings, thanks, questions about Anis) is not a lookup: answer as ourselves, search nothing.
  // the query's embedding starts now, beside the plan, so the search layers find it ready (planned-search prewarmSearch)
  Promise.resolve(d.prewarm?.(messages)).catch(() => {});
  const plan = d.plan ? await timed('plan', () => d.plan(messages)).catch(() => null) : null;
  // a pasted original or a translate / find-the-original request is never small talk (10-23 Liliane's Persian prayer)
  let conversational = plan?.shape === 'converse' && !textRequest([...messages].reverse().find((m) => m.role === 'user')?.content).request;

  // "Which religions are in the library?" (search-plan library rule) → the catalogue's own counts, no search, no model
  if (plan?.library === 'religions' && !conversational) {
    const stats = d.libraryStats ? await d.libraryStats() : await import('../library/library-stats.js').then((m) => m.readLibraryStats()).catch(() => null);
    const reply = religionsReply(stats);
    if (reply) {
      onEvent({ type: 'sources', sources: [], plan: { shape: 'fact', library: 'religions' }, ms: Date.now() - t0 });
      onEvent({ type: 'stage', stage: 'craft' });
      onEvent({ type: 'text', content: reply });
      return { reply, quotes_removed: 0, citations: [], retrieved: [], evidence: [], plan: { ...plan, shape: 'fact', library: 'religions' },
        format: { id: 'library', by: 'library-stats' }, profile: null,
        timings: { search_ms: Date.now() - t0, first_token_ms: Date.now() - t0, total_ms: Date.now() - t0 } };
    }
  }
  // "Where can I read the Book of Certitude?" / "the full text of Dawnbreakers" → the library's own copy, linked (work-request.js;
  // Chad 11-01: these went to passage search and the reply quoted works that MENTION the book, with no link to it)
  // Then the passages ABOUT the book (its importance and role) fill the middle (Chad 11-01: "very thin … juicy bits"); none → link + offer.
  const work = conversational ? null
    : await timed('work', () => (d.findWork || (deps ? async () => null : findWork))(question, { named: plan?.named })).catch(() => null);
  onEvent({ type: 'stage', stage: 'search' });
  // WHAT to search (assistant/phrases.js; Jev has already routed): quote marks / the named object (a work by its library title,
  // a person in the seeker's spelling) decide it with no call; else one Haiku call for a quote/lookup → {exact, names, spellings,
  // author, work, tradition}, a follow-up given the previous turn + reply. STARTED NOW, beside the researcher / source hunt /
  // original lookup; only the search waits for it. Timeout / bad JSON → via 'fallback' and the v1 query (searchQueryFor).
  const phrasesP = !conversational && plan ? timed('phrases', async () => fixedPhrases(plan) || (d.phrases || (deps ? async () => null : extractPhrases))(question, plan, { messages }),
    (p) => (p ? { via: p.via, ...(p.reason ? { reason: p.reason } : {}) } : null)).catch(() => null) : Promise.resolve(null);
  let phrased = null, searchQ = null;
  // THE RESEARCHER (researcher.js; Chad 10-19: "we have made it too determinative"): a model plans the research with the
  // library's tools instead of regexes choosing one lookup. On for a channel listed in ANIS_RESEARCH ("email", "all") or
  // when the caller asks (direction.research); any failure falls back to the routed pipeline below.
  // injected deps without a researcher (a test harness) keep it off; tests opt in with deps.research
  const researchOn = !conversational && !work && (direction.research ?? ((!deps || d.research) ? researchEnabled(direction.channel) : false));
  const R = researchOn ? await (d.research || runResearch)({ messages,
    create: d.researchCreate || (async (params) => (await import('../role-client.js')).roleCreate('anis-researcher', params)),
    tools: d.researchTools || libraryTools({ search: d.search }) }).catch((err) => { console.warn('anis research failed', err?.message); return null; }) : null;
  const researched = R?.passages?.length || R?.brief ? R : null;
  // "Where is this from?" → SourceHunt (published source + original tablet); nothing found → the ordinary search
  const wantsOriginal = looksLikeOriginalQuestion(question);
  const quoted = quotationIn(question);
  // a title or a name ("Hidden Words source") is not a quotation: hunt only when 4+ words of wording are present
  // a named person or work ("Hidden Words source", "who wrote the Paris Talks") is the item itself, never a quotation to hunt
  // the original lookup runs ALONGSIDE the source hunt, not after it (r6-base: source-hunt 3.5 s then original 6.6–8 s, serial,
  // made the two slowest non-cold turns, 11.7 s and 14.4 s); its result is used only when the hunt finds nothing
  const originalP = !researched && !work && wantsOriginal ? timed('original', () => originalWording(d, question, messages)).catch(() => null) : null;
  // a quotation hunt needs a quotation: in a thread, the triage kind alone ("source_lookup") with no wording set apart from the
  // question once hunted the reader's own sentence (px-smoke return-iqan T2/T3: City of God for an Íqán question)
  const separate = quoted !== trimTalk(question.trim()) && quoted !== question.trim();
  const huntable = !researched && !work && !plan?.named && ((direction.kind === 'source_lookup' && quoted.split(/\s+/).length >= 4 && (separate || messages.length <= 1))
    || looksLikeSourceQuestion(question) || (wantsOriginal && quoted !== question.trim() && quoted.split(/\s+/).length >= 8));
  // FOLLOW-UP ASKS (search-plan followUpAsks): "where is it from — and who translated it, which volume, what happened next?"
  // The hunt's template answers only the origin and dropped every other ask (r6-after: 7 strategy defects). With other asks
  // the hunt runs as EVIDENCE beside the ordinary search and the reply answers all of them.
  const asks = huntable ? followUpAsks(question) : [];
  const huntP = huntable ? timed('source-hunt', () => huntSource(d, question)).catch(() => null) : null;
  const sourced = huntP && !asks.length ? await huntP : null;
  // "What are those words in Persian?" about a numbered passage → the canonical paragraph WITH its aligned original
  const original = !sourced && originalP ? await originalP : null;
  if (sourced) {
    // "Where is this from?" is answered by the hunt directly (template, no model call, no companion plan).
    // OceanLibrary range links (lib/ocean-links.js): the reply's links and each citation highlight their passage
    const up = d.upgradeLinks || (async (x) => x);
    for (const q of sourced.retrieved) if (q.citation_url) q.citation_url = await up(q.citation_url).catch(() => q.citation_url);
    const reply = await up(fillTags(sourced.reply, sourced.tags)).catch(() => fillTags(sourced.reply, sourced.tags));
    const citations = sourced.retrieved.map((q) => ({ title: q.source_title, author: q.source_author, url: q.citation_url,
      religion: q.religion, document_id: q.doc_id, paragraph_index: null, text: q.text.slice(0, 300) }));
    onEvent({ type: 'sources', sources: citations, plan: { shape: 'source' }, ms: Date.now() - t0 });
    onEvent({ type: 'stage', stage: 'craft' });
    onEvent({ type: 'text', content: reply });
    return { reply, quotes_removed: 0, citations, retrieved: sourced.retrieved, evidence: evidenceOf(sourced.retrieved), plan: { shape: 'source', sourceHunt: sourced.hunt },
      format: { id: 'source', by: 'sourcehunt' }, profile: null,
      timings: { search_ms: Date.now() - t0, first_token_ms: Date.now() - t0, total_ms: Date.now() - t0 } };
  }
  // "What does ʿirfán mean?" → a TERM STUDY from the CTAI concordance: Shoghi Effendi's renderings of the word and
  // passages pairing the original with his English (api/lib/anis/ctai-term.js). Nothing found → the ordinary search.
  let study = null;
  const termQ = !researched && !sourced && !original && !conversational ? (d.termQuestion || termQuestion)(question) : null;
  if (termQ) {
    try {
      const word = termQ.script === 'arabic' ? termQ.term : await (d.resolveTerm || resolveTerm)(termQ.term);
      if (word) study = await (d.ctaiTerm || ctaiTerm)(word);
      if (!study?.passages?.length) study = null;
    } catch { study = null; }
  }
  // A POSITION question ("the Bahá'í position on socialism, equality and property") → its themes, each searched, the
  // authoritative texts first (assistant/position.js; Chad 10-19: "extremely shallow and wishy washy")
  const position = !researched && !sourced && !original && !study && !conversational && (d.looksLikePosition || looksLikePositionQuestion)(question)
    ? await positionResearch({ question, create: d.create || (await import('../role-client.js')).roleCreate, search: d.search,
      authorityOf: d.authorityOf || (async (p) => { try { return (await import('../authority.js')).getAuthority(p || {}); } catch { return 0; } }),
      defaults: profile.default_tradition ? { religion: profile.default_tradition } : {}, scope_config: profile.scope_config }).catch((err) => { console.warn('anis position research failed', err?.message); return null; })
    : null;
  // A LANGUAGE question (assistant/language.js): answered from knowledge of the language and the passage already under
  // discussion — a search would only bring unrelated quotations to pad it with (10-19, Lal's 'fí baytihi')
  const language = !researched && !sourced && !original && !study && !position && !conversational && (d.looksLikeLanguage || looksLikeLanguageQuestion)(question);
  const res = researched ? { passages: researched.passages || [], _plan: { shape: 'research', steps: researched.steps, ms: researched.ms } }
    : work ? { ...await timed('search', () => d.search({ query: (searchQ = workAboutQuery(work)), mode: 'passages', limit: 16, scope_config: profile.scope_config,
      plan: { messages: [{ role: 'user', content: workAboutQuery(work) }] } })), _plan: { shape: 'work', work: work.doc.id } }
    : sourced ? { passages: [], _plan: { shape: 'source', sourceHunt: sourced.hunt } } : original ? { passages: [], _plan: original.plan }
    : conversational ? { passages: [], _plan: plan }
    : language ? { passages: [], _plan: { shape: 'language' } }
    : position?.passages?.length ? { passages: position.passages, _plan: { shape: 'position', themes: position.themes } }
    : study ? { passages: [], _plan: { shape: 'define', term: study.term, root: study.root, via: 'ctai' } } : await phrasesP.then((p) => {
      phrased = p;
      // the phrase replaces the v1 query (a follow-up's prefixed previous question with it); quote marks keep it — planned-search hunts the quote itself
      searchQ = (p?.via === 'named-object' || p?.via === 'haiku') && p.phrase ? p.phrase : searchQueryFor(messages);
      const hints = hintsOf(p);
      return timed('search', () => d.search({ query: searchQ, mode: 'passages', limit: 8, scope_config: profile.scope_config,
        plan: { messages, defaults: profile.default_tradition ? { religion: profile.default_tradition } : {}, ...(hints ? { hints } : {}) } }));
    });
  if (phrased && res?._plan && !res._plan.quote) res._plan = { ...res._plan, phrases: phrased };
  const searchMs = Date.now() - t0;
  const retrieved = sourced ? sourced.retrieved : original ? original.retrieved : study ? termEvidence(study) : (res?.passages || []).map((p) => ({
    text: p.text || '', source_title: p.title || '', source_author: p.author || '', book_author: p.book_author || null, citation_url: p.source_url || null,
    doc_id: p.document_id, paragraph_index: p.paragraph_index, religion: p.religion || null,
    collection: p.collection || null, source_lang: p.language || null, via: 'planned', standing: p.standing || null, theme: p.theme || null,
    ...(p.translation ? { translation: p.translation } : {}),   // an existing translation the reply quotes whole (researcher.js)
  }));
  if (work) {
    retrieved.splice(0, retrieved.length, ...aboutWork(work, retrieved).slice(0, 8));
    if (!retrieved.length) {   // nothing speaks of the book: the link and the offer
      const reply = workReply(work);
      const citations = [work.doc, ...work.others].map((x) => ({ title: x.title, author: x.author, url: readerUrl(x), religion: x.religion, document_id: x.id, paragraph_index: null, text: '' }));
      onEvent({ type: 'sources', sources: citations, plan: res._plan, ms: Date.now() - t0 });
      onEvent({ type: 'stage', stage: 'craft' });
      onEvent({ type: 'text', content: reply });
      return { reply, quotes_removed: 0, citations, retrieved: [], evidence: [], plan: { ...plan, shape: 'work', work: work.doc.id }, search_query: searchQ,
        format: { id: 'work', by: 'title-index' }, profile: null, timings: { search_ms: Date.now() - t0, first_token_ms: Date.now() - t0, total_ms: Date.now() - t0 } };
    }
  }
  // An original-language question answered by the ordinary search: each hit that has an aligned original carries it too
  if (wantsOriginal && !researched && !sourced && !original && !study && res?.passages?.length) {
    const { originalsByIds } = await import('../paragraphs-repo.js');
    const origs = await (d.originalsByIds || originalsByIds)(res.passages.map((p) => p.id).filter(Boolean)).catch(() => new Map());
    res.passages.forEach((p, i) => {
      const o = origs.get(Number(p.id));
      if (o) retrieved.splice(retrieved.length, 0, { ...retrieved[i], text: o.original, source_title: `${retrieved[i].source_title} (original)`, source_lang: o.lang, via: 'original' });
    });
  }
  // the hunt's origin (and the original tablet) lead the evidence for a multi-ask turn; its extra links are allowed too
  const huntExtra = huntP && asks.length && !sourced && !researched && !original && !study ? await huntP : null;
  if (huntExtra?.retrieved?.length) {
    const seen = new Set(huntExtra.retrieved.map((q) => q.citation_url).filter(Boolean));
    retrieved.splice(0, retrieved.length, ...huntExtra.retrieved.map((q) => ({ ...q })), ...retrieved.filter((q) => !q.citation_url || !seen.has(q.citation_url)));
    if (res) res._plan = { ...(res._plan || {}), sourceHunt: huntExtra.hunt, asks };
  } else if (asks.length && res?._plan) res._plan = { ...res._plan, asks };
  // A QUOTATION HUNT keeps only passages that hold the wording (or nearly all its words). Nothing near → say so plainly:
  // no neighbours, no people, no other topic to pivot to (11-01: "find the quote …" was answered with the Letters of the Living).
  const huntPhrase = !researched && !sourced && !original && !study ? res?._plan?.quote?.phrase : null;
  let quoteMiss = false, select = null;
  if (huntPhrase) {
    const want = foldVerbatim(huntPhrase), ws = [...new Set(want.split(' '))];
    const near = (t) => { const f = foldVerbatim(t); return f.includes(want) || ws.filter((w) => ` ${f} `.includes(` ${w} `)).length >= Math.ceil(ws.length * 0.7); };
    const keep = retrieved.filter((q) => near(q.text));
    select = { of: retrieved.length, kept: keep.length, by: 'phrase-match' };
    quoteMiss = !keep.length;
    retrieved.splice(0, retrieved.length, ...keep);
    if (quoteMiss && res) { res.entities = null; res.peopleAnswer = null; }
  }
  // A copyrighted (encumbered) book is evidence only as an EXCERPT of ≤ 80 words (Chad 10-23). The quote gate verifies every
  // quoted span against these texts, so no reply can quote more of it than the excerpt — the citation link carries the rest.
  retrieved.splice(0, retrieved.length, ...await guardRows(retrieved, { alwaysClip: true, encumbered: d.encumberedAmong }).catch(() => retrieved));
  // OceanLibrary range links BEFORE the answer is written: the model copies citation_url verbatim, so the streamed answer
  // carries links that highlight the passage (the whole paragraph; lib/ocean-links.js). Never blocks the answer on failure.
  if (d.upgradeLinks) await timed('upgrade-links', () => Promise.all(retrieved.map(async (q) => { if (q.citation_url) q.citation_url = await d.upgradeLinks(q.citation_url).catch(() => q.citation_url); })));
  const citations = retrieved.map((q) => ({ title: q.source_title, author: q.source_author, url: q.citation_url,
    religion: q.religion, document_id: q.doc_id, paragraph_index: q.paragraph_index, text: q.text.slice(0, 300) }));
  if (work) citations.unshift(...[work.doc, ...work.others].map((x) => ({ title: x.title, author: x.author, url: readerUrl(x), religion: x.religion, document_id: x.id, paragraph_index: null, text: '' })));
  // Something useful before the first token (backlog 0023): the sources are known in ~0.2s.
  if (!conversational) {
    onEvent({ type: 'sources', sources: citations, plan: res?._plan || null, ms: searchMs });
    onEvent({ type: 'status', text: statusLine(citations, res?._plan) });
  }

  // Findings (typed, with authority) → data profile → format: the reply's shape is chosen from the question AND what
  // was found AND the channel (PRD F3/F4). Runs in parallel with the Companion plan — no added latency.
  const pa = res?.peopleAnswer || null;
  const findings = toFindings({ retrieved, peopleAnswer: pa, entities: res?.entities || null });
  retrieved.forEach((q, i) => { q.authority = findings[i]?.authority?.name || null; });
  const evidenceProfile = dataProfile(findings, { plan: res?._plan || null, question });
  const channel = direction.channel || channelFor('widget-chat');
  const choose = d.chooseFormat || chooseFormat;
  const formatP = work ? Promise.resolve({ id: 'work', by: 'title-index', how: WORK_HOW(work) })
    : quoteMiss ? Promise.resolve({ id: 'honest_absence', by: 'quote-rule', how: QUOTE_MISS_HOW + (messages.length > 1 ? QUOTE_MISS_THREAD : '') })
    : researched ? Promise.resolve({ id: 'research', by: 'researcher', how: RESEARCH_HOW(researched.brief) })
    : sourced ? Promise.resolve({ id: 'source', by: 'sourcehunt', how: sourced.how })
    // ORIGINAL_HOW only with an original in hand: without one the model said the passage was "not found" while the English
    // passage that answers sat in the evidence (px-smoke return-iqan T3); then the ordinary format + NO_ORIGINAL_HOW
    : original || retrieved.some((q) => q.via === 'original') ? Promise.resolve({ id: 'original', by: 'original', how: original?.how || ORIGINAL_HOW })   // the lookup's own instructions (e.g. a misattribution to correct)
    : position?.passages?.length ? Promise.resolve({ id: 'position', by: 'position', how: POSITION_HOW })
    : language ? Promise.resolve({ id: 'language', by: 'language', how: LANGUAGE_HOW })
    : study ? Promise.resolve({ id: 'term_study', by: 'ctai', how: termFormatHow(study, channel) })
    : conversational ? Promise.resolve(null) : timed('format', () => choose({ question, profile: evidenceProfile, channel })).catch(() => null);

  let comp = null;
  try {
    const evidenceDocs = retrieved.map((q) => ({ doc_id: q.doc_id, title: q.source_title, author: q.source_author, religion: q.religion, collection: q.collection }));
    comp = await timed('companion', () => d.companion({
      participantId: participant.id || null, authed: !!participant.authed, message: question,
      classifier: { comparative: !!res?._plan?.comparative }, evidenceDocs, evidenceCount: evidenceDocs.length,
      traditionsCovered: new Set(evidenceDocs.map((x) => x.religion).filter(Boolean)).size,
    }));
    if (comp?.offer) onEvent({ type: 'companion_offer', offer: 'connect' });
  } catch { comp = null; }   // relationship enriches the answer; it never blocks one
  const format = await formatP;
  // a follow-up with several asks answers EACH, and a challenge is checked against the passages, never smoothed over (r6-after)
  const noOriginal = wantsOriginal && !researched && !sourced && !original && !quoteMiss && !retrieved.some((q) => q.via === 'original');
  const extraHow = [asks.length ? ASKS_HOW(asks) : '', plan?.pushback && !quoteMiss ? PUSHBACK_HOW : '', noOriginal ? NO_ORIGINAL_HOW : ''].filter(Boolean).join('\n');
  if (extraHow && format) format.how = `${format.how ? `${format.how}\n` : ''}${extraHow}`;

  onEvent({ type: 'stage', stage: 'craft' });
  // Links allowed = the passages' URLs + the people record's evidence URLs. Applied per sentence while STREAMING
  // (the stream once showed a link the model had moved onto another domain; only the final text caught it).
  const paEvidence = pa ? [...(pa.contested || []).flatMap((p) => [...p.evidence, ...p.against]), ...(pa.notMet || []).flatMap((p) => p.evidence)] : [];
  const allowed = [...retrieved, ...[...(res?.entities || []).flatMap((p) => p.evidence || []), ...paEvidence].map((e) => ({ citation_url: e.url })),
    ...(sourced?.extraUrls || huntExtra?.extraUrls || []).map((u) => ({ citation_url: u })), ...(study?.researchUrl ? [{ citation_url: study.researchUrl }] : [])];
  const exactUrls = sourced ? [...retrieved.map((q) => q.citation_url), ...sourced.extraUrls].filter(Boolean) : null;
  const defaultWriter = llm || (researched ? modelFor('anis-writer') : parseLlm(process.env.ANIS_LLM));
  // THE WRITING STEP — once, or once per VARIANT (internal A/B via /api/v1/anis/draft): everything above (plan, evidence,
  // format choice, companion) is shared; only the template (format 'none') or the writer model differs. Only the first streams.
  const write = async (v, primary) => {
    const fmt = variantFormat(format, v?.format, extraHow);
    const writer = v?.writer ? { ...parseLlm(v.writer), ...(primary ? {} : { caller: 'anis-craft-variant' }) } : defaultWriter;
    const cleanLinks = (t) => dropQuibbles(unmachine((d.stripLinks || keepRetrievedLinks)(linkMarkers(exactUrls ? exactLinks(fillTags(t, sourced.tags), exactUrls) : t, retrieved), allowed)), { question, format: fmt?.id });
    // Stream a sentence at a time, releasing only sentences whose quotes are in the passages — an invented quote is
    // never SHOWN, not even for the moment before the final text replaces it. first_token_ms = first text SEEN.
    let firstTokenMs = null, usage = null;
    const gate = createSentenceGate(retrieved, (t) => {
      if (firstTokenMs === null) firstTokenMs = Date.now() - t0;
      if (primary) onEvent({ type: 'text', content: cleanLinks(t).replace(/\[\[(?:RENDERINGS|PASSAGES)\]\]\n?/g, '') });   // code fills these in the final text
    });
    const w0 = Date.now();
    const raw = await timed(primary ? 'craft' : `craft:${v.id}`, () => d.craft({
      user_question: question, retrieved_quotes: sourced ? retrieved.map(({ citation_url: _u, ...q }) => q) : retrieved, conversation_summary: conversationSummary(messages, persona),
      persona_name: persona, mission: profile.mission || null, companion_append: comp?.append || '',
      comparative: !!res?._plan?.comparative, conversational, entities: res?.entities || null, peopleAnswer: pa, target: res?._plan?.target || null, direction: { ...direction, format: fmt }, llm: writer,
      onChunk: (t) => gate.push(t), ...(v ? { onUsage: (u) => { usage = u; } } : {}),
    }));
    const writeMs = Date.now() - w0;
    gate.flush();
    // Final text: markers → links, ungrounded links unlinked, and any sentence quoting words found in NO passage removed
    // (the widget reconciles its streamed text to this; email sends only this).
    const guarded = dropUnverified(cleanLinks(raw), retrieved);
    // …and a lead-in whose quotation went missing ("…writes in God Passes By:" then nothing, r5) gets the verified passage it
    // names, or is rewritten — a reply never ends an introduction without its quotation.
    const introduced = completeIntroducedQuotes(study ? placeRenderings(guarded.text, study, channel) : guarded.text, conversational ? [] : retrieved);
    // …and every quotation a passage holds carries that passage's link (r6-base class A: 16 of 108 defects).
    // The speaker named for a quotation is the writer of the passage that holds it (r6-base class B: on-behalf letters credited
    // to Shoghi Effendi or to Bahá'u'lláh, the Guardian's words framed as Bahá'u'lláh's).
    const speakers = fixQuoteSpeakers(introduced.text, conversational ? [] : retrieved);
    const quoteLinked = linkQuotes(speakers.text, conversational ? [] : retrieved);
    const linked = ensureLinks(quoteLinked.text, conversational ? [] : retrieved);   // the counts come from code
    // a book asked for: its link first and the offer to read it last, by code (work-request.js)
    const bare = dropPreamble(linked);
    // every book named in italics links to the library's copy (Chad 11-01)
    const titled = conversational ? { text: bare } : await (d.linkTitles || (deps ? async (t) => ({ text: t }) : linkTitles))(bare).catch(() => ({ text: bare }));
    // the middle of a book reply is what the sources say about it, linked — or nothing (11-01 live: "Dawnbreakers" got "I didn't
    // find a passage… could you tell me more?" between the link and the offer)
    const about = work && /\]\(https?:\/\/[^)]+\)/.test(titled.text.replace(/\[\*[^\]]*\*\]\([^)]*\)/g, '')) ? titled.text.trim() : '';
    const reply = work ? [workLead(work), about, workOffer(work)].filter(Boolean).join('\n\n') : titled.text;
    return { reply, guarded, introduced, speakers, quoteLinked, firstTokenMs, fmt, writer, writeMs, usage };
  };
  const runs = variantList(variants);
  const written = await Promise.all(runs.map((v, i) => write(v, i === 0)));
  const { reply, guarded, introduced, speakers, quoteLinked, firstTokenMs } = written[0];
  if (comp?.log && comp.plan) comp.log(comp.plan);

  // Chips = the sources the reply actually links, not every passage retrieved (screenshot: Book of Mormon and
  // Qabbalah under an answer that used two Bahá'í texts).
  const cited = citations.filter((c) => c.url && reply.includes(c.url));
  // A term study's chart comes from the CTAI concordance, not from passages: record its facts so the auditor can check the
  // counts (10-12: the ʿirfán chart was judged "fabricated, unsupported by any evidence" because the counts were invisible).
  const studyEvidence = study ? [{ title: `CTAI concordance: ${study.term}${study.root ? ` (root ${study.root})` : ''}`, author: 'CTAI', url: study.researchUrl || null,
    religion: "Bahá'í", text: `Shoghi Effendi's renderings of ${study.term}, counted over ${study.counted || study.total} aligned passages (${study.total} in all): `
      + study.renderings.map((r) => `${r.en} ${r.count}`).join(', ') }] : [];
  return { reply, quotes_removed: guarded.removed, quotes_completed: introduced.completed || introduced.rewritten ? { placed: introduced.completed, rewritten: introduced.rewritten } : null, quotes_linked: quoteLinked.linked || 0, quotes_recredited: speakers.fixed || 0, evidence: [...studyEvidence, ...evidenceOf(retrieved)], citations: cited, retrieved: retrieved.filter((q) => q.citation_url && reply.includes(q.citation_url)), plan: res?._plan || null,
    search_query: searchQ ?? searchQueryFor(messages), select, format: format ? { id: format.id, by: format.by } : null, profile: describeProfile(evidenceProfile),
    timings: { search_ms: searchMs, first_token_ms: firstTokenMs ?? Date.now() - t0, total_ms: Date.now() - t0 },
    ...(runs[0] ? { variants: written.map((w, i) => variantResult(runs[i], w)) } : {}) };
}

// ── Writing-step VARIANTS (internal A/B only: POST /api/v1/anis/draft {variants}; tests/quality/anis-writer-ab.mjs) ──
const MAX_VARIANTS = 4;
// chooseFormat's response templates; recipe instructions (research brief, source hunt, work, term study…) carry evidence, not a shape
const TEMPLATE_BY = new Set(['jev', 'code', 'default']);
/** [{ id, format: 'auto'|'none', writer: 'provider:model' }] (≤ 4, ids unique) → the runs; none → [null] (one ordinary write). Pure. */
export function variantList(variants) {
  if (!Array.isArray(variants) || !variants.length) return [null];
  const seen = new Set();
  return variants.slice(0, MAX_VARIANTS).map((v, i) => {
    let id = String(v?.id || `v${i + 1}`).replace(/[^\w.-]/g, '').slice(0, 40) || `v${i + 1}`;
    if (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    return { id, format: v?.format === 'none' ? 'none' : 'auto', writer: typeof v?.writer === 'string' && v.writer.includes(':') ? v.writer : null };
  });
}
/** format 'none' drops a chosen TEMPLATE (the writer picks the shape); the turn's own asks/pushback lines stay. Recipes are kept. Pure. */
export function variantFormat(format, mode, extraHow = '') {
  if (mode !== 'none' || !format || !TEMPLATE_BY.has(format.by)) return format;
  return { id: 'none', by: 'variant', how: extraHow || null, template: format.id };
}
const words = (t) => (String(t || '').replace(/\]\([^)]*\)/g, ']').match(/\S+/g) || []).length;
function variantResult(v, w) {
  const usd = w.usage ? +calculateCost(w.writer.model, w.usage.promptTokens, w.usage.completionTokens).toFixed(6) : null;
  return { id: v.id, reply: w.reply, ms: w.writeMs, first_token_ms: w.firstTokenMs, writer: `${w.writer.provider}:${w.writer.model}`,
    format_id: w.fmt?.id ?? null, template: w.fmt?.template ?? null, format_stripped: !!w.fmt?.template,
    usage: w.usage, usd, words: words(w.reply), links: (w.reply.match(/\]\(https?:\/\//g) || []).length, quotes_removed: w.guarded.removed };
}
