---
id: "0036"
title: Extraction collapses narrative episodes into weak abstract relations
state: ready
priority: P0
size: M
acceptance:
  - text: the Dawn-Breakers Karbilá episode yields an encounter claim linking Siyyid Káẓim and the Báb with place
  - text: a set of known episodes from firm sources is used as a recall test, and the pass rate is reported
  - text: weak relations (knew, related-to, associated-with) are measured as a share of claims per source
  - text: a narrated scene produces a claim naming what happened, not only that the parties were acquainted
---

## The finding, 2026-09-06
Chad: "now I was leading to the episode where Siyyid Kazim visits the home of the
Bab in Karbila early one morning… that story is in the Dawn-Breakers, so it is
very firm."

It is not in the archive. Across the whole Dawn-Breakers — 67 claims on Siyyid
Káẓim-i-Rashtí, 341 on the Báb — exactly **four** claims link the two:

    Siyyid Káẓim-i-Rashtí — knew the Báb          para_267
    Siyyid Káẓim — prophesied the Báb             para_240
    the Báb — disciple-of Siyyid Káẓim            para_232
    the Báb — prophesied-by Siyyid Káẓim          para_669

No `visited`, no `hosted`, no place, no time — although all of those relations
exist in the vocabulary and are used freely elsewhere (the Báb carries
`visited` 336, `met` 149, `hosted` 87).

**`knew the Báb` (para_267) is probably the episode, flattened.** A narrated
scene — arriving at daybreak, being received, the deference shown — reduced to
an acquaintance predicate. NOT YET CONFIRMED: reading para_267 requires
authenticated access (`/api/v1/paragraph/` returns 401). Confirm before building
on it.

## Why this is a third diagnosis, not either previous one
* 0017 said the archive models people, not encounters — relations are kinship
  only. **False:** 63 relations on the Báb, zero kinship.
* Then I said encounters are extracted and only retrieval fails. **Also too
  strong:** the vocabulary supports encounters, but the most significant
  narrative episodes are not captured.

The real defect is **recall on narrative passages**. Where a text states a
relationship abstractly, extraction works. Where a text NARRATES a scene, the
extractor emits the weakest available summary relation and drops what happened.
That is the opposite of what a history archive needs, because the narrated
scenes are the history.

## How to measure it
Build a recall set from episodes whose ground truth is firm and checkable —
Chad's Karbilá example is the model. For each: does a claim exist naming the
event, the parties, the place? Report the pass rate per source. Also report the
share of claims per source using weak relations (`knew`, `related-to`,
`associated-with`, `characterized-as`); on the Báb, `characterized-as` alone is
2,364 of 8,628, which is a signal worth watching.

## Related
0035 (importance unpopulated, so major figures do not rank) is a separate and
also-real defect. Fixing retrieval will not surface a claim that was never made.
