# Rights classification — shareable in full vs copyrighted (Chad 10-20)

"our library is meant to hold copyrighted books" — and — "we really do need to distinguish between copyrighted published
books and documents which we can share in full. Maybe that will have to be another classification step."

## What exists
`docs.encumbered` (frontmatter → collection meta.yaml → religion meta.yaml → false; api/lib/authority.js getEncumbered).
Read by chat.js, library.js, public-api.js: an encumbered work is searchable and citable, quoted only in short passages, never
served whole. Today almost nothing sets it per document — Dewey never does — so a modern copyrighted book ingested through
Dewey is served like a public-domain text.

## Redo, don't patch (Chad 10-20: "I think the encumbered flag will have to be redone")
`encumbered` is a boolean inherited from collection/religion meta.yaml — it cannot say WHY a work is restricted, cannot tell
"unknown" from "copyrighted", and drifts from the documents it covers. Replace it:
- `docs.rights` (class below) + `docs.rights_basis` (the evidence: 'source:bahai.org', 'notice:©2017 Kalimat', 'date:1911',
  'model:0.82', 'chad') + `rights_checked_at` — the ONE source of truth, per document.
- A `servingPolicy(rights)` table in one module decides every serving path (full text / reading guide / quote length / public
  API / download) — no path reads a boolean.
- `encumbered` becomes derived (rights = copyrighted) for the transition, then retired (ratchet: no new reads).
- Chad 10-20: "it's set overly broad" — collection/religion-level defaults restrict whole shelves. The new class is decided PER
  DOCUMENT from evidence; nothing is restricted by where it sits.

## Classes
| class | examples | restricted (full text never served) |
|---|---|---|
| `public-domain` | scripture translations in the public domain, pre-1930 publications, Phelps' renderings (PD, Chad 09-29) | no |
| `shareable` | Bahá'í World Centre texts published for free distribution (bahai.org library), UHJ / BIC / ITC / OSED statements, author-licensed papers | no |
| `copyrighted` | published books by living or recent authors (Saiedi, Redman, Stockman, Dunbar, Taherzadeh …), publisher editions | **yes** |
| `unknown` | no publisher/date evidence | **no** — restricted only on evidence (Chad: the old flag was overly broad); listed for review |

## Evidence (cheap first)
1. Explicit: frontmatter `rights:` / `license:`; collection meta.yaml.
2. Source: bahai.org/library, bic.org, uhj.org → shareable; oceanlibrary.com → per its own rights field; Phelps PI → public-domain.
3. Dates: publication year + author death year (author_meta) → public domain where life+70 / pre-1930 rules clearly apply.
4. Text: copyright notice / ISBN / "All rights reserved" in the front matter of the file → copyrighted.
5. Model (Haiku, one call, title + first pages + the above): only when 1–4 don't decide; low confidence → `unknown` → review.

## Steps
0. [ ] Measure the current breadth: an ops report — docs encumbered by source (frontmatter vs collection vs religion
   meta.yaml), per collection, with sample titles — so the redo shows exactly what it un-restricts.
1. [ ] Migration: docs.rights / rights_basis / rights_checked_at; `servingPolicy()` module; `rightsClass()` pure classifier (evidence 1–4) with tests.
2. [ ] Dewey intake sets `rights` on every new document; the review screen shows it.
3. [ ] `rights-backfill` ops report over the library (dry run → counts per class → Chad reviews `copyrighted`/`unknown` samples
   → write). Includes the 2,029 "extra Ocean books" being ingested now.
4. [ ] Serving: every path asks servingPolicy(doc.rights) — encumbered reads replaced (ratchet), then the column retired. Verify every path (search hits, Anís quotes, reading guide, /documents full text, public API) respects
   encumbered — whole-text endpoints refuse; quotes capped.
