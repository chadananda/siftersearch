// EXECUTES the strategy Jev chose (strategy-choice.js; W3 11-03) — code never chooses one from the wording. Each executor returns
// { passages (search-hit shape, `theme` set), plan, format: {id, by, how} } or null (nothing to execute → the ordinary path), and
// records its decisions (coverage per side, widening, fallbacks) in ctx.decisions. Comparison = parallel search per tradition,
// each side covered / thin → widened / missing → said so (planning/anis-strategies.json C1, B1).
// Deps: respond.js passes search (executeSearch), query (searchQueryFor), distil (distilQuery), plan, profile, decisions.
import { strategyOf } from './strategy-choice.js';
import { NO_LOG } from './decision-log.js';
import { run as runTool } from './tools.js';
import { booksFound, namedSource } from './researcher.js';
import { drawFromCriteria } from '../search-plan.js';

export const COVER = { covered: 3, thin: 1 };   // passages per side: ≥3 covered, 1–2 thin (widen once), 0 missing
const PER_SIDE = 6, MAX_PASSAGES = 12, MAX_COMPARED = 18;

export const COMPARISON_HOW = (sides, coverage) => `This is a COMPARISON across ${sides.length ? sides.join(', ') : 'the traditions the passages come from'}. Answer side by side: one short section per tradition, in the order named, built ONLY from that tradition's own passages (the passage header's theme names its tradition) and in its own terms; then two or three sentences on the common ground and the real differences — no false harmony.
${Object.entries(coverage).filter(([, c]) => c === 'missing').map(([s]) => `The library returned NOTHING from ${s} on this: say so plainly in that section ("the library has nothing from ${s} on this") — never fill it from another tradition or from memory.`).join('\n')}${Object.entries(coverage).filter(([, c]) => c === 'thin').map(([s]) => `Only a passage or two came from ${s}: say the coverage is thin there.`).join('\n')}`.trim();

export const UNDERSTANDING_HOW = (religion, coverage) => `The reader wants to UNDERSTAND this${religion ? ` within ${religion}` : ''}, not a list. Lead with what the scripture itself says (quote it), then how it has been explained or applied (the passages' authors and standing tell you which is which), then what the passages leave open. ${coverage === 'missing' ? 'The library returned nothing on this: say so plainly and do not answer from memory.' : coverage === 'thin' ? 'Coverage is thin — say what the one or two passages support and no more.' : ''}`.trim();

const tag = (hits, theme) => (hits || []).map((p) => ({ ...p, theme }));
const coverageOf = (n) => (n >= COVER.covered ? 'covered' : n >= COVER.thin ? 'thin' : 'missing');
const dedupe = (ps) => { const seen = new Set(); return ps.filter((p) => { const k = `${p.document_id}:${p.paragraph_index}`; if (seen.has(k)) return false; seen.add(k); return true; }); };

/** Round-robin across sides so every covered side is represented. Pure. */
export function interleave(bySide, max = MAX_PASSAGES) {
  const out = []; const lists = bySide.map((l) => [...l]);
  while (out.length < max && lists.some((l) => l.length)) for (const l of lists) if (l.length && out.length < max) out.push(l.shift());
  return out;
}

// a passage belongs to a side when its tradition is that side's (data field; a passage with no tradition recorded is kept)
const foldTrad = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
export const ofSide = (p, side) => !p?.religion || foldTrad(p.religion) === foldTrad(side);

// The comparison's SUBJECT as a search string: the question without the names it compares (the name spans of the thread —
// drawFromCriteria, structure only; the same spans Jev classified as books). "How do the Bahá’í writings and the Book of
// Mormon treat tithing?" → "How do the writings and the treat tithing?": inside the Book of Mormon the whole question ranked
// "the wolf shall dwell with the lamb" over 3 Nephi 24's tithes (p7 missing-side). Not intent — only what is searched. Pure.
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function subjectQuery(query, messages) {
  const spans = Object.keys(drawFromCriteria(messages) || {}).filter((k) => k !== 'none').sort((x, y) => y.length - x.length);
  let q = String(query || '');
  for (const n of spans) q = q.replace(new RegExp(esc(n), 'g'), ' ');
  q = q.replace(/\s+/g, ' ').replace(/\s+([?.,;:!])/g, '$1').trim();
  return q && q !== String(query || '').trim() && q.replace(/[^\p{L}]/gu, '').length >= 3 ? q : null;
}

async function searchSide({ search, query, messages, profile, religion, limit = PER_SIDE }) {
  const r = await runTool('combined_search', { query, limit, scope_config: profile?.scope_config, ...(religion ? { filters: { tradition: religion } } : {}),
    messages, defaults: religion ? { religion } : {} }, { search });
  return r?.passages || [];
}

export async function comparison(choice, ctx) {
  const { messages, query, distil, search, profile = {}, decisions = NO_LOG, searchIn = null, sourceTools = null } = ctx;
  let sides = [...new Set(choice.sides || [])];
  if (sides.length < 2) {
    // Jev named fewer than two sides: the comparative is NEVER narrowed (scope-extract rule 2) — one wide search, the writer covers each tradition the passages come from
    decisions.record('sides:fallback', { by: 'code', saw: sides, options: ['per-side searches', 'one wide search'], chosen: 'one wide search', reason: `${sides.length} side(s) from Jev` });
    const hits = await searchSide({ search, query, messages, profile, religion: null, limit: MAX_PASSAGES });
    const byTrad = {}; for (const p of hits) byTrad[p.religion || 'unknown'] = (byTrad[p.religion || 'unknown'] || 0) + 1;
    decisions.record('coverage', { by: 'code', saw: byTrad, options: ['covered', 'thin', 'missing'], chosen: coverageOf(hits.length), reason: `${hits.length} passages, ${Object.keys(byTrad).length} traditions` });
    return { passages: hits.map((p) => ({ ...p, theme: p.religion || null })), plan: { shape: 'comparison', comparative: true, sides: [], wide: true, coverage: byTrad },
      format: { id: 'comparison', by: 'strategy:comparison', how: COMPARISON_HOW([], {}) } };
  }
  const t0 = Date.now();
  const named = choice.sources || {};
  // per side, in parallel: the side's search, and — when Jev named that side's BOOK ("the Book of Mormon") — the book resolved
  // (researcher namedSource) and searched inside; then the side's top book searched inside (live chat's book step). Every
  // passage kept is the side's own tradition (the filter leaked other traditions' passages into a side, p5 afterlife).
  const sideRun = async (side) => {
    const name = named[side] && sourceTools ? named[side] : null;
    // the whole question AND its distilled subject, side by side (the whole comparison question ranks the other side's
    // vocabulary too: p5 fasting found the Íqán's "sun and moon" for the Bahá'í side; "fasting" alone finds the Tablet on the Fast)
    const [hits, subj, src] = await Promise.all([
      searchSide({ search, query, messages, profile, religion: side }).catch(() => []),
      wider ? searchSide({ search, query: wider, messages, profile, religion: side }).catch(() => []) : [],
      name ? namedSource(name, wider || query, sourceTools).catch(() => null) : null,
    ]);
    const own = dedupe(interleave([hits, subj], Infinity)).filter((p) => ofSide(p, side));
    const books = searchIn ? booksFound({ works: src?.works || [], searched: [{ query: wider || query, docs: own.map((p) => p.document_id) }], question: wider || query, n: name ? 2 : 1 }) : [];
    const inside = (await Promise.all(books.map((b) => searchIn(b.query, b.document_id).catch(() => [])))).map((l) => l.filter((p) => ofSide(p, side)));
    const fromSource = [...(src?.passages || []).filter((p) => ofSide(p, side)), ...(name ? inside[0] || [] : [])];
    const all = dedupe([...fromSource, ...own, ...inside.slice(name ? 1 : 0).flat()]);
    decisions.record(`side:${side}`, { by: name ? 'jev' : 'code', saw: { searched: hits.length, subject: wider ? subj.length : null, other_tradition: hits.length + subj.length - own.length, source: name, source_works: (src?.works || []).map((w) => w.id), books: books.map((b) => b.document_id) },
      options: ['side search', 'named book + side search'], chosen: `${all.length} passages (${fromSource.length} from the named book)`, reason: name ? 'Jev named this side\'s book' : null });
    return all;
  };
  const base = distil ? distil(query) : query;
  let wider = subjectQuery(base, messages) || (base !== query ? base : null);
  const first = await Promise.all(sides.map((s) => sideRun(s).catch((err) => {
    decisions.record(`side:${s}`, { by: 'code', saw: { error: String(err?.message || err).slice(0, 160) }, options: ['side search'], chosen: '0 passages', reason: 'side failed' }); return []; })));
  const coverage = {}; const final = [];
  for (let i = 0; i < sides.length; i++) {
    let hits = first[i]; let c = coverageOf(hits.length);
    if (c !== 'covered') {
      // thin or missing after both wordings → the whole library for that side's tradition is all there is; said so (COMPARISON_HOW)
      decisions.record(`widen:${sides[i]}`, { by: 'code', saw: { passages: hits.length, wider }, options: ['keep', 'widen'], chosen: wider ? 'widen' : 'keep', reason: `${c} after the question${wider ? ' and its subject' : ''}` });
    }
    coverage[sides[i]] = c;
    decisions.record(`coverage:${sides[i]}`, { by: 'code', saw: hits.length, options: ['covered', 'thin', 'missing'], chosen: c, reason: `${hits.length} passages from ${sides[i]}` });
    final.push(tag(hits, sides[i]));
  }
  const passages = interleave(final, Math.min(MAX_COMPARED, PER_SIDE * sides.length));
  return { passages, plan: { shape: 'comparison', comparative: true, sides, coverage, ms: Date.now() - t0 },
    format: { id: 'comparison', by: 'strategy:comparison', how: COMPARISON_HOW(sides, coverage) } };
}

export async function understanding(choice, ctx) {
  const { messages, query, distil, search, plan, profile = {}, decisions = NO_LOG, searchIn, inBooks = 0, drawFrom = null, sourceTools = null } = ctx;
  // the book / author Jev named as the source (plan.drawFrom), resolved beside the search (researcher namedSource)
  const sourceP = drawFrom && sourceTools ? namedSource(drawFrom, query, sourceTools).catch(() => null) : null;
  const religion = plan?.filters?.religion || profile.default_tradition || null;
  decisions.record('understanding:scope', { by: plan?.source?.religion === 'jev' ? 'jev' : 'code', saw: { plan: plan?.filters?.religion ?? null, reader: profile.default_tradition ?? null },
    options: ['one tradition', 'whole library'], chosen: religion || 'whole library', reason: religion ? 'tradition from the plan / reader' : 'no tradition known' });
  let hits = await searchSide({ search, query, messages, profile, religion, limit: 10 });
  let c = coverageOf(hits.length);
  if (c !== 'covered') {
    // thin / missing → widen: the distilled subject, and the whole library if a tradition narrowed it
    const wider = distil ? distil(query) : query;
    const more = await searchSide({ search, query: wider || query, messages, profile, religion: null, limit: 10 }).catch(() => []);
    decisions.record('understanding:widen', { by: 'code', saw: { first: hits.length, wider, more: more.length }, options: ['keep', 'widen'], chosen: 'widen', reason: `${c} after the scoped search` });
    hits = dedupe([...hits, ...more]); c = coverageOf(hits.length);
  }
  decisions.record('understanding:coverage', { by: 'code', saw: hits.length, options: ['covered', 'thin', 'missing'], chosen: c, reason: `${hits.length} passages` });
  let top = hits.slice(0, MAX_PASSAGES);
  const src = sourceP ? await sourceP : null;
  if (src) {
    decisions.record('understanding:named-source', { by: 'jev', saw: { name: drawFrom, ...(src.name && src.name !== drawFrom ? { resolved: src.name } : {}), authors: src.authors, works: src.works.filter((w) => !w.other).map((w) => w.id) },
      options: ['drawn from the named source'], chosen: `${src.passages.length} passages`, reason: 'Jev named the book or author the answer is drawn from' });
    // the named source's own passages lead (the reader asked what THAT book / author says)
    const had = new Set(src.passages.map((p) => `${p.document_id}:${p.paragraph_index}`));
    top = [...dedupe(src.passages), ...top.filter((p) => !had.has(`${p.document_id}:${p.paragraph_index}`))];
  }
  if (searchIn && inBooks && top.length) {
    // LIVE chat's book step (coordinator 11-03: the narrative passages, Saiedi): the top books the search found, each searched
    // inside with the same query, in parallel; a failed book costs only its own passages (the named source's works first)
    const books = booksFound({ works: src?.works || [], searched: [{ query, docs: top.map((p) => p.document_id) }], question: query, n: inBooks });
    const inside = await Promise.all(books.map((b) => searchIn(b.query, b.document_id).catch(() => [])));
    const had = new Set(top.map((p) => `${p.document_id}:${p.paragraph_index}`));
    const more = dedupe(inside.flat()).filter((p) => !had.has(`${p.document_id}:${p.paragraph_index}`));
    decisions.record('understanding:in-books', { by: 'code', saw: books.map((b) => b.document_id), options: ['top books searched inside'], chosen: `${more.length} passages added`, reason: 'live chat book step' });
    top = [...top, ...more];
  }
  // scripture first, then interpretation (the writer leads with the Writings themselves)
  const scripture = (p) => /scripture|revelation|doctrine/i.test(p.standing || '') ? 0 : 1;
  const passages = top.map((p) => ({ ...p, theme: scripture(p) === 0 ? 'scripture' : 'interpretation' })).sort((a, b) => scripture(a) - scripture(b));
  const named = (src?.works || []).filter((w) => !w.other).map((w) => Number(w.id));
  return { passages, plan: { shape: 'understanding', religion, coverage: c, ...(named.length ? { namedWorks: named } : {}) }, format: { id: 'understanding', by: 'strategy:understanding', how: UNDERSTANDING_HOW(religion, c) } };
}

/** Run the executor for Jev's choice. null = nothing to execute. */
export async function runStrategy(choice, ctx) {
  const name = strategyOf(choice);
  if (!name) return null;
  const log = ctx.decisions || NO_LOG;
  // the executors are registry strategies (tools.js): comparison, understanding, prayer, guidance, reference
  const out = await runTool(name, choice, { ...ctx, decisions: log });
  if (!out) log.record(`${name}:fallthrough`, { by: 'code', chosen: 'ordinary path', reason: 'executor found nothing to execute' });
  return out;
}
