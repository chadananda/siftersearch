# Original text for every translated canonical — plan

**2026-08-25.** Goal (Chad): good original text available for reference **both** during concept extraction
**and** to the SifterSearch chat/search API, so a reader can ask *"what is the original word for 'justice'
in the passage 'the best beloved of all things…'"* and get an immediate, grounded answer.

That question is the acceptance test for the whole effort, and it is already answerable for aligned
paragraphs: `GET /api/admin/docs/original-term?term=justice&quote=…` returns **الإنْصاف (inṣáf, equity)** —
not العدل (ʿadl) — from stored word-level spans, with no model call.

---

## Why this matters beyond convenience

English is a lossy projection of a more differentiated vocabulary:

| English | originals it hides | why the difference is doctrinal |
|---|---|---|
| prayer | Ṣalát (ص‑ل‑و) · Duʿá (د‑ع‑و) · Dhikr (ذ‑ك‑ر) | three unrelated roots; different laws attach to each |
| justice | ʿadl (ع‑د‑ل) · inṣáf (ن‑ص‑ف) | rectitude vs equity — Hidden Words #2 is **inṣáf** |

And the reverse is equally load-bearing: **Shoghi Effendi's rendering is not an approximation to be
corrected.** As authorised interpreter his word-choice *fixes which sense* of a polysemous term is operative.
So the original tells us WHICH TERM, and his English tells us WHICH SENSE. Neither outranks the other, which
is why `content` now stores both sides plus `translation_authority`.

---

## PRIORITY ORDER — non-Shoghi-Effendi works come FIRST

Chad, 2026-08-25: *"Non-Shoghi-Effendi translations have no doctrinal weight in the translation, so the
original is more load-bearing… with non-Shoghi-Effendi translations it is in some ways more critical, since
the translation cannot be trusted as much."*

This **inverts** the naive ordering. Where his rendering exists, the English can be leaned on — his
word-choice fixes which sense is operative. Where it does not, the English is one translator's reading with
no interpretive standing, and the original is the only corrective. So:

| priority | works | why |
|---|---|---|
| **1 (highest)** | Aqdas · Some Answered Questions · Tablets of the Divine Plan · every provisional rendering | the English carries no doctrinal weight; the original is the only authority |
| 2 | prayers and tablets with no located original | same, and heavily used by readers |
| 3 | Shoghi Effendi's renderings | valuable for comparison, but the English already carries weight |

The extraction prompt enforces the same distinction rather than merely recording it: for a rendering that
is **not** his, the original GOVERNS and the translation is orientation only.

## Tier 1 — CTAI (Shoghi Effendi's renderings). **DOING NOW**

CTAI is a concordance of his translations. Enumerated exhaustively (70 probe queries, stable at 11 works):

| work | CTAI pairs | status |
|---|---|---|
| kitab-i-iqan | 291 | ✅ **290/292 written** (99.3%) · fa 272 / ar 18 |
| gleanings | 729 | dry-run 699/746 (93.7%) |
| epistle-to-the-son-of-the-wolf | 268 | dry-run 258/317 (81.4%) |
| the-hidden-words | 160 | dry-run 158/314 — see note |
| prayers-and-meditations | ~? | doc id to be resolved by text |
| will-and-testament | ~? | ʻAbdu'l-Bahá |
| tablet-of-the-holy-mariner · tablet-of-ahmad · tablet-of-carmel · kitab-i-ahd · fire-tablet | small | likely **sections inside compilations**, not standalone docs |

**Hidden Words' 50% was a segmentation artifact, not missing data** — and it is being fixed at the source.
Our doc split each verse into an invocation row ("O Son of Spirit!") and a body row (314 ≈ 2×157) while CTAI
keeps the verse as one pair. Chad: *"I would merge the openings of each hidden words to the body."* Done via
`POST /docs/:id/merge-lead-ins` — the opening's text is preserved at the head of the merged row and the old
row soft-deleted, so the edit is reversible. Expect ~157 paragraphs and near-total coverage after re-align.

**Short tablets inside compilations** are handled by the existing alignment without change: the monotonic
matcher advances its cursor only on a match, so a 20-pair tablet embedded in a 664-paragraph compilation
aligns to the right span and leaves the rest untouched.

### Method (built and proven)
1. `GET /concepts/resolve-works` — identify which of OUR docs holds each work **by text, not title**.
   Five spread-out passages of the work are looked up in our corpus and documents vote. Self-checking: a
   husk has no text to match. Ties and split votes resolve to `null` (a HOLD, never a guess).
2. `POST /concepts/align-originals {docId, dryRun:true}` — review coverage, score spread, unmatched samples.
3. Same call with `dryRun:false` — writes `original_text`, `original_lang` (per paragraph), `word_alignment`,
   `translation_authority='shoghi-effendi'`, `align_ref` provenance.

---

## Tier 2 — originals already in our corpus

We hold **18,394 documents in Arabic or Persian** (the Báb alone: 245 ar + 23 fa). Where a canonical English
translation has its original already in the library, no external source is needed.

**⚠ The blocker is identification, and title matching does NOT work.** Measured: it proposed *"On divine
origination"* as the original of *The Secret of Divine Civilization*, and *"On universal creation"* for
*The Promulgation of Universal Peace* — common-word collisions. Title similarity cannot identify an Arabic
original for an English translation, and this is the same failure mode that pointed the grounding plan at
empty duplicates (6555→12511).

**Proposed identity test, in order of strength:**
1. **Structural fingerprint** — paragraph count, ordering, and relative lengths correlate strongly between a
   translation and its original. Cheap, deterministic, no model.
2. **Anchor terms** — proper nouns, Qur'ánic citations and numerals survive translation and are matchable
   across scripts (`translit-key.js` already owns transliteration-invariant keys).
3. **Model adjudication on the shortlist only** — for candidates surviving 1–2, one call per pair asking
   "is this the original of this passage?" with both texts shown. Bounded cost, evidence-gated.

Then the same monotonic alignment as Tier 1, with Dice computed on the *anchor* overlap rather than on
English words, since the two sides share no vocabulary.

**⚠ Verified: the corpus holds no Arabic/Persian Íqán** — searches return only semantic drift. Do not assume
an original exists because the work is famous.

---

## Tier 3 — oceanoflights.org files

Chad: *"the others from files in oceanoflights.org"*. The scraped corpus already holds 72,420
oceanoflights documents. **Open question before building**: are the originals there as *files* we should
ingest fresh (like the Ocean Library `-sites/` path), or as *documents already in the corpus* that Tier 2's
identity test would find? These need different work, so this is the next thing to settle with Chad.

⚠ Provenance rule stands: a scraped copy may serve as a *source text* to consult, but the English we cite
must remain the canonical copy. `translation_authority` must not be set to `shoghi-effendi` for a rendering
he did not make.

---

## Tier 4 — no original located

The survey (`GET /concepts/source-survey`) reports **36 works / 39,690¶ with `route: 'none'`** today,
including *Some Answered Questions*, *Paris Talks*, *Bahá'í Administration* and *God Passes By*. Several of
these are **correct and permanent**: God Passes By was written in English, and works recorded from talks
(Paris Talks) have no single authored original. That is a fact to record per work, not a gap to close.

**Do this:** mark each `none` work with a reason — `english-original` · `no-single-original` ·
`original-not-located` — so the plan stops re-examining works that will never have one.

---

## Sequence

1. ✅ Migration 120 (bilingual layer) + 121 (word alignment) + `original-term` lookup
2. **NOW:** resolve all 11 CTAI works by text → backfill each → verify coverage
3. Decide the Hidden Words invocation-row question
4. Expose `original-term` to the chat/search tool surface (currently admin-only) — this is what makes the
   acceptance question answerable to a reader
5. Classify the 36 `route: none` works by reason
6. Settle the oceanoflights question, then build the Tier-2 identity test
7. Re-run concept extraction on aligned books so extraction reads both sides

## Invariants

- **Never bind a paragraph to an original below threshold.** A paragraph with no original is recordable; one
  bound to the WRONG original is undetectable afterwards.
- **Language is per paragraph, never per work.** The Íqán is Persian; the Hidden Words has an Arabic part and
  a Persian part; Gleanings draws on both. Never trust an upstream `source_lang` label over the text.
- **Provenance is part of identity.** Canonical = `oceanlibrary.com` or main library. Resolve by text.
- **All document access through `docs-repo`** — not hand-written `FROM docs` predicates.
