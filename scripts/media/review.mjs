#!/usr/bin/env node
// Pilot review of the media archive (reads the item folders only — never the database): per item the enhancement choice,
// ASR timings, corrections, and every quotation / cross-reference with its source, for reading by hand.
//   node scripts/media/review.mjs [--root /tank/media/library] [--slug s] [--quotes] [--corrections] [--json]
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(k);
const root = arg('--root', process.env.MEDIA_ARCHIVE_ROOT || '/tank/media/library');
const only = arg('--slug');
const read = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const dirs = [];
for (const t of readdirSync(root)) for (const c of readdirSync(join(root, t))) for (const s of readdirSync(join(root, t, c))) {
  if (existsSync(join(root, t, c, s, 'meta.json')) && (!only || s === only)) dirs.push(join(root, t, c, s));
}
const rows = [];
for (const dir of dirs) {
  const m = read(join(dir, 'meta.json')), q = read(join(dir, 'quotes.json')) || {}, w = read(join(dir, 'transcript.work.json')) || {};
  const row = { slug: m.slug, title: m.title, speaker: m.speaker, minutes: Math.round((m.duration_s || 0) / 60), stages: Object.keys(m.stages || {}).length,
    asr_input: m.enhancement?.asr_input, listening: m.enhancement?.listening, probes: Object.fromEntries((m.enhancement?.variants || []).map((v) => [v.name, v.avg_logprob])),
    snr: Object.fromEntries((m.enhancement?.variants || []).map((v) => [v.name, v.snr_db])), asr: m.asr && { host: m.asr.host, rtf: m.asr.rtf, timings: m.asr.timings, speakers: m.asr.speakers, mode: m.asr.mode, lang: m.asr.language },
    stage_s: Object.fromEntries(Object.entries(m.stages || {}).map(([k, v]) => [k, Math.round(v.ms / 1000)])), cost: m.cost,
    corrections: (w.corrections || []).length, refused: (w.refused || []).length,
    quote_candidates: q.candidates?.quotes?.length || 0, quotes: q.quotes?.length || 0, teaching_candidates: q.candidates?.teachings?.length || 0, crs: q.teachings?.length || 0,
    quote_rejects: Object.entries((q.quotes_rejected || []).reduce((a, r) => ({ ...a, [r.why]: (a[r.why] || 0) + 1 }), {})),
    cr_rejects: Object.entries((q.teachings_rejected || []).reduce((a, r) => ({ ...a, [r.why]: (a[r.why] || 0) + 1 }), {})) };
  rows.push(row);
  if (flag('--json')) continue;
  console.log(`\n== ${row.slug} (${row.minutes} min) ${row.speaker || ''} — stages ${row.stages}/11 · $${(m.cost?.usd || 0).toFixed(4)}`);
  console.log(`   enhancement: asr ${row.asr_input} · listening ${row.listening} · logprob ${JSON.stringify(row.probes)} · snr ${JSON.stringify(row.snr)}`);
  if (row.asr) console.log(`   asr: ${JSON.stringify(row.asr)}`);
  console.log(`   stage seconds: ${JSON.stringify(row.stage_s)}`);
  console.log(`   corrections ${row.corrections} (refused ${row.refused}) · quotes ${row.quotes}/${row.quote_candidates} · CRs ${row.crs}/${row.teaching_candidates}`);
  console.log(`   quote rejects ${JSON.stringify(row.quote_rejects)} · CR rejects ${JSON.stringify(row.cr_rejects)}`);
  if (flag('--corrections')) for (const c of w.corrections || []) console.log(`   ✎ [${c.p}] ${c.from} → ${c.to} (${c.method})`);
  if (flag('--quotes')) {
    for (const x of q.quotes || []) console.log(`   ❝ [${x.para}] "${x.said.slice(0, 140)}"\n       → ${x.cite} · ov ${x.overlap} ${x.gate}/${x.basis} · ${x.url}\n       src: "${String(x.excerpt || '').slice(0, 160)}"`);
    for (const x of q.teachings || []) console.log(`   ⇢ [${x.para}] ${x.writer}: ${x.claim}\n       → ${x.cite} (${x.confidence}) "${String(x.excerpt).slice(0, 200)}"`);
  }
}
if (flag('--json')) console.log(JSON.stringify(rows, null, 1));
