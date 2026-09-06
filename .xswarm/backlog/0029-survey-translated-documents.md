---
id: "0029"
title: Survey every translated document and classify its original
state: ready
traces_to: .xswarm/backlog/0026-source-text-alignment.md
priority: P1
size: L
depends_on: []
acceptance:
  - text: every document in the library is classified — original-language, translated, or unknown
  - text: each translated document carries a tier (1-5) and its identified original where one exists
  - text: counts are reported per tradition and per tier, so the size of the remaining research is known rather than guessed
  - text: identification starts from the translation's own paratext — title page, preface, translator's note, bibliography, series and edition data
  - text: each identified source records what the evidence was and how strong it is; a declared source and a guessed one are never stored the same way
  - text: no original is bound to a work on title match alone; the survey proposes, alignment confirms
  - text: documents whose original cannot be determined are marked unknown, never silently skipped
---

## Why this comes before any more alignment
Chad, 2026-09-06: "Every book document with translated content should attempt to
find and add the original for each paragraph. Huge research project."

Nobody currently knows how big it is. The library holds ~6.7M paragraphs across
ten traditions, and no count exists of how many documents are translations, how
many have an original already in the corpus, or how many have no original at
all. `source-survey.js` answers this for the Bahá'í canon only; for everything
else the question has never been asked.

Until that count exists the work cannot be scheduled, budgeted, or reported on,
and "huge" remains the only honest estimate available.

## What good looks like
One artefact: a table of tradition × tier × document count. That turns an
open-ended research project into a set of finite ones, and shows which tier is
worth funding first.

## Method: ask the translation what it was translated from
Chad, 2026-09-06: "We should always start by trying to find published original
text that is likely the source for our translation."

The target is not *an* original of the work. It is **the published text this
translator actually worked from** — a specific edition, with its own readings,
pagination and variants. A modern critical edition of the same work is a
different text, and aligning against it silently substitutes a source the
translator never saw.

Order of evidence, strongest first:

    1  declared    the translation states its source — title page, preface,
                   translator's note, bibliography, colophon, series data.
                   This is evidence. Look here before anything else.
    2  inferable   the edition the translator would plausibly have used, from
                   date, place, language community, and what was in print then.
    3  matched     no statement and no strong inference; a candidate found by
                   text overlap against what we hold.

Most of the corpus should resolve at 1, and 1 is nearly free — it is reading
front matter we already have. Reaching 3 is the expensive path and should be
the exception, not the default.

## This is what collapses the recension problem
An earlier draft of 0026 treated "which recension is the original?" as a
scholarly judgement the pipeline would have to make and record — for Buddhist
texts across Pali, Sanskrit, Chinese and Tibetan, or for the Bible's several
source languages. Mostly it is not a judgement at all. The translator already
made it and usually said so. A translation from the Chinese names the Taishō
text; one from the Pali names its edition.

The genuinely contested cases are the residue after asking, not the starting
assumption. Ask first; the pile will be much smaller.

## Note on confidence
"Likely the source" is the honest phrasing and should survive into the data. A
source identified from a stated preface and one guessed from a date are not the
same claim, and storing them identically destroys the distinction exactly where
a provenance query needs it.

## Method note
`source-survey.js` deliberately ranks candidates without binding them. Keep that
property. This item produces *proposals* for the alignment pass to confirm by
text overlap — a survey that asserts identifications will attach wrong originals
at scale, and wrong originals are worse than absent ones because they read as
done.
