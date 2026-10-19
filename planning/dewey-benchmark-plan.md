# Dewey benchmark — known answers without a test set (2026-10-18)

Chad: "I do not have a test set … consider many possible scenarios — different typist, different OCR, different
edition, different format, abridged version … figure out if a document fits the library and is of value."

**Idea:** the library is the test set. Every case is MADE from a document we hold (or from a text we verifiably do
not hold), so the right verdict is known by construction. Scripts only (API clients: download text via
`/api/documents/:id/download`, ask `POST /api/dewey/holdings` with a file) — no DB access.

## Scenarios and the verdict each must get

| id | scenario (made from a held document D unless noted) | must be | hard failure |
|---|---|---|---|
| P1 | same text, plain .txt | held | not-held |
| P2 | other formats: .docx .html .epub .rtf, text-layer .pdf | held | not-held |
| P3 | clean SCAN of D (image-only PDF; Dewey OCRs it himself) | held | not-held |
| P4 | bad scan: low resolution, noise, skew | held or undetermined | not-held |
| P5 | OCR-error text: character confusions (rn→m, l→1, fi ligature), broken hyphens, running headers, page numbers | held | not-held |
| P6 | retyped: diacritics dropped (Bahá'u'lláh→Bahaullah), other quotes/apostrophes, typos, other paragraphing, Bahai/Baha'i spellings | held | not-held |
| P7 | other edition: new preface + index, 5% of paragraphs reworded, 3% dropped | held | not-held |
| P8 | abridged: ~40% of paragraphs kept, sentences trimmed | held (the library has the fuller text) | not-held |
| P9 | excerpt: one contiguous chapter (5–15%) | held | not-held |
| P10 | superset: D plus new chapters from a text we do not hold | partly-held | — |
| P11 | short documents (letters, pilgrim notes: 200–800 words) under P5/P6 | held | not-held |
| P12 | non-English held documents (Persian, Arabic, French) under P5/P6 | held | not-held |
| G1 | a new compilation: short quotations from several held works between new prose | possible or not-held | held |
| G2 | commentary: new prose quoting one held work heavily (~30%) | possible or not-held | held |
| N1 | a text we do not hold (public domain, verified absent) | not-held | held |
| N2 | SAME TITLE AND AUTHOR as a held D, different text | not-held | held |
| N3 | same author as a held D, a different work we do not hold | not-held | held |
| N4 | blank / noise scan | undetermined | held or not-held |

The two errors that matter for spidering drives:
- **A new work called held** (G, N rows): a book we lack is skipped and lost. The worst error.
- **A held work called not-held** (P rows): a duplicate offered or imported, and a person's time spent.

"possible" on an N row is a soft failure: it costs a person's look, not a book.

## Fit and value (phase 2)
On the same cases plus out-of-scope texts (a novel, a cookbook, a manual): the appraisal must recommend
in-scope works and skip the rest; value = not held + in scope + readable.

## Pieces
`scripts/dewey-bench/`: `variants.mjs` (pure, seeded transforms, tested) · `render-scan.py` (text → scanned
PDF) · `build.mjs` (pick held documents, download, make cases + manifest) · `run.mjs` (ask Dewey, resumable) ·
`report.mjs` (per scenario: pass, soft, hard failures, with the cases). Cases and results in `tmp/dewey-bench/`.
