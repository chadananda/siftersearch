# Paragraph authorship — the author belongs to the words, not to the book

Chad, 2026-10-02:
- "Author for all compilations should be a list of those cited."
- "Each paragraph in content table should further have author of the paragraph not the book. Likewise with every quoted
  paragraph in every book. It is important not to mis-attribute a paragraph just because it is cited in another book."
- "A paragraph that quotes inline should have both the author of the paragraph and the person cited inline, in an array
  of authors for that paragraph."

- "We need to be able to cite an author accurately, even when the author is being cited by someone else."

**Principle:** a citation names whoever wrote the words — located to the original where we hold it — and says where it
was quoted. Shoghi Effendi quoting Bahá'u'lláh yields: *Bahá'u'lláh, Gleanings XCII ¶2 — as quoted in Shoghi Effendi,
The World Order of Bahá'u'lláh*. Never "Shoghi Effendi" for Bahá'u'lláh's words, never "Bahá'u'lláh" for a letter in a
compilation. A search for an author finds their words wherever they are quoted.

## Why now (measured 2026-10-02)
- 3,974 attribution trailers ("(From a letter written on behalf of Shoghi Effendi …)") in 129 library docs.
- Whole Research Department compilations carry `author = Bahá'u'lláh` (Social Action, The Universal House of Justice,
  To Set the World in Order, Prayer and Devotional Life, Lights of Guidance doc 20804, …) — every Shoghi Effendi letter
  and House of Justice message inside them is mis-attributed. Omid's test (tests/quality: th-se-manifestations-one-soul)
  is one visible symptom: a Shoghi Effendi search cannot narrow to a letter filed under Bahá'u'lláh.

## Model
`content.authors` — JSON array, one entry per person whose words are in the paragraph:
```
{ name, role: 'author' | 'quoted', basis, detail?, on_behalf?, span?: [start, end], source_id? }
```
- `role:'author'` — whoever wrote these words. A paragraph that is ENTIRELY a quotation takes the quoted person as its
  author; the book's author is not listed.
- `role:'quoted'` — someone quoted inline; `span` locates the quoted words; `source_id` = the original paragraph when we
  hold it (citation resolves THROUGH it: the original's work + reference, "as quoted in" this book); the paragraph's
  writer stays the `author`.
- `on_behalf: true` — letters written on behalf of Shoghi Effendi / the House of Justice: searchable under that name,
  labelled, ranked below the principal's own pen (relative authority — see memory feedback_pilgrim_notes_relative_authority).
- `basis` — how it was decided: `book` (default: the doc's author) · `trailer` (compilation attribution line) ·
  `source_link` (content_source_links: the words are found verbatim in a source paragraph) · `inline` (attribution phrase
  in the text, e.g. "Bahá'u'lláh writes: “…”") · `judged` (Jev, flagged for review). Every attribution is auditable.

`docs.authors` — JSON list of everyone cited (compilations); `docs.author` stays the display name (compiler, or
"Compilation").

Existing pieces reused: `content_source_links` (246,516 quote → source paragraph links, 09-30), `quote_instances` /
`quote_clusters` (span-level speaker schema, never populated).

## Phases
1. **Deterministic, dry run first** (no writes until Chad reviews a sample):
   a. default `[{book author, role author, basis book}]` for every paragraph;
   b. compilations — trailer parser: an attribution line applies to the quoted paragraphs above it back to the previous
      heading / trailer; parse name, on-behalf, kind (letter, Tablet, talk), date;
   c. whole-paragraph quotations — content_source_links with high coverage: author = the source paragraph's author
      (resolved through the source's own authors, never the source book's author blindly);
   d. partial quotations — same links, lower coverage: add `quoted` with span.
2. **Inline attribution without a library source** ("He wrote: “…”" where the text isn't held): pattern + Jev, every
   such call `basis:'judged'` and listed for review.
3. **Search**: index payload carries `authors` (names) and `author_roles`; an author filter matches any entry, ranking
   prefers `author` over `quoted`, own pen over `on_behalf`. Meili and Qdrant both.
4. **Measure**: Omid's test, the type battery, a random 100-paragraph audit per basis.

## Pilot status (2026-10-03, 17 books, 42k ¶, dry run — nothing written)
Runner `scripts/authorship/read-book.mjs` (on tower: ~/phrase-build). Per book: evidence → `readBook` state machine →
Jev on open spans + continuation chains (CONT_MIN 0.8, SPAN_MIN 0.6, below → review list). Then, across books:
paragraph-author INDEX (a source link resolves through the SOURCE PARAGRAPH's attribution; links into a compilation or
multi-author prayer book are dropped unless that paragraph is attributed; catalogue authors that are not named writers
are ignored), identical-text propagation (letters-only key; strongest evidence wins; a primary text under its own
author is never relabelled; headings/meta never overwritten), mixed paragraphs (prose + quotation → both authors).
Cost: ~870 Jev calls, ~0.54M tokens ≈ $0.02 for 42k ¶ → library ≈ $4–6.

Audit, fresh random 50 each round (non-default attributions, ~5% of ¶): 80% → 77% → 81% → 93.5% → 91.5% of judged
content attributions correct; low-confidence ones go to review as designed. Defaults (book author, ~95% of ¶): 97%
outside two books — and wrong in those two:
- **429 Revelation of Bahá’u’lláh v1: ingested ONE PRINTED LINE PER PARAGRAPH.** Block quotations are invisible; most of
  the book's errors. Fix is re-ingest by real paragraphs (an ingest decision), not attribution.
- **2095 The Master in California**: catalogued "Frances Orr Allen", mostly ‘Abdu’l-Bahá's talks. Speaker headings
  ("ADDRESS BY ‘ABDU’L-BAHÁ") now assign 1,598 ¶; the early part has talks without bylines. ALSO: every paragraph is
  stored 4× (same paragraph_index, four live rows) — duplicate content, not touched (deletions on hold).
Remaining error classes: Jev guessing a writer for unnamed compilation prayers (Mashriqu’l-Adhkár: says Bahá’u’lláh
at 0.9 where ‘Abdu’l-Bahá is likely); continuation chains in 429; reference/title lines labelled as someone's words.

## Open (Chad)
- On-behalf letters: searchable as Shoghi Effendi / the House of Justice with a label (proposed) — or a separate
  "secretary" author?
- Compilation display author: compiler name where known, else "Compilation" (proposed).
