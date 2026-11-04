// PRAYER SHELF (W3; planning/anis-strategies.json D2): Jev said the reader wants a prayer. Code finds the prayer book and, side by
// side, lists its occasion sections and searches the book BY MEANING (phrase vectors) and by the literal words. JEV then picks, in
// one typed choice over the book's own section titles AND the prayers the search found (no synonym map, no keywords), what holds
// the prayer the reader asks for. A need no heading names ("travelling safely", "before an exam") is met by a found prayer; a
// heading is served with the found prayer inside it first, else its first prayer. Prayers are split on their attribution lines;
// the first is given IN FULL, two more offered. Deps (injectable via ctx.deps): work-request findTitled, sections-repo
// sectionsOfDoc, paragraphs-repo paragraphsInRange, hit-links withLinks, qdrant-layers searchPhrases/searchKeywordQdrant, systemone jevFetch.
import { jevFetch } from '../systemone.js';
import { modelFor } from '../model-roles.js';
import { ENDPOINT, MIN_CONFIDENCE } from '../scope-extract.js';
import { NO_LOG, jevProbabilities } from './decision-log.js';
import { stateOf } from './strategy-choice.js';
import { run as runTool } from './tools.js';
import { jevCall, JEV_LIMITS, timeoutDecision } from './jev-call.js';
import { render } from './activities/templates.js';

export const PRAYER_BOOK = 'Bahá’í Prayers';
const MAX_OCCASIONS = 40;
// the book searched by meaning (phrase vectors: a prayer's own words for the need) and by the literal words; each one Qdrant call
const MEANING_HITS = 6, LITERAL_HITS = 3, EXCERPT = 220;

export const PRAYER_HOW = (occasion) => render('prayer.how', { occasion: occasion ? render('prayer.occasion', { occasion }) : '' });   // words = template rows

/** An attribution line closes a prayer: "_—Bahá’u’lláh_", "—‘Abdu’l-Bahá", "— The Báb". Pure. */
export const isAttribution = (text) => /^[\s_*]*[—–-]\s*\S/.test(String(text || '')) && String(text || '').replace(/[_*]/g, '').trim().length < 60;

/** Is this row a heading line (not body text)? `heading` on a content row is the SECTION it sits under (every prayer under
 *  "For The Departed" carries heading "For The Departed"), so it never marks the row itself: blocktype does, or a markdown
 *  "#" line, or a row whose whole text is its heading. A bare `heading: true` (older fixtures) still counts. Pure. */
export const isHeadingRow = (r) => r?.blocktype === 'heading' || r?.heading === true || /^\s*#/.test(String(r?.text || ''))
  || (typeof r?.heading === 'string' && r.heading.trim() !== '' && String(r.text || '').trim() === r.heading.trim());

/** Section rows → prayers: runs of paragraphs, each ending at an attribution line (a run without one is kept too). Pure. */
export function splitPrayers(rows = []) {
  const prayers = []; let cur = [];
  for (const r of rows) {
    if (!String(r.text || '').trim() || isHeadingRow(r)) continue;
    cur.push(r);
    if (isAttribution(r.text)) { prayers.push(cur); cur = []; }
  }
  if (cur.length) prayers.push(cur);
  return prayers.filter((p) => p.some((r) => !isAttribution(r.text)));
}

/** The prayer (a splitPrayers run) holding paragraph `pi`, or null. Pure. */
export const prayerAt = (prayers, pi) => prayers.find((p) => p.some((r) => r.paragraph_index === pi)) || null;

/** The smallest section of the book holding paragraph `pi`, or null. Pure. */
export const sectionAt = (sections, pi) => (pi == null ? null
  : sections.filter((x) => pi >= x.start_index && pi <= x.end_index).sort((a, b) => a.paragraphs - b.paragraphs)[0] || null);

/** The book's search hits → choice candidates for Jev: this book only (a hit elsewhere shares paragraph numbers with no section
 *  here — 11-04 w3:pr-no-heading served the Tablets of Visitation from another book's ¶831), body text only, one per paragraph,
 *  meaning hits first. Keyed "found:<paragraph_index>". Pure. */
export function foundCandidates(docId, lists, sections) {
  const seen = new Set(); const out = [];
  for (const p of lists.flat()) {
    const pi = p?.paragraph_index;
    if (pi == null || Number(p.document_id) !== Number(docId) || seen.has(pi) || isAttribution(p.text) || isHeadingRow(p)) continue;
    seen.add(pi);
    out.push({ key: `found:${pi}`, p, section: sectionAt(sections, pi) });
  }
  return out;
}

const hit = (r, doc, theme) => ({ id: r.id, text: r.text, title: doc.title, author: doc.author, document_id: doc.id, paragraph_index: r.paragraph_index,
  religion: doc.religion, collection: doc.collection, language: doc.language, source_url: r.url || null, theme });
const excerpt = (t) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > EXCERPT ? `${s.slice(0, EXCERPT).replace(/\s+\S*$/, '')}…` : s; };

/** Jev's one typed choice: a heading of the book, a found prayer (`found` = [{ key, text, heading }]), or none. */
export async function pickOccasion(messages, titles, { profile, fetchImpl, apiKey = process.env.TYPESAFE_API_KEY, onJev = null, found = [], ...limits }) {
  if (!apiKey || (!titles.length && !found.length)) return null;
  const criteria = { ...Object.fromEntries(titles.map((t) => [t, `the prayers headed "${t}"`])),
    ...Object.fromEntries(found.map((f) => [f.key, `the prayer that reads "${f.text}"${f.heading ? ` (under "${f.heading}")` : ''}`])),
    none: 'no listed heading or prayer fits what the reader asks for' };
  const t0 = Date.now();
  const call = await jevCall('occasion', async (signal) => {
    const res = await fetchImpl(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelFor('assistant-triage').model, state: stateOf(messages, { profile }),
        questions: { occasion: { type: 'choice', instructions: 'Which of these holds the prayer the reader asks for (by occasion, need, person or name): a heading of the prayer book, or one of the prayers a search of the book found?', criteria } } }),
      signal });
    return res.ok ? (await res.json()).answers?.occasion ?? null : null;
  }, { ...JEV_LIMITS.occasion, ...limits, onJev });
  const a = call.value;
  return a ? { choice: a.choice ?? a.value ?? null, confidence: a.confidence ?? a.distribution?.[a.choice ?? a.value] ?? null, distribution: a.distribution ?? null, ms: Date.now() - t0 } : null;
}

export async function prayerShelf(ctx) {
  const { messages, query, profile = {}, decisions = NO_LOG, deps = {} } = ctx;
  const w = (await runTool('document_search', { title: PRAYER_BOOK, min: 0.9 }, { deps }).catch(() => null))?.works?.[0];
  const doc = w && /prayers/i.test(w.title) ? w : null;
  decisions.record('prayer:book', { by: 'code', saw: PRAYER_BOOK, chosen: doc ? `${doc.id} ${doc.title}` : null, reason: doc ? 'title index' : 'no prayer book in the index' });
  if (!doc) return null;
  const sectionsOfDoc = deps.sectionsOfDoc || (await import('../repos/sections-repo.js')).sectionsOfDoc;
  // the sections and the book searched (by meaning + the literal words) side by side: a need no heading names is found by its words
  const scoped = (limit) => ({ query, limit, filters: { documentId: doc.id } });
  const [allSections, meaning, literal] = await Promise.all([sectionsOfDoc(doc.id).catch(() => []),
    query ? runTool('phrase_search', scoped(MEANING_HITS), { deps }).catch(() => null) : null,
    query ? runTool('literal_search', scoped(LITERAL_HITS), { deps }).catch(() => null) : null]);
  const sections = allSections.filter((s) => s.title && s.paragraphs > 0);
  const byTitle = new Map(); for (const s of sections) if (!byTitle.has(s.title)) byTitle.set(s.title, s);
  const occasions = [...byTitle.values()].sort((a, b) => (a.level ?? 1) - (b.level ?? 1) || b.paragraphs - a.paragraphs).slice(0, MAX_OCCASIONS);
  const found = foundCandidates(doc.id, [meaning?.passages || [], literal?.passages || []], sections);
  const byKey = new Map(found.map((f) => [f.key, f]));
  decisions.record('prayer:search', { by: 'code', saw: query, chosen: `${found.length} prayers found`,
    reason: `scoped to the prayer book (meaning ${meaning?.passages?.length ?? 0}, literal ${literal?.passages?.length ?? 0})` });
  const pick = await (deps.pickOccasion || pickOccasion)(messages, occasions.map((s) => s.title), { profile, fetchImpl: deps.fetchImpl || jevFetch('anis-prayer-occasion'),
    found: found.map((f) => ({ key: f.key, text: excerpt(f.p.text), heading: f.section?.title || null })), onJev: (info) => decisions.record('jev:timeout', timeoutDecision(info)) });
  const known = (k) => byTitle.has(k) || byKey.has(k);
  const confident = pick?.choice && pick.choice !== 'none' && known(pick.choice) && (pick.confidence ?? 0) >= MIN_CONFIDENCE;
  const options = [...occasions.map((s) => s.title), ...found.map((f) => f.key), 'none'];
  decisions.record('prayer:occasion', { by: 'jev', saw: { headings: occasions.map((s) => s.title), found: found.map((f) => `${f.key} ${excerpt(f.p.text).slice(0, 60)}`) }, options, probabilities: jevProbabilities(pick),
    chosen: confident ? pick.choice : 'none', reason: !pick ? 'no answer (see jev:timeout when it timed out)' : confident ? null : pick.choice === 'none' ? 'nothing listed fits' : 'low confidence', ms: pick?.ms ?? null });
  const withLinks = deps.withLinks || (await import('../hit-links.js')).withLinks;
  const paragraphsInRange = deps.paragraphsInRange || (await import('../paragraphs-repo.js')).paragraphsInRange;
  // a section's prayers, read once per section (a found paragraph outside every section: the window around it)
  const reads = new Map();
  const prayersOf = (s, pi) => { const [a, b] = s ? [s.start_index, s.end_index] : [Math.max(0, pi - 20), pi + 20]; const k = `${a}-${b}`;
    if (!reads.has(k)) reads.set(k, paragraphsInRange(doc.id, a, b).catch(() => []).then(splitPrayers)); return reads.get(k); };
  // the found candidates, Jev's most probable first, then search order. A found prayer's weight is its own probability plus its
  // heading's: the two name the same prayer, so Jev splits his belief between them (11-04: "For The Departed" 0.59 beside its
  // own Prayer for the Dead; "found:439" 0.5 beside "Protection")
  const probs = jevProbabilities(pick) || {};
  const weight = (f) => (probs[f.key] ?? 0) + (f.section ? probs[f.section.title] ?? 0 : 0);
  const ranked = found.map((f, i) => ({ f, i })).sort((a, b) => weight(b.f) - weight(a.f) || a.i - b.i).map((x) => x.f);
  // the first prayer IN FULL, two more by their opening lines, all linked
  const give = async (first, more, { occasion, how, via }) => {
    const chosen = [...first.map((r) => ({ r, theme: 'prayer' })), ...more.slice(0, 2).map((p) => ({ r: p[0], theme: 'alternative' }))];
    const linked = await withLinks(chosen.map(({ r }) => ({ id: r.id, doc_id: doc.id, paragraph_index: r.paragraph_index, text: r.text, title: doc.title }))).catch(() => chosen.map(({ r }) => r));
    const passages = chosen.map(({ r, theme }, i) => hit({ ...r, url: linked[i]?.url || null }, doc, theme));
    return { passages, plan: { shape: 'prayer', book: doc.id, occasion, ...via }, format: { id: 'prayer', by: 'strategy:prayer', how: PRAYER_HOW(how) } };
  };
  const same = (a, b) => a[0]?.paragraph_index === b[0]?.paragraph_index;
  // a heading → its prayers, the found prayer inside it first (Jev's "Protection" for a journey is the travel prayer, not its first)
  const serveHeading = async (s, how) => {
    const prayers = await prayersOf(s);
    const inside = ranked.filter((f) => f.section && f.section.start_index >= s.start_index && f.section.end_index <= s.end_index);
    const lead = inside.map((f) => prayerAt(prayers, f.p.paragraph_index)).find(Boolean) || prayers[0];
    decisions.record('prayer:pick', { by: 'code', saw: { section: s.title, prayers: prayers.length, found_inside: inside.length, how }, options: ['found prayer in full + two more', 'first in full + two more', 'search the book'],
      chosen: !prayers.length ? 'search the book' : lead !== prayers[0] ? 'found prayer in full + two more' : 'first in full + two more', reason: prayers.length ? null : 'no prayer runs in the section' });
    if (!lead) return null;
    return give(lead, prayers.filter((p) => !same(p, lead)), { occasion: s.title, how: s.title, via: { prayers: prayers.length, ...(how !== 'jev' ? { via: how } : {}) } });
  };
  // found prayers → the first in full, the next found (another prayer) as the two more, else its own heading's others
  const serveFound = async (list, how) => {
    const runs = await Promise.all(list.slice(0, 4).map(async (f) => ({ f, prayers: await prayersOf(f.section, f.p.paragraph_index) })));
    const got = runs.map(({ f, prayers }) => ({ f, prayer: prayerAt(prayers, f.p.paragraph_index), prayers })).filter((x) => x.prayer);
    decisions.record('prayer:pick', { by: 'code', saw: { found: list.slice(0, 4).map((f) => f.key), prayers: got.length, how }, options: ['found prayer in full + two more', 'none'],
      chosen: got.length ? `${got[0].f.key} in full + two more` : 'none', reason: got.length ? null : 'no prayer run holds the found paragraphs' });
    if (!got.length) return null;
    const lead = got[0];
    const more = []; for (const p of [...got.slice(1).map((x) => x.prayer), ...lead.prayers]) if (!same(p, lead.prayer) && !more.some((m) => same(m, p))) more.push(p);
    return give(lead.prayer, more, { occasion: lead.f.section?.title ?? null, how: null, via: { via: how, found: lead.f.p.paragraph_index } });
  };
  if (confident) {
    const out = byKey.has(pick.choice) ? await serveFound([byKey.get(pick.choice), ...ranked.filter((f) => f.key !== pick.choice)], 'jev') : await serveHeading(byTitle.get(pick.choice), 'jev');
    if (out) return out;
  }
  // no confident choice → the found prayers (Jev's most probable first); nothing found → Jev's top heading below the bar
  const lowPick = pick?.choice && byTitle.has(pick.choice) ? byTitle.get(pick.choice) : null;
  decisions.record('prayer:section', { by: 'code', saw: { found: found.length, top: ranked[0]?.key ?? null }, options: ['the found prayers', "Jev's top heading", 'none'],
    chosen: ranked.length ? 'the found prayers' : lowPick ? lowPick.title : 'none', reason: ranked.length ? (weight(ranked[0]) ? `Jev's most probable found prayer first (${weight(ranked[0]).toFixed(2)} with its heading)` : 'search order') : lowPick ? 'nothing found; Jev below the bar' : null });
  if (ranked.length) { const out = await serveFound(ranked, weight(ranked[0]) >= MIN_CONFIDENCE ? 'jev' : 'search'); if (out) return out; }
  if (lowPick) { const out = await serveHeading(lowPick, 'low-confidence'); if (out) return out; }
  // found paragraphs no prayer run holds: the passages as found (this book only)
  if (!found.length) return null;
  return { passages: found.map((f) => ({ ...f.p, theme: 'prayer' })), plan: { shape: 'prayer', book: doc.id, occasion: null, searched: true }, format: { id: 'prayer', by: 'strategy:prayer', how: PRAYER_HOW(null) } };
}
