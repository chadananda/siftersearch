---
id: "0033"
title: Expensive derived work must outlive document edits
state: ready
priority: P0
size: L
acceptance:
  - text: editing one paragraph of a document does not discard derived work for its other paragraphs
  - text: derived artefacts survive deletion and recreation of the content rows that referenced them
  - text: each artefact records the model and version that produced it, so re-derivation can be selective
  - text: text-intrinsic and context-dependent artefacts are distinguished, and only the former are shared across documents
  - text: the normalisation function behind the hash is versioned; changing it is a migration, not a silent detach
  - text: a re-ingestion reports what it reused versus re-derived, in rows and in estimated cost
---

## The problem
Chad, 2026-09-06: "Both segmentation and translation should somehow be stored in
some way that the work is not redone when a document is edited. The source of
truth may be files, but the costly value-add is often in the DB. We need to put
some thought into this."

Files are the source of truth, which invites the conclusion that the database is
disposable and can always be rebuilt. That is false, and expensively so. The
database holds two different kinds of thing:

* **cheap derived** — parsed text, hashes, paragraph indices. Recomputable from
  the file in seconds.
* **expensive derived** — embeddings, machine translations, concept claims, HyPE
  questions, alignments. Bought with model spend and NOT recoverable from the
  file at any price short of paying again.

Treating the second like the first is what makes a typo fix cost real money.

## What already exists
`propagateEmbeddings()` in `api/lib/content.js` has the right instinct: find rows
sharing a `normalized_hash` and copy the embedding plus its `embedding_model`
across, batched in 1000s to avoid holding the write lock. `content` already
carries `content_hash`, `normalized_hash`, `is_duplicate`, and per-artefact model
columns (`embedding_model`, `hyp_model`, `extract_model`, `context_model`,
`para_meta_model`, `extractor_version`).

Its limit is lifetime: it copies BETWEEN CURRENTLY EXISTING ROWS. If re-ingestion
drops and recreates a document's rows, there is no surviving sibling to copy
from and the work is simply gone.

## Proposal — artefacts keyed by content, stored outside the content row
Move expensive artefacts into a store keyed by what the text IS, not where it
sits:

    derived(
      normalized_hash,      -- what the text is
      kind,                 -- embedding | translation | hype | concepts | ...
      model, version,       -- what produced it
      lang,                 -- translation target
      authority,            -- shoghi-effendi | published | provisional | machine
      quality,              -- MEASURED, and deliberately not the same as authority
      value,
      created_at,
      PRIMARY KEY (normalized_hash, kind, model, lang)
    )

Content rows then reference rather than own. Re-ingestion rebuilds content freely
and re-attaches by hash; only genuinely new or changed text costs anything.

**Authority and quality are separate columns on purpose.** Chad, 2026-09-06:
"the authority division is Shoghi Effendi (doctrinal authority) > Published
(diligence) > Provisional (personal work) > Machine (automated)… we can try to
make Machine translations better than Provisional and maybe even better than
Published." Authority is immutable provenance; quality is measured and can
improve. One field cannot carry both without lying about one of them.

## Three things that will go wrong if unhandled

1. **Context-dependent artefacts must not be shared by hash.** An identical
   paragraph in two compilations has the same embedding and the same machine
   translation — sharing those is pure saving. But `context`, and anything
   derived from surrounding paragraphs, differs by document. Those need the
   context in their key, or they will be silently swapped between documents.
   Compilations make this common, not rare.

2. **The normalisation function is load-bearing.** Every attachment hangs off
   `normalized_hash`. Change how text is normalised and everything detaches at
   once, looking exactly like a cache miss. Version it and treat a change as a
   migration.

3. **Edits are usually near-misses, not identity.** A fixed typo changes the hash
   and loses the artefact even though the paragraph is 99% the same. `align.js`
   already does monotonic sequence matching with a length-aware score — pointing
   it at old-version versus new-version paragraphs would carry artefacts across
   small edits, with the same threshold discipline (below the bar, re-derive
   rather than attach something wrong).

## Why P0
Every other item in this area — machine translation of ~1M Persian and Arabic
paragraphs, concept extraction, HyPE for the whole corpus — multiplies the cost
of getting this wrong. Building the expensive pipeline first and the persistence
afterwards means paying for the corpus twice.
