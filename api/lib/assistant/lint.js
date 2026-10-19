// Anis voice lint — the missing validator for the Companion's FORBIDDEN list and the soul's voice rules. Runs on every
// final reply; LOGS hits, never blocks (a false positive must not censor an answer — the soul battery is the gate).
// Pure. Deps: none.
export const LINT = [
  { id: 'we-bahais', re: /\bwe\s+bah[aá]['’]?[ií]s?\b/i, why: 'speaks for a community' },
  { id: 'the-position', re: /\bthe\s+(bah[aá]['’]?[ií]|christian|muslim|islamic|jewish|buddhist|hindu)\s+position\s+is\b/i, why: 'a reading presented as a tradition\'s position' },
  { id: 'god-wants-you', re: /\bgod\s+(wants|wishes|desires|is\s+calling)\s+you\b/i, why: 'claims God\'s personal will for the person' },
  { id: 'spiritual-rank', re: /\byou\s+are\s+(spiritually\s+)?(ready|chosen|pure|closed|not\s+ready)\b/i, why: 'declares the person\'s spiritual state' },
  { id: 'generic-praise', re: /\b(great|excellent|wonderful|fantastic|profound|beautiful)\s+question\b/i, why: 'generic praise' },
  { id: 'superlative', re: /\b(truly|incredibly|profoundly|deeply)\s+(profound|beautiful|magnificent|moving|remarkable)\b/i, why: 'superlative instead of a specific observation' },
  { id: 'urgency', re: /\b(don['’]?t\s+wait|before\s+it['’]?s\s+too\s+late|act\s+now|right\s+away)\b/i, why: 'pressure or urgency' },
  { id: 'method-narration', re: /\b(to understand (this|what)[^.]{0,60}\bwe (must|need)|we must (carefully )?distinguish|let us (first )?(distinguish|consider|look))\b/i, why: 'narrates its method instead of answering' },
  { id: 'machinery', re: /\b(retrieved (sources|passages|texts)|the provided (texts|passages|sources|writings)|the passages (provided|given|above)|our library'?s? (cited )?record|in the (sources|passages) (i was|i've been) given)\b/i, why: 'mentions the pipeline instead of the works' },
  { id: 'authority-layers', re: /\b(authority layers?|the provided evidence|ground every claim)\b/i, why: 'pipeline vocabulary in a letter' },
  { id: 'human-claim', re: /\bas\s+a\s+(human|person|believer\s+myself)\b|\bi\s+am\s+(a\s+)?human\b/i, why: 'claims to be human' },
];

/** Lint a reply. Quoted material (> blockquotes and "…" quotes) is excluded: the texts may say anything. */
export function lintReply(text) {
  const own = String(text || '').split('\n').filter((l) => !/^\s*>/.test(l)).join('\n').replace(/[“"][^”"]{0,600}[”"]/g, ' ');
  return LINT.filter((r) => r.re.test(own)).map(({ id, why }) => ({ id, why }));
}

// Deterministic BACKSTOP for the one machinery phrase the formatter keeps producing when something is missing
// (soul battery 2026-09-27: 5 of 18 replies said "The provided texts do not…"). The prompt is the fix; this catches
// what slips through. Rewrites only the fixed phrase, never meaning.
const MACHINERY_PHRASE = /\b(the|these) (provided|retrieved|given) (texts|passages|sources|writings)\b/gi;
export function unmachine(text) {
  return dropBriefMarkers(dropAuthorityLecture(mixedScript(String(text || '').replace(MACHINERY_PHRASE, (m) => (/^T/.test(m) ? 'The texts I can search' : 'the texts I can search')))));
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
    const sents = para.match(/[^.!?]+(?:[.!?]+["”’)]*|$)\s*/g) || [para];
    const kept = sents.filter((x) => !(!asked && QUIBBLE.test(x)) && !(format === 'language' && NOT_SETTLED.test(x)));
    return kept.join('').trim();
  }).filter(Boolean).join('\n\n');
}

/** The researcher's brief markers never reach the reader ("[own]", "(P3)", "[P2, W1]"). Pure. */
export const dropBriefMarkers = (t) => String(t || '').replace(/\s*\[own\]/gi, '').replace(/\s*\((?:[PW]\d+(?:,\s*)?)+\)/g, '').replace(/\s*\[(?:[PW]\d+(?:,\s*)?)+\]/g, '');

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
