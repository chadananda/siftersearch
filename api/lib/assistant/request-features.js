// Request FEATURES decided by code before Jev sees a message (Chad 11-03: Jev is never trained — each decision gets the
// context it needs, deterministic first). The four fixes from the 11-02 labelling pass: a bare pasted passage is an
// exact-words request; "show me the original" is its own request (A7); a first message is never a follow-up; "in Hindi"
// is a parameter of the request, not its type. Consumed by search-plan.js (plan rules), triage.js, turn.js. Pure.
import { stripMarkup } from '../quote-detect.js';

export const LANGUAGES = {
  english: 'en', hindi: 'hi', urdu: 'ur', bengali: 'bn', bangla: 'bn', tamil: 'ta', telugu: 'te', kannada: 'kn', malayalam: 'ml',
  marathi: 'mr', gujarati: 'gu', punjabi: 'pa', nepali: 'ne', sinhala: 'si', persian: 'fa', farsi: 'fa', arabic: 'ar', turkish: 'tr',
  hebrew: 'he', greek: 'el', latin: 'la', sanskrit: 'sa', pali: 'pi', aramaic: 'arc', spanish: 'es', french: 'fr', german: 'de',
  italian: 'it', portuguese: 'pt', russian: 'ru', chinese: 'zh', mandarin: 'zh', japanese: 'ja', korean: 'ko', indonesian: 'id',
  malay: 'ms', swahili: 'sw', dutch: 'nl', polish: 'pl', romanian: 'ro', vietnamese: 'vi', thai: 'th', tagalog: 'tl', filipino: 'tl',
  amharic: 'am', hausa: 'ha', yoruba: 'yo', zulu: 'zu', burmese: 'my',
};
// the library's SOURCE scripts: "the Arabic of this verse" asks for the original; "agape in Greek" asks about the word itself
const SOURCE_LANGS = new Set(['arabic', 'persian', 'farsi', 'hebrew', 'greek', 'sanskrit', 'pali', 'latin', 'aramaic']);
const LANG = Object.keys(LANGUAGES).join('|');
const SRC = [...SOURCE_LANGS].join('|');

const words = (s) => (String(s || '').match(/\p{L}[\p{L}'’\-]*/gu) || []).length;
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const lastUserOf = (messages) => [...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '';
const saidBefore = (messages) => (messages || []).slice(0, -1).filter((m) => m.role === 'assistant').map((m) => String(m.content || ''));

/** No assistant reply before the latest message: a first message, which can never be a follow-up. Pure. */
export const isFirstMessage = (messages) => !(messages || []).slice(0, -1).some((m) => m.role === 'assistant');

// ── LANGUAGE AS A PARAMETER ────────────────────────────────────────────────────────────────────────────────────────────
// "dhammapada meaning in hindi", "bahai religion history in urdu", "explain the Íqán in Spanish": the language says how
// to ANSWER; the request is the rest. "written in Arabic", "revealed in Persian", "I am not good in English" name no
// answer language; "quran meaning in arabic" / "agape in Greek" ask about the SOURCE word (never stripped).
const NOT_ANSWER = /\b(?:good|fluent|weak|poor|bad|strong|comfortable|better|worse|skilled|proficient|written|available|published|revealed|composed|recited|spoken|originally|first|exist\w*|wrote|write|speak|speaks|spoke|says?|said|pray|prays|prayed|chant\w*|recite\w*|study|studied|taught|teach|teaches|course|class|classes|degree|school|university)\s+(?:enough\s+)?(?:only\s+|also\s+|mostly\s+)?$/i;
const ORIGINAL_BEFORE = /\b(?:the\s+)?(?:original|origional)\s+$/i;
const TAIL = String.raw`(?:\s+(?:language|please|pls|plz|pdf|text|version|translation|online|free|download|thank you|thanks|copy paste|with\s+(?:meaning|meanings|pictures|images|translation|explanation|hindi|english)|for\s+\w+))*`;
const LANG_TRAIL = new RegExp(`\\s+(?:in|into)\\s+(?:the\\s+)?(${LANG})(?:\\s+(?:(?:and|or|&)\\s+)?(?:the\\s+)?(${LANG}))?${TAIL}\\s*[.?!)]*(?:\\s*(?:thank you|thanks|please)\\s*[.!]*)?\\s*$`, 'i');
const LANG_VERB = new RegExp(`\\b(?:answer|reply|respond|explain|write|tell|say|put|give|summari[sz]e|describe|teach|translat\\w*)\\s+(?:[\\p{L}'’-]+\\s+){0,4}?(?:in|into|to)\\s+(?:the\\s+)?(${LANG})\\b`, 'iu');
const SOURCE_ASK = new RegExp(`\\b(?:mean\\w*|word|term|called|say|says|said|pronounc\\w*|spell\\w*|written|name)\\b[^.?!]{0,40}\\bin\\s+(?:the\\s+)?(${SRC})\\b`, 'i');
const NAMED_IN = new RegExp(`\\b(?:called|known as|named|titled|pronounced|spelled|spelt|means|meaning of|word for|term for)\\b[^.?!]{0,40}\\bin\\s+(?:the\\s+)?(${LANG})\\b`, 'i');

/** The language the person wants the ANSWER in, as a parameter → { lang, name, role: 'answer'|'source', stripped } or null.
 *  role 'source' = the language is the subject of the question (what a word means in Arabic), never stripped. Pure. */
export function answerLanguage(text) {
  const t = stripMarkup(text);
  if (!t) return null;
  const pick = (m, i = 1) => ({ name: m[i].toLowerCase(), lang: LANGUAGES[m[i].toLowerCase()] });
  const trail = t.match(LANG_TRAIL);
  if (trail) {
    const before = t.slice(0, trail.index);
    const { name, lang } = pick(trail);
    if (!NOT_ANSWER.test(before + ' ') && !ORIGINAL_BEFORE.test(before + ' ')) {
      if (NAMED_IN.test(t) && !/\bmeaning\s+in\b/i.test(t)) return { lang, name, role: 'source', stripped: t };
      if (SOURCE_LANGS.has(name) && !LANG_VERB.test(t)) return { lang, name, role: 'source', stripped: t };
      const extra = trail[2] ? ` (and ${trail[2].toLowerCase()})` : '';
      return { lang, name: name + extra, role: 'answer', stripped: (before.trim() || t).replace(/[\s,;:]+$/, '') };
    }
  }
  const verb = t.match(LANG_VERB);
  if (verb && !NOT_ANSWER.test(t.slice(0, verb.index + verb[0].length).replace(new RegExp(`\\s+(?:in|into|to)\\s+(?:the\\s+)?${verb[1]}$`, 'i'), ' '))) {
    const { name, lang } = pick(verb);
    if (SOURCE_LANGS.has(name) && SOURCE_ASK.test(t)) return { lang, name, role: 'source', stripped: t };
    return { lang, name, role: 'answer', stripped: t.replace(new RegExp(`\\s+(?:in|into|to)\\s+(?:the\\s+)?${name}\\b`, 'i'), '').trim() };
  }
  return null;
}

// ── THE ORIGINAL (A7) ──────────────────────────────────────────────────────────────────────────────────────────────────
// "Show me the Persian original of '…'", "the Arabic of this verse", "where can I read this in its original context",
// "is there an English translation of this tablet". Near misses: "Hebrew word for peace" (one word, A6), "best English
// translation of the Tao Te Ching" (choosing between translations, C4), "Persian eschatology" (a tradition, B1).
const ORIG = String.raw`(?:orig?inal|origional|orginal)`;
const ORIGINAL_ASK = new RegExp([
  String.raw`\b${ORIG}\s+(?:(?:${SRC})\s+)?(?:text|wording|words?|language|version|script|sentence|passage|verse|form|source text)\b`,
  String.raw`\b(?:${SRC})\s+(?:${ORIG}|text|wording|words|version|script)\b`,
  String.raw`\b(?:the|its|this|that|an?)\s+${ORIG}\s+(?:(?:${SRC})\s+)?(?:of|for|behind|is|was)\b`,
  String.raw`\bin\s+(?:its\s+|the\s+)?${ORIG}(?:\s+(?:${SRC}|language|text|context|form|wording|script))?\b`,
  String.raw`\bwhat\s+(?:is|are|was|were|'s)\s+the\s+(?:${ORIG}|arabic|persian|farsi)\b`,
  String.raw`\bthe\s+(?:${SRC})\s+(?:of|for)\s+(?:this|that|the|these|those|['"“‘«])`,
  String.raw`\b(?:read|see|show(?: me)?|give(?: me)?|have|want|find|get)\s+(?:this|that|it|the\s+\w+)\s+in\s+(?:${SRC})\b`,
  String.raw`\b(?:is there|do you have|where (?:can i|to) (?:find|read)|find|show(?: me)?|give(?: me)?|link(?: me)?)\b[^.?!]{0,40}\b(?:an?\s+|the\s+)?(?:\w+\s+)?translation\s+of\s+(?:this|that|these|those|the\s+(?:tablet|prayer|passage|verse|text|above|following)|['"“‘«])`,
].join('|'), 'i');
const NOT_ORIGINAL = new RegExp(String.raw`\b(?:words?|terms?|root|equivalent|name)\s+(?:for|of|meaning)\b|\b(?:${SRC})\s+(?:words?|terms?|roots?|equivalents?|names?|letters?|alphabet|grammar|canon|literature|poetry|history|culture|empire)\b|\b${ORIG}\s+(?:word|term|root)\b|\bhow\s+(?:do|can|to)\s+(?:i|you|one)?\s*(?:write|say|pronounce|spell)\b|\bcompare\b|\b(?:best|better|good|which|recommended|reliable|accurate|modern|readable|literal)\s+(?:\w+\s+)?translations?\b|\btranslations?\s+(?:compar|differ|vs)`, 'i');
const PASSAGE_REF = /\b(?:this|that|these|those|the following|the above|above|it|its)\b|\bbeginning\s+(?:with\s+)?|\bstarting\s+(?:with\s+)?|\bending\s+(?:with\s+)?|\bpassage\s+(?:about|on|where)\b/i;
const QUOTED = /["“„«]([^"“”„«»]{10,})["”»]|(?:^|[\s(])['‘]([^'’‘]{10,}?)['’](?=[\s.,;:!?)]|$)/;

/** Asks for the ORIGINAL-language text (or a translation) of a passage → { target: 'original'|'translation', language,
 *  passage } or null. passage = the message carries or points at the passage (quoted words, "this verse", a thread). Pure. */
export function originalRequest(text, { inThread = false } = {}) {
  const t = stripMarkup(text);
  if (!t || NOT_ORIGINAL.test(t) || !ORIGINAL_ASK.test(t)) return null;
  const lang = t.match(new RegExp(`\\b(${SRC})\\b`, 'i'))?.[1]?.toLowerCase() || null;
  const target = /\btranslation\s+of\b/i.test(t) && !new RegExp(`\\b${ORIG}\\b`, 'i').test(t) ? 'translation' : 'original';
  const q = t.match(QUOTED);
  const phrase = q ? (q[1] || q[2] || '').trim() : null;
  const passage = !!phrase || inThread || PASSAGE_REF.test(t) || words(t) >= 25;
  return { target, language: lang ? LANGUAGES[lang] : null, passage, phrase: phrase && words(phrase) >= 3 ? phrase : null };
}

// ── A PASTED PASSAGE ──────────────────────────────────────────────────────────────────────────────────────────────────
// A paragraph of scripture pasted in, alone or with a short ask ("where is this from?", "what does this mean?"), is
// wording to FIND first — the 11-02 labels filed 302 of them as teaching questions (B1/B2). A seeker's own long message
// ("I'm writing an essay… so what…") is not a passage: first-person talk, questions and asks mark it.
const SENT = /[^.!?\n]+(?:[.!?]+["”’'»)]*|$)/g;
const ASK_START = /^\s*(?:(?:please|pls|also|and|but|so|then|now|ok|okay|thanks?|thank you|hello|hi|hey|dear|anis|anís)[,.!:\s]+)*(?:what|who|whom|whose|where|when|why|how|which|is|are|was|were|do|does|did|can|could|would|should|will|shall|find|show|tell|give|explain|compare|list|cite|source|translate|identify|help|please|i|i'm|i’m|i've|i’ve|i'd|i’d|my|we|we're|our|you|your|anyone|does anyone|looking|trying|need|want|wondering|curious|locate|display|request|reflect|information|describe|discuss|identify|provide|quote|retrieve|search|look|wait|hmm|hm|well|actually|ok|so)\b/i;
const FIRST_PERSON = /\b(?:i'm|i’m|i am|i've|i’ve|i was|i have|i had|i need|i want|i wonder|i think|i read|i heard|i found|i came|my (?:grandmother|grandfather|mother|father|professor|teacher|mentor|class|friend|community|study|question|essay|paper|talk))\b|\b(?:can|could|would) you\b|\byou (?:said|wrote|quoted|cited|mentioned|gave|claimed|told|say|write)\b|\bhelp me\b|\bplease\b/i;
const ARCHAIC = /\b(?:thee|thou|thy|thine|hath|doth|dost|shalt|wilt|verily|unto|saith|wherefore|whosoever|whoso|hast|ye|lo!|behold)\b/i;
const VOCATIVE = /\bO\s+(?:son|daughter|thou|ye|people|friends?|my servants?|lord|god|king|concourse|maid|moving form|feet|ears|eyes|tongue|inmost heart|temple|my god|shaykh|\p{Lu})/u;
const DIVINE = /\b(?:Our|We|Us|His|Him|He|Me|My|Mine|Thee|Thou|Thy)\b.*\b(?:Our|We|Us|His|Him|He|Me|My|Mine|Thee|Thou|Thy)\b/;
const PASSAGE_SIGNAL = { test: (t) => ARCHAIC.test(t) || VOCATIVE.test(t) || DIVINE.test(t) || /\bSay:|\bblessed (?:is|are|be)\b/i.test(t) };
const SOURCE_ASK_RE = /\b(?:where|who (?:said|wrote|spoke)|whose words|source|from\??$|which (?:book|tablet|work|text|prayer|letter|writing)|find (?:this|it|the source)|is this (?:real|authentic|genuine|a real)|did \w+ (?:really )?(?:say|write)|citation|reference for)\b|\bfrom\s*\?/i;
const MEANING_ASK_RE = /\b(?:mean\w*|explain|interpret\w*|understand|signif\w*|saying|about|refer\w* to|what does|what is (?:this|the|he|she|it|being)|thoughts?)\b/i;

const askKind = (ask, inThread) => {
  if (!ask) return 'bare';
  if (originalRequest(ask, { inThread: true })) return 'original';
  if (SOURCE_ASK_RE.test(ask)) return 'source';
  if (MEANING_ASK_RE.test(ask)) return 'meaning';
  return 'other';
};
/** The first sentence or two of a passage, enough for a verbatim search (a 300-word phrase is not a query). */
const leadOf = (passage) => {
  const sents = passage.match(SENT)?.map((x) => x.trim()).filter(Boolean) || [passage];
  let out = '';
  for (const s of sents) { if (out && words(out) >= 8) break; out = `${out} ${s}`.trim(); if (words(out) >= 25) break; }
  const w = out.split(/\s+/);
  return w.length > 40 ? w.slice(0, 40).join(' ') : out;
};

/** A passage pasted into the message, with its ask if any → { phrase, passage, ask, kind: 'bare'|'source'|'meaning'|
 *  'original'|'other' } or null. `said` = the assistant's earlier replies (a passage quoted back from them is not a paste). Pure. */
export function pastedPassage(text, { said = [], inThread = false } = {}) {
  const t = stripMarkup(text).replace(/^\s*\(?\d{1,3}[.)]\s*/, '');
  const min = ARCHAIC.test(t) ? 7 : 12;
  if (words(t) < min) return null;
  const sents = t.match(SENT)?.map((x) => x.trim()).filter(Boolean) || [t];
  const asks = [], body = [];
  // an ask: a question, or a sentence opening like one — unless it reads as scripture ("We have time and again stated… unto His Majesty")
  const isAsk = (s) => words(s) <= 40 && (/\?/.test(s) || (ASK_START.test(s) && !ARCHAIC.test(s) && !/\b(?:Our|Us|Thee|Thy|Thou)\b/.test(s)));
  for (const s of sents) (isAsk(s) ? asks : body).push(s);
  const passage = body.join(' ').trim(), ask = asks.join(' ').trim() || null;
  if (words(passage) < min || words(ask) > 30) return null;
  if (FIRST_PERSON.test(passage) || /\?/.test(passage)) return null;
  if (!PASSAGE_SIGNAL.test(passage) && !(words(passage) >= 25 && !ask && /[.!]["”’'»)]*$/.test(passage))) return null;
  // the first words of the paste must not be the assistant's own earlier words
  const lead = fold(passage).split(' ').slice(0, 8).join(' ');
  if (said.length && lead && said.some((r) => fold(r).includes(lead))) return null;
  return { phrase: leadOf(passage), passage, ask, kind: askKind(ask, inThread) };
}

/** Every feature for a thread (last = the new message) → { first, language, original, pasted, text }. Pure. */
export function requestFeatures(messages) {
  const text = lastUserOf(messages), said = saidBefore(messages), first = isFirstMessage(messages);
  const language = answerLanguage(text);
  const original = originalRequest(text, { inThread: !first });
  const pasted = pastedPassage(text, { said, inThread: !first });
  return { first, language, original, pasted, text };
}
