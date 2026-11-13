// Pure tool-definition helpers (no server deps; bundles for a Worker): canonWork, translationLabel, llmTools builder, work_notes lookup.
// tools.js / tool-kit.js re-export these. Deps: work-canon
import { CANON } from './work-canon.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`ʻʼ]/g, "'").toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim();
/** The canon entry a reader's title names (any alias, accents and "the" ignored), or null. */
export function canonWork(title, canon = CANON) {
  const q = fold(title).replace(/^the /, '');
  if (!q) return null;
  return canon.find((w) => [w.title, ...(w.aliases || [])].some((a) => fold(a).replace(/^the /, '') === q))
    || canon.find((w) => [w.title, ...(w.aliases || [])].some((a) => { const f = fold(a).replace(/^the /, ''); return f.length > 5 && (q.includes(f) || f.includes(q)); })) || null;
}

/** What kind of translation a text is, for the brief and the reply's row markers. Pure. */
export function translationLabel(by, authority) {
  const s = `${by || ''} ${authority || ''}`;
  if (/shoghi/i.test(s)) return 'authorized — Shoghi Effendi';
  if (/universal house|world cent(re|er)|research department/i.test(s)) return 'authorized — Bahá’í World Centre';
  if (/phelps/i.test(s)) return 'provisional — Stephen Phelps (public domain)';
  if (/published|committee/i.test(s)) return by ? `published — ${by}` : 'published translation';
  return by ? `translation by ${by}` : 'translation';
}

// a passage the agent can cite: the link under source_url (renderRefs), the place beside the title
export const asPassage = (p) => ({ ...p, source_url: p.source_url || p.url || p.citation_url || null, document_id: p.document_id ?? p.doc_id ?? null,
  ...(p.place ? { note: `at ${p.place}` } : {}) });
// the same question reworded 0.91; narrower/broader 0.73–0.81 (research-cache.js re-exports)
export const SAME_QUESTION = 0.88;

/** work_notes_lookup's data: { work, notes } for a title; `loadNotes` → { works: [{ title, notes }] }. Pure given the loader. */
export async function workNotes(title, loadNotes) {
  const w = canonWork(title);
  if (!w) return { work: null, notes: [] };
  return { work: w.title, notes: ((await loadNotes())?.works || []).find((x) => x.title === w.title)?.notes || [] };
}

/** OpenAI-style tool definitions for `names`, generated from the input schemas of `resolve(name)` minus llmOmit. A tool on a known
 *  passage (refInput) takes the passage's ref (P#) from a model instead of its ids; the runner resolves the ref. */
export const makeLlmTools = (resolve) => (names) => names.map((n) => {
  const e = resolve(n);
  if (!e?.input) throw new Error(`no LLM tool: ${n}`);
  const props = Object.fromEntries(Object.entries(e.input.properties).filter(([k]) => !(e.llmOmit || []).includes(k))
    .map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([kk]) => !['$id', 'minLength', 'maxLength', 'default', 'minimum', 'maximum', 'additionalProperties'].includes(kk)))]));
  const parameters = e.refInput
    ? { type: 'object', properties: { ref: { type: 'string', description: 'The passage ref, e.g. P3' }, ...(e.name === 'context_lookup' ? { before: { type: 'integer' }, after: { type: 'integer' } } : {}) }, required: ['ref'] }
    : { type: 'object', properties: props, required: (e.input.required || []).filter((k) => k in props) };
  return { type: 'function', function: { name: e.name, description: e.description || e.purpose, parameters } };
});
