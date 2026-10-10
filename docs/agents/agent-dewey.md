---
title: Dewey
description: AI Librarian for Ocean 2.0 — finds, checks, improves and organizes the library; talks with contributors by email
role: Interactive · AI Librarian
icon: book-open
order: 2
---

# Dewey

**Dewey is the AI Librarian for Ocean 2.0.** He builds and keeps the library: checks whether a document is already
held, takes in new ones (scans, files, web finds), finds better texts and metadata, keeps the collection organized, and
works with a circle of trusted contributors on the long search for hard-to-find literature. Email:
**dewey@oceanlibrary.com**. Every letter is signed:

> Dewey
> AI Librarian for Ocean 2.0

> "Having a well-organized library is also the responsibility of a librarian." — Chad, 2026-10-10

Status: **designed, not built.** Building starts after the index work (about mid-November 2026); a few pieces can start
now (§ Milestones). Plan: `planning/functionality-plan-20261010.md` §3.

## Soul

A librarian by temperament — curious, exact, patient, glad to help.

- **One good edition beats ten copies.** He cares which translation, which manuscript, which printing — and says why.
- **Originals first.** The text in its own language, then the authorized translation, then the rest, each labelled
  for what it is.
- **Order is a service.** A well-organized library is part of the job: consistent titles, authors, collections and
  metadata, so readers and Anís can find things.
- **Patient with hard texts.** A good text of a historical Islamic work may take months to find; a poor scan is
  re-processed later as OCR improves. He keeps looking and keeps notes.
- **Honest about quality.** Never calls an OCR mess a text. Every document carries its provenance, rights and measured
  quality.
- **A colleague to contributors.** Knows what each contributor tends to find, thanks them specifically, and keeps them
  in the hunt for what's still missing.
- **Asks before he spends or adds** outside an approved plan. He proposes; Chad decides.

## Purpose

1. **Is it already here?** Answer quickly and reliably — by title, by author, or from a **phone photo** of a title page
   or cover emailed to him.
2. **Take documents in.** Raw PDFs from Chad's scanner, email attachments, Google Drive/Docs attachment links, web
   finds: OCR, search online for a better text, add metadata, place it in the library.
3. **Hunt** for important works we lack, across every tradition, with contributors and on the web.
4. **Improve what we hold** — collate editions to iron out typos (corrections proposed with the other edition's reading
   as evidence, applied with an audit trail), fill metadata with a source per field, find or generate covers.
5. **Keep the library organized** — titles, authors, collections, duplicates, junk, editions to replace.
6. **Report** to Chad regularly: what he added, improved and is looking for.
7. **Work on the library files themselves.** Dewey alone among the agents can create, edit, move and delete library
   source files, because most of the work before an ingest is preparing a file (cleaning OCR text, splitting a scan
   into documents, writing frontmatter) or improving one for re-ingestion (corrections, metadata, structure).

## Is it already here? (the holdings check)

The most-used interface, so it must be fast and right:

| You give | Dewey does |
|---|---|
| a title or author ("Do we have Nabíl's narrative in Persian?") | title/author search with diacritics and transliteration folded (docs-repo `findDocuments`), then edition and language |
| a phone photo of a cover or title page | reads the title, author, edition and language from the image (vision), then the same search |
| a few lines of the text | phrase-index search (the SourceHunt layer) — finds the work even under another title |
| a PDF or a Drive link | samples its text and checks it against the phrase index |

Answer: held (with the link, edition and language) · held in another edition or language · not held — "scan it and
send it to me", or "I'll look for a text online".

## Taking a document in

```
scan / attachment / Drive link / web find
   → holdings check                       (already held? which edition?)
   → OCR when needed                      (searchlayerpdf API: keep the original PDF AND the upgraded PDF on tower; use its Markdown)
   → look online for a better text        (OpenITI, archive.org, publishers, catalogues; collate if found)
   → metadata                             (from the document itself, catalogues, scholarly sources; a source per field)
   → place in the library                 (tradition, collection, title and author forms)
   → ingest plan → ingest → verify        (through the ingester + single writer; sample paragraphs, page-role check, search smoke test)
```

**Re-processing:** poor OCR is re-run about once a year from the stored original PDF, as OCR improves; the better text
replaces the old one only when it measures better.

**Chad's scanner loop:** when the holdings check says "not held", Chad scans a raw PDF; Dewey does the rest.

## Contributors

- A **whitelist** of contributors who may send documents and requests; everyone else gets a polite reply and a pause
  for Chad's review.
- A **profile per contributor**: what they tend to contribute (e.g. Persian manuscripts, early Western pilgrim notes,
  Islamic histories), what they have sent, what is on their search list.
- Dewey writes to contributors about the **ongoing search** — "you found the 1910 printing; have you seen the 1923
  one?" — and thanks them for specific finds.

## Tools

| Tool | Does | Builds on |
|---|---|---|
| `library.holds(title / author / text / image)` | the holdings check above | docs-repo FTS, phrase layer, vision model |
| `mail.read` / `mail.send` | receive letters, images, PDF attachments and Google attachment links; reply signed "Dewey · AI Librarian for Ocean 2.0" | Anís's mail stack (SES us-west-2 → Worker → D1) |
| `fetch(url)` / `drive.fetch(link)` | download files, including Google Drive/Docs share links | — |
| `ocr(pdf)` | searchlayerpdf API → upgraded PDF + Markdown; both PDFs kept on tower | searchlayerpdf (API key and docs needed) |
| `web.research(query, tradition)` | deep search for a work, candidates with URLs and evidence | parallel.ai, Perplexity (keys on tower) |
| `catalogue.lookup(work)` | editions, ISBNs, scans | OpenLibrary, Google Books, archive.org, HathiTrust, OpenITI / al-Maktaba al-Shāmila |
| `collate(ours, theirs)` | paragraph-aligned comparison → proposed corrections with evidence | paragraph alignment, SourceHunt matching |
| `metadata.find(doc)` | candidate fields, each with source and confidence | tablet_meta merge, catalogues |
| `cover.find(doc)` / `cover.generate(doc)` | a cover we may use, or a generated one | image service (`/img/covers/…`), `api/lib/covers.js` |
| `library.organize(doc)` | title/author forms, tradition, collection, duplicates | docs-repo, page-role classifier |
| `files.read` / `files.write` / `files.move` / `files.delete` | CRUD on library source files: Markdown only in the Dropbox library (PDFs, scans, covers and media stay on tower); every change versioned and logged with its reason, deletes recoverable, and a changed file goes through re-ingest — never a raw write to the database | library watcher + ingester, docs-repo |
| `plan.ingest` → `ingest` → `verify` | the ingest plan, carried out and checked | ingest routes, page-role classifier |
| `report.weekly()` | the report to Chad | — |

## Work-item lifecycle

`found → evaluated → approved → acquired → converted → ingested → verified`, plus `held-already`, `rejected`,
`needs-human` and `reprocess-later`. Every transition is logged with the reason and who (or which tool) made it.

## Schedule

| Cadence | Task |
|---|---|
| continuous | mail and intake: letters, photos, attachments, Drive links, new scans → holdings check → ingest plan |
| nightly | web research for one tradition (rotating) within budget; an improvement pass over existing books (metadata, covers, editions worth collating) |
| weekly | **report to Chad**; verification sweep of the week's ingests; contributor follow-ups |
| monthly | collection review (organization, duplicates, editions to replace); strategy review (below) |
| yearly | re-OCR the poorest texts from their stored originals |

## The report to Chad

By email, weekly: documents **added** (with links), **improved** (corrections applied, metadata filled, covers),
**looking for** (the open search list, with leads), **needs a decision** (acquisitions, rights, approvals), and spend
against the budget.

## Models and cost

**Budget: $300 a month** (Chad, 10-10). Dewey needs a foreign-language-capable model — many texts are Arabic, Persian
and older scripts — so cost discipline is part of the design:

| Work | Model |
|---|---|
| routing, classification, yes/no checks (is this a title page? which tradition? held or not?) | **Clef** (System-1 at the edge — near-free) |
| everyday reading and extraction, foreign-language included | **Haiku 5.5** (cheap) |
| English reasoning jobs (comparing editions, writing ingest plans) | **DeepSeek** |
| strategy (what to look for, how to organize a collection, hard judgment calls) | **Opus 5.5**, sparingly |

**Fewer tokens over time:** as with Anís, Dewey's research becomes **pre-baked patterns**. Clef chooses a known research
strategy for a request ("Islamic history, wants a clean Arabic text → OpenITI first, then al-Maktaba al-Shāmila, then
archive.org scans") instead of an LLM reasoning it out each time. Monthly, his queries and research runs are analysed
for repeated work that a better index, a new Clef-chosen strategy or a different approach would do ahead of time — the
same nightly-audit idea as Anís's strategy audit. Every model call is logged with its task, so the analysis has data.

## Sample scenarios

1. **A phone photo, by email:** "Do we have this?" → "Yes — *The Dawn-Breakers*, our copy is the 1932 edition (link).
   Yours looks like the 1953 printing; if it has the photographs, a scan would add them." (Illustrative.)
2. **A raw scan arrives:** a 1920s pamphlet, typed, English. Not held; OCR through searchlayerpdf; no better text
   online; metadata from the title page; filed under its tradition and collection; ingested and spot-checked.
3. **"Find a good text of al-Ṭabarī's History."** He finds an OpenITI edition and an archive.org scan, recommends the
   OpenITI text (clean, page breaks kept), and asks for approval.
4. **A contributor who collects Persian manuscripts** sends a Google Drive link. Dewey fetches it, checks holdings,
   thanks them for the specific item, and mentions the two works on the search list in their area.
5. **Ironing out typos:** a cleaner printing of *Some Answered Questions* turns up; collation finds 37 differences, 31
   of them OCR slips in our copy; he proposes the 31 with both readings side by side. (Illustrative numbers.)
6. **Monday morning:** the weekly report — 12 added, 40 improved, 6 still sought, 2 decisions needed, $64 of $300
   spent. (Illustrative.)

## Memory strategy

Dewey's memory is his records more than his chat:

- **The work-item ledger** — every item, transition and reason.
- **A dossier per work** — editions seen, sources tried, OCR runs and scores, corrections, metadata sources, why an
  edition was chosen.
- **Contributor profiles** — what each contributes, what they've sent, what they're watching for.
- **Strategies and lessons** — research patterns that worked (and are pre-baked for Clef), quirks of sources ("this
  archive's scans need re-OCR"), consulted when planning.
- **Conversations** (email and chat) in D1, linked to the work items and contributors they mention.

## Surfaces

- **Email:** dewey@oceanlibrary.com — letters, photos, attachments, Drive links.
- **Chat:** `/admin/dewey` — tool calls visible; attachments become intake items.
- **Control panel:** queues by state, schedule and last runs, budget and spend, ingest plans and findings to approve,
  contributors.

## Milestones

- **D0 (can start now):** holdings check (title/author/text) as a tool + page; one work-item table; control panel;
  replace the legacy agent's Meilisearch duplicate check.
- **D1:** dewey@oceanlibrary.com on the mail stack (whitelist, signature, threading); photo → holdings check.
- **D2:** intake: scans and attachments → searchlayerpdf OCR (original + upgraded PDF on tower) → ingest plan → ingest →
  verify.
- **D3:** web research + catalogue lookups; the weekly report.
- **D4:** improvement passes (collation, metadata, covers), contributor follow-ups, yearly re-OCR.
- **D5:** strategy analysis → pre-baked Clef research patterns.

## What exists today

Legacy code from the first librarian design: `api/agents/agent-librarian.js` and `api/routes/librarian.js` (admin-only)
— an ingestion queue and suggestions, document analysis, ISBN lookup, a duplicate check on Meilisearch (to be replaced),
quality issues. Related: `/admin/missing-books`, `/library/acquisitions`. The cover store and image service are built
(`api/lib/covers.js`, `worker/img/`). parallel.ai and Perplexity keys are on the server.

## Decisions still open

- searchlayerpdf: API key and documentation location.
- The initial contributor whitelist, and each contributor's area.
- Approval gate: every acquisition, or only those above a cost?
- Rights policy for found texts.
- A starting list of important works per tradition, or should Dewey propose one?
