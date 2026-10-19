// LANGUAGE QUESTIONS — "would fí baytihi be used for 'chamber'?", "what is the Arabic word for chamber?" (Chad 10-19: Lal was
// told the texts "do not address Arabic nominal clauses" and had his grammar corrected — "What a useless answer. Anís is
// supposed to be helping explore ideas in the scripture"). A question about the WORDS themselves is answered from knowledge
// of the language, with the passage already under discussion; a library search for it only finds unrelated quotations to
// pad the reply with. Pure.

const SCRIPT = /[؀-ۿ֐-׿]/;
const TRANSLIT = /\b(?:fi|fī|fí|min|bayt\w*|ghurf\w*|ḥujr\w*|hujr\w*|khalw\w*|wahd\w*|waḥd\w*)\b/i;

/** Pure. */
export function looksLikeLanguageQuestion(text) {
  const t = String(text || '');
  if (/\b(?:arabic|persian|farsi|hebrew|aramaic|greek|sanskrit|pali)\s+(?:word|term|root|equivalent|for)\b/i.test(t)) return true;
  if (/\b(?:the |a )?(?:word|term) (?:for|used for|meaning|that means)\b/i.test(t)) return true;
  if (/\b(?:grammar|grammatical|genitive|nominative|plural of|singular of|root of|derived from|etymolog)/i.test(t)) return true;
  const aboutWords = /\b(?:mean|means|meaning|translat\w*|render\w*|used for|stand for)\b/i.test(t);
  return aboutWords && (SCRIPT.test(t) || TRANSLIT.test(t));
}

export const LANGUAGE_HOW = 'This is a question about the LANGUAGE itself — what a word means, which words carry an idea, how a phrase is built. Answer it directly from your knowledge of the language, as a scholar friend would: the meaning, the words that carry the idea (with their sense and a transliteration), and how the word in the passage under discussion (CONVERSATION SO FAR) relates — e.g. a translator rendering a whole phrase ("from his house, alone") by one English idea ("in the privacy of his chamber"). Take the reader\'s spelling charitably and never comment on it. Quote a passage only if it shows the word itself in use; otherwise quote nothing. End with one thread worth pulling further — not a summary, not a remark about sources.';
