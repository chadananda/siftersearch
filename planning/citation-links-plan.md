# Every citation a real link (Chad 10-21)

"We will want to review all citations in all compilations and books and see if we can add a link to the source for everything.
The more we can upgrade references to real links (following our rule of linking to the most canonical version first), the
better. That way when we publish things with citations, they can be given real correct OceanLibrary (usually) links."

## What already exists (build on it, don't duplicate)
| piece | where | what it gives |
|---|---|---|
| link policy | `api/lib/source-links.js` `linkFor()` | OceanLibrary → Ocean of Lights → Phelps inventory → bahai-library → SifterSearch; paragraph/range links |
| canonical copy | `docs-repo` `resolveCanonical` / `canonicalForPage` | a duplicate always yields to the canonical document |
| quote → source | `content_source_links` (migr 139, ~246k) | a paragraph that QUOTES another → the quoted paragraph (text overlap) |
| numbered works | `refs/cite.js`, `refs/schemes.js` | "Gleanings CXXV", "Íqán ¶12", "Hidden Words, Persian 45" → paragraph |
| letters | `letters/letters.js`, `GET /api/library/letters` (migr 162) | "letter of 28 July 1954", "The Dispensation of Bahá'u'lláh" → book / chapter / message |
| sections | `sections-repo` (doc_sections) | sub-documents with paragraph ranges, title finder |
| page numbers | `content.pdf_page` / page markers | page → paragraph where the canonical copy carries its pagination |

## The citation shapes to handle (in order of value)
1. **Quote + reference** — `"…" (Gleanings, p. 215)` / `(GPB 123)` / footnote `¹ Bahá'í Administration, p. 15`.
2. **Letter references** — `(From a letter written on behalf of Shoghi Effendi, 28 July 1954)`, `(Shoghi Effendi, The Dispensation of Bahá'u'lláh)`, UHJ letters by date.
3. **Bare work references** — `see the Kitáb-i-Íqán, ¶12`, `cf. Some Answered Questions, ch. 11`.

## Pipeline (one ops job per stage, resumable, dry run first — the data-access rule holds)
1. **Detect** — `citations-detect`: parse every paragraph and footnote for citation spans → `citations` rows
   (paragraph id, span offsets, raw text, parsed {work, page, para, chapter, date, on_behalf}). A work-alias table maps
   abbreviations and spellings (GPB, PDC, ADJ, WOB, BA, MBW, CF, MA, SAQ, PT, Gleanings, Íqán, Aqdas …) to canonical documents.
2. **Resolve** — `citations-resolve`, cheapest evidence first:
   a. the quote right before the citation already has a `content_source_links` row → that source paragraph (text-exact);
   b. a numbered work → `refs` scheme; a letter → the letter lookup;
   c. a page → the canonical copy's pagination (pdf_page / page markers) — only where that copy's pagination matches the
      cited edition (record the edition; never guess across editions);
   d. otherwise the phrase index on the quoted text, restricted to the cited work.
   Each resolution stores method + confidence; text-verified beats page-mapped beats title-only.
3. **Link** — the target is the canonical document's paragraph range; the URL is `linkFor()` (OceanLibrary range link usually),
   stored with the citation so published answers, Anís letters and the reader all use the same link.
4. **Render** — the reader turns resolved citation spans into links; publishing / Anís / the public API emit them.
5. **Measure** — a `citations` coverage report per book: found / resolved (by method) / unresolved, and a review sample of
   each method; unresolved works list = acquisition / numbering gaps (feeds Dewey).

## Order
1. Shoghi Effendi's letters as cited in the core compilations (Lights of Guidance, the Research Department compilations)
   — the letter lookup is the resolver; benchmark = the 103-row timeline (97/103 top-1 on 10-21).
2. Citations of the Writings in those compilations (Gleanings, Íqán, Aqdas, SAQ, PT…) — refs + source links.
3. Secondary books and papers (bahai-library copies included, but linking out to the canonical text).

## Decisions (Chad 10-21)
- Letters written ON BEHALF of Shoghi Effendi ARE Shoghi Effendi's ("He had his secretary draft the letter at his instruction
  then he approved before sending. He is author.") — no on-behalf flag, no lower authority. Linked like any letter of his: to
  his own books first (Unfolding Destiny, Arohanui, Dawn of a New Day, High Endeavours, Messages to Canada…). Gap to close:
  letters printed ONLY in compilations (Lights of Guidance, Research Dept) are rejected today as 'not-own-work' → fall back to
  the compilation that prints the letter itself (not one that only quotes it again).
- Rendering (Chad 10-21): the visible citation is NEVER changed — it becomes a markdown link, `[(Gleanings, p. 215)](<url>)`,
  the href the properly formatted canonical link (OceanLibrary.com range link, OceanofLights.org, … per `linkFor()`). The link
  target is the passage found by its QUOTED TEXT (the printed page is left as printed). In the DB every citation stores a
  reference to the SOURCE content record (paragraph id) — a visible web of links and a DB web of connections. A bare page
  reference with no quoted text links to the work, not a guessed paragraph.
