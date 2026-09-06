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

## Method note
`source-survey.js` deliberately ranks candidates without binding them. Keep that
property. This item produces *proposals* for the alignment pass to confirm by
text overlap — a survey that asserts identifications will attach wrong originals
at scale, and wrong originals are worse than absent ones because they read as
done.
