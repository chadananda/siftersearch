#!/usr/bin/env node
// Anís writing-step A/B: one retrieval per question, the writing step run once per variant on the SAME evidence (/api/v1/anis/draft `variants`),
// then a blind pairwise Opus-class judge. --compare format: chosen template vs none. --compare writer: a role's model vs light candidates.
// No model ids here: baseline = modelFor(role); light candidates + judge + prices come from api/lib/model-registry.js (re-measure any writing role: --role).
//   node tests/quality/anis-writer-ab.mjs --compare format|writer [--sample N] [--seed s] [--concurrency 3] [--tag t] [--dry]
//        [--role <model-role>] [--writers provider:model,..] [--mode current|research] [--types A1,B1,..]
// Questions: planning/anis-question-types-20261102.json stratified by lead class (immerse items held out). Needs INTERNAL_API_KEY + ANTHROPIC_API_KEY.
import dns from 'node:dns'; dns.setDefaultResultOrder('ipv4first');
import net from 'node:net'; net.setDefaultAutoSelectFamilyAttemptTimeout(5000);   // Mac → api.anthropic.com needs > node's 250 ms happy-eyeballs default
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { MODEL_REGISTRY, calculateCost } from '../../api/lib/model-registry.js';
import { modelFor } from '../../api/lib/model-roles.js';
const DIR = dirname(fileURLToPath(import.meta.url)), ROOT = join(DIR, '..', '..');
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(ROOT, f), quiet: true });
const API = process.env.API_BASE || 'http://tower-nas:7839';
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const list = (k) => arg(k)?.split(',').map((s) => s.trim()).filter(Boolean);
const has = (k) => process.argv.includes(`--${k}`);
const sleep = (ms) => new Promise((z) => setTimeout(z, ms));
const pct = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : null);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r2 = (x, d = 2) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

const COMPARE = arg('compare') || 'format';
if (!['format', 'writer'].includes(COMPARE)) { console.error('--compare format|writer'); process.exit(2); }
const ROLE = arg('role') || (COMPARE === 'writer' ? 'anis-writer' : 'assistant-answer');
const MODE = arg('mode') || (COMPARE === 'writer' ? 'research' : 'current');   // research:true is the anis-writer path; current = the planner path
const N = Number(arg('sample') || (COMPARE === 'writer' ? 30 : 60)), CONC = Number(arg('concurrency') || 3), SEED = arg('seed') || 'ab1', TAG = arg('tag');
const DATE = new Date().toISOString().slice(0, 10), KEY = process.env.INTERNAL_API_KEY;

// ---- models: all from the role table + registry
const REG_PROVIDER = { anthropic: 'anthropic', google: 'gemini' };   // registry provider → writer provider (parseLlm)
const regId = (w) => w.split(':')[1];   // writer string provider:model[:effort] → registry id
const price = (w, p, o) => { try { return calculateCost(regId(w), p, o); } catch { return 0; } };
const BASE = (({ provider, model }) => `${provider}:${model}`)(modelFor(ROLE));
// expected writing tokens per variant (prompt, completion) for the light ranking and the --dry estimate; research carries the brief
const TOK = MODE === 'research' ? { p: 9000, o: 800 } : { p: 5000, o: 400 };
function lightCandidates() {
  return Object.entries(MODEL_REGISTRY)
    .filter(([id, m]) => m.type === 'chat' && !m.deprecated && ['very_fast', 'fast'].includes(m.speed) && REG_PROVIDER[m.provider] && id !== regId(BASE))
    .map(([id, m]) => `${REG_PROVIDER[m.provider]}:${id}`)
    .sort((a, b) => price(a, TOK.p, TOK.o) - price(b, TOK.p, TOK.o)).slice(0, 3);
}
const LIGHT = COMPARE === 'writer' ? (list('writers') || lightCandidates()).slice(0, 3) : [];
const JUDGE = process.env.AB_JUDGE_MODEL || Object.entries(MODEL_REGISTRY)
  .filter(([, m]) => m.provider === 'anthropic' && m.type === 'chat' && !m.deprecated && m.quality === 'premium')
  .sort(([a], [b]) => calculateCost(b, 1000, 1000) - calculateCost(a, 1000, 1000))[0]?.[0];
const vid = (w) => regId(w).replace(/[^\w.-]/g, '').slice(0, 40);
const VARIANTS = COMPARE === 'format'
  ? [{ id: 'tmpl', format: 'auto', writer: BASE }, { id: 'none', format: 'none', writer: BASE }]
  : [{ id: 'base', writer: BASE }, ...LIGHT.map((w) => ({ id: vid(w), writer: w }))];
const REF = VARIANTS[0].id;
// pairs judged per item: [contender, reference] — format: none vs tmpl; writer: each light model vs the baseline
const PAIRS = COMPARE === 'format' ? [['none', 'tmpl']] : VARIANTS.slice(1).map((v) => [v.id, REF]);
const WRITER_OF = Object.fromEntries(VARIANTS.map((v) => [v.id, v.writer]));

// ---- seeded sample, stratified by lead class (round-robin over classes in seeded order)
function rng(seed) { let h = 1779033703 ^ seed.length; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 3432918353), h = (h << 13) | (h >>> 19);
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; }
const rand = rng(SEED), shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const CLASSES = JSON.parse(readFileSync(join(DIR, 'questions', 'question-types.json'), 'utf8')).types;
const { items: ALL } = JSON.parse(readFileSync(join(ROOT, 'planning', 'anis-question-types-20261102.json'), 'utf8'));
const pool = ALL.filter((x) => x.source !== 'immerse' && CLASSES[x.lead] && (!list('types') || list('types').includes(x.lead)));
const byClass = new Map();
for (const x of pool) (byClass.get(x.lead) || byClass.set(x.lead, []).get(x.lead)).push(x);
for (const a of byClass.values()) shuffle(a);
const order = shuffle([...byClass.keys()].sort()), sample = [];
for (let round = 0; sample.length < N && order.some((c) => byClass.get(c).length > round); round++)
  for (const c of order) if (sample.length < N && byClass.get(c)[round]) sample.push(byClass.get(c)[round]);
const ITEMS = sample.map((x, i) => ({ key: `q${i + 1}`, cls: x.lead, source: x.source, text: x.text, thread: x.thread || [] }));

// ---- estimate (prices from the registry; shared = retrieval/planning, measured 11-03 wording battery ≈ $0.003 current / $0.03 research less the writer)
const JTOK = { p: 9000, o: 2500 };   // judge: evidence + two answers in; adaptive thinking + verdict out
function estimate() {
  const shared = MODE === 'research' ? 0.03 : 0.0025;
  const writers = VARIANTS.reduce((s, v) => s + price(v.writer, TOK.p, TOK.o), 0);
  const judge = PAIRS.length * calculateCost(JUDGE, JTOK.p, JTOK.o);
  return { per_item: r2(shared + writers + judge, 4), shared, writers: r2(writers, 4), judge: r2(judge, 4), total: r2(ITEMS.length * (shared + writers + judge), 2) };
}
function plan() {
  const cls = {}; for (const x of ITEMS) cls[x.cls] = (cls[x.cls] || 0) + 1;
  console.log(`compare ${COMPARE} · role ${ROLE} (baseline ${BASE}) · mode ${MODE} · ${ITEMS.length} questions · seed ${SEED} · judge ${JUDGE}`);
  console.log(`variants: ${VARIANTS.map((v) => `${v.id}=${v.writer}${v.format === 'none' ? ' (no template)' : ''}`).join(', ')}`);
  console.log(`pairs judged per question: ${PAIRS.map((p) => `${p[0]} vs ${p[1]}`).join(', ')}`);
  console.log(`classes: ${Object.entries(cls).sort().map(([k, n]) => `${k}:${n}`).join(' ')}`);
  const e = estimate();
  console.log(`estimate: $${e.per_item}/question (shared $${e.shared} + writers $${e.writers} + judge $${e.judge}) → ~$${e.total} total`);
}
if (has('dry')) { plan(); process.exit(0); }
if (!KEY) { console.error('INTERNAL_API_KEY missing'); process.exit(2); }
if (!JUDGE) { console.error('no premium anthropic judge in the registry; set AB_JUDGE_MODEL'); process.exit(2); }

// ---- one question → all variants (job → poll)
const RUN = Date.now().toString(36);
async function jfetch(url, o = {}) { const r = await fetch(url, { signal: AbortSignal.timeout(40000), ...o }); return { r, j: await r.json().catch(() => ({})) }; }
async function anis(item) {
  const t0 = Date.now(), key = `writer-ab-${RUN}-${item.key}`;
  const H = { 'content-type': 'application/json', 'X-Internal-Key': KEY };
  const messages = [...item.thread, { role: 'user', content: item.text }];
  const variants = VARIANTS.map(({ id, format, writer }) => ({ id, writer, ...(format ? { format } : {}) }));
  try {
    const s = await jfetch(`${API}/api/v1/anis/draft`, { method: 'POST', headers: H, body: JSON.stringify({ messages, email: `battery+writer-ab-${item.key}@siftersearch.com`,
      async: true, job: key, research: MODE === 'research', variants }) });
    if (!s.r.ok) return { error: `start ${s.r.status}` };
    for (;;) {
      await sleep(2500);
      const g = await jfetch(`${API}/api/v1/anis/draft/job/${key}`, { headers: H }).then((x) => x.j).catch(() => ({ status: 'poll-failed' }));
      if (g.status === 'done') return { res: g.result || {}, ms: Date.now() - t0 };
      if (['failed', 'lost'].includes(g.status)) return { error: `job ${g.status} ${g.error || ''}` };
      if (Date.now() - t0 > 420000) return { error: 'timeout 7 min' };
    }
  } catch (e) { return { error: e.message }; }
}

// ---- blind pairwise judge
let client; const claude = () => (client ||= new Anthropic());
const spend = { judge: 0, anis: 0 };
const DIMS = ['accuracy', 'completeness', 'brevity', 'format_fit'];
const SCORE = { type: 'object', required: DIMS, properties: Object.fromEntries(DIMS.map((d) => [d, { type: 'integer', minimum: 1, maximum: 5 }])) };
const VERDICT = { name: 'verdict', description: 'Scores for both answers and the winner.', input_schema: { type: 'object', required: ['A', 'B', 'winner', 'reason'],
  properties: { A: SCORE, B: SCORE, winner: { type: 'string', enum: ['A', 'B', 'tie'] }, reason: { type: 'string', description: 'one line' } } } };
const SYSTEM = `You compare two answers written by a research assistant for a library of religious texts (Bahá'í Writings and other scriptures).
Both were written from the SAME retrieved evidence, shown to you. Judge only the writing. Score each answer 1-5 on:
- accuracy: every claim and quotation is supported by the evidence and attributed to the right author and work; nothing invented (an unsupported or misattributed quote is a 1-2).
- completeness: it answers what was actually asked, using the best of the evidence; nothing important that the evidence holds is missing.
- brevity: as short as the question allows; a short question gets a short answer; no preamble, filler or repetition.
- format_fit: the shape suits the question (a fact is a sentence, a request for a book gives the book and its link, passages are quoted and linked, lists only where a list helps).
Then pick the winner (or tie when neither is clearly better) with a one-line reason. Markdown links are part of the answer. Call the verdict tool.`;
const evidenceText = (ev) => (ev || []).map((e, i) => `[${i + 1}] ${e.author || '?'}, ${e.title || '?'}${e.url ? ` <${e.url}>` : ''}\n${e.text}`).join('\n\n') || '(no passages)';
async function judgePair(item, ev, a, b) {
  const thread = item.thread.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
  const res = await claude().messages.create({ model: JUDGE, max_tokens: 8000, thinking: { type: 'adaptive' }, system: SYSTEM, tools: [VERDICT], tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: `${thread ? `EARLIER IN THE CONVERSATION:\n${thread}\n\n` : ''}QUESTION: ${item.text}\n\nEVIDENCE:\n${evidenceText(ev)}\n\n=== ANSWER A ===\n${a}\n\n=== ANSWER B ===\n${b}` }] });
  spend.judge += calculateCost(JUDGE, (res.usage?.input_tokens || 0) + (res.usage?.cache_read_input_tokens || 0) + (res.usage?.cache_creation_input_tokens || 0), res.usage?.output_tokens || 0);
  const v = res.content.find((x) => x.type === 'tool_use')?.input;
  if (!v?.A || !v?.B) throw new Error('judge returned no verdict');
  return v;
}

async function runItem(item) {
  const out = { ...item, variants: {}, pairs: [] };
  const a = await anis(item);
  if (a.error) return { ...out, error: a.error };
  const vs = a.res.variants;
  out.total_ms = a.ms; out.turn_usd = a.res.meta?.usd ?? null; out.recipe = a.res.recipe; out.format = a.res.format;
  if (!Array.isArray(vs) || !vs.length) return { ...out, na: `no variants (early-return path: ${a.res.recipe || a.res.status || '?'})` };
  for (const v of vs) out.variants[v.id] = { ms: v.ms, usd: v.usd, words: v.words, links: v.links, format_id: v.format_id, template: v.template, stripped: v.format_stripped, writer: v.writer, reply: v.reply };
  spend.anis += a.res.meta?.usd || 0;
  if (COMPARE === 'format' && !out.variants.none?.stripped) return { ...out, na: `no template to strip (format ${out.format})` };
  for (const [c, ref] of PAIRS) {
    const C = out.variants[c], R = out.variants[ref];
    if (!C?.reply || !R?.reply) { out.pairs.push({ contender: c, reference: ref, error: 'missing reply' }); continue; }
    const flip = rand() < 0.5, [A, B] = flip ? [C, R] : [R, C];
    try {
      const v = await judgePair(item, a.res.evidence, A.reply, B.reply);
      const cs = flip ? v.A : v.B, rs = flip ? v.B : v.A;
      const winner = v.winner === 'tie' ? 'tie' : ((v.winner === 'A') === flip ? c : ref);
      out.pairs.push({ contender: c, reference: ref, contender_scores: cs, reference_scores: rs, winner, reason: v.reason, shown_first: flip ? c : ref });
    } catch (e) { out.pairs.push({ contender: c, reference: ref, error: e.message }); }
  }
  return out;
}

// ---- summary
function stats(results) {
  const ok = results.filter((r) => !r.error && !r.na);
  const variant = Object.fromEntries(VARIANTS.map(({ id, writer }) => {
    const v = ok.map((r) => r.variants[id]).filter(Boolean);
    return [id, { writer, n: v.length, ms_median: pct(v.map((x) => x.ms), 0.5), ms_p90: pct(v.map((x) => x.ms), 0.9),
      usd_mean: r2(mean(v.map((x) => x.usd || 0)), 5), words_mean: r2(mean(v.map((x) => x.words || 0)), 0), links_mean: r2(mean(v.map((x) => x.links || 0)), 1) }];
  }));
  const pairStats = (rows) => PAIRS.map(([c, ref]) => {
    const p = rows.flatMap((r) => r.pairs.filter((x) => x.contender === c && !x.error));
    const dim = (side) => Object.fromEntries(DIMS.map((d) => [d, r2(mean(p.map((x) => x[side][d])))]));
    return { contender: c, reference: ref, n: p.length, win: p.filter((x) => x.winner === c).length, tie: p.filter((x) => x.winner === 'tie').length,
      loss: p.filter((x) => x.winner === ref).length, contender_scores: dim('contender_scores'), reference_scores: dim('reference_scores') };
  });
  const byClass = {};
  for (const cls of [...new Set(ok.map((r) => r.cls))].sort()) {
    const rows = ok.filter((r) => r.cls === cls);
    byClass[cls] = { n: rows.length, pairs: pairStats(rows),
      variants: Object.fromEntries(VARIANTS.map(({ id }) => { const v = rows.map((r) => r.variants[id]).filter(Boolean);
        return [id, { ms_median: pct(v.map((x) => x.ms), 0.5), usd_mean: r2(mean(v.map((x) => x.usd || 0)), 5), words_mean: r2(mean(v.map((x) => x.words || 0)), 0) }]; })) };
  }
  // the loser lost by ≥2 on any dimension
  const big = ok.flatMap((r) => r.pairs.filter((x) => !x.error && x.winner !== 'tie').flatMap((x) => {
    const [ws, ls] = x.winner === x.contender ? [x.contender_scores, x.reference_scores] : [x.reference_scores, x.contender_scores];
    const dims = DIMS.filter((d) => ws[d] - ls[d] >= 2);
    return dims.length ? [{ key: r.key, cls: r.cls, question: r.text, winner: x.winner, loser: x.winner === x.contender ? x.reference : x.contender, dims, reason: x.reason }] : [];
  }));
  // writer compare: light models ranked on each axis (quality = mean of the four judged dimensions)
  const ranking = COMPARE === 'writer' ? pairStats(ok).map((p) => {
    const v = variant[p.contender], q = mean(DIMS.map((d) => p.contender_scores[d] ?? 0));
    return { id: p.contender, writer: v.writer, quality: r2(q), quality_vs_base: r2(q - mean(DIMS.map((d) => p.reference_scores[d] ?? 0))),
      win: p.win, tie: p.tie, loss: p.loss, completeness: p.contender_scores.completeness, brevity: p.contender_scores.brevity,
      accuracy: p.contender_scores.accuracy, format_fit: p.contender_scores.format_fit, ms_median: v.ms_median, usd_mean: v.usd_mean, words_mean: v.words_mean };
  }).sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0)) : null;
  if (ranking) for (const [axis, dir] of [['quality', -1], ['brevity', -1], ['completeness', -1], ['ms_median', 1], ['usd_mean', 1]]) {
    [...ranking].sort((a, b) => dir * ((a[axis] ?? Infinity * dir) - (b[axis] ?? Infinity * dir))).forEach((x, i) => { (x.ranks ||= {})[axis] = i + 1; });
  }
  return { n: results.length, judged: ok.length, na: results.filter((r) => r.na).length, errors: results.filter((r) => r.error).length,
    variants: variant, pairs: pairStats(ok), by_class: byClass, big_losses: big, ranking };
}

function markdown(S, meta) {
  const L = [`# Anís writer A/B — ${COMPARE} (${DATE}${TAG ? `, ${TAG}` : ''})`, '',
    `Role \`${ROLE}\` (baseline \`${BASE}\`), mode ${MODE}, judge \`${JUDGE}\` (blind, pairwise, order randomised), seed ${SEED}.`,
    `${S.n} questions: ${S.judged} judged, ${S.na} not applicable, ${S.errors} errors. Spend: Anís $${r2(meta.spend.anis, 3)}, judge $${r2(meta.spend.judge, 3)}.`, '',
    '## Contender vs reference', '', '| contender | reference | n | win | tie | loss | ' + DIMS.map((d) => `${d} (c / r)`).join(' | ') + ' |',
    '|' + '---|'.repeat(6 + DIMS.length)];
  for (const p of S.pairs) L.push(`| ${p.contender} | ${p.reference} | ${p.n} | ${p.win} | ${p.tie} | ${p.loss} | ${DIMS.map((d) => `${p.contender_scores[d] ?? '–'} / ${p.reference_scores[d] ?? '–'}`).join(' | ')} |`);
  L.push('', '## Writing step per variant', '', '| variant | writer | n | median ms | p90 ms | mean $ | mean words | mean links |', '|---|---|---|---|---|---|---|---|');
  for (const [id, v] of Object.entries(S.variants)) L.push(`| ${id} | ${v.writer} | ${v.n} | ${v.ms_median ?? '–'} | ${v.ms_p90 ?? '–'} | ${v.usd_mean ?? '–'} | ${v.words_mean ?? '–'} | ${v.links_mean ?? '–'} |`);
  if (S.ranking) {
    L.push('', '## Light models ranked (quality = mean of the four judged dimensions; rank 1 = best on that axis)', '',
      '| model | quality (Δ base) | W/T/L vs base | completeness | brevity | median ms | mean $ | ranks q/brev/compl/speed/cost |', '|---|---|---|---|---|---|---|---|');
    for (const x of S.ranking) L.push(`| ${x.writer} | ${x.quality} (${x.quality_vs_base >= 0 ? '+' : ''}${x.quality_vs_base}) | ${x.win}/${x.tie}/${x.loss} | ${x.completeness} | ${x.brevity} | ${x.ms_median} | ${x.usd_mean} | ${['quality', 'brevity', 'completeness', 'ms_median', 'usd_mean'].map((k) => x.ranks[k]).join('/')} |`);
  }
  L.push('', '## Per question type', '', '| class | n | ' + PAIRS.map(([c, r]) => `${c} vs ${r} W/T/L`).join(' | ') + ' | ' + VARIANTS.map((v) => `${v.id} ms / $ / words`).join(' | ') + ' |',
    '|' + '---|'.repeat(2 + PAIRS.length + VARIANTS.length));
  for (const [cls, c] of Object.entries(S.by_class)) L.push(`| ${cls} ${CLASSES[cls] ? `· ${CLASSES[cls].split(/[:(,;]/)[0].trim().slice(0, 32)}` : ''} | ${c.n} | ${c.pairs.map((p) => `${p.win}/${p.tie}/${p.loss}`).join(' | ')} | ${VARIANTS.map((v) => { const x = c.variants[v.id]; return `${x.ms_median ?? '–'} / ${x.usd_mean ?? '–'} / ${x.words_mean ?? '–'}`; }).join(' | ')} |`);
  L.push('', `## Lost by ≥2 on a dimension (${S.big_losses.length})`, '');
  for (const b of S.big_losses) L.push(`- **${b.key}** ${b.cls} — ${b.winner} beat ${b.loser} on ${b.dims.join(', ')}: ${b.reason}  \n  _${b.question.slice(0, 160)}_`);
  return L.join('\n') + '\n';
}

// ---- run
plan();
const results = new Array(ITEMS.length); let next = 0, done = 0;
await Promise.all(Array.from({ length: Math.min(CONC, ITEMS.length) }, async () => {
  for (let i = next++; i < ITEMS.length; i = next++) {
    results[i] = await runItem(ITEMS[i]);
    const r = results[i];
    console.log(`[${++done}/${ITEMS.length}] ${r.key} ${r.cls} ${r.error ? `ERROR ${r.error}` : r.na ? `n/a: ${r.na}` : r.pairs.map((p) => `${p.contender}:${p.error ? 'err' : p.winner}`).join(' ')}`);
  }
}));
const S = stats(results), meta = { date: DATE, compare: COMPARE, role: ROLE, baseline: BASE, mode: MODE, judge: JUDGE, seed: SEED, tag: TAG || null,
  variants: VARIANTS, spend: { anis: r2(spend.anis, 4), judge: r2(spend.judge, 4) } };
const REP = join(DIR, 'reports'); if (!existsSync(REP)) mkdirSync(REP, { recursive: true });
const base = join(REP, `anis-writer-ab-${DATE}-${COMPARE}${TAG ? `-${TAG}` : ''}`);
writeFileSync(`${base}.json`, JSON.stringify({ ...meta, summary: S, results }, null, 1));
writeFileSync(`${base}.md`, markdown(S, meta));
const HIST = join(DIR, 'anis-writer-ab-history.json');
const hist = existsSync(HIST) ? JSON.parse(readFileSync(HIST, 'utf8')) : [];
hist.push({ ...meta, variants: VARIANTS.map((v) => `${v.id}=${v.writer}${v.format === 'none' ? '/none' : ''}`), n: S.n, judged: S.judged, na: S.na, errors: S.errors,
  pairs: S.pairs.map(({ contender, reference, win, tie, loss }) => ({ contender, reference, win, tie, loss })),
  writing: Object.fromEntries(Object.entries(S.variants).map(([id, v]) => [id, { ms_median: v.ms_median, usd_mean: v.usd_mean, words_mean: v.words_mean }])) });
writeFileSync(HIST, JSON.stringify(hist, null, 1));
console.log(`\n${markdown(S, meta).split('## Per question type')[0]}reports: ${base}.{json,md}`);
