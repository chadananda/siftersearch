// MOJIBAKE REPAIR (Chad 10-22: "ìWhy don't they read my book?î"). Whisper itself emits Windows-1252 punctuation read as
// MacRoman (“ → ì, ” → î, ’ → í, ‘ → ë, – → ñ, — → ó), learned from badly encoded subtitles; and text that passed through
// UTF-8 → CP1252 / MacRoman twice ("â€™", "‚Äú", "Ã©", "√©"). The repair is context-bound so real letters stay: í in
// Bábí / Íqán / ‘Alí is untouched (only after an all-ASCII English stem, before a contraction ending), ì / î only at a
// word's edge. Applied where ASR words enter the pipeline (paragraphs.flattenWords). Pure.

const DOUBLE = [['â€™', '’'], ['â€˜', '‘'], ['â€œ', '“'], ['â€\u009d', '”'], ['â€�', '”'], ['â€”', '—'], ['â€“', '–'], ['â€¦', '…'],
  ['‚Äô', '’'], ['‚Äò', '‘'], ['‚Äú', '“'], ['‚Äù', '”'], ['‚Äî', '—'], ['‚Äì', '–'], ['‚Ä¶', '…'],
  ['Ã©', 'é'], ['Ã¡', 'á'], ['Ã­', 'í'], ['Ãº', 'ú'], ['Ã³', 'ó'], ['Ã±', 'ñ'], ['Ã¨', 'è'], ['Ã¼', 'ü'], ['Ã¶', 'ö'], ['Ã¤', 'ä'],
  ['√©', 'é'], ['√°', 'á'], ['√≠', 'í'], ['√∫', 'ú'], ['√≥', 'ó'], ['√±', 'ñ'], ['√®', 'è'], ['√º', 'ü'], ['√∂', 'ö'], ['√§', 'ä']];

const PRON = /^(?:i|you|he|she|it|we|they|that|there|here|what|who|where|when|how|let)$/i;
const NT = /^(?:don|doesn|didn|can|couldn|won|wouldn|shouldn|isn|aren|wasn|weren|haven|hasn|hadn|ain|mustn|needn)$/i;
/** Is stem + ’ + end an English contraction or possessive? (a possessive needs a stem of 5+ letters: "Guardian’s", not "Idr’s") */
function contraction(stem, end) {
  if (end === 't') return NT.test(stem);
  if (end === 'm') return /^i$/i.test(stem);
  if (end === 's') return PRON.test(stem) || stem.length >= 5;
  return PRON.test(stem);   // ’re ’ve ’ll ’d
}

/** Repair one string (a word or a sentence). Returns it unchanged when nothing matches. */
export function fixMojibake(s) {
  let t = String(s ?? '');
  if (!/[ìîíëñóÃâ‚√]/.test(t)) return t;
  for (const [bad, good] of DOUBLE) if (t.includes(bad)) t = t.split(bad).join(good);
  return t
    .replace(/(^|[\s(\[—–-])ì(?=[\p{L}\p{N}'’‘])/gu, '$1“')                 // opening quote at a word's start
    .replace(/(?<=[\p{L}\p{N}.,!?;:'’)\]—–-])î(?=$|[\s.,!?;:)\]—–-])/gu, '”')  // closing quote at a word's end
    .replace(/(^|[\s(\[“"])ë(?=[\p{L}])/gu, '$1‘')                          // opening single quote / ‘ayn
    // contractions only on English stems: Persian names keep their í (Majíd, Rashíd, Idrís, Anís, Bábís)
    .replace(/(?<![\p{L}’'])([A-Za-z]+)í(t|s|m|re|ve|ll|d)(?![\p{L}])/gu, (m, stem, end) => (contraction(stem, end) ? `${stem}’${end}` : m))
    .replace(/(\s)ñ(\s)/g, '$1–$2').replace(/(\s)ó(\s)/g, '$1—$2');         // dashes between spaces
}

/** Is there anything that looks like mojibake left? (for audits) */
export const hasMojibake = (s) => fixMojibake(s) !== String(s ?? '');
