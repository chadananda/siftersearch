# bahai-library.com cleanup — classification (2026-10-09, read-only survey)

Chad 10-09: "we might need to further clean Bahai-library". Precedent: the oceanoflights scrape retirement (09-29).
Files here: `classify.py` (the rules), `doc-classes-20261009.tsv` (every live doc: id, file, title, classes, counts),
`deleted-unaudited.tsv` (the 2,980 deletions without audit rows). Nothing has been changed.

## The live bahai-library set: 75,057 documents
Each doc counted once, in the first matching class (docs · live paragraphs):

| class | docs | paragraphs | what |
|---|---|---|---|
| 1 listing / index pages | 32,201 | 100,100 | `Tag:`, chronology, bibliography, author lists, advanced-search pages |
| 1b Partial Inventory pages | 21,835 | 159,654 | per-tablet inventory pages — METADATA, never searched (Chad's rule) |
| 0 no stored text (other class none) | 13,044 | 0 | 28,605 docs in total have NO content rows though their files hold text |
| 4 numeric alias pages (`321.md`) | 1,815 | 129,868 | 4,422 of 4,543 have a named twin page |
| 3c query-string variants (`&sort`, `&chapter=`) | 729 | 171,226 | same page under URL variants |
| 3 text already held (≥½ of long paragraphs match a library/OL doc) | 995 | 100,542 | e.g. Cole "World as Text" 94/97 held |
| 2 near-empty | 1,180 | 2,705 | a line or two of page chrome |
| 3t same title as a held doc, text differs | 311 | 23,246 | mostly different works — review |
| **5 unique content — KEEP** | **2,945** | **237,318** | papers, theses, letters, compilations not held elsewhere |

So ~92% of the documents are navigation, catalogue, empty, or copies; ~4% are real unique content.

## Decisions needed (Chad)
1. **Retire** classes 1 and 1b, all text-less listing/inventory/numeric/variant pages, numeric aliases with a named twin,
   and query-string variants (except where `&chapter=all` is the only complete copy). Index removal goes through the outbox.
2. **Review before retiring:** class 3 (same edition/translation?), 3t, near-empty pages that are only a PDF link.
3. **Re-ingest, not retire:** ~9,842 text-less docs whose files hold real text (`writings-shoghieffendi-uncompiled`,
   `newspapers`, `uhj_*`, `pilgrim_*`) — a real search gap today.
4. **Keep** class 5.

## Also found
- `docs.paragraph_count` overstates bahai-library by 565k paragraphs (1,490,448 claimed vs 924,659 live rows).
- The 2,980 unaudited deletions all predate the audit log (08-10 and early 08-13); 2,382 were superseded by converted books
  of the same title; 578 still hold 6,978 live content rows (in Meili — drain via the outbox).

## Clef page-role classifier (10-09 evening) — Chad: "Use clef to classify pages that are only metadata"
`api/lib/library/page-role.js` (one System-1 choice: document · metadata · navigation) + runner
`scripts/library/classify-page-role.mjs` (reads each page's FILE, markup stripped; Clef forced, Jev asked too).
Gold set: `page-role-gold-20261009.tsv` (34 pages read by hand, chosen from the hard disagreements).

| version | change | Clef vs gold | Jev vs gold | Clef↔Jev (425-page stratified sample) |
|---|---|---|---|---|
| v1 | raw file head | 13/34 | 19/34 | 88.7% |
| v2 | markup stripped (pages open with ~1.5k chars of logo/table chrome) + sharper criteria | 26/34 | 25/34 | 93.2% |
| v3 | abstract-only pages named as metadata | **31/34** | 32/34 | **97.9%** |

v3's one document→metadata error (22077, an article) is why retirement needs BOTH models to say not-document.
Merge rule (`merge-page-role.py`): numeric-alias / url-variant duplicates retire regardless; listing / inventory rule hits
retire unless both models say document (→ review queue); pages the rules kept retire only if both say metadata/navigation.
`doc-classes-20261009.tsv` (8 MB) is not committed — copy at tower `/tank/sifter/bl-doc-classes.tsv`.
