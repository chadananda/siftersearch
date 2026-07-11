# tests/rag — CorpusRAG test harness

Proves the library correct by making the deterministic core large and the AI seam thin, then testing the
core exhaustively. Five tiers, one shared kit.

## Run
`node ./node_modules/vitest/vitest.mjs run tests/rag/` (or `npm test`). Locally, native-sqlite tiers skip
if `better-sqlite3`'s prebuilt binary can't load for the arch (Dropbox-synced x86_64 vs arm64 node) — they
run in CI/on a matching env. The pure tiers need no native dep.

## The kit (`kit.js`)
In-memory fakes for every port, so a test is imports + assertions: `fakeLLM(script)` (scriptable + records
calls), `fakeCatalog(extra)`, `memStore(seed)`, `fakeProfiler(profile)`, `makeRag(overrides)`, `parseIdea`.

## Tiers
1. **Unit** (`kernel.test.js`) — pure logic on fakes, exact assertions. No DB, no network.
2. **Invariants** (`invariants.test.js`) — the architectural LAWS as executable checks; this file IS the
   correctness spec. Laws needing unbuilt stages are `it.todo` (test-first targets). Includes a property
   check (random scripts) for the ladder budget.
3. **Contract** (`adapter-store.test.js`) — the SifterSearch adapter satisfies a port against a REAL
   in-memory schema (mocked `db.js`). Proves the adapter's SQL + mapping without the production DB.
4. **Golden** (add per stage) — record one real model reply, replay through parse→gate→decision; pins the
   AI-processing seam so a parser change can't silently regress. The model is faked with the recording.
5. **Eval** (separate, live) — quality metrics + acceptance arcs (Badasht three, Letters of the Living).
   NOT part of CI correctness; measures the model, not the code.

## Adding a stage
Write its fake-port unit test + turn the relevant `it.todo` invariant green FIRST (red), then the stage.
SQL lives in the adapter, so a stage test never needs a DB.
