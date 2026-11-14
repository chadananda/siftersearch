// Anis voice lint — the missing validator for the Companion's FORBIDDEN list and the soul's voice rules. Runs on every
// final reply; LOGS hits, never blocks (a false positive must not censor an answer — the soul battery is the gate).
// Pure. Deps: md-valid. One rule BLOCKS: a reply ending in an offer to search loses that offer (dropSearchOffer); finalForm applies it,
// with safeLinkText, at every reply's exit.
import { safeLinkText, repairEmphasis } from './md-valid.js';
import { sentencesOf } from './sentences.js';
import { encodeMarker } from '../ool-range.js';

// An offer to run a lookup Anís could run himself: "would you like me to look…", "I can look up X if you'd like", "shall I
// search…". Not a statement of what was found ("all I could find", "I could find no…") and not an offer to READ with the reader.
const OFFER_VERB = String.raw`(?:search\w*|look(?:\s+(?:up|for|into|further|through|at))?|find|trace|dig|check|pull\s+up|locate|hunt|fetch|explore|go\s+(?:deeper|further))`;
export const SEARCH_OFFER = new RegExp(String.raw`\b(?:would\s+you\s+like|do\s+you\s+want|(?:like|want|wish)\s+me|shall\s+i|should\s+i)\b[^.?!\n]{0,100}?\b${OFFER_VERB}\b`
  + String.raw`|(?<!\b(?:all|what|as|that|which|where)\s)\bi(?:\s+(?:can|could)|['’]d\s+be\s+(?:glad|happy)\s+to|\s+would\s+be\s+(?:glad|happy)\s+to|['’]m\s+happy\s+to|\s+am\s+happy\s+to)`
  + String.raw`\s+(?:also\s+|then\s+|next\s+|gladly\s+|further\s+)?${OFFER_VERB}\b(?!\s+(?:no|nothing|none|only|it\s+in\s+no)\b)`, 'i');
// A DENIAL that Anís can search (Chad 11-10: '"I cannot search from here" is never correct'): any sentence saying he can't search,
// look up or run a search of the library or a book — "I can't run a literal text search of the book from here", "I'm unable to
// search the text", "I don't have a way to search", "searching the full text isn't something I can do". Not an absence report
// ("I could not find …": find is not a search verb here) and not an offer ("I can search …": no negation).
const DENY_VERB = String.raw`(?:search\w*|look(?:ing)?\s+(?:up|through|it\s+up|that\s+up)|scan\w*|query\w*|full[-\s]text|text\s+search|grep)`;
const I_CANT = String.raw`\bI(?:\s+(?:can(?:no|['’])t|cannot|could(?:\s+not|n['’]t)|am\s+(?:not\s+able|unable)|(?:do|did)(?:\s+not|n['’]t)\s+have\s+(?:a\s+(?:way|tool|means)|any\s+(?:way|tool|means)|the\s+(?:ability|means|tools?|capability|access)|(?:direct\s+)?access)|have\s+no\s+(?:way|means|ability|tool|access))|['’]m\s+(?:not\s+able|unable))`;
export const SEARCH_DENIAL = new RegExp(String.raw`${I_CANT}\b[^.!?\n]{0,80}?\b${DENY_VERB}`
  + String.raw`|\b${DENY_VERB}\b[^.!?\n]{0,80}\b(?:isn['’]t|is\s+not|aren['’]t|are\s+not)\s+(?:something|a\s+thing)\s+I\s+can\b`
  + String.raw`|\b(?:no|without\s+(?:a|any))\s+(?:way|means|ability|tool)\s+(?:for\s+me\s+)?to\s+${DENY_VERB}`
  + String.raw`|\b(?:beyond|outside)\s+what\s+I\s+can\s+(?:search|look\s+up)\b`, 'i');
export const isSearchDenial = (s) => SEARCH_DENIAL.test(String(s || '').replace(/[“"][^”"]{0,600}[”"]/g, ' '));
// A DEFLECTION (11-10 live battery, history_fact + quote_trace): the reply sends the reader off to ask differently instead of
// answering — "You might try asking…", "a helpful way forward is to ask specifically for…", "try rephrasing", "narrow your
// question". The research is Anís's; the question asked is the one to answer. Not the texts' own counsel (quoted words never count).
const ASK_VERB = String.raw`(?:ask(?:ing)?|rephras\w*|reword\w*|re-?phras\w*|narrow\w*|refin\w*|reformulat\w*)`;
export const DEFLECTION = new RegExp(String.raw`\b(?:you\s+(?:might|could|may|can)\s+(?:also\s+|instead\s+|first\s+)?(?:want\s+to\s+)?try|try)\s+(?:asking|rephrasing|rewording|phrasing|narrowing|refining)\b`
  + String.raw`|\b(?:way\s+forward|next\s+step|approach|starting\s+point|place\s+to\s+start)\s+(?:is|would\s+be|might\s+be|could\s+be|may\s+be)\s+to\s+${ASK_VERB}\b`
  + String.raw`|\b(?:you\s+(?:could|can|might|may)\s+)?ask(?:ing)?\s+(?:me\s+)?(?:more\s+)?specifically\s+(?:about|for|which|what|whether)\b`
  + String.raw`|\b(?:narrow|rephrase|reword|refine|reformulate)\s+(?:your|the)\s+(?:question|query|request)\b`, 'i');
export const isDeflection = (s) => DEFLECTION.test(String(s || '').replace(/[“"][^”"]{0,600}[”"]/g, ' '));
// A COVERAGE DISCLAIMER (11-11 email, "What can you tell me about Quddus?"): "The texts I can search here do not provide a full
// account of Quddús, but they do preserve …" opened a reply that then answered from The Dawn-Breakers. A disclaimer of
// completeness says nothing the answer doesn't show; it is dropped when the reply cites a source (a reply with no link keeps it).
// 11-14 reader text: "…do not provide …, but rather point to the work…" became "Rather point to the work…" (no subject). Only the negative
// clause goes, and only when a whole sentence remains ("The texts I can search here point to the work…"); otherwise the sentence stays whole.
export const COVERAGE_DISCLAIMER = /\b(?:texts|sources|library|passages|materials?)\s+(?:I\s+(?:can\s+search|have|found|searched)|available(?:\s+to\s+me)?)(?:\s+here)?\s+(?:do\s+not|don['’]t|does\s+not|doesn['’]t|cannot|can['’]t)\s+(?:provide|give|offer|contain|hold|include|present|preserve)\s+(?:a\s+|an\s+)?(?:full|complete|comprehensive|detailed|extensive|thorough|whole|entire)\b/i;
export const dropCoverageDisclaimer = (text) => (/\]\(https?:\/\//.test(String(text || '')) ? dropSentences(text, (s) => COVERAGE_DISCLAIMER.test(String(s || '').replace(/[“"][^”"]{0,600}[”"]/g, ' ')), { fragment: 'keep' }) : { text: String(text || ''), dropped: 0 });
// AN UNCHECKED DISCLAIMER (Chad 11-14 replay, "Where does 'Let your vision be world-embracing' come from?"): "I did not check the
// section number or the original Persian/Arabic text." — what was not looked up is found or left out, never announced. Dropped
// sentence by sentence, quoted material excepted; the BUT rule keeps a clause after "but". Pure.
export const UNCHECKED_DISCLAIMER = /\bI\s+(?:did\s+not|didn['’]t|have\s+not|haven['’]t|had\s+not|could\s+not|couldn['’]t|cannot|can['’]t|was\s+(?:not\s+able|unable)\s+to|wasn['’]t\s+able\s+to|am\s+(?:not\s+able|unable)\s+to)\s+(?:yet\s+|fully\s+|independently\s+|separately\s+)?(?:check(?:ed)?|verif(?:y|ied)|confirm(?:ed)?|look(?:ed)?\s+(?:up|at|into)|consult(?:ed)?|compare[d]?|trace[d]?|examine[d]?)\b/i;
// A PLACE FROM MEMORY (Íqán r6 srcr6: "I'm giving the section number from memory, so check it against the edition: it is, I believe,
// Gleanings CXXXII."): a section, chapter or number comes from the passage's own place, never memory — the hedged sentence goes.
export const MEMORY_HEDGE = /\bfrom (?:my )?memory\b|\bcheck (?:it|this|that|them|the (?:number|section|reference)) against the (?:edition|book|text)\b|\bI (?:believe|think|recall)\b[^.!?\n]{0,80}\b(?:section|chapter|number|verse|paragraph|page|¶|[IVXLC]{3,})\b/i;
export const isUncheckedDisclaimer = (s) => { const t = String(s || '').replace(/[“"][^”"]{0,600}[”"]/g, ' '); return UNCHECKED_DISCLAIMER.test(t) || MEMORY_HEDGE.test(t); };
export const dropUncheckedDisclaimer = (text) => dropSentences(text, isUncheckedDisclaimer);
export const LINT = [
  { id: 'we-bahais', re: /\bwe\s+bah[aá]['’]?[ií]s?\b/i, why: 'speaks for a community' },
  { id: 'the-position', re: /\bthe\s+(bah[aá]['’]?[ií]|christian|muslim|islamic|jewish|buddhist|hindu)\s+position\s+is\b/i, why: 'a reading presented as a tradition\'s position' },
  { id: 'god-wants-you', re: /\bgod\s+(wants|wishes|desires|is\s+calling)\s+you\b/i, why: 'claims God\'s personal will for the person' },
  { id: 'spiritual-rank', re: /\byou\s+are\s+(spiritually\s+)?(ready|chosen|pure|closed|not\s+ready)\b/i, why: 'declares the person\'s spiritual state' },
  // W4 11-03: absence is only ever THIS search's; the library is never declared silent (r6-after: 4 false absences, 84 such lines)
  { id: 'library-silent', re: /\b(the\s+(library|texts?|sources?|passages?|works?|writings)\s+(i|that\s+i|which\s+i)\s+(can|have|am\s+able\s+to)\s+(\w+\s+){0,3}?(search|access|see|consult|available)\w*(\s+here)?|(the\s+library|the\s+(available\s+)?(texts?|sources?)\s+(available|at\s+hand))\s+(do(es)?\s+not|don't|doesn't)\s+(discuss|contain|include|cover|address|settle|speak|mention|hold)|not\s+in\s+the\s+library\b|the\s+library\s+(has|contains)\s+nothing)/i, why: 'declares the library silent instead of this search' },
  { id: 'generic-praise', re: /\b(great|excellent|wonderful|fantastic|profound|beautiful)\s+question\b/i, why: 'generic praise' },
  { id: 'superlative', re: /\b(truly|incredibly|profoundly|deeply)\s+(profound|beautiful|magnificent|moving|remarkable)\b/i, why: 'superlative instead of a specific observation' },
  { id: 'urgency', re: /\b(don['’]?t\s+wait|before\s+it['’]?s\s+too\s+late|act\s+now|right\s+away)\b/i, why: 'pressure or urgency' },
  { id: 'method-narration', re: /\b(to understand (this|what)[^.]{0,60}\bwe (must|need)|we must (carefully )?distinguish|let us (first )?(distinguish|consider|look))\b/i, why: 'narrates its method instead of answering' },
  { id: 'machinery', re: /\b(retrieved (sources|passages|texts)|the provided (texts|passages|sources|writings)|the passages (provided|given|above)|our library'?s? (cited )?record|in the (sources|passages) (i was|i've been) given)\b/i, why: 'mentions the pipeline instead of the works' },
  { id: 'authority-layers', re: /\b(authority layers?|the provided evidence|ground every claim)\b/i, why: 'pipeline vocabulary in a letter' },
  // 11-04: "if you like, I can search the tablets for…" — the research is Anís's to run, never the reader's to approve
  { id: 'search-offer', re: SEARCH_OFFER, why: 'offers a search it could run itself' },
  // 11-10 (Chad: "I cannot search from here" is never correct): BLOCKING — dropSearchDenial removes the sentence at every reply's exit
  { id: 'search-denial', re: SEARCH_DENIAL, why: 'says it cannot search the library or a book' },
  // 11-10 (live battery): BLOCKING — dropDeflection removes a sentence telling the reader to ask differently
  { id: 'deflection', re: DEFLECTION, why: 'tells the reader to ask differently instead of answering' },
  { id: 'human-claim', re: /\bas\s+a\s+(human|person|believer\s+myself)\b|\bi\s+am\s+(a\s+)?human\b/i, why: 'claims to be human' },
];

/** Lint a reply. Quoted material (> blockquotes and "…" quotes) is excluded: the texts may say anything. */
export function lintReply(text) {
  const own = String(text || '').split('\n').filter((l) => !/^\s*>/.test(l)).join('\n').replace(/[“"][^”"]{0,600}[”"]/g, ' ');
  return LINT.filter((r) => r.re.test(own)).map(({ id, why }) => ({ id, why }));
}

/** An offer to search, outside quoted material. Pure. */
export const isSearchOffer = (s) => SEARCH_OFFER.test(String(s || '').replace(/[“"][^”"]{0,600}[”"]/g, ' '));

// THE TRAILING SEARCH OFFER — BLOCKING (11-04 digest #163: "I can look up the Gleanings section number … if you'd like").
// The research is Anís's to run; an offer to run it is removed. Only the reply's closing sentences are examined (an offer
// is a sign-off), walking back over trailing paragraphs; a follow-on "Just ask." / "Let me know." goes with it. Blockquotes,
// tables, headings and lists are never touched, and the reply is never emptied. Pure.
const NUDGE = /^\s*(?:just\s+(?:ask|say|let\s+me\s+know)|let\s+me\s+know|happy\s+to\s+help|i['’]m\s+here\b)[^.!?\n]{0,80}[.!?]?\s*$/i;
const STRUCTURED = /^\s*(?:>|\||#|[-*+]\s|\d+[.)]\s)/;
export function dropSearchOffer(text) {
  const src = String(text || '');
  const paras = src.split(/\n{2,}/);
  let dropped = 0;
  for (let i = paras.length - 1; i >= 0; i--) {
    const p = paras[i];
    if (!p.trim()) continue;
    if (STRUCTURED.test(p) || p.includes('\n')) break;
    const sents = sentencesOf(p);
    let n = sents.length;
    while (n > 0) {
      if (isSearchOffer(sents[n - 1])) n -= 1;
      else if (n > 1 && NUDGE.test(sents[n - 1]) && isSearchOffer(sents[n - 2])) n -= 2;
      else break;
      dropped += 1;
    }
    if (n === sents.length) break;
    const kept = sents.slice(0, n).join('').trim();
    if (kept) { paras[i] = kept; break; }
    paras[i] = '';
  }
  if (!dropped) return { text: src, dropped: 0 };
  const out = paras.filter((p) => p.trim()).join('\n\n');
  return out.trim() ? { text: out, dropped } : { text: src, dropped: 0 };
}

// Deterministic BACKSTOP for the one machinery phrase the formatter keeps producing when something is missing
// (soul battery 2026-09-27: 5 of 18 replies said "The provided texts do not…"). The prompt is the fix; this catches
// what slips through. Rewrites only the fixed phrase, never meaning.
const MACHINERY_PHRASE = /\b(the|these) (provided|retrieved|given) (texts|passages|sources|writings)\b/gi;
export function unmachine(text) {
  return dropBriefMarkers(dropPilgrimDismissal(dropAuthorityLecture(mixedScript(String(text || '').replace(MACHINERY_PHRASE, (m) => (/^T/.test(m) ? 'The texts I can search' : 'the texts I can search'))))));
}

// The AUTHORITY LECTURE — a paragraph explaining "authority layers" nobody asked about. Lal objected to it in three letters
// ("NO interpretations please"; "I raised ONE question"), and it survived a prompt instruction against it (10-14). The
// prompt asks; this guarantees: such a paragraph is removed whole. Pure.
// (10-19: "As for the authorities behind these sources: the Arabic text itself is revealed Scripture …" slipped past)
const AUTHORITY_LECTURE = /\b(kinds of authority|carr(?:y|ies) the (?:primary )?weight of doctrine|(?:revelation|revealed scripture)[^.\n]{0,120}authori[sz]ed interpretation|separate (?:settled )?doctrine from (?:secondary )?(?:commentary|opinion)[^.\n]{0,60}\. (?:in the|revelation)|authority layers?|layers? of authority|to be (entirely |completely |fully )?clear about (the )?authorit|as (for|to) the authorit(y|ies)|authorit(y|ies) (behind|of) (these|the|this|our) (sources?|texts?|passages?)|(?:is|are) distinct from (?:the )?(?:authori[sz]ed interpretations?|primary texts?|scripture)|distinct from the primary texts|valuable historical windows?)/i;
// THE QUIBBLE (Chad 10-19: Lal asked whether "fi baytuhu" could stand for "chamber" and was told his phrase wanted a
// genitive — "What a useless answer"): a sentence correcting the reader's case endings is dropped unless they asked about
// grammar; in a LANGUAGE answer, the disclaimer that "the texts I can search do not settle…" goes too — the answer is
// the language itself. Pure.
const QUIBBLE = /\b(genitive|nominative|accusative|case ending|grammatical(?:ly)? (?:rule|irregular\w*)|would (?:normally|typically|properly) be|should (?:properly )?be written|requires? (?:a|the) (?:genitive|case))\b/i;
const ASKED_GRAMMAR = /\b(grammar|grammatical|genitive|nominative|accusative|case ending|i\'?rab|iʿrāb|declension)\b/i;
const NOT_SETTLED = /\b(?:texts|sources|library) I can search\b[^.\n]*\b(?:do not|don't|cannot|can't|does not)\b|\bcannot lean on\b|\bI (?:can't|cannot|couldn't|could not) find anything\b/i;
export function dropQuibbles(text, { question = '', format = null } = {}) {
  const asked = ASKED_GRAMMAR.test(String(question));
  return String(text || '').split(/\n{2,}/).map((para) => {
    const sents = sentencesOf(para);
    const kept = sents.filter((x) => !(!asked && QUIBBLE.test(x)) && !(format === 'language' && NOT_SETTLED.test(x)));
    return kept.join('').trim();
  }).filter(Boolean).join('\n\n');
}

/** The researcher's brief markers never reach the reader ("[own]", "(P3)", "[P2, W1]"). Pure. */
// "[linked]" / "[linked: …]": the history marker for a prior reply's links, echoed by the writer (11-10, the Deepening reply)
export const dropBriefMarkers = (t) => String(t || '').replace(/\s*\[own\]/gi, '').replace(/\s*\[linked(?::[^\]\n]{0,200})?\]/gi, '').replace(/\s*\((?:[PW]\d+(?:,\s*)?)+\)/g, '').replace(/\s*\[(?:[PW]\d+(?:,\s*)?)+\]/g, '');

// PILGRIMS' NOTES are never dismissed (Chad 10-23: "stop lecturing about pilgrim notes carrying no authority. It is relative …
// the pilgrim notes carry more authority than anything else that will ever be written by any scholar or institution in this
// Dispensation"). A sentence calling them of "no authority" / "not authoritative" / not to be quoted is dropped. Pure.
const PILGRIM_DISMISSAL = /(?:pilgrim|notes?\b|recollections?|table talk)[^.!?\n]{0,160}\b(?:carr(?:y|ies)|ha(?:ve|s)|hold|holds|with)\s+no\s+(?:real\s+|binding\s+|doctrinal\s+|official\s+)?authority|(?:pilgrim|notes?\b|recollections?)[^.!?\n]{0,120}\b(?:are|is)\s+not\s+(?:authoritative|authentic(?:ated)? text|binding)|(?:should|must)\s+not\s+be\s+quoted\s+as\s+["“]?the\s+guardian\s+said|\bno\s+authority\b[^.!?\n]{0,80}pilgrim/i;
export function dropPilgrimDismissal(text) {
  return String(text || '').split('\n').map((line) => (/^\s*>/.test(line) || !PILGRIM_DISMISSAL.test(line) ? line
    : sentencesOf(line).filter((sent) => !PILGRIM_DISMISSAL.test(sent)).join('').trimEnd())).join('\n');
}

export function dropAuthorityLecture(text) {
  const paras = String(text || '').split(/\n{2,}/);
  const kept = paras.filter((p) => !AUTHORITY_LECTURE.test(p));
  return kept.length && kept.length < paras.length ? kept.join('\n\n') : String(text || '');
}

// A Latin word with Arabic letters inside it: the model slips script mid-word next to Arabic text (10-12 term study:
// "Bahá’u’لlláh", "Bahá'وأlláh"). Drop the stray Arabic; the Central Figures' names come back whole. Pure Arabic runs untouched.
const LAT = "A-Za-zÀ-ÿĀ-žḀ-ỿ’'ʿʾ‘-";
const MIXED = new RegExp(`[${LAT}]+(?:[\u0600-\u06FF]+[${LAT}]*)+|[\u0600-\u06FF]+[${LAT}]{2,}`, 'g');
const NAMES = [[/^Bah[aá][’']?u?[’']?l+[aá]h$/i, 'Bahá’u’lláh'], [/^[‘']?Abdu[’']?l-?Bah[aá]$/i, '‘Abdu’l-Bahá']];
export function mixedScript(text) {
  return String(text).replace(MIXED, (w) => {
    if (!/[A-Za-z]/.test(w) || !/[\u0600-\u06FF]/.test(w)) return w;
    const latin = w.replace(/[\u0600-\u06FF\u064B-\u0652]+/g, '');
    const hit = NAMES.find(([re]) => re.test(latin));
    return hit ? hit[1] : latin;
  });
}

/** The form pass at every reply's one exit (turn.js; the /outreach letter): a closing offer to search dropped, brackets inside a
 *  link's text made parens. By form only — it never decides what the reply says. Pure. */
export function finalForm(text) { return formPass(text).text; }
/** finalForm with what it repaired, for the turn's path (forensics counts form.search_denial as a WRITER defect). Pure. */
export function formPass(text, { sources = [] } = {}) {
  const uw = unwrapLinks(text), den = dropSearchDenial(uw.text), cov = dropCoverageDisclaimer(den.text), def = dropDeflection(cov.text), off = dropSearchOffer(def.text), uc = dropUnsupportedCount(off.text, sources), qc = dropQuoteInCite(uc.text), lk = checkLinks(qc.text, sources);
  const ct = citeLinks(lk.text, sources), lr = lastResortLast(ct.text), la = dropLinkAside(lr.text), rt = plainSources(la.text), nm = dropNumberMarkers(rt.text), rq0 = dropRepeatedQuote(nm.text), da = dropDoubleAttribution(rq0.text), rc = dropRepeatedCite(da.text), pr = dropPlainCiteRun(rc.text, sources), rq = { text: pr.text, fixed: rq0.fixed }, em = repairEmphasis(safeLinkText(rq.text));
  return { text: em.text, repairs: { ...(uw.fixed ? { wrapped_links: uw.fixed } : {}), ...(cov.dropped ? { coverage_disclaimer: cov.dropped } : {}), ...(uc.fixed ? { unsupported_count: uc.fixed } : {}), ...(qc.fixed ? { quote_in_cite: qc.fixed } : {}), ...(rq.fixed ? { repeated_quote: rq.fixed } : {}), ...(da.fixed ? { double_attribution: da.fixed } : {}), ...(rc.fixed ? { repeated_cite: rc.fixed } : {}), ...(pr.fixed ? { plain_cite_run: pr.fixed } : {}), ...(nm.fixed ? { number_markers: nm.fixed } : {}), ...(la.fixed ? { link_aside: la.fixed } : {}), ...(rt.fixed ? { retrieval_talk: rt.fixed } : {}), search_denial: den.dropped, search_offer: off.dropped, ...(def.dropped ? { deflection: def.dropped } : {}), ...(lk.fixed ? { links: lk.fixed } : {}),
    ...(ct.fixed ? { cite_links: ct.fixed } : {}), ...(lr.fixed ? { last_resort: lr.fixed } : {}), ...(em.fixed ? { emphasis: em.fixed } : {}) } };
}

// An UNSUPPORTED COUNT in an aside (11-11 Quddús letter: "the last of the Letters of the Living—the Báb's nineteen chosen
// disciples—": there were eighteen; the writer glossed from memory). A prose aside (between dashes or in parentheses, no link,
// no quotation) stating a count that NO passage of the turn holds (as a word or a figure) is dropped — an aside removed never
// breaks its sentence. Years and other 4-digit figures are not counts. Needs passage text; without it nothing changes. Pure.
const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const countsIn = (s) => {
  const out = new Set(), t = String(s || '').toLowerCase();
  for (const m of t.matchAll(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-\s](one|two|three|four|five|six|seven|eight|nine))?\b/g)) out.add(TENS[m[1]] + (m[2] ? NUM_WORDS.indexOf(m[2]) : 0));
  for (const m of t.matchAll(/\b([a-z]+)\b/g)) { const i = NUM_WORDS.indexOf(m[1]); if (i >= 2) out.add(i); }
  for (const m of t.matchAll(/(?<![\d.,#§:])(\d{1,3})(?![\d.,:]?\d)(?=\s+[a-z])/g)) out.add(Number(m[1]));   // "18 disciples", not "p. 52"
  return out;
};
export function dropUnsupportedCount(text, sources = []) {
  const held = new Set(); let any = false;
  for (const s of sources) if (s?.text) { any = true; for (const n of countsIn(s.text)) held.add(n); }
  if (!any) return { text, fixed: 0 };
  let fixed = 0;
  const lines = String(text).split('\n').map((line) => (/^\s*>/.test(line) ? line : line.replace(/\s*(?:—|–| -- )([^—–()\n]{3,140}?)(?:—|–| -- )|\s*\(([^()\n]{3,140})\)/g, (all, dash, par) => {
    const aside = dash ?? par;
    if (/\]\(|https?:|["“”*]|\b(?:chapter|ch|vol|volume|p|pp|page|verse|sura|súra|no|para)\b\.?\s*\d|#/i.test(aside)) return all;   // a citation or a quotation, never a gloss
    const counts = [...countsIn(aside)].filter((n) => n >= 2);
    if (!counts.length || counts.every((n) => held.has(n))) return all;
    fixed++; return dash != null ? ' ' : '';
  })));
  return { text: fixed ? lines.join('\n').replace(/ {2,}/g, ' ').replace(/ ([,.;:])/g, '$1') : text, fixed };
}

// A QUOTATION TUCKED INTO A CITATION (11-11 Quddús letter: "…descendant of the Imám Ḥasan (*The Dawn-Breakers*, CHAPTER III,
// [*"The acceptance by Quddús … completed the assigned number…"*](…paraId=para_268…))" — a quote that says something else,
// filed as the sentence's evidence). A citation parenthesis is title + place; the quote leaves and its link moves onto the
// title: "([*The Dawn-Breakers*](…para_268…), CHAPTER III)". Quotes belong in prose, where the reader sees what they claim. Pure.
const QUOTE_IN_CITE = /\((\*[^*\n]{2,120}\*)([^()\[\]\n]{0,80}?),\s*\[[*_]*["“][^\]\n]{10,}["”][*_]*\]\((\S+?)\)\)/g;
export function dropQuoteInCite(text) {
  let fixed = 0;
  const out = String(text).replace(QUOTE_IN_CITE, (all, title, place, url) => { fixed++; return `([${title}](${url})${place})`; });
  return { text: fixed ? out : text, fixed };
}

// A REPEATED QUOTE (11-11 suffering: the same Unfolding Destiny passage as a block quote with a whole-book link, then again as a
// linked quote with its place): two paragraphs that are each one quotation of the same passage. The one linked to its place
// (paraId / #:~:text=) stays; with no difference the first stays. Only paragraphs that ARE a quote (a block quote, or one opening
// with a quoted link), and only passages of 40+ letters, so a phrase echoed in prose is never touched. Pure.
const quoteBody = (para) => {
  const t = para.trim();
  if (t.startsWith('>')) return t.replace(/^>\s?/gm, '').replace(/\s*\(\[[^\]]*\]\([^)]*\)\)\s*$/, '').replace(/\s*—.*$/s, '');
  const m = t.match(/^\[[*_]*["“]([^\]]+?)["”][*_]*\]\(/); return m ? m[1] : null;
};
const letters = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
const placed = (para) => /[?&]paraId=|#:~:text=|[?&]p=/.test(para);
export function dropRepeatedQuote(text) {
  const paras = String(text ?? '').split(/\n{2,}/), seen = new Map(), drop = new Set();
  paras.forEach((p, i) => {
    const b = quoteBody(p), k = b && letters(b);
    if (!k || k.length < 40) return;
    const j = [...seen.keys()].find((x) => x === k || x.includes(k) || k.includes(x));
    if (j === undefined) { seen.set(k, i); return; }
    const first = seen.get(j);
    if (placed(p) && !placed(paras[first])) { drop.add(first); seen.delete(j); seen.set(k, i); } else drop.add(i);
  });
  return drop.size ? { text: paras.filter((_, i) => !drop.has(i)).join('\n\n'), fixed: drop.size } : { text, fixed: 0 };
}

// A DOUBLE ATTRIBUTION (11-11 suffering: "> — Abdu'l-Bahá's 2nd Visit to UK…" closing the block quote, then "— 'Abdu'l-Bahá, *Abdu'l-Bahá's 2nd
// Visit to UK…*" as its own paragraph): one attribution, the fuller, inside the quote. Only when the standalone line is nothing but an
// attribution that contains the quote's own. Pure.
export function dropDoubleAttribution(text) {
  const paras = String(text ?? '').split(/\n{2,}/), drop = new Set();
  paras.forEach((p, i) => {
    const lines = p.trimEnd().split('\n'), last = lines[lines.length - 1] ?? '', next = (paras[i + 1] ?? '').trim();
    const a = last.match(/^>\s*[—–-]\s*(.+)$/), b = next.match(/^[—–]\s*(.+)$/);
    if (!a || !b || next.includes('\n') || !p.trim().startsWith('>')) return;
    const ka = letters(a[1].replace(/\]\([^)]*\)/g, ']')), kb = letters(b[1].replace(/\]\([^)]*\)/g, ']'));
    if (ka.length < 8 || !kb.includes(ka)) return;
    lines[lines.length - 1] = `> ${next}`; paras[i] = lines.join('\n'); drop.add(i + 1);
  });
  return drop.size ? { text: paras.filter((_, i) => !drop.has(i)).join('\n\n'), fixed: drop.size } : { text, fixed: 0 };
}

// A REPEATED CITATION in one paragraph (11-11: "([Selections from the Writings of ‘Abdu’l-Bahá, #1247](…paraId=para_1247…)) He gently tells … lasts
// ([*Selections from the Writings of 'Abdu'l-Bahá*](…), #1247)"): a later parenthetical naming the same work at the same place goes; the first,
// usually the one linked to its place, stays. A citation with no place is never dropped (it may be another passage of the work). Pure.
const CITE = /\s*\(\[([^\]]+)\]\(([^)\s]+)\)(?:,\s*([^()]*?))?\)/g;
const placeIn = (label, tail) => {
  const t = String(tail || '').trim() || (String(label).replace(/[*_]/g, '').match(/,\s*((?:#|§|p\.?\s*|pp?\.\s*|para\.?\s*)[\d.:–-]+)\s*$/i) || [])[1] || '';
  return t.replace(/\s+/g, '').toLowerCase();
};
// A RUN OF ONE UNLINKED CITATION (11-12 examples: "(Memories of the Holy Family)" after every sentence of one story; "(X) (X)"
// side by side). In a paragraph, a plain "(Title)" naming a turn source is dropped when the next citation in that paragraph is the
// same title — the run is cited once, at its end; one standing before a blockquote that names the same title goes too. Pure.
const CITE_RUN = /[ \t]*\((?:\[([^\]\n]{3,200})\]\(([^)\s]+)\)|([^()\n]{3,160}))\)/g;
export function dropPlainCiteRun(text, sources = []) {
  const titles = [...new Set(sources.map((x) => foldT(x?.title)).filter((t) => t.length > 3))];
  const citeOf = (inner) => { const t = foldT(inner); return t.length > 3 ? titles.find((x) => t === x || t.startsWith(`${x} `) || x.startsWith(`${t} `)) : undefined; };
  let fixed = 0;
  const paras = String(text ?? '').split('\n');   // a line: a paragraph or one list item (each bullet keeps its own citation)
  const out = paras.map((para, i) => {
    if (/^\s*>/.test(para) || !para.trim()) return para;
    const hits = [...para.matchAll(CITE_RUN)].map((m) => Object.assign(m, { key: m[2] ? `u:${m[2]}` : citeOf(m[3]) })).filter((m) => m.key);
    const rest = paras.slice(i + 1), at = rest.findIndex((l) => l.trim()), quote = at < 0 ? [] : rest.slice(at);
    const next = quote.slice(0, (quote.findIndex((l) => !/^\s*>/.test(l)) + 1 || quote.length + 1) - 1).join(' ');
    const drop = new Set(hits.filter((m, k) => (hits[k + 1] ? hits[k + 1].key === m.key
      : /^\s*>/.test(next) && /:$/.test(para.slice(0, m.index).trimEnd()) && para.slice(m.index + m[0].length).trim() === '' && !m[2] && foldT(next).includes(m.key))).map((m) => m.index));
    if (!drop.size) return para;
    fixed += drop.size;
    return para.replace(CITE_RUN, (m, label, url, plain, off) => (drop.has(off) ? '' : m));
  });
  return fixed ? { text: out.join('\n'), fixed } : { text: String(text ?? ''), fixed: 0 };
}
export function dropRepeatedCite(text) {
  let fixed = 0;
  const out = String(text ?? '').split(/\n{2,}/).map((para) => {
    const seen = new Set();
    let last = null;   // { book, end } of the last citation WITH a locator
    return para.replace(CITE, (m, label, url, tail, off) => {
      const place = placeIn(label, tail), book = bookUrl(url);
      // a citation with no locator ("on Ṭáhirih", or nothing) right after one of the same work WITH a locator adds nothing (11-11 Badasht:
      // "([Memorials of the Faithful, 69 Ṭáhirih, #67.28](…))* ([*Memorials of the Faithful*](…), on Ṭáhirih)"); later in the paragraph it may back another claim
      if (!/\d/.test(place)) {
        if (last?.book === book && /^[\s*_)\].,;]*$/.test(para.slice(last.end, off))) { fixed++; return ''; }
        return m;
      }
      last = { book, end: off + m.length };
      const k = `${book}|${place}`;
      if (seen.has(k)) { fixed++; return ''; }
      seen.add(k); return m;
    });
  });
  return fixed ? { text: out.join('\n\n'), fixed } : { text, fixed: 0 };
}

// Footnote residue the reader cannot follow ("… by Stephen Lambden [^1].", "… Him Whom God shall make manifest [3, 7].", 11-11 kawthar):
// a bracketed number list that is not a link and has no footnote definition is dropped, with its space. Quoted lines are left. Pure.
// A LINK ASIDE (r16 11-11: "In his tablet … (which I can cite by title only), he describes"): the writer narrating that a source has
// no link. The reader sees an unlinked title either way; the aside is our plumbing, never theirs. Parenthetical only (a whole
// sentence about links would leave a hole). Outside block quotes. Pure.
const LINK_ASIDE = /\s*\((?:which |that |though )?(?:I |we )?(?:can |could )?(?:only )?(?:cite|name|reference|give|mention)[^()\n]{0,40}?\b(?:by (?:its |the )?title(?: only| alone)?|without a link|with no link|unlinked)\)|\s*\((?:no (?:public )?link(?: (?:is )?available)?|not linked|link unavailable|title only)\)/gi;
export function dropLinkAside(text) {
  let fixed = 0;
  const out = String(text || '').split('\n').map((l) => (/^\s*>/.test(l) ? l : l.replace(LINK_ASIDE, () => { fixed += 1; return ''; }))).join('\n');
  return { text: fixed ? out : String(text || ''), fixed };
}

// RETRIEVAL TALK (prompt rule: never mention "passages" or "search results"; r17 11-11 Siyyid Káẓim: "The first passage returned, …",
// "The library's results here did not include …", "The passages here show …"): the machinery's nouns become the reader's — the
// sources. Counted (repairs.retrieval_talk) so the writer's slip is noted for correction. Outside block quotes. Pure.
const RETRIEVAL_TALK = [
  [/\b([Tt])he first passage (?:returned|retrieved|found|here)\b/g, (m, t) => `${t}he first source I found`],
  [/\b([Tt])he library'?s results(?: here)?\b/g, (m, t) => `${t}he sources I found`],
  [/\b([Tt])he (?:retrieved |returned )?passages(?: (?:found here|above|here|returned|retrieved|provided|I found|I have))?(?= (?:do|did|don't|didn't|does|show|leave|say|state|give|record|contain|include|hold|are|were)\b)/g, (m, t) => `${t}he sources`],
  // "The library hasn't surfaced a passage" (11-11 Shaykh Aḥmad): the reader hears the machinery, not the finding
  [/\b[Tt]he library (?:hasn't|has not) (?:surfaced|returned|turned up|produced)\b/g, () => "I haven't found"],
  [/\b[Tt]he library (?:didn't|did not) (?:surface|return|turn up|produce)\b/g, () => "I didn't find"],
  [/\b([Ii]n|[Ff]rom) (?:the )?(?:search )?results(?: here)?\b/g, (m, w) => `${w} the sources`],
];
export function plainSources(text) {
  let fixed = 0;
  const out = String(text || '').split('\n').map((l) => (/^\s*>/.test(l) ? l : RETRIEVAL_TALK.reduce((x, [re, f]) => x.replace(re, (...a) => { fixed += 1; return f(...a); }), l))).join('\n');
  return { text: fixed ? out : String(text || ''), fixed };
}

export function dropNumberMarkers(text) {
  const src = String(text || '');
  if (/^\[\^?\d+\]:/m.test(src)) return { text: src, fixed: 0 };   // real footnotes: their definitions are in the text
  let fixed = 0;
  const out = src.split('\n').map((l) => (/^\s*>/.test(l) ? l : l.replace(/[ \t]*\[\^?\d{1,3}(?:\s*[,–-]\s*\^?\d{1,3})*\](?![(\[:])/g, () => { fixed += 1; return ''; }))).join('\n');
  return { text: fixed ? out : src, fixed };
}

// A link wrapped in square brackets ("[[*The Báb*](url)]") or a quotation in link brackets with no link ("[*“Seventeen Letters…”*]"),
// 11-10 Letters of the Living: the reader sees the brackets — unwrapped. Pure.
export function unwrapLinks(text) {
  let fixed = 0;
  const out = String(text || '').replace(/\[(\[[^\[\]\n]+\]\(https?:\/\/[^\s)]+\))\](?!\()/g, (m, link) => { fixed += 1; return link; });
  const out2 = out.replace(/\[(\*["“][^\[\]\n]+["”]\*)\](?![(\[])/g, (m, q) => { fixed += 1; return q; });   // a quotation in link brackets with no link
  // a "[" that no "]" closes on its line ("records that these eighteen disciples [*“found the Báb…” (…, #105)*.")
  const out3 = out2.split('\n').map((line) => {
    const cut = [];
    for (let i = 0; i < line.length; i += 1) { if (line[i] === '[') cut.push(i); else if (line[i] === ']' && cut.length) cut.pop(); }
    if (!cut.length) return line;
    fixed += cut.length;
    return [...line].filter((_, i) => !cut.includes(i)).join('');
  }).join('\n');
  const cl = closeOrphans(out3);
  fixed += cl.fixed;
  return { text: fixed ? cl.text : String(text || ''), fixed };
}

// A link the writer opened over a multi-line block quotation ends in a "](url)" whose "[" sits lines above (11-10, Suratu'l-Kawthar):
// the orphan close is dropped, its paragraph rejoins the quotation it ends (one blank line after "> " lines), and the url moves to an
// unlinked "— *Title*" attribution right after it, so the place link survives. Pure.
function closeOrphans(text) {
  const lines = text.split('\n');
  let fixed = 0;
  for (let i = 0; i < lines.length; i += 1) {
    let depth = 0, at = -1;
    for (let k = 0; k < lines[i].length; k += 1) { const c = lines[i][k]; if (c === '[') depth += 1; else if (c === ']') { if (depth) depth -= 1; else if (lines[i][k + 1] === '(') { at = k; break; } } }
    if (at < 0) continue;
    const m = /^\]\((https?:\/\/[^\s)]+)\)/.exec(lines[i].slice(at));
    if (!m) continue;
    lines[i] = lines[i].slice(0, at) + lines[i].slice(at + m[0].length);
    fixed += 1;
    let top = i; while (top > 0 && lines[top - 1].trim()) top -= 1;   // this paragraph's first line
    if (top >= 2 && !lines[top - 1].trim() && /^>/.test(lines[top - 2]) && !/^>/.test(lines[top])) {
      lines[top - 1] = '>';
      for (let k = top; k <= i; k += 1) lines[k] = `> ${lines[k]}`;
    }
    let n = i + 1; while (n < lines.length && !lines[n].trim()) n += 1;
    const att = n < lines.length && /^(>\s*)?—\s*\*([^*\[\]\n]+)\*\s*$/.exec(lines[n]);
    if (att) lines[n] = lines[n].replace(`*${att[2]}*`, `[*${att[2]}*](${m[1]})`);
    i -= 1;   // the same line may hold another orphan
  }
  return { text: lines.join('\n'), fixed };
}

// THE LINK CHECK — BLOCKING (battery 11-10 "main book of the Hindus": `[*Bhagavad-Gita*](…) [https://…](https://…)`, a Mahabharata
// title linked to gutenberg.org, another to …/hymns-of-atharva-veda). At the exit a link's label must name what it opens:
//  · a label that IS a URL: dropped when it trails another link (a duplicate), else labelled with its source's title or its host;
//  · a label that names a cited source's title: its link must open that source — else it is relinked to the source's own link,
//    or left an unlinked title when that link is itself untrustworthy (an OceanLibrary book slug sharing no word with the title).
// Quotation labels ([*"…"*](url)) are narrowQuoteLinks' business, never touched here. sources: [{ title, url }]. Pure.
const MD_LINK = /([ \t]*)\[([^\[\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
const foldT = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[‘’ʼʻ`']/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const SLUG_STOP = new Set(['the', 'and', 'of', 'a', 'an', 'in', 'on', 'en', 'vol', 'part']);
const words = (s) => foldT(s).split(' ').filter((w) => w.length > 2 && !SLUG_STOP.has(w));
const bareLabel = (label) => label.replace(/[*_\s]/g, '');
const isUrlLabel = (label) => /^(?:https?:\/\/|www\.)\S+$/i.test(bareLabel(label));
const bookOf = (url) => { try { const u = new URL(url); return `${u.host.replace(/^www\./, '')}/${u.pathname.split('/').filter(Boolean)[0] || ''}`; } catch { return null; } };
/** An OceanLibrary link whose book slug shares no word with the title it is said to open is not that book; other hosts pass. */
export function slugAgrees(url, title) {
  let u; try { u = new URL(url); } catch { return false; }
  if (!/(^|\.)oceanlibrary\.com$/.test(u.host)) return true;
  const slug = words((u.pathname.split('/').filter(Boolean)[0] || '').replace(/[-_]/g, ' ')), t = words(title);
  if (slug.length < 2 || t.length < 1) return true;
  return slug.some((w) => t.some((x) => x.startsWith(w.slice(0, 4)) || w.startsWith(x.slice(0, 4))));
}
export function checkLinks(text, sources = []) {
  const src = String(text || ''), byTitle = new Map(), byUrl = new Map();
  for (const s of sources || []) {
    if (!s?.title) continue;
    if (!byTitle.has(foldT(s.title))) byTitle.set(foldT(s.title), s);
    if (s.url) byUrl.set(s.url, s);
  }
  let fixed = 0;
  const out = src.replace(MD_LINK, (m, ws, label, url, off, all) => {
    if (isUrlLabel(label)) {
      fixed += 1;
      if (/\]\([^)\s]+\)[*_]*$/.test(all.slice(Math.max(0, off - 600), off))) return '';   // trails another link: a duplicate, gone with its space
      const s = byUrl.get(url);
      let host = ''; try { host = new URL(url).host.replace(/^www\./, ''); } catch { /* unparsable: 'link' */ }
      return `${ws}[${s ? `*${s.title}*` : host || 'link'}](${url})`;
    }
    if (/^[*_\s]*["“]/.test(label)) return m;
    if (foldT(byUrl.get(url)?.title || '') === foldT(label.replace(/[*_]/g, ''))) return m;   // already its own source's link (two books of one title)
    const s = byTitle.get(foldT(label.replace(/[*_]/g, '')));
    if (!s) return m;
    const good = !!s.url && slugAgrees(s.url, s.title);
    // the source's own link is sound: the label must open that book
    if (good) { if (bookOf(url) === bookOf(s.url)) return m; fixed += 1; return `${ws}[${label}](${s.url})`; }
    // the source's link is not its book: keep only an OceanLibrary link of the right name, else the title stands unlinked
    if (/(^|\.)oceanlibrary\.com\//.test(url.replace(/^https?:\/\//, '')) && bookOf(url) !== bookOf(s.url || '') && slugAgrees(url, s.title)) return m;
    fixed += 1;
    return `${ws}${label}`;
  });
  // a title (italic, a few capitalised words) whose OceanLibrary link opens another book proves that URL wrong for this reply, whatever
  // the sources say (11-11 Vaḥíd: "*Revelation of Baha'u'llah*, Vol. 4" and its quotations → kjv-apocalypse-saint-john-of-patmos)
  const titleLike = (label) => { const t = label.replace(/[*_]/g, '').trim(), w = t.split(/\s+/); return /^[*_]/.test(label.trim()) && !/^["“]/.test(t) && w.length <= 10 && w.filter((x) => /^\p{Lu}/u.test(x)).length * 2 >= w.length; };
  const wrong = new Set();
  for (const m of out.matchAll(MD_LINK)) if (/(^|\.)oceanlibrary\.com\//.test(m[3].replace(/^https?:\/\//, '')) && titleLike(m[2]) && !slugAgrees(m[3], m[2].replace(/,?\s*Vol(?:ume)?\.?\s*\d+.*$/i, ''))) wrong.add(bookOf(m[3]));
  // a GLOSS link (r17 11-11 Letters: "the first [*Váḥid*](bahai-library.com/momen_iranica_sayyed_darabi) (unity)" — the concept word
  // linked to an article on the man Vaḥíd): a one- or two-word label on a bahai-library.com page whose slug shares no word with it
  const gloss = (label, url) => { let u; try { u = new URL(url); } catch { return false; }
    const t = words(label.replace(/[*_"“”]/g, '')), slug = words(decodeURIComponent(u.pathname).replace(/[-_/.]/g, ' '));
    return /(^|\.)bahai-library\.com$/.test(u.host) && label.replace(/[*_]/g, '').trim().split(/\s+/).length <= 2 && t.length >= 1 && slug.length >= 2
      && !slug.some((w) => t.some((x) => x.startsWith(w.slice(0, 4)) || w.startsWith(x.slice(0, 4)))); };
  const out2 = wrong.size || [...out.matchAll(MD_LINK)].some((m) => gloss(m[2], m[3]))
    ? out.replace(MD_LINK, (m, ws, label, url) => (wrong.has(bookOf(url)) || gloss(label, url) ? (fixed += 1, `${ws}${label}`) : m)) : out;
  // a work's title linked to another host while the reply already opens that work on OceanLibrary (11-11 grandmother turn: "as quoted
  // in [*Living the Life*](bahai-library.com/compilation_living_the_life)", its quotation linked to oceanlibrary.com/living-the-life_bahaullah)
  const olBooks = [...out2.matchAll(MD_LINK)].map((m) => m[3]).filter((u) => /(^|\.)oceanlibrary\.com\//.test(u.replace(/^https?:\/\//, '')));
  const olFor = (label) => { const t = label.replace(/[*_]/g, '').trim(); const u = olBooks.find((x) => words(t).length >= 2 && slugAgrees(x, t) && words(bookOf(x).split('/')[1].replace(/[-_]/g, ' ')).filter((w) => words(t).includes(w)).length >= Math.min(2, words(t).length)); return u ? `https://${bookOf(u)}` : null; };
  const out3 = olBooks.length ? out2.replace(MD_LINK, (m, ws, label, url) => {
    if (/(^|\.)oceanlibrary\.com\//.test(url.replace(/^https?:\/\//, '')) || !titleLike(label)) return m;
    const ol = olFor(label); if (!ol) return m;
    fixed += 1; return `${ws}[${label}](${ol})`;
  }) : out2;
  return { text: fixed ? out3 : src, fixed };
}

// CITATION LINKS — BLOCKING (battery 11-10): one citation, one link, one source.
//  · "[*Gleanings*](book) ([link](paragraph))" → "[*Gleanings*](paragraph)": a bare "link" label after a link to the same book
//    merges into it (the citation text IS the link); a "[link]" elsewhere takes its source's title, else its host;
//  · a quotation linked to a whole book takes the paragraph link of a source of that book whose text holds the quoted words;
//  · "[*"…"*](U1) — [*Title*](U2)" with U1 and U2 on different sites: the title opens U1's book (justice: the Hidden Words quote
//    on oceanlibrary.com, its title on bahai-library.com).
// sources: [{ title, url, text }]. Pure.
const paraLevel = (u) => /[?&]paraId=|selectionString=|#p\d+|#\(/.test(u || '');
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return null; } };
const bookUrl = (u) => String(u || '').replace(/[?#].*$/, '').replace(/(\.[a-z]+\/.+?)\/$/, '$1');
const quoteWords = (label) => foldT(label.replace(/[*_]/g, '').replace(/^\s*["“]|["”]\s*$/g, ''));
const OWN_SITE = /^https?:\/\/(?:[a-z0-9-]+\.)?siftersearch\.com(?:[/?#]|$)/i;
export function citeLinks(text, sources = []) {
  let src = String(text || ''), fixed = 0;
  const srcs = (sources || []).filter((x) => x?.url);
  // (0) our own address (siftersearch.com) — Anís never names it (public identity, round 5 HARD RULE): a source of the same title with a
  //     public link → that link; none → the citation stays as unlinked text (the title or quotation, never our reader)
  src = src.replace(/\[([^\[\]\n]+)\]\((https?:\/\/(?:[a-z0-9-]+\.)?siftersearch\.com(?:\/[^\s)]*)?)\)/gi, (m, label, u) => {
    const own = srcs.find((x) => x.url === u) || srcs.find((x) => bookOf(x.url) === bookOf(u));
    const t = foldT((own?.title || label).replace(/[*_]/g, ''));
    const pub = t && srcs.find((x) => foldT(x.title) === t && !OWN_SITE.test(x.url));
    fixed += 1;
    return pub ? `[${label}](${pub.url})` : label;
  });
  const bare = /\s*\(?<?https?:\/\/(?:[a-z0-9-]+\.)?siftersearch\.com(?:\/[^\s)>]*)?>?\)?/gi;   // a bare address of ours, with its brackets
  if (bare.test(src)) { fixed += 1; src = src.replace(bare, ''); }
  // (1) "[X](U1) ([link](U2))", same book → "[X](U2)"
  src = src.replace(/\[([^\[\]\n]+)\]\((https?:\/\/[^\s)]+)\)\s*\(\[(?:link|source|here)\]\((https?:\/\/[^\s)]+)\)\)/gi, (m, label, u1, u2) => {
    if (bookOf(u1) !== bookOf(u2)) return m;
    fixed += 1;
    return `[${label}](${paraLevel(u2) || !paraLevel(u1) ? u2 : u1})`;
  });
  // (1b) a lone "[link]": its source's title, else its host
  src = src.replace(/\[(?:link|source|here)\]\((https?:\/\/[^\s)]+)\)/gi, (m, u) => {
    const s = srcs.find((x) => x.url === u) || srcs.find((x) => bookOf(x.url) === bookOf(u));
    const label = s?.title ? `*${s.title}*` : hostOf(u);
    if (!label) return m;
    fixed += 1;
    return `[${label}](${u})`;
  });
  // (2a) a quotation linked to a PLACE whose source text lacks the words (11-10 Kawthar: Qur'án 108:2–3 linked to an Ocean of Lights
  //      catalogue range that does not hold it) → the place of a source that does, else the quotation stands unlinked. Only a
  //      source we hold text for is judged; a URL may hold balanced parens (Ocean of Lights "#(start)(end)").
  src = src.replace(/\[([*_\s]*["“][^\[\]\n]+)\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)\)/g, (m, label, u) => {
    const q = quoteWords(label), own = srcs.find((x) => x.url === u);
    if (!paraLevel(u) || q.split(' ').length < 4 || !own?.text || foldT(own.text).includes(q)) return m;
    const s = srcs.find((x) => x.text && paraLevel(x.url) && foldT(x.text).includes(q));
    fixed += 1;
    return s ? `[${label}](${s.url})` : label;
  });
  // (2) a quotation linked to a whole book → the paragraph of that book holding the words
  src = src.replace(/\[([*_\s]*["“][^\[\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, u) => {
    if (paraLevel(u)) return m;
    const q = quoteWords(label);
    if (q.split(' ').length < 4) return m;
    const s = srcs.find((x) => bookOf(x.url) === bookOf(u) && paraLevel(x.url) && foldT(x.text).includes(q));
    if (s) { fixed += 1; return `[${label}](${s.url})`; }
    // (2b) no source here holds the place (our copy's text differs from the site's: page markers, a revised paragraph — round 5
    //      compilation, 5 placeless quote links): an OceanLibrary book link carries the quoted words as the private "#~q=" marker,
    //      which the output pass (ocean-links upgradeOceanLinks, run after this lint) turns into the passage's range, or drops
    if (hostOf(u) !== 'oceanlibrary.com' || u.includes('#')) return m;
    fixed += 1;
    return `[${label}](${bookUrl(u)}#~q=${encodeMarker(label.replace(/[*_]/g, '').trim().replace(/^["“]|["”]$/g, '').trim())})`;
  });
  // (3) a quotation's citation title on another site than the quotation → the quotation's book
  src = src.replace(/(\[[*_\s]*["“][^\[\]\n]+\]\((https?:\/\/[^\s)]+)\)\s*[—–-]\s*)\[([^\[\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, head, u1, title, u2) => {
    if (hostOf(u1) === hostOf(u2)) return m;
    fixed += 1;
    return `${head}[${title}](${bookUrl(u1)})`;
  });
  return { text: fixed ? src : String(text || ''), fixed };
}

// LAST-RESORT SOURCE LAST (feedback citation source order: the same passage in several sources → the best published first; Shoghi
// Effendi's *Uncompiled Published Letters* is the last resort). In a table cell listing several sources ("A; B; C"), a citation
// of the Uncompiled Published Letters moves to the end (battery 11-10 timeline: it led the 1844 row). Pure.
export const LAST_RESORT = /Uncompiled (?:Published )?Letters/i;
export function lastResortLast(text) {
  let fixed = 0;
  const out = String(text || '').split('\n').map((line) => {
    if (!/^\s*\|/.test(line) || !LAST_RESORT.test(line)) return line;
    return line.split('|').map((cell) => {
      const parts = cell.split(/;\s+/);
      if (parts.length < 2) return cell;
      const lead = parts.filter((x) => !LAST_RESORT.test(x)), last = parts.filter((x) => LAST_RESORT.test(x));
      if (!lead.length || !last.length || parts.indexOf(last[0]) > parts.indexOf(lead[lead.length - 1])) return cell;
      fixed += 1;
      const pad = /\s*$/.exec(cell)[0];
      return [...lead.map((x) => x.replace(/\s+$/, '')), ...last.map((x) => x.trim())].join('; ').replace(/^(?!\s)/, cell.match(/^\s*/)[0]) + pad;
    }).join('|');
  });
  return { text: fixed ? out.join('\n') : String(text || ''), fixed };
}

// THE SEARCH DENIAL — BLOCKING, ABSOLUTE (Chad 11-10: '"I cannot search from here" is never correct'). Anywhere in the reply, a
// sentence saying Anís can't search / look up / run a search goes; the rest of its paragraph stays. A denial that leads into the
// answer ("I can't run a literal search from here, but the book does speak of …") keeps what follows the "but". Blockquotes,
// tables and headings are never touched; quoted words never count; the reply is never emptied. Pure.
const BUT = /^(.*?),?\s+(?:but|however|though|although|still)\s*,?\s+(.+)$/is;
export const dropSearchDenial = (text) => dropSentences(text, isSearchDenial);
// THE DEFLECTION — BLOCKING, same rules as the denial: the sentence telling the reader to ask differently goes, the rest stays. Pure.
export const dropDeflection = (text) => dropSentences(text, isDeflection);
// THE BUT RULE: "X, but Y" with X the bad part keeps Y only as a whole sentence (never a capitalised fragment, 11-14 "Rather point to …").
// Y with its own subject ("but they do preserve …") stands alone; a bare predicate ("but rather point to …", "but do preserve …") takes X's
// subject when X is "<subject> <negated verb> …" ("The texts I can search here point to …"); anything else is a fragment → null.
// cut = the words taken out of the sentence (declared to keepsWords, which allows a mid-sentence cut only when named). Pure.
const PRONOUN = /^(?:I|it|they|he|she|we|you|there|this|that|these|those)\b/i;
const DETERMINER = /^(?:a|an|the|his|her|its|their|our|my|your|some|any|no|one|each|every|both|all|many|few|several|such)\b/i;
const NEGATED = /^(.+?)\s+(?:(?:do|does|did|can|could|will|would|should|may|might|must|have|has|had|is|are|was|were)\s+not|(?:do|does|did|ca|could|wo|would|should|must|have|has|had|is|are|was|were)n['’]t|cannot)\b/i;
export function butKeeps(sentence, bad) {
  const x = String(sentence || ''), b = x.match(BUT);
  if (!b || !bad(b[1]) || bad(b[2])) return null;
  const y = b[2], at = x.length - y.length, lead = y.match(/^(?:rather|instead)\s*,?\s+/i)?.[0] || '', r = y.slice(lead.length);
  const first = r.replace(/^[*_\[“"‘'(]+/, '');
  if (!lead && (PRONOUN.test(first) || DETERMINER.test(first) || /^\p{Lu}/u.test(first))) return { text: `${y.charAt(0).toUpperCase()}${y.slice(1)}`, cut: [] };
  if (lead && PRONOUN.test(first) && !/^(?:this|that|these|those)\b/i.test(first)) return { text: `${r.charAt(0).toUpperCase()}${r.slice(1)}`, cut: [x.slice(0, at + lead.length).trim()] };
  if (!/^\p{Ll}/u.test(first) || DETERMINER.test(first) || PRONOUN.test(first)) return null;
  const n = b[1].match(NEGATED), subj = n?.[1]?.trim();
  if (!subj || /[,;:]|\b(?:and|but|or)\b/i.test(subj) || subj.length > 120) return null;
  const from = x.indexOf(subj) + subj.length;
  return { text: `${x.slice(0, from)} ${r}`, cut: [x.slice(from, at + lead.length).trim()] };
}
function dropSentences(text, bad, { fragment = 'drop' } = {}) {
  const src = String(text || '');
  if (!bad(src.split('\n').filter((l) => !/^\s*(?:>|\||#)/.test(l)).join('\n'))) return { text: src, dropped: 0 };
  let dropped = 0;
  const cuts = [];
  const lines = src.split('\n').map((line) => {
    if (/^\s*(?:>|\||#)/.test(line) || !bad(line)) return line;
    const lead = (line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)?/) || [''])[0];
    const sents = sentencesOf(line.slice(lead.length));
    const kept = sents.map((x) => {
      if (!bad(x)) return x;
      const k = butKeeps(x.trim(), bad), b = x.trim().match(BUT);
      if (!k && fragment === 'keep' && b && bad(b[1]) && !bad(b[2])) return x;   // only a fragment would remain: the sentence stays whole
      dropped += 1;
      if (k) { cuts.push(...k.cut); return `${k.text}${/\s$/.test(x) ? ' ' : ''}`; }
      return '';
    }).join('').replace(/\s{2,}/g, ' ').trim();
    return kept ? `${lead}${kept}` : '';
  });
  const out = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return out ? { text: out, dropped, ...(cuts.length ? { cuts } : {}) } : { text: src, dropped: 0 };
}

// INTERNAL NARRATION — BLOCKING (11-14 round 4: "The candidate source here is a scholarly book…", "The glossary notes … look like the best
// source… I'll check them directly."). Talk about candidates, tools, held research or the agent's next step never reaches the reader: such a
// sentence is removed wherever it stands (outside blockquotes and tables). A reply that is ONLY narration comes back empty — the caller re-asks. Pure.
const NARRATION = /\b(?:held research|research_lookup|quotation_candidates|search_in_work|fused_search|tool (?:results?|calls?|output)|the (?:search|tool)s? (?:returned|found|gave|show)|candidate (?:sources?|passages?|works?)|the candidates?\b|(?:looks?|seems?) like the best source|best (?:candidate|lead)|\bsearch(?:ing|ed|es)? (?:inside|in|through|of) the (?:histories|library|works)\b|\bI (?:searched|looked|checked|tried)\b|\b(?:turns?|turned) up (?:no|nothing)\b|\bspellings? (?:searched|tried)\b)/i;   // search narration (round 7d, iqanr7)
const PLAN = /^\s*(?:i['’]ll|i will|i['’]m going to|let me(?! know)|next,? i|i need to|i should|i can now|i['’]d (?:need|have) to)\b[^.!?\n]{0,200}\b(?:check|look|search|verify|consult|find|read|confirm|pull|trace|open|examine|dig)\b/i;
// SELF-SOURCED DENIAL (Dawn-Breakers battery 11-14, dbp:004 — doc 21308 in the library): "The library does not give me Nabíl's own chapter … in
// a form I can quote" talks about the tools and is false; the sentence goes (the prompt has him search inside the work instead).
const LIBRARY_DENIAL = /\bthe library (?:does not|doesn['’]t|did not|didn['’]t|cannot|can['’]t) (?:give|show|offer|hand|let) me\b|\bin (?:a|any) form I can (?:quote|cite|use)\b/i;
// DELIVERY TALK (round 7d, Íqán turn 4: "I have no email address for you yet, so please send the one you would like this document delivered
// to."): the system turns the reply into a PDF and sends it, or asks for the address itself (pdf/documents.js) — the writer never speaks of it.
const DELIVERY = /\bI (?:have|hold|do not have|don['’]t have) (?:no |not )?(?:an? |your )?e-?mail address\b|\b(?:send|give|tell) me (?:the|an|your) (?:e-?mail )?address\b|\bthe one you would like\b[^.!?\n]{0,60}\b(?:sent|delivered|emailed)\b|\b(?:cannot|can['’]t|am unable to|am not able to) (?:send|e-?mail|deliver)\b|\bI(?:['’]ll| will) (?:e-?mail|send|deliver) (?:it|this|the (?:table|document|pdf)|you)\b/i;
// AN OFFER (round 7e, iqanr7d: "I can read it with you and prepare a side-by-side document … if you would like."): offers are the follow-up
// pills' job (Chad 11-12: minimal replies + follow-up pills), never a sentence of the reply. A request for what the system needs ("Please tell me
// where to send this document") is not an offer.
const OFFER = /\bI (?:can|could)\b[^.!?\n]{0,240}\b(?:if|should) you (?:would |'d |’d )?(?:like|wish|want|prefer)\b|^\s*(?:would you like|shall I|do you want me|should I)\b[^.!?\n]{0,240}\?\s*$|\bI(?:['’]d| would) be (?:glad|happy) to\b|\bI am happy to\b|\bI['’]m happy to\b/i;
export const isOffer = (s) => OFFER.test(String(s || '').replace(/[“"][^”"]{0,600}[”"]/g, ' '));
export const isNarration = (s) => { const t = String(s || '').replace(/[“"][^”"]{0,600}[”"]/g, ' '); return NARRATION.test(t) || PLAN.test(t) || LIBRARY_DENIAL.test(t) || DELIVERY.test(t.trim()) || OFFER.test(t); };
/** "the text I hold" / "the passages I have" (dbp:002 "**What is not settled by the text I hold**") → "these sources": the reader sees texts, not
 *  what Anís holds. Outside blockquotes. Pure. */
export const unholdTexts = (text) => String(text || '').split('\n').map((l) => (/^\s*>/.test(l) ? l
  : l.replace(/\b(?:the|these|my) (?:texts?|passages?|sources?|excerpts?|material) (?:I (?:hold|have(?: here)?|can see|was given|am holding)|in hand|available to me)\b/gi,
    (m, at, all) => (/(?:^|[.!?]["”’)*_]*\s+|\|\s*)$/.test(all.slice(0, at)) ? 'These sources' : 'these sources')))).join('\n');   // a sentence start stays capitalised (round 7e: "these sources do not say")

// LAYOUT AROUND CARDS (Dawn-Breakers battery 11-14, 6 of 10 replies). A LEAD-IN — a line whose last sentence ends in ":" ("Shoghi Effendi
// sets the scene:") — must be followed by what it introduces: a card (widget marker or template), a blockquote, a list or a table. When
// its card was dropped (a PDF page, a passage already carded, a ref not in hand) the lead-in goes too. `final`: a lead-in with nothing
// after it goes; otherwise it is left for the next piece (a streamed reply). → { text, dropped }. Pure.
const INTRODUCED = /^\s*(?:<!-- widget:|\{\{|>|\||[-*+]\s|\d+[.)]\s|#)/;
// the line's last sentence (sentences.js: "In vol. 2 He writes:" and a link's dotted URL stay one sentence), when it ends on a colon
const leadInOf = (line) => { const last = sentencesOf(line).at(-1) || ''; return /:[*_]*\s*$/.test(last) ? last : null; };
export const leadInAt = (line) => !/^\s*(?:>|\||#|<!--|\{\{|[-*+]\s|\d+[.)]\s)/.test(line) && line.trim().length <= 400 && !!leadInOf(line);
export function dropDanglingLeadIn(text, { final = true } = {}) {
  const lines = String(text || '').split('\n');
  let dropped = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!leadInAt(lines[i])) continue;
    let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
    if (j < lines.length ? INTRODUCED.test(lines[j]) : !final) continue;
    lines[i] = lines[i].slice(0, lines[i].length - leadInOf(lines[i]).length).trimEnd(); dropped++;
  }
  if (!dropped) return { text: String(text || ''), dropped };
  return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), dropped };
}
// A CUT-OFF SENTENCE: a sentence whose object vanished (a work ref with no work rendered to nothing — dbp:002 "Shoghi Effendi also quotes this
// testimony in.") ends on a preposition or article. The sentence goes. Outside blockquotes and tables. → { text, dropped }. Pure.
const CUT_OFF = /\b(?:in|of|from|by|with|at|into|the|an?|and)\s*[.!?]["”’)*_]*\s*$/i;
const OPEN_END = /\b(?:in|of|from|by|with|at|into|on|to|for|the|an?|and|or|rests? on)\s*$/i;   // "…every other row rests on a" then the table (iqanr7)
export function dropCutOff(text) {
  let dropped = 0;
  const out = String(text || '').split('\n').map((line) => {
    if (/^\s*(?:>|\|)/.test(line) || !line.trim()) return line;
    const sents = sentencesOf(line);
    const kept = sents.filter((x) => { const y = x.replace(/\[[^\]]*\]\([^)]*\)/g, 'LINK');
      return !(((/[.!?]["”’)*_]*\s*$/.test(x) && CUT_OFF.test(y)) || (!/[.!?…:;"”’)*_]\s*$/.test(x) && OPEN_END.test(y))) && ++dropped); });
    return kept.length === sents.length ? line : kept.join('').trimEnd();
  }).join('\n');
  return { text: dropped ? out.replace(/\n{3,}/g, '\n\n').trim() : String(text || ''), dropped };
}
// AN ABSENCE CLAIM about a person ("the library gives no account of him", "not identified in the library") — allowed only after a search
// INSIDE the histories on that name came back empty (history-sweep.js; Dawn-Breakers battery 11-14: Basṭámí's vision is in 21308, yet
// "no account"). → the claim sentences (outside blockquotes), each with the plain words it names. Pure.
const ABSENCE = /\b(?:the library (?:holds|has|gives|contains|offers|provides) (?:nothing|no (?:account|passage|record|mention|information|description))|(?:not|never|remains? un) ?identified in the library|the library does not (?:identify|name|record|describe) (?:him|her|them|this)|nothing in the library (?:on|about|identifies|describes)|no (?:account|passage|record|mention) (?:of|on|about) (?:him|her|them|this (?:man|woman|person))\b[^.!?\n]*\bin the library)/i;
export const absenceClaims = (text) => String(text || '').split('\n').filter((l) => !/^\s*>/.test(l))
  .flatMap((l) => sentencesOf(l)).filter((x) => ABSENCE.test(x)).map((x) => x.trim());
const plain = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/[’'ʻʿʼ`‘]/g, '').toLowerCase();
/** The claims no empty sweep backs: a claim is backed when it names a word (≥4 letters) of a name whose sweep found nothing. Pure. */
export const unbackedAbsence = (text, sweeps = []) => {
  const empty = sweeps.filter((s) => !s.n).flatMap((s) => s.variants.flatMap((v) => plain(v).split(/[^\p{L}]+/u))).filter((w) => w.length >= 4 && !/^(?:mulla|mirza|hajji?|siyyid|shaykh|aqa)$/.test(w));
  return absenceClaims(text).filter((c) => { const t = plain(c); return !empty.some((w) => t.includes(w)); });
};
// A CONTENT ABSENCE or a source narration (11-14 Taherzadeh "volume 1, which the library does not appear to hold" — it holds all four;
// round 3: "these sources show no…", "I found no sentence in the Will…", "I have not searched for…"): allowed only after a search
// INSIDE the work came back empty, and even then said as what the text does not say, never as what was found or searched. → the
// sentences (outside blockquotes). Pure.
const CONTENT_ABSENCE = /\b(?:(?:the )?library (?:does not|doesn[’']t|did not) (?:appear to |seem to )?(?:hold|have|carry|contain|include)|(?:which|that) the library (?:does not|doesn[’']t) (?:appear to |seem to )?(?:hold|have|carry|contain)|(?:holds?|has|carries) [^.!?\n]{0,60}\bonly as (?:opening|first|sample) pages|holds? only (?:the )?(?:volumes?|vol\b|opening|first|sample|parts? of)|I (?:also |still )?(?:could not|couldn[’']t|cannot|can[’']t|did not|didn[’']t) find (?:a|one|any) (?:passage|text|source|place|line|sentence|statement)\b|(?:these|the|my|those) (?:sources|passages|texts|results|searches) (?:show|give|contain|hold|turn up|have) (?:no|nothing)\b|I (?:also |still |simply |only )?(?:found|find|could find|have found|did not find|didn[’']t find|could not find|couldn[’']t find|cannot find|can[’']t find) (?:no|nothing|any)\b|I (?:also |still )?have(?: not|n[’']t) (?:yet )?(?:searched|looked|checked|found)\b|(?:is|are) not (?:in|held in) the library\b)/i;
export const contentAbsence = (text) => String(text || '').split('\n').filter((l) => !/^\s*>/.test(l))
  .flatMap((l) => sentencesOf(l)).map((x) => x.trim()).filter((x) => CONTENT_ABSENCE.test(x.replace(/[“"][^”"]{0,600}[”"]/g, ' ')));
/** Did a search INSIDE a work come back empty this turn? (an absence may then be said — as what the text does not say). Pure. */
export const emptyInWork = (steps = []) => steps.some((s) => !s.deferred && /^(?:search_in_work|extract_from_work)$/.test(s.tool) && !s.found);
// A CONFLICT CLAIM (11-14 Taherzadeh: "The two accounts differ … I leave the point open" — the letter's "Arab believer in Baghdád" and
// Taherzadeh's Aḥmad of Yazd are one man: Aḥmad lived in Baghdád for years, vol. 2 ch. 5; the Persian Tablet of Aḥmad is a second tablet,
// for Ḥájí Mírzá Aḥmad of Káshán). A dispute between sources is stated only after both passages are checked to speak of the same thing.
// → the claim sentences (outside blockquotes). Pure.
const CONFLICT = /\b(?:(?:the )?(?:two|these|both|the) (?:accounts|sources|passages|texts|readings|versions|statements) (?:differ|disagree|conflict|contradict)|(?:differs?|disagrees?) (?:from|with) [^.!?\n]{0,60}\b(?:account|words|statement|view)|\b(?:account|letter|passage|text|source|statement|version|record)s? (?:contradicts?|conflicts? with)\b|a different (?:man|person|woman|figure) from\b|(?:leave|leaves|leaving) (?:the|this|that|it) (?:(?:point|question|matter) )?open|(?:would|will|do) not treat (?:it|this) as (?:resolved|settled)|(?:nothing|no passage|find (?:a|any) passage) [^.!?\n]{0,40}\b(?:reconciles|settles|resolves) (?:them|this|it|how|whether|the))/i;
export const conflictClaims = (text) => String(text || '').split('\n').filter((l) => !/^\s*>/.test(l))
  .flatMap((l) => sentencesOf(l)).map((x) => x.trim()).filter((x) => CONFLICT.test(x.replace(/[“"][^”"]{0,600}[”"]/g, ' ')));
/** A paragraph that opens on a pronoun whose person is named only later ("There he names…" with Taherzadeh first named after it —
 *  11-14: a reorder moved his book's paragraph below the letter's). → the opening lines. Pure. */
export function danglingOpens(text) {
  const paras = String(text || '').split(/\n\s*\n/), out = [];
  paras.forEach((p, i) => {
    const t = p.trim(); if (!t || /^\s*(?:>|\||#|[-*] )/.test(t)) return;
    if (/^(?:There|Here|In it|In that (?:book|work|volume)|Elsewhere),? (?:he|she|they)\b/.test(t) || (i === 0 && /^(?:He|She|They) (?:names|writes|says|states|adds|calls|describes)\b/.test(t))) out.push(t.slice(0, 80));
  });
  return out;
}
/** The question names this passage's writer or work (surname / a title word run) — "What does Taherzadeh say…" → his book leads,
 *  whatever its tier. Pure. */
export function askedSource(question, p) {
  const q = plain(question), names = [p?.author, p?.book_author].filter(Boolean).flatMap((a) => plain(a).split(/[^\p{L}]+/u)).filter((w) => w.length >= 5 && !/^(?:abdul|bahaullah|shoghi|effendi|compilation|bahai|writings)$/.test(w));
  const title = plain(p?.title || p?.work || '').replace(/\b(?:vol(?:ume)?|v)\b.*$/, '').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return names.some((w) => new RegExp(`\\b${w}\\b`, 'u').test(q)) || (title.length >= 12 && q.replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').includes(title));
}
export function dropNarration(text) {
  let dropped = 0;
  const out = String(text || '').split('\n').map((line) => {
    if (/^\s*(?:>|\|)/.test(line) || !line.trim()) return line;
    const sents = sentencesOf(line);
    const kept = sents.filter((x) => !(isNarration(x) && ++dropped));
    return kept.length === sents.length ? line : kept.join('').trimEnd();
  }).join('\n').replace(/\n{3,}/g, '\n\n');
  return { text: dropped ? out.trim() : String(text || ''), dropped };
}
/** The reply's last sentence is a plan ("I'll check them directly.") — an unfinished answer. Pure. */
export const endsOnPlan = (text) => { const t = String(text || '').trim(); const last = sentencesOf(t.split('\n').at(-1)).at(-1) || ''; return !!last.trim() && PLAN.test(last); };

/** CIRCULAR EVIDENCE (Chad 11-14, conversation 73b1d410: "fail"). In an identification table ("who was each of them"), a row whose
 *  only citation is the very text being explained — the list that names them, here the Kitáb-i-Íqán — gives no evidence of who
 *  the person was. The list = a cited passage of a work the reader's question names that itself names ≥2 of the table's people.
 *  → the names of those rows (the agent then searches the histories for them). Pure. passages: [[ref, passage]] or a Map. */
const foldL = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[‘’'`ʼʻ]/g, '').toLowerCase();
const COMMON_NAME = new Set(['mulla', 'siyyid', 'sayyid', 'haji', 'hajji', 'mirza', 'shaykh', 'muhammad', 'ali', 'husayn', 'hasan', 'aqa', 'khan', 'abdul', 'the', 'and', 'of']);
const TITLE_STOP = new Set(['kitab', 'the', 'writings', 'from', 'with', 'tablet', 'book', 'selections', 'gleanings', 'lawh', 'suriy', 'baha', 'bahaullah', 'abdul', 'abdulbaha']);
const nameKeys = (name) => foldL(name).split(/[\s\-–—,()]+/).filter((w) => w.length >= 4 && !COMMON_NAME.has(w));
export function circularRows(text, passages = [], question = '') {
  const map = passages instanceof Map ? passages : new Map(passages);
  const q = foldL(question);
  const lines = String(text || '').split('\n'), sep = (l) => /^\s*\|[\s:|-]+\|?\s*$/.test(l || '');
  const rows = lines.filter((l, i) => /^\s*\|/.test(l) && !sep(l) && !sep(lines[i + 1])).map((l) => {
    const cells = l.split('|').slice(1, -1).map((c) => c.trim());
    const name = cells.find((c) => /\p{L}{3}/u.test(c) && !/\[\[?[PW]\d/.test(c)) || '';
    const refs = [...l.matchAll(/\[\[?([PW]\d+(?:\s*[,;]\s*[PW]\d+)*)\]\]?/g)].flatMap((m) => m[1].split(/\s*[,;]\s*/)).filter((r) => map.has(r));
    return { name, keys: nameKeys(name), refs: [...new Set(refs)] };
  }).filter((r) => r.keys.length);
  if (rows.length < 2) return [];
  const names = (p) => rows.filter((r) => r.keys.some((k) => foldL(p?.text).includes(k))).length;
  const named = (p) => foldL(p?.title).split(/[^a-z]+/).filter((w) => w.length >= 4 && !TITLE_STOP.has(w)).some((w) => q.includes(w));
  const lists = new Set([...map].filter(([, p]) => named(p) && names(p) >= 2).map(([r]) => r));
  if (!lists.size) return [];
  return rows.filter((r) => r.refs.length && r.refs.every((x) => lists.has(x))).map((r) => r.name);
}

// A REBUILT TABLE KEEPS EVERY ROW (round 6, 11-14 Íqán thread: "email me the final table" dropped row 2 (Vaḥíd) and moved his Nayríz facts into
// row 1). numberedRows: the LAST markdown table in a text whose first column numbers its rows (≥2 rows) → [{ n, name, text }]. Pure.
const stripLinks = (s) => String(s || '').replace(/\]\([^)]*\)/g, ']').replace(/https?:\/\/\S+/g, '');
const nameKey = (c) => foldL(String(c || '').replace(/\*\*|__/g, '').replace(/\([^)]*\)/g, '')).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function numberedRows(text) {
  const lines = String(text || '').split('\n'), sep = (l) => /^\s*\|[\s:|-]+\|?\s*$/.test(l || '');
  let best = null, cur = [];
  const close = () => { if (cur.length >= 2) best = cur; cur = []; };
  for (const l of lines) {
    if (!/^\s*\|/.test(l)) { close(); continue; }
    if (sep(l)) continue;
    const cells = l.split('|').slice(1, -1).map((c) => c.trim());
    const m = /^(\d{1,3})\.?\s*[†‡*✝]*$/.exec(cells[0] || ''), n = m ? Number(m[1]) : null;   // "11 †": a marked row is still row 11 (Íqán r6 t4)
    if (n != null) cur.push({ n, name: cells[1] || '', text: stripLinks(cells.slice(1).join(' ')) });
  }
  close();
  return best || [];
}
/** source table text, rebuilt table text → null (same rows) | { missing, added, renamed, moved } — every row's number and person kept, no facts
 *  moved between rows (≥2 words found only in another source row, new to this one). */
export function tableDrift(sourceText, rebuiltText) {
  const src = numberedRows(sourceText), out = numberedRows(rebuiltText);
  if (src.length < 2 || out.length < 2) return null;
  const S = new Map(src.map((r) => [r.n, r])), O = new Map(out.map((r) => [r.n, r]));
  const missing = src.filter((r) => !O.has(r.n)).map((r) => ({ n: r.n, name: nameKey(r.name) }));
  const added = out.filter((r) => !S.has(r.n)).map((r) => r.n);
  const renamed = out.filter((r) => S.has(r.n) && nameKey(S.get(r.n).name) !== nameKey(r.name)).map((r) => ({ n: r.n, was: nameKey(S.get(r.n).name), now: nameKey(r.name) }));
  const words = (s) => new Set(foldL(s).split(/[^\p{L}]+/u).filter((w) => w.length >= 5));
  const W = new Map(src.map((r) => [r.n, words(r.text)])), count = new Map();
  for (const ws of W.values()) for (const w of ws) count.set(w, (count.get(w) || 0) + 1);
  const moved = [];
  for (const r of out) {
    const own = W.get(r.n) || new Set(), now = words(r.text);
    for (const [j, ws] of W) {
      if (j === r.n) continue;
      const took = [...ws].filter((w) => count.get(w) === 1 && now.has(w) && !own.has(w));
      if (took.length >= 2) moved.push({ n: r.n, from: j, words: took.slice(0, 4) });
    }
  }
  return missing.length || added.length || renamed.length || moved.length ? { missing, added, renamed, moved } : null;
}

// A READER'S CORRECTION LEFT OPEN (Íqán r6 t4, 11-14): the reader names a row ("#11 is the brother of Mullá Mihdíy-i-Kandí") and the
// rewritten row still offers both readings ("The sources disagree… Reading A… Reading B"). → the row numbers the reader's last message
// names whose row in the reply still hedges between readings. Pure.
const OPEN_READINGS = /\b(?:sources? (?:disagree|split|differ)|reading a\b[\s\S]*\breading b\b|two readings|identification (?:is )?(?:unsettled|uncertain|disputed))/i;
export const correctedRows = (readerText) => [...new Set([...String(readerText || '').matchAll(/(?:#|\b(?:row|number|no\.?|item|entry)\s*#?\s*)(\d{1,3})\b/gi)].map((m) => Number(m[1])))];
export function unappliedCorrection(readerText, reply) {
  const named = correctedRows(readerText);
  if (!named.length || !/\b(?:is|was|are|were|means?|should be|not|isn'?t|wasn'?t)\b/i.test(String(readerText))) return [];
  const rows = new Map(numberedRows(reply).map((r) => [r.n, r]));
  return named.filter((n) => rows.has(n) && OPEN_READINGS.test(rows.get(n).text));
}

/** "(searched: X, Y, Z)" in a table cell or line — search narration (round 7d, iqanr7 row 5) → gone. Pure. */
export const dropSearchedNote = (text) => String(text || '').replace(/\s*\((?:searched|spellings? (?:searched|tried)|tried)\s*:[^()\n]*\)/gi, '');

/** A REBUILT TABLE OPENS WITH THE TABLE (round 7d, Íqán turn 4 "email me the final table": "Here is the whole table again. Each row carries
 *  only its own facts. This restores … because I added it to rows 4, 7 and 10 … The searches added only one thing: …"). When the reply
 *  rewrites the conversation's table (≥2 numbered rows here, a numbered table before), the prose ahead of its first heading or table line
 *  loses every sentence about the editing — the table, rows, searches, what I did — and keeps any sentence of substance. Pure. */
const REBUILD_META = /\b(?:I|I['’](?:ve|ll|d)|my|me)\b|\b(?:the|this|your|whole|full|final|corrected|revised) table\b|\brows?\s+\d|\b(?:each|every) row\b|\bsearch(?:es|ed|ing)?\b|^\s*(?:here(?:['’]s| is| are)|this (?:restores|keeps|adds|corrects|version))\b|\b(?:now )?stands as\b/i;
export const isRebuildMeta = (s) => REBUILD_META.test(String(s || '').replace(/[“"][^”"]{0,600}[”"]/g, ' '));
export function dropRebuildPreamble(text) {
  const t = String(text || ''), lines = t.split('\n');
  const at = lines.findIndex((l) => /^\s*(?:#{1,6}\s|\|)/.test(l));
  if (at <= 0) return { text: t, dropped: 0 };
  let dropped = 0;
  const head = lines.slice(0, at).map((line) => {
    if (!line.trim() || /^\s*>/.test(line)) return line;
    const sents = sentencesOf(line);
    const kept = sents.filter((x) => !((REBUILD_META.test(x.replace(/[“"][^”"]{0,600}[”"]/g, ' ')) || isNarration(x)) && ++dropped));
    return kept.join('').trimEnd();
  });
  if (!dropped) return { text: t, dropped: 0 };
  return { text: [...head, ...lines.slice(at)].join('\n').replace(/^\s+/, '').replace(/\n{3,}/g, '\n\n'), dropped };
}
/** The reply rewrites the conversation's table: it has ≥2 numbered rows and an earlier reply had a numbered table. */
export const rebuildsTable = (messages = [], text = '') => numberedRows(text).length >= 2 && messages.some((m) => m.role === 'assistant' && numberedRows(typeof m.content === 'string' ? m.content : '').length >= 2);

// ── ROUND 7e (live replays srcr7d, iqanr7d, Íqán t4, presume-baseline) ──
const NUMW = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const NUM = String.raw`(\d{1,3}|${NUMW.slice(3).join('|')}|twenty[- ](?:one|two|three|four|five|six|seven|eight|nine)|thirty)`;
const numVal = (w) => { const x = String(w).toLowerCase(); if (/^\d+$/.test(x)) return Number(x); const i = NUMW.indexOf(x); if (i >= 0) return i; const m = /^twenty[- ](\w+)$/.exec(x); return m ? 20 + NUMW.indexOf(m[1]) : x === 'thirty' ? 30 : null; };
const numWord = (n, like) => { const w = n <= 20 ? NUMW[n] : String(n); return /^\d/.test(like) ? String(n) : /^[A-Z]/.test(like) ? w[0].toUpperCase() + w.slice(1) : w; };
const COUNT_VERB = new RegExp(String.raw`\b(names|lists|mentions|records|counts|gives)\s+${NUM}(\s+of\s+them)?\b`, 'gi');
const OF_THE = new RegExp(String.raw`\bof the ${NUM}\b(\s+(?=[a-z]))?`, 'gi');
const ROWS_META = new RegExp(String.raw`\b${NUM}\s+rows?\b|\brows?\s+(?:in all|in total)\b`, 'i');
/** COUNT ONCE, FROM THE ROWS (round 7e, iqanr7d: "The Íqán names fourteen of them", 13 rows, "which gives thirteen rows"). In prose (never in a
 *  table, list or blockquote): a sentence counting the table's rows goes; "names N (of them)" takes the rendered row count `n`; "of the N" → "of
 *  them". n = null (the table not yet written, streamed): the number leaves the claim ("names them") — it is never stated before it is known.
 *  Counts under three are left alone ("two of them"). Pure. */
export function fixCounts(text, n = null) {
  let changed = 0;
  const out = String(text || '').split('\n').map((line) => {
    if (/^\s*(?:>|\||[-*+]\s|\d+[.)]\s)/.test(line) || !line.trim()) return line;
    const sents = sentencesOf(line);
    const before = changed;
    const kept = sents.filter((x) => !(ROWS_META.test(x.replace(/\([^)]*\)/g, ' ')) && ++changed)).map((x) => x
      .replace(COUNT_VERB, (m, verb, num, them) => { const v = numVal(num); if (v == null || v < 3 || v === n) return m; changed++; return n ? `${verb} ${numWord(n, num)}${them || ''}` : `${verb} ${them ? 'them' : 'the'}`; })
      .replace(OF_THE, (m, num, noun) => { const v = numVal(num); if (v == null || v < 3 || v === n) return m; changed++; return noun ? 'of these ' : 'of them'; }));
    return changed === before ? line : kept.join('').trimEnd();
  }).join('\n');
  return { text: changed ? out.replace(/\n{3,}/g, '\n\n') : String(text || ''), changed };
}
/** A table, list or reply expected to carry a numbered table (the question asks for one, or the conversation has one). */
export const wantsTable = (asked = '', priorTable = false) => priorTable || /\b(?:table|chart|list|tabulate)\b/i.test(String(asked));

// SPECULATION ABOUT A SOURCE'S ERROR (round 7e, iqanr7d row 8: "…, so the glossary may have mixed up the two."): when the sources do not separate
// two people, the reply says so in a clause and stops; a guess at how a source went wrong goes — the clause, or its whole sentence. Pure.
const SPEC_VERB = String.raw`(?:may|might|could|must|probably|likely|perhaps|possibly)(?:\s+well)?(?:\s+have)?\s+(?:mixed\s+up|confused|conflated|merged|misattributed|mistaken|misread|garbled|muddled|swapped)`;
const SPEC_CLAUSE = new RegExp(String.raw`,?\s*(?:so|and|which (?:suggests|means)|suggesting(?: that)?|perhaps because)\s+(?:the|this|that|its|their)\s+[^.!?|]{0,60}?\b${SPEC_VERB}\b[^.!?|]*`, 'gi');
const SPEC_SENT = new RegExp(String.raw`\b${SPEC_VERB}\b`, 'i');
export function dropSourceSpeculation(text) {
  let dropped = 0;
  const out = String(text || '').split('\n').map((line) => {
    if (/^\s*>/.test(line) || !SPEC_SENT.test(line)) return line;
    const cut = line.replace(SPEC_CLAUSE, () => { dropped++; return ''; });
    if (!SPEC_SENT.test(cut)) return cut;
    return cut.split(/(?<=\|)/).map((cell) => { const bar = cell.endsWith('|') ? '|' : '', sents = sentencesOf(bar ? cell.slice(0, -1) : cell);
      return sents.filter((x) => !(SPEC_SENT.test(x.replace(/[“"][^”"]{0,600}[”"]/g, ' ')) && ++dropped)).join('') + bar; }).join('');
  });
  return { text: dropped ? out.join('\n') : String(text || ''), dropped };
}

/** ORPHANED LINK PIECES (round 7e, Íqán t4: `…of God." 585))` — a sentence drop split a link at the dots inside its URL): what a removed
 *  link leaves behind — a "](" fragment, a token closing two or more parentheses that never opened — goes; whole links stay. Pure. */
export function dropLinkDebris(text) {
  let fixed = 0;
  const out = String(text || '').split('\n').map((line) => {
    if (!/\)\)|\]\(/.test(line)) return line;
    const keep = [];
    let t = line.replace(/\[[^\]\n]*\]\((?:[^()\s]|\([^()\s]*\))*\)/g, (m) => { keep.push(m); return `\u0000${keep.length - 1}\u0000`; });
    t = t.replace(/\s*[^\s()\u0000]*\]\([^\s\u0000]*/g, () => { fixed++; return ''; })
      .replace(/(^|\s)[^\s(\u0000]*\){2,}(?=[.,;:]?(?:\s|$))/g, (m, sp) => { if ((t.match(/\(/g) || []).length >= (t.match(/\)/g) || []).length) return m; fixed++; return sp; });
    return t.replace(/\u0000(\d+)\u0000/g, (m, i) => keep[Number(i)]).replace(/\s+([.,;:])/g, '$1').replace(/ {2,}/g, ' ').trimEnd();
  });
  return { text: fixed ? out.join('\n') : String(text || ''), fixed };
}

/** ONE DESCRIPTION, TWO ROWS (round 7e, Íqán t4: row 6 Mullá Mihdíy-i-Khu'í, from the glossary, and row 8 Mullá Mihdíy-i-Kandí, from Nabíl, both
 *  "a close companion of Bahá'u'lláh and teacher/tutor to the children of His household"). Two rows sharing a description is a contradiction the
 *  reply names: the glossary row says its description matches the other's and its identity is unconfirmed; when the glossary row came first
 *  (already shown, streamed), the later row says so. A row that already names the other man is left alone. Stateful per reply: rows in order. */
const rowWords = (cell) => foldL(String(cell || '').replace(/\[[^\]]*\]\([^)]*\)/g, ' ').replace(/https?:\/\/\S+/g, ' ')).match(/[\p{L}\p{N}]+/gu) || [];
const grams = (ws, k = 5) => { const g = new Set(); for (let i = 0; i + k <= ws.length; i++) { const x = ws.slice(i, i + k); if (x.filter((w) => w.length >= 4).length >= 3) g.add(x.join(' ')); } return g; };
const GLOSSARY = /glossar|libro de certeza/i;
const CLAIM = /\s*The glossary's description of him matches (?:the one the sources give for [^()|]+? \(row \d+\)|another man's in these sources), so his identity is unconfirmed\.\s*/;
export function duplicateRows() {
  const seen = [];
  return (line) => {
    if (!/^\s*\|/.test(line) || /^\s*\|[\s:|-]+\|?\s*$/.test(line)) return line;
    const cells = line.split('|');
    if (cells.length < 5 || !/^\s*\d{1,3}\b/.test(cells[1] || '')) return line;
    const n = Number(/\d+/.exec(cells[1])[0]), name = cells[2].trim().replace(/\*\*/g, ''), src = cells.slice(4).join('|');
    // round 8 (t4): the model copies this rule's sentence from an earlier turn with a stale row ("…for Mullá Báqir (row 11)"); it is never
    // trusted, the rule re-derives it from the rows themselves
    const claimed = CLAIM.test(cells[3]), who = claimed ? ` ${cells[3].replace(new RegExp(CLAIM.source, 'g'), ' ').trim()} ` : cells[3];
    if (claimed) cells[3] = who;
    const me = { n, name, keys: nameKeys(name), g: grams(rowWords(who)), gloss: GLOSSARY.test(src) && !/Dawn-Breakers|Nabíl|Nabil/i.test(src) };
    // the row it shares the MOST with (round 8: Kandí's row 10 shares the whole description, Báqir's row 11 one phrase)
    const shared = (o) => [...me.g].filter((x) => o.g.has(x)).length;
    const other = seen.filter((o) => o.keys.join(' ') !== me.keys.join(' ') && shared(o) > 0).sort((a, b) => shared(b) - shared(a))[0];
    seen.push(me);
    if (!other) return claimed && me.gloss ? `${cells.slice(0, 3).join('|')}| The glossary's description of him matches another man's in these sources, so his identity is unconfirmed. ${who.trim()} |${cells.slice(4).join('|')}` : claimed ? cells.join('|') : line;
    const named = (o, cell) => o.keys.length && o.keys.every((k) => foldL(cell).includes(k));
    if (named(other, who)) return line;
    if (me.gloss && !other.gloss) {   // this row rests on the glossary: its copied description goes, the contradiction stands in its place
      const sents = sentencesOf(who.trim()).reduce((a, x) => { if (/^\(/.test(x) && a.length) a[a.length - 1] += x; else a.push(x); return a; }, []);   // "(row 4)" stays with its sentence
      const rest = sents.filter((x) => ![...grams(rowWords(x))].some((g) => other.g.has(g))).join('').trim();
      cells[3] = ` The glossary's description of him matches the one the sources give for ${other.name} (row ${other.n}), so his identity is unconfirmed.${rest ? ` ${rest}` : ''} `;
      return cells.join('|');
    }
    const note = other.gloss ? `The glossary gives ${other.name} (row ${other.n}) this same description, so ${other.name}'s identity is unconfirmed.`
      : `${other.name} (row ${other.n}) carries the same description; the sources do not separate the two.`;
    cells[3] = ` ${who.trim().replace(/\s*$/, '')} ${note} `;
    return cells.join('|');
  };
}
/** The whole reply (not streamed): the note goes on the glossary row wherever it stands — rows read in order, or in reverse when the glossary row came first. */
export const noteDuplicateRows = (text) => { const lines = String(text || '').split('\n'), fwd = lines.map(duplicateRows());
  if (!fwd.some((l, i) => l !== lines[i] && /this same description/.test(l))) return fwd.join('\n');
  const g = duplicateRows(); return [...lines].reverse().map(g).reverse().join('\n'); };

/** A sentence start in a table cell or prose left lowercase by a drop before it (round 7e: "…roll ([…](…)). these sources do not say") → capitalised.
 *  Only after a full stop that ends a sentence (not "e.g.", "cf.", "p.", "vol.", an initial). Pure. */
export const recapitalise = (text) => String(text || '').split('\n').map((l) => (/^\s*>/.test(l) ? l
  : l.replace(/(^|\|\s+|(?<!\b(?:e\.g|i\.e|cf|p|pp|vol|ca|c|no|nos|ed|eds|tr|St|Mr|Mrs|Dr|[A-Z]))[.!?]["”’)*_]*\s+)(these|this|the|they|there|it|he|she|his|her|nothing|no|none|both|neither)\b/g,
    (m, pre, w) => (pre.startsWith('|') && !/^\|\s+$/.test(pre) ? m : pre + w[0].toUpperCase() + w.slice(1))))).join('\n');

/** "…in the passage quoted above." with nothing above (round 7e, srcr7d: the card never came) → the pointer goes; the sentence stays. The caller
 *  calls this only when no card or blockquote precedes. Pure. */
const ABOVE = /,?\s*(?:in|from|as|see)\s+(?:the|this)\s+(?:passage|words|quotation|text|card|lines?)\s+(?:quoted|shown|cited|given|set out)\s+above\b|\s*\((?:quoted|shown|see) above\)|,?\s*(?:quoted|shown|cited) above\b/gi;
export const pointsAbove = (text) => { ABOVE.lastIndex = 0; const r = ABOVE.test(String(text || '')); ABOVE.lastIndex = 0; return r; };
export const dropAbovePointer = (text) => String(text || '').replace(ABOVE, '').replace(/\s+([.,;:])/g, '$1');

/** A link to a bare site root is no place (r8 t4: "([Revelation](https://oceanlibrary.com/))", "[Tablet, provisional
 *  translation](https://oceanlibrary.com/)"): the label stands, and "([label])" with nothing else in it goes whole. Pure. */
export const unlinkSiteRoots = (text) => String(text || '')
  .replace(/\s*\(\[([^\[\]\n]+)\]\(https?:\/\/[^\s/()]+\/?\)\)/g, (m, label, off, all) => (all.slice(Math.max(0, off - 120), off).includes(label.replace(/[*_]/g, '')) ? '' : ` (${label})`))
  .replace(/\[([^\[\]\n]+)\]\(https?:\/\/[^\s/()]+\/?\)/g, '$1');
