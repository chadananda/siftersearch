# Layered Indexing and Prefix-Cached Enrichment Requirements

## Goal
Implement a sequential, incrementally updatable indexing pipeline for the existing document and paragraph corpus that:
- deduplicates embeddings by normalized paragraph content,
- separates base retrieval, LightRAG object extraction, and downstream context / HyPE generation into independent layers,
- avoids full-stack reindexing when prompts, models, or metadata change,
- supports local vLLM/LMCache prefix-caching optimization without Anthropic-specific cache controls.

## Existing constraints
- `content` is the canonical paragraph store, currently ~4.17M rows.
- `docs` is the canonical document metadata store, currently 8,557 rows.
- SQLite is single-writer; all writes must continue through the unified worker.
- Soft deletes remain authoritative (`deleted_at IS NULL` everywhere).
- Existing `synced` / `enhanced_synced` semantics should be preserved or replaced by equivalent explicit job-state tracking.

## Architectural requirements

### 1. Canonical base records
- Keep `docs` and `content` as canonical source-of-truth tables.
- Remove long-term dependence on `content.embedding` as the primary embedding store; embeddings must move to a KV/dedup layer keyed by normalized content hash and embedding model/version.
- `content.normalized_hash` remains the stable dedup key for reusable paragraph-level embeddings.
- `content.content_hash` remains the exact-text change key for paragraph invalidation.

### 2. Embedding KV cache
Create a dedicated KV table for embeddings with at least:
- `normalized_hash`
- `embedding_model`
- `embedding_dim`
- `embedding_version`
- `embedding_blob`
- `created_at`
- `last_accessed_at`
- `source_count` or equivalent usage counter

Requirements:
- The same normalized content must never trigger a second embedding call for the same embedding model/version.
- Re-ingested duplicate paragraphs across different books must reuse the same cached embedding reference.
- Model migration (for example 3072-dim to 512-dim) must coexist without destructive rewrite; cache key includes model/version.
- `content` rows must reference embeddings logically by `(normalized_hash, embedding_model, embedding_version)` or an internal surrogate key.

### 2a. Legacy embedding migration, normalization, and reranking
- Use the existing `normalizeForEmbedding(text)` function as the canonical normalization for all embedding deduplication and reuse:
  - strip HTML tags,
  - collapse all whitespace to a single space,
  - remove all punctuation/symbols (keep Unicode letters, numbers, spaces) with `/[^\p{L}\p{N}\s]/gu`,
  - lowercase,
  - trim.
- Define `normalized_hash = MD5(normalizeForEmbedding(text))` as the sole content-based key for embedding reuse. Two paragraphs with identical normalized text must share one embedding entry regardless of document, metadata, or context.
- Migration of existing 3072-dim OpenAI `text-embedding-3-large` vectors must:
  - group rows by `(normalized_hash, embedding_model, embedding_version)`,
  - take a representative 3072-dim vector per group,
  - truncate to the first 512 float32 values,
  - L2-normalize the 512-dim vector, leveraging Matryoshka training (earlier dimensions capture most of the signal) to retain ~98% retrieval quality while shrinking storage and compute by ~6x,
  - insert one 512-dim entry per group into `embedding_cache`, keyed by `(normalized_hash, embedding_model, embedding_version, embedding_dim=512)`,
  - rewrite `content` rows to point at the cached entry instead of storing raw vectors inline.
- After verification, legacy 3072-dim blobs in `content.embedding` may be dropped; all new retrieval must use the 512-dim representations.
- Future embedding calls should request 512-dim embeddings directly where APIs support it and must always check `embedding_cache` by `normalized_hash` before calling out.
- Improvements in result quality are expected to come from better indexing, LightRAG enrichment, and external reranking (e.g., Voyage rerankers), not from increased dimensionality; assume Voyage (or equivalent) reranking on top of the 512-dim semantic retrieval as the primary ranking refinement layer.

### 3. Layered indexing model
The system must support three sequential indexing layers:

| Layer               | Purpose                                          | Primary input key                              | Output                                                       |
|---------------------|--------------------------------------------------|-----------------------------------------------|--------------------------------------------------------------|
| Base retrieval layer| BM25 + semantic retrieval in Meilisearch        | `content_hash`, `normalized_hash`             | base Meili document and embedding reference                  |
| Object graph layer  | LightRAG-derived entities, concepts, events, relations | `content_hash` + object pipeline version | `content.objects` and object-sidecar Meili index             |
| Enrichment layer    | disambiguation context and HyPE questions       | window/book/object hashes + pipeline version  | `content.context`, `content.hyp_questions`, enrichment-sidecar Meili index |

Requirements:
- Each layer must be independently rerunnable.
- Rebuilding a later layer must not require rebuilding earlier layers unless an upstream dependency changed.
- Meilisearch integration must support either same-index field augmentation or sidecar indexes; sidecar indexes are preferred for safer staged rollout.

### 4. LightRAG persistent corpus graph
- Build and persist a LightRAG graph/object database for the full corpus before large-scale context / HyPE generation begins.
- Update LightRAG incrementally whenever new or changed documents are ingested, before scheduling context / HyPE enrichment for those documents.
- The LightRAG layer must be conservative about entity linking across books and must strongly condition on:
  - `author`
  - `title`
  - `religion`
  - `collection`
  - `language`
  - `year` or derived era / period
- False cross-tradition or cross-era merges must be treated as a higher-severity failure mode than duplicate unresolved entities.

### 5. Object extraction outputs
Add or sidecar-store LightRAG-derived object metadata per paragraph with structured and rendered forms.

Minimum structured payload:
- `people[]`
- `places[]`
- `documents[]`
- `events[]`
- `concepts[]`
- `relations[]` as flattened triples or typed relation objects
- `source_doc_id`
- `source_paragraph_id`
- `author`
- `book_title`
- `religion`
- `language`
- `year_or_period`
- `object_pipeline_version`

Minimum rendered payload:
- compact deterministic text serialization suitable for Meilisearch searchability and for inclusion in LLM prompt windows.

Requirements:
- Structured payload is the source for auditing and future schema evolution.
- Rendered payload is the source for semantic indexing and prompt injection.
- Object payload generation must be cacheable independently of context / HyPE generation.

### 6. Sequential enrichment flow
Required processing order for a document:
1. Ingest/update `docs` and `content`.
2. Resolve embedding refs from embedding KV cache; generate only on miss.
3. Sync base retrieval layer to Meilisearch.
4. Run LightRAG object extraction / graph update for document paragraphs.
5. Sync object layer to Meilisearch.
6. Run document-level sliding-window enrichment for `context` and `hyp_questions` only after the object pass for that document is complete.
7. Sync enrichment layer to Meilisearch.

Requirements:
- Step 6 must operate on a stable full-document pass to maximize local prefix cache reuse.
- Partial-book context/question generation is not required in the first implementation.

## Prefix-cached local LLM requirements

### 7. Non-Anthropic prefix caching model
- The system must be optimized for vLLM automatic prefix caching and LMCache hierarchical KV storage, not Anthropic `cache_control` semantics.
- Prompt reuse must be achieved through byte-identical token prefixes, not named cache blocks.

### 8. Prompt block structure
Every enrichment request must be built from canonical blocks:
1. `instructions_block` — stable task instructions.
2. `book_meta_block` — canonical serialized book metadata.
3. `window_block` — canonical serialized 2N paragraph window with paragraph IDs.
4. `objects_block` — canonical serialized relevant LightRAG objects for the same 2N window.
5. `target_block` — tiny uncached selector, e.g. mode + target paragraph ID.

Requirements:
- `instructions_block`, `book_meta_block`, `window_block`, and `objects_block` must be deterministically serialized with fixed field order, separators, whitespace, and paragraph ordering.
- `target_block` must be the only intended high-churn suffix across calls in the same window.
- Disambiguation and HyPE generation should share one combined instruction block where feasible so the same cached prefix can support both tasks within a window.
- If combined instructions materially reduce output quality, fallback to two prefixes per window (`disamb` and `hype`) is acceptable.

### 9. Prefix cache key model
The implementation must explicitly track logical cache identities, even though vLLM only sees token prefixes.

Required logical hashes:
- `instructions_hash`
- `book_meta_hash`
- `window_hash`
- `objects_hash`
- `task_mode`
- `target_paragraph_id`

Artifact cache keys:
- Context artifact key:  
  `(instructions_hash, book_meta_hash, window_hash, objects_hash, task_mode='context', target_paragraph_id, context_pipeline_version)`
- HyPE artifact key:  
  `(instructions_hash, book_meta_hash, window_hash, objects_hash, task_mode='hype', target_paragraph_id, question_pipeline_version)`

Requirements:
- Artifact invalidation must be based on these logical keys, not on LLM-reported cache stats.
- Prompt construction must guarantee that identical logical prefixes produce identical token sequences.

## Window sizing requirements

### 10. Sliding window shape
- Use a 2N paragraph prompt window.
- Process all target paragraphs in that 2N window before sliding forward by N paragraphs.
- On each slide, discard the left N paragraphs and append the next N paragraphs with corresponding object payloads.

### 11. N sizing objective
`N` must be chosen dynamically to maximize prefix-cache reuse while staying within safe in-memory KV budget for the active vLLM instance.

Required sizing model:
- Reserve capacity for:
  - model/runtime overhead,
  - concurrent requests,
  - decode growth,
  - `instructions_block`,
  - `book_meta_block`,
  - serialized `window_block`,
  - serialized `objects_block`.
- Size by token budget, not paragraph count.
- Derive `N` from measured average tokens for:
  - paragraph body,
  - object payload per paragraph,
  - book metadata,
  - instructions,
  - output allowance.

Initial planning formula:

- `usable_prefix_tokens_per_request = floor((kv_cache_tokens_available - reserved_decode_tokens - reserved_concurrency_tokens - static_overhead_tokens))`
- `tokens_per_paragraph_unit = avg_paragraph_tokens + avg_object_tokens_per_paragraph`
- `2N = floor(usable_prefix_tokens_per_request / tokens_per_paragraph_unit)`
- `N = floor((2N) / 2)`

Implementation requirements:
- Maintain rolling empirical measurements for token counts by corpus segment and model.
- Recompute target `N` when model, prompt template, or object payload density changes.
- Start conservatively; prefer slightly smaller windows with high cache hit reliability over aggressive windows that cause eviction churn.

### 12. Practical sizing guidance
The scheduler must support configurable margins such as:
- `kv_budget_fraction_for_prefixes` (for example 0.4 to 0.6 of available live KV budget)
- `reserved_decode_tokens_per_request`
- `reserved_parallel_requests`
- `max_window_tokens_hard_limit`

The scheduler must log for each run:
- chosen `N`
- estimated prefix token count
- measured prompt token count
- cold vs warm wall-clock times
- LMCache hit/miss indicators if available

## Data model requirements

### 13. New tables (minimum)
Add, at minimum:

1. `embedding_cache`
2. `content_embedding_ref` or equivalent resolved pointer table
3. `content_objects`
4. `content_enrichment`
5. `pipeline_jobs`
6. `pipeline_versions`

Suggested responsibilities:

| Table                   | Responsibility                                              |
|-------------------------|------------------------------------------------------------|
| `embedding_cache`       | deduplicated embeddings by normalized hash + model/version |
| `content_embedding_ref` | resolved embedding pointer per paragraph                   |
| `content_objects`       | structured and rendered LightRAG outputs per paragraph     |
| `content_enrichment`    | context/questions plus prompt-window hash lineage          |
| `pipeline_jobs`         | job status, retries, timestamps, worker ownership          |
| `pipeline_versions`     | named versions for embedding/object/context/question pipelines |

### 14. Existing table changes
- `content.embedding` should become deprecated after migration is complete.
- `content.context` and `content.hyp_questions` may remain for convenience, but canonical provenance should live in `content_enrichment`.
- `content.synced` and `content.enhanced_synced` may be retained temporarily, but explicit per-layer sync state is preferred.

## Invalidation requirements

### 15. Rules
At minimum:
- Paragraph text change → invalidate base embedding ref, objects, context, questions.
- Document metadata change (`author`, `title`, `religion`, `year`, etc.) → invalidate objects, context, questions for all paragraphs in that document.
- Object extractor prompt/model/version change → invalidate objects, context, questions.
- Context prompt change → invalidate context only.
- HyPE prompt change → invalidate questions only.
- Window neighbor change → invalidate affected context/questions whose `window_hash` changes.
- Embedding model change → invalidate only embedding-dependent retrieval artifacts.

### 16. Soft delete behavior
- Soft-deleting a document must remove it from future sync outputs and graph updates, but cached embeddings may be retained because they are content-addressed and reusable.
- Graph/object rows tied only to deleted documents may be garbage-collected later via offline compaction.

## Meilisearch requirements

### 17. Index layout
Support at least two online layouts:
- **Base index**: paragraph text, heading, blocktype, translation, and embedding-backed semantic retrieval.
- **Enhanced index or sidecar index**: rendered object metadata, context, HyPE questions, and selected structured fields for filter/boost logic.

Preferred first rollout:
- Keep the current base index stable.
- Add an enhanced sidecar index keyed by paragraph ID.
- Fuse/re-rank results in application code.

### 18. Searchable enhanced fields
Minimum searchable/filterable candidates:
- `objects_rendered`
- `context`
- `hyp_questions`
- `religion`
- `author`
- `title`
- `year_or_period`
- entity arrays / relation arrays as flattened search-friendly strings

## Operational requirements

### 19. Throughput and scheduling
- Jobs must be document-scoped wherever possible.
- Book-level passes must be prioritized for the prefix-cached enrichment stage.
- Core books may be preprocessed first to seed the LightRAG graph before full-corpus rollout.

### 20. Observability
The system must log and expose at minimum:
- embedding cache hit rate
- object cache hit rate
- context/question artifact cache hit rate
- Meilisearch sync lag per layer
- average tokens per paragraph and per object payload
- chosen `N` per document/model
- cold vs warm latency for enrichment calls
- LMCache disk growth and eviction pressure

### 21. Success criteria
The implementation is successful when:
- duplicate paragraph embeddings are reused across documents without regeneration,
- new documents can be processed sequentially without rebuilding unchanged layers,
- LightRAG object extraction is persistent and incrementally maintainable,
- context and HyPE generation run in document sweeps optimized for local vLLM prefix caching,
- window sizing is data-driven and memory-aware,
- search can combine stable base retrieval with enhanced graph-aware fields.