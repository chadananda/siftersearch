// Search phrases for SPECIFIC searches (quote/lookup) — Jev has already routed; this only names WHAT to search.
// Deterministic first (quote marks, named-object match: no call); else ONE Haiku call → JSON {exact, names, author, work,
// tradition, spellings}, given the previous turn + a trimmed reply when the question leans on them. Timeout / bad JSON → fallback (v1 search).
import { modelFor } from '../model-roles.js';
import { stripMarkup } from '../quote-detect.js';

const SPECIFIC = new Set(['quote', 'lookup']);   // fact/define keep the seeker's own words (11-01: "Bab martyrdom date" cost 24 battery fixtures)
const ANAPHOR = /\b(he|him|his|she|her|they|them|their|it|its|this|that|these|those|there|same)\b/i;
// a turn that points into the conversation ("that passage", "the verse you quoted", "who wrote it"); never a bare "the quote" — "find the quote …" stands alone
const BACK = /\b(?:that|this|your|those|these)\s+(?:same\s+)?(?:passage|verse|quot\w*|line|words|sentence|text|tablet|prayer|book|one)s?\b|\byou\s+(?:just\s+)?(?:quoted|cited|mentioned|said|gave|shared)\b|\b(?:wrote|said|from)\s+(?:it|that|this)\b/i;
// the seeker asks to find the passage the assistant itself gave → its words may be hunted
const FIND_REPLY = /\b(?:that|this|your|those)\s+(?:same\s+)?(?:passage|verse|quot\w*|line|words|sentence|text|tablet|prayer)s?\b|\byou\s+(?:just\s+)?(?:quoted|cited|gave|shared)\b/i;
// measured 11-01 (Haiku 5.5, thinking off, 60 calls): p50 999 ms, p95 1836, max 2445 → past p95 with room; a miss costs only the v1 query
export const PHRASES_TIMEOUT_MS = () => Number(process.env.ANIS_PHRASES_TIMEOUT_MS) || 2200;

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[‘’ʼʻʾʿ`']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const nWords = (s) => String(s || '').split(/\s+/).filter(Boolean).length;
const trim = (s, n) => { const t = stripMarkup(s).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_#>`]+/g, '').replace(/\s+/g, ' ').trim(); return t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, '')} …`; };

export const PROMPT = ({ question, previous, reply }) => `A seeker is searching a library of religious texts (Bahá'í Writings and 11 other traditions). Say WHAT to search for. Reply with ONE JSON object only:
{"exact":[],"names":[],"author":null,"work":null,"tradition":null,"spellings":[]}
- exact: wording of a passage the SEEKER gives (quoted, a fragment or half-remembered), copied in the seeker's OWN words with the request frame dropped ("find the quote", "where does it say", "who said", "please"). Never add or change words. Never words that only the assistant said — unless the seeker asks to find that passage of the assistant's reply ("that passage", "the verse you quoted"); then copy its key wording from the reply.
- names: each person, work (title) or term the seeker names — or refers to ("it", "he", "that book" → the concrete name from the conversation) — in the seeker's spelling (the conversation's when only referred to).
- author: whose words the seeker says the passage is, if stated or referred to; work: the book it is said to be in, if stated or referred to; tradition: the religion, only if the seeker names it. Otherwise null.
- spellings: other spellings/transliterations of those names as a library would write them (e.g. "Mulla Hosein" → "Mullá Ḥusayn", "Mulla Husayn"), at most 4. Transliteration variants ONLY — never synonyms, translations, titles or other names.
Empty lists when nothing applies. No explanation.
${previous ? `\nPrevious seeker turn: """${previous}"""\n` : ''}${reply ? `Assistant's previous reply (trimmed): """${reply}"""\n` : ''}${previous || reply ? '\nCurrent seeker turn' : 'Seeker'}: """${question}"""`;

/** Is the question a follow-up that needs the conversation to name its object? */
export const leansBack = (q) => ANAPHOR.test(q) || BACK.test(q);

const similar = (a, b) => {
  if (a === b) return 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length, 1);
};
// ≥ 70 % of a phrase's content words appear in the text (a half-remembered wording keeps most of its words)
const groundedIn = (phrase, text) => {
  const t = ` ${fold(text)} `, ws = [...new Set(fold(phrase).split(' ').filter((w) => w.length >= 3))];
  return ws.length > 0 && ws.filter((w) => t.includes(` ${w} `)).length >= Math.ceil(ws.length * 0.7);
};
const str = (x, maxWords = 8) => (typeof x === 'string' && x.trim() && !/^(null|none|n\/a)$/i.test(x.trim()) && nWords(x) <= maxWords ? x.trim().replace(/^["“«'\s]+|["”»'.\s]+$/g, '') : null);
const firstOf = (xs, key) => { const seen = new Set(); return xs.filter((x) => { const k = key(x); return k && !seen.has(k) && seen.add(k); }); };   // distinct, the first spelling kept
const strs = (xs, maxWords, max) => firstOf((Array.isArray(xs) ? xs : []).map((x) => str(x, maxWords)).filter(Boolean), fold).slice(0, max);

/** Parse + validate Haiku's JSON against the conversation. → structured object or null (not JSON). Pure. */
export function parsePhrases(raw, { question, previous = '', reply = '' } = {}) {
  const m = String(raw ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o;
  try { o = JSON.parse(m[0]); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const seeker = `${question} ${previous}`;
  const findReply = FIND_REPLY.test(question);
  // an exact wording is the SEEKER's: words only the assistant said are not a quotation, unless the seeker asks for that passage
  const exact = strs(o.exact, 40, 3).filter((p) => nWords(p) >= 2 && (groundedIn(p, seeker) || (findReply && groundedIn(p, reply))));
  const names = strs(o.names, 8, 4);
  // spellings are transliterations of a name, never another name: each must look like one of the names
  const spellings = strs(o.spellings, 8, 6).filter((s) => !names.some((n) => fold(n) === fold(s)) && names.some((n) => similar(fold(n), fold(s)) >= 0.6));
  return { exact, names, spellings, author: str(o.author), work: str(o.work, 12), tradition: str(o.tradition, 4) };
}

/** Quote marks or the named-object match already say what to search → the phrase with no call; else null. */
export const fixedPhrases = (plan) => {
  if (plan?.quote?.phrase) return { phrase: plan.quote.phrase, via: 'quote-marks', exact: [plan.quote.phrase], names: [], spellings: [] };
  if (plan?.named && plan.shape === 'lookup') {
    // a work is searched by its library title, a person in the seeker's spelling (graph labels vary)
    const phrase = plan.named.type === 'person' ? plan.named.matched : plan.named.name;
    return { phrase, via: 'named-object', exact: [], names: [plan.named.matched, plan.named.name].filter((x, i, a) => x && a.indexOf(x) === i), spellings: [] };
  }
  return null;
};

/**
 * → { phrase, via: 'quote-marks'|'named-object'|'haiku'|'fallback', exact, names, spellings, author?, work?, tradition?, ms?, reason? }
 *   or null (not a specific search). `phrase` is the one search string (null → the caller's own query). Never throws.
 * @param {object} [o] { messages (the thread, for follow-ups), complete (injected model call), timeoutMs }
 */
export async function extractPhrases(question, plan, { messages = [], complete, timeoutMs = PHRASES_TIMEOUT_MS() } = {}) {
  const q = stripMarkup(question).trim();
  const fixed = fixedPhrases(plan);
  if (fixed) return fixed;
  if (!SPECIFIC.has(plan?.shape) || !/\p{L}{2,}/u.test(q)) return null;
  // the conversation only for a follow-up that leans on it: the previous seeker turn + the reply, trimmed and unmarked
  const prior = (messages || []).slice(0, -1);
  const back = prior.length && leansBack(q);
  const previous = back ? trim([...prior].reverse().find((m) => m.role === 'user')?.content || '', 300) : '';
  const reply = back ? trim([...prior].reverse().find((m) => m.role === 'assistant')?.content || '', 700) : '';
  const t0 = Date.now();
  const fallback = (reason) => ({ phrase: null, via: 'fallback', reason, exact: [], names: [], spellings: [], ms: Date.now() - t0 });
  let timer;
  try {
    const call = complete || (async (msgs) => (await import('../ai.js')).chatCompletion(msgs, { ...modelFor('assistant-phrases'), temperature: 0, maxTokens: 160, thinking: false, caller: 'anis-phrases' }));
    const out = await Promise.race([call([{ role: 'user', content: PROMPT({ question: q, previous, reply }) }]),
      new Promise((_, no) => { timer = setTimeout(() => no(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), timeoutMs); timer.unref?.(); })]);
    const p = parsePhrases(out?.content ?? out, { question: q, previous, reply });
    if (!p) return fallback('bad-json');
    // the one search string: the wording for a quote hunt, the name for a lookup
    const order = plan.shape === 'lookup' ? [...p.names, ...p.exact] : [...p.exact, ...p.names];
    return { phrase: order[0] || null, via: 'haiku', ...p, ...(back ? { history: true } : {}), ms: Date.now() - t0 };
  } catch (e) {
    return fallback(e?.code === 'TIMEOUT' ? 'timeout' : 'error');
  } finally { clearTimeout(timer); }
}


/** The search hints a Haiku phrase result passes to planned-search (search/hints.js); null for the deterministic paths and fallback. */
export const hintsOf = (p) => (p?.via === 'haiku' ? { exact: p.exact, names: p.names, spellings: p.spellings, author: p.author || null, work: p.work || null, tradition: p.tradition || null } : null);

/** The turn record's phrases stage: every string searched (the phrase first), who chose it, and the structure. */
export const phraseStage = (p) => ({ choice: [...new Set([p.phrase, ...(p.exact || []), ...(p.names || [])].filter(Boolean))], by: p.via,
  ...(p.ms != null ? { ms: p.ms } : {}), ...(p.reason ? { reason: p.reason } : {}), ...(p.history ? { history: true } : {}),
  ...Object.fromEntries(['exact', 'names', 'spellings'].filter((k) => p[k]?.length).map((k) => [k, p[k]])),
  ...Object.fromEntries(['author', 'work', 'tradition'].filter((k) => p[k]).map((k) => [k, p[k]])) });
