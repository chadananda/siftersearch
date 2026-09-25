#!/usr/bin/env node
// Search-TYPE battery: per question-type pass rates against independent ground truth (search-type-fixtures.json).
// Hits the endpoint each type really uses (search, find-document, entity lookup/roster, religions). A 429/5xx is an
// ERROR, never a fail — errors void the run's validity rather than lowering its score.
//   node tests/quality/score-types.mjs [--json] [--type=find_person] [--multi] [--write-report] [--top-k=10]
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const args = process.argv.slice(2);
const JSON_ONLY = args.includes('--json');
const WRITE_REPORT = args.includes('--write-report');
const MULTI = args.includes('--multi');
// --no-plan: raw multi-index engine, bypassing the Jev planner (measures what planning adds).
const NO_PLAN = args.includes('--no-plan');
const TOP_K = parseInt(args.find((a) => a.startsWith('--top-k='))?.split('=')[1] || '10', 10);
const TYPE = args.find((a) => a.startsWith('--type='))?.split('=')[1] || null;
const API_BASE = process.env.PUBLIC_API_URL || 'https://api.siftersearch.com';
const API_KEY = process.env.PUBLIC_SIFTER_API_KEY;
const INTERNAL_KEY = process.env.DEPLOY_SECRET || process.env.INTERNAL_API_KEY;
if (!API_KEY) { console.error('PUBLIC_SIFTER_API_KEY not set in .env-public'); process.exit(2); }
if (MULTI && !INTERNAL_KEY) { console.error('--multi needs DEPLOY_SECRET (or INTERNAL_API_KEY)'); process.exit(2); }

const { fixtures: ALL } = JSON.parse(readFileSync(join(__dirname, 'search-type-fixtures.json'), 'utf-8'));
const FIXTURES = TYPE ? ALL.filter((f) => f.type === TYPE) : ALL;

// Same folding as score-search.mjs: tags dropped (Meili <em> splits words otherwise), accents/apostrophes gone.
export const fold = (s) => String(s || '').replace(/<[^>]+>/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[‘’ʼʻʾʿ`']/g, '').replace(/[-–—_/]/g, ' ')
  .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const TRAD = { islamic: 'islam', islam: 'islam', jewish: 'judaism', judaism: 'judaism', taoist: 'tao', tao: 'tao', taoism: 'tao',
  christian: 'christian', christianity: 'christian', buddhist: 'buddhist', buddhism: 'buddhist', hindu: 'hindu', hinduism: 'hindu',
  bahai: 'bahai', zoroastrian: 'zoroastrian', confucian: 'confucian', confucianism: 'confucian', jain: 'jain', sikh: 'sikh' };
const trad = (s) => TRAD[fold(s).replace(/ /g, '')] || fold(s);
const re = (p) => new RegExp(p);

class ApiError extends Error {}
async function call(path, { method = 'GET', body, internal = false, keyless = false } = {}) {
  const headers = { ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(keyless ? {} : internal ? { 'X-Internal-Key': INTERNAL_KEY } : { 'X-API-Key': API_KEY }) };
  const t0 = Date.now();
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new ApiError(`HTTP ${res.status} ${path.split('?')[0]}`);
  return { data: await res.json(), ms: Date.now() - t0 };
}

async function search(query) {
  const { data, ms } = MULTI
    ? await call('/api/search/multi', { method: 'POST', body: { query, limit: TOP_K, ...(NO_PLAN ? { plan: false } : {}) }, internal: true })
    : await call('/api/v1/search', { method: 'POST', body: { query, limit: TOP_K } });
  const hits = (data.results || data.hits || data.passages || []).slice(0, TOP_K);
  return { ms, items: hits.map((h) => ({ title: fold(h.title), author: fold(h.author), text: fold(h.text), religion: trad(h.religion) })) };
}

const lookupCache = new Map();
async function lookup(q) {
  if (!lookupCache.has(q)) {
    const { data, ms } = await call(`/api/v1/entities/lookup?q=${encodeURIComponent(q)}`, { keyless: true });
    lookupCache.set(q, { ms, items: data.candidates || data.results || [] });
  }
  return lookupCache.get(q);
}

// Each checker returns { ok, why } — why names what was missing, so a fail reads without re-running.
const matchHit = (h, want) => Object.entries(want).every(([k, p]) => re(p).test(h[k] || ''));
const CHECKS = {
  hit: (items, want) => {
    const i = items.findIndex((h) => matchHit(h, want));
    return i >= 0 ? { ok: true, rank: i + 1 } : { ok: false, why: `no top-${items.length} hit with ${JSON.stringify(want)}` };
  },
  no_hit: (items, want) => {
    const i = items.findIndex((h) => matchHit(h, want));
    return i < 0 ? { ok: true } : { ok: false, why: `hit #${i + 1} "${items[i].title}" appears to confirm it` };
  },
  top_religion: (items, { religion, n }) => {
    const top = items.slice(0, n).map((h) => h.religion);
    return top.length === n && top.every((r) => r === religion) ? { ok: true } : { ok: false, why: `top ${n} religions: ${top.join(', ')}` };
  },
  top_author: (items, { author, n }) => {
    const top = items.slice(0, n).map((h) => h.author);
    return top.length === n && top.every((a) => re(author).test(a)) ? { ok: true } : { ok: false, why: `top ${n} authors: ${top.join(' | ')}` };
  },
  religions_all: (items, list) => {
    const have = new Set(items.map((h) => h.religion));
    const miss = list.filter((r) => !have.has(r));
    return miss.length ? { ok: false, why: `missing traditions: ${miss.join(', ')} (had ${[...have].join(', ')})` } : { ok: true };
  },
  religions_min: (items, n) => {
    const have = new Set(items.map((h) => h.religion));
    return have.size >= n ? { ok: true } : { ok: false, why: `${have.size} traditions: ${[...have].join(', ')}` };
  },
};

const RUNNERS = {
  async search(f) {
    const { ms, items } = await search(f.query);
    const results = Object.entries(f.expect).map(([k, v]) => CHECKS[k](items, v));
    return { ms, results, top: items[0] && `${items[0].title} [${items[0].religion}]` };
  },
  async find_document(f) {
    const qs = new URLSearchParams({ title: f.query, ...(f.params || {}) });
    const { data, ms } = await call(`/api/v1/library/find-document?${qs}`);
    const cands = (data.candidates || []).map((c) => ({ title: fold(c.title), author: fold(c.author) }));
    const within = f.expect.within || 1;
    const i = cands.slice(0, within).findIndex((c) => matchHit(c, f.expect.candidate));
    return { ms, results: [i >= 0 ? { ok: true, rank: i + 1 } : { ok: false, why: `top ${within}: ${cands.slice(0, within).map((c) => `${c.title} [${c.author}]`).join(' | ') || 'none'}` }],
      top: cands[0] && `${cands[0].title} [${cands[0].author}]` };
  },
  async entity_lookup(f) {
    // Identity is anchored at runtime on the canonical name, never on a hard-coded id that a merge could renumber.
    const anchor = await lookup(f.expect.same_as);
    const a = anchor.items[0];
    if (!a || fold(a.name) !== fold(f.expect.same_as)) throw new ApiError(`anchor "${f.expect.same_as}" did not resolve to itself (got ${a?.name})`);
    const { ms, items } = await lookup(f.query);
    const within = f.expect.within || 1;
    const i = items.slice(0, within).findIndex((c) => c.id === a.id);
    return { ms, results: [i >= 0 ? { ok: true, rank: i + 1 } : { ok: false, why: `wanted ${a.name} (${a.id}); top ${within}: ${items.slice(0, within).map((c) => `${c.name} (${c.id})`).join(' | ')}` }],
      top: items[0] && `${items[0].name} (${items[0].type})` };
  },
  async entity_roster(f) {
    const { items } = await lookup(f.query);
    const node = items.find((c) => c.type === f.params.entity_type);
    if (!node) return { ms: 0, results: [{ ok: false, why: `no ${f.params.entity_type} node for "${f.query}"` }] };
    const { data, ms } = await call(`/api/v1/entities/${node.id}`, { keyless: true });
    const members = (data.participants || []).filter((p) => (p.relations || []).includes(f.params.relation)).map((p) => fold(p.name));
    const results = [];
    const missing = (f.expect.includes || []).filter((p) => !members.some((m) => re(p).test(m)));
    results.push(missing.length ? { ok: false, why: `missing: ${missing.join(', ')}` } : { ok: true });
    const wrong = (f.expect.excludes || []).flatMap((p) => members.filter((m) => re(p).test(m)));
    if (f.expect.excludes) results.push(wrong.length ? { ok: false, why: `must not list: ${wrong.join(', ')}` } : { ok: true });
    if (f.expect.count) results.push(members.length === f.expect.count ? { ok: true } : { ok: false, why: `${members.length} members, expected ${f.expect.count}` });
    return { ms, results, top: `${node.name}: ${members.length} ${f.params.relation}` };
  },
  async religions(f) {
    const { data, ms } = await call('/api/v1/library/religions');
    const n = (data.religions || data).length;
    return { ms, results: [n >= f.expect.min_count ? { ok: true } : { ok: false, why: `${n} religions` }], top: `${n} religions` };
  },
};

async function runOne(f) {
  const t0 = Date.now();
  try {
    const r = await RUNNERS[f.endpoint](f);
    const ok = r.results.every((x) => x.ok);
    return { id: f.id, type: f.type, persona: f.persona, ok, known_gap: !!f.known_gap, ms: r.ms ?? Date.now() - t0,
      rank: r.results.find((x) => x.rank)?.rank ?? null, why: r.results.filter((x) => !x.ok).map((x) => x.why).join('; ') || null, top: r.top ?? null };
  } catch (err) {
    return { id: f.id, type: f.type, persona: f.persona, ok: false, error: err.message, known_gap: !!f.known_gap, ms: Date.now() - t0 };
  }
}

// Two at a time: the live search is LLM-reranked, and a burst skews latency for everyone else.
const results = [];
for (let i = 0; i < FIXTURES.length; i += 2) results.push(...await Promise.all(FIXTURES.slice(i, i + 2).map(runOne)));

const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const quantile = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };
const group = (key) => {
  const out = {};
  for (const r of results) {
    const g = (out[r[key]] ||= { passed: 0, measured: 0, errored: 0, ms: [] });
    if (r.error) { g.errored++; continue; }
    g.measured++; if (r.ok) g.passed++; g.ms.push(r.ms);
  }
  for (const g of Object.values(out)) { g.pass_rate = pct(g.passed, g.measured); g.p50_ms = quantile(g.ms, 0.5); delete g.ms; }
  return out;
};
const measured = results.filter((r) => !r.error);
const report = {
  run_at: new Date().toISOString(), endpoint: MULTI ? (NO_PLAN ? 'multi-raw' : 'multi-planned') : 'public', top_k: TOP_K,
  valid: measured.length === results.length,
  total: results.length, measured: measured.length, errored: results.length - measured.length,
  passed: measured.filter((r) => r.ok).length, pass_rate: pct(measured.filter((r) => r.ok).length, measured.length),
  // A known gap that passes is news (something got fixed); an unmarked fixture that fails is a regression or a new finding.
  known_gaps_now_passing: measured.filter((r) => r.known_gap && r.ok).map((r) => r.id),
  unexpected_failures: measured.filter((r) => !r.known_gap && !r.ok).map((r) => r.id),
  by_type: group('type'), by_persona: group('persona'),
  latency_p50_ms: quantile(measured.map((r) => r.ms), 0.5), latency_p95_ms: quantile(measured.map((r) => r.ms), 0.95),
  results,
};

if (WRITE_REPORT) {
  const histPath = join(__dirname, MULTI ? 'type-history-multi.json' : 'type-history.json');   // entries carry `endpoint`
  const hist = existsSync(histPath) ? JSON.parse(readFileSync(histPath, 'utf-8')) : [];
  const { results: _r, ...summary } = report;
  if (report.valid) hist.push(summary); // an invalid run is not history
  writeFileSync(histPath, JSON.stringify(hist, null, 2));
  writeFileSync(join(__dirname, MULTI ? 'type-results-latest-multi.json' : 'type-results-latest.json'), JSON.stringify(report, null, 2));
}

if (JSON_ONLY) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }
console.log(`\nSearch-type battery (${report.endpoint}, top-${TOP_K}) — ${report.passed}/${report.measured} (${report.pass_rate}%)${report.valid ? '' : `  ⚠ INVALID: ${report.errored} errored`}`);
console.log(`latency p50 ${report.latency_p50_ms}ms  p95 ${report.latency_p95_ms}ms\n`);
for (const [t, g] of Object.entries(report.by_type)) console.log(`  ${t.padEnd(16)} ${String(g.passed).padStart(2)}/${String(g.measured).padEnd(2)} ${String(g.pass_rate ?? '-').padStart(4)}%  p50 ${g.p50_ms ?? '-'}ms${g.errored ? `  (${g.errored} errored)` : ''}`);
console.log('');
for (const [p, g] of Object.entries(report.by_persona)) console.log(`  persona ${p.padEnd(9)} ${g.passed}/${g.measured} (${g.pass_rate}%)`);
console.log('\nFailures:');
for (const r of results.filter((x) => !x.ok)) console.log(`  ${r.known_gap ? '○ known' : '✗ NEW  '} ${r.id.padEnd(34)} ${r.error ? `ERROR ${r.error}` : r.why}`);
if (report.known_gaps_now_passing.length) console.log(`\n★ known gaps now PASSING: ${report.known_gaps_now_passing.join(', ')}`);
