---
id: "0026"
title: Original text for every translated paragraph in the library
state: ready
traces_to: docs/architecture/conceptual-track.md
priority: P1
size: XL
depends_on: ["0029"]
acceptance:
  - text: every translated canonical outside CTAI has its in-corpus original identified, or is marked unlocatable
  - text: alignment runs against those originals and populates content.original_text
  - text: coverage of content.original_text is reported per document and fleet-wide
  - text: alignment becomes a gated stage, or its absence from the gate is a recorded decision
  - text: the three no-authored-original works are excluded by rule, not left permanently red
  - text: a candidate original is confirmed by text overlap, never by title match alone
  - text: the published source a translation actually names is preferred over any other text of the same work, including a better modern edition
  - text: works are classified into the five tiers, and coverage is reported per tier
  - text: where a work has recensions or several source languages, the choice is recorded as an editorial decision with its reason
  - text: tier 1 completes without waiting on the contested tiers
---

## Problem
Chad asked on 2026-08-25 that every translation paragraph carry its source text
as a field. `concepts/source-survey.js` records the request verbatim. He noted
on 2026-09-06 that it had never been mentioned in any status — and it has not,
because it is not gated and not reported.

## Scope, Chad 2026-09-06

> Every book document with translated content should attempt to find and add
> the original for each paragraph. Huge research project.

**Every translated document in the library**, not only the Bahá'í canon. The
corpus is interfaith — the vocabulary in the pipeline names Baha'i, Christian,
Islam, Judaism, Buddhist, Hindu, Sikh, Tao, Zoroastrian and Jain — so this
reaches scripture, commentary and secondary works across all of them, over
6.7M paragraphs.

It is called a research project because the hard part is not alignment. The
hard part is **bibliographic identification**: for each translated work,
establishing which original-language work it renders, and locating a text of it.
`align.js` already handles the mechanical half well and is measured.

## Where the difficulty actually sits, by tradition
This is not uniform work, and pretending it is will produce wrong originals:

* **Single authored original** — the Bahá'í writings, the Qur'án. One text,
  one language. The cleanest case.
* **Multiple original languages in one work** — the Bible: Hebrew, Aramaic,
  Greek. "The original" is a per-book question, sometimes per-passage.
* **Recensions rather than an original** — Buddhist texts across Pali,
  Sanskrit, Chinese and Tibetan; Hindu texts across recensions. Choosing one is
  a scholarly judgement, and a silent choice is a misrepresentation.
* **No authored original** — the three recorded exclusions, and there will be
  more. Talks taken down by others.

An alignment that attaches a Sanskrit recension to a translation made from the
Chinese is wrong in a way no similarity score will catch.

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

## Making it tractable
It cannot be run as one job.

**Identification comes first, and the tier is its result.** An earlier version
of this item tiered by "is the original already in the corpus?", which is the
wrong first question: a text we already hold may be the wrong edition, and
using it because it is convenient is how a translator's actual source gets
silently replaced. Establish what the translation was made from (0029), then
ask whether we hold that. Cost is a consequence of the answer, never a reason
to change it.

Decompose by cost, cheapest first — the cheap tiers are also the
highest-authority:

    1  in-corpus, Bahá'í      identified source already in the library.
                              245 Arabic + 23 Persian for the Báb alone.
                              No acquisition, no scholarly judgement.
    2  in-corpus, other       original already held for any tradition.
    3  external, unambiguous  one original, obtainable, licence permitting.
    4  external, contested    recensions or multiple source languages. Needs a
                              recorded editorial decision per work, not a fetch.
    5  no original            excluded by rule, with the reason.

Tier 1 is finishable and directly serves the doctrinal spine. Tier 4 is a
standing scholarly programme and should never block the others.

**Report coverage per tier.** A single global percentage over a task this
shaped tells nobody anything.

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
