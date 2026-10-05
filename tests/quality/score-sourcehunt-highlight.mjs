#!/usr/bin/env node
// SourceHunt ORIGINAL-side highlight battery. The fixtures are CTAI-verified English ↔ original pairs: for a `passage` case the
// English query IS the whole pair, so the pair's original (target) is the gold span; for `sentence`/`phrase` cases the query is
// part of the pair, so the target is only the REGION the span must lie inside. Words of the tablet paragraph are gold when a
// letter-normalised 3-gram through them occurs in the target. Scores the live highlight (or a saved run: --from=file.json) and
// saves every case (tablet text + highlight) so other highlight methods can be scored on exactly the same passages.
//   node tests/quality/score-sourcehunt-highlight.mjs [--limit=150] [--out=file.json] [--from=file.json --method=key]
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { correct, toks } from './score-crosslingual-api.mjs';
import { segment } from '../../api/lib/phrases.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const BASE = process.env.SOURCEHUNT_BASE || 'https://siftersearch.com';

/** Words of `text` with offsets and their normalised form (same normalisation as the battery's `correct`). */
export function words(text = '') {
  return [...String(text).matchAll(/\S+/g)].map((m) => ({ start: m.index, end: m.index + m[0].length, w: toks(m[0]).join(' ') })).filter((x) => x.w);
}
/** Per word: inside the target (a 3-gram through it occurs in the target; 2-grams for very short targets). */
export function targetMask(text, target) {
  const ws = words(text), tt = toks(target), n = tt.length >= 6 ? 3 : 2;
  const set = new Set(Array.from({ length: Math.max(0, tt.length - n + 1) }, (_, i) => tt.slice(i, i + n).join(' ')));
  const mask = ws.map(() => false);
  for (let i = 0; i + n <= ws.length; i++) if (set.has(ws.slice(i, i + n).map((x) => x.w).join(' '))) for (let k = i; k < i + n; k++) mask[k] = true;
  return { ws, mask };
}
/** Score one highlight against the gold/region mask. */
// Precision is judged against the gold WIDENED TO WHOLE CLAUSES: the page marks clauses, and a fixture cut mid-clause ("In Him
// have I placed My trust; and into") is rightly shown as its whole clause. Recall stays on the exact gold words.
export function scoreCase({ text, target, kind, lang, highlight = [] }) {
  const { ws, mask } = targetMask(text, target);
  const units = segment(text, lang || 'ar');
  const unitOf = (x) => units.findIndex((u) => x.start < u.end && x.end > u.start);
  const goldUnits = new Set(ws.map((x, i) => (mask[i] ? unitOf(x) : -2)).filter((k) => k >= 0));
  const wide = ws.map((x, i) => mask[i] || goldUnits.has(unitOf(x)));
  const pred = ws.map((x) => highlight.some(([a, b]) => x.start < b && x.end > a));
  const tp = pred.filter((p, i) => p && wide[i]).length, np = pred.filter(Boolean).length, ng = mask.filter(Boolean).length;
  const hit = pred.filter((p, i) => p && mask[i]).length;
  const runs = pred.reduce((k, p, i) => k + (p && !pred[i - 1] ? 1 : 0), 0);
  const precision = np ? tp / np : 0, recall = ng ? hit / ng : 0;
  return { kind, words: ws.length, gold: ng, marked: np, runs, precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    // a passage case is GOOD when the mark covers ≥85% of the original and ≥85% of the mark is in it; a part-case when ≥85% of the mark lies inside the region
    good: np > 0 && (kind === 'passage' ? recall >= 0.85 && precision >= 0.85 : precision >= 0.85) };
}

export function summarise(rows) {
  const by = (rs) => {
    const n = rs.length || 1, avg = (k) => +(rs.reduce((s, r) => s + r[k], 0) / n).toFixed(3);
    return { n: rs.length, good: avg('good'), empty: +(rs.filter((r) => !r.marked).length / n).toFixed(3), precision: avg('precision'), recall: avg('recall'), f1: avg('f1'),
      multiRun: +(rs.filter((r) => r.runs > 1).length / n).toFixed(3) };
  };
  const out = { ALL: by(rows) };
  for (const k of [...new Set(rows.map((r) => r.kind))].sort()) out[k] = by(rows.filter((r) => r.kind === k));
  return out;
}

async function collect(c) {
  try {
    const res = await fetch(`${BASE}/api/search/source-hunt`, { method: 'POST', signal: AbortSignal.timeout(90000),
      headers: { 'Content-Type': 'application/json', Origin: 'https://siftersearch.com', Referer: 'https://siftersearch.com/sourcehunt' }, body: JSON.stringify({ quote: c.query }) });
    const r = await res.json().catch(() => ({}));
    const t = r.tablet || {};
    if (!res.ok || !t.certain || !correct(t.text || '', c.target)) return { id: c.id, skip: res.ok ? 'tablet not certain-right' : `${res.status}` };
    return { id: c.id, kind: c.kind, lang: c.lang, query: c.query, target: c.target, text: t.text, tabletId: t.id,
      english: r.origin ? { text: r.origin.text, highlight: r.origin.highlight } : null, methods: { live: { highlight: t.highlight || [], by: t.highlightBy || null } } };
  } catch (e) { return { id: c.id, skip: e.message.slice(0, 80) }; }
}

const MAIN = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (MAIN) {
  let data;
  if (arg('from')) data = JSON.parse(readFileSync(arg('from'), 'utf8'));
  else {
    let cases = JSON.parse(readFileSync(join(__dirname, 'crosslingual-fixtures.json'), 'utf8')).cases;
    if (arg('limit')) { const n = Number(arg('limit')), step = cases.length / n; cases = Array.from({ length: Math.min(n, cases.length) }, (_, i) => cases[Math.floor(i * step)]); }
    const got = [];
    for (let i = 0; i < cases.length; i += 3) got.push(...await Promise.all(cases.slice(i, i + 3).map(collect)));
    data = { at: new Date().toISOString(), cases: got.filter((x) => !x.skip), skipped: got.filter((x) => x.skip) };
    console.log(`collected ${data.cases.length} (skipped ${data.skipped.length}: tablet not found or wrong — not a highlight question)`);
  }
  const methods = arg('method') ? [arg('method')] : [...new Set(data.cases.flatMap((c) => Object.keys(c.methods)))];
  for (const m of methods) {
    const rows = data.cases.filter((c) => c.methods[m]).map((c) => scoreCase({ ...c, highlight: c.methods[m].highlight }));
    console.log(`\n== ${m}`); for (const [g, v] of Object.entries(summarise(rows))) console.log(g.padEnd(10), JSON.stringify(v));
  }
  if (arg('out')) writeFileSync(arg('out'), JSON.stringify(data, null, 1));
}
