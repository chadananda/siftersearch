# tests/quality
Search/answer quality batteries (scored against independent ground truth; reports in `reports/`, histories in `*-history.json`).

- `score-types.mjs` + `search-type-fixtures.json`: per question-type pass rates on the search endpoints (one wording each).
- `score-anis-wording.mjs` + `anis-wording-fixtures.json` (FROZEN, from `gen-anis-wordings.mjs`): every fixture in 10-18 natural wordings x 11 styles through Anís (`/api/v1/anis/draft`), scored per stage (strategy, phrases, retrieval, selection, answer) with the first failing stage as cause; prints a type x style pass matrix.
  `node tests/quality/score-anis-wording.mjs [--sample 100] [--only id] [--types ..] [--styles ..] [--concurrency 6] [--mode current|research] [--tag name]`
  Default mode `current` (research:false) ~ $0.003/reply, exposes per-stage route data; `--mode research` ~ $0.045/reply. API base `API_BASE` (default `http://tower-nas:7839`; api.siftersearch.com is often unreachable from the Mac). Needs INTERNAL_API_KEY + DEPLOY_SECRET in .env-secrets.
