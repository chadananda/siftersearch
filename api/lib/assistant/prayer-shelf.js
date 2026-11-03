// PRAYER SHELF (W3; planning/anis-strategies.json D2): Jev said the reader wants a prayer. Code finds the prayer book, lists its
// occasion sections, and JEV picks the section from the thread (a typed choice over the book's own section titles — no synonym
// map, no keywords); the section's prayers are split on their attribution lines; the first is given IN FULL, two more offered.
// No fitting section → a search scoped to the prayer book. Deps (injectable via ctx.deps): work-request findTitled, docs-repo
// listDocs, sections-repo sectionsOfDoc, paragraphs-repo paragraphsInRange, hit-links withLinks, systemone jevFetch.
import { jevFetch } from '../systemone.js';
import { modelFor } from '../model-roles.js';
import { ENDPOINT, MIN_CONFIDENCE } from '../scope-extract.js';
import { NO_LOG, jevProbabilities } from './decision-log.js';
import { stateOf } from './strategy-choice.js';
import { run as runTool } from './tools.js';
import { jevCall, JEV_LIMITS, timeoutDecision } from './jev-call.js';

export const PRAYER_BOOK = 'Bahá’í Prayers';
const MAX_OCCASIONS = 40;

export const PRAYER_HOW = (occasion) => `The reader asked for a prayer${occasion ? ` (${occasion})` : ''}. Give the FIRST prayer passage IN FULL, verbatim, as one block quotation — every paragraph of it, nothing shortened — with its attribution and link; nothing before it but at most one short line. Then, under "Two more", offer the two alternative prayers by their opening words, each linked. No commentary on the prayer's meaning unless asked.`;

/** An attribution line closes a prayer: "_—Bahá’u’lláh_", "—‘Abdu’l-Bahá", "— The Báb". Pure. */
export const isAttribution = (text) => /^[\s_*]*[—–-]\s*\S/.test(String(text || '')) && String(text || '').replace(/[_*]/g, '').trim().length < 60;

/** Section rows → prayers: runs of paragraphs, each ending at an attribution line (a run without one is kept too). Pure. */
export function splitPrayers(rows = []) {
  const prayers = []; let cur = [];
  for (const r of rows) {
    if (!String(r.text || '').trim() || r.heading) continue;
    cur.push(r);
    if (isAttribution(r.text)) { prayers.push(cur); cur = []; }
  }
  if (cur.length) prayers.push(cur);
  return prayers.filter((p) => p.some((r) => !isAttribution(r.text)));
}

const hit = (r, doc, theme) => ({ id: r.id, text: r.text, title: doc.title, author: doc.author, document_id: doc.id, paragraph_index: r.paragraph_index,
  religion: doc.religion, collection: doc.collection, language: doc.language, source_url: r.url || null, theme });

export async function pickOccasion(messages, titles, { profile, fetchImpl, apiKey = process.env.TYPESAFE_API_KEY, onJev = null, ...limits }) {
  if (!apiKey || !titles.length) return null;
  const criteria = { ...Object.fromEntries(titles.map((t) => [t, `the prayers headed "${t}"`])), none: 'no listed heading fits what the reader asks for' };
  const t0 = Date.now();
  const call = await jevCall('occasion', async (signal) => {
    const res = await fetchImpl(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelFor('assistant-triage').model, state: stateOf(messages, { profile }),
        questions: { occasion: { type: 'choice', instructions: 'Which heading of the prayer book holds the prayer the reader asks for (by occasion, need, person or name)?', criteria } } }),
      signal });
    return res.ok ? (await res.json()).answers?.occasion ?? null : null;
  }, { ...JEV_LIMITS.occasion, ...limits, onJev });
  const a = call.value;
  return a ? { choice: a.choice ?? a.value ?? null, confidence: a.confidence ?? a.distribution?.[a.choice ?? a.value] ?? null, distribution: a.distribution ?? null, ms: Date.now() - t0 } : null;
}

export async function prayerShelf(ctx) {
  const { messages, query, search, profile = {}, decisions = NO_LOG, deps = {} } = ctx;
  const w = (await runTool('document_search', { title: PRAYER_BOOK, min: 0.9 }, { deps }).catch(() => null))?.works?.[0];
  const doc = w && /prayers/i.test(w.title) ? w : null;
  decisions.record('prayer:book', { by: 'code', saw: PRAYER_BOOK, chosen: doc ? `${doc.id} ${doc.title}` : null, reason: doc ? 'title index' : 'no prayer book in the index' });
  if (!doc) return null;
  const sectionsOfDoc = deps.sectionsOfDoc || (await import('../repos/sections-repo.js')).sectionsOfDoc;
  const sections = (await sectionsOfDoc(doc.id).catch(() => [])).filter((s) => s.title && s.paragraphs > 0);
  const byTitle = new Map(); for (const s of sections) if (!byTitle.has(s.title)) byTitle.set(s.title, s);
  const occasions = [...byTitle.values()].sort((a, b) => (a.level ?? 1) - (b.level ?? 1) || b.paragraphs - a.paragraphs).slice(0, MAX_OCCASIONS);
  const pick = await (deps.pickOccasion || pickOccasion)(messages, occasions.map((s) => s.title), { profile, fetchImpl: deps.fetchImpl || jevFetch('anis-prayer-occasion'),
    onJev: (info) => decisions.record('jev:timeout', timeoutDecision(info)) });
  const confident = pick?.choice && pick.choice !== 'none' && byTitle.has(pick.choice) && (pick.confidence ?? 0) >= MIN_CONFIDENCE;
  decisions.record('prayer:occasion', { by: 'jev', saw: occasions.map((s) => s.title), options: [...occasions.map((s) => s.title), 'none'], probabilities: jevProbabilities(pick),
    chosen: confident ? pick.choice : 'none', reason: !pick ? 'no answer (see jev:timeout when it timed out)' : confident ? null : pick.choice === 'none' ? 'no heading fits' : 'low confidence', ms: pick?.ms ?? null });
  const withLinks = deps.withLinks || (await import('../hit-links.js')).withLinks;
  const paragraphsInRange = deps.paragraphsInRange || (await import('../paragraphs-repo.js')).paragraphsInRange;
  // a heading → its prayers: the first in full, two more by their opening lines (null when the section holds no prayer run)
  const serve = async (s, how) => {
    const rows = await paragraphsInRange(doc.id, s.start_index, s.end_index).catch(() => []);
    const prayers = splitPrayers(rows);
    decisions.record('prayer:pick', { by: 'code', saw: { section: s.title, paragraphs: rows.length, prayers: prayers.length, how }, options: ['first in full + two more', 'search the book'],
      chosen: prayers.length ? 'first in full + two more' : 'search the book', reason: prayers.length ? null : 'no prayer runs in the section' });
    if (!prayers.length) return null;
    const chosen = [...prayers[0].map((r) => ({ r, theme: 'prayer' })), ...prayers.slice(1, 3).map((p) => ({ r: p[0], theme: 'alternative' }))];
    const linked = await withLinks(chosen.map(({ r }) => ({ id: r.id, doc_id: doc.id, paragraph_index: r.paragraph_index, text: r.text, title: doc.title }))).catch(() => chosen.map(({ r }) => r));
    const passages = chosen.map(({ r, theme }, i) => hit({ ...r, url: linked[i]?.url || null }, doc, theme));
    return { passages, plan: { shape: 'prayer', book: doc.id, occasion: s.title, prayers: prayers.length, ...(how !== 'jev' ? { via: how } : {}) }, format: { id: 'prayer', by: 'strategy:prayer', how: PRAYER_HOW(s.title) } };
  };
  if (confident) { const out = await serve(byTitle.get(pick.choice), 'jev'); if (out) return out; }
  // no confident heading → the prayer book searched for the reader's words (never the whole library: a prayer is wanted) — the
  // planned search AND the literal words, both scoped to the book through the tools registry (the planned one alone came back
  // empty for "a prayer for the dead", launch gate 11-03)
  const scoped = { query, limit: 8, filters: { documentId: doc.id } };
  const [planned, literal] = await Promise.all([
    runTool('combined_search', { ...scoped, scope_config: profile.scope_config, messages }, { search, deps }).catch(() => null),
    runTool('literal_search', scoped, { deps }).catch(() => null)]);
  const seen = new Set(); const found = [];
  for (const p of [...(planned?.passages || []), ...(literal?.passages || [])]) { const k = p.id ?? `${p.document_id}:${p.paragraph_index}`; if (!seen.has(k)) { seen.add(k); found.push(p); } }
  decisions.record('prayer:search', { by: 'code', saw: query, chosen: `${found.length} passages`, reason: `scoped to the prayer book (planned ${planned?.passages?.length ?? 0}, literal ${literal?.passages?.length ?? 0})` });
  // the hits point at headings: Jev's most probable heading among them, else the heading of the best hit — its prayers served whole
  const holding = (p) => sections.filter((x) => p.paragraph_index != null && p.paragraph_index >= x.start_index && p.paragraph_index <= x.end_index).sort((a, b) => a.paragraphs - b.paragraphs)[0];
  const hitSections = [...new Map(found.map(holding).filter(Boolean).map((x) => [x.title, x])).values()];
  const probs = jevProbabilities(pick) || {};
  const ranked = [...hitSections].sort((a, b) => (probs[b.title] ?? 0) - (probs[a.title] ?? 0));
  // nothing found: Jev's own top heading, though below the confidence bar, is still his best reading of the thread
  const lowPick = !found.length && pick?.choice && pick.choice !== 'none' && byTitle.has(pick.choice) ? byTitle.get(pick.choice) : null;
  decisions.record('prayer:section', { by: 'code', saw: { hits: found.length, sections: hitSections.map((x) => x.title) }, options: ['heading of the hits', "Jev's top heading", 'passages as found', 'none'],
    chosen: ranked[0]?.title ?? lowPick?.title ?? (found.length ? 'passages as found' : 'none'), reason: ranked.length ? (probs[ranked[0].title] ? "Jev's most probable heading among the hits" : 'heading of the best hit') : lowPick ? 'search empty; Jev below the bar' : null });
  for (const x of ranked.length ? ranked.slice(0, 2) : lowPick ? [lowPick] : []) { const out = await serve(x, ranked.length ? 'search' : 'jev-low'); if (out) return out; }
  const passages = found.map((p) => ({ ...p, theme: 'prayer' }));
  if (!passages.length) return null;
  return { passages, plan: { shape: 'prayer', book: doc.id, occasion: null, searched: true }, format: { id: 'prayer', by: 'strategy:prayer', how: PRAYER_HOW(null) } };
}
