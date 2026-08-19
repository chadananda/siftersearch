// concepts/disambiguate — the ARGUMENT-CARRYING disambiguation variant (docs/architecture/conceptual-track.md §7).
// A doctrinal passage is rarely opaque because of a NAME; it is opaque because it continues an argument. "this
// Will", "that station", "the aforementioned Covenant" resolve only against what came before — so the note this
// stage writes carries the RUNNING ARGUMENT, and the passage becomes readable standing alone.
//
// :arch: per-paragraph note {argument, resolve[]} written to the same context column enrich/disambiguate uses
// :why: the disambiguation context is the carrier HyPE reads (§7); doctrinal texts need the running development
//       in it, not place/era. SEQUENTIAL, never pooled — a carried argument is inherently ordered.
// :rules: ALTERNATIVE gate for doctrinal works, not a second pass — it stamps its OWN version so coverage can
//         tell the two apart and neither silently overwrites the other's book · resolve to the text's own
//         antecedent ONLY · never invent doctrine · under-resolve · an empty note is still DONE
// :deps: ctx.store.{getDocMeta,getParagraphs,saveContext} · ctx.model.runLadder | consumers: rag/index.js
import { profileFor } from '../kernel/profile.js';
import { isDisambiguated } from '../../pipeline/processed.js';

// REQUIRED field: argument. A note without it has not done this stage's one job, so it is not a note.
export function parseNote(content) {
  try {
    const j = JSON.parse(String(content));
    if (!j || typeof j.argument !== 'string') return null;
    const resolve = Array.isArray(j.resolve)
      ? j.resolve.filter((r) => r && r.phrase && r.refersTo).map((r) => ({ phrase: String(r.phrase), refersTo: String(r.refersTo) }))
      : [];
    return { argument: j.argument.trim(), resolve };
  } catch { return null; }
}

// '' when there is nothing to carry — an EMPTY note is a DONE note: the stage examined the paragraph and
// found nothing standing between the reader and the passage. Same doctrine as the entity variant.
export function renderNote(note) {
  if (!note) return '';
  const refs = (note.resolve || []).map((r) => `${r.phrase} = ${r.refersTo}`).join('; ');
  return [note.argument, refs].filter(Boolean).join(' · ');
}

// A failed paragraph must NOT wipe the thread — the argument survives the gap and the next paragraph still
// resolves against it. Losing the thread on one bad JSON parse would silently corrupt every later note.
export function carryState(note, prev) {
  return note && note.argument ? note.argument : prev;
}

// STABLE prefix (byte-identical across the whole book, so the cache holds); the variable tail lives in buildUser.
export function buildSystem(meta = {}, profile = {}) {
  return [
    'You make a DOCTRINAL passage readable on its own by stating the argument it is carrying.',
    `WORK: ${meta.title || 'unknown'}${meta.author ? ` — ${meta.author}` : ''}.`,
    '',
    'Return ONLY JSON: {"argument": "...", "resolve": [{"phrase": "...", "refersTo": "..."}]}',
    '',
    'argument — one or two clauses: the development this passage continues or advances.',
    'resolve  — back-references ("this Will", "that station", "the aforementioned Covenant") mapped to their',
    '           ANTECEDENT: what the text itself already named. Nothing else belongs here.',
    '',
    'RULES',
    '- Resolve ONLY to an antecedent present in the passage or in the carried argument. If the antecedent is',
    '  not there, UNDER-RESOLVE: leave it out. A wrong antecedent is worse than a missing one.',
    '- NEVER invent doctrine, meaning, or interpretation. You are recording what the text is arguing, not what',
    '  it means. Interpretation belongs to the authorities the lexicon cites, never to you.',
    '- Keep the author\'s own terms. Do not paraphrase a technical term into a familiar one.',
    '- Empty is legitimate: {"argument": "", "resolve": []} when the passage stands alone already.',
  ].join('\n');
}

// Variable tail: the carried argument (tiny) + the one paragraph.
export function buildUser(para = {}, state = '') {
  return `${state ? `CARRIED ARGUMENT SO FAR: ${state}\n\n` : ''}PASSAGE:\n${para.text || ''}`;
}

export async function run(ctx, docId, opts = {}) {
  const profile = await profileFor(ctx, docId).catch(() => ({ models: {}, fallback: undefined }));
  const [meta, all] = await Promise.all([ctx.store.getDocMeta(docId), ctx.store.getParagraphs(docId)]);
  const version = opts.version ?? ctx.config?.versions?.conceptDisambig ?? 'concept-disambig-v1';
  const system = buildSystem(meta, profile);
  const route = { model: opts.model ?? profile.models?.disambig, fallback: opts.fallback ?? profile.fallback };
  // `limit` bounds a run. This stage is SEQUENTIAL (the carried argument makes it so), so an unbounded run
  // over a whole book cannot finish inside an HTTP request — a 292-paragraph Íqán run through the control
  // API died on a Cloudflare 524. Bounded runs make the endpoint usable for verification; a full book belongs
  // on the queue, like grounding, not in a request.
  const todo = all.filter((p) => opts.force || !isDisambiguated(p, version))
    .slice(0, opts.limit && opts.limit > 0 ? opts.limit : undefined);
  const stats = { paras: all.length, todo: todo.length, written: 0, failed: 0, empty: 0 };
  // SEQUENTIAL by design. Every other stage pools for throughput; this one cannot — paragraph N's note is
  // only correct if N-1's argument is already in hand, so concurrency here would silently produce notes that
  // resolve against nothing. Slower is the cost of the thread being real.
  let state = '';
  for (const p of todo) {
    const { parsed } = await ctx.model.runLadder({ route, system, user: buildUser(p, state), parse: parseNote, maxTokens: 500 });
    if (!parsed) { stats.failed++; continue; }
    state = carryState(parsed, state);
    const note = renderNote(parsed);
    if (!note) stats.empty++;
    if (!opts.dryRun) { await ctx.store.saveContext(p.pid ?? p.id, note, version); stats.written++; }
  }
  ctx.log?.info?.({ docId, ...stats }, 'concepts/disambiguate');
  return stats;
}
