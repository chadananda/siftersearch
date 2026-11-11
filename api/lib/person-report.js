// Person report: one person's pre-researched biography as compact JSON for Anís (biography_lookup) — name or id → the person,
// portrait, life dates, the built life timeline (events/relationships/journeys, each with cited sources) else cited facts.
// No model, no new queries (deps imported on first call, so the pure helpers load anywhere): entityLookup (memoised name index) + getBioPerson (cached dossier, portrait manifest, timelines/<id>.json).

const FACTS_MAX = 40;   // writer context: a life read start to end (evenly spaced along the chronology), the total rides along

// the person a name means: an exact name/alias match first, then the canonical spelling, then the most important bearer
export function pickPerson(cands = []) {
  const people = cands.filter((c) => c.type === 'person' || c.type == null);
  const rank = (c) => [c.exact_match ? 1 : 0, c.canonical_match ? 1 : 0, c.importance ?? 0];
  return [...people].sort((a, b) => { const x = rank(a), y = rank(b); return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]; })[0] ?? null;
}

const spread = (xs, n) => (xs.length <= n ? xs : Array.from({ length: n }, (_, i) => xs[Math.floor((i * xs.length) / n)]));
const cites = (ids, sources) => (ids || []).map((f) => sources?.[f]).filter(Boolean).map((s) => ({ source: s.source ?? null, cite: s.cite ?? null, url: s.url ?? null, proof: s.proof ?? null }));

/** p (getBioPerson's record) → the report. Pure. */
export function toReport(p, { factsMax = FACTS_MAX } = {}) {
  const tl = p.timeline && Array.isArray(p.timeline.events) ? p.timeline : null, src = tl?.sources || {};
  const facts = spread(p.characterizations || [], factsMax).map((c) => ({ statement: c.quote ?? null, relation: c.relation ?? null, when: c.when ?? null,
    proof: c.proof ?? null, source: c.source ?? null, cite: c.cite ?? null, url: c.url ?? null }));
  return { id: p.id, name: p.name, aliases: p.aliases || [], side: p.side ?? null, summary: p.summary ?? null, importance: p.importance ?? 0,
    portrait: p.portrait ?? null, portraitFull: p.portraitFull ?? null,
    wikipedia: p.wiki ? { title: p.wiki.title ?? null, url: p.wiki.url ?? p.wiki.page_url ?? null } : null,
    dates: p.dates || [], death: p.death ?? null, kinship: p.kinship || [],
    timeline: tl ? {
      events: tl.events.map((e) => ({ date: e.date ?? null, year: e.year ?? null, title: e.title ?? null, text: e.text ?? null, quote: e.quote ?? null, sources: cites(e.cites, src) })),
      relationships: (tl.relationships || []).map((r) => ({ who: r.who ?? null, type: r.type ?? null, note: r.note ?? null, sources: cites(r.cites, src) })),
      journeys: (tl.journeys || []).map((j) => ({ place: j.place ?? null, year: j.year ?? null, note: j.note ?? null, sources: cites(j.cites, src) })) } : null,
    facts, factsTotal: p.characterizationsTotal ?? facts.length,
    books: (p.books || []).slice(0, 30), bookCount: (p.books || []).length, mentionCount: p.mentionCount ?? 0 };
}

/** { name } | { id } → { found, person: report|null, others: [{id,name,importance}] } (others = other bearers of the name). */
export async function personReport({ name, id } = {}, { deps = {} } = {}) {
  const lookup = deps.entityLookup || (await import('./entity-api.js')).entityLookup, bio = deps.getBioPerson || (await import('./bio.js')).getBioPerson;
  let pick = null, others = [];
  if (id != null && String(id).replace(/\D/g, '')) pick = { id: Number(String(id).replace(/\D/g, '')) };
  else if (typeof name === 'string' && name.trim()) {
    const cands = (await lookup(name.trim(), { type: 'person', limit: 8 })) || [];
    pick = pickPerson(cands);
    others = cands.filter((c) => c !== pick).slice(0, 5).map((c) => ({ id: c.id, name: c.name, importance: c.importance ?? 0 }));
  }
  const p = pick ? await bio(pick.id) : null;
  return p ? { found: true, person: toReport(p), others } : { found: false, person: null, others };
}

/** The report as a PEOPLE entry for the writer (prompt.js anisUserPayload): the built timeline's events, else the cited facts, each
 *  {statement, when, source, url, proof} — its links join the reply's allowed links (respond.js). Pure. */
export function reportToEntity(r) {
  if (!r?.name) return null;
  const first = (xs) => (xs || []).find((x) => x.url) || (xs || [])[0] || {};
  const evidence = r.timeline?.events?.length
    ? r.timeline.events.map((e) => { const s = first(e.sources); return { statement: [e.title, e.text].filter(Boolean).join(': '), when: e.date ?? (e.year != null ? String(e.year) : null),
      source: [s.source, s.cite].filter(Boolean).join(', ') || null, url: s.url ?? null, proof: e.quote || s.proof || null }; })
    : (r.facts || []).filter((f) => f.statement).map((f) => ({ statement: f.statement, when: f.when, source: [f.source, f.cite].filter(Boolean).join(', ') || null, url: f.url, proof: f.proof }));
  return { id: r.id, name: r.name, aliases: r.aliases || [], summary: r.summary ?? null, portrait: r.portrait ?? null, evidence };
}
