---
id: "0006"
title: HyPE coverage — 1,138 documents against 6.7M paragraphs
state: ready
traces_to: .xswarm/GOAL.md
priority: P1
size: L
depends_on: ["0001"]
acceptance:
  - text: HyPE coverage is reported as a percentage of the corpus, not an absolute count
  - text: coverage rises measurably between reports
  - text: generation resumes and keeps running rather than needing restarts
---

## Finding
`docs with HyPE: 1138` against `paragraphs: 6,712,145`. Chad named HyPE
generation as needed work, and the metric suggests coverage is thin.

**Not the cause of the Mullá Ḥusayn failure** — that was localised on
2026-09-06 to entity disambiguation in answer synthesis, not coverage. Retrieval
surfaced the correct record and synthesis chose a name-similar one. Fixing
coverage will not fix that, and the two should not be conflated.

Coverage still matters on its own terms: 1,138 documents against 6.7M
paragraphs is thin, and questions whose answer is not in the covered set fail
differently — by finding nothing rather than by finding the wrong thing.

## Depends on
The spend decision in 0001. Generation costs money and the pipeline is
currently in a mode that will not enqueue work.
