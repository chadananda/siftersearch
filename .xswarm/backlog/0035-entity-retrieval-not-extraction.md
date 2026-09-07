---
id: "0035"
title: Entity search cannot reach claims that already exist
state: ready
priority: P0
size: M
depends_on: []
acceptance:
  - text: searching a person's name with correct diacritics returns that person
  - text: name variants of one person resolve to one entity, and their claims aggregate onto it
  - text: a claim's target resolves to an entity record, so relations are answerable in both directions
  - text: results rank by importance, so a principal figure outranks a minor namesake of similar name
  - text: "when did Mullá Ḥusayn first meet the Báb" is answered from the existing Dawn-Breakers claims
---

## The finding
Measured against production, 2026-09-06, via `/api/v1/entities`. The data is
there and the retrieval cannot see it. Three compounding defects:

**1. Diacritic-sensitive search.** The correctly-spelled name returns nothing:

    q=Mullá Ḥusayn      → 0 results
    q=Mulla Husayn      → 1  (a different, minor person)
    q=Mullá Husayn      → 3  (all minor namesakes)
    q=Bushrú'í          → 12 (incl. Ḥusayn-i-Bushrú'í AND his brother)

A user typing the name as the books print it gets nothing.

**2. Name-form fragmentation.** One man appears as `Mullá Ḥusayn`,
`Mullá Husayn`, `Mullá Ḥusayn-i-Bushrú'í`, `Mulla Husayn-i-Bushru'i` — as free
text inside `statement`. His claims never aggregate.

**3. No canonical entity.** `Ḥusayn-i-Bushrú'í` (id 1284916) is an empty stub:
importance 0, mentionCount 0, claims 0, no summary — while 162 claims about him
sit as strings on the Báb's card.

## The thing to check first
`entity_claims` has a `target_entity_id` column, but the API exposes the target
only as text in `statement`. **Is `target_entity_id` actually populated?** Not
confirmable from the public API — it needs DB access.

If it is null, the graph is half-built: subjects are entities, objects are
strings. That single fact would explain every symptom at once — why Muqaddas's
card never mentions hosting the meeting, why "who did X meet" cannot be answered
in reverse, and why the biography surface falls back to the declaration date.

Check this before designing anything.

## Why P0 over the extraction work
0017 would have spent model budget re-extracting what is already there. The
correct next spend is entity resolution and search normalisation, which is
cheaper and unblocks 0003, 0009, 0010 and 0018 at the same time.
