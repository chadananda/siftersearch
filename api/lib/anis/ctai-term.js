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

/** A few words either side of a span, the span in bold: «… از **عرفان** او …». Null when there is no span. */
export function phraseWindow(text, span, words = 4) {
  const t = String(text || '');
  if (!Array.isArray(span) || !(span[1] > span[0]) || span[1] > t.length) return null;
  const before = t.slice(0, span[0]).split(/\s+/).filter(Boolean), after = t.slice(span[1]).split(/\s+/).filter(Boolean);
  const head = before.slice(-words).join(' '), tail = after.slice(0, words).join(' ');
  const cell = `${before.length > words ? '… ' : ''}${head}${head ? ' ' : ''}**${t.slice(span[0], span[1]).trim()}**${tail ? ' ' : ''}${tail}${after.length > words ? ' …' : ''}`;
  return cell.replace(/\|/g, '/').replace(/\s+/g, ' ').replace(/(\*\*)?\s+([,.;:!?،؛])/g, '$1$2');
}

const clip = (text, [s, e] = [0, 0], room = 260) => {
  const t = String(text || '');
  if (t.length <= room * 2) return t;
  const a = Math.max(0, s - room), b = Math.min(t.length, e + room);
  return `${a > 0 ? '… ' : ''}${t.slice(a, b).trim()}${b < t.length ? ' …' : ''}`;
};

/**
 * How Shoghi Effendi rendered THIS word: his renderings counted over every passage where the word itself occurs,
 * inflections grouped (recognize · recognition · recognizing). CTAI's own counts are per ROOT — for عرفان they include
 * ʿarf "fragrance", a different word on the same letters — so they are only the fallback.
 */
const FILLER = new Set(['can', 'may', 'shall', 'will', 'your', 'thy', 'his', 'her', 'its', 'their', 'our', 'my', 'thine', 'and', 'but', 'that', 'which', 'who', 'not', 'yet', 'be']);

/** One rendering as a label: the alignment can carry neighbouring words ("knowledge,” the “heaven"); keep the head. */
export function renderingLabel(en) {
  let t = String(en || '').toLowerCase().replace(/[“”"‘’]/g, '').split(/[,;:.!?()]/)[0].trim();
  t = t.replace(/^(?:of|the|a|an|to|his|thy|thine|my|its|their|our|her)\s+/g, '').replace(/^(?:of|the|a|an)\s+/, '');
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 3 || (words.length === 1 && FILLER.has(words[0]))) return '';   // an alignment on "can", "your"… is noise
  return words.join(' ');
}

export function renderingCounts(results = []) {
  const groups = new Map();
  for (const r of results) {
    const en = renderingLabel(r.focus?.translation);
    if (en.length < 3) continue;
    const key = en.slice(0, 7);
    const g = groups.get(key) || { forms: new Map(), count: 0 };
    g.count += 1; g.forms.set(en, (g.forms.get(en) || 0) + 1);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ en: [...g.forms.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f).slice(0, 3).join(' / '), count: g.count }))
    .sort((a, b) => b.count - a.count);
}

/** Arabic and Persian keyboards spell ی/ي and ک/ك differently and CTAI does not fold them (ایقان 6 passages, ايقان 22):
 *  search every spelling and merge. */
export const spellings = (term) => [...new Set([term, term.replace(/ی/g, 'ي').replace(/ک/g, 'ك'), term.replace(/ي/g, 'ی').replace(/ك/g, 'ک')])];

/** CTAI → { term, root, transliteration, meaning, renderings[{en,count}], counted, total, researchUrl, passages[] } or null. */
export async function ctaiTerm(term, { fetchImpl = fetch, key = config.ctai?.apiKey, base = config.ctai?.apiUrl || `${SITE}/api/v1`, limit = 10 } = {}) {
  if (!key) return null;
  const auth = { authorization: `Bearer ${key}` };
  const getPassages = (q) => fetchImpl(`${base}/passages?${new URLSearchParams({ q, in: 'source', limit: '100' })}`, { headers: auth, signal: AbortSignal.timeout(25000) })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [conc, ...found] = await Promise.all([
    fetchImpl(`${base}/concordance`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ phrase: term, detail: 'compact', exemplars: 0 }), signal: AbortSignal.timeout(25000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ...spellings(term).map(getPassages),
  ]);
  const seen = new Set();
  const merged = found.flatMap((f) => f?.results || []).filter((r) => r.url && !seen.has(r.url) && seen.add(r.url));
  const pas = found.some(Boolean) ? { results: merged, total: Math.max(merged.length, ...found.map((f) => f?.total || 0)) } : null;
  const t = conc?.terms?.[0] || null;
  const counted = renderingCounts(pas?.results || []);
  const aligned = counted.reduce((n, r) => n + r.count, 0);
  const passages = (pas?.results || []).slice(0, limit).map((p) => ({
    work: p.work?.title || '', author: p.work?.author || '', ref: `${p.work?.title || ''} ${p.section_index || ''}`.trim(),
    url: p.url ? `${SITE}${p.url}` : null,
    original: clip(p.source_text, p.focus?.source_span), english: clip(p.translation, p.focus?.target_span),
    form: p.focus?.source || term, rendering: p.focus?.translation || null,
    phrase: phraseWindow(p.source_text, p.focus?.source_span), phraseEn: phraseWindow(p.translation, p.focus?.target_span),
  })).filter((p) => p.url && p.original);
  if (!t && !passages.length) return null;
  return {
    term, root: t?.root || null, transliteration: t?.transliteration || null, meaning: t?.meaning || null,
    renderings: (aligned >= 3 ? counted : (t?.renderings || []).map((r) => ({ en: r.en, count: r.count }))).slice(0, 8),
    counted: aligned >= 3 ? aligned : 0,            // passages the counts come from (0 = CTAI's root-level counts)
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
  const title = `How Shoghi Effendi rendered ${study.term}${study.counted ? ` in ${study.counted} passages` : study.root ? ` (all words of the root ${study.root})` : ''}`;
  if ((channel.capabilities || []).includes('charts')) {
    return `\`\`\`chart\n${JSON.stringify({ title, bars: study.renderings.map((r) => ({ label: r.en, value: r.count })) })}\n\`\`\``;
  }
  return `**${title}:** ${study.renderings.map((r) => `${r.en} (${r.count})`).join(' · ')}`;
}

/** The passages, built by CODE (exact bolding from CTAI's spans): a table where the channel shows tables, a list
 *  elsewhere. Rows chosen to show DIFFERENT renderings first. */
export function passagesBlock(study, channel = {}, max = 8) {
  const rows = (study?.passages || []).filter((p) => p.phrase && p.phraseEn && p.url && renderingLabel(p.rendering));
  const seen = new Set(), first = [], rest = [];
  for (const p of rows) { const k = renderingLabel(p.rendering).slice(0, 7); (seen.has(k) ? rest : first).push(p); seen.add(k); }
  const pick = [...first, ...rest].slice(0, max);
  if (!pick.length) return '';
  if ((channel.capabilities || []).includes('tables')) {
    return ['| Original | Shoghi Effendi’s English | Source |', '|---|---|---|',
      ...pick.map((p) => `| ${p.phrase} | ${p.phraseEn} | [${p.ref}](${p.url}) |`)].join('\n');
  }
  return pick.map((p) => `- ${p.phrase} — ${p.phraseEn} — [${p.ref}](${p.url})`).join('\n');
}

/** Format direction for a term study, by what the channel can show. */
export function termFormatHow(study, channel = {}) {
  return [
    `TERM STUDY of ${study.term}${study.transliteration ? ` (${study.transliteration})` : ''}${study.root ? `, root ${study.root}` : ''}.`,
    'Open with one sentence naming the word in Arabic script with its transliteration and what its root means.',
    'Then write the token [[RENDERINGS]] on a line of its own (code replaces it with the counts — never write counts yourself).',
    'Then the token [[PASSAGES]] on a line of its own (code replaces it with the passages, original beside English — do not write a table or list of passages yourself).',
    'Then two or three sentences on what the range of renderings shows about the word, marked as your reading.',
    study.researchUrl ? `End with a link to the full concordance: [all renderings on CTAI](${study.researchUrl}).` : '',
  ].filter(Boolean).join(' ');
}

/** Put the code-built renderings and passages in place of their tokens (a dropped token: renderings after the first
 *  paragraph, passages after the renderings). */
export function placeRenderings(reply, study, channel) {
  let out = String(reply);
  const r = renderingsBlock(study, channel), p = passagesBlock(study, channel);
  const put = (token, block, afterBlock) => {
    if (!block) { out = out.replace(new RegExp(`\\[\\[${token}\\]\\]\\n?`, 'g'), ''); return; }
    if (out.includes(`[[${token}]]`)) { out = out.replace(`[[${token}]]`, block); return; }
    const at = afterBlock && out.includes(afterBlock) ? out.indexOf(afterBlock) + afterBlock.length : out.indexOf('\n\n');
    out = at > 0 ? `${out.slice(0, at)}\n\n${block}${out.slice(at)}` : `${out}\n\n${block}`;
  };
  put('RENDERINGS', r, null);
  put('PASSAGES', p, r);
  return out;
}
