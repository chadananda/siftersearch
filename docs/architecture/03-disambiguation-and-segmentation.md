# 03 — Disambiguation & Segmentation

> **Two RAG problems, one theme: a chunk must be a self-contained, coherent unit of meaning.**
> Segmentation ensures the chunk *has* sensible boundaries even in texts that lack punctuation.
> Disambiguation ensures the chunk can be *understood on its own* once retrieved out of context.
> Both run at ingestion, before anything downstream trusts the text.

These are the first two enrichment layers. They matter more than any clever retrieval trick,
because retrieval can only ever return the chunks you built — if the chunk is a mid-sentence
fragment, or says "He then declared His mission" with no antecedent, no reranker can rescue it.

---

## Part A — Segmentation: giving boundary-less text a shape

### The problem

English prose has paragraphs and sentence punctuation, so chunking is mostly mechanical
([02](02-ingestion.md) §2). Classical Arabic, Farsi, Hebrew, and Urdu texts frequently arrive with
**no punctuation and no paragraph breaks** — a continuous stream of words. A naive "split every N
characters" approach produces chunks that begin mid-sentence and end mid-thought: semantically
useless, and poison for embeddings (an embedding of half a sentence encodes half an idea).

### Detection

`api/services/segmenter.js` decides whether a document needs AI segmentation:

- Normalize line breaks (repair OCR artifacts; treat `\n\n` as a paragraph hint, join stray `\n`).
- Detect script features: right-to-left, presence/absence of punctuation, verse markers.
- **Fast paths (no AI):** if the text has reliable verse markers or ordinary punctuation, segment
  with cheap rules (verse-marker split or sentence-regex split).
- **AI path:** only when the text is genuinely unpunctuated
  (`isUnpunctuatedText`: punctuation count < words/50) does it invoke the LLM segmenter.

### The AI segmenter

The core principle in the system prompt is deliberately about *meaning*, not size:

> "A paragraph is a set of sentences that support ONE main idea or concept. Split when the concept
> shifts."

The model (a strong general model, e.g. GPT-4-class, routed via `ai-services.js`) is instructed to
find boundaries where the topic, argument, or addressee changes, and — critically — to **never**
split mid-sentence, mid-word, mid-prayer, mid-verse, or mid-quotation. It returns JSON:

```json
{ "breaks": [ { "endMarker": "…last 5–10 words", "startMarker": "first 5–10 words…" } ],
  "confidence": 0.85, "reasoning": "…" }
```

Temperature is low (0.2) for consistency. The algorithm then locates each `startMarker` in the
original text (exact match, then whitespace-normalized fuzzy match), snaps the cut to a word
boundary, and splits there.

### The safety net that matters

After splitting, the segmenter **verifies text integrity**: the concatenation of the segments,
whitespace-stripped, must equal the original, whitespace-stripped, within a 0.1% tolerance. If it
doesn't, it **throws** — it does *not* silently fall back to a hard character split. The reasoning
is a recurring principle in this codebase: *fail loudly rather than corrupt the corpus quietly.* A
broken segmentation is surfaced for review, not papered over with garbage chunks. Oversized
segments are recursively re-segmented until they fit or the model finds no further boundary.

---

## Part B — Disambiguation: making a chunk understandable alone

### The problem (the orphaned chunk)

Retrieval returns a single paragraph, stripped of the narrative that preceded it. Consider a real
example from the histories:

> "He then declared His mission to the assembled believers, and they arose to serve Him."

Retrieved alone, this is nearly useless: *who* declared, *to whom*, *when*, *where*? The
paragraph's embedding is correspondingly vague — it will match, weakly, a thousand unrelated
"declaration" queries and strongly match none. Multiply by millions of paragraphs full of pronouns
("he", "she", "they"), epithets ("the Master", "that wronged one"), and deictic references ("in the
capital", "the following year"), and the retrieval quality ceiling is low.

### The solution: the `content.context` layer

Each paragraph gets a terse **context note** stored in `content.context` that resolves its
ambiguous references to the full names, places, and time anchors established earlier in the
document. It reads like a scene-setting gloss:

```
@Síníz, ~1845 — "Siyyid Yaḥyá" = Siyyid Yaḥyáy-i-Dárábí (Vaḥíd); "I" (in quoted speech) = Vaḥíd.
```

This note travels with the paragraph into search, so the retriever (and the answer-composing LLM)
sees a self-contained unit. It resolves RAG problem #2.

### How it's generated efficiently: the jumping window

Disambiguating millions of paragraphs with an LLM would be ruinously expensive if each call
re-sent the surrounding narrative. `api/lib/enhancement-ai.js` uses a **jumping-window + prefix
cache** technique to make it nearly free on local inference:

1. Load a window of ~20 consecutive paragraphs into the **system prompt**, along with document
   metadata and the known entity cast.
2. Disambiguate the *back half* of the window (paragraphs 11–20) — these have the most preceding
   context available.
3. The **user prompt** for each of those 10 paragraphs is tiny (~5 tokens: "Disambiguate [P17]").
4. Because the large system prompt is **identical across all 10 calls**, the local LLM's
   key-value attention cache (vLLM, on fast NVMe) keeps it resident — 9 of every 10 calls reuse
   the cached prefix. Only the incremental tokens are paid for.
5. Then **jump**: the next window starts at paragraph 11, covering 11–30, disambiguating 21–30.

The economics are the point: without prefix caching, disambiguating ~2.5M paragraphs at a premium
API's input price would cost a fortune; with a local model and a cached window prefix, the marginal
cost collapses to near zero. This is why disambiguation is affordable at corpus scale. The model
used on this path is DeepSeek (`deepseek-chat`), configured centrally.

### Faithfulness doctrine (the hard-won rules)

Disambiguation must be **faithful** — it resolves references the text supports, and never invents
identity. These rules are load-bearing; violating them corrupts every downstream fact:

- **The text's own qualifier wins over prominence.** If the paragraph says "Mírzá Aḥmad, the Báb's
  amanuensis," that appositive *overrides* the prior that "Mírzá Aḥmad" usually means the famous
  scholar of the same name. Hardcoding a contested identity as a prompt example once caused a
  book-wide conflation — so identity is never assumed from fame.
- **No identity echoes / no upgrades.** Never promote a bare name to a more prominent bearer.
- **Under-resolve rather than mis-resolve.** Low confidence → mark uncertainty (`?`) and leave the
  name plus the text's own descriptor. A missing resolution is recoverable; a wrong one poisons
  facts.
- **Honorifics are features, not noise.** Mírzá, Mullá, Siyyid, Ḥájí, Karbilá'í discriminate
  identity when nisbas match or are absent — they are preserved, never stripped.
- **Time and place are anchors.** Dates are marked as PIN (explicitly derivable — e.g. a solar
  Naw-Rúz reference) or EST (inferred from chapter/context). Lunar/Hijri dates drift; solar dates
  pin. This distinction later feeds timeline reconciliation in the entity layer.
- **No outside knowledge.** Resolve only from the document's own text, cast, and scene — never from
  the model's general knowledge. A disambiguation must make the paragraph standalone *from the
  source*, not annotate it with trivia.

### Why disambiguation must come first

This is the pipeline order invariant ([overview](README.md)): **DISAMBIGUATE → EXTRACT →
INTEGRATE → SEARCH.** Entity extraction ([05](05-entity-knowledge-layer.md)) pulls facts like
"X died at Y in year Z" from the text. If the text still says "he died there that year," extraction
either fails or guesses — and a guessed fact is a fabrication with a citation, the worst kind. So
disambiguation runs first, turning ambiguous prose into resolved prose that extraction can trust.
(A note in the project's own memory records that entity claims extracted from *raw*, un-disambiguated
text were "built on sand" and had to be redone after disambiguation — the invariant is written in
scar tissue.)

---

## Recreating this

1. Detect boundary-less text and segment it by *concept shift* with an LLM; verify the split
   reconstructs the original exactly, and fail loudly if not.
2. Add a per-chunk `context` note that resolves pronouns/epithets/deixis from the document's own
   earlier text.
3. Generate it with a jumping window whose large prefix is identical across calls, so a
   prefix-caching local model makes it cheap.
4. Be faithful: the text's qualifier beats prominence; under-resolve rather than mis-resolve;
   never add outside knowledge.
5. Do this before extraction and before indexing.

→ Next: [04 — HyPE](04-hype.md), the layer that closes the gap between how users *ask* and how
texts *speak*.
