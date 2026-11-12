// Ops job `premise-ingest` { file?, dry? }: a premise-reconcile result (default newest data/run/premise-reconcile-*.json) → premise_claims.
// keep|rescope|move stored (rescope = newPremise, move = movedTo concept); drop/skipped/unjudged excluded. Idempotent: every paragraph
// the file judged has its rows replaced. No LLM, no spend. Index them afterwards with ops job `premise-index`.
import fs from 'node:fs';
import path from 'node:path';

export const latestReconcile = (dir = path.join(process.cwd(), 'data', 'run')) => fs.readdirSync(dir).filter((n) => /^premise-reconcile-.*\.json$/.test(n)).sort().pop() || null;

export async function premiseIngestJob(params = {}, deps = {}) {
  const dir = path.join(process.cwd(), 'data', 'run');
  const name = params.file ? path.basename(params.file) : (deps.latest || latestReconcile)(dir);
  if (!name) return { status: 'error', error: 'no premise-reconcile result found in data/run' };
  const src = (deps.read || ((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))))(name);
  if (!Array.isArray(src?.entries)) return { status: 'error', error: `${name}: no reconcile entries (run premise-reconcile first)` };
  const repo = deps.repo || await import('../repos/premise-repo.js');
  const rows = repo.premiseRows(src.entries), paraIds = [...new Set(src.entries.map((e) => Number(e.paraId)).filter(Boolean))];
  const byVerdict = rows.reduce((m, r) => ({ ...m, [r.verdict]: (m[r.verdict] || 0) + 1 }), {});
  const plan = { file: name, entries: src.entries.length, rows: rows.length, byVerdict, paragraphs: paraIds.length, withQuestions: rows.filter((r) => r.questions.length).length, questions: rows.reduce((n, r) => n + r.questions.length, 0), docs: [...new Set(rows.map((r) => r.docId))] };
  if (params.dry || params.dryRun) return { dryRun: true, ...plan };
  const res = await repo.replacePremises(rows, paraIds, name);
  return { status: 'complete', ...plan, ...res };
}
