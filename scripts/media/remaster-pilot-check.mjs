// Automated checks on remastered talks (Chad 10-23 pilot): per talk — remaster status, fallback %, realign residual ≤ 2 %,
// the public talk API says remastered with both URLs, both copies download and decode (ffprobe), durations agree.
// Reads tower's results log over ssh (no DB); the talks through https://siftersearch.com. → one line per talk + a verdict.
import { execFileSync } from 'child_process';
const BASE = process.env.SIFTER_SITE || 'https://siftersearch.com';
const n = Number(process.argv[2]) || 10;
const lines = execFileSync('ssh', ['-o', 'LogLevel=ERROR', 'chad@tower-nas', 'cat ~/sifter/siftersearch/data/run/remaster-results.jsonl 2>/dev/null'], { encoding: 'utf8' }).split('\n').filter(Boolean).map((l) => JSON.parse(l));
const last = new Map(); for (const r of lines) last.set(r.id, r);
const probe = (url) => { try { return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', url], { encoding: 'utf8', timeout: 120_000 }).trim()); } catch { return null; } };
let bad = 0;
for (const r of [...last.values()].slice(0, n)) {
  const issues = [];
  if (r.status !== 'done' || r.listening !== 'unipase') issues.push(`status ${r.status}/${r.listening}${r.why ? ` (${r.why})` : ''}`);
  if (r.unplaced_pct != null && r.unplaced_pct > 2) issues.push(`realign ${r.unplaced_pct}% unplaced`);
  let a = null;
  try { a = (await (await fetch(`${BASE}/api/media/${r.slug}`, { headers: { 'cache-control': 'no-cache' } })).json())?.audio; } catch (e) { issues.push(`api ${e.message}`); }
  let d1 = null, d0 = null;
  if (r.status === 'done') {
    if (!a?.remastered || !a.original_url) issues.push(`api remastered=${a?.remastered} original_url=${!!a?.original_url}`);
    if (a?.ogg) { d1 = probe(BASE + a.ogg); if (!d1) issues.push('main copy does not decode'); }
    if (a?.original_url) { d0 = probe(BASE + a.original_url); if (!d0) issues.push('original copy does not decode'); }
    if (d1 && d0 && Math.abs(d1 - d0) > 1.5) issues.push(`durations differ ${d1.toFixed(1)} vs ${d0.toFixed(1)} s`);
  }
  if (issues.length) bad++;
  console.log(`${issues.length ? 'FAIL' : 'ok  '} ${r.grade} ${r.slug}  swapped ${r.swapped_pct ?? '?'}%  unplaced ${r.unplaced_pct ?? '?'}%  ${d1 ? `${(d1 / 60).toFixed(1)} min` : ''}  ${issues.join('; ')}`);
}
console.log(`${last.size} talks with results; ${bad} with issues in the first ${Math.min(n, last.size)}`);
