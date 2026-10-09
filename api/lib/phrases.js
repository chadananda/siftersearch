// Phrase units for the phrase index: per-language clause rules → {start,end} offsets into the marker-stripped text.
// :arch: port of tests/quality/crosslingual/phrases.py (the measured splitter; parity enforced by tests/fixtures/phrases-golden.json)
// :rules: units come from the language's OWN markers — Arabic/Persian clause openers, verb endings, saj' rhyme; English
//         punctuation + conjunctions; Chinese/Japanese 。！？；. NEVER cut by length: a run with no marker stays one unit. Paragraph text is never changed.
// :rules: bump SEG_VERSION on any rule change — the phrase indexer re-segments + re-embeds docs stamped with an older version.
// :edge: offsets index cleanText(text) (⁅s/p⁆ markers removed); HTML comments and <pb/> tags are skipped, never words.
import { foldArabic, isPersianWord } from './arabic-script.js';
export const SEG_VERSION = 'phr-v3';
const SHORT = 4;
const bare = foldArabic;   // decisions on folded forms (vowels, Qur'anic marks, ZWNJ, letter variants); offsets stay on the raw text
const AR_PARTICLES = new Set(['قد', 'لا', 'لم', 'لن', 'ان', 'انا', 'انه', 'انها', 'انهم', 'اذا', 'اذ', 'لو', 'ما', 'لما', 'لئن', 'لعل', 'کذلک',
  'هذا', 'هذه', 'هو', 'هی', 'هم', 'انت', 'انتم', 'نحن', 'من', 'الذی', 'الذین', 'کان', 'کانت', 'لیس', 'سوف', 'کم', 'هل', 'ا']);
const AR_OPENERS = new Set(['ثم', 'قل', 'یا', 'ایها', 'تالله', 'لعمری', 'لعمر', 'بلی', 'کلا', 'الا', 'اما', 'فلما', 'ولما', 'اذا', 'طوبی', 'ویل']);
const FA_OPENERS = new Set(['که', 'تا', 'چون', 'اگر', 'زیرا', 'ولی', 'پس', 'باری', 'امروز']);   // Persian-only: open a clause anywhere
const FA_OPENERS_LOCAL = new Set(['حال', 'ای', 'ولکن', 'لکن']);   // shared with Arabic usage: open only inside Persian
const FA_VERB_END = /(است|اند|شود|امد|امدند|داد|دادند|گفت|گفتند|یافت|گشته|گردند|بود|بودند|شد|شده|شدند|نمود|نمودند|نماید|نمایند|کرد|کردند|کند|کنند|فرمود|فرمودند|فرماید|میشود|میگردد|گشت|گردید|گردد|دارد|دارند|نیست|هست|باشد|باشند|خواهد|ید)$/;
const AR_VERB = /^(ی|ت|ن)\S{2,6}$/;          // imperfect verb shape (yaf'al / taf'al / naf'al)
const PRON_SUFFIX = /(ها|هم|هن|کم|کن|نا|ه)$/;  // noun + pronoun ("its leaves") — a list item, not a clause
const INNA = new Set(['ان', 'انا', 'انه', 'انها', 'انهم']);
const EN_OPENERS = new Set(['and', 'but', 'or', 'nor', 'for', 'yet', 'so', 'that', 'which', 'who', 'whom', 'whose', 'while',
  'whereas', 'although', 'though', 'because', 'if', 'when', 'whereby', 'wherein', 'lest', 'until', 'unless', 'since', 'as',
  'even', 'inasmuch', 'whilst', 'whereupon', 'wherefore']);
const verbish = (b) => AR_VERB.test(b) && !PRON_SUFFIX.test(b);
const opensAr = (b) => AR_PARTICLES.has(b) || AR_OPENERS.has(b) || verbish(b);
const isArClauseStart = (w, nxt) => {
  const b = bare(w);
  if (AR_OPENERS.has(b)) return true;
  if (w.includes('ّ') && INNA.has(b)) return true;           // inna with shadda, not an/in
  if (b.length > 1 && 'وف'.includes(b[0]) && opensAr(b.slice(1))) return true;   // wa-/fa- proclitic
  return (b === 'و' || b === 'ف') && nxt != null && opensAr(bare(nxt));
};
const rhyme = (w) => { const b = bare(w); return b.length >= 3 ? b.slice(-2) : null; };

export const cleanText = (text) => (text || '').replace(/⁅\/?[sp]\d+⁆/g, '');

// words of the clean text with their offsets; comments and page-break tags are masked out (same length → same offsets)
const wordsOf = (clean) => {
  const masked = clean.replace(/<!--.*?-->|<pb[^>]*\/>/g, (m) => ' '.repeat(m.length));
  // eslint-disable-next-line no-control-regex -- \x1c-\x1f + \x85 ARE whitespace in Python's str.split(), the measured splitter
  return [...masked.matchAll(/[^\s\x1c-\x1f\x85]+/g)]   // Python's str.split() whitespace set (the measured splitter)
    .map((m) => ({ w: m[0], start: m.index, end: m.index + m[0].length }));
};

// join units shorter than SHORT words to the previous unit (or the first into the second)
const joinShort = (units, keep = () => false) => {
  const out = [];
  for (const u of units) (out.length && u.length < SHORT && !keep(u, out.at(-1))) ? out[out.length - 1] = [...out.at(-1), ...u] : out.push(u);
  if (out.length > 1 && out[0].length < SHORT) out.splice(0, 2, [...out[0], ...out[1]]);
  return out;
};

// Arabic and Persian are ONE rule set — classical writing mixes them inside a sentence (Persian prose quoting Arabic,
// Arabic letters with Persian asides). Arabic clause openers fire everywhere; Persian-only openers fire everywhere;
// Persian verb endings and shared openers fire only when the clause so far shows Persian (a Persian grammar word or
// پ چ ژ گ) — so an Arabic quotation inside Persian prose is split by Arabic rules, the prose around it by Persian.
const persianClause = (cur) => cur.some(({ w }) => isPersianWord(bare(w)) || /[پچژگ]/.test(w));
const unitsAr = (words) => {
  const units = [];
  let cur = [];
  for (const [i, { w }] of words.entries()) {
    const nxt = words[i + 1]?.w ?? null;
    let start = false;
    if (cur.length) {
      const last = cur.at(-1).w, b = bare(w);
      const lb = bare(last).replace(/\*+$/, '');
      const fa = persianClause(cur);
      const verbEnd = FA_VERB_END.test(lb) && !lb.startsWith('ال');   // ال…: an Arabic noun (الحمید), not a Persian verb
      start = isArClauseStart(w, nxt) || FA_OPENERS.has(b)
        || (fa && (FA_OPENERS_LOCAL.has(b) || (verbEnd && cur.length >= SHORT) || (b === 'و' && nxt != null && verbEnd)));
      if (/[.!?؟؛*]$/.test(last)) start = true;                      // editorial punctuation: supporting evidence
    }
    if (start) { units.push(cur); cur = []; }
    cur.push(words[i]);
  }
  if (cur.length) units.push(cur);
  // saj': a short unit that rhymes with the previous unit's ending closes its own clause — keep it separate
  return joinShort(units, (u, prev) => { const r = rhyme(u.at(-1).w); return r != null && r === rhyme(prev.at(-1).w); });
};

const unitsEn = (words) => {
  const units = [];
  let cur = [];
  for (const [i, t] of words.entries()) {
    cur.push(t);
    const nxt = words[i + 1]?.w.toLowerCase().replace(/^["“‘(]+|["“‘(]+$/g, '');
    if (/[.!?;:]["”’)]*$/.test(t.w) || (t.w.endsWith(',') && EN_OPENERS.has(nxt))) { units.push(cur); cur = []; }
  }
  if (cur.length) units.push(cur);
  return joinShort(units);
};

// Chinese/Japanese: no spaces — a clause ends after 。！？； (closing quotes kept with it); fragments < SHORT chars join
const unitsCjk = (clean) => {
  const spans = [...clean.matchAll(/[^。！？；]+(?:[。！？；]+[」』”’）)]*)?/g)]
    .map((m) => { const lead = m[0].length - m[0].trimStart().length; return { start: m.index + lead, end: m.index + m[0].trimEnd().length }; })
    .filter((s) => s.end > s.start);
  const out = [];
  for (const s of spans) (out.length && s.end - s.start < SHORT) ? out.at(-1).end = s.end : out.push(s);
  if (out.length > 1 && out[0].end - out[0].start < SHORT) out.splice(0, 2, { start: out[0].start, end: out[1].end });
  return out;
};

export function segment(text, lang = 'en') {
  if (lang === 'zh' || lang === 'ja') return unitsCjk(cleanText(text));
  const words = wordsOf(cleanText(text));
  if (!words.length) return [];
  const units = lang === 'ar' || lang === 'fa' ? unitsAr(words) : unitsEn(words);   // ar/fa label = Arabic script; rules decide locally
  return units.map((u) => ({ start: u[0].start, end: u.at(-1).end }));
}

export const unitTexts = (text, lang) => { const c = cleanText(text); return segment(text, lang).map((s) => c.slice(s.start, s.end)); };

// Embedding text for unit i: the phrase plus neighbouring phrases until ~ctxWords (right first, then left). The hit
// still returns phrase i; the neighbours only give its vector context.
export function anchored(units, i, ctxWords = 30) {
  const n = (s) => s.split(/\s+/).filter(Boolean).length;
  let left = i, right = i, count = n(units[i]);
  while (count < ctxWords && (left > 0 || right < units.length - 1)) {
    if (right < units.length - 1) count += n(units[++right]);
    if (count < ctxWords && left > 0) count += n(units[--left]);
  }
  return units.slice(left, right + 1).join(' ');
}
