# Functionality plan (2026-10-10)

One plan for what we build next and in what order. It replaces hunting through PRD.md, the Anís PRD, nine backlog notes,
the competitor tracker and the concept handoffs. Those stay as detail; this is the index and the order.

**The horizon (Chad, 10-10):** about one more month of indexing work (phrase index, concept extraction, search
strategies), then the next phase is **building up the library**, run by a librarian agent. A room of boxed documents has
waited almost a year for that.

---

## 1. Phases at a glance

| Phase | When | Goal | Done when |
|---|---|---|---|
| **A. Finish the index** | now → ~mid-Nov | Qdrant replaces Meili; concepts and HyPE written once, to Qdrant; nightly strategy audit running | Battery: Qdrant-only ≥ Meili on every arm, valid run; Meili stopped; Íqán + SAQ concept catalogue live in search |
| **B. Librarian + library growth** | design now, build from ~mid-Nov | A librarian agent that plans every ingest, works the boxes, and hunts the web for hard-to-find texts | Boxes flowing through intake weekly; nightly acquisition research producing a reviewed queue |
| **C. Reader features** | in parallel where independent of A | Talks, compilation builder, reading/study loop, figure and story pages, Anís P2 | See §4 |

Rule carried over from 10-04: no new enrichment written into a search index until Meili is retired (it would be indexed
twice). Work that writes only to SQLite, or nothing, is not blocked by that rule. Section 2 lists it.

---

## 2. Phase A — finish the index (the critical path)

| # | Step | Status 10-10 | Depends on |
|---|---|---|---|
| A1 | `phrases` index complete (8.5M-point segment re-indexing since 10-09 22:15) | running; battery queued on tower (`/tank/sifter/battery-1010/`) | — |
| A2 | Same-conditions battery, Meili vs Qdrant-only | queued, starts itself | A1 |
| A3 | Close Qdrant gaps the battery shows (cross-tradition balance, source preference, tail latency) | partly done 10-09 (copy check now better on Qdrant: 32/40 vs 25/40) | A2 |
| A4 | **Live Qdrant writer** in the sync worker (new/changed paragraphs → `paragraphs_kw`, `phrases`, `hype`) | not started; hourly keyword cron + manual phrase catch-up stand in | — |
| A5 | Move the remaining Meili callers (planning/meili-retirement-map.md, ranked list) | 21 files left (from ~50) | A4 |
| A6 | Stop Meili | — | A2, A5 |
| A7 | Concept extraction, kernel works (Íqán, SAQ, Aqdas, Hidden Words, Gleanings, Epistle) + concept collection in Qdrant | Íqán 3,523 claims, SAQ 6,252; catalogue not built | A6 (index writes) |
| A8 | Canonical questions + new HyPE on the kernel | designed (`planning/concept-system1.md`) | A7 |
| A9 | Nightly strategy audit (every interaction → misroutes, new strategies, data gaps; proposals only) | early (`api/lib/audit/auditor.js`) | — |

**Can start now without touching an index** (needs Chad's go — the 10-04 rule says "concept extraction", not "indexing"):
building the Íqán idea catalogue from the 3,523 existing claims (no model spend), gold calibration on SQLite embeddings,
disambiguating Gleanings / Hidden Words / Epistle (the long pole), lexicon seeding from existing claims.

---

## 3. Phase B — the Librarian (new, Chad 10-10)

> "I need a good librarian agent with a page for chat and an email address for chat. I want the librarian to manage the
> ingest strategy for each new document and also to constantly be searching the internet for important documents to add.
> The range is limited but often hard to find … We just need to establish a control panel, a schedule of tasks and a set
> of tools to have a librarian agent making sure we have the best interfaith collection in the world."

### 3.1 What the Librarian does

1. **Plans every ingest.** For each incoming item (a scanned box document, a found PDF, a web text) it decides: is it
   already held (text-level, not title-level), which edition/translation it is, what conversion it needs (born-digital,
   OCR, handwritten → special OCR or transcription), how to segment, what metadata, what rights, and which collection.
   It writes that as an **ingest plan** a human can approve, then runs it.
2. **Works the boxes.** Physical documents: scan → drop folder → Librarian triages each scan (type, language, quality,
   OCR route, metadata from the scan itself) → ingest plan → ingest → verification sample.
3. **Hunts the web.** Scheduled research for important works we lack, per tradition, using parallel.ai and Perplexity,
   plus direct catalogue sources (OpenITI / al-Maktaba al-Shāmila for Islamic texts, archive.org, HathiTrust, Google
   Books, OpenLibrary, bahai.org, OOL). It ranks finds by importance × text quality × rights, and queues them.
4. **Keeps the collection honest.** Gap reports (canonical works missing per tradition), duplicate and junk detection
   (the page-role classifier, phrase-level duplicate check), editions that should replace weaker copies.
5. **Talks.** A chat page and an email address: "do we have X?", "find a good text of Y", "what's in the queue?",
   "here's a PDF, ingest it". Same agent, same tools, same memory as the control panel.

### 3.2 Surfaces

| Surface | What it is | Reuse |
|---|---|---|
| Chat page `/admin/librarian` | conversation with the Librarian, tool calls visible, attachments | Anís chat layer, System-1 |
| Email (e.g. `librarian@oceanlibrary.com`) | same agent by mail; attachments become intake items | Anís mail stack (SES us-west-2 → Worker `/_mail/*` → D1) |
| Control panel `/admin/librarian/control` | queues by state, schedule + last runs, budgets/spend, findings to approve, ingest plans, verification results | existing `librarian.js` queue/suggestions, `/admin/missing-books`, `/library/acquisitions` |

### 3.3 Work item lifecycle (one table, one state machine)

`found → evaluated → approved → acquired → converted → ingested → verified` (plus `held-already`, `rejected`,
`needs-human`). Every transition is logged with the reason and who/what made it. Chad (or a delegate) approves at
`approved`; everything else the Librarian does itself within budget.

### 3.4 Tools (each a plain function with a contract; the agent and scripts call the same thing)

| Tool | Does | Exists? |
|---|---|---|
| `library.holds(text or title)` | text-level check: title FTS (docs-repo `findDocuments`) + phrase-index sample of the text | parts exist (FTS, phrase layer, SourceHunt) |
| `web.research(query, tradition)` | parallel.ai / Perplexity deep search, returns candidates with URLs | both keys on tower (parallel.ai migrated 10-10) |
| `catalogue.lookup(work)` | OpenLibrary, Google Books, archive.org, HathiTrust, OpenITI | OpenLibrary/Google Books in the legacy agent |
| `fetch(url)` + `convert(file)` | download, PDF/EPUB/HTML → markdown, OCR route choice | converters exist (OpenITI, PDF pipeline) |
| `ocr(scan, route)` | printed OCR vs handwritten route; quality score per page | to choose (decision) |
| `plan.ingest(item)` | writes the ingest plan (edition, segmentation, metadata, collection, rights) | new |
| `ingest(plan)` | through the existing ingester + writer, never a raw script | exists (ingest routes) |
| `verify(doc)` | sample paragraphs, page-role check, duplicate check, search smoke test | page-role classifier exists |
| `report.gaps(tradition)` | canonical-works list vs holdings | missing-books triage exists |

### 3.5 Schedule

| Cadence | Task |
|---|---|
| continuous | intake: new files in the drop folder / email attachments → triage → ingest plan |
| nightly | web research for one tradition (rotating), budget-capped; re-check "needs-human" items |
| weekly | gap report + acquisition shortlist to Chad; verification sweep of the week's ingests |
| monthly | collection review (editions to replace, junk to retire), competitor content check (manual per robots.txt) |

### 3.6 Milestones

- **L0 (small, can start now):** ~~put `PARALLELAI_API_KEY` on tower~~ (done 10-10); replace the legacy agent's Meili duplicate check
  with docs-repo + phrase sample; one work-item table + state machine; control panel listing it.
- **L1:** `web.research` + nightly job for one tradition (Islamic historical texts first — Chad's hardest example) with
  a budget cap; findings land as `found`.
- **L2:** ingest plans + `ingest` + `verify` for born-digital items; chat page.
- **L3:** the boxes: scan intake folder, OCR routes (printed vs handwritten), per-page quality score.
- **L4:** email address; weekly reports by mail.

### 3.7 Decisions for Chad

1. Address: `librarian@oceanlibrary.com` or under siftersearch.com?
2. Approval gate: approve every acquisition, or only above a cost / below a confidence?
3. Monthly budgets: web research (parallel.ai, Perplexity), OCR, conversion models.
4. Handwritten OCR route: which engine/service to try first; human transcription for the important ones?
5. The boxes: who scans, what scanner/format, and where the drop folder lives (Dropbox folder synced to tower fits the
   existing pipeline).
6. Scope per tradition: a starting list of "important works" per tradition, or let the Librarian propose one for review?
7. Rights policy for found texts (public domain only? fair-use excerpts? permission requests the Librarian drafts?).

---

## 4. Phase C — reader features

Grouped by who uses them. "Index-independent" = can be built now without waiting on Phase A.

### 4.1 Anís (the product: widget on many sites + email)

| Feature | Status | Index-independent? | Priority |
|---|---|---|---|
| Answers with sources, 17 answer formats, junk handling, term study | built | — | — |
| Email Anís (threaded replies, stop/pause) | built (drafts reviewed by Chad unless invited) | — | — |
| **P2: one identity + one history in D1, memory, profile/export/delete** | not started (D1 holds only mail) | yes | **next for Anís** |
| Host site's pages ranked and linked first | planned | yes | high (sites only host Anís if it sends readers to them) |
| Share a conversation publicly (`/dialogue/`) | admin-only | yes | waits on decision D8 |
| Any language (explain in the user's language, quotes stay original) | not started | yes | after P2 |
| Anís app (PWA) | not started | yes | after P2 |
| Reading plan (daily portion, audio, discuss, streaks) | not started | yes | after P2 |
| Study guides for any book | admin instructor-notes exist | mostly | after reading plan |
| Voice | exploration | yes | later |
| Onboarding / re-engagement letters, "what's new" | partly built | yes | P4–P5 |

### 4.2 Search and library pages

| Feature | Status | Index-independent? | Priority |
|---|---|---|---|
| Recorded talks (YouTube, curated, timestamped, labelled secondary) | transcriber exists only | new content, yes | **high** (competitor gap #0; Chad: "a must") |
| Compilation builder (collect quotes → arrange → export) | not started | yes | **high** (competitor gap #1; pairs with SourceHunt + range links) |
| Figure life pages (timeline, relations, journeys) | top 500 built, unlinked pending review | yes | review + link; fix pinned dates / misattributed claims |
| Stories / episodes / concept pages as browsable units | not started | needs A7 | after A7 |
| Who was at an event / who met whom | built (SQLite); the Meili entity *search layer* is dead (stale ids) | yes | fix the search layer with the entity work |
| Original-language side by side, SourceHunt, range links, tablet About box | built | — | keep ahead |
| "Original word for X" for everyone (chat + search) | admin-only | yes | small |
| Tablet search by place / period / year | planned | yes (SQLite FTS) | medium |
| Quotes-only view, smart copy (quote + citation) | not started | yes | small |
| Sharing + bring-your-own-sources | not started | yes | later |

### 4.3 Researchers / API

Public API and entity API built (ahead of the competitor). Update the MCP and Grok connector blurbs (small).

---

## 5. Suggested order

1. **Now, in parallel with A1–A2 (no index impact):** Librarian L0; Anís P2 (D1 identity + history); talks pipeline
   design + first curated channel; compilation builder.
2. **After the battery (A2):** A3–A6 to retire Meili (A4 live writer is the big one).
3. **After Meili is retired:** A7–A8 concepts + new HyPE on the kernel; then stories/concept pages.
4. **~mid-Nov:** Librarian L1–L4; the boxes start flowing.

## 6. Decisions waiting on Chad (the ones that block)

1. Librarian decisions §3.7 (address, approval gate, budgets, OCR route, scanning, scope, rights).
2. May the index-independent concept steps (§2 list) start before Meili is retired?
3. Nightly phrase-embedding schedule (Gemini month at $322 of the $400 cap on 10-10).
4. Anís PRD D8 (public share path) and D4 (stronger model for email).
5. Which of C's "high" items to start first alongside Librarian L0: talks, compilation builder, or Anís P2.

Sources: PRD.md, planning/anis-hyper-engagement-prd.md, planning/anis-d1-migration-plan.md, planning/backlog-*.md,
planning/competitor-immerse-parity.md, planning/concept-system1.md, planning/meili-retirement-map.md,
planning/search-ab-20261009.md.
