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

---

## Strategy (Chad 10-10) — a new content category: TALKS

> Capture talks of prominent Bahá'ís — scholars, Hands of the Cause, members of the Universal House of Justice; "all the
> Hooper Dunbar talks and any Hands of the Cause"; plus "hundreds of excellent introductory or historical talks about
> other religions". Clean transcripts (maybe generate our own with better context), SourceHunt links to OceanLibrary for
> quoted/paraphrased material, paragraphs split by context, each paragraph linked to its YouTube moment, video/audio
> backed up on Tower-NAS. Storage rule: Dropbox gets the Markdown only; media lives on tower.

### Pipeline (one talk)
1. **Discover** — curated channel/playlist/speaker lists (Dewey's job later). YouTube Data API v3 (official, free quota)
   to list a channel's/playlist's videos with titles, dates, descriptions; yt-dlp for the media itself.
2. **Archive** — yt-dlp: best video + audio + the uploader's captions + metadata JSON → `/tank/media/talks/<youtube-id>/`.
   The backup is never re-hosted publicly; readers go to YouTube.
3. **Transcribe with context** — local Whisper large-v3 (faster-whisper / WhisperX: word-level timestamps, speaker
   diarization) seeded with a **glossary prompt**: the speaker, the setting, and our name/term dictionary (transliterated
   Persian and Arabic names, Bahá'í terms — we already hold these in the entity graph and the concept lexicon). Runs on
   tower CPU overnight (80 cores) or on Boss's GPU (≈10-20× faster — but Boss went offline once under a heavy service;
   run it as a bounded batch job, never an always-on server).
4. **Clean** — an LLM pass over the transcript with the same glossary: fix names and terms, punctuation, false starts,
   *never* rewording the speaker. Keep word timestamps so every cleaned sentence still maps to a moment.
5. **Paragraph by context** — split on topic shifts (System-1 / Clef segmentation, the semantic-only rule), each
   paragraph carrying `start`/`end` seconds.
6. **Link quotes** — SourceHunt over each paragraph: verbatim and paraphrased quotations of the Writings get
   OceanLibrary range links; the window classifier credits quoted words to their Author, never to the speaker.
7. **Ingest** — collection "Talks" (Bahá'í) or "Talks — <tradition>", `doc_role` talk (secondary, ranked below published
   works), author = speaker, metadata: date, venue/series, channel, YouTube id, duration, transcript version. Markdown
   only into the library; media stays on tower.
8. **Display** — each paragraph shows a ▶ link to `youtube.com/watch?v=<id>&t=<start>s`; a talk page embeds the video
   link and the speaker card. Anís cites "Talk — <speaker>, <year> (at 12:34)".

### Tools to choose
| Need | Recommendation | Notes |
|---|---|---|
| Discovery | **YouTube Data API v3** | free (10k units/day); channel/playlist listing + metadata |
| Download + backup | **yt-dlp** | free; already used by the transcriber; captions + metadata too |
| Transcription | **WhisperX** (Whisper large-v3 + alignment + diarization) on Boss GPU, faster-whisper on tower CPU | free, local; glossary via initial prompt / hotwords |
| Paid fallback (only if local quality falls short) | Deepgram / AssemblyAI (custom vocabulary, diarization) | per-minute pricing; decide on a pilot comparison |
| Cleanup | DeepSeek / Haiku 5.5 with the glossary | cheap; never rewrite meaning |

### Pilot
Hooper Dunbar: ~20 talks end to end. Measure: name/term accuracy before and after the glossary and the cleanup pass,
SourceHunt link precision, paragraph quality, cost and hours per talk. Then the Hands of the Cause, then other-religion
introductory/historical lectures (university lecture series etc.), all from reviewed lists.

### Decisions for Chad
1. Rights: link-only display with our transcript + private backup — or ask channel owners / estates (Hooper Dunbar's
   talks: who holds them?).
2. Transcription route: local (Boss GPU / tower CPU) first, paid service only if the pilot shows a gap?
3. Who curates the lists — Chad, Dewey proposing for approval, or both?
4. Living speakers: an opt-out / correction route?
