# api/lib/rag — CorpusRAG library (release-ready, framework-agnostic)

The reusable enrichment/retrieval library. **Import only `index.js`** (`createCorpusRAG`) and speak the
domain — `rag.disambiguate(doc)`, `rag.entities.reconcile(doc)`, `rag.concepts.extract(doc)`. Everything
else here is internal implementation; never import or reference internal paths from outside this dir, and
never name them in docs. Full conceptual map: the header of `index.js`; usage: `README.md`.

## HARD BOUNDARY — this dir is a pure library
NO database, NO SQL, NO table/field names, NO model ids, NO provider names anywhere under `api/lib/rag/`.
All of that lives in the app-side adapter **`api/lib/rag-adapter/`** (the only code that imports the app's
db/ai/registry/profile + names tables & columns). The library receives everything through injected PORTS
(`ports.js`: llm · models · store · profiler · log) and validates them in the factory. This is what makes
it npm-releasable AND independently testable (fake ports, no db/network — see `tests/rag/`).

## The one rule
The public surface is a hierarchy of **capabilities**, not files. Internals are grouped for
maintainability (shared concerns factored into `kernel/`, then layered), and every file carries a header +
per-import notes so minimal sampling reveals purpose and procedure.

## Code style — token-lean, maintenance-first
Optimised so a future session understands the code from the fewest tokens: explanation lives ONCE (in the
header) and the body stays terse.
- One concept per small file. Header (≤6 lines) = purpose + non-obvious *why* + deps; read it instead of
  the body.
- Comment *why*, never *what*; delete any comment a competent reader would infer.
- Types are declared once (`ports.js` typedefs) and referenced by name — never re-described per file.
- DRY into `kernel/`: a stage is prompt + parse + store-calls, nothing infrastructural.
- Names are the documentation (domain verbs/nouns, no abbreviations needing a gloss).
- Tests use the shared kit (`tests/rag/kit.js`) — imports + assertions, no re-declared fakes.
- No dead code, no speculative parameters (YAGNI). Prefer data/config over branches.

## Internal layout (implementation only)
- `kernel/` — shared by every stage: `model` (routed call + escalation ladder + retry), `profile`
  (per-doc language/genre/routing), `segment` (TOC/bounded segmentation + concurrency + RESUME),
  `substrate` (DB read + gated single-writer writes), `gate` (assertDisambiguated).
- `enrich/` — passage enrichment: `disambiguate`, `retrieval` (HyPE).
- `entities/` — factual layer: `mentions` · `claims` · `reconcile` · `project` · `lookup`.
- `concepts/` — doctrinal layer: `lexicon` · `disambiguate` · `extract` · `reconcile` · `link`.
- `pipeline.js` — **NOT YET BUILT** (the gated, ordered orchestrator). Today stages are driven individually
  via `scripts/rag.mjs`; the two-phase orchestrator is the final build step. See
  `docs/architecture/two-phase-grounding-pipeline.md`. Do not claim a complete pipeline exists until this ships.

## Invariants
- Writes go through the single writer (`ctx.writerUrl` = `SIFTER_WRITER_URL`), never a direct connection.
- Disambiguation gates all downstream stages (`kernel/gate`).
- Identity is DEFERRED at extraction and resolved by EVIDENCE at reconcile → append-only decisions, never
  edits (docs/entity-improvable-architecture.md). The materialized graph is a disposable projection.
- Enrichment is written in English (cross-lingual unification); proof spans stay verbatim in source language.

## Model routing (never hard-coded)
No stage names a model. Choice resolves from the two existing mappings — `../model-registry.js`
(price/provider/local catalog; already lists ollama/lmstudio local models + the authoritative provider per
id) and `../pipeline/profile.js` `LANG_ROUTING` (language→stage→model + fallback). `kernel/model`
resolves provider via the registry (`getModel().provider`), so swapping a model or adding a LOCAL endpoint
is a catalog/policy edit, not a code change. Interface doc: `docs/architecture/corpus-rag-library.md`.

## Migration status (2026-07-11)
Refactor of the retired `scripts/entity-read/*` env-var scripts INTO this library, in lurches (see
`.work/gpb-pilot-engines-plan.md`). Built: interface (`index.js`), `kernel/model` (registry-routed,
local-ready), `kernel/profile`. Pending: kernel `segment`/`substrate`/`gate` + all stages + concept layer
(net-new). The one CLI is `scripts/rag.mjs`.
