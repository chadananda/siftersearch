// Faithfulness audit (Chad 10-22, "(Vol II)"): every processed item's edited layers against the ASR's own words — which
// stage added content the speaker never said. Reads the archive FILES only (no database). Run on tower:
//   node scripts/media/audit-insertions.mjs [/tank/media/library] [--json out.json]
import { readFile, writeFile } from 'fs/promises';
import { glob } from 'fs/promises';
import { flattenWords } from '../../api/lib/media/paragraphs.js';
import { regions } from '../../api/lib/media/faithfulness.js';

const root = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tank/media/library';
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const read = async (p) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } };

const totals = { items: 0, correct: 0, clean: 0, items_affected: 0 }, rows = [];
for await (const f of glob(`${root}/*/*/*/transcript.work.json`)) {
  const dir = f.replace('/transcript.work.json', '');
  const [raw, work] = await Promise.all([read(`${dir}/transcript.raw.json`), read(f)]);
  if (!raw?.segments || !work?.paragraphs) continue;
  totals.items++;
  const heard = flattenWords(raw.segments);
  const verbatim = work.verbatim || work.paragraphs;                 // after the name pass, before the copy-edit
  const byName = regions(heard, verbatim).filter((g) => g.insertion);
  const atName = new Set(byName.map((g) => g.r0));
  const byClean = work.verbatim ? regions(heard, work.paragraphs).filter((g) => g.insertion && !atName.has(g.r0)) : [];
  const md = await readFile(`${dir}/transcript.md`, 'utf8').catch(() => '');
  if (byName.length || byClean.length) totals.items_affected++;
  totals.correct += byName.length; totals.clean += byClean.length;
  if (byName.length || byClean.length) rows.push({ slug: dir.split('/').pop(), correct: byName.map((g) => ({ t: heard[g.r0].s, heard: g.heard, now: g.now })),
    clean: byClean.map((g) => ({ t: heard[g.r0].s, heard: g.heard, now: g.now })), in_md: [...byName, ...byClean].filter((g) => md.includes(g.now)).length });
}
console.log(JSON.stringify(totals));
for (const r of rows) for (const k of ['correct', 'clean']) for (const x of r[k]) console.log(`${r.slug}\t${k}\t${Math.floor(x.t / 60)}:${String(Math.floor(x.t % 60)).padStart(2, '0')}\t"${x.heard}" → "${x.now}"`);
if (jsonOut) await writeFile(jsonOut, JSON.stringify({ totals, rows }, null, 1));
