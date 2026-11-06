// Query anchor (spec #5, 11-06): a model-written library search must carry Jev's current subject. Pure, no I/O.
// The subject is Jev's (direction.query = the resolved turn; plan.mentions = the persons/works it names) — never keyword
// intent. Code only checks a term is shared and, if none is, rebuilds the round's first search from that subject.
import { contentWords } from '../search/verbatim.js';

/** Model tool names that search the library by a free-text query (tools.js ALIASES included). */
export const MODEL_SEARCH = new Set(['fused_search', 'combined_search', 'search_library', 'planned_search']);
// request / function words: shared, they prove nothing about the subject
const STOP = new Set(['what', 'which', 'does', 'did', 'about', 'tell', 'quote', 'quotes', 'passage', 'passages', 'find', 'show',
  'give', 'please', 'library', 'said', 'says', 'mean', 'means', 'there', 'their', 'they', 'them', 'this', 'that', 'these',
  'those', 'with', 'from', 'have', 'were', 'when', 'where', 'whom', 'more', 'also', 'into', 'than', 'then', 'some',
  'would', 'could', 'should', 'write', 'wrote', 'written', 'writings', 'book', 'books', 'anything', 'something']);
const ARABIC = /[؀-ۿ]/;

/** The subject's own terms: its content words (minus request words) plus the words of every name Jev resolved. */
export function subjectTerms(subject) {
  const out = new Set([...contentWords(subject?.text)].filter((w) => !STOP.has(w)));
  for (const n of subject?.names || []) for (const w of String(n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/)) if (w.length >= 3 && !STOP.has(w)) out.add(w);
  return out;
}

const shares = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a)));
/** True when the query carries a term of the subject (or the subject has no terms to check — never rebuild on nothing). */
export function onSubject(query, subject) {
  const terms = subjectTerms(subject);
  if (!terms.size) return true;
  const q = String(query || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter((w) => w.length >= 3);
  return q.some((w) => [...terms].some((t) => shares(w, t)));
}

/** The query a drifted search is rebuilt to: the subject's words when short, else its terms; names lead. */
export function subjectQuery(subject) {
  const text = String(subject?.text || '').trim();
  const names = (subject?.names || []).filter(Boolean);
  const base = text && text.split(/\s+/).length <= 20 ? text : [...subjectTerms({ text })].join(' ');
  const missing = names.filter((n) => !onSubject(base, { names: [n] }));
  return [missing[0], base].filter(Boolean).join(' ').trim();
}

/**
 * One round's tool calls ({ name, args }). When the round holds library searches and NONE carries the subject, the
 * first one's query is rebuilt from the subject. A query in Arabic script (the originals) is never judged.
 * @returns {{ calls: Array, rebuilt: null | { from: string, to: string } }}
 */
export function anchorSearches(calls, subject) {
  const searches = calls.filter((c) => MODEL_SEARCH.has(c.name) && typeof c.args?.query === 'string');
  if (!searches.length || !subjectTerms(subject).size) return { calls, rebuilt: null };
  if (searches.some((c) => ARABIC.test(c.args.query) || onSubject(c.args.query, subject))) return { calls, rebuilt: null };
  const to = subjectQuery(subject);
  if (!to) return { calls, rebuilt: null };
  const first = searches[0];
  const from = first.args.query;
  return { calls: calls.map((c) => (c === first ? { ...c, args: { ...c.args, query: to } } : c)), rebuilt: { from, to, index: calls.indexOf(first) } };
}

/** Jev's subject for a model loop: the given one, else the last user message (names kept). */
export function subjectOr(subject, messages) {
  if (subject?.text) return subject;
  const last = [...(messages || [])].reverse().find((m) => m.role === 'user');
  return { text: last ? String(last.content || '') : null, names: subject?.names || [] };
}

/**
 * The same check on one round's OpenAI tool_calls: a rebuilt query is written back into the call's arguments (so the
 * model's own history shows what was searched). → { tcs, rebuilt: null | { from, to, index } }
 */
export function anchorToolCalls(tcs, subject) {
  const calls = tcs.map((tc) => {
    let args = {};
    try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* bad args → not a search we can judge */ }
    return { name: tc.function?.name, args };
  });
  const { calls: out, rebuilt } = anchorSearches(calls, subject);
  if (!rebuilt) return { tcs, rebuilt: null };
  return { tcs: tcs.map((tc, i) => (i === rebuilt.index ? { ...tc, function: { ...tc.function, arguments: JSON.stringify(out[i].args) } } : tc)), rebuilt };
}

/** Does this round hold a library search? (the anchor checks the FIRST such round only — later rounds follow leads.) */
export const hasSearch = (tcs) => tcs.some((tc) => MODEL_SEARCH.has(tc.function?.name));

/** Forensics: the search queries that carry no term of the subject (empty when any of them does). */
export function driftedQueries(queries, subject) {
  const qs = (queries || []).filter((q) => typeof q === 'string' && q.trim() && !ARABIC.test(q));
  if (!qs.length || !subjectTerms(subject).size) return [];
  return qs.some((q) => onSubject(q, subject)) ? [] : qs;
}

/** Jev's current subject: the resolved turn and the names its plan resolved. */
export function jevSubject(direction, plan) {
  const names = [];
  for (const m of plan?.mentions || []) for (const n of [m?.name, m?.matched]) if (n && !names.includes(n)) names.push(n);
  return { text: direction?.query || null, names };
}
