// Anis chat layer — the seeker/student companion embedded on many sites (web component) and reachable by email.
// Conversation + Jev-planned RAW search (no LLM in retrieval) → ONE fast streamed answer, in the site's persona,
// shaped by the Seeker Companion's relationship plan. Transport-neutral: the widget streams onEvent('text'),
// email uses the returned text. Model: ONE global, switchable setting ANIS_LLM="provider:model[:reasoning_effort]".
// Deps (lazy, injectable for tests): routes/chat.js executeSearch, jafar-pipeline craftAnswerStream, companion/.

import { modelFor } from '../model-roles.js';
import { dropUnverified, createSentenceGate } from './quotes.js';
import { termQuestion, resolveTerm, ctaiTerm, termEvidence, termFormatHow, placeRenderings } from './ctai-term.js';
import { toFindings, dataProfile, describeProfile } from './findings.js';
import { chooseFormat } from './formats.js';
import { channelFor } from './channels.js';
import { unmachine } from './lint.js';
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
  const users = (messages || []).filter((m) => m.role === 'user').map((m) => String(m.content || '').trim());
  const current = users.at(-1) || '';
  const previous = users.at(-2);
  if (!previous) return current;
  const short = current.split(/\s+/).filter(Boolean).length <= 5;
  return (ANAPHOR.test(current) || short) ? `${previous} ${current}` : current;
}

/** The passages a reply was written from, compact, for the exchange log (the strategy auditor reads them). */
export const evidenceOf = (retrieved) => (retrieved || []).slice(0, 10).map((q) => ({ title: q.source_title || null,
  author: q.source_author || null, url: q.citation_url || null, religion: q.religion || null, text: String(q.text || '').slice(0, 1200) }));   // for the auditor (300 read as 'truncated')

const lastUser = (messages) => [...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '';

/** The quotation in a source question: the longest quoted span (≥ 6 words), else the message without a leading request
 *  ("Where is this from:") — what a library's copy appends (reference line, link) is stripped by SourceHunt itself. */
export function quotationIn(text) {
  const t = String(text || '').trim();
  const quoted = [...t.matchAll(/[“"«]([^”"»]{20,})[”"»]/g)].map((m) => m[1].trim()).filter((q) => q.split(/\s+/).length >= 6);
  if (quoted.length) return quoted.sort((a, b) => b.length - a.length)[0];
  const m = /^[^\n:]{0,80}?(?:from|source|origin|written|said|quote|find)[^\n:]{0,60}[:?\n]\s*([\s\S]{20,})$/i.exec(t);
  return (m ? m[1] : t).trim();
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

/** SourceHunt as Anís's tool for "where is this from?": the published source and the original tablet become the
 *  passages the reply is written from (so the sentence gate still holds). The model never sees a URL — it writes tags
 *  ({book}, {tablet}, …) that become exact links; it once copied a 400-char text-fragment URL into a repeating loop. */
async function huntSource(d, question) {
  const hunt = d.sourceHunt || (await import('../source-hunt.js')).sourceHunt;
  const r = await hunt(quotationIn(question)).catch(() => null);
  if (!r?.origin) return null;
  const o = r.origin, t = r.tablet?.certain ? r.tablet : null;
  const tTitle = t ? (t.meta?.title || t.title) : null, lang = t && /[پچژگ]/.test(t.text || '') ? 'Persian' : 'Arabic';
  const ool = t?.meta?.links?.oceanoflights || null, phelps = t?.meta?.links?.inventory || null, pin = t?.meta?.pin || null;
  const others = (r.citedBy || []).slice(0, 3);
  const tags = { book: { title: o.title, url: o.rangeUrl || o.url } };
  if (t) tags.tablet = { title: tTitle, url: t.meta?.links?.oceanoflightsRange || ool || t.rangeUrl || t.url };
  if (t && phelps) tags.inventory = { title: `Phelps Inventory${pin ? ` ${pin}` : ''}`, url: phelps, plain: true };
  others.forEach((c, i) => { tags[`cited${i + 1}`] = { title: c.title, url: c.rangeUrl || c.url }; });
  const retrieved = [{ text: clip(o.text, o.highlight), source_title: o.title, source_author: o.author || '', citation_url: tags.book.url,
    doc_id: o.documentId, paragraph_index: null, religion: "Baha'i", collection: null, source_lang: 'en', via: 'sourcehunt' }];
  if (t) retrieved.push({ text: clip(t.text, t.highlight), source_title: `${tTitle} (original, ${lang})`, source_author: o.author || '',
    citation_url: tags.tablet.url, doc_id: t.documentId, paragraph_index: null, religion: "Baha'i",
    collection: null, source_lang: lang === 'Persian' ? 'fa' : 'ar', via: 'sourcehunt' });
  // the original's own words for this quotation (the highlighted clauses), so the reply quotes the right ones
  const origWords = t ? (t.highlight || []).map(([a, b]) => t.text.slice(a, b)).join(' … ').split(/\s+/).slice(0, 14).join(' ').replace(/[\s.،؛:!?*]+$/u, '') : '';
  const how = [
    'Never write a URL, a markdown link or a title in brackets. Write each source as its tag exactly — {book}, {tablet}, {inventory}, {cited1}… — the tag is replaced by the linked title, so do not also write the title.',
    `At most four sentences. Say the quotation comes from {book} and whose words they are (${r.quoteAuthor || o.author || 'the author'}).`,
    t ? `Say the original is ${lang}, in {tablet}${origWords ? `, where it reads «${origWords}» — quote exactly those words` : ''}.${tags.inventory ? ' Mention {inventory}.' : ''}`
      : 'The original tablet could not be confirmed: say so plainly in one sentence, without guessing.',
    others.length ? `In one sentence, say it is also quoted in ${others.map((c, i) => `{cited${i + 1}}`).join(', ')}.` : '',
    'Do not describe what kind of text it is or its authority (no "authorized interpretation", "scripture" or similar). Do not interpret the passage unless the seeker asks.',
  ].filter(Boolean).join(' ');
  const extraUrls = Object.values(tags).map((x) => x.url).filter(Boolean);
  // The reply itself, from the hunt alone — no model: every fact (writer, book, tablet, the original's words, Inventory
  // entry, other publications) is the hunt's, so nothing can be invented, leaked from instructions, or rambled (10-06 demo prep).
  const author = r.quoteAuthor || o.author || null;
  const reply = [
    `${author ? `These are the words of ${author}, from {book}.` : 'This is from {book}.'}`,
    t ? `The original is in ${lang}, in {tablet}${origWords ? `, where it reads «${origWords}»` : ''}.${tags.inventory ? ' Its entry in the Phelps Inventory is {inventory}.' : ''}`
      : 'I could not confirm the original tablet for this passage.',
    others.length ? `It is also quoted in ${others.map((c, i) => `{cited${i + 1}}`).join(others.length > 2 ? ', ' : ' and ').replace(/, (\{cited\d\})$/, ' and $1')}.` : '',
  ].filter(Boolean).join(' ');
  return { retrieved, tags, how, reply, extraUrls, hunt: { quoteAuthor: r.quoteAuthor, origin: o.title, tablet: tTitle, ms: r.ms } };
}

/** {book} / {tablet} / {inventory} / {citedN} → links to the exact URLs (titles italic, the Inventory plain). A tag the model
 *  wrapped in brackets or asterisks is still found; an unknown tag is dropped. */
const TAG_ALIAS = { 1: 'book', 2: 'tablet' };   // the model sometimes numbers the passages instead
export function fillTags(text, tags) {
  return String(text || '').replace(/\*{0,2}\[?\{(book|tablet|inventory|cited\d|\d)\}\]?\*{0,2}(\s*\(([^()]{2,160})\))?/g, (m, k, paren, inner) => {
    const x = tags?.[TAG_ALIAS[k] || k];
    if (!x) return '';
    const link = x.url ? `[${x.plain ? x.title : `*${x.title}*`}](${x.url})` : (x.plain ? x.title : `*${x.title}*`);
    // "(Title)" repeated right after the tag is dropped; any other parenthesis stays
    const same = (a, b) => a.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '') === b.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    return paren && !same(inner, x.title) ? `${link}${paren}` : link;
  });
}

// Prior turns only (the current question is sent separately), trimmed — context, not a transcript to re-answer.
function conversationSummary(messages, persona) {
  const prior = (messages || []).slice(0, -1).slice(-6);
  return prior.map((m) => `${m.role === 'user' ? 'Seeker' : persona}: ${String(m.content || '').slice(0, 400)}`).join('\n');
}

async function defaultDeps() {
  const [{ executeSearch }, { craftAnswerStream, stripUngroundedLinks }, companion, { anisCraft }, { planSearch }] = await Promise.all([
    import('../../routes/chat.js'), import('../chat-pipeline.js'), import('../companion/index.js'), import('./craft.js'),
    import('../search-plan.js'),
  ]);
  return {
    // Planned once here; executeSearch's plannedSearch then hits the plan cache (same conversation state).
    plan: (messages) => planSearch(messages),
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
 * @returns {{ reply, citations, retrieved, plan, timings }}
 */
export async function anisRespond({ messages, profile = {}, participant = {}, llm, onEvent = () => {}, direction = {}, deps }) {
  const d = { ...(deps ? {} : await defaultDeps()), ...(deps || {}) };
  const persona = profile.persona_name || 'Anís';
  const question = lastUser(messages);
  const t0 = Date.now();

  // Conversation (greetings, thanks, questions about Anis) is not a lookup: answer as ourselves, search nothing.
  const plan = d.plan ? await d.plan(messages).catch(() => null) : null;
  let conversational = plan?.shape === 'converse';

  onEvent({ type: 'stage', stage: 'search' });
  // "Where is this from?" → SourceHunt (published source + original tablet); nothing found → the ordinary search
  const wantsOriginal = looksLikeOriginalQuestion(question);
  const quoted = quotationIn(question);
  const sourced = (direction.kind === 'source_lookup' || looksLikeSourceQuestion(question)
    || (wantsOriginal && quoted !== question.trim() && quoted.split(/\s+/).length >= 8)) ? await huntSource(d, question) : null;
  // "What are those words in Persian?" about a numbered passage → the canonical paragraph WITH its aligned original
  const original = !sourced && wantsOriginal ? await originalWording(d, question, messages).catch(() => null) : null;
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
  const termQ = !sourced && !original && !conversational ? (d.termQuestion || termQuestion)(question) : null;
  if (termQ) {
    try {
      const word = termQ.script === 'arabic' ? termQ.term : await (d.resolveTerm || resolveTerm)(termQ.term);
      if (word) study = await (d.ctaiTerm || ctaiTerm)(word);
      if (!study?.passages?.length) study = null;
    } catch { study = null; }
  }
  // A POSITION question ("the Bahá'í position on socialism, equality and property") → its themes, each searched, the
  // authoritative texts first (assistant/position.js; Chad 10-19: "extremely shallow and wishy washy")
  const position = !sourced && !original && !study && !conversational && (d.looksLikePosition || looksLikePositionQuestion)(question)
    ? await positionResearch({ question, create: d.create || (await import('../role-client.js')).roleCreate, search: d.search,
      authorityOf: d.authorityOf || (async (p) => { try { return (await import('../authority.js')).getAuthority(p || {}); } catch { return 0; } }),
      defaults: profile.default_tradition ? { religion: profile.default_tradition } : {}, scope_config: profile.scope_config }).catch((err) => { console.warn('anis position research failed', err?.message); return null; })
    : null;
  const res = sourced ? { passages: [], _plan: { shape: 'source', sourceHunt: sourced.hunt } } : original ? { passages: [], _plan: original.plan }
    : conversational ? { passages: [], _plan: plan }
    : position?.passages?.length ? { passages: position.passages, _plan: { shape: 'position', themes: position.themes } }
    : study ? { passages: [], _plan: { shape: 'define', term: study.term, root: study.root, via: 'ctai' } } : await d.search({
    query: searchQueryFor(messages), mode: 'passages', limit: 8, scope_config: profile.scope_config,
    plan: { messages, defaults: profile.default_tradition ? { religion: profile.default_tradition } : {} },
  });
  const searchMs = Date.now() - t0;
  const retrieved = sourced ? sourced.retrieved : original ? original.retrieved : study ? termEvidence(study) : (res?.passages || []).map((p) => ({
    text: p.text || '', source_title: p.title || '', source_author: p.author || '', citation_url: p.source_url || null,
    doc_id: p.document_id, paragraph_index: p.paragraph_index, religion: p.religion || null,
    collection: p.collection || null, source_lang: p.language || null, via: 'planned',
  }));
  // An original-language question answered by the ordinary search: each hit that has an aligned original carries it too
  if (wantsOriginal && !sourced && !original && !study && res?.passages?.length) {
    const { originalsByIds } = await import('../paragraphs-repo.js');
    const origs = await (d.originalsByIds || originalsByIds)(res.passages.map((p) => p.id).filter(Boolean)).catch(() => new Map());
    res.passages.forEach((p, i) => {
      const o = origs.get(Number(p.id));
      if (o) retrieved.splice(retrieved.length, 0, { ...retrieved[i], text: o.original, source_title: `${retrieved[i].source_title} (original)`, source_lang: o.lang, via: 'original' });
    });
  }
  // OceanLibrary range links BEFORE the answer is written: the model copies citation_url verbatim, so the streamed answer
  // carries links that highlight the passage (the whole paragraph; lib/ocean-links.js). Never blocks the answer on failure.
  if (d.upgradeLinks) await Promise.all(retrieved.map(async (q) => { if (q.citation_url) q.citation_url = await d.upgradeLinks(q.citation_url).catch(() => q.citation_url); }));
  const citations = retrieved.map((q) => ({ title: q.source_title, author: q.source_author, url: q.citation_url,
    religion: q.religion, document_id: q.doc_id, paragraph_index: q.paragraph_index, text: q.text.slice(0, 300) }));
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
  const formatP = sourced ? Promise.resolve({ id: 'source', by: 'sourcehunt', how: sourced.how })
    : original || wantsOriginal ? Promise.resolve({ id: 'original', by: 'original', how: original?.how || ORIGINAL_HOW })   // the lookup's own instructions (e.g. a misattribution to correct)
    : position?.passages?.length ? Promise.resolve({ id: 'position', by: 'position', how: POSITION_HOW })
    : study ? Promise.resolve({ id: 'term_study', by: 'ctai', how: termFormatHow(study, channel) })
    : conversational ? Promise.resolve(null) : choose({ question, profile: evidenceProfile, channel }).catch(() => null);

  let comp = null;
  try {
    const evidenceDocs = retrieved.map((q) => ({ doc_id: q.doc_id, title: q.source_title, author: q.source_author, religion: q.religion, collection: q.collection }));
    comp = await d.companion({
      participantId: participant.id || null, authed: !!participant.authed, message: question,
      classifier: { comparative: !!res?._plan?.comparative }, evidenceDocs, evidenceCount: evidenceDocs.length,
      traditionsCovered: new Set(evidenceDocs.map((x) => x.religion).filter(Boolean)).size,
    });
    if (comp?.offer) onEvent({ type: 'companion_offer', offer: 'connect' });
  } catch { comp = null; }   // relationship enriches the answer; it never blocks one
  const format = await formatP;

  onEvent({ type: 'stage', stage: 'craft' });
  // Stream a sentence at a time, releasing only sentences whose quotes are in the passages — an invented quote is
  // never SHOWN, not even for the moment before the final text replaces it. first_token_ms = first text SEEN.
  let firstTokenMs = null;
  // Links allowed = the passages' URLs + the people record's evidence URLs. Applied per sentence while STREAMING
  // (the stream once showed a link the model had moved onto another domain; only the final text caught it).
  const paEvidence = pa ? [...(pa.contested || []).flatMap((p) => [...p.evidence, ...p.against]), ...(pa.notMet || []).flatMap((p) => p.evidence)] : [];
  const allowed = [...retrieved, ...[...(res?.entities || []).flatMap((p) => p.evidence || []), ...paEvidence].map((e) => ({ citation_url: e.url })),
    ...(sourced?.extraUrls || []).map((u) => ({ citation_url: u })), ...(study?.researchUrl ? [{ citation_url: study.researchUrl }] : [])];
  const exactUrls = sourced ? [...retrieved.map((q) => q.citation_url), ...sourced.extraUrls].filter(Boolean) : null;
  const cleanLinks = (t) => unmachine((d.stripLinks || keepRetrievedLinks)(linkMarkers(exactUrls ? exactLinks(fillTags(t, sourced.tags), exactUrls) : t, retrieved), allowed));
  const gate = createSentenceGate(retrieved, (t) => {
    if (firstTokenMs === null) firstTokenMs = Date.now() - t0;
    onEvent({ type: 'text', content: cleanLinks(t).replace(/\[\[(?:RENDERINGS|PASSAGES)\]\]\n?/g, '') });   // code fills these in the final text
  });
  const raw = await d.craft({
    user_question: question, retrieved_quotes: sourced ? retrieved.map(({ citation_url: _u, ...q }) => q) : retrieved, conversation_summary: conversationSummary(messages, persona),
    persona_name: persona, mission: profile.mission || null, companion_append: comp?.append || '',
    comparative: !!res?._plan?.comparative, conversational, entities: res?.entities || null, peopleAnswer: pa, target: res?._plan?.target || null, direction: { ...direction, format }, llm: llm || parseLlm(process.env.ANIS_LLM),
    onChunk: (t) => gate.push(t),
  });
  gate.flush();
  // Final text: markers → links, ungrounded links unlinked, and any sentence quoting words found in NO passage removed
  // (the widget reconciles its streamed text to this; email sends only this).
  const guarded = dropUnverified(cleanLinks(raw), retrieved);
  const reply = study ? placeRenderings(guarded.text, study, channel) : guarded.text;   // the counts come from code
  if (comp?.log && comp.plan) comp.log(comp.plan);

  // Chips = the sources the reply actually links, not every passage retrieved (screenshot: Book of Mormon and
  // Qabbalah under an answer that used two Bahá'í texts).
  const cited = citations.filter((c) => c.url && reply.includes(c.url));
  // A term study's chart comes from the CTAI concordance, not from passages: record its facts so the auditor can check the
  // counts (10-12: the ʿirfán chart was judged "fabricated, unsupported by any evidence" because the counts were invisible).
  const studyEvidence = study ? [{ title: `CTAI concordance: ${study.term}${study.root ? ` (root ${study.root})` : ''}`, author: 'CTAI', url: study.researchUrl || null,
    religion: "Bahá'í", text: `Shoghi Effendi's renderings of ${study.term}, counted over ${study.counted || study.total} aligned passages (${study.total} in all): `
      + study.renderings.map((r) => `${r.en} ${r.count}`).join(', ') }] : [];
  return { reply, quotes_removed: guarded.removed, evidence: [...studyEvidence, ...evidenceOf(retrieved)], citations: cited, retrieved: retrieved.filter((q) => q.citation_url && reply.includes(q.citation_url)), plan: res?._plan || null,
    format: format ? { id: format.id, by: format.by } : null, profile: describeProfile(evidenceProfile),
    timings: { search_ms: searchMs, first_token_ms: firstTokenMs ?? Date.now() - t0, total_ms: Date.now() - t0 } };
}
