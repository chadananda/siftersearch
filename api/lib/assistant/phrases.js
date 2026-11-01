// Search-phrase extractor for SPECIFIC searches (quote/lookup). Deterministic quote first; else one tiny Haiku call. Jev routes, this only names what to search.
import { modelFor } from '../model-roles.js';
const SPECIFIC = new Set(['quote', 'lookup']);   // facts and definitions keep the seeker's own words: the battery scores their phrase against the question (11-01);
const ANAPHOR = /\b(he|him|his|she|her|they|them|their|it|its|this|that|these|those|there)\b/i;
const PROMPT = (q) => `A seeker asked a library of religious texts: """${q}"""\nReply with ONLY the words to search the library for: the exact wording of a passage to find, or the name of the person, work or term asked about, spelled as a library would spell it. Use the seeker's OWN words only (never synonyms or added words); drop just the request frame ("where is", "who wrote", "tell me about", "find", "please"). 1 to 12 words, no quotes, no explanation. Reply NONE if the question names nothing specific.`;
/** → { phrase, via: 'quote-marks' | 'haiku' } or null (not a specific search, a follow-up, or nothing found). Never throws. */
export async function extractPhrase(question, plan, { complete } = {}) {
  const q = String(question || '').trim();
  if (plan?.quote?.phrase) return { phrase: plan.quote.phrase, via: plan.quote.via || 'quote-marks' };
  if (!SPECIFIC.has(plan?.shape) || q.split(/\s+/).length < 5 || ANAPHOR.test(q)) return null;
  try {
    const call = complete || (async (messages) => (await import('../ai.js')).chatCompletion(messages, { ...modelFor('assistant-phrases'), temperature: 0, maxTokens: 40, thinking: false, caller: 'anis-phrases' }));
    const out = await call([{ role: 'user', content: PROMPT(q) }]);
    const phrase = String(out?.content ?? out ?? '').trim().split('\n')[0].replace(/^["“«'\s]+|["”»'.\s]+$/g, '');
    const n = phrase.split(/\s+/).length;
    return !phrase || /^none$/i.test(phrase) || n > 14 ? null : { phrase, via: 'haiku' };
  } catch { return null; }
}
