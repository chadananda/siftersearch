// Backfill every published talk's web audio (both copies) into R2 via the Worker's idempotent POST /_media/warm — one file at a
// time, newest first, ogg pass then m4a pass, a pause between calls. Resumable (present objects are skipped by the Worker).
// Run on tower under the cap: scripts/ops/in-slice.sh scripts/media/backfill-r2.mjs [--fmt ogg|m4a] [--limit N] [--pause ms]
// An API client only (GET /api/media/index): no DB access. Progress → tmp/backfill-r2.log
import { appendFileSync, mkdirSync } from 'fs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const fmts = arg('--fmt') ? [arg('--fmt')] : ['ogg', 'm4a'], limit = Number(arg('--limit', 0)) || Infinity, pause = Number(arg('--pause', 1500));
const SITE = process.env.SITE || 'https://siftersearch.com';
mkdirSync('tmp', { recursive: true });
const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); appendFileSync('tmp/backfill-r2.log', l + '\n'); };
const idx = await (await fetch(`${SITE}/api/media/index`)).json();
const talks = idx.items.filter((t) => t.pb === 'full' && t.v).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
log(`backfill: ${talks.length} full-playback talks (${Math.round(idx.hours)} h), formats ${fmts.join('+')}`);
let filled = 0, present = 0, failed = 0, bytes = 0;
for (const fmt of fmts) {
  let n = 0;
  for (const t of talks) {
    if (n++ >= limit) break;
    try {
      const r = await fetch(`${SITE}/_media/warm?slug=${t.s}&v=${t.v}&fmt=${fmt}&copy=both`, { method: 'POST', signal: AbortSignal.timeout(900_000) });
      const j = await r.json();
      for (const [name, st] of Object.entries(j.files || {})) { if (st === 'filled') filled++; else if (st === 'present') present++; else if (st === 'failed' && !/original/.test(name)) failed++; }
      log(`${fmt} ${t.s}: ${JSON.stringify(j.files)}`);
    } catch (e) { failed++; log(`${fmt} ${t.s}: ERROR ${e.message}`); }
    await new Promise((res) => setTimeout(res, pause));
  }
}
log(`done: filled ${filled}, present ${present}, failed ${failed}`);
