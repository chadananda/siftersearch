# api/lib — Shared backend utilities

One-line index for AI navigation. Open the file for full documentation.

## Core infrastructure
- `db.js` — SQLite (better-sqlite3) wrapper. `query`, `queryOne`, `queryAll`, `transaction`. Reads + writes use one shared connection with WAL + 512MB cache.
- `logger.js` — Pino logger; every module imports `logger` from here.
- `config.js` — env-driven config object. `config.library.basePath`, `config.ai.embeddings.{model,dimensions}`, etc.
- `services.js` — start/health-check Meilisearch. `ensureServicesRunning`, `getServicesStatus`.
- `env-check.js` — boot-time required-var verification.
- `errors.js` — Fastify error handler + ApiError class.

## Auth / users
- `auth.js` — JWT + bcrypt. `authenticate`, `optionalAuthenticate`, `requireAdmin`, `requireInternal`.
- `anonymous.js` — anon-user fingerprint + rate-limit.
- `api-keys.js` — API key issuance + verification.
- `billing.js` — Stripe metered billing for API tier.

## Content / search infrastructure
- `content.js` — `content` namespace: paragraph CRUD, `insertParagraph`, `bulkInsertParagraphs`, `getDirtyParagraphsForDoc`, `markSynced`, embedding cache helpers. **Mega-file (1000+ lines).**
- `search.js` — Meilisearch hybrid + keyword + multi-index + HyPE search; `initializeIndexes`, `multiIndexSearch`, `keywordSearch`, `hybridSearch`, `searchHypeQuestions`, `syncHypeBatch`, `indexDocument`. **Mega-file (2000 lines) — split deferred to focused session.**
- `search-cache.js` — in-memory TTL search result cache.
- `text-normalize.js` — shared normalization + hashing primitives. `normalizeForEmbedding`, `hashNormalized`, `hashContent`. Single source of truth for the regex used to dedup paragraphs across indexer / ingester / sites-ingester.
- `embedding-cache.js` — sidecar SQLite for cross-doc embedding reuse.
- `markers.js` — sentence/phrase marker primitives (`⁅s1⁆…⁅/s1⁆`).
- `slug.js` — `generateDocSlug`, `slugifyPath`. Used by ingester + redirect pipelines.
- `cloudflare-redirects.js` — push slug-change redirects to CF KV.

## AI / LLM pipeline
- `ai.js` — base OpenAI / Anthropic clients.
- `ai-services.js` — `aiService(name).embed/chat/segment` — provider-routed AI calls with usage logging.
- `model-registry.js` — `MODEL_REGISTRY` of all models with pricing + capabilities; helpers like `getModel`, `getModelsByType`.
- `enhancement-ai.js` — **LEGACY** (local-Qwen disambig+HyPE prompt builders; old newline HyPE format). Retired 2026-07-10.
- `enrichment-prompts.js` — **LEGACY** prompts for the retired enrichment workers.
- `enrichment-runner.js` — **LEGACY** enrichment kicker.
- `sonnet-enrichment.js` — **LEGACY** Sonnet batch path (wrote old newline-joined HyPE). Retired 2026-07-10; superseded by `pipeline/` + `scripts/entity-read/hype-book.mjs` (JSON-array HyPE).
- `jafar-pipeline.js` — three-stage Jafar chat pipeline (research → craft → reflect). **Mega-file (1100+ lines).**
- `document-subagent.js` — single-document QA sub-agent for Jafar.
- `translation-subagent.js` — JAFAR-grounded translation via CTAI API + LLM polish.
- `parallel-analyzer.js` — batched LLM result re-rank.
- `query-decompose.js` — multi-intent query splitter.
- `query-intent.js` — intent classifier for search.
- `reranker.js` — Voyage / cohere rerank wrapper.
- `window-sizer.js` — chunk-window sizing for AI calls.

## Pipelines / workflow
- `pipeline.js` — pipeline-version registry + invalidation reasons.
- `pipeline-scheduler.js` — pipeline-job scheduling.
- `publish-pipeline.js` — chat → published-conversation flow.
- `entity-resolution.js` — entity name dedup across docs.
- `object-extraction.js` — content_objects extraction prompts.
- `graph-db.js` — graph-DB helpers. Top-level exports (findEntity, resolveAlias, addAlias, mergeEntities, splitEntity, getMentions, getRelations, recordExtraction) use main sifter.db. Legacy `initGraphDb` opens a separate SQLite file (backward-compat).
- `entity-cost-tracker.js` — `trackCost`, `getMonthlySpend`, `checkBudget` for entity extraction pipeline spend tracking against `EXTRACTION_BUDGET_USD`.

## Domain-specific
- `authority.js` — `getAuthority({author, religion, collection})`. Used by search ranking.
- `doc-tier.js` — `getDocTier(doc)` returns 1–9 for enrichment priority (Bahá'í primary highest).
- `backup.js` — daily SQLite + Meili backup jobs.
- `storage.js` — R2 / S3 file storage.

## Subdirectories
- `pipeline/` — **unified enrichment pipeline v2** (the ONE gated orchestrator replacing the six legacy pollers): `state.js` (doc_pipeline), `profile.js`, `orchestrator.js`. Design: `docs/architecture/unified-enrichment-pipeline.md`. See `pipeline/CLAUDE.md`.
- `constants/` — shared enums + lookups (one file per concern).
- `migrations/` — `v1-v25.js`, `v26-v45.js`, `v46-v58.js`, `v72-v90.js` (latest; migration 89 = doc_pipeline), `user.js`, `runner.js`. Combined dispatch via runner.
