# 02 — Ingestion: The Life of a Document

> **The RAG problem:** the quality ceiling of any RAG system is set at ingestion. Chunk badly and
> no reranker saves you; embed redundantly and you go broke; retry a bad file forever and you take
> the whole system down. This document follows one markdown file from the moment it lands to the
> moment it is searchable, and explains every decision along the way.

The pipeline has three phases: **parse & chunk** (file → SQLite), **embed** (lazy, cached), and
**sync** (SQLite → Meilisearch, verified). A watcher drives it; a single writer guarantees it
converges.

---

## 0. The trigger: the library watcher

`api/services/library-watcher.js` watches the library tree with `chokidar` plus an hourly full
disk scan. Two safety invariants govern what it will touch:

- **The religion-root whitelist.** Only directories marked with a `.religion/meta.yaml` file are
  eligible for ingestion. A stray markdown file elsewhere is ignored. This prevents accidental
  ingestion of scratch files.
- **External sites are separate.** Content from external sites lives under `<library>/-sites/<id>/`
  and is handled by the sites-ingester (§6), not the plain file path.

On an `add`/`change` event (or a scan finding a changed file) the watcher calls
`ingestDocument(text, metadata, relativePath)`.

---

## 1. Parse: markdown → typed blocks

`api/services/block-parser.js` turns raw markdown into a list of typed blocks. There are seven
block types: `paragraph`, `heading1/2/3`, `quote`, `list_item`, `code`. The parser splits on blank
lines and classifies each block by its leading syntax (```` ``` ```` → code, `#` → heading, `>` →
quote, `-`/`*` → list item, `{…}` → block attributes applied to the preceding block).

**Why parse to typed blocks rather than store raw markdown?** Two reasons. First, the stored
`content.text` is clean prose with no markup, so embeddings and keyword search aren't polluted by
`#` and `>` characters. Second, `blocktype` is retained, so search can filter (e.g. exclude
headings) and the display layer can reconstruct the markdown exactly.

A hard cap (`MAX_PARAGRAPH_SIZE ≈ 3000` chars) splits pathologically long blocks at sentence
boundaries (`/([.!?])(\s+)(?=[A-Z"'\d])/`), never mid-word.

---

## 2. Chunk: blocks → paragraphs

The chunk — one `content` row — is the atomic unit indexed and embedded. The chunking rules
(`parseDocumentWithBlocks` in `api/services/ingester.js`):

- **One block ≈ one chunk.** For ordinary prose the natural markdown paragraph *is* the chunk. No
  artificial re-splitting.
- **`maxChunkSize ≈ 1500` chars** (roughly the longest paragraph in *God Passes By*). Oversized
  paragraphs are split at the best available boundary, in priority order: a sentence marker in the
  60–100% window → a space in that window → any space before the limit → a space just past it. A
  mid-word split is the last resort and is logged.
- **`minChunkSize ≈ 20` chars.** Fragments shorter than this are dropped.

**Why paragraph granularity?** This is RAG problem #1 (chunk granularity). Too-large chunks blur
many ideas into one averaged vector — a query matching one sentence retrieves a wall of unrelated
text. Too-small chunks (sentence fragments) lose the context that makes a passage meaningful. The
natural paragraph is the sweet spot: a single coherent idea, small enough to embed sharply, large
enough to stand on its own. The 1500-char cap also keeps every chunk comfortably under the
embedding model's token limit and within downstream translation-API limits.

**Unpunctuated scripts** (classical Arabic, Farsi) have no paragraph structure to chunk on. The
ingester detects this (`isUnpunctuatedText`: punctuation count < words/50) and routes the document
through **AI segmentation** before chunking — a semantic boundary-finder covered in
[03](03-disambiguation-and-segmentation.md). This is RAG problem #3.

Each chunk is written to `content` with `synced = 0` (dirty), `content_hash`, and `normalized_hash`.

---

## 3. Change detection: don't redo work

The heart of an efficient ingester is *knowing what changed*. Three cases, decided by the two
document hashes (`file_hash` = whole file, `body_hash` = body only):

| Situation | Detection | Action |
|---|---|---|
| **Unchanged** | `file_hash` matches the stored doc | Skip entirely. No work. |
| **Metadata-only edit** (frontmatter changed, body same) | `file_hash` differs but `body_hash` matches | Update `docs` metadata; mark paragraphs dirty so the new title/author re-syncs to Meili — but **do not re-embed**. |
| **Rename/move** (body same, path changed) | No `file_path` match, but a `file_hash`/`body_hash` match exists | Update the path/collection metadata on the existing doc. No re-embed. |
| **Content changed** | `body_hash` differs | Re-chunk; reuse embeddings for paragraphs whose text is unchanged (matched by a word-level hash), embed only the new/changed ones. |

The lesson: **hash at two granularities so you can tell a metadata edit from a content edit.**
Conflating them means re-embedding an entire book because someone fixed a typo in its author field.

---

## 4. Embed: lazy and cached

Embeddings are generated lazily (by `embedding-worker.js` and during indexing) for paragraphs
where `embedding IS NULL`, then written back to `content`. The embedding call itself
(`embedOpenAI`) is hardened so it can never fail on adversarial input — see
[07](07-embeddings-and-vector-index.md). But the important architectural feature is the **cache**.

### The cross-corpus embedding cache

A religious corpus is extraordinarily repetitive: the same verse of the Qur'án, the same tablet,
the same quoted passage appears across dozens of compilations and histories. Embedding each copy
independently would waste most of the embedding budget. `getCachedEmbeddings` prevents that with a
two-phase lookup:

1. **Same-document phase.** Match the paragraph's `content_hash` against the document's previous
   version. On a hit, reuse the embedding *and* carry forward the enrichment sidecars (context,
   HyPE) — the "sidecar harvest."
2. **Global phase.** For paragraphs with no same-doc match, look up `normalized_hash` across the
   *entire corpus* for any paragraph that already has an embedding from the current model:

   ```sql
   SELECT normalized_hash, MAX(embedding) AS embedding, MAX(embedding_model),
          MAX(hyp_thesis), MAX(hyp_questions), MAX(context), MAX(context_model)
   FROM content
   WHERE normalized_hash IN (?, ?, …)      -- batched ≤200 to stay under SQLite's var limit
     AND embedding IS NOT NULL
     AND embedding_model = ?                -- only reuse vectors from the current model
   GROUP BY normalized_hash
   ```

The result is a "bundle" — embedding + HyPE + context — reused wholesale. Re-ingesting
OceanLibrary's *Tablet of Aḥmad* inherits the enrichment previously computed for another source's
copy, without re-running the (expensive) enrichment models.

> **Why `normalized_hash` and not `content_hash`?** `normalized_hash` strips punctuation, case, and
> formatting, so `"Hello, world!"` and `"hello world"` share a vector. Transliteration and
> formatting differ constantly across sources for what is textually the same passage; normalizing
> before hashing is what turns "the same passage in a different book" into a cache hit. The
> normalization regex lives in one place (`api/lib/text-normalize.js`) so the indexer, ingester,
> and sites-ingester compute *identical* keys — a subtle but critical requirement, since a
> divergent normalizer silently destroys the cache hit rate.

The observed payoff: roughly a third of new paragraphs hit the cache, cutting embedding cost and
ingestion time substantially.

---

## 5. Sync: SQLite → Meilisearch, verified

Ingestion writes paragraphs with `synced = 0`. A single dedicated worker
(`api/workers/sync-processor.js`, PM2 `siftersearch-worker`) is the *only* process that pushes
them to Meili and the *only* process that sets `synced = 1`. Its loop:

1. Read a batch of dirty paragraphs (`getDirtyParagraphsBatch(limit)`), joined with their doc
   metadata (title, author, religion — denormalized into the Meili record).
2. Convert the embedding BLOB to a float array; build Meili documents with `_vectors`.
3. `addDocuments(...)` and **wait for the Meili task to reach `succeeded`**.
4. Only then `markSynced(confirmedIds)` → `synced = 1`.

### Why verified, not optimistic

This is the load-bearing convergence decision. If the ingester (or the API) marked `synced = 1`
optimistically at write time and the Meili task later failed, the paragraph would be **silently
lost** — flagged as indexed but absent from the index, never re-queued. By making `synced = 1`
*mean* "Meili confirmed it," a failed task simply leaves `synced = 0`, and the next cycle retries
it. The flag converges: every paragraph ends either `synced = 1` (in Meili) or deleted.

Deletions and duplicates ride the same path: a paragraph with `is_duplicate = 1` or a non-null
`deleted_at` is *deleted* from Meili rather than upserted, then marked synced. A stale-task
reconciler (`reconcileMeiliSyncTasks`) re-queues sync tasks that never completed.

---

## 6. External sites: supersession, not duplication

`api/services/sites-ingester.js` ingests curated external sites (e.g. OceanLibrary) via per-site
adapters in `site-adapters/` (each provides `parseDoc` + `detectSupersedee`). Two behaviors
distinguish it from plain file ingestion:

- **Supersession.** When an external source publishes the canonical version of a text the corpus
  already has locally, `detectSupersedee` marks the local copy `duplicate_of` the canonical doc and
  its paragraphs `is_duplicate = 1`. The sync worker then removes the local copy from Meili, so
  search shows only the canonical source. (An adjudication step decides *same-work* by meaning, not
  by title string — a commentary is not its source, and a name coincidence is not a duplicate.)
- **Canonical protection.** `safeSoftDeleteDocs` refuses to soft-delete any
  `source_site = 'oceanlibrary.com'` doc, and circuit-breaks on oversized delete batches. This
  guard exists because earlier dedup logic once soft-deleted 155 canonical documents (128K
  paragraphs) by keeping the "most recently updated" copy with no canonical awareness. The guard is
  the structural fix: canonical originals are never the thing deleted.

---

## 7. Soft-delete and resurrection

Deletes are *soft*: `deleted_at` is set, the paragraphs are removed from Meili, but the rows —
crucially, their **embeddings** — stay in SQLite. If the file returns, ingestion detects the
soft-deleted doc, clears `deleted_at`, and the paragraphs re-sync immediately without re-embedding.
Deletion is reversible and cheap; nothing precious is thrown away.

---

## The life of a document, end to end

```
file lands
  → watcher (religion-root whitelist)         api/services/library-watcher.js
  → ingestDocument                            api/services/ingester.js
      → parse to blocks                        block-parser.js
      → chunk to paragraphs (≤1500, AI-segment if unpunctuated)
      → change-detect (file_hash / body_hash): skip · metadata-only · rename · re-chunk
      → write content rows (synced=0, content_hash, normalized_hash)
  → embed (lazy)                              embedding-worker.js + getCachedEmbeddings
      → same-doc cache → global normalized_hash cache → else call OpenAI
      → write embedding + carry HyPE/context sidecars
  → sync (verified)                           sync-processor.js
      → addDocuments → wait for 'succeeded' → markSynced(synced=1)
  → [enrichment layers run independently: disambiguation, HyPE, entity extraction]
```

Every arrow either completes or leaves a dirty flag set for a retry — the pipeline **converges**.
The failure that broke production (an un-embeddable file retried forever) is discussed as a case
study in [08](08-operations-and-stability.md); the fix was to make the embed call incapable of the
throw that prevented the file from ever recording its hash.

→ Next: [03 — Disambiguation & segmentation](03-disambiguation-and-segmentation.md), the first
enrichment layer — making each chunk able to stand on its own.
