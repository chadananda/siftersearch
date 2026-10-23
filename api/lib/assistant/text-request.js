// Is a message a TEXT REQUEST — a passage in its original script pasted in, or a request to translate / find the original /
// read a text line by line? Such a message is research + translation whatever else is going on (10-23 Liliane: her Persian
// prayer with "can you translate this one or go to jafar" went to the reading guide when the address had an open reading,
// and was templated as small talk from a fresh address — it reached research only inside its full thread). Pure.

const ARABIC_WORD = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]{2,}/g;
const ASKS = /\b(translat\w*|the original|original (?:text|words?|persian|arabic)|line[- ]by[- ]line|read (?:it|this) with me|transcri\w*|in (?:farsi|persian|arabic)|(?:go|ask) to jafar)\b|ترجمه|ترجمة|اصل/i;

/** Arabic-script words in a message. */
export const arabicWords = (text) => (String(text || '').match(ARABIC_WORD) || []).length;

/** → { passage, asks, request } — request = a pasted original (≥ 12 Arabic-script words), or a translate/original ask
 *  that comes with a passage (any Arabic script, or ≥ 40 words of quoted text). */
export function textRequest(text) {
  const s = String(text || '');
  const passage = arabicWords(s) >= 12;
  const asks = ASKS.test(s);
  const quoted = (s.match(/\p{L}+/gu) || []).length >= 40;
  return { passage, asks, request: passage || (asks && (arabicWords(s) > 0 || quoted)) };
}
