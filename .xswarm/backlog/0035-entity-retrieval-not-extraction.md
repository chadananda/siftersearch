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

## CONFIRMED BEHAVIOURALLY, 2026-09-06 — reverse traversal is impossible
Chad asked two questions of the live API. The first — "did the Báb meet Siyyid
Káẓim?" — answered well: 46 claims over 17 relations from ~15 sources
(`taught-by` 17, `met` 4, `disciple-of` 3, `visited` 2, `participated-in` 1).

The second — "did Siyyid Káẓim visit the home of the Báb?" — **could not be
answered at all**, because:

    q=Siyyid Kazim        → 0 results
    q=Káẓim-i-Rashtí      → "the widow of Siyyid Káẓim-i-Rashtí" (imp 16)
                             "daughter of Siyyid Káẓim-i-Rashtí"
                             "Rashti's disciples" · "Rashti"
                             "S̱harḥ-i-Qaṣídih (Siyyid Káẓim-i-Rashtí)"  ← a BOOK

**⚠ THE ABOVE WAS A BAD MEASUREMENT — corrected same day.** It used `limit=4` and
never checked the result total. Siyyid Káẓim-i-Rashtí DOES have an entity:
**id 1297046**, and it is excellent — 358 claims, 217 mentions, 48 aliases, a
real summary, occurrences across 10 books (144 in Ẓuhúru'l-Ḥaqq Vol 3), with
`met`, `hosted` and `visited` claims about the Báb from both directions.

The real defect is **one field**: `importance: 0` on an entity with 358 claims,
while "the widow of Siyyid Káẓim-i-Rashtí" — one mention — scores 16. He is not
missing, he is UNRANKED, so he sorts below his own widow, daughter and a harem
attendant. Nothing about targets-as-strings is demonstrated; claims resolve from
his side correctly.

So the P0 narrows to: **`importance` is unpopulated for major entities, and the
list endpoint returns unpopulated `mentionCount` too, so search cannot rank.**
That single fix likely resolves the Mullá Ḥusayn symptom as well — his brother
outranked him for the same reason.

### Directionality — real but narrower than first stated
Reciprocal pairs are CORRECT, not contradictory: `p6715850` yields both
`the Báb — visited Siyyid Káẓim-i-Rashtí` and
`Siyyid Káẓim-i-Rashtí — hosted the Báb`. That is one event seen from two sides
and is exactly right.

Genuine inversions do exist and are a minority: `p7070656` yields both
`the Báb — hosted Siyyid Káẓim` AND `the Báb — visited Siyyid Káẓim` with the
same subject, and `Siyyid Káẓim-i-Rashtí — appointed-by Mullá Ḥusayn` is
backwards. Worth a sampled audit, not a rebuild.

### The list endpoint does not populate ranking fields
`mentionCount` is ≤1 for all 3,000 entities sampled, while the DETAIL view gives
the Báb 6,627. `importance` is 0 for 76% of the sample but 100 on the Báb's
detail. So search cannot rank by importance — which is exactly why a minor
namesake outranked the principal figure, and why Ask AI returned Mullá Ḥusayn's
brother.

### Not a finding
An earlier pass here counted "phrase-shaped" names as suspected junk. That
heuristic was wrong: `Queen Marie of Romania`, `Ibn-i-Ḏhi'b (Son of the Wolf)`,
`the Sharíf of Mecca` are legitimate. Do not treat name shape as a quality
signal without checking the examples.

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
