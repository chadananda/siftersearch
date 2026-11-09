// PRAYER SHELF (W3; the live prayer@1 executor), rebuilt 11-09 on the SAME lookup as the prayer tree: prayer-ness is a property of the PASSAGE
// (it addresses God or is used in devotion), never of one book's headings. prayer_lookup finds candidates in the reader's TRADITION (scope → host
// default; none = each tradition, kept only with real hits), scripture included; JEV makes ONE typed choice over them (labelled by opening text,
// work and tradition; "none fits" an option); whole_lookup reads the chosen prayer whole (attribution run, short section, contiguous address).
// One tradition: the first in full + two offers; several: each tradition's first in full. Deps (ctx.deps, tests): the tools' deps or tools{name: fn}, pickOccasion, fetchImpl.
import { jevFetch } from '../systemone.js';
import { modelFor } from '../model-roles.js';
import { ENDPOINT, MIN_CONFIDENCE } from '../scope-extract.js';
import { NO_LOG, jevProbabilities } from './decision-log.js';
import { stateOf } from './strategy-choice.js';
import { run as runTool } from './tools.js';
import { jevCall, JEV_LIMITS, timeoutDecision } from './jev-call.js';
import { render } from './activities/templates.js';
import { traditionOf } from './prayer-works.js';
import { canonicalTradition } from './tradition-name.js';
import { isAttribution, isHeadingRow, splitPrayers, prayerAt, sectionAt, foundCandidates } from './prayer-sections.js';
const CHOICES = 8, OFFERS = 2, SEVERAL = 4;

export const PRAYER_SEVERAL = (occasion) => render('prayer.several', { occasion: occasion ? render('prayer.occasion', { occasion }) : '' });
export const PRAYER_HOW = (occasion) => render('prayer.how', { occasion: occasion ? render('prayer.occasion', { occasion }) : '' });   // words = template rows

export { isAttribution, isHeadingRow, splitPrayers, prayerAt, sectionAt, foundCandidates };

/** Jev's one typed choice: a heading of the book, a found prayer (`found` = [{ key, text, heading }]), or none. */
export async function pickOccasion(messages, titles, { profile, fetchImpl, apiKey = process.env.TYPESAFE_API_KEY, onJev = null, found = [], ...limits }) {
  if (!apiKey || (!titles.length && !found.length)) return null;
  const criteria = { ...Object.fromEntries(titles.map((t) => [t, `the prayers headed "${t}"`])),
    ...Object.fromEntries(found.map((f) => [f.key, `the passage that reads "${f.text}"${f.heading ? ` (${f.heading})` : ''}`])),
    none: 'none of these is a whole prayer that fits what the reader asks for' };
  const t0 = Date.now();
  const call = await jevCall('occasion', async (signal) => {
    const res = await fetchImpl(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelFor('assistant-triage').model, state: stateOf(messages, { profile }),
        questions: { occasion: { type: 'choice', instructions: 'Which of these is a whole prayer (words addressed to God, or used in devotion) that fits what the reader asks for — by need, occasion, person or name? Each is labelled by its opening words, its work and tradition. Rank them; a passage that only talks about prayer does not fit.', criteria } } }),
      signal });
    return res.ok ? (await res.json()).answers?.occasion ?? null : null;
  }, { ...JEV_LIMITS.occasion, ...limits, onJev });
  const a = call.value;
  return a ? { choice: a.choice ?? a.value ?? null, confidence: a.confidence ?? a.distribution?.[a.choice ?? a.value] ?? null, distribution: a.distribution ?? null, ms: Date.now() - t0 } : null;
}

const label = (c) => [[c.work || c.title, c.tradition || c.religion].filter(Boolean).join(' — '), c.heading].filter(Boolean).join(', ') || null;
const tradOf = (c) => canonicalTradition(c.tradition || c.religion || '') || '?';

export async function prayerShelf(ctx) {
  const { messages = [], query, profile = {}, decisions = NO_LOG, deps = {} } = ctx;
  // the tradition: the layered scope (Jev this turn / conversation / site default, turn.js) else the host default; none = each tradition
  const tradition = traditionOf({ scope: ctx.scope || null, defaultTradition: ctx.scope ? null : profile.default_tradition });
  if (!query) return null;
  const tctx = { deps }, tool = (name, input) => (deps.tools?.[name] ? deps.tools[name](input) : runTool(name, input, tctx));   // deps.tools: the test seam (as s.tools in a tree)
  const found = await tool('prayer_lookup', { need: query, ...(tradition ? { tradition } : {}) }, tctx).catch((e) => ({ passages: [], searched: [], error: e?.message }));
  const cands = found.passages || [];
  decisions.record('prayer:search', { by: 'code', saw: { tradition, query }, chosen: `${cands.length} candidates`,
    reason: (found.searched || []).map((x) => `${x.tradition}: ${x.found}`).join('; ') || found.error || null });
  if (!cands.length) return null;
  const choices = cands.slice(0, CHOICES).map((c, i) => ({ key: `found:${i}`, text: c.opening || c.text, heading: label(c), c }));
  const pick = await (deps.pickOccasion || pickOccasion)(messages, [], { profile, fetchImpl: deps.fetchImpl || jevFetch('anis-prayer-occasion'),
    found: choices.map(({ key, text, heading }) => ({ key, text, heading })), onJev: (info) => decisions.record('jev:timeout', timeoutDecision(info)) });
  const dist = pick?.distribution || (pick?.choice ? { [pick.choice]: pick.confidence ?? 1 } : {}), none = dist.none ?? 0;
  const confident = pick?.choice && pick.choice !== 'none' && choices.some((x) => x.key === pick.choice) && (pick.confidence ?? 0) >= MIN_CONFIDENCE;
  decisions.record('prayer:occasion', { by: 'jev', saw: { found: choices.map((x) => `${x.key} ${label(x.c)}: ${String(x.text).slice(0, 60)}`) }, options: [...choices.map((x) => x.key), 'none'], probabilities: jevProbabilities(pick),
    chosen: confident ? pick.choice : 'none', reason: !pick ? 'no answer (see jev:timeout when it timed out): the code-ranked lead alone' : confident ? null : pick.choice === 'none' ? 'nothing fits' : 'low confidence: the code-ranked lead alone', ms: pick?.ms ?? null });
  if (pick?.choice === 'none' && (pick.confidence ?? 0) >= MIN_CONFIDENCE) return null;   // Jev is sure nothing fits: no prayer is served as if it fitted
  // Jev's order (only those likelier than "none fits"); below the bar or no answer → the code-ranked lead alone, no unchecked offers
  const ranked = !confident ? [choices[0]] : [choices.find((x) => x.key === pick.choice), ...choices.filter((x) => x.key !== pick.choice && (dist[x.key] ?? 0) > none).sort((x, y) => dist[y.key] - dist[x.key])];
  const trads = [...new Set(ranked.map((x) => tradOf(x.c)))];
  const leads = trads.length > 1 ? trads.slice(0, SEVERAL).map((t) => ranked.find((x) => tradOf(x.c) === t).c) : [ranked[0].c];
  const whole = await Promise.all(leads.map((c) => tool('whole_lookup', { document_id: c.document_id, paragraph_index: c.paragraph_index }).then((w) => (w?.passages?.length ? w : { passages: [c], bound: 'found' }), () => ({ passages: [c], bound: 'found' }))));
  const inWhole = (c) => whole.some((w) => w.passages.some((r) => Number(r.document_id) === Number(c.document_id) && r.paragraph_index === c.paragraph_index));
  const offers = trads.length > 1 ? [] : ranked.slice(1).map((x) => x.c).filter((c) => !inWhole(c)).slice(0, OFFERS);
  decisions.record('prayer:pick', { by: 'code', saw: { traditions: trads, bounds: whole.map((w) => w.bound) }, options: ['one in full + two offers', 'each tradition in full'],
    chosen: trads.length > 1 ? 'each tradition in full' : 'one in full + two offers', reason: null });
  const passages = [...whole.flatMap((w, i) => w.passages.map((r) => ({ ...r, work: leads[i].work ?? r.title, tradition: tradOf(leads[i]), theme: 'prayer' }))), ...offers.map((c) => ({ ...c, theme: 'alternative' }))];
  const occasion = ctx.occasion ?? null;
  return { passages, plan: { shape: 'prayer', ...(trads.length > 1 ? { several: trads } : { tradition: trads[0] }), occasion, bound: whole.map((w) => w.bound) },
    format: { id: 'prayer', by: 'strategy:prayer', how: trads.length > 1 ? PRAYER_SEVERAL(occasion) : PRAYER_HOW(occasion) } };
}
