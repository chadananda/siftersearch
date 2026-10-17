// refs-assign ops job: number one work's paragraphs by its traditional scheme (api/lib/refs/schemes.js) — Chad 10-17.
// A scheme that does not reproduce the work's known totals writes NOTHING and reports why. Only changed rows are written;
// the ledger's 'refs' layer is re-measured after. params { doc, scheme, dry? }.
import { SCHEMES } from '../refs/schemes.js';
import { refParagraphs, setPn } from '../repos/refs-repo.js';
import { measureDoc, saveCoverage } from '../repos/coverage-repo.js';
import { hypeVersion } from './coverage-job.js';

export async function refsAssignJob({ doc, scheme, dry = false } = {}, { read = refParagraphs, write = setPn, remeasure = true } = {}) {
  const fn = SCHEMES[scheme];
  if (!doc || !fn) throw new Error(`refs-assign needs { doc, scheme } — schemes: ${Object.keys(SCHEMES).join(', ')}`);
  const paras = await read(doc);
  const { pn, counts, issues } = fn(paras);
  const changes = paras.map((p, i) => ({ id: p.id, pn: pn[i], was: p.pn ?? null })).filter((c) => c.pn !== c.was);
  const result = { doc, scheme, paragraphs: paras.length, numbered: pn.filter(Boolean).length, counts, issues, changes: changes.length,
    sample: changes.slice(0, 5) };
  if (issues.length || dry) return { ...result, written: 0 };
  await write(changes.map(({ id, pn: v }) => ({ id, pn: v })));
  if (remeasure) { const rows = await measureDoc(doc, { hypeVersion: await hypeVersion() }); if (rows.length) await saveCoverage(doc, rows); }
  return { ...result, written: changes.length };
}
