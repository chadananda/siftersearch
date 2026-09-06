---
id: "0026"
title: Align the remaining translated works — CTAI is done, the rest are in-corpus
state: ready
traces_to: docs/architecture/conceptual-track.md
priority: P1
size: L
acceptance:
  - text: every translated canonical outside CTAI has its in-corpus original identified, or is marked unlocatable
  - text: alignment runs against those originals and populates content.original_text
  - text: coverage of content.original_text is reported per document and fleet-wide
  - text: alignment becomes a gated stage, or its absence from the gate is a recorded decision
  - text: the three no-authored-original works are excluded by rule, not left permanently red
  - text: a candidate original is confirmed by text overlap, never by title match alone
---

## Problem
Chad asked on 2026-08-25 that every translation paragraph carry its source text
as a field. `concepts/source-survey.js` records the request verbatim. He noted
on 2026-09-06 that it had never been mentioned in any status — and it has not,
because it is not gated and not reported.

## Status, Chad 2026-09-06: **CTAI is already done. Now the rest.**

CTAI covers **11 works** and can never cover more — it is a concordance of
Shoghi Effendi's renderings, so the Kitáb-i-Aqdas, Some Answered Questions and
the Tablets of the Divine Plan are not in it and never will be.

**The population you asked to cover** is wider than that, and the code says so:
any English document by Bahá'u'lláh, 'Abdu'l-Bahá, the Báb or Shoghi Effendi is
**by definition a translation, whoever rendered it** — "not just the six works
Shoghi Effendi translated".

**So the remaining work is in-corpus alignment.** The originals are largely
already in the library: 245 Arabic and 23 Persian documents attributed to the
Báb alone, before counting the other three authors. No external dependency, no
rate limit, already under our provenance rules.

**Three permanent exclusions**, your domain knowledge recorded 2026-08-26:
*Promulgation of Universal Peace*, *Paris Talks*, *'Abdu'l-Bahá in London* — talks
taken down by others, with no authored original to find. The code notes why this
matters: collapsing "no original exists" into "not located yet" is how a gap
report stays permanently red and stops being read.

## What exists
* `concepts/align.js` — monotonic sequence alignment, Dice similarity. Chosen by
  measurement: on the Íqán ours is 292 paragraphs against CTAI's 291 pairs, so
  index matching would attach 291 paragraphs to their neighbour's doctrine.
* `concepts/source-survey.js` — where originals can be got. In-corpus (245
  Arabic, 23 Persian documents attributed to the Báb alone); CTAI (11 works,
  Shoghi Effendi renderings only, so no Aqdas, no Some Answered Questions).
* `concepts/backfill-original.js`, `original-term.js`
* `content.original_text`, counted by `docs-repo.enrichmentCoverage`

## The discipline to preserve
The survey "RANKS candidates but does not bind them. Title matching across
languages and transliteration systems is recall, not identification — the same
doctrine that governs person names. A candidate is a proposal for the alignment
pass to confirm by actual text overlap; it is never itself the answer."

Given the Íqán measurement — index matching would have misattached 291 of 292
paragraphs — a wrong binding here silently attaches every paragraph's original
to its neighbour's doctrine. Confirmation by overlap is not optional.

## What is missing
Not the machinery — the **place in the pipeline**. `original_text` appears
nowhere in `plan.js` or `processed.js`, so no book is ever considered incomplete
for lacking it, and no report mentions it.
