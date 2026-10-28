# api/lib/pipeline — Unified enrichment pipeline v2

The ONE ordered, idempotent, gated orchestrator that replaces the six legacy always-on pollers.
Design: `docs/architecture/unified-enrichment-pipeline.md`.

- `state.js` — `doc_pipeline` state (single source of truth): `setStage`, `pickNextWork` (enforces DISAMBIGUATE→{HyPE∥EXTRACT}), `markDirty` (re-ingest → re-enrich only the delta), `backfill` (rebuild from DB), `statusReport`.
- `run-grounding.js` — `runGrounding(docId,{from,only,cc,onStage,onResult})`: the ONE grounding executor (full 11-stage `rag.*` Definition-of-Done sequence). Shared by the CLI (`scripts/complete-book.mjs`, now a thin client), the orchestrator, and the coming HTTP control API — so operator + automation + UI drive grounding through one path. Convergence plan: `.work/grounding-control-api-plan.md`.
- `hype-batch.js` (+ `hype-batch-app.js` wiring) — HyPE via persisted Message Batches, `HYPE_MODE=batch` (default) | `sync`; state `data/run/hype-batch/state.json`; CLI `scripts/pipeline/hype-batch.mjs`; the run-grounding hype stage calls it. Library seam: `rag.retrieval.plan/settle`.
- `profile.js` — `detectProfile(doc)` → segmentation/promptVariant/model/lang; `PROFILE_OVERRIDES` for the authority-seed books (GPB→DB→ROB…, cumulative).
- (to build) `orchestrator.js` — spawns the proven `scripts/entity-read/*` stages as isolated subprocesses in priority order; `budget.js` — token ceiling.
