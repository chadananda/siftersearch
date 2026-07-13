# The Historical Track

Status: BUILDING (2026-07-11). One of two independent extraction pipelines over the corpus; the other is
the [Conceptual Track](conceptual-track.md). They share only the disambiguated text upstream and **link at
the graph** (a concept-claim references a `person`/`work` entity this track built) — no shared logic, no
shared ordering. See the [unified pipeline](unified-enrichment-pipeline.md) for the stage machinery.

## Aim

Build the **factual layer** — *who existed, who did what, when, where, which tablets were revealed*. Bounded,
event/person-based, every fact cited and proof-gated. Entity types: `person`, `work`/tablet, `place`, `group`,
`event`. This is distinct from *organizing doctrine*, which is the Conceptual Track's job.

## Ordering = textual rigor / reliability (NOT nominal authority)

The historical track ranks sources by **how carefully the text was collected and edited** — a *factual*
criterion, deliberately distinct from the *interpretive* authority that governs the [Conceptual Track](conceptual-track.md).
'Abdu'l-Bahá's authority is supreme, but *Memorials of the Faithful* as a **text** is Sohrab's notes from oral
story-telling rendered into English — it can carry transcription, translation, and memory errors — so for
*fact* extraction it ranks *below* the rigorously-edited scholars. The graph is anchored by the most reliable
texts first; looser ones resolve *against* them.

| Tier | Works (doc_id) | why |
|---|---|---|
| **1** | God Passes By (21310) → The Dawn-Breakers (21308) | the Guardian's rigorous, authoritative history + the person-seed |
| **2 — current work** | Gate of the Heart (8632, Saiedi — the Báb's tablets), Taherzadeh/ROB (429–432, 426, 427), Balyuzi (28849, 462, 3789, 3887, 464, 465, 467), Momen — Western Accounts (13433), Mázindarání — Ẓuhúru'l-Ḥaqq (15228, 15257, 15254, 20028, 15256, 20035, 20037, 15255, 15259, Persian) | rigorously collected + edited scholarly histories — the reliable foundation |
| **3 — primary but loosely collected** | 'Abdu'l-Bahá texts (Memorials 20907, The Secret of Divine Civilization 20919); eyewitness/pilgrim accounts (Maḥmúd's Diary 11355, The Chosen Highway 11335, Diary of Juliet Thompson 12472, In Galilee 12503, Phelps 150400, Sohrab pilgrim notes 12665, Sears 283034) | *primary* but error-prone as texts (oral notes, personal diaries, translation layers) → resolve against Tiers 1–2 |
| **Secondary** | general 3rd-party (Ahdieh, Rabbani, …) — default priority | resolve against everything above |

Duplicate ingests exist for several works (esp. pilgrim accounts and Ẓuhúru'l-Ḥaqq's two copies) — dedup to
one canonical per work before running.

**Convergence — order is sequence, not exclusion.** EVERY book is eventually covered; the ordering only decides
*what authoritative context is already grounded when each book is added*. A book added later resolves its
identities *against* the more-reliable material already in the graph — the tail converges onto the same entities,
it is never left out. This is why the two tracks run cumulatively but by **different criteria**: the historical
track accretes by *textual rigor* (a scholar can supply a fact), the [Conceptual Track](conceptual-track.md)
accretes by *interpretive authority* (only the authorized interpreters supply doctrine). Same corpus, two
orderings; both converge to full coverage.

## Pipeline

```
Disambiguate   →   Extract mentions   →   Extract cited claims    →   Reconcile
(place/era/who,     (each reference to      (cited biographical claims,   (evidence-based person
 multilingual)       a person/work, its      proof-gated,                  resolution; to build)
                     identity left deferred)  English-canonical)
```

Gated: extraction runs only on text that has already been disambiguated. Processed in priority order.
**Gate of the Heart and ROB belong to THIS (historical) track** — they are trustworthy *descriptive
scholarship about the tablet (work) entities* (the Báb's core tablets; Bahá'u'lláh's tablets) with historical
facts alongside, NOT doctrine. A book "belongs to the Conceptual Track" only for its *doctrinal-interpretive*
content, and only the authoritative interpreters (Shoghi Effendi, the Central Figures) drive that track — no
scholar ever enters it. A book with few *persons* but rich *works* (Gate) still runs here; its small person-cast
is correct, and the tablets it describes are captured by the work-entity pass.

## Key mechanisms

- **Multilingual model routing** — flash for English/Arabic/Hebrew (proven, cheapest); **haiku for Persian**
  (flash fails silently on it). Escalation ladder primary→fallback self-heals a passage the cheap model can't parse.
- **Continuation-on-truncation** — the answer to Momen's biblical-genealogy paragraphs: when a single extraction
  call's output is truncated, the extractor issues continuation calls ("continue with the remaining claims,
  don't repeat") until the model closes cleanly. Captures *arbitrarily* dense paragraphs without shrinking output.
- **English-canonical output over source text** — a claim's subject, relation, and object are written in English
  (unifying the multilingual corpus into ONE entity graph: Persian وحید → "Vaḥíd"); the **proof span stays
  verbatim in the source language** (the proof gate checks it against the source paragraph).
- **Proof gate** — every claim carries a verbatim proof-span present in the paragraph, else dropped (no anonymous facts).
- **Deferred binding** — a claim's subject/object identities are assigned later by evidence-based reconciliation,
  never by literal romanization match (per the no-literal-name-binding doctrine).

## Status

- Disambiguation: done + hardened (multilingual, dense-para truncation fixed, ~99% coverage on wave-1).
- Extraction (the mention + cited-claim stages): upgraded with multilingual routing + escalation +
  continuation-robustness + English output. To validate on English wave-1, then the Persian Ẓuhúru'l-Ḥaqq.
- Reconciliation: still to build (evidence-based person resolution / merge-split).
