# tests — Test suites

Vitest unit + integration, Playwright E2E, Cucumber BDD, and dialog-quality
behavioral tests.

## tests/api/ — Vitest (unit + integration)
1004 tests passing as of refactor 2026-05.

Critical-path integration tests (added during refactor Phase 1):
- `sites-ingester.test.js` — full ingest lifecycle for OceanLibrary adapter.
- `library-watcher.test.js` — religion-root whitelist invariants.
- `sync-processor.test.js` — duplicate-paragraph + duplicate-doc removal from Meili.

Existing high-coverage suites:
- `ingester.test.js` (1,191 LOC) — paragraph parsing, hashing, metadata.
- `search.test.js` (1,064 LOC), `search-quality.test.js` (315), `search-authority-ranking.test.js` (249).
- `library-crud.test.js` (547) — full Fastify CRUD.
- `pipeline.test.js` (469) — pipeline-versions + jobs.
- `public-api-library.test.js` (452).
- `segmenter.test.js` (452), `translation.test.js` (409), `enrichment-layer.test.js` (398), `object-extraction.test.js` (409), `graph-db.test.js` (411).
- `admin.test.js` (422), `authority.test.js` (366), `enhancement.test.js` (360).
- `migration-44.test.js` (266) — schema verification.
- Smaller: `auth.test.js`, `cors.test.js`, `query-intent.test.js`, `embedding-cache.test.js`, `documents.test.js`, `indexer.test.js`.

### Patterns
- In-memory better-sqlite3 + `vi.mock('../../api/lib/db.js', ...)` — see `pipeline.test.js`, `sites-ingester.test.js`, `sync-processor.test.js`.
- Real Fastify server via `api/server.js` + `server.inject({...})` — see `library-crud.test.js`.
- `vi.mock` for AI services / Meili / fs / logger — see `translation.test.js`.

## tests/e2e/ — Playwright
- 7 specs: home, library, navigation, auth, about, all-links, user-tracking.
- Config: `playwright.config.js` targets `http://localhost:5173` with desktop + mobile profiles.
- Note: `playwright.smoke.config.js` referenced by `npm run test:smoke*` does NOT exist — falls back.

## tests/features/ + tests/step_definitions/ — Cucumber BDD
- 25 `.feature` files. Profiles: `critical`, `smoke`, `all`, `search`, `library`, `auth`, `navigation`, `accessibility`, `implemented`, `pending`.

## tests/behavioral/ — Dialog quality (rubric-based)
- `dialogue.test.js` — frontmatter validation + dialog archive invariants.

## tests/chat/ — Jafar quality scoring
- Scenario-driven rubric scoring with JSON results. Not run by `npm test`.

## tests/visual/ — visual regression
- `capture-all-pages.js` — screenshot capture + link validation.

## Running
- `npm test` — full vitest suite.
- `npm run test:e2e` — Playwright.
- `npm run test:bdd:critical` — critical-path BDD.
- `npm run test:visual` — visual smoke.
