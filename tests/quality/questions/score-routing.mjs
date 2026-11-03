// Routing scorer: the 11-02 question-type labels → planSearch()/triageMessage() of a given checkout; reports route accuracy
// (shape ∈ allowed(type)), new-vs-follow-up, and the four 11-03 slices (pasted passage, original request, answer language,
// first message). Never the held-out immerse items. Jev mode costs ~$0.05/1k items (≈1k tokens × 2 calls × $0.042/M).
//   node tests/quality/questions/score-routing.mjs                                 # backstop only (Jev answers the default), no network
//   node tests/quality/questions/score-routing.mjs --jev --sample 2000 --seed 7 --lib /path/to/checkout [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '../../..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(k);
const LIB = path.resolve(arg('--lib', ROOT));
const LABELS = arg('--labels', [path.join(ROOT, 'planning/anis-question-types-20261102.json'), path.resolve(ROOT, '../sifter-wt-anis/planning/anis-question-types-20261102.json')].find((p) => fs.existsSync(p)));
const SAMPLE = Number(arg('--sample', 0)) || 0, SEED = Number(arg('--seed', 7)), CONC = Number(arg('--concurrency', 8));
const JEV = flag('--jev');

// Which search SHAPES serve each labelled TYPE (question-types.json; A7 from planning/anis-strategies.json). A type is a
// strategy, a shape is how the search is cut: "find where Abbas Effendi appears" (A3) is a lookup, "do Christians eat
// pork" (D3) a fact, "is Baha'i Christian" (C2) a fact with comparative set. STRICT is the one-shape-per-type reading,
// reported beside it so the widening is visible.
const STRICT = {
  A1: ['fact'], A2: ['lookup'], A3: ['topic'], A4: ['quote'], A5: ['lookup', 'quote', 'fact'], A6: ['define'],
  B1: ['topic'], B2: ['quote', 'define', 'topic'], B3: ['topic'], B4: ['fact', 'topic'], B5: ['fact', 'lookup'],
  C1: ['topic'], C2: ['topic'], C3: ['topic'], C4: ['topic', 'quote', 'lookup'],
  D1: ['topic'], D2: ['topic', 'lookup'], D3: ['topic'], D4: ['topic'], D5: ['topic'],
  E1: ['topic', 'fact'], E2: ['topic', 'fact'], E3: ['topic', 'fact'],
  F1: ['topic', 'quote'], F2: ['topic'], F3: ['topic'], F4: ['topic', 'enumerate', 'fact'], F5: ['topic'], F6: ['topic'],
  H1: ['converse'],
};
const ALLOWED = {
  ...STRICT,
  A1: ['fact', 'enumerate', 'lookup', 'quote'], A3: ['topic', 'quote', 'lookup', 'enumerate'], A6: ['define', 'fact'],
  B1: ['topic', 'fact', 'define'], B3: ['topic', 'fact'], B4: ['fact', 'topic', 'lookup'],
  C2: ['topic', 'define', 'fact'], C4: ['topic', 'quote', 'lookup', 'fact'],
  D1: ['topic', 'quote'], D3: ['topic', 'fact', 'enumerate', 'lookup', 'define'], D5: ['topic', 'fact'],
  E1: ['topic', 'fact', 'quote'], E2: ['topic', 'fact', 'quote', 'lookup'],
  F1: ['topic', 'quote', 'enumerate'], F4: ['topic', 'enumerate', 'fact', 'lookup'], F6: ['topic', 'enumerate', 'lookup'],
  H1: ['converse', 'fact'],
};
// Label-independent slice detectors (NOT the code under test): the four misroutes named in the sprint.
const ORIGINAL_RE = /\b(in (the )?(original|persian|farsi|arabic)\b|(persian|arabic|farsi|original)[- ](word|words|phrase|term|terms|text|wording|version|language|original)\b|what (is|are|was|were) the (persian|arabic|original)\b|original[- ]language)/i;   // = respond.js looksLikeOriginalQuestion
const VERNACULAR = /\bin (hindi|urdu|bengali|bangla|tamil|telugu|kannada|malayalam|marathi|gujarati|punjabi|nepali|sinhala|turkish|spanish|french|german|italian|portuguese|russian|chinese|japanese|korean|indonesian|malay|swahili|dutch|polish|vietnamese|thai|tagalog|amharic|yoruba|zulu|english)\b/i;
const PASTED_RE = /\b(thee|thou|thy|thine|hath|doth|verily|unto|saith|wherefore|whosoever|o son of|o friend|blessed is)\b/i;
// the original-ish regex over-matches ("Persian history", "quotes in arabic"); the A7 claim is measured on the types that ask for a text
const ORIGINAL_TYPES = new Set(['A4', 'A5', 'A7', 'A2']);
const wordsOf = (s) => (String(s || '').match(/\p{L}[\p{L}'’-]*/gu) || []).length;
const slice = (it) => {
  const t = it.text || '';
  const sl = [];
  if (it.thread?.length) sl.push('threaded'); else sl.push('first');
  if (/^G/.test(it.lead) && !it.thread?.length) sl.push('first-G');
  if (ORIGINAL_RE.test(t)) sl.push('original-ish');
  if (VERNACULAR.test(t) && !/\b(good|fluent|weak|poor|written|revealed|available|published) in\b/i.test(t)) sl.push('language');
  if (wordsOf(t) >= 12 && !/\?/.test(t) && PASTED_RE.test(t) && !/\b(i'm|i’m|i am|i've|my|can you|please|what|where|who|how|why)\b/i.test(t)) sl.push('pasted');
  return sl;
};

// seeded shuffle (mulberry32) so before/after see the same items
const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const all = JSON.parse(fs.readFileSync(LABELS, 'utf8')).items
  .filter((it) => it.source !== 'immerse' && !/immerse/i.test(it.source || ''))   // held out, never tuned on
  .filter((it) => /^[A-H]\d$/.test(it.lead) && it.lead !== 'H2')
  .map((it, i) => ({ ...it, i, slices: slice(it) }));
let items = all;
if (SAMPLE && SAMPLE < all.length) {
  const r = rng(SEED), pick = new Set();
  // every rare slice first (capped), then random fill — the same picks for every checkout given the seed
  for (const s of ['first-G', 'original-ish', 'language', 'pasted', 'threaded']) {
    const pool = shuffle(all.filter((it) => it.slices.includes(s)), r).slice(0, s === 'threaded' ? 500 : 300);
    pool.forEach((it) => pick.add(it.i));
  }
  for (const it of shuffle([...all], r)) { if (pick.size >= SAMPLE) break; pick.add(it.i); }
  items = all.filter((it) => pick.has(it.i));
}
const est = items.length * 2 * 1000 / 1e6 * 0.042;
console.log(`labels: ${LABELS}\nlib: ${LIB}\nitems: ${items.length} of ${all.length} (immerse + H2 + G-only-threads excluded) ${JEV ? `— Jev mode, est. cost $${est.toFixed(3)}` : '— backstop mode (no network, Jev answers the default)'}`);

const FROM = arg('--from');   // re-score a saved --json run offline (gold map changes, no new Jev calls)
const { planSearch } = FROM ? {} : await import(path.join(LIB, 'api/lib/search-plan.js'));
const { triageMessage } = FROM ? {} : await import(path.join(LIB, 'api/lib/assistant/triage.js'));
// no --jev: Jev "answers" the backstop default (what the plan does with no decision at all); --jev: the real endpoint
const fakeJev = async () => ({ ok: true, json: async () => ({ answers: { tradition: { answer: 'none', confidence: 0.9 }, comparative: { answer: false, confidence: 0.9 }, author: { answer: 'none', confidence: 0.9 }, shape: { answer: 'topic', confidence: 0.9 }, about: { answer: 'texts', confidence: 0.9 }, kind: { answer: 'research', confidence: 0.9 }, stance: { answer: 'curious', confidence: 0.9 }, reaction: { answer: 'none', confidence: 0.9 }, follow_up: 0 } }) });
const fetchImpl = JEV ? globalThis.fetch : fakeJev;
if (JEV && !process.env.TYPESAFE_API_KEY) { console.error('TYPESAFE_API_KEY missing'); process.exit(2); }

const msgsOf = (it) => [...(it.thread || []).map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: it.text }];
const one = async (it) => {
  const messages = msgsOf(it);
  const [plan, tri] = await Promise.all([
    planSearch(messages, { fetchImpl, resolveName: null, resolveMentions: null, cache: false, timeoutMs: 8000 }).catch((e) => ({ error: e.message })),
    triageMessage(messages, { fetchImpl, timeoutMs: 8000 }).catch(() => null),
  ]);
  return { it, plan, tri };
};
let out = [];
let next = 0;
if (FROM) {
  const byI = new Map(all.map((it) => [it.i, it]));
  out = JSON.parse(fs.readFileSync(FROM, 'utf8')).rows.map((r) => ({ it: byI.get(r.i), plan: { shape: r.shape, request: r.request, language: r.language && { lang: r.language }, provenance: r.provenance, source: { shape: r.by } }, tri: r.follow_up == null && r.reaction == null && r.kind == null ? null : { follow_up: r.follow_up, reaction: r.reaction && { choice: r.reaction }, kind: r.kind && { choice: r.kind } } })).filter((r) => r.it);
  console.log(`re-scoring ${out.length} saved rows from ${FROM}`);
} else await Promise.all(Array.from({ length: CONC }, async () => { while (next < items.length) { const it = items[next++]; out.push(await one(it)); if (out.length % 200 === 0) process.stderr.write(`  ${out.length}/${items.length}\r`); } }));

// ── scoring ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const allowedFor = (it, map = ALLOWED) => new Set([it.lead, ...(it.also || [])].flatMap((t) => map[t] || []));
const routeOk = (r, { corrected, map = ALLOWED }) => {
  const allowed = allowedFor(r.it, map), shape = r.plan?.shape;
  if (corrected) {
    if (r.it.slices.includes('original-ish') && ORIGINAL_TYPES.has(r.it.lead)) return r.plan?.request === 'original_text' || r.plan?.request === 'translation';
    if (r.it.slices.includes('pasted')) allowed.add('quote');
  }
  return allowed.has(shape);
};
// follow-up: gold = G-lead inside a thread. Predicted = follow_up ≥ .5 when the checkout answers it, else the pre-existing
// signal (reaction other than none/new_topic). A first message is gold "new".
const goldFollow = (it) => /^G/.test(it.lead) && it.thread?.length > 0;
const predFollow = (r) => r.tri == null ? false : r.tri.follow_up != null ? r.tri.follow_up >= 0.5 : !['none', 'new_topic', null, undefined].includes(r.tri.reaction?.choice);
const pct = (n, d) => d ? `${(100 * n / d).toFixed(1)}% (${n}/${d})` : 'n/a';
const score = (rows, name) => {
  const nonG = rows.filter((r) => !/^G/.test(r.it.lead));
  const res = {
    name, n: rows.length,
    route_strict: pct(nonG.filter((r) => routeOk(r, { corrected: false, map: STRICT })).length, nonG.length),
    route_labels: pct(nonG.filter((r) => routeOk(r, { corrected: false })).length, nonG.length),
    route_corrected: pct(nonG.filter((r) => routeOk(r, { corrected: true })).length, nonG.length),
    follow_up: pct(rows.filter((r) => predFollow(r) === goldFollow(r.it)).length, rows.length),
    first_message_new: pct(rows.filter((r) => r.it.slices.includes('first') && !predFollow(r)).length, rows.filter((r) => r.it.slices.includes('first')).length),
    threaded_follow_up: pct(rows.filter((r) => goldFollow(r.it) && predFollow(r)).length, rows.filter((r) => goldFollow(r.it)).length),
    pasted_to_quote: pct(rows.filter((r) => r.it.slices.includes('pasted') && r.plan?.shape === 'quote').length, rows.filter((r) => r.it.slices.includes('pasted')).length),
    original_request: pct(rows.filter((r) => r.it.slices.includes('original-ish') && ORIGINAL_TYPES.has(r.it.lead) && r.plan?.request).length, rows.filter((r) => r.it.slices.includes('original-ish') && ORIGINAL_TYPES.has(r.it.lead)).length),
    original_not_on_A6: pct(rows.filter((r) => ['A6', 'C4', 'B1'].includes(r.it.lead) && !r.plan?.request).length, rows.filter((r) => ['A6', 'C4', 'B1'].includes(r.it.lead)).length),
    language_captured: pct(rows.filter((r) => r.it.slices.includes('language') && r.plan?.language).length, rows.filter((r) => r.it.slices.includes('language')).length),
    language_route: pct(rows.filter((r) => r.it.slices.includes('language') && !/^G/.test(r.it.lead) && routeOk(r, { corrected: true })).length, rows.filter((r) => r.it.slices.includes('language') && !/^G/.test(r.it.lead)).length),
    provenance: Object.fromEntries(Object.entries(rows.reduce((m, r) => (m[r.plan?.provenance || 'error'] = (m[r.plan?.provenance || 'error'] || 0) + 1, m), {}))),
  };
  return res;
};
const summary = score(out, 'all');
console.log(JSON.stringify(summary, null, 2));
// per-type route accuracy, worst first
const byType = {};
for (const r of out) { if (/^G/.test(r.it.lead)) continue; const t = byType[r.it.lead] ||= { n: 0, ok: 0, shapes: {} }; t.n++; if (routeOk(r, { corrected: true })) t.ok++; t.shapes[r.plan?.shape] = (t.shapes[r.plan?.shape] || 0) + 1; }
console.log('per type (corrected gold):');
for (const [k, v] of Object.entries(byType).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n)) console.log(`  ${k} ${pct(v.ok, v.n).padEnd(18)} ${JSON.stringify(v.shapes)}`);
const jsonOut = arg('--json');
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ summary, byType, rows: out.map((r) => ({ i: r.it.i, lead: r.it.lead, slices: r.it.slices, text: r.it.text.slice(0, 120), shape: r.plan?.shape, request: r.plan?.request ?? null, language: r.plan?.language?.lang ?? null, provenance: r.plan?.provenance, by: r.plan?.source?.shape ?? null, follow_up: r.tri?.follow_up ?? null, reaction: r.tri?.reaction?.choice ?? null, kind: r.tri?.kind?.choice ?? null })) }, null, 1));
