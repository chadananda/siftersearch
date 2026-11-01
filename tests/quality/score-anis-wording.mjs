#!/usr/bin/env node
// Anís wording battery: every frozen natural-language wording (anis-wording-fixtures.json) through Anís (/api/v1/anis/draft, logs as battery+wording-<fixture>@ — one thread per fixture, a single shared thread grows to 1000+ rounds),
// scored per STAGE (strategy → phrases → retrieval → selection → answer) with the first failing stage as the cause. Prints type × style pass matrix.
//   node tests/quality/score-anis-wording.mjs [--only id,id] [--types exact_phrase,..] [--styles fragment,..] [--sample N] [--per-cell]
//        [--concurrency 3] [--estimate] [--no-write]     API base: API_BASE (default http://tower-nas:7839 — api.siftersearch.com is often unreachable from the Mac)
// Needs INTERNAL_API_KEY (draft) and DEPLOY_SECRET (thread route/usd). Retrieval stage is a PROXY (see retrievalProxy): the raw wording to /api/v1/search.
import dns from 'node:dns'; dns.setDefaultResultOrder('ipv4first');
import dotenv from 'dotenv';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const DIR = dirname(fileURLToPath(import.meta.url)), ROOT = join(DIR, '..', '..');
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(ROOT, f), quiet: true });
const API = process.env.API_BASE || 'http://tower-nas:7839';
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const list = (k) => arg(k)?.split(',').filter(Boolean);
const has = (k) => process.argv.includes(`--${k}`);
const fold = (s) => String(s || '').replace(/<[^>]+>/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[‘’ʼʻʾʿ`']/g, '').replace(/[-–—_/]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const pct = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : null);
const sleep = (ms) => new Promise((z) => setTimeout(z, ms));
// --mode current (default): the planner path (research:false) — exposes per-stage choice/ms in the route, ~$0.0025/reply. --mode research: the researcher (the email default), ~$0.045/reply, planner shape hidden.
const MODE = arg('mode') || 'current';
const KEY = process.env.INTERNAL_API_KEY, ADMIN = process.env.DEPLOY_SECRET;

// ---- selection of variants
const { fixtures } = JSON.parse(readFileSync(join(DIR, 'anis-wording-fixtures.json'), 'utf8'));
let cases = fixtures.flatMap((f) => f.variants.map((v) => ({ f, v })));
if (list('only')) cases = cases.filter(({ f, v }) => list('only').some((o) => f.id === o || v.id === o));
if (list('types')) cases = cases.filter(({ f }) => list('types').includes(f.type));
if (list('styles')) cases = cases.filter(({ v }) => list('styles').includes(v.style));
// stratified: every type × style cell at least once (round-robin over cells), then random fill to N
if (arg('sample')) {
  const N = Number(arg('sample')), cells = new Map();
  for (const c of cases.sort(() => Math.random() - 0.5)) { const k = `${c.f.type}|${c.v.style}`; (cells.get(k) || cells.set(k, []).get(k)).push(c); }
  const picked = [], rest = [];
  for (const arr of cells.values()) { picked.push(arr[0]); rest.push(...arr.slice(1)); }
  cases = N <= picked.length ? picked.sort(() => Math.random() - 0.5).slice(0, N) : [...picked, ...rest.sort(() => Math.random() - 0.5).slice(0, N - picked.length)];
}

// ---- one Anís reply (job → poll → thread route)
let seq = 0; const RUN = Date.now().toString(36);
async function jfetch(url, o = {}) { const r = await fetch(url, { signal: AbortSignal.timeout(40000), ...o }); return { r, j: await r.json().catch(() => ({})) }; }
async function anis(messages, who) {
  const t0 = Date.now(), key = `wording-${RUN}-${++seq}`;
  const H = { 'content-type': 'application/json', 'X-Internal-Key': KEY };
  try {
    const s = await jfetch(`${API}/api/v1/anis/draft`, { method: 'POST', headers: H, body: JSON.stringify({ messages, email: `battery+wording-${who}@siftersearch.com`, async: true, job: key, ...(MODE === 'current' ? { research: false } : {}) }) });
    if (!s.r.ok) return { error: `start ${s.r.status}`, ms: Date.now() - t0 };
    for (;;) {
      await sleep(2500);
      const g = await jfetch(`${API}/api/v1/anis/draft/job/${key}`, { headers: H }).then((x) => x.j).catch(() => ({ status: 'poll-failed' }));
      if (g.status === 'done') {
        const res = g.result || {}; let route = null, meta = null;
        // the thread row is written just after the job reports done: retry a few times; battery@ shares ONE thread, so match the round by its question text, never "last"
        for (let k = 0; k < 4 && res.conversationId && !route; k++) {
          if (k) await sleep(2500);
          const t = await jfetch(`${API}/api/admin/anis/threads/${res.conversationId}`, { headers: { 'X-Internal-Key': ADMIN } }).then((x) => x.j).catch(() => null);
          // the round whose question is this wording (exact), its reply text equal to ours when several; latest wins
          const want = String(messages.at(-1).content).trim(), cand = (t?.rounds || []).filter((x) => x.reply && String(x.question?.text || '').trim() === want).reverse();
          const rp = cand.find((x) => x.reply.text === res.reply) || cand[0];
          route = rp?.reply?.route || null; meta = rp?.reply?.meta || null;
        }
        meta ||= res.meta || null;
        return { res, route, meta, ms: Date.now() - t0 };
      }
      if (['failed', 'lost'].includes(g.status)) return { error: `job ${g.status} ${g.error || ''}`, ms: Date.now() - t0 };
      if (Date.now() - t0 > 300000) return { error: 'timeout 5 min', ms: Date.now() - t0 };
    }
  } catch (e) { return { error: e.message, ms: Date.now() - t0 }; }
}

// ---- stage helpers
// stage 3 PROXY (inferred, not Anís's own retrieval): the raw wording through the planned public search; does the truth appear in the top 10?
async function retrievalProxy(q, cite) {
  try {
    const { r, j } = await jfetch(`${API}/api/search/multi`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Internal-Key': ADMIN, 'X-Sifter-Test': '1' }, body: JSON.stringify({ query: q, limit: 10 }) });
    if (!r.ok) return null;
    return matchCite(cite, fold((j.hits || []).map((h) => `${h.title} ${h.author} ${h.text || h.content}`).join(' ')), false).ok;
  } catch { return null; }
}
// every nested value under a key matching `re` (phrases / extracted queries, wherever the route exposes them)
const dig = (o, re, out = [], d = 0) => { if (o && typeof o === 'object' && d < 6) for (const [k, v] of Object.entries(o)) { if (re.test(k) && v) out.push(...[].concat(v).map((x) => (typeof x === 'string' ? x : x?.query || x?.phrase || JSON.stringify(x)))); else dig(v, re, out, d + 1); } return out; };
function matchCite(cite, text, needLink, raw = '') {
  const t = ` ${text} `, rx = (p) => new RegExp(p).test(t);
  let ok = true;
  if (cite.any) ok &&= cite.any.some(rx);
  if (cite.all) ok &&= cite.all.every(rx);
  if (cite.min) ok &&= cite.min.of.filter(rx).length >= cite.min.n;
  const link = !cite.link || /https?:\/\/(?:www\.)?(?:oceanlibrary|siftersearch)\.com\//i.test(raw);
  return { ok: !!ok, link, ok_all: ok && (!needLink || link) };
}
const NOTFOUND = /\b(couldn[’']?t|could not|can[’']?t|cannot|unable to|did not|didn[’']?t|wasn[’']?t able to|was not able to|not been able to)\b[^.\n]{0,40}\b(find|locate|identify)\b|\bno (?:matching |exact |such )?(?:passage|quotation|quote|result)s?\b[^.\n]{0,30}\b(?:found|found in)\b|\bnot found in the library\b/i;
const WRAPPER = /\b(can you|could you|would you|please|find|where|quote including|i wonder|help me|tell me|who said)\b/i;

// acceptable strategy (assistant recipe) names — the planner SHAPES plus the recipes of the same family ('source' = source hunt for a quote, 'position' = viewpoint answer for a topic): the fixture's own list, widened where the WORDING legitimately changes the question (not to fit Anís): 'who wrote X' about a work/person is a fact question; two source-resolution fixtures are phrased as topic questions
const expectedShapes = (f, v) => [...new Set([...f.expected_strategy, ...(v.style === 'source_of' && ['find_work', 'find_person', 'misattribution'].includes(f.type) ? ['lookup', 'fact', 'define'] : []), ...(f.expected_strategy.includes('quote') ? ['source'] : []), ...(f.expected_strategy.includes('topic') ? ['position'] : []), ...(['sr-essence-justice', 'sr-light-of-men'].includes(f.id) ? ['topic'] : [])])];
async function run({ f, v }) {
  const a = await anis(v.messages, f.id.replace(/[^\w-]/g, '')), last = v.messages.at(-1).content;
  const out = { id: v.id, fixture: f.id, type: f.type, style: v.style, messages: v.messages, ms: a.ms };
  if (a.error) return { ...out, error: a.error, pass: false, stage: 'error' };
  const text = a.res.reply || '', ft = fold(text), route = a.route || {};
  // per-stage record from the route (route.plan.stages: strategy → phrases → retrieval → selection → format, each {choice,by,ms}); null where the route does not expose it
  const st = route.plan?.stages || {}, rs = a.res.research?.steps;
  const obs = { gate: route.gate ?? a.res.path?.gate ?? null, format: st.format?.choice ?? route.format ?? a.res.format ?? null, provenance: route.plan?.provenance ?? null };
  const shape = st.strategy?.choice ?? route.plan?.shape ?? (MODE === 'current' ? a.res.recipe : null) ?? null;
  const expected = expectedShapes(f, v), strategyOk = shape == null ? null : expected.includes(shape);   // research mode hides the planner shape → not scored
  const phrases = (st.phrases ? [].concat(st.phrases.choice || []).map(String) : rs ? rs.filter((x) => x.args?.query).map((x) => x.args.query) : []).filter(Boolean);
  const key = fold(f.canonical).split(' ').filter((w) => w.length > 3);
  const phr = fold(phrases.join(' '));
  const phrasesOk = phrases.length ? key.length === 0 || key.filter((w) => phr.includes(w)).length / key.length >= 0.6 : null;
  const phraseWrapper = phrases.length ? phrases.some((p) => WRAPPER.test(p)) : null;
  const stageMs = Object.fromEntries(Object.entries(st).filter(([, x]) => x?.ms != null).map(([k, x]) => [k, x.ms]));
  const cite = matchCite(f.cite, ft, true, text);
  const allowNF = !!f.cite.allow_not_found;
  const nofound = NOTFOUND.test(text) && !allowNF;
  // retrieved-at-all is INFERRED: cited → retrieved; else the extracted phrase (or raw wording) through planned search must show the truth in its top 10
  const retrieved = cite.ok ? true : await retrievalProxy(phrases[0] || last, f.cite);
  const offtopic = !cite.ok && !nofound && text.length > 0;
  const answerOk = cite.ok_all && !nofound;
  // first failing stage (in pipeline order)
  const ok = strategyOk !== false && phrasesOk !== false && answerOk;
  const stage = ok ? 'ok' : strategyOk === false ? 'strategy' : phrasesOk === false ? 'phrases' : cite.ok ? 'answer' : retrieved === false ? 'retrieval' : retrieved === true ? 'selection' : 'retrieval-or-selection';
  const usd = a.meta?.usd ?? null, ms = a.meta?.latency_ms ?? a.ms;
  return { ...out, expected_strategy: expected, shape, strategyOk, phrases, phrasesOk, phraseWrapper, retrieved, selection: st.selection?.choice ?? null, stage_ms: stageMs, cite_ok: cite.ok, link_ok: cite.link, nofound, offtopic, answerOk,
    pass: ok, stage, slow: ms > 5000, route: obs, usd, latency_ms: ms, wall_ms: a.ms, models: a.meta?.models, reply_head: text.slice(0, 260) };
}

// ---- run
const rescore = arg('rescore');   // recompute pass/stage/matrix from a saved report under the CURRENT expectedShapes (no API calls)
let saved = null;
if (rescore) {
  saved = JSON.parse(readFileSync(rescore, 'utf8')).results;
  const fx = new Map(fixtures.map((f) => [f.id, f]));
  cases = saved.map((r) => ({ f: fx.get(r.fixture), v: { id: r.id, style: r.style } }));
  saved.forEach((r, i) => {
    if (r.error) return;
    const ex = expectedShapes(cases[i].f, cases[i].v); r.expected_strategy = ex; r.strategyOk = r.shape == null ? null : ex.includes(r.shape);
    r.pass = r.strategyOk !== false && r.phrasesOk !== false && r.answerOk;
    r.stage = r.pass ? 'ok' : r.strategyOk === false ? 'strategy' : r.phrasesOk === false ? 'phrases' : r.cite_ok ? 'answer' : r.retrieved === false ? 'retrieval' : r.retrieved === true ? 'selection' : 'retrieval-or-selection';
  });
}
if (!saved) console.log(`${cases.length} variants (${new Set(cases.map((c) => c.f.id)).size} fixtures), API ${API}, concurrency ${arg('concurrency') || 3}`);
if (!saved && (!KEY || !ADMIN)) { console.error('INTERNAL_API_KEY and DEPLOY_SECRET required (.env-secrets)'); process.exit(2); }
const results = saved || [];
const N = Number(arg('concurrency') || 3);
let next = 0;
const worker = async () => { for (;;) { const i = next++; if (i >= cases.length) return; const r = await run(cases[i]); results.push(r);
  if (!has('no-write') && results.length % 40 === 0) { mkdirSync(join(DIR, 'reports'), { recursive: true }); writeFileSync(join(DIR, 'reports', 'anis-wording-partial.json'), JSON.stringify(results)); }   // survives a crash
  console.log(`${String(results.length).padStart(3)}/${cases.length} ${r.pass ? 'PASS' : 'FAIL'} ${r.stage.padEnd(10)} ${String(r.latency_ms ?? r.wall_ms).padStart(6)}ms $${r.usd ?? '?'} ${r.id} [${r.style}] ${r.shape ?? ''}${r.stage_ms?.retrieval != null ? ` retr ${r.stage_ms.retrieval}ms` : ''}`); } };
if (!saved) await Promise.all(Array.from({ length: N }, worker));

// ---- report
const types = [...new Set(results.map((r) => r.type))], styles = [...new Set(results.map((r) => r.style))];
const cell = (rs) => (rs.length ? `${rs.filter((r) => r.pass).length}/${rs.length}` : '·');
const matrix = {}; for (const t of types) { matrix[t] = {}; for (const s of styles) matrix[t][s] = cell(results.filter((r) => r.type === t && r.style === s)); matrix[t].ALL = cell(results.filter((r) => r.type === t)); }
const lat = results.map((r) => r.latency_ms).filter((x) => x != null);
const usd = results.map((r) => r.usd).filter((x) => x != null);
const stages = {}; for (const r of results) stages[r.stage] = (stages[r.stage] || 0) + 1;
const summary = { date: new Date().toISOString(), variants: results.length, pass: results.filter((r) => r.pass).length, pass_rate: +(results.filter((r) => r.pass).length / Math.max(1, results.length)).toFixed(3),
  strategy_ok: results.filter((r) => r.strategyOk).length, strategy_scored: results.filter((r) => r.strategyOk != null).length, mode: MODE, answer_ok: results.filter((r) => r.answerOk).length, nofound: results.filter((r) => r.nofound).length, offtopic: results.filter((r) => r.offtopic).length,
  errors: results.filter((r) => r.error).length, slow_gt5s: results.filter((r) => r.slow).length, p50_ms: pct(lat, 0.5), p95_ms: pct(lat, 0.95), usd_total: +usd.reduce((a, b) => a + b, 0).toFixed(4), usd_per_reply: usd.length ? +(usd.reduce((a, b) => a + b, 0) / usd.length).toFixed(5) : null, first_failing_stage: stages };
console.log('\nSUMMARY', JSON.stringify(summary));
console.log('\nPASS MATRIX (type x style)'); console.table(matrix);
if (!has('no-write')) {
  const dir = join(DIR, 'reports'); mkdirSync(dir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10), file = join(dir, `anis-wording-${day}${arg('tag') ? `-${arg('tag')}` : ''}.json`);
  writeFileSync(file, JSON.stringify({ summary, matrix, results }, null, 1));
  const hf = join(DIR, 'anis-wording-history.json'), hist = existsSync(hf) ? JSON.parse(readFileSync(hf, 'utf8')) : [];
  const dayTag = (h) => h.date.slice(0, 10) === day && h.tag === (arg('tag') || null);
  hist.splice(0, hist.length, ...hist.filter((h) => !(saved && dayTag(h))));   // a rescore replaces that day's entry
  hist.push({ ...summary, tag: arg('tag') || null, matrix, ...(saved ? { rescored: true } : {}) }); writeFileSync(hf, JSON.stringify(hist, null, 1));
  console.log('wrote', file);
}
