// The question-class plan (planning/anis-strategies.json: tools, classes A1–H2, composition, reader activities, decisions) for
// the three public docs pages. A repo file, not DB: read once, re-read when its mtime changes (a push edits it without
// touching any import graph). Unreadable → null, and the pages render without the plan parts.
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLAN_FILE = 'planning/anis-strategies.json';
const PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', PLAN_FILE);
let memo = { mtime: -1, plan: null };

export function loadPlan(path = PATH) {
  try {
    const mtime = statSync(path).mtimeMs;
    if (mtime !== memo.mtime || path !== memo.path) memo = { mtime, path, plan: JSON.parse(readFileSync(path, 'utf8')) };
    return memo.plan;
  } catch { return null; }
}
