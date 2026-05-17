# api/lib/migrations — Versioned DB migrations (split from migrations.js)

The original `api/lib/migrations.js` was 2,645 lines holding every
migration object inline. Split into version-bucketed files; the runner
combines them on import.

- `runner.js` — `runMigrations`, `runContentMigrations`, `runUserMigrations`, `getMigration44SQL`. Owns `_schema_version` / `_user_schema_version` bookkeeping. Imports the three version-bucket files and merges them into one dispatch table.
- `v1-v25.js` — base schema, early indexes, ingestion queue.
- `v26-v45.js` — file-hash uniqueness, slug + redirect infrastructure, document_failures, table_counts, embedding cache, segmenter/translation tables.
- `v46-v58.js` — partial indexes, HyPE/disambig columns, doc_pages + published_conversations, translation_cache, content.is_duplicate, external-site columns (source_site, source_url, duplicate_of, external_para_id, external_id), supersession-lookup covering index.
- `v72-v90.js` — entity layer (migration 72): 14 new tables (entity_aliases, entity_mentions, paragraph_roles, entity_sets, set_members, quote_clusters, quote_instances, paragraph_extractions, extraction_validations, extraction_runs, er_audit_log, model_calibration, promotion_queue, authority_tiers, significance_markers, periods, episodes, pending_bridge_relations) + extends graph_entities/graph_relations/content/docs.
- `user.js` — `userMigrations` (1..3) + `USER_DB_CURRENT_VERSION`. Runs against USER_DATABASE_URL.

## Adding a new migration

1. Increment `CURRENT_VERSION` in `runner.js`.
2. Add the new migration object to `v46-v58.js` (or create `v59+.js` and import in runner).
3. Each migration is a single `async () => { ... }` keyed by version number.
4. Use idempotent ALTER (try/catch on `duplicate column`) for column additions.
5. ANALYZE the table after creating new high-impact indexes — see migration 58 for the pattern (+ note about needing manual ANALYZE on tower-nas after deploy).

The `api/lib/migrations.js` file remains as a thin re-export shim; new
imports should target `api/lib/migrations/runner.js` directly.
