---
id: "0034"
title: Translation authority explicit in the DB and in the search/retrieval API
state: ready
priority: P1
size: M
acceptance:
  - text: every stored translation carries an authority from the fixed set, with no default and no null
  - text: the search and retrieval API returns authority on every passage it serves, never only in the UI layer
  - text: authority and measured quality are separate fields; improving quality never changes authority
  - text: the API makes the Shoghi Effendi boundary distinguishable from the gradations below it
  - text: a passage whose authority cannot be established is not served as though it were authoritative
---

## The hierarchy
Chad, 2026-09-06:

> For Baha'i works, the authority division is Shoghi Effendi (doctrinal
> authority) > Published (diligence) > Provisional (personal work) > Machine
> (automated). Using good models and Jafar translation reports, we can try to
> make Machine translations better than Provisional and maybe even better than
> Published, but Shoghi Effendi translations are the penultimate and we only
> improve Machine translations by using his as a model.

Two things follow, and they are the whole design:

**1. Authority and quality are different axes.** Authority is provenance: fixed,
immutable, never earned by a better model. Quality is measured and can improve —
a machine rendering may genuinely surpass a provisional or published one. One
column cannot carry both without lying about one of them. `translation_authority`
holds the first; quality needs its own field and its own measurement.

**2. The steps are not evenly spaced.** Chad: "The gap between published and
machine is not as significant as the gap between Shoghi Effendi and published."
So this is not a flat four-level enum. There is a categorical boundary at Shoghi
Effendi — his renderings fix WHICH SENSE of a polysemous original is operative,
an interpretive act the others do not perform — and then a graded band below it.
Any representation that renders four equal steps misstates the thing.

## Requirement
Chad, 2026-09-06: "all types of translations should be clear in the DB and the
API we use for search and retrieval. We can figure out the chatbot UI a bit
later. I like the idea of making them explicit."

So authority is a property of the DATA and of the API, not a presentation
concern. A consumer that never renders a UI must still be able to tell what it
is reading. Deciding this at the UI layer would put the distinction in the one
place it is easiest to drop.

## Why this is load-bearing rather than metadata
`translationAuthorityFor()` already exists and already returns a string rather
than a boolean, for exactly this reason. Everything derived downstream —
concept claims, HyPE questions, embeddings — inherits the authority of the text
it was derived from. If a concept claim extracted from a machine rendering of
Bahá'u'lláh is indistinguishable from one extracted from the Guardian's English,
nothing afterwards can separate them, and the archive's scholarly value is
quietly spent.

## Depends on
The aligned Shoghi Effendi pairs (0026/0029) are not only provenance — they are
the reference the machine translations are improved against. Chad: "we only
improve Machine translations by using his as a model." That makes alignment a
prerequisite for translation quality, not a parallel track.
