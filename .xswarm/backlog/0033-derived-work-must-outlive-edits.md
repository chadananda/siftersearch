---
id: "0033"
title: Confirm the four content hashes agree, so cached work is actually found
state: ready
priority: P2
size: S
acceptance:
  - text: the roles of hashContentWords/normalized_hash/content_hash/text_hash are documented in one place
  - text: it is verified that a paragraph reused by the ingester also hits translation_cache and paragraph_embeddings
  - text: any mismatch that causes a cache miss on unchanged text is fixed or recorded as intended
  - text: re-ingestion reports reused vs re-derived counts, so a silent regression in reuse is visible
---

## CORRECTION, 2026-09-06 — this item previously claimed derived work is lost on edit
It is not. Chad: "that was the entire point of normalize hash keying. If this was
not correctly done, it is the first time I am hearing of it." He was right, and
the earlier version of this item asserted a failure mode without checking it.

What actually exists:

* `api/services/ingester.js` keys `existingParagraphs` by `hashContentWords()` and
  on a match **reuses the existing row** — "preserves embeddings AND markers" —
  updating only `paragraph_index`, `heading`, `blocktype`, and setting
  `synced = 0` only when the position actually changed. Every derived column on
  that row survives untouched.
* `translation_cache(text_hash, source_lang, target_lang, source_text,
  translation, jafar_terms_json, model, created_at)` — content-keyed, per
  language pair, per model, carrying the Jafar term report.
* `paragraph_embeddings(paragraph_id, content_hash, embedding, created_at)` —
  keyed by content_hash, so embeddings survive deletion of the content row. The
  ingester says so explicitly where it deletes stale paragraphs.
* `concept_claims` carries `claim_hash`, `semantic_key`, `method_version` and
  `extractor_version`, so derivations are versioned and selectively re-runnable.
* `content.bulkReplace()` is a cleaner diff-aware version of the same thing. It
  is exported but not yet called — the ingester carries three
  "TODO: migrate to content.bulkReplace()" notes. That is a consolidation
  refactor, NOT a missing capability; the behaviour is already correct.

## What is actually worth checking
Four different content hashes exist: `hashContentWords()` (ingester reuse),
`normalized_hash` and `content_hash` (on `content`), and `text_hash`
(`translation_cache`). They serve different purposes and that is probably fine —
word-hashing is deliberately more forgiving than exact text hashing, which is
why it survives marker changes.

The risk is narrow and specific: **if the ingester reuses a row on one hash while
a cache lookup keys on another, unchanged text can miss its cache and be paid for
again** — invisibly, because the result is correct, just re-purchased. Worth one
verification pass, not a redesign.

## Note on measurement
All these tables read 0 rows in the local `data/sifter.db`. That says nothing —
it is the dev subset. Do not conclude from it that any cache is unused. Use
`node scripts/corpus-status.mjs` and production for anything real.

## The one design point that survives
`translation_cache` has `model` but no authority column, so it is implicitly a
machine-translation cache; authority lives on `content.translation_authority`.
Given the four-level hierarchy — Shoghi Effendi > Published > Provisional >
Machine — that split should be explicit rather than implied, because authority
and quality are different axes: Chad, 2026-09-06, "we can try to make Machine
translations better than Provisional and maybe even better than Published", while
authority ordering never changes. See 0034.
