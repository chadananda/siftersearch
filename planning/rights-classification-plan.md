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
- `encumbered` becomes derived (rights = private) for the transition, then retired (ratchet: no new reads).
- Chad 10-20: "it's set overly broad" — collection/religion-level defaults restrict whole shelves. The new class is decided PER
  DOCUMENT from evidence; nothing is restricted by where it sits.

## Classes — Chad's rule (10-20)
"included in non encumbered is all the published Baha'i writings and everything from institutions. just not privately published
books that are not found online"

| class | what | restricted |
|---|---|---|
| `writings` | all published Bahá'í Writings — Bahá'u'lláh, the Báb, 'Abdu'l-Bahá, Shoghi Effendi — and compilations of them | no |
| `institutional` | everything from Bahá'í institutions: UHJ (messages, letters, Research Dept compilations), BIC, ITC, OSED, NSAs, BWC publications | no |
| `online` | any other work whose text is freely available online (bahai-library.com, oceanlibrary.com, author sites, papers, journals) | no |
| `private` | **privately published books NOT found online** (individual authors, publisher editions held only as files — e.g. the Archive "Private" folder) | **yes** |

Everything is shareable in full unless it is a privately published book whose text is not online. Other traditions' scripture
and public-domain texts fall under `online`/public domain → not restricted.

## Evidence (cheap first)
1. Writer: paragraph/book author is a Central Figure or Shoghi Effendi → `writings`; an institution (UHJ, BIC, ITC, OSED, NSA,
   Research Dept, BWC) → `institutional`.
2. Source: a document scraped from or linked to a public site (source_url / source_site: bahai-library.com, oceanlibrary.com,
   bahai.org …) → `online`.
3. Otherwise (a book file with no public source): look it up — is the full text online? (search the title on bahai-library /
   OceanLibrary / the web; Dewey's scout already does this) → found: `online`; not found and it is a published book (ISBN,
   publisher, © notice): `private`.
4. Undecided → `online` provisionally (not restricted — the old flag was overly broad) and listed for review.

## Steps
0. [ ] Measure the current breadth: an ops report — docs encumbered by source (frontmatter vs collection vs religion
   meta.yaml), per collection, with sample titles — so the redo shows exactly what it un-restricts.
1. [ ] Migration: docs.rights / rights_basis / rights_checked_at; `servingPolicy()` module; `rightsClass()` pure classifier (evidence 1–4) with tests.
2. [ ] Dewey intake sets `rights` on every new document; the review screen shows it.
3. [ ] `rights-backfill` ops report over the library (dry run → counts per class → Chad reviews `copyrighted`/`unknown` samples
   → write). Includes the 2,029 "extra Ocean books" being ingested now.
4. [ ] Serving: every path asks servingPolicy(doc.rights) — encumbered reads replaced (ratchet), then the column retired. Verify every path (search hits, Anís quotes, reading guide, /documents full text, public API) respects
   encumbered — whole-text endpoints refuse; quotes capped.

## The ISBN rule (Chad 10-23) — built
"with non-canonical books with ISBN codes, we should consider them copyright encumbered and the first 40 paragraphs is all
we do" — narrowed: "This applies to published books." A **non-canonical BOOK with its OWN ISBN** → `encumbered = 1`,
`rights_reason = 'isbn-noncanonical'` (migration 175: docs.isbn, rights_reason, rights_checked_at). Never un-encumbers.
- canonical: `api/lib/rights/canonical.js` (`canonicalOf`) — Writings of the Báb/Bahá'u'lláh/'Abdu'l-Bahá, Shoghi Effendi,
  institutions (UHJ, Research Dept, BIC, ITC, NSAs/LSAs, BWC, OSED, Counsellors, BPT), the Writings/institutional shelves,
  other traditions except their modern-scholarship shelves, OceanLibrary.
- book: `docType()` — only 'book' is eligible (papers, letters, talks, pilgrim notes, compilations, institutional, web
  pages, theses, newsletters, news, short items < 100 paragraphs are never touched).
- own ISBN: `api/lib/rights/isbn.js` — metadata/frontmatter, or the copyright page in the first 40 paragraphs (labelled,
  valid checksum, beside a ©/publisher line, not a reference). A cited ISBN never counts.
- report `rights-isbn` (dry run; `{ write: true }` applies). Dry run: planning/rights-isbn-dryrun-20261023.md.
- serving: `api/lib/rights/preview.js` — first 40 paragraphs (admin/editor in full, `private, no-store`) on by-path,
  library/documents/:id, bilingual, documents/:id/segments, chat read tools (≤3-paragraph ranges, clipped); downloads,
  bulk export, translate/audio services refuse; the Anís reading guide never walks one.
