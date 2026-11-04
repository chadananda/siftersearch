// behavior-proposal — a CODE improvement → its proposal file tests/behavior/proposed/<id>.json (`ops.mjs anis-improve-scenarios <id> --write`),
// the acceptance scenarios Claude Code runs before (failing) and after (passing) implementing it. Pure apart from writeProposal's fs.
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export const proposalRel = (id) => `tests/behavior/proposed/${Number(id)}.json`;

/** improvement row (GET /api/admin/anis/improvements/:id) → the file's JSON, or null when it has no scenarios. */
export function proposalFile(imp) {
  if (!imp || !Array.isArray(imp.scenarios) || !imp.scenarios.length) return null;
  return { id: Number(imp.id), status: imp.status ?? null, target: imp.target ?? null, stage: imp.stage ?? null, file: imp.file ?? null, fn: imp.fn ?? null,
    change: imp.change, expected_effect: imp.expected_effect ?? null, classes: imp.classes || [], scenarios: imp.scenarios };
}

/** Write it under root (the repo). An existing file is kept unless overwrite (Claude Code may have edited it). → { path, written, reason? } */
export function writeProposal(root, imp, { overwrite = false } = {}) {
  const j = proposalFile(imp);
  const path = join(root, proposalRel(imp?.id));
  if (!j) return { path, written: false, reason: 'no scenarios' };
  if (existsSync(path) && !overwrite) return { path, written: false, reason: 'exists (--force to overwrite)' };
  mkdirSync(join(root, 'tests/behavior/proposed'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(j, null, 2)}\n`);
  return { path, written: true };
}

/** A proposal's behaviour state from the last run of each scenario (runs: Map 'proposal|scenario title' → { state, at }).
 *  → { state: 'never run' | 'failing' | 'passing', at, scenarios: [{ title, state }] } — 'passing' = every scenario's last run passed. */
export function runStateOf(id, scenarios = [], runs = new Map()) {
  const per = scenarios.map((s) => ({ title: s.title, ...(runs.get(`${id}|${s.title}`) || { state: 'never run', at: null }) }));
  const state = !per.length || per.every((p) => p.state === 'never run') ? 'never run' : per.every((p) => p.state === 'passing') ? 'passing' : 'failing';
  return { state, at: per.map((p) => p.at).filter(Boolean).sort().at(-1) ?? null, scenarios: per.map(({ title, state: st }) => ({ title, state: st })) };
}
