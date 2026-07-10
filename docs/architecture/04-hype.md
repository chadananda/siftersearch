# 04 — HyPE: Hypothetical Prompt Embeddings

> **The RAG problem (the vocabulary gap):** users ask *questions*; scripture makes *statements*.
> "How should I treat someone who wronged me?" and "Consort with all the peoples of the world in a
> spirit of loving-kindness" are a perfect semantic answer-pair, yet their embeddings sit far
> apart — one is an interrogative about interpersonal conflict, the other a serene imperative.
> HyPE closes that gap by indexing what each passage *answers*, not just what it *says*.

HyPE is the enrichment layer that most improves felt retrieval quality, and it is the reason the
embedding bill is what it is. It is worth understanding precisely.

---

## The idea

For every paragraph, generate a handful of **hypothetical questions that the paragraph answers**,
plus (for high-value doctrinal passages) a one-sentence **thesis** stating the paragraph's core
claim. Embed those questions and store them in a **sidecar index** (`hype_questions`) whose entries
point back to the paragraph. At search time, embed the user's question and match it against this
index of *other questions*. A user question that closely matches a stored hypothetical question is
a strong signal that its paragraph is the answer — even when the paragraph's own words share little
vocabulary with the query.

This inverts the usual matching geometry. Instead of *query-question ↔ document-statement* (a
mismatch), HyPE gives you *query-question ↔ hypothetical-question* (a match).

---

## Generation

> **As of 2026-07-10, HyPE is generated per-BOOK by one gated stage, not two always-on tier-split
> workers.** The old paths — a local-Qwen bulk worker (`siftersearch-enrichment`) and a Sonnet-batch
> worker (`siftersearch-enrichment-api`), both scanning raw `content` and writing newline-joined
> questions — are **retired**. HyPE now runs as `hype-book.mjs`, a stage in the unified pipeline that
> is gated behind disambiguation (`assertDisambiguated`) and processes whole books in authority order.
> Model tiering is by DeepSeek: **v4-flash for bulk, v4-pro for flagship + doctrinal** passages,
> prefix-cache-friendly. See [unified-enrichment-pipeline.md](unified-enrichment-pipeline.md). The
> register design below still holds; only the runner, models, and storage format changed.

For each paragraph, HyPE generates a **thesis** plus questions across distinct registers deliberately
chosen to cover how different people search for the same idea:

1. **Conversational** — how a thoughtful friend would ask, casually.
2. **Topical** — an academic framing of the central idea.
3. **Philosophical** — the doctrinal stake, what follows from the teaching.
4. **Cross-tradition** — the broader debate or tradition the passage speaks to.
5. **Distinctive phrase** — a striking phrase from the passage someone might search literally.

When a context window of neighbours is supplied, the surrounding paragraphs are explicitly marked
*context only, for pronoun resolution* — questions must be about the target paragraph alone. (Note
how this composes with disambiguation [03](03-disambiguation-and-segmentation.md): the questions are
generated over text whose references are already resolved — the gate makes this a hard precondition.)

The generated questions are stored on the paragraph as a **JSON array** in `content.hyp_questions`,
and the thesis in a separate `content.hyp_thesis` (new format as of 2026-07-10). The old
newline-joined format is retired garbage — **589,926 old-format rows were purged corpus-wide** and the
`hype_questions` Meili index was cleared and rebuilt to hold only new-format HyPE.

---

## The sidecar index

A separate Meilisearch index, `hype_questions`, holds **one document per question** (and one per
thesis), each pointing back to its paragraph:

```jsonc
{
  "id": "<paragraph_id>_<n>",       // or "<paragraph_id>_t" for the thesis
  "paragraph_id": <back-reference to content.id>,
  "doc_id": …, "religion": …, "collection": …, "authority": …,
  "question_text": "How should one treat those who cause harm?",
  "is_thesis": 0,
  "_vectors": { "default": [ …512-dim embedding of question_text… ] }
}
```

Index settings: `searchableAttributes: ['question_text']`; the same user-provided, 512-dim,
binary-quantized embedder as the main index ([07](07-embeddings-and-vector-index.md)).

### Sync (convergent, like everything else)

`syncHypeBatch` (`api/lib/search/hype.js`) drains paragraphs where `enhanced_synced = 0` and
questions/thesis exist: it builds the per-question Meili docs, batch-embeds all the question strings
in one call, upserts them, and only then sets `enhanced_synced = 1`. Pure citation/attribution
lines are skipped as search noise. The independent `enhanced_synced` flag is why HyPE sync converges
on its own schedule without blocking paragraph sync ([01](01-data-model.md), [08](08-operations-and-stability.md)).

> **This is the embedding-cost driver.** Five questions per paragraph means roughly 5–6× the
> embedding volume of the paragraphs alone. That multiplier — not the choice of dimensions — is
> what produced the notable embedding spend. It was accepted deliberately: HyPE's retrieval-quality
> gain is judged worth the volume. (Dimensions affect *index size and speed*, not API cost, which is
> per-token — see [07](07-embeddings-and-vector-index.md).)

---

## Search-time fusion (Reciprocal Rank Fusion)

At query time the system searches several indexes in parallel — the main `paragraphs` index, the
`hype_questions` sidecar, and the entity index — and fuses their rankings with **Reciprocal Rank
Fusion (RRF)**, aggregating by `paragraph_id`:

```
score(paragraph) = Σ_index  weight_index / (K + rank_in_index)      // K = 60
```

with HyPE weighted highest (~1.5) because a question-to-question match is the strongest signal,
the main text ~1.0, entities ~1.0. Only the best HyPE hit per paragraph counts.

**Why RRF rather than a trained fusion model?** RRF needs no training and no score calibration
across differently-scaled indexes — it uses only *ranks*. A paragraph that ranks well in *multiple*
indexes (matched both on its text and on one of its hypothetical questions) rises to the top. And
because it's purely additive over indexes, you can add a new sidecar (a new signal) without
destabilizing the existing ranking — a valuable property when the retrieval stack keeps growing.

### A worked example

> **Query:** "What is the nature of the soul?"
> **Paragraph text:** "The spirit of man is immortal, proceeding from the eternal realm."
>
> - *Main-index vector match:* moderate — topics overlap but vocabulary ("soul" vs "spirit") and
>   form (question vs statement) differ.
> - *HyPE match:* one stored hypothetical question is "What is the nature of the human spirit?" —
>   a near-direct match to the query. High signal.
> - *Fused result:* the paragraph surfaces strongly, because two independent signals agree, where a
>   plain vector search would have ranked it middling.

---

## Recreating this

1. For each chunk, generate several hypothetical questions it answers (and a thesis for key
   passages), across varied registers so different phrasings all match.
2. Store one embedded question per row in a sidecar index that references the chunk.
3. Give the sidecar its own convergent sync flag.
4. At query time, search main + sidecar (+ any other signals) and fuse by RRF on the chunk id,
   weighting the question-index highest.
5. Budget for the ~5–6× embedding volume; it is the price of the quality gain.

→ Next: [05 — The entity knowledge layer](05-entity-knowledge-layer.md), where the system stops
retrieving *passages* and starts reasoning about *people and events*.
