---
id: "0017"
title: Extract encounters, not only biographies
state: blocked
traces_to: .xswarm/GOAL.md
priority: P1
size: L
depends_on: ["0019"]
acceptance:
  - text: the model records A met B, where, when, and by which source — not just who each person was
  - text: an encounter carries its attesting passage, so a claim can be checked
  - text: encounters synthesised across sources are marked as such, with each contributing source named
  - text: "when did Mullá Ḥusayn first meet the Báb" returns the Karbilá meeting at Mullá Ṣádiq's home, not the 1844 declaration
  - text: where sources disagree or a date is uncertain, that is stated rather than resolved silently
  - text: recognition and encounter narratives can be compared across people, so shared patterns are visible
  - text: given the Letters of the Living, it can show which have attested pre-1844 contact and the evidence for each
  - text: attested and inferred are always distinguishable in the output
---

## ⚠ PREMISE OVERTURNED, 2026-09-06 — 0019 is done and says do not extract
This item said "The archive models people. It does not model what happened
between them. Relationships are kinship only." **Measured against production,
that is wrong.** The Báb alone has 8,628 claims over 63 relations with zero
kinship, including 149 `met`, 336 `visited`, 87 `hosted` — and 162 claims naming
Mullá Ḥusayn, sourced to the Dawn-Breakers.

The encounters were extracted. They cannot be reached. Blocked pending 0035; if
0035 fixes resolution, most of this item disappears rather than being done.

## Superseded reasoning below
The schema already supports encounters and the extractor may already be
emitting them into a closed whitelist that drops them. Establish what exists
before extracting anything.

## Problem
The archive models people. It does not model **what happened between them**.
Relationships are kinship only — `brother:`, `father:`, `uncle:`. There is no
representation of an encounter.

Chad, 2026-09-06: The Dawn-Breakers specifies the Báb's pre-revelation Karbilá
period; Balyuzi narrates a meeting of the Báb and Mullá Ḥusayn in the home of
Mullá Ṣádiq (Muqaddas). "That type of connection is obvious to the student who
has read those books and should be explicit to the entity database."

## Why this is the root item
Items 0003, 0009 (person profiles) and 0010 (city reports) all depend on it.
A profile without encounters is an encyclopaedia entry; a city report without
them is a list of names. The questions a student actually asks — who met whom,
when, where, in what order — are all encounter questions.

## The real acceptance test — a hypothesis, not a fact lookup

Chad, 2026-09-06, offered a stronger case than the single question:

> The Báb probably met almost all of the Letters of the Living during the early
> Karbilá period. Evidence of this is scattered across the books — such as the
> story of Mullá Ṣádiq's recognition in Kashan, which was supposed to be
> following the pattern of the Letters of the Living.

Recorded as **his hypothesis, not as established fact** — the wording is
"probably", and the system's job is to assemble the evidence, not to assert the
conclusion.

What this demands is a step beyond extracting encounters one at a time:

* individual recognition narratives, scattered across several books, each
  attesting an encounter or a manner of recognition
* the observation that those narratives **share a pattern**
* the inference that a shared pattern implies a shared period and context

A student who has read widely notices the pattern. That noticing is the
capability — not "find the passage about X", but "these accounts resemble each
other, and here is what that resemblance suggests."

So the test is not only *can it answer when Mullá Ḥusayn met the Báb*. It is:
**given the Letters of the Living, can it surface which of them have attested
pre-1844 contact, show the evidence for each, and note where the accounts
follow a common pattern — while distinguishing what is attested from what is
inferred?**

## The hard part, stated plainly
This is cross-source synthesis. One book supplies the period, another the
occasion, a third the host. No single passage contains the answer, which is why
extraction over passages has not produced it. The unit of extraction has to
become the event, assembled from several attestations.

## Wrong if
If encounters are inferred too freely, the archive fills with plausible meetings
that no source attests — worse than silence, because it would be cited. Every
encounter needs its passage, and inference across sources must be visible as
inference.
