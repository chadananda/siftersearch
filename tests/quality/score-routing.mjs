#!/usr/bin/env node
// ROUTING battery: does the planner choose the right search STRATEGY? Calls planSearch (one Jev classification, ~150 ms,
// no search) for: the hand-written edge cases in routing-fixtures.json, the type battery mapped by type → acceptable
// shapes, and the 516 quality queries (no shape labels: judged only on not narrowing to the WRONG tradition — a wrong
// filter hides the answer; leaving it open does not). Runs ON tower (Jev key, planner code).
//   node tests/quality/score-routing.mjs [--only=edge|types|quality] [--out=file.json]
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { planSearch } from '../../api/lib/search-plan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const R = JSON.parse(readFileSync(join(HERE, 'routing-fixtures.json'), 'utf8'));
const types = (() => { const t = JSON.parse(readFileSync(join(HERE, 'search-type-fixtures.json'), 'utf8')); return Array.isArray(t) ? t : Object.values(t).find(Array.isArray); })();
const quality = JSON.parse(readFileSync(join(HERE, 'ocean-fixtures.json'), 'utf8'));

// the quality battery names traditions loosely ("Islamic", "Hinduism"); the planner uses library religion labels
const TRAD = { islamic: 'Islam', islam: 'Islam', jewish: 'Judaism', judaism: 'Judaism', christian: 'Christian', christianity: 'Christian',
  buddhist: 'Buddhist', buddhism: 'Buddhist', hindu: 'Hindu', hinduism: 'Hindu', "baha'i": "Baha'i", bahai: "Baha'i", sikh: 'Sikh', sikhism: 'Sikh',
  jain: 'Jain', jainism: 'Jain', taoist: 'Tao', taoism: 'Tao', tao: 'Tao', zoroastrian: 'Zoroastrian', zoroastrianism: 'Zoroastrian',
  confucian: 'Confucian', confucianism: 'Confucian' };
const tradOf = (s) => (s ? TRAD[String(s).toLowerCase()] || s : null);

const cases = [];
if (!arg('only') || arg('only') === 'edge') for (const c of R.cases) cases.push({ ...c, set: 'edge' });
if (!arg('only') || arg('only') === 'types') for (const f of types) {
  const shapes = R.typeShapes[f.type]; if (!shapes) continue;
  cases.push({ id: f.id, set: 'types', type: f.type, query: f.query, shapes, ...(R.typeExpect[f.type] || {}) });
}
if (!arg('only') || arg('only') === 'quality') for (const f of quality) {
  if (f.religion_filter) continue;   // the caller already chose the tradition
  cases.push({ id: f.id, set: 'quality', type: f.category, query: f.query, allowTradition: tradOf(f.tradition) });
}

const rows = [];
for (let i = 0; i < cases.length; i += 8) {
  rows.push(...await Promise.all(cases.slice(i, i + 8).map(async (c) => {
    const p = await planSearch(c.query, { cache: false, timeoutMs: 3000 });
    const got = { shape: p.shape, tradition: p.filters?.religion || 'none', author: p.prefer?.author || 'none', comparative: !!p.comparative, error: p.error || null, backstop: !!(p.error || p.skipped) };
    const fails = [];
    if (c.shapes && !c.shapes.includes(got.shape)) fails.push(`shape ${got.shape} (want ${c.shapes.join('|')})`);
    if (c.tradition && got.tradition !== c.tradition && !(c.tradition !== 'none' && got.tradition === 'none')) fails.push(`tradition ${got.tradition} (want ${c.tradition})`);
    // missing a tradition the query names is recorded separately: it widens, it does not hide
    const missedTradition = c.tradition && c.tradition !== 'none' && got.tradition === 'none';
    if (c.author && got.author !== c.author) fails.push(`author ${got.author} (want ${c.author})`);
    if (c.comparative !== undefined && got.comparative !== c.comparative) fails.push(`comparative ${got.comparative} (want ${c.comparative})`);
    if (c.set === 'quality' && got.tradition !== 'none' && c.allowTradition && got.tradition !== c.allowTradition) fails.push(`WRONG tradition ${got.tradition} (query is ${c.allowTradition})`);
    return { ...c, got, ok: fails.length === 0, fails, missedTradition };
  })));
  process.stderr.write(`\r${rows.length}/${cases.length}`);
}

const pct = (a, b) => (b ? +(a / b).toFixed(3) : null);
const summary = { at: new Date().toISOString(), cases: rows.length, errors: rows.filter((r) => r.got.backstop).length };
for (const set of ['edge', 'types', 'quality']) {
  const s = rows.filter((r) => r.set === set); if (!s.length) continue;
  summary[set] = { n: s.length, ok: pct(s.filter((r) => r.ok).length, s.length), missedTradition: s.filter((r) => r.missedTradition).length };
}
// confusion matrix over labelled cases: wanted (first acceptable shape) → chosen
const conf = {};
for (const r of rows.filter((r) => r.shapes)) { const w = r.shapes.join('|'); (conf[w] ||= {}); conf[w][r.got.shape] = (conf[w][r.got.shape] || 0) + 1; }
summary.shapes = conf;
const byType = {};
for (const r of rows.filter((r) => r.set === 'types')) { const x = (byType[r.type] ||= { n: 0, ok: 0 }); x.n++; if (r.ok) x.ok++; }
summary.byType = byType;
console.log('\n' + JSON.stringify(summary, null, 1));
console.log('\nFailures:');
for (const r of rows.filter((r) => !r.ok)) console.log(` ${r.set.padEnd(7)} ${String(r.id).padEnd(32)} ${r.query.slice(0, 60).padEnd(60)} | ${r.fails.join('; ')}`);
if (arg('out')) writeFileSync(arg('out'), JSON.stringify({ summary, rows }, null, 1));
process.exit(0);
