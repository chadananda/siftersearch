# Rights classification — shareable in full vs copyrighted (Chad 10-20)

"our library is meant to hold copyrighted books" — and — "we really do need to distinguish between copyrighted published
books and documents which we can share in full. Maybe that will have to be another classification step."

## What exists
`docs.encumbered` (frontmatter → collection meta.yaml → religion meta.yaml → false; api/lib/authority.js getEncumbered).
Read by chat.js, library.js, public-api.js: an encumbered work is searchable and citable, quoted only in short passages, never
served whole. Today almost nothing sets it per document — Dewey never does — so a modern copyrighted book ingested through
Dewey is served like a public-domain text.

## Classes
| class | examples | encumbered |
|---|---|---|
| `public-domain` | scripture translations in the public domain, pre-1930 publications, Phelps' renderings (PD, Chad 09-29) | no |
| `shareable` | Bahá'í World Centre texts published for free distribution (bahai.org library), UHJ / BIC / ITC / OSED statements, author-licensed papers | no |
| `copyrighted` | published books by living or recent authors (Saiedi, Redman, Stockman, Dunbar, Taherzadeh …), publisher editions | **yes** |
| `unknown` | no publisher/date evidence | yes until reviewed (safe default) |

## Evidence (cheap first)
1. Explicit: frontmatter `rights:` / `license:`; collection meta.yaml.
2. Source: bahai.org/library, bic.org, uhj.org → shareable; oceanlibrary.com → per its own rights field; Phelps PI → public-domain.
3. Dates: publication year + author death year (author_meta) → public domain where life+70 / pre-1930 rules clearly apply.
4. Text: copyright notice / ISBN / "All rights reserved" in the front matter of the file → copyrighted.
5. Model (Haiku, one call, title + first pages + the above): only when 1–4 don't decide; low confidence → `unknown` → review.

## Steps
1. [ ] `rights` column/field (migration) + `rightsClass()` pure classifier (evidence 1–4) with tests.
2. [ ] Dewey intake sets `rights` (+ `encumbered`) on every new document; the review screen shows it.
3. [ ] `rights-backfill` ops report over the library (dry run → counts per class → Chad reviews `copyrighted`/`unknown` samples
   → write). Includes the 2,029 "extra Ocean books" being ingested now.
4. [ ] Serving: verify every path (search hits, Anís quotes, reading guide, /documents full text, public API) respects
   encumbered — whole-text endpoints refuse; quotes capped.
