# Unified Ingestion + Enrichment Pipeline (v2)

Status: DESIGN (2026-07-10). Replaces the six always-on legacy workers (enrichment,
enrichment-api, graph-extractor/promoter/resolver/validator) with one coherent,
ordered, idempotent pipeline.

## 1. Goals

- **Stable** — one coordinator, one writer, bounded concurrency. No competing pollers, no races, no lock/Meili storms.
- **Consumes almost any document** — source-format-agnostic (markdown, PDF-derived, site-adapter HTML all normalize to the paragraph model at ingest; enrichment operates only on the normalized stream + doc metadata).
- **Updates cheaply, preserves content** — re-ingesting an edited doc re-enriches ONLY the changed paragraphs; unchanged content keeps its enrichment untouched.
- **Token-efficient** — skip-unchanged (idempotency), DeepSeek prefix caching, model tiering, cross-doc dedup for exact duplicates, cheapest sufficient model.
- **Correct by construction** — the DISAMBIGUATE → {HyPE ∥ EXTRACT} → RECONCILE order is a hard precondition in code, not an accident of which process is running.
- **Authority-ordered** — the entity seed is built in coverage order (GPB → DB → ROB → history); later docs resolve against the earlier seed.

## 2. Why the old design was unstable (root cause)

Ingest wrote raw paragraphs with NULL enrichment flags. Then N independent PM2 pollers each
scanned `content` for their own flag and wrote concurrently:
`context IS NULL`, `graph_enriched=0`, `hyp_thesis IS NULL`, `enhanced_synced=0`, `em_synced=0`,
`embedding IS NULL`, normalized-hash dup groups. Consequences: no ordering (entity extraction ran
before disambiguation — "built on sand"), no gate, blanket full-table scans, duplicated work,
mass `enhanced_synced=0` resets flooding Meili, write-lock contention, crash loops. **The unit of
work was the paragraph, but disambiguation/HyPE need book-level context — so the pollers also threw
away quality and cache locality.**

## 3. Core principles

1. **The unit of enrichment is the DOCUMENT**, processed in stages with book context (cast seed,
   metadata, running coreference). Maximizes quality AND DeepSeek prefix-cache hits.
2. **Explicit per-doc pipeline STATE** (one `doc_pipeline` row), not scattered booleans. A state
   machine: `ingested → disambiguated → {hyped, extracted} → reconciled`, each stamped with the
   stage VERSION and a content fingerprint.
3. **Content-hash-anchored idempotency.** Enrichment is keyed to paragraph content + provenance.
   Re-ingest carries forward enrichment for unchanged paragraphs; only the delta re-enriches.
4. **One orchestrator, sequential by priority, single writer.** Replaces all pollers. Picks the
   next doc-stage whose preconditions are met, runs it, records state. Resumable via the state table.
5. **The disambiguation gate is a code precondition.** HyPE/extract call `assertDisambiguated(doc)`
   (requires current `deepseek-disambig-v1` coverage). Structurally impossible to extract from raw text.
6. **Generation is decoupled from indexing.** LLM stages write the DB; the existing worker sync
   cycles incrementally index what's there (no mass resets).
7. **Per-document PROFILE** selects segmentation + prompt variant + model + language, so the pipeline
   is robust to document variety with graceful defaults.
8. **Version = reprocessing signal.** Bumping a stage version (improved prompt) makes the orchestrator
   re-run that stage in priority order, idempotently — the same mechanism as updates.

## 4. State model

```sql
CREATE TABLE doc_pipeline (
  doc_id           INTEGER PRIMARY KEY REFERENCES docs(id),
  priority         INTEGER NOT NULL DEFAULT 1000,   -- lower = earlier (GPB=0, DB=10, ROB=20, history=100)
  profile          TEXT,                            -- resolved profile name (see §7)
  lang             TEXT,
  enabled          INTEGER NOT NULL DEFAULT 0,      -- 0 = ingested+base-indexed only; 1 = released into enrichment
  disambig_status  TEXT DEFAULT 'pending',          -- pending|running|done|error|partial
  disambig_version TEXT,
  disambig_fp      TEXT,                            -- fingerprint of content disambiguation was computed over
  hype_status      TEXT DEFAULT 'pending',
  hype_version     TEXT,
  extract_status   TEXT DEFAULT 'pending',
  extract_version  TEXT,
  reconcile_status TEXT DEFAULT 'pending',
  dirty_paras      TEXT,                            -- JSON array of changed para ids (partial re-enrich)
  cost_tokens      INTEGER DEFAULT 0,
  error_detail     TEXT,
  updated_at       INTEGER
);
CREATE INDEX idx_doc_pipeline_worklist ON doc_pipeline(enabled, priority, disambig_status);
```

`enabled` is the **release valve**: a newly-ingested doc is searchable via the base index immediately
(enabled=0) but does NOT auto-enrich until released (enabled=1). This preserves authority-ordering
during the seed phase and prevents surprise token spend, while still supporting fully-automatic
operation once a corpus is released.

## 5. Modules (refactor the working scripts into a library)

```
api/lib/pipeline/
  profile.js        detectProfile(doc) → {segmentation, promptVariant, model, lang}
  state.js          doc_pipeline CRUD + pickNextWork() worklist query + markDirty()
  budget.js         token budget + rate-limit guard (hard ceiling)
  stages/
    disambiguate.js disambiguateDoc(docId, {dirtyOnly})   ← from scripts/entity-read/disambiguate-book.mjs
    hype.js         hypeDoc(docId, {dirtyOnly})           ← from hype-book.mjs
    extract.js      extractDoc(docId, {dirtyOnly})        ← from build-mentions + extract-claims-v2
    reconcile.js    reconcileTier(priority)               ← from reconcile.mjs (to build)
  orchestrator.js   the coordinator loop
api/workers/pipeline-worker.js   PM2 entry (or scripts/run-pipeline.mjs for scheduled/manual)
```

The existing `scripts/entity-read/*.mjs` become thin CLI wrappers over these modules, so manual
per-book runs still work (used through the seed phase + for testing).

## 6. Orchestrator loop

```
loop:
  if !enabled(global) || budget.exceeded(): sleep(long); continue
  w = pickNextWork()            // highest-priority enabled doc with a runnable stage + met preconditions
  if !w: sleep(idle); continue
  try:
    switch w.stage:
      disambiguate: runDisambiguate(w.doc, {dirtyOnly: w.partial});          setDone(disambig, VERSION, fp)
      hype:         assertDisambiguated(w.doc); runHype(w.doc, dirtyOnly);   setDone(hype, VERSION)
      extract:      assertDisambiguated(w.doc); runExtract(w.doc, dirtyOnly);setDone(extract, VERSION)
      reconcile:    reconcileTier(w.priority);                                setDone(reconcile)
  catch e: setError(w.doc, w.stage, e); continue     // one bad doc never blocks the queue or crash-loops
```

Preconditions enforce the gate and the order:
- **disambiguate**: `enabled=1 ∧ disambig_status ∈ {pending,partial}` (or `disambig_version ≠ CURRENT`).
- **hype / extract**: `disambig_status=done ∧ disambig_version=CURRENT ∧ own_status ∈ {pending,partial}`. HyPE and extract are independent → both runnable once disambiguation is done.
- **reconcile**: all enabled docs at a priority tier have `extract_status=done`.

Simplicity for stability: process docs in priority order, one doc's stages before moving on (disambig
fully, then HyPE ∥ extract), reconcile at tier boundaries. Each stage is internally parallel (segments)
and bounded by a global concurrency cap + DeepSeek rate limit. No cross-doc write races.

## 7. Document profiles (robust to variety)

`detectProfile(doc)` resolves, from doc metadata + a structure/content sample + an explicit override
table for known books:

| Axis | Values | Signal |
|---|---|---|
| segmentation | `toc` (chapter TOC) · `bounded` (SEGMAX*3) | presence of `<h>`/heading structure |
| promptVariant | `narrative` · `doctrinal` · `scripture` · `persian` | genre/collection + quote density + script |
| model | `flash` (bulk) · `pro` (flagship/doctrinal) | priority tier + genre |
| lang | en · fa · ar · he | `lang` field + script detection |

Defaults (unknown doc) = `bounded / narrative / flash / en` — works for generic prose. Explicit
overrides for the important books (GPB=toc/narrative/pro, DB=toc/narrative/pro, ROB=bounded/doctrinal/flash,
Gate=doctrinal/pro, Mázindarání=bounded/persian/flash). "Consume almost any document" = the default
path enriches unknown prose acceptably; overrides tune the ones that matter.

## 8. Update flow — "update without modifying content too much"

On re-ingest of doc X (the ingester already diffs paragraphs by content hash):
1. **Unchanged paragraphs** (same content_hash): keep content row + ALL enrichment (context, HyPE,
   mentions, claims). No LLM work.
2. **Changed / new paragraphs**: new content rows, NULL enrichment.
3. **Deleted paragraphs**: soft-delete + cascade-remove their mentions/claims (closes the pending
   "removal-on-delete" gap).
4. Ingester calls `pipelineState.markDirty(X, changedParaIds)` → sets the doc's stages to `partial`.
5. Orchestrator re-enriches ONLY the dirty paragraphs. Disambiguation of a changed paragraph re-runs
   with its existing neighbours' context (bounded to its segment at most).

Editing one paragraph in a 5,000-paragraph book re-enriches ~1 paragraph, not 5,000. Enrichment is
anchored to content, so it survives re-ingestion of stable content. That is the whole requirement.

## 9. Token efficiency (the levers, strongest first)

1. **Skip-unchanged (updates):** content-hash carry-forward — never re-pay for stable paragraphs.
2. **Skip-by-version (idempotency):** a completed stage at the current version is never re-run.
3. **Prefix caching (initial enrichment):** stable per-book system prefix (instructions + metadata +
   cast) → DeepSeek KV cache ~95–99% on flash (sequential within a segment, concurrent segments).
4. **Model tiering:** flash for bulk history; pro only for flagship + doctrinal.
5. **Cross-doc dedup (conservative):** identical `normalized_hash` paragraphs carry embeddings always
   (already live via `propagateEmbeddings`); carry HyPE/context only for standalone exact duplicates
   (disambiguation is book-contextual, so default is per-book).
6. **Bounded re-work:** re-disambiguate only the changed segment, not the book.
7. **Hard budget guard:** `budget.js` caps token spend per run; the orchestrator stops cleanly at the ceiling.

## 10. Stability mechanisms (each maps to an old failure)

| Old failure | New mechanism |
|---|---|
| N competing writers | ONE orchestrator + single-writer API |
| blanket 4M-row scans | small indexed `doc_pipeline` worklist, doc-by-doc |
| mass `enhanced_synced=0` → Meili flood | generation decoupled from incremental indexing; no mass resets |
| reconcile storms | mass-diff reconcile stays gated OFF; incremental sync + verified rebuild-from-backup |
| lock contention | single writer + bounded concurrency + tuned WAL |
| crash loops | resumable state table; a failed doc → `error` status, never blocks the queue |
| no ordering / no gate | priority worklist + `assertDisambiguated` preconditions |

## 11. Build plan (phased, each phase independently valuable + non-breaking)

- **P0 — state + refactor (decision-independent):** migration for `doc_pipeline`; extract the working
  scripts into `api/lib/pipeline/stages/*` modules; scripts become thin wrappers. No behaviour change.
- **P1 — profile + backfill:** `detectProfile`; backfill `doc_pipeline` from current DB state (docs
  already disambiguated = done). Gives the corpus-wide status view.
- **P2 — orchestrator (manual trigger):** the loop, run on-demand over a released set. Verify on the
  seed books (GPB/DB already done → no-op; ROB in flight).
- **P3 — update integration:** ingester `markDirty` hook + cascade delete-on-remove.
- **P4 — automation:** promote to the chosen run form (§ open decisions) with budget + enable controls.
- **P5 — retire the six** once P0–P4 prove out end-to-end.

## 12. Open decisions (need sign-off before P4)

1. **Run form:** always-on PM2 worker (responsive, but a standing process) vs scheduled runner
   (wakes every N min, bounded batch, exits — obviously can't run away) vs manual-only.
2. **Release policy:** auto-release every ingested doc into enrichment, vs deliberate release
   (enabled=1 set explicitly / by priority tier) — the latter preserves authority-ordering and
   controls spend during the seed phase.
