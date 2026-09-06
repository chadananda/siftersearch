---
id: "0026"
title: Source text on every translated paragraph — the unmentioned prerequisite
state: ready
traces_to: docs/architecture/conceptual-track.md
priority: P1
size: L
acceptance:
  - text: coverage of content.original_text is reported per document and fleet-wide
  - text: alignment becomes a gated stage, or its absence from the gate is a recorded decision
  - text: works with no reachable original are listed as such rather than silently skipped
---

## Problem
Chad asked on 2026-08-25 that every translation paragraph carry its source text
as a field. `concepts/source-survey.js` records the request verbatim. He noted
on 2026-09-06 that it had never been mentioned in any status — and it has not,
because it is not gated and not reported.

## What exists
* `concepts/align.js` — monotonic sequence alignment, Dice similarity. Chosen by
  measurement: on the Íqán ours is 292 paragraphs against CTAI's 291 pairs, so
  index matching would attach 291 paragraphs to their neighbour's doctrine.
* `concepts/source-survey.js` — where originals can be got. In-corpus (245
  Arabic, 23 Persian documents attributed to the Báb alone); CTAI (11 works,
  Shoghi Effendi renderings only, so no Aqdas, no Some Answered Questions).
* `concepts/backfill-original.js`, `original-term.js`
* `content.original_text`, counted by `docs-repo.enrichmentCoverage`

## What is missing
Not the machinery — the **place in the pipeline**. `original_text` appears
nowhere in `plan.js` or `processed.js`, so no book is ever considered incomplete
for lacking it, and no report mentions it.
