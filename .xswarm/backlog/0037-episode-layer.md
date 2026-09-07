---
id: "0037"
title: An episode layer — extract scenes, not only biographical predicates
state: ready
priority: P0
size: XL
depends_on: []
acceptance:
  - text: scenes are segmented from contiguous paragraphs sharing a place/era/topic context
  - text: each scene yields an episode record — participants, place, time, what happened, verbatim anchors
  - text: quoted eyewitness testimony is captured as evidence with its attribution, not discarded as "attributed"
  - text: episodes project down into entity_claims, so the existing graph is backed by scenes rather than replaced
  - text: the Balyuzi opening (gathering at Mullá Ṣádiq's home) and the Zunúzí account both yield episodes
  - text: recall is measured per book and reported, not assumed
---

## HOW THIS HAPPENED — answered from the code, 2026-09-06
Chad: "answer the question about how on earth this happened. We need a reliable
pipeline that extracts all episodes and persona and claims. This needs to be
smarter than a single human reading."

It is not a bug. `api/lib/rag/entities/claims.js` is doing precisely what its
prompt instructs. Four design decisions compose into the failure:

**1. The unit is ONE paragraph.** `buildUser()` sends a single paragraph plus its
NOTE. An episode spans many paragraphs, and nothing assembles them. A scene in
which someone arrives at dawn, is received, and converses yields at most a thin
predicate per paragraph, and the scene itself is never represented anywhere.

**2. The target is biography, and narrative is explicitly excluded.** The prompt
says: *"Capture LOAD-BEARING facts (birth, death/martyrdom w/ place+cause,
kinship, conversion, teacher/disciple, office/title, participation, authorship,
meetings, journeys), **NOT narrative colour**."* An episode IS narrative. The
extractor discards the thing we now want, on instruction.

**3. Attributed accounts are skipped — including eyewitness testimony.** The
prompt says: *"an accusation, boast, rumour, or assertion ATTRIBUTED to someone
… skip it"*, reasoning that *"a hostile party's slander is evidence of the
slander, not of the target's conduct."* Sound for an adversary. But Balyuzi's
paragraph 164 ends *"Here is a long account by Shaykh Ḥasan-i-Zunúzí:"* — and
what follows is a first-person witness account, which this rule discards. **This
is why Chad's episode is missing.** The rule cannot tell slander from testimony.

**4. Every rule is a precision filter; nothing measured recall.** Verbatim proof
≤130 chars, no outside knowledge, no vague or anaphoric objects, at most one
`characterized-as` per person, skip negated/hypothetical. Each is a good rule for
avoiding false claims. Together they are a sieve with no gauge on what falls
through — and nothing in the system reported the loss.

So the archive holds a high-precision BIOGRAPHICAL index. Chad is asking for an
EPISODE index. Different unit, different target, different prompt. The original
0017 instinct — "the archive models people, not what happened between them" —
was closer to right than my later corrections.

## The asset that makes this cheap
`content.context` ALREADY carries place, era and topic per paragraph:

    "@Karbilá, ~spring 1841 [pin] — The Báb's relationship with Siyyid Káẓim"
    "@Shíráz, ~1843 [pin] — Birth and death of the Báb's son Aḥmad"

Scene boundaries fall out of transitions in that field. Segmentation is
deterministic, already paid for, and needs no model.

## Proposed architecture — additive, does not disturb the precision layer
1. **Segment** contiguous paragraphs into scenes by context transition.
2. **Extract per scene**, over the whole window: participants, place, time,
   sequence of what happened, with verbatim anchors per assertion.
3. **Testimony handling**: quoted first-person accounts become evidence WITH
   attribution recorded, distinguished from adversarial assertion by whether the
   narrator endorses it. Never silently dropped.
4. **Project** episodes down into `entity_claims` so the graph stays populated
   and every thin relation gains a scene behind it.
5. **Measure** with the gap detector, weak-relation density, and a known-episode
   set.

## Why this can beat "a single human reading"
Not on any one passage — a scholar reads better. It wins on three things a
reader cannot do:
* **Exhaustiveness** — every scene in 158,837 documents, not the memorable ones.
* **Cross-source merging** — the same event in the Dawn-Breakers, Balyuzi and
  Ẓuhúru'l-Ḥaqq linked into one episode, with discrepancies surfaced rather than
  silently resolved. No reader holds all sources in mind at once.
* **Consistency** — the same questions asked of every passage, so absence means
  something.

None of those hold without recall measurement. That is the precondition, not a
later refinement.
