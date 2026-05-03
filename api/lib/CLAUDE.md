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
- `enhancement-ai.js` — disambiguation + HyPE prompt builders for the local Qwen path.
- `enrichment-prompts.js` — prompt strings used by the enrichment workers.
- `enrichment-runner.js` — kicks the enrichment pipeline.
- `sonnet-enrichment.js` — Anthropic batch API path for tier 1-7 paragraphs (Sonnet 4.6).
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
- `graph-db.js` — graph-DB (people/places/documents) helpers.

## Domain-specific
- `authority.js` — `getAuthority({author, religion, collection})`. Used by search ranking.
- `doc-tier.js` — `getDocTier(doc)` returns 1–9 for enrichment priority (Bahá'í primary highest).
- `backup.js` — daily SQLite + Meili backup jobs.
- `storage.js` — R2 / S3 file storage.

## Subdirectories
- `constants/` — shared enums + lookups (one file per concern).
- `migrations/` — `v1-v25.js`, `v26-v45.js`, `v46-v58.js`, `user.js`, `runner.js`. Combined dispatch via runner.
