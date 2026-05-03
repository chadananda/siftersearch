# api/routes — Fastify HTTP route handlers

Each file registers a route group. `api/index.js` mounts them under `/api/v1/`.

## Public-facing
- `public-api.js` — main public search + library + chat endpoints. **Mega-file (1,340 lines) — feature-by-feature split deferred.**
- `search.js` — search endpoints. Public + authenticated tiers.
- `chat.js` — `/chat/stream` SSE endpoint. Owns the OpenAI tool definitions for Jafar (search, library_overview, find_document_for_citation, read_document_for_question, translate_passage). Talks to `api/lib/jafar-pipeline.js`.
- `librarian.js` — public library browsing endpoints.
- `documents.js` — single-doc retrieval, slug resolution, content delivery.
- `services.js` — TTS, narration, on-demand transformations.
- `content.js` — DB-backed page CRUD (`/api/v1/pages`). Public reads + admin-key writes.

## Auth + user
- `auth.js` — login, signup, refresh, logout.
- `user.js` — user profile, settings.
- `session.js` — session lookups.
- `anonymous.js` — anon-user fingerprint endpoints.
- `api-keys.js` — issue + revoke API keys.
- `donations.js` — Stripe donation endpoints.
- `forum.js` — forum post + vote CRUD.

## Admin
- `admin.js` — internal-key-protected admin endpoints (jobs, library admin, enrichment, validation, sites). **Mega-file (3,910 lines) — split deferred.**
- `library.js` — admin library CRUD: ingestion triggers, metadata edits, LightRAG, publisher state. **Mega-file (3,860 lines) — split deferred.**
- `graph.js` — graph-DB query endpoints.
- `deploy.js` — deploy hooks.

## Notes
- Internal routes require `requireInternal` (X-Internal-Key header or admin JWT).
- Mega-files (admin, library, public-api) are slated for feature-by-feature splits; the current refactor pass focused on test coverage + naming + per-dir orientation rather than splitting these god-routes.
