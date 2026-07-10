# 07 — Embeddings & the Vector Index

> **The RAG problem:** full-precision vectors over millions of paragraphs make the index huge,
> slow to build, and slow to search. Premium embedding dimensions cost storage and latency for
> quality you may not need. How do you keep semantic quality while making the index small and
> fast enough to serve thousands of queries per second?

This document explains the three compounding compression decisions SifterSearch makes — model,
dimensions, and quantization — and why each is safe.

---

## 1. The embedding model

**Model:** OpenAI `text-embedding-3-large`.
**Dimensions used:** **512** (not the native 3072).
**Where:** `createEmbedding` in `api/lib/ai.js` → `embedOpenAI` in `api/lib/ai-services.js`.

`text-embedding-3-large` natively produces 3072-dimensional vectors. SifterSearch stores only
the first **512**. This is not truncation-and-hope; it works because the model was trained with
**Matryoshka Representation Learning (MRL)**.

### Why 512 dimensions is safe: Matryoshka embeddings

MRL trains a single embedding so that its *prefix* is itself a usable embedding. The first 512
dimensions of a 3072-dim MRL vector carry the coarsest, most information-dense semantic axes; the
remaining 2560 add finer resolution with diminishing returns. So you can slice a 3072-vector to
512 and keep the great majority of its retrieval quality, at 1/6 the storage and far faster
distance computation.

The internal reasoning was explicit and worth preserving as a lesson:

- "Large vectors consume a lot of DB indexing." Storage and index-build time scale with
  dimensions. At millions of paragraphs, 3072-dim vectors are *"very very slow to index."*
- "We want to index a lot of material." The corpus is large and growing; the index has to stay
  cheap per paragraph.
- "3072 seems like a bit much." 512 was chosen as the point where quality is still excellent but
  the index is 6× cheaper.

> **Cost note.** Reducing dimensions does **not** reduce the OpenAI bill — embeddings are billed
> per *input token*, not per output dimension. Dimensions trade against *index size and search
> speed*, not API cost. The embedding spend (~$199 in one stretch) came almost entirely from
> **volume**: HyPE multiplies embedding calls ~5–6× by embedding several hypothetical questions
> per paragraph (see [04](04-hype.md)). That cost was accepted deliberately for the retrieval
> quality HyPE buys.

### The embedding call, made bulletproof

`embedOpenAI` must never fail on adversarial input, because a single failing input in a batch can
stall an entire ingest loop (see [08](08-operations-and-stability.md) on convergence). Two hard
limits are enforced before anything reaches OpenAI:

```js
const MAX_EMBED_CHARS = 8000;    // per input — stays well under the 8192-token model limit
const MAX_BATCH_CHARS = 200000;  // per request — stays under OpenAI's 300k-token request cap
```

- Every input is capped to `MAX_EMBED_CHARS` and empty strings are replaced with a single space
  (the API rejects empty inputs).
- Batches are bounded by **both** a count (`EMBEDDING_BATCH_SIZE = 50`) **and** the total character
  budget (`MAX_BATCH_CHARS`), so no request can exceed the model's per-request token ceiling.

The result: for any input any caller can produce, `embedOpenAI` returns vectors rather than
throwing a 400. This is a *convergence* property, not a nicety — it removes an entire class of
infinite-retry failure. (The production outage that motivated this: an oversized paragraph in the
`bahai-library` set kept 400-ing the embed call, so the ingester never recorded the file's hash,
so it re-ingested the same file forever at 100% CPU. The cap made the loop terminate.)

---

## 2. The vector index (Meilisearch)

Vectors live in Meilisearch as a **user-provided embedder** on the `paragraphs` index (and on the
`hype_questions` sidecar index). "User-provided" means SifterSearch computes the vectors itself
(via OpenAI) and hands them to Meili; Meili does not call any embedding API. The embedder
settings:

```jsonc
// PATCH /indexes/paragraphs/settings
{
  "embedders": {
    "default": {
      "source": "userProvided",
      "dimensions": 512,
      "binaryQuantized": true
    }
  }
}
```

Meili builds an approximate-nearest-neighbor (ANN) graph (an arroy/HNSW-style structure) over
these vectors. Search is then hybrid: a keyword (BM25) query and a vector query run together and
their rankings are fused (see [06](06-retrieval.md)).

### Binary quantization: the second compression

`binaryQuantized: true` stores each dimension as a **single bit** (sign only) instead of a 32-bit
float. For a 512-dim vector that is 512 bits (64 bytes) instead of 2048 bytes — a **32× reduction**
in the vector index. Distance is computed with Hamming/popcount operations that are enormously
faster than float dot-products, giving roughly an order-of-magnitude (10–40×) speedup in the ANN
search.

Why this is safe for retrieval quality: in high-dimensional MRL space the *sign pattern* of the
dimensions already carries most of the discriminative signal for coarse retrieval. Binary
quantization loses fine-grained ranking precision, but that precision is recovered by the layers
downstream — the keyword half of the hybrid search, and the cross-encoder **reranker**
([06](06-retrieval.md)) which re-scores the top candidates with a full-precision model. The vector
index only has to get the right paragraphs into the candidate pool; the reranker orders them.

> **Operational caveats (learned the hard way).**
> - Enabling `binaryQuantized` on an index that already holds vectors triggers a **one-time
>   re-quantization** of every existing vector. For ~4M paragraphs this is a multi-hour,
>   single-pass rebuild that blocks other indexing tasks until it finishes. Enable it during a
>   maintenance window, not under load.
> - It is **irreversible** through settings. Turning it back off requires re-adding vectors.
> - The startup code guards against PATCHing the embedder mid-rebuild; a dedicated ops script
>   (`scripts/siftersearch-enable-binary-quant.mjs`) performs the deliberate one-time enable and
>   polls the resulting task to completion.

---

## 3. Putting the compressions together

| Stage | Representation | Size per paragraph vector | Relative cost |
|---|---|---|---|
| Native model output | 3072 × float32 | 12,288 bytes | 192× |
| MRL truncation to 512 | 512 × float32 | 2,048 bytes | 32× |
| + Binary quantization | 512 × 1 bit | 64 bytes | 1× |

The full stack is a **192× reduction** in vector-index footprint versus the naive
"store the model's raw output" approach — with the quality gap closed by disambiguation (better
inputs), HyPE (better recall), hybrid keyword search, and cross-encoder reranking (better final
ordering). This is the central lesson of the document: *compress aggressively at the index, and
recover quality with cheaper signals elsewhere.*

---

## 4. Recreating this

1. Embed with an MRL-capable model; store a prefix (512) rather than the full vector.
2. Cap and batch inputs so the embed call cannot fail on adversarial text.
3. Register the vectors as a user-provided embedder with `binaryQuantized: true`.
4. Do not rely on the vector index for final ranking — put a keyword signal and a reranker after
   it.
5. Treat the vector index as a disposable projection of your source-of-truth store, so you can
   re-embed or re-quantize at will (see [01](01-data-model.md), [02](02-ingestion.md)).

→ Next: [08 — Operations & stability](08-operations-and-stability.md), where convergence and the
embed-cap failure story are treated in full.
