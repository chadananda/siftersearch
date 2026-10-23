# Content write cost: why one row cost 100–160 ms, and what was cut (10-23)

**Trigger.** On 10-23 a 100-row `INSERT INTO content` batch from the media ingest held the single writer for 9.8 s,
about 98 ms per row. That logged BLOCKING writes at 15:01:47 and 15:02:07, plus slow hourly batches. The ingester's
adaptive batching (`api/lib/adaptive-batch.js`) works around the symptom. This document covers the per-row cost itself.

**Where the numbers come from.** The production inventory comes from the new ops report
`node scripts/ops/ops.mjs report table-schema --params '{"table":"content","days":30}' --wait`, which reads `sqlite_master`,
`pragma_index_list/xinfo`, `sqlite_stat1`, the foreign keys of the child tables, and the query plans recorded in 30 days of
`slow_query_log` (2,000 plans). Code usage comes from grepping every SQL predicate in `api/ scripts/ worker/`. Costs were
measured on a bench copy of the dev database (1.39M real rows, full schema, embeddings shrunk to 1 byte, foreign_keys ON,
WAL, 512 MB cache). Scripts: scratch `build-bench.cjs` and `bench3.cjs`. The workload is deterministic and every variant
starts from the same copy.

## 1. Inventory (tower, 10-23): 42 indexes, 11 triggers, 4.83M rows

Tower has drifted from the migrations. Seven of its indexes exist in no migration, because they were created by hand:
`doc_upd_unsynced`, `doc_id_cover`, `sync_lookup`, `synced_deleted`, and the `(doc_id, deleted_at)` form of
`doc_deleted`. Always inventory tower; never assume the migrations describe it.

**Which indexes a fresh paragraph is written into.** A new row has embedding NULL, synced 0, enhanced_synced 0,
graph_enriched 0, and context/hyp/para_meta NULL, so it lands in about 30 of the 42 b-trees. Most have
append-at-the-end keys, such as rowid, a constant plus rowid, or doc_id (clustered within a batch). The expensive ones
are the **random-key** indexes, where each row dirties its own leaf page. Those are `content_hash` (md5) and every
`normalized_hash` index that includes unembedded rows.

| index (content) | rows (stat1) | recorded plans | code use | verdict |
|---|---|---|---|---|
| idx_content_doc (doc_id) | 4.83M | 0 | docs→content ON DELETE CASCADE key; doc lookups | **keep**. FK needs a full index |
| idx_content_doc_deleted (doc_id, deleted_at) WHERE deleted_at IS NULL | 4.70M | 82 | every "a doc's live rows" | **keep** |
| idx_content_doc_id_cover (doc_id) WHERE deleted_at IS NULL | 4.70M | 0 | none | **dropped**: exact prefix of doc_deleted, same WHERE |
| idx_content_doc_upd_unsynced (doc_id, updated_at DESC) WHERE synced=0 AND deleted_at IS NULL | 523k | 0 | none | **dropped**: exact duplicate of dirty_doc_updated |
| idx_content_dirty_doc_updated (same) | 523k | 0 | content.js getDirtyParagraphsForDoc | keep |
| idx_content_unsynced (synced) WHERE synced=0 AND deleted_at IS NULL | 523k | 0 | comments only | **dropped**: exact prefix of unsynced_partial |
| idx_content_unsynced_partial (synced, deleted_at), same WHERE | 523k | 0 | progress.js / worker unsynced COUNT | keep |
| idx_content_unsynced_enhanced (enhanced_synced) WHERE enhanced_synced=0 AND deleted_at IS NULL | 4.45M | 0 | none | **dropped**: exact prefix of enhanced_unsynced |
| idx_content_hash (content_hash) | 4.83M | 0 | **no SQL filters, joins or groups content by content_hash** (the ingester compares hashes in memory over rows fetched by doc_id) | **dropped**: unused, random key |
| idx_content_hash_embedding (content_hash, embedding_model) WHERE embedding IS NOT NULL | 4.81M | 0 | same | **dropped**: unused |
| idx_content_needs_embedding_v2 (embedding, deleted_at, id) WHERE emb NULL AND del NULL | 7.3k | 1,869 | embedding worker | keep |
| idx_content_normalized_hash (normalized_hash, embedding_model) WHERE embedding IS NOT NULL | 4.81M | 24 | propagation, copies, carry | keep |
| idx_content_oversized (normalized_hash, embedding, deleted_at, LEN>6000) WHERE emb NULL AND del NULL | 7.3k | 24 | propagateEmbeddings (covering) | keep |
| idx_content_hash_embed_length (normalized_hash, …, LEN<=6000), same WHERE and rows | 7.3k | 0 | none: same row set as oversized | Chad list |
| idx_content_embed_length (embedding, deleted_at, LEN<=6000), same WHERE | 7.3k | 0 | none: the planner takes needs_embedding_v2 for every length query | Chad list |
| idx_content_needs_embedding (deleted_at, normalized_hash) WHERE embedding IS NULL | 15k | 0 | lookup.js count without deleted filter | keep (small) |
| idx_content_norm_active (normalized_hash, doc_id) WHERE deleted_at IS NULL | 4.70M | 9 | copies, sites-ingester, xl-link | keep (random key, needed) |
| idx_content_graph_unsync (graph_enriched) WHERE graph_enriched=0 AND deleted_at IS NULL | ~4.8M | 0 | only the **retired** graph-extractor (07-10); progress.js stopped counting it | Chad list, strong |
| idx_content_doc_graph (doc_id, graph_enriched) WHERE graph_enriched=0 | 4.82M | 0 | only the retired graph-extractor | Chad list, strong |
| idx_content_needs_thesis (id) WHERE hyp_thesis IS NULL AND deleted_at IS NULL | 4.36M | 0 | only LEGACY sonnet-enrichment (retired) | Chad list |
| idx_content_enhanced_unsynced (enhanced_synced, deleted_at) WHERE enhanced_synced=0 AND del NULL | 4.45M | 0 | HyPE→Meili flag; Meili retired 10-21 | Chad list |
| idx_content_synced (synced) | 4.83M | 0 | no `synced = …` query without `deleted_at IS NULL` found | Chad list |
| idx_content_synced_deleted (synced, deleted_at) WHERE deleted_at IS NULL | 4.70M | 0 | covered by unsynced_partial for synced=0; tower-only | Chad list |
| idx_content_recently_synced (updated_at DESC) WHERE synced=1 | 4.18M | 0 | migration 77's /health/pipeline 2 h count; worker.js:565 | Chad list (check that the route still exists) |
| idx_content_sync_lookup (doc_id, paragraph_index) WHERE synced=0 AND del NULL | 523k | 0 | none found; tower-only | Chad list |
| idx_content_deleted_at (deleted_at) | 4.83M | 1 (snapshot live-paras COUNT) | known planner trap (hype.js: picked it over hype_to_sync → 54 s scan) | Chad list; doc_deleted serves the COUNT |
| idx_content_not_duplicate (is_duplicate) WHERE is_duplicate=0 AND del NULL | 4.67M | 0 | none found | Chad list (cheap: append key) |
| idx_content_needs_context (doc_id, paragraph_index) WHERE context IS NULL AND del NULL | 4.06M | 0 | content.js:702 (context IS NULL AND graph_enriched=1) | Chad list |
| idx_content_translation_by (translation_by, translation_version), **full** | 4.83M | 0 | translator-repo report (`IS NOT NULL`) | Chad list: rebuild as partial `WHERE translation_by IS NOT NULL` |
| hype_to_sync, needs_hype, hype_hash, has_embedding, para_meta_null, external_para, is_duplicate, attribution_line, topic_tags, grounded_unsync, has_original, translator, dirty_updated | — | 0 | named in code, small partials, or tests rely on them | keep |

**Triggers (11).** Two are index-outbox triggers (`content_outbox_leave`, `content_outbox_delete`), and they are needed.
The other nine maintain `table_counts`: `trg_content_insert`, `_soft_delete`, `_undelete`, `_synced`, `_unsynced`,
`_embedding_set`, `_embedding_clear`, `_insert_doc_count`, `_delete_doc_count`. Nothing in `api/ scripts/ src/ worker/`
reads `table_counts`. Two of those nine were the O(n) ones:

* `trg_content_insert_doc_count` ran `(SELECT COUNT(*) FROM content WHERE doc_id = NEW.doc_id AND deleted_at IS NULL AND id != NEW.id) = 0`
  on every inserted row. That counts the document's live rows each time.
* `trg_content_delete_doc_count` ran the same count on every soft-deleted row. Retiring a book was therefore O(n²).

**Foreign-key children.** `foreign_keys` is ON in better-sqlite3, so deleting a content row looks up every child table by
its key column. With no index on that column, the lookup is a full scan of the child table for each deleted row.
`paragraph_extractions.content_id` (18k rows, with large `output_json`) had no index. Neither did `paragraph_roles`,
`quote_instances`, `set_members`, `significance_markers` or `pending_bridge_relations`, which are empty today.
`enrichment_pending.content_id` is its INTEGER PRIMARY KEY, which is fine. This matches the slow-write log: in the last
~30k worker log lines, `DELETE FROM extraction_validations … paragraph_extractions WHERE content_id IN` appeared 265× at
an average of 382 ms, and `DELETE FROM content WHERE id` appeared 70× at an average of 212 ms.

## 2. Changes made

| migration | what | lock |
|---|---|---|
| **179** (98a87e07, live 10-23 22:31 UTC) | Both doc-count triggers now use `NOT EXISTS (…)` instead of `COUNT(*) = 0`. The predicate is identical, so the semantics are exact, quirks included; a random 3,000-op insert/soft-delete/undelete workload against the old triggers matches step for step (`tests/api/content-count-triggers.test.js`). DROP+CREATE run in one atomic batch. | schema-only, 3 ms |
| **180** | Drops 6 indexes (`doc_upd_unsynced`, `unsynced`, `unsynced_enhanced`, `doc_id_cover`, `hash`, `hash_embedding`), all exact duplicates or prefixes under the same WHERE, or keyed on `content_hash`, which nothing queries. Adds FK-child indexes on the six child tables. Each index is read once through dbstat **before** its DROP, on the migrating process's own connection, so the page reads happen outside the single writer. Each DROP then logs its size and `drop_ms`. Proof: `tests/api/content-index-prune.test.js` runs EXPLAIN over each query shape the dropped indexes could serve and checks they still use an index, and that the FK delete uses the new index. | ~0.1 s per 100 MB freed when warm (bench); about 50 MB, 50 MB, 40 MB, 3 MB, 2 MB, plus ~300 MB (hash) and ~400 MB (hash_embedding) estimated from bench bytes/row × tower rows |

## 3. Measured per-row cost (bench copy, local)

Deterministic workload, each variant starting from the same pristine copy. The table reports the median of 5. "Pages" is
WAL frames per row, which counts the pages dirtied and is the IO that tower's saturated `/fast` pool pays for.

| variant | insert into a 2k-row doc | insert into a new doc | soft-delete a 2k-row doc | soft-delete the 22.5k-row doc |
|---|---|---|---|---|
| before (tower schema of 10-22) | 1.20 ms · 15.8 pages | 0.88 ms · 14.8 pages | 0.13 ms · 1.65 pages | **8,503 ms** |
| + migration 179 (triggers) | 1.10 ms · 15.8 | 0.99 ms · 14.8 | 0.10 ms · 1.65 | **847 ms** |
| + drop content_hash pair + deleted_at prefix* | 0.73 ms · 10.9 | 0.60 ms · 10.0 | 0.10 ms · 1.64 | 863 ms |
| + Chad list (embed_length, oversized, needs_embedding, synced, graph_unsync, needs_thesis, translation_by → partial) | 0.52 ms · 8.9 | 0.46 ms · 8.1 | 0.08 ms · 1.33 | 844 ms |

\*The bench copy has the dev schema, where `idx_content_deleted_at` is an exact prefix of `(deleted_at, doc_id)`. On tower
the equivalent cuts are the six indexes in migration 180. Five of them are on the insert path: the four duplicates and
`content_hash`, which is the random-key one.

How doc size affects it, under the old triggers: inserting into a 22.5k-row doc cost 1.16 ms per row, against 0.28 ms per
row with NOT EXISTS. Soft-deleting that doc cost 5.7 s, against 0.44 s.

FK child index (`paragraph_extractions` with 18k rows of ~1.5 KB, as on tower): `DELETE FROM content` cost **8.4 → 1.6 ms
per row**.

Why tower is ~100× the bench: the bench is CPU-bound with every page in memory. On tower each random-key leaf page that
isn't cached is a read from a pool already serving ~340 reads/s and ~470 writes/s, at load 60–100. A plain `COUNT(*)` on
docs takes 1.4 s there. Cutting **pages dirtied per row** (15.8 → 10.9 → 8.9) is the lever that carries over. The trigger
fix removes the doc-size term from inserts and the n² term from deletes. Note that the bench inserted sha256 hashes,
twice the length of the real md5 ones, so the content_hash page count is slightly overstated.

**Tower before (write-stats, 6 h ending 22:3x UTC 10-23, triggers already fixed):** siftersearch-media unnamed batches
averaged 6.2 ms per statement (max batch 9,771 ms). siftersearch-embedding averaged 6.8 ms per statement (max 8,836 ms).
The writer was busy 4.5% overall, with a p95 minute of 11.9%. Re-run
`node scripts/ops/ops.mjs report write-stats --params '{"hours":6}' --wait` after migration 180 and compare these
per-statement figures. Also count `Slow write` lines for `INSERT INTO content` / `DELETE FROM content` /
`DELETE FROM extraction_validations` in the worker log.

## 4. Awaiting Chad: further drops, ordered by write cost saved

Each of these is written on every insert, or on every sync/embedding update, and nothing in the current code needs it.
I did not drop them, because each either belongs to a code path that still exists or needs a decision.

1. **idx_content_doc_graph + idx_content_graph_unsync**: ~9.6M entries together, and every new row enters both because
   graph_enriched defaults to 0. Only `api/workers/graph-extractor.js` reads them, and that worker was retired 07-10.
   Drop both. If the graph extractor ever comes back, rebuild them then.
2. **idx_content_needs_thesis** (4.36M): only `sonnet-enrichment.js` reads it, and that is LEGACY (retired 07-10).
3. **idx_content_enhanced_unsynced** (4.45M), plus `enhanced_synced` itself: this was the HyPE→Meili flag, and Meili was
   retired 10-21. `idx_content_hype_to_sync` is the one `search/hype.js` uses.
4. **idx_content_synced** (full) and **idx_content_synced_deleted**: every `synced = 0` query also says
   `deleted_at IS NULL` and uses `unsynced_partial`. No caller of `synced = 1` filters alone.
5. **idx_content_hash_embed_length and idx_content_embed_length**: these cover the same 7k rows as `oversized` and
   `needs_embedding_v2`, and no recorded or EXPLAINed plan uses them. Keep `oversized` (24 plans) and `v2` (1,869).
6. **idx_content_translation_by**: rebuild as partial `WHERE translation_by IS NOT NULL`. Today every row is in it,
   including NULLs. The rebuild is a full-table CREATE INDEX, so it needs a quiet window; measure it first.
7. **idx_content_deleted_at**: one plan uses it (the live-paras COUNT, which `doc_deleted` can serve). It is also the
   known planner trap from hype.js. Its keys are appended, so it costs little to keep; this is low priority.
8. **idx_content_recently_synced / sync_lookup / not_duplicate / needs_context**: check whether the /health/pipeline
   2 h count and the context pipeline still run, then decide.
9. **The nine `table_counts` triggers, plus the three on docs**: nothing reads `table_counts`. Dropping them removes two
   UPDATEs per inserted row and one per sync or embedding flip. It also needs a decision on the table itself.

## 5. Follow-ups

* Recommend `ANALYZE content` after migration 180, in a quiet window. `sqlite_stat1` has no row for some indexes (stat1
  is null for translator, translation_by, has_original, hype_hash and graph_unsync), so the planner is guessing there.
* `index-sizes` (heavy lane) measures true per-index bytes with dbstat. It walks every page, so run it when the host is
  calm, not under load 60+.
