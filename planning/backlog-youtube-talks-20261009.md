# Backlog — recorded talks (YouTube) in the library

**Requested:** Chad, 2026-10-09: "I legitimately want to be careful about secondary materials, but we need to provide
youtube talks for sure." **Status:** not started. Competitor (Immerse) shows ~600 recorded talks.

## Shape
- **Curated, not crawled.** A reviewed list of channels and talks (speaker, venue, date, URL). Nothing enters by keyword
  search. "Careful about secondary materials" means an explicit allow-list and a visible label.
- **Transcribe** with the existing transcriber (`api/agents/agent-transcriber.js`: yt-dlp + Whisper). Use local Whisper
  where possible, and do not fall back to a paid API silently (see feedback_ingest_ai_fallback_bills). Prefer the
  uploader's own captions when present.
- **Segment semantically**, never by length (feedback_segmentation_semantic_only): use the speaker's topic shifts and
  pauses, and keep timestamps per paragraph.
- **Ingest as their own class**: religion `bah`, collection "Talks", `doc_role` secondary, authority low (below
  published scholarship). The speaker is the author; quotes inside a talk go through the window classifier like any
  secondary book, so a quoted Tablet is credited to its Author and the speaker is never credited with it.
- **Links**: each passage links to the video at its timestamp (`youtube.com/watch?v=…&t=123s`). The video itself is
  never re-hosted.
- **Search/Anís**: shown as "Talk — <speaker>, <year>" and ranked below the Writings and published works. An answer
  may cite a talk, but it never stands as the authority for a teaching.

## Open questions
1. Seed list: which channels and speakers are in (e.g. Wilmette Institute, Bahá'í Studies conferences, Green Acre)?
   Who approves additions?
2. Permissions: is a transcript plus a link enough, or do we ask channel owners?
3. Living speakers: offer an opt-out or a correction route?

## Done when
A curated set of talks is searchable by passage, each result opens the video at the right moment, every talk is
labelled as a talk with its speaker and date, and quoted scripture inside talks is attributed to its Author.
