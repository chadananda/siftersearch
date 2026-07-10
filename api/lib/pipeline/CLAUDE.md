# api/lib/pipeline — Unified enrichment pipeline v2

The ONE ordered, idempotent, gated orchestrator that replaces the six legacy always-on pollers.
Design: `docs/architecture/unified-enrichment-pipeline.md`.

- `state.js` — `doc_pipeline` state (single source of truth): `setStage`, `pickNextWork` (enforces DISAMBIGUATE→{HyPE∥EXTRACT}), `markDirty` (re-ingest → re-enrich only the delta), `backfill` (rebuild from DB), `statusReport`.
- `profile.js` — `detectProfile(doc)` → segmentation/promptVariant/model/lang; `PROFILE_OVERRIDES` for the authority-seed books (GPB→DB→ROB…, cumulative).
- (to build) `orchestrator.js` — spawns the proven `scripts/entity-read/*` stages as isolated subprocesses in priority order; `budget.js` — token ceiling.
