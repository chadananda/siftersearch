// Term study via CTAI.info (the Shoghi Effendi concordance): a question about an Arabic/Persian word → its root, how
// Shoghi Effendi rendered it (counts), and paired passages — the original beside his English, the rendering marked,
// a link. Anís's evidence for the TERM STUDY format: the rendering chart and the counts are built by CODE from CTAI's
// data (the model never writes a number); the model writes the table rows and the reading. A Latin spelling
// ("Irfan") is resolved to the Arabic script by one tiny model call, since CTAI searches the original only.
// Deps: config (ctai), ai.chatCompletion, global fetch.
import { config } from '../config.js';

const SITE = 'https://ctai.info';
const AR = /[؀-ۿ]/;
// eslint-disable-next-line no-misleading-character-class -- Arabic vowel marks are matched on purpose
const AR_RUN = /[؀-ۿ][؀-ۿً-ْٰ\s]{1,40}/;
const TERM_CUE = /\b(mean(?:s|ing)?|word|term|concept|render(?:ed|ing|s)?|translat\w*|defin\w*|root|significance|sense)\b/i;
const T = "([A-Za-zʿʾ'’áíúÁÍÚḥḤṣṢṭṬẓẒḍḌ-]{3,30})";
// A Latin spelling counts only when the question is plainly about a WORD — "the word/term X", "what does X mean",
// or a transliteration with diacritics — never "what does Bahá’u’lláh say…" or "the meaning of sacrifice".
const LATIN_TERMS = [
  new RegExp(`\\b(?:the|this|that) (?:arabic |persian )?(?:word|term)\\s+["“'‘]?${T}`, 'i'),
  new RegExp(`\\bwhat does\\s+["“'‘]?${T}["”'’]?\\s+mean\\b(?!\\s+by\\b)`, 'i'),     // "what does X mean by…" asks about a person
  new RegExp(`\\b(?:meaning|significance|sense|definition) of\\s+["“'‘]?([^\\s"”]*[ʿʾáíúḥṣṭẓḍ][^\\s"”,.?]*)`, 'i'),
];
const NOT_TERMS = new Set(['the', 'this', 'that', 'word', 'term', 'it', 'god', 'love', 'faith', 'justice', 'prayer', 'religion', 'life']);

/** A question about a word → { term, script } or null. English words ("justice") are the ordinary search's job. */
export function termQuestion(text = '') {
  const t = String(text);
  if (AR.test(t) && TERM_CUE.test(t)) {
    const run = (t.match(AR_RUN) || [''])[0].trim().split(/\s+/).slice(0, 3).join(' ');
    if (run) return { term: run, script: 'arabic' };
  }
  for (const re of LATIN_TERMS) {
    const m = t.match(re);
    if (m && !NOT_TERMS.has(m[1].toLowerCase())) return { term: m[1].replace(/[’'.,?]+$/, ''), script: 'latin' };
  }
  return null;
}

/** "Irfan" → "عرفان" (one tiny call); null when the model does not recognise it as an Arabic/Persian term. */
export async function resolveTerm(latin, { complete } = {}) {
  const call = complete || (async (messages) => (await import('../ai.js')).chatCompletion(messages,
    { provider: 'deepseek', model: 'deepseek-v4-flash', temperature: 0, maxTokens: 20, thinking: false, caller: 'anis-term' }));
  const out = await call([{ role: 'user', content: `Write the Arabic-script spelling of the Arabic or Persian term used in the Bahá'í writings that is transliterated "${latin}". Reply with that word only, or NONE.` }]);
  const word = String(out?.content ?? out ?? '').trim().replace(/[«»"'.]/g, '');
  // eslint-disable-next-line no-misleading-character-class -- Arabic vowel marks are matched on purpose
  return /^[؀-ۿً-ْٰ\s]{2,30}$/.test(word) ? word.replace(/[ً-ْٰ]/g, '') : null;
}

const clip = (text, [s, e] = [0, 0], room = 260) => {
  const t = String(text || '');
  if (t.length <= room * 2) return t;
  const a = Math.max(0, s - room), b = Math.min(t.length, e + room);
  return `${a > 0 ? '… ' : ''}${t.slice(a, b).trim()}${b < t.length ? ' …' : ''}`;
};

/** CTAI → { term, root, transliteration, meaning, renderings[{en,count}], total, researchUrl, passages[] } or null. */
export async function ctaiTerm(term, { fetchImpl = fetch, key = config.ctai?.apiKey, base = config.ctai?.apiUrl || `${SITE}/api/v1`, limit = 10 } = {}) {
  if (!key) return null;
  const auth = { authorization: `Bearer ${key}` };
  const [conc, pas] = await Promise.all([
    fetchImpl(`${base}/concordance`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ phrase: term, detail: 'compact', exemplars: 0 }), signal: AbortSignal.timeout(25000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetchImpl(`${base}/passages?${new URLSearchParams({ q: term, in: 'source', limit: String(limit) })}`, { headers: auth, signal: AbortSignal.timeout(25000) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const t = conc?.terms?.[0] || null;
  const passages = (pas?.results || []).map((p) => ({
    work: p.work?.title || '', author: p.work?.author || '', ref: `${p.work?.title || ''} ${p.section_index || ''}`.trim(),
    url: p.url ? `${SITE}${p.url}` : null,
    original: clip(p.source_text, p.focus?.source_span), english: clip(p.translation, p.focus?.target_span),
    form: p.focus?.source || term, rendering: p.focus?.translation || null,
  })).filter((p) => p.url && p.original);
  if (!t && !passages.length) return null;
  return {
    term, root: t?.root || null, transliteration: t?.transliteration || null, meaning: t?.meaning || null,
    renderings: (t?.renderings || []).slice(0, 8).map((r) => ({ en: r.en, count: r.count })),
    total: pas?.total ?? passages.length, researchUrl: t?.more?.url || null, passages,
  };
}

/** The study's passages as Anís evidence (same shape as search results; links are CTAI's pair pages). */
export const termEvidence = (study) => study.passages.map((p) => ({
  text: `${p.original}\n${p.english}`, source_title: p.ref, source_author: p.author, citation_url: p.url, doc_id: null,
  paragraph_index: null, religion: "Bahá'í", collection: 'CTAI', source_lang: null, via: 'ctai',
  term_form: p.form, rendering: p.rendering,
}));

/** The rendering spread, built by code: a ```chart block where the channel draws charts, a line elsewhere. */
export function renderingsBlock(study, channel = {}) {
  if (!study?.renderings?.length) return '';
  const title = `How Shoghi Effendi rendered ${study.term}${study.root ? ` (root ${study.root})` : ''}`;
  if ((channel.capabilities || []).includes('charts')) {
    return `\`\`\`chart\n${JSON.stringify({ title, bars: study.renderings.map((r) => ({ label: r.en, value: r.count })) })}\n\`\`\``;
  }
  return `**${title}:** ${study.renderings.map((r) => `${r.en} (${r.count})`).join(' · ')}`;
}

/** Format direction for a term study, by what the channel can show. */
export function termFormatHow(study, channel = {}) {
  const tables = (channel.capabilities || []).includes('tables');
  return [
    `TERM STUDY of ${study.term}${study.transliteration ? ` (${study.transliteration})` : ''}${study.root ? `, root ${study.root}` : ''}.`,
    'Open with one sentence naming the word in Arabic script with its transliteration and what its root means.',
    'Then write the token [[RENDERINGS]] on a line of its own (code replaces it with the counts — never write counts yourself).',
    tables
      ? 'Then a table with columns: Original (the word in bold) | Shoghi Effendi’s English (the rendering of that word in bold) | Source (a link). One row per passage given, 5–8 rows, quoting only the given text.'
      : 'Then 4–6 short items, each: the original phrase (word in bold) — Shoghi Effendi’s English (rendering in bold) — linked source.',
    'Then two or three sentences on what the range of renderings shows about the word, marked as your reading.',
    study.researchUrl ? `End with a link to the full concordance: [all renderings on CTAI](${study.researchUrl}).` : '',
  ].filter(Boolean).join(' ');
}

/** Put the code-built renderings in place of the token (or after the first paragraph if the writer dropped it). */
export function placeRenderings(reply, study, channel) {
  const block = renderingsBlock(study, channel);
  if (!block) return String(reply).replace(/\[\[RENDERINGS\]\]\n?/g, '');
  if (reply.includes('[[RENDERINGS]]')) return reply.replace('[[RENDERINGS]]', block);
  const i = reply.indexOf('\n\n');
  return i > 0 ? `${reply.slice(0, i)}\n\n${block}${reply.slice(i)}` : `${reply}\n\n${block}`;
}
