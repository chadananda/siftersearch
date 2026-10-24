// Overnight remaster backfill status → tmp/remaster-backfill-state.md (read by the main thread's watchdog). Reads tower's two
// state files over ssh (data/run/cloud-remaster.json + remaster-results.jsonl) — no DB. --every <s> keeps refreshing for --hours.
import { execFileSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const every = Number(arg('every', 0)), hours = Number(arg('hours', 12));

function pull() {
  const out = execFileSync('ssh', ['chad@tower-nas', 'cd ~/sifter/siftersearch/data/run; cat cloud-remaster.json 2>/dev/null || echo {}; echo "@@@"; cat remaster-results.jsonl 2>/dev/null; echo "@@@"; cat ~/sifter/siftersearch/data/run/home-remaster.json 2>/dev/null || echo {}'], { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'ignore'] });
  const [st, res, home] = out.split('@@@\n');
  return { st: JSON.parse(st || '{}'), results: res.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean), home: JSON.parse(home || '{}') };
}

export function render({ st, results, home }, now = Date.now()) {
  const last = new Map(); for (const r of results) last.set(r.id, r);   // latest outcome per talk
  const items = st.items || {};
  const byGrade = {};
  for (const [id, x] of Object.entries(items)) {
    const g = (byGrade[x.grade || '?'] ||= { total: 0, published: 0, review: 0, hours: 0 });
    g.total++; g.hours += (x.duration_s || 0) / 3600;
    const r = last.get(Number(id));
    if (r?.status === 'done' && r.listening === 'unipase') g.published++; else if (r?.status === 'review') g.review++;
  }
  const pub = [...last.values()].filter((r) => r.status === 'done' && r.listening === 'unipase');
  const review = [...last.values()].filter((r) => r.status === 'review');
  const hourAgo = new Date(now - 3600_000).toISOString();
  const rate = results.filter((r) => r.at >= hourAgo).length;
  const total = Object.keys(items).length, remaining = total - pub.length - review.length;
  const sw = pub.map((r) => r.fallback_sent_pct ?? r.swapped_pct).filter((v) => v != null).sort((a, b) => a - b);
  const med = sw.length ? sw[Math.floor(sw.length / 2)] : null;
  const pods = Object.values(st.pods || {});
  const L = [];
  L.push('# Remaster Backfill State', `last_update: ${new Date(now).toISOString()}`,
    `status: ${st.finished ? 'FINISHED' : st.started ? 'IN_PROGRESS' : 'NOT_STARTED'}${st.stop ? ` (stopped: ${st.stop})` : ''}`,
    `published_remastered: ${pub.length} / ${total}   review (kept original): ${review.length}   remaining: ${remaining}`,
    `cloud: done ${st.done?.length || 0}, failed ${st.failed?.length || 0}, queue ${st.queue?.length || 0}, in flight ${Object.keys(st.jobs || {}).length}`,
    `spent_usd: ${st.spent_usd ?? 0} of cap 60 (balance floor 90)`,
    `rate: ${rate} talks finished in the last hour   eta: ${rate ? `${Math.round((remaining / rate) * 10) / 10} h` : 'n/a'}`,
    `fallback (% of sentences kept from the original, published talks): median ${med ?? 'n/a'} %, max ${sw.at(-1) ?? 'n/a'} %`,
    `unguardable (chant / prayer, UniPASE kept): ${Math.round([...last.values()].reduce((a, r) => a + (r.unguardable_s || 0), 0) / 60)} min over ${[...last.values()].filter((r) => r.unguardable_s > 0).length} talks`,
    `home hosts: ${home.done ? `${home.done} done` : 'idle'}`, '', '## By grade', '| grade | published | review | total | hours |', '|---|---|---|---|---|');
  for (const g of ['E', 'D', 'C', 'B', '?']) if (byGrade[g]) L.push(`| ${g} | ${byGrade[g].published} | ${byGrade[g].review} | ${byGrade[g].total} | ${Math.round(byGrade[g].hours * 10) / 10} |`);
  const high = [...last.values()].filter((r) => (r.fallback_sent_pct ?? 0) > 40);
  L.push('', `## High fallback (> 40 % of sentences; original kept — Chad listens) — ${high.length}`);
  for (const r of high) L.push(`- ${r.grade} ${r.slug}: ${r.fallback_sent_pct} % of sentences — https://siftersearch.com/media/${r.slug}`);
  L.push('', '## Pods');
  for (const p of pods) L.push(`- ${p.name} ${p.gpu || ''} $${p.costPerHr ?? '?'}/h ${p.terminated ? `terminated (${p.why})` : p.status}${p.last_error ? ` — ${p.last_error}` : ''}`);
  L.push('', '## Failures / review');
  for (const f of (st.failed || []).slice(-15)) L.push(`- cloud fail ${f.slug || f.id}: ${String(f.error || '').replace(/\s+/g, ' ').slice(-160)}`);
  for (const r of review.filter((x) => !((x.fallback_sent_pct ?? 0) > 40)).slice(-15)) L.push(`- review ${r.slug}: ${r.why || `swapped ${r.swapped_pct}%`}`);
  if (st.last_error) L.push(`- last pod error: ${st.last_error}`);
  return L.join('\n') + '\n';
}

function once() {
  try {
    const md = render(pull());
    mkdirSync(join(ROOT, 'tmp'), { recursive: true });
    writeFileSync(join(ROOT, 'tmp', 'remaster-backfill-state.md'), md);
    console.log(md.split('\n').slice(0, 8).join('\n'));
  } catch (err) { console.error('status failed:', err.message); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  once();
  if (every > 0) { const t = setInterval(once, every * 1000); setTimeout(() => clearInterval(t), hours * 3600_000); }
}
