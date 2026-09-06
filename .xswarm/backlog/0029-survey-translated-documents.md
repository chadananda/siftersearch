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

## MEASURED, 2026-09-06 — the real shape of the corpus
Files are the source of truth (Chad, 2026-09-06: "The library is in files… The
content and metadata is extracted into a SQLite db… All that is indexed by a
separate Melisearch engine"). SQLite is a derived artefact and must never be
read as the library — doing so produced two wrong conclusions in one session.

Library home: **Tower-NAS**. Chad, 2026-09-06: "The data is on Tower-NAS. It's a
Dropbox folder synced on the laptop." The path below is a SYNC MOUNT, not the
source — treat it as a local view that may lag or be partially materialised:

    ~/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library

Boss cannot see it at all, which is why the harvest cannot simply be dispatched
there the way other work is. 11,660 .md files:

    Baha'i 8096 · Judaism 1306 · Buddhist 836 · -sites 535 · Islam 295
    Christian 155 · Zoroastrian 109 · Tao 98 · Hindu 88 · Confucian 65
    Sikh 39 · Jain 28 · Jainism 0 (stray empty dir) · _retired-duplicates 10

Three facts that set the plan:

1. **Extraction is incomplete and gates everything.** 11,660 files on disk vs
   4,982 documents in SQLite. An original cannot be attached to a paragraph
   that was never extracted. Reconcile first; it is deterministic and cheap.

2. **The originals are not on disk.** Only 4 language-suffixed files exist in
   the entire library, so the `_en`/`_ar` stem pairing that makes OceanOfLights
   a parallel corpus lives on the site, not locally. Acquisition is unstarted.

3. **The 66,000 OceanOfLights pages described in `oceanoflights.js` are not
   here.** `-sites/` holds oceanlibrary.com only (535 files).

4. **Counts taken over a Dropbox sync are provisional.** Selective sync can
   leave placeholders that `find` still counts, so 11,660 is an upper bound
   until verified against Tower-NAS itself. Any harvest must read from the NAS
   or confirm full materialisation first — silently processing a placeholder
   as an empty document would mark works "extracted, no content" and look
   finished.

## Correction worth keeping
An earlier pass read the partial SQLite (17 Islamic docs, 1 Buddhist) and
concluded "the corpus is not interfaith", retiring the recension tier as
imaginary. That was wrong. The tier is real and covers ~2,700 non-Bahá'í
documents. The lesson is the one above: a derived subset invited a confident
claim about a population it did not contain, which is the same error the survey
itself warns about at line 214.

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
