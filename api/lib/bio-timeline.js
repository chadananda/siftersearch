// Life-timeline synthesis for one person (Chad 10-09, after Immerse's figure pages): the dossier's cited, dated facts →
// one LLM call → dated events, typed relationships and journeys, every item citing the facts it rests on. Pure: fact
// selection, prompt, validated parse. The LLM never invents a citation (unknown keys dropped) or a quote (verbatim only).
// Built by scripts/bio/build-timelines.mjs; served from BIO_ROOT/timelines/<id>.json by bio.js getBioPerson.

export const TIMELINE_VERSION = 'timeline-v5-2026-10-09';
export const REL_TYPES = ['family', 'teacher', 'student', 'companion', 'guardian', 'protector', 'patron', 'captor', 'adversary', 'persecutor', 'correspondent', 'successor', 'other'];

// The authoritative spine: when sources disagree, these win (GPB, then the narrative it rests on).
const SPINE = [/^God Passes By$/i, /^The Dawn-Breakers/i, /^Memorials of the Faithful$/i, /^A Traveller's Narrative/i];
const SKIP = new Set(['also-known-as']);
const BASIS = { stated: 3, estimate: 1, pin: 1 };

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
export const yearOf = (when) => { const m = String(when || '').match(/\b(1[5-9]\d\d|20\d\d)\b/); return m ? Number(m[1]) : null; };
const basisOf = (when) => (String(when || '').match(/\[(\w+)\]/) || [])[1] || null;

/** Pick the facts worth showing the model: deduped; EVERY spine fact first (up to half the cap — the pilot cited The
 *  Dawn-Breakers once out of 106 facts when the spine competed by year), then the rest spread across the years
 *  (round-robin) so 600 facts about 1848 cannot crowd out the rest. Returns facts with keys f1…fN. */
export function selectFacts(characterizations, { cap = 260 } = {}) {
  const seen = new Set(), pool = [];
  for (const c of characterizations || []) {
    if (!c?.quote || SKIP.has(c.relation)) continue;
    const k = norm(c.quote).replace(/^\S+ \S+ /, '');   // the subject's name leads every statement
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const spine = SPINE.some((r) => r.test(c.source || ''));
    pool.push({ ...c, year: yearOf(c.when), spine, score: (spine ? 4 : 0) + (BASIS[basisOf(c.when)] || 0) + (c.proof ? 1 : 0) });
  }
  pool.sort((a, b) => b.score - a.score);
  const picked = pool.filter((f) => f.spine).slice(0, Math.floor(cap / 2));
  const byYear = new Map();
  for (const f of pool.filter((x) => !picked.includes(x))) {
    const y = f.year ?? 'undated';
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(f);
  }
  const buckets = [...byYear.values()];
  for (let round = 0; picked.length < cap && buckets.some((b) => b.length > round); round++)
    for (const b of buckets) if (b[round] && picked.length < cap) picked.push(b[round]);
  picked.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
  return picked.map((f, i) => ({ ...f, key: `f${i + 1}` }));
}

const factLine = (f) => `${f.key} | ${f.when || 'undated'}${f.spine ? ' | AUTHORITATIVE' : ''} | ${f.cite || f.source || '?'} | ${f.quote}`
  + (f.proof ? ` | proof: "${String(f.proof).replace(/\s+/g, ' ').slice(0, 220)}"` : '');

/** The one call: system rules + the person + the numbered facts. */
export function timelinePrompt(person, facts) {
  const system = `You write the life timeline of one figure of Bábí and Bahá'í history for a biography page, using ONLY the numbered facts given.
Rules:
- 10 to 25 events in date order covering the whole life (birth/origins, turning points, journeys, imprisonments, writings, death and what followed). Merge facts about the same event into ONE event — never list an event twice.
- Every event, relationship and journey cites the fact keys it rests on ("cites": ["f12","f40"]). Use no knowledge beyond the facts.
- ONE event per real happening. Her/his death, an imprisonment, a journey is ONE event however many facts describe it and whatever years those facts carry: merge them all into it.
- Dates: [stated] = the source gives the date. [estimate] and [pin] = a year guessed from the surrounding narrative, OFTEN WRONG — never date an event from them when a [stated] or AUTHORITATIVE fact (or the death given above) dates it, and never split one happening into several years because pins differ. Write dates as the best fact gives them ("1848", "1848 Jun", "c. 1817"). SEQUENCE: The Dawn-Breakers (DB) and God Passes By (GPB) are narratives told in order, so their paragraph numbers (DB ¶467 comes after DB ¶300) give the TRUE ORDER of events whatever year a pin says; order events by them and date pinned events to fit. Facts marked AUTHORITATIVE (God Passes By, The Dawn-Breakers, Memorials of the Faithful) carry the story: build the spine of the timeline from them and use the rest to add detail. When [stated] or AUTHORITATIVE facts disagree (a different year or place), keep one event and say so in "conflict" naming both versions.
- "text": 1–3 plain sentences, past tense, no praise beyond what the sources say.
- "quote" (optional, at most one per event, use sparingly for memorable words): a span copied EXACTLY from one cited fact's proof, with "quote_cite" its key.
- relationships: the people most important in this life, type one of ${REL_TYPES.join(', ')}; "note" says how (e.g. "uncle and father-in-law").
- journeys: places lived in, travelled to or imprisoned in, in order, with year when known — ONLY places a cited fact says this person was actually in.
Answer with JSON only: {"events":[{"date":"","title":"","text":"","cites":[],"quote":"","quote_cite":"","conflict":""}],"relationships":[{"who":"","type":"","note":"","cites":[]}],"journeys":[{"place":"","year":"","note":"","cites":[]}]}`;
  const head = `PERSON: ${person.name}${person.aliases?.length ? ` (also: ${person.aliases.slice(0, 8).join('; ')})` : ''}`
    + `${person.death?.year ? ` — died ${person.death.year}${person.death.place ? ' in ' + person.death.place : ''}` : ''}`
    + `${person.kinship?.length ? `\nKIN: ${person.kinship.map((k) => `${k.relation}: ${k.who}`).join('; ')}` : ''}`;
  return [{ role: 'system', content: system }, { role: 'user', content: `${head}\n\nFACTS:\n${facts.map(factLine).join('\n')}` }];
}

/** Second call: the same facts + the draft → a corrected draft. One prompt both selecting and sequencing 260 facts left
 *  duplicates and order slips on the densest lives (Ṭáhirih: the Kalantar confinement twice; pilot v3). */
export function reviewPrompt(person, facts, draft) {
  const [sys, user] = timelinePrompt(person, facts);
  const strip = (d) => ({ events: d.events.map(({ year, ...e }) => e), relationships: d.relationships, journeys: d.journeys });
  return [{ role: 'system', content: `${sys.content}

You are now REVIEWING a draft written under these rules. Correct it:
1. The same happening told twice (same confinement, journey, meeting or death under two dates or titles) → ONE event citing all their facts.
2. Order that contradicts the DB / GPB paragraph order of the cited facts → move and re-date the event.
3. Events with no real content ("she was held in captivity") → merge into the event they belong to, or drop.
4. A major happening told in AUTHORITATIVE facts but missing from the draft → add it.
5. Any claim the cited facts do not support → fix or drop.
6. Facts that cannot belong to THIS person's life as the AUTHORITATIVE facts tell it (another home town, another father's mosque, a place or role the authoritative facts give to someone else) were attached to the wrong person upstream → leave them out. (Quddús was given Ḥujjat's Zanján this way.)
Return the FULL corrected timeline as JSON in the same shape.` },
  { role: 'user', content: `${user.content}

DRAFT:
${JSON.stringify(strip(draft))}` }];
}

const JSON_BLOCK = /\{[\s\S]*\}/;
/** Parse and validate: unknown citation keys dropped, items with none left dropped, quotes kept only if verbatim. */
export function parseTimeline(text, facts) {
  const byKey = new Map(facts.map((f) => [f.key, f]));
  let raw;
  try { raw = JSON.parse((String(text).match(JSON_BLOCK) || [])[0]); } catch { return null; }
  if (!raw || !Array.isArray(raw.events)) return null;
  const cites = (a) => [...new Set((Array.isArray(a) ? a : []).filter((k) => byKey.has(k)))];
  const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const events = raw.events.map((e) => {
    const c = cites(e.cites);
    if (!c.length || !flat(e.text)) return null;
    let quote = flat(e.quote), qc = byKey.has(e.quote_cite) ? e.quote_cite : null;
    if (quote && !(qc && flat(byKey.get(qc).proof).includes(quote))) { qc = c.find((k) => flat(byKey.get(k).proof).includes(quote)) || null; }
    if (!qc) quote = '';
    const year = yearOf(e.date) ?? Math.min(...c.map((k) => byKey.get(k).year ?? 9999));
    return { date: flat(e.date) || (year < 9999 ? String(year) : ''), year: year < 9999 ? year : null, title: flat(e.title), text: flat(e.text),
      cites: c, ...(quote ? { quote, quote_cite: qc } : {}), ...(flat(e.conflict) ? { conflict: flat(e.conflict) } : {}) };
  }).filter(Boolean).sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
  const relationships = (raw.relationships || []).map((r) => ({ who: flat(r.who), type: REL_TYPES.includes(r.type) ? r.type : 'other', note: flat(r.note), cites: cites(r.cites) }))
    .filter((r) => r.who && r.cites.length);
  const journeys = (raw.journeys || []).map((j) => ({ place: flat(j.place), year: flat(j.year), note: flat(j.note), cites: cites(j.cites) }))
    .filter((j) => j.place && j.cites.length);
  return { events, relationships, journeys };
}

/** The sources block the page renders citations from: only the facts actually cited. */
export function citedSources(timeline, facts) {
  const used = new Set([...timeline.events, ...timeline.relationships, ...timeline.journeys].flatMap((x) => x.cites));
  return Object.fromEntries(facts.filter((f) => used.has(f.key)).map((f) => [f.key,
    { source: f.source || null, cite: f.cite || null, when: f.when || null, proof: f.proof || null, url: f.url || null }]));
}
