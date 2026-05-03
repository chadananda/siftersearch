# Claude-First Maintainability Refactor

## Problem

Large codebases become expensive to maintain in AI sessions because every edit requires reading context before acting. When files exceed ~200 lines, understanding a module costs 2–4 reads before any work begins. When logic is duplicated across files, a bug fix requires hunting down every copy. When function names collide across modules (`processOne` in two unrelated files), AI sessions misidentify which function to edit.

The result: discovery overhead consumes most of a session's context budget before any real work happens.

## Goal

Reorganize so that **any bug or feature can be understood and fixed by reading one file and at most one import.** Every file should have a single stated concern, a one-line header, and no duplicated logic.

## Methodology

### 1. Start with an integration test harness

Before splitting files, ensure a passing full-suite of integration tests that exercise the actual behavior end-to-end. Unit tests that mock internals will pass even when a refactor breaks a real code path. Integration tests that exercise the pipeline with a real database and real file I/O will catch regressions.

The test harness should cover:
- Each pipeline stage in isolation (classify, export, mirror, etc.)
- Multi-stage sequences (classify → export → verify output)
- Edge cases that exist because of real production bugs (document these in test names)
- Cross-cutting invariants (DB schema migrations, config path isolation)

Without this harness, any refactor is a guess. With it, each split is safe to commit immediately after tests pass.

### 2. Extract shared constants first

Find duplicated constants (sets, maps, arrays) that appear in 3+ files. Move them to a single `constants.js` or `language.js`. Update imports everywhere. This step has zero behavior change and eliminates an entire class of drift bugs where one copy gets updated and others don't.

### 3. Split files at natural seams

Each file gets a single concern. Identify the seams by asking: "if I need to fix X, which functions do I need?" Functions that are always read/edited together belong together.

**Target file size: under 200 lines.** At 200 lines, a full file fits in context. At 500+, you're always reading partial context.

Split strategy:
- Extract pure utility functions (no I/O, no DB) to a `*-utils.js` sibling
- Extract worker pools, queues, or daemon loops to their own files
- Extract SQL query functions away from HTTP route handlers
- Keep orchestration logic (the main `run*()` function) in the parent file

### 4. Rename ambiguous functions

No two functions in different files should share a name. When a name like `processOne` appears in both `mirror.js` and `pdf-upgrade/index.js`, AI sessions will conflate them. Rename to describe what the function does in its specific context (`fetchAndExportPage`, `upgradeDocument`).

### 5. Add navigation headers to every file

First line of every source file:
```
// <purpose>. Exports: <fn1>, <fn2>. Deps: <dep1>, <dep2>
```

This lets an AI session understand what a file does without reading its body. The header is the file's contract.

### 6. Add CLAUDE.md per subdirectory

Each subdirectory gets a `CLAUDE.md` that acts as a router: one line per file, stating its purpose and key exports. A fresh session reads the CLAUDE.md to find the right file before opening anything.

Format:
```markdown
# src/ — Core pipeline modules
- constants.js   — DOC_MIMES, DOC_EXTS (shared across mirror, classify, assets)
- mirror.js      — runMirror() crawl loop
```

### 7. Magic constants at file tops

Named constants replace inline magic numbers wherever a value appears 2+ times or its meaning isn't obvious from context. Place at the top of the file that uses them, not in a global config.

## What NOT to do

- **Don't add abstraction layers.** Extracting a function to avoid 3 similar lines is premature. Wait until a fourth copy appears.
- **Don't create "utils" dumping grounds.** Every extracted file must have a single stated concern. A file called `utils.js` with 20 unrelated functions is worse than the original.
- **Don't break working tests to fit the refactor.** If a test exercises real behavior, it stays. If it's testing an implementation detail that the refactor changes, update the test.
- **Don't split for splitting's sake.** The goal is "reads one file to understand one thing," not the smallest possible files.

## Verification

After each file split:
1. Run the full test suite — all tests must pass
2. Spot-check exports: `node -e "import('./src/file.js').then(m => console.log(Object.keys(m)))"`
3. Search for orphaned references: `grep -r "oldFunctionName" src/ bin/`

After all splits:
- No function name should appear in two files with different meanings
- No constant should be defined in more than one file
- Every file should have a header comment
- Every subdirectory with 3+ files should have CLAUDE.md

## Outcome Metrics

A successful refactor shows:
- Average lines per file drops from ~300 to ~120
- "Time to first edit" in a new session drops (fewer files to read before acting)
- Bug fixes become single-file changes rather than multi-file hunts
- New contributors (or AI sessions) can orient in one read of CLAUDE.md

---

## Status — Refactor pass 2026-05

### What landed

**Phase 1 — Integration test harness (foundation).**
Three pipelines that previously had zero tests now have integration coverage. The methodology requires this before any file split. 16 new tests across 3 files, all passing.

- `tests/api/sites-ingester.test.js` (4 tests) — full ingest lifecycle, sidecar harvest, supersession, file_hash short-circuit.
- `tests/api/library-watcher.test.js` (7 tests) — religion-root whitelist, dotfolder exclusion, IGNORED_PATTERNS, no-nesting invariant.
- `tests/api/sync-processor.test.js` (5 tests) — duplicate-paragraph removal, doc-level removal, partition-and-upsert, empty-content short-circuit.

Two tiny prod-code changes to enable testability: `library-watcher.js` exports `_internal` for the religion-root helpers; `sync-processor.js` guards its auto-start workerLoop behind an `isMain` check and exports `syncDocument` + `getDocumentMeta`.

**Phase 2 — Shared constants.**
`api/lib/constants/languages.js` — `AI_SEGMENTED_LANGUAGES` (ar, fa, he, ur), `RTL_LANGUAGES`, helpers. Replaced inlined duplicates in `ingester.js` and `segmenter.js`. Religion list extraction deferred (the librarian agent's local list uses different conventions than the DB and aligning them is a behavior-change PR, not safe overnight).

**Phase 3 — Function-name collisions + shared text utilities.**
- Renamed `parseDocument` in `indexer.js` → `chunkDocumentForIndexing`. The same name in `ingester.js` is the canonical (returns full document records); the indexer one only chunks for embedding. Only one external caller (`tests/api/indexer.test.js`) — updated with a local alias for test readability.
- Created `api/lib/text-normalize.js` as the single source of truth for paragraph-normalization regex + hashing. `normalizeForEmbedding`, `hashNormalized`, `hashContent`. Three consumers (indexer, ingester, sites-ingester) had inlined the same regex; any drift would silently break the cross-doc embedding cache. All three now delegate.

**Phase 4e — Split `migrations.js` (2,645 → 5 files).**
- `api/lib/migrations/v1-v25.js` (900 lines) — base schema, early indexes, ingestion queue.
- `api/lib/migrations/v26-v45.js` (822 lines) — file-hash uniqueness, slug + redirect infrastructure, document_failures, table_counts, embedding cache, segmenter/translation tables.
- `api/lib/migrations/v46-v58.js` (428 lines) — partial indexes, HyPE/disambig, doc_pages + published_conversations, translation_cache, content.is_duplicate, external-site columns, supersession-lookup covering index.
- `api/lib/migrations/user.js` (283 lines) — userMigrations 1..3.
- `api/lib/migrations/runner.js` (221 lines) — getSchemaVersion, runner functions, getMigration44SQL.
- The original `api/lib/migrations.js` is now a 19-line re-export shim — every existing importer keeps working.

**Phase 5 — Per-directory CLAUDE.md routers (15 files).**
A fresh AI session can now read CLAUDE.md to find the right file without opening source. Each lists files with one-line purpose + key exports, plus mega-file flags so future sessions know what's known pain.
Added: `api/`, `api/lib/`, `api/lib/constants/`, `api/lib/migrations/`, `api/services/`, `api/services/site-adapters/`, `api/routes/`, `api/agents/`, `api/workers/`, `src/`, `src/lib/`, `src/components/`, `src/pages/`, `scripts/`, `tests/`.

### What's deferred (and why)

The remaining mega-files were left in place for **focused future sessions**, each with the right test coverage to make the split safe. They're flagged in the relevant CLAUDE.md so future AI sessions know they're known pain.

| File | Lines | Test coverage | Recommended sub-files |
|---|---|---|---|
| `api/lib/search.js` | 2,000 | search.test.js (1,064 LOC) | `search/cache.js` (~140), `search/meili.js` (~225), `search/keyword.js` (~240), `search/hype.js` (~350), main orchestrator (~600) |
| `api/services/ingester.js` | 2,143 | ingester.test.js (1,191 LOC) | parse / hash / metadata / run (orchestrator). The `ingestDocument` orchestrator is 880 lines on its own; needs careful seam-finding. |
| `api/services/segmenter.js` | 3,850 | segmenter.test.js (452 LOC) | language-detect / boundaries / ai-breaks / markers / orchestrator |
| `api/services/translation.js` | 2,652 | translation.test.js | jobs / llm / segments / orchestrator |
| `api/routes/admin.js` | 3,910 | admin.test.js (422 LOC) | admin/{users,jobs,library,enrichment,validation,sites}.js |
| `api/routes/library.js` | 3,860 | library-crud.test.js (547 LOC) | library/{ingestion,metadata,lightrag,publisher-state,queries}.js |
| `api/lib/jafar-pipeline.js` | 1,193 | dialogue.test.js (behavioral only) | research / craft / reflect-gate / shared-types |
| `src/components/ChatInterface.svelte` | 5,371 | NONE | MessageList / Composer / StreamingState / streaming.js / index — **manual browser test required** |
| `src/components/library/DocumentPresentation.svelte` | 3,314 | NONE | Reader / MetadataPanel / AnnotationLayer / index — **manual browser test required** |

### Why this scope

The methodology says "any bug or feature can be understood and fixed by reading one file and at most one import." That's a directional goal, not a single-pass requirement. This pass:

1. **Made the system safe to refactor further.** Three critical pipelines now have integration tests where they had none.
2. **Eliminated the worst silent-drift bugs.** The text-normalize regex was inlined in three places; the `parseDocument` name was overloaded across two files; the `AI_SEGMENTED_LANGUAGES` array was a copy-paste pair. All resolved.
3. **Made navigation fast.** 15 CLAUDE.md routers mean a fresh session reads one file to find the right code. Mega-files are flagged.
4. **Did one mega-file split as proof.** `migrations.js` (2,645 lines, 61 migration objects) split cleanly into 5 version-bucketed files because each migration is independent. This exercises the pattern; future splits can reuse the same shim approach.

The mega-files that were NOT split need feature-by-feature inventory (admin / library god-routes), tangled internal calls untangled (ingester / segmenter / translation), or component-prop-flow understanding (Svelte UI). Each is a 30–60-minute focused session of its own. Doing them rushed and unattended would land broken splits and waste the test coverage.

### Verification

After every Phase commit: full vitest suite green. Final state:
- **Test files:** 28 (+3 from baseline)
- **Tests:** 1,004 passing, 1 skipped (was 988 / 1, +16 net new)
- **Behavior:** zero changes — all renames/extractions/splits are pure refactor.
- **Smoke:** `node -e "import('./api/lib/migrations.js').then(m => Object.keys(m))"` returns the same six exports as before.

### How to use this in future sessions

- **Want to add a migration?** Open `api/lib/migrations/CLAUDE.md` for the pattern.
- **Want to add a new external site (bahai-library, oceanoflights)?** Open `api/services/site-adapters/CLAUDE.md` for the contract + `docs/sites-integration.md` for the runbook.
- **Want to fix something in admin/library/search/segmenter/translation/ingester?** The CLAUDE.md in that dir says which mega-file holds it. Read just that file. The headers in each mega-file describe its sections.
- **Want to actually split a mega-file?** Use the migrations split as the template: extract groups into sub-files, replace the original with a re-export shim, run tests after each commit. Time-box at 30 min per file; revert if untangling exceeds budget.
