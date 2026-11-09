// The generic tree ELEMENTS (planning/anis-strategy-trees.md §2): fetch.* / search.* / read.* / judge / switch / rank / shape / hand.* and the
// shared ends ($absence $fallback $unavailable), as graph activities over named context UNITS (s.units, §2a). They wrap tools.js tools
// (no new retrieval); every retrieval applies the scope units (scope ∩ params; named things RANKED not filtered), reports scope_excluded,
// keeps error distinct from none, and leaves a per-node note (units read, params, count, scope_excluded) that graph.js puts in the trace.
// Test seams: s.tools[name](input, ctx) replaces a tool, s.jev(q) the Jev call, s.templates[id] a template, s.agentRun the agent.
import { run as runTool } from '../tools.js';
import { canonicalTradition } from '../tradition-name.js';
import { parseScriptureRef } from '../scripture-ref.js';
import { template, fill } from './templates.js';
import { sourceTier } from '../source-tier.js';
import { judgeHolds, judgeTimeline, termScript } from '../judges.js';

// ── units, scope, outcomes ──────────────────────────────────────────────────────────────────────────────────────────────
export const U = (s) => {
  const u = (s.units ||= {});
  for (const k of ['found_passages', 'found_records', 'web_found', 'missing', 'path', 'defects', 'offers']) u[k] ||= [];
  u.found_outcome ||= {}; u.scope_excluded ??= 0; u.religions_specified ??= 'all'; u.authority_floor ??= 'any'; u.current_user_question ??= s.question ?? '';
  return u;
};
const flat = (v) => (Array.isArray(v) ? v.map(flat).join(' ') : v && typeof v === 'object' ? (v.name ?? v.title ?? v.label ?? v.text ?? '') : v ?? '');
const slots = (u) => ({ ...Object.fromEntries(Object.entries(u).map(([k, v]) => [k, /^found_/.test(k) ? (v?.length ? 'the passages below' : '') : Array.isArray(v) ? v.map(flat).join(', ') : flat(v)])), base: u.base ?? '' });
const sub = (u, v) => (typeof v === 'string' ? fill(v, slots(u)) : v);
const deep = (o, f) => (Array.isArray(o) ? o.map((x) => deep(x, f)) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, deep(v, f)])) : f(o));
const text = (s, u, ...cands) => String(cands.map((c) => flat(sub(u, c))).find((x) => String(x).trim()) ?? u.current_user_question).trim();
const call = (s, tool, input) => (s.tools?.[tool] ? s.tools[tool](input, s.ctx) : runTool(tool, input, s.ctx || {}));
const trim = (v) => (typeof v === 'string' ? v.slice(0, 160) : Array.isArray(v) ? v.slice(0, 5).map(trim) : v && typeof v === 'object' ? flat(v) : v);
const tradsOf = (u) => (Array.isArray(u.religions_specified) && u.religions_specified.length ? u.religions_specified.map(canonicalTradition) : null);
const FLOOR = { scripture: ['scripture'], interpretation: ['scripture', 'interpretation'] };
// Chad 11-09: a `doctrinal` search draws on the Writings, the Guardian and compilations of the Writings; talks, the House and studies join only from a named source
// or when fewer than DOC_MIN doctrinal passages are found (same rule as strategies.js compilation()). Tier 1 = authority-filtered (fused tiers[] escalate in one call; hype escalates by a second call).
const DOCTRINAL = new Set(['writings', 'guardian', 'compilation']), DOC_MIN = 3, DOC_AUTH = ['scripture', 'interpretation'];
const kindOf = (p) => p.authority ?? p.authority_kind;
const key = (p) => p.id ?? p.text ?? JSON.stringify(p);
/** Scope: filter mode drops out-of-scope hits (counted); rank mode keeps every hit, in-scope first, the rest marked out_of_scope. Named sources always first. */
export function scoped(items, u, rank) {
  const t = tradsOf(u), named = new Set((Array.isArray(u.named_sources) ? u.named_sources : []).map(String));
  const inScope = (p) => !t || !p.religion || t.includes(canonicalTradition(p.religion));
  const first = (a) => (named.has(String(a.document_id ?? a.id)) ? 0 : 1);
  const order = (a) => [...a].sort((x, y) => first(x) - first(y));
  if (rank) { const m = items.map((p) => (inScope(p) ? p : { ...p, out_of_scope: true })); return { items: order([...m.filter((p) => !p.out_of_scope), ...m.filter((p) => p.out_of_scope)]), excluded: 0 }; }
  const keep = items.filter((p) => inScope(p) && (!FLOOR[u.authority_floor] || !kindOf(p) || FLOOR[u.authority_floor].includes(kindOf(p))));
  return { items: order(keep), excluded: items.length - keep.length };
}
const merge = (u, into, items) => { const seen = new Set(u[into].map(key)); for (const p of items) if (!seen.has(key(p))) { seen.add(key(p)); u[into].push(p); } };
const classify = (n, edges, thin = false) => (n === 0 ? 'none' : thin && edges.includes('thin') ? 'thin' : n === 1 && edges.includes('one') ? 'one' : edges.includes('several') ? 'several' : 'one');
const finish = (s, p, edge, { count = 0, excluded = 0, read = {}, error = null, search = null } = {}) => {
  const u = U(s); u.found_outcome[s.node ?? p.id ?? '?'] = edge; u.scope_excluded += excluded;
  if (edge === 'none' || edge === 'error') u.missing.push({ node: s.node ?? null, edge, ...(error ? { error } : {}) });
  s.note = { read: Object.fromEntries(Object.entries({ religions_specified: u.religions_specified, authority_floor: u.authority_floor, ...read }).map(([k, v]) => [k, trim(v)])), params: p, count, scope_excluded: excluded, ...(search ? { search } : {}), ...(error ? { error } : {}) };
  return edge;
};
const kOf = (p, u) => (p.k && typeof p.k === 'object' ? (u.depth === 'research' && p.k.research !== undefined ? p.k.research : p.k.many !== undefined && (u.compare_sides || []).length > 4 ? p.k.many : p.k.default) : p.k);   // many: k once more than four sides
const SCOPE = ['religions_specified', 'authority_floor', 'named_sources', 'search_originals'];
const OUT = ['found_outcome', 'scope_excluded', 'missing'];
const CMN = ['stage', 'tradition', 'scope', 'k', 'min', 'thin_below'];

// ── retrieval factory: tool → items → scope → merge into a unit → outcome edge ───────────────────────────────────────────
// (run is called detached by graph.js: no `this`)
const retrieval = ({ edges, tool, input, take, into = 'found_passages', rank = false, params = [], reads = [], thin = null, after = null, gate = null }) => ({
  kind: 'tool', cls: 'code', edges, scope: 'strategy', params: [...CMN, 'query', ...params], reads: [...SCOPE, ...reads], writes: [into, ...OUT],
  async run(s, p0 = {}) {
    const u = U(s), p = { ...p0, ...u.param_overrides?.[s.node] }, t = tradsOf(u);
    if (p.tradition && t && !t.includes(canonicalTradition(p.tradition))) return finish(s, p, 'none', { read: { tradition: p.tradition } });   // scope ∩ params empty: a free none
    // gated off (e.g. in_named with no named work): routes as none, but it is no gap and no failed tier (found_outcome 'skipped')
    if (gate && !gate(s, u, p)) { const e = finish(s, p, 'none'); u.missing.pop(); u.found_outcome[s.node ?? p.id ?? '?'] = 'skipped'; return e; }
    let out, inp;
    let raw, pick = null;
    try {
      inp = input(s, p, u, t?.length === 1 ? t[0] : undefined);
      if (!p.doctrinal) { out = await call(s, tool, inp); raw = take(out, p, u) || []; }
      else {
        const fused = tool === 'fused_search', n1 = { ...inp, filters: { ...inp.filters, authority: DOC_AUTH }, ...(fused ? { tiers: ['authority'], min_results: DOC_MIN } : {}) };
        raw = take(await call(s, tool, n1), p, u) || [];
        const named = new Set((Array.isArray(u.named_sources) ? u.named_sources : []).map(String)), tierOf = (x) => sourceTier(x);
        const isDoc = (x) => { const t = tierOf(x); return !t || DOCTRINAL.has(t); };
        if (!fused && raw.filter(isDoc).length < DOC_MIN) raw = [...raw, ...(take(await call(s, tool, inp), p, u) || [])];   // hype has no tiers[]: the second call is the escalation
        const doc = raw.filter(isDoc), keepAll = doc.length < DOC_MIN, other = raw.length - doc.length;
        if (!keepAll) raw = raw.filter((x) => isDoc(x) || named.has(String(x.document_id ?? x.id)));
        pick = { doctrinal: doc.length, other, chosen: keepAll ? 'all' : 'doctrinal', keepAll };
      }
    } catch (err) { return finish(s, p, 'error', { error: err?.message || String(err) }); }
    if (pick && pick.other) (s.direction?.decisions ?? s.ctx?.decisions)?.record?.('compilation:sources', { by: 'code', saw: { doctrinal: pick.doctrinal, other: pick.other }, options: ['doctrinal', 'all'],
      chosen: pick.chosen, reason: pick.keepAll ? 'too few doctrinal passages' : 'doctrinal by default; only a named source adds others' });
    const kinds = [p.authority].flat().filter(Boolean);
    if (kinds.length) raw = raw.filter((x) => !kindOf(x) || kinds.includes(kindOf(x)));
    const { items, excluded } = scoped(raw, u, p.scope === 'rank' || rank);
    merge(u, into, items); after?.(out, u, items);
    return finish(s, p, classify(items.length, edges, thin ? thin(items, p) : items.length > 0 && items.every((x) => typeof x.score === 'number' && x.score < (p.thin_below ?? 0.25))), { count: items.length, excluded, read: { query: inp }, search: inp && typeof inp === 'object' ? { query: inp.query, filters: inp.filters ?? {} } : null });
  },
});
// in_named: search INSIDE the work the question names (named_work title, else the first named source id); gated off when none is named
const namedWork = (u) => (typeof u.named_work === 'string' && u.named_work.trim() ? { work: u.named_work.trim() }
  : u.named_work != null && Number.isFinite(Number(u.named_work)) ? { documentId: Number(u.named_work) }
  : Array.isArray(u.named_sources) && u.named_sources.length ? { documentId: u.named_sources[0] } : null);
const personOf = (u) => { const n = flat(u.named_person); return typeof n === 'string' && n.trim() && !Number.isFinite(Number(n)) ? n.trim() : null; };
// HARD filters first (Chad 11-09): the tradition, the named work, the named author. `wide` = the widening pass: none of them (run when the filtered pass was thin)
const searchInput = (s, p, u, trad) => { const filters = p.wide ? {} : { ...(trad ? { tradition: trad } : {}), ...(p.in_named ? namedWork(u) : {}), ...(p.by_person ? { author: personOf(u) } : {}), ...(p.author ? { author: p.author } : {}), ...(p.language ? { language: p.language } : {}), ...(p.work ? { work: p.work } : {}) };
  return { query: text(s, u, p.query, '{{topic}}'), limit: kOf(p, u) ?? 8, ...(Object.keys(filters).length ? { filters } : {}), ...(Array.isArray(p.layers) && p.layers.length ? { layers: p.layers } : {}), ...(Array.isArray(p.tiers) && p.tiers.length ? { tiers: p.tiers } : {}), ...(p.spell ? { spell: true } : {}) }; };
// a pass ran with hard filters (so a thin result has something to widen from)
const hardFiltered = (u) => !!(namedWork(u) || personOf(u) || tradsOf(u));
const passages = (o) => o?.passages;
const notBuilt = (tool, edges) => ({ kind: 'tool', cls: 'code', edges, scope: 'strategy', params: [...CMN, 'id', 'key', 'subject', 'date'], reads: SCOPE, writes: ['found_records', ...OUT],
  async run(s, p = {}) {   // index not built yet: still called (a hook may serve it), else none at no cost so the tree does not change when it arrives
    const u = U(s);
    if (!s.tools?.[tool]) return finish(s, p, 'none');
    try { const r = (await s.tools[tool](p, s.ctx)) || []; const { items, excluded } = scoped([r].flat().filter(Boolean), u, true); merge(u, 'found_records', items); return finish(s, p, classify(items.length, edges), { count: items.length, excluded }); } catch (err) { return finish(s, p, 'error', { error: err?.message }); }
  } });

// ── the element table ───────────────────────────────────────────────────────────────────────────────────────────────────
const E = {
  'fetch.work': retrieval({ edges: ['one', 'several', 'none', 'error'], tool: 'document_search', rank: true, params: ['lang', 'title'], reads: ['named_work'],
    input: (s, p, u) => ({ title: text(s, u, p.title, '{{named_work}}') }), take: (o) => o?.works, into: 'found_records', thin: () => false }),
  'fetch.reference': retrieval({ edges: ['one', 'several', 'none', 'error'], tool: 'reference', rank: true, reads: ['scripture_reference'], thin: () => false,
    gate: (s, u, p) => !!(u.scripture_reference || parseScriptureRef(text(s, u, p.query))),
    input: (s, p, u) => ({ question: text(s, u, p.query), decisions: s.direction?.decisions ?? s.ctx?.decisions, deps: s.ctx?.deps }), take: passages }),
  'fetch.phrase': retrieval({ edges: ['one', 'several', 'thin', 'none', 'error'], tool: 'quotation_candidates', rank: true, params: ['mode', 'words'], reads: ['quoted_words', 'quoted_clean'],
    input: (s, p, u) => ({ quotation: text(s, u, p.words, '{{quoted_clean}}', '{{quoted_words}}') }), take: passages,
    thin: (items, p) => p.mode === 'close' && !items.some((x) => x.role === 'source') }),
  'fetch.person': retrieval({ edges: ['one', 'several', 'none', 'error'], tool: 'biography_search', rank: true, params: ['name'], reads: ['named_person'], into: 'found_records',
    input: (s, p, u) => ({ query: text(s, u, p.name, '{{named_person}}') }), take: (o) => o?.people, thin: () => false }),
  'fetch.renderings': retrieval({ edges: ['one', 'several', 'none', 'error'], tool: 'rendering_lookup', rank: true, params: ['term', 'translator'], reads: ['term'],
    gate: (s, u, p) => /[\u0600-\u06FF]/.test(text(s, u, p.term, '{{term_arabic}}', '{{term}}')),   // Arabic script only: Latin → Arabic is the term_arabic unit (Jev), not the tool
    input: (s, p, u) => ({ term_arabic: text(s, u, p.term, '{{term_arabic}}', '{{term}}'), ...(p.translator ? { translator: p.translator } : {}) }), take: (o) => (o?.found ? o.passages : []), thin: () => false,
    after: (o, u) => { if (o?.found) merge(u, 'found_records', [{ term: o.term, transliteration: o.transliteration, root: o.root, meaning: o.meaning, renderings: o.renderings }]); } }),
  'fetch.prayer': retrieval({ edges: ['one', 'several', 'none', 'error'], tool: 'prayer_lookup', params: ['key', 'value'], reads: ['occasion', 'incipit'],   // the prayer book's own headings and attribution lines; no heading/incipit match = none (p2 then searches the shelf)
    input: (s, p, u) => { const inc = p.key === 'incipit' || (!p.key && u.incipit); return { [inc ? 'incipit' : 'occasion']: text(s, u, p.value, inc ? '{{incipit}}' : '{{occasion}}') }; }, take: passages, thin: () => false }),
  'fetch.guidance': retrieval({ edges: ['one', 'several', 'none', 'error'], tool: 'fused_search', reads: ['topic'], thin: () => false,
    input: (s, p, u) => ({ query: text(s, u, p.query, '{{topic}}'), filters: { author: 'Universal House of Justice' }, limit: kOf(p, u) ?? 6 }), take: passages }),
  'fetch.work_notes': retrieval({ edges: ['one', 'none', 'error'], tool: 'work_notes_lookup', rank: true, params: ['work'], reads: ['named_work'], into: 'found_records',
    input: (s, p, u) => ({ title: text(s, u, p.work, '{{named_work}}') }), take: (o) => (o?.work ? o.notes.map((n) => ({ ...n, work: o.work })) : []), thin: () => false }),
  'fetch.collection': notBuilt('collection', ['one', 'thin', 'none', 'error']),
  'fetch.events': notBuilt('events', ['one', 'several', 'none', 'error']),
  'fetch.calendar': notBuilt('calendar', ['one', 'none', 'error']),
  'fetch.activity': notBuilt('activity', ['one', 'none', 'error']),
  'fetch.facts': { kind: 'tool', cls: 'code', edges: ['one', 'error'], scope: 'strategy', params: ['stage'], reads: [], writes: ['found_records', 'found_outcome'],
    async run(s, p = {}) {
      try { const f = await (s.tools?.facts ? s.tools.facts({}, s.ctx) : import('../../library/library-stats.js').then((x) => x.readLibraryStats())); if (!f) return finish(s, p, 'error', { error: 'no stats' }); merge(U(s), 'found_records', [{ kind: 'library_facts', ...f }]); return finish(s, p, 'one', { count: 1 }); } catch (err) { return finish(s, p, 'error', { error: err?.message }); }
    } },
  'fetch.anchor': { kind: 'tool', cls: 'code', edges: ['one', 'thin', 'none', 'error'], scope: 'strategy', params: ['stage'], reads: ['referent', 'reader_position', 'previous_evidence', 'quoted_words'], writes: ['found_passages', ...OUT],
    async run(s, p = {}) {   // the passage a question is about: the pointed-at item, the reader's place, the last evidence; quoted words alone are thin
      const u = U(s), pos = u.reader_position, hit = (u.referent && typeof u.referent === 'object' && u.referent.text ? u.referent : null) ?? u.previous_evidence?.passages?.[0];
      try {
        if (hit) { merge(u, 'found_passages', [{ ...hit, anchor: true }]); return finish(s, p, 'one', { count: 1, read: { referent: u.referent } }); }
        if (pos?.doc) {
          const c = await call(s, 'context_lookup', { document_id: pos.doc, paragraph_index: pos.paragraph ?? 0, before: 0, after: 0 });
          const items = c?.passages || []; merge(u, 'found_passages', items); return finish(s, p, items.length ? 'one' : 'none', { count: items.length, read: { reader_position: pos } });
        }
        return finish(s, p, u.quoted_words ? 'thin' : 'none', { count: 0, read: { quoted_words: u.quoted_words } });
      } catch (err) { return finish(s, p, 'error', { error: err?.message }); }
    } },
  'fetch.align': { kind: 'tool', cls: 'code', edges: ['one', 'several', 'none', 'error'], scope: 'strategy', params: ['versions', 'passage', 'k', 'stage'], reads: ['found_passages'], writes: ['found_passages', ...OUT],
    async run(s, p = {}) {   // each passage's recorded original and translations (links_lookup), attached as annotations
      const u = U(s), todo = u.found_passages.filter((x) => x.id != null).slice(0, p.k ?? 3);
      const res = await Promise.all(todo.map((x) => call(s, 'links_lookup', { paragraph_id: x.id, quoted_by: false }).then((l) => ({ x, l }), (err) => ({ x, err }))));
      if (res.length && res.every((r) => r.err)) return finish(s, p, 'error', { error: res[0].err?.message });
      let n = 0;
      for (const { x, l } of res) if (l?.original || l?.translations?.length) { n++; x.original = l.original ?? x.original; x.translations = l.translations; }
      return finish(s, p, classify(n, ['one', 'several']), { count: n });
    } },
  'search.shelf': retrieval({ edges: ['one', 'several', 'thin', 'none', 'error'], tool: 'fused_search', params: ['authority', 'doctrinal', 'language', 'author', 'work', 'layers', 'tiers', 'spell', 'in_named', 'by_person', 'wide'], reads: ['topic', 'named_work', 'named_person'], input: searchInput, take: passages,
    gate: (s, u, p) => (!p.in_named || !!namedWork(u)) && (!p.by_person || !!personOf(u)) && (!p.wide || hardFiltered(u)) }),
  'search.hype': retrieval({ edges: ['several', 'thin', 'none', 'error'], tool: 'hype_search', params: ['shelf', 'doctrinal', 'language', 'wide'], reads: ['topic'], input: searchInput, take: passages,
    gate: (s, u, p) => !p.wide || hardFiltered(u) }),
  'search.originals': retrieval({ edges: ['several', 'thin', 'none', 'error'], tool: 'originals_search', reads: ['topic', 'search_originals'], input: searchInput, take: passages,
    gate: (s, u) => u.search_originals !== false && (!tradsOf(u) || tradsOf(u).includes("Baha'i")) }),   // the originals index is the Bahá'í Persian/Arabic Writings: a turn scoped to another tradition skips it
  'search.web': retrieval({ edges: ['one', 'none', 'error'], tool: 'web_search', into: 'web_found', thin: () => false, reads: ['topic'],   // never library evidence; the scope goes in as words
    input: (s, p, u) => ({ query: `${text(s, u, p.query, '{{topic}}')}${Array.isArray(u.religions_specified) ? ` (${u.religions_specified.join(', ')})` : ''}` }),
    take: (o) => (o?.text ? [{ site: o.citations?.[0] ? new URL(o.citations[0], 'https://x').host : null, url: o.citations?.[0] ?? null, snippet: o.text, id: o.citations?.[0] ?? o.text }] : []) }),
};
// fetch.original / fetch.translation: ONE tool call each, picked by direction (original_lookup takes English, translation_lookup the original)
for (const [name, dir] of [['fetch.original', 'to_original'], ['fetch.translation', 'to_translation']]) {
  const el = retrieval({ edges: ['one', 'thin', 'none', 'error'], rank: true, params: ['direction', 'target_lang', 'text'], reads: ['quoted_words', 'target_lang'],
    tool: dir === 'to_original' ? 'original_lookup' : 'translation_lookup', thin: (items) => items.length === 1, take: passages,
    input: (s, p, u) => { const txt = text(s, u, p.text, '{{quoted_words}}', u.found_passages[0]?.text); return dir === 'to_translation' ? { original: txt } : { english: txt }; } });
  E[name] = el;
}

// ── composition: together / fanout / probe ──────────────────────────────────────────────────────────────────────────────
const spawn = (s, node, units = s.units) => ({ ...s, node, units, note: null });
const run1 = (s, node, step, units) => E[step.element].run(spawn(s, node, units), step.params || {});
const size = (u) => u.found_passages.length + u.found_records.length + u.web_found.length;
const TOGETHER = ['one', 'several', 'thin', 'none', 'error'];
E['search.together'] = { kind: 'tool', cls: 'code', edges: TOGETHER, scope: 'strategy', params: ['list', 'stage'], reads: SCOPE, writes: ['found_passages', 'found_records', 'web_found', ...OUT],
  async run(s, p = {}) {   // cheap independent tiers in parallel, merged by one node (inner nodes share the units, so scope_excluded adds up)
    const u = U(s), n0 = size(u), x0 = u.scope_excluded, list = p.list || [];
    const subs = list.map((st, i) => spawn(s, `${s.node}.${i}`));
    const edges = await Promise.all(list.map((st, i) => E[st.element].run(subs[i], st.params || {}).catch(() => 'error')));
    // what each member ran (element, query, hard filters, count) — the judge reads the tree's real searches, not "one unfiltered search"
    const members = list.map((st, i) => ({ node: subs[i].node, element: st.element, edge: edges[i], count: subs[i].note?.count ?? 0, query: subs[i].note?.search?.query, filters: subs[i].note?.search?.filters ?? {}, ...(u.found_outcome[subs[i].node] === 'skipped' ? { skipped: true } : {}) }));
    const n = size(u) - n0;
    if (n > 0) u.missing = u.missing.filter((m) => !String(m.node ?? '').startsWith(`${s.node}.`));   // a tier that found nothing is not a gap when another tier found the answer
    const live = edges.filter((e, i) => u.found_outcome[`${s.node}.${i}`] !== 'skipped');   // gated-off members do not vote
    if (!live.length && list.length) { const e = finish(s, p, 'none'); u.missing.pop(); u.found_outcome[s.node ?? '?'] = 'skipped'; return e; }   // every member gated off: no gap, no failed tier
    const edge = live.length && live.every((e) => e === 'error') ? 'error' : n > 0 && edges.every((e) => ['thin', 'none', 'error'].includes(e)) && edges.includes('thin') ? 'thin' : classify(n, TOGETHER);
    const note = finish(s, p, edge, { count: n, read: { list: list.map((x) => x.element), edges: edges.join(',') } }); s.note.scope_excluded = u.scope_excluded - x0; s.note.members = members; return note;
  } };
E['search.fanout'] = { kind: 'tool', cls: 'code', edges: ['all', 'some_thin', 'all_none', 'error'], scope: 'strategy', params: ['by', 'facets', 'inner', 'stage'], reads: SCOPE, writes: ['found_passages', 'found_records', ...OUT],
  async run(s, p = {}) {   // the inner element once per value (compare_sides, sub_themes…), in parallel, each on its own units; items tagged with their value
    const u = U(s), values = p.facets ?? u[p.by] ?? [];
    const runs = await Promise.all(values.map(async (v, i) => {
      const own = { ...u, found_passages: [], found_records: [], web_found: [], found_outcome: {}, missing: [], path: [], scope_excluded: 0 };
      const step = { element: p.inner.element, params: deep(p.inner.params || {}, (x) => (typeof x === 'string' ? x.replaceAll('{{value}}', flat(v)) : x)) };
      const edge = await run1(s, `${s.node}.${i}`, step, own).catch(() => 'error');
      return { v, own, edge };
    }));
    let n = 0;
    for (const { v, own } of runs) { for (const k of ['found_passages', 'found_records']) merge(u, k, own[k].map((x) => ({ ...x, side: flat(v) }))); n += own.found_passages.length + own.found_records.length; u.scope_excluded += own.scope_excluded; }
    const weak = (e) => ['none', 'thin', 'error'].includes(e);
    return finish(s, p, !runs.length || runs.every((r) => r.edge === 'error') ? 'error' : runs.every((r) => r.edge === 'none' || r.edge === 'error') ? 'all_none' : runs.some((r) => weak(r.edge)) ? 'some_thin' : 'all', { count: n, read: { by: p.by, values } });
  } };
E['search.compare'] = { kind: 'tool', cls: 'code', edges: ['all', 'some_thin', 'all_none', 'error'], scope: 'strategy', params: ['by', 'k', 'tiers', 'stage'], reads: SCOPE, writes: ['found_passages', ...OUT],
  async run(s, p = {}) {   // compare_search: ONE call for every side (the same query held to each side's filters); items tagged with their side. No judge inside — the tree decides once after.
    const u = U(s), values = u[p.by ?? 'compare_sides'] ?? [];
    let r; try { r = await call(s, 'compare_search', { query: text(s, u, p.query, '{{topic}}'), sides: values.map((v) => ({ label: flat(v), filters: { tradition: canonicalTradition(flat(v)) } })), k: kOf(p, u) ?? 3, ...(p.tiers ? { tiers: p.tiers } : {}) }); } catch (e) { return finish(s, p, 'error', { error: e?.message }); }
    const sides = r?.sides ?? []; let n = 0;
    for (const sd of sides) { merge(u, 'found_passages', sd.passages.map((x) => ({ ...x, side: sd.label }))); n += sd.passages.length; }
    const empty = (sd) => !sd.passages.length;
    return finish(s, p, !sides.length || sides.every(empty) ? 'all_none' : sides.some(empty) ? 'some_thin' : 'all', { count: n, read: { by: p.by ?? 'compare_sides', values } });
  } };
E.probe = { kind: 'decision', cls: 'code', edges: ['match', 'adjust', 'mismatch'], scope: 'strategy', params: ['step', 'sample', 'expect', 'target', 'stage'], reads: SCOPE, writes: ['param_overrides'],
  async run(s, p = {}) {   // run a search step on a small sample; do the hits match what the plan expects? partial → adjust the target node's params; none → mismatch (recorded on the node)
    const u = U(s), own = { ...u, found_passages: [], found_records: [], web_found: [], found_outcome: {}, missing: [], path: [], scope_excluded: 0 }, ex = p.expect || {};
    const edge0 = await run1(s, `${s.node}.probe`, { element: p.step.element, params: { ...p.step.params, k: p.sample ?? 5 } }, own).catch(() => 'error');
    const hits = [...own.found_passages, ...own.found_records].slice(0, p.sample ?? 5);
    const ok = (h) => (!ex.language || h.language === ex.language) && (!ex.author || String(h.author || '').includes(ex.author)) && (!ex.kind || (kindOf(h) ?? h.role) === ex.kind);
    const good = hits.filter(ok).length, frac = hits.length ? good / hits.length : 0;
    const edge = edge0 === 'error' || !hits.length || !good ? 'mismatch' : frac >= 0.6 ? 'match' : 'adjust';
    if (edge === 'adjust' && p.target) (u.param_overrides ||= {})[p.target] = { ...(ex.language ? { language: ex.language } : {}), ...(ex.author ? { author: ex.author } : {}) };
    if (edge === 'mismatch') u.defects.push({ kind: 'probe_mismatch', node: s.node, expect: ex });
    s.note = { read: { expect: ex }, params: p, count: hits.length, matched: good, scope_excluded: own.scope_excluded };
    return edge;
  } };

// ── read ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
E['read.around'] = { kind: 'transform', cls: 'code', edges: ['done'], scope: 'strategy', params: ['k', 'before', 'after', 'stage'], reads: ['found_passages'], writes: ['found_passages'],
  async run(s, p = {}) {   // context_lookup on each passage to be quoted (a copyrighted book is never read around)
    const u = U(s), top = u.found_passages.filter((x) => x.document_id != null && x.paragraph_index != null).slice(0, p.k ?? 4);
    await Promise.all(top.map((x) => call(s, 'context_lookup', { document_id: x.document_id, paragraph_index: x.paragraph_index, before: p.before ?? 2, after: p.after ?? 2 })
      .then((c) => { if (c?.copyright) x.copyright = true; else if (c?.passages?.length) x.context = c.passages; }, () => {})));
    s.note = { read: { found_passages: u.found_passages }, params: p, count: top.filter((x) => x.context).length, scope_excluded: 0 };
    return 'done';
  } };
E['read.source'] = { kind: 'transform', cls: 'code', edges: ['traced', 'kept'], scope: 'strategy', params: ['k', 'stage'], reads: ['found_passages'], writes: ['found_passages'],
  async run(s, p = {}) {   // a quotation found in a secondary book → its primary source (source_trace), flagged traced; the secondary copy stays after it
    const u = U(s), top = u.found_passages.slice(0, p.k ?? 3), primary = [];
    await Promise.all(top.map((x) => call(s, 'source_trace', { paragraph_id: x.id, text: x.text }).then((o) => { if (o?.passages?.length) { x.traced = true; primary.push(...o.passages.map((y) => ({ ...y, traced: true, traced_from: x.id }))); } }, () => {})));
    if (primary.length) u.found_passages = [...primary.filter((y, i) => primary.findIndex((z) => key(z) === key(y)) === i), ...u.found_passages.filter((x) => !primary.some((y) => key(y) === key(x)))];
    s.note = { read: { found_passages: top }, params: p, count: primary.length, scope_excluded: 0 };
    return primary.length ? 'traced' : 'kept';
  } };

// ── decisions: switch (code), judge (ONE generic Jev activity), judge.passages ───────────────────────────────────────────
const filled = (v) => (Array.isArray(v) ? v.length > 0 : v != null && v !== '' && v !== 'none');
E.switch = { kind: 'decision', cls: 'code', edges: [], edgesFor: (p) => [...new Set([...Object.values(p?.cases || {}), p?.default ?? 'default'])], scope: 'strategy', params: ['on', 'cases', 'default'], reads: ['<on>'], writes: [],
  run(s, p = {}) {   // on: {first_filled:[units]} | {count:'unit'} | {outcome:'node'} | {unit:'u'} (filled|empty) | {value:'u'}; cases map the result to an edge
    const u = U(s), on = p.on || {};
    const kinds = () => { const ps = u.found_passages; const g = ps.some((x) => kindOf(x) === 'guidance' || /House of Justice/i.test(x.author || '')); return g ? 'has_guidance' : 'writings_only'; };
    const errored = () => Object.values(u.found_outcome).includes('error');
    const v = on.evidence ? (u.found_passages.length ? (on.mix ? kinds() : 'have') : errored() ? 'errored' : 'nothing') : on.first_filled ? on.first_filled.find((k) => filled(u[k])) ?? 'none' : on.count ? (() => { const n = (u[on.count] ?? []).length; return n > 1 ? 'many' : String(n); })()
      : on.outcome ? u.found_outcome[on.outcome] ?? 'none' : on.unit ? (filled(u[on.unit]) ? 'filled' : 'empty') : on.value ? String(flat(u[on.value]) || 'none') : 'none';
    s.note = { read: { on, value: v }, params: p, count: 0, scope_excluded: 0 };
    return (p.cases || {})[v] ?? p.default ?? 'default';
  } };
const defaultJev = async (s, { question, options, state }) => {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) return null;
  const [{ ENDPOINT }, { modelFor }, { stateOf }, { jevCall, JEV_LIMITS }, { jevFetch }] = await Promise.all([import('../../scope-extract.js'), import('../../model-roles.js'), import('../strategy-choice.js'), import('../jev-call.js'), import('../../systemone.js')]);
  const res0 = await jevCall('lookup', async (signal) => {
    const res = await jevFetch('anis-tree-judge')(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelFor('assistant-triage').model, state: `${stateOf(s.messages || [])}\n${state}`, questions: { pick: { type: 'choice', instructions: question, criteria: Object.fromEntries(options.map((o) => [o.edge, o.when])) } } }), signal });
    return res.ok ? (await res.json()).answers?.pick ?? null : null;
  }, JEV_LIMITS.lookup);
  const a = res0.value;
  return a ? { choice: a.choice ?? a.value ?? null, confidence: a.confidence ?? a.distribution?.[a.choice ?? a.value] ?? null } : null;
};
const record = (s, point, d) => { const log = s.direction?.decisions ?? s.ctx?.decisions; log?.record?.(point, { by: 'jev', ...d }); };
E.judge = { kind: 'decision', cls: 'jev', edges: [], edgesFor: (p) => (p?.options || []).map((o) => o.edge), scope: 'strategy', params: ['question', 'options', 'mark', 'default', 'stage'], reads: ['current_user_question', 'previous_conversation_rounds', 'found_passages'], writes: ['path'],
  async run(s, p = {}) {   // ONE Jev decision over a fixed option set; no answer → p.default (else the first option), recorded as a fail-open
    const u = U(s), options = p.options || [], question = sub(u, p.question), seen = u.found_records.concat(u.found_passages).slice(0, 4).map((x) => `- ${x.title || x.name || ''}: ${String(x.text || x.quote || x.meaning || '').slice(0, 200)}`).join('\n');
    let r = null;
    try { r = await (s.jev || ((q) => defaultJev(s, q)))({ question, options, state: seen, units: u, mark: p.mark }); } catch { r = null; }
    const chosen = options.find((o) => o.edge === r?.choice)?.edge ?? p.default ?? options[0]?.edge;
    if (r?.marked && p.mark) for (const i of r.marked) { const x = (u.found_records.length ? u.found_records : u.found_passages)[i]; if (x) x.marked = true; }
    record(s, `tree:${s.node}`, { saw: question, options: options.map((o) => o.edge), chosen, reason: r?.choice === chosen ? null : 'no answer: default' });
    s.note = { read: { question }, params: { options: options.map((o) => o.edge) }, count: 0, scope_excluded: 0, confidence: r?.confidence ?? null };
    return chosen;
  } };
E['judge.passages'] = { kind: 'decision', cls: 'jev', edges: ['answers', 'mentions_only', 'conflict', 'empty'], scope: 'strategy', params: ['precedence', 'question', 'stage'], reads: ['found_passages', 'topic'], writes: ['found_passages'],
  async run(s, p = {}) {   // Jev per passage: answers / only mentions / contradicts another; mentions-only passages drop when others answer
    const u = U(s);
    if (!u.found_passages.length) return 'empty';
    const options = [{ edge: 'answers', when: 'the passage answers the question' }, { edge: 'mentions_only', when: 'the passage only mentions the subject' }, { edge: 'contradicts', when: 'the passage contradicts another of the passages' }];
    const ask = s.jev || ((q) => defaultJev(s, q)), q = sub(u, p.question ?? 'Does this passage answer {{current_user_question}}?');
    const verdicts = await Promise.all(u.found_passages.map((x) => Promise.resolve(ask({ question: q, options, state: String(x.text).slice(0, 400), units: u })).then((r) => r?.choice ?? 'answers', () => 'answers')));
    u.found_passages.forEach((x, i) => { x.verdict = verdicts[i]; });
    const edge = verdicts.includes('contradicts') ? 'conflict' : verdicts.includes('answers') ? 'answers' : 'mentions_only';
    if (edge !== 'mentions_only') u.found_passages = u.found_passages.filter((x) => x.verdict !== 'mentions_only');
    s.note = { read: { question: q }, params: p, count: u.found_passages.length, scope_excluded: 0, verdicts };
    return edge;
  } };

E['judge.holds'] = { kind: 'decision', cls: 'jev', edges: ['holds', 'partial', 'none'], scope: 'strategy', params: ['quotation', 'stage'], reads: ['found_passages', 'quoted_clean', 'quoted_words'], writes: ['found_passages'],
  async run(s, p = {}) {   // ONE call over every candidate from quotation_candidates (never per item): holds / partial / no + the span; a candidate that does not hold drops. Wording alone holds without a model.
    const u = U(s), quotation = text(s, u, p.quotation, '{{quoted_clean}}', '{{quoted_words}}');
    if (!u.found_passages.length) return finish(s, p, 'none');
    try {
      const r = await (s.judges?.holds || judgeHolds)({ quotation, passages: u.found_passages, ...(s.decide ? { decide: s.decide } : {}) });
      u.found_passages = r.passages;
      s.note = { read: { quotation }, params: p, count: r.passages.length, scope_excluded: 0, asked: r.asked, judged: r.judged };
      const edge = r.passages.some((x) => x.verdict === 'holds') ? 'holds' : r.passages.some((x) => x.verdict === 'partial') ? 'partial' : 'none';
      u.found_outcome[s.node ?? 'judge.holds'] = edge; return edge;
    } catch (err) { s.note = { read: { quotation }, params: p, count: 0, scope_excluded: 0, error: err?.message }; return 'none'; }
  } };
E['judge.timeline'] = { kind: 'decision', cls: 'jev', edges: ['matched', 'none', 'unjudged'], scope: 'strategy', params: ['query', 'stage'], reads: ['found_records', 'current_user_question'], writes: ['found_records'],
  async run(s, p = {}) {   // ONE DeepSeek step over the typed people from biography_search: only those whose cited proof does what the question asks stay, each with the book's own clause. No answer → unjudged, people untouched.
    const u = U(s), query = text(s, u, p.query, '{{current_user_question}}'), people = u.found_records.filter((x) => Array.isArray(x.evidence));
    if (!people.length) return finish(s, p, 'none');
    const r = await (s.judges?.timeline || judgeTimeline)({ query, people, ...(s.complete ? { complete: s.complete } : {}) }).catch(() => ({ people, judged: false }));
    s.note = { read: { query }, params: p, count: r.people.length, scope_excluded: 0, judged: r.judged, lead: r.lead ?? '' };
    if (!r.judged) return 'unjudged';
    u.found_records = [...u.found_records.filter((x) => !Array.isArray(x.evidence)), ...r.people];
    return r.people.length ? 'matched' : 'none';
  } };
E['fill.term_script'] = { kind: 'decision', cls: 'jev', edges: ['filled', 'none'], scope: 'strategy', params: ['term', 'stage'], reads: ['term'], writes: ['term_arabic'],
  async run(s, p = {}) {   // the Arabic-script spelling of a Latin term, for fetch.renderings: already Arabic or remembered = free; otherwise ONE Jev/model call
    const u = U(s), term = text(s, u, p.term, '{{term_arabic}}', '{{term}}');
    const r = await (s.judges?.termScript || termScript)(term, s.complete ? { complete: s.complete } : {}).catch(() => null);
    s.note = { read: { term }, params: p, count: r ? 1 : 0, scope_excluded: 0, via: r?.via ?? null };
    if (!r) return 'none';
    u.term_arabic = r.term_arabic; return 'filled';
  } };

// ── rank / shape / plan ─────────────────────────────────────────────────────────────────────────────────────────────────
const ORDER = ['scripture', 'guardian', 'interpretation', 'guidance', 'law', 'prayer', 'history', 'scholarship', 'other'];
const yearOf = (x) => Number(String(x.year ?? x.date ?? '').slice(0, 4)) || 0;
const COMPARE = {
  authority: () => (a, b) => (ORDER.indexOf(kindOf(a) ?? 'other') + 1 || 99) - (ORDER.indexOf(kindOf(b) ?? 'other') + 1 || 99),
  date: () => (a, b) => yearOf(b) - yearOf(a), history: () => (a, b) => yearOf(a) - yearOf(b), score: () => (a, b) => (b.score ?? 0) - (a.score ?? 0),
  length: () => (a, b) => String(a.text ?? '').length - String(b.text ?? '').length, marked: () => (a, b) => (b.marked ? 1 : 0) - (a.marked ? 1 : 0),
  occasion: (u) => (a, b) => (b.occasion === u.occasion ? 1 : 0) - (a.occasion === u.occasion ? 1 : 0), audience: (u) => (a, b) => (b.audience === u.audience ? 1 : 0) - (a.audience === u.audience ? 1 : 0),
  // a named work / named author outranks authority order (Some Answered Questions asked for is not displaced by Gleanings)
  named: (u) => { const f = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '').toLowerCase(), w = flat(u.named_work), who = f(personOf(u)), wf = f(w), src = new Set((Array.isArray(u.named_sources) ? u.named_sources : []).map(String));
    const sc = (x) => (src.has(String(x.document_id ?? '')) || (w !== '' && w != null && (Number.isFinite(Number(w)) ? Number(w) === Number(x.document_id) : wf && f(x.title) && (f(x.title).includes(wf) || wf.includes(f(x.title))))) ? 2 : 0) + (who && f(x.author).includes(who) ? 1 : 0);
    return (a, b) => sc(b) - sc(a); },
  attributed: (u) => { const who = String(flat(u.named_person) || ''); return (a, b) => (who && String(b.author) === who ? 1 : 0) - (who && String(a.author) === who ? 1 : 0); },   // the named author's own works first
  copy: (u) => { const w = String(u.translation_wanted ?? 'authorized'); const r = (x) => (x.translation && String(x.translation).includes(w) ? 0 : x.edition === 'default' ? 1 : x.language === u.reply_language ? 2 : x.translation ? 3 : 4); return (a, b) => r(a) - r(b); },
};
E.rank = { kind: 'transform', cls: 'code', edges: ['done', 'empty'], scope: 'strategy', params: ['by', 'k', 'per', 'best', 'pin', 'group', 'dedupe', 'skip', 'of', 'stage'], reads: ['found_passages', 'state.given'], writes: ['found_passages'],
  run(s, p = {}) {   // order by the listed keys (stable, earlier keys win), pin, drop repeats / already-given, keep the top k; nothing left → empty ($absence)
    const u = U(s), of = p.of ?? 'found_passages', by = [p.by].flat().filter((k) => COMPARE[k]), cmp = by.map((k) => COMPARE[k](u));
    const given = new Set((s.state?.given ?? u.given ?? []).map((g) => String(g.ref ?? g.id ?? g)));
    let items = [...u[of]];
    if (p.dedupe) items = items.filter((x, i) => items.findIndex((y) => key(y) === key(x)) === i);
    if (p.skip === 'given') items = items.filter((x) => !given.has(String(x.id)));
    else if (p.skip === 'flag') items = items.map((x) => (given.has(String(x.id)) ? { ...x, given: true } : x));
    items = items.map((x, i) => [x, i]).sort(([a, i], [b, j]) => { for (const c of cmp) { const d = c(a, b); if (d) return d; } return i - j; }).map(([x]) => x);
    if (p.best && items.length) items = items.filter((x) => flat(x[p.best]) === flat(items[0][p.best]));   // best: only the first-ranked item's value of the field (one edition of the passage, whole)
    const pinned = p.pin ? items.filter((x) => x[p.pin] || x.id === p.pin) : [];
    items = [...pinned, ...items.filter((x) => !pinned.includes(x))];
    const k = kOf(p, u);
    if (p.per && k) { const n = new Map(); items = items.filter((x) => { const g = flat(x[p.per]) || 'other', c = n.get(g) ?? 0; n.set(g, c + 1); return c < k; }); } else if (k) items = items.slice(0, k);   // per: k for EACH value of the field (a side cannot crowd another out)
    if (p.group) { const g = new Map(); for (const x of items) { const kk = flat(x[p.group]) || 'other'; g.set(kk, [...(g.get(kk) || []), x]); } u.groups = [...g].map(([k2, v]) => ({ key: k2, count: v.length, items: v })).sort((a, b) => b.count - a.count); }
    u[of] = items;
    s.note = { read: { by, k }, params: p, count: items.length, scope_excluded: 0 };
    return items.length ? 'done' : 'empty';
  } };
const ABSENCE = 'Say plainly that the library does not hold this ({{widened_clause}}). Then give the nearest real passage below, labelled as the nearest — never present it as an answer. If web results are given, say they are from outside the library, labelled.';
const UNAVAILABLE = "Say: I couldn't search the library just now. Offer to try again. NEVER say the answer is not in the library.";
const DEFAULTS = { 'tpl.absence': ABSENCE, 'tpl.unavailable': UNAVAILABLE };
// MODE BLOCKS: a template holds {{#voice}}…{{/voice}} blocks (voice | widget | site | email | pdf | research, joined with | for several); a block is
// kept only for the unit `channel` (widget-chat → widget, site-chat → site) or, for research, `depth`. Text outside a block is every mode's.
const MODE = { 'widget-chat': 'widget', 'site-chat': 'site' };
export const modeOf = (u) => { const c = u.channel?.id ?? u.channel; return MODE[c] ?? c ?? 'widget'; };
export const modal = (text, u) => { const m = modeOf(u), flag = { research: () => u.depth === 'research', why: () => u.question_frame === 'why', anchor: () => u.found_passages.some((x) => x.anchor), thin: () => Object.values(u.found_outcome || {}).includes('thin') }, on = (names) => names.split('|').some((n) => n === m || (flag[n] ? flag[n]() : !['voice', 'widget', 'site', 'email', 'pdf'].includes(n) && (Array.isArray(u[n]) ? u[n].length > 0 : !!u[n] && u[n] !== 'none'))); return text.replace(/\{\{#([\w|]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, names, body) => (on(names) ? body : '')).replace(/\n{3,}/g, '\n\n'); };
const tplText = (s, id) => s.templates?.[id] ?? (() => { try { return template(id); } catch (err) { if (DEFAULTS[id]) return DEFAULTS[id]; throw err; } })();
// theme = the passage's heading in the writer's evidence: by its side / tradition / authority kind / date, else what the element set
const themeOf = (x, by) => x.theme ?? (by === 'side' ? x.side : by === 'religion' ? x.religion : by === 'date' ? x.date ?? x.year : by === 'authority' ? kindOf(x) : undefined) ?? x.side ?? undefined;
// opts: shared = the shared tpl.<shape> that wraps the strategy's own template as {{base}}; direct = the template alone finishes the reply (no synthesis needed)
const writer = (s, id, extra = {}, opts = {}) => {
  const u = U(s), own = modal(tplText(s, id), u);
  const clause = tradsOf(u) && u.scope_excluded > 0 && ['conversation', 'reader'].includes(u.scope_source) ? `${u.religions_specified.join(', ')} sources only, as you asked — say 'all traditions' to widen.` : '';
  const sl = { ...slots(u), scope_clause: clause, widened_clause: u.widened ? `searched ${flat(u.widened.from)} first, then widened to all traditions` : 'in every tradition searched', missing_sides: (() => { const have = new Set(u.found_passages.map((x) => flat(x.side))), lack = (Array.isArray(u.compare_sides) ? u.compare_sides : []).map(flat).filter((x) => !have.has(x)); return lack.length ? `The library returned NOTHING from ${lack.join(', ')} on this: say so plainly in that section, never fill it from another tradition or from memory.` : ''; })(), missing_line: u.missing.length ? `Not found: ${u.missing.map((m) => m.node).filter(Boolean).join(', ')}.` : '', ...extra };
  const inner = fill(own, sl);
  const how = (opts.shared ? fill(modal(tplText(s, opts.shared), u), { ...sl, base: inner }) : inner).trim();
  const fid = opts.format ?? id;
  s.out = { passages: u.found_passages.map((x) => { const th = themeOf(x, opts.theme_by); return th === undefined ? x : { ...x, theme: th }; }), records: u.found_records,
    plan: { shape: fid, ...(opts.plan || {}), ...(Array.isArray(u.compare_sides) && u.compare_sides.length ? { sides: u.compare_sides } : {}) },
    format: { id: fid, by: opts.format ? `strategy:${opts.format}` : 'element:shape', how, variant: id, ...(opts.direct ? { direct: true } : {}) } };
  return how;
};
E.shape = { kind: 'writer', cls: 'code', edges: ['done'], scope: 'strategy', params: ['template', 'shared', 'by_count', 'allow', 'offers', 'direct', 'theme_by', 'format', 'plan', 'stage'], reads: ['found_passages', 'found_records', 'channel', 'depth', 'reply_language', 'path'], writes: ['offers'],
  run(s, p = {}) {   // the writer instruction from a template (by count, or '@sub' = the sub-tree's) wrapped in its shared tpl.<shape>, for the mode; a sub-run stopped at evidence leaves it alone
    const u = U(s);
    if (s.stopAtShape) return 'done';
    const n = u.found_passages.length, id = p.by_count ? (n === 1 ? p.by_count[1] ?? p.by_count.n : p.by_count.n ?? p.by_count[1]) : p.template === '@sub' ? u.sub_template : p.template;
    writer(s, id, {}, { shared: p.shared, direct: p.direct, theme_by: p.theme_by, format: p.format, plan: p.plan });
    for (const o of [p.offers].flat().filter(Boolean)) u.offers.push({ what: sub(u, o), turn: s.turn ?? null, strategy: s.choice?.strategy ?? null });
    s.note = { read: { template: id, mode: modeOf(u) }, params: p, count: n, scope_excluded: 0, ...(p.direct ? { direct: true } : {}) };
    return 'done';
  } };
E['plan.subthemes'] = { kind: 'tool', cls: 'llm', edges: ['done', 'fail'], scope: 'strategy', params: ['n', 'stage'], reads: ['topic'], writes: ['sub_themes'],
  async run(s, p = {}) {   // the one light generator: no generator wired yet → sub_themes = [topic] (the unit default) and fail
    const u = U(s), topic = u.topic ?? u.current_user_question;
    try { const r = s.tools?.subthemes ? await s.tools.subthemes({ topic, n: p.n ?? 4 }, s.ctx) : null; if (r?.length) { u.sub_themes = r; return 'done'; } } catch { /* falls to the default */ }
    u.sub_themes = [topic]; return 'fail';
  } };

// ── hand-offs and delivery ──────────────────────────────────────────────────────────────────────────────────────────────
E['hand.strategy'] = { kind: 'tool', cls: 'code', edges: ['found', 'thin', 'none', 'error'], scope: 'strategy', params: ['name', 'version', 'upto', 'units', 'min', 'stage'], reads: ['found_passages'], writes: ['found_passages', 'found_records', ...OUT],
  async run(s, p = {}) {   // another strategy's tree as a sub-tree, on the same units (its Jev calls count toward the caller's step-7 budget)
    const u = U(s);
    try {
      const { runGraph, graphFor } = await import('./graph.js');
      const g = s.graphFor ? s.graphFor(p.name, p.version) : graphFor(p.name, p.version);   // version: pin the sub-tree (a candidate runs on the tree it was designed with)
      if (!g) return finish(s, p, 'error', { error: `no tree ${p.name}` });
      Object.assign(u, p.units || {});
      const n0 = u.found_passages.length + u.found_records.length;
      await runGraph(g, { ...s, ...(p.upto === 'evidence' ? { onEvent: () => {} } : {}), trace: [], units: u, done: undefined, stopAtShape: p.upto === 'evidence' || undefined, out: undefined });
      const n = u.found_passages.length + u.found_records.length - n0;
      return finish(s, p, n >= (p.min ?? 1) ? 'found' : n > 0 ? 'thin' : Object.values(u.found_outcome).includes('error') ? 'error' : 'none', { count: n });   // every tier errored and nothing came back: an error, never a false absence
    } catch (err) { return finish(s, p, 'error', { error: err?.message }); }
  } };
E['hand.job'] = { kind: 'tool', cls: 'code', edges: ['queued', 'error'], scope: 'strategy', params: ['kind', 'stage'], reads: SCOPE, writes: ['offers'],
  async run(s, p = {}) {   // queue a job with this tree as the plan and a FROZEN copy of the scope (job kinds with no queue wired answer error)
    const u = U(s), payload = { kind: p.kind, plan: s.graphId ?? null, question: u.current_user_question, scope: Object.fromEntries(SCOPE.map((k) => [k, u[k]])), units: { topic: u.topic, output_form: u.output_form, amount_wanted: u.amount_wanted } };
    try {
      const r = s.tools?.job ? await s.tools.job(payload, s.ctx) : p.kind === 'deep_report' ? await runTool('deep_report', { question: payload.question }, s.ctx || {}) : null;
      if (!r) return finish(s, p, 'error', { error: `no queue for ${p.kind}` });
      u.job = r; u.offers.push({ what: `email the ${p.kind}`, turn: s.turn ?? null }); return finish(s, p, 'queued', { count: 1, read: { scope: payload.scope } });
    } catch (err) { return finish(s, p, 'error', { error: err?.message }); }
  } };
E['deliver.email'] = { kind: 'tool', cls: 'code', edges: ['sent', 'no_address', 'error'], scope: 'strategy', params: ['stage'], reads: ['found_passages', 'reader_card'], writes: [],
  async run(s, p = {}) {   // the letter sender, given the found units; needs a hook (s.tools.deliver_email) and an address
    const u = U(s), to = s.ctx?.email ?? u.reader_card?.email;
    if (!to) return finish(s, p, 'no_address');
    try { if (!s.tools?.deliver_email) return finish(s, p, 'error', { error: 'no sender' }); await s.tools.deliver_email({ to, passages: u.found_passages, records: u.found_records }, s.ctx); return finish(s, p, 'sent', { count: 1 }); } catch (err) { return finish(s, p, 'error', { error: err?.message }); }
  } };
E['fallback.agent'] = { kind: 'tool', cls: 'llm', edges: ['answered', 'fail'], scope: 'strategy', params: ['stage'], reads: ['current_user_question', 'found_passages'], writes: ['defects'],
  async run(s) {   // the research agent: LAST resort, logged as a defect of this tree (which node errored / what was missing)
    if (s.stopAtShape) return 'fail';   // never inside a sub-run: its caller decides
    const u = U(s); u.defects.push({ kind: 'fallback', after: u.path.at(-1) ?? null, missing: u.missing.slice(-3) });
    try {
      const A = s.agentRun ? await s.agentRun(s) : await import('../respond.js').then((x) => x.agentRespond({ messages: s.messages, onEvent: s.onEvent, d: s.d, t0: s.t0 }));
      if (A) { s.done = A; return 'answered'; }
    } catch (err) { console.warn('anis tree fallback failed', err?.message); }
    return 'fail';
  } };

// ── shared ends ($absence $fallback $unavailable; graph.js routes to them without counting them as nodes) ───────────────────
E['end.absence'] = { kind: 'tool', cls: 'code', edges: ['done'], scope: 'strategy', params: [], reads: [...SCOPE, 'missing', 'found_passages', 'web_found'], writes: ['widened', 'found_passages', 'found_outcome'],
  async run(s) {   // the not-found sub-tree (E2): the ONLY place the scope widens (once, stated); the nearest real passage, labelled; then the ABSENCE shape
    if (s.stopAtShape) return 'done';   // a sub-run that stops at evidence leaves the not-found end to its caller
    const u = U(s), was = u.religions_specified;
    if (was !== 'all' || FLOOR[u.authority_floor]) { u.widened = { from: was, floor: u.authority_floor, why: 'nothing in scope' }; u.religions_specified = 'all'; u.authority_floor = 'any'; }
    if (!u.found_passages.length) {
      try { const r = await call(s, 'fused_search', { query: text(s, u, '{{topic}}'), limit: 3 }); merge(u, 'found_passages', (r?.passages || []).slice(0, 3)); } catch { /* the reply still states the absence */ }
    }
    u.found_passages = u.found_passages.map((x) => ({ ...x, nearest: true }));
    writer(s, u.absence_template ?? 'tpl.absence');
    s.note = { read: { widened: u.widened ?? null }, params: {}, count: u.found_passages.length, scope_excluded: 0 };
    return 'done';
  } };
E['end.fallback'] = { ...E['fallback.agent'], params: [] };
E['end.unavailable'] = { kind: 'writer', cls: 'code', edges: ['done'], scope: 'strategy', params: [], reads: ['missing'], writes: [],
  run(s) { writer(s, 'tpl.unavailable'); return 'done'; } };

// ── catalog text (merged into activities/catalog.js ACTIVITY_META) ──────────────────────────────────────────────────────────
const m = (description, input, output, tools = []) => ({ description, input, output, tools });
export const ELEMENT_META = {
  'fetch.work': m('Finds a work by its title in any spelling; named works are ranked by the scope, never filtered.', 'named_work or title', 'found_records (works)', ['document_search']),
  'fetch.reference': m('Reads a numbered reference (Bible, Qur’án, Gita) and returns that passage.', 'the question or scripture_reference', 'found_passages', ['reference']),
  'fetch.phrase': m('Candidates for where quoted words come from (quotation_candidates): the source in core literature, the original tablet, works quoting it, each with a score (share of the quote’s words held). Deterministic, no model; judge.holds decides which candidate is right.', 'quoted_words', 'found_passages (score, role)', ['quotation_candidates']),
  'fetch.person': m('Finds the person record the question names (several bearers of a name come back as several).', 'named_person', 'found_records (people)', ['biography_search']),
  'fetch.original': m('Finds the Arabic or Persian original of an English passage.', 'quoted_words or found_passages', 'found_passages', ['original_lookup']),
  'fetch.translation': m('Finds the existing English translations of an original-language text.', 'quoted_words or found_passages', 'found_passages', ['translation_lookup']),
  'fetch.renderings': m('How the authorized translator rendered a word, with counts and paired passages.', 'term', 'found_passages + found_records', ['rendering_lookup']),
  'fetch.align': m('Attaches each passage’s recorded original and translations.', 'found_passages', 'found_passages (annotated)', ['links_lookup']),
  'fetch.anchor': m('Loads the passage the question is about: the one pointed at, the reader’s place, or the last evidence.', 'referent, reader_position, previous_evidence', 'found_passages', ['context_lookup']),
  'fetch.prayer': m('Serves a prayer from the prayer book by its occasion heading or its opening words: the first in full, then two more. No heading match = none.', 'occasion or incipit', 'found_passages', ['prayer_lookup']),
  'fetch.guidance': m('Finds the House of Justice’s guidance on a subject.', 'topic', 'found_passages', ['fused_search']),
  'fetch.collection': m('A prepared topic collection (index not built yet: answers none at no cost).', 'id, key', 'found_records', []),
  'fetch.events': m('Dated claims about a subject from the entity graph (not built yet: answers none).', 'subject', 'found_records', []),
  'fetch.calendar': m('A Badí‘ calendar date or Holy Day (not built yet: answers none).', 'date or occasion', 'found_records', []),
  'fetch.activity': m('The reader’s reading plans (not built yet: answers none).', 'reader', 'reading_plan', []),
  'fetch.facts': m('Library facts and corpus status.', 'none', 'found_records', []),
  'fetch.work_notes': m('Verified quotations on a core work’s significance, best authority first.', 'named_work', 'found_records', ['work_notes_lookup']),
  'search.shelf': m('Searches the library by authority (scripture, interpretation, guidance…), inside the scope. layers picks which layers run and merges them in one call (literal = exact words, phrase = meaning, hype = questions answered, originals); tiers is the escalation ladder (drop these filters one at a time while fewer than min results come back; each passage says its tier); spell corrects misspellings first, deterministically.', 'topic, scope, layers, tiers, spell', 'found_passages', ['fused_search']),
  'search.hype': m('Question search: paragraphs that answer a question like this one.', 'topic, scope', 'found_passages', ['hype_search']),
  'search.originals': m('Searches the original-language Writings.', 'topic, search_originals', 'found_passages', ['originals_search']),
  'search.web': m('Searches the open web; results are labelled and never quoted as library evidence.', 'topic, scope as words', 'web_found', ['web_search']),
  'search.together': m('Runs cheap independent tiers in parallel and merges their results in one step.', 'list of fetch/search steps', 'found_passages, found_records', []),
  'search.compare': m('One call for every side of a comparison (compare_search): the same question held to each side, results tagged by side; the tree judges once afterward.', 'compare_sides, topic', 'found_passages tagged by side', ['compare_search']),
  'search.fanout': m('Runs one step once per value (each side of a comparison, each sub-theme), in parallel.', 'by (a unit) or facets', 'found_passages tagged by value', []),
  probe: m('Runs a search step on a small sample and checks the hits are what the plan expects; adjusts or flags a mismatch.', 'step, expect', 'param_overrides', []),
  'read.around': m('Reads the paragraphs around each passage that will be quoted.', 'found_passages', 'found_passages (context)', ['context_lookup']),
  'read.source': m('Traces a quotation found in a secondary book to its primary source.', 'found_passages', 'found_passages (traced)', ['source_trace']),
  switch: m('Branches on a unit in code (which is filled, a count, an earlier outcome): no model call.', 'on, cases', 'an edge', []),
  judge: m('ONE Jev decision over a fixed set of options given as params.', 'question, options', 'an option edge', []),
  'judge.passages': m('Jev says per passage whether it answers, only mentions, or contradicts.', 'found_passages', 'found_passages (verdicts)', []),
  'judge.holds': m('One step over all quotation candidates: does each hold the quoted sentence (same words, or another translation)? Marks holds / partial, with the span; the rest drop. Wording that holds needs no model.', 'found_passages (from fetch.phrase), quoted_words', 'found_passages (verdict, span)', []),
  'judge.timeline': m('One step over the typed people of fetch.person: keeps those whose cited proof does what the question asks (met, was present, died…), each with the book’s own clause.', 'found_records (people), the question', 'found_records (people, clause)', []),
  'fill.term_script': m('Fills the term_arabic unit: a Latin term’s Arabic-script spelling (already Arabic or remembered = no model; otherwise one Jev call), so fetch.renderings can look it up.', 'term', 'term_arabic', []),
  'plan.subthemes': m('A light generator for the sub-themes a topic splits into (default: the topic itself).', 'topic', 'sub_themes', []),
  rank: m('Orders what was found by authority, date, score… keeps the top few, skips what was already given.', 'found_passages', 'found_passages', []),
  shape: m('Sets the writer’s instruction from a template chosen by what was found, for the mode.', 'found units', 'the writer instruction', []),
  'hand.strategy': m('Runs another strategy’s tree as a sub-tree on the same units.', 'name', 'found units', []),
  'hand.job': m('Queues a long task as a job with a frozen copy of the scope and offers the result by email.', 'kind', 'a queued job', ['deep_report']),
  'deliver.email': m('Sends the found material as a letter.', 'found units, address', 'a sent letter', []),
  'fallback.agent': m('The research agent, last resort; every use is logged as a defect of the tree.', 'question', 'a finished reply', []),
  'end.absence': m('The shared not-found end: widens the scope once (and says so), gives the nearest real passage, states the absence.', 'missing, found units', 'the absence reply', ['fused_search']),
  'end.fallback': m('The shared fallback end: the research agent after a tier errored.', 'question', 'a finished reply', []),
  'end.unavailable': m('The shared unavailable end: says the library could not be searched just now, never “not in the library”.', 'none', 'the unavailable reply', []),
};

export const ELEMENTS = E;
