# The Historical Track

Status: BUILDING (2026-07-11). One of two independent extraction pipelines over the corpus; the other is
the [Conceptual Track](conceptual-track.md). They share only the disambiguated text upstream and **link at
the graph** (a concept-claim references a `person`/`work` entity this track built) — no shared logic, no
shared ordering. See the [unified pipeline](unified-enrichment-pipeline.md) for the stage machinery.

## Aim

Build the **factual layer** — *who existed, who did what, when, where, which tablets were revealed*. Bounded,
event/person-based, every fact cited and proof-gated. Entity types: `person`, `work`/tablet, `place`, `group`,
`event`. This is distinct from *organizing doctrine*, which is the Conceptual Track's job.

## Ordering = source authority (primary → secondary)

The graph is anchored by **primary/eyewitness sources first**, so 3rd-party compilations resolve *against*
established primaries rather than seeding identity themselves. Priorities live in
`api/lib/pipeline/profile.js` `PROFILE_OVERRIDES`.

| Tier | Works (doc_id) | why |
|---|---|---|
| **Top** | God Passes By (21310) → The Dawn-Breakers (21308) | Shoghi Effendi's authoritative history + the person-seed of authority |
| **Primary — ‘Abdu'l-Bahá** | Memorials of the Faithful (20907), The Secret of Divine Civilization (20919) | the Master's own history works |
| **Primary — eyewitness/pilgrim** | Maḥmúd's Diary/Zarqání (11355), The Chosen Highway/Blomfield (11335), Diary of Juliet Thompson (12472), In Galilee/Chase (12503), Life & Teachings of Abbás Effendi/Phelps (150400), Sohrab pilgrim notes (12665), Sears — Pilgrimage (283034) | primary because they *witnessed* it |
| **Sub-basement — rigorous 3rd-party** | all Taherzadeh/ROB (429–432, 426, 427), Balyuzi (28849, 462, 3789, 3887, 464, 465, 467), Momen — Western Accounts (13433), Mázindarání — Ẓuhúru'l-Ḥaqq (617265…617313, Persian) | so rigorous + authoritative they form the foundation the rest build on |
| **Secondary** | general 3rd-party (Ahdieh, Rabbani, …) — default priority | resolve against everything above |

Duplicate ingests exist for several works (esp. pilgrim accounts and Ẓuhúru'l-Ḥaqq's two copies) — dedup to
one canonical per work before running.

## Pipeline

```
disambiguate-book.mjs   →  build-mentions.mjs  →  extract-claims-v2.mjs  →  reconcile.mjs (to build)
(place/era/who, multiling)  (mentions, entity_id     (cited biographical claims,      (evidence-based
                             DEFERRED)                 proof-gated, English-canonical)   person resolution)
```

Gated: extraction requires `assertDisambiguated`. Runs in priority order; `person`-heavy books get the full
pass, doctrinal books (Gate of the Heart) drop out (they belong to the Conceptual Track).

## Key mechanisms (all live in the stage scripts)

- **Multilingual model routing** — flash for English/Arabic/Hebrew (proven, cheapest); **haiku for Persian**
  (flash fails silently on it). Escalation ladder primary→fallback self-heals a passage the cheap model can't parse.
- **Continuation-on-truncation** — the answer to Momen's biblical-genealogy paragraphs: when a single extraction
  call returns `finish=length`, the extractor issues continuation calls ("continue with the remaining claims,
  don't repeat") until the model closes cleanly. Captures *arbitrarily* dense paragraphs without shrinking output.
- **English-canonical output over source text** — subject/relation/object/statement are English (unifying the
  multilingual corpus into ONE entity graph: Persian وحید → "Vaḥíd"); the **proof span stays verbatim in the
  source language** (the proof-gate checks it against the source paragraph).
- **Proof gate** — every claim carries a verbatim proof-span present in the paragraph, else dropped (no anonymous facts).
- **Deferred binding** — `entity_id`/`target_entity_id` are a projection set by evidence-based reconcile, never
  by literal romanization match (per the no-literal-name-binding doctrine).

## Status

- Disambiguation: done + hardened (multilingual, dense-para truncation fixed, ~99% coverage on wave-1).
- Extraction (`build-mentions` + `extract-claims-v2`): upgraded with multilingual routing + escalation +
  continuation-robustness + English output. To validate on English wave-1, then the Persian Ẓuhúru'l-Ḥaqq.
- `reconcile.mjs`: still to build (evidence-based person resolution / merge-split).
