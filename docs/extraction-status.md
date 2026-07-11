# Corpus Extraction — Status

*Current progress at a glance. Plan: [extraction-plan-overview.md](extraction-plan-overview.md). Last updated 2026-07-11.*

---

## Where we are

| Stage | Status |
|---|---|
| **Pipeline infrastructure** | ✅ Built — the six legacy always-on workers retired; one gated orchestrator (`doc_pipeline` state) replaces them. Multilingual model routing + escalation + continuation-robustness in place. |
| **Disambiguation (wave-1)** | ✅ Done — GPB, Dawn-Breakers, all 4 Revelation of Bahá'u'lláh volumes, Gate of the Heart, Child of the Covenant, The Covenant. ~99% coverage after the JSON-prompt + dense-paragraph fixes. |
| **HyPE (wave-1)** | 🔄 Running — English questions generated per paragraph for search. |
| **Historical extraction** | ⏳ Upgraded, not yet validated — multilingual + escalation + continuation + English-canonical output. Next: validate on an English book, then the Persian Ẓuhúru'l-Ḥaqq. |
| **`reconcile.mjs`** | ⏳ To build — evidence-based person resolution (merge/split). |
| **Conceptual track** | ⏳ Not started — design complete; prerequisite is seeding the Guardian's interpretive works (Dispensation first). |

---

## What was solved along the way

- **Empty context on Farsi / dense text** → the disambiguation prompt was rebuilt to require structured JSON
  (never empty), and model routing sends Persian to Claude-haiku (DeepSeek-flash silently fails on it).
- **Truncation on genealogically dense paragraphs** (Momen reads like biblical genealogies) → extraction now
  issues **continuation calls** until the model finishes, capturing arbitrarily dense output in full.
- **~590K rows of old garbage HyPE** purged corpus-wide; the search index rebuilt to hold only the new format.
- **Cross-lingual unification** → all enrichment written in English, so a Persian passage's "Vaḥíd" links to the
  same entity as the English books, and one English query retrieves the whole corpus.

---

## Cost (measured, full 3-stage pipeline)

- A Persian history like Ẓuhúru'l-Ḥaqq (~12.6K paragraphs): **~$90** on Claude-haiku.
- The full non-English corpus (~2.8M paragraphs): **~$3,300** if extraction runs only on histories,
  **~$6,900** if extraction runs everywhere. Extraction is the heavy stage, so it's gated by genre.
- All one-time (re-runs only touch changed paragraphs), done in priority order — not all at once.

---

## Immediate next steps

1. Validate the upgraded historical extractor on an English wave-1 book (confirm continuation + proof-gating).
2. Then run it on the Persian Ẓuhúru'l-Ḥaqq (confirm haiku routing + English claims + verbatim Persian proof).
3. Build `reconcile.mjs` and resolve the wave-1 person graph.
4. Roll the historical track outward through the priority tiers.
