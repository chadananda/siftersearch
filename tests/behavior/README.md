Behaviour scenarios: what Anís must DO for a class of question, as Given (reader, earlier turns) / When (asks, 2-3 example wordings) / Then (checks: `strategy`, `shape`, `tool_called`, `tool_not_called`, `source_tier`, `cites_original`, `links_book`, `judge`), run through the internal API only (`run.mjs` → `POST /api/v1/anis/draft {trace:true}`; `judge` checks go to the improve judge, billed `improve-behavior-judge`). `scenarios/` is the suite (seeded by `seed.mjs` from tests/quality routing-fixtures + answer-decisions; a scenario may carry `draft` opts such as `{research:false}`, the planner path where `shape` is the route); `proposed/<id>.json` holds a waiting CODE proposal's acceptance scenarios; `history.json` keeps the last 200 runs; `checks.mjs` is the pure check logic (tests/api/behavior-scenarios.test.js).

Workflow for a CODE proposal (also the footer of `ops.mjs anis-improve-digest`):
1. `node scripts/ops/ops.mjs anis-improve-scenarios <id> --write` → `tests/behavior/proposed/<id>.json`
2. `node tests/behavior/run.mjs --proposed <id>` → should FAIL (if it passes, the proposal may be stale)
3. implement the change
4. `node tests/behavior/run.mjs --all` → the proposal passes, the suite still passes
5. `git mv tests/behavior/proposed/<id>.json tests/behavior/scenarios/`; commit
6. `node scripts/ops/ops.mjs anis-improve-status <id> done --note "<commit>"` (or `rejected --note "<reason>"`)

Flags: `--dry` (print, call nothing), `--only <text>`, `--proposed <id>`, `--all`, `--no-record`, `--concurrency n`. Exit 1 when a suite scenario fails.
