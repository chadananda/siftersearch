#!/usr/bin/env node
// SourceHunt battery: the cross-lingual fixtures (CTAI-verified English ↔ original pairs) through live
// /api/search/source-hunt. Per case: WRITER right? BOOK right? TABLET: a linked original that holds the target text
// (certain-right), a linked one that does NOT (certain-WRONG — the worst outcome: confident and false), or the target
// among the unlinked candidates. Judged by text (letter-normalised n-grams, as score-crosslingual-api.mjs), never by ids.
//   node tests/quality/score-sourcehunt.mjs [--limit=150] [--kinds=passage,sentence] [--out=file.json]
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { correct } from './score-crosslingual-api.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const BASE = process.env.SOURCEHUNT_BASE || 'https://siftersearch.com';

// titles are matched accent-folded ("Íqán" failed /iq[aá]n/ — the first run scored the Íqán 0% while every answer was right)
const fold = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
// the published book each fixture work is found in (an excerpt also counts in Gleanings, which collects them)
const BOOK = {
  'gleanings': /gleanings/i, 'kitab-i-iqan': /iqan|gleanings/i, 'epistle-to-the-son-of-the-wolf': /epistle to the son of the wolf|gleanings/i,
  'prayers-and-meditations': /prayers and meditations/i, 'the-hidden-words': /hidden words/i, 'will-and-testament': /will and testament/i,
  'fire-tablet': /fire tablet|prayers/i, 'tablet-of-the-holy-mariner': /holy mariner|prayers/i, 'kitab-i-ahd': /tablets of bah|ahd/i,
  'tablet-of-ahmad': /ahmad|prayers/i, 'tablet-of-carmel': /carmel|tablets of bah|gleanings/i, 'suriy-i-haykal': /summons|haykal/i,
};
// the original TABLET by title — so a right tablet with a wrong paragraph is told apart from a wrong tablet
const TABLET = {
  'kitab-i-iqan': /iqan|certitude/, 'epistle-to-the-son-of-the-wolf': /ibn-i-dhi|son of the wolf/, 'prayers-and-meditations': /munajat|athar/,
  'the-hidden-words': /hidden words|kalimat|maknun/, 'will-and-testament': /will and testament|alvah|vasaya/, 'fire-tablet': /fire|qad-ihtaraqa/,
  'tablet-of-the-holy-mariner': /mariner|mallah/, 'kitab-i-ahd': /ahd|covenant/, 'tablet-of-ahmad': /ahmad/, 'tablet-of-carmel': /carmel/,
  'suriy-i-haykal': /haykal|temple/,
};
const WRITER = (c) => (/will-and-testament/.test(c.work) ? '‘Abdu’l-Bahá' : /the Báb/.test(c.work) ? 'The Báb' : 'Bahá’u’lláh');

let cases = JSON.parse(readFileSync(join(__dirname, 'crosslingual-fixtures.json'), 'utf8')).cases;
if (arg('kinds')) cases = cases.filter((c) => arg('kinds').split(',').includes(c.kind));
if (arg('limit')) { const n = Number(arg('limit')), step = cases.length / n; cases = Array.from({ length: Math.min(n, cases.length) }, (_, i) => cases[Math.floor(i * step)]); }

async function one(c) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/api/search/source-hunt`, { method: 'POST', signal: AbortSignal.timeout(90000),
      headers: { 'Content-Type': 'application/json', Origin: 'https://siftersearch.com' }, body: JSON.stringify({ quote: c.query }) });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) return { id: c.id, kind: c.kind, work: c.work, error: `${res.status} ${r.message || ''}`.slice(0, 120) };
    const t = r.tablet || {};
    const book = BOOK[c.work] ? BOOK[c.work].test(fold(r.origin?.title)) : null;
    const tabTitle = fold(t.meta?.title || t.title);
    const tablet = t.certain ? (correct(t.text || '', c.target) ? 'certain-right'
      : TABLET[c.work]?.test(tabTitle) ? 'tablet-right-para-wrong' : 'certain-WRONG')
      : (t.candidates || []).some((x) => correct(x.text || '', c.target)) ? 'candidate-right' : (t.candidates || []).length ? 'candidates-wrong' : 'none';
    return { id: c.id, kind: c.kind, work: c.work, ms: Date.now() - t0, writer: r.quoteAuthor === WRITER(c), book, tablet,
      got: { writer: r.quoteAuthor, book: r.origin?.title || null, tablet: t.meta?.title || t.title || null } };
  } catch (e) { return { id: c.id, kind: c.kind, work: c.work, error: e.message.slice(0, 120) }; }
}
const rows = [];
for (let i = 0; i < cases.length; i += 3) rows.push(...await Promise.all(cases.slice(i, i + 3).map(one)));

const agg = (rs) => {
  const ok = rs.filter((r) => !r.error), n = ok.length || 1, pct = (k) => +(ok.filter(k).length / n).toFixed(3);
  return { n: ok.length, errors: rs.length - ok.length, writer: pct((r) => r.writer), book: pct((r) => r.book),
    tablet_certain_right: pct((r) => r.tablet === 'certain-right'), tablet_right_para_wrong: pct((r) => r.tablet === 'tablet-right-para-wrong'),
    tablet_certain_WRONG: pct((r) => r.tablet === 'certain-WRONG'),
    tablet_candidate_right: pct((r) => r.tablet === 'candidate-right'), tablet_found_any: pct((r) => /right/.test(r.tablet)),
    p50ms: ok.map((r) => r.ms).sort((a, b) => a - b)[ok.length >> 1] };
};
const groups = { ALL: agg(rows) };
for (const k of [...new Set(rows.map((r) => r.kind))].sort()) groups[`kind:${k}`] = agg(rows.filter((r) => r.kind === k));
for (const w of [...new Set(rows.map((r) => r.work))].filter((w) => BOOK[w]).sort()) groups[w] = agg(rows.filter((r) => r.work === w));
for (const [g, v] of Object.entries(groups)) console.log(g.padEnd(32), JSON.stringify(v));
if (arg('out')) writeFileSync(arg('out'), JSON.stringify({ at: new Date().toISOString(), groups, rows }, null, 1));
