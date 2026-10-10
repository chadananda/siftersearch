# Data access architecture — one store, one index writer, one search interface (2026-10-09)

**Why now.** Chad 10-09: "clean up internal API with ingesting and fetching data so we do not have a complicated situation
where we do not even know why meili is still being called" · "We have not gone public, so now is the time to adjust
architecture… world class maintainability, performance, and elegance." Trigger: Qdrant-only search still fetched every hit's
text from Meili (found while measuring the switch — the gate before concept extraction).

## The rule (one sentence)
**SQLite is the only place data is read from or written to; a search engine is only asked "which ids match?", and only one
module talks to it.**

## Target layers

```
routes / agents / workers / scripts
        │  read & write data               │  find ids                  │  (sync worker only)
        ▼                                  ▼                            ▼
  repos (SQLite)                    search/engine.js  ───────────►  search/index-writer.js
  docs-repo · paragraphs-repo       find(query, filters) → ids+scores   upsert/delete by id
  (all reads; writes via writer)    findDocuments(title) → doc ids      (Qdrant now; Meili until retired)
        ▲                                  │
        └──────── hydrate ids ─────────────┘   (paragraphsByIds / getDoc — never the engine)
```

1. **Repos — SQLite, the source of truth.** `docs-repo.js` (exists: docs, canonical/duplicate rules) and a new
   `paragraphs-repo.js` (by id, by doc, by refs, search documents — `paragraphDoc()` lives here). Every read of paragraph or
   document *data* goes through these. Writes go through the single writer (unchanged).
2. **Ingest — one path.** file/site → parser → repo writes → rows marked dirty (`synced = 0`). Nothing in ingest touches an
   index. (Today library-watcher and an admin route write to Meili directly.)
3. **Index writer — one module, one caller.** `search/index-writer.js` turns dirty rows into index upserts/deletes, called only
   by the sync worker. Engine-specific code behind it (`meili.js` legacy, `qdrant.js` target).
4. **Search engine — one interface.** `search/engine.js`: `find(query, {filters, layers, limit})` → ranked ids + scores +
   spans; `findDocuments(q)` → doc ids (SQLite FTS5 on titles/authors — not an engine at all). Ranking/RRF/authority blend live
   here; results are hydrated from the repos. planned-search and every route call this, never a client.
5. **Scripts are clients, never owners** (Chad 10-09: "Especially one-off scripts should use a well-defined internal API —
   whether an internal function call or an actual OpenAPI interface — in order to have clean, agreed-upon contracts").
   A script calls repo / service functions (docs-repo, paragraphs-repo, the writer, search/engine) or the internal OpenAPI
   endpoints — no `new Database(...)`, no raw SQL, no engine client. If the API cannot express what the script needs, the
   API is extended (with a test), so the next script gets it for free. 10-09 example: `listDocs({ sourceSite: 'library',
   afterId })` was added for the stale-ingest sweep instead of a hand-written docs query.
6. **Enforcement — ratchet tests** (like `docs-access-ratchet`): `tests/api/engine-access-ratchet.test.js` (10-09) freezes
   the 62 files that reach Meili directly — a new one fails CI, a migrated one must leave the list; target: only
   `search/engine/*` + `search/index-writer/*`, then none. "Why is Meili still being called" becomes impossible to ask.
   ⚠ `SKIP_CHECKS=1` commits skip the ratchets — 10-09 three raw `FROM docs` script queries slipped in that way and were
   caught on the next full test run. Use it only for genuinely unrelated pre-existing lint failures. (like `docs-access-ratchet`): importing `meilisearch` / calling `getMeili` is allowed only in
   `search/engine/meili.js` and `search/index-writer/meili.js`; the allowed list shrinks to zero when Meili is retired. A new
   call anywhere else fails CI — "why is Meili still being called" becomes impossible to ask.

## Inventory (10-09) — every Meili touchpoint, by kind
**(c) Data fetch / listing through the engine — WRONG, move to repos/FTS first**
| file | what | becomes |
|---|---|---|
| lib/search.js multiIndexSearch | Qdrant hits hydrated via `getDocuments` | ✅ `paragraphsByIds` (10-09, deploy pending) |
| services/audio.js | doc via `getDocument`, paragraphs via `search('')` | docs-repo + paragraphs-repo |
| routes/library.js ~1433 | document title search on DOCUMENTS index | `findDocuments` (FTS) |
| routes/documents.js ~132 | document search | `findDocuments` |
| routes/chat.js ~716, ~1018 | find-document by title | `findDocuments` |
| routes/public-api.js ~1039 | document search | `findDocuments` |
| routes/admin.js ~572 | list docs by author via engine | docs-repo `listDocs({author})` |
| lib/rag-adapter/store.js | paragraph lookups + "is it indexed" via engine | paragraphs-repo; coverage from `synced` flags |
| lib/source-resolve.js | copy checks via `multiSearch` | engine.find (keyword layer) |
| agents/agent-librarian.js | imports getMeili (legacy agent) | delete if unused |

**(a) Index writes outside the sync worker — WRONG, mark dirty instead**
| routes/library.js ~2049 | admin doc edit writes DOCUMENTS + PARAGRAPHS | update SQLite, mark dirty |
| services/library-watcher.js ~807 | metadata changes written straight to Meili | mark dirty |
| routes/admin.js ~1172, ~1358 | deletes paragraphs/doc in Meili | soft-delete in SQLite; writer deletes |
| services/indexer.js | full re-index / delete-all helpers | index-writer (admin-only, explicit) |
| lib/meili-pending.js, lib/graph-meili-sync.js | ad-hoc deletes / raw HTTP to Meili | index-writer |

**(b) Ranking / secondary indexes — move behind engine.js, then to Qdrant**
| lib/search.js | paragraph hybrid/keyword/semantic + federation | engine/meili.js → engine/qdrant.js |
| lib/search/hype.js | HyPE question index (search + sync) | Qdrant `hype` (exists) |
| lib/search/entity.js, workers/graph-pipeline.js, graph-extractor.js | ENTITY_MENTIONS index | SQLite entity_mentions_v2 (indexed) — no engine needed |
| lib/search/concepts.js | CONCEPTS index | Qdrant collection or SQLite |
| lib/deep-research.js | DEEP_RESEARCH index | SQLite FTS or Qdrant |
| routes/tablets.js | cancels doc_meta tasks | goes away with the doc_meta index |
| routes/search.js, admin stats, public-api getStats | engine stats/health | repo counts + engine.health() |

**Dead code to delete** (verified unused before deletion): `workers/sync-processor.js` (duplicate of unified-worker per
CLAUDE.md), `agents/agent-librarian.js` if no caller, retired enrichment worker entry points (pm2-stopped since 07-10).

## Phases (each one shippable, measured, reversible)
- **P0** — this plan; ratchet test that freezes today's list (no NEW engine calls); deploy SQLite hydration. ← now
- **P1** — every (c) fetch → repos / `findDocuments` (FTS5 over all docs, migration 142 — built 10-09). Removes "Meili
  needed to answer". **DONE 10-09** (deploy pending): search hydration, documents/library/chat/public-api title search,
  audio, rag-adapter store, admin delete-by-author (now the guarded soft-delete). Ratchet 62 → 56 files.
- **P1b** — scripts onto the API: `window-core.loadRows` → paragraphs-repo (`paragraphsOfDoc`, async), then the authorship,
  bio, library and phrase-index scripts; a second ratchet freezes raw `new Database(` in scripts/ (shrink-only, like the
  engine ratchet). One-off scripts that are done are deleted, not migrated.
- **P2** — every (a) write → mark dirty; `index-writer` is the only writer; sync worker its only caller.
  **The missing piece: deletions.** The worker only upserts dirty LIVE rows, and `content.deleteParagraphsByDoc` hard-
  DELETEs — so nothing in the pipeline carries a removal to the index. That is why admin routes delete from Meili
  themselves and why an "orphan cleanup" cycle exists. Fix: an **index outbox** (`index_outbox(id, kind: upsert|delete,
  entity: paragraph|doc, key, enqueued_at)`) written in the SAME transaction as the data change (soft-delete, re-ingest,
  merge); the index writer drains it per engine and records acks. Removals become as reliable as updates; the orphan sweep
  becomes a check, not a mechanism; deleting an engine = dropping its consumer.
  **BUILT 10-09** (migration 143, `api/lib/index-outbox.js`): triggers on content (soft delete · duplicate · DELETE) and
  docs (deleted / duplicate_of / DELETE → all its paragraphs) fill `index_outbox` in the same transaction; the worker drains
  it to the doc's Meili index AND Qdrant phrases/paragraphs_kw/hype (the first runtime Qdrant delete), skipping ids live
  again. The worker no longer RE-UPSERTS deleted/duplicate rows (the lost sync-processor split — the survey's main finding);
  hydration dropped its Meili fallback (it resurrected deleted rows) and excludes duplicates; `meili-pending.js` retired;
  DELETE /server/document no longer crashes halfway. Survey of every removal path: subagent report 10-09 (24 paths, 9 gaps).
  **Still to do:** the historical backlog — 807,948 soft-deleted + 1,914 duplicate + 151,164 live-in-deleted-doc paragraphs
  were never removed from Meili (and some from Qdrant). Enqueue in controlled batches off-peak (Qdrant optimizer at 1 thread —
  see feedback_qdrant_bulk_payload_io), not on deploy. Then: site-only stores (siteDbReplaceContent) enqueue explicitly;
  the orphan sweeps become a read-only check.
- **P3** — `engine.js` interface; Meili ranking code moved behind it unchanged; Qdrant implementation beside it; secondary
  indexes (entity, concepts, deep-research, HyPE) moved to SQLite/Qdrant.
- **P4** — switch production to Qdrant once batteries pass (planning/search-ab-20261009.md); keep Meili hot as fallback 1 week.
- **P5** — delete Meili: adapter files, settings, PM2/systemd unit, backups; ratchet allowed-list = ∅.
- Then: concept extraction + new HyPE (Chad 10-04), written once, into one engine.

## Standards for the refactor
- File header (1–3 lines): purpose, deps, non-obvious behaviour. No duplicated logic: one builder per shape (`paragraphDoc`).
- Pure cores + thin I/O shells (as `bio-timeline.js`, `window.js`): testable without a DB.
- Every phase: tests first for the moved behaviour, batteries before/after for search changes, no deploy during a battery.
