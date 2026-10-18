---
title: Dewey API
description: How your own agents talk to Dewey — check holdings, keep the wanted list, attach sources, chat
---

# Dewey API

Base: `https://siftersearch.com/api/dewey` (or `https://api.siftersearch.com/api/dewey`).

**OpenAPI 3:** `https://api.siftersearch.com/api/v1/docs/json` (tag **Dewey**; browsable at `/api/v1/docs`). Point your
agent's tool loader at it: every call has request and response schemas.

## Authentication

Every call needs **one** of:

- a signed-in session of a member with Dewey access (the `/dewey` page), or
- a **Dewey API key**: `X-Api-Key: sk_…` (or `Authorization: Bearer sk_…`).

A key is accepted only when it is live, within its hourly rate limit, carries the **`dewey` permission**, and belongs to a
member who has Dewey access (admins, or members granted it on /admin/users). Shared server keys are refused. Every item
an agent creates records which key created it.

**Getting a key** — from a signed-in session only (never with another key):

```
POST /api/dewey/keys        { "name": "my research agent" }
→ { "key": "sk_…", "id": 12, "rateLimitPerHour": 600, "note": "Shown once — store it now." }
```

The key is shown **once** and stored only as a hash. Revoke it on /settings → API keys.

## Endpoints

### Do we have it? — `POST /holdings`

Give any one of: `text` (title, author, or a sentence of the text), `url` (a book page, PDF or video), `images` (data
URLs of photos: cover, title page, a page of text), `file` (`{ name, data }`, base64).

```json
{ "text": "The Chosen Highway" }
```
```json
{ "identified": { "title": "The Chosen Highway", "author": "Lady Blomfield", "from": "text" },
  "verdict": "held | partly-held | possible | not-found-by-title | not-held",
  "compared": { "words": 2252, "probes": 30, "documents": 4 },
  "candidates": [ { "id": 1234, "title": "…", "author": "…", "language": "en", "evidence": [ { "kind": "title", "detail": "…" } ] } ] }
```

Files Dewey reads (converted to Markdown, headings kept): PDF (text layer; a scan is reported `needs_ocr`), DOCX, DOC, RTF,
ODT, WPD, HTML, Safari `.webarchive`, EPUB, TXT/MD. Audio and video are refused with a reason (no transcription yet).
**When text is given** (a file, a pasted passage, a photographed page) the library is compared with it IN FULL — word
4-grams, both directions, and whether the shared text runs in order. Each candidate carries a `relation`:
`same` (another copy, edition or transcription) · `inside` (part of a larger library work, e.g. a compilation) ·
`partial` (the library holds only part of it — worth adding the fuller text) · `overlap` / `quotes` (shared passages only)
· `unrelated`, with `ours_in_theirs`, `theirs_in_ours`, `in_order`, `length_ratio`. Verdict: `held` (same or inside),
`partly-held`, `possible` (shared passages), `not-held`. Method: planning/dewey-holdings-comparison.md.

With a title only: `not-held` means its title **and** its text missed. A title miss alone is `not-found-by-title`: send a sentence of its
text to settle it.

### The wanted list

| Call | Does |
|---|---|
| `POST /items` `{ "identified": { "title", "author?", "kind?" } }` | puts a work on the wanted list; research (ISBN, publisher, year, cover, sources) starts automatically. An open item with the same title is returned instead of a duplicate. |
| `GET /items` | the wanted list and intake queue, open items first |
| `POST /items/:id/source` `{ "url": "…pdf" }` or `{ "file": { "name", "data" } }` | archives the original untouched and starts processing: text → library file → ingest → every index |

Item states: `wanted` → `researched` → `source` → `processing` → `ingested` (with `doc_id`), or `needs-ocr` (a scan;
waits for OCR), `needs-human`, `failed` — each with its reason in `log`.

### Chat — `POST /chat`

```json
{ "messages": [ { "role": "user", "content": "Do we have Gulpáygání's Fará'id?" } ],
  "attach": { "images": ["data:image/jpeg;base64,…"] },
  "stream": false }
```

- `stream: false` → one JSON answer: `{ "reply": "…", "holdings": [ … ], "items": [ … ] }`.
- Default (streamed): server-sent events, one JSON object per `data:` line — `holdings` (a check's result), `item` (a
  wanted item created or changed), `delta` (reply text), `done`, or `error`.

Anything attached is checked **before** Dewey replies. Dewey assumes the conversation is about adding works; he checks,
adds to the wanted list when asked, and attaches sources you link.

### Also

| Call | Returns |
|---|---|
| `GET /activity?limit=30` | Dewey's intake: works loading now or just loaded, with each document's indexing stages |
| `GET /missing` | the catalogue's missing-books list (works it lists but does not hold) |

## Limits

Keys: 600 requests per hour. Bodies: 30 MB (`/holdings`, `/chat`), 120 MB (`/items/:id/source`). Photos are best sent
at about 1600 px.
