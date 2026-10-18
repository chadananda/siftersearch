# Dewey intake — build plan (Chad 10-17)

> "Dewey can help me discover if a book or document or video is already in the library and then ingest it if not. I will
> provide a file or a url or something and Dewey will archive the original document, process and extract the text
> appropriately, organize the text in the library, research metadata and potential cover image, ingest into SQLite, and
> process all the indexes. Dewey needs a page, an API and access to search for a document by anything I give it. Dewey
> will need to work with my phone camera."

Design of the agent: `docs/agents/agent-dewey.md` (10-10). This plan is the build order for the intake path.

## The flow

```
anything Chad gives  ─▶ IDENTIFY ─▶ HOLDINGS CHECK ─▶ held? ─yes─▶ answer: link, edition, language
(photo · file · URL ·                                    │
 title · author · lines)                                 no / other edition
                                                         ▼
                        ARCHIVE original ─▶ EXTRACT text ─▶ CLEAN ─▶ METADATA + COVER ─▶ PLACE in library
                                                                                              ▼
                        ingest (SQLite, single writer) ─▶ automatic index chain ─▶ VERIFY ─▶ report back
```

## Inputs and what IDENTIFY does with each

| Input | Identify |
|---|---|
| phone photo (cover, title page, spine, a page of text) | vision model reads title, author, edition, publisher, language — and any printed lines |
| PDF / EPUB / DOCX / image scan | text layer or OCR sample → title page fields + sample lines |
| URL: web page, PDF link, bahai-library, archive.org, Google Drive | fetch → same as a file; site metadata when present |
| URL: video (YouTube, Vimeo, a file) | title, channel/speaker, date, description; transcript sample |
| typed title / author / lines of text | used as given |

## Holdings check (search by anything)

Every identified field is searched where it is strongest, in parallel, and the evidence is merged:

| Evidence | Search | Exists |
|---|---|---|
| title, author | document finder (docs FTS, transliteration-folded) + sub-documents (doc_sections) | ✓ |
| printed lines / transcript sample | BM25 (Qdrant `paragraphs_kw`) + phrase vectors — finds a work under another title | ✓ |
| a citation ("Gleanings CXXV") | citation resolver | ✓ (verified works) |
| ISBN, edition, translator | metadata match | partial |

Answer: **held** (link, edition, language) · **held in another edition / language / as part of a compilation** ·
**not held**. Never "not held" from a title miss alone: a text sample must also miss.

## Intake stages

1. **Archive** the original, untouched, on tower (`/tank/library-originals/<sha256>.<ext>`), with where it came from.
   Videos: the media file plus its page URL. Dedup by hash.
2. **Extract**
   - text-layer PDF / EPUB / DOCX → Markdown (converter exists, text-layer only)
   - scan → OCR (searchlayerpdf; key + docs still needed) → searchable PDF kept beside the original
   - video → transcript (speech-to-text with timestamps; speaker names where known); timestamps are the references
3. **Clean** (scans): running heads, page numbers, hyphenation, paragraphs re-joined across page breaks (code for the
   clear cases, Haiku for the unclear ones), footnotes moved out, OCR character errors; page breaks kept as `pb`.
4. **Metadata + cover**: title page / catalogue lookups (OpenLibrary, Google Books, archive.org, WorldCat-like
   sources) with a source per field; cover from the scan, a catalogue, or the image service.
5. **Place**: tradition, collection, title and author forms; written into the library folder (Dewey's file CRUD).
6. **Ingest** through the ingester + single writer.
7. **Index chain** (automatic, built 10-17): structure → BM25 → references → vectors → phrases → (paid layers under
   the daily cap).
8. **Verify**: sample paragraphs, page-role check, a search smoke test (its own lines find it), then report back.

## Surfaces

- **Page** — the existing SifterSearch librarian page **`/dewey`** ("Dewey — Librarian" in the user menu; admins + members
  with `users.dewey_access`, managed on /admin/users). Mobile-first; one box that takes typed text, a pasted URL, a dropped file, or the **camera**
  (`<input type="file" accept="image/*" capture="environment">` — works in any phone browser, no app). Several photos
  per item (cover + title page + a page of text). Result card: held / other edition / not held, with **Ingest** as the
  next button when not held. A queue of items in progress.
- **API** (session, requireDewey): `POST /api/dewey/holdings` { text?, url?, images?: dataURL[], file?: {name, data} } →
  identified fields + verdict + evidence (BUILT 10-17); `POST /api/dewey/intake` → work item; `GET /api/dewey/items/:id`
  → stage, log, result.
- **Email** (later, D1 of the agent doc): dewey@oceanlibrary.com, same pipeline.

## Work items

One table: `dewey_items` (id, kind, source, original_path, sha256, identified JSON, verdict, doc_id, stage, log, cost,
created_by, timestamps). Stages: `identified → checked → archived → extracted → cleaned → described → placed →
ingested → indexed → verified`, plus `held-already`, `needs-human`, `failed`. Every transition logged with its reason.

## Build order

| Step | Delivers | Cost per use |
|---|---|---|
| **1. Holdings check** — API + `/dewey` page, typed input + URL + file + photo (vision) — BUILT 10-17 | "do we have this?" from a phone | ~$0.002 / photo |
| 2. Archive + text-layer intake (PDF/EPUB/DOCX/web) → ingest → index chain | non-scanned books end to end | ~$0.10 / book + AI layers |
| 3. Scans: OCR (searchlayerpdf) + clean | scanned books end to end | ~$0.50–1.50 / 300 pages |
| 4. Video: archive + transcript | talks and films searchable by timestamp | depends on the transcription model |
| 5. Metadata research + covers | complete records | ~cents / book |
| 6. Email intake | the same by mail | — |

## Decisions needed

- searchlayerpdf API key + documentation (step 3).
- Video transcription: which model (Gemini audio, Whisper on boss, or a hosted API) and whether talks may be stored.
- Where originals live: `/tank/library-originals/` proposed (tank has room; crutch/fast do not).
- Daily cap for paid automatic indexing (asked 10-17).
