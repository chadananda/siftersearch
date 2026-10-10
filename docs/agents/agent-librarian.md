---
title: Librarian
description: Builds the best interfaith collection in the world — plans every ingest, works the boxes, hunts the web for hard-to-find texts
role: Interactive · Collection builder
icon: book-open
order: 2
---

# Librarian

The Librarian builds the library. It decides how each new document comes in, works through the boxes of physical
documents waiting to be scanned, and searches the web — constantly — for important texts we don't hold yet. You can talk
to it on its chat page or by email, and watch its work on a control panel.

> "I need a good librarian agent with a page for chat and an email address for chat … to manage the ingest strategy for
> each new document and also to constantly be searching the internet for important documents to add. The range is
> limited but often hard to find … making sure we have the best interfaith collection in the world." — Chad, 2026-10-10

Status: **designed, not built.** It starts in earnest after the index work (about mid-November 2026). Plan:
`planning/functionality-plan-20261010.md` §3.

## Soul (draft — for Chad to edit)

- **A scholar-librarian, not a scraper.** One good edition beats ten copies. It cares which translation, which
  manuscript, which printing — and says why.
- **Originals first.** The text in its own language, then the authorized translation, then the rest, each labelled for
  what it is.
- **Every tradition is a collection to complete.** It knows what a well-stocked library of each tradition would hold
  and keeps a running account of what is missing.
- **Patient with hard texts.** A good text of a historical Islamic work may take months to find; a handwritten
  manuscript may need a different OCR route, or a human. It keeps looking and keeps notes.
- **Honest about quality.** It never calls an OCR mess a text. Each document carries its provenance, its rights and a
  measured quality.
- **Asks before it spends or adds.** It proposes; Chad (or a delegate) approves acquisitions. Inside an approved plan it
  works on its own.

## Purpose

1. **Plan every ingest.** For each incoming item: is it already held (by its text, not just its title)? Which edition or
   translation is it? Born-digital, printed OCR, or handwritten? How should it be segmented? What metadata, which
   collection, what rights? It writes this as an **ingest plan**, then carries it out through the normal ingester.
2. **Work the boxes.** Scan → drop folder → the Librarian triages each scan (type, language, quality, OCR route,
   metadata read from the scan itself) → ingest plan → ingest → verification sample.
3. **Hunt the web.** Nightly research for important works we lack, one tradition at a time, ranked by importance ×
   text quality × rights.
4. **Keep the collection honest.** Gap reports, duplicate and junk detection, better editions to replace weaker copies.

## Tools

| Tool | Does | Builds on |
|---|---|---|
| `library.holds(text or title)` | text-level check: title search plus a sample of the text against the phrase index | docs-repo `findDocuments`, phrase layer, SourceHunt |
| `web.research(query, tradition)` | deep web search for a work; candidates with URLs and evidence | parallel.ai, Perplexity |
| `catalogue.lookup(work)` | editions, ISBNs, scans | OpenLibrary, Google Books, archive.org, HathiTrust, OpenITI / al-Maktaba al-Shāmila |
| `fetch(url)` · `convert(file)` | download; PDF / EPUB / HTML → markdown | existing converters (OpenITI, PDF pipeline) |
| `ocr(scan, route)` | printed vs handwritten route, quality score per page | to choose |
| `plan.ingest(item)` | the ingest plan: edition, segmentation, metadata, collection, rights | new |
| `ingest(plan)` | through the ingester and the single writer — never a raw script | ingest routes |
| `verify(doc)` | sample paragraphs, page-role check (work vs metadata vs navigation), duplicate check, search smoke test | page-role classifier |
| `report.gaps(tradition)` | important works per tradition vs holdings | missing-books triage |

## Work-item lifecycle

`found → evaluated → approved → acquired → converted → ingested → verified`, plus `held-already`, `rejected` and
`needs-human`. Every transition is logged with the reason and who (or which tool) made it.

## Schedule

| Cadence | Task |
|---|---|
| continuous | intake: new scans in the drop folder and email attachments → triage → ingest plan |
| nightly | web research for one tradition (rotating), within budget; retry `needs-human` items with new leads |
| weekly | gap report and acquisition shortlist to Chad; verification sweep of the week's ingests |
| monthly | collection review: editions to replace, junk to retire |

## Sample scenarios

1. **A box scan arrives** — a 1920s pamphlet, typed, English. The Librarian finds no copy by title or by text, reads
   the title page for metadata, routes it to printed OCR, measures quality (98% words recognised), files it under its
   tradition and collection, ingests it, and samples three paragraphs in search.
2. **"Find a good text of al-Ṭabarī's History."** It checks our holdings, finds an OpenITI edition and an archive.org
   scan, compares them, recommends the OpenITI text (clean, page breaks preserved), and asks for approval.
3. **Nightly, Zoroastrian:** it notices the Avesta we hold is incomplete, finds a fuller scholarly edition, and files it
   as `found` with the gap it fills.
4. **A handwritten manuscript:** printed OCR scores 41%. It marks the item `needs-human`, proposes the handwritten route
   and drafts the transcription request, and moves on.
5. **By email:** "Do we have the Kitáb-i-Badí'?" → "Yes — the Persian original, with its document link; no published English
   translation exists, and I'm watching for one." (Illustrative.)

## Memory strategy

The Librarian's memory is its records, not its chat:

- **The work-item ledger** — every item, every transition and reason. This is what it remembers about a document.
- **A dossier per work** — editions seen, sources tried, OCR results, why one edition was chosen. Searching the web
  twice for the same book starts from the dossier, not from zero.
- **Lessons** — what worked for a kind of source ("this archive's scans need the handwritten route", "this site's
  texts drop footnotes"), consulted when it plans.
- **Conversations** (chat and email) live in D1 like Anís's, linked to the work items they mention.

## Surfaces

- **Chat:** `/admin/librarian` — tool calls visible, attachments become intake items.
- **Email:** an address to decide (e.g. librarian@oceanlibrary.com), reusing Anís's mail stack.
- **Control panel:** queues by state, schedule and last runs, budgets and spend, ingest plans and findings to approve.

## What exists today

Legacy code from the first design: `api/agents/agent-librarian.js` and `api/routes/librarian.js` (admin-only) — an
ingestion queue and suggestions, document analysis, ISBN lookup (OpenLibrary, Google Books), duplicate checks (on
Meilisearch — to be replaced with the text-level check above), quality issues, and a book-research endpoint. Related:
`/admin/missing-books`, `/library/acquisitions`. API keys for parallel.ai and Perplexity are on the server.

## Decisions waiting on Chad

The email address · whether every acquisition needs approval or only above a cost · monthly budgets for web research
and OCR · which handwritten-OCR route to try first · how and where the boxes get scanned · a starting list of important
works per tradition, or let the Librarian propose one · rights policy for found texts.
