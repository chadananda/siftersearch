# Document metadata — gather it systematically, query it by strategy (2026-10-01)

**Chad:** "We need general metadata fields associated with each document, including date written, date published,
publication, author, translator etc. These may not be indexed, so a query against them would first gather the target
items then extract the desired fields. That type of search strategy would be chosen by Jev. We will want to think about
this type of metadata and gather it systematically for all documents."

## What exists (checked 10-01)
- `doc_meta` (api/lib/doc-meta.js, doc-meta-store.js; built by POST /api/tablets/docmeta/rebuild): ONE sourced record per
  document — every field keeps its source, derived fields are marked, nothing invented ("a wrong value is worse than an
  absent one", api/lib/text/source-metadata.js). Tablets merge Phelps' Partial Inventory + oceanoflights (recipient,
  place, date range, period, genre, PIN, first line, alternate names). Public: GET /api/documents/:id/about.
- In practice books carry only the library basics. Samples: Kitáb-i-Íqán (20810), Promulgation (20917), Paris Talks
  (8320) → title, author, description, religion, language (+collection) only — no date written, translator,
  publication, edition; the talks inside Promulgation have no date/place at all in our copy.

## Fields

Work level (one per document) — each value `{ value, source, confidence, derived? }`:

| group | fields |
|---|---|
| identity | title, original title (native script), alternate titles, canonical citation (e.g. PIN, Gleanings §, sura) |
| people | author (the voice), compiler / editor, translator(s) with **translation authority** (authorised · approved · provisional · scholarly), recipient(s) / addressee |
| time | **date written / revealed** (exact or range, approx flag, calendar as given), **date published** (first), edition date |
| place | place written / revealed, place(s) of the events it concerns |
| publication | publisher, publication / series (e.g. Star of the West, vol. 3 no. 12), edition, pages, ISBN where it exists |
| relations | original-language document (link), translations (links), source work for a compilation, contains / part of |
| kind | genre: tablet · letter · talk · prayer · law · history · memoir · diary · commentary · compilation · study guide · scholarship · news |
| authority | authority tier of the text (existing 1–10), of the translation |
| scope | period covered (for histories, diaries), subjects |

**Unit level** — many documents are containers: Promulgation (≈140 talks), Paris Talks, Star of the West (articles,
talks, letters), Maḥmúd's Diary (dated entries), compilations (extracts from many works). A unit = a contiguous span
of paragraphs with its own: title, kind (talk, letter, article, diary entry, extract), date, place, speaker/author,
recipient/audience, source (for extracts: the work it is taken from). Same `{value, source, confidence}` shape.
This is what the timeline of 'Abdu'l-Bahá's talks needs, and what "dates of works and passages" (research-patterns
layer 1) means in practice.

## Gathering — a META enrichment stage (offline; never at query time)
Per document, in order, keeping every candidate value with its source:
1. **Existing structured sources:** file frontmatter, Phelps inventory, oceanoflights/OceanLibrary/bahai-library
   catalogue pages, CTAI work list, tables already in the library (e.g. the Promulgation spreadsheet of talks, 39271).
2. **The document's own front and back matter**, read deterministically: title page, preface/foreword, colophon,
   dated headers ("Talk at …, 11 April 1912"), diary date lines ("Wednesday, April 24, 1912 [Washington DC]").
3. **Cross-document evidence:** a later work stating when this was written; translations stating their original;
   quotation links (a work quoted in 1923 existed by 1923 — a bound, not a date).
4. **Jev decides** between conflicting candidates (typed choice + confidence: "which date does this foreword give for
   the revelation?", "is this unit a talk, a letter or an article?"). Confident → stored; unconfident → flagged for a
   careful reader. Absent → NULL with "not stated". Never a guessed value.
5. Coverage report per field (API endpoint): share of documents with each field, by collection and kind — so gaps are
   visible, not discovered by users.

Order: the ~898 enriched works and kernel texts first; then containers of talks/letters (units); then the rest.

## Query side — Jev-chosen strategies
- `metadata_lookup` — "when was the Íqán written?", "who translated Paris Talks?": find the target document(s) (title /
  doc_meta FTS / entity), then read the field. No vectors. ~ms after the Jev plan.
- `metadata_gather` — "timeline of 'Abdu'l-Bahá's talks in the West", "every tablet to Ḥájí Mírzá Ḥaydar-'Alí": gather
  the target units (filters on kind, author/speaker, place, period), then extract the requested fields; fill missing
  values from the unit-level evidence with a Jev round; sort/format (timeline, table, list).
- `metadata_filter` — narrowing any other strategy by these fields ("Shoghi Effendi's translations only", "letters
  written before 1921", "authorised translations").
The fields need not all be in a search index: the strategy gathers targets first, then reads fields from doc_meta.
Fields that are filtered on often (kind, author, date range, translation authority, language) also go onto phrase and
paragraph entries as filters.

## Measure
- A metadata question battery (≥ 100: when / who translated / where / which edition / list-with-dates), judged against
  a hand-checked answer key; plus field coverage per collection before/after each gathering pass.
