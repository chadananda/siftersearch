// Canonical Arabic-script folding for classical Arabic, Persian and texts that mix them. Pure, no I/O.
// :rules: ONE definition — phrase splitting, keys and matching must fold identically (drift = silent misses). Folding is
//         for DECISIONS and keys only; stored and displayed text is never folded.
// :edge: arOrFa judges Persian vs Arabic by grammar words (measured on 2,990 labelled oceanoflights tablets, 2026-09-28):
//        Persian prose is full of Arabic quotation, and Arabic is often typed with Persian ی/ک, so letters alone mislead.
// Marks: harakat/tanwin/shadda/sukun (064B–065F), superscript alef (0670), Qur'anic annotation (0610–061A, 06D6–06DC,
// 06DD verse end, 06DE, 06DF–06E8, 06EA–06ED), tatweel (0640), and invisible controls (bidi, ZWJ/ZWNJ, BOM).
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ\u200B-‏‪-‮⁦-⁩\uFEFF]/g;
const LETTERS = { 'ي': 'ی', 'ى': 'ی', 'ئ': 'ی', 'ې': 'ی', 'ك': 'ک', 'ڪ': 'ک', 'ة': 'ه', 'ۀ': 'ه', 'ە': 'ه', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ٲ': 'ا', 'ٳ': 'ا', 'ؤ': 'و' };
const LETTER_RE = new RegExp(`[${Object.keys(LETTERS).join('')}]`, 'g');
const DIGITS = /[٠-٩۰-۹]/g;

export const stripMarks = (text) => (text || '').replace(MARKS, '');

// NFKC first: presentation forms and ligatures from old PDFs (ﻻ, ﺍﻟﻠﻪ) become plain letters
export const foldArabic = (text) => stripMarks((text || '').normalize('NFKC'))
  .replace(LETTER_RE, (c) => LETTERS[c])
  .replace(DIGITS, (d) => String((d.charCodeAt(0) & 0xF)));

const FA_WORDS = new Set(['است', 'را', 'که', 'این', 'آن', 'ان', 'از', 'با', 'بود', 'شود', 'شد', 'نمود', 'نماید', 'نمایند', 'گردد',
  'باید', 'هستند', 'هست', 'میشود', 'میفرمایند', 'فرمودند', 'چه', 'تا', 'شما', 'ایشان', 'اگر', 'نیز', 'بسیار', 'بلکه',
  'ولی', 'چون', 'هر', 'کرد', 'دارد', 'بر', 'میباشد', 'نمیشود', 'خواهد']);
const AR_WORDS = new Set(['الذی', 'التی', 'الذین', 'فی', 'علی', 'الی', 'کان', 'هذا', 'هذه', 'قد', 'ثم', 'عن', 'لم',
  'لن', 'اذا', 'کل', 'ما', 'لا', 'هو', 'انه', 'یا', 'به', 'لمن']);
FA_WORDS.delete('ان');   // 'آن' folds to 'ان', which is Arabic 'an/inna' — ambiguous, so it counts for neither

// a folded word that only Persian grammar uses (است، که، را، می‌شود…) — local evidence for Persian rules
export const isPersianWord = (folded) => FA_WORDS.has(folded);

export function grammarScore(text) {
  let fa = 0, ar = 0;
  for (const w of foldArabic(text).split(/[\s،.:؛!؟()«»"]+/)) FA_WORDS.has(w) ? fa++ : AR_WORDS.has(w) && ar++;
  return { fa, ar };
}

// Share of Persian among the grammar words of a passage (0 = Arabic, 1 = Persian, null = no evidence). Classical
// Islamic writing mixes the two freely (Chad, 10-01) — this is a measure to rank by, not a label to filter on.
export function faShare(text) {
  const { fa, ar } = grammarScore(text);
  return fa + ar ? +(fa / (fa + ar)).toFixed(2) : null;
}

// Persian or Arabic for ONE passage: grammar words decide; too few (< 5) → the label if given, else Persian-only letters
export function arOrFa(text, label = null) {
  const { fa, ar } = grammarScore(text);
  if (fa + ar >= 5) return fa / (fa + ar) >= 0.25 ? 'fa' : 'ar';
  if (label === 'ar' || label === 'fa') return label;
  return /[پچژگ]/.test(text || '') ? 'fa' : 'ar';
}
