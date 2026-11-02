// One quality runner: registry questions -> search|hype layer -> per-question JSON + markdown + run-history.jsonl. Plan: planning/search-quality-hub-20261102.md step 3/5.
// search = POST /api/v1/search (X-API-Key, as score-search.mjs). hype = POST /api/search/multi plan:false qdrant{hype,only} (X-Internal-Key); a hit counts only if _layerRanks.qhype != null, ordered by that rank.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadQuestions } from './questions/registry.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TRAD_RELIGION = { bahai: ["Baha'i", 'Bahai', 'Baha’i'], islam: ['Islam'], christianity: ['Christian', 'Christianity'], judaism: ['Judaism', 'Jewish'], buddhism: ['Buddhist', 'Buddhism'],
  hinduism: ['Hindu', 'Hinduism'], zoroastrianism: ['Zoroastrian', 'Zoroastrianism'], taoism: ['Tao', 'Taoism', 'Taoist', 'Daoism'], confucianism: ['Confucian', 'Confucianism'], sikhism: ['Sikh', 'Sikhism'], jainism: ['Jain', 'Jainism'] };
export const fold = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’'`ʼʻ‘]/g, '').toLowerCase();
export const religionMatches = (religion, trad) => { const r = fold(religion); return !!r && (TRAD_RELIGION[trad] || []).some((x) => fold(x) === r); };
const PCT = (a, b) => b ? `${Math.round(1000 * a / b) / 10}%` : '-';
export const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
// hit -> {docId,text,religion}; hype layer keeps only hits the HyPE layer ranked, in that order
export const normHits = (raw, layer) => {
  let h = (raw || []).map((x) => ({ docId: x.documentId ?? x.document_id ?? x.doc_id, text: x.text || '', religion: x.religion, hype: x._layerRanks?.qhype ?? null }));
  if (layer === 'hype') h = h.filter((x) => x.hype != null).sort((a, b) => a.hype - b.hype);
  return h;
};
// pure scorer. returns {pass, rank, sides, kind}
export const scoreQuestion = (q, hits, { topK = 10 } = {}) => {
  const top = (hits || []).slice(0, topK), x = q.expect || {};
  if (x.docs?.length) {
    const ids = x.docs.map(Number), i = top.findIndex((h) => ids.includes(Number(h.docId))), max = x.max_rank ?? 10;
    return { kind: 'docs', rank: i < 0 ? null : i + 1, pass: i >= 0 && i + 1 <= max, sides: null };
  }
  if (x.text_contains?.length) {
    const needles = x.text_contains.map(fold), i = top.findIndex((h) => needles.some((n) => fold(h.text).includes(n)));
    return { kind: 'text', rank: i < 0 ? null : i + 1, pass: i >= 0, sides: null };
  }
  const trads = q.traditions || [];
  const first = (t) => { const i = top.findIndex((h) => religionMatches(h.religion, t)); return i < 0 ? null : i + 1; };
  if (q.scope === 'cross' && trads.length) {
    const sides = Object.fromEntries(trads.map((t) => [t, first(t)]));
    const ranks = Object.values(sides).filter((r) => r != null);
    return { kind: 'cross', rank: ranks.length ? Math.min(...ranks) : null, pass: ranks.length === trads.length, sides };
  }
  if (trads.length) { const ranks = trads.map(first).filter((r) => r != null); return { kind: 'tradition', rank: ranks.length ? Math.min(...ranks) : null, pass: ranks.length > 0, sides: null }; }
  // universal, no expectation: any result at all
  return { kind: 'any', rank: top.length ? 1 : null, pass: top.length > 0, sides: null };
};
// deterministic stratified sample by origin|family, round-robin across strata
export const rng = (seed) => { let a = (Number(seed) || 1) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stratifiedSample = (qs, n, seed = 1) => {
  if (!n || n >= qs.length) return qs;
  const r = rng(seed), strata = new Map();
  for (const q of qs) { const k = `${q.origin}|${q.family ?? ''}`; (strata.get(k) || strata.set(k, []).get(k)).push(q); }
  const shuf = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const lists = shuf([...strata.keys()].sort()).map((k) => shuf(strata.get(k))), out = [];
  for (let i = 0; out.length < n && lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length && out.length < n) out.push(l[i]);
  return out;
};
export const expandWordings = (qs) => qs.flatMap((q) => [q, ...(q.wordings || []).filter((w) => w.text).map((w) => ({ ...q, id: `${q.id}#${w.id ?? w.style ?? 'w'}`, text: w.text, wordings: [], parent: q.id }))]);
// markdown + aggregates from result rows
export const summarize = (rows) => {
  const by = (keyf) => { const m = {}; for (const r of rows) for (const k of [].concat(keyf(r))) { const c = (m[k] ||= { n: 0, pass: 0 }); c.n++; if (r.pass) c.pass++; } return m; };
  const ms = rows.map((r) => r.ms).filter((v) => v != null);
  const cross = rows.filter((r) => r.sides), side = {};
  for (const r of cross) for (const [t, rk] of Object.entries(r.sides)) { const c = (side[t] ||= { n: 0, pass: 0 }); c.n++; if (rk != null) c.pass++; }
  return { total: rows.length, pass: rows.filter((r) => r.pass).length, errors: rows.filter((r) => r.error).length, p50: pct(ms, 0.5), p95: pct(ms, 0.95),
    byFamily: by((r) => r.family ?? '(none)'), byTradition: by((r) => r.traditions.length ? r.traditions : ['(universal)']), byOrigin: by((r) => r.origin),
    byFamilyTradition: by((r) => (r.traditions.length ? r.traditions : ['(universal)']).map((t) => `${r.family ?? '(none)'} x ${t}`)),
    crossTotal: cross.length, crossAll: cross.filter((r) => r.pass).length, crossSides: side };
};
export const toMarkdown = (meta, s) => {
  const tbl = (o, lim) => Object.entries(o).sort((a, b) => b[1].n - a[1].n).slice(0, lim || 999).map(([k, c]) => `| ${k} | ${c.pass}/${c.n} | ${PCT(c.pass, c.n)} |`).join('\n');
  const H = '| key | pass | rate |\n|---|---|---|\n';
  return `# Run ${meta.layer} ${meta.date} ${meta.tag}\nargs: ${meta.args}\n\n**${s.pass}/${s.total} pass (${PCT(s.pass, s.total)})** · errors ${s.errors} · p50 ${s.p50} ms · p95 ${s.p95} ms\n\n## By origin\n${H}${tbl(s.byOrigin)}\n\n## By tradition\n${H}${tbl(s.byTradition)}\n\n## By family x tradition (top 40 by volume)\n${H}${tbl(s.byFamilyTradition, 40)}\n\n## Cross-tradition coverage\nall sides present: ${s.crossAll}/${s.crossTotal} (${PCT(s.crossAll, s.crossTotal)})\n\n${H}${tbl(s.crossSides)}\n`;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const dotenv = (await import('dotenv')).default, ROOT = path.join(HERE, '..', '..');
  dotenv.config({ path: path.join(ROOT, '.env-secrets'), quiet: true }); dotenv.config({ path: path.join(ROOT, '.env-public'), quiet: true });
  const argv = process.argv.slice(2), arg = (k) => { const i = argv.indexOf(`--${k}`); return i < 0 ? null : argv[i + 1]; };
  const layer = arg('layer'); if (!['search', 'hype'].includes(layer)) { console.error('--layer search|hype required'); process.exit(2); }
  const API = arg('api') || process.env.PUBLIC_API_URL || 'https://api.siftersearch.com', tag = arg('tag') || 'run', conc = Number(arg('concurrency') || 4), seed = Number(arg('seed') || 1);
  const KEY = process.env.PUBLIC_SIFTER_API_KEY, IK = process.env.DEPLOY_SECRET || process.env.INTERNAL_API_KEY;
  if (layer === 'search' ? !KEY : !IK) { console.error(layer === 'search' ? 'needs PUBLIC_SIFTER_API_KEY' : 'needs DEPLOY_SECRET'); process.exit(2); }
  let qs = loadQuestions({ origin: arg('origin') || undefined, family: arg('family') || undefined, tradition: arg('tradition') || undefined, scope: arg('scope') || undefined, layer });
  qs = stratifiedSample(qs, Number(arg('sample') || 0), seed);
  if (argv.includes('--wordings')) qs = expandWordings(qs);
  const call = async (q) => {
    const filters = q.expect?.extra?.religion_filter ? { religion: q.expect.extra.religion_filter } : {};
    const [url, headers, body] = layer === 'search'
      ? [`${API}/api/v1/search`, { 'X-API-Key': KEY }, { query: q.text, limit: 10, filters }]
      : [`${API}/api/search/multi`, { 'X-Internal-Key': IK }, { query: q.text, limit: 30, filters, plan: false, qdrant: { hype: true, only: true } }];
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sifter-Test': '1', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    return j.results || j.hits || [];
  };
  const rows = new Array(qs.length); let next = 0;
  const worker = async () => { for (let i; (i = next++) < qs.length;) {
    const q = qs[i], t0 = Date.now(); let hits = [], error = null;
    for (let a = 0; a < 3; a++) { try { hits = normHits(await call(q), layer); error = null; break; } catch (e) { error = e.message; await sleep(2000 * (a + 1)); } }
    const sc = error ? { pass: false, rank: null, sides: null, kind: 'error' } : scoreQuestion(q, hits);
    rows[i] = { id: q.id, parent: q.parent, text: q.text, family: q.family, origin: q.origin, traditions: q.traditions || [], scope: q.scope, ...sc, ms: Date.now() - t0, error };
  } };
  await Promise.all(Array.from({ length: Math.max(1, conc) }, worker));
  const date = new Date().toISOString().slice(0, 10), s = summarize(rows), args = argv.join(' ');
  const base = path.join(HERE, 'reports', `run-${layer}-${date}-${tag}`); fs.mkdirSync(path.dirname(base), { recursive: true });
  fs.writeFileSync(`${base}.json`, JSON.stringify({ layer, date, tag, args, summary: s, rows }, null, 1));
  fs.writeFileSync(`${base}.md`, toMarkdown({ layer, date, tag, args }, s));
  fs.appendFileSync(path.join(HERE, 'reports', 'run-history.jsonl'), JSON.stringify({ at: new Date().toISOString(), layer, tag, args, total: s.total, pass: s.pass, rate: s.total ? s.pass / s.total : 0, errors: s.errors, p50: s.p50, p95: s.p95, cross: `${s.crossAll}/${s.crossTotal}` }) + '\n');
  console.log(`${layer} ${tag}: ${s.pass}/${s.total} (${PCT(s.pass, s.total)}) errors ${s.errors} p50 ${s.p50}ms p95 ${s.p95}ms cross ${s.crossAll}/${s.crossTotal}\n-> ${base}.json`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
