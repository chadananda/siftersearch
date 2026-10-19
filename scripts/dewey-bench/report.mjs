// Dewey benchmark — the report: per scenario, how many cases got an acceptable verdict, the SOFT failures (a person
// asked needlessly) and the HARD ones (a new work called held = a book lost; a held work called not-held = a duplicate).
// usage: node scripts/dewey-bench/report.mjs [--md out.md]
import { readFile, writeFile } from 'fs/promises';

const OUT = 'tmp/dewey-bench';
const rows = (await readFile(`${OUT}/results.jsonl`, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
const grade = (r) => {
  if (r.error && !r.verdict) return 'error';
  if (r.expect.includes(r.verdict)) return 'pass';
  // P10 (held book + new chapters) called held: the new chapters would be skipped — lost material, like a new work
  const newWork = /^(G|N|P10)/.test(r.id), heldWork = /^P(?!10)/.test(r.id);
  if (newWork && (r.verdict === 'held' || (r.verdict === 'partly-held' && !/^P10/.test(r.id)))) return 'HARD';   // a book we lack would be skipped
  if (heldWork && ['not-held', 'not-found-by-title'].includes(r.verdict)) return 'HARD';   // a duplicate would be offered
  return 'soft';   // possible / undetermined where a firm answer was due — a person's look
};
const by = {};
for (const r of rows) { const k = r.scenario; (by[k] ||= { n: 0, pass: 0, soft: 0, HARD: 0, error: 0, cases: [] }); const g = grade(r); by[k].n++; by[k][g]++; if (g !== 'pass') by[k].cases.push({ ...r, grade: g }); }
const lines = ['| scenario | cases | pass | soft | HARD | error |', '|---|---|---|---|---|---|'];
for (const [k, v] of Object.entries(by).sort()) lines.push(`| ${k} | ${v.n} | ${v.pass} | ${v.soft} | ${v.HARD} | ${v.error} |`);
const tot = rows.map(grade);
lines.push(`| **all** | ${rows.length} | ${tot.filter((g) => g === 'pass').length} | ${tot.filter((g) => g === 'soft').length} | ${tot.filter((g) => g === 'HARD').length} | ${tot.filter((g) => g === 'error').length} |`);
const fails = Object.values(by).flatMap((v) => v.cases);
const detail = fails.map((r) => `- **${r.grade}** \`${r.id}\` (${r.scenario}): got **${r.verdict ?? r.error}**, expected ${r.expect.join('/')}` +
  `${r.compared?.sample ? ` · read ${r.compared.sample.pages.length}/${r.compared.sample.of} pages (${r.compared.sample.engine})` : ''} · ${r.compared?.words ?? '?'} words` +
  `${r.top?.length ? ` · top: ${r.top.map((t) => `#${t.id} ${String(t.title).slice(0, 40)} [${t.relation} ${t.ours_in_theirs ?? ''}/${t.theirs_in_ours ?? ''}]`).join('; ')}` : ' · no candidates'}`);
const md = `# Dewey benchmark results\n\n${lines.join('\n')}\n\n## Failures\n\n${detail.join('\n') || 'none'}\n`;
console.log(md);
const at = process.argv.indexOf('--md');
if (at > 0) await writeFile(process.argv[at + 1], md);
