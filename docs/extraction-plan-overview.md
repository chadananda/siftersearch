# Corpus Extraction — Plan Overview

*A human-readable map of the weeks-long extraction effort. Deep detail lives in the two track documents linked
below; this page is the entry point.*

---

## The one big idea: two separate tracks

The corpus is enriched by **two independent pipelines**, deliberately kept apart because their aims are genuinely
different. Trying to do both in one pass produces a hybrid that's mediocre at each.

| | **Historical Track** | **Conceptual Track** |
|---|---|---|
| **Aim** | the *factual* layer — who existed, who did what, when, where, which tablets were revealed | *organizing doctrine* — a concept ontology + concepts as first-class entities |
| **Extracts** | `person`, `work`/tablet, `place`, `event` + cited biographical facts | `concept` entities + authoritative doctrinal claims |
| **Ordered by** | **source authority** — primary/eyewitness sources before 3rd-party compilations | **interpretive authority, top-down** — the latest authorized interpreter governs, backwards-facing |
| **Status** | building now (extraction upgraded; validating) | design only — a separate later effort |
| **Detail doc** | [architecture/history-track.md](architecture/history-track.md) | [architecture/conceptual-track.md](architecture/conceptual-track.md) |

They **share** only the disambiguated text upstream, and **link at the graph**: a conceptual claim ("the Íqán
teaches X") just *references* a `person`/`work` entity the historical track built. No shared logic, no merging.

---

## Historical Track — ordered by textual rigor / reliability

Ranked by **how carefully each text was collected and edited** — a *factual* criterion, not nominal authority.
('Abdu'l-Bahá's authority is supreme, but *Memorials of the Faithful* as a text is Sohrab's notes from oral
story-telling rendered into English, so it can carry errors and ranks below the rigorously-edited scholars.)
The graph is anchored by the most reliable texts first; looser ones resolve *against* them.

1. **Tier 1** — God Passes By → The Dawn-Breakers *(the Guardian's rigorous authoritative history + the person-seed)*
2. **Tier 2 — current work** — the rigorously-edited scholars: all Taherzadeh/Revelation of Bahá'u'lláh, Balyuzi, Momen, Mázindarání's Ẓuhúru'l-Ḥaqq *(the reliable foundation)*
3. **Tier 3 — primary but loosely collected** — 'Abdu'l-Bahá texts (Memorials, The Secret of Divine Civilization) + eyewitness/pilgrim accounts *(oral notes, personal diaries, translation layers → resolve against Tiers 1–2)*
4. **Secondary** — the general 3rd-party histories

---

## Conceptual Track — ordered by interpretive authority (design)

Authoritative interpretation is backwards-facing: the latest authorized interpreter governs the reading of
everything before him. So the seed runs **top-down**:

**Shoghi Effendi → 'Abdu'l-Bahá → Bahá'u'lláh → the Báb → Shaykhí → Imáms → Qur'án → Christianity → Judaism**

- The **Dispensation of Bahá'u'lláh** (in *The World Order of Bahá'u'lláh*) is the **ontology keystone** —
  it defines the Manifestation-vs-Interpreter distinction, the stations, the Covenant. Seeded *first*.
- **God Passes By** is the **concept skeleton** — its breakdown of a work into specific assertions becomes cited
  claims linking work → concept → teaching.
- Concepts become first-class entities whose development aggregates across the whole corpus, authority-weighted.

---

## How everything is produced (shared machinery)

`DISAMBIGUATE → {HyPE ∥ EXTRACT} → RECONCILE`, one gated orchestrator, per document, in priority order.
Every stage: **multilingual** (cheap DeepSeek-flash for English/Arabic/Hebrew, **Claude-haiku for Persian**
where flash fails), **self-healing** (escalates to a stronger model on failure), and **continuation-robust**
(dense genealogies like Momen's are captured in full, never truncated). Enrichment is written in **English**
(so one query reaches the whole multilingual corpus), while source text stays searchable in its own language.

Full machinery: [architecture/unified-enrichment-pipeline.md](architecture/unified-enrichment-pipeline.md).
Live progress: [extraction-status.md](extraction-status.md).
