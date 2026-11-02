#!/usr/bin/env node
// Search gate: grades an engine change by diffing two battery runs (before/after) into a PASS/FAIL verdict.
// Run dir = search.json (score-search --json), types.json (score-types --raw --json), optional xl.json (score-crosslingual-api --out).
//   search-gate --run <dir> [--xl-limit=300] [--passthrough="--multi"]     run the batteries, write the dir
//   search-gate --before <dir> --after <dir> [--recheck] [--tag=x] [--noise=N] [--fixtures=file]   diff + verdict (exit 0 PASS / 1 FAIL)
// Errored fixtures are unmeasured (never a flip). --recheck re-runs only flipped fixtures once on the live engine: flips that
// revert are flake; the rest are real. PASS when real regressions - real fixes <= noise, no category collapses, latency holds.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const pct = (a, b) => (b ? +((100 * a) / b).toFixed(1) : null);
const quant = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };

// Parse battery stdout: dotenv prints banner lines before the JSON.
export const parseJson = (raw) => { const i = raw.search(/^\{/m); return JSON.parse(raw.slice(i < 0 ? 0 : i)); };

// Normalise the three battery outputs into rows {key, ok, rank, cat, ms, query, err}. queries: key -> text.
export function normalize({ search, types, xl }, queries = {}) {
  const rows = [];
  for (const r of search?.results || []) rows.push({ key: `s:${r.id}`, ok: !!r.ok, rank: r.rank ?? null, cat: `search/${r.category}`, ms: r.latency_ms, err: !!r.errorType, query: queries[`s:${r.id}`] });
  for (const r of types?.results || []) rows.push({ key: `t:${r.id}`, ok: !!r.ok, rank: r.rank ?? null, cat: `types/${r.type}`, ms: r.ms, err: !!r.error, query: queries[`t:${r.id}`] });
  for (const r of xl?.rows || []) rows.push({ key: `x:${r.id}`, ok: !r.error && !!r.rank, rank: r.rank ?? null, cat: `xl/${r.kind}`, ms: r.ms, err: !!r.error, query: queries[`x:${r.id}`] });
  return rows;
}

export function stats(rows) {
  const ms = rows.filter((r) => !r.err);
  const by = {};
  for (const r of ms) { const g = (by[r.cat] ||= { n: 0, pass: 0, rr: 0 }); g.n++; if (r.ok) g.pass++; if (r.rank) g.rr += 1 / r.rank; }
  const cats = Object.fromEntries(Object.entries(by).map(([k, g]) => [k, { n: g.n, pass: g.pass, rate: pct(g.pass, g.n), mrr: +(g.rr / g.n).toFixed(3) }]));
  const ts = ms.map((r) => r.ms).filter((x) => typeof x === 'number');
  return { measured: ms.length, errored: rows.length - ms.length, pass: ms.filter((r) => r.ok).length, rate: pct(ms.filter((r) => r.ok).length, ms.length),
    mrr: +(ms.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / (ms.length || 1)).toFixed(3), p50: quant(ts, 0.5), p95: quant(ts, 0.95), cats };
}

// Pure diff: flips between two row sets, over fixtures measured on both sides.
export function diffRuns(before, after) {
  const b = new Map(before.map((r) => [r.key, r])), regress = [], fixed = [];
  for (const a of after) {
    const x = b.get(a.key); if (!x || x.err || a.err) continue;
    const f = { key: a.key, query: a.query ?? x.query, cat: a.cat, before: x.rank, after: a.rank };
    if (x.ok && !a.ok) regress.push(f); else if (!x.ok && a.ok) fixed.push(f);
  }
  return { regress, fixed, before: stats(before), after: stats(after) };
}

// Pure verdict. recheck: Map key -> ok now (flake filter); absent = not rechecked, flip stands.
export function verdict(diff, { recheck = null, noise = null, maxLatencyRatio = 1.5, maxCatDrop = 5 } = {}) {
  const real = (flips, want) => flips.filter((f) => !recheck || !recheck.has(f.key) || recheck.get(f.key) === want);
  const regress = real(diff.regress, false), fixed = real(diff.fixed, true);
  const n = diff.after.measured, tol = noise ?? Math.max(2, Math.ceil(0.005 * n));
  const net = regress.length - fixed.length, reasons = [];
  if (net > tol) reasons.push(`net regressions ${net} > noise ${tol}`);
  for (const [c, a] of Object.entries(diff.after.cats)) {
    const b = diff.before.cats[c]; if (b && a.n >= 10 && b.rate - a.rate > maxCatDrop) reasons.push(`category ${c} fell ${b.rate}% -> ${a.rate}%`);
  }
  if (diff.before.p50 && diff.after.p50 / diff.before.p50 > maxLatencyRatio) reasons.push(`p50 latency ${diff.before.p50}ms -> ${diff.after.p50}ms`);
  if (diff.after.measured && diff.after.errored / (diff.after.measured + diff.after.errored) > 0.02) reasons.push(`after run invalid: ${diff.after.errored} fixtures errored`);
  return { pass: !reasons.length, reasons, regress, fixed, net, noise: tol, flakeRegress: diff.regress.length - regress.length, flakeFixed: diff.fixed.length - fixed.length };
}

export function markdown(diff, v, tag, rechecked) {
  const L = [`# Search gate ${tag}: ${v.pass ? 'PASS' : 'FAIL'}`, '', `Net regressions ${v.net} (noise tolerance ${v.noise})${rechecked ? `; recheck removed ${v.flakeRegress} flaky regressions and ${v.flakeFixed} flaky fixes` : '; not rechecked'}.`];
  if (v.reasons.length) L.push('', ...v.reasons.map((r) => `- FAIL: ${r}`));
  const { before: B, after: A } = diff;
  L.push('', '| | before | after |', '|---|---|---|', `| pass rate | ${B.rate}% (${B.pass}/${B.measured}) | ${A.rate}% (${A.pass}/${A.measured}) |`, `| MRR | ${B.mrr} | ${A.mrr} |`,
    `| latency p50 / p95 ms | ${B.p50} / ${B.p95} | ${A.p50} / ${A.p95} |`, `| errored | ${B.errored} | ${A.errored} |`, '',
    '| category | n | pass before | pass after | MRR before | MRR after |', '|---|---|---|---|---|---|');
  for (const c of Object.keys({ ...B.cats, ...A.cats }).sort()) { const b = B.cats[c] || {}, a = A.cats[c] || {}; L.push(`| ${c} | ${a.n ?? b.n} | ${b.rate ?? '-'}% | ${a.rate ?? '-'}% | ${b.mrr ?? '-'} | ${a.mrr ?? '-'} |`); }
  const tbl = (t, xs) => xs.length ? ['', `## ${t} (${xs.length})`, '', '| id | query | before rank | after rank |', '|---|---|---|---|', ...xs.map((f) => `| ${f.key} | ${String(f.query ?? '').replace(/\|/g, '/')} | ${f.before ?? 'NF'} | ${f.after ?? 'NF'} |`)] : [];
  L.push(...tbl('Regressions pass -> fail', v.regress), ...tbl('Fixed fail -> pass', v.fixed));
  return L.join('\n') + '\n';
}

// ---- CLI ----
const loadRun = (dir) => { const f = (n) => existsSync(join(dir, n)) ? parseJson(readFileSync(join(dir, n), 'utf8')) : null; return { search: f('search.json'), types: f('types.json'), xl: f('xl.json') }; };
const node = (script, a) => spawnSync(process.execPath, [join(__dirname, script), ...a], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 29, env: { ...process.env, NODE_OPTIONS: '--dns-result-order=ipv4first' } });

function queryMap(extra) {
  const q = {};
  for (const f of JSON.parse(readFileSync(join(__dirname, 'ocean-fixtures.json'), 'utf8'))) q[`s:${f.id}`] = f.query;
  if (extra) for (const f of JSON.parse(readFileSync(join(ROOT, extra), 'utf8'))) q[`s:${f.id}`] = f.query;
  for (const f of JSON.parse(readFileSync(join(__dirname, 'search-type-fixtures.json'), 'utf8')).fixtures) q[`t:${f.id}`] = f.query ?? JSON.stringify(f.params ?? '');
  try { for (const c of JSON.parse(readFileSync(join(__dirname, 'crosslingual-fixtures.json'), 'utf8')).cases) q[`x:${c.id}`] = c.query ?? c.q ?? ''; } catch {}
  return q;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2), arg = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
  const pass = (arg('passthrough') || '').split(' ').filter(Boolean), fx = arg('fixtures');
  if (arg('run')) {
    const dir = join(ROOT, arg('run')); mkdirSync(dir, { recursive: true });
    const jobs = [['search.json', 'score-search.mjs', ['--json', ...(fx ? [`--fixtures=${fx}`] : []), ...pass]], ['types.json', 'score-types.mjs', ['--raw', '--json', ...pass]],
      ['xl.json', 'score-crosslingual-api.mjs', [`--limit=${arg('xl-limit') || 300}`, `--out=${join(dir, 'xl.json')}`, ...pass]]];
    for (const [out, script, a] of jobs) { const r = node(script, a); if (out !== 'xl.json') writeFileSync(join(dir, out), r.stdout); console.error(`${script} exit ${r.status} -> ${out}`); if (r.status && out !== 'xl.json') process.exit(2); }
    process.exit(0);
  }
  if (!arg('before') || !arg('after')) { console.error('usage: search-gate --run <dir> | --before <dir> --after <dir> [--recheck] [--tag=x] [--noise=N]'); process.exit(2); }
  const q = queryMap(fx), tag = arg('tag') || 'run';
  const diff = diffRuns(normalize(loadRun(join(ROOT, arg('before'))), q), normalize(loadRun(join(ROOT, arg('after'))), q));
  let recheck = null;
  if (args.includes('--recheck')) {
    recheck = new Map();
    for (const [pre, script, base] of [['s:', 'score-search.mjs', ['--json', ...(fx ? [`--fixtures=${fx}`] : []), ...pass]], ['t:', 'score-types.mjs', ['--raw', '--json', ...pass]]]) {
      const keys = [...diff.regress, ...diff.fixed].map((f) => f.key).filter((k) => k.startsWith(pre)); if (!keys.length) continue;
      const r = node(script, [...base, `--ids=${keys.map((k) => k.slice(2)).join(',')}`]);
      try { for (const x of parseJson(r.stdout).results) if (!(x.errorType || x.error)) recheck.set(`${pre}${x.id}`, !!x.ok); } catch (e) { console.error(`recheck ${script} failed: ${e.message}`); }
    }
  }
  const v = verdict(diff, { recheck, noise: arg('noise') ? +arg('noise') : null });
  const md = markdown(diff, v, tag, !!recheck), date = new Date().toISOString().slice(0, 10);
  mkdirSync(join(__dirname, 'reports'), { recursive: true });
  const out = join(__dirname, 'reports', `search-gate-${date}-${tag}.md`); writeFileSync(out, md);
  console.log(md.split('\n').slice(0, 14).join('\n') + `\nreport: ${out}`);
  process.exit(v.pass ? 0 : 1);
}
