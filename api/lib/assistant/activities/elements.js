// The generic tree ELEMENTS (planning/anis-strategy-trees.md §2): fetch.* / search.* / read.* / judge / switch / rank / shape / hand.* and the
// shared ends ($absence $fallback $unavailable), as graph activities over named context UNITS (s.units, §2a). They wrap tools.js tools
// (no new retrieval); every retrieval applies the scope units (scope ∩ params; named things RANKED not filtered), reports scope_excluded,
// keeps error distinct from none, and leaves a per-node note (units read, params, count, scope_excluded) that graph.js puts in the trace.
// Test seams: s.tools[name](input, ctx) replaces a tool, s.jev(q) the Jev call, s.templates[id] a template, s.agentRun the agent.
import { run as runTool } from '../tools.js';
import { canonicalTradition } from '../tradition-name.js';
import { isAttribution } from '../prayer-sections.js';
import { parseScriptureRef } from '../scripture-ref.js';
import { template, fill } from './templates.js';
import { AUTH_KINDS } from './contract.js';
import { standingOf, authorityOrder } from '../tradition-authority.js';
import { TIER_ORDER, translationRank } from '../source-tier.js';
import { judgeHolds, judgeTimeline, judgeDated, termScript, generateList } from '../judges.js';
import { currentAIContext } from '../../ai-context.js';

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
// a candidate whose {{slot}} unit is empty is skipped (falls to the next candidate / the question), never sent as " origin founded date history"
const slotEmpty = (u, c) => typeof c === 'string' && [...c.matchAll(/\{\{(\w+)\}\}/g)].some(([, k]) => !String(slots(u)[k] ?? '').trim());
const text = (s, u, ...cands) => String(cands.filter((c) => !slotEmpty(u, c)).map((c) => flat(sub(u, c))).find((x) => String(x).trim()) ?? u.current_user_question).trim();
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
const SECTION_MAX = 40;   // paragraphs of a remembered chapter fetch.anchor reads whole
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
      inp = await input(s, p, u, t?.length === 1 ? t[0] : undefined);
      if (!p.doctrinal) { out = await call(s, typeof tool === 'function' ? tool(inp) : tool, inp); raw = take(out, p, u) || []; }
      else {
        const fused = tool === 'fused_search', n1 = { ...inp, filters: { ...inp.filters, authority: DOC_AUTH }, ...(fused ? { tiers: ['authority'], min_results: DOC_MIN } : {}) };
        raw = take(await call(s, tool, n1), p, u) || [];
        const named = new Set((Array.isArray(u.named_sources) ? u.named_sources : []).map(String)), tierOf = (x) => standingOf(x);
        const isDoc = (x) => { const t = tierOf(x); return !!t && DOCTRINAL.has(t); };   // unknown standing is not doctrinal (it was: every non-Bahá’í hit passed)
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
// the passage whose editions fetch.edition looks up: the one that holds the quotation, else the traced source, else the first with a paragraph id
// …plus the rest of the same reference (a whole chapter read by fetch.reference: same work, same reference label), so every verse is aligned
const REF_ANCHORS_MAX = 60;   // scripture-ref WHOLE_MAX: the rows of one chapter
// a work's opening carries no theme (11-12 ahmad-sbs: only verse 1 of three got its Arabic): same theme, or both without one
const editionAnchors = (u) => { const a = editionAnchor(u); if (!a) return [];
  return u.found_passages.filter((x) => x !== a && Number.isFinite(Number(x.id)) && (x.theme ?? null) === (a.theme ?? null) && String(x.document_id) === String(a.document_id)).slice(0, REF_ANCHORS_MAX - 1).map((x) => Number(x.id)); };
const editionAnchor = (u) => { const ok = u.found_passages.filter((x) => Number.isFinite(Number(x.id))); return ok.find((x) => x.verdict === 'holds') ?? ok.find((x) => x.role === 'source' || x.traced) ?? ok[0] ?? null; };
// in_named: search INSIDE the work the question names (named_work title, else the first named source id); gated off when none is named
const namedWork = (u) => (typeof u.named_work === 'string' && u.named_work.trim() ? { work: u.named_work.trim() }
  : u.named_work != null && Number.isFinite(Number(u.named_work)) ? { documentId: Number(u.named_work) }
  : Array.isArray(u.named_sources) && u.named_sources.length ? { documentId: u.named_sources[0] } : null);
const personOf = (u) => { const n = flat(u.named_person); return typeof n === 'string' && n.trim() && !Number.isFinite(Number(n)) ? n.trim() : null; };
// HARD filters first (Chad 11-09): the tradition, the named work, the named author. `wide` = the widening pass: none of them (run when the filtered pass was thin)
// asked_author: the person Jev named is not the one the question is about ("what did Shoghi Effendi write about her?" — topic Ṭáhirih): search that author's own works (tahirih#3, 11-12)
const askedAuthor = (u) => { const who = personOf(u), t = String(flat(u.topic) ?? '').toLowerCase(); return !!who && !!t.trim() && !t.includes(who.toLowerCase()); };
const subjectsOf = (u) => (Array.isArray(u.named_subjects) ? u.named_subjects : []).filter((n) => typeof n === 'string' && n.trim());
// about_person: runs only when Jev named a person or a subject (11-11 Quddús: Jev read "Quddús" as a subject, not a person, so only scripture came back), no author filter, whole question (the histories and studies ABOUT them — 11-11 Siyyid Káẓim)
// by_person: Jev named the person; the author_lookup tool resolves the library's spellings of the name (array = any), the raw name when none resolve
const authorsOf = async (s, who) => { try { const a = ((await call(s, 'author_lookup', { name: who }))?.authors || []).map((x) => x.author); return a.length ? a : who; } catch { return who; } };
// inside: the books the gather already found, searched inside with the whole question (one call, documentId = any of them) —
// the deep passage a book holds is often not its best-scoring paragraph library-wide (dry run 6: the Sutra Collection's anatta discourse)
const booksOf = (u, n = 3) => [...new Set((u.found_passages || []).map((x) => Number(x.document_id)).filter(Number.isFinite))].slice(0, n);
const searchInput = async (s, p, u, trad) => { if (p.inside) return { query: text(s, u, p.query, '{{follows_topic}}', '{{current_user_question}}'), limit: kOf(p, u) ?? 6, filters: { documentId: booksOf(u, p.books ?? 3) } };
  const who = !p.wide && (p.by_person || p.asked_author) ? personOf(u) : null, filters = p.wide ? {} : { ...(trad ? { tradition: trad } : {}), ...(p.in_named ? namedWork(u) : {}), ...(who ? { author: await authorsOf(s, who) } : {}), ...(p.author ? { author: p.author } : {}), ...(p.language ? { language: p.language } : {}), ...(p.work ? { work: p.work } : {}),
    // the authority kinds are a search filter (fused_search over-fetches ×3 for it), not only a post-filter over the top k: a history search post-filtered from 6 generic hits found none (11-10)
    ...([p.authority].flat().filter(Boolean).length ? { authority: [p.authority].flat().filter(Boolean) } : {}) };
  // the topic (question minus the named spans) only where a hard filter carries those names; every other pass keeps the whole question
  // (dry run 5, 11-09: "Sufi writers like understand fana" — stripping "Rumi" from unfiltered passes lost him). quoted: the reader's quoted words, literal+phrase
  const named = (p.in_named && namedWork(u)) || who, layers = p.quoted ? ['literal', 'phrase'] : p.layers;
  return { query: text(s, u, p.query, ...(p.quoted ? ['{{quoted_words}}'] : [...(named ? ['{{follows_topic}}', '{{topic}}'] : ['{{follows_topic}}', '{{current_user_question}}'])])), limit: kOf(p, u) ?? 8, ...(Object.keys(filters).length ? { filters } : {}), ...(Array.isArray(layers) && layers.length ? { layers } : {}), ...(Array.isArray(p.tiers) && p.tiers.length ? { tiers: p.tiers } : {}), ...(p.spell ? { spell: true } : {}) }; };
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
  // under four words ("five diamonds") the source hunt refuses (too few words to judge a source by); those words are FOUND literally
  // instead (quote_search) — the refusal routed the bare phrase to $fallback → "couldn't search just now" (11-12)
  'fetch.phrase': retrieval({ edges: ['one', 'several', 'thin', 'none', 'error'], tool: (inp) => (inp.query ? 'quote_search' : 'quotation_candidates'), rank: true, params: ['mode', 'words'], reads: ['quoted_words', 'quoted_clean'],
    input: (s, p, u, trad) => {
      const q = text(s, u, p.words, '{{quoted_clean}}', '{{quoted_words}}');
      if (String(q).replace(/[“”"‘’«»]/g, ' ').trim().split(/\s+/).filter(Boolean).length < 4) return { query: q, ...(trad ? { religions: [trad] } : {}) };
      return { quotation: q, ...(trad ? { tradition: trad } : {}) };   // tradition: that tradition's own core (none = every tradition)
    }, take: passages,
    thin: (items, p) => p.mode === 'close' && !items.some((x) => x.role === 'source') }),
  'fetch.person': retrieval({ edges: ['one', 'several', 'none', 'error'], tool: 'biography_search', rank: true, params: ['name'], reads: ['named_person'], into: 'found_records',
    input: (s, p, u) => ({ query: text(s, u, p.name, '{{named_person}}') }), take: (o) => o?.people, thin: () => false }),
  // the named person's pre-researched report (biography_lookup: portrait, dates, kinship, built life timeline, cited facts) → found_records beside the passages
  'fetch.person_report': retrieval({ edges: ['one', 'none', 'error'], tool: 'biography_lookup', params: ['name'], reads: ['named_person'], into: 'found_records',
    input: (s, p, u) => ({ name: text(s, u, p.name, '{{named_person}}') }), take: (o) => (o?.found ? [{ kind: 'person_report', ...o.person, others: o.others }] : []), thin: () => false }),
  'fetch.renderings': retrieval({ edges: ['one', 'several', 'none', 'error'], tool: 'rendering_lookup', rank: true, params: ['term', 'translator'], reads: ['term'],
    gate: (s, u, p) => /[\u0600-\u06FF]/.test(text(s, u, p.term, '{{term_arabic}}', '{{term}}')),   // Arabic script only: Latin → Arabic is the term_arabic unit (Jev), not the tool
    input: (s, p, u) => ({ term_arabic: text(s, u, p.term, '{{term_arabic}}', '{{term}}'), ...(p.translator ? { translator: p.translator } : {}) }), take: (o) => (o?.found ? o.passages : []), thin: () => false,
    after: (o, u) => { if (o?.found) merge(u, 'found_records', [{ term: o.term, transliteration: o.transliteration, root: o.root, meaning: o.meaning, renderings: o.renderings }]); } }),
  // the found passage's other editions in its work family (editions.js): want=original → its own-language edition, want=translations → the parallel
  // translations, aligned by reference (sura:ayah, chapter:verse) else by meaning; never translated. No edition → a record naming the missing language.
  'fetch.edition': { ...retrieval({ edges: ['one', 'several', 'none', 'error'], tool: 'edition_lookup', rank: true, params: ['want'], reads: ['found_passages'], thin: () => false,
    gate: (s, u) => !!editionAnchor(u),
    input: (s, p, u) => { const more = editionAnchors(u); return { paragraph_id: editionAnchor(u).id, ...(more.length ? { paragraph_ids: more } : {}), want: p.want === 'translations' ? 'translations' : 'original' }; },
    // the editions of a passage read from the named work are that work's own words too: never traded for a book quoting them (own-source keep)
    take: (o, p, u) => (o?.passages || []).map((x) => (editionAnchor(u)?.named_read ? { ...x, named_read: true } : x)),
    after: (o, u, items) => { if (!items.length && o) merge(u, 'found_records', [{ kind: 'absence', missing_language: o.missing_language ?? null, searched: o.self?.title ?? null, family: (o.family || []).length }]); } }),
  writes: ['found_passages', 'found_records', ...OUT] },
  // a prayer of ANY tradition (11-09): mode 'named' = the name (named_work) or opening words (incipit / quoted_words) across the tradition's whole scope,
  // scripture included; mode 'need' = what it is for (occasion, else the question) by meaning, core first, plus the tradition's prayer works. Tradition =
  // religions_specified (one) → the named work's → none (each tradition, kept only with real hits). What was searched is written to found_records (the honest absence).
  'fetch.prayer': retrieval({ edges: ['one', 'several', 'none', 'error'], tool: 'prayer_lookup', params: ['mode', 'key', 'value'], reads: ['occasion', 'incipit', 'named_work', 'quoted_words'],
    input: (s, p, u, trad) => {
      const work = namedWork(u)?.work, inc = flat(u.incipit) || flat(u.quoted_words) || null;
      const base = { ...(trad ? { tradition: trad } : {}), ...(work ? { work } : {}) };
      if (p.mode === 'named') return { ...base, ...(work ? { name: work } : {}), ...(inc ? { incipit: inc } : {}) };
      if (p.key === 'incipit') return { ...base, incipit: text(s, u, p.value, '{{incipit}}') };   // pre-11-09 rows
      return { ...base, need: text(s, u, p.value, '{{occasion}}') };
    },
    take: passages, thin: () => false,
    after: (o, u) => { for (const x of o?.searched || []) merge(u, 'found_records', [{ name: `${x.tradition}: searched ${(x.how || []).join('; ') || 'nothing'}${x.found ? '' : ' — no prayer found'}`, tradition: x.tradition, searched: true, found: x.found ?? 0 }]); } }),
  // the prayer works the library has for the tradition (or one per tradition when none is known): the absence answer lists them, and names the tradition when it has none
  'fetch.prayer_works': retrieval({ edges: ['one', 'several', 'none', 'error'], tool: 'prayer_lookup', into: 'found_records', reads: ['religions_specified', 'named_work'],
    input: (s, p, u, trad) => ({ list: true, ...(trad ? { tradition: trad } : {}), ...(namedWork(u) ? { work: namedWork(u).work } : {}) }),
    take: (o) => (o?.works?.length ? o.works.map((w) => ({ title: w.title, name: w.title, tradition: w.tradition, url: w.url || null, document_id: w.id })) : [{ name: `${o?.tradition || 'this tradition'}: no prayer work in the library`, tradition: o?.tradition || null, none: true }]), thin: () => false }),
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
  'fetch.anchor': { kind: 'tool', cls: 'code', edges: ['one', 'thin', 'none', 'error'], scope: 'strategy', params: ['stage'], reads: ['referent', 'reader_position', 'previous_evidence', 'quoted_words', 'last_passages', 'last_section', 'work_place', 'amount_wanted'], writes: ['found_passages', ...OUT],
    async run(s, p = {}) {   // the passage a question is about: the pointed-at item, the reader's place, the last evidence; quoted words alone are thin
      const u = U(s), pos = u.reader_position, hit = (u.referent && typeof u.referent === 'object' && u.referent.text ? u.referent : null) ?? u.previous_evidence?.passages?.[0];
      try {
        // "the next paragraph" (Jev: work_place next): the paragraphs right after the last passage shown, in the same work
        if (u.work_place === 'next' && u.last_passages?.length) {
          const doc = u.last_passages[0].document_id, at = Math.max(...u.last_passages.filter((x) => x.document_id === doc).map((x) => x.paragraph_index));
          const n = Math.min(5, Math.max(1, Number(u.amount_wanted) || 1));
          const got = ((await call(s, 'context_lookup', { document_id: doc, paragraph_index: at, before: 0, after: n }))?.passages || []).filter((x) => x.paragraph_index > at).slice(0, n);
          if (got.length) { merge(u, 'found_passages', got.map((x, i) => ({ ...x, anchor: i === 0 }))); return finish(s, p, 'one', { count: got.length, read: { work_place: 'next', after: `${doc}:${at}` } }); }
        }
        // the opening asked for (Jev: work_place opening): fetch.opening reads it, never the last reply's passages
        if (u.work_place === 'opening' && u.named_work) return finish(s, p, 'none', { read: { work_place: 'opening' } });
        // the message points back at the last reply (Jev: refers_back): its cited passages, loaded whole, are the anchor
        if (!hit && u.refers_back && u.last_passages?.length) {
          const got = (await Promise.all(u.last_passages.slice(0, 3).map((x) => call(s, 'context_lookup', { document_id: x.document_id, paragraph_index: x.paragraph_index, before: 0, after: 0 }).then((c) => c?.passages?.[0] ?? null, () => null)))).filter(Boolean);
          if (got.length) { merge(u, 'found_passages', got.map((x) => ({ ...x, anchor: true }))); return finish(s, p, 'one', { count: got.length, read: { last_passages: u.last_passages } }); }
        }
        // the last turn gave a CHAPTER as a card ("summarize that chapter"): the chapter is the anchor, read whole (up to SECTION_MAX paragraphs), unless
        // this message names its own place (a work, a scripture reference, quoted words) or asks for the next part
        const sec = u.last_section;
        if (!hit && sec && u.work_place !== 'next' && !u.quoted_words && !u.scripture_reference && (!u.named_work || Number(u.named_work) === sec.document_id || typeof u.named_work === 'string')) {
          const last = Math.min(sec.end, sec.start + SECTION_MAX - 1), at = [];   // context_lookup gives 6 paragraphs a call (after ≤ 5)
          for (let i = sec.start; i <= last; i += 6) at.push(i);
          const got = (await Promise.all(at.map((i) => call(s, 'context_lookup', { document_id: sec.document_id, paragraph_index: i, before: 0, after: 5 }).then((c) => c?.passages || [], () => []))))
            .flat().filter((x) => x.paragraph_index >= sec.start && x.paragraph_index <= last);
          if (got.length) { merge(u, 'found_passages', got.map((x, i) => ({ ...x, anchor: i === 0 }))); return finish(s, p, 'one', { count: got.length, read: { last_section: sec } }); }
        }
        if (hit) { merge(u, 'found_passages', [{ ...hit, anchor: true }]); return finish(s, p, 'one', { count: 1, read: { referent: u.referent } }); }
        // a message that names nothing of its own ("who translated it?") is about what the thread last showed (11-12: Jev read it as its own question,
        // the anchor came back empty and the turn said it would "rather not guess a name")
        if (!pos?.doc && !u.quoted_words && !u.named_work && !u.scripture_reference && u.last_passages?.length) {
          // one passage per WORK the last turn showed (11-12 kawthar "who translated it?" after a side-by-side: the Arabic came first, the translation was never read)
          const per = [...new Map(u.last_passages.map((x) => [x.document_id, x])).values()].slice(0, 3);
          const items = (await Promise.all(per.map((x) => call(s, 'context_lookup', { document_id: x.document_id, paragraph_index: x.paragraph_index, before: 0, after: 0 }).then((c) => c?.passages?.[0] ?? null, () => null))))
            .filter(Boolean).map((y, i) => ({ ...y, anchor: i === 0 }));
          if (items.length) { merge(u, 'found_passages', items); return finish(s, p, 'one', { count: items.length, read: { last_passages: per } }); }
        }
        if (pos?.doc) {
          const c = await call(s, 'context_lookup', { document_id: pos.doc, paragraph_index: pos.paragraph ?? 0, before: 0, after: 0 });
          const items = c?.passages || []; merge(u, 'found_passages', items); return finish(s, p, items.length ? 'one' : 'none', { count: items.length, read: { reader_position: pos } });
        }
        return finish(s, p, u.quoted_words ? 'thin' : 'none', { count: 0, read: { quoted_words: u.quoted_words } });
      } catch (err) { return finish(s, p, 'error', { error: err?.message }); }
    } },
  // a work asked for with nothing more specific = its opening (structural: the unit named_work, by id — a name is evidence, not identity).
  // untopiced: runs only when no topic was asked (a named work WITH a topic is searched inside first)
  'fetch.opening': { kind: 'tool', cls: 'code', edges: ['one', 'several', 'none', 'error'], scope: 'strategy', params: ['n', 'untopiced', 'linked', 'stage'], reads: ['named_work', 'topic', 'work_place'], writes: ['found_passages', ...OUT],
    async run(s, p = {}) {
      const u = U(s), w = namedWork(u);
      if (!(w?.documentId || w?.work) || (p.untopiced && u.work_place !== 'opening' && String(flat(u.topic) ?? '').trim())) { const e = finish(s, p, 'none'); u.missing.pop(); u.found_outcome[s.node ?? '?'] = 'skipped'; return e; }
      try {
        const which = w.documentId ? { document_id: w.documentId } : { work: w.work, ...(p.linked ? { linked: true, said: String(u.current_user_question ?? '').slice(0, 600) } : {}) };   // a title is resolved by the tool, as every search's work filter is; linked = its aligned copy
        const items = ((await call(s, 'opening_lookup', { ...which, n: p.n ?? 3 }))?.passages || []).map((x, i) => ({ ...x, anchor: i === 0, named_read: true }));
        merge(u, 'found_passages', items); return finish(s, p, classify(items.length, ['one', 'several']), { count: items.length, read: { named_work: w.documentId ?? w.work } });
      } catch (err) { return finish(s, p, 'error', { error: err?.message || String(err) }); }
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
  'search.shelf': retrieval({ edges: ['one', 'several', 'thin', 'none', 'error'], tool: 'fused_search', params: ['authority', 'doctrinal', 'language', 'author', 'work', 'layers', 'tiers', 'spell', 'in_named', 'by_person', 'asked_author', 'about_person', 'wide', 'quoted', 'inside', 'books'], reads: ['topic', 'named_work', 'named_person', 'named_subjects', 'quoted_words', 'found_passages'], input: searchInput, take: passages,
    gate: (s, u, p) => (!p.in_named || !!namedWork(u)) && (!p.by_person || !!personOf(u)) && (!p.asked_author || askedAuthor(u)) && (!p.about_person || !!personOf(u) || subjectsOf(u).length > 0) && (!p.wide || hardFiltered(u)) && (!p.quoted || !!String(flat(u.quoted_words) ?? '').trim()) && (!p.inside || booksOf(u).length > 0) }),
  'search.hype': retrieval({ edges: ['several', 'thin', 'none', 'error'], tool: 'hype_search', params: ['authority', 'doctrinal', 'language', 'wide'], reads: ['topic'], input: searchInput, take: passages,
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
E['search.fanout'] = { kind: 'tool', cls: 'code', edges: ['all', 'some_thin', 'all_none', 'error'], scope: 'strategy', params: ['by', 'facets', 'inner', 'tag', 'as', 'stage'], reads: SCOPE, writes: ['found_passages', 'found_records', 'web_found', ...OUT],
  async run(s, p = {}) {   // the inner element once per value (compare_sides, sub_themes…), in parallel, each on its own units; items tagged with their value in field `tag` (default side)
    // `as` names the placeholder (default {{value}}), so fanouts nest: histories as {{work}} × phrasings as {{value}}
    const u = U(s), values = p.facets ?? u[p.by] ?? [], slot = `{{${p.as ?? 'value'}}}`;
    const runs = await Promise.all(values.map(async (v, i) => {
      const own = { ...u, found_passages: [], found_records: [], web_found: [], found_outcome: {}, missing: [], path: [], scope_excluded: 0 };
      const step = { element: p.inner.element, params: deep(p.inner.params || {}, (x) => (typeof x === 'string' ? x.replaceAll(slot, flat(v)) : x)) };
      const edge = await run1(s, `${s.node}.${i}`, step, own).catch(() => 'error');
      return { v, own, edge };
    }));
    let n = 0;
    for (const { v, own } of runs) { for (const k of ['found_passages', 'found_records', 'web_found']) merge(u, k, own[k].map((x) => ({ ...x, [p.tag ?? 'side']: flat(v) }))); n += size(own); u.scope_excluded += own.scope_excluded; }
    const weak = (e) => ['none', 'thin', 'error'].includes(e);
    return finish(s, p, !runs.length || runs.every((r) => r.edge === 'error') ? 'error' : runs.every((r) => r.edge === 'none' || r.edge === 'error') ? 'all_none' : runs.some((r) => weak(r.edge)) ? 'some_thin' : 'all', { count: n, read: { by: p.by, values } });
  } };
E['search.compare'] = { kind: 'tool', cls: 'code', edges: ['all', 'some_thin', 'all_none', 'error'], scope: 'strategy', params: ['by', 'k', 'tiers', 'stage'], reads: SCOPE, writes: ['found_passages', ...OUT],
  async run(s, p = {}) {   // compare_search: ONE call for every side (the same query held to each side's filters); items tagged with their side. No judge inside — the tree decides once after.
    const u = U(s), values = u[p.by ?? 'compare_sides'] ?? [];
    // the reader's quoted words, when given, ARE what each side is searched for ("how is the phrase "kingdom of heaven" used across the sacred texts?":
    // the whole question found Romans and the Book of Mormon, nothing holding the phrase)
    let r; try { r = await call(s, 'compare_search', { query: text(s, u, p.query, '{{quoted_words}}', '{{follows_topic}}', '{{topic}}'),
      sides: values.map((v) => { const work = u.side_sources?.[flat(v)] ?? u.side_sources?.[canonicalTradition(flat(v))]; return { label: flat(v), filters: { tradition: canonicalTradition(flat(v)), ...(work ? { work } : {}) } }; }),   // a side's book Jev named (the Gita) is that side's work filter
      k: kOf(p, u) ?? 3, ...(p.tiers ? { tiers: p.tiers } : {}) }); } catch (e) { return finish(s, p, 'error', { error: e?.message }); }
    const sides = r?.sides ?? []; let n = 0;
    for (const sd of sides) { merge(u, 'found_passages', sd.passages.map((x) => ({ ...x, side: sd.label }))); n += sd.passages.length; }
    const empty = (sd) => !sd.passages.length;
    return finish(s, p, !sides.length || sides.every(empty) ? 'all_none' : sides.some(empty) ? 'some_thin' : 'all', { count: n, read: { by: p.by ?? 'compare_sides', values } });
  } };
// comparison sides (11-09 review, comparison c0/c3): fewer than two sides given → the LIBRARY's traditions (scope-extract TRADITIONS, every one, Jain
// included), never the biggest traditions in the corpus; afterwards a side whose passages do not ANSWER is written to `missing` so the shape names it
E['fill.sides'] = { kind: 'transform', cls: 'code', edges: ['given', 'library'], scope: 'strategy', params: ['stage'], reads: ['compare_sides', 'religions_specified'], writes: ['compare_sides'],
  async run(s, p = {}) {   // given = Jev named two or more sides (or the scope holds two or more traditions); library = every tradition the library holds, the named one(s) first
    const u = U(s), given = (Array.isArray(u.compare_sides) ? u.compare_sides : []).map(flat).filter(Boolean), scope = tradsOf(u) ?? [];
    const pick = given.length > 1 ? given : scope.length > 1 ? scope : null;
    const lib = pick ? [] : Object.keys((await import('../../scope-extract.js')).TRADITIONS).filter((t) => t !== 'none');
    const sides = pick ?? [...given, ...lib].filter((x, i, a) => a.findIndex((y) => canonicalTradition(y) === canonicalTradition(x)) === i);
    u.compare_sides = sides; if (!pick) u.sides_from = 'library';
    s.note = { read: { compare_sides: given, religions_specified: u.religions_specified }, params: p, count: sides.length, scope_excluded: 0 };
    return pick ? 'given' : 'library';
  } };
E['fill.missing_sides'] = { kind: 'transform', cls: 'code', edges: ['answered', 'none'], scope: 'strategy', params: ['stage'], reads: ['found_passages', 'compare_sides'], writes: ['found_passages', 'missing'],
  run(s, p = {}) {   // after the judge: a side with no answering passage (none found, or only mentions) → missing {side, why}; its mention-only passages leave the evidence
    const u = U(s), answers = (x) => x.verdict == null || x.verdict === 'answers' || x.verdict === 'contradicts';
    const sides = (Array.isArray(u.compare_sides) ? u.compare_sides : []).map(flat), lack = [];
    for (const sd of sides) {
      const own = u.found_passages.filter((x) => flat(x.side) === sd);
      if (!own.some(answers)) { lack.push(sd); u.missing.push({ node: s.node ?? null, side: sd, edge: own.length ? 'mentions_only' : 'no_answer' }); }
    }
    u.found_passages = u.found_passages.filter((x) => !lack.includes(flat(x.side)) && answers(x));
    s.note = { read: { compare_sides: sides }, params: p, count: sides.length - lack.length, scope_excluded: 0, missing: lack };
    return u.found_passages.length ? 'answered' : 'none';
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
// the WHOLE prayer (11-09): the first candidate extended to the prayer holding it (whole_lookup: attribution run, short section, contiguous address); one
// tradition → that prayer + the next two candidates as offers (opening only); several traditions → each tradition's first, whole. Edges name which shape follows.
E['read.whole'] = { kind: 'transform', cls: 'code', edges: ['one', 'several', 'none'], scope: 'strategy', params: ['offers', 'stage'], reads: ['found_passages'], writes: ['found_passages'],
  async run(s, p = {}) {
    const u = U(s), c = u.found_passages.filter((x) => x.document_id != null && x.paragraph_index != null);
    const tr = (x) => canonicalTradition(x.tradition || x.religion || '') || '?', trads = [...new Set(c.map(tr))];
    const leads = trads.length > 1 ? trads.slice(0, 4).map((t) => c.find((x) => tr(x) === t)) : c.slice(0, 1);
    const whole = await Promise.all(leads.map((x) => call(s, 'whole_lookup', { document_id: x.document_id, paragraph_index: x.paragraph_index })
      .then((w) => (w?.passages?.length ? w.passages : [x]), () => [x])));
    const inWhole = (x) => whole.some((rows) => rows.some((r) => Number(r.document_id) === Number(x.document_id) && r.paragraph_index === x.paragraph_index));
    const offers = trads.length > 1 ? [] : c.filter((x) => x !== leads[0] && !inWhole(x)).slice(0, p.offers ?? 2);
    // a prayer book's own "—The Báb" line is the prayer's attribution, not a passage of its own (11-12: the writer hedged that "a passage marked —The Báb" had no text)
    const by = (rows) => { const a = rows.find((r) => isAttribution(r.text)); return a ? String(a.text).replace(/[_*]/g, '').replace(/^\s*[—–-]\s*/, '').trim() : null; };
    const bodyOf = (rows) => (rows.some((r) => !isAttribution(r.text)) ? rows.filter((r) => !isAttribution(r.text)) : rows);
    u.found_passages = [...whole.flatMap((rows, i) => { const a = by(rows); return bodyOf(rows).map((r) => ({ ...r, ...(a ? { author: a, attribution: a } : {}), work: leads[i].work ?? r.title, tradition: tr(leads[i]), theme: trads.length > 1 ? tr(leads[i]) : 'prayer' })); }),
      ...offers.map((x) => ({ ...x, theme: 'alternative' }))];
    s.note = { read: { found_passages: c.length, traditions: trads }, params: p, count: whole.flat().length, scope_excluded: 0 };
    return !leads.length ? 'none' : trads.length > 1 ? 'several' : 'one';
  } };
E['read.source'] = { kind: 'transform', cls: 'code', edges: ['traced', 'kept'], scope: 'strategy', params: ['k', 'stage'], reads: ['found_passages'], writes: ['found_passages'],
  async run(s, p = {}) {   // a quotation found in a secondary book → its primary source (source_trace), flagged traced; the secondary copy stays after it
    const u = U(s), top = u.found_passages.slice(0, p.k ?? 3), primary = [];
    // a primary source shares the tradition of the passage it was traced from (a sutra has no Bahá'í source) and sits inside the turn's scope
    const sameTrad = (y, x) => !x.religion || !y.religion || canonicalTradition(y.religion) === canonicalTradition(x.religion);
    let dropped = 0;
    await Promise.all(top.map((x) => call(s, 'source_trace', { paragraph_id: x.id, text: x.text }).then((o) => {
      const raw = (o?.passages || []).filter((y) => sameTrad(y, x)), ok = scoped(raw, u, false).items; dropped += (o?.passages?.length || 0) - ok.length;
      if (ok.length) { x.traced = true; primary.push(...ok.map((y) => ({ ...y, traced: true, traced_from: x.id }))); } }, () => {})));
    if (primary.length) u.found_passages = [...primary.filter((y, i) => primary.findIndex((z) => key(z) === key(y)) === i), ...u.found_passages.filter((x) => !primary.some((y) => key(y) === key(x)))];
    s.note = { read: { found_passages: top }, params: p, count: primary.length, scope_excluded: dropped };
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
      : on.spread ? (new Set(u.found_passages.map((x) => x.religion).filter(Boolean)).size > 1 ? 'several' : 'one') : on.outcome ? u.found_outcome[on.outcome] ?? 'none' : on.unit ? (filled(u[on.unit]) ? 'filled' : 'empty') : on.value ? String(flat(u[on.value]) || 'none') : 'none';
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
// one passage in a trace note: its source, paragraph and verdict (round db-r3: Nabíl's martyrdom paragraphs were found and vanished, judge untraced)
const brief = (x, v) => `${String(x.title || x.work || '').slice(0, 40)}#${x.paragraph_id ?? x.paraId ?? x.id ?? ''}${v ? `:${v}` : ''}`;
const MENTIONS_FLOOR = 4;   // the fewest passages a mentions drop may leave the writer
E['judge.passages'] = { kind: 'decision', cls: 'jev', edges: ['answers', 'mentions_only', 'conflict', 'empty'], scope: 'strategy', params: ['precedence', 'question', 'mentions', 'stage'], reads: ['found_passages', 'topic'], writes: ['found_passages'],
  async run(s, p = {}) {   // Jev per passage: answers / only mentions / contradicts another; mentions-only passages drop when others answer
    const u = U(s);
    if (!u.found_passages.length) return 'empty';
    const options = [{ edge: 'answers', when: 'the passage answers the question' }, { edge: 'mentions_only', when: 'the passage only mentions the subject' }, { edge: 'contradicts', when: 'the passage contradicts another of the passages' }];
    // a passage found for ONE PART of the request (a comparison side, a compilation heading) is judged on its part: no single passage
    // "answers" "compare the Bible and the Qur'an" or "compile passages under headings" (round 4: every Qur'an verse on forgiveness was
    // mentions_only → the side went missing; the justice compilation kept Leviticus alone)
    const roleOptions = [{ edge: 'answers', when: 'the passage itself teaches or states something on the subject for its own part (one piece of the answer)' }, { edge: 'mentions_only', when: 'the passage only names the subject in passing' }, options[2]];
    const ask = s.jev || ((q) => defaultJev(s, q)), q = sub(u, p.question ?? 'Does this passage answer {{current_user_question}}?');
    const roleOf = (x) => (p.question ? null : x.side != null ? ['side', flat(x.side)] : x.sub_theme != null ? ['heading', flat(x.sub_theme)] : null);
    const askOf = (x) => { const r = roleOf(x); return r ? sub(u, `The reader asked: "{{current_user_question}}". This passage was found for one ${r[0]} of that answer: "${r[1]}". Judged for that ${r[0]} alone (not the whole request), does it speak to the subject?`) : q; };
    // precedence (history_fact): an answer is also placed by its source — Nabíl's narrative is a primary record, a travel diary a later account —
    // so Jev sees the source with the text; the level is kept as x.precedence (rank 'precedence'), the verdict stays 'answers'
    const levels = Array.isArray(p.precedence) ? p.precedence.map(String) : [];
    const optsOf = (x) => (roleOf(x) ? roleOptions : levels.length ? [...levels.map((l) => ({ edge: l, when: `the passage answers the question, and its source is a ${l}` })), ...options.slice(1)] : options);
    const stateOf = (x) => (levels.length ? `Source: ${[x.title, x.author].filter(Boolean).join(' — ')}${x.year ? ` (${x.year})` : ''}\n` : '') + String(x.text).slice(0, 400);
    const choices = await Promise.all(u.found_passages.map((x) => Promise.resolve(ask({ question: askOf(x), options: optsOf(x), state: stateOf(x), units: u })).then((r) => r?.choice ?? 'answers', () => 'answers')));
    const verdicts = choices.map((c) => (levels.includes(c) ? 'answers' : c));
    const seen = u.found_passages.slice(0, 24).map((x, i) => brief(x, choices[i]));   // the trace shows every verdict, kept or dropped
    u.found_passages.forEach((x, i) => { x.verdict = verdicts[i]; if (levels.includes(choices[i])) x.precedence = levels.indexOf(choices[i]); });
    const edge = verdicts.includes('contradicts') ? 'conflict' : verdicts.includes('answers') ? 'answers' : 'mentions_only';
    // mentions-only passages drop where their OWN part (side / heading; the whole list when untagged) has an answer — one side's answer never empties another side
    const part = (x) => { const r = roleOf(x); return r ? r.join(':') : ''; }, answered = new Set(u.found_passages.filter((x) => x.verdict !== 'mentions_only').map(part));
    // mentions: 'keep' — passages on the subject that don't state the fact stay as its setting (round 5: "Who founded Sikhism?" kept one
    // British author's sentence and dropped Macauliffe's Life of Guru Nanak and Guru Nanak's own hymns); rank 'verdict' puts them after the answers
    // …and a drop that would leave the writer under MENTIONS_FLOOR passages keeps them after the answers (11-11 "Tell me about Vaḥíd": the
    // Tablet of Visitation, God Passes By and the Nayríz history were each "mentions only" — the writer got one passage and wrote two sentences)
    const kept = u.found_passages.filter((x) => x.verdict !== 'mentions_only' || !answered.has(part(x)));
    if (edge !== 'mentions_only' && p.mentions !== 'keep') u.found_passages = kept.length >= MENTIONS_FLOOR ? kept
      : [...u.found_passages.filter((x) => x.verdict !== 'mentions_only'), ...u.found_passages.filter((x) => x.verdict === 'mentions_only')];
    s.note = { read: { question: q }, params: p, count: u.found_passages.length, scope_excluded: 0, verdicts, seen };
    return edge;
  } };

// a sūra NAME in the message is a candidate, not an identity (11-11 Kawthar: "tafsir-i-surata'l-Kawthar" became Qur'án 108, not the Báb's Tafsír). When the
// reference came from a name, the library's works for the whole message are put to Jev beside it (ONE typed choice, book-pick.js); a work he is SURE of becomes
// named_work (→ its opening, fetch.opening); none / hesitant / no answer → the sura as before. A numbered reference ("Sura 108") never asks.
const fetchReference = E['fetch.reference'];
E['fetch.reference'] = { ...fetchReference, reads: [...fetchReference.reads, 'named_work'], writes: [...fetchReference.writes, 'named_work'],
  async run(s, p = {}) {
    const u = U(s), ref = u.scripture_reference || parseScriptureRef(text(s, u, p.query));
    if (!ref?.byName || Number.isFinite(Number(u.named_work))) return fetchReference.run(s, p);
    const log = s.direction?.decisions ?? s.ctx?.decisions;
    try {
      const [{ bookCandidates }, { groupCopies, pickBook }, { MIN_CONFIDENCE }] = await Promise.all([import('../book-finder.js'), import('../book-pick.js'), import('../../scope-extract.js')]);
      const named = typeof u.named_work === 'string' && u.named_work.trim() ? [u.named_work.trim()] : [];
      const found = await (s.ctx?.deps?.bookCandidates || bookCandidates)(u.current_user_question, { also: named });
      const cands = groupCopies(found?.cands || []);
      if (cands.length) {
        const pick = await (s.judges?.book || pickBook)(s.messages || [], cands, { profile: s.profile ?? s.ctx?.profile ?? {} }).catch(() => null);
        const hit = pick?.choice && !['none', 'new'].includes(pick.choice) && (pick.confidence ?? 0) >= MIN_CONFIDENCE ? cands.find((c) => c.key === pick.choice) : null;
        log?.record?.('reference:name-or-work', { by: 'jev', saw: { sura_name: ref.label, candidates: cands.map((c) => `${c.key} ${c.label}`) }, options: [...cands.map((c) => c.key), 'none'],
          chosen: hit ? hit.key : 'none', reason: hit ? 'Jev picked a library work over the sura name' : !pick ? 'no answer: the sura stands' : 'none / hesitant: the sura stands' });
        const id = hit ? (hit.kind === 'section' ? hit.sec.doc_id : hit.doc.id) : null;
        if (id != null) { u.named_work = id; const e = finish(s, p, 'none', { read: { named_work: id } }); u.missing.pop(); u.found_outcome[s.node ?? p.id ?? '?'] = 'skipped'; return e; }   // → fetch.opening
      }
    } catch { /* the name stands as the sura, as before */ }
    return fetchReference.run(s, p);
  } };
const fetchWork = E['fetch.work'];   // close titles are spelling candidates: never 'one' alone
E['fetch.work'] = { ...fetchWork, async run(s, p = {}) {
  const e = await fetchWork.run(s, p), u = U(s), got = u.found_records || [];
  if (e === 'one' && got.length && got.every((x) => x.match === 'close')) { u.found_outcome[s.node ?? p.id ?? '?'] = 'several'; return 'several'; }
  return e;
} };
E['judge.prayer'] = { kind: 'decision', cls: 'jev', edges: ['picked', 'none', 'unjudged'], scope: 'strategy', params: ['stage'], reads: ['found_passages', 'occasion', 'current_user_question', 'named_work'], writes: ['found_passages'],
  async run(s, p = {}) {   // ONE typed Jev choice (prayer-shelf pickOccasion) among the prayers found — never a judge per prayer; the chosen goes first. No answer → unjudged (list untouched)
    const u = U(s), found = u.found_passages.slice(0, 8).map((x, i) => ({ key: `found:${i}`, text: x.opening || String(x.text || '').replace(/\s+/g, ' ').trim().slice(0, 220),
      heading: [[x.author && x.author !== x.book_author ? x.author : null, x.work || x.title, x.tradition || x.religion].filter(Boolean).join(' — '), x.heading || x.occasion].filter(Boolean).join(', ') || null }));   // labelled by author, work, tradition and its heading
    if (!found.length) return finish(s, p, 'none');
    // the reader's name in ONE prayer's own words is that prayer — Jev split 2:1 for "Remover of every anguish" over the Báb's "Is there any Remover of
    // difficulties" (11-12); none or several holding it → Jev chooses
    const fold = (t) => ` ${String(t || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
    const nm = typeof u.named_work === 'string' ? fold(u.named_work) : '', holds = nm.trim().includes(' ') ? found.map((_, j) => j).filter((j) => fold(u.found_passages[j].text).includes(nm)) : [];
    if (holds.length === 1) { s.note = { read: { found: found.length }, params: p, count: 1, scope_excluded: 0, choice: found[holds[0]].key, by: 'name in its words' }; u.found_passages = [u.found_passages[holds[0]]]; return 'picked'; }
    try {
      const pick = await (s.judges?.prayer || (async () => { const [{ pickOccasion }, { jevFetch }] = await Promise.all([import('../prayer-shelf.js'), import('../../systemone.js')]); return pickOccasion(s.messages || [], [], { profile: s.profile ?? s.ctx?.profile ?? {}, fetchImpl: jevFetch('anis-prayer-occasion'), found }); }))({ found });
      s.note = { read: { found: found.length }, params: p, count: found.length, scope_excluded: 0, choice: pick?.choice ?? null, confidence: pick?.confidence ?? null };
      // "none fits" only when Jev is SURE; a hesitant pick (12 near-identical prayers split his vote) is no answer, never an absence (11-11 Remover of Difficulties: hit #1, then "not found")
      const i = found.findIndex((f) => f.key === pick?.choice), sure = (pick?.confidence ?? 0) >= (await import('../../scope-extract.js')).MIN_CONFIDENCE;
      if (pick?.choice === 'none' && sure) return 'none';
      if (i < 0 || !sure) { u.found_passages = u.found_passages.slice(0, 1); return 'unjudged'; }   // no answer: the code-ranked lead alone, no unchecked offers
      // the offers pass the SAME choice: a prayer stays only if Jev rates it likelier than "none of these fits"; no distribution = the chosen alone
      const dist = pick.distribution || {}, none = dist.none ?? 0, keep = (j) => j === i || (dist[found[j]?.key] ?? 0) > none;
      u.found_passages = [u.found_passages[i], ...u.found_passages.filter((_, j) => j !== i && j < found.length && keep(j))];
      return 'picked';
    } catch (err) { s.note = { read: { found: found.length }, params: p, count: 0, scope_excluded: 0, error: err?.message }; u.found_passages = u.found_passages.slice(0, 1); return 'unjudged'; }
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
E['judge.timeline'] = { kind: 'decision', cls: 'jev', edges: ['matched', 'none', 'unjudged'], scope: 'strategy', params: ['query', 'stage'], reads: ['found_records', 'found_passages', 'entries', 'current_user_question'], writes: ['found_records', 'found_passages', 'undated_entries'],
  async run(s, p = {}) {   // ONE step. People (biography_search records with evidence): keep those whose cited proof does what the question asks, with the book's clause (unchanged).
    // Otherwise DATED CLAIMS about any subject (event, work, person): keep the passages/records whose own text states a date, each with date/year/event (theme "date · event");
    // planned entries with no dated source → undated_entries (listed apart). No answer → unjudged, everything untouched.
    const u = U(s), query = text(s, u, p.query, '{{current_user_question}}'), people = u.found_records.filter((x) => Array.isArray(x.evidence));
    if (people.length) {
      const r = await (s.judges?.timeline || judgeTimeline)({ query, people, ...(s.complete ? { complete: s.complete } : {}) }).catch(() => ({ people, judged: false }));
      s.note = { read: { query }, params: p, count: r.people.length, scope_excluded: 0, judged: r.judged, lead: r.lead ?? '' };
      if (!r.judged) return 'unjudged';
      u.found_records = [...u.found_records.filter((x) => !Array.isArray(x.evidence)), ...r.people];
      return r.people.length ? 'matched' : 'none';
    }
    const pool = [...u.found_passages, ...u.found_records];
    if (!pool.length) return finish(s, p, 'none');
    const r = await (s.judges?.dated || judgeDated)({ query, items: pool, ...(s.complete ? { complete: s.complete } : {}) }).catch(() => ({ items: pool, judged: false }));
    s.note = { read: { query }, params: p, count: r.judged ? r.items.length : pool.length, scope_excluded: 0, judged: r.judged, dated: true };
    if (!r.judged) return 'unjudged';
    const mark = (x) => ({ ...x, theme: [x.date, x.event].filter(Boolean).join(' · ') });
    const dated = r.items.map(mark), isRec = new Set(u.found_records.map(key));
    const entries = (Array.isArray(u.entries) ? u.entries : []).map(flat).filter(Boolean), withDate = new Set(dated.map((x) => flat(x.side)));
    u.undated_entries = entries.length > 1 ? entries.filter((e) => !withDate.has(e)) : [];
    if (!dated.length) return 'none';   // nothing dated: the passages stay as found (the undated shape lists them apart)
    u.found_passages = dated.filter((x) => !isRec.has(key(x))); u.found_records = dated.filter((x) => isRec.has(key(x)));   // only what has a dated source stays
    return 'matched';
  } };
E['judge.criteria'] = { kind: 'decision', cls: 'jev', edges: ['weighed', 'silent', 'empty'], scope: 'strategy', params: ['question', 'stage'], reads: ['criteria', 'challenged_claim', 'found_passages', 'web_found'], writes: ['found_passages', 'criterion_verdicts'],
  async run(s, p = {}) {   // ONE Jev choice per planned criterion (in parallel, at tree level): do that criterion's own finds (library + web, tagged by search.fanout) support, contradict or say nothing?
    const u = U(s), subject = flat(u.challenged_claim) || flat(u.topic) || u.current_user_question;
    const crit = (Array.isArray(u.criteria) && u.criteria.length ? u.criteria : [subject]).map(flat).filter(Boolean);
    if (!u.found_passages.length && !u.web_found.length) { s.note = { read: { criteria: crit }, params: p, count: 0, scope_excluded: 0 }; return 'empty'; }
    const options = [{ edge: 'supports', when: 'the evidence given supports this criterion of the claim' }, { edge: 'contradicts', when: 'the evidence given contradicts this criterion of the claim' }, { edge: 'silent', when: 'the evidence given says nothing decisive either way' }];
    const ask = s.jev || ((q) => defaultJev(s, q)), one = crit.length === 1;
    const of = (c) => [...u.found_passages.filter((x) => one || flat(x.side) === c).map((x) => `- library, ${x.title || ''}${kindOf(x) ? ` (${kindOf(x)})` : ''}: ${String(x.text || '').slice(0, 300)}`),
      ...u.web_found.filter((x) => one || flat(x.side) === c).map((x) => `- web, ${x.site || ''}: ${String(x.snippet || '').slice(0, 300)}`)].join('\n');
    const verdicts = await Promise.all(crit.map((c) => { const ev = of(c); if (!ev) return 'silent';
      const question = sub(u, String(p.question ?? 'The claim is: {{challenged_claim}}. Weigh this criterion of it against the evidence below: {{value}}').replaceAll('{{value}}', c));
      return Promise.resolve(ask({ question, options, state: ev, units: u })).then((r) => (options.some((o) => o.edge === r?.choice) ? r.choice : 'unweighed'), () => 'unweighed'); }));
    u.criterion_verdicts = crit.map((c, i) => `${c}: ${verdicts[i]}`);
    const v = new Map(crit.map((c, i) => [c, verdicts[i]]));
    u.found_passages = u.found_passages.map((x) => ({ ...x, criterion_verdict: v.get(one ? crit[0] : flat(x.side)) ?? null }));
    record(s, `tree:${s.node}`, { saw: crit.join(' | '), options: options.map((o) => o.edge), chosen: verdicts.join(',') });
    s.note = { read: { criteria: crit }, params: p, count: u.found_passages.length, scope_excluded: 0, verdicts };
    return verdicts.some((x) => x === 'supports' || x === 'contradicts' || x === 'unweighed') ? 'weighed' : 'silent';
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
const ORDER = [...AUTH_KINDS, 'other'];
const foldText = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 160);   // a copy's opening words, its own markers ([43], [pg 311]) gone
const yearOf = (x) => Number((String(x.year ?? x.date ?? '').match(/^-?\d{1,4}/) || [])[0]) || 0;   // signed: a BCE year (-563) sorts before a CE one
const standingRank = (x) => { const i = TIER_ORDER.indexOf(standingOf(x)); return i < 0 ? TIER_ORDER.length : i; };
export const COMPARE = {
  standing: () => (a, b) => standingRank(a) - standingRank(b) || translationRank(a) - translationRank(b),   // tradition-authority: each passage by its own tradition's tiers (Bahá’í: writings > guardian > compilation > reported > house > secondary)
  authority: () => (a, b) => (ORDER.indexOf(kindOf(a) ?? 'other') + 1 || 99) - (ORDER.indexOf(kindOf(b) ?? 'other') + 1 || 99),
  verdict: () => (a, b) => (a.verdict === 'mentions_only' ? 1 : 0) - (b.verdict === 'mentions_only' ? 1 : 0),   // judge.passages: what states the fact before what only sets it
  // a passage found INSIDE the work named as the subject's standard history (plan.histories → history_work) leads its authority kind: the judge, reading
  // "The Dawn-Breakers — Nabil Zarandi (?)", placed Browne and Star of the West above Nabíl's own account of the martyrdom (11-10 live)
  standard: () => (a, b) => (b.history_work ? 1 : 0) - (a.history_work ? 1 : 0),
  precedence: () => (a, b) => (a.precedence ?? 99) - (b.precedence ?? 99),   // judge.passages precedence: primary record, then contemporary account, then scholarship
  phrased: () => { const f = (x) => (x.phrasing || x.history_work ? 1 : 0); return (a, b) => f(b) - f(a); },   // found on the texts' own wording (plan.phrasings) or inside a standard history (plan.histories) before found on the reader's words
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
E.rank = { kind: 'transform', cls: 'code', edges: ['done', 'empty'], scope: 'strategy', params: ['by', 'k', 'per', 'spread', 'most', 'best', 'pin', 'group', 'order', 'dedupe', 'skip', 'of', 'stage'], reads: ['found_passages', 'state.given'], writes: ['found_passages'],
  run(s, p = {}) {   // order by the listed keys (stable, earlier keys win), pin, drop repeats / already-given, keep the top k; nothing left → empty ($absence)
    const u = U(s), of = p.of ?? 'found_passages', by = [p.by].flat().filter((k) => COMPARE[k]), cmp = by.map((k) => COMPARE[k](u));
    const given = new Set((s.state?.given ?? u.given ?? []).map((g) => String(g.ref ?? g.id ?? g)));
    let items = [...u[of]];
    if (p.dedupe) items = items.filter((x, i) => items.findIndex((y) => key(y) === key(x)) === i);
    if (p.skip === 'given') items = items.filter((x) => !given.has(String(x.id)));
    else if (p.skip === 'flag') items = items.map((x) => (given.has(String(x.id)) ? { ...x, given: true } : x));
    items = items.map((x, i) => [x, i]).sort(([a, i], [b, j]) => { for (const c of cmp) { const d = c(a, b); if (d) return d; } return i - j; }).map(([x]) => x);
    items = [...items.filter((x) => !x.out_of_scope), ...items.filter((x) => x.out_of_scope)];   // a widened (out-of-scope) passage never outranks an in-scope one, whatever the keys
    if (p.dedupe === 'text') { const seen = new Set(); items = items.filter((x) => { const t = foldText(x.text); if (!t) return true; if (seen.has(t)) return false; seen.add(t); return true; }); }   // the same passage in several copies: the best-ranked copy only
    if (p.best && items.length) items = items.filter((x) => flat(x[p.best]) === flat(items[0][p.best]));   // best: only the first-ranked item's value of the field (one edition of the passage, whole)
    const pinned = p.pin ? items.filter((x) => x[p.pin] || x.id === p.pin) : [];
    items = [...pinned, ...items.filter((x) => !pinned.includes(x))];
    const k = kOf(p, u);
    const gk = (x, f) => [f].flat().map((ff) => flat(x[ff]) || 'other').join(' — ');   // a list of fields = one nested key (tradition — theme)
    if (p.spread && k && !p.per) {   // spread: the top k taken in turns across the field's values (each planned timeline entry keeps its best), rank order kept
      const by2 = new Map(); items.forEach((x, i) => { const g = gk(x, p.spread); by2.set(g, [...(by2.get(g) || []), i]); });
      const take = new Set(), lists = [...by2.values()];
      for (let r = 0; take.size < k && lists.some((l) => l.length > r); r++) for (const l of lists) if (l.length > r && take.size < k) take.add(l[r]);
      items = items.filter((_, i) => take.has(i));
    } else if (p.most && k) {   // most: { by, k } at most that many of one value in the top k, the rest refilled in rank order only when nothing else is left
      // (11-11 Quddús: four Writings passages, two off the question, filled k=4 and God Passes By's direct statement was cut)
      const cap = kOf(p.most, u), n = new Map(), over = [];
      const kept = items.filter((x) => { const g = gk(x, p.most.by ?? 'authority'), c = n.get(g) ?? 0; if (c >= cap) { over.push(x); return false; } n.set(g, c + 1); return true; }).slice(0, k);
      const back = new Set([...kept, ...over.slice(0, Math.max(0, k - kept.length))]);
      items = items.filter((x) => back.has(x));
    } else if (p.per && k) { const n = new Map(); items = items.filter((x) => { const g = gk(x, p.per), c = n.get(g) ?? 0; n.set(g, c + 1); return c < k; }); } else if (k) items = items.slice(0, k);   // per: k for EACH value of the field (a side cannot crowd another out)
    if (p.group) {   // the items themselves are regrouped (the writer reads them in order): groups in the `order` unit's order (e.g. sub_themes as planned), else first appearance; rank order within
      const g = new Map(), fs = [p.group].flat(), ord = (Array.isArray(u[p.order]) ? u[p.order] : []).map(flat), pos = (x) => { const i = ord.indexOf(flat(x[fs.at(-1)])); return i < 0 ? ord.length : i; };
      const first = new Map(); items.forEach((x, i) => { for (let d = 1; d <= fs.length; d++) { const kk = gk(x, fs.slice(0, d)); if (!first.has(kk)) first.set(kk, i); } });
      items = items.map((x, i) => [x, i]).sort(([a, i], [b, j]) => { for (let d = 1; d < fs.length; d++) { const c = first.get(gk(a, fs.slice(0, d))) - first.get(gk(b, fs.slice(0, d))); if (c) return c; } return pos(a) - pos(b) || first.get(gk(a, fs)) - first.get(gk(b, fs)) || i - j; }).map(([x]) => x);
      for (const x of items) { const kk = gk(x, fs); g.set(kk, [...(g.get(kk) || []), x]); }
      u.groups = [...g].map(([k2, v]) => ({ key: k2, count: v.length, items: v }));
    }
    u[of] = items;
    s.note = { read: { by, k }, params: p, count: items.length, scope_excluded: 0, seen: items.slice(0, 24).map((x) => brief(x, x.verdict)) };
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
const themeOf = (x, by) => (Array.isArray(by) ? by.map((b) => themeOf({ ...x, theme: undefined }, b)).filter(Boolean).join(' — ') || undefined : null) ?? x.theme ?? (by === 'sub_theme' ? x.sub_theme : by === 'side' ? x.side : by === 'religion' ? x.religion : by === 'date' ? x.date ?? x.year : by === 'authority' ? kindOf(x) : undefined) ?? x.side ?? undefined;
// opts: shared = the shared tpl.<shape> that wraps the strategy's own template as {{base}}; direct = the template alone finishes the reply (no synthesis needed)
const writer = (s, id, extra = {}, opts = {}) => {
  const u = U(s), own = modal(tplText(s, id), u);
  const clause = tradsOf(u) && u.scope_excluded > 0 && ['conversation', 'reader'].includes(u.scope_source) ? `${u.religions_specified.join(', ')} sources only, as you asked — say 'all traditions' to widen.` : '';
  const sl = { ...slots(u), scope_clause: clause, authority_order: authorityOrder(tradsOf(u)?.length === 1 ? tradsOf(u)[0] : null), widened_clause: u.widened ? (u.widened.traditions_kept ? `searched ${flat(u.widened.from)} sources at every level of authority` : `searched ${flat(u.widened.from)} first, then widened to all traditions`) : 'in every tradition searched', missing_sides: (() => { const have = new Set(u.found_passages.map((x) => flat(x.side))), lack = [...new Set([...(Array.isArray(u.compare_sides) ? u.compare_sides : []).map(flat).filter((x) => !have.has(x)), ...u.missing.map((m) => m.side).filter(Boolean)])];
      return lack.length ? `Nothing the library returned from ${lack.join(', ')} answers this (each searched in its own texts): name them plainly in one line, never fill a side from another tradition or from memory.` : ''; })(), missing_line: u.missing.length ? `Not found: ${u.missing.map((m) => m.node).filter(Boolean).join(', ')}.` : '', ...extra };
  const inner = fill(own, sl);
  const how = (opts.shared ? fill(modal(tplText(s, opts.shared), u), { ...sl, base: inner }) : inner).trim();
  const fid = opts.format ?? id;
  const web = u.web_found.map((w) => ({ text: w.snippet, title: `Web: ${w.site ?? 'web'}`, author: 'web search', source_url: w.url, web: true, theme: [w.side, 'web (outside the library)'].filter(Boolean).join(' · ') }));   // labelled, never library evidence
  s.out = { passages: [...u.found_passages.map((x) => { const th = themeOf(x, opts.theme_by); return th === undefined ? x : { ...x, theme: th }; }), ...web], records: u.found_records,
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
// The light generators (Chad 11-09: wired, so a compilation / claim / timeline fans out over a real list): plan.subthemes → sub_themes,
// plan.criteria → criteria (what would make THIS claim true or false, as searchable questions), plan.entries → entries (the periods/events a timeline holds).
// Source: s.tools[name] (a seam) else judges.js generateList (ONE model call, metered to the turn's caller; its cost is on the trace step).
// Never a stored list. Failure or empty → the subject itself (the unit default) and 'fail', as before.
const tradOf = (u) => { const r = [u.religions_specified].flat().filter((x) => x && x !== 'all'); return r.length ? r.join(', ') : null; };
for (const [name, unit, kind, reads, what] of [['plan.subthemes', 'sub_themes', 'subthemes', ['topic'], 'sub-themes a topic splits into'],
  ['plan.criteria', 'criteria', 'criteria', ['challenged_claim', 'topic'], 'points that would make a claim true or false'], ['plan.entries', 'entries', 'entries', ['topic', 'named_person'], 'periods/events a timeline holds'],
  ['plan.phrasings', 'phrasings', 'phrasings', ['topic'], 'search phrases in the words the texts use'], ['plan.histories', 'histories', 'histories', ['topic'], 'the standard histories that narrate a subject']]) {
  E[name] = { kind: 'tool', cls: 'llm', edges: ['done', 'fail'], scope: 'strategy', params: ['n', 'stage'], reads, writes: [unit],
    async run(s, p = {}) {
      // a follow-up that takes its subject from the last turn (Jev's refers_back) plans from that subject, never the follow-up's own words
      // (11-12: "add two from Abdu'l-Bahá" after a justice compilation planned sub-themes of "add two" — arithmetic)
      const u = U(s), subject = [...(u.refers_back ? ['follows_topic'] : []), ...reads].map((k) => flat(u[k])).find((x) => String(x ?? '').trim()) || u.current_user_question, n = p.n ?? 4, tradition = tradOf(u);
      const meter = currentAIContext().meter, m0 = Array.isArray(meter) ? meter.length : 0;
      let items = [], via = 'model', error = null;
      try {
        if (s.tools?.[kind]) { via = 'tool'; items = (await s.tools[kind]({ subject, topic: subject, n, tradition }, s.ctx)) || []; }
        else { const r = await (s.judges?.generate || generateList)({ kind, subject, n, tradition, ...(s.complete ? { complete: s.complete } : {}) }); items = r?.items || []; error = r?.ok ? null : r?.error ?? 'no items'; }
      } catch (err) { error = err?.message || String(err); items = []; }
      const ok = Array.isArray(items) && items.length > 0, edge = ok ? 'done' : 'fail';
      u[unit] = ok ? items : unit === 'histories' ? [] : [subject];   // no named history → no in-work search (the subject is no title)
      const calls = Array.isArray(meter) ? meter.slice(m0) : [], usd = calls.reduce((a, c) => a + (Number(c.usd) || 0), 0);
      s.note = { read: { subject: trim(subject), tradition }, params: p, count: u[unit].length, generator: via, ...(calls.length ? { llm: { calls: calls.length, usd: Math.round(usd * 1e6) / 1e6, model: calls[0].model } } : {}), ...(error ? { error: String(error).slice(0, 200) } : {}) };
      (s.direction?.decisions ?? s.ctx?.decisions)?.record?.(`plan:${unit}`, { by: via === 'tool' ? 'code' : 'model', saw: { subject: trim(subject), tradition, n }, options: ['done', 'fail'], chosen: edge,
        reason: ok ? `${u[unit].length} ${what}` : `generator gave nothing (${String(error ?? 'empty').slice(0, 120)}); the subject itself is the one item` });
      return edge;
    } };
}

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
    // a plan that found NOTHING is not an absence yet: the turn's research path (every tool, the whole conversation) answers first, and states the
    // absence itself if it too finds nothing (11-12 Chad: "no matter what I ask, he says he does not have it… then raises irrelevant stuff")
    if (s.executor && !u.found_passages.length) {
      s.fellThrough = true; s.note = { read: { missing: u.missing.slice(-3) }, params: {}, count: 0, scope_excluded: 0, fell_through: 'research' };
      s.ctx?.decisions?.record?.('absence:research', { by: 'code', saw: { path: u.path.slice(-4), missing: u.missing.slice(-3) }, chosen: 'research path', reason: 'the plan found nothing; research answers before any absence' });
      return 'done';
    }
    // a conversation's tradition, or a named work's, is never widened to every tradition (Chad 11-12: "bringing Hindu texts into a conversation
    // on the Báb's commentary on Kawthar is simply not acceptable") — only the authority floor relaxes; a first, unanchored question still widens once
    const anchored = !!u.named_work || !!u.previous_conversation_rounds?.length;
    if (was !== 'all' && !anchored) { u.widened = { from: was, floor: u.authority_floor, why: 'nothing in scope' }; u.religions_specified = 'all'; u.authority_floor = 'any'; }
    else if (FLOOR[u.authority_floor]) { u.widened = { from: was, floor: u.authority_floor, why: 'nothing at this authority', traditions_kept: was !== 'all' }; u.authority_floor = 'any'; }
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
  'fetch.phrase': m('Candidates for where quoted words come from (quotation_candidates): the source in core literature, the original tablet, works quoting it, each with a score (share of the quote’s words held). Under four words, the passages holding those words literally (quote_search). Deterministic, no model; judge.holds decides which candidate is right.', 'quoted_words', 'found_passages (score, role)', ['quotation_candidates', 'quote_search']),
  'fetch.person': m('Finds the person record the question names (several bearers of a name come back as several).', 'named_person', 'found_records (people)', ['biography_search']),
  'fetch.original': m('Finds the Arabic or Persian original of an English passage.', 'quoted_words or found_passages', 'found_passages', ['original_lookup']),
  'fetch.translation': m('Finds the existing English translations of an original-language text.', 'quoted_words or found_passages', 'found_passages', ['translation_lookup']),
  'fetch.person_report': m('The named person’s biography report: portrait, life dates, family, the built life timeline and cited facts (one person; other bearers of the name listed).', 'named_person', 'found_records (person_report)', ['biography_lookup']),
  'fetch.renderings': m('How the authorized translator rendered a word, with counts and paired passages.', 'term', 'found_passages + found_records', ['rendering_lookup']),
  'fetch.edition': m('The found passage in the other editions of its work family, any tradition and language: its original-language edition (want=original) or its parallel translations (want=translations), aligned by reference number, else by meaning; never translated. None held → a record naming the missing language.', 'found_passages', 'found_passages + found_records (absence)', ['edition_lookup']),
  'fetch.align': m('Attaches each passage’s recorded original and translations.', 'found_passages', 'found_passages (annotated)', ['links_lookup']),
  'fetch.anchor': m('Loads the passage the question is about: the one pointed at, the reader’s place, or the last evidence.', 'referent, reader_position, previous_evidence', 'found_passages', ['context_lookup']),
  'fetch.prayer': m('Candidate prayers of the tradition in scope (or the named work’s; none known = each tradition, kept only with real hits), scripture included: mode named = by name or opening words across the whole tradition; mode need = by meaning, core first, plus its prayer works. Headings only rank. Writes what was searched to found_records. No match = none.', 'named_work, incipit, quoted_words (named); occasion (need)', 'found_passages + found_records', ['prayer_lookup']),
  'fetch.prayer_works': m('Lists the prayer works the library has for the tradition (one per tradition when none is known); a tradition with none is named as having none.', 'religions_specified or named_work', 'found_records', ['prayer_lookup']),
  'judge.prayer': m('ONE typed Jev choice among the candidate prayers, each labelled by its opening text, work and tradition, "none fits" an option: which are whole prayers that fit, best first; not a judge per prayer.', 'found_passages', 'found_passages (the chosen first)', []),
  'fetch.guidance': m('Finds the House of Justice’s guidance on a subject.', 'topic', 'found_passages', ['fused_search']),
  'fetch.collection': m('A prepared topic collection (index not built yet: answers none at no cost).', 'id, key', 'found_records', []),
  'fetch.events': m('Dated claims about a subject from the entity graph (not built yet: answers none).', 'subject', 'found_records', []),
  'fetch.calendar': m('A Badí‘ calendar date or Holy Day (not built yet: answers none).', 'date or occasion', 'found_records', []),
  'fetch.activity': m('The reader’s reading plans (not built yet: answers none).', 'reader', 'reading_plan', []),
  'fetch.facts': m('Library facts and corpus status.', 'none', 'found_records', []),
  'fetch.opening': m('Reads the first paragraphs of the named work (by id) in order; with untopiced it runs only when no topic was asked. A copyrighted book gives none.', 'named_work, topic', 'found_passages', ['opening_lookup']),
  'fetch.work_notes': m('Verified quotations on a core work’s significance, best authority first.', 'named_work', 'found_records', ['work_notes_lookup']),
  'search.shelf': m('Searches the library by authority (scripture, interpretation, guidance…), inside the scope. layers picks which layers run and merges them in one call (literal = exact words, phrase = meaning, hype = questions answered, originals); tiers is the escalation ladder (drop these filters one at a time while fewer than min results come back; each passage says its tier); spell corrects misspellings first, deterministically.', 'topic, scope, layers, tiers, spell', 'found_passages', ['fused_search']),
  'search.hype': m('Question search: paragraphs that answer a question like this one. authority keeps only passages of those standings (scripture, interpretation…).', 'topic, scope, authority', 'found_passages', ['hype_search']),
  'search.originals': m('Searches the original-language Writings.', 'topic, search_originals', 'found_passages', ['originals_search']),
  'search.web': m('Searches the open web; results are labelled and never quoted as library evidence.', 'topic, scope as words', 'web_found', ['web_search']),
  'search.together': m('Runs cheap independent tiers in parallel and merges their results in one step.', 'list of fetch/search steps', 'found_passages, found_records', []),
  'search.compare': m('One call for every side of a comparison (compare_search): the same question held to each side, results tagged by side; the tree judges once afterward.', 'compare_sides, topic', 'found_passages tagged by side', ['compare_search']),
  'search.fanout': m('Runs one step once per value (each side of a comparison, each sub-theme), in parallel.', 'by (a unit) or facets; tag = the field the value is written to (default side)', 'found_passages tagged by value', []),
  'fill.sides': m('Fills compare_sides in code: the sides Jev named (two or more), else every tradition the library holds — never chosen by corpus size.', 'compare_sides, religions_specified', 'compare_sides', []),
  'fill.missing_sides': m('After the judge: each side with no answering passage goes to missing (named by the shape), its mention-only passages dropped.', 'found_passages (verdicts), compare_sides', 'found_passages, missing', []),
  probe: m('Runs a search step on a small sample and checks the hits are what the plan expects; adjusts or flags a mismatch.', 'step, expect', 'param_overrides', []),
  'read.around': m('Reads the paragraphs around each passage that will be quoted.', 'found_passages', 'found_passages (context)', ['context_lookup']),
  'read.whole': m('Extends the chosen prayer to the whole prayer (attribution line, short section, contiguous address); one tradition: it in full + two offers; several: each tradition’s first in full.', 'found_passages', 'found_passages (whole prayer first)', ['whole_lookup']),
  'read.source': m('Traces a quotation found in a secondary book to its primary source.', 'found_passages', 'found_passages (traced)', ['source_trace']),
  switch: m('Branches on a unit in code (which is filled, a count, an earlier outcome): no model call.', 'on, cases', 'an edge', []),
  judge: m('ONE Jev decision over a fixed set of options given as params.', 'question, options', 'an option edge', []),
  'judge.passages': m('Jev says per passage whether it answers, only mentions, or contradicts.', 'found_passages', 'found_passages (verdicts)', []),
  'judge.holds': m('One step over all quotation candidates: does each hold the quoted sentence (same words, or another translation)? Marks holds / partial, with the span; the rest drop. Wording that holds needs no model.', 'found_passages (from fetch.phrase), quoted_words', 'found_passages (verdict, span)', []),
  'judge.criteria': m('One Jev choice per planned criterion of a claim: do that criterion’s own finds (library and web) support it, contradict it, or say nothing?', 'criteria, found_passages, web_found', 'criterion_verdicts, found_passages (criterion_verdict)', []),
  'judge.timeline': m('One step. People from fetch.person: keeps those whose cited proof does what the question asks, with the book’s clause. Any other subject (event, work, person): keeps the passages whose own text states a date, each with date, year and event; planned entries with no dated source go to undated_entries.', 'found_records (people) or found_passages, entries, the question', 'found_records / found_passages (dated), undated_entries', []),
  'fill.term_script': m('Fills the term_arabic unit: a Latin term’s Arabic-script spelling (already Arabic or remembered = no model; otherwise one Jev call), so fetch.renderings can look it up.', 'term', 'term_arabic', []),
  'plan.criteria': m('A light generator for the criteria a claim is weighed on (default: the claim itself).', 'challenged_claim or topic', 'criteria', []),
  'plan.phrasings': m('A light generator for search phrases naming the question\'s subject the way the texts word it (default: the question itself).', 'topic', 'phrasings', []),
  'plan.histories': m('A light generator naming the published works that narrate the question\'s subject as its primary or standard history (default: none).', 'topic', 'histories', []),
  'plan.entries': m('A light generator for the entries (periods, events) a timeline orders (default: the subject itself).', 'topic or named_person', 'entries', []),
  'plan.subthemes': m('A light generator for the sub-themes a topic splits into (default: the topic itself).', 'topic', 'sub_themes', []),
  rank: m('Orders what was found by authority, standing, date, score… keeps the top few (per a field, or fields), regroups by a field (or nested fields), skips what was already given.', 'found_passages', 'found_passages', []),
  shape: m('Sets the writer’s instruction from a template chosen by what was found, for the mode.', 'found units', 'the writer instruction', []),
  'hand.strategy': m('Runs another strategy’s tree as a sub-tree on the same units.', 'name', 'found units', []),
  'hand.job': m('Queues a long task as a job with a frozen copy of the scope and offers the result by email.', 'kind', 'a queued job', ['deep_report']),
  'deliver.email': m('Sends the found material as a letter.', 'found units, address', 'a sent letter', []),
  'fallback.agent': m('The research agent, last resort; every use is logged as a defect of the tree.', 'question', 'a finished reply', []),
  'end.absence': m('The shared not-found end. A plan that found nothing hands the turn to the research path (every tool, the whole conversation) first; with passages that did not fit it widens the scope once (and says so), gives the nearest real passage, states the absence.', 'missing, found units', 'the absence reply', ['fused_search']),
  'end.fallback': m('The shared fallback end: the research agent after a tier errored.', 'question', 'a finished reply', []),
  'end.unavailable': m('The shared unavailable end: says the library could not be searched just now, never “not in the library”.', 'none', 'the unavailable reply', []),
};

export const ELEMENTS = E;
